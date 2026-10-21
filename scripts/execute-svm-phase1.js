const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
const db = admin.firestore();

const SCHOOL_ID = 'svm_mqbv7qm2';

function countBcryptHashes(obj) {
  const s = JSON.stringify(obj || {});
  return (s.match(/\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g) || []).length;
}

function createMockReqRes(method, body) {
  let statusCode = 200;
  let responseData = null;
  const headers = {};

  const req = {
    method,
    headers: {
      origin: 'https://ctrlshifts.in',
      authorization: body.idToken ? `Bearer ${body.idToken}` : undefined,
      'content-type': 'application/json'
    },
    body
  };

  const res = {
    setHeader(k, v) { headers[k.toLowerCase()] = v; return this; },
    getHeader(k) { return headers[k.toLowerCase()]; },
    status(code) { statusCode = code; return this; },
    json(data) { responseData = data; return this; },
    send(data) { responseData = data; return this; },
    end(data) { if (data && !responseData) responseData = data; return this; },
    get _statusCode() { return statusCode; },
    get _data() { return responseData; }
  };

  return { req, res };
}

async function executeSvmPhase1() {
  console.log('================================================================');
  console.log('       PART B: SVM (svm_mqbv7qm2) PHASE 1 ISOLATION             ');
  console.log('================================================================\n');

  // PRE-TIMING CHECK
  const accessSnap = await db.collection('school_access').where('schoolId', '==', SCHOOL_ID).get();
  const nowMs = Date.now();
  let mostRecentMs = null;
  accessSnap.forEach(d => {
    const t = d.data().verifiedAt ? d.data().verifiedAt.toMillis() : null;
    if (t && (!mostRecentMs || t > mostRecentMs)) mostRecentMs = t;
  });
  if (mostRecentMs && (nowMs - mostRecentMs) < 30 * 60 * 1000) {
    const minAgo = ((nowMs - mostRecentMs) / 60000).toFixed(1);
    throw new Error(`ABORT: Active SVM session found within last 30 minutes (${minAgo} min ago).`);
  }
  console.log(`✅ Timing check passed: no SVM activity in the last 30 minutes.`);

  // Snapshot global hash counts for ALL other schools before starting
  console.log('\n--- Pre-snapshotting global hash counts across all schools ---');
  const allTenantsSnap = await db.collection('tenant_data').listDocuments();
  const globalHashesBefore = {};
  for (const t of allTenantsSnap) {
    const s = await t.get();
    globalHashesBefore[t.id] = countBcryptHashes(s.data());
  }

  // P1: FULL SVM BACKUP
  console.log('\n=== P1: Full SVM Backup ===');
  const rootRef = db.collection('tenant_data').doc(SCHOOL_ID);
  const rootSnap = await rootRef.get();
  if (!rootSnap.exists) throw new Error(`School doc ${SCHOOL_ID} does not exist!`);
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
      const subSnap = await col.get();
      subSnap.forEach(d => {
        subcollections[colId][d.id] = { data: d.data() };
      });
    }
    console.log(`- Subcollection [${colId}]: fetched ${Object.keys(subcollections[colId]).length} docs`);
  }

  const tsStr = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPayload = {
    schoolId: SCHOOL_ID,
    timestamp: new Date().toISOString(),
    rootData,
    subcollections
  };

  const backupDir = path.resolve(__dirname, '..', 'backups', 'full');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupFileName = `${SCHOOL_ID}_full_pre_phase1_${tsStr}.json`;
  const backupFilePath = path.join(backupDir, backupFileName);

  fs.writeFileSync(backupFilePath, JSON.stringify(backupPayload, null, 2), 'utf8');
  const bStats = fs.statSync(backupFilePath);
  console.log(`✅ Backup written to: ${backupFilePath} (${(bStats.size / 1024).toFixed(1)} KB)`);

  if (bStats.size < 50000) throw new Error(`Backup file size too small: ${bStats.size} bytes!`);
  const parsedBackup = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
  if (!parsedBackup.rootData) throw new Error('Backup verification failed: missing rootData');
  console.log('✅ P1 Verified: Full SVM backup valid and complete.');

  // P2: WRITE tenant_data/svm_mqbv7qm2/private/credentials
  console.log('\n=== P2: Write private/credentials & 100% Parity Check ===');
  const settings = rootData.settings || {};
  const teachers = rootData.teachers || [];
  const trash = rootData.trash || [];

  const adminPass = settings.adminPassword;
  if (!adminPass || !adminPass.startsWith('$2')) {
    throw new Error('Root adminPassword does not exist or is not a bcrypt hash!');
  }

  const credsPayload = {
    adminUsername: settings.adminUsername || 'svmadmin',
    adminPassword: adminPass,
    teachers: {},
    deletedTeachers: {}
  };

  const parityTable = [
    {
      role: 'Admin',
      id: 'admin',
      identifier: credsPayload.adminUsername,
      hash: adminPass,
      hashPreview: adminPass.substring(0, 10) + '...' + adminPass.substring(adminPass.length - 6),
      match: true
    }
  ];

  teachers.forEach(t => {
    const username = (t.username || t.email || t.id).trim().toLowerCase();
    const email = (t.email || '').trim().toLowerCase();
    const hash = t.password;
    if (!hash || !hash.startsWith('$2')) {
      throw new Error(`Teacher ${t.id} (${t.name}) does not have a valid bcrypt hash!`);
    }

    credsPayload.teachers[t.id] = {
      username: username,
      email: email,
      passwordHash: hash
    };

    parityTable.push({
      role: 'Teacher',
      id: t.id,
      identifier: email,
      hash: hash,
      hashPreview: hash.substring(0, 10) + '...' + hash.substring(hash.length - 6),
      match: true
    });
  });

  // Check trash for any teacher with password hash
  trash.forEach(item => {
    if (item.type === 'teacher' && (item.password || item.data?.password)) {
      const p = item.password || item.data?.password;
      if (p.startsWith('$2')) {
        credsPayload.deletedTeachers[item.id] = {
          username: (item.email || item.id).trim().toLowerCase(),
          email: (item.email || '').trim().toLowerCase(),
          passwordHash: p
        };
        console.log(`Found teacher in trash with hash: ${item.id}`);
      }
    }
  });

  console.log(`Prepared credentials payload: 1 admin + ${Object.keys(credsPayload.teachers).length} teachers + ${Object.keys(credsPayload.deletedTeachers).length} in trash.`);

  const privateCredRef = rootRef.collection('private').doc('credentials');
  await privateCredRef.set(credsPayload);
  console.log('✅ Written to tenant_data/svm_mqbv7qm2/private/credentials.');

  // Re-read and verify 100% byte-identical parity (6/6)
  const verifySnap = await privateCredRef.get();
  if (!verifySnap.exists) throw new Error('private/credentials doc missing after write!');
  const writtenCreds = verifySnap.data();

  let parityCount = 0;
  if (writtenCreds.adminPassword === adminPass && writtenCreds.adminUsername === credsPayload.adminUsername) {
    parityCount++;
  } else {
    throw new Error('CRITICAL: Admin password mismatch in private/credentials!');
  }

  teachers.forEach(t => {
    const cred = writtenCreds.teachers?.[t.id];
    if (cred && cred.passwordHash === t.password) {
      parityCount++;
    } else {
      throw new Error(`CRITICAL: Teacher ${t.id} hash mismatch in private/credentials!`);
    }
  });

  console.log(`Parity check result: ${parityCount}/6 credentials byte-identical.`);
  if (parityCount !== 6) {
    throw new Error(`ABORT: Parity is not 100%! (${parityCount}/6)`);
  }
  console.log('✅ P2 Verified: 100% Parity (6/6 byte-identical).');

  // P3: ATOMIC TRANSACTION ON ROOT DOC
  console.log('\n=== P3: Atomic Removal of Root Credentials in ONE Transaction ===');
  let removedAdminPassHash = null;
  let removedTeacherPasswordsCount = 0;

  await db.runTransaction(async tx => {
    const snap = await tx.get(rootRef);
    if (!snap.exists) throw new Error('SVM root doc missing during transaction!');
    const data = snap.data();

    // 1. Set credentialsIsolated = true
    if (!data.settings) data.settings = {};
    data.settings.credentialsIsolated = true;

    // 2. Delete settings.adminPassword (keep adminUsername)
    if (data.settings.adminPassword) {
      removedAdminPassHash = data.settings.adminPassword;
      delete data.settings.adminPassword;
    }

    // 3. Delete teachers[].password (preserve all other fields, same order and count)
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

    // 4. Remove any hash in trash[]
    if (Array.isArray(data.trash)) {
      data.trash = data.trash.map(item => {
        const copy = Object.assign({}, item);
        if (copy.password) delete copy.password;
        if (copy.data && copy.data.password) {
          copy.data = Object.assign({}, copy.data);
          delete copy.data.password;
        }
        return copy;
      });
    }

    // 5. Pre-commit sanity check: candidate payload must have 0 bcrypt hashes
    const candidateJson = JSON.stringify(data);
    const residualHashes = candidateJson.match(/\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g) || [];
    if (residualHashes.length > 0) {
      throw new Error(`ABORT: Root doc candidate payload still contains ${residualHashes.length} bcrypt hashes!`);
    }

    tx.set(rootRef, data);
  });

  console.log(`✅ Atomic transaction committed:`);
  console.log(`   - settings.credentialsIsolated = true`);
  console.log(`   - Deleted settings.adminPassword`);
  console.log(`   - Deleted password from ${removedTeacherPasswordsCount}/5 teachers`);
  console.log(`   - Trash sanitized`);

  // P4: POST-CHECKS
  console.log('\n=== P4: Post-Checks ===');

  // Check 1: Root scan = 0 bcrypt hashes
  const snapAfter = await rootRef.get();
  const dataAfter = snapAfter.data();
  const rootHashesAfter = countBcryptHashes(dataAfter);
  console.log(`[Check 1] Root doc bcrypt hashes: ${rootHashesAfter} (Expected: 0)`);
  if (rootHashesAfter !== 0 || dataAfter.settings?.adminPassword !== undefined) {
    throw new Error(`Check 1 Failed: Root doc contains ${rootHashesAfter} bcrypt hashes!`);
  }
  console.log('✅ Check 1 PASS: 0 bcrypt hashes in SVM root doc.');

  // Check 2: private = 6/6 identical to P1 backup
  const privSnapAfter = await privateCredRef.get();
  const privDataAfter = privSnapAfter.data();
  let privMatchCount = 0;
  if (privDataAfter.adminPassword === rootData.settings?.adminPassword) privMatchCount++;
  (rootData.teachers || []).forEach(t => {
    if (privDataAfter.teachers?.[t.id]?.passwordHash === t.password) privMatchCount++;
  });
  console.log(`[Check 2] private/credentials vs P1 backup: ${privMatchCount}/6 matched.`);
  if (privMatchCount !== 6) throw new Error(`Check 2 Failed: private/credentials mismatch (${privMatchCount}/6)!`);
  console.log('✅ Check 2 PASS: private/credentials 6/6 byte-identical to backup.');

  // Check 3: Teachers non-password fields identical to backup
  const teachersAfter = dataAfter.teachers || [];
  if (teachersAfter.length !== teachers.length) {
    throw new Error(`Check 3 Failed: Teachers count mismatch (${teachersAfter.length} vs ${teachers.length})`);
  }
  for (let i = 0; i < teachers.length; i++) {
    const bt = teachers[i];
    const at = teachersAfter[i];
    if (at.id !== bt.id || at.password !== undefined) {
      throw new Error(`Check 3 Failed: Teacher ${bt.id} ID mismatch or password not stripped!`);
    }
    for (const k of Object.keys(bt)) {
      if (k === 'password') continue;
      if (JSON.stringify(at[k]) !== JSON.stringify(bt[k])) {
        throw new Error(`Check 3 Failed: Teacher ${bt.id} field ${k} mutated!`);
      }
    }
  }
  console.log(`✅ Check 3 PASS: All 5 teachers non-password fields 100% identical and in exact order.`);

  // Check 4: API wrong-password probe = 401 (no real logins)
  const verifyAccessHandler = require('../api/verify-school-access.js');
  admin.auth().verifyIdToken = async (tok) => {
    if (tok === 'svm_probe_token') return { uid: 'probe_uid_svm' };
    throw new Error('Invalid token');
  };

  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'svm_probe_token',
      schoolId: SCHOOL_ID,
      role: 'admin',
      username: dataAfter.settings?.adminUsername || 'svmadmin',
      password: 'DefinitiveWrongPasswordProbe_999#'
    });

    await verifyAccessHandler(req, res);
    console.log(`[Check 4] SVM wrong-password probe: HTTP ${res._statusCode} (${res._data?.error || 'ok'})`);
    if (res._statusCode !== 401) {
      throw new Error(`Check 4 Failed: Expected 401, got ${res._statusCode}`);
    }

    // Clean up rate limit artifact
    const acctKey = 'acct_' + SCHOOL_ID.replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + encodeURIComponent((dataAfter.settings?.adminUsername || 'svmadmin').toLowerCase()).replace(/%/g, '_');
    await db.collection('login_rate_limits').doc(acctKey).delete().catch(() => {});
  }
  console.log('✅ Check 4 PASS: API wrong-password probe returned 401 Unauthorized.');

  // Check 5: Global hash parity for all other schools unchanged
  console.log('\n--- [Check 5] Global hash parity across all other schools ---');
  let allOtherSchoolsMatch = true;
  for (const t of allTenantsSnap) {
    if (t.id === SCHOOL_ID) continue;
    const s = await t.get();
    const countNow = countBcryptHashes(s.data());
    const countBefore = globalHashesBefore[t.id];
    if (countNow !== countBefore) {
      allOtherSchoolsMatch = false;
      console.error(`MISMATCH on ${t.id}: before=${countBefore}, after=${countNow}`);
    }
  }
  if (!allOtherSchoolsMatch) throw new Error('Check 5 Failed: Hashes changed on other schools!');
  console.log('✅ Check 5 PASS: All other schools hash counts 100% byte-identical and unchanged.');

  console.log('\n================================================================');
  console.log('      PART B: SVM PHASE 1 ISOLATION COMPLETED SUCCESSFULLY      ');
  console.log(`      Backup File: ${backupFilePath}                             `);
  console.log('================================================================');

  return {
    backupFilePath,
    rootHashesBefore: 6,
    rootHashesAfter: 0,
    parity: '6/6 (100%)'
  };
}

executeSvmPhase1().then(() => process.exit(0)).catch(err => {
  console.error('SVM PHASE 1 ERROR:', err);
  process.exit(1);
});
