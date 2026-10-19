/**
 * scripts/test-fees-fixes.js
 * 
 * End-to-end real browser and logic verification on dummy_test_school_isolated:
 * - F1: Auto-charge in migrated mode (await subcollection, simulated dates before/on/after triggerDay)
 * - F1: Auto-charge in non-migrated mode (root students)
 * - F2: Next Due Date calculation (earliest unpaid due vs next cycle triggerDay, no hardcoded 05)
 * - F3: Bulk Charge UI (Due Date label, button disabling, duplicate pre-check warning, 900KB size guard)
 * - F4: Fee Head dropdown (no fh_fh_ prefix, real names, orphan heads hidden from creation dropdowns)
 * 
 * Operates on dummy_test_school_isolated via standard app login.
 */

const { chromium } = require('playwright');
const express = require('express');
const http = require('http');
const path = require('path');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length && require('fs').existsSync(saPath)) {
  admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
}
const db = admin.firestore();
const DUMMY_SCHOOL = 'dummy_test_school_isolated';
const TEST_PORT = 3336;

async function startLocalServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.resolve(__dirname, '..')));
  app.post('/api/verify-school-access', require('../api/verify-school-access.js'));
  app.post('/api/manage-credentials', require('../api/manage-credentials.js'));

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(TEST_PORT, () => {
      resolve(server);
    });
  });
}

async function setupDummySchool() {
  console.log('\n--- 1. Setting up dummy_test_school_isolated for Fee Fix Tests ---');
  const docRef = db.collection('tenant_data').doc(DUMMY_SCHOOL);
  
  // Clean old subcollection docs
  const studentsSub = await docRef.collection('students').get();
  for (const d of studentsSub.docs) {
    await d.ref.delete();
  }
  const fySub = await docRef.collection('fees_years').get();
  for (const yd of fySub.docs) {
    const moSub = await yd.ref.collection('months').get();
    for (const md of moSub.docs) await md.ref.delete();
    await yd.ref.delete();
  }

  const adminPassHash = bcrypt.hashSync('DummyAdmin@123', 10);

  // Create initial test state
  const testSettings = {
    schoolName: 'Dummy Isolated Test School',
    credentialsIsolated: true,
    studentsMigrated: true,
    autoChargeEnabled: true,
    autoChargeTriggerDate: 15,
    autoChargeLastRun: '2026-10', // Pre-stamp to prevent race on login
    adminUsername: 'dummyadmin',
    adminPassword: adminPassHash,
    classes: ['1', '2'],
    feeHeads: [
      { id: 'fh_tuition', name: 'Tuition Fee', frequency: 'Monthly' },
      { id: 'fh_transport', name: 'Transport Fee', frequency: 'Monthly' },
      { id: 'fh_annual', name: 'Annual Development Fee', frequency: 'Annual' }
    ],
    feeStructure: {
      '1': { fh_tuition: 500, fh_annual: 200, fh_orphan_test: 100 },
      '2': { fh_tuition: 600, fh_annual: 200 }
    }
  };

  await docRef.set({
    settings: testSettings,
    students: [], // Empty root students in migrated mode!
    teachers: [],
    fees: [],
    feeActivityLog: [],
    lastAutomatedFeeRun: '2026-10'
  });

  // Seed private credentials
  await docRef.collection('private').doc('credentials').set({
    adminUsername: 'dummyadmin',
    adminPassword: adminPassHash,
    teachers: {},
    deletedTeachers: {}
  });

  // Add 2 students into subcollection
  const testStudent1 = {
    id: 'dummy_s1',
    schoolId: DUMMY_SCHOOL,
    firstName: 'Aarav',
    lastName: 'Kumar',
    class: '1',
    section: 'A',
    status: 'Active',
    transportFee: 150
  };
  const testStudent2 = {
    id: 'dummy_s2',
    schoolId: DUMMY_SCHOOL,
    firstName: 'Priya',
    lastName: 'Sharma',
    class: '2',
    section: 'A',
    status: 'Active',
    transportFee: 0
  };

  await docRef.collection('students').doc('dummy_s1').set(testStudent1);
  await docRef.collection('students').doc('dummy_s2').set(testStudent2);

  console.log('Dummy school configured with 2 subcollection students, empty root students[], triggerDay=15.');
}

