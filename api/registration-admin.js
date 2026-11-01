'use strict';

/**
 * /api/registration-admin (CommonJS)
 * Super Admin Management API for Self-Service Registrations,
 * Subdomains, Referral Attribution and Provisioning Controls.
 */

const { getFirebaseAdmin, getDb } = require('./_lib/firebase-admin');
const {
  buildSchoolRecord,
  buildTenantRecord,
  buildPrivateCredentialsRecord
} = require('./_lib/school-template');
const { sendWelcomeEmail, sendStorageAlertEmail } = require('./_lib/email');

// Helper for Firestore exact size calculation
function getFirestoreValSize(val) {
  if (val === null || val === undefined) return 1;
  if (typeof val === 'boolean') return 1;
  if (typeof val === 'number') return 8;
  if (typeof val === 'string') return Buffer.byteLength(val, 'utf8') + 1;
  if (val instanceof Date) return 8;
  if (Buffer.isBuffer(val)) return val.length;
  if (val && typeof val.toMillis === 'function') return 8;
  if (Array.isArray(val)) {
    let size = 8;
    for (let i = 0; i < val.length; i++) size += getFirestoreValSize(val[i]);
    return size;
  }
  if (typeof val === 'object') {
    let size = 0;
    const keys = Object.keys(val);
    for (let i = 0; i < keys.length; i++) {
      size += Buffer.byteLength(keys[i], 'utf8') + 1;
      size += getFirestoreValSize(val[keys[i]]);
    }
    return size;
  }
  return 0;
}

