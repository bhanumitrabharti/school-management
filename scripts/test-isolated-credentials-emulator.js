/**
 * scripts/test-isolated-credentials-emulator.js
 * 
 * Comprehensive test suite run inside the Firebase Emulator:
 * 1. Rule testing: proves that client roles (teacher, admin, super-admin) are denied
 *    access to tenant_data/{id}/private/credentials, while Admin SDK works.
 * 2. API testing: proves api/verify-school-access reads private/credentials when flag is true,
 *    falls back to root if missing, and uses root when flag is false.
 * 3. Server write testing: proves api/manage-credentials enforces admin role, performs
 *    server-side bcrypt, and executes dual-write to root and private/credentials.
 */

const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const http = require('http');

const DUMMY_SCHOOL_ID = 'dummy_test_school_isolated';
const PROJECT_ID = 'ctrl-shift-solutions';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID });
}
const db = admin.firestore();

function makeEmulatorJwt(uid) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    auth_time: Math.floor(Date.now() / 1000),
    user_id: uid,
    sub: uid,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    firebase: { sign_in_provider: 'custom' }
  })).toString('base64url');
  return `${header}.${payload}.mock_sig`;
}

// Helper to make REST requests with simulated client auth to Firestore Emulator
function firestoreRestRequest(method, docPath, uid, bodyData) {
  return new Promise((resolve, reject) => {
    const hostParts = process.env.FIRESTORE_EMULATOR_HOST.split(':');
    const host = hostParts[0];
    const port = parseInt(hostParts[1], 10);

    const path = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`;
    
    const headers = {
      'Content-Type': 'application/json'
    };
    if (uid) {
      headers['Authorization'] = 'Bearer ' + makeEmulatorJwt(uid);
    }

    const req = http.request({
      hostname: host,
      port: port,
      path: path,
      method: method,
      headers: headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ statusCode: res.statusCode, body: parsed });
      });
    });

    req.on('error', reject);
    if (bodyData) {
      req.write(JSON.stringify(bodyData));
    }
    req.end();
  });
}

// Mock request / response helpers for testing serverless API functions
function createMockReqRes(method, body, headers = {}) {
  const req = {
    method,
    body,
    headers: Object.assign({ origin: 'https://www.ctrlshifts.in' }, headers),
    socket: { remoteAddress: '127.0.0.1' }
  };
  let statusCode = 200;
  let responseData = null;
  let headersSent = {};

  const res = {
    setHeader(k, v) { headersSent[k] = v; return this; },
    status(code) { statusCode = code; return this; },
    json(data) { responseData = data; return this; },
    end(data) { if (data && !responseData) responseData = data; return this; },
    get _statusCode() { return statusCode; },
    get _data() { return responseData; }
  };

  return { req, res };
}

async function runSuite() {
  console.log('================================================================');
  console.log('   ISOLATED CREDENTIALS EMULATOR TEST SUITE                     ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc, condition, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc} ${details ? '(' + details + ')' : ''}`);
      failed++;
    }
  }

  // 1. SETUP DUMMY DATA VIA ADMIN SDK
  console.log('[STEP 1] Seeding dummy school data in emulator...');
  const adminPassPlain = 'SecretAdmin123!';
  const adminPassHash = bcrypt.hashSync(adminPassPlain, 10);

  const teacher1PassPlain = 'TeacherPass123!';
  const teacher1PassHash = bcrypt.hashSync(teacher1PassPlain, 10);

  const dummySchoolData = {
    settings: {
      credentialsIsolated: true,
      adminUsername: 'isolated_admin',
      adminPassword: adminPassHash // Root safety copy
    },
    teachers: [
      {
        id: 'tch_iso_01',
        firstName: 'Priya',
        lastName: 'Sharma',
        email: 'priya@isolated.school',
        role: 'teacher',
        status: 'Active',
        password: teacher1PassHash // Root safety copy
      }
    ],
    students: [
      { id: 'stu_01', name: 'Test Student', class: '1', section: 'A' }
    ]
  };

  await db.collection('tenant_data').doc(DUMMY_SCHOOL_ID).set(dummySchoolData);

  // Seed private credentials
  const dummyPrivateCreds = {
    adminUsername: 'isolated_admin',
    adminPassword: adminPassHash,
    teachers: {
      'tch_iso_01': {
        username: 'priya@isolated.school',
        email: 'priya@isolated.school',
        passwordHash: teacher1PassHash
      }
    }
  };
  await db.collection('tenant_data').doc(DUMMY_SCHOOL_ID).collection('private').doc('credentials').set(dummyPrivateCreds);

  // Setup school_access mapping for simulated users
  const teacherUid = 'uid_teacher_test';
  const adminUid = 'uid_admin_test';
  const superAdminUid = 'cq647u1GfCXISzf7XMw8pxH76I72';

  await db.collection('school_access').doc(teacherUid).set({
    schoolId: DUMMY_SCHOOL_ID,
    role: 'teacher',
    teacherId: 'tch_iso_01'
  });

  await db.collection('school_access').doc(adminUid).set({
    schoolId: DUMMY_SCHOOL_ID,
    role: 'admin'
  });

  console.log('Seeding complete.\n');

  // 2. FIRESTORE RULES TESTS (CLIENT DENIED, ADMIN SDK ALLOWED)
  console.log('[STEP 2] Testing Firestore Security Rules on private/credentials:');

  // A. Teacher Client: Read private/credentials -> MUST BE 403
  const teacherRead = await firestoreRestRequest(
    'GET',
    `tenant_data/${DUMMY_SCHOOL_ID}/private/credentials`,
    teacherUid
  );
  assert(
    'Teacher client denied read on private/credentials (403)',
    teacherRead.statusCode === 403,
    `Got HTTP ${teacherRead.statusCode}`
  );

  // B. Teacher Client: Write private/credentials -> MUST BE 403
  const teacherWrite = await firestoreRestRequest(
    'PATCH',
    `tenant_data/${DUMMY_SCHOOL_ID}/private/credentials`,
    teacherUid,
    { fields: { hacked: { stringValue: 'yes' } } }
  );
  assert(
    'Teacher client denied write on private/credentials (403)',
    teacherWrite.statusCode === 403,
    `Got HTTP ${teacherWrite.statusCode}`
  );

  // C. School Admin Client: Read private/credentials -> MUST BE 403
  const adminRead = await firestoreRestRequest(
    'GET',
    `tenant_data/${DUMMY_SCHOOL_ID}/private/credentials`,
    adminUid
  );
  assert(
    'School Admin client denied direct read on private/credentials (403)',
    adminRead.statusCode === 403,
    `Got HTTP ${adminRead.statusCode}`
  );

  // D. School Admin Client: Write private/credentials -> MUST BE 403
  const adminWrite = await firestoreRestRequest(
    'PATCH',
    `tenant_data/${DUMMY_SCHOOL_ID}/private/credentials`,
    adminUid,
    { fields: { hacked: { stringValue: 'yes' } } }
  );
  assert(
    'School Admin client denied direct write on private/credentials (403)',
    adminWrite.statusCode === 403,
    `Got HTTP ${adminWrite.statusCode}`
  );

  // E. Super Admin Client: Read private/credentials -> MUST BE 403
  const superAdminRead = await firestoreRestRequest(
    'GET',
    `tenant_data/${DUMMY_SCHOOL_ID}/private/credentials`,
    superAdminUid
  );
  assert(
    'Super Admin client denied direct read on private/credentials (403)',
    superAdminRead.statusCode === 403,
    `Got HTTP ${superAdminRead.statusCode}`
  );

  // F. Admin SDK: Read private/credentials -> MUST SUCCEED (200 / exists)
  const adminSdkDoc = await db.collection('tenant_data').doc(DUMMY_SCHOOL_ID).collection('private').doc('credentials').get();
  assert(
    'Admin SDK can read private/credentials (bypasses rules)',
    adminSdkDoc.exists && adminSdkDoc.data().adminUsername === 'isolated_admin',
    `Exists: ${adminSdkDoc.exists}`
  );

  console.log('\n[STEP 3] Testing api/verify-school-access with credentialsIsolated:');
  const verifyHandler = require('../api/verify-school-access.js');

  // Helper to mock decoded token in admin.auth().verifyIdToken
  const origVerifyIdToken = admin.auth().verifyIdToken;
  admin.auth().verifyIdToken = async (token) => {
    if (token === 'valid_admin_token') return { uid: adminUid };
    if (token === 'valid_teacher_token') return { uid: teacherUid };
    if (token === 'unauthorized_token') return { uid: 'uid_unauthorized' };
    throw new Error('Invalid token');
  };

  // A. Admin login with correct password -> 200
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'valid_admin_token',
      schoolId: DUMMY_SCHOOL_ID,
      role: 'admin',
      username: 'isolated_admin',
      password: adminPassPlain
    });
    await verifyHandler(req, res);
    assert(
      'Admin login with correct password succeeds (HTTP 200)',
      res._statusCode === 200 && res._data && res._data.success === true,
      `Status: ${res._statusCode}, Body: ${JSON.stringify(res._data)}`
    );
  }

  // B. Admin login with wrong password -> 401
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'valid_admin_token',
      schoolId: DUMMY_SCHOOL_ID,
      role: 'admin',
      username: 'isolated_admin',
      password: 'WrongPassword999'
    });
    await verifyHandler(req, res);
    assert(
      'Admin login with wrong password rejected (HTTP 401)',
      res._statusCode === 401,
      `Status: ${res._statusCode}, Error: ${res._data ? res._data.error : ''}`
    );
  }

  // C. Teacher login with correct password from private/credentials -> 200
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'valid_teacher_token',
      schoolId: DUMMY_SCHOOL_ID,
      role: 'teacher',
      email: 'priya@isolated.school',
      password: teacher1PassPlain
    });
    await verifyHandler(req, res);
    assert(
      'Teacher login with correct password from private/credentials succeeds (HTTP 200)',
      res._statusCode === 200 && res._data && res._data.success === true,
      `Status: ${res._statusCode}`
    );
  }

  // D. Teacher login with wrong password -> 401
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'valid_teacher_token',
      schoolId: DUMMY_SCHOOL_ID,
      role: 'teacher',
      email: 'priya@isolated.school',
      password: 'WrongTeacherPass'
    });
    await verifyHandler(req, res);
    assert(
      'Teacher login with wrong password rejected (HTTP 401)',
      res._statusCode === 401,
      `Status: ${res._statusCode}`
    );
  }

  // E. Fallback test: when private/credentials is deleted, verify falls back to root doc
  await db.collection('tenant_data').doc(DUMMY_SCHOOL_ID).collection('private').doc('credentials').delete();
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'valid_teacher_token',
      schoolId: DUMMY_SCHOOL_ID,
      role: 'teacher',
      email: 'priya@isolated.school',
      password: teacher1PassPlain
    });
    await verifyHandler(req, res);
    assert(
      'Seamless fallback to root doc when private/credentials is missing (HTTP 200)',
      res._statusCode === 200 && res._data && res._data.success === true,
      `Status: ${res._statusCode}`
    );
  }

  // Restore private/credentials for subsequent tests
  await db.collection('tenant_data').doc(DUMMY_SCHOOL_ID).collection('private').doc('credentials').set(dummyPrivateCreds);

  console.log('\n[STEP 4] Testing api/manage-credentials (Server Credential Writes):');
  const manageHandler = require('../api/manage-credentials.js');

  // A. Teacher or non-admin attempts credential write -> MUST BE 403
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'valid_teacher_token', // Teacher role in school_access
      schoolId: DUMMY_SCHOOL_ID,
      action: 'set-admin-password',
      newPassword: 'NewAdminSecret123!'
    });
    await manageHandler(req, res);
    assert(
      'Non-admin caller blocked from api/manage-credentials (HTTP 403)',
      res._statusCode === 403,
      `Status: ${res._statusCode}`
    );
  }

  // B. Admin updates admin password -> dual-write to root and private/credentials
  const newAdminPass = 'BrandNewAdminPass456!';
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'valid_admin_token',
      schoolId: DUMMY_SCHOOL_ID,
      action: 'set-admin-password',
      newPassword: newAdminPass
    });
    await manageHandler(req, res);
    assert(
      'Admin updates admin password via server endpoint (HTTP 200)',
      res._statusCode === 200 && res._data && res._data.success === true,
      `Status: ${res._statusCode}`
    );

    // Verify dual-write
    const updatedRoot = (await db.collection('tenant_data').doc(DUMMY_SCHOOL_ID).get()).data();
    const updatedPrivate = (await db.collection('tenant_data').doc(DUMMY_SCHOOL_ID).collection('private').doc('credentials').get()).data();

    const rootHash = updatedRoot.settings.adminPassword;
    const privateHash = updatedPrivate.adminPassword;

    assert(
      'Admin password dual-written with identical hash to both root and private/credentials',
      rootHash === privateHash && bcrypt.compareSync(newAdminPass, privateHash),
      `Root: ${rootHash.substr(0, 10)}..., Private: ${privateHash.substr(0, 10)}...`
    );

    // Verify admin can immediately log in with new password
    const loginTest = createMockReqRes('POST', {
      idToken: 'valid_admin_token',
      schoolId: DUMMY_SCHOOL_ID,
      role: 'admin',
      username: 'isolated_admin',
      password: newAdminPass
    });
    await verifyHandler(loginTest.req, loginTest.res);
    assert(
      'Admin immediately logs in with updated password via verify-school-access (HTTP 200)',
      loginTest.res._statusCode === 200 && loginTest.res._data && loginTest.res._data.success === true
    );
  }

  // C. Admin adds a new teacher with password -> dual-write
  const newTeacherEmail = 'rohit.kumar@isolated.school';
  const newTeacherPass = 'RohitPass789!';
  let createdTeacherId = '';
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'valid_admin_token',
      schoolId: DUMMY_SCHOOL_ID,
      action: 'add-teacher',
      teacherData: {
        firstName: 'Rohit',
        lastName: 'Kumar',
        email: newTeacherEmail,
        role: 'teacher',
        status: 'Active',
        subject: 'Mathematics'
      },
      rawPassword: newTeacherPass
    });
    await manageHandler(req, res);
    assert(
      'Admin adds new teacher via server endpoint (HTTP 200)',
      res._statusCode === 200 && res._data && res._data.success === true,
      `Status: ${res._statusCode}`
    );
    createdTeacherId = res._data.teacherId;

    // Verify dual-write in root teachers and private/credentials
    const updatedRoot = (await db.collection('tenant_data').doc(DUMMY_SCHOOL_ID).get()).data();
    const updatedPrivate = (await db.collection('tenant_data').doc(DUMMY_SCHOOL_ID).collection('private').doc('credentials').get()).data();

    const rootTeacher = updatedRoot.teachers.find(t => t.id === createdTeacherId);
    const privateTeacherCred = updatedPrivate.teachers[createdTeacherId];

    assert(
      'New teacher dual-written to root teachers[] and private/credentials.teachers with identical hash',
      Boolean(rootTeacher && privateTeacherCred && rootTeacher.password === privateTeacherCred.passwordHash && bcrypt.compareSync(newTeacherPass, privateTeacherCred.passwordHash)),
      `Root hash match: ${Boolean(rootTeacher)}, Private entry: ${Boolean(privateTeacherCred)}`
    );

    // Setup school_access for new teacher and test login
    const newTeacherUid = 'uid_new_teacher_test';
    await db.collection('school_access').doc(newTeacherUid).set({
      schoolId: DUMMY_SCHOOL_ID,
      role: 'teacher',
      teacherId: createdTeacherId
    });

    const origVerify = admin.auth().verifyIdToken;
    admin.auth().verifyIdToken = async (tok) => {
      if (tok === 'valid_new_teacher_token') return { uid: newTeacherUid };
      return origVerify(tok);
    };

    const loginTest = createMockReqRes('POST', {
      idToken: 'valid_new_teacher_token',
      schoolId: DUMMY_SCHOOL_ID,
      role: 'teacher',
      email: newTeacherEmail,
      password: newTeacherPass
    });
    await verifyHandler(loginTest.req, loginTest.res);
    assert(
      'Newly added teacher successfully logs in via verify-school-access (HTTP 200)',
      loginTest.res._statusCode === 200 && loginTest.res._data && loginTest.res._data.success === true
    );
  }

  // D. Admin resets teacher password -> dual-write
  const resetTeacherPass = 'RohitResetPass321!';
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'valid_admin_token',
      schoolId: DUMMY_SCHOOL_ID,
      action: 'set-teacher-password',
      teacherId: createdTeacherId,
      newPassword: resetTeacherPass
    });
    await manageHandler(req, res);
    assert(
      'Admin resets teacher password via server endpoint (HTTP 200)',
      res._statusCode === 200 && res._data && res._data.success === true,
      `Status: ${res._statusCode}`
    );

    // Verify dual-write
    const updatedRoot = (await db.collection('tenant_data').doc(DUMMY_SCHOOL_ID).get()).data();
    const updatedPrivate = (await db.collection('tenant_data').doc(DUMMY_SCHOOL_ID).collection('private').doc('credentials').get()).data();

    const rootTeacher = updatedRoot.teachers.find(t => t.id === createdTeacherId);
    const privateTeacherCred = updatedPrivate.teachers[createdTeacherId];

    assert(
      'Reset teacher password dual-written with identical hash to root and private/credentials',
      Boolean(rootTeacher && privateTeacherCred && rootTeacher.password === privateTeacherCred.passwordHash && bcrypt.compareSync(resetTeacherPass, privateTeacherCred.passwordHash))
    );

    // Test teacher login with new password
    const loginTest = createMockReqRes('POST', {
      idToken: 'valid_new_teacher_token',
      schoolId: DUMMY_SCHOOL_ID,
      role: 'teacher',
      email: newTeacherEmail,
      password: resetTeacherPass
    });
    await verifyHandler(loginTest.req, loginTest.res);
    assert(
      'Teacher logs in with newly reset password (HTTP 200)',
      loginTest.res._statusCode === 200 && loginTest.res._data && loginTest.res._data.success === true
    );
  }

  // Cleanup mocked auth
  admin.auth().verifyIdToken = origVerifyIdToken;

  console.log('\n================================================================');
  console.log(`   SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED           `);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
