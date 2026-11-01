const assert = require('assert');
const {
  computeAdvanceJournalLines,
  computeStatutoryPaymentJournalLines,
  computeEmployeeLine,
  calculatePayrollRun,
  buildPayrollVoucher,
  buildPayrollReversalVoucher,
  applyVoucherToSummary
} = require('../api/accounts.js');

console.log('========================================================');
console.log('--- Unit Tests: Payroll & Statutory Posting Engine ---');
console.log('========================================================');

let passed = 0;
let failed = 0;

function it(description, fn) {
  try {
    fn();
    console.log(`  ✔ PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${description}`);
    console.error(err);
    failed++;
  }
}

// 1. Advance Posting
it('Staff advance generates correct disbursement voucher and cancellation reversal voucher', () => {
  const adv = {
    id: 'ADV001',
    date: '2026-04-10',
    financialYear: '2026-27',
    employeeId: 'staff_1',
    employeeName: 'Ramesh Kumar',
    employeeType: 'staff',
    amountPaise: 500000, // Rs 5,000
    paidFromAccountId: '11100', // Cash
    recoveryMonthlyPaise: 100000, // Rs 1,000/mo
    status: 'active'
  };

  const res = computeAdvanceJournalLines(adv, {});
  assert.strictEqual(res.normalVoucher.voucherId, 'vch_adv_ADV001');
  assert.strictEqual(res.normalVoucher.lines.length, 2);
  assert.deepStrictEqual(res.normalVoucher.lines[0], { accountId: '13100', debitPaise: 500000, creditPaise: 0 });
  assert.deepStrictEqual(res.normalVoucher.lines[1], { accountId: '11100', debitPaise: 0, creditPaise: 500000 });
  assert.strictEqual(res.cancelVoucher, null);

  // Cancellation
  const advCancelled = { ...adv, status: 'cancelled', cancelReason: 'Wrong amount entered', cancelledAt: '2026-04-11T10:00:00Z' };
  const resCx = computeAdvanceJournalLines(advCancelled, {});
  assert(resCx.cancelVoucher);
  assert.strictEqual(resCx.cancelVoucher.voucherId, 'vch_advcx_ADV001');
  assert.deepStrictEqual(resCx.cancelVoucher.lines[0], { accountId: '11100', debitPaise: 500000, creditPaise: 0 });
  assert.deepStrictEqual(resCx.cancelVoucher.lines[1], { accountId: '13100', debitPaise: 0, creditPaise: 500000 });
});

// 2. Statutory Payment Posting
it('Statutory payment generates correct payment voucher and cancellation reversal voucher', () => {
  const stat = {
    id: 'STAT001',
    date: '2026-05-15',
    financialYear: '2026-27',
    liabilityAccount: '22100', // Employee PF
    amountPaise: 240000, // Rs 2,400
    paidFromAccountId: '11200', // Primary Bank
    period: '2026-04',
    challanRef: 'EPF-CHALLAN-998877',
    status: 'active'
  };

  const res = computeStatutoryPaymentJournalLines(stat, {});
  assert.strictEqual(res.normalVoucher.voucherId, 'vch_stat_STAT001');
  assert.deepStrictEqual(res.normalVoucher.lines[0], { accountId: '22100', debitPaise: 240000, creditPaise: 0 });
  assert.deepStrictEqual(res.normalVoucher.lines[1], { accountId: '11200', debitPaise: 0, creditPaise: 240000 });
  assert.strictEqual(res.cancelVoucher, null);

  // Cancellation
  const statCancelled = { ...stat, status: 'cancelled', cancelReason: 'Bank failed payment', cancelledAt: '2026-05-16T12:00:00Z' };
  const resCx = computeStatutoryPaymentJournalLines(statCancelled, {});
  assert(resCx.cancelVoucher);
  assert.strictEqual(resCx.cancelVoucher.voucherId, 'vch_statcx_STAT001');
  assert.deepStrictEqual(resCx.cancelVoucher.lines[0], { accountId: '11200', debitPaise: 240000, creditPaise: 0 });
  assert.deepStrictEqual(resCx.cancelVoucher.lines[1], { accountId: '22100', debitPaise: 0, creditPaise: 240000 });
});

