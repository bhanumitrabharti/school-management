'use strict';

/**
 * api/_lib/parents/marks-loader.js
 * 
 * Server-side marks loader with exact parity to the ERP Admin:
 * Mirrors:
 *   - SchoolApp.loadExamMarksTerm (js/app.js:2302-2395)
 *   - getStudentExamMarks (js/exams.js:2015-2023)
 * 
 * Precedence and merge rules:
 *   1. Non-restructured schools:
 *      Reads subcollection exam_marks/{termId} if present; falls back to root examMarks.{termId}.
 *   2. Restructured schools:
 *      Dual-read: reads subcollection exam_marks/{termId} and root examMarks.{termId}.
 *      Merges per-student: root marks seeded first, subcollection marks win for overlapping students.
 *   3. Student entry lookup:
 *      Resolves [classKey][sectionKey][studentId] using normalized class and section matching
 *      (e.g., handles "Class 4" vs "4", and "A" vs "a").
 */

const { normalizeClassName, normalizeSectionName } = require('../class-normalizer');

async function loadStudentExamMarks({ db, schoolId, termId, student, isRestructured, rootExamMarks }) {
  if (!db || !schoolId || !termId || !student) return null;

  const studentId = student.id;
  const studentClass = String(student.class || '').trim();
  const studentSection = String(student.section || '').trim();
  const normClass = normalizeClassName(studentClass);
  const normSection = normalizeSectionName(studentSection);

  // 1. Fetch subcollection exam_marks/{termId}
  let subData = null;
  try {
    const subDocRef = db.collection('tenant_data').doc(schoolId).collection('exam_marks').doc(termId);
    const subSnap = await subDocRef.get();
    if (subSnap.exists) {
      subData = subSnap.data() || {};
    }
  } catch (err) {
    console.warn('[marks-loader] Error reading subcollection exam_marks/' + termId + ':', err.message);
  }

  // 2. Resolve root examMarks for term
  let rootTermData = null;
  if (rootExamMarks && typeof rootExamMarks === 'object') {
    rootTermData = rootExamMarks[termId] || null;
  } else {
    try {
      const rootDocRef = db.collection('tenant_data').doc(schoolId);
      const rootSnap = await rootDocRef.get();
      if (rootSnap.exists) {
        const rootDocData = rootSnap.data() || {};
        rootTermData = (rootDocData.examMarks && rootDocData.examMarks[termId]) || null;
      }
    } catch (err) {
      console.warn('[marks-loader] Error reading root examMarks for ' + termId + ':', err.message);
    }
  }

  // 3. Merge sources matching js/app.js:2357-2389
  let mergedTermMarks = {};
  if (!isRestructured) {
    // Non-restructured: subcollection wins if present, else fallback to root
    if (subData && Object.keys(subData).length > 0) {
      mergedTermMarks = subData;
    } else if (rootTermData) {
      mergedTermMarks = rootTermData;
    }
  } else {
    // Restructured: dual-read with per-student merge (subcollection wins for overlapping students)
    if (subData && Object.keys(subData).length > 0 && rootTermData && Object.keys(rootTermData).length > 0) {
      const allClasses = {};
      Object.keys(rootTermData).forEach(c => { allClasses[c] = true; });
      Object.keys(subData).forEach(c => { allClasses[c] = true; });

      Object.keys(allClasses).forEach(c => {
        mergedTermMarks[c] = {};
        const allSecs = {};
        if (rootTermData[c]) Object.keys(rootTermData[c]).forEach(s => { allSecs[s] = true; });
        if (subData[c]) Object.keys(subData[c]).forEach(s => { allSecs[s] = true; });

        Object.keys(allSecs).forEach(s => {
          mergedTermMarks[c][s] = {};
          const rootStudents = (rootTermData[c] && rootTermData[c][s]) || {};
          const subStudents = (subData[c] && subData[c][s]) || {};

          // Seed root students
          Object.keys(rootStudents).forEach(stuId => {
            mergedTermMarks[c][s][stuId] = rootStudents[stuId];
          });
          // Subcollection overwrites overlapping students
          Object.keys(subStudents).forEach(stuId => {
            mergedTermMarks[c][s][stuId] = subStudents[stuId];
          });
        });
      });
    } else if (subData) {
      mergedTermMarks = subData;
    } else if (rootTermData) {
      mergedTermMarks = rootTermData;
    }
  }

  // 4. Locate student entry using normalized class and section matching (mirrors getStudentExamMarks)
  let matchingClassMarks = null;
  for (const cKey of Object.keys(mergedTermMarks)) {
    if (normalizeClassName(cKey) === normClass) {
      matchingClassMarks = mergedTermMarks[cKey];
      break;
    }
  }
  if (!matchingClassMarks || typeof matchingClassMarks !== 'object') return null;

  let matchingSecMarks = null;
  for (const sKey of Object.keys(matchingClassMarks)) {
    if (normalizeSectionName(sKey) === normSection) {
      matchingSecMarks = matchingClassMarks[sKey];
      break;
    }
  }
  if (!matchingSecMarks || typeof matchingSecMarks !== 'object') return null;

  return matchingSecMarks[studentId] || null;
}

module.exports = {
  loadStudentExamMarks
};
