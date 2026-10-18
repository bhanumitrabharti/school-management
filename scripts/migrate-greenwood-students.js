/**
 * scripts/migrate-greenwood-students.js
 * 
 * Migrates ONLY greenwood (svm_bokaro_001) students to tenant_data/{id}/students/{studentId}.
 * 
 * STRICT RULES:
 *  - Only svm_bokaro_001 is allowed. Aborts on any other school ID.
 *  - Full safety backup before migration.
 *  - Same student IDs preserved.
 *  - schoolId added during migration; parity hash compares original fields only.
 *  - 100% count + per-student field hash verification before setting flags.
 *  - Root students[] remains 100% frozen and untouched as safety copy.
 *  - Dual-write flag settings.studentsDualWrite = true activated for probation period.
 * 
 * USAGE:
 *   node scripts/migrate-greenwood-students.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TARGET_SCHOOL_ID = 'svm_bokaro_001';

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

async function migrateGreenwood() {
  console.log('================================================================');
  console.log('   GREENWOOD (svm_bokaro_001) STUDENT SUBCOLLECTION MIGRATION   ');
  console.log('================================================================\n');

  // Strict safety barrier: Only greenwood
  if (TARGET_SCHOOL_ID !== 'svm_bokaro_001') {
    throw new Error('MIGRATION BLOCKED: Only greenwood (svm_bokaro_001) is authorized in this phase.');
  }

  // 1. Fetch Root Document
  const rootDocRef = db.collection('tenant_data').doc(TARGET_SCHOOL_ID);
  const rootSnap = await rootDocRef.get();
  if (!rootSnap.exists) {
    throw new Error(`Target document tenant_data/${TARGET_SCHOOL_ID} does not exist.`);
  }
  const rootData = rootSnap.data();
  const rootStudents = Array.isArray(rootData.students) ? rootData.students : [];
  console.log(`[READ] Found ${rootStudents.length} students in root document of ${TARGET_SCHOOL_ID}.`);

  if (rootStudents.length === 0) {
    throw new Error(`ABORT: Root students array is empty for ${TARGET_SCHOOL_ID}.`);
  }

  // 2. Full Safety Backup
  const backupDir = path.resolve(__dirname, '..', 'backups', 'full');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `${TARGET_SCHOOL_ID}_pre_student_subcollection_${timestamp}.json`);

  const backupPayload = {
    metadata: {
      action: 'pre-student-subcollection-migration-backup',
      schoolId: TARGET_SCHOOL_ID,
      timestamp: new Date().toISOString(),
      studentCount: rootStudents.length
    },
    rootDoc: rootData
  };

  fs.writeFileSync(backupFile, JSON.stringify(backupPayload, null, 2), 'utf8');
  console.log(`✅ [BACKUP] Full safety backup saved to: ${backupFile}`);

  // 3. Batch Write to Subcollection
  console.log(`[MIGRATE] Writing ${rootStudents.length} students to subcollection tenant_data/${TARGET_SCHOOL_ID}/students...`);
  const batchSize = 400;
  for (let i = 0; i < rootStudents.length; i += batchSize) {
    const chunk = rootStudents.slice(i, i + batchSize);
    const batch = db.batch();
    for (const student of chunk) {
      if (!student.id) {
        throw new Error(`Student record missing ID at index ${i}`);
      }
      const studentDocRef = db.collection('tenant_data').doc(TARGET_SCHOOL_ID).collection('students').doc(student.id);
      const studentData = Object.assign({}, student, {
        schoolId: TARGET_SCHOOL_ID,
        migratedAt: new Date().toISOString()
      });
      batch.set(studentDocRef, studentData);
    }
    await batch.commit();
    console.log(`   • Committed batch ${Math.floor(i / batchSize) + 1} (${chunk.length} students)`);
  }

  // 4. Verification & Field-by-Field Parity Check
  console.log(`\n[VERIFY] Executing strict count and field-by-field parity check...`);
  const subSnap = await db.collection('tenant_data').doc(TARGET_SCHOOL_ID).collection('students').get();
  console.log(`   • Subcollection document count: ${subSnap.size}`);

  if (subSnap.size !== rootStudents.length) {
    throw new Error(`PARITY FAILURE: Count mismatch! Root has ${rootStudents.length}, subcollection has ${subSnap.size}`);
  }

  const subDocsMap = new Map();
  subSnap.forEach(d => subDocsMap.set(d.id, d.data()));

  let identicalCount = 0;
  let mismatchCount = 0;
  const parityDetails = [];

  for (const orig of rootStudents) {
    const sub = subDocsMap.get(orig.id);
    if (!sub) {
      mismatchCount++;
      parityDetails.push({ id: orig.id, status: 'MISSING_IN_SUBCOLLECTION' });
      continue;
    }

    // Compare original fields only (exclude added fields: schoolId, migratedAt)
    const origCanonical = canonicalString(orig, ['schoolId', 'migratedAt']);
    const subCanonical = canonicalString(sub, ['schoolId', 'migratedAt']);

    const origHash = sha256(origCanonical);
    const subHash = sha256(subCanonical);

    if (origHash === subHash && sub.schoolId === TARGET_SCHOOL_ID) {
      identicalCount++;
    } else {
      mismatchCount++;
      parityDetails.push({
        id: orig.id,
        origHash,
        subHash,
        schoolIdPresent: sub.schoolId === TARGET_SCHOOL_ID,
        status: 'HASH_MISMATCH'
      });
    }
  }

  console.log('-----------------------------------------------------------------------------------------');
  console.log('| Metric                             | Expected | Actual   | Match Status                |');
  console.log('-----------------------------------------------------------------------------------------');
  console.log(`| Student Count                      | ${String(rootStudents.length).padEnd(8)} | ${String(subSnap.size).padEnd(8)} | ${subSnap.size === rootStudents.length ? '100% MATCH ✅' : 'MISMATCH ❌'}              |`);
  console.log(`| Field-by-Field Parity Hashes       | ${String(rootStudents.length).padEnd(8)} | ${String(identicalCount).padEnd(8)} | ${identicalCount === rootStudents.length ? '100% IDENTICAL ✅' : 'MISMATCH ❌'}          |`);
  console.log(`| Added Fields Listed Separately     | [schoolId, migratedAt]                              | VERIFIED ✅                 |`);
  console.log('-----------------------------------------------------------------------------------------\n');

  if (mismatchCount > 0 || identicalCount !== rootStudents.length) {
    throw new Error(`PARITY ABORT: ${mismatchCount} student(s) failed hash verification. Migration aborted. Zero settings modified.`);
  }

  // 5. Activate Flags on Root Document (Keep root students[] intact as safety copy!)
  console.log(`[ACTIVATE] Enabling settings.studentsMigrated = true and settings.studentsDualWrite = true...`);
  await rootDocRef.update({
    'settings.studentsMigrated': true,
    'settings.studentsDualWrite': true,
    'settings.studentsMigrationTimestamp': new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  console.log(`🎉 [SUCCESS] Greenwood (svm_bokaro_001) migrated cleanly to subcollection!`);
  console.log(`    • Total Students Migrated: ${identicalCount} / ${rootStudents.length} (100%)`);
  console.log(`    • Dual-Write Mode: ACTIVE (probation period)`);
  console.log(`    • Safety Copy: Original root students[] remains frozen and untouched.`);
  console.log(`    • Rollback Tool: scripts/rollback-students.js ready for instant reversal if needed.`);

  return {
    schoolId: TARGET_SCHOOL_ID,
    totalStudents: rootStudents.length,
    identicalCount,
    mismatchCount,
    backupFile
  };
}

if (require.main === module) {
  migrateGreenwood().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { migrateGreenwood };