// 3. Proration with LOP
it('Proration with LOP scales earnings accurately and maintains rounding', () => {
  const profile = {
    basicPaise: 3000000, // Rs 30,000
    daPaise: 600000,     // Rs 6,000
    hraPaise: 900000,    // Rs 9,000
    customAllowances: [{ name: 'Transport', amountPaise: 300000 }], // Rs 3,000
    status: 'active',
    paymentMode: 'Bank'
  };

  // 30 days in April, 5 days LOP -> 25 payable days
  const line = computeEmployeeLine({
    employeeId: 't1',
    teacherId: 't1',
    employeeName: 'Anita Roy',
    employeeType: 'teacher',
    designation: 'Senior Teacher',
    department: 'English',
    profile,
    inputs: {},
    settings: {},
    daysInMonth: 30,
    workingDays: 26,
    paidDays: 30,
    lopAuto: 5,
    lopDays: 5,
    lopReason: '5 absent days',
    empAdvances: [],
    priorRecoveredPaise: 0,
    warnings: []
  });

  assert.strictEqual(line.grossPaise, 4800000); // Rs 48,000
  // Proration factor: 25 / 30 = 5/6
  assert.strictEqual(line.earnedBasicPaise, Math.round(3000000 * 25 / 30)); // 2500000 (Rs 25,000)
  assert.strictEqual(line.earnedDaPaise, Math.round(600000 * 25 / 30));     // 500000 (Rs 5,000)
  assert.strictEqual(line.earnedHraPaise, Math.round(900000 * 25 / 30));    // 750000 (Rs 7,500)
  assert.strictEqual(line.earnedAllowances[0].amountPaise, Math.round(300000 * 25 / 30)); // 250000 (Rs 2,500)
  assert.strictEqual(line.totalEarningsPaise, 4000000); // Rs 40,000
  assert.strictEqual(line.netPayPaise, 4000000);
});

// 4. PF Ceiling and Wage Breakdown
it('PF respects wage ceiling of Rs 15,000 and calculates employee and employer portions correctly', () => {
  const profile = {
    basicPaise: 2500000, // Rs 25,000 (exceeds 15,000 ceiling)
    daPaise: 500000,
    status: 'active',
    pfApplicable: true,
    paymentMode: 'Bank'
  };

  const settings = {
    pfEnabled: true,
    pfEmployeePct: 12,
    pfEmployerPct: 12,
    pfWageCeilingPaise: 1500000, // Rs 15,000
    pfEmployerEpsPct: 8.33,
    pfEmployerEpfPct: 3.67,
    pfAdminChargesPct: 0.5,
    pfEdliPct: 0.5,
    pfRounding: 'nearest_rupee'
  };

  const line = computeEmployeeLine({
    employeeId: 't2',
    employeeName: 'Vikram Singh',
    employeeType: 'teacher',
    designation: 'Teacher',
    department: 'Science',
    profile,
    inputs: {},
    settings,
    daysInMonth: 30,
    workingDays: 26,
    paidDays: 30,
    lopAuto: 0,
    lopDays: 0,
    lopReason: '',
    empAdvances: [],
    priorRecoveredPaise: 0,
    warnings: []
  });

  // Wage basis = 30,000 > 15,000 ceiling -> capped at 15,000
  assert.strictEqual(line.pfWagesPaise, 1500000);
  // Employee 12% on 15,000 = 1,800
  assert.strictEqual(line.employeePfPaise, 180000);
  // Employer EPS 8.33% on 15,000 = 1,249.50 -> rounded to nearest rupee = 1,250.00
  assert.strictEqual(line.employerEpsPaise, 125000);
  // Employer EPF 3.67% on 15,000 = 550.50 -> rounded to nearest rupee = 551.00 (or 550)
  assert.strictEqual(line.employerEpfPaise, 55100);
  // Admin + EDLI = 1% on 15,000 = 150.00
  assert.strictEqual(line.pfAdminChargesPaise, 15000);
  // Total Employer PF Expense
  assert.strictEqual(line.employerPfPaise, 125000 + 55100 + 15000);
});

