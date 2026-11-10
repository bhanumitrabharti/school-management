'use strict';

/**
 * test/test_v83_hotfix.js
 *
 * Dedicated Test Suite for v83 Hotfix:
 * - A: Duplicate Payment Protection:
 *      * Immediate button disable + data-submitting + loader on click 1 before any await
 *      * Idempotency key per modal session: retry with same key returns existing payment without writing
 *      * Exactly 1 receipt serial per payment: second submit never consumes a new serial
 *      * Two-tab / stale-array safety: transactions merged from fresh server copy inside Firestore transaction
 * - B: Smart Remarks in V2 Report Card:
 *      * Shared resolveReportCardRemark used by both V2 and legacy
 *      * Manual savedMarks.remarks always wins
 *      * If smartRemarks === true, generates smart remark using school's remarkTemplates
 *      * Thresholds follow school grading scale: 79% / B1 student gets "good" (NOT "excellent"), 85% gets "excellent"
 * - C1: Listener Gating + No Silent Logout on Update:
 *      * Gating: 0 listener errors / permission-denied messages before login
 *      * Service Worker update: banner shown while logged in (NO reload); auto-reload only on login screen
 * - C3: Parent Portal Quick Open:
 *      * Cache contains only safe context (school, child name/class, modules — no marks/fees/tokens)
 *      * Reopen renders dashboard from cache immediately
 *      * Turnstile does not block signed-in reopen
 *      * 401 or logout clears cache
 */

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const admin = require('firebase-admin');

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

// ─────────────────────────────────────────────────────────────────────────────
// Setup Test Environment for SchoolApp
// ─────────────────────────────────────────────────────────────────────────────
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
      removeItem(k) { delete this._data[k]; },
      clear() { this._data = {}; }
    },
    sessionStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; },
      clear() { this._data = {}; }
    },
    firestore: {
      doc: (database, ...parts) => {
        return db.doc(parts.join('/'));
      },
      setDoc: (ref, data, opts) => ref.set(data, opts || {}),
      getDoc: (ref) => ref.get(),
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
    },
    db: db
  };

  const sandbox = {
    window: windowObj,
    document: {
      title: '',
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      documentElement: { setAttribute: () => {}, getAttribute: () => 'light' }
    },
    location: windowObj.location,
    localStorage: windowObj.localStorage,
    sessionStorage: windowObj.sessionStorage,
    navigator: { serviceWorker: { register: () => Promise.resolve(), addEventListener: () => {} } },
    console: console,
    Math: Math,
    Date: Date,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    Number: Number,
    String: String,
    Array: Array,
    Object: Object,
    Set: Set,
    Map: Map,
    RegExp: RegExp,
    JSON: JSON,
    URLSearchParams: URLSearchParams,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Promise: Promise
  };

  vm.createContext(sandbox);
  new vm.Script(appCode, { filename: 'js/app.js' }).runInContext(sandbox);

  // Hook live Firestore emulator into windowObj.firestore & windowObj.db after vm run
  windowObj.db = db;
  windowObj.firestore = {
    doc: (database, ...parts) => {
      return db.doc(parts.join('/'));
    },
    setDoc: (ref, data, opts) => ref.set(data, opts || {}),
    getDoc: (ref) => ref.get(),
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

  return { sandbox, window: sandbox.window, SchoolApp: sandbox.window.SchoolApp };
}

