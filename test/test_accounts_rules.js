const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');

const rulesPath = path.resolve(__dirname, '../firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

const SUPER_ADMIN_UID = 'cq647u1GfCXISzf7XMw8pxH76I72';

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

async function runAccountsRulesTests() {
  console.log('========================================================');
  console.log('--- Initializing Firestore Emulator Test Environment ---');
  console.log('========================================================');

  const testEnv = await initializeTestEnvironment({
    projectId: 'ctrl-shift-solutions',
    firestore: {
      rules: rulesContent,
      host: '127.0.0.1',
      port: 8085
    }
  });

  await testEnv.clearFirestore();
  console.log('--- Seeding Test Fixtures ---');
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // School access mappings
    await db.doc('school_access/admin_school_1').set({ schoolId: 'school_1', role: 'admin' });
    await db.doc('school_access/teacher_school_1').set({ schoolId: 'school_1', role: 'teacher', teacherId: 'T1' });
    await db.doc('school_access/admin_school_2').set({ schoolId: 'school_2', role: 'admin' });
    await db.doc('school_access/teacher_school_2').set({ schoolId: 'school_2', role: 'teacher', teacherId: 'T2' });

    // Slice 2 Seed fixtures:
    await db.doc('tenant_data/school_1/accounts_receipts/RCP_001').set({
      receiptNo: 'RCP-2026-27-0001',
      date: '2026-10-29',
      financialYear: '2026-27',
      payerName: 'State Bank of India',
      categoryAccountId: '43100',
      amountPaise: 50000,
      paymentMode: 'Bank Transfer',
      receivedInAccountId: '11120',
      attachments: [],
      status: 'active',
      createdBy: 'Admin',
      createdAt: '2026-10-29T10:00:00.000Z'
    });

    await db.doc('tenant_data/school_1/accounts_transfers/TRF_001').set({
      transferNo: 'TRF-2026-27-0001',
      date: '2026-10-29',
      financialYear: '2026-27',
      fromAccountId: '11100',
      toAccountId: '11120',
      amountPaise: 100000,
      paymentMode: 'Cash',
      status: 'active',
      createdBy: 'Admin',
      createdAt: '2026-10-29T10:00:00.000Z'
    });

    await db.doc('tenant_data/school_1/accounts_journal/vch_test_001').set({
      voucherId: 'vch_test_001',
      voucherNo: 'VCH-2026-0001',
      type: 'payment',
      date: '2026-10-29',
      fy: '2026-27',
      lines: [
        { accountCode: '52100', drPaise: 10000, crPaise: 0 },
        { accountCode: '11100', drPaise: 0, crPaise: 10000 }
      ]
    });

    await db.doc('tenant_data/school_1/accounts_summary/2026-27').set({
      fy: '2026-27',
      accounts: {}
    });

    await db.doc('tenant_data/school_1/accounts_sync_state/2026-27').set({
      fy: '2026-27',
      counts: {}
    });

    await db.doc('tenant_data/school_1/accounts_settings/main').set({
      entityType: 'trust_society',
      goLiveDate: '2026-04-01',
      feeCashAccount: '11100',
      feeDigitalAccount: '11200',
      hasFeeVouchers: false,
      feeHeadMapping: { 'tuition': '41100' }
    });

    // Existing active expense for update/delete tests
    await db.doc('tenant_data/school_1/accounts_expenses/EXP_001').set({
      expenseNo: 'EXP-2026-27-0001',
      date: '2026-10-29',
      financialYear: '2026-27',
      vendorName: 'ABC Stationary',
      categoryAccountId: '52100',
      amountPaise: 150000,
      paymentMode: 'Cash',
      paidFromAccountId: '11100',
      attachments: [],
      description: 'Exam papers',
      status: 'active',
      createdBy: 'Admin',
      createdAt: '2026-10-29T10:00:00.000Z'
    });

    // Existing chart accounts: 52100 (system), 56000 (custom)
    await db.doc('tenant_data/school_1/accounts_chart/52100').set({
      code: '52100',
      name: 'Printing, Stationery & Report Cards',
      type: 'expense',
      group: 'Operating & Academic Expenses',
      isSystem: true,
      isActive: true,
      createdAt: '2026-10-29T10:00:00.000Z'
    });

    await db.doc('tenant_data/school_1/accounts_chart/56000').set({
      code: '56000',
      name: 'Custom Annual Day Event',
      type: 'expense',
      group: 'Operating & Academic Expenses',
      isSystem: false,
      isActive: true,
      createdAt: '2026-10-29T10:00:00.000Z'
    });

    // Existing settings
    await db.doc('tenant_data/school_1/accounts_settings/main').set({
      financialYearStartMonth: 4,
      entityType: 'trust_society',
      accountingBasis: 'cash',
      bankAccounts: [
        { id: 'bank_11200', label: 'Primary Bank', bankName: 'SBI', last4: '1234', ledgerAccountId: '11200', isActive: true }
      ],
      setupCompletedAt: '2026-10-29T10:00:00.000Z'
    });

    // Existing counters
    await db.doc('tenant_data/school_1/accounts_settings/counters').set({
      expenseSeq: { '2026-27': 1 }
    });

    // Existing payslips
    await db.doc('tenant_data/school_1/payroll_payslips/PAY_T1').set({
      teacherId: 'T1',
      month: '2026-10',
      netPayPaise: 2500000
    });
    await db.doc('tenant_data/school_1/payroll_payslips/PAY_T2').set({
      teacherId: 'T2',
      month: '2026-10',
      netPayPaise: 2800000
    });
  });

  const admin1Db = testEnv.authenticatedContext('admin_school_1').firestore();
  const admin2Db = testEnv.authenticatedContext('admin_school_2').firestore();
  const teacher1Db = testEnv.authenticatedContext('teacher_school_1').firestore();
  const superAdminDb = testEnv.authenticatedContext(SUPER_ADMIN_UID).firestore();
  const anonDb = testEnv.unauthenticatedContext().firestore();

  const validExpensePayload = {
    expenseNo: 'EXP-2026-27-0002',
    date: '2026-10-29',
    financialYear: '2026-27',
    vendorName: 'Global Books Depot',
    categoryAccountId: '52100',
    amountPaise: 50000,
    paymentMode: 'Cash',
    paidFromAccountId: '11100',
    attachments: [],
    status: 'active',
    createdBy: 'Admin User',
    createdAt: new Date().toISOString()
  };

  console.log('\n=== Category 1: School Admin Allowed Operations ===');
  await recordTest('A1', 'Admin can READ accounts_settings', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_settings/main').get());
  });
  await recordTest('A2', 'Admin can UPDATE accounts_settings/main', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_settings/main').update({ entityType: 'company' }));
  });
  await recordTest('A3', 'Admin can READ accounts_chart', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_chart/52100').get());
  });
  await recordTest('A4', 'Admin can CREATE custom accounts_chart account (isSystem == false)', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_chart/57000').set({
      code: '57000',
      name: 'Custom Sports Meet Expense',
      type: 'expense',
      group: 'Operating & Academic Expenses',
      isSystem: false,
      isActive: true,
      createdAt: new Date().toISOString()
    }));
  });
  await recordTest('A5', 'Admin can CREATE accounts_expenses with valid full schema', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_expenses/EXP_002').set(validExpensePayload));
  });
  await recordTest('A6', 'Admin can CANCEL active expense with valid non-empty cancelReason', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_expenses/EXP_001').update({
      status: 'cancelled',
      cancelReason: 'Entered wrong payment mode',
      cancelledAt: new Date().toISOString(),
      cancelledBy: 'Admin'
    }));
  });
  await recordTest('A7', 'Admin can UPDATE custom chart account (isSystem: false) name and isActive', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_chart/56000').update({
      name: 'Renamed Annual Day Event',
      isActive: false,
      updatedAt: new Date().toISOString()
    }));
  });

  console.log('\n=== Category 2: Admin Prohibited Operations (Immutability & No Deletes) ===');
  await recordTest('P1', 'Admin CANNOT edit expense amount / vendor (immutable fields)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('tenant_data/school_1/accounts_expenses/EXP_IMMUTABLE').set({
        ...validExpensePayload,
        expenseNo: 'EXP-2026-27-0099',
        status: 'active'
      });
    });
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_expenses/EXP_IMMUTABLE').update({
      amountPaise: 120000
    }));
  });
  await recordTest('P2', 'Admin CANNOT delete accounts_expenses', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_expenses/EXP_001').delete());
  });
  await recordTest('P3', 'Admin CANNOT delete accounts_chart', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_chart/52100').delete());
  });
  await recordTest('P4', 'Admin CANNOT delete accounts_settings', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_settings/main').delete());
  });

  console.log('\n=== Category 3: Granular Rules Validation (F5 Requirements) ===');
  await recordTest('V1', 'Reserved category (51100 payroll) expense create → DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_expenses/EXP_RES_1').set({
      ...validExpensePayload,
      categoryAccountId: '51100'
    }));
  });
  await recordTest('V2', 'Reserved category (55100 fee concession) expense create → DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_expenses/EXP_RES_2').set({
      ...validExpensePayload,
      categoryAccountId: '55100'
    }));
  });
  await recordTest('V3', 'Reserved category (41100 tuition income) expense create → DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_expenses/EXP_RES_3').set({
      ...validExpensePayload,
      categoryAccountId: '41100'
    }));
  });
  await recordTest('V4', 'amountPaise float (150.50) → DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_expenses/EXP_FLOAT').set({
      ...validExpensePayload,
      amountPaise: 150.50
    }));
  });
  await recordTest('V5', 'amountPaise zero or negative → DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_expenses/EXP_NEG').set({
      ...validExpensePayload,
      amountPaise: 0
    }));
  });
  await recordTest('V6', 'status == "cancelled" on expense create → DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_expenses/EXP_CANC_CREATE').set({
      ...validExpensePayload,
      status: 'cancelled',
      cancelReason: 'Pre-cancelled'
    }));
  });
  await recordTest('V7', 'cancel expense with empty cancelReason → DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_expenses/EXP_002').update({
      status: 'cancelled',
      cancelReason: '   ',
      cancelledAt: new Date().toISOString(),
      cancelledBy: 'Admin'
    }));
  });
  await recordTest('V8', 'cancel expense on already cancelled expense → DENY', async () => {
    // EXP_001 was cancelled in A6
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_expenses/EXP_001').update({
      status: 'cancelled',
      cancelReason: 'Cancelling again',
      cancelledAt: new Date().toISOString(),
      cancelledBy: 'Admin'
    }));
  });
  await recordTest('V9', 'system chart account (isSystem: true) deactivate → DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_chart/52100').update({
      isActive: false
    }));
  });
  await recordTest('V10', 'system chart account (isSystem: true) name change → DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_chart/52100').update({
      name: 'Illegal Name Change'
    }));
  });
  await recordTest('V11', 'custom chart account creation with isSystem == true (non-default code) → DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_chart/58888').set({
      code: '58888',
      name: 'Sneaky System Account',
      type: 'expense',
      isSystem: true,
      isActive: true
    }));
  });
  await recordTest('V12', 'chart account creation with code != docId → DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_chart/59000').set({
      code: '59999',
      name: 'Mismatched Code',
      type: 'expense',
      isSystem: false,
      isActive: true
    }));
  });
  await recordTest('V13', 'counters decrease on existing year → DENY', async () => {
    // Current 2026-27 is 1; try decreasing to 0
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_settings/counters').update({
      'expenseSeq.2026-27': 0
    }));
  });
  await recordTest('V14', 'counters removal of financial year key → DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_settings/counters').set({
      expenseSeq: {}
    }));
  });
  await recordTest('V15', 'counters increase on financial year → ALLOW', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_settings/counters').update({
      'expenseSeq.2026-27': 2
    }));
  });

  console.log('\n=== Category 4: Concurrency & Idempotency Invariants (F1 & F2) ===');
  await recordTest('C1', 'Two concurrent expense saves get different sequential voucher numbers', async () => {
    // Set counters at 10
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('tenant_data/school_1/accounts_settings/counters').set({
        expenseSeq: { '2026-27': 10 }
      });
    });

    const runConcurrentSave = async (id, vendor) => {
      return await admin1Db.runTransaction(async (tx) => {
        const cRef = admin1Db.doc('tenant_data/school_1/accounts_settings/counters');
        const eRef = admin1Db.doc(`tenant_data/school_1/accounts_expenses/${id}`);
        const cSnap = await tx.get(cRef);
        const data = cSnap.data() || { expenseSeq: {} };
        const seq = data.expenseSeq || {};
        const nextSeq = (seq['2026-27'] || 0) + 1;
        const expNo = `EXP-2026-27-${String(nextSeq).padStart(4, '0')}`;
        seq['2026-27'] = nextSeq;

        tx.set(cRef, { expenseSeq: seq }, { merge: true });
        tx.set(eRef, {
          expenseNo: expNo,
          date: '2026-10-29',
          financialYear: '2026-27',
          vendorName: vendor,
          categoryAccountId: '52100',
          amountPaise: 10000,
          paymentMode: 'Cash',
          paidFromAccountId: '11100',
          attachments: [],
          status: 'active',
          createdBy: 'Admin',
          createdAt: new Date().toISOString()
        });
        return expNo;
      });
    };

    // Execute concurrently
    const [no1, no2] = await Promise.all([
      runConcurrentSave('EXP_PARALLEL_1', 'Vendor Parallel 1'),
      runConcurrentSave('EXP_PARALLEL_2', 'Vendor Parallel 2')
    ]);

    if (no1 === no2) {
      throw new Error(`Duplicate voucher numbers assigned: ${no1} === ${no2}`);
    }
    const finalSnap = await admin1Db.doc('tenant_data/school_1/accounts_settings/counters').get();
    if (finalSnap.data().expenseSeq['2026-27'] !== 12) {
      throw new Error(`Expected final sequence 12, got: ${finalSnap.data().expenseSeq['2026-27']}`);
    }
  });

  await recordTest('C2', 'Idempotent setup logic does NOT reset counters or overwrite renamed/deactivated accounts', async () => {
    // 1. Seed custom renamed account, a deactivated account, and counter = 50
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('tenant_data/school_1/accounts_settings/counters').set({ expenseSeq: { '2026-27': 50 } });
      await db.doc('tenant_data/school_1/accounts_chart/56000').set({
        code: '56000',
        name: 'Custom Preserved Name',
        type: 'expense',
        isSystem: false,
        isActive: false
      });
    });

    // 2. Simulate running idempotent setup logic
    const settingsRef = admin1Db.doc('tenant_data/school_1/accounts_settings/main');
    const countersRef = admin1Db.doc('tenant_data/school_1/accounts_settings/counters');
    const customAccRef = admin1Db.doc('tenant_data/school_1/accounts_chart/56000');

    await admin1Db.runTransaction(async (tx) => {
      const countersSnap = await tx.get(countersRef);
      const customAccSnap = await tx.get(customAccRef);

      // Create counters ONLY if missing
      const cExists = typeof countersSnap.exists === 'function' ? countersSnap.exists() : countersSnap.exists;
      if (!cExists) {
        tx.set(countersRef, { expenseSeq: {} });
      }

      // Seed custom ONLY if missing
      const aExists = typeof customAccSnap.exists === 'function' ? customAccSnap.exists() : customAccSnap.exists;
      if (!aExists) {
        tx.set(customAccRef, {
          code: '56000',
          name: 'Default Name',
          type: 'expense',
          isSystem: false,
          isActive: true
        });
      }
    });

    // 3. Verify counters and custom account were untouched
    const afterCounters = await admin1Db.doc('tenant_data/school_1/accounts_settings/counters').get();
    const afterCustom = await admin1Db.doc('tenant_data/school_1/accounts_chart/56000').get();

    if (afterCounters.data().expenseSeq['2026-27'] !== 50) {
      throw new Error(`Counters were reset! Expected 50, got: ${afterCounters.data().expenseSeq['2026-27']}`);
    }
    if (afterCustom.data().name !== 'Custom Preserved Name') {
      throw new Error(`Custom name was overwritten! Got: ${afterCustom.data().name}`);
    }
    if (afterCustom.data().isActive !== false) {
      throw new Error(`Deactivated account was reactivated!`);
    }
  });

  console.log('\n=== Category 5: Teacher Role Gating (Strict Zero Accounts Access) ===');
  await recordTest('T1', 'Teacher READ of accounts_settings is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/accounts_settings/main').get());
  });
  await recordTest('T2', 'Teacher WRITE to accounts_settings is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/accounts_settings/main').set({ entityType: 'trust_society' }));
  });
  await recordTest('T3', 'Teacher READ of accounts_chart is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/accounts_chart/52100').get());
  });
  await recordTest('T4', 'Teacher WRITE to accounts_chart is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/accounts_chart/56000').set({ code: '56000' }));
  });
  await recordTest('T5', 'Teacher READ of accounts_expenses is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/accounts_expenses/EXP_001').get());
  });
  await recordTest('T6', 'Teacher WRITE to accounts_expenses is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/accounts_expenses/EXP_003').set({ amountPaise: 100 }));
  });

  console.log('\n=== Category 6: Super Admin Zero Access on Accounts & Payroll ===');
  await recordTest('SA1', 'Super Admin READ of accounts_settings is DENIED', async () => {
    await assertFails(superAdminDb.doc('tenant_data/school_1/accounts_settings/main').get());
  });
  await recordTest('SA2', 'Super Admin WRITE to accounts_settings is DENIED', async () => {
    await assertFails(superAdminDb.doc('tenant_data/school_1/accounts_settings/main').set({ entityType: 'company' }));
  });
  await recordTest('SA3', 'Super Admin READ of accounts_chart is DENIED', async () => {
    await assertFails(superAdminDb.doc('tenant_data/school_1/accounts_chart/52100').get());
  });
  await recordTest('SA4', 'Super Admin READ of accounts_expenses is DENIED', async () => {
    await assertFails(superAdminDb.doc('tenant_data/school_1/accounts_expenses/EXP_001').get());
  });
  await recordTest('SA5', 'Super Admin WRITE to accounts_expenses is DENIED', async () => {
    await assertFails(superAdminDb.doc('tenant_data/school_1/accounts_expenses/EXP_004').set({ amountPaise: 100 }));
  });
  await recordTest('SA6', 'Super Admin READ of payroll_payslips is DENIED', async () => {
    await assertFails(superAdminDb.doc('tenant_data/school_1/payroll_payslips/PAY_T1').get());
  });
  await recordTest('SA7', 'Super Admin WRITE to payroll_payslips is DENIED', async () => {
    await assertFails(superAdminDb.doc('tenant_data/school_1/payroll_payslips/PAY_T1').set({ netPayPaise: 100 }));
  });

  console.log('\n=== Category 7: Cross-Tenant Isolation & Anonymous Access ===');
  await recordTest('CT1', 'School 2 Admin READ of School 1 accounts_expenses is DENIED', async () => {
    await assertFails(admin2Db.doc('tenant_data/school_1/accounts_expenses/EXP_001').get());
  });
  await recordTest('CT2', 'School 2 Admin WRITE to School 1 accounts_expenses is DENIED', async () => {
    await assertFails(admin2Db.doc('tenant_data/school_1/accounts_expenses/EXP_CT').set({ amountPaise: 100 }));
  });
  await recordTest('ANON1', 'Anonymous READ of accounts_expenses is DENIED', async () => {
    await assertFails(anonDb.doc('tenant_data/school_1/accounts_expenses/EXP_001').get());
  });
  await recordTest('ANON2', 'Anonymous WRITE to accounts_expenses is DENIED', async () => {
    await assertFails(anonDb.doc('tenant_data/school_1/accounts_expenses/EXP_ANON').set({ amountPaise: 100 }));
  });

  console.log('\n=== Category 8: Accounts Slice 2 Rules (Receipts, Transfers, Opening, Journal & Summary) ===');
  await recordTest('S2_1', 'Admin can CREATE valid accounts_receipts (other income)', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_receipts/RCP_002').set({
      receiptNo: 'RCP-2026-27-0002',
      date: '2026-10-30',
      financialYear: '2026-27',
      payerName: 'Alumni Association',
      categoryAccountId: '43200',
      amountPaise: 250000,
      paymentMode: 'UPI',
      receivedInAccountId: '11120',
      attachments: [],
      status: 'active',
      createdBy: 'Admin',
      createdAt: new Date().toISOString()
    }));
  });

  await recordTest('S2_2', 'Admin CANNOT create receipt with reserved fee category (41100) -> DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_receipts/RCP_003').set({
      receiptNo: 'RCP-2026-27-0003',
      date: '2026-10-30',
      financialYear: '2026-27',
      payerName: 'Student Parent',
      categoryAccountId: '41100', // reserved for student fees
      amountPaise: 500000,
      paymentMode: 'Cash',
      receivedInAccountId: '11100',
      attachments: [],
      status: 'active',
      createdBy: 'Admin',
      createdAt: new Date().toISOString()
    }));
  });

  await recordTest('S2_3', 'Admin can CANCEL active receipt with valid reason', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_receipts/RCP_001').update({
      status: 'cancelled',
      cancelReason: 'Wrong interest entry credited by bank',
      cancelledAt: new Date().toISOString(),
      cancelledBy: 'Admin'
    }));
  });

  await recordTest('S2_4', 'Admin CANNOT delete accounts_receipts -> DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_receipts/RCP_001').delete());
  });

  await recordTest('S2_5', 'Admin can CREATE valid accounts_transfers (contra between cash & bank)', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_transfers/TRF_002').set({
      transferNo: 'TRF-2026-27-0002',
      date: '2026-10-30',
      financialYear: '2026-27',
      fromAccountId: '11100',
      toAccountId: '11120',
      amountPaise: 1500000,
      paymentMode: 'Cash',
      status: 'active',
      createdBy: 'Admin',
      createdAt: new Date().toISOString()
    }));
  });

  await recordTest('S2_6', 'Admin CANNOT create transfer with same from and to account -> DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_transfers/TRF_003').set({
      transferNo: 'TRF-2026-27-0003',
      date: '2026-10-30',
      financialYear: '2026-27',
      fromAccountId: '11100',
      toAccountId: '11100', // same
      amountPaise: 100000,
      status: 'active',
      createdBy: 'Admin',
      createdAt: new Date().toISOString()
    }));
  });

  await recordTest('S2_7', 'Admin CANNOT create transfer with non-cash/bank account -> DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_transfers/TRF_004').set({
      transferNo: 'TRF-2026-27-0004',
      date: '2026-10-30',
      financialYear: '2026-27',
      fromAccountId: '11100',
      toAccountId: '52100', // expense account, not cash/bank
      amountPaise: 100000,
      status: 'active',
      createdBy: 'Admin',
      createdAt: new Date().toISOString()
    }));
  });

  await recordTest('S2_8', 'Admin can CANCEL active transfer with valid reason', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_transfers/TRF_001').update({
      status: 'cancelled',
      cancelReason: 'Cash deposit slip cancelled at counter',
      cancelledAt: new Date().toISOString(),
      cancelledBy: 'Admin'
    }));
  });

  await recordTest('S2_9', 'Admin CANNOT delete accounts_transfers -> DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_transfers/TRF_001').delete());
  });

  await recordTest('S2_10', 'Admin can CREATE opening balances in draft', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_settings/opening').set({
      fy: '2026-27',
      status: 'draft',
      lines: [
        { accountCode: '11100', debitPaise: 500000, creditPaise: 0 },
        { accountCode: '31100', debitPaise: 0, creditPaise: 500000 }
      ]
    }));
  });

  await recordTest('S2_11', 'Admin can UPDATE opening balances while in draft', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_settings/opening').update({
      lines: [
        { accountCode: '11100', debitPaise: 600000, creditPaise: 0 },
        { accountCode: '31100', debitPaise: 0, creditPaise: 600000 }
      ]
    }));
  });

  await recordTest('S2_12', 'Admin can transition opening balances from draft to locked', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_settings/opening').update({
      status: 'locked',
      lockedAt: new Date().toISOString(),
      lockedBy: 'Admin'
    }));
  });

  await recordTest('S2_13', 'Admin CANNOT update opening balances once locked -> DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_settings/opening').update({
      lines: [
        { accountCode: '11100', debitPaise: 900000, creditPaise: 0 }
      ]
    }));
  });

  await recordTest('S2_14', 'Admin can READ accounts_journal, but client WRITE is DENIED', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_journal/vch_test_001').get());
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_journal/vch_test_002').set({
      voucherId: 'vch_test_002',
      amountPaise: 1000
    }));
  });

  await recordTest('S2_15', 'Admin can READ accounts_summary, but client WRITE is DENIED', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_summary/2026-27').get());
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_summary/2026-27').set({
      fy: '2026-27',
      accounts: { '11100': { '2026-10': { dr: 100, cr: 0 } } }
    }));
  });

  await recordTest('S2_16', 'Admin can READ accounts_sync_state, but client WRITE is DENIED', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_sync_state/2026-27').get());
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_sync_state/2026-27').set({
      fy: '2026-27',
      counts: { vouchersTotal: 999 }
    }));
  });

  await recordTest('S2_17', 'Teacher access to Slice 2 collections (receipts, transfers, journal) is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/accounts_receipts/RCP_001').get());
    await assertFails(teacher1Db.doc('tenant_data/school_1/accounts_transfers/TRF_001').get());
    await assertFails(teacher1Db.doc('tenant_data/school_1/accounts_journal/vch_test_001').get());
  });

  await recordTest('S2_18', 'Super Admin access to Slice 2 collections (receipts, transfers, journal) is DENIED', async () => {
    await assertFails(superAdminDb.doc('tenant_data/school_1/accounts_receipts/RCP_001').get());
    await assertFails(superAdminDb.doc('tenant_data/school_1/accounts_transfers/TRF_001').get());
    await assertFails(superAdminDb.doc('tenant_data/school_1/accounts_journal/vch_test_001').get());
  });

  await recordTest('S2_19', 'Admin CAN change goLiveDate and feeDigitalAccount when hasFeeVouchers is false', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_settings/main').update({
      goLiveDate: '2026-04-15',
      feeDigitalAccount: '11210'
    }));
  });

  await recordTest('S2_20', 'Clients CANNOT set or change hasFeeVouchers or hasDigitalFeeVouchers (server only)', async () => {
    // Attempt by client to set hasFeeVouchers: true -> DENY
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_settings/main').update({
      hasFeeVouchers: true
    }));
    // Attempt by client to set hasDigitalFeeVouchers: true -> DENY
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_settings/main').update({
      hasDigitalFeeVouchers: true
    }));
  });

  await recordTest('S2_20b', 'Greenwood-like state: hasFeeVouchers true but fields missing -> admin CAN set feeDigitalAccount (F2)', async () => {
    // Simulate server setting hasFeeVouchers: true with empty fields (like Greenwood)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('tenant_data/school_1/accounts_settings/main').set({
        hasFeeVouchers: true,
        hasDigitalFeeVouchers: false,
        feeCashAccount: '',
        feeDigitalAccount: '',
        goLiveDate: '',
        feeHeadMapping: { 'tuition': '41100' }
      }, { merge: true });
    });

    // Admin sets feeDigitalAccount from empty -> ALLOW
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_settings/main').update({
      feeDigitalAccount: '11200'
    }));

    // Admin sets goLiveDate from empty -> ALLOW
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_settings/main').update({
      goLiveDate: '2026-04-01'
    }));
  });

  await recordTest('S2_20c', 'After goLiveDate is non-empty and hasFeeVouchers true -> change goLiveDate -> DENY (F2)', async () => {
    // Attempt to change goLiveDate after it is non-empty -> DENY
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_settings/main').update({
      goLiveDate: '2026-05-01'
    }));
  });

  await recordTest('S2_20d', 'Admin CAN update feeDigitalAccount when hasDigitalFeeVouchers is false, but DENIED after hasDigitalFeeVouchers is true (F2)', async () => {
    // feeDigitalAccount is '11200' and hasDigitalFeeVouchers is false -> admin can change it
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_settings/main').update({
      feeDigitalAccount: '11210'
    }));

    // Server marks hasDigitalFeeVouchers: true once first digital voucher posts
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('tenant_data/school_1/accounts_settings/main').update({
        hasDigitalFeeVouchers: true
      });
    });

    // Now attempt to change feeDigitalAccount -> DENY
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_settings/main').update({
      feeDigitalAccount: '11200'
    }));
  });

  await recordTest('S2_21', 'Admin CAN update feeHeadMapping even when hasFeeVouchers is true (F6)', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_settings/main').update({
      feeHeadMapping: { 'tuition': '41100', 'sports': '41200' }
    }));
  });

  // ========================================================
  // === Category 6: Slice 3 Payroll & Staff Rules ========
  // ========================================================
  console.log('\n=== Category 6: Slice 3 Payroll & Staff Rules ===');

  // Seed Slice 3 fixtures with rules disabled
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // 1. Paid payslip for teacher T1
    await db.doc('tenant_data/school_1/payroll_payslips/PAY_2026-04_T1').set({
      id: 'PAY_2026-04_T1',
      month: '2026-04',
      employeeId: 'T1',
      teacherId: 'T1',
      employeeName: 'Teacher One',
      employeeType: 'teacher',
      status: 'paid',
      netPayPaise: 3500000
    });

    // 2. Paid payslip for teacher T2 (different teacher)
    await db.doc('tenant_data/school_1/payroll_payslips/PAY_2026-04_T2').set({
      id: 'PAY_2026-04_T2',
      month: '2026-04',
      employeeId: 'T2',
      teacherId: 'T2',
      employeeName: 'Teacher Two',
      employeeType: 'teacher',
      status: 'paid',
      netPayPaise: 4000000
    });

    // 3. Void payslip for teacher T1
    await db.doc('tenant_data/school_1/payroll_payslips/PAY_2026-03_T1').set({
      id: 'PAY_2026-03_T1',
      month: '2026-03',
      employeeId: 'T1',
      teacherId: 'T1',
      employeeName: 'Teacher One',
      employeeType: 'teacher',
      status: 'void',
      netPayPaise: 3500000
    });

    // 4. Draft run for 2026-04
    await db.doc('tenant_data/school_1/payroll_runs/2026-04').set({
      month: '2026-04',
      status: 'draft',
      totals: {}
    });

    // 5. Approved run for 2026-05
    await db.doc('tenant_data/school_1/payroll_runs/2026-05').set({
      month: '2026-05',
      status: 'approved',
      totals: {}
    });
  });

  await recordTest('S3_1', 'Teacher can READ own PAID payslip -> ALLOW', async () => {
    await assertSucceeds(teacher1Db.doc('tenant_data/school_1/payroll_payslips/PAY_2026-04_T1').get());
  });

  await recordTest('S3_2', 'Teacher CANNOT read other teacher paid payslip -> DENY', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/payroll_payslips/PAY_2026-04_T2').get());
  });

  await recordTest('S3_3', 'Teacher CANNOT read own VOID payslip -> DENY', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/payroll_payslips/PAY_2026-03_T1').get());
  });

  await recordTest('S3_4', 'Client (admin & teacher) write to payroll_payslips -> DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/payroll_payslips/PAY_2026-06_T1').set({
      month: '2026-06', status: 'paid'
    }));
    await assertFails(teacher1Db.doc('tenant_data/school_1/payroll_payslips/PAY_2026-04_T1').update({
      status: 'void'
    }));
  });

  await recordTest('S3_5', 'Client (admin) write to payroll_runs and lines -> DENY', async () => {
    await assertFails(admin1Db.doc('tenant_data/school_1/payroll_runs/2026-07').set({
      month: '2026-07', status: 'draft'
    }));
    await assertFails(admin1Db.doc('tenant_data/school_1/payroll_runs/2026-04/lines/T1').set({
      netPayPaise: 50000
    }));
  });

  await recordTest('S3_6', 'Admin can write payroll_inputs when run missing or draft -> ALLOW', async () => {
    // 2026-04 is in 'draft' status -> ALLOW
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/payroll_inputs/2026-04').set({
      employees: { T1: { lopDaysOverride: 2 } }
    }));
    // 2026-08 run does not exist -> ALLOW
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/payroll_inputs/2026-08').set({
      employees: { T1: { lopDaysOverride: 0 } }
    }));
  });

  await recordTest('S3_7', 'Admin CANNOT write payroll_inputs once run is approved or paid -> DENY', async () => {
    // 2026-05 is in 'approved' status -> DENY
    await assertFails(admin1Db.doc('tenant_data/school_1/payroll_inputs/2026-05').set({
      employees: { T1: { lopDaysOverride: 1 } }
    }));
  });

  await recordTest('S3_8', 'Admin can create/update staff, but CANNOT delete staff -> ALLOW create/update, DENY delete', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/staff/staff_01').set({
      name: 'Ramesh Sharma',
      designation: 'Clerk',
      department: 'Admin',
      phone: '9876543210',
      joinDate: '2026-04-01',
      status: 'Active'
    }));
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/staff/staff_01').update({
      status: 'Left',
      leftDate: '2026-04-30'
    }));
    await assertFails(admin1Db.doc('tenant_data/school_1/staff/staff_01').delete());
  });

  await recordTest('S3_9', 'Admin can create/update payroll_profiles, but CANNOT delete -> ALLOW create/update, DENY delete', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/payroll_profiles/T1').set({
      employeeId: 'T1',
      employeeType: 'teacher',
      basicPaise: 3000000,
      daPaise: 500000,
      hraPaise: 750000,
      status: 'active'
    }));
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/payroll_profiles/T1').update({
      basicPaise: 3200000
    }));
    await assertFails(admin1Db.doc('tenant_data/school_1/payroll_profiles/T1').delete());
  });

  await recordTest('S3_10', 'Admin can create/update payroll_settings, but CANNOT delete -> ALLOW create/update, DENY delete', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/payroll_settings/main').set({
      pfEnabled: false,
      esiEnabled: false,
      ptEnabled: false,
      paidDaysBasis: 'calendar'
    }));
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/payroll_settings/main').update({
      pfEnabled: true
    }));
    await assertFails(admin1Db.doc('tenant_data/school_1/payroll_settings/main').delete());
  });

  await recordTest('S3_11', 'Admin can CREATE/CANCEL accounts_advances, but CANNOT delete or edit amount -> ALLOW/DENY', async () => {
    // Valid create -> ALLOW
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_advances/ADV_001').set({
      date: '2026-04-10',
      financialYear: '2026-27',
      employeeId: 'T1',
      employeeName: 'Teacher One',
      employeeType: 'teacher',
      amountPaise: 500000,
      paidFromAccountId: '11100',
      status: 'active',
      createdBy: 'Admin',
      createdAt: '2026-04-10T10:00:00Z'
    }));

    // Edit amount -> DENY
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_advances/ADV_001').update({
      amountPaise: 600000
    }));

    // Cancel with reason -> ALLOW
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_advances/ADV_001').update({
      status: 'cancelled',
      cancelReason: 'Wrong employee',
      cancelledAt: '2026-04-11T10:00:00Z',
      cancelledBy: 'Admin'
    }));

    // Delete -> DENY
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_advances/ADV_001').delete());
  });

  await recordTest('S3_12', 'Admin can CREATE/CANCEL accounts_statutory_payments, but CANNOT delete or edit amount -> ALLOW/DENY', async () => {
    // Valid create -> ALLOW
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_statutory_payments/STAT_001').set({
      date: '2026-05-15',
      financialYear: '2026-27',
      liabilityAccount: '22100',
      amountPaise: 360000,
      paidFromAccountId: '11200',
      status: 'active',
      createdBy: 'Admin',
      createdAt: '2026-05-15T10:00:00Z'
    }));

    // Edit amount -> DENY
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_statutory_payments/STAT_001').update({
      amountPaise: 400000
    }));

    // Cancel with reason -> ALLOW
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_statutory_payments/STAT_001').update({
      status: 'cancelled',
      cancelReason: 'Payment cancelled by bank',
      cancelledAt: '2026-05-16T10:00:00Z',
      cancelledBy: 'Admin'
    }));

    // Delete -> DENY
    await assertFails(admin1Db.doc('tenant_data/school_1/accounts_statutory_payments/STAT_001').delete());
  });

  await recordTest('S3_13', 'Super Admin is DENIED all access on Slice 3 subcollections -> DENY', async () => {
    await assertFails(superAdminDb.doc('tenant_data/school_1/staff/staff_01').get());
    await assertFails(superAdminDb.doc('tenant_data/school_1/payroll_profiles/T1').get());
    await assertFails(superAdminDb.doc('tenant_data/school_1/payroll_settings/main').get());
    await assertFails(superAdminDb.doc('tenant_data/school_1/payroll_inputs/2026-04').get());
    await assertFails(superAdminDb.doc('tenant_data/school_1/payroll_runs/2026-04').get());
    await assertFails(superAdminDb.doc('tenant_data/school_1/payroll_payslips/PAY_2026-04_T1').get());
    await assertFails(superAdminDb.doc('tenant_data/school_1/accounts_advances/ADV_001').get());
    await assertFails(superAdminDb.doc('tenant_data/school_1/accounts_statutory_payments/STAT_001').get());
  });

  await recordTest('S3_14', 'Cross-tenant admin (school_2) CANNOT read or write school_1 payroll/staff -> DENY', async () => {
    await assertFails(admin2Db.doc('tenant_data/school_1/staff/staff_01').get());
    await assertFails(admin2Db.doc('tenant_data/school_1/payroll_profiles/T1').get());
    await assertFails(admin2Db.doc('tenant_data/school_1/payroll_payslips/PAY_2026-04_T1').get());
  });


  console.log('\n========================================');
  console.log(`ACCOUNTS RULES TEST SUMMARY: Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log('========================================');

  await testEnv.cleanup();

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAccountsRulesTests().catch((err) => {
  console.error('Fatal accounts rules test error:', err);
  process.exit(1);
});