// 5. ESI Gross Ceiling and Higher Rupee Rounding
it('ESI enforces gross wage ceiling of Rs 21,000 and rounds up to next higher rupee', () => {
  const settings = {
    esiEnabled: true,
    esiEmployeePct: 0.75,
    esiEmployerPct: 3.25,
    esiGrossCeilingPaise: 2100000,
    esiRounding: 'higher_rupee'
  };

  // Case A: Gross > 21,000 -> Not eligible for ESI
  const profileHigh = {
    basicPaise: 2200000,
    status: 'active',
    esiApplicable: true
  };
  const lineHigh = computeEmployeeLine({
    employeeId: 't3',
    employeeName: 'High Earner',
    employeeType: 'teacher',
    designation: 'Teacher',
    department: 'Math',
    profile: profileHigh,
    inputs: {},
    settings,
    daysInMonth: 30,
    workingDays: 26,
    paidDays: 30,
    lopAuto: 0,
    lopDays: 0,
    lopReason: '',
    empAdvances: [],
    priorRecoveredPaise: 0,
    warnings: []
  });
  assert.strictEqual(lineHigh.employeeEsiPaise, 0);
  assert.strictEqual(lineHigh.employerEsiPaise, 0);

  // Case B: Gross = Rs 10,433.20 (1043320 paise) -> eligible
  // Employee 0.75% of 10,433.20 = 78.249 -> ceiling next higher rupee = Rs 79.00 (7900 paise)
  // Employer 3.25% of 10,433.20 = 339.079 -> ceiling next higher rupee = Rs 340.00 (34000 paise)
  const profileLow = {
    basicPaise: 1043320,
    status: 'active',
    esiApplicable: true
  };
  const lineLow = computeEmployeeLine({
    employeeId: 's1',
    employeeName: 'Suresh Lab Asst',
    employeeType: 'staff',
    designation: 'Lab Assistant',
    department: 'Science',
    profile: profileLow,
    inputs: {},
    settings,
    daysInMonth: 30,
    workingDays: 26,
    paidDays: 30,
    lopAuto: 0,
    lopDays: 0,
    lopReason: '',
    empAdvances: [],
    priorRecoveredPaise: 0,
    warnings: []
  });
  assert.strictEqual(lineLow.employeeEsiPaise, 7900); // Rounded up to Rs 79
  assert.strictEqual(lineLow.employerEsiPaise, 34000); // Rounded up to Rs 340
});

// 6. Professional Tax Slabs (Jharkhand)
it('PT accurately applies Jharkhand slab rates based on monthly earned gross', () => {
  const settings = {
    ptEnabled: true,
    ptState: 'Jharkhand',
    ptSlabs: [
      { minMonthlyGrossPaise: 0, maxMonthlyGrossPaise: 2500000, ptPaise: 0 },
      { minMonthlyGrossPaise: 2500001, maxMonthlyGrossPaise: 4166600, ptPaise: 10000 }, // Rs 100
      { minMonthlyGrossPaise: 4166601, maxMonthlyGrossPaise: 6666600, ptPaise: 15000 }, // Rs 150
      { minMonthlyGrossPaise: 6666601, maxMonthlyGrossPaise: 8333300, ptPaise: 17500 }, // Rs 175
      { minMonthlyGrossPaise: 8333301, maxMonthlyGrossPaise: null, ptPaise: 20800 }      // Rs 208
    ]
  };

  const testSlab = (grossPaise, expectedPtPaise) => {
    const line = computeEmployeeLine({
      employeeId: 'test_pt',
      employeeName: 'Test PT',
      employeeType: 'teacher',
      designation: 'Teacher',
      department: 'General',
      profile: { basicPaise: grossPaise, status: 'active', ptApplicable: true },
      inputs: {},
      settings,
      daysInMonth: 30,
      workingDays: 26,
      paidDays: 30,
      lopAuto: 0,
      lopDays: 0,
      lopReason: '',
      empAdvances: [],
      priorRecoveredPaise: 0,
      warnings: []
    });
    assert.strictEqual(line.ptPaise, expectedPtPaise);
  };

  testSlab(2000000, 0);     // Rs 20,000 -> Rs 0
  testSlab(3000000, 10000); // Rs 30,000 -> Rs 100
  testSlab(5000000, 15000); // Rs 50,000 -> Rs 150
  testSlab(7500000, 17500); // Rs 75,000 -> Rs 175
  testSlab(9000000, 20800); // Rs 90,000 -> Rs 208
});

// 7. Advance Recovery Cap
it('Advance recovery never exceeds outstanding advance amount and flags when capped', () => {
  const empAdvances = [
    { id: 'ADV01', amountPaise: 300000, recoveryMonthlyPaise: 150000, status: 'active' } // Rs 3,000 total advance
  ];
  // Already recovered Rs 2,000 in previous months -> outstanding is only Rs 1,000 (100000 paise)
  const priorRecoveredPaise = 200000;

  const line = computeEmployeeLine({
    employeeId: 's2',
    employeeName: 'Mohan Driver',
    employeeType: 'staff',
    designation: 'Driver',
    department: 'Transport',
    profile: { basicPaise: 1500000, status: 'active' },
    inputs: {},
    settings: {},
    daysInMonth: 30,
    workingDays: 26,
    paidDays: 30,
    lopAuto: 0,
    lopDays: 0,
    lopReason: '',
    empAdvances,
    priorRecoveredPaise,
    warnings: []
  });

  // Planned was 150,000, but capped at remaining 100,000
  assert.strictEqual(line.advanceRecoveryPaise, 100000);
  assert(line.flags.includes('ADVANCE_RECOVERY_CAPPED'));
});

