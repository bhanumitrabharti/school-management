/**
 * Comprehensive Test Suite for Self-Service School Onboarding (Phase B)
 * Covers C1, C2, C3, C4, C7, D2, D3, D5, and Super Admin Management.
 */

import { strict as assert } from 'assert';
import { getFirebaseAdmin, getDb } from '../api/lib/firebase-admin.js';
import {
  CANONICAL_FULL_FEATURES,
  getCurrentAcademicYear,
  buildSchoolRecord,
  buildTenantRecord,
  buildPrivateCredentialsRecord
} from '../api/lib/school-template.js';
import {
  suggestAdminUsername,
  validateAdminUsername,
  validateSubdomain,
  hashPassword,
  hashIp
} from '../api/lib/validation.js';
import { getLastOtpFor } from '../api/lib/email.js';

import handlerSubdomainCheck from '../api/subdomain-check.js';
import handlerRegistrationStart from '../api/registration-start.js';
import handlerRegistrationVerifyOtp from '../api/registration-verify-otp.js';
import handlerRegistrationProvision from '../api/registration-provision.js';
import handlerReferralManager from '../api/referral-manager.js';
import handlerRegistrationAdmin from '../api/registration-admin.js';
import verifySchoolAccessHandler from '../api/verify-school-access.js';

process.env.MOCK_ONBOARDING_MODE = 'true';

// Helper to simulate Express req/res
function createMockReqRes({ method = 'GET', query = {}, body = {}, headers = {} } = {}) {
  const req = {
    method,
    query,
    body,
    headers: {
      'x-forwarded-for': '127.0.0.1',
      ...headers
    },
    socket: { remoteAddress: '127.0.0.1' }
  };

  const res = {
    statusCode: 200,
    headers: {},
    bodyData: null,
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.bodyData = data; return this; },
    end(data) { if (data) this.bodyData = data; return this; }
  };

  return { req, res };
}

const createdDocs = {
  schools: [],
  tenant_data: [],
  registrations: [],
  subdomain_reservations: [],
  referral_codes: [],
  login_rate_limits: [],
  registration_rate_limits: []
};

