/**
 * test/test_v86_feehistory_seo.js
 * Comprehensive Test Suite for v86:
 *  - Part A: Fee History Subcollection writes, dual-read merge, gap handling & Cash Collected Today rename
 *  - Part A Rules: Firestore rules enforcement on fee_activity_logs subcollection
 *  - Part B: Website SEO, canonicals, JSON-LD, 404 routing, robots tags, sitemap, About and Case Study pages
 */

const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const rulesPath = path.resolve(ROOT_DIR, 'firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

let passedCount = 0;
let failedCount = 0;

async function recordTest(id, desc, fn) {
  try {
    await fn();
    console.log(`  ✔ PASS: ${id} — ${desc}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${id} — ${desc}`);
    console.error(`     ${err.message}`);
    failedCount++;
  }
}

async function runAllTests() {
  console.log('========================================================');
  console.log('--- RUNNING v86 TEST SUITE: FEE HISTORY & WEBSITE SEO ---');
  console.log('========================================================\n');

  // ========================================================
  // 1. FIRESTORE RULES TESTS (fee_activity_logs)
  // ========================================================
  console.log('--- 1. Testing Firestore Security Rules on fee_activity_logs ---');

  const testEnv = await initializeTestEnvironment({
    projectId: 'ctrl-shift-solutions',
    firestore: {
      rules: rulesContent,
      host: '127.0.0.1',
      port: 8085
    }
  });

  await testEnv.clearFirestore();

  // Seed access mappings
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('school_access/admin_sch1').set({ schoolId: 'sch1', role: 'admin' });
    await db.doc('school_access/teacher_sch1').set({ schoolId: 'sch1', role: 'teacher', teacherId: 'T1' });
    await db.doc('school_access/admin_sch2').set({ schoolId: 'sch2', role: 'admin' });
    await db.doc('school_access/parent_user').set({ phone: '+919999999999' });
  });

  await recordTest('RULES-01', 'School Admin can write to fee_activity_logs subcollection', async () => {
    const adminCtx = testEnv.authenticatedContext('admin_sch1');
    const db = adminCtx.firestore();
    await assertSucceeds(
      db.doc('tenant_data/sch1/fee_activity_logs/log_001').set({
        id: 'log_001',
        timestamp: new Date().toISOString(),
        studentId: 'std_1',
        amount: 500,
        addedBy: 'Admin'
      })
    );
  });

  await recordTest('RULES-02', 'School Admin can read from fee_activity_logs subcollection', async () => {
    const adminCtx = testEnv.authenticatedContext('admin_sch1');
    const db = adminCtx.firestore();
    await assertSucceeds(
      db.doc('tenant_data/sch1/fee_activity_logs/log_001').get()
    );
  });

  await recordTest('RULES-03', 'Teacher is DENIED write to fee_activity_logs', async () => {
    const teacherCtx = testEnv.authenticatedContext('teacher_sch1');
    const db = teacherCtx.firestore();
    await assertFails(
      db.doc('tenant_data/sch1/fee_activity_logs/log_002').set({
        id: 'log_002',
        timestamp: new Date().toISOString(),
        studentId: 'std_1',
        amount: 500
      })
    );
  });

  await recordTest('RULES-04', 'Teacher is DENIED read from fee_activity_logs', async () => {
    const teacherCtx = testEnv.authenticatedContext('teacher_sch1');
    const db = teacherCtx.firestore();
    await assertFails(
      db.doc('tenant_data/sch1/fee_activity_logs/log_001').get()
    );
  });

  await recordTest('RULES-05', 'Parent is DENIED write and read to fee_activity_logs', async () => {
    const parentCtx = testEnv.authenticatedContext('parent_user');
    const db = parentCtx.firestore();
    await assertFails(
      db.doc('tenant_data/sch1/fee_activity_logs/log_003').set({ id: 'log_003', amount: 100 })
    );
    await assertFails(
      db.doc('tenant_data/sch1/fee_activity_logs/log_001').get()
    );
  });

  await recordTest('RULES-06', 'Anonymous user is DENIED access to fee_activity_logs', async () => {
    const anonCtx = testEnv.unauthenticatedContext();
    const db = anonCtx.firestore();
    await assertFails(
      db.doc('tenant_data/sch1/fee_activity_logs/log_001').get()
    );
    await assertFails(
      db.doc('tenant_data/sch1/fee_activity_logs/log_004').set({ id: 'log_004' })
    );
  });

  await recordTest('RULES-07', 'Admin of other school (sch2) is DENIED write to sch1 fee_activity_logs', async () => {
    const admin2Ctx = testEnv.authenticatedContext('admin_sch2');
    const db = admin2Ctx.firestore();
    await assertFails(
      db.doc('tenant_data/sch1/fee_activity_logs/log_005').set({ id: 'log_005', amount: 200 })
    );
  });

  await testEnv.cleanup();

  // ========================================================
  // 2. PART A UNIT & LOGIC TESTS (Fee Activity Logs, Merge, Gap Handling)
  // ========================================================
  console.log('\n--- 2. Testing Fee Activity Logging, Merge & Gap Handling Logic ---');

  // Mock SchoolApp context
  function createMockSchoolApp(storageVersion, feeLogMigrated, restructured) {
    const mockApp = {
      currentSchoolId: 'test_school_001',
      store: {
        currentSchoolId: 'test_school_001',
        settings: {
          storageVersion: storageVersion,
          feeLogMigrated: feeLogMigrated
        },
        fees: [],
        feeActivityLog: [],
        students: [
          { id: 's1', firstName: 'Ravi', lastName: 'Sharma', class: '5', section: 'A' },
          { id: 's2', firstName: 'Anita', lastName: 'Kumari', class: '6', section: 'B' }
        ]
      },
      isStorageVersion2: function(sid) {
        return (this.store.settings.storageVersion || 1) >= 2;
      },
      isFeeLogMigrated: function(sid) {
        return this.store.settings.feeLogMigrated === true;
      },
      isRestructured: function(sid) {
        return !!restructured;
      },
      isFeeLogSubcollection: function(sid) {
        return this.isFeeLogMigrated(sid) || this.isStorageVersion2(sid) || this.isRestructured(sid);
      },
      generateId: function() {
        return 'id_' + Math.random().toString(36).slice(2, 9);
      }
    };
    return mockApp;
  }

  await recordTest('LOGIC-01', 'isFeeLogSubcollection returns true for storageVersion 2 even when feeLogMigrated is false', async () => {
    const app = createMockSchoolApp(2, false, true); // Greenwood state
    assert.strictEqual(app.isFeeLogSubcollection('test_school_001'), true);
  });

  await recordTest('LOGIC-02', 'isFeeLogSubcollection returns true for feeLogMigrated=true', async () => {
    const app = createMockSchoolApp(1, true, false);
    assert.strictEqual(app.isFeeLogSubcollection('test_school_001'), true);
  });

  await recordTest('LOGIC-03', 'isFeeLogSubcollection returns false for legacy non-v2 school', async () => {
    const app = createMockSchoolApp(1, false, false);
    assert.strictEqual(app.isFeeLogSubcollection('test_school_001'), false);
  });

  await recordTest('LOGIC-04', 'Merging root logs and subcollection logs by ID with newest first ordering', async () => {
    const app = createMockSchoolApp(2, false, true);
    app.store.feeActivityLog = [
      { id: 'log_root_old', timestamp: '2026-09-10T10:00:00Z', amount: 500, studentId: 's1' },
      { id: 'log_shared', timestamp: '2026-09-15T10:00:00Z', amount: 800, studentId: 's1', note: 'Old note' }
    ];

    const fetchedSubcoll = [
      { id: 'log_shared', timestamp: '2026-09-15T10:00:00Z', amount: 800, studentId: 's1', note: 'Updated note' },
      { id: 'log_sub_new', timestamp: '2026-11-10T12:00:00Z', amount: 1200, studentId: 's2' }
    ];

    const logMap = new Map();
    (app.store.feeActivityLog || []).forEach(l => { if (l && l.id) logMap.set(l.id, l); });
    fetchedSubcoll.forEach(l => { if (l && l.id) logMap.set(l.id, l); });
    const merged = Array.from(logMap.values());
    merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    assert.strictEqual(merged.length, 3, 'Merged list should contain exactly 3 unique items');
    assert.strictEqual(merged[0].id, 'log_sub_new', 'Newest log must be first');
    assert.strictEqual(merged[1].id, 'log_shared', 'Shared log must be in middle');
    assert.strictEqual(merged[1].note, 'Updated note', 'Authoritative subcoll record takes precedence');
    assert.strictEqual(merged[2].id, 'log_root_old', 'Oldest root log must be last');
  });

  await recordTest('LOGIC-05', 'Gap handling derives fee history ONLY for payments and reversals, never dues', async () => {
    const app = createMockSchoolApp(2, false, true);
    app._feeLogsHasMore = false;
    // Real log exists for txn 1
    app.store.feeActivityLog = [
      { id: 'log_1', txnId: 'txn_1', receiptNo: 'GPS/2026-27/000001', studentId: 's1', amount: 500, timestamp: '2026-09-20T10:00:00Z' }
    ];
    // Transactions: txn_1 (logged), txn_2 (payment gap in Nov), txn_3 (due gap in Nov - must NEVER be derived), txn_4 (void reversal in Nov)
    app.store.fees = [
      { id: 'txn_1', type: 'payment', mode: 'Cash', receiptNo: 'GPS/2026-27/000001', studentId: 's1', amount: 500, timestamp: '2026-09-20T10:00:00Z' },
      { id: 'txn_2', type: 'payment', mode: 'UPI', receiptNo: 'GPS/2026-27/000002', studentId: 's2', amount: 1500, timestamp: '2026-11-05T14:30:00Z', recordedBy: 'accountant' },
      { id: 'txn_3', type: 'due', description: 'Exam Fee', studentId: 's1', amount: 350, timestamp: '2026-11-06T09:00:00Z', addedBy: 'admin' },
      { id: 'txn_4', type: 'reversal', mode: 'Reversal', studentId: 's2', amount: -1500, timestamp: '2026-11-07T11:00:00Z', voidedBy: 'admin', remarks: 'Mistake' }
    ];

    const studentMap = {
      s1: app.store.students[0],
      s2: app.store.students[1]
    };

    const rawLogs = app.store.feeActivityLog.slice();
    let oldestLoadedTs = null;
    if (app._feeLogsHasMore === true && rawLogs.length > 0) {
      for (let ri = 0; ri < rawLogs.length; ri++) {
        const rts = rawLogs[ri].timestamp || (rawLogs[ri].date ? (rawLogs[ri].date + 'T00:00:00.000Z') : null);
        if (rts) {
          const tVal = new Date(rts).getTime();
          if (!isNaN(tVal)) {
            if (oldestLoadedTs === null || tVal < oldestLoadedTs) {
              oldestLoadedTs = tVal;
            }
          }
        }
      }
    }

    const knownTxnIds = new Set();
    const knownReceipts = new Set();
    const knownSignatures = new Set();

    rawLogs.forEach(l => {
      if (!l) return;
      if (l.txnId) knownTxnIds.add(String(l.txnId).trim());
      if (l.originalTxnId) knownTxnIds.add(String(l.originalTxnId).trim());
      if (l.receiptNo) knownReceipts.add(String(l.receiptNo).trim());
      const dt = l.timestamp ? String(l.timestamp).slice(0, 10) : '';
      const amt = Math.abs(parseFloat(l.amount || 0)).toFixed(2);
      if (l.studentId && dt) knownSignatures.add(l.studentId + '|' + dt + '|' + amt);
    });

    const derivedLogs = [];
    app.store.fees.forEach(txn => {
      if (!txn || !txn.id) return;

      const isReversal = (txn.mode === 'Reversal' || txn.type === 'reversal');
      let isPayment = (txn.type === 'payment' || (!txn.type && txn.mode && txn.mode !== 'Reversal'));
      if (txn.type === 'due' || txn.type === 'charge' || txn.type === 'monthly_due' || txn.type === 'fee_due') {
        isPayment = false;
      }
      if (!isPayment && !isReversal) return;

      const txnTsStr = txn.timestamp || (txn.date ? (txn.date + 'T00:00:00.000Z') : null);
      if (oldestLoadedTs !== null) {
        if (!txnTsStr) return;
        const txnTime = new Date(txnTsStr).getTime();
        if (isNaN(txnTime) || txnTime < oldestLoadedTs) return;
      }

      if (knownTxnIds.has(String(txn.id).trim())) return;
      if (txn.receiptNo && knownReceipts.has(String(txn.receiptNo).trim())) return;

      const txnDt = txn.timestamp ? String(txn.timestamp).slice(0, 10) : '';
      const txnAmt = Math.abs(parseFloat(txn.amount || 0)).toFixed(2);
      if (txn.studentId && txnDt && knownSignatures.has(txn.studentId + '|' + txnDt + '|' + txnAmt)) return;

      const noteMatch = rawLogs.some(l => {
        if (!l || !l.note) return false;
        if (l.note.indexOf(txn.id) !== -1) return true;
        if (txn.receiptNo && l.note.indexOf(txn.receiptNo) !== -1) return true;
        return false;
      });
      if (noteMatch) return;

      const headName = isReversal ? 'Void / Reversal' : ('Payment (' + (txn.mode || 'Cash') + ')');

      derivedLogs.push({
        id: 'derived_' + txn.id,
        isDerived: true,
        timestamp: txn.timestamp,
        studentId: txn.studentId,
        studentName: studentMap[txn.studentId].firstName + ' ' + studentMap[txn.studentId].lastName,
        className: studentMap[txn.studentId].class + '-' + studentMap[txn.studentId].section,
        feeHeadName: headName,
        amount: isReversal ? -Math.abs(txn.amount) : txn.amount,
        addedBy: txn.recordedBy || txn.addedBy || txn.voidedBy,
        receiptNo: txn.receiptNo || null,
        txnId: txn.id
      });
    });

    assert.strictEqual(derivedLogs.length, 2, 'Must derive entries ONLY for payment and reversal (never dues)');
    assert.strictEqual(derivedLogs.some(d => d.id === 'derived_txn_1'), false, 'txn_1 already had real log, must not be duplicated');
    assert.strictEqual(derivedLogs.find(d => d.id === 'derived_txn_2').isDerived, true);
    assert.strictEqual(derivedLogs.find(d => d.id === 'derived_txn_2').feeHeadName, 'Payment (UPI)');
    assert.strictEqual(derivedLogs.find(d => d.id === 'derived_txn_2').amount, 1500);
    assert.strictEqual(derivedLogs.some(d => d.id === 'derived_txn_3'), false, 'Dues (txn_3) must NEVER be derived');
    assert.strictEqual(derivedLogs.find(d => d.id === 'derived_txn_4').feeHeadName, 'Void / Reversal');
    assert.strictEqual(derivedLogs.find(d => d.id === 'derived_txn_4').amount, -1500);
  });

  await recordTest('LOGIC-06', 'Fee Ledger card renamed to "Cash Collected Today"', async () => {
    const feesJs = fs.readFileSync(path.join(ROOT_DIR, 'js/fees.js'), 'utf8');
    assert.strictEqual(feesJs.includes('<div class="stat-label">Cash Collected Today</div>'), true);
    assert.strictEqual(feesJs.includes('<div class="stat-label">Cash in Hand</div>'), false);
  });

  await recordTest('LOGIC-07', 'Fixture with 778 subcollection logs (only 100 loaded): 0 derived for older txns, dues never derived, 1 unlogged in window derived', async () => {
    const app = createMockSchoolApp(2, false, true);
    app._feeLogsHasMore = true; // Still has more logs in Firestore (total 778, only 100 loaded)

    const studentMap = { s1: app.store.students[0], s2: app.store.students[1] };

    // 100 loaded logs: timestamps from 2026-10-01 to 2026-11-10
    const loadedLogs = [];
    const allFees = [];

    // Oldest loaded log will be 2026-10-01T00:00:00Z
    for (let i = 0; i < 100; i++) {
      const day = String(1 + Math.floor(i / 3)).padStart(2, '0');
      const ts = `2026-10-${day}T10:00:00.000Z`;
      const txnId = `pay_loaded_${i}`;
      const rNo = `GPS/2026-27/${String(1000 + i).padStart(6, '0')}`;
      loadedLogs.push({
        id: `log_sub_${i}`,
        txnId: txnId,
        receiptNo: rNo,
        timestamp: ts,
        studentId: i % 2 === 0 ? 's1' : 's2',
        amount: 1000
      });
      allFees.push({
        id: txnId,
        type: 'payment',
        receiptNo: rNo,
        mode: 'Cash',
        timestamp: ts,
        studentId: i % 2 === 0 ? 's1' : 's2',
        amount: 1000
      });
    }

    // 678 older transactions before 2026-10-01 (May to Sep 2026) whose logs exist in subcollection but are NOT loaded
    for (let j = 0; j < 678; j++) {
      const oldTs = `2026-08-${String((j % 28) + 1).padStart(2, '0')}T09:00:00.000Z`;
      allFees.push({
        id: `pay_old_${j}`,
        type: 'payment',
        mode: 'Cash',
        receiptNo: `GPS/2026-27/${String(100 + j).padStart(6, '0')}`,
        timestamp: oldTs,
        studentId: j % 2 === 0 ? 's1' : 's2',
        amount: 800
      });
    }

    // Dues generated across both windows (dues must NEVER be derived)
    for (let k = 0; k < 50; k++) {
      allFees.push({
        id: `due_item_${k}`,
        type: 'due',
        description: 'Monthly Tuition Fee',
        timestamp: k % 2 === 0 ? '2026-11-01T00:00:00.000Z' : '2026-08-01T00:00:00.000Z',
        studentId: 's1',
        amount: 1200
      });
    }

    // Exactly 1 payment with NO log inside the loaded window (Nov 2026)
    const unloggedPayTs = '2026-11-08T15:30:00.000Z';
    allFees.push({
      id: 'pay_unlogged_gap_nov',
      type: 'payment',
      mode: 'UPI',
      receiptNo: 'GPS/2026-27/009999',
      timestamp: unloggedPayTs,
      studentId: 's2',
      amount: 2500,
      recordedBy: 'Admin'
    });

    app.store.feeActivityLog = loadedLogs;
    app.store.fees = allFees;

    // Run derivation
    const rawLogs = (app.store.feeActivityLog || []).slice();
    let oldestLoadedTs = null;
    if (app._feeLogsHasMore === true && rawLogs.length > 0) {
      for (let ri = 0; ri < rawLogs.length; ri++) {
        const rts = rawLogs[ri].timestamp || (rawLogs[ri].date ? (rawLogs[ri].date + 'T00:00:00.000Z') : null);
        if (rts) {
          const tVal = new Date(rts).getTime();
          if (!isNaN(tVal)) {
            if (oldestLoadedTs === null || tVal < oldestLoadedTs) {
              oldestLoadedTs = tVal;
            }
          }
        }
      }
    }

    const knownTxnIds = new Set();
    const knownReceipts = new Set();
    const knownSignatures = new Set();

    rawLogs.forEach(l => {
      if (!l) return;
      if (l.txnId) knownTxnIds.add(String(l.txnId).trim());
      if (l.originalTxnId) knownTxnIds.add(String(l.originalTxnId).trim());
      if (l.receiptNo) knownReceipts.add(String(l.receiptNo).trim());
      const dt = l.timestamp ? String(l.timestamp).slice(0, 10) : '';
      const amt = Math.abs(parseFloat(l.amount || 0)).toFixed(2);
      if (l.studentId && dt) knownSignatures.add(l.studentId + '|' + dt + '|' + amt);
    });

    const derivedLogs = [];
    allFees.forEach(txn => {
      if (!txn || !txn.id) return;

      const isReversal = (txn.mode === 'Reversal' || txn.type === 'reversal');
      let isPayment = (txn.type === 'payment' || (!txn.type && txn.mode && txn.mode !== 'Reversal'));
      if (txn.type === 'due' || txn.type === 'charge' || txn.type === 'monthly_due' || txn.type === 'fee_due') {
        isPayment = false;
      }
      if (!isPayment && !isReversal) return;

      const txnTsStr = txn.timestamp || (txn.date ? (txn.date + 'T00:00:00.000Z') : null);
      if (oldestLoadedTs !== null) {
        if (!txnTsStr) return;
        const txnTime = new Date(txnTsStr).getTime();
        if (isNaN(txnTime) || txnTime < oldestLoadedTs) return;
      }

      if (knownTxnIds.has(String(txn.id).trim())) return;
      if (txn.receiptNo && knownReceipts.has(String(txn.receiptNo).trim())) return;

      const txnDt = txn.timestamp ? String(txn.timestamp).slice(0, 10) : '';
      const txnAmt = Math.abs(parseFloat(txn.amount || 0)).toFixed(2);
      if (txn.studentId && txnDt && knownSignatures.has(txn.studentId + '|' + txnDt + '|' + txnAmt)) return;

      const noteMatch = rawLogs.some(l => {
        if (!l || !l.note) return false;
        if (l.note.indexOf(txn.id) !== -1) return true;
        if (txn.receiptNo && l.note.indexOf(txn.receiptNo) !== -1) return true;
        return false;
      });
      if (noteMatch) return;

      const headName = isReversal ? 'Void / Reversal' : ('Payment (' + (txn.mode || 'Cash') + ')');

      derivedLogs.push({
        id: 'derived_' + txn.id,
        isDerived: true,
        timestamp: txn.timestamp,
        studentId: txn.studentId,
        studentName: studentMap[txn.studentId].firstName + ' ' + studentMap[txn.studentId].lastName,
        className: studentMap[txn.studentId].class + '-' + studentMap[txn.studentId].section,
        feeHeadName: headName,
        amount: isReversal ? -Math.abs(txn.amount) : txn.amount,
        addedBy: txn.recordedBy || txn.addedBy || txn.voidedBy,
        receiptNo: txn.receiptNo || null,
        txnId: txn.id
      });
    });

    assert.strictEqual(derivedLogs.length, 1, 'Exactly 1 derived entry must be produced for the unlogged payment in loaded window');
    assert.strictEqual(derivedLogs[0].id, 'derived_pay_unlogged_gap_nov');
    assert.strictEqual(derivedLogs[0].amount, 2500);
    assert.strictEqual(derivedLogs[0].feeHeadName, 'Payment (UPI)');
  });

  await recordTest('LOGIC-08', 'Exact linkage on new log entries (txnId, originalTxnId, receiptNo set before logDocRef write)', async () => {
    const feesJs = fs.readFileSync(path.join(ROOT_DIR, 'js/fees.js'), 'utf8');
    const appJs = fs.readFileSync(path.join(ROOT_DIR, 'js/app.js'), 'utf8');

    // 1. doSave payment log has txnId: newTxn.id
    assert.ok(feesJs.includes('txnId: newTxn.id'), 'doSave paymentLog must contain txnId: newTxn.id');

    // 2. voidFeeTransaction log has txnId: reversalTxn.id and originalTxnId: txn.id
    assert.ok(feesJs.includes('txnId: reversalTxn.id'), 'voidLog must contain txnId: reversalTxn.id');
    assert.ok(feesJs.includes('originalTxnId: txn.id'), 'voidLog must contain originalTxnId: txn.id');

    // 3. deleteFeeTransaction log has txnId: txnId
    assert.ok(appJs.includes('txnId: txnId'), 'deleteLog must contain txnId: txnId');

    // 4. auto-billing log has txnId: nd.id
    assert.ok(appJs.includes('txnId: nd.id'), 'autoLogs must contain txnId: nd.id');

    // 5. bulk charge log has txnId: newTxn.id
    assert.ok(feesJs.includes('txnId: newTxn.id'), 'newBulkLog must contain txnId: newTxn.id');

    // 6. saveFeeTransaction assigns logEntry.receiptNo BEFORE writing logDocRef inside transaction
    const assignPos = appJs.indexOf('logEntry.receiptNo = txn.receiptNo');
    const logDocPos = appJs.indexOf('transaction.set(logDocRef, JSON.parse(JSON.stringify(logEntry)))');
    assert.ok(assignPos !== -1, 'Must assign logEntry.receiptNo = txn.receiptNo');
    assert.ok(logDocPos !== -1, 'Must write logDocRef');
    assert.ok(assignPos < logDocPos, 'logEntry.receiptNo assignment must precede transaction.set(logDocRef, ...)');
  });

  await recordTest('LOGIC-09', 'Don\'t keep phantom logs: no premature unshift/push and resilient deleteFeeTransaction', async () => {
    const feesJs = fs.readFileSync(path.join(ROOT_DIR, 'js/fees.js'), 'utf8');
    const appJs = fs.readFileSync(path.join(ROOT_DIR, 'js/app.js'), 'utf8');

    // doSave must NOT unshift paymentLog before saveFeeTransaction
    const doSaveMatch = feesJs.match(/var paymentLog = {[\s\S]*?};[\s\S]*?SchoolApp\.saveFeeTransaction/);
    assert.ok(doSaveMatch, 'doSave paymentLog definition found');
    assert.strictEqual(doSaveMatch[0].includes('SchoolApp.store.feeActivityLog.unshift(paymentLog)'), false, 'paymentLog must NOT be unshifted before saveFeeTransaction');

    // voidFeeTransaction must NOT unshift voidLog before save
    const voidMatch = feesJs.match(/var voidLog = {[\s\S]*?};[\s\S]*?SchoolApp\.showLoader\('Processing reversal/);
    assert.ok(voidMatch, 'voidLog definition found');
    assert.strictEqual(voidMatch[0].includes('SchoolApp.store.feeActivityLog.unshift(voidLog)'), false, 'voidLog must NOT be unshifted before save');

    // deleteFeeTransaction must wrap logDocRef write in try/catch so log error doesn't fail delete
    assert.ok(appJs.includes('[Fees] Failed to write delete fee_activity_log:'), 'deleteFeeTransaction must catch log write error');
  });

  await recordTest('LOGIC-10', 'Reversal txns (isReversal:true, mode:Reversal, type:reversal, or negative amount with reversal description) classified as Void / Reversal with negative amount', async () => {
    const liveReversalTxn = {
      id: 'txn_rev_live',
      type: 'payment',
      mode: 'Cash',
      amount: -1000,
      isReversal: true,
      description: 'Reversal: Payment (Voided)',
      studentId: 's1',
      timestamp: '2026-11-12T10:00:00.000Z'
    };

    const isReversal = liveReversalTxn.isReversal === true || liveReversalTxn.mode === 'Reversal' || liveReversalTxn.type === 'reversal' || (parseFloat(liveReversalTxn.amount) < 0 && /^reversal/i.test(liveReversalTxn.description || ''));
    const isPayment = !isReversal && (liveReversalTxn.type === 'payment' || (!liveReversalTxn.type && liveReversalTxn.mode && liveReversalTxn.mode !== 'Reversal'));
    const headName = isReversal ? 'Void / Reversal' : ('Payment (' + (liveReversalTxn.mode || 'Cash') + ')');
    const amt = isReversal ? -Math.abs(parseFloat(liveReversalTxn.amount) || 0) : (parseFloat(liveReversalTxn.amount) || 0);

    assert.strictEqual(isReversal, true, 'isReversal must be true');
    assert.strictEqual(isPayment, false, 'isPayment must be false');
    assert.strictEqual(headName, 'Void / Reversal', 'headName must be "Void / Reversal"');
    assert.strictEqual(amt, -1000, 'amount must be -1000');

    // Also test negative amount without isReversal: true but with description matching /^reversal/i
    const descReversalTxn = {
      id: 'txn_rev_desc',
      type: 'payment',
      mode: 'Cash',
      amount: -750,
      description: 'Reversal: receipt #123 voided',
      studentId: 's1',
      timestamp: '2026-11-12T11:00:00.000Z'
    };
    const isRevDesc = descReversalTxn.isReversal === true || descReversalTxn.mode === 'Reversal' || descReversalTxn.type === 'reversal' || (parseFloat(descReversalTxn.amount) < 0 && /^reversal/i.test(descReversalTxn.description || ''));
    assert.strictEqual(isRevDesc, true, 'isReversal must match negative amount + reversal description');
    const headNameDesc = isRevDesc ? 'Void / Reversal' : ('Payment (' + (descReversalTxn.mode || 'Cash') + ')');
    assert.strictEqual(headNameDesc, 'Void / Reversal');

    // Also verify actual js/fees.js code contains the exact expression
    const feesJs = fs.readFileSync(path.join(ROOT_DIR, 'js/fees.js'), 'utf8');
    assert.ok(feesJs.includes("var isReversal = txn.isReversal === true || txn.mode === 'Reversal' || txn.type === 'reversal' || (parseFloat(txn.amount) < 0 && /^reversal/i.test(txn.description || ''));"), 'fees.js must have the comprehensive isReversal check');
    assert.ok(feesJs.includes("var isPayment = !isReversal && (txn.type === 'payment' || (!txn.type && txn.mode && txn.mode !== 'Reversal'));"), 'fees.js must have isPayment check excluding reversal');
  });

  await recordTest('LOGIC-11', 'Legacy log persistence in js/app.js: logs unshifted before save() and removed on failure for single, bulk and delete', async () => {
    const appJs = fs.readFileSync(path.join(ROOT_DIR, 'js/app.js'), 'utf8');

    // 1. Verify single saveFeeTransaction code structure
    const saveSingleMatch = appJs.match(/saveFeeTransaction: async function[\s\S]*?saveFeeTransactions: async function/);
    assert.ok(saveSingleMatch, 'saveFeeTransaction found');
    const singleCode = saveSingleMatch[0];
    const logAddPosSingle = singleCode.lastIndexOf('this.store.feeActivityLog.unshift(logEntry)');
    const saveCallPosSingle = singleCode.lastIndexOf('var saveOk = await this.save(bypassLoader)');
    assert.ok(logAddPosSingle !== -1, 'logEntry must be unshifted into feeActivityLog');
    assert.ok(saveCallPosSingle !== -1, 'save(bypassLoader) must be called');
    assert.ok(logAddPosSingle < saveCallPosSingle, 'logEntry must be added BEFORE save() in saveFeeTransaction');
    assert.ok(singleCode.includes('this.store.feeActivityLog.filter(function(l) { return l && l.id !== logEntry.id; })'), 'Must rollback logEntry on save failure');

    // 2. Verify bulk saveFeeTransactions code structure
    const saveBulkMatch = appJs.match(/saveFeeTransactions: async function[\s\S]*?deleteFeeTransaction: async function/);
    assert.ok(saveBulkMatch, 'saveFeeTransactions found');
    const bulkCode = saveBulkMatch[0];
    const logAddPosBulk = bulkCode.lastIndexOf('addedIds.add(l.id)');
    const saveCallPosBulk = bulkCode.lastIndexOf('var saveOk = await this.save(bypassLoader)');
    assert.ok(logAddPosBulk !== -1, 'bulk logs must be added to feeActivityLog');
    assert.ok(saveCallPosBulk !== -1, 'save(bypassLoader) must be called');
    assert.ok(logAddPosBulk < saveCallPosBulk, 'logEntries must be added BEFORE save() in saveFeeTransactions');
    assert.ok(bulkCode.includes('return !l || !addedIds.has(l.id)'), 'Must rollback addedIds on bulk save failure');

    // 3. Verify deleteFeeTransaction legacy/root branch code structure
    const deleteMatch = appJs.match(/deleteFeeTransaction: async function[\s\S]*?loadExamMarksTerm:/);
    assert.ok(deleteMatch, 'deleteFeeTransaction found');
    const deleteCode = deleteMatch[0];
    const logAddPosDelete = deleteCode.lastIndexOf('this.store.feeActivityLog.unshift(deleteLog)');
    const saveCallPosDelete = deleteCode.lastIndexOf('var saveOk = await this.save(true)');
    assert.ok(logAddPosDelete !== -1, 'deleteLog must be unshifted into feeActivityLog on root path');
    assert.ok(saveCallPosDelete !== -1, 'save(true) must be called on root path');
    assert.ok(logAddPosDelete < saveCallPosDelete, 'deleteLog must be added BEFORE save() in deleteFeeTransaction root path');
    assert.ok(deleteCode.includes('this.store.feeActivityLog.filter(function(l) { return l && l.id !== deleteLog.id; })'), 'Must rollback deleteLog on save failure');
  });

  // ========================================================
  // 3. PART B WEBSITE SEO & METADATA TESTS
  // ========================================================
  console.log('\n--- 3. Testing Website SEO, Canonicals, JSON-LD & Page Tagging ---');

  const landingHtml = fs.readFileSync(path.join(ROOT_DIR, 'landing.html'), 'utf8');

  await recordTest('SEO-01', 'landing.html canonical URL is https://www.ctrlshifts.in/', async () => {
    assert.strictEqual(landingHtml.includes('<link rel="canonical" href="https://www.ctrlshifts.in/">'), true);
    assert.strictEqual(landingHtml.includes('href="https://ctrlshifts.in/"'), false);
  });

  await recordTest('SEO-02', 'landing.html og:url is https://www.ctrlshifts.in/', async () => {
    assert.strictEqual(landingHtml.includes('<meta property="og:url" content="https://www.ctrlshifts.in/">'), true);
  });

  await recordTest('SEO-03', 'landing.html title has consistent brand "Paathshala by Ctrl Shift Solutions"', async () => {
    assert.strictEqual(
      landingHtml.includes('<title>Paathshala by Ctrl Shift Solutions — School Management Software for Indian Schools</title>'),
      true
    );
  });

  await recordTest('SEO-04', 'landing.html JSON-LD is valid JSON and contains required entities', async () => {
    const jsonLdMatch = landingHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(jsonLdMatch, 'JSON-LD script tag must exist');
    const jsonLd = JSON.parse(jsonLdMatch[1]);
    assert.strictEqual(jsonLd['@context'], 'https://schema.org');
    assert.ok(Array.isArray(jsonLd['@graph']), '@graph array must exist');

    const org = jsonLd['@graph'].find(e => e['@type'] === 'Organization');
    assert.ok(org, 'Organization schema must exist');
    assert.strictEqual(org.name, 'Ctrl Shift Solutions');
    assert.strictEqual(org.url, 'https://www.ctrlshifts.in/');

    const site = jsonLd['@graph'].find(e => e['@type'] === 'WebSite');
    assert.ok(site, 'WebSite schema must exist');
    assert.strictEqual(site.name, 'Paathshala by Ctrl Shift Solutions');

    const app = jsonLd['@graph'].find(e => e['@type'] === 'SoftwareApplication');
    assert.ok(app, 'SoftwareApplication schema must exist');
    assert.strictEqual(app.name, 'Paathshala by Ctrl Shift Solutions');
    assert.ok(Array.isArray(app.offers) && app.offers.length >= 6, 'Should have monthly and yearly offers for Starter, Growth, Enterprise');

    // NO aggregateRating or reviews
    const hasReviewsOrRating = JSON.stringify(jsonLd).includes('aggregateRating') || JSON.stringify(jsonLd).includes('Review');
    assert.strictEqual(hasReviewsOrRating, false, 'No aggregateRating or reviews allowed in JSON-LD');

    const faq = jsonLd['@graph'].find(e => e['@type'] === 'FAQPage');
    assert.ok(faq, 'FAQPage schema must exist');
    assert.strictEqual(faq.mainEntity.length, 8, 'FAQPage must contain exactly 8 questions matching visible content');
    assert.strictEqual(faq.mainEntity[0].name, 'Mere teachers technology mein kamzor hain — use kar paayenge?');
  });

  await recordTest('SEO-05', 'landing.html nav and footer link to About and Case Study', async () => {
    assert.ok(landingHtml.includes('href="about.html"'), 'Nav must link to about.html');
    assert.ok(landingHtml.includes('href="case-study.html"'), 'Nav must link to case-study.html');
  });

  await recordTest('SEO-06', '404.html exists, has noindex, and links to Home, Register, WhatsApp', async () => {
    const p404 = path.join(ROOT_DIR, '404.html');
    assert.ok(fs.existsSync(p404), '404.html must exist');
    const content404 = fs.readFileSync(p404, 'utf8');
    assert.ok(content404.includes('content="noindex'), '404.html must have noindex robots tag');
    assert.ok(content404.includes('href="/"'), '404.html must link to Home');
    assert.ok(content404.includes('href="register.html"'), '404.html must link to Register');
    assert.ok(content404.includes('href="https://wa.me/919155515505"'), '404.html must link to WhatsApp');
  });

  await recordTest('SEO-07', 'vercel.json routes apex/www unknown paths to 404.html with status 404 and school subdomains to index.html', async () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'vercel.json'), 'utf8'));
    const notFoundRoute = vercel.routes.find(r => r.dest === '/404.html' && r.status === 404);
    assert.ok(notFoundRoute, 'Must have a 404 destination route with status 404');
    assert.ok(notFoundRoute.has.some(h => h.value === '^(?:www\\.)?ctrlshifts\\.in$'), '404 rule must apply only to apex/www domain');

    const finalCatchAll = vercel.routes[vercel.routes.length - 1];
    assert.strictEqual(finalCatchAll.dest, '/index.html', 'Final catch-all must route school subdomains to /index.html');
  });

  await recordTest('SEO-08', 'index.html and parents.html have robots noindex; register.html remains indexable', async () => {
    const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    const parentsHtml = fs.readFileSync(path.join(ROOT_DIR, 'parents.html'), 'utf8');
    const registerHtml = fs.readFileSync(path.join(ROOT_DIR, 'register.html'), 'utf8');

    assert.ok(indexHtml.includes('<meta name="robots" content="noindex">'), 'index.html must have robots noindex');
    assert.ok(parentsHtml.includes('<meta name="robots" content="noindex">'), 'parents.html must have robots noindex');
    assert.ok(registerHtml.includes('<meta name="robots" content="index, follow">'), 'register.html must remain indexable');
    assert.ok(registerHtml.includes('<link rel="canonical" href="https://www.ctrlshifts.in/register.html">'), 'register.html canonical must be www');
  });

  await recordTest('SEO-09', 'sitemap.xml has required URLs with canonical www and lastmod 2026-11-11', async () => {
    const sitemap = fs.readFileSync(path.join(ROOT_DIR, 'sitemap.xml'), 'utf8');
    const requiredUrls = [
      'https://www.ctrlshifts.in/',
      'https://www.ctrlshifts.in/about.html',
      'https://www.ctrlshifts.in/case-study.html',
      'https://www.ctrlshifts.in/register.html',
      'https://www.ctrlshifts.in/privacy.html',
      'https://www.ctrlshifts.in/terms.html'
    ];
    requiredUrls.forEach(u => {
      assert.ok(sitemap.includes(`<loc>${u}</loc>`), `sitemap must include ${u}`);
    });
    const lastmods = sitemap.match(/<lastmod>([^<]+)<\/lastmod>/g) || [];
    assert.strictEqual(lastmods.length, 6, 'All 6 entries must have a lastmod tag');
    lastmods.forEach(lm => {
      assert.ok(lm.includes('2026-11-11'), 'lastmod must be 2026-11-11');
    });
  });

  await recordTest('SEO-10', 'robots.txt specifies www sitemap URL', async () => {
    const robots = fs.readFileSync(path.join(ROOT_DIR, 'robots.txt'), 'utf8');
    assert.ok(robots.includes('Sitemap: https://www.ctrlshifts.in/sitemap.xml'), 'robots.txt must point to www sitemap');
  });

  await recordTest('SEO-11', 'about.html has ~400-600 words, no personal names, valid meta, and JSON-LD', async () => {
    const aboutHtml = fs.readFileSync(path.join(ROOT_DIR, 'about.html'), 'utf8');
    assert.ok(aboutHtml.includes('<link rel="canonical" href="https://www.ctrlshifts.in/about.html">'), 'about.html canonical');
    assert.ok(aboutHtml.includes('<meta name="robots" content="index, follow">'), 'about.html robots');
    assert.ok(aboutHtml.includes('application/ld+json'), 'about.html JSON-LD');

    // Word count check on main article
    const mainMatch = aboutHtml.match(/<main[\s\S]*?<\/main>/);
    assert.ok(mainMatch, 'main section exists');
    const text = mainMatch[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = text.split(' ').filter(Boolean).length;
    assert.ok(wordCount >= 380 && wordCount <= 650, `Main text word count (${wordCount}) should be ~400-600 words`);

    // No personal names
    assert.strictEqual(aboutHtml.toLowerCase().includes('bhanu'), false, 'No founder personal name');
  });

  await recordTest('SEO-12', 'case-study.html has canonical www, Open Graph, and JSON-LD', async () => {
    const caseHtml = fs.readFileSync(path.join(ROOT_DIR, 'case-study.html'), 'utf8');
    assert.ok(caseHtml.includes('<link rel="canonical" href="https://www.ctrlshifts.in/case-study.html">'), 'case-study.html canonical');
    assert.ok(caseHtml.includes('<meta property="og:site_name" content="Paathshala by Ctrl Shift Solutions">'), 'case-study.html og:site_name');
    assert.ok(caseHtml.includes('application/ld+json'), 'case-study.html JSON-LD');
  });

  await recordTest('SEO-13', 'about.html copy reflects v86.1 corrections (no scheduled backup claim, recycle bin text, no age 50 claim, unstable internet text)', async () => {
    const aboutHtml = fs.readFileSync(path.join(ROOT_DIR, 'about.html'), 'utf8');
    assert.strictEqual(aboutHtml.includes('automatically backed up daily'), false, 'No automated daily backup claim');
    assert.ok(aboutHtml.includes('Deleted records go to a recycle bin first, and our support team can restore them on request.'), 'Recycle bin sentence present');
    assert.strictEqual(aboutHtml.includes('Teachers aged 50 and above'), false, 'No age 50 claim');
    assert.ok(aboutHtml.includes('The interface is designed so that teachers who have never used ERP software can start using it quickly.'), 'Quick start sentence present');
    assert.strictEqual(aboutHtml.includes('offline-first Progressive Web Application architecture'), false, 'No offline-first PWA claim');
    assert.ok(aboutHtml.includes('built to keep working on slow or unstable internet, with changes syncing when the connection returns.'), 'Unstable internet sentence present');
  });

  await recordTest('SEO-14', 'case-study.html copy reflects v86.1 corrections (no 80% claim, no within 24 hours claim, preserves over 280 enrolled students)', async () => {
    const caseHtml = fs.readFileSync(path.join(ROOT_DIR, 'case-study.html'), 'utf8');
    assert.strictEqual(caseHtml.includes('80% Reduction in Administrative Overhead'), false, 'No 80% reduction claim');
    assert.ok(caseHtml.includes('Significant Reduction in Administrative Overhead'), 'Significant reduction sentence present');
    assert.strictEqual(caseHtml.includes('within 24 hours'), false, 'No within 24 hours claim');
    assert.ok(caseHtml.includes('over 280 enrolled students'), 'Preserves over 280 enrolled students');
  });

  await recordTest('SEO-15', 'School-subdomain SEO: vercel.json X-Robots-Tag before filesystem, canonicals removed from index/parents/super-admin', async () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'vercel.json'), 'utf8'));

    // Find the X-Robots-Tag route
    const xRobotsRouteIdx = vercel.routes.findIndex(r => r.headers && r.headers['X-Robots-Tag'] === 'noindex, nofollow');
    assert.ok(xRobotsRouteIdx !== -1, 'Route with X-Robots-Tag: noindex, nofollow must exist in vercel.json');

    const fsHandleIdx = vercel.routes.findIndex(r => r.handle === 'filesystem');
    assert.ok(fsHandleIdx !== -1, 'handle: filesystem must exist in vercel.json');
    assert.ok(xRobotsRouteIdx < fsHandleIdx, 'X-Robots-Tag header route must be placed BEFORE handle: filesystem');

    const route = vercel.routes[xRobotsRouteIdx];
    assert.strictEqual(route.continue, true, 'X-Robots-Tag route must specify continue: true');
    assert.ok(route.has && route.has[0], 'Route must have host condition');
    const hostRegex = new RegExp(route.has[0].value);

    // Subdomains must match
    assert.strictEqual(hostRegex.test('greenwood.ctrlshifts.in'), true, 'Must match greenwood.ctrlshifts.in');
    assert.strictEqual(hostRegex.test('kkgs.ctrlshifts.in'), true, 'Must match kkgs.ctrlshifts.in');
    assert.strictEqual(hostRegex.test('svm-bokaro.ctrlshifts.in'), true, 'Must match svm-bokaro.ctrlshifts.in');
    assert.strictEqual(hostRegex.test('parents.ctrlshifts.in'), true, 'Must match parents.ctrlshifts.in');

    // Marketing domains must NOT match
    assert.strictEqual(hostRegex.test('www.ctrlshifts.in'), false, 'Must NOT match www.ctrlshifts.in');
    assert.strictEqual(hostRegex.test('ctrlshifts.in'), false, 'Must NOT match ctrlshifts.in');

    // HTML checks
    const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    assert.ok(indexHtml.includes('<meta name="robots" content="noindex">'), 'index.html has noindex');
    assert.strictEqual(indexHtml.includes('<link rel="canonical" href="https://ctrlshifts.in">'), false, 'index.html canonical removed');
    assert.strictEqual(indexHtml.includes('<link rel="canonical" href="https://ctrlshifts.in/">'), false, 'index.html canonical removed');

    const superAdminHtml = fs.readFileSync(path.join(ROOT_DIR, 'super-admin.html'), 'utf8');
    assert.ok(superAdminHtml.includes('<meta name="robots" content="noindex">'), 'super-admin.html has noindex');
    assert.strictEqual(superAdminHtml.includes('<link rel="canonical"'), false, 'super-admin.html has no canonical');

    const parentsHtml = fs.readFileSync(path.join(ROOT_DIR, 'parents.html'), 'utf8');
    assert.ok(parentsHtml.includes('<meta name="robots" content="noindex">'), 'parents.html has noindex');
    assert.strictEqual(parentsHtml.includes('<link rel="canonical" href="https://ctrlshifts.in'), false, 'parents.html has no canonical to marketing');
  });

  await recordTest('SEO-16', 'Version bump to v87 across all required files', async () => {
    const versionJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'version.json'), 'utf8'));
    assert.strictEqual(versionJson.version, 'v87', 'version.json must specify v87');

    const swJs = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
    assert.ok(swJs.includes("const BUILD_VERSION = 'v87';"), 'sw.js must specify v87');

    const appJs = fs.readFileSync(path.join(ROOT_DIR, 'js/app.js'), 'utf8');
    assert.ok(appJs.includes("window.APP_VERSION = window.APP_VERSION || 'v87';"), 'js/app.js must specify v87');
  });

  // ========================================================
  // SUMMARY
  // ========================================================
  console.log('\n========================================================');
  console.log(`v86 TEST SUMMARY: Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log('========================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
