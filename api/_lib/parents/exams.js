'use strict';

/**
 * api/_lib/parents/exams.js
 * 
 * Handles:
 *   - action 'exams': Lists exam terms where showResultsToParents === true.
 *   - action 'exam-result': Computes and returns the single student's subject-wise marks,
 *     totals, percentage, grade, division, and rank using the pure ExamCalculationEngine.
 */

const admin = require('firebase-admin');
const { authenticateParentRequest } = require('./auth');
const { getDb } = require('../firebase-admin');
const ExamCalculationEngine = require('../exam-engine');
const { normalizeClassName, normalizeSectionName } = require('../class-normalizer');
const { resolveIsRestructured } = require('./restructured-helper');

async function handleExamsList(req, res) {
  const authRes = await authenticateParentRequest(req, res, 'exams');
  if (!authRes.authorized) return;

  const { schoolId } = authRes;
  const db = getDb();

  // Field-masked projection read for examTerms to avoid downloading entire root doc
  let examTerms = {};
  try {
    const termQuery = await db.collection('tenant_data')
      .where(admin.firestore.FieldPath.documentId(), '==', schoolId)
      .select('examTerms')
      .get();

    if (!termQuery.empty) {
      examTerms = termQuery.docs[0].data()?.examTerms || {};
    } else {
      const rootSnap = await db.collection('tenant_data').doc(schoolId).get();
      if (!rootSnap.exists) {
        return res.status(404).json({ error: 'School data not found.' });
      }
      examTerms = rootSnap.data()?.examTerms || {};
    }
  } catch (_) {
    const rootSnap = await db.collection('tenant_data').doc(schoolId).get();
    if (!rootSnap.exists) {
      return res.status(404).json({ error: 'School data not found.' });
    }
    examTerms = rootSnap.data()?.examTerms || {};
  }

  // Filter terms where showResultsToParents is explicitly true
  const visibleTerms = Object.values(examTerms)
    .filter(t => t && t.showResultsToParents === true)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map(t => ({
      id: t.id,
      name: t.name || 'Examination Term',
      shortName: t.shortName || '',
      session: t.session || '',
      startDate: t.startDate || '',
      endDate: t.endDate || '',
      examType: t.examType || 'main',
      isFinal: !!t.isFinal,
      status: t.status || 'published'
    }));

  return res.status(200).json({
    success: true,
    terms: visibleTerms
  });
}

