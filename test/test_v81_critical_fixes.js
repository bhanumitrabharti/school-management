'use strict';

/**
 * test/test_v81_critical_fixes.js
 *
 * Comprehensive Test Suite for v81 Critical Fixes Batch 1:
 * - Item 1: Transfer Certificate preview controls, date defaults in IST, left remarks default, XSS escaping (js/documents.js)
 * - Item 2: Atomic sequential fee receipt counter (<CODE>/<YYYY-YY>/<XXXXXX>), deterministic fallback RCP-<CODE>-<8chars>, firestore.rules (js/app.js, firestore.rules)
 * - Item 3: Fee receipt running balance, Original vs Duplicate copy indicator, Amount in Words, Principal signature, student full name (js/fees.js)
 * - Item 4: Single authoritative logo/signature helpers across admin, exams, fees, documents (js/admin.js, js/exams.js, js/fees.js, js/documents.js)
 * - Item 5a & 5b: Parent exam results (unmarked -> 'Not entered', orphan merged by name), Admin report card parity with stored aggregates (api/_lib/parents/exams.js, js/exams.js)
 * - Item 6: Accounts normalizeFeeHead (month-stripping, transport fee head -> 42100), idempotent journal sync, accounts checklist parity (api/accounts.js, js/accounts.js)
 * - Item 8: Aadhaar masked as XXXX-XXXX-1234 in student modal for all viewers, attendance report IST 1st-of-month date range, 0-day students counted as noDataCount (js/students.js, js/attendance.js)
 */

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.MOCK_PARENT_MODE = 'true';
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const admin = require('firebase-admin');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');

const rulesPath = path.resolve(__dirname, '../firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) {
  if (fs.existsSync(saPath)) {
    admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
  } else {
    admin.initializeApp({ projectId: 'ctrl-shift-solutions' });
  }
}
const db = admin.firestore();

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

async function runTest(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (err) {
    fail(name, err);
  }
}

// Prepare loaded SchoolApp environment
function setupTestEnvironment() {
  const baseDir = path.resolve(__dirname, '..');
  let appCode = fs.readFileSync(path.join(baseDir, 'js/app.js'), 'utf8');
  appCode = appCode.replace(/^\s*import\s+[\s\S]*?;\s*$/gm, '');
  appCode = appCode.replace(/^\s*export\s+const\s+/gm, 'const ');
  appCode = appCode.replace(/^\s*export\s+/gm, '');

  const cutMarker = "document.addEventListener('DOMContentLoaded'";
  const cutIdx = appCode.indexOf(cutMarker);
  if (cutIdx !== -1) {
    appCode = appCode.substring(0, cutIdx);
  }

  const firebaseStubs = `
    function initializeApp() { return {}; }
    function initializeFirestore() { return {}; }
    function persistentLocalCache() { return {}; }
    function persistentMultipleTabManager() { return {}; }
    function getFirestore() { return {}; }
    function connectFirestoreEmulator() {}
    function doc() { return {}; }
    function getDoc() { return Promise.resolve({ exists: () => false, data: () => ({}) }); }
    function getDocFromServer() { return Promise.resolve({ exists: () => false, data: () => ({}) }); }
    function setDoc() { return Promise.resolve(); }
    function updateDoc() { return Promise.resolve(); }
    function deleteDoc() { return Promise.resolve(); }
    function collection() { return {}; }
    function getDocs() { return Promise.resolve({ empty: true, docs: [] }); }
    function onSnapshot() { return () => {}; }
    function serverTimestamp() { return new Date(); }
    const FieldPath = { documentId: () => '__name__' };
    function waitForPendingWrites() { return Promise.resolve(); }
    function terminate() { return Promise.resolve(); }
    function clearIndexedDbPersistence() { return Promise.resolve(); }
    function query() { return {}; }
    function where() { return {}; }
    function limit() { return {}; }
    function orderBy() { return {}; }
    function startAfter() { return {}; }
    function writeBatch() { return { set() {}, commit() { return Promise.resolve(); } }; }
    function deleteField() { return null; }
    function arrayUnion() { return []; }
    function runTransaction() { return Promise.resolve(); }
    function getAuth() { return { onAuthStateChanged: () => () => {} }; }
    function signInWithEmailAndPassword() { return Promise.resolve(); }
    function signOut() { return Promise.resolve(); }
    function setPersistence() { return Promise.resolve(); }
    const browserSessionPersistence = 'SESSION';
    function connectAuthEmulator() {}
    function getStorage() { return {}; }
    function ref() { return {}; }
    function uploadBytes() { return Promise.resolve(); }
    function getDownloadURL() { return Promise.resolve(''); }
    function deleteObject() { return Promise.resolve(); }
    function connectStorageEmulator() {}
  `;
  appCode = firebaseStubs + '\n' + appCode;

  const windowObj = {
    location: { hostname: 'localhost', search: '' },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k, v) { delete this._data[k]; },
      clear() { this._data = {}; }
    },
    sessionStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k, v) { delete this._data[k]; },
      clear() { this._data = {}; }
    },
    document: {
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() {
        return {
          style: {},
          setAttribute() {},
          getAttribute() { return null; },
          appendChild() {},
          innerHTML: ''
        };
      }
    },
    navigator: { userAgent: 'NodeTestRunner' },
    URL: URL,
    URLSearchParams: URLSearchParams,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval
  };
  windowObj.window = windowObj;

  const sandbox = vm.createContext({
    window: windowObj,
    document: windowObj.document,
    localStorage: windowObj.localStorage,
    sessionStorage: windowObj.sessionStorage,
    navigator: windowObj.navigator,
    location: windowObj.location,
    URL: URL,
    URLSearchParams: URLSearchParams,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    Intl: Intl,
    Date: Date,
    Math: Math,
    String: String,
    Number: Number,
    Array: Array,
    Object: Object,
    RegExp: RegExp,
    JSON: JSON
  });

  vm.runInContext(appCode, sandbox);

  // Expose SchoolApp directly into global sandbox scope as well
  sandbox.SchoolApp = windowObj.SchoolApp;

  // Hook live Firestore emulator into window.firestore & window.db for transactions
  windowObj.db = db;
  windowObj.firestore = {
    doc: (database, col, sId, subCol, docId) => {
      return db.collection(col).doc(sId).collection(subCol).doc(docId);
    },
    runTransaction: async (database, updateFunction) => {
      return db.runTransaction(async (transaction) => {
        return updateFunction({
          get: async (docRef) => {
            const snap = await transaction.get(docRef);
            return {
              exists: () => (typeof snap.exists === 'function' ? snap.exists() : !!snap.exists),
              data: () => (typeof snap.data === 'function' ? snap.data() : snap.data())
            };
          },
          set: (docRef, data, opts) => transaction.set(docRef, data, opts || {})
        });
      });
    }
  };

  return { sandbox, window: windowObj };
}

