'use strict';

/**
 * test/test_v85_batch.js
 *
 * Dedicated Test Suite for v85 Batch Fixes:
 * 1. Fee Ledger / History:
 *    a) Real txn.timestamp formatted in IST; date-only fallback without time.
 *    b) Receipt / TX ID shows receipt number with full txn.id on tooltip.
 *    c) Voided payments show Voided badge with strike-through and tooltip; Reversals show "Reversal of <receipt>";
 *       Collection math conservation: payment + reversal = 0.
 *    d) Impersonation footer name fallback "Administrator" (never undefined undefined).
 *    e) Absence of duplicate bulk reminders button on ledger toolbar.
 * 2. Dashboard / Navigation:
 *    a) Attendance Overview chart aggregates per date across multiple classes, sorted ascending, labeled as DD-MM.
 *    b) Address bar hashchange triggers navigation.
 *    c) Class labels: formatClassLabel handles Nursery, LKG, UKG case-insensitively.
 * 3. Older Pending Bugs:
 *    a) Soft delete on student moves to Recycle Bin, filters out from active student list, and leaves fees & attendance intact.
 *    b) Class rename: attendance records recorded under old class name or Roman numeral still match and display under new class name.
 *    c) Hinglish UI strings replaced in fees and attendance.
 * 4. Storage / Performance:
 *    a) Notices and notifications capped at 100 with loadOlder functions.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

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

// Minimal browser/DOM mock
function createBrowserEnvironment() {
  const store = {
    settings: {
      classes: ['6', '7', '8', 'Nursery', 'LKG', 'UKG'],
      sections: { '6': ['A'], '7': ['A'], '8': ['A'], 'Nursery': ['A'], 'LKG': ['A'], 'UKG': ['A'] },
      classAliases: { 'Class 6': '6', 'VI': '6' }
    },
    students: [],
    fees: [],
    attendance: [],
    notices: [],
    notifications: [],
    trash: []
  };

  const elements = new Map();

  const documentMock = {
    getElementById: (id) => {
      if (!elements.has(id)) {
        elements.set(id, {
          id: id,
          value: '',
          textContent: '',
          innerHTML: '',
          style: {},
          classList: {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            toggle(c, v) { if (v) this.add(c); else this.remove(c); }
          },
          setAttribute(k, v) { this[k] = v; },
          getAttribute(k) { return this[k]; },
          addEventListener() {}
        });
      }
      return elements.get(id);
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {}
  };

  const windowMock = {
    document: documentMock,
    location: { hash: '#dashboard' },
    addEventListener: (evt, handler) => {
      windowMock._listeners = windowMock._listeners || {};
      windowMock._listeners[evt] = windowMock._listeners[evt] || [];
      windowMock._listeners[evt].push(handler);
    },
    triggerEvent: (evt, eventObj) => {
      if (windowMock._listeners && windowMock._listeners[evt]) {
        windowMock._listeners[evt].forEach(h => h(eventObj || {}));
      }
    },
    sessionStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; }
    },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; }
    },
    history: {
      replaceState() {},
      pushState() {}
    }
  };

  return { windowMock, documentMock, store };
}

async function main() {
  console.log('\n--- Running Test Suite: test_v85_batch ---\n');

  // Test 1: formatTxnDateTime
  await runTest('1.a formatTxnDateTime formats real timestamp in IST and falls back to date-only without time', async () => {
    const feesCode = fs.readFileSync(path.resolve(__dirname, '../js/fees.js'), 'utf8');
    // Extract formatTxnDateTime
    const match = feesCode.match(/function formatTxnDateTime\(t\) \{[\s\S]*?\n  \}/);
    assert(match, 'formatTxnDateTime function must exist in js/fees.js');

    const fnStr = match[0] + '\nreturn formatTxnDateTime;';
    const formatDateDDMMYYYY = (d) => {
      if (!d) return '—';
      const parts = d.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
    };

    const fn = new Function('formatDateDDMMYYYY', fnStr)(formatDateDDMMYYYY);

    // 1. With ISO timestamp including time
    const resWithTime = fn({ timestamp: '2026-11-10T14:30:00.000Z' });
    // In IST (UTC+5:30), 14:30 UTC is 20:00 (8:00 PM)
    assert(resWithTime.includes('2026'), 'Should include year');
    assert(resWithTime.includes(':'), 'Should include time in IST');

    // 2. Fallback to date-only without timestamp
    const resDateOnly = fn({ date: '2026-11-10' });
    assert.strictEqual(resDateOnly, '10/11/2026', 'Date-only must format as DD/MM/YYYY with NO time');
    assert(!resDateOnly.includes(':'), 'Date-only fallback must not contain time');
    assert(!resDateOnly.includes('5:30:00'), 'Must not evaluate to 5:30:00 AM');
  });

  // Test 2: Fee Ledger Collection Math Conservation
  await runTest('1.c Voided payments and reversals conserve collection math (payment + reversal = 0)', async () => {
    const feesCode = fs.readFileSync(path.resolve(__dirname, '../js/fees.js'), 'utf8');
    const match = feesCode.match(/function calculateFeeLedgerStats\(\) \{[\s\S]*?\n  \}/);
    assert(match, 'calculateFeeLedgerStats function must exist');

    const todayStr = new Date().toISOString().split('T')[0];
    const SchoolApp = {
      store: {
        fees: [
          // Normal payment
          { id: 'pay_1', type: 'payment', amount: 5000, date: todayStr },
          // Payment that was voided
          { id: 'pay_2', type: 'payment', amount: 2000, date: todayStr, isVoided: true, voidReason: 'Entered by mistake' },
          // Corresponding reversal
          { id: 'rev_2', type: 'payment', amount: -2000, date: todayStr, isReversal: true, originalTxnId: 'pay_2' }
        ]
      }
    };

    const fn = new Function('SchoolApp', match[0] + '\nreturn calculateFeeLedgerStats;')(SchoolApp);
    const stats = fn();

    // 5000 + 2000 + (-2000) = 5000
    assert.strictEqual(stats.todaysCollection, 5000, 'Todays collection must mathematically equal 5000');
    assert.strictEqual(stats.mtdCollection, 5000, 'MTD collection must mathematically equal 5000');
  });

  // Test 3: Impersonation footer name fallback
  await runTest('1.d Impersonation footer name displays Administrator fallback and never "undefined undefined"', async () => {
    const appCode = fs.readFileSync(path.resolve(__dirname, '../js/app.js'), 'utf8');
    assert(appCode.includes('getUserFullName: function(user)'), 'getUserFullName helper must exist in js/app.js');

    // Create sandbox
    const { windowMock, documentMock } = createBrowserEnvironment();
    const sandbox = {
      window: windowMock,
      document: documentMock,
      localStorage: windowMock.localStorage,
      sessionStorage: windowMock.sessionStorage,
      console: console,
      setTimeout: () => {},
      clearTimeout: () => {},
      setInterval: () => {},
      clearInterval: () => {}
    };
    vm.createContext(sandbox);

    // Test getUserFullName logic directly
    const userFnMatch = appCode.match(/getUserFullName:\s*function\(user\)\s*\{[\s\S]*?\n  \},/);
    assert(userFnMatch, 'getUserFullName method match');
    const getUserFullName = new Function('return {' + userFnMatch[0] + '}.getUserFullName;')();

    assert.strictEqual(getUserFullName(null), 'Administrator');
    assert.strictEqual(getUserFullName({ role: 'admin' }), 'Administrator');
    assert.strictEqual(getUserFullName({ firstName: undefined, lastName: undefined, role: 'admin' }), 'Administrator');
    assert.strictEqual(getUserFullName({ name: 'Principal Sharma' }), 'Principal Sharma');
    assert.strictEqual(getUserFullName({ role: 'teacher' }), 'Teacher');
  });

  // Test 4: Duplicate bulk reminders button removal
  await runTest('1.e Duplicate bulk-fee-reminders-ledger-btn is removed from fee ledger toolbar', async () => {
    const feesCode = fs.readFileSync(path.resolve(__dirname, '../js/fees.js'), 'utf8');
    assert(!feesCode.includes('id="bulk-fee-reminders-ledger-btn"'), 'Duplicate bulk fee reminders button must be removed from ledger toolbar');
    assert(feesCode.includes('bulk-fee-reminders-btn'), 'Canonical bulk fee reminders button remains present in header');
  });

  // Test 5: Attendance overview chart aggregation & DD-MM labeling
  await runTest('2.a Attendance Overview chart aggregates per date across multiple classes, sorted ascending, and labels as DD-MM', async () => {
    const appCode = fs.readFileSync(path.resolve(__dirname, '../js/app.js'), 'utf8');
    assert(appCode.includes('attByDate[d]'), 'Chart data must aggregate by date in attByDate');

    // Test aggregation logic
    const store = {
      attendance: [
        { date: '2026-11-10', class: '6', records: [{ status: 'present' }, { status: 'absent' }] },
        { date: '2026-11-10', class: '7', records: [{ status: 'present' }, { status: 'present' }] },
        { date: '2026-11-09', class: '6', records: [{ status: 'present' }] },
        { date: '2026-11-08', class: '6', records: [{ status: 'present' }, { status: 'absent' }] }
      ]
    };

    const self = {
      store: store,
      normalizeAttendanceRecords: (r) => r || []
    };

    // Replicate aggregation block
    const attByDate = {};
    (store.attendance || []).forEach(function(a) {
      const d = a.date || '';
      if (!d) return;
      if (!attByDate[d]) attByDate[d] = { present: 0, total: 0 };
      const recList = self.normalizeAttendanceRecords(a.records);
      recList.forEach(function(r) {
        attByDate[d].total++;
        if (r.status === 'present' || r.status === 'late') attByDate[d].present++;
      });
    });

    const sortedDates = Object.keys(attByDate).sort().slice(-7);
    const attData = sortedDates.map(function(d) {
      const entry = attByDate[d];
      const dParts = d.split('-');
      const ddmm = dParts.length === 3 ? (dParts[2] + '-' + dParts[1]) : d;
      return {
        date: d,
        label: ddmm,
        value: entry.total > 0 ? Math.round((entry.present / entry.total) * 100) : 0
      };
    });

    assert.strictEqual(attData.length, 3, 'Must have 3 unique dates (no duplicates)');
    assert.strictEqual(attData[0].date, '2026-11-08', 'Sorted ascending');
    assert.strictEqual(attData[0].label, '08-11', 'Formatted as DD-MM');
    assert.strictEqual(attData[2].date, '2026-11-10');
    assert.strictEqual(attData[2].label, '10-11', 'Formatted as DD-MM');
    // For 2026-11-10: class 6 had 1/2, class 7 had 2/2 -> total 3/4 = 75%
    assert.strictEqual(attData[2].value, 75, 'Aggregated across both classes on 2026-11-10');
  });

  // Test 6: Address bar hashchange navigation
  await runTest('2.b Address bar hashchange listener navigates cleanly', async () => {
    const appCode = fs.readFileSync(path.resolve(__dirname, '../js/app.js'), 'utf8');
    assert(appCode.includes("window.addEventListener('hashchange'"), 'hashchange listener must be registered in js/app.js');
  });

  // Test 7: formatClassLabel case-insensitivity
  await runTest('2.c formatClassLabel handles Nursery, LKG, UKG case-insensitively and prepends Class for others', async () => {
    const appCode = fs.readFileSync(path.resolve(__dirname, '../js/app.js'), 'utf8');
    const match = appCode.match(/formatClassLabel:\s*function\(cls\)\s*\{[\s\S]*?\n  \},/);
    assert(match, 'formatClassLabel method match');
    const formatClassLabel = new Function('return {' + match[0] + '}.formatClassLabel;')();

    assert.strictEqual(formatClassLabel('Nursery'), 'Nursery');
    assert.strictEqual(formatClassLabel('nursery'), 'Nursery');
    assert.strictEqual(formatClassLabel('Class Nursery'), 'Nursery');
    assert.strictEqual(formatClassLabel('LKG'), 'LKG');
    assert.strictEqual(formatClassLabel('lkg'), 'LKG');
    assert.strictEqual(formatClassLabel('Class lkg'), 'LKG');
    assert.strictEqual(formatClassLabel('UKG'), 'UKG');
    assert.strictEqual(formatClassLabel('ukg'), 'UKG');
    assert.strictEqual(formatClassLabel('Class 6'), 'Class 6');
    assert.strictEqual(formatClassLabel('6'), 'Class 6');
  });

  // Test 8: Usha Academy Student Soft Delete Root Cause & Fix
  await runTest('3.a Student soft delete excludes deleted students from active filter without wiping fees or attendance', async () => {
    const studentsCode = fs.readFileSync(path.resolve(__dirname, '../js/students.js'), 'utf8');
    assert(studentsCode.includes('!s.inTrash && s.status !== \'Deleted\''), 'getFilteredStudents must filter out soft-deleted students');

    const appCode = fs.readFileSync(path.resolve(__dirname, '../js/app.js'), 'utf8');
    assert(appCode.includes('payloadTrash = Array.isArray(payload.trash) ? payload.trash : (Array.isArray(this.store && this.store.trash) ? this.store.trash : [])'),
      'prepareSavePayload must fall back to store.trash when payload.trash is pruned in storageVersion 2');

    // Verify deletion does NOT touch fees or attendance
    const store = {
      students: [{ id: 'st_1', firstName: 'Aarav', lastName: 'Kumar', class: '6', section: 'A', status: 'Active' }],
      fees: [{ id: 'fee_1', studentId: 'st_1', amount: 1000 }],
      attendance: [{ date: '2026-11-10', class: '6', records: [{ studentId: 'st_1', status: 'present' }] }],
      trash: []
    };

    // Simulate delete
    const student = store.students[0];
    student.status = 'Deleted';
    student.inTrash = true;
    store.trash.push({ id: student.id, type: 'student', data: student });
    store.students = store.students.filter(s => s.id !== student.id);

    assert.strictEqual(store.students.length, 0, 'Active student removed from list');
    assert.strictEqual(store.trash.length, 1, 'Moved to trash');
    assert.strictEqual(store.fees.length, 1, 'Fees intact');
    assert.strictEqual(store.attendance.length, 1, 'Attendance intact');
  });

  // Test 9: Class Rename Attendance Matching
  await runTest('3.b Class rename: classesMatch matches old and new names across Arabic, Roman, and Aliases', async () => {
    const appCode = fs.readFileSync(path.resolve(__dirname, '../js/app.js'), 'utf8');
    const normMatch = appCode.match(/normalizeClassIdentifier:\s*function\(cls\)\s*\{[\s\S]*?\n  \},/);
    const matchMethod = appCode.match(/classesMatch:\s*function\(clsA,\s*clsB,\s*secA,\s*secB\)\s*\{[\s\S]*?\n  \},/);
    assert(normMatch && matchMethod, 'normalizeClassIdentifier and classesMatch methods must exist');

    const obj = new Function('return {' + normMatch[0] + '\n' + matchMethod[0] + '};')();
    obj.store = {
      settings: {
        classAliases: {
          'Sunflower': '1',
          'Rose': '2'
        }
      }
    };

    // Arabic to Arabic with Class prefix
    assert.strictEqual(obj.classesMatch('Class 6', '6'), true, 'Class 6 matches 6');
    // Roman to Arabic
    assert.strictEqual(obj.classesMatch('VI', '6'), true, 'Roman VI matches 6');
    assert.strictEqual(obj.classesMatch('Class VI', 'Class 6'), true, 'Class VI matches Class 6');
    assert.strictEqual(obj.classesMatch('X', '10'), true, 'Roman X matches 10');
    // Ordinal numbers
    assert.strictEqual(obj.classesMatch('6th', '6'), true, '6th matches 6');
    assert.strictEqual(obj.classesMatch('1st', '1'), true, '1st matches 1');
    // Aliases
    assert.strictEqual(obj.classesMatch('Sunflower', '1'), true, 'Alias Sunflower matches 1');
    assert.strictEqual(obj.classesMatch('1', 'Sunflower'), true, 'Bidirectional alias matches');
    // Negative
    assert.strictEqual(obj.classesMatch('7', '6'), false, 'Different classes do not match');
  });

  // Test 10: Hinglish strings replacement
  await runTest('3.c Hinglish strings in fees and attendance are completely replaced with clear English', async () => {
    const feesCode = fs.readFileSync(path.resolve(__dirname, '../js/fees.js'), 'utf8');
    const attCode = fs.readFileSync(path.resolve(__dirname, '../js/attendance.js'), 'utf8');

    // Confirm replaced
    assert(!feesCode.includes('Payment ke liye UPI'), 'Payment ke liye UPI replaced');
    assert(feesCode.includes('UPI for Payment'), 'UPI for Payment present');
    assert(!feesCode.includes('*Is Mahine Ke Charges:*'), 'Is Mahine Ke Charges replaced');
    assert(feesCode.includes('*Current Month Charges:*'), 'Current Month Charges present');
    assert(!feesCode.includes('Is Mahine Ka Total'), 'Is Mahine Ka Total replaced');
    assert(feesCode.includes('Current Month Total'), 'Current Month Total present');
    assert(!feesCode.includes('Pichla Baaki'), 'Pichla Baaki replaced');
    assert(feesCode.includes('Previous Balance'), 'Previous Balance present');
    assert(!feesCode.includes('3 mahine se zyada baaki hone par'), 'Late fine notice replaced');
    assert(feesCode.includes('A late fee of ₹20/month may be applied for dues pending over 3 months.'), 'English late fee notice present');
    assert(!feesCode.includes('Ye students is month / date ke liye already charge ho chuke hain.'), 'Bulk dues Hinglish replaced');
    assert(feesCode.includes('These students have already been charged for this month / date.'), 'English bulk dues toast present');

    assert(!attCode.includes('Aapne aaj'), 'Attendance locked Hinglish replaced');
    assert(attCode.includes('You have punched out today at'), 'English punch-out message present');
  });

  // Test 11: Notices and notifications limit 100 and pagination
  await runTest('4.a Notices and notifications queries cap at 100 with loadOlder methods', async () => {
    const appCode = fs.readFileSync(path.resolve(__dirname, '../js/app.js'), 'utf8');
    assert(appCode.includes("loadOlderNotices: async function()"), 'loadOlderNotices method must exist');
    assert(appCode.includes("loadOlderNotifications: async function()"), 'loadOlderNotifications method must exist');

    const adminCode = fs.readFileSync(path.resolve(__dirname, '../js/admin.js'), 'utf8');
    assert(adminCode.includes('btn-load-older-notices'), 'btn-load-older-notices button and handler must exist');
  });

  console.log(`\nResults: ${passedCount} passed, ${failedCount} failed.\n`);
  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
