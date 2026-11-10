'use strict';

/**
 * api/_lib/parents/timetable.js
 * 
 * Handles action: 'timetable'
 * Returns the weekly timetable schedule for the requested student's class-section,
 * with resolved period timings and teacher names.
 */

const { authenticateParentRequest } = require('./auth');
const { getDb } = require('../firebase-admin');

async function handleTimetable(req, res) {
  const authRes = await authenticateParentRequest(req, res, 'timetable');
  if (!authRes.authorized) return;

  const { student, schoolId } = authRes;
  const db = getDb();

  const studentClass = String(student.class || '').trim();
  const studentSection = String(student.section || '').trim();

  const rootDocRef = db.collection('tenant_data').doc(schoolId);
  const rootSnap = await rootDocRef.get();
  if (!rootSnap.exists) {
    return res.status(404).json({ error: 'School data not found.' });
  }

  const rootData = rootSnap.data() || {};
  const allTimetable = rootData.timetable || {};
  const teachers = Array.isArray(rootData.teachers) ? rootData.teachers : [];

  // Build teacher lookup map: teacherId -> Display Name
  const teacherMap = new Map();
  teachers.forEach(t => {
    if (!t) return;
    const tid = t.id || t.teacherId;
    if (tid) {
      const name = t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim() || tid;
      teacherMap.set(String(tid), name);
    }
  });

  // Candidate keys: '5-A', 'Class 5-A', '5', 'Class 5'
  let classSchedule = null;
  const candidates = [
    `${studentClass}-${studentSection}`,
    `Class ${studentClass}-${studentSection}`,
    studentClass,
    `Class ${studentClass}`
  ];

  for (const cKey of candidates) {
    if (allTimetable[cKey]) {
      classSchedule = allTimetable[cKey];
      break;
    }
  }

  // Settings for period timings
  const ttSettings = (allTimetable && allTimetable.settings) || (rootData.settings && rootData.settings.timetable) || {};

  // Standardize the weekly schedule: Monday to Saturday
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const formattedSchedule = {};

  days.forEach(day => {
    const dayPeriods = (classSchedule && classSchedule[day]) || {};
    formattedSchedule[day] = {};

    Object.keys(dayPeriods).forEach(pNum => {
      const pData = dayPeriods[pNum];
      if (typeof pData === 'object' && pData !== null) {
        const teacherName = pData.teacherId ? (teacherMap.get(String(pData.teacherId)) || pData.teacherName || pData.teacherId) : '';
        formattedSchedule[day][pNum] = {
          subject: pData.subject || '',
          teacherName: teacherName
        };
      } else if (typeof pData === 'string') {
        formattedSchedule[day][pNum] = {
          subject: pData,
          teacherName: ''
        };
      }
    });
  });

  return res.status(200).json({
    success: true,
    class: studentClass,
    section: studentSection,
    schedule: formattedSchedule,
    settings: Object.assign({}, ttSettings, {
      totalPeriods: ttSettings.totalPeriods || 8,
      satTotalPeriods: ttSettings.satTotalPeriods || 6,
      periodTimes: ttSettings.periodTimes || {},
      startHour: ttSettings.startHour || 8,
      startTime: ttSettings.startTime || "08:00",
      endTime: ttSettings.endTime || "14:00",
      lunchAfterPeriod: ttSettings.lunchAfterPeriod !== undefined ? ttSettings.lunchAfterPeriod : 4,
      lunchDuration: ttSettings.lunchDuration !== undefined ? ttSettings.lunchDuration : 30,
      satStartTime: ttSettings.satStartTime || "08:00",
      satEndTime: ttSettings.satEndTime || "12:30",
      satLunchAfterPeriod: ttSettings.satLunchAfterPeriod !== undefined ? ttSettings.satLunchAfterPeriod : 0,
      satLunchDuration: ttSettings.satLunchDuration !== undefined ? ttSettings.satLunchDuration : 0
    })
  });
}

module.exports = { handleTimetable };
