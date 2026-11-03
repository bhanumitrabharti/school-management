'use strict';

/**
 * api/_lib/parents/auth.js
 * 
 * Shared parent authorization helper.
 * Enforces per-request verification:
 *   1. Parent token verification (Firebase Auth verifyIdToken).
 *   2. Reconstructed parent email matching.
 *   3. Student linkage verification in tenant_data/{schoolId}/students/{studentId}:
 *      - Must exist
 *      - Must be status === 'Active'
 *      - Must match parentEmailNorm or secondaryParentEmailNorm
 *   4. School parent portal enabled check (via tenant_data/{schoolId}/portal/config or root fallback).
 *   5. Module toggle check (returns 403 if module is OFF).
 */

const crypto = require('crypto');
const { getFirebaseAdmin, getDb } = require('../firebase-admin');

function hashString(val) {
  return crypto.createHash('sha256').update(String(val)).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Authenticates parent caller, checks student linking, verifies portal is enabled,
 * and asserts that the requested module toggle is active.
 * 
 * @param {Object} req - Incoming request
 * @param {Object} res - Outgoing response
 * @param {string} moduleKey - 'profile' | 'attendance' | 'timetable' | 'notices' | 'exams'
 * @returns {Promise<{ authorized: boolean, student?: Object, portalConfig?: Object, schoolId?: string, studentId?: string, emailNorm?: string }>}
 */
async function authenticateParentRequest(req, res, moduleKey) {
  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const isMock = !isProduction && (process.env.MOCK_ONBOARDING_MODE === 'true' || process.env.MOCK_PARENT_MODE === 'true');

  const authHeader = req.headers && req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header. Please log in.' });
    return { authorized: false };
  }

  const idToken = authHeader.split('Bearer ')[1].trim();
  const adminSdk = getFirebaseAdmin();
  const db = getDb();

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
      res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
      return { authorized: false };
    }
  }

  if (!decoded.uid || !decoded.uid.startsWith('parent_')) {
    res.status(403).json({ error: 'Forbidden: Caller is not a parent account.' });
    return { authorized: false };
  }

  // Resolve parent email
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
    res.status(400).json({ error: 'Parent email could not be verified from token.' });
    return { authorized: false };
  }

  const emailNorm = normalizeEmail(parentEmail);

  // Extract parameters from query or body
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const query = req.query || {};
  const schoolId = String(body.schoolId || query.schoolId || '').trim();
  const studentId = String(body.studentId || query.studentId || '').trim();

  if (!schoolId || !studentId) {
    res.status(400).json({ error: 'Missing required parameters: schoolId and studentId are required.' });
    return { authorized: false };
  }

  // 1. Read Portal Config (Lightweight Doc First)
  let portalConfig = null;
  const configDocRef = db.collection('tenant_data').doc(schoolId).collection('portal').doc('config');
  const configDocSnap = await configDocRef.get();

  if (configDocSnap.exists) {
    portalConfig = configDocSnap.data();
  } else {
    // Fallback: Read Root doc if portal/config has not been backfilled yet
    const rootDocRef = db.collection('tenant_data').doc(schoolId);
    const rootSnap = await rootDocRef.get();
    if (!rootSnap.exists) {
      res.status(404).json({ error: 'School not found.' });
      return { authorized: false };
    }
    const rootData = rootSnap.data() || {};
    const settings = rootData.settings || {};
    const isMigrated = settings.studentsMigrated === true;
    const pp = settings.parentPortal || {};
    portalConfig = {
      enabled: isMigrated && pp.enabled === true,
      modules: {
        profile: pp.profile !== undefined ? pp.profile : (pp.allowProfile !== undefined ? pp.allowProfile : true),
        attendance: pp.attendance !== undefined ? pp.attendance : (pp.allowAttendance !== undefined ? pp.allowAttendance : true),
        timetable: pp.timetable !== undefined ? pp.timetable : (pp.allowTimetable !== undefined ? pp.allowTimetable : true),
        exams: pp.exams !== undefined ? pp.exams : (pp.allowExams !== undefined ? pp.allowExams : false),
        reportCards: pp.reportCards !== undefined ? pp.reportCards : (pp.allowReportCards !== undefined ? pp.allowReportCards : false),
        notices: pp.notices !== undefined ? pp.notices : (pp.allowNotices !== undefined ? pp.allowNotices : true),
        fees: pp.fees !== undefined ? pp.fees : (pp.allowFees !== undefined ? pp.allowFees : true),
        feePayment: pp.feePayment !== undefined ? pp.feePayment : (pp.allowUpiPayment !== undefined ? pp.allowUpiPayment : true)
      },
      schoolName: settings.schoolName || settings.schoolInfo?.name || rootData.school_name || schoolId,
      logoUrl: settings.logoStorageUrl || settings.logoUrl || settings.schoolLogo || '',
      updatedAt: pp.updatedAt || new Date().toISOString()
    };
  }

  // 2. Assert Portal is Enabled
  if (!portalConfig || portalConfig.enabled !== true) {
    res.status(403).json({ error: 'Parent Portal is not currently enabled for this school.' });
    return { authorized: false };
  }

  // 3. Assert Module Toggle is Active
  if (moduleKey) {
    const modules = portalConfig.modules || {};
    let isModuleActive = true;
    if (moduleKey === 'exams' || moduleKey === 'reportCards') {
      isModuleActive = modules[moduleKey] === true;
    } else {
      isModuleActive = modules[moduleKey] !== false;
    }

    if (!isModuleActive) {
      const titles = {
        profile: 'Student Profile',
        attendance: 'Attendance',
        timetable: 'Timetable',
        notices: 'Notices & Circulars',
        exams: 'Exams & Results',
        reportCards: 'Report Cards',
        fees: 'Fee Details'
      };
      const title = titles[moduleKey] || moduleKey;
      res.status(403).json({ error: `The ${title} module is currently disabled by the school administration.` });
      return { authorized: false };
    }
  }

  // 4. Assert Student Exists, is Active, and is Linked to Caller's Email
  const studentDocRef = db.collection('tenant_data').doc(schoolId).collection('students').doc(studentId);
  const studentSnap = await studentDocRef.get();

  if (!studentSnap.exists) {
    res.status(404).json({ error: 'Student record not found in this school.' });
    return { authorized: false };
  }

  const student = studentSnap.data();
  if (student.status !== 'Active') {
    res.status(403).json({ error: 'Student record is inactive. Access revoked.' });
    return { authorized: false };
  }

  const sParentEmailNorm = normalizeEmail(student.parentEmailNorm || student.parentEmail || student.fatherEmail || student.motherEmail);
  const sSecParentEmailNorm = normalizeEmail(student.secondaryParentEmailNorm || student.secondaryParentEmail || student.guardianEmail);

  if (sParentEmailNorm !== emailNorm && sSecParentEmailNorm !== emailNorm) {
    res.status(403).json({ error: 'Forbidden: You do not have permission to access records for this student.' });
    return { authorized: false };
  }

  return {
    authorized: true,
    student,
    portalConfig,
    schoolId,
    studentId,
    emailNorm
  };
}

module.exports = {
  authenticateParentRequest,
  normalizeEmail,
  hashString
};
