/**
 * scripts/rollback-svm-phase1.js
 * 
 * Phase 1 Rollback for SVM (svm_mqbv7qm2):
 * Restores root credential fields (settings.adminPassword, teachers[].password)
 * byte-identical from the P1 full backup and sets settings.credentialsIsolated = false.
 * 
 * Usage:
 *   node scripts/rollback-svm-phase1.js [--dry-run] [--backup <path>]
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length && fs.existsSync(saPath)) {
  admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
}
const db = admin.firestore();

const SCHOOL_ID = 'svm_mqbv7qm2';

async function rollbackSvmPhase1() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  let backupPath = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--backup' && args[i + 1]) backupPath = args[i + 1];
  }

  if (!backupPath) {
    const backupDir = path.resolve(__dirname, '..', 'backups', 'full');
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith(`${SCHOOL_ID}_full_pre_phase1_`) && f.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length > 0) {
      backupPath = path.join(backupDir, files[0]);
    }
  }

  if (!backupPath || !fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found for ${SCHOOL_ID}: ${backupPath}`);
  }

  console.log(`=== SVM Phase 1 Rollback ===`);
  console.log(`School ID:   ${SCHOOL_ID}`);
  console.log(`Backup File: ${backupPath}`);
  console.log(`Dry Run:     ${isDryRun}`);

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const backupRoot = backup.rootData;
  if (!backupRoot) throw new Error('Backup rootData is missing!');

  const docRef = db.collection('tenant_data').doc(SCHOOL_ID);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error(`Target document tenant_data/${SCHOOL_ID} does not exist!`);
  const currentData = snap.data();

  const backupAdminPass = backupRoot.settings?.adminPassword;
  const backupTeachers = backupRoot.teachers || [];
  const backupTeacherMap = new Map(backupTeachers.map(t => [t.id, t.password]));

  console.log(`Backup adminPassword hash present: ${Boolean(backupAdminPass)}`);
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
    console.log('\n[DRY RUN SUCCESS] Verified backup and candidate restoration payload. Zero writes performed.');
    return {
      schoolId: SCHOOL_ID,
      backupPath,
      dryRun: true,
      adminPasswordRestored: Boolean(backupAdminPass),
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

  const verifySnap = await docRef.get();
  const verifyData = verifySnap.data();
  const vHashes = (JSON.stringify(verifyData).match(/\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g) || []).length;
  console.log(`Hashes in root doc after rollback: ${vHashes}`);
  console.log(`credentialsIsolated in root: ${verifyData.settings.credentialsIsolated}`);

  return {
    schoolId: SCHOOL_ID,
    backupPath,
    dryRun: false,
    hashesAfterRollback: vHashes
  };
}

rollbackSvmPhase1().then(() => process.exit(0)).catch(err => {
  console.error('Rollback error:', err);
  process.exit(1);
});
