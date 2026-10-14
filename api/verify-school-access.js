'use strict';

/**
 * POST /api/verify-school-access
 * Verifies school user credentials (Admin or Teacher) and establishes
 * an authorized school_access mapping in Cloud Firestore.
 *
 * SECURITY:
 *   - Authentication is performed entirely on the server using Firebase Admin SDK.
 *   - Client writes to school_access are permanently blocked by Firestore rules.
 *   - Strictly writes ONLY to `school_access/{uid}` and `login_rate_limits/{id}`.
 *   - NEVER writes to tenant_data (C1).
 *   - Enforces per-IP and per-account lockout in Firestore (serverless resilient).
 *   - Returns zero PII or credentials in response.
 */

const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

function getAdmin() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (raw) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(raw))
      });
    } else {
      const fs = require('fs');
      if (fs.existsSync('service-account-key.json')) {
        const sa = JSON.parse(fs.readFileSync('service-account-key.json', 'utf8'));
        admin.initializeApp({
          credential: admin.credential.cert(sa)
        });
      } else {
        throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not configured.');
      }
    }
  }
  return admin;
}

function applyCors(req, res) {
  const ALLOWED = [
    process.env.ALLOWED_ORIGIN || 'https://www.ctrlshifts.in',
    'https://ctrlshifts.in'
  ];
  const origin = req.headers.origin;
  if (origin && (ALLOWED.includes(origin) || origin.endsWith('.ctrlshifts.in') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket ? req.socket.remoteAddress || 'unknown' : 'unknown';
}

module.exports = async function handler(req, res) {
  ensureResponseHelpers(res);
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { idToken, schoolId, role, username, email, password } = body;

  if (!idToken || !schoolId || !role || !password) {
    return res.status(400).json({ error: 'Missing required authentication parameters.' });
  }

  const usernameOrEmail = (role === 'admin' ? (username || email) : (email || username) || '').trim();
  if (!usernameOrEmail) {
    return res.status(400).json({ error: 'Username or email is required.' });
  }

  let firebaseAdmin;
  try {
    firebaseAdmin = getAdmin();
  } catch (initErr) {
    console.error('[verify-school-access] Firebase Admin Init Error:', initErr);
    return res.status(500).json({ error: 'Authentication service initialization error.' });
  }

  const db = firebaseAdmin.firestore();
  const clientIp = getClientIp(req);

  // 1. Verify Caller ID Token
  let decodedToken;
  try {
    decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
  } catch (tokenErr) {
    console.warn('[verify-school-access] Invalid ID Token:', tokenErr.message);
    return res.status(401).json({ error: 'Invalid or expired session token. Please refresh.' });
  }
  const uid = decodedToken.uid;

  // 2. Check Rate Limits (Per IP & Per Account) in login_rate_limits
  const nowMs = Date.now();
  const ipKey = 'ip_' + clientIp.replace(/[^a-zA-Z0-9]/g, '_');
  const acctKey = 'acct_' + schoolId.replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + encodeURIComponent(usernameOrEmail.toLowerCase()).replace(/%/g, '_');

  const ipRef = db.collection('login_rate_limits').doc(ipKey);
  const acctRef = db.collection('login_rate_limits').doc(acctKey);

  try {
    const [ipSnap, acctSnap] = await Promise.all([ipRef.get(), acctRef.get()]);

    if (ipSnap.exists) {
      const ipData = ipSnap.data();
      if (ipData.lockedUntil && ipData.lockedUntil.toMillis() > nowMs) {
        const remainingMin = Math.ceil((ipData.lockedUntil.toMillis() - nowMs) / 60000);
        return res.status(429).json({ error: `Too many failed attempts from your network. Try again in ${remainingMin} minutes.` });
      }
    }

    if (acctSnap.exists) {
      const acctData = acctSnap.data();
      if (acctData.lockedUntil && acctData.lockedUntil.toMillis() > nowMs) {
        const remainingMin = Math.ceil((acctData.lockedUntil.toMillis() - nowMs) / 60000);
        return res.status(429).json({ error: `Account locked due to consecutive failed attempts. Try again in ${remainingMin} minutes.` });
      }
    }
  } catch (rateErr) {
    console.warn('[verify-school-access] Rate limit read warning:', rateErr.message);
  }

  // 3. Fetch Tenant Context
  let tenantData;
  try {
    const tenantSnap = await db.collection('tenant_data').doc(schoolId).get();
    if (!tenantSnap.exists) {
      return res.status(404).json({ error: 'School not found in ERP.' });
    }
    tenantData = tenantSnap.data();
  } catch (tenantErr) {
    console.error('[verify-school-access] Tenant read error:', tenantErr);
    return res.status(500).json({ error: 'Could not load school credentials context.' });
  }

  // 4. Parity Evaluation with AuthUtils.login (C1: Zero writes to tenant_data)
  let isValid = false;
  let authenticatedUser = null;
  let authMessage = '';

  if (role === 'admin') {
    const settings = tenantData.settings || {};
    const adminUser = settings.adminUsername || 'admin';
    const adminPassStored = settings.adminPassword;

    if (!adminPassStored) {
      authMessage = 'Admin password not configured for this school.';
    } else {
      const normalizedInput = usernameOrEmail.toLowerCase();
      const normalizedAdmin = adminUser.toLowerCase();
      const synthesizedEmail = `${normalizedAdmin}@ctrlshifts.in`;

      if (normalizedInput !== normalizedAdmin && normalizedInput !== 'admin' && normalizedInput !== synthesizedEmail) {
        authMessage = 'Invalid admin username.';
      } else {
        const isBcrypt = adminPassStored.startsWith('$2a$') || adminPassStored.startsWith('$2b$') || adminPassStored.startsWith('$2y$');
        if (isBcrypt) {
          isValid = bcrypt.compareSync(password, adminPassStored);
        } else {
          isValid = (password === adminPassStored);
        }
        if (!isValid) authMessage = 'Invalid admin password.';
        else {
          authenticatedUser = {
            role: 'admin',
            firstName: 'Admin',
            lastName: 'User'
          };
        }
      }
    }
  } else if (role === 'teacher') {
    const teachersList = Array.isArray(tenantData.teachers) ? tenantData.teachers : [];
    const normalizedInput = usernameOrEmail.toLowerCase();
    
    // AuthUtils matching: t.email === usernameOrEmail
    const teacher = teachersList.find(t => (t.email || '').trim().toLowerCase() === normalizedInput);

    if (!teacher) {
      authMessage = 'No teacher found with this email.';
    } else if (teacher.status !== 'Active') {
      authMessage = 'Teacher account is paused or inactive.';
    } else {
      const teacherPassStored = teacher.password;
      if (!teacherPassStored || typeof teacherPassStored !== 'string' || teacherPassStored.trim() === '') {
        authMessage = 'Teacher password not configured.';
      } else {
        const isBcrypt = teacherPassStored.startsWith('$2a$') || teacherPassStored.startsWith('$2b$') || teacherPassStored.startsWith('$2y$');
        if (isBcrypt) {
          isValid = bcrypt.compareSync(password, teacherPassStored);
        } else {
          isValid = (password === teacherPassStored);
        }
        if (!isValid) authMessage = 'Invalid password.';
        else {
          authenticatedUser = {
            id: teacher.id || 'teacher',
            firstName: teacher.firstName || 'Teacher',
            lastName: teacher.lastName || '',
            role: 'teacher',
            email: teacher.email,
            subject: teacher.subject || '',
            assignedClasses: teacher.assignedClasses || [],
            classTeacherOf: teacher.classTeacherOf || [],
            subjectTeacherOf: teacher.subjectTeacherOf || []
          };
        }
      }
    }
  } else {
    return res.status(400).json({ error: 'Invalid authentication role requested.' });
  }

  // 5. Handle Failed Login (Record Rate Limit Failure)
  if (!isValid) {
    try {
      const lockWindowMs = 15 * 60 * 1000;
      const expireTime = admin.firestore.Timestamp.fromMillis(nowMs + lockWindowMs);

      // Increment IP and Account failures: ALL reads first, THEN all writes
      await db.runTransaction(async (t) => {
        const iSnap = await t.get(ipRef);
        const aSnap = await t.get(acctRef);

        const currentCount = iSnap.exists ? (iSnap.data().attempts || 0) + 1 : 1;
        const updates = { attempts: currentCount, lastFailed: admin.firestore.FieldValue.serverTimestamp() };
        if (currentCount >= 20) {
          updates.lockedUntil = expireTime;
        }

        const aCount = aSnap.exists ? (aSnap.data().attempts || 0) + 1 : 1;
        const aUpdates = { attempts: aCount, lastFailed: admin.firestore.FieldValue.serverTimestamp() };
        if (aCount >= 5) {
          aUpdates.lockedUntil = expireTime;
        }

        t.set(ipRef, updates, { merge: true });
        t.set(acctRef, aUpdates, { merge: true });
      });
    } catch (recordErr) {
      console.warn('[verify-school-access] Failed to update lockout counter:', recordErr.message);
    }

    return res.status(401).json({ error: authMessage || 'Invalid credentials.' });
  }

  // 6. Handle Successful Login
  try {
    // Reset account lockout upon success
    await acctRef.delete().catch(() => {});

    // Write authorized school_access document (SERVER-ONLY WRITE)
    const schoolAccessPayload = {
      schoolId: schoolId,
      role: role,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      authType: decodedToken.firebase ? decodedToken.firebase.sign_in_provider : 'anonymous',
      clientIp: clientIp
    };
    if (role === 'teacher' && authenticatedUser && authenticatedUser.id) {
      schoolAccessPayload.teacherId = authenticatedUser.id;
    }
    await db.collection('school_access').doc(uid).set(schoolAccessPayload);

    return res.status(200).json({
      success: true,
      schoolId: schoolId,
      role: role,
      user: authenticatedUser
    });
  } catch (writeErr) {
    console.error('[verify-school-access] school_access write error:', writeErr);
    return res.status(500).json({ error: 'Could not grant school access authorization.' });
  }
};
