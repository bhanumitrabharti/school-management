const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const backupDir = path.resolve(__dirname, '..', 'backups', 'full');
const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json') && !f.startsWith('_project_'));

console.log('=== VERIFYING FULL BACKUP FILES FROM DISK ===\n');

const results = [];

files.forEach(file => {
  const filePath = path.join(backupDir, file);
  const raw = fs.readFileSync(filePath, 'utf8');
  const stat = fs.statSync(filePath);
  const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
  const parsed = JSON.parse(raw);

  const schoolId = parsed.metadata.schoolId;
  const rootData = parsed.rootDoc;
  const subcollections = parsed.subcollections || {};

  const studentsCount = (rootData && Array.isArray(rootData.students)) ? rootData.students.length : 0;
  const teachersCount = (rootData && Array.isArray(rootData.teachers)) ? rootData.teachers.length : 0;

  const subCollsFound = Object.keys(subcollections);

  // Attendance count
  let attendanceDocCount = 0;
  let attendanceRecordCount = 0;
  if (subcollections.attendance_months) {
    for (const mDoc of subcollections.attendance_months) {
      if (mDoc.subcollections && mDoc.subcollections.classes) {
        for (const cDoc of mDoc.subcollections.classes) {
          attendanceDocCount++;
          if (cDoc.data && Array.isArray(cDoc.data.records)) {
            attendanceRecordCount += cDoc.data.records.length;
          }
        }
      }
    }
  }
  if (rootData && Array.isArray(rootData.attendance) && rootData.attendance.length > 0) {
    attendanceRecordCount += rootData.attendance.length;
  }

  // Fees count
  let feeTxnCount = 0;
  let feeTotalAmount = 0;
  if (subcollections.fees_years) {
    for (const yDoc of subcollections.fees_years) {
      if (yDoc.subcollections && yDoc.subcollections.months) {
        for (const mDoc of yDoc.subcollections.months) {
          if (mDoc.data && Array.isArray(mDoc.data.transactions)) {
            feeTxnCount += mDoc.data.transactions.length;
            for (const t of mDoc.data.transactions) {
              const amt = Number(t.amount || t.paidAmount || 0);
              if (!isNaN(amt)) feeTotalAmount += amt;
            }
          }
        }
      }
    }
  }
  if (rootData && Array.isArray(rootData.fees) && rootData.fees.length > 0) {
    feeTxnCount += rootData.fees.length;
    for (const t of rootData.fees) {
      const amt = Number(t.amount || t.paidAmount || 0);
      if (!isNaN(amt)) feeTotalAmount += amt;
    }
  }

  // Exam marks
  let examMarkEntries = 0;
  if (subcollections.exam_marks) {
    for (const eDoc of subcollections.exam_marks) {
      if (eDoc.data) {
        examMarkEntries += Object.keys(eDoc.data).length;
      }
    }
  }
  if (rootData && rootData.examMarks) {
    examMarkEntries += Object.keys(rootData.examMarks).length;
  }

  results.push({
    schoolId,
    file,
    fileBytes: stat.size,
    sha256,
    studentsCount,
    teachersCount,
    subCollsFound,
    attendanceDocCount,
    attendanceRecordCount,
    feeTxnCount,
    feeTotalAmount,
    examMarkEntries
  });
});

console.log(JSON.stringify(results, null, 2));
