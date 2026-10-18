/**
 * scripts/verify-greenwood-live-flows.js
 * 
 * Executes full Step 7 validation suite:
 * 1. Greenwood Admin login with live credentials (greenwood_admin / greenwood@2026).
 * 2. Sample of 3 Greenwood teachers login with Teacher@123.
 * 3. Add temporary TEST teacher via api/manage-credentials -> verify login.
 * 4. Reset TEST teacher's password via api/manage-credentials -> verify login with new password.
 * 5. Clean up TEST teacher (leaves original 12 teachers 100% intact).
 * 6. Real schools (SVM, KKGS, IPS, Oxford, Apex, NTS, Ideal, Usha) probe:
 *    verify API returns 401 on wrong credentials (NO logins to real schools).
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const verifyHandler = require('../api/verify-school-access.js');
const manageHandler = require('../api/manage-credentials.js');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!fs.existsSync(saPath)) {
  console.error('FATAL: service-account-key.json not found at', saPath);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
}
const db = admin.firestore();

function createMockReqRes(method, body) {
  const req = {
    method,
    body,
    headers: { origin: 'https://www.ctrlshifts.in' },
    socket: { remoteAddress: '127.0.0.1' }
  };
  let statusCode = 200;
  let responseData = null;

  const res = {
    setHeader() { return this; },
    status(code) { statusCode = code; return this; },
    json(data) { responseData = data; return this; },
    end(data) { if (data && !responseData) responseData = data; return this; },
    get _statusCode() { return statusCode; },
    get _data() { return responseData; }
  };

  return { req, res };
}

async function runTests() {
  console.log('================================================================');
  console.log('   STEP 7: GREENWOOD LIVE SUITE & REAL SCHOOLS AUDIT            ');
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

  // Setup mock verifyIdToken for testing API calls
  const origVerifyIdToken = admin.auth().verifyIdToken;
  const adminUid = 'gw_admin_test_session_uid';
  await db.collection('school_access').doc(adminUid).set({
    schoolId: 'svm_bokaro_001',
    role: 'admin',
    verifiedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  admin.auth().verifyIdToken = async (tok) => {
    if (tok === 'gw_admin_token') return { uid: adminUid };
    if (tok.startsWith('gw_user_')) return { uid: tok };
    throw new Error('Invalid token');
  };

  // 1. Greenwood Admin Login
  console.log('[TEST 1] Greenwood Admin Login:');
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'gw_admin_token',
      schoolId: 'svm_bokaro_001',
      role: 'admin',
      username: 'greenwood_admin',
      password: 'greenwood@2026'
    });
    await verifyHandler(req, res);
    assert(
      'Greenwood admin login succeeds via private/credentials (HTTP 200)',
      res._statusCode === 200 && res._data && res._data.success === true,
      `Status: ${res._statusCode}, Error: ${res._data ? res._data.error : ''}`
    );
  }

  // 2. Sample of 3 Teachers Login
  console.log('\n[TEST 2] Sample of 3 Greenwood Teachers Login:');
  const sampleTeachers = [
    { id: 'tch_gw_01', email: 'r.sharma@greenwoodpublic.edu.in', name: 'Dr. Rajesh Sharma' },
    { id: 'tch_gw_03', email: 'a.sinha@greenwoodpublic.edu.in', name: 'Mr. Amit Sinha' },
    { id: 'tch_gw_09', email: 'p.kulkarni@greenwoodpublic.edu.in', name: 'Mrs. Pooja Kulkarni' }
  ];

  for (const t of sampleTeachers) {
    const userTok = 'gw_user_' + t.id;
    const { req, res } = createMockReqRes('POST', {
      idToken: userTok,
      schoolId: 'svm_bokaro_001',
      role: 'teacher',
      email: t.email,
      password: 'Teacher@123'
    });
    await verifyHandler(req, res);
    assert(
      `Teacher login for ${t.name} (${t.email}) succeeds (HTTP 200)`,
      res._statusCode === 200 && res._data && res._data.success === true && res._data.user.id === t.id,
      `Status: ${res._statusCode}, Error: ${res._data ? res._data.error : ''}`
    );
  }

  // 3. Add Temporary TEST Teacher
  console.log('\n[TEST 3] Admin adds temporary TEST teacher via api/manage-credentials:');
  const testTeacherEmail = 'test.teacher.phase1a@greenwoodpublic.edu.in';
  const testTeacherPass = 'InitialTestPass123!';
  let testTeacherId = '';

  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'gw_admin_token',
      schoolId: 'svm_bokaro_001',
      action: 'add-teacher',
      teacherData: {
        firstName: 'Phase1a',
        lastName: 'TestTeacher',
        email: testTeacherEmail,
        role: 'teacher',
        status: 'Active',
        subject: 'General Knowledge'
      },
      rawPassword: testTeacherPass
    });
    await manageHandler(req, res);
    assert(
      'Admin creates test teacher via server endpoint (HTTP 200)',
      res._statusCode === 200 && res._data && res._data.success === true,
      `Status: ${res._statusCode}, Error: ${res._data ? res._data.error : ''}`
    );
    testTeacherId = res._data ? res._data.teacherId : '';

    // Verify test teacher can log in
    const testUserTok = 'gw_user_' + testTeacherId;
    const loginTest = createMockReqRes('POST', {
      idToken: testUserTok,
      schoolId: 'svm_bokaro_001',
      role: 'teacher',
      email: testTeacherEmail,
      password: testTeacherPass
    });
    await verifyHandler(loginTest.req, loginTest.res);
    assert(
      'New TEST teacher logs in successfully with initial password (HTTP 200)',
      loginTest.res._statusCode === 200 && loginTest.res._data && loginTest.res._data.success === true,
      `Status: ${loginTest.res._statusCode}`
    );
  }

  // 4. Admin resets TEST teacher's password
  console.log('\n[TEST 4] Admin resets TEST teacher password via api/manage-credentials:');
  const resetTestTeacherPass = 'UpdatedResetPass456!';
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'gw_admin_token',
      schoolId: 'svm_bokaro_001',
      action: 'set-teacher-password',
      teacherId: testTeacherId,
      newPassword: resetTestTeacherPass
    });
    await manageHandler(req, res);
    assert(
      'Admin resets test teacher password via server endpoint (HTTP 200)',
      res._statusCode === 200 && res._data && res._data.success === true,
      `Status: ${res._statusCode}, Error: ${res._data ? res._data.error : ''}`
    );

    // Verify old password is now rejected
    const testUserTok = 'gw_user_' + testTeacherId;
    const oldLoginTest = createMockReqRes('POST', {
      idToken: testUserTok,
      schoolId: 'svm_bokaro_001',
      role: 'teacher',
      email: testTeacherEmail,
      password: testTeacherPass
    });
    await verifyHandler(oldLoginTest.req, oldLoginTest.res);
    assert(
      'Old password correctly rejected after reset (HTTP 401)',
      oldLoginTest.res._statusCode === 401
    );

    // Verify new password succeeds
    const newLoginTest = createMockReqRes('POST', {
      idToken: testUserTok,
      schoolId: 'svm_bokaro_001',
      role: 'teacher',
      email: testTeacherEmail,
      password: resetTestTeacherPass
    });
    await verifyHandler(newLoginTest.req, newLoginTest.res);
    assert(
      'New password succeeds after reset (HTTP 200)',
      newLoginTest.res._statusCode === 200 && newLoginTest.res._data && newLoginTest.res._data.success === true
    );
  }

  // 5. Clean up TEST Teacher (leaves original 12 teachers 100% intact)
  console.log('\n[TEST 5] Cleaning up temporary TEST teacher...');
  {
    const rootRef = db.collection('tenant_data').doc('svm_bokaro_001');
    const privateRef = rootRef.collection('private').doc('credentials');

    const [rootSnap, privateSnap] = await Promise.all([rootRef.get(), privateRef.get()]);
    const rootData = rootSnap.data();
    const privateData = privateSnap.data();

    const filteredTeachers = (rootData.teachers || []).filter(t => t.id !== testTeacherId);
    if (privateData.teachers && privateData.teachers[testTeacherId]) {
      delete privateData.teachers[testTeacherId];
    }

    await Promise.all([
      rootRef.update({ teachers: filteredTeachers }),
      privateRef.set(privateData)
    ]);

    const [finalRootSnap, finalPrivateSnap] = await Promise.all([rootRef.get(), privateRef.get()]);
    const finalTeachers = finalRootSnap.data().teachers;
    const finalPrivateCount = Object.keys(finalPrivateSnap.data().teachers || {}).length;

    assert(
      'Temporary test teacher cleaned up; exactly 12 original teachers restored in root and private/credentials',
      finalTeachers.length === 12 && finalPrivateCount === 12,
      `Root teachers: ${finalTeachers.length}, Private teachers: ${finalPrivateCount}`
    );
  }

  // 6. Real Schools Verification (NO LOGINS - ONLY WRONG CREDENTIALS MUST RETURN 401)
  console.log('\n[TEST 6] Real schools probe with wrong credentials only (Strictly NO logins):');
  const realSchools = [
    'svm_mqbv7qm2',
    'kkgs_mttt4ufq',
    'ips_mttx07mt',
    'oxford_narra_muktjcky',
    'apex_khalcho_mugmtmx4',
    'nts_mu28myws',
    'idealschoolgomoh_mv1xhpe5',
    'usha_academy_mango_muzflr5z'
  ];

  for (const sId of realSchools) {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'gw_admin_token',
      schoolId: sId,
      role: 'admin',
      username: 'probe_nonexistent_user',
      password: 'wrong_probe_password_999'
    });
    await verifyHandler(req, res);
    assert(
      `Real school ${sId.padEnd(28)} correctly rejects invalid credentials (HTTP 401)`,
      res._statusCode === 401,
      `Status: ${res._statusCode}`
    );
  }

  // Clean up test school_access document
  await db.collection('school_access').doc(adminUid).delete().catch(() => {});
  admin.auth().verifyIdToken = origVerifyIdToken;

  console.log('\n================================================================');
  console.log(`   LIVE SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED     `);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runTests().catch(err => {
  console.error('FATAL LIVE TEST ERROR:', err);
  process.exit(1);
});
