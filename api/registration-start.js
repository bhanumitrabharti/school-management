/**
 * POST /api/registration-start
 * Initiates self-service school onboarding: validates inputs, reserves subdomain,
 * generates 6-digit OTP, stores hashed record, and dispatches verification email.
 */
import {
  suggestAdminUsername,
  validateAdminUsername,
  validateSubdomain,
  generateOtp,
  hashOtp,
  hashPassword,
  hashIp,
  maskEmail,
  normalizeSchoolName
} from './lib/validation.js';
import { sendOtpEmail } from './lib/email.js';
import { sendTelegramAlert } from './lib/telegram.js';
import { getFirebaseAdmin, getDb } from './lib/firebase-admin.js';

function applyCors(req, res) {
  const allowed = [
    'https://www.ctrlshifts.in',
    'https://ctrlshifts.in',
    'http://localhost:3000',
    'http://localhost:3106'
  ];
  const origin = req.headers.origin;
  if (origin && (allowed.includes(origin) || origin.endsWith('.ctrlshifts.in') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const isMock = process.env.MOCK_ONBOARDING_MODE === 'true';

  // C10: Validate required environment variables in production
  if (!isMock) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error('[registration-start] SMTP credentials missing in environment.');
      return res.status(503).json({
        error: 'Registration temporarily unavailable. Please contact connect@ctrlshifts.in.'
      });
    }
  }

  // Cloudflare Turnstile Verification (C10)
  const turnstileToken = body.turnstileToken || body['cf-turnstile-response'];
  if (!isMock && process.env.TURNSTILE_SECRET_KEY) {
    if (!turnstileToken) {
      return res.status(400).json({ error: 'Security verification failed. Please complete the captcha.' });
    }
    try {
      const verifyResp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: turnstileToken,
          remoteip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
        })
      });
      const verifyJson = await verifyResp.json();
      if (!verifyJson.success) {
        return res.status(400).json({ error: 'Captcha verification failed. Please refresh and try again.' });
      }
    } catch (tErr) {
      console.warn('[registration-start] Turnstile verify error:', tErr.message);
    }
  }

  // Extract client IP
  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const clientIp = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : '127.0.0.1';
  const hashedClientIp = hashIp(clientIp);

  // Input Sanitization
  const schoolName = (body.schoolName || '').trim();
  const city = (body.city || '').trim();
  const state = (body.state || '').trim();
  const adminEmail = (body.adminEmail || '').trim().toLowerCase();
  const adminPhone = (body.adminPhone || '').replace(/\D/g, '').trim();
  const rawUsername = (body.adminUsername || '').trim();
  const adminPassword = body.adminPassword || '';
  const subdomain = (body.subdomain || '').trim().toLowerCase();
  const referralCode = (body.referralCode || '').trim().toUpperCase();
  const termsAccepted = body.termsAccepted === true || body.termsAccepted === 'true';
  const marketingConsent = body.marketingConsent === true || body.marketingConsent === 'true';

  // 1. Basic Validation
  if (!schoolName || schoolName.length < 2 || schoolName.length > 100) {
    return res.status(400).json({ error: 'School name must be between 2 and 100 characters.' });
  }
  if (!city || city.length < 2) {
    return res.status(400).json({ error: 'City is required.' });
  }
  if (!state || state.length < 2) {
    return res.status(400).json({ error: 'State is required.' });
  }
  if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    return res.status(400).json({ error: 'A valid admin email is required.' });
  }
  if (!adminPhone || adminPhone.length < 10) {
    return res.status(400).json({ error: 'A valid 10-digit mobile number is required.' });
  }
  if (!adminPassword || adminPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!termsAccepted) {
    return res.status(400).json({ error: 'You must agree to the Terms of Service and Privacy Policy.' });
  }

  // 2. D2 Username Validation
  const usernameVal = validateAdminUsername(rawUsername || suggestAdminUsername(schoolName));
  if (!usernameVal.valid) {
    return res.status(400).json({ error: usernameVal.error });
  }
  const adminUsername = usernameVal.username;

  // 3. C3 Subdomain Validation
  const subVal = validateSubdomain(subdomain);
  if (!subVal.valid) {
    return res.status(400).json({ error: subVal.error });
  }

  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();

  // 4. Rate Limiting (D5: 5 starts/hour per IP, 3 starts/hour per email)
  if (!isMock) {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    try {
      const ipRlDoc = await db.collection('registration_rate_limits').doc(`ip_${hashedClientIp}`).get();
      if (ipRlDoc.exists) {
        const data = ipRlDoc.data();
        const recent = (data.timestamps || []).filter(ts => ts > oneHourAgo);
        if (recent.length >= 5) {
          return res.status(429).json({
            error: 'Too many registration attempts from your network. Please try again after an hour.'
          });
        }
      }

      const emailRlDoc = await db.collection('registration_rate_limits').doc(`email_${Buffer.from(adminEmail).toString('hex')}`).get();
      if (emailRlDoc.exists) {
        const data = emailRlDoc.data();
        const recent = (data.timestamps || []).filter(ts => ts > oneHourAgo);
        if (recent.length >= 3) {
          return res.status(429).json({
            error: 'Too many registration attempts for this email. Please check your inbox or try again after an hour.'
          });
        }
      }
    } catch (rlErr) {
      console.warn('[registration-start] Rate limit check warning:', rlErr.message);
    }
  }

  // 5. D3 Duplicate Email Check
  try {
    // Check in existing schools
    const schoolEmailSnap = await db.collection('schools')
      .where('email', '==', adminEmail)
      .limit(1)
      .get();

    if (!schoolEmailSnap.empty) {
      const matchedSchool = schoolEmailSnap.docs[0].data();
      const erpUrl = `https://${matchedSchool.subdomain}.ctrlshifts.in`;
      return res.status(409).json({
        error: `This email is already registered. Please log in at ${erpUrl}, or contact us.`
      });
    }

    // Check in existing active/provisioned registrations
    const regEmailSnap = await db.collection('registrations')
      .where('adminEmail', '==', adminEmail)
      .where('status', 'in', ['pending_verification', 'pending_otp', 'verified', 'provisioned'])
      .limit(1)
      .get();

    if (!regEmailSnap.empty) {
      const matchedReg = regEmailSnap.docs[0].data();
      const erpUrl = `https://${matchedReg.subdomain}.ctrlshifts.in`;
      return res.status(409).json({
        error: `This email is already registered. Please log in at ${erpUrl}, or contact us.`
      });
    }
  } catch (dupErr) {
    console.error('[registration-start] Duplicate check error:', dupErr);
  }

  // 6. Subdomain Collision & Reservation Check (C3)
  try {
    const schoolSubSnap = await db.collection('schools')
      .where('subdomain', '==', subdomain)
      .limit(1)
      .get();

    if (!schoolSubSnap.empty) {
      return res.status(409).json({
        error: `The subdomain "${subdomain}.ctrlshifts.in" is already registered. Please choose another.`
      });
    }

    const reservationDoc = await db.collection('subdomain_reservations').doc(subdomain).get();
    if (reservationDoc.exists) {
      const resData = reservationDoc.data();
      if (resData.expiresAt > nowIso && resData.status !== 'released') {
        // If it's a pending registration for the SAME email within window, we can re-use
        if (resData.adminEmail !== adminEmail) {
          return res.status(409).json({
            error: `The subdomain "${subdomain}.ctrlshifts.in" is temporarily reserved. Please choose another.`
          });
        }
      }
    }
  } catch (subErr) {
    console.error('[registration-start] Subdomain reservation check error:', subErr);
  }

  // 7. D3 Possible Duplicate School Check (Same Name + Same City)
  let possibleDuplicate = false;
  let matchingSchoolId = null;
  try {
    const normReqName = normalizeSchoolName(schoolName);
    const normReqCity = city.toLowerCase();

    const allSchoolsSnap = await db.collection('schools').get();
    for (const doc of allSchoolsSnap.docs) {
      const sData = doc.data();
      const sNormName = normalizeSchoolName(sData.school_name || '');
      const sAddress = (sData.address || '').toLowerCase();
      if (sNormName === normReqName && sAddress.includes(normReqCity)) {
        possibleDuplicate = true;
        matchingSchoolId = sData.school_id || doc.id;
        console.warn(`[registration-start] Possible duplicate school detected: ${schoolName} matches ${matchingSchoolId}`);
        break;
      }
    }
  } catch (pErr) {
    console.warn('[registration-start] Possible duplicate detection error:', pErr.message);
  }

  // 8. Referral Code Lookup (if provided)
  let referralAttribution = null;
  if (referralCode) {
    try {
      const refDoc = await db.collection('referral_codes').doc(referralCode).get();
      if (refDoc.exists && refDoc.data().active !== false) {
        const rData = refDoc.data();
        referralAttribution = {
          code: referralCode,
          employeeName: rData.employeeName || 'Staff Member',
          employeeId: rData.employeeId || '',
          department: rData.department || '',
          type: rData.type || 'employee'
        };
      } else {
        console.warn(`[registration-start] Referral code ${referralCode} invalid or inactive.`);
      }
    } catch (refErr) {
      console.warn('[registration-start] Referral lookup error:', refErr.message);
    }
  }

  // 9. Generate OTP and Expiry (D5: 10 minutes, crypto RNG, hashed storage)
  const otp = generateOtp();
  const otpSalt = `salt_${Date.now()}_${Math.random()}`;
  const otpHash = hashOtp(otp, otpSalt);
  const otpExpiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

  // Generate unique registration ID
  const regId = `reg_${now.getTime()}_${Math.random().toString(36).substring(2, 8)}`;

  // 10. Reserve Subdomain
  const reservationExpiry = new Date(now.getTime() + 20 * 60 * 1000).toISOString();
  await db.collection('subdomain_reservations').doc(subdomain).set({
    subdomain: subdomain,
    regId: regId,
    adminEmail: adminEmail,
    status: 'reserved',
    reservedAt: nowIso,
    expiresAt: reservationExpiry
  });

  // 11. Store Registration Document
  const registrationRecord = {
    regId: regId,
    schoolName: schoolName,
    normalizedSchoolName: normalizeSchoolName(schoolName),
    city: city,
    normalizedCity: city.toLowerCase(),
    state: state,
    subdomain: subdomain,
    adminEmail: adminEmail,
    adminPhone: adminPhone,
    adminUsername: adminUsername,
    adminPasswordHash: hashPassword(adminPassword),
    referralCode: referralCode || null,
    referralAttribution: referralAttribution,
    otpHash: otpHash,
    otpSalt: otpSalt,
    otpExpiresAt: otpExpiresAt,
    otpAttempts: 0,
    otpResendCount: 1,
    otpLastSentAt: nowIso,
    status: 'pending_verification',
    possibleDuplicate: possibleDuplicate,
    matchingSchoolId: matchingSchoolId,
    termsAccepted: true,
    termsAcceptedAt: nowIso,
    marketingConsent: marketingConsent,
    marketingConsentAt: marketingConsent ? nowIso : null,
    ipHash: hashedClientIp,
    funnel: [
      { step: 'start', at: nowIso },
      { step: 'otp_sent', at: nowIso }
    ],
    createdAt: nowIso,
    updatedAt: nowIso,
    schoolId: null,
    provisionedAt: null
  };

  await db.collection('registrations').doc(regId).set(registrationRecord);

  // 12. Update Rate Limit Collections
  try {
    await db.collection('registration_rate_limits').doc(`ip_${hashedClientIp}`).set({
      timestamps: getFirebaseAdmin().firestore.FieldValue.arrayUnion(nowIso)
    }, { merge: true });

    await db.collection('registration_rate_limits').doc(`email_${Buffer.from(adminEmail).toString('hex')}`).set({
      timestamps: getFirebaseAdmin().firestore.FieldValue.arrayUnion(nowIso)
    }, { merge: true });
  } catch (rlSetErr) {
    console.warn('[registration-start] Rate limit record update warning:', rlSetErr.message);
  }

  // 13. Dispatch Email
  try {
    await sendOtpEmail({
      email: adminEmail,
      otp: otp,
      schoolName: schoolName
    });
  } catch (emailErr) {
    console.error('[registration-start] Email dispatch failed:', emailErr);
    return res.status(503).json({
      error: 'Could not send verification email. Please check the email address or contact support.'
    });
  }

  // 14. Telegram Alert (C8)
  const tgMsg = `🔔 *New School Registration Started*
🏫 *School:* ${schoolName}
🌐 *Subdomain:* ${subdomain}.ctrlshifts.in
📍 *Location:* ${city}, ${state}
👤 *Admin User:* \`${adminUsername}\`
📧 *Email:* ${maskEmail(adminEmail)}
🏷️ *Referral:* ${referralAttribution ? `${referralAttribution.employeeName} (${referralAttribution.code})` : 'Organic'}
⚠️ *Duplicate Alert:* ${possibleDuplicate ? `YES (matches ${matchingSchoolId})` : 'No'}`;
  sendTelegramAlert(tgMsg).catch(() => {});

  return res.status(200).json({
    success: true,
    regId: regId,
    subdomain: subdomain,
    adminUsername: adminUsername,
    maskedEmail: maskEmail(adminEmail),
    otpExpiresAt: otpExpiresAt,
    resendCooldownSeconds: 60
  });
}
