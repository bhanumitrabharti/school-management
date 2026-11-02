'use strict';

/**
 * test/test_parent_portal_b1.js
 * Comprehensive Test Suite for Parent Portal Phase B1
 *
 * Verifies:
 *   1. OTP: valid, wrong, expired, lockout, resend cooldown, unknown email enumeration resistance.
 *   2. Mapping: one child, TWO siblings same school, cross-school mapping, secondary email, immediate revocation, disabled portal.
 *   3. Security Rules: Parent tokens cannot read or write tenant_data, students, fees_years, attendance_months, exam_marks, or parent_otp_sessions directly.
 */

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.MOCK_PARENT_MODE = 'true';
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { getDb, getFirebaseAdmin } = require('../api/_lib/firebase-admin');
const { getCapturedEmails, clearCapturedEmails } = require('../api/_lib/email');
const parentPortalHandler = require('../api/parents');

const rulesPath = path.resolve(__dirname, '../firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

// Mock HTTP Helpers
function createMockReq(options = {}) {
  return {
    method: options.method || 'POST',
    query: options.query || {},
    body: options.body || {},
    headers: options.headers || {},
    socket: { remoteAddress: options.ip || '127.0.0.1' }
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    end(data) { if (data && !this.body) this.body = data; return this; }
  };
  return res;
}

let passedCount = 0;
let failedCount = 0;

function pass(name) {
  console.log(`  ✔ PASS: ${name}`);
  passedCount++;
}

function fail(name, err) {
  console.error(`  ✖ FAIL: ${name}:`, err.message || err);
  failedCount++;
}

async function runParentPortalTests() {
  console.log('='.repeat(70));
  console.log('PARENT PORTAL PHASE B1 EMULATOR TEST SUITE');
  console.log('='.repeat(70));

  // Initialize rules unit testing environment
  const testEnv = await initializeTestEnvironment({
    projectId: 'ctrl-shift-solutions',
    firestore: {
      rules: rulesContent,
      host: '127.0.0.1',
      port: 8085
    }
  });

  const adminDb = getDb();

  // Clean emulator Firestore collections
  console.log('\n--- Seeding Test Fixtures in Emulator ---');
  await testEnv.clearFirestore();

  // Seed School 1 (Enabled Parent Portal)
  await adminDb.collection('tenant_data').doc('school_alpha').set({
    settings: {
      schoolName: 'Alpha Academy',
      theme: 'indigo',
      parentPortal: {
        enabled: true,
        allowProfile: true,
        allowAttendance: true,
        allowTimetable: true,
        allowExams: false,
        allowReportCards: false,
        allowNotices: true,
        allowFees: true,
        allowUpiPayment: true
      }
    }
  });

  // Seed School 2 (Cross-school Alpha & Beta)
  await adminDb.collection('tenant_data').doc('school_beta').set({
    settings: {
      schoolName: 'Beta World School',
      parentPortal: {
        enabled: true
      }
    }
  });

  // Seed School 3 (Parent Portal Disabled)
  await adminDb.collection('tenant_data').doc('school_gamma').set({
    settings: {
      schoolName: 'Gamma High School',
      parentPortal: {
        enabled: false
      }
    }
  });

  // Seed Students in subcollections
  // Student 1: Alpha Academy (Primary email)
  await adminDb.collection('tenant_data').doc('school_alpha').collection('students').doc('std_1').set({
    id: 'std_1',
    schoolId: 'school_alpha',
    name: 'Aarav Sharma',
    class: '5',
    section: 'A',
    rollNumber: '12',
    admissionNumber: 'ADM-101',
    parentEmail: 'parent.alpha@test.com',
    parentEmailNorm: 'parent.alpha@test.com',
    status: 'Active'
  });

  // Student 2: Alpha Academy (Sibling - same email)
  await adminDb.collection('tenant_data').doc('school_alpha').collection('students').doc('std_2').set({
    id: 'std_2',
    schoolId: 'school_alpha',
    name: 'Ananya Sharma',
    class: '2',
    section: 'B',
    rollNumber: '05',
    admissionNumber: 'ADM-205',
    parentEmail: 'parent.alpha@test.com',
    parentEmailNorm: 'parent.alpha@test.com',
    status: 'Active'
  });

  // Student 3: Beta World School (Cross-school sibling with same email!)
  await adminDb.collection('tenant_data').doc('school_beta').collection('students').doc('std_3').set({
    id: 'std_3',
    schoolId: 'school_beta',
    name: 'Rohan Verma',
    class: '9',
    section: 'C',
    rollNumber: '21',
    admissionNumber: 'BETA-901',
    parentEmail: 'parent.cross@test.com',
    parentEmailNorm: 'parent.cross@test.com',
    status: 'Active'
  });

  // Student 4: Alpha Academy (Same cross-school parent has a child here too)
  await adminDb.collection('tenant_data').doc('school_alpha').collection('students').doc('std_4').set({
    id: 'std_4',
    schoolId: 'school_alpha',
    name: 'Diya Verma',
    class: '3',
    section: 'A',
    rollNumber: '08',
    admissionNumber: 'ADM-308',
    parentEmail: 'parent.cross@test.com',
    parentEmailNorm: 'parent.cross@test.com',
    status: 'Active'
  });

  // Student 5: Alpha Academy with Secondary Parent Email
  await adminDb.collection('tenant_data').doc('school_alpha').collection('students').doc('std_5').set({
    id: 'std_5',
    schoolId: 'school_alpha',
    name: 'Kavya Patel',
    class: '4',
    section: 'B',
    rollNumber: '15',
    admissionNumber: 'ADM-415',
    parentEmail: 'father.patel@test.com',
    parentEmailNorm: 'father.patel@test.com',
    secondaryParentEmail: 'mother.patel@test.com',
    secondaryParentEmailNorm: 'mother.patel@test.com',
    status: 'Active'
  });

  // Student 6: Gamma School (Disabled portal)
  await adminDb.collection('tenant_data').doc('school_gamma').collection('students').doc('std_6').set({
    id: 'std_6',
    schoolId: 'school_gamma',
    name: 'Suresh Kumar',
    class: '6',
    section: 'A',
    rollNumber: '10',
    admissionNumber: 'GAM-610',
    parentEmail: 'parent.gamma@test.com',
    parentEmailNorm: 'parent.gamma@test.com',
    status: 'Active'
  });

  console.log('Fixtures seeded successfully.\n');

  // =========================================================================
  // CATEGORY 1: OTP LOGIC & SECURITY
  // =========================================================================
  console.log('=== Category 1: OTP Logic, Enumeration Resistance & Limits ===');

  // Test 1: Unknown email returns identical generic response, sends 0 emails
  try {
    clearCapturedEmails();
    const req = createMockReq({
      query: { action: 'send-otp' },
      body: { email: 'unknown.stranger@example.com', turnstileToken: 'mock_token' }
    });
    const res = createMockRes();
    await parentPortalHandler(req, res);

    assert.strictEqual(res.statusCode, 200, 'Expected 200 OK');
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.message, 'If an account exists with this email, a verification code has been sent.');
    assert.ok(res.body.sessionId, 'Session ID returned');

    // Verify ZERO emails dispatched
    const sent = getCapturedEmails();
    assert.strictEqual(sent.length, 0, 'Zero emails dispatched for unknown parent email');

    // Verify session stored with dummy hash
    const sessSnap = await adminDb.collection('parent_otp_sessions').doc(res.body.sessionId).get();
    assert.ok(sessSnap.exists, 'Session doc exists');
    assert.strictEqual(sessSnap.data().linked, false);
    assert.strictEqual(sessSnap.data().otpHash, 'unlinked_dummy_hash');

    pass('T01: Unknown email returns identical response and sends zero emails (enumeration-resistant)');
  } catch (err) {
    fail('T01: Unknown email enumeration test failed', err);
  }

  // Test 2: Valid email sends OTP email
  let validSessionId = null;
  let sentOtp = null;
  try {
    clearCapturedEmails();
    const req = createMockReq({
      query: { action: 'send-otp' },
      body: { email: 'parent.alpha@test.com', turnstileToken: 'mock_token' }
    });
    const res = createMockRes();
    await parentPortalHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    validSessionId = res.body.sessionId;

    const sent = getCapturedEmails();
    assert.strictEqual(sent.length, 1, 'Exactly one OTP email dispatched');
    assert.strictEqual(sent[0].to, 'parent.alpha@test.com');
    assert.ok(sent[0].otp && sent[0].otp.length === 6, '6-digit OTP generated');
    sentOtp = sent[0].otp;

    pass('T02: Valid linked email sends 6-digit OTP code to parent');
  } catch (err) {
    fail('T02: Valid email send OTP failed', err);
  }

  // Test 3: Resend cooldown within 60s
  try {
    const req = createMockReq({
      query: { action: 'send-otp' },
      body: { email: 'parent.alpha@test.com', turnstileToken: 'mock_token' }
    });
    const res = createMockRes();
    await parentPortalHandler(req, res);

    assert.strictEqual(res.statusCode, 429, 'Expected 429 Cooldown limit');
    assert.ok(res.body.error.includes('Please wait'), 'Expected cooldown error message');
    pass('T03: Resend requested within 60s is rejected with 429 cooldown');
  } catch (err) {
    fail('T03: Resend cooldown failed', err);
  }

  // Test 4: Max resends limit (3)
  try {
    // Manually wind clock back on session lastSentAt to bypass cooldown and simulate 3 resends
    const sessRef = adminDb.collection('parent_otp_sessions').doc(validSessionId);
    await sessRef.update({
      resendCount: 3,
      lastSentAt: new Date(Date.now() - 70000).toISOString()
    });

    const req = createMockReq({
      query: { action: 'send-otp' },
      body: { email: 'parent.alpha@test.com', turnstileToken: 'mock_token' }
    });
    const res = createMockRes();
    await parentPortalHandler(req, res);

    assert.strictEqual(res.statusCode, 429);
    assert.ok(res.body.error.includes('Maximum code resend limit (3) reached'), 'Expected max resend error');
    pass('T04: Max resend count (3) enforces 429 limit');
  } catch (err) {
    fail('T04: Max resends test failed', err);
  }

  // Test 5: Wrong OTP increments attempts and reports remaining
  try {
    const req = createMockReq({
      query: { action: 'verify-otp' },
      body: { sessionId: validSessionId, otp: '000000' }
    });
    const res = createMockRes();
    await parentPortalHandler(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.attemptsLeft, 4);
    assert.ok(res.body.error.includes('You have 4 attempt(s) remaining'));
    pass('T05: Incorrect OTP decrements remaining attempts');
  } catch (err) {
    fail('T05: Wrong OTP failed', err);
  }

  // Test 6: 5 failed attempts locks session
  try {
    // Submit 4 more wrong attempts
    for (let i = 0; i < 4; i++) {
      const req = createMockReq({
        query: { action: 'verify-otp' },
        body: { sessionId: validSessionId, otp: '111111' }
      });
      const res = createMockRes();
      await parentPortalHandler(req, res);
    }

    // Next attempt must trigger lockout
    const req = createMockReq({
      query: { action: 'verify-otp' },
      body: { sessionId: validSessionId, otp: sentOtp }
    });
    const res = createMockRes();
    await parentPortalHandler(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.error.includes('locked'), 'Expected locked error message');

    const snap = await adminDb.collection('parent_otp_sessions').doc(validSessionId).get();
    assert.strictEqual(snap.data().status, 'locked', 'Session status is locked in db');
    pass('T06: 5 incorrect attempts permanently locks session');
  } catch (err) {
    fail('T06: Lockout test failed', err);
  }

  // Test 7: Expired OTP rejected
  try {
    const expiredSessId = 'sess_expired_test';
    await adminDb.collection('parent_otp_sessions').doc(expiredSessId).set({
      sessionId: expiredSessId,
      email: 'parent.alpha@test.com',
      expiresAt: new Date(Date.now() - 60000).toISOString(),
      attempts: 0,
      status: 'pending',
      linked: true,
      otpHash: 'dummy'
    });

    const req = createMockReq({
      query: { action: 'verify-otp' },
      body: { sessionId: expiredSessId, otp: '123456' }
    });
    const res = createMockRes();
    await parentPortalHandler(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.error.includes('expired'), 'Expected expired message');
    pass('T07: Expired OTP is rejected');
  } catch (err) {
    fail('T07: Expired OTP test failed', err);
  }

  // Test 8: Valid OTP succeeds and mints Firebase custom token
  let customTokenResult = null;
  try {
    // Fresh session
    clearCapturedEmails();
    const sendReq = createMockReq({
      query: { action: 'send-otp' },
      body: { email: 'parent.alpha@test.com', turnstileToken: 'mock_token' },
      ip: '127.0.0.9'
    });
    const sendRes = createMockRes();
    await parentPortalHandler(sendReq, sendRes);

    const newSessId = sendRes.body.sessionId;
    const freshOtp = getCapturedEmails()[0].otp;

    const verifyReq = createMockReq({
      query: { action: 'verify-otp' },
      body: { sessionId: newSessId, otp: freshOtp }
    });
    const verifyRes = createMockRes();
    await parentPortalHandler(verifyReq, verifyRes);

    assert.strictEqual(verifyRes.statusCode, 200);
    assert.strictEqual(verifyRes.body.success, true);
    assert.ok(verifyRes.body.customToken, 'customToken returned');
    customTokenResult = verifyRes.body.customToken;

    pass('T08: Valid OTP verification succeeds and mints custom token');
  } catch (err) {
    fail('T08: Valid OTP test failed', err);
  }

  // =========================================================================
  // CATEGORY 2: STUDENT MAPPING, SIBLINGS & CROSS-SCHOOL
  // =========================================================================
  console.log('\n=== Category 2: Student Mapping, Siblings & Real-Time Revocation ===');

  // Test 9: Siblings in same school
  try {
    const req = createMockReq({
      query: { action: 'context' },
      headers: {
        authorization: 'Bearer mock_id_token_:parent.alpha@test.com',
        'x-parent-email': 'parent.alpha@test.com'
      }
    });
    const res = createMockRes();
    await parentPortalHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.schools.length, 1, 'Alpha school returned');
    const school = res.body.schools[0];
    assert.strictEqual(school.schoolId, 'school_alpha');
    assert.strictEqual(school.students.length, 2, 'Both siblings found');

    const s1 = school.students.find(s => s.id === 'std_1');
    const s2 = school.students.find(s => s.id === 'std_2');
    assert.ok(s1 && s2, 'Both Aarav and Ananya returned');
    assert.strictEqual(s1.name, 'Aarav Sharma');
    assert.strictEqual(s2.name, 'Ananya Sharma');
    assert.strictEqual(s1.rollNumber, '12');
    assert.strictEqual(s2.rollNumber, '05');

    // Security check: Verify NO Aadhaar, NO Ledger, NO parentEmail in student objects
    assert.strictEqual(s1.aadhaar, undefined, 'Aadhaar not leaked');
    assert.strictEqual(s1.ledger, undefined, 'Ledger not leaked');
    assert.strictEqual(s1.parentEmail, undefined, 'parentEmail not leaked');

    pass('T09: Siblings in same school both mapped with distinct isolated student records');
  } catch (err) {
    fail('T09: Siblings mapping failed', err);
  }

  // Test 10: Cross-school mapping (Children in Alpha & Beta)
  try {
    const req = createMockReq({
      query: { action: 'context' },
      headers: {
        authorization: 'Bearer mock_id_token_:parent.cross@test.com',
        'x-parent-email': 'parent.cross@test.com'
      }
    });
    const res = createMockRes();
    await parentPortalHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.schools.length, 2, 'Both Alpha and Beta schools mapped');
    const schoolIds = res.body.schools.map(s => s.schoolId).sort();
    assert.deepStrictEqual(schoolIds, ['school_alpha', 'school_beta']);

    const alphaSchool = res.body.schools.find(s => s.schoolId === 'school_alpha');
    const betaSchool = res.body.schools.find(s => s.schoolId === 'school_beta');
    assert.strictEqual(alphaSchool.students[0].name, 'Diya Verma');
    assert.strictEqual(betaSchool.students[0].name, 'Rohan Verma');

    pass('T10: Cross-school mapping returns multiple schools with separate children');
  } catch (err) {
    fail('T10: Cross-school mapping failed', err);
  }

  // Test 11: Secondary parent email mapping
  try {
    const req = createMockReq({
      query: { action: 'context' },
      headers: {
        authorization: 'Bearer mock_id_token_:mother.patel@test.com',
        'x-parent-email': 'mother.patel@test.com'
      }
    });
    const res = createMockRes();
    await parentPortalHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.schools.length, 1);
    const student = res.body.schools[0].students[0];
    assert.strictEqual(student.id, 'std_5');
    assert.strictEqual(student.name, 'Kavya Patel');
    pass('T11: Secondary parent email (mother.patel@test.com) successfully retrieves student');
  } catch (err) {
    fail('T11: Secondary parent email failed', err);
  }

  // Test 12: Real-time revocation (Email removed by school admin)
  try {
    // Admin removes email from std_5
    await adminDb.collection('tenant_data').doc('school_alpha').collection('students').doc('std_5').update({
      secondaryParentEmailNorm: 'revoked@test.com',
      secondaryParentEmail: 'revoked@test.com'
    });

    // Immediate next context call for mother.patel@test.com
    const req = createMockReq({
      query: { action: 'context' },
      headers: {
        authorization: 'Bearer mock_id_token_:mother.patel@test.com',
        'x-parent-email': 'mother.patel@test.com'
      }
    });
    const res = createMockRes();
    await parentPortalHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.schools.length, 0, 'Zero schools returned after revocation');
    assert.ok(res.body.message.includes('No active student records found'), 'Revocation message returned');
    pass('T12: Immediate real-time revocation on email modification (zero sync lag)');
  } catch (err) {
    fail('T12: Real-time revocation test failed', err);
  }

  // Test 13: Portal disabled school
  try {
    const req = createMockReq({
      query: { action: 'context' },
      headers: {
        authorization: 'Bearer mock_id_token_:parent.gamma@test.com',
        'x-parent-email': 'parent.gamma@test.com'
      }
    });
    const res = createMockRes();
    await parentPortalHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.schools.length, 0, 'School with parentPortal.enabled == false excluded');
    pass('T13: School with parent portal disabled is excluded from parent access');
  } catch (err) {
    fail('T13: Disabled portal test failed', err);
  }

  // =========================================================================
  // CATEGORY 3: SECURITY RULES DIRECT ACCESS ISOLATION
  // =========================================================================
  console.log('\n=== Category 3: Security Rules Direct Access Denial for Parents ===');

  // Authenticated Context with parent token (role: 'parent')
  const parentAuthContext = testEnv.authenticatedContext('parent_abc1234567890', { role: 'parent' });
  const parentDb = parentAuthContext.firestore();

  // Test 14: Parent cannot read or write tenant_data root doc
  try {
    await assertFails(parentDb.doc('tenant_data/school_alpha').get());
    await assertFails(parentDb.doc('tenant_data/school_alpha').set({ hacked: true }, { merge: true }));
    pass('T14: Parent token direct read/write to tenant_data root is DENIED');
  } catch (err) {
    fail('T14: Root doc rule check failed', err);
  }

  // Test 15: Parent cannot read or write students subcollection directly
  try {
    await assertFails(parentDb.doc('tenant_data/school_alpha/students/std_1').get());
    await assertFails(parentDb.doc('tenant_data/school_alpha/students/std_1').update({ name: 'Tampered' }));
    pass('T15: Parent token direct read/write to students subcollection is DENIED');
  } catch (err) {
    fail('T15: Students subcollection rule check failed', err);
  }

  // Test 16: Parent cannot read or write fees_years directly
  try {
    await assertFails(parentDb.doc('tenant_data/school_alpha/fees_years/2026/months/2026-10').get());
    await assertFails(parentDb.doc('tenant_data/school_alpha/fees_years/2026/months/2026-10').set({ fake: true }));
    pass('T16: Parent token direct read/write to fees_years is DENIED');
  } catch (err) {
    fail('T16: Fees_years rule check failed', err);
  }

  // Test 17: Parent cannot read or write attendance_months or exam_marks directly
  try {
    await assertFails(parentDb.doc('tenant_data/school_alpha/attendance_months/2026-10/classes/5').get());
    await assertFails(parentDb.doc('tenant_data/school_alpha/exam_marks/term_1').get());
    pass('T17: Parent token direct read to attendance_months and exam_marks is DENIED');
  } catch (err) {
    fail('T17: Attendance & exam marks rule check failed', err);
  }

  // Test 18: Parent cannot read server-only parent_otp_sessions collection directly
  try {
    await assertFails(parentDb.doc('parent_otp_sessions/psess_secret').get());
    await assertFails(parentDb.doc('parent_otp_sessions/psess_secret').set({ status: 'verified' }));
    pass('T18: Parent token direct client read/write to parent_otp_sessions is DENIED');
  } catch (err) {
    fail('T18: OTP sessions server-only rule check failed', err);
  }

  console.log('\n' + '='.repeat(70));
  console.log(`PARENT PORTAL PHASE B1 TEST SUMMARY: Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log('='.repeat(70));

  if (failedCount > 0) {
    process.exit(1);
  }
}

runParentPortalTests().catch(err => {
  console.error('Fatal parent portal test error:', err);
  process.exit(1);
});
