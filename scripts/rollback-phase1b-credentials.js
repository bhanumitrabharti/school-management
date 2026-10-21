/**
 * scripts/rollback-phase1b-credentials.js
 * 
 * Phase 1b Rollback:
 * Restores root credential fields (settings.adminPassword, teachers[].password)
 * byte-identical from the P1 full backup and sets settings.credentialsIsolated = false.
 * 
 * Usage:
 *   node scripts/rollback-phase1b-credentials.js --school svm_bokaro_001 --backup <path> [--dry-run]
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length && fs.existsSync(saPath)) {
  admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
}
const db = admin.firestore();

async function rollbackPhase1b() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  let schoolId = 'svm_bokaro_001';
  let backupPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--school' && args[i + 1]) schoolId = args[i + 1];
    if (args[i] === '--backup' && args[i + 1]) backupPath = args[i + 1];
  }

  // If no backup path provided, find latest pre_phase1b backup for school
  if (!backupPath) {
    const backupDir = path.resolve(__dirname, '..', 'backups', 'full');
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith(`${schoolId}_full_pre_phase1b_`) && f.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length > 0) {
      backupPath = path.join(backupDir, files[0]);
    }
  }

  if (!backupPath || !fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  console.log(`=== Phase 1b Rollback ===`);
  console.log(`School ID:   ${schoolId}`);
  console.log(`Backup File: ${backupPath}`);
  console.log(`Dry Run:     ${isDryRun}`);

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const backupRoot = backup.rootData;
  if (!backupRoot) throw new Error('Backup rootData is missing!');

  const docRef = db.collection('tenant_data').doc(schoolId);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error(`Target document tenant_data/${schoolId} does not exist!`);
  const currentData = snap.data();

  const backupAdminPass = backupRoot.settings?.adminPassword;
  const backupTeachers = backupRoot.teachers || [];
  const backupTeacherMap = new Map(backupTeachers.map(t => [t.id, t.password]));

  console.log(`Backup adminPassword hash present: ${!!backupAdminPass}`);
  console.log(`Backup teachers count: ${backupTeachers.length}`);

  let restoredTeacherPasswords = 0;
  const updatedTeachers = (currentData.teachers || []).map(t => {
    const copy = Object.assign({}, t);
    const passFromBackup = backupTeacherMap.get(t.id);
    if (passFromBackup) {
      copy.password = passFromBackup;
      restoredTeacherPasswords++;
    }
    return copy;
  });

  const updatedSettings = Object.assign({}, currentData.settings, {
    credentialsIsolated: false
  });
  if (backupAdminPass) {
    updatedSettings.adminPassword = backupAdminPass;
  }

  console.log(`Restoring adminPassword hash: ${backupAdminPass ? backupAdminPass.substring(0, 15) + '...' : '(none)'}`);
  console.log(`Restoring teacher passwords: ${restoredTeacherPasswords}/${updatedTeachers.length}`);
  console.log(`Setting credentialsIsolated: false`);

  if (isDryRun) {
    console.log('\n[DRY RUN] No writes performed to Firestore.');
    return {
      schoolId,
      backupPath,
      dryRun: true,
      adminPasswordRestored: !!backupAdminPass,
      teachersRestored: restoredTeacherPasswords
    };
  }

  // Atomic write inside transaction
  await db.runTransaction(async tx => {
    const liveSnap = await tx.get(docRef);
    if (!liveSnap.exists) throw new Error('Doc not found during transaction!');
    const liveData = liveSnap.data();

    liveData.settings = Object.assign({}, liveData.settings, {
      credentialsIsolated: false
    });
    if (backupAdminPass) {
      liveData.settings.adminPassword = backupAdminPass;
    }

    liveData.teachers = (liveData.teachers || []).map(t => {
      const copy = Object.assign({}, t);
      const p = backupTeacherMap.get(t.id);
      if (p) copy.password = p;
      return copy;
    });

    tx.set(docRef, liveData);
  });

  console.log('✅ Rollback successfully committed to Firestore inside transaction.');

  // Verify
  const verifySnap = await docRef.get();
  const verifyData = verifySnap.data();
  const vHashes = (JSON.stringify(verifyData).match(/\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g) || []).length;
  console.log(`Hashes in root doc after rollback: ${vHashes}`);
  console.log(`credentialsIsolated in root: ${verifyData.settings.credentialsIsolated}`);

  return {
    schoolId,
    backupPath,
    dryRun: false,
    hashesAfterRollback: vHashes,
    credentialsIsolated: verifyData.settings.credentialsIsolated
  };
}

rollbackPhase1b().then(res => {
  console.log('\nRollback result:');
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Rollback failed:', err);
  process.exit(1);
});