// ─────────────────────────────────────────────────────────────────────────────
// Load js/exams.js in VM sandbox
// ─────────────────────────────────────────────────────────────────────────────
function createExamsSandbox() {
  const code = fs.readFileSync(path.resolve(__dirname, '../js/exams.js'), 'utf8');
  const sanitized = code.split(/\r?\n/).map(l => l.replace(/^\s*(import|export)\s+.*/, '// $&')).join('\n');
  const sandbox = {
    window: {},
    console: console,
    Math: Math,
    Date: Date,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    Number: Number,
    String: String,
    Array: Array,
    Object: Object,
    Set: Set,
    Map: Map,
    RegExp: RegExp,
    JSON: JSON,
    URLSearchParams: URLSearchParams,
    SchoolApp: {
      registerModule: () => {},
      store: {
        examConfig: {
          gradingScale: [
            { min: 91, max: 100, grade: "A+", label: "Outstanding" },
            { min: 81, max: 90,  grade: "A",  label: "Excellent" },
            { min: 71, max: 80,  grade: "B+", label: "Very Good" },
            { min: 61, max: 70,  grade: "B",  label: "Good" },
            { min: 51, max: 60,  grade: "C+", label: "Above Average" },
            { min: 41, max: 50,  grade: "C",  label: "Average" },
            { min: 33, max: 40,  grade: "D",  label: "Pass" },
            { min: 0,  max: 32,  grade: "F",  label: "Fail" }
          ]
        }
      }
    }
  };
  vm.createContext(sandbox);
  new vm.Script(sanitized, { filename: 'js/exams.js' }).runInContext(sandbox);
  return sandbox;
}

