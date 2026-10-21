const admin = require('firebase-admin');
const path = require('path');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
const db = admin.firestore();

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

async function testStrictSuperAdmin() {
  const targetSchoolId = 'test_onboarding_do_not_use_1792584290880';
  const manageCred = require('../api/manage-credentials.js');

  // Test 1: Caller with email superadmin@ctrlshifts.in but WRONG UID -> MUST GET 403
  admin.auth().verifyIdToken = async (tok) => {
    if (tok === 'imposter_sa_token') {
      return { uid: 'some_random_uid_123', email: 'superadmin@ctrlshifts.in' };
    }
    if (tok === 'real_sa_token') {
      return { uid: 'cq647u1GfCXISzf7XMw8pxH76I72', email: 'superadmin@ctrlshifts.in' };
    }
    throw new Error('Invalid token');
  };

  console.log('--- 1. Testing Imposter Token (correct email, wrong UID) ---');
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'imposter_sa_token',
      schoolId: targetSchoolId,
      action: 'set-admin-password',
      newPassword: 'AttemptedHack@123',
      adminUsername: 'testadmin'
    });
    await manageCred(req, res);
    console.log(`Imposter response: HTTP ${res._statusCode} (${res._data?.error})`);
    if (res._statusCode !== 403) throw new Error(`Expected 403 for imposter token, got ${res._statusCode}`);
    console.log('✅ Correctly blocked imposter token with HTTP 403.');
  }

  console.log('\n--- 2. Testing Strict Super Admin UID Token (uid == cq647u1GfCXISzf7XMw8pxH76I72) ---');
  const newPass = 'StrictUidResetPass@2026';
  {
    const { req, res } = createMockReqRes('POST', {
      idToken: 'real_sa_token',
      schoolId: targetSchoolId,
      action: 'set-admin-password',
      newPassword: newPass,
      adminUsername: 'testadmin'
    });
    await manageCred(req, res);
    console.log(`Strict SA response: HTTP ${res._statusCode} (${res._data?.message})`);
    if (res._statusCode !== 200 || !res._data?.success) throw new Error(`Expected 200 for real SA token, got ${res._statusCode}`);
    console.log('✅ Successfully reset admin password with strict Super Admin UID.');
  }

  // Verify private/credentials was updated with new hash
  const credSnap = await db.collection('tenant_data').doc(targetSchoolId).collection('private').doc('credentials').get();
  const credData = credSnap.data();
  const bcrypt = require('bcryptjs');
  const matches = bcrypt.compareSync(newPass, credData.adminPassword);
  console.log(`private/credentials updated and matches newPass? ${matches}`);
  if (!matches) throw new Error('Password hash in private/credentials does not match new password!');

  // Verify root doc still has 0 hashes
  const rootSnap = await db.collection('tenant_data').doc(targetSchoolId).get();
  const rootJson = JSON.stringify(rootSnap.data());
  const rootHashes = (rootJson.match(/\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g) || []).length;
  console.log(`Root doc bcrypt hashes after strict reset: ${rootHashes}`);
  if (rootHashes !== 0) throw new Error('Root doc has bcrypt hashes!');

  console.log('\n✅ ALL STRICT SUPER ADMIN UID CHECKS PASSED.');
}

testStrictSuperAdmin().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
