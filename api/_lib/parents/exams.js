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

  // Safety Check: If no marks exist for student, return hasResult: false
  if (!markEntry.marks || Object.keys(markEntry.marks).length === 0) {
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

  // 4. Resolve Effective Grading Scale with exact admin precedence
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

  // 5. Summary resolution (FIX 1 & FIX 3):
  // If the mark entry has stored aggregates, return those unchanged, identical to the admin Results tab.
  // Recompute ONLY when stored aggregates are missing.
  const hasStoredTotal = markEntry.total !== undefined && markEntry.total !== null;
  const hasStoredMaxTotal = markEntry.maxTotal !== undefined && markEntry.maxTotal !== null;
  const hasStoredPercentage = markEntry.percentage !== undefined && markEntry.percentage !== null;
  const hasStoredGrade = markEntry.grade !== undefined && markEntry.grade !== null && String(markEntry.grade).trim() !== '';
  const hasStoredResult = markEntry.result !== undefined && markEntry.result !== null && String(markEntry.result).trim() !== '';

  const hasCompleteStoredAggregates = hasStoredTotal && hasStoredMaxTotal && hasStoredPercentage && hasStoredGrade && hasStoredResult;

  let summary = null;

  if (hasCompleteStoredAggregates) {
    summary = {
      totalObtained: markEntry.total,
      maxTotal: markEntry.maxTotal,
      passTotal: markEntry.passTotal !== undefined ? markEntry.passTotal : null,
      percentage: markEntry.percentage,
      displayPercentage: markEntry.displayPercentage || (markEntry.percentage + '%'),
      grade: markEntry.grade,
      gradeLabel: markEntry.gradeLabel || (markEntry.gradeObj && markEntry.gradeObj.label) || '',
      division: markEntry.division || '',
      result: markEntry.result,
      isComplete: markEntry.isComplete !== undefined ? markEntry.isComplete : (markEntry.maxTotal > 0),
      rank: (markEntry.rank !== undefined && markEntry.rank !== null) ? markEntry.rank : null
    };
  } else {
    // Recompute only when stored aggregates are missing
    if (subjects.length === 0) {
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

    const entryClone = JSON.parse(JSON.stringify(markEntry));
    const calcResult = ExamCalculationEngine.recalculateStudentEntry(
      entryClone,
      subjects,
      term,
      rootData.reportCardConfig || {},
      effectiveGradingScale
    );

    // If computed maxTotal <= 0 (no subjects marked), return hasResult: false
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

    // FIX 3: If the summary is recomputed AND it differs from the stored values (the stored values exist only partly),
    // return hasResult:false "Result not available yet" instead of a number the admin does not show.
    const hasPartialStoredValues = hasStoredTotal || hasStoredMaxTotal || hasStoredPercentage || hasStoredGrade || hasStoredResult;
    if (hasPartialStoredValues) {
      const differs =
        (hasStoredTotal && Number(markEntry.total) !== Number(calcResult.total)) ||
        (hasStoredMaxTotal && Number(markEntry.maxTotal) !== Number(calcResult.maxTotal)) ||
        (hasStoredPercentage && Math.round(Number(markEntry.percentage)) !== Math.round(Number(calcResult.percentage))) ||
        (hasStoredGrade && String(markEntry.grade).trim().toLowerCase() !== String(calcResult.grade).trim().toLowerCase()) ||
        (hasStoredResult && String(markEntry.result).trim().toLowerCase() !== String(calcResult.result).trim().toLowerCase());

      if (differs) {
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
    }

    summary = {
      totalObtained: calcResult.total,
      maxTotal: calcResult.maxTotal,
      passTotal: calcResult.passTotal !== undefined ? calcResult.passTotal : null,
      percentage: calcResult.percentage,
      displayPercentage: calcResult.displayPercentage || (calcResult.percentage + '%'),
      grade: calcResult.grade,
      gradeLabel: calcResult.gradeLabel || '',
      division: calcResult.division || '',
      result: calcResult.result,
      isComplete: calcResult.isComplete !== undefined ? calcResult.isComplete : (calcResult.maxTotal > 0),
      rank: (markEntry.rank !== undefined && markEntry.rank !== null) ? markEntry.rank : null
    };
  }

  // 6. Build Subject-Wise Marks Breakdown (FIX 2)
  const markedMap = markEntry.marks || {};
  const seenSubIds = new Set();
  const subjectBreakdown = [];

  function normName(n) {
    return String(n || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function resolveSubjectName(markSubId) {
    let resolvedSubject = null;
    const termSubs = (rootData.examSubjects && rootData.examSubjects[termId]) || {};
    for (const cKey of Object.keys(termSubs)) {
      const list = (termSubs[cKey] && Array.isArray(termSubs[cKey].subjects)) ? termSubs[cKey].subjects : [];
      const found = list.find(s => s && s.id === markSubId);
      if (found) { resolvedSubject = found; break; }
    }
    if (!resolvedSubject && rootData.examSubjects) {
      for (const tId of Object.keys(rootData.examSubjects)) {
        for (const cKey of Object.keys(rootData.examSubjects[tId] || {})) {
          const list = (rootData.examSubjects[tId][cKey] && Array.isArray(rootData.examSubjects[tId][cKey].subjects)) ? rootData.examSubjects[tId][cKey].subjects : [];
          const found = list.find(s => s && s.id === markSubId);
          if (found) { resolvedSubject = found; break; }
        }
        if (resolvedSubject) break;
      }
    }

    let subjectName = null;
    if (resolvedSubject && resolvedSubject.name) {
      subjectName = resolvedSubject.name;
    } else {
      const schoolSubjects = (rootData.settings && Array.isArray(rootData.settings.subjects))
        ? rootData.settings.subjects
        : (Array.isArray(rootData.subjects) ? rootData.subjects : []);

      const objMatch = schoolSubjects.find(s => typeof s === 'object' && s && (s.id === markSubId || s.name === markSubId));
      if (objMatch) {
        subjectName = objMatch.name || objMatch.id;
      } else {
        const cleanId = markSubId.replace(/^sub(j)?_/, '').toLowerCase();
        const strMatch = schoolSubjects.find(s => {
          if (typeof s !== 'string') return false;
          const cleanS = s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          return cleanS === cleanId.replace(/[^a-z0-9]/g, '');
        });
        if (strMatch) {
          subjectName = strMatch;
        } else {
          const tokens = cleanId.split('_').filter(Boolean);
          const confMatch = subjects.find(cs => {
            if (!cs || !cs.name) return false;
            const csNorm = cs.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            return tokens.length > 0 && tokens.every(tok => csNorm.includes(tok));
          });
          if (confMatch) {
            subjectName = confMatch.name;
          }
        }
      }
    }

    return { name: subjectName || 'Subject', resolvedSubject };
  }

  function computeSubjectGrade(numericObtained, fullMarks, passMarks, isAbsent, isExempted) {
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
    return { grade: gradeObj.grade, percentage: subPct !== null ? Math.round(subPct) : null };
  }

  // A. Configured subjects for the class
  subjects.forEach(sub => {
    seenSubIds.add(sub.id);
    let sm = markedMap[sub.id];

    // If no mark under configured id, merge orphan mark whose resolved subject NAME matches
    if (!sm) {
      for (const [orphanId, orphanSm] of Object.entries(markedMap)) {
        if (!seenSubIds.has(orphanId)) {
          const resObj = resolveSubjectName(orphanId);
          if (normName(resObj.name) === normName(sub.name)) {
            sm = orphanSm;
            seenSubIds.add(orphanId); // merged into this row, prevent duplicate row
            break;
          }
        }
      }
    }

    const isAbsent = !!(sm && sm.isAbsent);
    const isExempted = !!(sm && sm.isExempted);
    const fullMarks = Number(sub.fullMarks) || (sm && Number(sm.fullMarks)) || 100;
    const passMarks = (sub.passMarks !== undefined && sub.passMarks !== null)
      ? Number(sub.passMarks)
      : (sm && sm.passMarks !== undefined && sm.passMarks !== null ? Number(sm.passMarks) : Math.round(fullMarks * 0.33));

    let obtainedDisplay = '—';
    let numericObtained = null;
    let isPass = null;
    let isNotEntered = false;

    if (sm) {
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
      } else {
        isNotEntered = true;
      }
    } else {
      isNotEntered = true;
    }

    const { grade, percentage } = computeSubjectGrade(numericObtained, fullMarks, passMarks, isAbsent, isExempted);

    subjectBreakdown.push({
      id: sub.id,
      name: sub.name,
      code: sub.code || '',
      type: sub.type || 'core',
      isOptional: !!sub.isOptional,
      fullMarks: fullMarks,
      passMarks: passMarks,
      obtained: obtainedDisplay,
      percentage: percentage,
      grade: grade,
      isPass: isPass,
      isAbsent: isAbsent,
      isExempted: isExempted,
      isNotEntered: isNotEntered
    });
  });

  // B. Never drop a marked subject: add marked subjects not in class's configured subjects
  for (const [markSubId, sm] of Object.entries(markedMap)) {
    if (seenSubIds.has(markSubId)) continue;
    seenSubIds.add(markSubId);

    const { name: subjectName, resolvedSubject } = resolveSubjectName(markSubId);

    const fullMarks = (resolvedSubject && Number(resolvedSubject.fullMarks)) ||
                      (sm && sm.fullMarks !== undefined && sm.fullMarks !== null ? Number(sm.fullMarks) : 100);
    const passMarks = (resolvedSubject && resolvedSubject.passMarks !== undefined && resolvedSubject.passMarks !== null ? Number(resolvedSubject.passMarks) : null) ||
                      (sm && sm.passMarks !== undefined && sm.passMarks !== null ? Number(sm.passMarks) : Math.round(fullMarks * 0.33));

    const isAbsent = !!(sm && sm.isAbsent);
    const isExempted = !!(sm && sm.isExempted);
    let numericObtained = null;
    let obtainedDisplay = '—';
    let isPass = null;
    let isNotEntered = false;

    if (isAbsent) {
      obtainedDisplay = 'AB';
      isPass = false;
    } else if (isExempted) {
      obtainedDisplay = 'EX';
      isPass = true;
    } else if (sm && sm.obtained !== undefined && sm.obtained !== null && String(sm.obtained).trim() !== '') {
      numericObtained = parseFloat(sm.obtained) || 0;
      obtainedDisplay = numericObtained.toString();
      isPass = numericObtained >= passMarks;
    } else {
      isNotEntered = true;
    }

    const { grade, percentage } = computeSubjectGrade(numericObtained, fullMarks, passMarks, isAbsent, isExempted);

    subjectBreakdown.push({
      id: markSubId,
      name: subjectName,
      code: (resolvedSubject && resolvedSubject.code) || '',
      type: (resolvedSubject && resolvedSubject.type) || 'core',
      isOptional: !!(resolvedSubject && resolvedSubject.isOptional),
      fullMarks: fullMarks,
      passMarks: passMarks,
      obtained: obtainedDisplay,
      percentage: percentage,
      grade: grade,
      isPass: isPass,
      isAbsent: isAbsent,
      isExempted: isExempted,
      isNotEntered: isNotEntered
    });
  }

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
    summary: summary
  });
}

module.exports = {
  handleExamsList,
  handleExamResult
};
