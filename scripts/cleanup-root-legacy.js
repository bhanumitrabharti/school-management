const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load Admin SDK
if (!admin.apps.length) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: 'ctrl-shift-solutions' });
  } else {
    const saPath = path.resolve(__dirname, '../service-account-key.json');
    if (fs.existsSync(saPath)) {
      admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
    } else {
      admin.initializeApp();
    }
  }
}
const db = admin.firestore();

async function cleanupRootLegacy(schoolId, confirmSchool, iHaveBhanuGo) {
  console.log(`=== Root Document Legacy Field Cleanup ===`);
  console.log(`Target Tenant: ${schoolId}`);

  // Guard 1: Explicit Bhanu GO flag
  if (!iHaveBhanuGo) {
    console.error(`❌ BLOCKED: Cleanup requires explicit authorization flag --i-have-bhanu-go.`);
    console.error(`This script MUST NOT be run without Bhanu's explicit go.`);
    process.exit(1);
  }

  // Guard 2: Confirm school matches
  if (!confirmSchool || confirmSchool !== schoolId) {
    console.error(`❌ BLOCKED: --confirm-school "${confirmSchool}" does not match --school "${schoolId}".`);
    process.exit(1);
  }

  // Guard 3: Backup file check
  const backupDir = path.resolve(__dirname, '../backups/root_docs');
  if (!fs.existsSync(backupDir)) {
    console.error(`❌ BLOCKED: Backup directory ${backupDir} does not exist!`);
    process.exit(1);
  }
  const files = fs.readdirSync(backupDir).filter(f => f.startsWith(`backup_${schoolId}_`) && f.endsWith('.json'));
  if (files.length === 0) {
    console.error(`❌ BLOCKED: No local JSON backup found for school ${schoolId} in ${backupDir}!`);
    console.error(`You MUST have a verified backup file before any field deletion.`);
    process.exit(1);
  }
  console.log(`✔ Verified backup file present: ${files[files.length - 1]}`);

  // Guard 4: Verified Migration Report in Firestore
  const reportsSnap = await db.collection(`tenant_data/${schoolId}/migration_reports`)
    .where('status', '==', 'verified')
    .get();

  if (reportsSnap.empty) {
    console.error(`❌ BLOCKED: No verified migration report found in tenant_data/${schoolId}/migration_reports!`);
    console.error(`You MUST complete migration with parity verification before cleanup.`);
    process.exit(1);
  }
  const latestReport = reportsSnap.docs[reportsSnap.docs.length - 1].data();
  console.log(`✔ Verified migration report found: runId=${latestReport.runId}, timestamp=${latestReport.timestamp}`);

  // Guard 5: Check root doc storageVersion >= 2
  const docRef = db.doc(`tenant_data/${schoolId}`);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    console.error(`❌ Tenant document does not exist.`);
    process.exit(1);
  }
  const data = docSnap.data();
  if (!data.settings || data.settings.storageVersion < 2) {
    console.error(`❌ BLOCKED: Tenant storageVersion is not >= 2 (current: ${data.settings && data.settings.storageVersion}).`);
    process.exit(1);
  }

  // Protected fields: NEVER touch or delete
  // settings.credentialsIsolated, private/**, school_access/**, core roster/settings
  const fieldsToDelete = [
    'teacherAttendance',
    'attendanceRequests',
    'teacherCorrectionRequests',
    'absenceIntimationLog',
    'notices',
    'notifications',
    'trash',
    'examAuditLog',
    'examMarksAuditLog',
    'schools',
    'attendance',
    'fees',
    'examMarks',
    'marks'
  ];

  // If students is migrated (subcollection has docs and dualWrite is false)
  if (data.students && data.settings && data.settings.studentsMigrated === true && data.settings.studentsDualWrite === false) {
    fieldsToDelete.push('students');
  }

  const deleteUpdate = {};
  let removedCount = 0;
  for (const f of fieldsToDelete) {
    if (data[f] !== undefined) {
      deleteUpdate[f] = admin.firestore.FieldValue.delete();
      removedCount++;
      console.log(`  - Deleting legacy root field: ${f}`);
    }
  }

  if (removedCount === 0) {
    console.log(`No legacy fields found on root doc. Root is already clean.`);
    return;
  }

  deleteUpdate['settings.legacyFieldsCleanedAt'] = new Date().toISOString();
  deleteUpdate['settings.cleanedFields'] = fieldsToDelete.filter(f => data[f] !== undefined);

  console.log(`Commencing FieldValue.delete() of ${removedCount} fields on tenant_data/${schoolId}...`);
  await docRef.update(deleteUpdate);
  console.log(`✅ SUCCESS: Legacy fields safely deleted from root document.`);
}

async function main() {
  const args = process.argv.slice(2);
  let school = null;
  let confirmSchool = null;
  let iHaveBhanuGo = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--school' && args[i + 1]) { school = args[i + 1]; i++; }
    else if (args[i] === '--confirm-school' && args[i + 1]) { confirmSchool = args[i + 1]; i++; }
    else if (args[i] === '--i-have-bhanu-go') { iHaveBhanuGo = true; }
  }

  if (!school) {
    console.error('Usage: node scripts/cleanup-root-legacy.js --school <id> --confirm-school <id> --i-have-bhanu-go');
    process.exit(1);
  }

  await cleanupRootLegacy(school, confirmSchool, iHaveBhanuGo);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  });
}

module.exports = { cleanupRootLegacy };