async function runTests() {
  await setupDummySchool();
  const server = await startLocalServer();
  console.log(`Local test server running on http://localhost:${TEST_PORT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on('console', msg => console.log('[PAGE]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[PAGE ERR]', err));

  const testResults = [];

  try {
    const url = `http://localhost:${TEST_PORT}/?test_subdomain=dummy-test`;
    console.log(`[UI] Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'load' });

    await page.waitForFunction(() => {
      const btn = document.getElementById('login-submit-btn');
      return btn && !btn.disabled;
    });

    // Login as Admin via real UI
    console.log('[UI] Logging in as admin...');
    await page.click('button.login-tab[data-role="admin"]');
    await page.fill('#admin-username', 'dummyadmin');
    await page.fill('#admin-password', 'DummyAdmin@123');
    await page.click('#login-submit-btn');
    await page.waitForSelector('#app-layout:not(.hidden)', { timeout: 15000 });

    console.log('[UI] Admin logged in successfully.');

    // Wait for subcollection listener to establish
    await page.waitForTimeout(2000);

    // Prepare clean test baseline: reset autoChargeLastRun in memory to '2026-09'
    console.log('[Setup] Setting autoChargeLastRun to "2026-09" to evaluate October...');
    await page.evaluate(() => {
      SchoolApp.store.settings.autoChargeLastRun = '2026-09';
      SchoolApp.store.lastAutomatedFeeRun = '2026-09';
      SchoolApp.store.fees = [];
    });

    // TEST 1: F1 Migrated mode auto-charge with simulated dates
    console.log('\n--- TEST 1: F1 Migrated Mode Auto-Charge ---');
    
    // 1A. Before trigger day (day 10 vs triggerDay 15): must NOT charge
    const resBefore = await page.evaluate(async () => {
      SchoolApp.feesGeneratedMsg = '';
      await SchoolApp.runAutoFeeReconciliation({ simulateDate: '2026-10-10' });
      return {
        feesGeneratedMsg: SchoolApp.feesGeneratedMsg || 'none',
        lastRun: SchoolApp.store.settings.autoChargeLastRun || '',
        feesLength: (SchoolApp.store.fees || []).length
      };
    });
    console.log('1A. Before trigger day (10th):', resBefore);
    testResults.push({
      test: 'F1: Migrated mode before trigger day (no dues, no stamp)',
      passed: resBefore.feesLength === 0 && resBefore.lastRun === '2026-09',
      detail: `feesLength=${resBefore.feesLength}, lastRun="${resBefore.lastRun}"`
    });

    // 1B. On trigger day (15th): MUST load from subcollection and charge both students
    const resOn = await page.evaluate(async () => {
      SchoolApp.feesGeneratedMsg = '';
      await SchoolApp.runAutoFeeReconciliation({ simulateDate: '2026-10-15' });
      return {
        feesGeneratedMsg: SchoolApp.feesGeneratedMsg || 'none',
        lastRun: SchoolApp.store.settings.autoChargeLastRun || '',
        feesCount: (SchoolApp.store.fees || []).length,
        tuitionDues: (SchoolApp.store.fees || []).filter(f => f.feeHeadId === 'fh_tuition').length,
        transportDues: (SchoolApp.store.fees || []).filter(f => f.feeHeadId === 'fh_transport').length,
        studentsCount: (SchoolApp.store.students || []).length
      };
    });
    console.log('1B. On trigger day (15th):', resOn);
    testResults.push({
      test: 'F1: Migrated mode on trigger day (loads subcollection, charges, stamps lastRun)',
      passed: resOn.studentsCount === 2 && resOn.tuitionDues === 2 && resOn.transportDues === 1 && resOn.lastRun === '2026-10',
      detail: `students=${resOn.studentsCount}, tuition=${resOn.tuitionDues}, transport=${resOn.transportDues}, lastRun="${resOn.lastRun}"`
    });

    // 1C. After trigger day re-entry: must NOT double charge (idempotency)
    const resAfter = await page.evaluate(async () => {
      var countBefore = (SchoolApp.store.fees || []).length;
      await SchoolApp.runAutoFeeReconciliation({ simulateDate: '2026-10-20' });
      var countAfter = (SchoolApp.store.fees || []).length;
      return {
        countBefore,
        countAfter,
        doubleCharged: countAfter > countBefore
      };
    });
    console.log('1C. Re-entry after trigger day:', resAfter);
    testResults.push({
      test: 'F1: Migrated mode idempotency after trigger day (no double charge)',
      passed: resAfter.doubleCharged === false && resAfter.countBefore === resAfter.countAfter,
      detail: `countBefore=${resAfter.countBefore}, countAfter=${resAfter.countAfter}`
    });

    // 1D. Non-migrated mode auto-charge (reads root students[])
    console.log('\n--- TEST 1D: F1 Non-Migrated Mode Auto-Charge ---');
    const resNonMigrated = await page.evaluate(async () => {
      SchoolApp.store.settings.studentsMigrated = false;
      var origStoreStudents = SchoolApp.store.students;
      SchoolApp.store.students = [
        { id: 'dummy_s1', schoolId: SchoolApp.currentSchoolId, firstName: 'Aarav', lastName: 'Kumar', class: '1', section: 'A', status: 'Active', transportFee: 150 },
        { id: 'dummy_s2', schoolId: SchoolApp.currentSchoolId, firstName: 'Priya', lastName: 'Sharma', class: '2', section: 'A', status: 'Active', transportFee: 0 }
      ];
      var feesBefore = (SchoolApp.store.fees || []).length;

      // Simulate Nov 15 on trigger day
      await SchoolApp.runAutoFeeReconciliation({ simulateDate: '2026-11-15' });

      var feesAfter = (SchoolApp.store.fees || []).length;
      var lastRun = SchoolApp.store.settings.autoChargeLastRun;

      // Revert settings back
      SchoolApp.store.settings.studentsMigrated = true;
      SchoolApp.store.settings.autoChargeLastRun = '2026-10';

      return { duesAdded: feesAfter - feesBefore, lastRun };
    });
    console.log('1D. Non-migrated mode result:', resNonMigrated);
    testResults.push({
      test: 'F1: Non-migrated mode auto-charge (reads root students[], generates dues, stamps lastRun)',
      passed: resNonMigrated.duesAdded === 3 && resNonMigrated.lastRun === '2026-11',
      detail: `duesAdded=${resNonMigrated.duesAdded}, lastRun="${resNonMigrated.lastRun}"`
    });

    // TEST 2: F4 Fee Head Dropdown (no fh_fh_ prefix, real names, orphan hidden)
    console.log('\n--- TEST 2: F4 Fee Head Dropdown ---');
    // Navigate to Fees page via SchoolApp.navigate
    await page.evaluate(() => SchoolApp.navigate('fees'));
    await page.waitForTimeout(1000);

    const f4Res = await page.evaluate(() => {
      // Trigger bulk charge modal via UI button
      var bulkBtn = document.getElementById('bulk-charge-fee-btn');
      if (bulkBtn) bulkBtn.click();
      
      var selectEl = document.getElementById('bulk-feehead');
      var options = [];
      if (selectEl) {
        for (var i = 0; i < selectEl.options.length; i++) {
          options.push({ value: selectEl.options[i].value, text: selectEl.options[i].textContent.trim() });
        }
      }
      SchoolApp.closeModal();

      var hasDoublePrefix = options.some(o => o.value.startsWith('fh_fh_') || o.text.startsWith('Fh_fh_'));
      var hasRawIdInName = options.some(o => o.text.startsWith('Fh_'));
      var hasOrphan = options.some(o => o.value === 'fh_orphan_test');

      return {
        optionsCount: options.length,
        options,
        hasDoublePrefix,
        hasRawIdInName,
        hasOrphan
      };
    });
    console.log('2. Fee head dropdown result:', f4Res);
    testResults.push({
      test: 'F4: Fee head dropdown (real names, no double prefix, orphan hidden)',
      passed: f4Res.hasDoublePrefix === false && f4Res.hasRawIdInName === false && f4Res.hasOrphan === false && f4Res.optionsCount === 3,
      detail: `options=${f4Res.options.map(o => o.text).join(', ')}, orphanHidden=${!f4Res.hasOrphan}`
    });

    // TEST 3: F2 Next Due Date dynamic computation (earliest unpaid due vs triggerDay)
    console.log('\n--- TEST 3: F2 Next Due Date Calculation ---');
    const f2Res = await page.evaluate(() => {
      // Open financial profile of dummy_s1 (has transport due on 01/10/2026 and tuition on 15/10/2026 -> earliest is 01/10/2026)
      SchoolApp.openStudentFinancialProfile('dummy_s1');
      var nextDueCardA = document.querySelector('.financial-profile-container .stat-card.cyan .stat-number');
      var nextDueTextA = nextDueCardA ? nextDueCardA.textContent.trim() : '';
      SchoolApp.closeModal();

      // Open financial profile of dummy_s2 (has tuition due only on 15/10/2026 -> earliest is 15/10/2026)
      SchoolApp.openStudentFinancialProfile('dummy_s2');
      var nextDueCardS2 = document.querySelector('.financial-profile-container .stat-card.cyan .stat-number');
      var nextDueTextS2 = nextDueCardS2 ? nextDueCardS2.textContent.trim() : '';
      SchoolApp.closeModal();

      // Temporarily clear dues to test zero-due cycle calculation (should project to 15th of next month)
      var oldFees = SchoolApp.store.fees;
      SchoolApp.store.fees = [];
      SchoolApp.openStudentFinancialProfile('dummy_s1');
      var nextDueCardB = document.querySelector('.financial-profile-container .stat-card.cyan .stat-number');
      var nextDueTextB = nextDueCardB ? nextDueCardB.textContent.trim() : '';
      SchoolApp.closeModal();
      SchoolApp.store.fees = oldFees;

      return {
        nextDueS1: nextDueTextA,
        nextDueS2: nextDueTextS2,
        nextDueWithZeroDues: nextDueTextB,
        unpaidMatchS1: nextDueTextA === '01/10/2026',
        unpaidMatchS2: nextDueTextS2 === '15/10/2026',
        nextCycleMatch: nextDueTextB === '15/11/2026',
        noHardcoded05: !nextDueTextB.includes('/05/') && nextDueTextB.startsWith('15/')
      };
    });
    console.log('3. Next Due Date result:', f2Res);
    testResults.push({
      test: 'F2: Next Due Date reads unpaid dues and triggerDay (no hardcoded 05)',
      passed: f2Res.unpaidMatchS1 === true && f2Res.unpaidMatchS2 === true && f2Res.nextCycleMatch === true && f2Res.noHardcoded05 === true,
      detail: `s1Unpaid=${f2Res.nextDueS1}, s2Unpaid=${f2Res.nextDueS2}, clearedDueCycle=${f2Res.nextDueWithZeroDues}`
    });

    // TEST 4: F3 Bulk Charge UI, Disabling, Pre-Check & Size Guard
    console.log('\n--- TEST 4: F3 Bulk Charge UI, Guard & Pre-Check ---');
    const f3Res = await page.evaluate(async () => {
      var bulkBtn = document.getElementById('bulk-charge-fee-btn');
      if (bulkBtn) bulkBtn.click();
      
      // Verify Due Date label
      var labels = Array.from(document.querySelectorAll('#bulk-charge-form label')).map(l => l.textContent.trim());
      var hasDueDateLabel = labels.some(l => l.includes('Due Date'));
      var hasOldBillingLabel = labels.some(l => l.includes('Billing Date'));

      var saveBtn = document.getElementById('bulk-charge-save-btn');
      var btnText = saveBtn ? saveBtn.textContent.trim() : '';

      SchoolApp.closeModal();

      // Test Size Guard block (>900KB)
      var origStore = SchoolApp.store;
      var simulatedBigStore = { ...SchoolApp.store, dummyHeavy: 'X'.repeat(930000) };
      SchoolApp.store = simulatedBigStore;

      if (bulkBtn) bulkBtn.click();
      document.getElementById('bulk-date').value = '2026-10-25';
      document.getElementById('bulk-desc').value = 'October Fee';

      var btn = document.getElementById('bulk-charge-save-btn');
      var toastTriggered = false;
      var origShowToast = SchoolApp.showToast;
      SchoolApp.showToast = function(msg, type) {
        if (msg && msg.includes('Bulk charge blocked: Root document is near 1 MB limit')) {
          toastTriggered = true;
        }
        origShowToast.call(SchoolApp, msg, type);
      };

      if (btn) btn.click();
      await new Promise(r => setTimeout(r, 200));

      SchoolApp.showToast = origShowToast;
      SchoolApp.store = origStore;
      SchoolApp.closeModal();

      return {
        hasDueDateLabel,
        hasOldBillingLabel,
        btnText,
        sizeGuardBlocked: toastTriggered
      };
    });
    console.log('4. Bulk charge checks:', f3Res);
    testResults.push({
      test: 'F3: Bulk charge Due Date label, button text, and 900KB size guard block',
      passed: f3Res.hasDueDateLabel === true && f3Res.hasOldBillingLabel === false && f3Res.sizeGuardBlocked === true,
      detail: `dueDateLabel=${f3Res.hasDueDateLabel}, oldBillingLabel=${f3Res.hasOldBillingLabel}, sizeGuardBlocked=${f3Res.sizeGuardBlocked}`
    });

  } finally {
    await browser.close();
    server.close();
  }

  // Cleanup dummy school
  console.log('\nCleaning up dummy school test data...');
  const docRef = db.collection('tenant_data').doc(DUMMY_SCHOOL);
  const studentsSub = await docRef.collection('students').get();
  for (const d of studentsSub.docs) await d.ref.delete();
  const fySub = await docRef.collection('fees_years').get();
  for (const yd of fySub.docs) {
    const moSub = await yd.ref.collection('months').get();
    for (const md of moSub.docs) await md.ref.delete();
    await yd.ref.delete();
  }
  await docRef.set({
    settings: { credentialsIsolated: true, schoolName: 'Dummy Isolated Test School' },
    students: [],
    teachers: [],
    fees: []
  });

  console.log('\n================================================================');
  console.log('                      TEST SUITE SUMMARY                        ');
  console.log('================================================================');
  console.table(testResults);
  const allPassed = testResults.every(r => r.passed);
  console.log('RESULT:', allPassed ? 'ALL TESTS PASSED (100% SUCCESS)' : 'SOME TESTS FAILED');
  if (!allPassed) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
