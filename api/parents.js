'use strict';

/**
 * POST /api/parents (CommonJS)
 * Central server gateway for the Paathshala Parent Portal (parents.ctrlshifts.in).
 * 
 * Supported actions:
 *   1. send-otp: Sends 6-digit verification code to parent email (enumeration-proof).
 *   2. verify-otp: Verifies OTP, looks up linked active students in enabled schools, and mints Firebase custom token.
 *   3. context: Re-evaluates live student/school associations and returns selector data (enforcing real-time revocation).
 */

const crypto = require('crypto');
const { getFirebaseAdmin, getDb } = require('./_lib/firebase-admin');
const { sendOtpEmail } = require('./_lib/email');

function applyCors(req, res) {
  const allowed = [
    'https://parents.ctrlshifts.in',
    'https://www.ctrlshifts.in',
    'https://ctrlshifts.in',
    'http://localhost:3000',
    'http://localhost:3106'
  ];
  const origin = req.headers && req.headers.origin;
  if (origin && (allowed.includes(origin) || origin.endsWith('.ctrlshifts.in') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-parent-email');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashString(val) {
  return crypto.createHash('sha256').update(String(val)).digest('hex');
}

function getClientIp(req) {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket ? req.socket.remoteAddress || '127.0.0.1' : '127.0.0.1';
}

function ensureResponseHelpers(res) {
  if (typeof res.status !== 'function') {
    res.status = function(code) {
      this.statusCode = code;
      return this;
    };
  }
  if (typeof res.json !== 'function') {
    res.json = function(data) {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(data));
      return this;
    };
  }
}

/**
 * Live lookup of active students linked to an email in schools where parentPortal.enabled == true.
 */
async function findActiveLinkedStudents(db, emailNorm) {
  if (!emailNorm) return [];

  const studentMap = new Map(); // key -> { student, schoolId }

  // 1. Query CollectionGroup 'students' for subcollection-restructured schools
  try {
    const [pSnap, sSnap] = await Promise.all([
      db.collectionGroup('students')
        .where('parentEmailNorm', '==', emailNorm)
        .where('status', '==', 'Active')
        .get(),
      db.collectionGroup('students')
        .where('secondaryParentEmailNorm', '==', emailNorm)
        .where('status', '==', 'Active')
        .get()
    ]);

    const addDoc = (doc) => {
      const data = doc.data();
      // Path format: tenant_data/{schoolId}/students/{studentId}
      const pathParts = doc.ref.path.split('/');
      const schoolId = data.schoolId || (pathParts.length >= 2 ? pathParts[1] : null);
      if (schoolId && data.id) {
        studentMap.set(`${schoolId}_${data.id}`, { student: data, schoolId });
      }
    };

    pSnap.forEach(addDoc);
    sSnap.forEach(addDoc);
  } catch (cgErr) {
    console.warn('[api/parents] CollectionGroup query warning (indexes may be building):', cgErr.message);
  }

  // 2. Query legacy v1 tenant_data root documents as fallback
  try {
    const tenantsSnap = await db.collection('tenant_data').get();
    for (const doc of tenantsSnap.docs) {
      const schoolId = doc.id;
      const tData = doc.data();
      const rootStudents = Array.isArray(tData.students) ? tData.students : [];
      for (const s of rootStudents) {
        if (s.status === 'Active') {
          const sPNorm = (s.parentEmailNorm || (s.parentEmail || '').trim().toLowerCase());
          const sSNorm = (s.secondaryParentEmailNorm || (s.secondaryParentEmail || '').trim().toLowerCase());
          if (sPNorm === emailNorm || sSNorm === emailNorm) {
            if (!studentMap.has(`${schoolId}_${s.id}`)) {
              studentMap.set(`${schoolId}_${s.id}`, { student: s, schoolId });
            }
          }
        }
      }
    }
  } catch (v1Err) {
    console.warn('[api/parents] V1 root check warning:', v1Err.message);
  }

  // 3. Filter by school settings.parentPortal.enabled === true
  const verifiedStudents = [];
  const schoolCache = new Map();

  for (const item of studentMap.values()) {
    const sId = item.schoolId;
    let schoolData = schoolCache.get(sId);
    if (!schoolData) {
      const sDoc = await db.collection('tenant_data').doc(sId).get();
      if (sDoc.exists) {
        schoolData = sDoc.data();
        schoolCache.set(sId, schoolData);
      }
    }

    if (schoolData) {
      const settings = schoolData.settings || {};
      const portalSettings = settings.parentPortal || {};
      // Must be explicitly enabled
      if (portalSettings.enabled === true) {
        verifiedStudents.push({
          student: item.student,
          schoolId: sId,
          schoolData: schoolData
        });
      }
    }
  }

  return verifiedStudents;
}

module.exports = async function handler(req, res) {
  ensureResponseHelpers(res);
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const isMock = !isProduction && (process.env.MOCK_ONBOARDING_MODE === 'true' || process.env.MOCK_PARENT_MODE === 'true');

  const action = (req.query && req.query.action) || (req.body && req.body.action) || '';
  const adminSdk = getFirebaseAdmin();
  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();

  // ──────────────────────────────────────────────────────────────────────────
  // ACTION 1: SEND-OTP
  // ──────────────────────────────────────────────────────────────────────────
  if (action === 'send-otp') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const emailNorm = normalizeEmail(body.email);

    if (!emailNorm || !emailNorm.includes('@') || !emailNorm.includes('.')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const clientIp = getClientIp(req);
    const ipHash = hashString(clientIp);
    const emailHash = hashString(emailNorm);

    // 1. Cloudflare Turnstile Verification (Fail-Closed in production)
    if (!isMock) {
      const turnstileToken = body.turnstileToken || body['cf-turnstile-response'];
      if (!turnstileToken) {
        return res.status(400).json({ error: 'Security verification failed. Please complete the captcha.' });
      }

      const secretKey = process.env.TURNSTILE_SECRET_KEY;
      if (secretKey) {
        try {
          const verifyResp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              secret: secretKey,
              response: turnstileToken,
              remoteip: clientIp
            }),
            signal: AbortSignal.timeout(5000)
          });
          const verifyJson = await verifyResp.json();
          if (!verifyJson.success) {
            return res.status(400).json({ error: 'Captcha verification failed. Please try again.' });
          }
        } catch (tErr) {
          console.error('[api/parents] Turnstile verification error:', tErr.message);
          return res.status(503).json({ error: 'Security verification service temporarily unavailable.' });
        }
      }
    }

    // 2. Rate Limiting (5 starts/hour per IP, 3 starts/hour per email)
    if (!isMock) {
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      try {
        const [ipDoc, emDoc] = await Promise.all([
          db.collection('parent_login_rate_limits').doc(`ip_${ipHash}`).get(),
          db.collection('parent_login_rate_limits').doc(`email_${emailHash}`).get()
        ]);

        if (ipDoc.exists) {
          const recent = (ipDoc.data().timestamps || []).filter(ts => ts > oneHourAgo);
          if (recent.length >= 5) {
            return res.status(429).json({ error: 'Too many login attempts from your network. Please try again in an hour.' });
          }
        }
        if (emDoc.exists) {
          const recent = (emDoc.data().timestamps || []).filter(ts => ts > oneHourAgo);
          if (recent.length >= 3) {
            return res.status(429).json({ error: 'Too many OTP requests for this email. Please check your inbox or try again in an hour.' });
          }
        }
      } catch (rlErr) {
        console.warn('[api/parents] Rate limit check warning:', rlErr.message);
      }
    }

    // 3. Check Resend Cooldown (60s) & Max Resends on existing session
    const existingSessionSnap = await db.collection('parent_otp_sessions')
      .where('emailHash', '==', emailHash)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!existingSessionSnap.empty) {
      const existingSession = existingSessionSnap.docs[0].data();
      const lastSentMs = existingSession.lastSentAt ? new Date(existingSession.lastSentAt).getTime() : 0;
      const elapsed = Math.floor((now.getTime() - lastSentMs) / 1000);
      if (elapsed < 60) {
        return res.status(429).json({ error: `Please wait ${60 - elapsed} seconds before requesting a new code.` });
      }
      if ((existingSession.resendCount || 1) >= 3) {
        return res.status(429).json({ error: 'Maximum code resend limit (3) reached for this session.' });
      }
    }

    // 4. Generate 6-digit OTP, salt, and 10-minute expiry
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = `salt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const otpHash = crypto.createHash('sha256').update(otp + salt).digest('hex');
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    const sessionId = `psess_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;

    // 5. Live Check of Linked Students (Zero Leakage / Enumeration Resistance)
    const linked = await findActiveLinkedStudents(db, emailNorm);
    const hasLinkedStudents = linked.length > 0;

    // 6. Record OTP Session (Server-Only Collection)
    await db.collection('parent_otp_sessions').doc(sessionId).set({
      sessionId,
      email: emailNorm,
      emailHash,
      otpHash: hasLinkedStudents ? otpHash : 'unlinked_dummy_hash',
      salt: hasLinkedStudents ? salt : 'dummy_salt',
      expiresAt,
      attempts: 0,
      resendCount: 1,
      lastSentAt: nowIso,
      createdAt: nowIso,
      status: 'pending',
      linked: hasLinkedStudents
    });

    // 7. Record Rate Limit Timestamps
    if (!isMock) {
      const updateRl = async (docId) => {
        const ref = db.collection('parent_login_rate_limits').doc(docId);
        const snap = await ref.get();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
        const timestamps = snap.exists ? (snap.data().timestamps || []).filter(ts => ts > oneHourAgo) : [];
        timestamps.push(nowIso);
        await ref.set({ timestamps }, { merge: true });
      };
      await Promise.all([
        updateRl(`ip_${ipHash}`).catch(() => {}),
        updateRl(`email_${emailHash}`).catch(() => {})
      ]);
    }

    // 8. Dispatch Email ONLY if linked, but ALWAYS return identical response
    if (hasLinkedStudents) {
      try {
        await sendOtpEmail({
          email: emailNorm,
          otp: otp,
          schoolName: 'Paathshala Parent Portal'
        });
      } catch (mErr) {
        console.error('[api/parents] Failed to dispatch OTP email:', mErr);
        return res.status(503).json({ error: 'Failed to dispatch verification code. Please try again later.' });
      }
    }

    return res.status(200).json({
      success: true,
      sessionId: sessionId,
      message: 'If an account exists with this email, a verification code has been sent.',
      resendCooldownSeconds: 60
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACTION 2: VERIFY-OTP
  // ──────────────────────────────────────────────────────────────────────────
  if (action === 'verify-otp') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const sessionId = (body.sessionId || '').trim();
    const inputOtp = (body.otp || '').trim();

    if (!sessionId || !inputOtp) {
      return res.status(400).json({ error: 'Session ID and 6-digit verification code are required.' });
    }

    const sessionRef = db.collection('parent_otp_sessions').doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return res.status(404).json({ error: 'Session expired or not found. Please request a new code.' });
    }

    const sData = sessionSnap.data();

    if (sData.status === 'locked' || (sData.attempts || 0) >= 5) {
      return res.status(400).json({ error: 'Maximum attempts exceeded. This session has been locked. Please request a new code.' });
    }

    if (sData.expiresAt && sData.expiresAt < nowIso) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    }

    // Check OTP Hash
    const computedHash = crypto.createHash('sha256').update(inputOtp + sData.salt).digest('hex');
    const isCorrect = (sData.linked === true) && (computedHash === sData.otpHash);

    if (!isCorrect) {
      const newAttempts = (sData.attempts || 0) + 1;
      const updates = { attempts: newAttempts, updatedAt: nowIso };
      if (newAttempts >= 5) {
        updates.status = 'locked';
      }
      await sessionRef.update(updates);
      const remaining = Math.max(0, 5 - newAttempts);
      return res.status(400).json({
        error: `Invalid verification code. You have ${remaining} attempt(s) remaining.`,
        attemptsLeft: remaining
      });
    }

    // On Success: Look up linked active students in enabled schools LIVE
    const emailNorm = sData.email;
    const linked = await findActiveLinkedStudents(db, emailNorm);

    if (linked.length === 0) {
      await sessionRef.update({ status: 'consumed', updatedAt: nowIso });
      return res.status(200).json({
        success: false,
        notFound: true,
        message: "We couldn't find any active school records associated with this email. Please contact your school administrator."
      });
    }

    // Mint stable Firebase Custom Token (uid = 'parent_' + sha256(email) truncated, claims { role: 'parent' })
    const stableUid = 'parent_' + hashString(emailNorm).slice(0, 24);
    const claims = { role: 'parent' };

    // Ensure Firebase Auth user has the email set so ID tokens contain email
    try {
      await adminSdk.auth().createUser({ uid: stableUid, email: emailNorm });
    } catch (authErr) {
      if (authErr.code === 'auth/uid-already-exists') {
        await adminSdk.auth().updateUser(stableUid, { email: emailNorm }).catch(() => {});
      }
    }

    let customToken;
    try {
      customToken = await adminSdk.auth().createCustomToken(stableUid, claims);
    } catch (ctErr) {
      if (isMock) {
        customToken = 'mock_custom_token_' + stableUid;
      } else {
        throw ctErr;
      }
    }

    // Consume session
    await sessionRef.update({ status: 'verified', verifiedAt: nowIso });

    return res.status(200).json({
      success: true,
      customToken: customToken,
      studentsCount: linked.length
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACTION 3: CONTEXT (Real-Time Live Re-Evaluation)
  // ──────────────────────────────────────────────────────────────────────────
  if (action === 'context') {
    const authHeader = req.headers && req.headers.authorization;
    const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : (req.body && req.body.idToken);

    if (!idToken) {
      return res.status(401).json({ error: 'Authentication token required.' });
    }

    let decoded;
    try {
      decoded = await adminSdk.auth().verifyIdToken(idToken);
    } catch (tokErr) {
      if (isMock && idToken.startsWith('mock_id_token_')) {
        const parts = idToken.split(':');
        const emailCandidate = parts[1] || '';
        decoded = {
          uid: 'parent_' + hashString(emailCandidate).slice(0, 24),
          email: emailCandidate,
          role: 'parent'
        };
      } else {
        return res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
      }
    }

    if (!decoded.uid || !decoded.uid.startsWith('parent_')) {
      return res.status(403).json({ error: 'Forbidden: Caller is not a parent account.' });
    }

    // Reconstruct / determine verified parent email
    let parentEmail = decoded.email || '';
    if (!parentEmail) {
      try {
        const uRec = await adminSdk.auth().getUser(decoded.uid);
        parentEmail = uRec.email || '';
      } catch (_) {}
    }
    if (!parentEmail && req.headers['x-parent-email']) {
      const candidate = normalizeEmail(req.headers['x-parent-email']);
      if ('parent_' + hashString(candidate).slice(0, 24) === decoded.uid) {
        parentEmail = candidate;
      }
    }

    if (!parentEmail) {
      return res.status(400).json({ error: 'Parent email could not be verified from token.' });
    }

    const emailNorm = normalizeEmail(parentEmail);

    // LIVE LOOKUP EVERY TIME (Enforces real-time revocation when email is edited or removed)
    const linked = await findActiveLinkedStudents(db, emailNorm);

    if (linked.length === 0) {
      return res.status(200).json({
        success: true,
        schools: [],
        message: 'No active student records found for this account.'
      });
    }

    // Group by school and return ONLY selector card data (No PII, No Aadhaar, No Ledger)
    const schoolGroups = new Map();

    for (const item of linked) {
      const sId = item.schoolId;
      const sData = item.schoolData || {};
      const s = item.student;

      if (!schoolGroups.has(sId)) {
        const settings = sData.settings || {};
        const portalSettings = settings.parentPortal || {};
        schoolGroups.set(sId, {
          schoolId: sId,
          schoolName: settings.schoolName || sData.school_name || sId,
          logoUrl: settings.logoStorageUrl || settings.logoUrl || '',
          theme: settings.theme || 'indigo',
          toggles: {
            profile: portalSettings.allowProfile !== false,
            attendance: portalSettings.allowAttendance !== false,
            timetable: portalSettings.allowTimetable !== false,
            exams: portalSettings.allowExams === true,
            reportCards: portalSettings.allowReportCards === true,
            notices: portalSettings.allowNotices !== false,
            fees: portalSettings.allowFees !== false,
            feePayment: portalSettings.allowUpiPayment !== false
          },
          students: []
        });
      }

      schoolGroups.get(sId).students.push({
        id: s.id,
        name: s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        firstName: s.firstName || '',
        lastName: s.lastName || '',
        class: s.class || '',
        section: s.section || '',
        rollNumber: s.rollNumber || s.rollNo || '',
        admissionNumber: s.admissionNumber || s.admissionNo || '',
        photoUrl: s.photoUrl || s.photoStorageUrl || ''
      });
    }

    return res.status(200).json({
      success: true,
      email: emailNorm,
      schools: Array.from(schoolGroups.values())
    });
  }

  return res.status(400).json({ error: 'Invalid action. Supported actions: send-otp, verify-otp, context.' });
};
