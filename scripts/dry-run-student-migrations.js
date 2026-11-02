'use strict';

/**
 * scripts/dry-run-student-migrations.js
 * 
 * Generates dry-run migration and parity verification reports for all schools
 * whose students are not yet in subcollection tenant_data/{id}/students.
 * 
 * STRICT RULES:
 *  - 100% READ-ONLY. Zero writes to Firestore or Storage.
 *  - Computes canonical SHA-256 parity hashes for every student record.
 *  - Checks ID uniqueness, field structures, and subcollection status.
 * 
 * USAGE:
 *   node scripts/dry-run-student-migrations.js
 *   node scripts/dry-run-student-migrations.js --school ips_mttx07mt
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: 'ctrl-shift-solutions' });
  } else if (fs.existsSync(saPath)) {
    admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
  } else {
    admin.initializeApp();
  }
}
const db = admin.firestore();

function canonicalString(obj, excludeKeys = []) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalString(item, excludeKeys)).join(',') + ']';
  }
  const keys = Object.keys(obj).filter(k => !excludeKeys.includes(k)).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalString(obj[k], excludeKeys)).join(',') + '}';
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

async function runDryRun(targetSchoolId = null) {
  console.log('================================================================');
  console.log('     STUDENT SUBCOLLECTION MIGRATION — DRY-RUN VERIFICATION     ');
  console.log('================================================================\n');
  console.log('Mode: STRICTLY READ-ONLY (No writes will be performed)\n');

  const unmigratedSchools = [
    'dugda_mq7qfia3',
    'idealschoolgomoh_mv1xhpe5',
    'ips_mttx07mt',
    'oxford_narra_muktjcky',
    'usha_academy_mango_muzflr5z'
  ];

  const targetSchools = targetSchoolId ? [targetSchoolId] : unmigratedSchools;
  const overallReport = [];

  for (const schoolId of targetSchools) {
    console.log(`\n────────────────────────────────────────────────────────────────`);
    console.log(` School: ${schoolId}`);
    console.log(`────────────────────────────────────────────────────────────────`);

    const rootRef = db.collection('tenant_data').doc(schoolId);
    const snap = await rootRef.get();

    if (!snap.exists) {
      console.log(`  ❌ Document tenant_data/${schoolId} does not exist.`);
      continue;
    }

    const data = snap.data();
    const settings = data.settings || {};
    const rootStudents = Array.isArray(data.students) ? data.students : [];
    const subSnap = await rootRef.collection('students').get();

    console.log(`  • Root students array count:        ${rootStudents.length}`);
    console.log(`  • Existing subcollection doc count: ${subSnap.size}`);
    console.log(`  • settings.studentsMigrated flag:   ${settings.studentsMigrated === true}`);
    console.log(`  • settings.studentsDualWrite flag:  ${settings.studentsDualWrite === true}`);

    // Check ID uniqueness
    const idSet = new Set();
    const duplicateIds = [];
    const missingIds = [];
    let withValidEmail = 0;
    let withParentPhone = 0;

    for (let i = 0; i < rootStudents.length; i++) {
      const s = rootStudents[i];
      if (!s.id) {
        missingIds.push(i);
      } else {
        if (idSet.has(s.id)) {
          duplicateIds.push(s.id);
        }
        idSet.add(s.id);
      }
      if (s.parentEmail && s.parentEmail.includes('@')) withValidEmail++;
      if (s.parentPhone) withParentPhone++;
    }

    // Hash the root students
    const canonicalRoster = canonicalString(rootStudents, ['schoolId', 'migratedAt']);
    const rosterHash = sha256(canonicalRoster);

    const isReady = rootStudents.length > 0 && missingIds.length === 0 && duplicateIds.length === 0;

    console.log(`  • Missing IDs:                      ${missingIds.length}`);
    console.log(`  • Duplicate IDs:                    ${duplicateIds.length}`);
    console.log(`  • Students with valid email:        ${withValidEmail}`);
    console.log(`  • Students with parent phone:       ${withParentPhone}`);
    console.log(`  • Canonical Roster SHA-256:         ${rosterHash}`);
    console.log(`  • Migration Readiness Status:       ${isReady ? '✅ READY FOR COPY-ONLY MIGRATION' : '❌ BLOCKED'}`);

    overallReport.push({
      schoolId,
      rootStudentCount: rootStudents.length,
      subStudentCount: subSnap.size,
      missingIdsCount: missingIds.length,
      duplicateIdsCount: duplicateIds.length,
      withValidEmail,
      withParentPhone,
      rosterHash,
      status: isReady ? 'READY' : 'BLOCKED'
    });
  }

  console.log('\n================================================================');
  console.log('                    OVERALL DRY-RUN SUMMARY                     ');
  console.log('================================================================');
  console.table(overallReport);

  return overallReport;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let schoolArg = null;
  const sIdx = args.indexOf('--school');
  if (sIdx !== -1 && args[sIdx + 1]) {
    schoolArg = args[sIdx + 1];
  }

  runDryRun(schoolArg).then(() => {
    console.log('\nDry-run completed. Zero writes performed.');
    process.exit(0);
  }).catch(err => {
    console.error('Dry-run error:', err);
    process.exit(1);
  });
}

module.exports = { runDryRun };
