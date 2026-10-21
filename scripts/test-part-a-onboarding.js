const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
const db = admin.firestore();

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

async function runPartATest() {
  console.log('================================================================');
  console.log('       PART A — SUPER ADMIN ONBOARDING & CREDENTIAL ISOLATION   ');
  console.log('================================================================\n');

  const manageCredHandler = require('../api/manage-credentials.js');
  const verifyAccessHandler = require('../api/verify-school-access.js');

  const subdomain = 'test-onboarding-do-not-use';
  const newSchoolId = 'test_onboarding_do_not_use_' + Date.now();
  const schoolName = 'TEST-ONBOARDING-DO-NOT-USE';
  const adminUsername = 'testadmin';
  const initialPassword = 'InitialAdminPass@2026';
  const updatedPassword = 'UpdatedAdminPass@2026';

  console.log(`Target School ID: ${newSchoolId}`);
  console.log(`School Name:      ${schoolName}`);

  // Mock super admin verifyIdToken
  const superAdminUid = 'cq647u1GfCXISzf7XMw8pxH76I72';
  admin.auth().verifyIdToken = async (tok) => {
    if (tok === 'mock_sa_token') {
      return { uid: superAdminUid, email: 'superadmin@ctrlshifts.in', superAdmin: true };
    }
    if (tok.startsWith('admin_tok_')) {
      return { uid: 'uid_' + newSchoolId };
    }
    throw new Error('Invalid token');
  };

  // 1. Prepare newSchool & tenantData exactly per super-admin.js create mode
  const newSchool = {
    school_id: newSchoolId,
    school_name: schoolName,
    subdomain: subdomain,
    status: 'Active',
    settings: {
      schoolName: schoolName,
      adminUsername: adminUsername,
      adminEmail: 'testadmin@ctrlshifts.in',
      classes: ['Class 1'],
      sections: { 'Class 1': ['A'] },
      credentialsIsolated: true,
      restructured: true
    },
    restructured: true
  };

  const tenantData = {
    settings: {
      schoolName: schoolName,
      adminUsername: adminUsername,
      adminEmail: 'testadmin@ctrlshifts.in',
      classes: ['Class 1'],
      sections: { 'Class 1': ['A'] },
      credentialsIsolated: true,
      restructured: true
    },
    restructured: true,
    students: [],
    teachers: [],
    attendance: [],
    fees: []
  };

  // Commit metadata to Firestore
  console.log('--- 1. Committing schools and tenant_data metadata ---');
  const batch = db.batch();
  batch.set(db.collection('schools').doc(newSchoolId), newSchool);
  batch.set(db.collection('tenant_data').doc(newSchoolId), tenantData);
  await batch.commit();
  console.log('✅ Metadata committed to Firestore.');

  // 2. Call /api/manage-credentials as Super Admin to set initial admin password
  console.log('\n--- 2. Setting admin password via /api/manage-credentials (Super Admin) ---');
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'mock_sa_token',
      schoolId: newSchoolId,
      action: 'set-admin-password',
      newPassword: initialPassword,
      adminUsername: adminUsername
    });

    await manageCredHandler(req, res);
    console.log(`manage-credentials response: HTTP ${res._statusCode}, body:`, res._data);
    if (res._statusCode !== 200 || !res._data?.success) {
      throw new Error(`Failed to set admin password: ${JSON.stringify(res._data)}`);
    }
  }

  // 3. Verify Firestore Root Doc & private/credentials
  console.log('\n--- 3. Verifying Root Document & private/credentials ---');
  const rootSnap = await db.collection('tenant_data').doc(newSchoolId).get();
  const rootData = rootSnap.data();
  const rootHashes = countBcryptHashes(rootData);

  const credSnap = await db.collection('tenant_data').doc(newSchoolId).collection('private').doc('credentials').get();
  const credData = credSnap.data();

  const publicSchoolSnap = await db.collection('schools').doc(newSchoolId).get();
  const publicSchoolData = publicSchoolSnap.data();
  const publicHashes = countBcryptHashes(publicSchoolData);

  console.log(`Root doc bcrypt hashes:             ${rootHashes} (Expected: 0)`);
  console.log(`Root doc adminPassword field:       ${rootData.settings?.adminPassword} (Expected: undefined)`);
  console.log(`Root doc credentialsIsolated flag:  ${rootData.settings?.credentialsIsolated} (Expected: true)`);
  console.log(`Public schools doc bcrypt hashes:   ${publicHashes} (Expected: 0)`);
  console.log(`Private doc adminPassword exists:   ${Boolean(credData?.adminPassword)} (Starts with $2: ${credData?.adminPassword?.startsWith('$2')})`);
  console.log(`Private doc adminUsername:          "${credData?.adminUsername}"`);

  if (rootHashes !== 0) throw new Error(`Root doc has ${rootHashes} bcrypt hashes! Expected 0.`);
  if (rootData.settings?.adminPassword !== undefined) throw new Error('adminPassword was found in root settings!');
  if (rootData.settings?.credentialsIsolated !== true) throw new Error('credentialsIsolated flag is not true!');
  if (publicHashes !== 0) throw new Error(`Public schools doc has ${publicHashes} bcrypt hashes! Expected 0.`);
  if (!credData?.adminPassword || !credData.adminPassword.startsWith('$2')) throw new Error('private/credentials does not have valid bcrypt hash!');

  // 4. Test Admin Login with Initial Password
  console.log('\n--- 4. Testing Admin Login with Initial Password ---');
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'admin_tok_' + newSchoolId,
      schoolId: newSchoolId,
      role: 'admin',
      username: adminUsername,
      password: initialPassword
    });

    await verifyAccessHandler(req, res);
    console.log(`Login response with initial password: HTTP ${res._statusCode}, success = ${res._data?.success}`);
    if (res._statusCode !== 200 || !res._data?.success) {
      throw new Error(`Login failed with initial password: ${JSON.stringify(res._data)}`);
    }
    console.log('✅ Admin login succeeded (HTTP 200 OK).');
  }

  // 5. Test Super Admin Password Reset / Edit School Path
  console.log('\n--- 5. Testing Password Reset via Super Admin Endpoint ---');
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'mock_sa_token',
      schoolId: newSchoolId,
      action: 'set-admin-password',
      newPassword: updatedPassword,
      adminUsername: adminUsername
    });

    await manageCredHandler(req, res);
    console.log(`manage-credentials (reset) response: HTTP ${res._statusCode}, body:`, res._data);
    if (res._statusCode !== 200 || !res._data?.success) {
      throw new Error(`Failed to reset admin password: ${JSON.stringify(res._data)}`);
    }
  }

  // Verify root stays hash-free after reset
  const rootSnapAfterReset = await db.collection('tenant_data').doc(newSchoolId).get();
  const rootHashesAfterReset = countBcryptHashes(rootSnapAfterReset.data());
  console.log(`Root doc bcrypt hashes after reset: ${rootHashesAfterReset} (Expected: 0)`);
  if (rootHashesAfterReset !== 0) throw new Error('Root doc acquired hashes after reset!');

  // Verify old password fails and new password succeeds
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'admin_tok_' + newSchoolId,
      schoolId: newSchoolId,
      role: 'admin',
      username: adminUsername,
      password: initialPassword
    });
    await verifyAccessHandler(req, res);
    console.log(`Login response with OLD password: HTTP ${res._statusCode} (Expected 401)`);
    if (res._statusCode !== 401) throw new Error(`Expected 401 on old password, got ${res._statusCode}`);
  }

  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'admin_tok_' + newSchoolId,
      schoolId: newSchoolId,
      role: 'admin',
      username: adminUsername,
      password: updatedPassword
    });
    await verifyAccessHandler(req, res);
    console.log(`Login response with NEW password: HTTP ${res._statusCode}, success = ${res._data?.success}`);
    if (res._statusCode !== 200 || !res._data?.success) throw new Error(`Expected 200 on new password, got ${res._statusCode}`);
  }

  console.log('\n================================================================');
  console.log('       ALL PART A ONBOARDING TESTS PASSED PERFECTLY             ');
  console.log(`       Created School ID: ${newSchoolId}                         `);
  console.log('================================================================');
  return newSchoolId;
}

runPartATest().then(() => process.exit(0)).catch(err => {
  console.error('PART A TEST ERROR:', err);
  process.exit(1);
});