function calcFirestoreDocSize(docPath, data) {
  const segments = docPath.split('/').filter(Boolean);
  let pathBytes = 16;
  for (const s of segments) pathBytes += Buffer.byteLength(s, 'utf8');
  let fieldsSize = 0;
  if (data && typeof data === 'object') {
    for (const k of Object.keys(data)) {
      fieldsSize += (Buffer.byteLength(k, 'utf8') + 1 + getFirestoreValSize(data[k]));
    }
  }
  return pathBytes + 32 + fieldsSize;
}
const { sendTelegramAlert } = require('./_lib/telegram');

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-test-super-admin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const adm = getFirebaseAdmin();
  const db = getDb();

  // F5: Production Guard on Mock Mode
  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const isMock = !isProduction && process.env.MOCK_ONBOARDING_MODE === 'true';

  // Super Admin Authorization Check
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : (req.body && req.body.idToken);

  let isSuperAdmin = false;
  if (token) {
    try {
      const decoded = await adm.auth().verifyIdToken(token);
      if (decoded.uid === 'cq647u1GfCXISzf7XMw8pxH76I72' || decoded.is_super_admin === true) {
        isSuperAdmin = true;
      }
    } catch (e) {
      console.warn('[registration-admin] Token verification error:', e.message);
    }
  }

  // F5: Test runner authorization fallback ONLY in non-production mock mode
  if (isMock && req.headers['x-test-super-admin'] === 'true') {
    isSuperAdmin = true;
  }

  if (!isSuperAdmin) {
    return res.status(403).json({ error: 'Unauthorized: Super Admin access required.' });
  }

  const action = req.query.action || (req.body && req.body.action) || 'list';

  try {
    // 1. LIST REGISTRATIONS & KPIS
    if (action === 'list') {
      const snap = await db.collection('registrations')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

      const items = [];
      const kpis = {
        total: 0,
        provisioned: 0,
        verified: 0,
        pending_otp: 0,
        failed: 0,
        suspended: 0,
        organic: 0,
        referral: 0
      };

      snap.forEach(doc => {
        const d = doc.data();
        kpis.total++;

        if (d.status === 'provisioned') kpis.provisioned++;
        else if (d.status === 'verified') kpis.verified++;
        else if (d.status === 'pending_otp' || d.status === 'pending_verification') kpis.pending_otp++;
        else if (d.status === 'failed') kpis.failed++;
        else if (d.status === 'suspended') kpis.suspended++;

        if (d.referralCode) kpis.referral++;
        else kpis.organic++;

        items.push({
          regId: d.regId || doc.id,
          schoolId: d.schoolId || null,
          schoolName: d.schoolName || '—',
          city: d.city || '—',
          state: d.state || '—',
          subdomain: d.subdomain || '—',
          adminEmail: d.adminEmail || '—',
          adminMobile: d.adminMobile || d.adminPhone || '—',
          adminUsername: d.adminUsername || '—',
          adminName: d.adminName || '—',
          status: d.status || 'unknown',
          requestedPlan: d.requestedPlan || null,
          referralCode: d.referralCode || null,
          referralAttribution: d.referralAttribution || null,
          possibleDuplicate: !!d.possibleDuplicate,
          matchingSchoolId: d.matchingSchoolId || null,
          createdAt: d.createdAt || null,
          verifiedAt: d.verifiedAt || null,
          provisionedAt: d.provisionedAt || null,
          lastError: d.lastError || null
        });
      });

      return res.status(200).json({
        success: true,
        kpis,
        registrations: items
      });
    }

    // 2. REGISTRATION DETAIL
    if (action === 'detail') {
      const regId = req.query.regId || (req.body && req.body.regId);
      if (!regId) return res.status(400).json({ error: 'regId is required' });

      const docSnap = await db.collection('registrations').doc(regId).get();
      if (!docSnap.exists) return res.status(404).json({ error: 'Registration record not found' });

      const data = docSnap.data();
      // Remove raw password hash from response for security
      delete data.adminPasswordHash;
      delete data.adminPassword;
      delete data.otpHash;
      delete data.otpSalt;

      return res.status(200).json({ success: true, registration: data });
    }

    // 3. RETRY PROVISIONING
    if (action === 'retry') {
      const regId = req.body.regId;
      if (!regId) return res.status(400).json({ error: 'regId is required' });

      const regRef = db.collection('registrations').doc(regId);
      const regDoc = await regRef.get();
      if (!regDoc.exists) return res.status(404).json({ error: 'Registration not found' });

      const reg = regDoc.data();
      const schoolId = reg.schoolId || `school_${reg.subdomain.replace(/-/g, '_')}_${Date.now().toString(36)}`;
      const nowIso = new Date().toISOString();

      // Build canonical records
      const schoolRecord = buildSchoolRecord({
        schoolName: reg.schoolName,
        city: reg.city,
        state: reg.state,
        subdomain: reg.subdomain,
        phone: reg.adminMobile || reg.adminPhone,
        email: reg.adminEmail,
        plan: 'trial'
      });

      const tenantRecord = buildTenantRecord({
        schoolName: reg.schoolName,
        city: reg.city,
        state: reg.state,
        phone: reg.adminMobile || reg.adminPhone,
        email: reg.adminEmail,
        adminUsername: reg.adminUsername
      });

      const privateCreds = buildPrivateCredentialsRecord({
        adminUsername: reg.adminUsername,
        adminPasswordHash: reg.adminPasswordHash
      });

      // Write in transaction / atomic batch
      const batch = db.batch();
      batch.set(db.collection('schools').doc(schoolId), schoolRecord);
      batch.set(db.collection('tenant_data').doc(schoolId), tenantRecord);
      batch.set(
        db.collection('tenant_data').doc(schoolId).collection('private').doc('credentials'),
        privateCreds
      );
      batch.set(
        db.collection('subdomain_reservations').doc(reg.subdomain),
        {
          subdomain: reg.subdomain,
          regId: regId,
          schoolId: schoolId,
          status: 'active',
          updatedAt: nowIso
        },
        { merge: true }
      );
      batch.update(regRef, {
        status: 'provisioned',
        schoolId: schoolId,
        provisionedAt: nowIso,
        lastError: null,
        updatedAt: nowIso
      });

      await batch.commit();

      const erpUrl = `https://${reg.subdomain}.ctrlshifts.in`;
      return res.status(200).json({
        success: true,
        schoolId: schoolId,
        subdomain: reg.subdomain,
        erpUrl: erpUrl,
        message: 'Successfully provisioned school ERP.'
      });
    }

    // 4. SUSPEND SCHOOL / REGISTRATION
    if (action === 'suspend') {
      const regId = req.body.regId;
      const schoolId = req.body.schoolId;
      if (!regId && !schoolId) return res.status(400).json({ error: 'regId or schoolId required' });

      let targetSchoolId = schoolId;
      let targetSubdomain = null;

      if (regId) {
        const regSnap = await db.collection('registrations').doc(regId).get();
        if (regSnap.exists) {
          const r = regSnap.data();
          targetSchoolId = targetSchoolId || r.schoolId;
          targetSubdomain = r.subdomain;
          await db.collection('registrations').doc(regId).update({
            status: 'suspended',
            updatedAt: new Date().toISOString()
          });
        }
      }

      if (targetSchoolId) {
        await db.collection('schools').doc(targetSchoolId).update({
          status: 'suspended',
          suspended: true,
          suspendedAt: new Date().toISOString()
        });
      }

      if (targetSubdomain) {
        await db.collection('subdomain_reservations').doc(targetSubdomain).update({
          status: 'suspended',
          updatedAt: new Date().toISOString()
        });
      }

      return res.status(200).json({ success: true, message: 'School suspended successfully.' });
    }

    // 5. REACTIVATE SCHOOL / REGISTRATION
    if (action === 'reactivate') {
      const regId = req.body.regId;
      const schoolId = req.body.schoolId;
      if (!regId && !schoolId) return res.status(400).json({ error: 'regId or schoolId required' });

      let targetSchoolId = schoolId;
      let targetSubdomain = null;

      if (regId) {
        const regSnap = await db.collection('registrations').doc(regId).get();
        if (regSnap.exists) {
          const r = regSnap.data();
          targetSchoolId = targetSchoolId || r.schoolId;
          targetSubdomain = r.subdomain;
          await db.collection('registrations').doc(regId).update({
            status: 'provisioned',
            updatedAt: new Date().toISOString()
          });
        }
      }

      if (targetSchoolId) {
        await db.collection('schools').doc(targetSchoolId).update({
          status: 'active',
          suspended: false,
          reactivatedAt: new Date().toISOString()
        });
      }

      if (targetSubdomain) {
        await db.collection('subdomain_reservations').doc(targetSubdomain).update({
          status: 'active',
          updatedAt: new Date().toISOString()
        });
      }

      return res.status(200).json({ success: true, message: 'School reactivated successfully.' });
    }

    // 6. STORAGE HEALTH MONITOR (Super Admin)
    if (action === 'storage-health' || action === 'check-storage-health') {
      const tenantsSnap = await db.collection('tenant_data').get();
      const schoolsSnap = await db.collection('schools').get();
      const schoolNamesMap = {};
      schoolsSnap.forEach(s => {
        const sd = s.data();
        schoolNamesMap[s.id] = sd.school_name || sd.name || s.id;
      });

      const schoolReports = [];
      const summary = {
        totalSchools: tenantsSnap.size,
        over600KB: 0,
        over400KB: 0,
        migratedCount: 0,
        alertsSent: 0
      };

      for (const tDoc of tenantsSnap.docs) {
        const sid = tDoc.id;
        const tData = tDoc.data();
        const sizeBytes = calcFirestoreDocSize(`tenant_data/${sid}`, tData);
        const sizeKB = +(sizeBytes / 1024).toFixed(2);
        const pctOf1MB = +((sizeBytes / 1048576) * 100).toFixed(1);
        const storageVersion = (tData.settings && tData.settings.storageVersion) || 1;
        const isMigrated = storageVersion >= 2;
        const schoolName = schoolNamesMap[sid] || (tData.settings && tData.settings.schoolName) || sid;

        if (isMigrated) summary.migratedCount++;
        if (sizeKB >= 400) summary.over400KB++;

        let alertTriggered = false;
        if (sizeKB >= 600) {
          summary.over600KB++;
          try {
            await sendStorageAlertEmail({
              schoolId: sid,
              schoolName: schoolName,
              rootSizeKB: sizeKB,
              pctOf1MB: pctOf1MB
            });
            alertTriggered = true;
            summary.alertsSent++;
          } catch (eAlert) {
            console.warn('[Storage Health] Failed sending alert email for', sid, eAlert.message);
          }
        }

        const reportEntry = {
          schoolId: sid,
          schoolName: schoolName,
          rootSizeBytes: sizeBytes,
          rootSizeKB: sizeKB,
          pctOf1MB: pctOf1MB,
          storageVersion: storageVersion,
          isMigrated: isMigrated,
          alertRequired: sizeKB >= 600,
          alertTriggered: alertTriggered,
          checkedAt: new Date().toISOString()
        };

        // Cache snapshot in platform_health/{schoolId}
        await db.collection('platform_health').doc(sid).set(reportEntry, { merge: true }).catch(() => {});
        schoolReports.push(reportEntry);
      }

      schoolReports.sort((a, b) => b.rootSizeBytes - a.rootSizeBytes);

      return res.status(200).json({
        success: true,
        summary: summary,
        schools: schoolReports
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[registration-admin] Error:', err);
    return res.status(500).json({ error: 'Server error processing admin request: ' + err.message });
  }
};
