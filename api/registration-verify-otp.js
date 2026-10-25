'use strict';

/**
 * POST /api/registration-verify-otp (CommonJS)
 * Verifies the 6-digit OTP code against the hashed registration record,
 * enforces 5-attempt limit and 10-minute expiry, and handles 60s cooldown resends.
 */
const { hashOtp, generateOtp } = require('./_lib/validation');
const { sendOtpEmail } = require('./_lib/email');
const { getDb } = require('./_lib/firebase-admin');

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

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const regId = (body.regId || '').trim();
  const action = body.action || 'verify'; // 'verify' or 'resend'
  const inputOtp = (body.otp || '').trim();

  // F5: Production Guard on Mock Mode
  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const isMock = !isProduction && process.env.MOCK_ONBOARDING_MODE === 'true';

  if (!regId) {
    return res.status(400).json({ error: 'Registration ID (regId) is required.' });
  }

  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();

  const regRef = db.collection('registrations').doc(regId);
  const regSnap = await regRef.get();

  if (!regSnap.exists) {
    return res.status(404).json({ error: 'Registration not found or expired. Please start over.' });
  }

  const regData = regSnap.data();

  // If already invalidated
  if (regData.status === 'rejected') {
    return res.status(400).json({
      error: 'This registration has been invalidated due to exceeding maximum failed attempts. Please start over.'
    });
  }

  // -------------------------------------------------------------
  // ACTION: RESEND OTP
  // -------------------------------------------------------------
  if (action === 'resend') {
    // Check cooldown (60 seconds)
    const lastSentMs = regData.otpLastSentAt ? new Date(regData.otpLastSentAt).getTime() : 0;
    const elapsedSeconds = Math.floor((now.getTime() - lastSentMs) / 1000);
    if (elapsedSeconds < 60) {
      return res.status(429).json({
        error: `Please wait ${60 - elapsedSeconds} seconds before requesting a new code.`
      });
    }

    // Check maximum resend limit (at most 3 sends total)
    const resendCount = regData.otpResendCount || 1;
    if (resendCount >= 3) {
      return res.status(429).json({
        error: 'Maximum code resend limit (3) reached for this registration.'
      });
    }

    // Generate fresh OTP
    const newOtp = generateOtp();
    const newSalt = `salt_${Date.now()}_${Math.random()}`;
    const newOtpHash = hashOtp(newOtp, newSalt);
    const newExpiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    await regRef.update({
      otpHash: newOtpHash,
      otpSalt: newSalt,
      otpExpiresAt: newExpiresAt,
      otpAttempts: 0, // reset attempts on fresh OTP
      otpResendCount: resendCount + 1,
      otpLastSentAt: nowIso,
      updatedAt: nowIso
    });

    try {
      await sendOtpEmail({
        email: regData.adminEmail,
        otp: newOtp,
        schoolName: regData.schoolName
      });
    } catch (eErr) {
      console.error('[registration-verify-otp] Resend email failed:', eErr);
      return res.status(503).json({ error: 'Failed to send verification code. Please try again later.' });
    }

    return res.status(200).json({
      success: true,
      message: 'A new verification code has been sent to your email.',
      resendCooldownSeconds: 60,
      resendCount: resendCount + 1
    });
  }

  // -------------------------------------------------------------
  // ACTION: VERIFY OTP
  // -------------------------------------------------------------
  if (!inputOtp || inputOtp.length !== 6 || !/^\d{6}$/.test(inputOtp)) {
    return res.status(400).json({ error: 'Please enter a valid 6-digit verification code.' });
  }

  // If already verified or provisioned, return success immediately
  if (regData.status === 'verified' || regData.status === 'provisioned') {
    return res.status(200).json({
      success: true,
      verified: true,
      regId: regId,
      subdomain: regData.subdomain,
      status: regData.status
    });
  }

  // Check attempt limit (D5: max 5 attempts)
  const currentAttempts = regData.otpAttempts || 0;
  if (currentAttempts >= 5) {
    // Invalidate registration and release subdomain reservation
    await regRef.update({
      status: 'rejected',
      statusReason: 'Max OTP attempts exceeded',
      updatedAt: nowIso
    });
    if (regData.subdomain) {
      await db.collection('subdomain_reservations').doc(regData.subdomain).update({
        status: 'released',
        releasedAt: nowIso
      }).catch(() => {});
    }
    return res.status(400).json({
      error: 'Maximum verification attempts exceeded. Registration has been invalidated. Please start over.'
    });
  }

  // Check 10-minute expiry (D5)
  if (regData.otpExpiresAt && regData.otpExpiresAt < nowIso) {
    return res.status(400).json({
      error: 'Verification code has expired. Please click "Resend Code" to receive a fresh one.'
    });
  }

  // Verify OTP Hash
  const computedHash = hashOtp(inputOtp, regData.otpSalt);
  if (computedHash !== regData.otpHash) {
    const newAttempts = currentAttempts + 1;
    if (newAttempts >= 5) {
      await regRef.update({
        otpAttempts: newAttempts,
        status: 'rejected',
        statusReason: 'Max OTP attempts exceeded',
        updatedAt: nowIso
      });
      if (regData.subdomain) {
        await db.collection('subdomain_reservations').doc(regData.subdomain).update({
          status: 'released',
          releasedAt: nowIso
        }).catch(() => {});
      }
      return res.status(400).json({
        error: 'Maximum verification attempts exceeded. Registration has been invalidated. Please start over.'
      });
    }

    await regRef.update({
      otpAttempts: newAttempts,
      updatedAt: nowIso
    });

    return res.status(400).json({
      error: `Invalid verification code. You have ${5 - newAttempts} attempt(s) remaining.`,
      attemptsLeft: 5 - newAttempts
    });
  }

  // OTP is Valid! Mark status as 'verified'
  const updatedFunnel = (regData.funnel || []).concat([{ step: 'otp_verified', at: nowIso }]);

  await regRef.update({
    status: 'verified',
    updatedAt: nowIso,
    funnel: updatedFunnel
  });

  return res.status(200).json({
    success: true,
    verified: true,
    status: 'verified',
    regId: regId,
    subdomain: regData.subdomain,
    adminUsername: regData.adminUsername,
    schoolName: regData.schoolName
  });
};