// 8. Negative Net Pay Flagged
it('Negative net pay does not crash or silently post; line is flagged with warning', () => {
  const profile = {
    basicPaise: 1000000, // Rs 10,000
    fixedDeductions: [{ name: 'Heavy Loan', amountPaise: 1500000 }], // Rs 15,000 deduction
    status: 'active'
  };

  const warnings = [];
  const line = computeEmployeeLine({
    employeeId: 't9',
    employeeName: 'Overburdened Staff',
    employeeType: 'staff',
    designation: 'Clerk',
    department: 'Office',
    profile,
    inputs: {},
    settings: {},
    daysInMonth: 30,
    workingDays: 26,
    paidDays: 30,
    lopAuto: 0,
    lopDays: 0,
    lopReason: '',
    empAdvances: [],
    priorRecoveredPaise: 0,
    warnings
  });

  assert.strictEqual(line.netPayPaise, -500000); // -Rs 5,000
  assert(line.flags.includes('NEGATIVE_NET_PAY'));
  assert(warnings.some(w => w.includes('Negative net pay')));
});

// 9. Teacher vs Staff Expense Split & Balanced Voucher
it('Payroll voucher correctly separates Teacher (51100) vs Staff (51200) and is balanced to the exact paisa', () => {
  const teachersList = [
    { id: 't1', firstName: 'Pooja', lastName: 'Verma', status: 'Active', designation: 'Maths Teacher', subject: 'Maths' },
    { id: 't2', firstName: 'Rajesh', lastName: 'Sharma', status: 'Active', designation: 'Physics Teacher', subject: 'Physics' }
  ];
  const staffList = [
    { id: 's1', name: 'Mahesh Guard', status: 'Active', designation: 'Security Guard', department: 'Security' }
  ];

  const profilesMap = {
    t1: { basicPaise: 3000000, daPaise: 500000, status: 'active', paymentMode: 'Bank', pfApplicable: true },
    t2: { basicPaise: 4000000, daPaise: 600000, status: 'active', paymentMode: 'Bank', pfApplicable: true },
    s1: { basicPaise: 1500000, status: 'active', paymentMode: 'Cash' }
  };

  const settings = {
    pfEnabled: true,
    pfEmployeePct: 12,
    pfEmployerPct: 12,
    pfWageCeilingPaise: 1500000,
    salaryExpenseAccounts: { teacher: '51100', staff: '51200' }
  };

  const run = calculatePayrollRun({
    month: '2026-04',
    teachersList,
    staffList,
    profilesMap,
    inputsDoc: {
      employees: {
        t1: { lopDaysOverride: 0 },
        t2: { lopDaysOverride: 0 }
      }
    },
    settings,
    teacherAttendance: [],
    attendanceRequests: [],
    advancesList: [],
    paidPayslips: []
  });

  assert.strictEqual(run.lines.length, 3);
  assert.strictEqual(run.totals.teacherGrossPaise, 3500000 + 4600000); // 8100000
  assert.strictEqual(run.totals.staffGrossPaise, 1500000);

  const voucher = buildPayrollVoucher('2026-04', run.lines, run.totals, settings, {
    bankAccount: '11200',
    cashAccount: '11100',
    paidDate: '2026-04-30'
  });

  // Check Debits == Credits
  let totalDebit = 0;
  let totalCredit = 0;
  voucher.lines.forEach(l => {
    totalDebit += l.debitPaise;
    totalCredit += l.creditPaise;
  });

  assert.strictEqual(totalDebit, totalCredit);
  assert(totalDebit > 0);

  // Check 51100 and 51200 lines
  const tExpLine = voucher.lines.find(l => l.accountId === '51100');
  const sExpLine = voucher.lines.find(l => l.accountId === '51200');
  assert.strictEqual(tExpLine.debitPaise, 8100000);
  assert.strictEqual(sExpLine.debitPaise, 1500000);

  // Check Bank vs Cash Net Pay
  const bankLine = voucher.lines.find(l => l.accountId === '11200');
  const cashLine = voucher.lines.find(l => l.accountId === '11100');
  assert.strictEqual(bankLine.creditPaise, run.totals.netBankPaise);
  assert.strictEqual(cashLine.creditPaise, run.totals.netCashPaise);
  assert.strictEqual(cashLine.creditPaise, 1500000);
});

