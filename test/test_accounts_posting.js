'use strict';

/**
 * test/test_accounts_posting.js
 *
 * Unit tests for the accounts posting engine pure functions in api/accounts.js:
 * 1. Fee payment with discount and two allocations (balanced, correct accounts)
 * 2. Fee reversal voucher (mirror image; combined payment + reversal nets to zero)
 * 3. Fee allocations mismatch (difference credited to default income account 41100 + warning)
 * 4. Fee goLiveDate filter (records before goLiveDate are skipped)
 * 5. Expense normal voucher (Dr category, Cr paidFrom)
 * 6. Expense cancellation voucher (reversal: Dr paidFrom, Cr category)
 * 7. Receipt normal voucher (Dr receivedIn, Cr category)
 * 8. Receipt cancellation voucher (reversal: Dr category, Cr receivedIn)
 * 9. Transfer normal contra voucher (Dr toAccount, Cr fromAccount)
 * 10. Transfer cancellation voucher (reversal: Dr fromAccount, Cr toAccount)
 * 11. Opening balances voucher (balanced lines -> valid voucher; unbalanced -> throws)
 * 12. applyVoucherToSummary accumulation & summary totals equal sum of journal lines
 * 13. Idempotent posting simulation (two sync passes produce zero duplicate lines)
 */

const assert = require('assert');
const {
  getFinancialYear,
  computeFeeJournalLines,
  computeExpenseJournalLines,
  computeReceiptJournalLines,
  computeTransferJournalLines,
  computeOpeningJournalLines,
  applyVoucherToSummary
} = require('../api/accounts.js');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('========================================================');
console.log('--- Unit Tests: Accounts Posting Engine (Pure) ---');
console.log('========================================================\n');

// 1. Fee payment with discount and two allocations
runTest('Fee payment with discount and 2 allocations balances and maps correctly', () => {
  const settings = {
    goLiveDate: '2026-04-01',
    feeCashAccount: '11100',
    feeDigitalAccount: '11200',
    feeHeadMapping: {
      'head_tuition': '41100',
      'head_annual': '41200'
    }
  };

  const txn = {
    id: 'txn_001',
    date: '2026-05-10',
    type: 'payment',
    mode: 'Cash',
    amount: 900,
    discount: 100,
    grossAmount: 1000,
    studentId: 'STU-101',
    allocations: [
      { feeHeadId: 'head_tuition', feeHeadName: 'Tuition Fee', amount: 700 },
      { feeHeadId: 'head_annual', feeHeadName: 'Annual Fee', amount: 300 }
    ]
  };

  const vch = computeFeeJournalLines(txn, settings);
  assert.ok(vch, 'Voucher should be generated');
  assert.strictEqual(vch.voucherId, 'vch_fee_txn_001');
  assert.strictEqual(vch.type, 'receipt');
  assert.strictEqual(vch.fy, '2026-27');

  // Verify Lines
  // Dr 11100: 90000p
  // Dr 55100: 10000p
  // Cr 41100: 70000p
  // Cr 41200: 30000p
  const drLines = vch.lines.filter(l => l.drPaise > 0);
  const crLines = vch.lines.filter(l => l.crPaise > 0);

  const totalDr = drLines.reduce((s, l) => s + l.drPaise, 0);
  const totalCr = crLines.reduce((s, l) => s + l.crPaise, 0);
  assert.strictEqual(totalDr, 100000, 'Total Dr should be 100000 paise');
  assert.strictEqual(totalCr, 100000, 'Total Cr should be 100000 paise');
  assert.strictEqual(totalDr, totalCr, 'Voucher must balance');

  const cashLine = vch.lines.find(l => l.accountCode === '11100');
  assert.ok(cashLine && cashLine.drPaise === 90000, 'Cash line Dr 90000 paise');

  const discLine = vch.lines.find(l => l.accountCode === '55100');
  assert.ok(discLine && discLine.drPaise === 10000, 'Discount line Dr 10000 paise');

  const tLine = vch.lines.find(l => l.accountCode === '41100');
  assert.ok(tLine && tLine.crPaise === 70000, 'Tuition line Cr 70000 paise');

  const aLine = vch.lines.find(l => l.accountCode === '41200');
  assert.ok(aLine && aLine.crPaise === 30000, 'Annual fee line Cr 30000 paise');
});

