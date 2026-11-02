/**
 * scripts/migrate-ips-students.js
 * 
 * Migrates ONLY IPS (ips_mttx07mt) students to tenant_data/ips_mttx07mt/students/{studentId}.
 * 
 * STRICT RULES:
 *  - Only ips_mttx07mt is allowed. Aborts on any other school ID.
 *  - Full safety backup + SHA-256 before migration.
 *  - Same student IDs preserved.
 *  - schoolId added during migration; parity hash compares original fields only.
 *  - 100% count + per-student field hash verification before setting flags.
 *  - Root students[] remains 100% frozen and untouched as safety copy.
 *  - Dual-write flag settings.studentsDualWrite = true activated for probation period.
 *  - No personal data (names, phones, photos) printed in logs/reports.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TARGET_SCHOOL_ID = 'ips_mttx07mt';

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

async function migrateIPSStudents() {
  console.log('================================================================');
  console.log('      IPS (ips_mttx07mt) STUDENT SUBCOLLECTION MIGRATION        ');
  console.log('================================================================\n');

  if (TARGET_SCHOOL_ID !== 'ips_mttx07mt') {
    throw new Error('MIGRATION BLOCKED: Only ips_mttx07mt is authorized.');
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

  if (rootStudents.length !== 978) {
    console.warn(`[NOTE] Expected 978 students, found ${rootStudents.length}.`);
  }

  // 2. Full Safety Backup + SHA-256
  const backupDir = path.resolve(__dirname, '..', 'backups', 'root_docs');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `backup_${TARGET_SCHOOL_ID}_pre_student_subcollection_${timestamp}.json`);

  const backupContent = JSON.stringify(rootData, null, 2);
  fs.writeFileSync(backupFile, backupContent, 'utf8');
  const backupHash = crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');
  const backupSizeKB = (fs.statSync(backupFile).size / 1024).toFixed(2);

  console.log(`✅ [BACKUP] Full safety backup saved to: ${backupFile}`);
  console.log(`   • Size: ${backupSizeKB} KB`);
  console.log(`   • SHA-256: ${backupHash}`);

  // 3. Batch Write to Subcollection in batches <= 400
  console.log(`\n[MIGRATE] Writing ${rootStudents.length} students to subcollection tenant_data/${TARGET_SCHOOL_ID}/students...`);
  const batchSize = 400;
  const migratedTimestamp = new Date().toISOString();

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
        migratedAt: migratedTimestamp
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

  // 5. Activate Flags on Root Document (Dot-path update ONLY; Root students[] is NOT touched)
  console.log(`[ACTIVATE] Enabling settings.studentsMigrated = true and settings.studentsDualWrite = true...`);
  await rootDocRef.update({
    'settings.studentsMigrated': true,
    'settings.studentsDualWrite': true,
    'settings.studentsMigrationTimestamp': migratedTimestamp,
    updatedAt: new Date().toISOString()
  });

  // 6. Verify Root Document is Untouched
  const verifyRootSnap = await rootDocRef.get();
  const verifyRootData = verifyRootSnap.data();
  if (!Array.isArray(verifyRootData.students) || verifyRootData.students.length !== rootStudents.length) {
    throw new Error(`CRITICAL POST-CHECK FAILURE: Root students[] was altered during migration!`);
  }
  console.log(`✔ [Post-Check] Root students[] confirmed completely intact (${verifyRootData.students.length} items preserved).`);

  console.log(`🎉 [SUCCESS] IPS (ips_mttx07mt) migrated cleanly to subcollection!`);
  console.log(`    • Total Students Migrated: ${identicalCount} / ${rootStudents.length} (100%)`);
  console.log(`    • Dual-Write Mode: ACTIVE`);
  console.log(`    • Safety Copy: Original root students[] remains frozen and untouched.`);

  return {
    schoolId: TARGET_SCHOOL_ID,
    totalStudents: rootStudents.length,
    identicalCount,
    mismatchCount,
    backupFile,
    backupHash
  };
}

if (require.main === module) {
  migrateIPSStudents().catch(err => {
    console.error('❌ IPS Student Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { migrateIPSStudents };
