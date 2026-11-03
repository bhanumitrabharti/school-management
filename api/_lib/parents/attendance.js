'use strict';

/**
 * api/_lib/parents/attendance.js
 * 
 * Handles action: 'attendance'
 * Returns monthly attendance status, totals, and percentage for the single requested student.
 */

const admin = require('firebase-admin');
const { authenticateParentRequest } = require('./auth');
const { getDb } = require('../firebase-admin');
const { normalizeClassName, normalizeSectionName } = require('../class-normalizer');
const { resolveIsRestructured } = require('./restructured-helper');

async function handleAttendance(req, res) {
  const authRes = await authenticateParentRequest(req, res, 'attendance');
  if (!authRes.authorized) return;

  const { student, schoolId, studentId, portalConfig } = authRes;
  const db = getDb();

  const query = req.query || {};
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  
  // Default to current year-month (YYYY-MM) in Asia/Kolkata timezone if not provided
  let targetMonth = String(body.month || query.month || '').trim();
  if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit'
    }).formatToParts(new Date());
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    targetMonth = `${y}-${m}`;
  }

  const studentClass = String(student.class || '').trim();

  let daily = [];
  let presentDays = 0;
  let absentDays = 0;
  let lateDays = 0;
  let availableMonths = [];

  // Determine restructuring flag using shared helper
  // (treats portalConfig.restructured === undefined as UNKNOWN and resolves via field-masked read)
  const isRestructured = await resolveIsRestructured(schoolId, portalConfig, db);

  if (isRestructured) {
    // 1. Restructured tenant: Query attendance_months/{month}/classes
    if (studentClass) {
      try {
        const classesCol = db.collection('tenant_data')
          .doc(schoolId)
          .collection('attendance_months')
          .doc(targetMonth)
          .collection('classes');

        const classesSnap = await classesCol.get();
        const normStudentClass = normalizeClassName(studentClass);

        classesSnap.docs.forEach(docSnap => {
          if (normalizeClassName(docSnap.id) !== normStudentClass) return;

          const classData = docSnap.data() || {};
          const records = Array.isArray(classData.records) ? classData.records : [];

          records.forEach(session => {
            if (!session || !session.date) return;

            // Inside matching doc, match entries by studentId ONLY (unique; section normalized if used)
            const studentEntries = Array.isArray(session.records) ? session.records : [];
            const match = studentEntries.find(r => r && String(r.studentId) === String(studentId));
            if (match) {
              const st = String(match.status || 'absent').toLowerCase();
              if (st === 'present') presentDays++;
              else if (st === 'late') lateDays++;
              else absentDays++;

              daily.push({
                date: session.date,
                status: st
              });
            }
          });
        });
      } catch (subErr) {
        console.warn('[api/parents/attendance] Error querying subcollection:', subErr.message);
      }
    }

    // Retrieve available months list for restructured school
    try {
      const monthsCol = db.collection('tenant_data').doc(schoolId).collection('attendance_months');
      const monthsSnap = await monthsCol.listDocuments();
      availableMonths = monthsSnap.map(d => d.id).filter(id => /^\d{4}-\d{2}$/.test(id));
    } catch (_) {}

  } else {
    // 2. Non-restructured tenant: Read root attendance array using field-masked read
    try {
      let rootAttendance = [];
      const querySnap = await db.collection('tenant_data')
        .where(admin.firestore.FieldPath.documentId(), '==', schoolId)
        .select('attendance')
        .get();

      if (!querySnap.empty) {
        rootAttendance = Array.isArray(querySnap.docs[0].data()?.attendance) ? querySnap.docs[0].data().attendance : [];
      } else {
        const rootDoc = await db.collection('tenant_data').doc(schoolId).get();
        if (rootDoc.exists) {
          rootAttendance = Array.isArray(rootDoc.data()?.attendance) ? rootDoc.data().attendance : [];
        }
      }

      const monthSet = new Set();
      rootAttendance.forEach(rec => {
        if (rec && rec.date && /^\d{4}-\d{2}/.test(rec.date)) {
          monthSet.add(rec.date.slice(0, 7));
        }
      });
      availableMonths = Array.from(monthSet);

      rootAttendance.forEach(session => {
        if (!session || !session.date || !session.date.startsWith(targetMonth)) return;

        const studentEntries = Array.isArray(session.records) ? session.records : [];
        const match = studentEntries.find(r => r && String(r.studentId) === String(studentId));
        if (match) {
          const st = String(match.status || 'absent').toLowerCase();
          if (st === 'present') presentDays++;
          else if (st === 'late') lateDays++;
          else absentDays++;

          daily.push({
            date: session.date,
            status: st
          });
        }
      });
    } catch (rootErr) {
      console.warn('[api/parents/attendance] Error querying root attendance:', rootErr.message);
    }
  }

  // Sort ascending by date
  daily.sort((a, b) => (a.date > b.date ? 1 : -1));

  const totalDays = daily.length;
  const effectivePresent = presentDays + lateDays;
  const percentage = totalDays > 0 ? Math.round((effectivePresent / totalDays) * 100) : 0;

  if (!availableMonths.includes(targetMonth)) {
    availableMonths.push(targetMonth);
  }
  availableMonths.sort().reverse();

  return res.status(200).json({
    success: true,
    month: targetMonth,
    totalDays,
    presentDays,
    absentDays,
    lateDays,
    percentage,
    daily,
    availableMonths
  });
}

module.exports = { handleAttendance };
