#!/usr/bin/env node
'use strict';

/**
 * scripts/report-orphan-exam-marks.js
 * 
 * Read-only data-quality audit script (--dry-run only, prints NO names).
 * For every school and term, counts students whose marks contain subject IDs
 * that are not in that class's current examSubjects, grouped by:
 *   orphan id -> likely configured id (same name)
 */

const admin = require('firebase-admin');
const path = require('path');
const { normalizeClassName } = require('../api/_lib/class-normalizer');

// Initialize Firebase Admin
if (!admin.apps.length) {
  let credential;
  const serviceAccountPath = path.resolve(__dirname, '../service-account-key.json');
  try {
    const fs = require('fs');
    if (fs.existsSync(serviceAccountPath)) {
      credential = admin.credential.cert(require(serviceAccountPath));
    }
  } catch (e) {
    // fall back to default
  }

  if (credential) {
    admin.initializeApp({ credential });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();

function normalizeName(str) {
  return String(str || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function runReport() {
  const isDryRun = process.argv.includes('--dry-run') || true; // Strictly read-only
  console.log('======================================================================');
  console.log(` ORPHAN EXAM MARKS DATA-QUALITY AUDIT (${isDryRun ? '--dry-run (READ-ONLY)' : 'READ-ONLY'})`);
  console.log('======================================================================\n');

  const tenantsSnap = await db.collection('tenant_data').get();
  let totalOrphanStudents = 0;
  let totalOrphanOccurrences = 0;
  const globalSummary = {}; // orphanId -> { likelyId, count, schools: Set }

  for (const tenantDoc of tenantsSnap.docs) {
    const schoolId = tenantDoc.id;
    const root = tenantDoc.data() || {};
    const examTerms = root.examTerms || {};
    const examSubjects = root.examSubjects || {};
    const rootExamMarks = root.examMarks || {};
    const isRestructured = !!(root.settings && (root.settings.restructured || root.settings.storageVersion === 2));

    // Get subcollection exam_marks
    let subColSnap;
    try {
      subColSnap = await tenantDoc.ref.collection('exam_marks').get();
    } catch (err) {
      continue;
    }

    const subMarksByTerm = {};
    subColSnap.forEach(d => { subMarksByTerm[d.id] = d.data() || {}; });

    const allTermIds = Array.from(new Set([
      ...Object.keys(examTerms),
      ...Object.keys(examSubjects),
      ...Object.keys(rootExamMarks),
      ...Object.keys(subMarksByTerm)
    ]));

    const schoolOrphans = [];

    for (const termId of allTermIds) {
      const termSubs = examSubjects[termId] || {};
      const subMarks = subMarksByTerm[termId] || {};
      const rootMarks = rootExamMarks[termId] || {};

      // Build a dictionary of ALL subject IDs to names across all classes in this term and all terms in this school
      const subjectNamesById = {};
      for (const tId of Object.keys(examSubjects)) {
        for (const cK of Object.keys(examSubjects[tId] || {})) {
          const list = (examSubjects[tId][cK] && examSubjects[tId][cK].subjects) || [];
          list.forEach(s => {
            if (s.id && s.name) subjectNamesById[s.id] = s.name;
          });
        }
      }

      // Merge marks matching SchoolApp.loadExamMarksTerm
      const mergedMarks = {};
      if (!isRestructured) {
        if (Object.keys(subMarks).length > 0) {
          Object.assign(mergedMarks, subMarks);
        } else {
          Object.assign(mergedMarks, rootMarks);
        }
      } else {
        const allClasses = Array.from(new Set([...Object.keys(rootMarks), ...Object.keys(subMarks)]));
        for (const c of allClasses) {
          mergedMarks[c] = {};
          const allSecs = Array.from(new Set([...Object.keys(rootMarks[c] || {}), ...Object.keys(subMarks[c] || {})]));
          for (const s of allSecs) {
            mergedMarks[c][s] = Object.assign(
              {},
              (rootMarks[c] && rootMarks[c][s]) || {},
              (subMarks[c] && subMarks[c][s]) || {}
            );
          }
        }
      }

      // Check each student
      for (const [classKey, classSecs] of Object.entries(mergedMarks)) {
        const normC = normalizeClassName(classKey);

        // Find configured subjects for this class
        let confSubjects = [];
        for (const [scKey, scData] of Object.entries(termSubs)) {
          if (normalizeClassName(scKey) === normC) {
            confSubjects = scData.subjects || [];
            break;
          }
        }

        const confSubjectIds = new Set(confSubjects.map(s => s.id));
        const confSubjectNamesMap = {};
        confSubjects.forEach(s => {
          if (s.name) confSubjectNamesMap[normalizeName(s.name)] = s.id;
        });

        // Group orphans by: orphanId -> likelyConfiguredId
        const termOrphanMap = {}; // `${orphanId} -> ${likelyId}`: count

        for (const [secKey, secStudents] of Object.entries(classSecs || {})) {
          for (const [studentId, studentEntry] of Object.entries(secStudents || {})) {
            const marks = (studentEntry && studentEntry.marks) || {};
            let studentHasOrphan = false;

            for (const markSubId of Object.keys(marks)) {
              if (!confSubjectIds.has(markSubId)) {
                studentHasOrphan = true;
                totalOrphanOccurrences++;

                // Resolve orphan subject name
                let orphanName = subjectNamesById[markSubId] || null;

                // Attempt to match likely configured subject
                let likelyId = null;
                if (orphanName) {
                  const normOrphan = normalizeName(orphanName);
                  if (confSubjectNamesMap[normOrphan]) {
                    likelyId = confSubjectNamesMap[normOrphan];
                  } else {
                    // Try partial match
                    for (const cs of confSubjects) {
                      const normCs = normalizeName(cs.name);
                      if (normCs.includes(normOrphan) || normOrphan.includes(normCs)) {
                        likelyId = cs.id;
                        break;
                      }
                    }
                  }
                }

                // If orphanName still null, try inferring from id (e.g. sub_evs_sci -> Science & EVS)
                if (!likelyId) {
                  const cleanMarkId = markSubId.replace(/^sub(j)?_/, '').toLowerCase();
                  for (const cs of confSubjects) {
                    const cleanCsId = cs.id.replace(/^sub(j)?_/, '').toLowerCase();
                    const normCsName = normalizeName(cs.name);
                    if (normCsName.includes(cleanMarkId) || cleanMarkId.includes(cleanCsId)) {
                      likelyId = cs.id;
                      if (!orphanName) orphanName = cs.name;
                      break;
                    }
                    // check tokens e.g. "evs" and "sci" vs "Science & EVS"
                    const tokens = cleanMarkId.split('_');
                    if (tokens.length > 1 && tokens.every(tok => normCsName.includes(tok))) {
                      likelyId = cs.id;
                      if (!orphanName) orphanName = cs.name;
                      break;
                    }
                  }
                }

                const pairKey = `${markSubId} -> ${likelyId || '(no configured match)'}${orphanName ? ' ("' + orphanName + '")' : ''}`;
                termOrphanMap[pairKey] = (termOrphanMap[pairKey] || 0) + 1;

                if (!globalSummary[pairKey]) {
                  globalSummary[pairKey] = { count: 0, schools: new Set() };
                }
                globalSummary[pairKey].count++;
                globalSummary[pairKey].schools.add(schoolId);
              }
            }

            if (studentHasOrphan) {
              totalOrphanStudents++;
            }
          }
        }

        if (Object.keys(termOrphanMap).length > 0) {
          schoolOrphans.push({
            termId,
            classKey,
            orphans: termOrphanMap
          });
        }
      }
    }

    if (schoolOrphans.length > 0) {
      console.log(`🏫 School: ${schoolId}`);
      for (const item of schoolOrphans) {
        console.log(`   Term: ${item.termId} | Class: ${item.classKey}`);
        for (const [pair, count] of Object.entries(item.orphans)) {
          console.log(`     • ${pair}: ${count} student mark entries`);
        }
      }
      console.log('');
    }
  }

  console.log('======================================================================');
  console.log(' GLOBAL ORPHAN AUDIT SUMMARY');
  console.log('======================================================================');
  console.log(`Total Students with Orphan Subject Marks : ${totalOrphanStudents}`);
  console.log(`Total Orphan Mark Records Found          : ${totalOrphanOccurrences}`);
  console.log('\nGrouped by Orphan ID -> Likely Configured ID:');
  for (const [pair, data] of Object.entries(globalSummary)) {
    console.log(`  • ${pair}: ${data.count} student marks across ${data.schools.size} school(s) [${Array.from(data.schools).join(', ')}]`);
  }
  console.log('\n[AUDIT COMPLETE - 100% READ-ONLY / ZERO WRITES PERFORMED]');
}

runReport()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
  });
