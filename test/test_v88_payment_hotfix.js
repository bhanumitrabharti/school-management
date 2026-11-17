'use strict';

/**
 * test/test_v88_payment_hotfix.js
 *
 * Real Playwright UI Test against Firestore Emulator for v88 Hotfix:
 * 1. Collect Payment (Standard)
 * 2. Discount Payment
 * 3. Void / Reversal
 * 4. Bulk Charge
 *
 * Asserts UI success toast, Firestore month doc txn with receiptNo,
 * Firestore fee_activity_logs subcollection doc, and zero console errors.
 */

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
}

const { chromium } = require('playwright');
const express = require('express');
const http = require('http');
const path = require('path');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const saPath = path.resolve(ROOT_DIR, 'service-account-key.json');
if (!admin.apps.length) {
  if (require('fs').existsSync(saPath)) {
    admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
  } else {
    admin.initializeApp({ projectId: 'ctrl-shift-solutions' });
  }
}
const db = admin.firestore();
const DUMMY_SCHOOL = 'dummy_test_school_isolated';
const TEST_PORT = 3488;

async function startLocalServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(ROOT_DIR));

  app.post('/api/verify-school-access', require('../api/verify-school-access.js'));
  app.post('/api/manage-credentials', require('../api/manage-credentials.js'));

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(TEST_PORT, () => {
      console.log(`[Local Server] Running on http://localhost:${TEST_PORT}`);
      resolve(server);
    });
  });
}

async function seedEmulator() {
  console.log('\n--- Seeding dummy_test_school_isolated in Emulator ---');
  const adminPassHash = bcrypt.hashSync('DummyAdmin@123', 10);

  // 1. School directory entry
  await db.collection('schools').doc(DUMMY_SCHOOL).set({
    school_id: DUMMY_SCHOOL,
    school_name: 'Dummy Isolated Test School',
    subdomain: 'dummy-test',
    status: 'active',
    allowed_features: ['fees', 'students', 'teachers', 'attendance', 'exams', 'documents']
  }, { merge: true });

  // 2. Private credentials
  const docRef = db.collection('tenant_data').doc(DUMMY_SCHOOL);
  await docRef.collection('private').doc('credentials').set({
    adminUsername: 'dummyadmin',
    adminPassword: adminPassHash
  });

  // 3. Root tenant document (v2 scaled + restructured)
  await docRef.set({
    settings: {
      schoolName: 'Dummy Isolated Test School',
      schoolCode: 'DIST',
      credentialsIsolated: true,
      studentsMigrated: true,
      storageVersion: 2,
      restructured: true,
      feeLogMigrated: true,
      adminUsername: 'dummyadmin',
      adminPassword: adminPassHash,
      classes: ['Class 1', 'Class 2'],
      feeHeads: [
        { id: 'fh_tuition', name: 'Tuition Fee', defaultAmount: 2000 },
        { id: 'fh_exam', name: 'Exam Fee', defaultAmount: 500 }
      ],
      feeStructure: {
        'Class 1': {
          'fh_tuition': 2000,
          'fh_exam': 500
        }
      }
    },
    students: [
      { id: 'dummy_s1', firstName: 'Aarav', lastName: 'Kumar', class: 'Class 1', section: 'A', status: 'Active' }
    ],
    teachers: [],
    fees: []
  }, { merge: true });

  // 4. Student in subcollection
  await docRef.collection('students').doc('dummy_s1').set({
    id: 'dummy_s1',
    schoolId: DUMMY_SCHOOL,
    firstName: 'Aarav',
    lastName: 'Kumar',
    class: 'Class 1',
    section: 'A',
    status: 'Active'
  }, { merge: true });

  // 5. Initial due in month doc (fees_years/2026/months/11)
  const dueTxn = {
    id: 'due_init_01',
    type: 'due',
    studentId: 'dummy_s1',
    amount: 10000,
    grossAmount: 10000,
    discount: 0,
    date: '2026-11-01',
    timestamp: '2026-11-01T10:00:00.000Z',
    feeHeadId: 'fh_tuition',
    feeHeadName: 'Tuition Fee',
    description: 'November Tuition Due'
  };
  await docRef.collection('fees_years').doc('2026').collection('months').doc('11').set({
    transactions: [dueTxn]
  });

  // 6. Reset counter doc
  await docRef.collection('counters').doc('fee_receipts').set({
    '2026-27': 0
  });

  console.log('✅ Emulator seeded successfully.');
}