async function runAllTests() {
  console.log('='.repeat(70));
  console.log('v81 CRITICAL FIXES BATCH 1: TEST SUITE EXECUTION');
  console.log('='.repeat(70));

  let testEnv;
  try {
    testEnv = await initializeTestEnvironment({
      projectId: 'ctrl-shift-solutions',
      firestore: {
        rules: rulesContent,
        host: '127.0.0.1',
        port: 8085
      }
    });
  } catch (e) {
    console.warn('Note: rules unit testing env init warning:', e.message);
  }

  // --------------------------------------------------------------------------
  // ITEM 1: Transfer Certificate Preview & Date Defaults (js/documents.js)
  // --------------------------------------------------------------------------
  console.log('\n--- Checking Item 1: Transfer Certificate Preview & Date Defaults ---');

  await runTest('Item 1: SchoolApp.getLocalDateString returns YYYY-MM-DD in IST', async () => {
    const { window } = setupTestEnvironment();
    assert(typeof window.SchoolApp.getLocalDateString === 'function', 'getLocalDateString must be a function');
    const dateStr = window.SchoolApp.getLocalDateString();
    assert(/^\d{4}-\d{2}-\d{2}$/.test(dateStr), 'getLocalDateString must return YYYY-MM-DD format, got: ' + dateStr);

    const specificDate = new Date('2026-11-05T02:00:00Z'); // 07:30 IST
    const istStr = window.SchoolApp.getLocalDateString(specificDate);
    assert.strictEqual(istStr, '2026-11-05', 'Should convert UTC to Indian Standard Time date');
  });

  await runTest('Item 1: TC Preview (!isPrint) renders interactive controls and blank default remarks for Left student', async () => {
    const { sandbox, window } = setupTestEnvironment();
    const docsCode = fs.readFileSync(path.resolve(__dirname, '../js/documents.js'), 'utf8');
    vm.runInContext(docsCode, sandbox);

    const student = {
      id: 'stu_left_01',
      name: 'Left Student Name',
      admissionNumber: 'ADM-101',
      rollNumber: '1',
      class: '5',
      section: 'A',
      parentName: 'Father Name',
      motherName: 'Mother Name',
      dateOfBirth: '2015-05-15',
      status: 'Left',
      tcReason: 'Family Transfer',
      leavingDate: '2026-11-01'
    };
    window.SchoolApp.store = {
      settings: { schoolName: 'Greenwood High', address: 'City Center' },
      students: [student]
    };

    // Render Preview (!isPrint)
    const previewHtml = window.DocumentsModule.buildTCHTML(student, false);
    assert(previewHtml.includes('id="cert-tc-date-leaving"'), 'Preview must render date of leaving input control');
    assert(previewHtml.includes('id="cert-tc-reason"'), 'Preview must render reason select control');
    assert(previewHtml.includes('id="cert-tc-conduct"'), 'Preview must render conduct select control');
    assert(previewHtml.includes('id="cert-tc-remarks"'), 'Preview must render remarks input control');

    // For Left student, remarks must NOT default to "Promoted to next class"
    assert(!previewHtml.includes('value="Promoted to next class"'), 'Left student remarks must NOT default to "Promoted to next class"');
  });

  await runTest('Item 1: TC Print (isPrint = true) renders clean plain values without controls', async () => {
    const { sandbox, window } = setupTestEnvironment();
    const docsCode = fs.readFileSync(path.resolve(__dirname, '../js/documents.js'), 'utf8');
    vm.runInContext(docsCode, sandbox);

    const student = {
      id: 'stu_pass_02',
      name: 'Passing Student',
      admissionNumber: 'ADM-102',
      rollNumber: '2',
      class: '10',
      section: 'B',
      status: 'Active'
    };
    window.SchoolApp.store = {
      settings: { schoolName: 'Greenwood High' },
      students: [student]
    };

    // Render Print (isPrint = true)
    const printHtml = window.DocumentsModule.buildTCHTML(student, true);
    assert(!printHtml.includes('<input'), 'Print output must NOT contain input controls');
    assert(!printHtml.includes('<select'), 'Print output must NOT contain select controls');
    assert(printHtml.includes('On Request'), 'Print output must contain plain reason text');
    assert(printHtml.includes('Good'), 'Print output must contain plain conduct text');
    assert(printHtml.includes('Promoted to next class'), 'Print output must contain plain remarks text for Active student');
  });

  await runTest('Item 1: TC escapes XSS in student names and values in both preview and print', async () => {
    const { sandbox, window } = setupTestEnvironment();
    const docsCode = fs.readFileSync(path.resolve(__dirname, '../js/documents.js'), 'utf8');
    vm.runInContext(docsCode, sandbox);

    const studentXSS = {
      id: 'stu_xss',
      name: '<script>alert("xss")</script>',
      admissionNumber: 'ADM-XSS',
      class: '5',
      section: 'A',
      status: 'Active'
    };
    window.SchoolApp.store = {
      settings: { schoolName: 'Safe School' },
      students: [studentXSS]
    };

    const preview = window.DocumentsModule.buildTCHTML(studentXSS, false);
    assert(!preview.includes('<script>alert("xss")</script>'), 'Preview must escape XSS in student name');
    assert(preview.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;') || preview.includes('&lt;script&gt;'), 'Preview should escape HTML entities');

    const printOut = window.DocumentsModule.buildTCHTML(studentXSS, true);
    assert(!printOut.includes('<script>alert("xss")</script>'), 'Print must escape XSS in student name');
  });

  // --------------------------------------------------------------------------
  // ITEM 2: Fee Receipt Counter & Numbering (js/app.js & firestore.rules)
  // --------------------------------------------------------------------------
  console.log('\n--- Checking Item 2: Fee Receipt Counter & Numbering ---');

  await runTest('Item 2: SchoolApp.generateFeeReceiptNumber increments sequentially in format <CODE>/<YYYY-YY>/<XXXXXX>', async () => {
    const { window } = setupTestEnvironment();

    const schoolId = 'test_v81_counter_school';
    // Clear previous counter doc for fresh test
    await db.collection('tenant_data').doc(schoolId).collection('counters').doc('fee_receipts').delete();

    await db.collection('tenant_data').doc(schoolId).set({
      settings: { schoolCode: 'GWH', schoolName: 'Greenwood High' }
    });
    window.SchoolApp.store = {
      currentSchoolId: schoolId,
      settings: { schoolCode: 'GWH', schoolName: 'Greenwood High' }
    };

    const r1 = await window.SchoolApp.generateFeeReceiptNumber('2026-11-05', schoolId);
    assert.strictEqual(r1, 'GWH/2026-27/000001', 'First receipt number must be GWH/2026-27/000001, got: ' + r1);

    const r2 = await window.SchoolApp.generateFeeReceiptNumber('2026-11-05', schoolId);
    assert.strictEqual(r2, 'GWH/2026-27/000002', 'Second receipt number must be GWH/2026-27/000002, got: ' + r2);

    // Cross-check Firestore counter doc
    const counterDoc = await db.collection('tenant_data').doc(schoolId).collection('counters').doc('fee_receipts').get();
    assert(counterDoc.exists, 'Counter doc must exist');
    assert.strictEqual(counterDoc.data()['2026-27'], 2, 'Counter value for 2026-27 must be 2');

    // Test new Financial Year (e.g. 2027-04-01 -> FY 2027-28)
    const rNewFY = await window.SchoolApp.generateFeeReceiptNumber('2027-04-01', schoolId);
    assert.strictEqual(rNewFY, 'GWH/2027-28/000001', 'First receipt of new FY must reset counter to 000001, got: ' + rNewFY);
  });

  await runTest('Item 2: SchoolApp.getReceiptNumber deterministically derives RCP-<CODE>-<8chars> for legacy txns', async () => {
    const { window } = setupTestEnvironment();

    const txnWithNoReceiptNo = {
      id: 'txn_9876543210abcdef',
      date: '2026-10-15',
      amount: 1500
    };
    const settings = { schoolCode: 'DPS' };

    const derived1 = window.SchoolApp.getReceiptNumber(txnWithNoReceiptNo, settings, 'school_dps');
    const derived2 = window.SchoolApp.getReceiptNumber(txnWithNoReceiptNo, settings, 'school_dps');

    assert.strictEqual(derived1, derived2, 'getReceiptNumber must be deterministic');
    assert(derived1.startsWith('RCP-DPS-'), 'Fallback format must start with RCP-<CODE>-, got: ' + derived1);
    assert.strictEqual(derived1.length, 'RCP-DPS-'.length + 8, 'Fallback must have exactly 8 suffix characters');

    // Existing receiptNo is preserved verbatim
    const txnWithReceipt = { receiptNo: 'DPS/2026-27/000123' };
    const preserved = window.SchoolApp.getReceiptNumber(txnWithReceipt, settings, 'school_dps');
    assert.strictEqual(preserved, 'DPS/2026-27/000123', 'Explicit receiptNo must be returned untouched');
  });

  if (testEnv) {
    await runTest('Item 2: Security Rules permit school admin to write counters, block parents and unauthenticated', async () => {
      const adminCtx = testEnv.authenticatedContext('admin_user_01');
      const parentCtx = testEnv.authenticatedContext('parent_user_01');
      const unauthCtx = testEnv.unauthenticatedContext();

      // Seed school_access for admin
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminFirestore = context.firestore();
        await adminFirestore.collection('school_access').doc('admin_user_01').set({
          schoolId: 'rules_test_school',
          role: 'admin'
        });
      });

      const adminDbClient = adminCtx.firestore();
      const parentDbClient = parentCtx.firestore();
      const unauthDbClient = unauthCtx.firestore();

      // Admin write succeeds
      await assertSucceeds(adminDbClient.collection('tenant_data').doc('rules_test_school').collection('counters').doc('fee_receipts').set({
        '2026-27': 1
      }));

      // Parent write fails
      await assertFails(parentDbClient.collection('tenant_data').doc('rules_test_school').collection('counters').doc('fee_receipts').set({
        '2026-27': 2
      }));

      // Unauthenticated write fails
      await assertFails(unauthDbClient.collection('tenant_data').doc('rules_test_school').collection('counters').doc('fee_receipts').set({
        '2026-27': 3
      }));
    });
  }

  // --------------------------------------------------------------------------
  // ITEM 3: Fee Receipt Content & Formatting (js/fees.js)
  // --------------------------------------------------------------------------
  console.log('\n--- Checking Item 3: Fee Receipt Content & Formatting ---');

  await runTest('Item 3: SchoolApp.numberToIndianWords converts amounts to Indian currency words', async () => {
    const { window } = setupTestEnvironment();

    assert(typeof window.SchoolApp.numberToIndianWords === 'function', 'numberToIndianWords must exist');
    assert.strictEqual(window.SchoolApp.numberToIndianWords(0), 'Rupees Zero Only');
    assert.strictEqual(window.SchoolApp.numberToIndianWords(500), 'Rupees Five Hundred Only');
    assert.strictEqual(window.SchoolApp.numberToIndianWords(1250), 'Rupees One Thousand Two Hundred Fifty Only');
    assert.strictEqual(window.SchoolApp.numberToIndianWords(15000), 'Rupees Fifteen Thousand Only');
    assert.strictEqual(window.SchoolApp.numberToIndianWords(150000), 'Rupees One Lakh Fifty Thousand Only');
    assert.strictEqual(window.SchoolApp.numberToIndianWords(10000000), 'Rupees One Crore Only');
  });

  await runTest('Item 3: Receipt HTML has NO hardcoded SVM, shows running balance, Original vs Duplicate copy, Amount in Words', async () => {
    const { sandbox, window } = setupTestEnvironment();
    const feesCode = fs.readFileSync(path.resolve(__dirname, '../js/fees.js'), 'utf8');
    vm.runInContext(feesCode, sandbox);

    const txn = {
      id: 'txn_receipt_test',
      receiptNo: 'UA/2026-27/000055',
      date: '2026-11-05',
      amount: 4500,
      balanceAfter: 1200,
      mode: 'UPI',
      notes: 'Term fee'
    };
    const student = {
      id: 'stu_rec_01',
      name: 'Rohan Verma',
      admissionNumber: 'ADM-5555',
      class: '4',
      section: 'A',
      fatherName: 'Suresh Verma'
    };
    const settings = {
      schoolName: 'Universal Academy',
      schoolCode: 'UA',
      principalSignatureStorageUrl: 'https://storage/sig.png'
    };
    window.SchoolApp.store = {
      currentSchoolId: 'ua_school',
      settings: settings
    };

    // First print right after payment: isDuplicate = false -> "Original Copy"
    const originalHtml = window.generateFeeReceiptHTML(txn, student, 1200, false);
    assert(!originalHtml.includes('SVM'), 'Receipt must NOT contain hardcoded SVM string');
    assert(originalHtml.includes('Original Copy'), 'First receipt must indicate Original Copy');
    assert(originalHtml.includes('Rupees Four Thousand Five Hundred Only'), 'Must contain Amount in Words');
    assert(originalHtml.includes('ADM-5555'), 'Must contain Student Admission Number');
    assert(originalHtml.includes('1,200') || originalHtml.includes('1200'), 'Must show running balance (1200)');
    assert(originalHtml.includes('https://storage/sig.png'), 'Must embed principal signature URL');

    // Subsequent ledger print: isDuplicate = true -> "Duplicate Copy"
    const duplicateHtml = window.generateFeeReceiptHTML(txn, student, 1200, true);
    assert(duplicateHtml.includes('Duplicate Copy'), 'Subsequent receipt print must indicate Duplicate Copy');
  });

  // --------------------------------------------------------------------------
  // ITEM 4: Single Authoritative Logo & Signature Readers (js/admin.js, js/exams.js, js/fees.js, js/documents.js)
  // --------------------------------------------------------------------------
  console.log('\n--- Checking Item 4: Logo & Signature Readers Coverage ---');

  await runTest('Item 4: SchoolApp.getLogoUrl & SchoolApp.getSignatureUrl handle all legacy/v2 locations', async () => {
    const { window } = setupTestEnvironment();

    const logoHelper = window.SchoolApp.getLogoUrl;
    const sigHelper = window.SchoolApp.getSignatureUrl;

    assert.strictEqual(logoHelper({ logoStorageUrl: 'https://cdn/logo1.png' }), 'https://cdn/logo1.png');
    assert.strictEqual(logoHelper({ logoUrl: 'data:image/logo2' }), 'data:image/logo2');
    assert.strictEqual(logoHelper({ schoolLogo: 'data:image/logo3' }), 'data:image/logo3');
    assert.strictEqual(logoHelper({ schoolInfo: { logoStorageUrl: 'https://cdn/logo4.png' } }), 'https://cdn/logo4.png');
    assert.strictEqual(logoHelper({ schoolInfo: { logoUrl: 'data:image/logo5' } }), 'data:image/logo5');
    assert.strictEqual(logoHelper({ schoolInfo: { schoolLogo: 'data:image/logo6' } }), 'data:image/logo6');
    assert.strictEqual(logoHelper({}), '');

    assert.strictEqual(sigHelper({ principalSignatureStorageUrl: 'https://cdn/sig1.png' }), 'https://cdn/sig1.png');
    assert.strictEqual(sigHelper({ principalSignatureUrl: 'data:image/sig2' }), 'data:image/sig2');
    assert.strictEqual(sigHelper({ schoolInfo: { principalSignatureStorageUrl: 'https://cdn/sig3.png' } }), 'https://cdn/sig3.png');
    assert.strictEqual(sigHelper({ schoolInfo: { principalSignatureUrl: 'data:image/sig4' } }), 'data:image/sig4');
    assert.strictEqual(sigHelper({}), '');
  });

  await runTest('Item 4: js/exams.js report card generation does not throw ReferenceError for sigUrl', async () => {
    const { sandbox, window } = setupTestEnvironment();
    const examsCode = fs.readFileSync(path.resolve(__dirname, '../js/exams.js'), 'utf8');
    vm.runInContext(examsCode, sandbox);

    const student = { id: 'stu_01', name: 'Student 1', class: '5', section: 'A' };
    const term = { id: 'term_1', name: 'Term 1' };
    const settings = { schoolName: 'Test School', principalSignatureStorageUrl: 'https://cdn/sig.png' };
    window.SchoolApp.store = { settings: settings, students: [student] };

    assert.doesNotThrow(() => {
      window.generateSingleStudentCardHTML(student, false, {}, null, term, []);
    }, 'generateSingleStudentCardHTML must execute without ReferenceError');
  });

  // --------------------------------------------------------------------------
  // ITEM 5a & 5b: Exam Parity & Parent Portal Display (api/_lib/parents/exams.js & js/exams.js)
  // --------------------------------------------------------------------------
  console.log('\n--- Checking Item 5a & 5b: Exam Parity & Parent Portal Display ---');

  await runTest('Item 5a: api/_lib/parents/exams.js marks unentered configured subjects as isNotEntered (NEVER Fail)', async () => {
    const examsModule = require('../api/_lib/parents/exams.js');
    assert(typeof examsModule.handleExamResult === 'function', 'handleExamResult must be exported');

    const schoolId = 'test_v81_exam_school';
    const parentEmail = 'parent.exam@test.com';

    await db.collection('tenant_data').doc(schoolId).set({
      settings: {
        schoolName: 'Exam Test School',
        studentsMigrated: true,
        storageVersion: 2,
        restructured: true,
        parentPortal: { enabled: true, exams: true }
      },
      examTerms: {
        term_demo: { id: 'term_demo', name: 'Demo Exam', showResultsToParents: true, status: 'published' }
      },
      examSubjects: {
        term_demo: {
          '5': {
            subjects: [
              { id: 'sub_math', name: 'Mathematics', fullMarks: 100, passMarks: 33 },
              { id: 'sub_sci', name: 'Science', fullMarks: 100, passMarks: 33 },
              { id: 'sub_art', name: 'Art & Craft', fullMarks: 50, passMarks: 17 } // un-marked
            ]
          }
        }
      }
    });

    await db.collection('tenant_data').doc(schoolId).collection('portal').doc('config').set({
      enabled: true,
      studentsMigrated: true,
      restructured: true,
      modules: { exams: true }
    });

    await db.collection('tenant_data').doc(schoolId).collection('students').doc('stu_exam_child').set({
      id: 'stu_exam_child',
      name: 'Exam Child',
      class: '5',
      section: 'A',
      parentEmail: parentEmail,
      parentEmailNorm: parentEmail,
      status: 'Active'
    });

    // Save marks with 2 entered subjects, sub_art NOT entered
    await db.collection('tenant_data').doc(schoolId).collection('exam_marks').doc('term_demo').set({
      '5': {
        'A': {
          'stu_exam_child': {
            marks: {
              sub_math: { obtained: 88, fullMarks: 100 },
              sub_sci: { obtained: 92, fullMarks: 100 }
            },
            total: 180,
            maxTotal: 200,
            percentage: 90,
            grade: 'A',
            result: 'Pass',
            rank: 1
          }
        }
      }
    });

    const mockReq = {
      body: { schoolId: schoolId, studentId: 'stu_exam_child', termId: 'term_demo' },
      headers: {
        'authorization': `Bearer mock_id_token_parent_b2:${parentEmail}`,
        'x-parent-email': parentEmail
      }
    };
    let responseStatus, responseData;
    const mockRes = {
      status(code) { responseStatus = code; return this; },
      json(data) { responseData = data; return this; }
    };

    await examsModule.handleExamResult(mockReq, mockRes);
    assert.strictEqual(responseStatus, 200, 'handleExamResult should return HTTP 200');
    assert(responseData.hasResult === true, 'hasResult should be true');

    const artSubject = responseData.subjects.find(s => s.id === 'sub_art');
    assert(artSubject, 'sub_art must be present in subjects array');
    assert.strictEqual(artSubject.isNotEntered, true, 'Unmarked subject must have isNotEntered: true');
    assert.strictEqual(artSubject.obtained, '—', 'Unmarked subject obtained marks must be "—"');
    assert.strictEqual(artSubject.grade, '—', 'Unmarked subject grade must be "—"');
    assert.strictEqual(artSubject.percentage, null, 'Unmarked subject percentage must be null');
    assert.notStrictEqual(artSubject.isPass, false && !artSubject.isNotEntered, 'Unmarked subject must NEVER be Fail');
  });

  await runTest('Item 5b: js/exams.js uses stored aggregates in report card when term is published/locked', async () => {
    const { sandbox, window } = setupTestEnvironment();
    const examsCode = fs.readFileSync(path.resolve(__dirname, '../js/exams.js'), 'utf8');
    vm.runInContext(examsCode, sandbox);

    const student = { id: 'stu_agg_01', name: 'Agg Student', class: '4', section: 'A' };
    const publishedTerm = { id: 'term_pub', name: 'Published Term', status: 'published' };
    const storedStudentMarks = {
      stu_agg_01: {
        marks: { sub_1: { obtained: 80 } },
        total: 405,
        maxTotal: 500,
        percentage: 81,
        grade: 'A2',
        result: 'Pass',
        rank: 3
      }
    };
    const settings = { schoolName: 'Greenwood High' };

    // Test calculateMultiExamResult on ExamCalculationEngine
    const multiResult = window.ExamCalculationEngine.calculateMultiExamResult({
      terms: [publishedTerm],
      student: student,
      marksMap: { term_pub: storedStudentMarks },
      studentMarksEntry: { term_pub: storedStudentMarks.stu_agg_01 },
      subjects: [{ id: 'sub_1', name: 'Sub 1', fullMarks: 100 }],
      schoolConfig: settings
    });

    assert(multiResult, 'calculateMultiExamResult should produce result');
    assert.strictEqual(multiResult.termTotals.term_pub.obtained, 405, 'Should use stored totalObtained (405)');
    assert.strictEqual(multiResult.termTotals.term_pub.maxTotal, 500, 'Should use stored totalMax (500)');
    assert.strictEqual(multiResult.termResults.term_pub.percentage, 81, 'Should use stored percentage (81%)');
    assert.strictEqual(multiResult.termResults.term_pub.grade, 'A2', 'Should use stored grade (A2)');
  });

  // --------------------------------------------------------------------------
  // ITEM 6: Accounts Transport Fee Mapping (api/accounts.js & js/accounts.js)
  // --------------------------------------------------------------------------
  console.log('\n--- Checking Item 6: Accounts Transport Fee Mapping ---');

  await runTest('Item 6: normalizeFeeHead strips month suffixes and maps bus/transport to 42100', async () => {
    const accountsApi = require('../api/accounts.js');
    assert(typeof accountsApi.normalizeFeeHead === 'function', 'normalizeFeeHead must be exported from api/accounts.js');

    const norm1 = accountsApi.normalizeFeeHead('head_trans_nov', 'Transport - November 2026');
    assert.strictEqual(norm1.id, 'fh_transport', 'Should normalize id to fh_transport');
    assert.strictEqual(norm1.name, 'Transport Fee', 'Should normalize name to Transport Fee');
    assert.strictEqual(norm1.defaultAccount, '42100', 'Should map to default account 42100');

    const norm2 = accountsApi.normalizeFeeHead('head_bus_oct', 'Monthly Bus Fee (Oct 2026)');
    assert.strictEqual(norm2.id, 'fh_transport', 'Monthly Bus Fee should normalize id to fh_transport');
    assert.strictEqual(norm2.defaultAccount, '42100');

    const normTuition = accountsApi.normalizeFeeHead('head_tui_nov', 'Tuition Fee - November 2026');
    assert.strictEqual(normTuition.name, 'Tuition Fee', 'Should strip month suffix from Tuition Fee');
  });

  await runTest('Item 6: computeFeeJournalLines creates balanced lines without unmapped warning for transport fee', async () => {
    const accountsApi = require('../api/accounts.js');
    const txn = {
      id: 'txn_bus_01',
      type: 'payment',
      mode: 'Cash',
      date: '2026-11-05',
      amount: 1800,
      grossAmount: 1800,
      paymentMethod: 'Cash',
      allocations: [
        { feeHeadId: 'head_trans_nov_2026', feeHeadName: 'Transport Fee - November 2026', amount: 1800 }
      ]
    };
    const settings = {
      feeHeadMapping: {} // Empty mapping -> must fallback cleanly through norm.defaultAccount
    };

    const res = accountsApi.computeFeeJournalLines(txn, settings);
    assert(res && Array.isArray(res.lines), 'Should return lines array');
    assert.strictEqual(res.unmappedHeads.length, 0, 'Transport fee head must NOT be reported as unmapped');

    const incomeLine = res.lines.find(l => l.crPaise > 0);
    assert(incomeLine, 'Should have credit income line');
    assert.strictEqual(incomeLine.accountCode, '42100', 'Income line must credit 42100 (Transport / Bus Charges)');
    assert.strictEqual(incomeLine.crPaise, 180000);
  });

  // --------------------------------------------------------------------------
  // ITEM 8: Privacy & Attendance (js/students.js & js/attendance.js)
  // --------------------------------------------------------------------------
  console.log('\n--- Checking Item 8: Privacy & Attendance ---');

  await runTest('Item 8: Student details modal masks Aadhaar as XXXX-XXXX-<last4> for all viewers', async () => {
    const { sandbox, window } = setupTestEnvironment();
    const studentsCode = fs.readFileSync(path.resolve(__dirname, '../js/students.js'), 'utf8');
    vm.runInContext(studentsCode, sandbox);

    const student = {
      id: 'stu_aadhaar_01',
      name: 'Privacy Test Student',
      aadhaarNumber: '987654321012',
      class: '6',
      section: 'A',
      status: 'Active'
    };
    window.SchoolApp.store = {
      currentSchoolId: 'test_school',
      students: [student],
      settings: {}
    };

    // Test that viewStudent masks Aadhaar for both admin and teacher
    let capturedHtml = '';
    window.SchoolApp.showModal = function(title, body) {
      capturedHtml = body;
    };
    window.SchoolApp.isTeacher = function() { return false; }; // Admin view
    window.ProfileService = { getStudentProfile: () => Promise.resolve({}) };

    // Invoke viewStudent
    await window.SchoolApp.modules.students.viewStudent('stu_aadhaar_01');
    assert(!capturedHtml.includes('987654321012'), 'Admin view modal must NOT render full Aadhaar');
    assert(capturedHtml.includes('XXXX-XXXX-1012'), 'Admin view modal must render masked Aadhaar XXXX-XXXX-1012');

    window.SchoolApp.isTeacher = function() { return true; }; // Teacher view
    window.SchoolApp.currentUser = {
      role: 'teacher',
      classTeacherOf: [{ class: '6', section: 'A' }]
    };
    await window.SchoolApp.modules.students.viewStudent('stu_aadhaar_01');
    assert(!capturedHtml.includes('987654321012'), 'Teacher view modal must NOT render full Aadhaar');
    assert(capturedHtml.includes('XXXX-XXXX-1012'), 'Teacher view modal must render masked Aadhaar XXXX-XXXX-1012');
  });

  await runTest('Item 8: Attendance aggregateStudentAttendanceSummary excludes 0-day students from critical list', async () => {
    const { sandbox, window } = setupTestEnvironment();
    const attCode = fs.readFileSync(path.resolve(__dirname, '../js/attendance.js'), 'utf8');
    vm.runInContext(attCode, sandbox);

    const todayStr = window.SchoolApp.getLocalDateString();
    window.SchoolApp.store = {
      students: [
        { id: 's1', name: 'Active Good', firstName: 'Active', lastName: 'Good', class: '5', section: 'A', status: 'Active' },
        { id: 's2', name: 'Active Low Attendance', firstName: 'Active', lastName: 'Low Attendance', class: '5', section: 'A', status: 'Active' },
        { id: 's3', name: 'No Data Recorded', firstName: 'No', lastName: 'Data Recorded', class: '5', section: 'A', status: 'Active' }
      ],
      attendance: [
        {
          date: todayStr,
          class: '5',
          section: 'A',
          records: [
            { studentId: 's1', status: 'present' },
            { studentId: 's2', status: 'absent' }
            // s3 has no records
          ]
        }
      ]
    };

    const summary = window.SchoolApp.modules.attendance.aggregateStudentAttendanceSummary('2026-01-01', '2026-12-31', '5', 'A');
    assert.strictEqual(summary.lowAttCount, 1, 'Only student s2 (0/1 = 0%) should be in lowAttCount (<75%)');
    assert.strictEqual(summary.noDataCount, 1, 'Student s3 (0 days) must be tracked in noDataCount, NOT lowAttCount');
  });

  await runTest('Item 8: Attendance getSummaryDateRange starts on 1st of month in local IST', async () => {
    const { sandbox, window } = setupTestEnvironment();
    const attCode = fs.readFileSync(path.resolve(__dirname, '../js/attendance.js'), 'utf8');
    vm.runInContext(attCode, sandbox);

    const range = window.SchoolApp.modules.attendance.getSummaryDateRange('1month');
    assert(range && range.fromDate && range.toDate, 'Should return fromDate and toDate');
    const today = new Date();
    const expectedMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    assert.strictEqual(range.fromDate, expectedMonthPrefix, '1month range should start on the 1st of the current month');
  });

  console.log('\n' + '='.repeat(70));
  console.log(`v81 CRITICAL FIXES SUMMARY: Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log('='.repeat(70));

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
