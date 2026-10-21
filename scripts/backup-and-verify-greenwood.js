const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
const db = admin.firestore();

const SCHOOL_ID = 'svm_bokaro_001';

async function backupAndVerifyGreenwood() {
  console.log(`=== P1: Full Greenwood (${SCHOOL_ID}) Backup ===`);
  const rootRef = db.collection('tenant_data').doc(SCHOOL_ID);
  const rootSnap = await rootRef.get();
  if (!rootSnap.exists) {
    throw new Error(`School ${SCHOOL_ID} does not exist in Firestore!`);
  }
  const rootData = rootSnap.data();

  const subcollections = {};
  const colRefs = await rootRef.listCollections();
  
  for (const col of colRefs) {
    const colId = col.id;
    subcollections[colId] = {};

    if (colId === 'fees_years') {
      const yearDocs = await col.listDocuments();
      for (const yDoc of yearDocs) {
        const ySnap = await yDoc.get();
        const mCols = await yDoc.collection('months').listDocuments();
        const monthsData = {};
        for (const mDoc of mCols) {
          const mSnap = await mDoc.get();
          monthsData[mDoc.id] = { data: mSnap.data() };
        }
        subcollections[colId][yDoc.id] = {
          data: ySnap.data() || {},
          subcollections: { months: monthsData }
        };
      }
    } else {
      // Single get() for entire subcollection
      const snap = await col.get();
      snap.forEach(doc => {
        subcollections[colId][doc.id] = { data: doc.data() };
      });
    }
    console.log(`- Subcollection [${colId}]: fetched ${Object.keys(subcollections[colId]).length} docs`);
  }

  const backupPayload = {
    schoolId: SCHOOL_ID,
    timestamp: new Date().toISOString(),
    rootData: rootData,
    subcollections: subcollections
  };

  const backupDir = path.resolve(__dirname, '..', 'backups', 'full');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const tsStr = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `${SCHOOL_ID}_full_pre_phase1b_${tsStr}.json`;
  const backupFilePath = path.join(backupDir, backupFileName);

  fs.writeFileSync(backupFilePath, JSON.stringify(backupPayload, null, 2), 'utf8');
  console.log(`✅ Backup written to: ${backupFilePath}`);

  // Verification of backup
  const stats = fs.statSync(backupFilePath);
  console.log(`Backup size: ${(stats.size / 1024).toFixed(2)} KB`);
  if (stats.size < 50000) {
    throw new Error(`Backup file size is suspiciously small: ${stats.size} bytes`);
  }
  const parsedBackup = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
  if (!parsedBackup.rootData || !parsedBackup.subcollections.private) {
    throw new Error('Backup verification failed: rootData or private subcollection missing!');
  }
  console.log(`✅ P1 Verified: Full backup valid and complete.`);

  console.log(`\n=== P2: Parity Check (Root vs private/credentials) ===`);
  const credDocSnap = await rootRef.collection('private').doc('credentials').get();
  if (!credDocSnap.exists) {
    throw new Error(`CRITICAL: private/credentials doc does NOT exist for ${SCHOOL_ID}!`);
  }
  const credData = credDocSnap.data();

  const isIsolated = rootData.settings?.credentialsIsolated === true;
  console.log(`credentialsIsolated setting in root: ${isIsolated}`);
  if (!isIsolated) {
    throw new Error(`P2 FAILED: settings.credentialsIsolated is not true!`);
  }

  // Admin password check
  const rootAdminPass = rootData.settings?.adminPassword;
  const privAdminPass = credData.settings?.adminPassword || credData.adminPassword;
  console.log(`Root adminPassword hash:    ${rootAdminPass ? rootAdminPass.substring(0, 15) + '...' : '(missing)'}`);
  console.log(`Private adminPassword hash: ${privAdminPass ? privAdminPass.substring(0, 15) + '...' : '(missing)'}`);
  if (!rootAdminPass || rootAdminPass !== privAdminPass) {
    throw new Error(`P2 FAILED: Admin password mismatch between root and private/credentials!`);
  }
  console.log(`✅ Admin password hash is byte-identical.`);

  // Teachers check
  const rootTeachers = rootData.teachers || [];
  const privTeachers = credData.teachers || {};
  const isPrivMap = !Array.isArray(privTeachers) && typeof privTeachers === 'object';
  const privTeacherCount = isPrivMap ? Object.keys(privTeachers).length : (Array.isArray(privTeachers) ? privTeachers.length : 0);
  console.log(`Root teachers count:    ${rootTeachers.length}`);
  console.log(`Private teachers count: ${privTeacherCount}`);

  let teachersMatchCount = 0;

  for (const rt of rootTeachers) {
    const pt = isPrivMap ? privTeachers[rt.id] : (privTeachers.find ? privTeachers.find(t => t.id === rt.id) : null);
    if (!pt) {
      throw new Error(`P2 FAILED: Teacher ${rt.id} (${rt.name}) found in root but missing in private/credentials!`);
    }
    const privHash = pt.passwordHash || pt.password;
    if (rt.password !== privHash) {
      throw new Error(`P2 FAILED: Password hash mismatch for teacher ${rt.id} (${rt.name})!\nRoot: ${rt.password}\nPriv: ${privHash}`);
    }
    teachersMatchCount++;
  }

  if (teachersMatchCount !== rootTeachers.length) {
    throw new Error(`P2 FAILED: Only ${teachersMatchCount}/${rootTeachers.length} teachers matched!`);
  }
  console.log(`✅ Teacher password hashes: ${teachersMatchCount}/${rootTeachers.length} byte-identical.`);

  // Scan root for any other bcrypt hashes ($2a$ or $2b$)
  console.log(`\n--- Root Hash Audit ---`);
  const rootJson = JSON.stringify(rootData);
  const hashMatches = rootJson.match(/\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g) || [];
  console.log(`Total bcrypt hashes in root: ${hashMatches.length}`);
  console.log(`Expected: ${1 + rootTeachers.length} (1 admin + ${rootTeachers.length} teachers)`);
  if (hashMatches.length !== 1 + rootTeachers.length) {
    console.warn(`WARNING: Found extra hashes in root! Count = ${hashMatches.length}`);
  }

  return {
    backupFilePath,
    rootTeachersCount: rootTeachers.length,
    matchedTeachersCount: teachersMatchCount,
    adminHashMatched: true,
    initialHashesInRoot: hashMatches.length
  };
}

backupAndVerifyGreenwood().then(res => {
  console.log('\nRESULT: P1 and P2 PASSED SUCCESSFULLY!');
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}).catch(err => {
  console.error('\n❌ ERROR in P1/P2:', err.message);
  process.exit(1);
});