// 10. Reversal Voucher Nets Summary to Zero
it('Payroll reversal voucher flips debits and credits and nets accounts_summary to exact zero', () => {
  const teachersList = [
    { id: 't1', firstName: 'Pooja', lastName: 'Verma', status: 'Active', designation: 'Teacher', subject: 'Maths' }
  ];
  const profilesMap = {
    t1: { basicPaise: 3000000, status: 'active', paymentMode: 'Bank', pfApplicable: true }
  };
  const settings = {
    pfEnabled: true,
    pfEmployeePct: 12,
    pfEmployerPct: 12,
    pfWageCeilingPaise: 1500000
  };

  const run = calculatePayrollRun({
    month: '2026-04',
    teachersList,
    profilesMap,
    settings
  });

  const payVoucher = buildPayrollVoucher('2026-04', run.lines, run.totals, settings, {
    bankAccount: '11200',
    cashAccount: '11100'
  });

  const revVoucher = buildPayrollReversalVoucher('2026-04', payVoucher, 'Mistake in calculation');

  // Verify lines are flipped
  assert.strictEqual(payVoucher.lines.length, revVoucher.lines.length);
  for (let i = 0; i < payVoucher.lines.length; i++) {
    const pl = payVoucher.lines[i];
    const rl = revVoucher.lines[i];
    assert.strictEqual(pl.accountId, rl.accountId);
    assert.strictEqual(pl.debitPaise, rl.creditPaise);
    assert.strictEqual(pl.creditPaise, rl.debitPaise);
  }

  // Apply both to accounts_summary
  const summaryAccounts = {};
  applyVoucherToSummary(summaryAccounts, payVoucher);
  // Summary now has non-zero balances
  Object.keys(summaryAccounts).forEach(code => {
    assert(summaryAccounts[code].debitPaise > 0 || summaryAccounts[code].creditPaise > 0);
  });

  applyVoucherToSummary(summaryAccounts, revVoucher);
  // After applying reversal, every account's total debit must equal total credit!
  Object.keys(summaryAccounts).forEach(code => {
    assert.strictEqual(summaryAccounts[code].debitPaise, summaryAccounts[code].creditPaise,
      `Account ${code} did not net to zero: Dr ${summaryAccounts[code].debitPaise} vs Cr ${summaryAccounts[code].creditPaise}`);
  });
});

// 11. Automated Attendance LOP calculation from punches and approved regularizations
it('Automated teacher attendance calculates LOP based on working days, punches, and approved regularizations', () => {
  const teachersList = [
    { id: 't1', firstName: 'Pooja', lastName: 'Verma', status: 'Active', designation: 'Teacher', subject: 'Maths' }
  ];
  const profilesMap = {
    t1: { basicPaise: 3000000, status: 'active', paymentMode: 'Bank' }
  };

  // Month: 2026-04 has 30 days, 26 working days (Sundays: 5, 12, 19, 26)
  // Let teacher have punches on all working days except day 25 (approved req) and day 30 (unexcused absent)
  const teacherAttendance = [];
  for (let d = 1; d <= 29; d++) {
    if (d === 25) continue; // Will be covered by approved regularization
    const dateObj = new Date(2026, 3, d);
    if (dateObj.getDay() !== 0) {
      teacherAttendance.push({
        teacherId: 't1',
        date: `2026-04-${String(d).padStart(2, '0')}`,
        type: 'in'
      });
    }
  }

  // 1 approved regularization for day 25 (Saturday)
  const attendanceRequests = [
    {
      teacherId: 't1',
      date: '2026-04-25',
      status: 'Approved'
    }
  ];

  // Day 30 (Thursday) is unexcused absent -> exactly 1 LOP day!
  const run = calculatePayrollRun({
    month: '2026-04',
    teachersList,
    profilesMap,
    settings: { paidDaysBasis: 'calendar' },
    teacherAttendance,
    attendanceRequests
  });

  const line = run.lines[0];
  assert.strictEqual(line.workingDays, 26);
  assert.strictEqual(line.paidDays, 30);
  assert.strictEqual(line.lopAuto, 1);
  assert.strictEqual(line.lopDays, 1);
  assert.strictEqual(line.payableDays, 29);
  assert.strictEqual(line.earnedBasicPaise, Math.round(3000000 * 29 / 30));
});

console.log('========================================================');
console.log(`SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log('========================================================');
if (failed > 0) process.exit(1);
