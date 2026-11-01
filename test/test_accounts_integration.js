'use strict';

/**
 * test/test_accounts_integration.js
 *
 * Emulator integration test for Accounts Module Slice 2:
 * 1. Seeds a fake school with fees months, expenses, a receipt, a transfer, and locked opening balances.
 * 2. Invokes api/accounts.js sync endpoint against Firestore emulator.
 * 3. Verifies Trial Balance balances: sum(Dr) == sum(Cr).
 * 4. Verifies Fee Reconciliation: net fees collections == ledger fee income minus discount.
 * 5. Verifies Idempotency: second sync run results in 0 new vouchers and identical summary.
 */

process.env.NODE_ENV = 'test';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';

const assert = require('assert');
const admin = require('firebase-admin');
const accountsHandler = require('../api/accounts.js');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'ctrl-shift-solutions' });
}
const db = admin.firestore();

const runId = Date.now();
const schoolId = 'fake_school_s2_' + runId;
const testUid = 'test_admin_uid_' + runId;
const targetFY = '2026-27';

// Mock Express req/res
function createMockReqRes(body) {
  const req = {
    method: 'POST',
    headers: { origin: 'https://ctrlshifts.in' },
    body
  };
  let resStatus = 200;
  let resData = null;
  const res = {
    setHeader: () => {},
    status: (code) => {
      resStatus = code;
      return res;
    },
    json: (data) => {
      resData = data;
      return res;
    },
    end: () => res
  };
  return { req, res, getResult: () => ({ status: resStatus, data: resData }) };
}