// 2. Reversal nets to zero
runTest('Fee reversal mirrors payment and combined effect nets to zero', () => {
  const settings = {
    goLiveDate: '2026-04-01',
    feeCashAccount: '11100',
    feeDigitalAccount: '11200',
    feeHeadMapping: {
      'head_tuition': '41100'
    }
  };

  const paymentTxn = {
    id: 'txn_002',
    date: '2026-05-15',
    type: 'payment',
    mode: 'UPI',
    amount: 1500,
    discount: 0,
    grossAmount: 1500,
    studentId: 'STU-102',
    allocations: [{ feeHeadId: 'head_tuition', feeHeadName: 'Tuition Fee', amount: 1500 }]
  };

  const reversalTxn = {
    id: 'txn_002_rev',
    originalTxnId: 'txn_002',
    date: '2026-05-16',
    type: 'payment',
    mode: 'UPI',
    isReversal: true,
    amount: -1500,
    discount: 0,
    grossAmount: -1500,
    studentId: 'STU-102',
    allocations: [{ feeHeadId: 'head_tuition', feeHeadName: 'Tuition Fee', amount: -1500 }]
  };

  const payVch = computeFeeJournalLines(paymentTxn, settings);
  const revVch = computeFeeJournalLines(reversalTxn, settings);

  assert.ok(payVch && revVch);
  assert.strictEqual(revVch.voucherId, 'vch_fee_txn_002_rev');

  // Net balance map
  const netBalances = {};
  function addLines(lines) {
    lines.forEach(l => {
      netBalances[l.accountCode] = (netBalances[l.accountCode] || 0) + (l.drPaise || 0) - (l.crPaise || 0);
    });
  }
  addLines(payVch.lines);
  addLines(revVch.lines);

  // Both accounts must net exactly to 0
  assert.strictEqual(netBalances['11200'], 0, 'Bank account 11200 nets to 0');
  assert.strictEqual(netBalances['41100'], 0, 'Income account 41100 nets to 0');
});

// 3. Allocations mismatch -> default account 41100 + warning
runTest('Fee allocations mismatch credits difference to default income account 41100 with warning', () => {
  const settings = {
    feeCashAccount: '11100',
    feeHeadMapping: { 'head_tuition': '41100' }
  };

  const txn = {
    id: 'txn_003',
    date: '2026-06-01',
    type: 'payment',
    mode: 'Cash',
    amount: 1000,
    discount: 0,
    grossAmount: 1000,
    allocations: [
      { feeHeadId: 'head_tuition', amount: 800 } // 200 missing
    ]
  };

  const vch = computeFeeJournalLines(txn, settings);
  assert.ok(vch);
  assert.ok(vch.warnings.length > 0, 'Should have warning about allocations mismatch');

  const totalDr = vch.lines.reduce((s, l) => s + l.drPaise, 0);
  const totalCr = vch.lines.reduce((s, l) => s + l.crPaise, 0);
  assert.strictEqual(totalDr, 100000);
  assert.strictEqual(totalCr, 100000);
  assert.strictEqual(totalDr, totalCr, 'Must remain balanced');

  const crTuition = vch.lines.filter(l => l.accountCode === '41100').reduce((s, l) => s + l.crPaise, 0);
  assert.strictEqual(crTuition, 100000, 'Default account 41100 gets 80000p + 20000p diff = 100000p');
});

// 4. goLiveDate filter (F5: ignored record before goLiveDate)
runTest('Fee transaction before goLiveDate is ignored without cluttering skipped list (F5)', () => {
  const settings = { goLiveDate: '2026-04-01' };
  const txn = { id: 'txn_004', date: '2026-03-31', type: 'payment', amount: 500 };
  const res = computeFeeJournalLines(txn, settings);
  assert.ok(res && res.ignored === true && res.ignoreType === 'beforeGoLive', 'Should be ignored (beforeGoLive)');
});

