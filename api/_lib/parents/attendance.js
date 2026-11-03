'use strict';

/**
 * api/_lib/parents/attendance.js
 * 
 * Handles action: 'attendance'
 * Returns monthly attendance status, totals, and percentage for the single requested student.
 */

const { authenticateParentRequest } = require('./auth');
const { getDb } = require('../firebase-admin');

async function handleAttendance(req, res) {
  const authRes = await authenticateParentRequest(req, res, 'attendance');
  if (!authRes.authorized) return;

  const { student, schoolId, studentId } = authRes;
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
  const studentSection = String(student.section || '').trim();

  let daily = [];
  let presentDays = 0;
  let absentDays = 0;
  let lateDays = 0;

  // 1. Check Subcollection Path: tenant_data/{schoolId}/attendance_months/{month}/classes/{classId}
  if (studentClass) {
    try {
      const classDocRef = db.collection('tenant_data')
        .doc(schoolId)
        .collection('attendance_months')
        .doc(targetMonth)
        .collection('classes')
        .doc(studentClass);

      const classDocSnap = await classDocRef.get();
      if (classDocSnap.exists) {
        const classData = classDocSnap.data() || {};
        const records = Array.isArray(classData.records) ? classData.records : [];

        records.forEach(session => {
          if (!session || !session.date) return;
          if (studentSection && session.section && session.section !== studentSection) return;

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
      }
    } catch (subErr) {
      console.warn('[api/parents/attendance] Error querying subcollection:', subErr.message);
    }
  }



  // Sort ascending by date
  daily.sort((a, b) => (a.date > b.date ? 1 : -1));

  const totalDays = daily.length;
  const effectivePresent = presentDays + lateDays;
  const percentage = totalDays > 0 ? Math.round((effectivePresent / totalDays) * 100) : 0;

  // Retrieve available months list
  let availableMonths = [];
  try {
    const monthsCol = db.collection('tenant_data').doc(schoolId).collection('attendance_months');
    const monthsSnap = await monthsCol.listDocuments();
    availableMonths = monthsSnap.map(d => d.id).filter(id => /^\d{4}-\d{2}$/.test(id));
  } catch (_) {}

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
