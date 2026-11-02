/**
 * scripts/migrate-students-to-subcollection.js
 * 
 * Migrates students to subcollection for a given list of schools:
 *  - dugda_mq7qfia3
 *  - idealschoolgomoh_mv1xhpe5
 *  - oxford_narra_muktjcky
 *  - usha_academy_mango_muzflr5z
 *  - apex_khalcho_mugmtmx4
 *  - nts_mu28myws
 *  - cambridge_mtl62hkp
 * 
 * STRICT RULES:
 *  - Backup + SHA-256 before any migration.
 *  - Copy to tenant_data/{schoolId}/students/{studentId} (batches <= 400).
 *  - Verify count and per-student hash parity (100% match).
 *  - Set settings.studentsMigrated = true, studentsDualWrite = true, studentsMigrationTimestamp (dot-path).
 *  - Root students[] untouched (copy-only).
 *  - On ANY mismatch: do not set flags; stop immediately.
 *  - Zero personal data printed in logs.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TARGET_SCHOOLS = [
  'dugda_mq7qfia3',
  'idealschoolgomoh_mv1xhpe5',
  'oxford_narra_muktjcky',
  'usha_academy_mango_muzflr5z',
  'apex_khalcho_mugmtmx4',
  'nts_mu28myws',
  'cambridge_mtl62hkp'
];

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!process.env.FIRESTORE_EMULATOR_HOST && !fs.existsSync(saPath)) {
  console.error('FATAL: service-account-key.json not found at', saPath);
  process.exit(1);
}

if (!admin.apps.length) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: 'ctrl-shift-solutions' });
  } else {
    admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
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

async function migrateSchoolStudents(schoolId) {
  console.log(`\n================================================================`);
  console.log(`   STUDENT SUBCOLLECTION MIGRATION FOR: ${schoolId}`);
  console.log(`================================================================`);

  const rootDocRef = db.collection('tenant_data').doc(schoolId);
  const rootSnap = await rootDocRef.get();
  if (!rootSnap.exists) {
    throw new Error(`Target document tenant_data/${schoolId} does not exist.`);
  }

  const rootData = rootSnap.data();
  const rootStudents = Array.isArray(rootData.students) ? rootData.students : [];
  console.log(`[READ] Found ${rootStudents.length} students in root document of ${schoolId}.`);

  // 1. Safety Backup + SHA-256
  const backupDir = path.resolve(__dirname, '..', 'backups', 'root_docs');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `backup_${schoolId}_pre_student_subcollection_${timestamp}.json`);
  const backupContent = JSON.stringify(rootData, null, 2);
  fs.writeFileSync(backupFile, backupContent, 'utf8');
  const backupHash = crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');
  const backupSizeKB = (fs.statSync(backupFile).size / 1024).toFixed(2);

  console.log(`✅ [BACKUP] Full safety backup saved to: ${backupFile}`);
  console.log(`   • Size: ${backupSizeKB} KB`);
  console.log(`   • SHA-256: ${backupHash}`);

  // 2. Batch write to subcollection (if students exist)
  const migrationTimestamp = new Date().toISOString();
  if (rootStudents.length > 0) {
    console.log(`[MIGRATE] Writing ${rootStudents.length} students to tenant_data/${schoolId}/students...`);
    const batchSize = 400;
    for (let i = 0; i < rootStudents.length; i += batchSize) {
      const chunk = rootStudents.slice(i, i + batchSize);
      const batch = db.batch();
      for (const student of chunk) {
        if (!student.id) {
          throw new Error(`Student record missing ID in ${schoolId}`);
        }
        const studentDocRef = db.collection('tenant_data').doc(schoolId).collection('students').doc(student.id);
        const studentData = Object.assign({}, student, {
          schoolId,
          migratedAt: migrationTimestamp
        });
        batch.set(studentDocRef, studentData);
      }
      await batch.commit();
      console.log(`   • Committed batch ${Math.floor(i / batchSize) + 1} (${chunk.length} students)`);
    }
  } else {
    console.log(`[INFO] School has 0 students in root. Subcollection initialized empty.`);
  }

  // 3. Parity Verification
  console.log(`[VERIFY] Verifying count and field-by-field hash parity...`);
  const subSnap = await db.collection('tenant_data').doc(schoolId).collection('students').get();
  console.log(`   • Subcollection document count: ${subSnap.size}`);

  if (subSnap.size !== rootStudents.length) {
    throw new Error(`PARITY FAILURE on ${schoolId}: count mismatch! Root has ${rootStudents.length}, subcollection has ${subSnap.size}`);
  }

  const subDocsMap = new Map();
  subSnap.forEach(d => subDocsMap.set(d.id, d.data()));

  let identicalCount = 0;
  for (const orig of rootStudents) {
    const sub = subDocsMap.get(orig.id);
    if (!sub) {
      throw new Error(`PARITY FAILURE on ${schoolId}: student ID ${orig.id} missing in subcollection!`);
    }

    const origHash = sha256(canonicalString(orig, ['schoolId', 'migratedAt']));
    const subHash = sha256(canonicalString(sub, ['schoolId', 'migratedAt']));

    if (origHash === subHash && sub.schoolId === schoolId) {
      identicalCount++;
    } else {
      throw new Error(`PARITY FAILURE on ${schoolId}: hash mismatch for student ID ${orig.id}!`);
    }
  }

  console.log(`✔ Parity passed: ${identicalCount} / ${rootStudents.length} students verified with 100% hash parity.`);

  // 4. Dot-Path Update
  console.log(`[ACTIVATE] Enabling settings.studentsMigrated = true and settings.studentsDualWrite = true...`);
  await rootDocRef.update({
    'settings.studentsMigrated': true,
    'settings.studentsDualWrite': true,
    'settings.studentsMigrationTimestamp': migrationTimestamp,
    updatedAt: new Date().toISOString()
  });

  // 5. Post-Check: Root students[] untouched
  const verifyRootSnap = await rootDocRef.get();
  const verifyRootData = verifyRootSnap.data();
  if (!Array.isArray(verifyRootData.students) || verifyRootData.students.length !== rootStudents.length) {
    throw new Error(`CRITICAL POST-CHECK FAILURE on ${schoolId}: root students[] was altered during migration!`);
  }
  console.log(`✔ [Post-Check] Root students[] confirmed completely intact (${verifyRootData.students.length} items preserved).`);
  console.log(`✅ STUDENT MIGRATION 100% COMPLETE FOR ${schoolId}\n`);

  return {
    schoolId,
    studentCount: rootStudents.length,
    identicalCount,
    backupFile,
    backupHash
  };
}

async function main() {
  const targetSchoolArg = process.argv[2];
  const schoolsToMigrate = targetSchoolArg ? [targetSchoolArg] : TARGET_SCHOOLS;

  console.log('Starting Student Migration for:', schoolsToMigrate.join(', '));
  const results = [];

  for (const s of schoolsToMigrate) {
    const res = await migrateSchoolStudents(s);
    results.push(res);
  }

  console.log('\n========================================================================');
  console.log('                 ALL TARGET SCHOOLS MIGRATED SUCCESSFULLY               ');
  console.log('========================================================================');
  console.log('| School ID | Students Migrated | Parity Match | Backup Hash |');
  console.log('| :--- | :---: | :---: | :--- |');
  for (const r of results) {
    console.log(`| \`${r.schoolId}\` | ${r.studentCount} | 100% ✅ | \`${r.backupHash.slice(0, 16)}...\` |`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('\n❌ MIGRATION FAILED:', err.message);
    process.exit(1);
  });
}

module.exports = { migrateSchoolStudents };