// 4b. Non-payment 'due' transaction filter (F5)
runTest('Non-payment due transaction is ignored without cluttering skipped list (F5)', () => {
  const settings = { goLiveDate: '2026-04-01' };
  const txn = { id: 'txn_004b', date: '2026-04-10', type: 'due', amount: 500 };
  const res = computeFeeJournalLines(txn, settings);
  assert.ok(res && res.ignored === true && res.ignoreType === 'ignoredDue', 'Should be ignored (ignoredDue)');
});

// 4c. Fee digital account validation (F4)
runTest('Fee payment via UPI without configured digital account returns config error (F4)', () => {
  const settings = {
    goLiveDate: '2026-04-01',
    feeCashAccount: '11100',
    feeDigitalAccount: '' // missing
  };
  const txn = { id: 'txn_004c', date: '2026-04-10', type: 'payment', mode: 'UPI', amount: 500 };
  const res = computeFeeJournalLines(txn, settings);
  assert.ok(res && res.error === true && res.configError === true && res.warningKey === 'MISSING_DIGITAL_ACCOUNT');
});

// 4d. Negative allocation difference (F8)
runTest('Fee allocations exceeding gross amount is flagged as data problem and not posted (F8)', () => {
  const settings = {
    goLiveDate: '2026-04-01',
    feeCashAccount: '11100',
    feeDigitalAccount: '11200',
    feeHeadMapping: { 'head_tuition': '41100' }
  };
  const txn = {
    id: 'txn_004d',
    date: '2026-04-10',
    type: 'payment',
    mode: 'Cash',
    amount: 1000,
    discount: 0,
    grossAmount: 1000,
    allocations: [
      { feeHeadId: 'head_tuition', amount: 1200 } // 1200 > 1000 => allocPaiseSum > grossPaise (diff < 0)
    ]
  };
  const res = computeFeeJournalLines(txn, settings);
  assert.ok(res && res.isDataProblem === true, 'Allocations exceeding gross amount must be marked as data problem');
});

// 5. Expense normal & cancel reversal
runTest('Expense generates correct normal payment voucher and cancellation reversal voucher', () => {
  const settings = { goLiveDate: '2026-04-01' };
  const expense = {
    id: 'exp_001',
    expenseNo: 'EXP-2026-0001',
    date: '2026-04-15',
    financialYear: '2026-27',
    categoryAccountId: '52100', // Printing & Stationery
    paidFromAccountId: '11110', // Petty Cash
    amountPaise: 45000, // ₹450
    vendorName: 'Raju Stationery',
    description: 'Registers and markers',
    status: 'cancelled',
    cancelledAt: '2026-04-16T10:00:00.000Z',
    cancelReason: 'Duplicate entry'
  };

  const res = computeExpenseJournalLines(expense, settings);
  assert.ok(res && res.normalVoucher && res.cancelVoucher);

  // Normal: Dr 52100 = 45000, Cr 11110 = 45000
  const norm = res.normalVoucher;
  assert.strictEqual(norm.voucherId, 'vch_exp_exp_001');
  assert.strictEqual(norm.type, 'payment');
  assert.deepStrictEqual(norm.lines, [
    { accountCode: '52100', drPaise: 45000, crPaise: 0 },
    { accountCode: '11110', drPaise: 0, crPaise: 45000 }
  ]);

  // Cancel: Dr 11110 = 45000, Cr 52100 = 45000
  const cx = res.cancelVoucher;
  assert.strictEqual(cx.voucherId, 'vch_expcx_exp_001');
  assert.strictEqual(cx.type, 'journal');
  assert.strictEqual(cx.date, '2026-04-16');
  assert.deepStrictEqual(cx.lines, [
    { accountCode: '11110', drPaise: 45000, crPaise: 0 },
    { accountCode: '52100', drPaise: 0, crPaise: 45000 }
  ]);
});

