/**
 * scripts/execute-phase1b-removal.js
 * 
 * Executes Phase 1b credential removal on Greenwood (svm_bokaro_001) ROOT doc ONLY:
 * - Deletes settings.adminPassword from root (keeps adminUsername)
 * - Deletes password field from every root teachers[] entry (order and other fields preserved)
 * - Full scan for any $2a$ or $2b$ hashes across root (including trash)
 * - Runs inside an atomic Firestore transaction via Admin SDK
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
const db = admin.firestore();

const SCHOOL_ID = 'svm_bokaro_001';

async function executePhase1bRemoval() {
  console.log(`=== Phase 1b Removal: Greenwood (${SCHOOL_ID}) Root Doc ===`);
  const rootRef = db.collection('tenant_data').doc(SCHOOL_ID);
  const credRef = rootRef.collection('private').doc('credentials');

  // Verify private/credentials is present and intact before touching root
  const credSnap = await credRef.get();
  if (!credSnap.exists) throw new Error('CRITICAL: private/credentials doc is missing!');
  const credData = credSnap.data();
  if (!credData.adminPassword) throw new Error('CRITICAL: private/credentials has no adminPassword!');
  const privTeachers = credData.teachers || {};
  const privCount = typeof privTeachers === 'object' ? Object.keys(privTeachers).length : privTeachers.length;
  console.log(`Pre-check: private/credentials intact with ${privCount} teachers and adminPassword.`);

  // Load P1 backup to ensure exact teacher field parity
  const backupDir = path.resolve(__dirname, '..', 'backups', 'full');
  const backupFiles = fs.readdirSync(backupDir)
    .filter(f => f.startsWith(`${SCHOOL_ID}_full_pre_phase1b_`) && f.endsWith('.json'))
    .sort()
    .reverse();
  if (backupFiles.length === 0) throw new Error('CRITICAL: No P1 backup found!');
  const backupPath = path.join(backupDir, backupFiles[0]);
  console.log(`Comparing against P1 backup: ${backupPath}`);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const backupTeachers = backup.rootData.teachers || [];

  let removedAdminPassHash = null;
  let removedTeacherPasswordsCount = 0;

  // Execute atomic transaction
  await db.runTransaction(async tx => {
    const rootSnap = await tx.get(rootRef);
    if (!rootSnap.exists) throw new Error(`Document ${SCHOOL_ID} does not exist!`);
    const data = rootSnap.data();

    if (data.settings?.credentialsIsolated !== true) {
      throw new Error('ABORT: credentialsIsolated is not true!');
    }

    // 1. Delete adminPassword from root settings
    if (data.settings && data.settings.adminPassword) {
      removedAdminPassHash = data.settings.adminPassword;
      delete data.settings.adminPassword;
    }

    // 2. Delete password from every teacher entry
    if (Array.isArray(data.teachers)) {
      data.teachers = data.teachers.map(t => {
        const copy = Object.assign({}, t);
        if (copy.password) {
          removedTeacherPasswordsCount++;
          delete copy.password;
        }
        return copy;
      });
    }

    // 3. Delete password from trash if present
    if (Array.isArray(data.trash)) {
      data.trash = data.trash.map(item => {
        const copy = Object.assign({}, item);
        if (copy.password) delete copy.password;
        return copy;
      });
    }

    // 4. Pre-commit sanity scan of candidate payload
    const candidateJson = JSON.stringify(data);
    const residualHashes = candidateJson.match(/\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g) || [];
    if (residualHashes.length > 0) {
      throw new Error(`ABORT: Found ${residualHashes.length} residual bcrypt hashes in candidate payload!`);
    }

    tx.set(rootRef, data);
  });

  console.log('✅ Transaction committed successfully.');
  console.log(`- Removed adminPassword hash: ${removedAdminPassHash ? removedAdminPassHash.substring(0, 15) + '...' : '(none)'}`);
  console.log(`- Removed passwords from ${removedTeacherPasswordsCount} teachers.`);

  // Post-check: fetch directly from Firestore
  console.log('\n--- Post-Removal Verification ---');
  const postSnap = await rootRef.get();
  const postData = postSnap.data();
  const postJson = JSON.stringify(postData);

  const hashesInRoot = (postJson.match(/\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g) || []).length;
  console.log(`Total bcrypt hashes in root: ${hashesInRoot} (Expected: 0)`);
  if (hashesInRoot !== 0) throw new Error(`POST-CHECK FAILED: Root still contains ${hashesInRoot} hashes!`);

  console.log(`settings.adminPassword in root: ${postData.settings?.adminPassword || 'undefined (DELETED)'}`);
  console.log(`settings.adminUsername in root: ${postData.settings?.adminUsername}`);
  if (!postData.settings?.adminUsername) throw new Error('settings.adminUsername was accidentally erased!');

  // Verify teachers
  const postTeachers = postData.teachers || [];
  console.log(`Teachers count: ${postTeachers.length} (Expected: ${backupTeachers.length})`);
  if (postTeachers.length !== backupTeachers.length) {
    throw new Error(`POST-CHECK FAILED: Teacher count mismatch! ${postTeachers.length} vs ${backupTeachers.length}`);
  }

  for (let i = 0; i < backupTeachers.length; i++) {
    const bt = backupTeachers[i];
    const pt = postTeachers[i];
    if (pt.id !== bt.id) throw new Error(`Teacher order mismatch at index ${i}: ${pt.id} vs ${bt.id}`);
    if (pt.password !== undefined) throw new Error(`Teacher ${pt.id} still has password property!`);
    
    // Check all non-password properties
    for (const key of Object.keys(bt)) {
      if (key === 'password') continue;
      if (JSON.stringify(pt[key]) !== JSON.stringify(bt[key])) {
        throw new Error(`Teacher ${pt.id} field '${key}' mismatch!\nBefore: ${JSON.stringify(bt[key])}\nAfter: ${JSON.stringify(pt[key])}`);
      }
    }
  }
  console.log('✅ All 13 teachers non-password fields and ordering are 100% byte-identical to backup.');

  // Verify private/credentials document is unchanged
  const postCredSnap = await credRef.get();
  const postCredData = postCredSnap.data();
  if (JSON.stringify(postCredData) !== JSON.stringify(credData)) {
    throw new Error('POST-CHECK FAILED: private/credentials document was mutated during removal!');
  }
  console.log('✅ private/credentials document remains 100% byte-identical to pre-check.');

  return {
    schoolId: SCHOOL_ID,
    backupUsed: backupPath,
    removedAdminPassHash: !!removedAdminPassHash,
    removedTeacherPasswordsCount,
    hashesInRootAfter: hashesInRoot,
    privateCredentialsIntact: true,
    teachersParity: '100% byte-identical'
  };
}

executePhase1bRemoval().then(res => {
  console.log('\nPHASE 1b REMOVAL SUCCESSFUL:');
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}).catch(err => {
  console.error('\n❌ REMOVAL ERROR:', err);
  process.exit(1);
});