async function handleExamResult(req, res) {
  const authRes = await authenticateParentRequest(req, res, 'exams');
  if (!authRes.authorized) return;

  const { student, schoolId, studentId, portalConfig } = authRes;
  const db = getDb();

  const query = req.query || {};
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const termId = String(body.termId || query.termId || '').trim();

  if (!termId) {
    return res.status(400).json({ error: 'Missing termId parameter.' });
  }

  // 1. Fetch Root Doc for Term Configuration, Grading Scale, and Subjects
  const rootDocRef = db.collection('tenant_data').doc(schoolId);
  const rootSnap = await rootDocRef.get();
  if (!rootSnap.exists) {
    return res.status(404).json({ error: 'School data not found.' });
  }

  const rootData = rootSnap.data() || {};
  const examTerms = rootData.examTerms || {};
  const term = examTerms[termId];

  if (!term) {
    return res.status(404).json({ error: 'Examination term not found.' });
  }

  // Assert term visibility to parents
  if (term.showResultsToParents !== true) {
    return res.status(403).json({ error: 'Results for this examination term are not published to parents.' });
  }

  // 2. Resolve Mapped Subjects for Student's Class using normalized class matching
  const studentClass = String(student.class || '').trim();
  const studentSection = String(student.section || '').trim();
  const normClass = normalizeClassName(studentClass);
  const normSection = normalizeSectionName(studentSection);

  const termSubjectsMap = (rootData.examSubjects && rootData.examSubjects[termId]) || {};
  let subjectsObj = null;
  for (const cKey of Object.keys(termSubjectsMap)) {
    if (normalizeClassName(cKey) === normClass) {
      subjectsObj = termSubjectsMap[cKey];
      break;
    }
  }
  const subjects = (subjectsObj && Array.isArray(subjectsObj.subjects)) ? subjectsObj.subjects : [];

  // Helper: Find student mark entry by normalized class and section matching
  function findMarkEntryInMap(marksMap) {
    if (!marksMap || typeof marksMap !== 'object') return null;
    let matchingClassMarks = null;
    for (const cKey of Object.keys(marksMap)) {
      if (normalizeClassName(cKey) === normClass) {
        matchingClassMarks = marksMap[cKey];
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

  // 3. Retrieve Student Mark Entry
  let markEntry = null;

  // Subcollection Path: tenant_data/{schoolId}/exam_marks/{termId}
  try {
    const markDocRef = db.collection('tenant_data').doc(schoolId).collection('exam_marks').doc(termId);
    const markSnap = await markDocRef.get();
    if (markSnap.exists) {
      markEntry = findMarkEntryInMap(markSnap.data());
    }
  } catch (err) {
    console.warn('[api/parents/exams] Error fetching subcollection marks:', err.message);
  }

  // Legacy root fallback ONLY for non-restructured schools (resolved via shared helper)
  const isRestructured = await resolveIsRestructured(schoolId, portalConfig, db);
  if (!markEntry && !isRestructured && rootData.examMarks && rootData.examMarks[termId]) {
    markEntry = findMarkEntryInMap(rootData.examMarks[termId]);
  }

  if (!markEntry) {
    return res.status(200).json({
      success: true,
      hasResult: false,
      term: {
        id: term.id,
        name: term.name,
        shortName: term.shortName,
        isFinal: !!term.isFinal
      },
      message: 'Examination results for this student have not been finalized yet.'
    });
  }

  // 4. Calculate Results using Pure ExamCalculationEngine
  const schoolConfig = Object.assign({}, rootData.reportCardConfig || {});
  const effectiveGradingScale = (Array.isArray(schoolConfig.gradingScale) && schoolConfig.gradingScale.length > 0)
    ? schoolConfig.gradingScale
    : ((rootData.examConfig && Array.isArray(rootData.examConfig.gradingScale) && rootData.examConfig.gradingScale.length > 0)
      ? rootData.examConfig.gradingScale
      : ((rootData.settings && rootData.settings.examConfig && Array.isArray(rootData.settings.examConfig.gradingScale) && rootData.settings.examConfig.gradingScale.length > 0)
        ? rootData.settings.examConfig.gradingScale
        : null));

  if (effectiveGradingScale) {
    schoolConfig.gradingScale = effectiveGradingScale;
  }

  const calcResult = ExamCalculationEngine.calculateStudentResult({
    marks: markEntry.marks || {},
    subjects: subjects,
    term: term,
    schoolConfig: schoolConfig
  });

  // 5. Build Subject-Wise Marks Breakdown
  const subjectBreakdown = subjects.map(sub => {
    const sm = (markEntry.marks && markEntry.marks[sub.id]) || {};
    const isAbsent = !!sm.isAbsent;
    const isExempted = !!sm.isExempted;
    const fullMarks = Number(sub.fullMarks) || 100;
    const passMarks = (sub.passMarks !== undefined && sub.passMarks !== null) ? Number(sub.passMarks) : Math.round(fullMarks * 0.33);

    let obtainedDisplay = '—';
    let numericObtained = null;
    let isPass = true;

    if (isAbsent) {
      obtainedDisplay = 'AB';
      isPass = false;
    } else if (isExempted) {
      obtainedDisplay = 'EX';
      isPass = true;
    } else if (sm.obtained !== undefined && sm.obtained !== null && String(sm.obtained).trim() !== '') {
      numericObtained = parseFloat(sm.obtained) || 0;
      obtainedDisplay = numericObtained.toString();
      isPass = numericObtained >= passMarks;
    }

    const subPct = (numericObtained !== null && fullMarks > 0) ? (numericObtained / fullMarks) * 100 : null;
    const gradeObj = subPct !== null ? ExamCalculationEngine.calculateGrade(subPct, schoolConfig.gradingScale) : { grade: '—' };

    return {
      id: sub.id,
      name: sub.name,
      code: sub.code || '',
      type: sub.type || 'core',
      isOptional: !!sub.isOptional,
      fullMarks: fullMarks,
      passMarks: passMarks,
      obtained: obtainedDisplay,
      grade: gradeObj.grade,
      isPass: isPass,
      isAbsent: isAbsent,
      isExempted: isExempted
    };
  });

  return res.status(200).json({
    success: true,
    hasResult: true,
    term: {
      id: term.id,
      name: term.name,
      shortName: term.shortName,
      session: term.session || '',
      isFinal: !!term.isFinal
    },
    subjects: subjectBreakdown,
    summary: {
      totalObtained: calcResult.total,
      maxTotal: calcResult.maxTotal,
      passTotal: calcResult.passTotal,
      percentage: calcResult.percentage,
      displayPercentage: calcResult.displayPercentage,
      grade: calcResult.grade,
      gradeLabel: calcResult.gradeLabel,
      division: calcResult.division,
      result: calcResult.result,
      isComplete: calcResult.isComplete,
      rank: (markEntry.rank !== undefined && markEntry.rank !== null) ? markEntry.rank : null
    }
  });
}

module.exports = {
  handleExamsList,
  handleExamResult
};
