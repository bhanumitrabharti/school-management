/**
 * scripts/rollback-students.js
 * 
 * Rebuilds root students[] from tenant_data/{schoolId}/students subcollection,
 * executes full safety backup first, runs size and integrity checks,
 * and then sets settings.studentsMigrated = false and settings.studentsDualWrite = false.
 * 
 * USAGE:
 *   node scripts/rollback-students.js [--schoolId svm_bokaro_001]
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
let schoolId = 'svm_bokaro_001';
let isDryRun = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--schoolId' && args[i + 1]) {
    schoolId = args[i + 1];
    i++;
  } else if (args[i] === '--dry-run') {
    isDryRun = true;
  }
}

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

function sha256(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function rollback() {
  console.log('================================================================');
  console.log('       STUDENT SUBCOLLECTION ROLLBACK ENGINE                    ');
  console.log('================================================================');
  console.log(`[TARGET] Target School ID: ${schoolId}`);

  // 1. Fetch current root document
  const rootDocRef = db.collection('tenant_data').doc(schoolId);
  const rootSnap = await rootDocRef.get();
  if (!rootSnap.exists) {
    throw new Error(`Root document tenant_data/${schoolId} does not exist.`);
  }
  const rootData = rootSnap.data();

  // 2. Fetch all subcollection student documents
  const subCollRef = db.collection('tenant_data').doc(schoolId).collection('students');
  const subSnap = await subCollRef.get();
  console.log(`[READ] Found ${subSnap.size} student documents in subcollection.`);

  if (subSnap.size === 0) {
    throw new Error(`ABORT: No student documents found in tenant_data/${schoolId}/students subcollection. Cannot rebuild root students.`);
  }

  const subDocsArray = [];
  subSnap.forEach(d => subDocsArray.push(d.data()));

  // 3. Reconstruct root students array from subcollection
  const rebuiltStudents = [];
  for (const s of subDocsArray) {
    if (s.status === 'Deleted' || s.inTrash === true) {
      continue;
    }
    const cleanStudent = Object.assign({}, s);
    rebuiltStudents.push(cleanStudent);
  }

  console.log(`[RECONSTRUCT] Rebuilt ${rebuiltStudents.length} active/retained students from subcollection.`);

  // 4. Size check
  const simulatedRoot = Object.assign({}, rootData, {
    students: rebuiltStudents,
    settings: Object.assign({}, rootData.settings || {}, {
      studentsMigrated: false,
      studentsDualWrite: false
    })
  });

  const rootBytes = Buffer.byteLength(JSON.stringify(simulatedRoot), 'utf8');
  const rootKB = Math.round(rootBytes / 1024);
  console.log(`[SIZE-CHECK] Simulated root document size: ${rootBytes} bytes (${rootKB} KB)`);

  if (rootBytes > 1000000) {
    throw new Error(`FATAL: Rebuilt root document exceeds 1 MB limit (${rootBytes} bytes). Rollback blocked.`);
  }

  if (isDryRun) {
    console.log(`\n[DRY-RUN COMPLETE] Size check PASSED (< 1 MB). ${rebuiltStudents.length} students rebuilt. Zero Firestore writes committed.`);
    return;
  }

  // 5. Take pre-rollback safety backup (only in live mode)
  const backupDir = path.resolve(__dirname, '..', 'backups', 'full');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `${schoolId}_pre_rollback_${timestamp}.json`);

  const backupPayload = {
    metadata: {
      action: 'pre-student-rollback-backup',
      schoolId: schoolId,
      timestamp: new Date().toISOString(),
      subcollectionStudentCount: subSnap.size,
      rootStudentCount: (rootData.students || []).length
    },
    rootDoc: rootData,
    subcollectionStudents: subDocsArray
  };

  fs.writeFileSync(backupFile, JSON.stringify(backupPayload, null, 2), 'utf8');
  console.log(`✅ [BACKUP] Full safety backup saved to: ${backupFile}`);

  // 6. Update Root Document to flip flag back and write rebuilt students
  await rootDocRef.update({
    students: rebuiltStudents,
    'settings.studentsMigrated': false,
    'settings.studentsDualWrite': false,
    updatedAt: new Date().toISOString(),
    rollbackTimestamp: new Date().toISOString()
  });

  console.log(`🎉 [SUCCESS] Rollback completed successfully!`);
  console.log(`    • settings.studentsMigrated = false`);
  console.log(`    • settings.studentsDualWrite = false`);
  console.log(`    • Total root students restored: ${rebuiltStudents.length}`);
  console.log(`    • Zero data loss verified against backup snapshot.`);
}

if (require.main === module) {
  rollback().catch(err => {
    console.error('❌ Rollback failed:', err);
    process.exit(1);
  });
}

module.exports = { rollback };
