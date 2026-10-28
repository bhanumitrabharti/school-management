'use strict';

/**
 * POST /api/registration-provision (CommonJS)
 * Idempotently provisions a verified school registration:
 *  - Writes canonical public schools/{schoolId} doc (C5)
 *  - Writes root tenant_data/{schoolId} doc with default arrays (C4)
 *  - Writes tenant_data/{schoolId}/private/credentials with bcrypt hash (C1)
 *  - Updates subdomain_reservations & referral_codes
 *  - Dispatches welcome email (D4) and internal Telegram alert (C8)
 */
const {
  buildSchoolRecord,
  buildTenantRecord,
  buildPrivateCredentialsRecord
} = require('./_lib/school-template');
const { sendWelcomeEmail } = require('./_lib/email');
const { sendTelegramAlert } = require('./_lib/telegram');
const { getFirebaseAdmin, getDb } = require('./_lib/firebase-admin');

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
    return res.status(404).json({ error: 'Registration record not found.' });
  }

  const regData = regSnap.data();

  // IDEMPOTENCY: If already provisioned, return existing school context immediately
  if (regData.status === 'provisioned' && regData.schoolId) {
    const erpUrl = `https://${regData.subdomain}.ctrlshifts.in`;
    return res.status(200).json({
      success: true,
      alreadyProvisioned: true,
      schoolId: regData.schoolId,
      subdomain: regData.subdomain,
      erpUrl: erpUrl,
      adminUsername: regData.adminUsername,
      schoolName: regData.schoolName
    });
  }

  // Enforce OTP verified status before provisioning
  if (regData.status !== 'verified') {
    return res.status(400).json({
      error: `Registration cannot be provisioned in status "${regData.status}". Please verify your OTP code first.`
    });
  }

  // Generate canonical schoolId
  let schoolId = regData.schoolId;
  if (!schoolId) {
    const cleanSub = regData.subdomain.replace(/-/g, '_');
    const randSuffix = Math.random().toString(36).substring(2, 10);
    schoolId = `${cleanSub}_${randSuffix}`;
  }

  const subdomain = regData.subdomain;
  const adminUsername = regData.adminUsername;
  const adminPasswordHash = regData.adminPasswordHash;
  const schoolName = regData.schoolName;
  const adminEmail = regData.adminEmail;

  // Build canonical document models
  const templateOptions = {
    schoolId: schoolId,
    schoolName: schoolName,
    subdomain: subdomain,
    adminUsername: adminUsername,
    adminEmail: adminEmail,
    adminPasswordHash: adminPasswordHash,
    plan: regData.requestedPlan ? (regData.requestedPlan.charAt(0).toUpperCase() + regData.requestedPlan.slice(1)) : 'Free Trial',
    phone: regData.adminPhone,
    city: regData.city,
    state: regData.state,
    onboardingSource: 'self_service',
    referralCode: regData.referralCode,
    referralAttribution: regData.referralAttribution,
    setupCompletedBySuperAdmin: false // self-service school
  };

  const publicSchoolRecord = buildSchoolRecord(templateOptions);
  const rootTenantRecord = buildTenantRecord(templateOptions, publicSchoolRecord);
  const privateCredentialsRecord = buildPrivateCredentialsRecord(templateOptions);

  try {
    // Atomic provisioning
    const batch = db.batch();

    // 1. schools/{schoolId}
    const schoolDocRef = db.collection('schools').doc(schoolId);
    batch.set(schoolDocRef, publicSchoolRecord);

    // 2. tenant_data/{schoolId}
    const tenantDocRef = db.collection('tenant_data').doc(schoolId);
    batch.set(tenantDocRef, rootTenantRecord);

    // 3. tenant_data/{schoolId}/private/credentials (C1)
    const credDocRef = db.collection('tenant_data').doc(schoolId).collection('private').doc('credentials');
    batch.set(credDocRef, privateCredentialsRecord);

    // 4. Update subdomain_reservations to 'active'
    const subResRef = db.collection('subdomain_reservations').doc(subdomain);
    batch.set(subResRef, {
      subdomain: subdomain,
      regId: regId,
      schoolId: schoolId,
      status: 'active',
      activatedAt: nowIso
    }, { merge: true });

    // 5. Update registration document
    const updatedFunnel = (regData.funnel || []).concat([{ step: 'provisioned', at: nowIso }]);
    batch.update(regRef, {
      status: 'provisioned',
      schoolId: schoolId,
      provisionedAt: nowIso,
      updatedAt: nowIso,
      trialStartDate: publicSchoolRecord.trial_start,
      trialEndDate: publicSchoolRecord.trial_end,
      funnel: updatedFunnel
    });

    // 6. Referral code usage count increment
    if (regData.referralCode) {
      const refCodeRef = db.collection('referral_codes').doc(regData.referralCode);
      batch.set(refCodeRef, {
        usesCount: getFirebaseAdmin().firestore.FieldValue.increment(1),
        lastUsedAt: nowIso
      }, { merge: true });
    }

    await batch.commit();
    console.log(`[registration-provision] Successfully provisioned school ${schoolId} (${subdomain}.ctrlshifts.in)`);

  } catch (provErr) {
    console.error('[registration-provision] Provisioning transaction failed:', provErr);
    await regRef.update({
      status: 'failed',
      statusReason: provErr.message,
      updatedAt: nowIso
    }).catch(() => {});
    return res.status(500).json({
      error: 'Provisioning failed due to a server error. You can retry from your registration screen or contact support.'
    });
  }

  // D4: Send Welcome Email
  try {
    await sendWelcomeEmail({
      email: adminEmail,
      schoolName: schoolName,
      subdomain: subdomain,
      adminUsername: adminUsername
    });
  } catch (wErr) {
    console.warn('[registration-provision] Welcome email failed to send:', wErr.message);
  }

  // C8: Dispatch Telegram Notification
  const erpUrl = `https://${subdomain}.ctrlshifts.in`;
  const tgMsg = `🎉 *School Provisioned Successfully!*
🏫 *School:* ${schoolName}
🌐 *ERP URL:* ${erpUrl}
👤 *Admin User:* \`${adminUsername}\`
📧 *Email:* ${adminEmail}
📍 *Location:* ${regData.city}, ${regData.state}
🏷️ *Referral:* ${regData.referralAttribution ? `${regData.referralAttribution.employeeName} (${regData.referralAttribution.code})` : 'Organic'}
⚡ *Status:* Active (30-Day Free Trial)`;

  sendTelegramAlert(tgMsg).catch(() => {});

  return res.status(200).json({
    success: true,
    schoolId: schoolId,
    subdomain: subdomain,
    erpUrl: erpUrl,
    adminUsername: adminUsername,
    schoolName: schoolName,
    trialEndDate: publicSchoolRecord.trial_end
  });
};