async function runAccountsIntegrationTest() {
  console.log('========================================================');
  console.log('--- Emulator Integration Test: Accounts Slice 2 Sync ---');
  console.log('========================================================\n');

  // 1. Seed School Record & Admin Access
  console.log('1. Seeding school access & settings...');
  await db.collection('schools').doc(schoolId).set({
    allowed_features: ['dashboard', 'students', 'fees', 'accounts']
  });
  await db.collection('school_access').doc(testUid).set({
    schoolId,
    role: 'admin',
    updatedAt: new Date().toISOString()
  });

  // 1b. Seed Chart of Accounts
  for (const acc of [
    { code: '11100', name: 'Cash in Hand', type: 'asset', isActive: true },
    { code: '11110', name: 'Petty Cash', type: 'asset', isActive: true },
    { code: '11200', name: 'Primary Bank Account', type: 'asset', isActive: true },
    { code: '31100', name: 'General Corpus', type: 'equity', isActive: true },
    { code: '41100', name: 'Tuition Fees', type: 'income', isActive: true },
    { code: '42100', name: 'Transport Fees', type: 'income', isActive: true },
    { code: '43100', name: 'Bank Interest', type: 'income', isActive: true },
    { code: '52100', name: 'Printing & Stationery', type: 'expense', isActive: true },
    { code: '53100', name: 'Electricity Utility', type: 'expense', isActive: true },
    { code: '55100', name: 'Fee Concessions', type: 'expense', isActive: true }
  ]) {
    await db.doc(`tenant_data/${schoolId}/accounts_chart/${acc.code}`).set(acc);
  }

  // 2. Seed accounts_settings/main
  await db.doc(`tenant_data/${schoolId}/accounts_settings/main`).set({
    entityType: 'trust',
    financialYearStart: '2026-04-01',
    goLiveDate: '2026-04-01',
    feeCashAccount: '11100',
    feeDigitalAccount: '11200',
    feeHeadMapping: {
      'fh_tuition': '41100',
      'fh_transport': '42100'
    },
    isConfigured: true
  });

  // 3. Seed accounts_settings/opening (locked)
  await db.doc(`tenant_data/${schoolId}/accounts_settings/opening`).set({
    fy: targetFY,
    date: '2026-04-01',
    status: 'locked',
    lines: [
      { accountCode: '11100', debitPaise: 500000, creditPaise: 0 }, // ₹5,000 cash Dr
      { accountCode: '11200', debitPaise: 2000000, creditPaise: 0 }, // ₹20,000 bank Dr
      { accountCode: '31100', debitPaise: 0, creditPaise: 2500000 } // ₹25,000 corpus Cr
    ]
  });

  // 4. Seed Fees Months: 2026-04
  console.log('2. Seeding fees month with cash payment, UPI payment, and reversal...');
  await db.doc(`tenant_data/${schoolId}/fees_years/2026/months/04`).set({
    transactions: [
      // Cash payment: ₹1,800 + ₹200 discount = ₹2,000 gross
      {
        id: 'txn_fee_101',
        date: '2026-04-05',
        type: 'payment',
        mode: 'Cash',
        amount: 1800,
        discount: 200,
        grossAmount: 2000,
        studentId: 'STU-1',
        allocations: [
          { feeHeadId: 'fh_tuition', feeHeadName: 'Tuition Fee', amount: 1500 },
          { feeHeadId: 'fh_transport', feeHeadName: 'Transport Fee', amount: 500 }
        ]
      },
      // UPI payment: ₹3,000 gross
      {
        id: 'txn_fee_102',
        date: '2026-04-10',
        type: 'payment',
        mode: 'UPI',
        amount: 3000,
        discount: 0,
        grossAmount: 3000,
        studentId: 'STU-2',
        allocations: [
          { feeHeadId: 'fh_tuition', feeHeadName: 'Tuition Fee', amount: 3000 }
        ]
      },
      // Fee reversal: -₹500
      {
        id: 'txn_fee_103_rev',
        date: '2026-04-12',
        type: 'payment',
        mode: 'Cash',
        isReversal: true,
        amount: -500,
        discount: 0,
        grossAmount: -500,
        studentId: 'STU-1',
        allocations: [
          { feeHeadId: 'fh_tuition', feeHeadName: 'Tuition Fee', amount: -500 }
        ]
      }
    ]
  });

  // 5. Seed accounts_expenses: 1 active, 1 cancelled
  console.log('3. Seeding expenses...');
  await db.collection(`tenant_data/${schoolId}/accounts_expenses`).doc('exp_101').set({
    expenseNo: 'EXP-2026-0001',
    date: '2026-04-15',
    financialYear: targetFY,
    categoryAccountId: '52100', // Printing & Stationery
    paidFromAccountId: '11100', // Cash
    amountPaise: 45000, // ₹450
    vendorName: 'Raju Stationery',
    status: 'active'
  });
  await db.collection(`tenant_data/${schoolId}/accounts_expenses`).doc('exp_102').set({
    expenseNo: 'EXP-2026-0002',
    date: '2026-04-16',
    financialYear: targetFY,
    categoryAccountId: '53100', // Electricity
    paidFromAccountId: '11100', // Cash
    amountPaise: 30000, // ₹300
    vendorName: 'Power Corp',
    status: 'cancelled',
    cancelReason: 'Entered wrong meter reading',
    cancelledAt: '2026-04-17T10:00:00Z'
  });

  // 6. Seed accounts_receipts: 1 other income
  console.log('4. Seeding other income receipts...');
  await db.collection(`tenant_data/${schoolId}/accounts_receipts`).doc('rcp_101').set({
    receiptNo: 'RCP-2026-0001',
    date: '2026-04-20',
    financialYear: targetFY,
    categoryAccountId: '43100', // Bank Interest
    receivedInAccountId: '11200', // Bank
    amountPaise: 80000, // ₹800
    payerName: 'SBI Bank',
    description: 'Quarterly interest credit',
    status: 'active'
  });

  // 7. Seed accounts_transfers: 1 contra transfer
  console.log('5. Seeding contra transfers...');
  await db.collection(`tenant_data/${schoolId}/accounts_transfers`).doc('trf_101').set({
    transferNo: 'TRF-2026-0001',
    date: '2026-04-22',
    financialYear: targetFY,
    fromAccountId: '11100', // Cash
    toAccountId: '11200', // Bank
    amountPaise: 100000, // ₹1,000 cash deposit into bank
    description: 'Cash deposited in SBI',
    status: 'active'
  });

  // 8. Run sync endpoint
  console.log('\n6. Calling api/accounts.js sync endpoint...');
  const { req, res, getResult } = createMockReqRes({
    idToken: `mock_test_token_${testUid}`,
    schoolId,
    action: 'sync',
    fy: targetFY
  });

  await accountsHandler(req, res);
  const syncResult = getResult();
  console.log('Sync Response Status:', syncResult.status);
  console.log('Sync Response Body:', JSON.stringify(syncResult.data, null, 2));

  assert.strictEqual(syncResult.status, 200);
  assert.strictEqual(syncResult.data.done, true);
  assert.strictEqual(syncResult.data.counts.feesPosted, 3, '3 fee vouchers posted');
  assert.strictEqual(syncResult.data.counts.expensesPosted, 3, '3 expense vouchers posted (1 active + 1 normal + 1 cancel reversal)');
  assert.strictEqual(syncResult.data.counts.receiptsPosted, 1, '1 receipt voucher posted');
  assert.strictEqual(syncResult.data.counts.transfersPosted, 1, '1 transfer voucher posted');
  assert.strictEqual(syncResult.data.counts.openingPosted, 1, '1 opening voucher posted');

  // 9. Verify Trial Balance from accounts_summary
  console.log('\n7. Verifying Trial Balance balances...');
  const summarySnap = await db.doc(`tenant_data/${schoolId}/accounts_summary/${targetFY}`).get();
  assert.ok(summarySnap.exists, 'Summary document must exist');
  const summaryData = summarySnap.data();

  // Also read opening balance lines
  const openSnap = await db.doc(`tenant_data/${schoolId}/accounts_settings/opening`).get();
  const openLines = openSnap.data().lines || [];

  let grandTotalDr = 0;
  let grandTotalCr = 0;

  // Include opening balances
  openLines.forEach(l => {
    grandTotalDr += (l.debitPaise || 0);
    grandTotalCr += (l.creditPaise || 0);
  });

  // Add all accounts Dr and Cr from monthly summary
  // Wait: opening voucher is also in accounts_summary if it posted as a voucher!
  // Let's check if opening was posted as a voucher in accounts_summary:
  // Yes: computeOpeningJournalLines creates vch_open_{fy} with date '2026-04-01' and lines.
  // In accounts_summary, those lines are already accumulated in month '2026-04'!
  // Let's verify whether accounts_summary alone balances:
  let summaryTotalDr = 0;
  let summaryTotalCr = 0;
  Object.keys(summaryData.accounts).forEach(code => {
    const months = summaryData.accounts[code];
    Object.keys(months).forEach(m => {
      summaryTotalDr += (months[m].dr || 0);
      summaryTotalCr += (months[m].cr || 0);
    });
  });

  console.log(`Summary Total Dr: ₹${(summaryTotalDr / 100).toFixed(2)} (${summaryTotalDr} paise)`);
  console.log(`Summary Total Cr: ₹${(summaryTotalCr / 100).toFixed(2)} (${summaryTotalCr} paise)`);
  assert.strictEqual(summaryTotalDr, summaryTotalCr, 'Trial Balance must balance perfectly: Total Dr == Total Cr!');
  console.log('✔ PASS: Trial Balance is balanced!');

  // 10. Verify Fee Reconciliation
  console.log('\n8. Verifying Fee Reconciliation...');
  // Net fee collections from fees module = 1800 + 3000 - 500 = 4300 (430000 paise)
  const netFeesModuleCollectionsPaise = (1800 + 3000 - 500) * 100;

  // In ledger:
  // Fee income accounts: 41100 (Tuition) Cr - Dr, 41400 (Transport) Cr - Dr
  function getNetAccountCr(code) {
    const mData = summaryData.accounts[code] || {};
    let cr = 0, dr = 0;
    Object.values(mData).forEach(m => { cr += (m.cr || 0); dr += (m.dr || 0); });
    return cr - dr;
  }
  function getNetAccountDr(code) {
    const mData = summaryData.accounts[code] || {};
    let cr = 0, dr = 0;
    Object.values(mData).forEach(m => { cr += (m.cr || 0); dr += (m.dr || 0); });
    return dr - cr;
  }

  const tuitionNetCr = getNetAccountCr('41100');
  const transportNetCr = getNetAccountCr('42100');
  const totalFeeIncomeCr = tuitionNetCr + transportNetCr;
  const discountDr = getNetAccountDr('55100');

  // Net Ledger Fees = Fee Income Cr - Discount Dr
  const netLedgerFeesPaise = totalFeeIncomeCr - discountDr;

  console.log(`Fees Module Net Collections: ₹${(netFeesModuleCollectionsPaise / 100).toFixed(2)}`);
  console.log(`Ledger Fee Income (Cr): ₹${(totalFeeIncomeCr / 100).toFixed(2)}`);
  console.log(`Ledger Discount (Dr): ₹${(discountDr / 100).toFixed(2)}`);
  console.log(`Net Ledger Fees (Income - Discount): ₹${(netLedgerFeesPaise / 100).toFixed(2)}`);

  assert.strictEqual(netLedgerFeesPaise, netFeesModuleCollectionsPaise, 'Fee reconciliation must match net collections!');
  console.log('✔ PASS: Fee reconciliation matches net collections perfectly!');

  // 11. Verify Idempotency (Run Sync Second Time)
  console.log('\n9. Testing Idempotency (second sync pass)...');
  const secondMock = createMockReqRes({
    idToken: `mock_test_token_${testUid}`,
    schoolId,
    action: 'sync',
    fy: targetFY
  });
  await accountsHandler(secondMock.req, secondMock.res);
  const secondResult = secondMock.getResult();

  assert.strictEqual(secondResult.status, 200);
  assert.strictEqual(secondResult.data.postedThisRun.fees, 0, '0 fees posted on 2nd run');
  assert.strictEqual(secondResult.data.postedThisRun.expenses, 0, '0 expenses posted on 2nd run');
  assert.strictEqual(secondResult.data.postedThisRun.receipts, 0, '0 receipts posted on 2nd run');
  assert.strictEqual(secondResult.data.postedThisRun.transfers, 0, '0 transfers posted on 2nd run');
  assert.strictEqual(secondResult.data.postedThisRun.opening, 0, '0 opening posted on 2nd run');
  console.log('✔ PASS: Second sync pass posted 0 new vouchers!');

  // Summary Dr/Cr unchanged
  const secondSummarySnap = await db.doc(`tenant_data/${schoolId}/accounts_summary/${targetFY}`).get();
  let secondSummaryTotalDr = 0;
  let secondSummaryTotalCr = 0;
  Object.keys(secondSummarySnap.data().accounts).forEach(code => {
    const months = secondSummarySnap.data().accounts[code];
    Object.keys(months).forEach(m => {
      secondSummaryTotalDr += (months[m].dr || 0);
      secondSummaryTotalCr += (months[m].cr || 0);
    });
  });
  assert.strictEqual(secondSummaryTotalDr, summaryTotalDr, 'Summary Dr unchanged');
  assert.strictEqual(secondSummaryTotalCr, summaryTotalCr, 'Summary Cr unchanged');
  console.log('✔ PASS: Summary balances are 100% idempotent!');

  // 10. Concurrency Lease (F7)
  console.log('\n10. Testing Concurrency Lease (F7)...');
  const syncStateRef = db.doc(`tenant_data/${schoolId}/accounts_sync_state/${targetFY}`);
  // Set lease active for next 15 seconds
  await syncStateRef.set({ leaseUntil: Date.now() + 15000 }, { merge: true });

  const busyMock = createMockReqRes({
    idToken: `mock_test_token_${testUid}`,
    schoolId,
    action: 'sync',
    fy: targetFY
  });
  await accountsHandler(busyMock.req, busyMock.res);
  const busyResult = busyMock.getResult();
  assert.strictEqual(busyResult.status, 200);
  assert.strictEqual(busyResult.data.busy, true, 'Sync should return busy: true when lease is active');
  console.log('✔ PASS: Concurrency lease returns busy: true when lease is held!');
  // Release lease
  await syncStateRef.set({ leaseUntil: null }, { merge: true });

  // 11. Digital Account Validation & Unsynced Month (F4, F1)
  console.log('\n11. Testing Digital Account Validation & Unsynced Month (F4, F1)...');
  const f4SchoolId = 'fake_school_f4_f1_' + runId;
  await db.collection('schools').doc(f4SchoolId).set({
    allowed_features: ['dashboard', 'fees', 'accounts']
  });
  await db.collection('school_access').doc('admin_f4').set({
    schoolId: f4SchoolId,
    role: 'admin',
    updatedAt: new Date().toISOString()
  });
  // Empty digital account
  await db.doc(`tenant_data/${f4SchoolId}/accounts_settings/main`).set({
    entityType: 'trust',
    goLiveDate: '2026-04-01',
    feeCashAccount: '11100',
    feeDigitalAccount: '', // missing
    feeHeadMapping: { 'fh_tuition': '41100' },
    hasFeeVouchers: false
  });
  // Seed UPI payment
  await db.doc(`tenant_data/${f4SchoolId}/fees_years/2026/months/04`).set({
    transactions: [
      {
        id: 'txn_f4_01',
        date: '2026-04-10',
        type: 'payment',
        mode: 'UPI',
        amount: 1000,
        grossAmount: 1000,
        studentId: 'STU-F4',
        allocations: [{ feeHeadId: 'fh_tuition', amount: 1000 }]
      }
    ]
  });

  const f4Mock1 = createMockReqRes({
    idToken: 'mock_test_token_admin_f4',
    schoolId: f4SchoolId,
    action: 'sync',
    fy: targetFY
  });
  await accountsHandler(f4Mock1.req, f4Mock1.res);
  const f4Res1 = f4Mock1.getResult();
  assert.strictEqual(f4Res1.data.postedThisRun.fees, 0, 'No fees posted when digital account missing');
  assert.ok(f4Res1.data.warningCount > 0, 'Warning recorded for missing digital account');

  // Verify month is NOT marked synced (F1)
  const f4StateSnap1 = await db.doc(`tenant_data/${f4SchoolId}/accounts_sync_state/${targetFY}`).get();
  assert.strictEqual(f4StateSnap1.data().monthDocUpdateTimes['2026-04'], undefined, 'Month must NOT be marked synced on error');

  // Now configure valid digital account
  await db.doc(`tenant_data/${f4SchoolId}/accounts_settings/main`).set({
    feeDigitalAccount: '11200'
  }, { merge: true });

  const f4Mock2 = createMockReqRes({
    idToken: 'mock_test_token_admin_f4',
    schoolId: f4SchoolId,
    action: 'sync',
    fy: targetFY
  });
  await accountsHandler(f4Mock2.req, f4Mock2.res);
  const f4Res2 = f4Mock2.getResult();
  assert.strictEqual(f4Res2.data.postedThisRun.fees, 1, 'Fee posted after configuring bank account');
  assert.strictEqual(f4Res2.data.warningCount, 0, 'Warning cleared after configuring bank account');

  const f4StateSnap2 = await db.doc(`tenant_data/${f4SchoolId}/accounts_sync_state/${targetFY}`).get();
  assert.ok(f4StateSnap2.data().monthDocUpdateTimes['2026-04'], 'Month marked synced once all transactions posted');
  console.log('✔ PASS: F4 validation and F1 unsynced month recovery verified!');

  // 12. Summary FY Follows Voucher Date (F3)
  console.log('\n12. Testing Summary FY follows voucher date (F3)...');
  await db.collection(`tenant_data/${schoolId}/accounts_expenses`).doc('exp_cross_fy').set({
    expenseNo: 'EXP-2026-0099',
    date: '2027-03-20', // FY 2026-27
    financialYear: '2026-27',
    categoryAccountId: '52100',
    paidFromAccountId: '11100',
    amountPaise: 75000,
    vendorName: 'Future Supplies',
    status: 'cancelled',
    cancelledAt: '2027-04-10T10:00:00.000Z', // Cancelled in April 2027 (FY 2027-28)!
    cancelReason: 'Returned supplies'
  });

  const f3Mock = createMockReqRes({
    idToken: `mock_test_token_${testUid}`,
    schoolId,
    action: 'sync',
    fy: targetFY
  });
  await accountsHandler(f3Mock.req, f3Mock.res);

  // Check that accounts_summary/2027-28 received the cancellation reversal posting
  const nextFySummarySnap = await db.doc(`tenant_data/${schoolId}/accounts_summary/2027-28`).get();
  assert.ok(nextFySummarySnap.exists, 'Next FY summary document must exist');
  assert.strictEqual(nextFySummarySnap.data().accounts['11100']['2027-04'].dr, 75000, 'Dr 75000 to Cash in 2027-04');
  assert.strictEqual(nextFySummarySnap.data().accounts['52100']['2027-04'].cr, 75000, 'Cr 75000 to Expense in 2027-04');
  console.log('✔ PASS: Cross-FY voucher posts to correct FY summary document (F3)!');

  // 13. Noise-Free Skipped List (F5)
  console.log('\n13. Testing Noise-Free Skipped List (F5)...');
  const f5SchoolId = 'fake_school_f5_' + runId;
  await db.collection('schools').doc(f5SchoolId).set({
    allowed_features: ['dashboard', 'fees', 'accounts']
  });
  await db.collection('school_access').doc('admin_f5').set({
    schoolId: f5SchoolId,
    role: 'admin',
    updatedAt: new Date().toISOString()
  });
  await db.doc(`tenant_data/${f5SchoolId}/accounts_settings/main`).set({
    entityType: 'trust',
    goLiveDate: '2026-04-01',
    feeCashAccount: '11100',
    feeDigitalAccount: '11200',
    feeHeadMapping: { 'fh_tuition': '41100' }
  });
  await db.doc(`tenant_data/${f5SchoolId}/fees_years/2026/months/04`).set({
    transactions: [
      { id: 'txn_f5_due', date: '2026-04-05', type: 'due', amount: 1000 },
      { id: 'txn_f5_early', date: '2026-03-25', type: 'payment', mode: 'Cash', amount: 500 },
      { id: 'txn_f5_valid', date: '2026-04-15', type: 'payment', mode: 'Cash', amount: 800, grossAmount: 800, allocations: [{ feeHeadId: 'fh_tuition', amount: 800 }] }
    ]
  });

  const f5Mock = createMockReqRes({
    idToken: 'mock_test_token_admin_f5',
    schoolId: f5SchoolId,
    action: 'sync',
    fy: targetFY
  });
  await accountsHandler(f5Mock.req, f5Mock.res);
  const f5Res = f5Mock.getResult();
  assert.strictEqual(f5Res.data.counts.feesPosted, 1);
  assert.strictEqual(f5Res.data.counts.ignoredDue, 1, 'ignoredDue count is 1');
  assert.strictEqual(f5Res.data.counts.beforeGoLive, 1, 'beforeGoLive count is 1');
  assert.strictEqual(f5Res.data.skippedCount, 0, 'Skipped list is 0 (noise-free)');
  console.log('✔ PASS: Dues and beforeGoLive counted in aggregated counts and not in skipped list (F5)!');

  // 14. Performance Benchmark: 3,000 Synthetic Fee Payments (F2)
  console.log('\n14. Running Performance Benchmark: 3,000 Synthetic Fee Transactions (F2)...');
  const benchSchoolId = 'perf_school_3000_' + runId;
  await db.collection('schools').doc(benchSchoolId).set({
    allowed_features: ['dashboard', 'fees', 'accounts']
  });
  await db.collection('school_access').doc('admin_bench').set({
    schoolId: benchSchoolId,
    role: 'admin',
    updatedAt: new Date().toISOString()
  });
  await db.doc(`tenant_data/${benchSchoolId}/accounts_settings/main`).set({
    entityType: 'trust',
    goLiveDate: '2026-04-01',
    feeCashAccount: '11100',
    feeDigitalAccount: '11200',
    feeHeadMapping: { 'fh_tuition': '41100' }
  });

  console.log('   Seeding 3,000 synthetic fee payments across 3 month documents...');
  // Seed 3 month documents (1,000 transactions each)
  const monthsToSeed = ['04', '05', '06'];
  for (let mIdx = 0; mIdx < monthsToSeed.length; mIdx++) {
    const mo = monthsToSeed[mIdx];
    const txns = [];
    for (let i = 1; i <= 1000; i++) {
      const day = String((i % 25) + 1).padStart(2, '0');
      const isUpi = (i % 2 === 0);
      txns.push({
        id: `bench_${mo}_${i}`,
        date: `2026-${mo}-${day}`,
        type: 'payment',
        mode: isUpi ? 'UPI' : 'Cash',
        amount: 1500,
        discount: 0,
        grossAmount: 1500,
        studentId: `STU-B-${i}`,
        allocations: [{ feeHeadId: 'fh_tuition', amount: 1500 }]
      });
    }
    await db.doc(`tenant_data/${benchSchoolId}/fees_years/2026/months/${mo}`).set({
      transactions: txns
    });
  }
  console.log('   Seeding complete. Executing sync client loop...');

  let benchCalls = 0;
  let benchDone = false;
  const benchStartTime = Date.now();

  while (!benchDone && benchCalls < 20) {
    benchCalls++;
    const benchMock = createMockReqRes({
      idToken: 'mock_test_token_admin_bench',
      schoolId: benchSchoolId,
      action: 'sync',
      fy: targetFY
    });
    await accountsHandler(benchMock.req, benchMock.res);
    const r = benchMock.getResult();
    assert.strictEqual(r.status, 200);
    benchDone = r.data.done;
  }

  const benchTotalTimeMs = Date.now() - benchStartTime;
  const benchSyncSnap = await db.doc(`tenant_data/${benchSchoolId}/accounts_sync_state/${targetFY}`).get();
  const benchState = benchSyncSnap.data();

  console.log(`\n   >>> BENCHMARK RESULTS <<<`);
  console.log(`   Total Fee Vouchers Posted : ${benchState.counts.feesPosted}`);
  console.log(`   Total Client Calls Needed : ${benchCalls} (target <= 15 calls)`);
  console.log(`   Total Sync Wall Time      : ${benchTotalTimeMs} ms`);
  console.log(`   Throughput                : ${(benchState.counts.feesPosted / (benchTotalTimeMs / 1000)).toFixed(1)} vouchers/sec`);
  console.log(`   Average per Voucher       : ${(benchTotalTimeMs / benchState.counts.feesPosted).toFixed(2)} ms/voucher\n`);

  assert.strictEqual(benchState.counts.feesPosted, 3000, 'All 3,000 fee transactions must be posted');
  assert.ok(benchCalls <= 15, `Client calls (${benchCalls}) must be <= 15`);
  console.log(`✔ PASS: 3,000 fee payments completed in ${benchCalls} client calls (<= 15) in ${benchTotalTimeMs} ms!`);

  // 15. Transaction Error Leaves Month Unsynced & Records Skipped (F1, F8)
  console.log('\n15. Testing Transaction Error Leaves Month Unsynced & Records Skipped (F1, F8)...');
  const errSchoolId = 'fake_school_err_' + runId;
  await db.collection('schools').doc(errSchoolId).set({
    allowed_features: ['dashboard', 'fees', 'accounts']
  });
  await db.collection('school_access').doc('admin_err').set({
    schoolId: errSchoolId,
    role: 'admin',
    updatedAt: new Date().toISOString()
  });
  await db.doc(`tenant_data/${errSchoolId}/accounts_settings/main`).set({
    entityType: 'trust',
    goLiveDate: '2026-04-01',
    feeCashAccount: '11100',
    feeDigitalAccount: '11200',
    feeHeadMapping: { 'fh_tuition': '41100' }
  });
  // 1 bad txn (allocations 1500 > gross 1000 -> F8 diff < 0), 1 good txn
  await db.doc(`tenant_data/${errSchoolId}/fees_years/2026/months/04`).set({
    transactions: [
      {
        id: 'txn_err_bad',
        date: '2026-04-10',
        type: 'payment',
        mode: 'Cash',
        amount: 1000,
        grossAmount: 1000,
        allocations: [{ feeHeadId: 'fh_tuition', amount: 1500 }]
      },
      {
        id: 'txn_err_good',
        date: '2026-04-11',
        type: 'payment',
        mode: 'Cash',
        amount: 500,
        grossAmount: 500,
        allocations: [{ feeHeadId: 'fh_tuition', amount: 500 }]
      }
    ]
  });

  const errMock = createMockReqRes({
    idToken: 'mock_test_token_admin_err',
    schoolId: errSchoolId,
    action: 'sync',
    fy: targetFY
  });
  await accountsHandler(errMock.req, errMock.res);
  const errRes = errMock.getResult();

  // Good transaction was posted
  assert.strictEqual(errRes.data.postedThisRun.fees, 1, 'Good transaction posted');
  // Bad transaction was recorded in skipped list (F8)
  assert.strictEqual(errRes.data.skippedCount, 1, 'Bad transaction recorded in skipped list');
  assert.strictEqual(errRes.data.counts.feesPosted, 1);

  // Month update time was NOT recorded because not all txns were processed cleanly (F1)
  const errSyncSnap = await db.doc(`tenant_data/${errSchoolId}/accounts_sync_state/${targetFY}`).get();
  assert.strictEqual(errSyncSnap.data().monthDocUpdateTimes['2026-04'], undefined, 'Month must NOT be marked synced when a transaction has data problem (F1)');
  console.log('✔ PASS: Data problem records in skipped list and leaves month unsynced (F1, F8)!');

  // 16. Feature-Flag Guard Test (School without 'accounts')
  console.log('\n16. Testing Feature-Flag Guard (School without accounts feature)...');
  const noAccSchoolId = 'fake_school_no_acc_' + runId;
  await db.collection('schools').doc(noAccSchoolId).set({
    allowed_features: ['dashboard', 'students', 'fees'] // missing 'accounts'!
  });
  await db.collection('school_access').doc('admin_no_acc').set({
    schoolId: noAccSchoolId,
    role: 'admin',
    updatedAt: new Date().toISOString()
  });

  const noAccMock = createMockReqRes({
    idToken: 'mock_test_token_admin_no_acc',
    schoolId: noAccSchoolId,
    action: 'sync',
    fy: targetFY
  });
  await accountsHandler(noAccMock.req, noAccMock.res);
  const noAccRes = noAccMock.getResult();

  assert.strictEqual(noAccRes.status, 403, 'Must return 403 when accounts feature is not enabled');
  assert.strictEqual(noAccRes.data.error, 'Accounts is not enabled for this school.', 'Must return exact error message');

  // Verify no accounts_* documents were created
  const stateDocSnap = await db.doc(`tenant_data/${noAccSchoolId}/accounts_sync_state/${targetFY}`).get();
  assert.strictEqual(stateDocSnap.exists, false, 'accounts_sync_state must not exist');

  const journalSnaps = await db.collection(`tenant_data/${noAccSchoolId}/accounts_journal`).get();
  assert.strictEqual(journalSnaps.size, 0, 'accounts_journal must have 0 documents');

  const sumDocSnap = await db.doc(`tenant_data/${noAccSchoolId}/accounts_summary/${targetFY}`).get();
  assert.strictEqual(sumDocSnap.exists, false, 'accounts_summary must not exist');

  console.log('✔ PASS: Feature-flag guard returned 403 and zero accounts_* documents created!');

  // 17. Settings Backfill & Aggregated Unmapped Heads (F1, F5.2)
  console.log('\n17. Testing Settings Backfill & Aggregated Unmapped Heads (F1, F5.2)...');
  const gwSchoolId = 'fake_school_greenwood_' + runId;
  await db.collection('schools').doc(gwSchoolId).set({
    allowed_features: ['accounts', 'dashboard', 'fees']
  });
  await db.collection('school_access').doc('admin_gw').set({
    schoolId: gwSchoolId,
    role: 'admin',
    updatedAt: new Date().toISOString()
  });

  // Seed Greenwood-like state: hasFeeVouchers is true, but goLiveDate and feeCashAccount are missing
  await db.doc(`tenant_data/${gwSchoolId}/accounts_settings/main`).set({
    hasFeeVouchers: true
    // no goLiveDate, no feeCashAccount, no feeDigitalAccount
  });

  // Seed fee month with 2 unmapped heads
  await db.doc(`tenant_data/${gwSchoolId}/fees_years/2026/months/04`).set({
    transactions: [
      {
        id: 'txn_unmapped_1',
        date: '2026-04-10',
        type: 'payment',
        mode: 'Cash',
        amount: 500,
        grossAmount: 500,
        allocations: [{ feeHeadId: 'fh_exam', feeHeadName: 'Exam Fee', amount: 500 }]
      },
      {
        id: 'txn_unmapped_2',
        date: '2026-04-11',
        type: 'payment',
        mode: 'Cash',
        amount: 300,
        grossAmount: 300,
        allocations: [{ feeHeadId: 'fh_sports', feeHeadName: 'Sports Fee', amount: 300 }]
      }
    ]
  });

  const gwMock = createMockReqRes({
    idToken: 'mock_test_token_admin_gw',
    schoolId: gwSchoolId,
    action: 'sync',
    fy: targetFY
  });
  await accountsHandler(gwMock.req, gwMock.res);
  const gwRes = gwMock.getResult();

  assert.strictEqual(gwRes.status, 200);

  // Check F1 backfill in Firestore
  const backfilledSettings = (await db.doc(`tenant_data/${gwSchoolId}/accounts_settings/main`).get()).data();
  assert.strictEqual(backfilledSettings.goLiveDate, '2026-04-01', 'goLiveDate must be backfilled to FY start date');
  assert.strictEqual(backfilledSettings.feeCashAccount, '11100', 'feeCashAccount must be backfilled to 11100');
  assert.strictEqual(backfilledSettings.hasFeeVouchers, true, 'hasFeeVouchers must remain true');
  console.log('✔ PASS: F1 backfilled goLiveDate and feeCashAccount for Greenwood-like state!');

  // Check F5.2 aggregated warning
  const gwSyncState = (await db.doc(`tenant_data/${gwSchoolId}/accounts_sync_state/${targetFY}`).get()).data();
  const unmappedWarning = gwSyncState.warnings.find(w => w.message && w.message.includes('not mapped'));
  assert.ok(unmappedWarning, 'Must have aggregated unmapped fee heads warning');
  assert.strictEqual(unmappedWarning.message, '2 fee heads not mapped: Exam Fee, Sports Fee');
  console.log('✔ PASS: F5.2 aggregated warning correctly reports "2 fee heads not mapped: Exam Fee, Sports Fee"!');

  // Check digital fee voucher setting hasDigitalFeeVouchers: true
  // Set feeDigitalAccount so digital vouchers can post
  await db.doc(`tenant_data/${gwSchoolId}/accounts_settings/main`).set({
    feeDigitalAccount: '11200'
  }, { merge: true });

  await db.doc(`tenant_data/${gwSchoolId}/fees_years/2026/months/05`).set({
    transactions: [
      {
        id: 'txn_digital_1',
        date: '2026-05-15',
        type: 'payment',
        mode: 'UPI',
        amount: 1000,
        grossAmount: 1000,
        allocations: [{ feeHeadId: 'fh_exam', feeHeadName: 'Exam Fee', amount: 1000 }]
      }
    ]
  });

  const gwDigitalMock = createMockReqRes({
    idToken: 'mock_test_token_admin_gw',
    schoolId: gwSchoolId,
    action: 'sync',
    fy: targetFY
  });
  await accountsHandler(gwDigitalMock.req, gwDigitalMock.res);
  const gwDigitalRes = gwDigitalMock.getResult();
  assert.strictEqual(gwDigitalRes.status, 200);

  const updatedSettings = (await db.doc(`tenant_data/${gwSchoolId}/accounts_settings/main`).get()).data();
  assert.strictEqual(updatedSettings.hasDigitalFeeVouchers, true, 'hasDigitalFeeVouchers must be set to true after digital voucher posts');
  console.log('✔ PASS: F1 set hasDigitalFeeVouchers: true after digital fee voucher posted!');

  console.log('\n========================================');
  console.log('ACCOUNTS INTEGRATION TESTS: ALL PASS');
  console.log('========================================');
}

runAccountsIntegrationTest().catch(err => {
  console.error('\n✖ Integration test failed:', err);
  process.exit(1);
});
