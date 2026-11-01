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

const schoolId = 'fake_school_slice2_test';
const testUid = 'test_admin_uid_s2';
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

  // 1. Seed School Admin Access
  console.log('1. Seeding school access & settings...');
  await db.collection('school_access').doc(testUid).set({
    schoolId,
    role: 'admin',
    updatedAt: new Date().toISOString()
  });

  // 2. Seed accounts_settings/main
  await db.doc(`tenant_data/${schoolId}/accounts_settings/main`).set({
    entityType: 'trust',
    financialYearStart: '2026-04-01',
    goLiveDate: '2026-04-01',
    feeCashAccount: '11100',
    feeDigitalAccount: '11120',
    feeHeadMapping: {
      'fh_tuition': '41100',
      'fh_transport': '41400'
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
      { accountCode: '11120', debitPaise: 2000000, creditPaise: 0 }, // ₹20,000 bank Dr
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
    receivedInAccountId: '11120', // Bank
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
    toAccountId: '11120', // Bank
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
  const transportNetCr = getNetAccountCr('41400');
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

  console.log('\n========================================');
  console.log('ACCOUNTS INTEGRATION TESTS: ALL PASS');
  console.log('========================================');
}

runAccountsIntegrationTest().catch(err => {
  console.error('\n✖ Integration test failed:', err);
  process.exit(1);
});
