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

  console.log('--- Seeding Test Fixtures ---');
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // School access mappings
    await db.doc('school_access/admin_school_1').set({ schoolId: 'school_1', role: 'admin' });
    await db.doc('school_access/teacher_school_1').set({ schoolId: 'school_1', role: 'teacher', teacherId: 'T1' });
    await db.doc('school_access/admin_school_2').set({ schoolId: 'school_2', role: 'admin' });
    await db.doc('school_access/teacher_school_2').set({ schoolId: 'school_2', role: 'teacher', teacherId: 'T2' });

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
