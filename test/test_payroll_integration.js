process.env.NODE_ENV = 'test';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';

const assert = require('assert');
const admin = require('firebase-admin');
const handler = require('../api/accounts.js');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'ctrl-shift-solutions' });
}
const db = admin.firestore();

const schoolId = 'school_payroll_test';
const adminUid = 'admin_payroll_1';
const mockIdToken = 'mock_test_token_' + adminUid;

function mockReq(body) {
  return {
    method: 'POST',
    headers: {
      authorization: `Bearer ${mockIdToken}`,
      'content-type': 'application/json'
    },
    body: {
      idToken: mockIdToken,
      schoolId,
      ...body
    },
    query: {}
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(c) { res.statusCode = c; return res; },
    json(data) { res.body = data; return res; },
    setHeader(k, v) { res.headers[k] = v; return res; },
    end(str) { if (str && !res.body) { try { res.body = JSON.parse(str); } catch(e) { res.body = str; } } return res; }
  };
  return res;
}

async function run() {
  console.log('========================================================');
  console.log('--- Emulator Integration Test: Payroll & Statutory Actions ---');
  console.log('========================================================');

  console.log('0. Cleaning up prior test state...');
  await db.doc(`tenant_data/${schoolId}/accounts_summary/2026-27`).delete().catch(() => {});
  await db.doc(`tenant_data/${schoolId}/accounts_sync_state/main`).delete().catch(() => {});
  const cleanupCols = ['accounts_journal', 'payroll_runs', 'payroll_payslips', 'accounts_advances', 'accounts_statutory_payments'];
  for (const col of cleanupCols) {
    const snaps = await db.collection(`tenant_data/${schoolId}/${col}`).get();
    for (const d of snaps.docs) await d.ref.delete();
  }

  // 1. Setup school access and accounts allowed_features
  console.log('1. Setting up school & admin access...');
  await db.doc(`schools/${schoolId}`).set({
    school_id: schoolId,
    school_name: 'Payroll Test Academy',
    allowed_features: ['accounts', 'payroll', 'attendance']
  });

  await db.doc(`school_access/${adminUid}`).set({
    schoolId,
    role: 'admin'
  });

  // 2. Setup Settings
  console.log('2. Seeding payroll settings and chart...');
  await db.doc(`tenant_data/${schoolId}/accounts_settings/main`).set({
    goLiveDate: '2026-04-01',
    feeCashAccount: '11100',
    feeDigitalAccount: '11200',
    hasFeeVouchers: true,
    hasDigitalFeeVouchers: true
  });

  await db.doc(`tenant_data/${schoolId}/payroll_settings/main`).set({
    lopFromAttendance: true,
    pfEnabled: true,
    pfEmployeePct: 12,
    pfEmployerPct: 12,
    pfWageCeilingPaise: 1500000,
    pfEmployerEpsPct: 8.33,
    pfEmployerEpfPct: 3.67,
    pfAdminChargesPct: 0.5,
    pfEdliPct: 0.5,
    pfRounding: 'nearest_rupee',
    esiEnabled: true,
    esiEmployeePct: 0.75,
    esiEmployerPct: 3.25,
    esiGrossCeilingPaise: 2100000,
    esiRounding: 'higher_rupee',
    ptEnabled: true,
    ptState: 'Jharkhand',
    ptSlabs: [
      { minMonthlyGrossPaise: 0, maxMonthlyGrossPaise: 2500000, ptPaise: 0 },
      { minMonthlyGrossPaise: 2500001, maxMonthlyGrossPaise: 4166600, ptPaise: 10000 },
      { minMonthlyGrossPaise: 4166601, maxMonthlyGrossPaise: 6666600, ptPaise: 15000 },
      { minMonthlyGrossPaise: 6666601, maxMonthlyGrossPaise: 8333300, ptPaise: 17500 },
      { minMonthlyGrossPaise: 8333301, maxMonthlyGrossPaise: null, ptPaise: 20800 }
    ],
    paidDaysBasis: 'calendar',
    salaryExpenseAccounts: { teacher: '51100', staff: '51200' }
  });

  // 3. Seed Teachers on Root Doc & Attendance
  console.log('3. Seeding teachers on root doc & attendance punches...');
  const teachers = [
    {
      id: 'teacher_01',
      firstName: 'Pooja',
      lastName: 'Verma',
      status: 'Active',
      designation: 'Senior Teacher',
      subject: 'Mathematics'
    },
    {
      id: 'teacher_02',
      firstName: 'Rajesh',
      lastName: 'Sharma',
      status: 'Active',
      designation: 'Science Teacher',
      subject: 'Science'
    }
  ];

  // Pooja attends 25 working days, Rajesh attends 26 working days (full month)
  const teacherAttendance = [];
  for (let d = 1; d <= 30; d++) {
    const dt = new Date(2026, 3, d);
    if (dt.getDay() !== 0) { // Not Sunday
      const dStr = `2026-04-${String(d).padStart(2, '0')}`;
      if (d !== 28) {
        teacherAttendance.push({ teacherId: 'teacher_01', date: dStr, type: 'in' });
      }
      teacherAttendance.push({ teacherId: 'teacher_02', date: dStr, type: 'in' });
    }
  }

  await db.doc(`tenant_data/${schoolId}`).set({
    teachers,
    teacherAttendance,
    attendanceRequests: []
  });

  // 4. Seed Non-Teaching Staff
  console.log('4. Seeding non-teaching staff & salary profiles...');
  await db.doc(`tenant_data/${schoolId}/staff/staff_01`).set({
    name: 'Suresh Kumar',
    designation: 'Accountant',
    department: 'Accounts',
    phone: '9876543210',
    joinDate: '2026-01-01',
    status: 'Active'
  });

  // Profiles
  await db.doc(`tenant_data/${schoolId}/payroll_profiles/teacher_01`).set({
    employeeId: 'teacher_01',
    employeeType: 'teacher',
    basicPaise: 3000000, // Rs 30,000
    daPaise: 500000,     // Rs 5,000
    hraPaise: 750000,    // Rs 7,500
    pfApplicable: true,
    esiApplicable: false, // gross > 21k
    ptApplicable: true,
    paymentMode: 'Bank',
    status: 'active'
  });

  await db.doc(`tenant_data/${schoolId}/payroll_profiles/teacher_02`).set({
    employeeId: 'teacher_02',
    employeeType: 'teacher',
    basicPaise: 4000000, // Rs 40,000
    daPaise: 800000,     // Rs 8,000
    hraPaise: 1000000,   // Rs 10,000
    pfApplicable: true,
    esiApplicable: false,
    ptApplicable: true,
    paymentMode: 'Bank',
    status: 'active'
  });

  await db.doc(`tenant_data/${schoolId}/payroll_profiles/staff_01`).set({
    employeeId: 'staff_01',
    employeeType: 'staff',
    basicPaise: 1800000, // Rs 18,000 (qualifies for ESI)
    daPaise: 200000,     // Rs 2,000 (total gross = 20k <= 21k)
    hraPaise: 0,
    pfApplicable: true,
    esiApplicable: true,
    ptApplicable: true,
    paymentMode: 'Cash',
    status: 'active'
  });

  // 5. Seed Staff Advance
  console.log('5. Seeding staff advance...');
  await db.doc(`tenant_data/${schoolId}/accounts_advances/ADV001`).set({
    id: 'ADV001',
    date: '2026-04-05',
    financialYear: '2026-27',
    employeeId: 'staff_01',
    employeeName: 'Suresh Kumar',
    employeeType: 'staff',
    amountPaise: 200000, // Rs 2,000 advance
    paidFromAccountId: '11100',
    recoveryMonthlyPaise: 100000, // Recover Rs 1,000/mo
    status: 'active',
    createdBy: adminUid,
    createdAt: new Date().toISOString()
  });

  // 6. Action: payroll-calc (Draft)
  console.log('6. Calling action: payroll-calc for 2026-04...');
  let req = mockReq({ action: 'payroll-calc', month: '2026-04' });
  let res = mockRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 200, `payroll-calc failed: ${JSON.stringify(res.body)}`);
  assert.strictEqual(res.body.status, 'ok');
  assert.strictEqual(res.body.run.status, 'draft');
  assert.strictEqual(res.body.lines.length, 3);

  // Verify Pooja has 1 LOP day (April 28 missed)
  const poojaLine = res.body.lines.find(l => l.employeeId === 'teacher_01');
  assert.strictEqual(poojaLine.lopAuto, 1);
  assert.strictEqual(poojaLine.lopDays, 1);
  assert.strictEqual(poojaLine.payableDays, 29);

  // Verify Suresh has Rs 1,000 advance recovery planned
  const sureshLine = res.body.lines.find(l => l.employeeId === 'staff_01');
  assert.strictEqual(sureshLine.advanceRecoveryPaise, 100000);
  assert.strictEqual(sureshLine.paymentMode, 'Cash');
  console.log('✔ PASS: Draft payroll calculated and lines verified!');

  // 7. Action: payroll-approve
  console.log('7. Calling action: payroll-approve for 2026-04...');
  req = mockReq({ action: 'payroll-approve', month: '2026-04' });
  res = mockRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.run.status, 'approved');
  console.log('✔ PASS: Run transitioned to approved!');

  // 8. Action: payroll-reopen -> draft -> re-approve
  console.log('8. Testing payroll-reopen and re-approval...');
  req = mockReq({ action: 'payroll-reopen', month: '2026-04' });
  res = mockRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.run.status, 'draft');

  req = mockReq({ action: 'payroll-approve', month: '2026-04' });
  res = mockRes();
  await handler(req, res);
  assert.strictEqual(res.body.run.status, 'approved');
  console.log('✔ PASS: Reopen and re-approve lifecycle works cleanly!');

  // 9. Action: payroll-pay
  console.log('9. Calling action: payroll-pay for 2026-04...');
  req = mockReq({
    action: 'payroll-pay',
    month: '2026-04',
    paidDate: '2026-04-30',
    bankAccount: '11200',
    cashAccount: '11100'
  });
  res = mockRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 200, `payroll-pay failed: ${JSON.stringify(res.body)}`);
  assert.strictEqual(res.body.run.status, 'paid');
  assert.strictEqual(res.body.voucherId, 'vch_pay_2026-04');

  // Verify journal voucher
  const vchSnap = await db.doc(`tenant_data/${schoolId}/accounts_journal/vch_pay_2026-04`).get();
  assert(vchSnap.exists, 'Payroll voucher must exist in accounts_journal');
  const vchData = vchSnap.data();
  assert.strictEqual(vchData.voucherId, 'vch_pay_2026-04');

  // Verify payslips created
  const psSnap = await db.doc(`tenant_data/${schoolId}/payroll_payslips/PAY_2026-04_teacher_01`).get();
  assert(psSnap.exists, 'Teacher payslip must exist');
  assert.strictEqual(psSnap.data().status, 'paid');
  assert.strictEqual(psSnap.data().teacherId, 'teacher_01');
  console.log('✔ PASS: Payroll disbursed, journal voucher posted, and payslips generated!');

  // 10. Verify Summary Balances After Pay
  const summarySnap = await db.doc(`tenant_data/${schoolId}/accounts_summary/2026-27`).get();
  assert(summarySnap.exists);
  const summaryAccounts = summarySnap.data().accounts;
  let totDr = 0;
  let totCr = 0;
  const getAccBalance = (code) => {
    let d = 0, c = 0;
    if (summaryAccounts[code]) {
      Object.values(summaryAccounts[code]).forEach(m => {
        d += (m.dr || 0);
        c += (m.cr || 0);
      });
    }
    return { dr: d, cr: c };
  };

  Object.keys(summaryAccounts).forEach(code => {
    const bal = getAccBalance(code);
    totDr += bal.dr;
    totCr += bal.cr;
  });
  assert(totDr > 0, 'Total debits must be > 0');
  assert.strictEqual(totDr, totCr, `Summary must be balanced: Dr ${totDr} vs Cr ${totCr}`);

  // Assert exact accounts_summary numbers (51100, 51200, 22100, 11200, 11100, 13100, 22300)
  assert.strictEqual(getAccBalance('51100').dr, 9908333, 'Teacher salary gross debit mismatch');
  assert.strictEqual(getAccBalance('51200').dr, 2000000, 'Staff salary gross debit mismatch');
  assert.strictEqual(getAccBalance('22100').cr, 540000, 'Employee PF credit mismatch');
  assert.strictEqual(getAccBalance('11200').cr, 9523333, 'Bank net payout credit mismatch');
  assert.strictEqual(getAccBalance('11100').cr, 1705000, 'Cash net payout credit mismatch');
  assert.strictEqual(getAccBalance('13100').cr, 100000, 'Advance recovery credit mismatch');
  assert.strictEqual(getAccBalance('22300').cr, 25000, 'PT liability credit mismatch');
  console.log('✔ PASS: Summary trial balance is balanced and exact accounts verified after payroll payment!');

  // 11. Action: payroll-reverse
  console.log('11. Calling action: payroll-reverse with confirmText: REVERSE...');
  req = mockReq({
    action: 'payroll-reverse',
    month: '2026-04',
    reason: 'Bank disbursement rejected by clearing house',
    confirmText: 'REVERSE'
  });
  res = mockRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 200, `payroll-reverse failed: ${JSON.stringify(res.body)}`);
  assert.strictEqual(res.body.run.status, 'reversed');
  assert.strictEqual(res.body.reverseVoucherId, 'vch_payrev_2026-04');

  // Verify mirror voucher
  const revSnap = await db.doc(`tenant_data/${schoolId}/accounts_journal/vch_payrev_2026-04`).get();
  assert(revSnap.exists, 'Reversal voucher must exist in accounts_journal');

  // Verify payslip voided
  const voidPsSnap = await db.doc(`tenant_data/${schoolId}/payroll_payslips/PAY_2026-04_teacher_01`).get();
  assert.strictEqual(voidPsSnap.data().status, 'void');

  // Verify summary net balance impact returned to zero
  const afterRevSummarySnap = await db.doc(`tenant_data/${schoolId}/accounts_summary/2026-27`).get();
  const afterAccounts = afterRevSummarySnap.data().accounts;
  Object.keys(afterAccounts).forEach(code => {
    let d = 0, c = 0;
    Object.values(afterAccounts[code]).forEach(m => {
      d += (m.dr || 0);
      c += (m.cr || 0);
    });
    assert.strictEqual(d, c,
      `Account ${code} net balance must be zero after reversal! Dr ${d} vs Cr ${c}`);
  });
  console.log('✔ PASS: Payroll reversal mirrors voucher, voids payslips, and nets summary to zero!');

  // 12. Advances & Statutory Sync integration
  console.log('12. Testing sync integration with staff advance & statutory payment...');
  await db.doc(`tenant_data/${schoolId}/accounts_statutory_payments/STAT001`).set({
    id: 'STAT001',
    date: '2026-04-15',
    financialYear: '2026-27',
    liabilityAccount: '22300', // PT
    amountPaise: 40800,
    paidFromAccountId: '11200',
    period: '2026-04',
    challanRef: 'PT-JH-2026-04-1234',
    status: 'active',
    createdBy: adminUid,
    createdAt: new Date().toISOString()
  });

  req = mockReq({ action: 'sync', fy: '2026-27' });
  res = mockRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.status, 'ok');
  assert(res.body.counts.advancesPosted >= 1);
  assert(res.body.counts.statutoryPosted >= 1);

  const advVchSnap = await db.doc(`tenant_data/${schoolId}/accounts_journal/vch_adv_ADV001`).get();
  assert(advVchSnap.exists, 'Staff advance voucher vch_adv_ADV001 must exist');

  const statVchSnap = await db.doc(`tenant_data/${schoolId}/accounts_journal/vch_stat_STAT001`).get();
  assert(statVchSnap.exists, 'Statutory payment voucher vch_stat_STAT001 must exist');

  // Verify accounts_summary numbers after sync
  const postSyncSummarySnap = await db.doc(`tenant_data/${schoolId}/accounts_summary/2026-27`).get();
  const postSyncAccounts = postSyncSummarySnap.data().accounts;
  const getPostSyncBal = (code) => {
    let d = 0, c = 0;
    if (postSyncAccounts[code]) {
      Object.values(postSyncAccounts[code]).forEach(m => {
        d += (m.dr || 0);
        c += (m.cr || 0);
      });
    }
    return { dr: d, cr: c };
  };
  let syncTotDr = 0, syncTotCr = 0;
  Object.keys(postSyncAccounts).forEach(code => {
    const bal = getPostSyncBal(code);
    syncTotDr += bal.dr;
    syncTotCr += bal.cr;
  });
  assert(syncTotDr > 0);
  assert.strictEqual(syncTotDr, syncTotCr, 'Summary trial balance must be balanced after advance & statutory sync');
  const net13100 = getPostSyncBal('13100').dr - getPostSyncBal('13100').cr;
  assert.strictEqual(net13100, 200000, 'Net Dr for 13100 after advance sync should be 200000');
  const net22300 = getPostSyncBal('22300').dr - getPostSyncBal('22300').cr;
  assert.strictEqual(net22300, 40800, 'Net Dr for 22300 after statutory sync should be 40800');
  console.log('✔ PASS: Sync successfully posted staff advances and statutory payments and summary verified!');

  console.log('\n========================================');
  console.log('ALL PAYROLL & STATUTORY INTEGRATION TESTS PASSED!');
  console.log('========================================');
}

run().catch(err => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