async function runHotfixTests() {
  console.log('================================================================');
  console.log(' PLAYWRIGHT REAL UI TEST: v88 PAYMENT, DISCOUNT, VOID, BULK     ');
  console.log('================================================================');

  await seedEmulator();
  const server = await startLocalServer();
  const browser = await chromium.launch({ headless: true });

  const capturedConsoleErrors = [];

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error' && !text.includes('favicon.ico') && !text.includes('404')) {
        console.error(`[PAGE CONSOLE ERROR]: ${text}`);
        capturedConsoleErrors.push(text);
      }
    });

    page.on('pageerror', err => {
      console.error(`[PAGE UNHANDLED ERROR]: ${err.message}`);
      capturedConsoleErrors.push(err.message);
    });

    const TARGET_URL = `http://localhost:${TEST_PORT}/?test_subdomain=dummy-test&emulator_port=8085`;
    console.log(`\nNavigating to ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 30000 });

    // Wait for login form
    await page.waitForFunction(() => {
      const btn = document.getElementById('login-submit-btn');
      return btn && !btn.disabled;
    }, { timeout: 15000 });

    // Login as School Admin
    console.log('Logging in as School Admin...');
    await page.click('button.login-tab[data-role="admin"]');
    await page.fill('#admin-username', 'dummyadmin');
    await page.fill('#admin-password', 'DummyAdmin@123');
    await page.click('#login-submit-btn');
    await page.waitForSelector('#app-layout:not(.hidden)', { timeout: 15000 });
    console.log('✅ Admin login succeeded.');

    // Navigate to Fees Page
    console.log('Navigating to Fees Page...');
    await page.click('.sidebar-nav a[data-page="fees"]');
    await page.waitForSelector('#page-fees:not(.hidden)', { timeout: 10000 });
    // Wait for fees data to render
    await page.waitForSelector('.fees-collect-btn', { timeout: 10000 });
    console.log('✅ Fees page rendered.');

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Standard Payment Collection
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 1. Testing Standard Payment Collection ---');
    await page.click('button.fees-collect-btn[data-id="dummy_s1"]');
    await page.waitForSelector('#collect-payment-save-btn', { timeout: 5000 });

    // Set payment amount 1500
    await page.fill('#pay-gross-amount', '1500');
    await page.click('#collect-payment-save-btn');

    // Wait for success toast
    await page.waitForFunction(() => {
      const msgs = Array.from(document.querySelectorAll('#toast-container .toast-message'));
      return msgs.some(m => m.textContent.includes('recorded successfully'));
    }, { timeout: 10000 });
    const toastText1 = await page.evaluate(() => {
      const msgs = Array.from(document.querySelectorAll('#toast-container .toast-message'));
      const hit = msgs.find(m => m.textContent.includes('recorded successfully'));
      return hit ? hit.textContent : '';
    });
    console.log(`  Toast message: "${toastText1}"`);
    assert.ok(toastText1.includes('recorded successfully'), 'Toast must indicate successful payment');

    // Wait for any post-payment modal and close
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      if (typeof SchoolApp.closeModal === 'function') SchoolApp.closeModal();
    });

    // Verify Firestore Month Doc
    const monthDoc1 = await db.collection('tenant_data').doc(DUMMY_SCHOOL)
      .collection('fees_years').doc('2026').collection('months').doc('11').get();
    assert.ok(monthDoc1.exists, 'Month doc 2026/11 must exist');
    const txns1 = monthDoc1.data().transactions || [];
    const standardPaymentTxn = txns1.find(t => t.type === 'payment' && t.amount === 1500);
    assert.ok(standardPaymentTxn, 'Month doc must contain payment txn of ₹1500');
    assert.ok(standardPaymentTxn.receiptNo, 'Payment txn must have a generated receiptNo');
    console.log(`  ✔ Firestore Month Doc: Found payment with receiptNo: ${standardPaymentTxn.receiptNo}`);

    // Verify Firestore fee_activity_logs subcollection
    const logSnap1 = await db.collection('tenant_data').doc(DUMMY_SCHOOL)
      .collection('fee_activity_logs').where('txnId', '==', standardPaymentTxn.id).get();
    assert.strictEqual(logSnap1.empty, false, 'fee_activity_logs doc must exist for payment txn');
    const logData1 = logSnap1.docs[0].data();
    assert.strictEqual(logData1.amount, 1500);
    assert.strictEqual(logData1.receiptNo, standardPaymentTxn.receiptNo);
    console.log(`  ✔ fee_activity_logs subcollection: Found log doc (${logSnap1.docs[0].id}) matching receiptNo`);

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Discount Payment Collection
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 2. Testing Discount Payment Collection ---');
    await page.waitForTimeout(500);
    await page.click('button.fees-collect-btn[data-id="dummy_s1"]');
    await page.waitForSelector('#collect-payment-save-btn', { timeout: 5000 });

    // Enable discount
    await page.click('#pay-discount-toggle');
    await page.waitForSelector('#pay-discount-amount', { timeout: 3000 });
    await page.fill('#pay-gross-amount', '1000');
    await page.fill('#pay-discount-amount', '200');
    await page.click('#collect-payment-save-btn');

    // Wait for discount payment toast
    await page.waitForFunction(() => {
      const msgs = Array.from(document.querySelectorAll('#toast-container .toast-message'));
      return msgs.some(m => m.textContent.includes('discount applied'));
    }, { timeout: 10000 });
    const toastText2 = await page.evaluate(() => {
      const msgs = Array.from(document.querySelectorAll('#toast-container .toast-message'));
      const hit = msgs.find(m => m.textContent.includes('discount applied'));
      return hit ? hit.textContent : '';
    });
    console.log(`  Toast message: "${toastText2}"`);
    assert.ok(toastText2.includes('discount applied'), 'Toast must indicate discount payment recorded');

    // Wait for any post-payment modal and close
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      if (typeof SchoolApp.closeModal === 'function') SchoolApp.closeModal();
    });

    // Verify Firestore Month Doc for discount payment
    const monthDoc2 = await db.collection('tenant_data').doc(DUMMY_SCHOOL)
      .collection('fees_years').doc('2026').collection('months').doc('11').get();
    const txns2 = monthDoc2.data().transactions || [];
    const discountPaymentTxn = txns2.find(t => t.type === 'payment' && t.amount === 800 && t.discount === 200);
    assert.ok(discountPaymentTxn, 'Month doc must contain discount payment txn of ₹800 (net)');
    assert.ok(discountPaymentTxn.receiptNo, 'Discount payment txn must have a generated receiptNo');
    console.log(`  ✔ Firestore Month Doc: Found discount payment (net: ₹${discountPaymentTxn.amount}, disc: ₹${discountPaymentTxn.discount}, receiptNo: ${discountPaymentTxn.receiptNo})`);

    // Verify Firestore fee_activity_logs for discount payment
    const logSnap2 = await db.collection('tenant_data').doc(DUMMY_SCHOOL)
      .collection('fee_activity_logs').where('txnId', '==', discountPaymentTxn.id).get();
    assert.strictEqual(logSnap2.empty, false, 'fee_activity_logs doc must exist for discount payment');
    const logData2 = logSnap2.docs[0].data();
    assert.strictEqual(logData2.amount, 800);
    assert.strictEqual(logData2.receiptNo, discountPaymentTxn.receiptNo);
    console.log(`  ✔ fee_activity_logs subcollection: Found discount log doc (${logSnap2.docs[0].id}) matching receiptNo`);

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Void Payment
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 3. Testing Payment Void / Reversal ---');
    await page.waitForTimeout(500);

    // Open student financial profile modal to click void button on the transaction
    await page.evaluate((sId) => {
      window.openStudentFinancialProfile(sId);
    }, 'dummy_s1');

    await page.waitForSelector(`.profile-void-txn-btn[data-id="${standardPaymentTxn.id}"]`, { timeout: 5000 });
    await page.click(`.profile-void-txn-btn[data-id="${standardPaymentTxn.id}"]`);

    await page.waitForSelector('#void-modal-confirm-btn', { timeout: 5000 });
    await page.fill('#void-txn-reason-input', 'Testing void reversal functionality in v88 hotfix');
    await page.click('#void-modal-confirm-btn');

    await page.waitForTimeout(1200);

    // Close profile modal if reopened
    await page.evaluate(() => {
      if (typeof SchoolApp.closeModal === 'function') SchoolApp.closeModal();
    });

    // Verify Firestore Month Doc for void & reversal
    const monthDoc3 = await db.collection('tenant_data').doc(DUMMY_SCHOOL)
      .collection('fees_years').doc('2026').collection('months').doc('11').get();
    const txns3 = monthDoc3.data().transactions || [];
    const originalTxnVoided = txns3.find(t => t.id === standardPaymentTxn.id);
    assert.strictEqual(originalTxnVoided.isVoided, true, 'Original transaction must be marked isVoided: true');

    const reversalTxn = txns3.find(t => t.isReversal === true && t.originalTxnId === standardPaymentTxn.id);
    assert.ok(reversalTxn, 'Reversal transaction must exist in month doc');
    assert.strictEqual(reversalTxn.amount, -1500, 'Reversal amount must be -1500');
    console.log(`  ✔ Firestore Month Doc: Found reversal txn with amount: ${reversalTxn.amount}`);

    // Verify Firestore fee_activity_logs for void reversal
    const logSnap3 = await db.collection('tenant_data').doc(DUMMY_SCHOOL)
      .collection('fee_activity_logs').where('txnId', '==', reversalTxn.id).get();
    assert.strictEqual(logSnap3.empty, false, 'fee_activity_logs doc must exist for reversal txn');
    const logData3 = logSnap3.docs[0].data();
    assert.strictEqual(logData3.feeHeadName, 'Void / Reversal');
    assert.strictEqual(logData3.amount, -1500);
    console.log(`  ✔ fee_activity_logs subcollection: Found void log doc (${logSnap3.docs[0].id})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Bulk Charge
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 4. Testing Bulk Charge Generation ---');
    await page.waitForTimeout(500);
    await page.waitForSelector('#bulk-charge-fee-btn', { timeout: 5000 });
    await page.click('#bulk-charge-fee-btn');
    await page.waitForSelector('#bulk-charge-save-btn', { timeout: 5000 });

    await page.selectOption('#bulk-class', 'Class 1');
    await page.selectOption('#bulk-feehead', 'fh_exam');
    await page.fill('#bulk-desc', 'Annual Science Exhibition Fee');
    await page.click('#bulk-charge-save-btn');

    await page.waitForTimeout(1500);

    // Verify Firestore Month Doc for bulk charge due
    const monthDoc4 = await db.collection('tenant_data').doc(DUMMY_SCHOOL)
      .collection('fees_years').doc('2026').collection('months').doc('11').get();
    const txns4 = monthDoc4.data().transactions || [];
    const bulkDueTxn = txns4.find(t => t.type === 'due' && t.description === 'Annual Science Exhibition Fee');
    assert.ok(bulkDueTxn, 'Month doc must contain new bulk due charge');
    assert.strictEqual(bulkDueTxn.studentId, 'dummy_s1');
    console.log(`  ✔ Firestore Month Doc: Found generated bulk due txn (${bulkDueTxn.id}, amount: ₹${bulkDueTxn.amount})`);

    // Verify Firestore fee_activity_logs for bulk charge
    const logSnap4 = await db.collection('tenant_data').doc(DUMMY_SCHOOL)
      .collection('fee_activity_logs').where('txnId', '==', bulkDueTxn.id).get();
    assert.strictEqual(logSnap4.empty, false, 'fee_activity_logs doc must exist for bulk charge txn');
    const logData4 = logSnap4.docs[0].data();
    assert.strictEqual(logData4.studentId, 'dummy_s1');
    console.log(`  ✔ fee_activity_logs subcollection: Found bulk charge log doc (${logSnap4.docs[0].id})`);

    // Console Error Assertion
    assert.strictEqual(capturedConsoleErrors.length, 0, `Zero console errors allowed! Found: ${capturedConsoleErrors.join('; ')}`);
    console.log('\n✅ Zero console errors detected throughout all 4 UI operations!');

    console.log('\n================================================================');
    console.log(' ALL 4 REAL UI PLAYWRIGHT TESTS PASSED SUCCESSFULLY!          ');
    console.log('================================================================\n');

  } finally {
    await browser.close();
    server.close();
  }
}

runHotfixTests().catch(err => {
  console.error('\n❌ Playwright test runner failed:', err);
  process.exit(1);
});
