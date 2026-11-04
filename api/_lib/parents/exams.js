'use strict';

/**
 * api/_lib/parents/exams.js
 * 
 * Handles:
 *   - action 'exams': Lists exam terms where showResultsToParents === true.
 *   - action 'exam-result': Computes and returns the single student's subject-wise marks,
 *     totals, percentage, grade, division, and rank using the version-aware ExamCalculationEngine.
 */

const admin = require('firebase-admin');
const { authenticateParentRequest } = require('./auth');
const { getDb } = require('../firebase-admin');
const ExamCalculationEngine = require('../exam-engine');
const { normalizeClassName, normalizeSectionName } = require('../class-normalizer');
const { resolveIsRestructured } = require('./restructured-helper');
const { loadStudentExamMarks } = require('./marks-loader');

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

  // 2. Resolve restructuring status and load student marks (FIX 1)
  const isRestructured = await resolveIsRestructured(schoolId, portalConfig, db);
  const markEntry = await loadStudentExamMarks({
    db,
    schoolId,
    termId,
    student,
    isRestructured,
    rootExamMarks: rootData.examMarks
  });

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

  // 3. Resolve Mapped Subjects for Student's Class using normalized class matching
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

  // Safety Check (FIX 5): If inputs are missing/cannot be computed, return hasResult: false
  if (subjects.length === 0 || !markEntry.marks || Object.keys(markEntry.marks).length === 0) {
    return res.status(200).json({
      success: true,
      hasResult: false,
      term: {
        id: term.id,
        name: term.name,
        shortName: term.shortName,
        isFinal: !!term.isFinal
      },
      message: 'Result not available yet'
    });
  }

  // 4. Resolve Effective Grading Scale with exact admin precedence (FIX 3)
  const isV2 = term && term.rulesVersion === 'v2';
  let effectiveGradingScale = null;

  if (isV2) {
    // V2 rules: reportCardConfig.gradingScale has precedence (mirrors js/exams.js:1787-1788)
    const rcConfig = rootData.reportCardConfig || {};
    effectiveGradingScale = (Array.isArray(rcConfig.gradingScale) && rcConfig.gradingScale.length > 0)
      ? rcConfig.gradingScale
      : ((rootData.examConfig && Array.isArray(rootData.examConfig.gradingScale) && rootData.examConfig.gradingScale.length > 0)
        ? rootData.examConfig.gradingScale
        : ((rootData.settings && rootData.settings.examConfig && Array.isArray(rootData.settings.examConfig.gradingScale))
          ? rootData.settings.examConfig.gradingScale
          : null));
  } else {
    // Legacy rules: examConfig.gradingScale has precedence (mirrors js/exams.js:2027)
    effectiveGradingScale = (rootData.examConfig && Array.isArray(rootData.examConfig.gradingScale) && rootData.examConfig.gradingScale.length > 0)
      ? rootData.examConfig.gradingScale
      : ((rootData.settings && rootData.settings.examConfig && Array.isArray(rootData.settings.examConfig.gradingScale) && rootData.settings.examConfig.gradingScale.length > 0)
        ? rootData.settings.examConfig.gradingScale
        : ((rootData.reportCardConfig && Array.isArray(rootData.reportCardConfig.gradingScale) && rootData.reportCardConfig.gradingScale.length > 0)
          ? rootData.reportCardConfig.gradingScale
          : null));
  }

  // 5. Version-aware calculation (FIX 2)
  const entryClone = JSON.parse(JSON.stringify(markEntry));
  const calcResult = ExamCalculationEngine.recalculateStudentEntry(
    entryClone,
    subjects,
    term,
    rootData.reportCardConfig || {},
    effectiveGradingScale
  );

  // Safety Check (FIX 5): If computed maxTotal <= 0 (no subjects marked), return hasResult: false
  if (calcResult.maxTotal <= 0) {
    return res.status(200).json({
      success: true,
      hasResult: false,
      term: {
        id: term.id,
        name: term.name,
        shortName: term.shortName,
        isFinal: !!term.isFinal
      },
      message: 'Result not available yet'
    });
  }

  // 6. Build Subject-Wise Marks Breakdown using same effective grading scale (FIX 3)
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
    let gradeObj = { grade: '—' };
    if (subPct !== null) {
      if (isV2) {
        gradeObj = ExamCalculationEngine.calculateGrade(subPct, effectiveGradingScale);
      } else {
        gradeObj = ExamCalculationEngine.legacyCalculateGrade(Math.round(subPct), effectiveGradingScale);
        if (!isAbsent && !isExempted && numericObtained !== null && numericObtained >= passMarks && gradeObj.grade === 'F') {
          gradeObj = { grade: 'D', label: 'Pass' };
        }
      }
    }

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
      passTotal: calcResult.passTotal !== undefined ? calcResult.passTotal : null,
      percentage: calcResult.percentage,
      displayPercentage: calcResult.displayPercentage || (calcResult.percentage + '%'),
      grade: calcResult.grade,
      gradeLabel: calcResult.gradeLabel,
      division: calcResult.division,
      result: calcResult.result,
      isComplete: calcResult.isComplete !== undefined ? calcResult.isComplete : (calcResult.maxTotal > 0),
      rank: (markEntry.rank !== undefined && markEntry.rank !== null) ? markEntry.rank : null
    }
  });
}

module.exports = {
  handleExamsList,
  handleExamResult
};