async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  RUNNING SELF-SERVICE ONBOARDING VERIFICATION TEST SUITE     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const adm = getFirebaseAdmin();
  const db = getDb();

  // Pre-cleanup of any previous test artifacts
  const preRegs = await db.collection('registrations').get();
  for (const doc of preRegs.docs) {
    if (doc.id.startsWith('reg_zz-test') || (doc.data().subdomain && doc.data().subdomain.startsWith('zz-test'))) {
      await doc.ref.delete();
    }
  }
  const preSubs = await db.collection('subdomain_reservations').get();
  for (const doc of preSubs.docs) {
    if (doc.id.startsWith('zz-test')) {
      await doc.ref.delete();
    }
  }
  const preSchools = await db.collection('schools').get();
  for (const doc of preSchools.docs) {
    if (doc.id.startsWith('zz_test_') || (doc.data().subdomain && doc.data().subdomain.startsWith('zz-test'))) {
      await doc.ref.delete();
      await db.collection('tenant_data').doc(doc.id).collection('private').doc('credentials').delete().catch(() => {});
      await db.collection('tenant_data').doc(doc.id).delete().catch(() => {});
    }
  }

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(err);
      throw err;
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(err);
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. D2: Admin Username Suggestion & Validation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST GROUP 1: D2 Username Suggestion & Validation ---');

  test('D2.1: Initials + admin for multi-word school names', () => {
    assert.equal(suggestAdminUsername('Greenwood Public School'), 'gpsadmin');
    assert.equal(suggestAdminUsername('Delhi Public School Bokaro'), 'dpsbadmin');
    assert.equal(suggestAdminUsername("St. Xavier's High School"), 'sxhsadmin');
    assert.equal(suggestAdminUsername('D.A.V. Public School'), 'dpsadmin');
  });

  test('D2.2: Single word or short initials fallback', () => {
    assert.equal(suggestAdminUsername('Paathshala'), 'paathshalaadmin');
    assert.equal(suggestAdminUsername('A School'), 'asadmin');
  });

  test('D2.3: Admin username format validation', () => {
    assert.equal(validateAdminUsername('gpsadmin').valid, true);
    assert.equal(validateAdminUsername('john.doe_01').valid, true);
    assert.equal(validateAdminUsername('adm').valid, false, 'Should reject < 4 chars');
    assert.equal(validateAdminUsername('user@domain').valid, false, 'Should reject invalid chars');
    assert.equal(validateAdminUsername('user name').valid, false, 'Should reject spaces');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. C3: Subdomain Validation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 2: C3 Subdomain Validation ---');

  test('C3.1: Reserved subdomains rejected', () => {
    const reserved = ['shishu-vikash-mandir', 'svm', 'www', 'admin', 'api', 'login', 'superadmin', 'register'];
    for (const sub of reserved) {
      const res = validateSubdomain(sub);
      assert.equal(res.valid, false, `Expected ${sub} to be reserved`);
      assert.match(res.error, /reserved/i);
    }
  });

  test('C3.2: Format rules (lengths, hyphens, punycode collision)', () => {
    assert.equal(validateSubdomain('ab').valid, false, 'Too short');
    assert.equal(validateSubdomain('a'.repeat(31)).valid, false, 'Too long');
    assert.equal(validateSubdomain('-invalid').valid, false, 'Leading hyphen');
    assert.equal(validateSubdomain('invalid-').valid, false, 'Trailing hyphen');
    assert.equal(validateSubdomain('ab--cd').valid, false, 'Double hyphen at pos 3-4');
    assert.equal(validateSubdomain('greenwood-high').valid, true, 'Valid subdomain');
  });

  await testAsync('C3.3: Live /api/subdomain-check endpoint', async () => {
    const { req, res } = createMockReqRes({ method: 'GET', query: { subdomain: 'admin' } });
    await handlerSubdomainCheck(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.bodyData.available, false);
    assert.match(res.bodyData.reason, /reserved/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. C2: Feature Parity & Canonical Template
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 3: C2 Feature Parity & Canonical Template ---');

  test('C2.1: Canonical feature list contains exact 17 modules', () => {
    assert.equal(CANONICAL_FULL_FEATURES.length, 17);
    assert.deepEqual(CANONICAL_FULL_FEATURES, [
      'dashboard', 'admin', 'teacher-attendance', 'students', 'teachers',
      'attendance', 'fees', 'fee_ledger', 'print_receipt', 'timetable',
      'exams', 'report_cards', 'notices', 'promotion', 'users', 'recovery', 'help'
    ]);
  });

  await testAsync('C2.2: Live Usha Academy feature diff is 0', async () => {
    const snap = await db.collection('schools').doc('usha_academy_mango_muzflr5z').get();
    assert.equal(snap.exists, true, 'Usha Academy doc must exist');
    const ushaFeatures = snap.data().allowed_features || [];
    assert.deepEqual(
      ushaFeatures.slice().sort(),
      CANONICAL_FULL_FEATURES.slice().sort(),
      'Diff against Usha Academy must be empty'
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. C4 & C5: Document Sanitization & Dynamic Academic Year
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 4: C4 & C5 Sanitization & Dynamic Academic Year ---');

  test('C4.1: Dynamic academic year computes April-March correctly', () => {
    assert.equal(getCurrentAcademicYear(new Date('2026-05-10')), '2026-2027');
    assert.equal(getCurrentAcademicYear(new Date('2026-01-15')), '2025-2026');
    assert.equal(getCurrentAcademicYear(new Date('2026-04-01')), '2026-2027');
    assert.equal(getCurrentAcademicYear(new Date('2026-03-31')), '2025-2026');
  });

  test('C5.1: Public schools/{id} record contains NO credentials or adminUsername/adminEmail', () => {
    const schoolRec = buildSchoolRecord({
      schoolName: 'Test School',
      city: 'Ranchi',
      state: 'Jharkhand',
      subdomain: 'test-school-c5',
      phone: '9999999999',
      email: 'admin@testschool.edu'
    });

    assert.equal(schoolRec.adminUsername, undefined, 'adminUsername must not be in root school doc');
    assert.equal(schoolRec.adminPassword, undefined, 'adminPassword must not be in root school doc');
    assert.equal(schoolRec.settings.adminUsername, undefined, 'adminUsername must not be in school settings');
    assert.equal(schoolRec.settings.adminEmail, undefined, 'adminEmail must not be in school settings');
    assert.equal(schoolRec.settings.adminPassword, undefined, 'adminPassword must not be in school settings');
    assert.equal(schoolRec.settings.academicYear, getCurrentAcademicYear(), 'Academic year must be dynamic');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Full Registration & Provisioning Lifecycle (C1, C7, D3, D5)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 5: Full Registration, Provisioning & C1 Login Proof ---');

  const testSubdomain = `zz-test-onboard-${Date.now().toString(36)}`;
  const testEmail = `principal.${Date.now()}@zztestschool.edu`;
  const testPassword = 'SecurePassword123!';
  let testRegId = null;
  let testSchoolId = null;

  await testAsync('5.1: Start registration (/api/registration-start)', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        schoolName: 'Synthetic Onboard Test Academy',
        city: 'Bokaro Steel City',
        state: 'Jharkhand',
        subdomain: testSubdomain,
        adminName: 'Dr. Test Administrator',
        adminEmail: testEmail,
        adminPhone: '9876543210',
        adminUsername: 'testadmin',
        adminPassword: testPassword,
        termsAccepted: true,
        marketingConsent: false
      }
    });

    await handlerRegistrationStart(req, res);
    assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.bodyData)}`);
    assert.equal(res.bodyData.success, true);
    assert.ok(res.bodyData.regId);

    testRegId = res.bodyData.regId;
    createdDocs.registrations.push(testRegId);
    createdDocs.subdomain_reservations.push(testSubdomain);
  });

  await testAsync('5.2: D3 Duplicate email block', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        schoolName: 'Another School',
        city: 'Ranchi',
        state: 'Jharkhand',
        subdomain: `another-${Date.now().toString(36)}`,
        adminName: 'Another Admin',
        adminEmail: testEmail, // Same email
        adminPhone: '9876543211',
        adminUsername: 'anotheradmin',
        adminPassword: 'Password123!',
        termsAccepted: true
      }
    });

    await handlerRegistrationStart(req, res);
    assert.equal(res.statusCode, 409, 'Must return 409 Conflict for duplicate email');
    assert.match(res.bodyData.error, /already registered/i);
  });

  await testAsync('5.3: D5 OTP verification invalid code & attempt decrement', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { regId: testRegId, otp: '000000' } // Wrong OTP
    });

    await handlerRegistrationVerifyOtp(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.bodyData.attemptsLeft, 4);
  });

  await testAsync('5.4: D5 OTP verification with correct code', async () => {
    const correctOtp = getLastOtpFor(testEmail);
    assert.ok(correctOtp, 'Mock OTP must be captured in memory');

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { regId: testRegId, otp: correctOtp }
    });

    await handlerRegistrationVerifyOtp(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.bodyData.status, 'verified');
  });

  await testAsync('5.5: Provision school ERP (/api/registration-provision)', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { regId: testRegId }
    });

    await handlerRegistrationProvision(req, res);
    assert.equal(res.statusCode, 200, `Provisioning failed: ${JSON.stringify(res.bodyData)}`);
    assert.equal(res.bodyData.success, true);
    assert.ok(res.bodyData.schoolId);

    testSchoolId = res.bodyData.schoolId;
    createdDocs.schools.push(testSchoolId);
    createdDocs.tenant_data.push(testSchoolId);
  });

  await testAsync('5.6: C7 First login readiness & tenant structure verification', async () => {
    const tenantSnap = await db.collection('tenant_data').doc(testSchoolId).get();
    assert.equal(tenantSnap.exists, true);
    const tenant = tenantSnap.data();

    assert.equal(tenant.settings.clientCanEdit, true);
    assert.equal(tenant.settings.setupCompletedBySuperAdmin, false);
    assert.equal(tenant.settings.credentialsIsolated, true);
    assert.equal(tenant.settings.academicYear, getCurrentAcademicYear());
    assert.ok(Array.isArray(tenant.settings.classes) && tenant.settings.classes.length > 0);
    assert.ok(Array.isArray(tenant.feeHeads) && tenant.feeHeads.length >= 5);
    assert.deepEqual(tenant.students, []);
    assert.deepEqual(tenant.teachers, []);
  });

  await testAsync('5.7: C1 LOGIN PROOF via real verify-school-access', async () => {
    // 1. Verify credentials isolated in private subcollection
    const credSnap = await db.collection('tenant_data')
      .doc(testSchoolId)
      .collection('private')
      .doc('credentials')
      .get();

    assert.equal(credSnap.exists, true, 'private/credentials must exist');
    const creds = credSnap.data();
    assert.equal(creds.adminUsername, 'testadmin');
    assert.ok(creds.adminPassword, 'bcrypt hash must be present');
    assert.ok(creds.adminPassword.startsWith('$2'), 'Must be valid bcrypt hash');

    // 2. Mock Firebase ID Token for a synthetic test UID
    const testUid = `zz_test_uid_${Date.now().toString(36)}`;
    
    // Call verify-school-access handler directly with mocked ID token verification
    // We mock auth().verifyIdToken temporarily
    const origVerifyIdToken = adm.auth().verifyIdToken;
    adm.auth().verifyIdToken = async (token) => {
      if (token === 'mock-valid-id-token') {
        return { uid: testUid, email: testEmail };
      }
      throw new Error('Invalid token');
    };

    try {
      const { req, res } = createMockReqRes({
        method: 'POST',
        body: {
          idToken: 'mock-valid-id-token',
          schoolId: testSchoolId,
          role: 'admin',
          username: 'testadmin',
          password: testPassword
        }
      });

      await verifySchoolAccessHandler(req, res);
      assert.equal(res.statusCode, 200, `Login verification failed: ${JSON.stringify(res.bodyData)}`);
      assert.equal(res.bodyData.success, true);
      assert.equal(res.bodyData.schoolId, testSchoolId);
      assert.equal(res.bodyData.role, 'admin');

      // Verify school_access was written for this user
      const accessSnap = await db.collection('school_access').doc(testUid).get();
      assert.equal(accessSnap.exists, true);
      assert.equal(accessSnap.data().schoolId, testSchoolId);

      // Clean up school_access test doc
      await db.collection('school_access').doc(testUid).delete();

    } finally {
      adm.auth().verifyIdToken = origVerifyIdToken;
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Super Admin & Referral Management APIs
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 6: Super Admin & Referral Management APIs ---');

  await testAsync('6.1: Super Admin /api/registration-admin list & KPIs', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      query: { action: 'list' },
      headers: { 'x-test-super-admin': 'true' }
    });

    await handlerRegistrationAdmin(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.bodyData.success, true);
    assert.ok(res.bodyData.kpis.total >= 1);
    assert.ok(res.bodyData.registrations.some(r => r.regId === testRegId));
  });

  await testAsync('6.2: Super Admin Suspend & Reactivate school', async () => {
    // Suspend
    const { req: sReq, res: sRes } = createMockReqRes({
      method: 'POST',
      body: { action: 'suspend', regId: testRegId, schoolId: testSchoolId },
      headers: { 'x-test-super-admin': 'true' }
    });
    await handlerRegistrationAdmin(sReq, sRes);
    assert.equal(sRes.statusCode, 200);

    const sSnap = await db.collection('schools').doc(testSchoolId).get();
    assert.equal(sSnap.data().status, 'suspended');

    // Reactivate
    const { req: rReq, res: rRes } = createMockReqRes({
      method: 'POST',
      body: { action: 'reactivate', regId: testRegId, schoolId: testSchoolId },
      headers: { 'x-test-super-admin': 'true' }
    });
    await handlerRegistrationAdmin(rReq, rRes);
    assert.equal(rRes.statusCode, 200);

    const rSnap = await db.collection('schools').doc(testSchoolId).get();
    assert.equal(rSnap.data().status, 'active');
  });

  await testAsync('6.3: Referral manager create code & employee report', async () => {
    const testCode = `EMP-TEST-${Date.now().toString(36).toUpperCase()}`;

    // Create code
    const { req: cReq, res: cRes } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'create',
        code: testCode,
        employeeName: 'Bhanu Pratap',
        employeeId: 'EMP001',
        department: 'Growth'
      },
      headers: { 'x-test-super-admin': 'true' }
    });
    await handlerReferralManager(cReq, cRes);
    assert.equal(cRes.statusCode, 200);
    createdDocs.referral_codes.push(testCode);

    // List codes
    const { req: lReq, res: lRes } = createMockReqRes({
      method: 'GET',
      query: { action: 'list' },
      headers: { 'x-test-super-admin': 'true' }
    });
    await handlerReferralManager(lReq, lRes);
    assert.equal(lRes.statusCode, 200);
    assert.ok(lRes.bodyData.codes.some(c => c.code === testCode));

    // Employee attribution report
    const { req: eReq, res: eRes } = createMockReqRes({
      method: 'GET',
      query: { action: 'employee_report' },
      headers: { 'x-test-super-admin': 'true' }
    });
    await handlerReferralManager(eReq, eRes);
    assert.equal(eRes.statusCode, 200);
    assert.ok(Array.isArray(eRes.bodyData.report));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. CLEANUP
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- CLEANUP OF SYNTHETIC TEST DOCUMENTS ---');
  let deletedCount = 0;

  for (const schoolId of createdDocs.schools) {
    await db.collection('schools').doc(schoolId).delete();
    console.log(`  Deleted synthetic school: schools/${schoolId}`);
    deletedCount++;
  }

  for (const schoolId of createdDocs.tenant_data) {
    // Delete private/credentials
    await db.collection('tenant_data').doc(schoolId).collection('private').doc('credentials').delete();
    await db.collection('tenant_data').doc(schoolId).delete();
    console.log(`  Deleted synthetic tenant_data/${schoolId} and private/credentials`);
    deletedCount += 2;
  }

  for (const regId of createdDocs.registrations) {
    await db.collection('registrations').doc(regId).delete();
    console.log(`  Deleted synthetic registration: registrations/${regId}`);
    deletedCount++;
  }

  for (const sub of createdDocs.subdomain_reservations) {
    await db.collection('subdomain_reservations').doc(sub).delete();
    console.log(`  Deleted synthetic reservation: subdomain_reservations/${sub}`);
    deletedCount++;
  }

  for (const code of createdDocs.referral_codes) {
    await db.collection('referral_codes').doc(code).delete();
    console.log(`  Deleted synthetic referral_code: referral_codes/${code}`);
    deletedCount++;
  }

  console.log(`\nCleanup complete: ${deletedCount} synthetic documents removed.`);
  console.log(`\nFINAL RESULT: ${passed} / ${total} tests PASSED (100% success rate).`);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
