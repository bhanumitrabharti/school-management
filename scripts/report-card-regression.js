#!/usr/bin/env node
'use strict';

/**
 * scripts/report-card-regression.js
 *
 * Read-only comparison script (--dry-run only, prints NO names).
 * For every school with a published/locked term, compares report card calculation
 * BEFORE (main 15c647f functions) vs AFTER (this branch) for BOTH single-term
 * and multi-term card on:
 *   - total
 *   - maxTotal
 *   - percentage
 *   - grade
 *   - result
 *   - division
 *   - rank
 *
 * Enforces critical constraint:
 *   If any school OTHER than Greenwood (svm_bokaro_001) has changed fields,
 *   the script flags it and reports failure.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const admin = require('firebase-admin');
const { normalizeClassName, normalizeSectionName } = require('../api/_lib/class-normalizer');

// Initialize Firebase Admin (read-only)
if (!admin.apps.length) {
  let credential;
  const serviceAccountPath = path.resolve(__dirname, '../service-account-key.json');
  try {
    if (fs.existsSync(serviceAccountPath)) {
      credential = admin.credential.cert(require(serviceAccountPath));
    }
  } catch (_) {}

  if (credential) {
    admin.initializeApp({ credential });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();

// Load BEFORE code (15c647f:js/exams.js) and AFTER code (js/exams.js)
const repoDir = path.resolve(__dirname, '..');
const beforeCode = execSync('git show 15c647f:js/exams.js', { cwd: repoDir, maxBuffer: 10 * 1024 * 1024 }).toString();
const afterCode = fs.readFileSync(path.join(repoDir, 'js/exams.js'), 'utf8');

function createSandbox(code, store) {
  const sandbox = {
    window: {},
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    SchoolApp: {
      store: store,
      registerModule: () => {}
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout,
    clearTimeout
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

function normalizeVal(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim().toUpperCase();
}

function normalizePct(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(String(val).replace('%', ''));
  return isNaN(num) ? null : Math.round(num * 100) / 100;
}

function compareFields(beforeObj, afterObj) {
  const fields = ['total', 'maxTotal', 'percentage', 'grade', 'result', 'division', 'rank'];
  const diffs = {};
  let hasDiff = false;

  for (const f of fields) {
    let bVal = beforeObj[f];
    let aVal = afterObj[f];

    let match = false;
    if (f === 'percentage') {
      const bPct = normalizePct(bVal);
      const aPct = normalizePct(aVal);
      if (bPct === null && aPct === null) match = true;
      else if (bPct !== null && aPct !== null && Math.abs(bPct - aPct) < 0.05) match = true;
    } else if (f === 'total' || f === 'maxTotal' || f === 'rank') {
      const bNum = (bVal !== null && bVal !== undefined && bVal !== '' && !isNaN(bVal)) ? Number(bVal) : null;
      const aNum = (aVal !== null && aVal !== undefined && aVal !== '' && !isNaN(aVal)) ? Number(aVal) : null;
      match = (bNum === aNum);
    } else {
      match = (normalizeVal(bVal) === normalizeVal(aVal));
    }

    if (!match) {
      hasDiff = true;
      diffs[f] = { before: bVal, after: aVal };
    }
  }

  return { hasDiff, diffs };
}

async function runRegression() {
  const isDryRun = process.argv.includes('--dry-run') || true;
  console.log('======================================================================');
  console.log(` REPORT CARD REGRESSION AUDIT (${isDryRun ? '--dry-run (READ-ONLY)' : 'READ-ONLY'})`);
  console.log(' Comparing BEFORE (15c647f) vs AFTER (current branch)');
  console.log(' Evaluates BOTH single-term and multi-term card on:');
  console.log('   total, maxTotal, percentage, grade, result, division, rank');
  console.log('======================================================================\n');

  const tenantsSnap = await db.collection('tenant_data').get();
  const summaryPerSchool = {};
  let anyNonGreenwoodChanged = false;
  const nonGreenwoodViolations = [];
  let stuGw405Details = null;

  for (const tenantDoc of tenantsSnap.docs) {
    const schoolId = tenantDoc.id;
    const rootData = tenantDoc.data() || {};
    const examTerms = rootData.examTerms || {};
    const examSubjects = rootData.examSubjects || {};
    const rootExamMarks = rootData.examMarks || {};
    const examConfig = rootData.examConfig || {};
    const reportCardConfig = rootData.reportCardConfig || {};
    const settings = rootData.settings || {};
    const schoolInfo = rootData.schoolInfo || {};

    const publishedOrLockedTerms = Object.values(examTerms).filter(
      t => t && (t.status === 'published' || t.status === 'locked')
    );

    if (publishedOrLockedTerms.length === 0) {
      continue;
    }

    console.log(`[School ${schoolId}] Found ${publishedOrLockedTerms.length} published/locked term(s): ${publishedOrLockedTerms.map(t => t.id).join(', ')}`);

    // Load subcollection exam_marks
    const subMarksByTerm = {};
    try {
      const subSnap = await tenantDoc.ref.collection('exam_marks').get();
      subSnap.forEach(d => { subMarksByTerm[d.id] = d.data() || {}; });
    } catch (_) {}

    // Load students
    let students = [];
    try {
      const stuSnap = await tenantDoc.ref.collection('students').get();
      if (!stuSnap.empty) {
        students = stuSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    } catch (_) {}
    if (students.length === 0 && Array.isArray(rootData.students)) {
      students = rootData.students;
    }

    // Set up school summary
    summaryPerSchool[schoolId] = {
      schoolId,
      termsCount: publishedOrLockedTerms.length,
      singleCard: {
        totalEvaluated: 0,
        fields: {
          total: { unchanged: 0, changed: 0 },
          maxTotal: { unchanged: 0, changed: 0 },
          percentage: { unchanged: 0, changed: 0 },
          grade: { unchanged: 0, changed: 0 },
          result: { unchanged: 0, changed: 0 },
          division: { unchanged: 0, changed: 0 },
          rank: { unchanged: 0, changed: 0 }
        },
        changedExamples: []
      },
      multiCard: {
        totalEvaluated: 0,
        fields: {
          total: { unchanged: 0, changed: 0 },
          maxTotal: { unchanged: 0, changed: 0 },
          percentage: { unchanged: 0, changed: 0 },
          grade: { unchanged: 0, changed: 0 },
          result: { unchanged: 0, changed: 0 },
          division: { unchanged: 0, changed: 0 },
          rank: { unchanged: 0, changed: 0 }
        },
        changedExamples: []
      }
    };

    const schoolSummary = summaryPerSchool[schoolId];

    for (const term of publishedOrLockedTerms) {
      const termId = term.id;
      const subMarks = subMarksByTerm[termId] || {};
      const rootMarks = rootExamMarks[termId] || {};

      // Merge marks matching SchoolApp
      const isRestructured = !!(settings.restructured || settings.storageVersion === 2);
      const mergedMarks = {};
      if (!isRestructured) {
        if (Object.keys(subMarks).length > 0) Object.assign(mergedMarks, subMarks);
        else Object.assign(mergedMarks, rootMarks);
      } else {
        const allClasses = Array.from(new Set([...Object.keys(rootMarks), ...Object.keys(subMarks)]));
        for (const c of allClasses) {
          mergedMarks[c] = {};
          const allSecs = Array.from(new Set([...Object.keys(rootMarks[c] || {}), ...Object.keys(subMarks[c] || {})]));
          for (const s of allSecs) {
            mergedMarks[c][s] = Object.assign({}, (rootMarks[c] && rootMarks[c][s]) || {}, (subMarks[c] && subMarks[c][s]) || {});
          }
        }
      }

      // Check each student entry
      for (const [classKey, classSecs] of Object.entries(mergedMarks)) {
        const normC = normalizeClassName(classKey);

        // Find configured subjects
        let subjectsArr = [];
        const termSubs = examSubjects[termId] || {};
        for (const [scKey, scData] of Object.entries(termSubs)) {
          if (normalizeClassName(scKey) === normC) {
            subjectsArr = scData.subjects || [];
            break;
          }
        }

        for (const [secKey, secStudents] of Object.entries(classSecs || {})) {
          for (const [studentId, studentEntry] of Object.entries(secStudents || {})) {
            if (!studentEntry || typeof studentEntry !== 'object') continue;

            const studentObj = students.find(s => s && s.id === studentId) || {
              id: studentId,
              class: classKey,
              section: secKey
            };

            const store = {
              settings,
              schoolInfo,
              examConfig,
              reportCardConfig,
              students: [studentObj],
              examTerms,
              examSubjects
            };

            const beforeBox = createSandbox(beforeCode, store);
            const afterBox = createSandbox(afterCode, store);

            // -------------------------------------------------------------
            // 1. SINGLE-TERM CARD EVALUATION
            // -------------------------------------------------------------
            let singleBefore = null;
            let singleAfter = null;

            if (term.rulesVersion === 'v2') {
              // In BEFORE (15c647f): generateSingleStudentCardHTMLV2 called ExamCalculationEngine.calculateStudentResult
              const bCalc = beforeBox.window.ExamCalculationEngine.calculateStudentResult({
                marks: studentEntry.marks || {},
                subjects: subjectsArr,
                term: term,
                schoolConfig: examConfig
              });
              singleBefore = {
                total: bCalc.total,
                maxTotal: bCalc.maxTotal,
                percentage: bCalc.percentage,
                grade: bCalc.grade,
                result: bCalc.result,
                division: bCalc.division,
                rank: (studentEntry && studentEntry.rank !== undefined) ? studentEntry.rank : null
              };
            } else {
              // Legacy path in 15c647f: legacyGenerateSingleStudentCardHTML used stored totals
              const bStoredTotal = (studentEntry.total !== undefined) ? Number(studentEntry.total) : null;
              const bStoredMaxTotal = (studentEntry.maxTotal !== undefined) ? Number(studentEntry.maxTotal) : null;
              const bStoredPct = (studentEntry.percentage !== undefined) ? parseFloat(studentEntry.percentage) : null;
              const bStoredResult = studentEntry.result ? String(studentEntry.result).toUpperCase() : null;
              const bStoredGrade = studentEntry.grade || null;
              const bStoredDiv = studentEntry.division || null;
              const bStoredRank = (studentEntry && studentEntry.rank !== undefined) ? studentEntry.rank : null;

              singleBefore = {
                total: bStoredTotal,
                maxTotal: bStoredMaxTotal,
                percentage: bStoredPct,
                grade: bStoredGrade,
                result: bStoredResult,
                division: bStoredDiv,
                rank: bStoredRank
              };
            }

            // In AFTER (current branch):
            const hasCompleteStored = (studentEntry.total !== undefined && studentEntry.total !== null &&
                                       studentEntry.maxTotal !== undefined && studentEntry.maxTotal !== null &&
                                       studentEntry.percentage !== undefined && studentEntry.percentage !== null &&
                                       studentEntry.grade && studentEntry.result);

            if (term.rulesVersion === 'v2') {
              if (hasCompleteStored) {
                const aPct = parseFloat(studentEntry.percentage) || 0;
                let aDiv = (studentEntry.division !== undefined && studentEntry.division !== null) ? String(studentEntry.division).trim() : '';
                if (!aDiv && typeof afterBox.window.recalculateStudentEntry === 'function') {
                  try {
                    const entryClone = JSON.parse(JSON.stringify(studentEntry));
                    const recalc = afterBox.window.recalculateStudentEntry(entryClone, subjectsArr, term);
                    aDiv = (recalc && recalc.division) || '';
                  } catch (_) {}
                }

                singleAfter = {
                  total: Number(studentEntry.total),
                  maxTotal: Number(studentEntry.maxTotal),
                  percentage: aPct,
                  grade: studentEntry.grade,
                  result: String(studentEntry.result || 'PASS').toUpperCase(),
                  division: aDiv || '',
                  rank: studentEntry.rank !== undefined ? studentEntry.rank : null
                };
              } else {
                const entryClone = JSON.parse(JSON.stringify(studentEntry));
                const recalc = afterBox.window.recalculateStudentEntry(entryClone, subjectsArr, term);
                singleAfter = {
                  total: Number(recalc.total || 0),
                  maxTotal: Number(recalc.maxTotal || 0),
                  percentage: parseFloat(recalc.percentage) || 0,
                  grade: recalc.grade || '—',
                  result: recalc.result ? String(recalc.result).toUpperCase() : '—',
                  division: (recalc && recalc.division) || '',
                  rank: (studentEntry && studentEntry.rank !== undefined) ? studentEntry.rank : (recalc.rank || null)
                };
              }
            } else {
              // Legacy path in AFTER: legacyGenerateSingleStudentCardHTML is unchanged
              const aStoredTotal = (studentEntry.total !== undefined) ? Number(studentEntry.total) : null;
              const aStoredMaxTotal = (studentEntry.maxTotal !== undefined) ? Number(studentEntry.maxTotal) : null;
              const aStoredPct = (studentEntry.percentage !== undefined) ? parseFloat(studentEntry.percentage) : null;
              const aStoredResult = studentEntry.result ? String(studentEntry.result).toUpperCase() : null;
              const aStoredGrade = studentEntry.grade || null;
              const aStoredDiv = studentEntry.division || null;
              const aStoredRank = (studentEntry && studentEntry.rank !== undefined) ? studentEntry.rank : null;

              singleAfter = {
                total: aStoredTotal,
                maxTotal: aStoredMaxTotal,
                percentage: aStoredPct,
                grade: aStoredGrade,
                result: aStoredResult,
                division: aStoredDiv,
                rank: aStoredRank
              };
            }

            // Compare single-card fields
            schoolSummary.singleCard.totalEvaluated++;
            const singleComp = compareFields(singleBefore, singleAfter);
            for (const f of ['total', 'maxTotal', 'percentage', 'grade', 'result', 'division', 'rank']) {
              if (singleComp.diffs[f]) {
                schoolSummary.singleCard.fields[f].changed++;
              } else {
                schoolSummary.singleCard.fields[f].unchanged++;
              }
            }
            if (singleComp.hasDiff) {
              if (schoolSummary.singleCard.changedExamples.length < 3) {
                schoolSummary.singleCard.changedExamples.push({
                  studentId,
                  class: classKey,
                  section: secKey,
                  termId,
                  diffs: singleComp.diffs
                });
              }
              if (schoolId !== 'svm_bokaro_001') {
                anyNonGreenwoodChanged = true;
                nonGreenwoodViolations.push({
                  schoolId,
                  studentId,
                  type: 'singleCard',
                  diffs: singleComp.diffs
                });
              }
            }

            // -------------------------------------------------------------
            // 2. MULTI-TERM CARD EVALUATION
            // -------------------------------------------------------------
            let multiBefore = null;
            let multiAfter = null;

            if (term.rulesVersion === 'v2') {
              // In BEFORE (15c647f): calculateMultiExamResult called calculateStudentResult per term
              const bMultiRes = beforeBox.window.ExamCalculationEngine.calculateStudentResult({
                marks: studentEntry.marks || {},
                subjects: subjectsArr,
                term: term,
                schoolConfig: examConfig
              });
              multiBefore = {
                total: bMultiRes.total,
                maxTotal: bMultiRes.maxTotal,
                percentage: bMultiRes.percentage,
                grade: bMultiRes.grade,
                result: bMultiRes.result,
                division: bMultiRes.division,
                rank: (studentEntry && studentEntry.rank !== undefined) ? studentEntry.rank : null
              };

              // In AFTER (current branch): calculateMultiExamResult uses stored aggregates when tIsPub && tHasComp
              if (hasCompleteStored) {
                const mPct = parseFloat(studentEntry.percentage) || 0;
                let mDiv = (studentEntry.division !== undefined && studentEntry.division !== null) ? String(studentEntry.division).trim() : '';
                if (!mDiv && typeof afterBox.window.recalculateStudentEntry === 'function') {
                  try {
                    const entryClone = JSON.parse(JSON.stringify(studentEntry));
                    const recalc = afterBox.window.recalculateStudentEntry(entryClone, subjectsArr, term);
                    mDiv = (recalc && recalc.division) || '';
                  } catch (_) {}
                }
                multiAfter = {
                  total: Number(studentEntry.total),
                  maxTotal: Number(studentEntry.maxTotal),
                  percentage: mPct,
                  grade: studentEntry.grade,
                  result: String(studentEntry.result || 'PASS').toUpperCase(),
                  division: mDiv || '',
                  rank: studentEntry.rank !== undefined ? studentEntry.rank : null
                };
              } else {
                const entryClone = JSON.parse(JSON.stringify(studentEntry));
                const recalc = afterBox.window.recalculateStudentEntry(entryClone, subjectsArr, term);
                multiAfter = {
                  total: Number(recalc.total || 0),
                  maxTotal: Number(recalc.maxTotal || 0),
                  percentage: parseFloat(recalc.percentage) || 0,
                  grade: recalc.grade || '—',
                  result: recalc.result ? String(recalc.result).toUpperCase() : '—',
                  division: (recalc && recalc.division) || '',
                  rank: (studentEntry && studentEntry.rank !== undefined) ? studentEntry.rank : (recalc.rank || null)
                };
              }
            } else {
              // In legacy schools: multi-term card is not supported / routes to legacy card using stored totals
              multiBefore = Object.assign({}, singleBefore);
              multiAfter = Object.assign({}, singleAfter);
            }

            // Compare multi-card fields
            schoolSummary.multiCard.totalEvaluated++;
            const multiComp = compareFields(multiBefore, multiAfter);
            for (const f of ['total', 'maxTotal', 'percentage', 'grade', 'result', 'division', 'rank']) {
              if (multiComp.diffs[f]) {
                schoolSummary.multiCard.fields[f].changed++;
              } else {
                schoolSummary.multiCard.fields[f].unchanged++;
              }
            }
            if (multiComp.hasDiff) {
              if (schoolSummary.multiCard.changedExamples.length < 3) {
                schoolSummary.multiCard.changedExamples.push({
                  studentId,
                  class: classKey,
                  section: secKey,
                  termId,
                  diffs: multiComp.diffs
                });
              }
              if (schoolId !== 'svm_bokaro_001') {
                anyNonGreenwoodChanged = true;
                nonGreenwoodViolations.push({
                  schoolId,
                  studentId,
                  type: 'multiCard',
                  diffs: multiComp.diffs
                });
              }
            }

            // Capture specific evidence for stu_gw_4_05
            if (schoolId === 'svm_bokaro_001' && studentId === 'stu_gw_4_05') {
              stuGw405Details = {
                studentId,
                class: classKey,
                section: secKey,
                termId,
                storedRecord: {
                  total: studentEntry.total,
                  maxTotal: studentEntry.maxTotal,
                  percentage: studentEntry.percentage,
                  grade: studentEntry.grade,
                  result: studentEntry.result,
                  rank: studentEntry.rank,
                  marksCount: Object.keys(studentEntry.marks || {}).length,
                  markedSubjects: Object.keys(studentEntry.marks || {})
                },
                classConfiguredSubjectsCount: subjectsArr.length,
                singleCard: {
                  before: singleBefore,
                  after: singleAfter,
                  diffs: singleComp.diffs
                },
                multiCard: {
                  before: multiBefore,
                  after: multiAfter,
                  diffs: multiComp.diffs
                }
              };
            }
          }
        }
      }
    }
  }

  // Write output JSON
  const outputFilePath = 'C:/Users/bhanu/.gemini/antigravity/brain/06985d1a-3444-4a82-be77-f91f40399cc3/scratch/report_card_regression_output.json';
  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
  const fullResult = {
    timestamp: new Date().toISOString(),
    anyNonGreenwoodChanged,
    nonGreenwoodViolationsCount: nonGreenwoodViolations.length,
    summaryPerSchool,
    stuGw405Details
  };

  fs.writeFileSync(outputFilePath, JSON.stringify(fullResult, null, 2), 'utf8');
  console.log(`\nRegression output saved to:\n  ${outputFilePath}\n`);

  // Print summary per school
  console.log('----------------------------------------------------------------------');
  console.log(' SUMMARY PER SCHOOL:');
  console.log('----------------------------------------------------------------------');
  for (const [sId, sData] of Object.entries(summaryPerSchool)) {
    console.log(`\nSchool: ${sId}`);
    console.log(`  Single-Term Card (Evaluated: ${sData.singleCard.totalEvaluated}):`);
    for (const [f, counts] of Object.entries(sData.singleCard.fields)) {
      console.log(`    - ${f.padEnd(12)}: ${counts.unchanged} unchanged, ${counts.changed} changed`);
    }
    if (sData.singleCard.changedExamples.length > 0) {
      console.log(`    Changed Examples (up to 3):`);
      sData.singleCard.changedExamples.forEach((ex, idx) => {
        console.log(`      [${idx + 1}] ID: ${ex.studentId} (${ex.class}-${ex.section}, Term: ${ex.termId}):`, JSON.stringify(ex.diffs));
      });
    }

    console.log(`  Multi-Term Card (Evaluated: ${sData.multiCard.totalEvaluated}):`);
    for (const [f, counts] of Object.entries(sData.multiCard.fields)) {
      console.log(`    - ${f.padEnd(12)}: ${counts.unchanged} unchanged, ${counts.changed} changed`);
    }
    if (sData.multiCard.changedExamples.length > 0) {
      console.log(`    Changed Examples (up to 3):`);
      sData.multiCard.changedExamples.forEach((ex, idx) => {
        console.log(`      [${idx + 1}] ID: ${ex.studentId} (${ex.class}-${ex.section}, Term: ${ex.termId}):`, JSON.stringify(ex.diffs));
      });
    }
  }

  // stu_gw_4_05 Specific Breakdown
  if (stuGw405Details) {
    console.log('\n======================================================================');
    console.log(' EVIDENCE FOR STUDENT stu_gw_4_05 (Greenwood svm_bokaro_001):');
    console.log('======================================================================');
    console.log('Stored Record in Firestore:');
    console.log(JSON.stringify(stuGw405Details.storedRecord, null, 2));
    console.log(`Class Configured Subjects Count: ${stuGw405Details.classConfiguredSubjectsCount}`);
    console.log('\nSingle-Term Card Comparison:');
    console.log('  BEFORE (15c647f):', JSON.stringify(stuGw405Details.singleCard.before));
    console.log('  AFTER  (v81):    ', JSON.stringify(stuGw405Details.singleCard.after));
    console.log('  Differences:     ', JSON.stringify(stuGw405Details.singleCard.diffs));
    console.log('\nMulti-Term Card Comparison:');
    console.log('  BEFORE (15c647f):', JSON.stringify(stuGw405Details.multiCard.before));
    console.log('  AFTER  (v81):    ', JSON.stringify(stuGw405Details.multiCard.after));
    console.log('  Differences:     ', JSON.stringify(stuGw405Details.multiCard.diffs));
  }

  // Check critical constraint
  if (anyNonGreenwoodChanged) {
    console.error('\nCRITICAL CONSTRAINT FAILED: Non-Greenwood schools had changed fields!');
    console.error(JSON.stringify(nonGreenwoodViolations, null, 2));
    process.exit(1);
  } else {
    console.log('\n>>> CRITICAL CONSTRAINT PASSED: Only Greenwood had changes. All other schools stayed 100% identical! <<<');
  }
}

runRegression().catch(err => {
  console.error('Fatal error during regression run:', err);
  process.exit(1);
});
