/**
 * scripts/test-v1-stale-client-clobber.js
 * 
 * Tests and proves the STALE-CLIENT CLOBBER scenario (V1) in the emulator:
 * 1. Client A loads school data (teachers: [T1, T2], adminPassword: oldAdminHash).
 * 2. Server (Client B / API) adds T3 and resets T1 password using api/manage-credentials.
 * 3. Client A (stale in-memory store) triggers SchoolApp.save().
 * 4. Measures whether T3 is lost and whether T1 password reverts in root doc.
 */

const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

const DUMMY_SCHOOL = 'dummy_test_school_isolated';
const PROJECT_ID = 'ctrl-shift-solutions';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID });
}
const db = admin.firestore();

async function runTest() {
  console.log('================================================================');
  console.log('   V1 AUDIT: STALE CLIENT CLOBBER PROOF TEST                    ');
  console.log('================================================================\n');

  // 1. Initial State
  const initialAdminHash = bcrypt.hashSync('OldAdminPass123', 10);
  const initialT1Hash = bcrypt.hashSync('OldT1Pass123', 10);
  const initialT2Hash = bcrypt.hashSync('OldT2Pass123', 10);

  const initialDoc = {
    settings: {
      credentialsIsolated: true,
      adminUsername: 'admin',
      adminPassword: initialAdminHash,
      schoolName: 'Dummy School'
    },
    teachers: [
      { id: 'T1', firstName: 'Teacher', lastName: 'One', email: 't1@dummy.school', password: initialT1Hash, status: 'Active' },
      { id: 'T2', firstName: 'Teacher', lastName: 'Two', email: 't2@dummy.school', password: initialT2Hash, status: 'Active' }
    ],
    students: [
      { id: 'S1', name: 'Student One', class: '1', section: 'A' }
    ]
  };

  await db.collection('tenant_data').doc(DUMMY_SCHOOL).set(initialDoc);
  await db.collection('tenant_data').doc(DUMMY_SCHOOL).collection('private').doc('credentials').set({
    adminUsername: 'admin',
    adminPassword: initialAdminHash,
    teachers: {
      'T1': { username: 't1@dummy.school', email: 't1@dummy.school', passwordHash: initialT1Hash },
      'T2': { username: 't2@dummy.school', email: 't2@dummy.school', passwordHash: initialT2Hash }
    }
  });

  console.log('[STEP 1] Client Tab A opens and loads initial store into memory:');
  // Client Tab A memory snapshot
  const clientTabA_store = JSON.parse(JSON.stringify(initialDoc));
  console.log(`  Tab A teachers in memory: [${clientTabA_store.teachers.map(t => t.id).join(', ')}]`);
  console.log(`  Tab A T1 password hash: ${clientTabA_store.teachers[0].password.substr(0, 15)}...`);

  // 2. Server (Client B) adds T3 and resets T1 password via api/manage-credentials
  console.log('\n[STEP 2] Server (Tab B / API) adds T3 and resets T1 password via api/manage-credentials:');
  const manageHandler = require('../api/manage-credentials.js');

  const adminUid = 'uid_admin_clobber_test';
  await db.collection('school_access').doc(adminUid).set({
    schoolId: DUMMY_SCHOOL,
    role: 'admin'
  });

  const origVerify = admin.auth().verifyIdToken;
  admin.auth().verifyIdToken = async () => ({ uid: adminUid });

  function mockReqRes(body) {
    let sc = 200, resData = null;
    return {
      req: { method: 'POST', body, headers: { origin: 'https://www.ctrlshifts.in' } },
      res: {
        setHeader() { return this; },
        status(c) { sc = c; return this; },
        json(d) { resData = d; return this; },
        end() { return this; },
        get _statusCode() { return sc; },
        get _data() { return resData; }
      }
    };
  }

  // Server adds T3
  const newT3Pass = 'NewT3Secret789';
  const addT3Req = mockReqRes({
    idToken: 'mock_token',
    schoolId: DUMMY_SCHOOL,
    action: 'add-teacher',
    teacherData: { id: 'T3', firstName: 'Teacher', lastName: 'Three', email: 't3@dummy.school', status: 'Active' },
    rawPassword: newT3Pass
  });
  await manageHandler(addT3Req.req, addT3Req.res);

  // Server resets T1 password
  const newT1Pass = 'ResetT1Secret456';
  const resetT1Req = mockReqRes({
    idToken: 'mock_token',
    schoolId: DUMMY_SCHOOL,
    action: 'set-teacher-password',
    teacherId: 'T1',
    newPassword: newT1Pass
  });
  await manageHandler(resetT1Req.req, resetT1Req.res);

  // Verify server state in Firestore right now
  const postServerDoc = (await db.collection('tenant_data').doc(DUMMY_SCHOOL).get()).data();
  const postServerPrivate = (await db.collection('tenant_data').doc(DUMMY_SCHOOL).collection('private').doc('credentials').get()).data();

  console.log(`  Live Root teachers after server writes: [${postServerDoc.teachers.map(t => t.id).join(', ')}] (Length: ${postServerDoc.teachers.length})`);
  console.log(`  Live Root T1 hash after reset: ${postServerDoc.teachers.find(t => t.id === 'T1').password.substr(0, 15)}...`);
  console.log(`  Live Private teachers: [${Object.keys(postServerPrivate.teachers).join(', ')}]`);

  // 3. Stale Tab A now calls SchoolApp.save()
  console.log('\n[STEP 3] Stale Client Tab A (still having [T1, T2] in memory) performs an unrelated save (e.g. edits school phone):');
  clientTabA_store.settings.phone = '1234567890'; // Tab A edited phone

  // SchoolApp.save() payload builder:
  const payloadToSave = JSON.parse(JSON.stringify(clientTabA_store));
  console.log(`  Tab A payload.teachers being saved: [${payloadToSave.teachers.map(t => t.id).join(', ')}]`);

  // Exactly what SchoolApp.save() does:
  // window.firestore.setDoc(docRef, payload, { merge: true })
  await db.collection('tenant_data').doc(DUMMY_SCHOOL).set(payloadToSave, { merge: true });

  // 4. Check Root Document and Private Document after Stale Tab A Save
  console.log('\n[STEP 4] Inspecting Firestore after Stale Tab A Save:');
  const postClobberRoot = (await db.collection('tenant_data').doc(DUMMY_SCHOOL).get()).data();
  const postClobberPrivate = (await db.collection('tenant_data').doc(DUMMY_SCHOOL).collection('private').doc('credentials').get()).data();

  const rootTeacherIds = postClobberRoot.teachers.map(t => t.id);
  const rootT1 = postClobberRoot.teachers.find(t => t.id === 'T1');
  const t3LostInRoot = !rootTeacherIds.includes('T3');
  const t1RevertedInRoot = rootT1 && rootT1.password === initialT1Hash;

  console.log('----------------------------------------------------------------');
  console.log(`  Root teachers array after Tab A save: [${rootTeacherIds.join(', ')}]`);
  console.log(`  Did T3 get clobbered (lost) from root teachers? ${t3LostInRoot ? '💥 YES (CLOBBERED!)' : 'NO'}`);
  console.log(`  Did T1 password hash revert to old hash in root? ${t1RevertedInRoot ? '💥 YES (REVERTED!)' : 'NO'}`);
  console.log(`  Private credentials document teachers: [${Object.keys(postClobberPrivate.teachers).join(', ')}]`);
  console.log('----------------------------------------------------------------');

  admin.auth().verifyIdToken = origVerify;

  return {
    t3LostInRoot,
    t1RevertedInRoot,
    privateIntact: Boolean(postClobberPrivate.teachers['T3'] && bcrypt.compareSync(newT1Pass, postClobberPrivate.teachers['T1'].passwordHash))
  };
}

runTest().then(res => {
  console.log('\nTEST RESULT:', JSON.stringify(res, null, 2));
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
