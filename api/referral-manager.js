'use strict';

/**
 * /api/referral-manager (CommonJS)
 * Super Admin endpoints to manage referral codes and generate employee-wise reports.
 */
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

  // Verify Super Admin token
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : (req.body && req.body.idToken);

  let isVerifiedSuperAdmin = false;
  if (token) {
    try {
      const decoded = await adm.auth().verifyIdToken(token);
      if (decoded.uid === 'cq647u1GfCXISzf7XMw8pxH76I72' || decoded.is_super_admin === true) {
        isVerifiedSuperAdmin = true;
      }
    } catch (e) {
      console.warn('[referral-manager] Token verify error:', e.message);
    }
  }

  // F5: Fallback ONLY for test runner in non-production mock mode
  if (isMock && req.headers['x-test-super-admin'] === 'true') {
    isVerifiedSuperAdmin = true;
  }

  if (!isVerifiedSuperAdmin) {
    return res.status(403).json({ error: 'Unauthorized. Super Admin privilege required.' });
  }

  const action = req.query.action || (req.body && req.body.action) || 'list';

  try {
    if (action === 'list') {
      const snap = await db.collection('referral_codes').get();
      const codes = [];
      snap.forEach(doc => {
        codes.push({ id: doc.id, ...doc.data() });
      });
      return res.status(200).json({ success: true, codes: codes });
    }

    if (action === 'create') {
      const code = (req.body.code || '').trim().toUpperCase();
      const employeeName = (req.body.employeeName || '').trim();
      const employeeId = (req.body.employeeId || '').trim();
      const department = (req.body.department || '').trim();
      const notes = (req.body.notes || '').trim();

      if (!code || code.length < 3) {
        return res.status(400).json({ error: 'Referral code must be at least 3 characters.' });
      }
      if (!employeeName) {
        return res.status(400).json({ error: 'Employee name is required.' });
      }

      const existingDoc = await db.collection('referral_codes').doc(code).get();
      if (existingDoc.exists) {
        return res.status(409).json({ error: `Referral code "${code}" already exists.` });
      }

      const nowIso = new Date().toISOString();
      const record = {
        code: code,
        employeeName: employeeName,
        employeeId: employeeId,
        department: department,
        notes: notes,
        active: true,
        usesCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await db.collection('referral_codes').doc(code).set(record);
      return res.status(200).json({ success: true, code: record });
    }

    if (action === 'toggle') {
      const code = (req.body.code || '').trim().toUpperCase();
      const active = req.body.active === true;

      await db.collection('referral_codes').doc(code).update({
        active: active,
        updatedAt: new Date().toISOString()
      });
      return res.status(200).json({ success: true, message: `Code ${code} active set to ${active}` });
    }

    if (action === 'employee_report') {
      // Aggregate registrations by referral code
      const regSnap = await db.collection('registrations').get();
      const empStats = {};

      regSnap.forEach(d => {
        const r = d.data();
        const code = r.referralCode || 'ORGANIC';
        const empName = (r.referralAttribution && r.referralAttribution.employeeName) || (code === 'ORGANIC' ? 'Self / Direct' : code);

        if (!empStats[code]) {
          empStats[code] = {
            code: code,
            employeeName: empName,
            totalStarted: 0,
            verified: 0,
            provisioned: 0,
            possibleDuplicates: 0,
            registrations: []
          };
        }

        empStats[code].totalStarted++;
        if (r.status === 'verified' || r.status === 'provisioned') empStats[code].verified++;
        if (r.status === 'provisioned') empStats[code].provisioned++;
        if (r.possibleDuplicate) empStats[code].possibleDuplicates++;

        empStats[code].registrations.push({
          regId: r.regId,
          schoolName: r.schoolName,
          subdomain: r.subdomain,
          city: r.city,
          status: r.status,
          createdAt: r.createdAt
        });
      });

      return res.status(200).json({
        success: true,
        report: Object.values(empStats)
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[referral-manager] Error:', err);
    return res.status(500).json({ error: 'Server error processing referral management request.' });
  }
};