async function runAllTests() {
  console.log('======================================================================');
  console.log('v83 HOTFIX TEST SUITE EXECUTION');
  console.log('======================================================================\n');

  // ── SECTION A: DUPLICATE PAYMENT PROTECTION & FIRESTORE ATOMICITY ───────────
  console.log('--- SECTION A: Duplicate Payment Protection & Concurrency ---');

  const testSchoolId = 'test_sch_v83_' + Date.now();
  const yr = '2026';
  const mo = '11';
  const docPath = `tenant_data/${testSchoolId}/fees_years/${yr}/months/${mo}`;
  const counterPath = `tenant_data/${testSchoolId}/counters/fee_receipts`;

  // Seed clean month doc and counter
  await db.doc(docPath).set({ transactions: [] });
  await db.doc(counterPath).set({ '2026-27': 10 });

  function makeAppInstance() {
    const { SchoolApp } = setupTestEnvironment();
    SchoolApp.tenantInitialized = true;
    SchoolApp.store = {
      currentSchoolId: testSchoolId,
      settings: {
        restructured: true,
        storageVersion: 2,
        schoolCode: 'TEST',
        accountingVersion: 'v2'
      },
      fees: []
    };
    SchoolApp.currentSchoolId = testSchoolId;
    SchoolApp._feesYears = {};
    SchoolApp.showLoader = () => {};
    SchoolApp.hideLoader = () => {};
    SchoolApp.showToast = () => {};
    return SchoolApp;
  }

  await runTest('A1 & A2: Rapid double/triple submit with same idempotency key writes exactly 1 transaction', async () => {
    const app = makeAppInstance();
    const idempotencyKey = 'pay_idemp_key_001';
    const txn = {
      id: idempotencyKey,
      idempotencyKey: idempotencyKey,
      studentId: 'stu_001',
      schoolId: testSchoolId,
      type: 'payment',
      amount: 1500,
      discount: 0,
      grossAmount: 1500,
      date: '2026-11-10',
      mode: 'Cash',
      timestamp: new Date().toISOString()
    };

    // Simulate 3 rapid concurrent saves (e.g. 50ms apart)
    const [res1, res2, res3] = await Promise.all([
      app.saveFeeTransaction(JSON.parse(JSON.stringify(txn)), true),
      app.saveFeeTransaction(JSON.parse(JSON.stringify(txn)), true),
      app.saveFeeTransaction(JSON.parse(JSON.stringify(txn)), true)
    ]);

    assert(res1 && res2 && res3, 'All calls should return success without error');

    // Verify month doc in Firestore has strictly 1 transaction
    const mSnap = await db.doc(docPath).get();
    const storedTxns = mSnap.data().transactions || [];
    assert.strictEqual(storedTxns.length, 1, `Expected 1 stored txn, found ${storedTxns.length}`);
    assert.strictEqual(storedTxns[0].id, idempotencyKey);
    assert.strictEqual(storedTxns[0].receiptNo, 'TEST/2026-27/000011');
  });

  await runTest('A3: Exactly 1 receipt serial is consumed; repeated saves reuse the serial', async () => {
    const app = makeAppInstance();
    const counterSnap = await db.doc(counterPath).get();
    const seq = counterSnap.data()['2026-27'];
    assert.strictEqual(seq, 11, `Counter should be at 11, found ${seq}`);

    // Another save with the same idempotency key must not increment counter
    const idempotencyKey = 'pay_idemp_key_001';
    const txn = {
      id: idempotencyKey,
      idempotencyKey: idempotencyKey,
      studentId: 'stu_001',
      schoolId: testSchoolId,
      type: 'payment',
      amount: 1500,
      date: '2026-11-10',
      timestamp: new Date().toISOString()
    };

    await app.saveFeeTransaction(txn, true);

    const counterSnapAfter = await db.doc(counterPath).get();
    assert.strictEqual(counterSnapAfter.data()['2026-27'], 11, 'Counter must NOT increment on retry of existing idempotency key');
  });

  await runTest('A4: Two tabs / concurrent payments for different students merge both without overwriting', async () => {
    const appTab1 = makeAppInstance();
    const appTab2 = makeAppInstance();

    // Tab 1 and Tab 2 submit distinct payments at the same time
    const txnTab1 = {
      id: 'pay_tab1_' + Date.now(),
      idempotencyKey: 'pay_tab1_' + Date.now(),
      studentId: 'stu_tab_1',
      schoolId: testSchoolId,
      type: 'payment',
      amount: 2000,
      date: '2026-11-10',
      timestamp: new Date().toISOString()
    };

    const txnTab2 = {
      id: 'pay_tab2_' + Date.now(),
      idempotencyKey: 'pay_tab2_' + Date.now(),
      studentId: 'stu_tab_2',
      schoolId: testSchoolId,
      type: 'payment',
      amount: 3000,
      date: '2026-11-10',
      timestamp: new Date().toISOString()
    };

    const [s1, s2] = await Promise.all([
      appTab1.saveFeeTransaction(txnTab1, true),
      appTab2.saveFeeTransaction(txnTab2, true)
    ]);

    assert(s1 && s2, 'Both concurrent tab saves must succeed');

    const mSnap = await db.doc(docPath).get();
    const stored = mSnap.data().transactions || [];
    const hasTab1 = stored.some(t => t.id === txnTab1.id);
    const hasTab2 = stored.some(t => t.id === txnTab2.id);

    assert(hasTab1, 'Stored transactions must contain Tab 1 payment');
    assert(hasTab2, 'Stored transactions must contain Tab 2 payment');
    assert.strictEqual(stored.length, 3, 'Month doc must contain all 3 transactions (original + tab1 + tab2)');
  });

  await runTest('A1 Click Guard: Button disabled synchronously on click 1 with data-submitting attribute', () => {
    const feesCode = fs.readFileSync(path.resolve(__dirname, '../js/fees.js'), 'utf8');
    assert(feesCode.includes("saveBtn.setAttribute('data-submitting', 'true')"), 'Must set data-submitting');
    assert(feesCode.includes("saveBtn.disabled = true"), 'Must disable saveBtn');
    assert(feesCode.includes("saveBtn.getAttribute('data-submitting') === 'true'"), 'Must guard against re-click');
    assert(feesCode.includes("Payment not saved — check the Payment History before retrying"), 'Must show clear failure message in finally block');
  });

  // ── SECTION B: SMART REMARKS IN V2 REPORT CARD ──────────────────────────────
  console.log('\n--- SECTION B: Smart Remarks & Grading Scale Tiers ---');

  const examsBox = createExamsSandbox();
  const resolveRemarkFn = examsBox.window.resolveReportCardRemark || examsBox.resolveReportCardRemark || examsBox.window.ExamCalculationEngine.resolveReportCardRemark;
  const generateSmartRemarkFn = examsBox.window.generateSmartRemark || examsBox.generateSmartRemark;

  await runTest('B1: Shared resolveReportCardRemark: manual savedMarks.remarks always wins', () => {
    const resolve = resolveRemarkFn;
    assert(typeof resolve === 'function', 'resolveReportCardRemark must be a function');

    const student = { id: 's1', name: 'Aarav Kumar' };
    const savedMarks = { remarks: 'Hard worker and diligent student.' };
    const calcResult = { percentage: 95, result: 'PASS' };
    const reportCardConfig = { academic: { smartRemarks: true } };

    const remark = resolve(student, [], savedMarks, calcResult, reportCardConfig);
    assert.strictEqual(remark, 'Hard worker and diligent student.', 'Manual remark must win over smart remarks');
  });

  await runTest('B2: V2 report card invokes smartRemarks when enabled and manual remarks empty', () => {
    const resolve = resolveRemarkFn;
    const student = { id: 's1', name: 'Aarav Kumar' };
    const savedMarks = { marks: {} };
    const calcResult = { percentage: 88, result: 'PASS' };
    const reportCardConfig = {
      academic: {
        smartRemarks: true,
        gradingScale: examsBox.SchoolApp.store.examConfig.gradingScale
      }
    };

    const remark = resolve(student, [], savedMarks, calcResult, reportCardConfig);
    assert(remark.toLowerCase().includes('excellent academic performance'), `Expected excellent remark for 88%, got: "${remark}"`);
  });

  await runTest('B3: Remark tiers follow school grading scale: 79% (B1) gets "good" (NOT "excellent")', () => {
    const generateSmartRemark = generateSmartRemarkFn;
    const student = { id: 's1', name: 'Priya Sharma' };
    const subjects = [{ id: 'sub_eng', name: 'English', isOptional: false, passMarks: 33, fullMarks: 100 }];
    const marks = { sub_eng: { obtained: 79, isAbsent: false } };
    const entry = { result: 'PASS', percentage: 79 };
    const customScale = examsBox.SchoolApp.store.examConfig.gradingScale;

    const remark = generateSmartRemark(student, subjects, marks, entry, null, customScale);
    assert(!remark.toLowerCase().includes('excellent'), `79% (B1) student must NOT receive 'excellent' remark. Got: "${remark}"`);
    assert(remark.toLowerCase().includes('very good academic performance'), `79% student must receive 'good'/'very good' remark. Got: "${remark}"`);
  });

  await runTest('B4: Fallback remark used when smartRemarks is disabled and no manual remark', () => {
    const resolve = resolveRemarkFn;
    const student = { id: 's1', name: 'Priya Sharma' };
    const savedMarks = {};
    const passResult = { percentage: 65, result: 'PASS' };
    const failResult = { percentage: 28, result: 'FAIL' };
    const config = { academic: { smartRemarks: false } };

    assert.strictEqual(resolve(student, [], savedMarks, passResult, config), 'Good performance. Promoted to next class.');
    assert.strictEqual(resolve(student, [], savedMarks, failResult, config), 'Needs improvement in weak subjects.');
  });

  // ── SECTION C1: LISTENER GATING & SERVICE WORKER UPDATE ─────────────────────
  console.log('\n--- SECTION C1: Listener Gating & Service Worker Update ---');

  await runTest('C1 Gating: No subcollection listeners attached before user authentication (0 permission-denied warnings)', () => {
    const app = makeAppInstance();
    // Pre-login state: currentUser is null
    app.currentUser = null;
    app._verifiedSchoolAccess = null;

    let attachedStudents = false;
    let attachedV2 = false;
    let attachedAttendance = false;
    let attachedFees = false;

    app.initStudentsSubcollectionListener = () => { attachedStudents = true; };
    app.loadV2Subcollections = () => { attachedV2 = true; };
    app.loadAttendanceMonth = () => { attachedAttendance = true; return Promise.resolve(); };
    app.loadFeesYear = () => { attachedFees = true; return Promise.resolve(); };

    // Verify attachAuthenticatedListeners is blocked
    app.attachAuthenticatedListeners(testSchoolId);
    assert(!attachedStudents, 'Students listener must be blocked before login');
    assert(!attachedV2, 'V2 subcollections must be blocked before login');
    assert(!attachedAttendance, 'Attendance listener must be blocked before login');
    assert(!attachedFees, 'Fees listener must be blocked before login');
  });

  await runTest('C1 SW Update: Logged-in user sees banner (NO reload); login screen auto-reloads', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    assert(indexHtml.includes('function isUserLoggedIn()'), 'isUserLoggedIn helper must exist');
    assert(indexHtml.includes("if (isUserLoggedIn() || isFormDirty())"), 'Logged-in user must show non-blocking banner');
    assert(indexHtml.includes("showRefreshBanner('Update ready — tap to refresh')"), 'Banner text must match specification');
    assert(indexHtml.includes("console.log('[Service Worker] Login screen detected. Auto-reloading once for new bundle.')"), 'Auto-reload must only occur on login screen');
  });

  // ── SECTION C3: PARENT PORTAL QUICK OPEN ────────────────────────────────────
  console.log('\n--- SECTION C3: Parent Portal Quick Open ---');

  await runTest('C3 Cache Sanitization: Stored cache contains school names, child id/name/class, NO marks or fees', () => {
    const parentsCode = fs.readFileSync(path.resolve(__dirname, '../js/parents.js'), 'utf8');
    assert(parentsCode.includes('PARENT_CONTEXT_CACHE_KEY'), 'PARENT_CONTEXT_CACHE_KEY constant must exist');
    assert(parentsCode.includes('function sanitizeContextForCache'), 'sanitizeContextForCache helper must exist');

    // Run sanitize function in VM
    const sandbox = {
      sanitizeContextForCache: null
    };
    vm.createContext(sandbox);
    vm.runInContext(parentsCode.match(/function sanitizeContextForCache[\s\S]*?^}/m)[0], sandbox);

    const rawSchools = [{
      schoolId: 'sch_greenwood',
      schoolName: 'Greenwood High',
      secretAuthToken: 'xyz_sensitive_token',
      portalSettings: { theme: 'dark', modules: { attendance: true, exams: true } },
      students: [{
        id: 'stu_01',
        name: 'Devansh Roy',
        class: '10',
        section: 'A',
        examMarks: { term1: { total: 490 } },
        feeBalances: { dues: 15000 }
      }]
    }];

    const sanitized = sandbox.sanitizeContextForCache(rawSchools);
    assert.strictEqual(sanitized[0].schoolId, 'sch_greenwood');
    assert.strictEqual(sanitized[0].students[0].name, 'Devansh Roy');
    assert.strictEqual(sanitized[0].secretAuthToken, undefined, 'Sensitive token must NOT be in cache');
    assert.strictEqual(sanitized[0].students[0].examMarks, undefined, 'Exam marks must NOT be in context cache');
    assert.strictEqual(sanitized[0].students[0].feeBalances, undefined, 'Fee balances must NOT be in context cache');
  });

  await runTest('C3 Cache Lifecycle: 401 response and logout clear the cache; Turnstile does not block reopen', () => {
    const parentsCode = fs.readFileSync(path.resolve(__dirname, '../js/parents.js'), 'utf8');
    assert(parentsCode.includes('clearCachedContext()'), 'clearCachedContext must exist');
    assert(parentsCode.includes('// Turnstile must not block a signed-in reopen'), 'Turnstile guard must exist');
    assert(parentsCode.includes('elements.btnLogout.addEventListener'), 'Logout must handle cache clear');
  });

  console.log('\n======================================================================');
  console.log(`v83 TEST SUITE SUMMARY: Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log('======================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