// 6. Receipt normal & cancel reversal
runTest('Receipt generates correct normal receipt voucher and cancellation reversal voucher', () => {
  const settings = { goLiveDate: '2026-04-01' };
  const receipt = {
    id: 'rcp_001',
    receiptNo: 'RCP-2026-0001',
    date: '2026-04-20',
    financialYear: '2026-27',
    categoryAccountId: '43100', // Bank Interest
    receivedInAccountId: '11120', // Bank Ledger
    amountPaise: 125000, // ₹1,250
    payerName: 'SBI Bank',
    description: 'Q1 Savings Interest',
    status: 'cancelled',
    cancelledAt: '2026-04-21T11:00:00.000Z',
    cancelReason: 'Wrong interest entry'
  };

  const res = computeReceiptJournalLines(receipt, settings);
  assert.ok(res && res.normalVoucher && res.cancelVoucher);

  const norm = res.normalVoucher;
  assert.strictEqual(norm.voucherId, 'vch_rcp_rcp_001');
  assert.strictEqual(norm.type, 'receipt');
  assert.deepStrictEqual(norm.lines, [
    { accountCode: '11120', drPaise: 125000, crPaise: 0 },
    { accountCode: '43100', drPaise: 0, crPaise: 125000 }
  ]);

  const cx = res.cancelVoucher;
  assert.strictEqual(cx.voucherId, 'vch_rcpcx_rcp_001');
  assert.deepStrictEqual(cx.lines, [
    { accountCode: '43100', drPaise: 125000, crPaise: 0 },
    { accountCode: '11120', drPaise: 0, crPaise: 125000 }
  ]);
});

// 7. Transfer contra & cancel reversal
runTest('Contra transfer generates correct contra voucher and cancellation reversal voucher', () => {
  const settings = { goLiveDate: '2026-04-01' };
  const transfer = {
    id: 'trf_001',
    transferNo: 'TRF-2026-0001',
    date: '2026-04-25',
    financialYear: '2026-27',
    fromAccountId: '11100', // Cash in hand
    toAccountId: '11120', // SBI Bank
    amountPaise: 2500000, // ₹25,000 cash deposit into bank
    description: 'Cash deposited in bank',
    status: 'cancelled',
    cancelledAt: '2026-04-26T12:00:00.000Z',
    cancelReason: 'Bounced deposit slip'
  };

  const res = computeTransferJournalLines(transfer, settings);
  assert.ok(res && res.normalVoucher && res.cancelVoucher);

  // Normal: Dr 11120 (bank), Cr 11100 (cash)
  const norm = res.normalVoucher;
  assert.strictEqual(norm.voucherId, 'vch_trf_trf_001');
  assert.strictEqual(norm.type, 'contra');
  assert.deepStrictEqual(norm.lines, [
    { accountCode: '11120', drPaise: 2500000, crPaise: 0 },
    { accountCode: '11100', drPaise: 0, crPaise: 2500000 }
  ]);

  // Cancel: Dr 11100 (cash), Cr 11120 (bank)
  const cx = res.cancelVoucher;
  assert.strictEqual(cx.voucherId, 'vch_trfcx_trf_001');
  assert.strictEqual(cx.type, 'contra');
  assert.deepStrictEqual(cx.lines, [
    { accountCode: '11100', drPaise: 2500000, crPaise: 0 },
    { accountCode: '11120', drPaise: 0, crPaise: 2500000 }
  ]);
});

// 8. Opening voucher balance enforcement
runTest('Opening voucher throws if unbalanced and creates opening voucher if balanced and locked', () => {
  const unbalanced = {
    fy: '2026-27',
    status: 'locked',
    lines: [
      { accountCode: '11100', debitPaise: 50000, creditPaise: 0 },
      { accountCode: '31100', debitPaise: 0, creditPaise: 40000 } // mismatch
    ]
  };

  assert.throws(() => {
    computeOpeningJournalLines(unbalanced);
  }, /Unbalanced opening voucher/);

  const balanced = {
    fy: '2026-27',
    date: '2026-04-01',
    status: 'locked',
    lines: [
      { accountCode: '11100', debitPaise: 50000, creditPaise: 0 },
      { accountCode: '31100', debitPaise: 0, creditPaise: 50000 }
    ]
  };

  const vch = computeOpeningJournalLines(balanced);
  assert.ok(vch);
  assert.strictEqual(vch.voucherId, 'vch_open_2026-27');
  assert.strictEqual(vch.type, 'opening');
  assert.strictEqual(vch.lines.length, 2);
});

// 9. Summary accumulation & journal line integrity
runTest('applyVoucherToSummary matches journal lines across multiple accounts and months', () => {
  const summaryAccounts = {};
  const v1 = {
    date: '2026-04-10',
    lines: [
      { accountCode: '11100', drPaise: 10000, crPaise: 0 },
      { accountCode: '41100', drPaise: 0, crPaise: 10000 }
    ]
  };
  const v2 = {
    date: '2026-04-20',
    lines: [
      { accountCode: '52100', drPaise: 4000, crPaise: 0 },
      { accountCode: '11100', drPaise: 0, crPaise: 4000 }
    ]
  };
  const v3 = {
    date: '2026-05-05',
    lines: [
      { accountCode: '11100', drPaise: 20000, crPaise: 0 },
      { accountCode: '41100', drPaise: 0, crPaise: 20000 }
    ]
  };

  applyVoucherToSummary(summaryAccounts, v1);
  applyVoucherToSummary(summaryAccounts, v2);
  applyVoucherToSummary(summaryAccounts, v3);

  // Check 11100
  assert.strictEqual(summaryAccounts['11100']['2026-04'].dr, 10000);
  assert.strictEqual(summaryAccounts['11100']['2026-04'].cr, 4000);
  assert.strictEqual(summaryAccounts['11100']['2026-05'].dr, 20000);
  assert.strictEqual(summaryAccounts['11100']['2026-05'].cr, 0);

  // Check 41100
  assert.strictEqual(summaryAccounts['41100']['2026-04'].cr, 10000);
  assert.strictEqual(summaryAccounts['41100']['2026-05'].cr, 20000);

  // Check 52100
  assert.strictEqual(summaryAccounts['52100']['2026-04'].dr, 4000);
});

// 10. Idempotency test
runTest('Idempotency: Processing same vouchers twice creates zero duplicate lines', () => {
  const existingVoucherIds = new Set();
  const summaryAccounts = {};

  const vouchers = [
    { voucherId: 'vch_fee_101', date: '2026-04-10', lines: [{ accountCode: '11100', drPaise: 500, crPaise: 0 }, { accountCode: '41100', drPaise: 0, crPaise: 500 }] },
    { voucherId: 'vch_exp_201', date: '2026-04-11', lines: [{ accountCode: '52100', drPaise: 300, crPaise: 0 }, { accountCode: '11100', drPaise: 0, crPaise: 300 }] }
  ];

  function syncPass() {
    let newPosted = 0;
    for (const v of vouchers) {
      if (existingVoucherIds.has(v.voucherId)) {
        continue;
      }
      existingVoucherIds.add(v.voucherId);
      applyVoucherToSummary(summaryAccounts, v);
      newPosted++;
    }
    return newPosted;
  }

  const pass1 = syncPass();
  assert.strictEqual(pass1, 2, 'First pass posts 2 vouchers');

  const pass2 = syncPass();
  assert.strictEqual(pass2, 0, 'Second pass posts 0 new vouchers');

  // Summary totals remain exactly unchanged
  assert.strictEqual(summaryAccounts['11100']['2026-04'].dr, 500);
  assert.strictEqual(summaryAccounts['11100']['2026-04'].cr, 300);
});

console.log('\n========================================');
console.log(`POSTING ENGINE UNIT TESTS: ${passedTests}/${totalTests} PASS`);
console.log('========================================');
if (passedTests !== totalTests) {
  process.exit(1);
}
