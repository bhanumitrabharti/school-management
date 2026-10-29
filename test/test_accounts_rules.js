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

    // Existing expense for update/delete tests
    await db.doc('tenant_data/school_1/accounts_expenses/EXP_001').set({
      expenseNo: 'EXP-2026-27-0001',
      date: '2026-10-29',
      financialYear: '2026-27',
      vendorName: 'ABC Stationary',
      categoryAccountId: '52100',
      amountPaise: 150000,
      paymentMode: 'Cash',
      paidFromAccountId: '11100',
      description: 'Exam papers',
      status: 'active'
    });

    // Existing chart account
    await db.doc('tenant_data/school_1/accounts_chart/52100').set({
      code: '52100',
      name: 'Printing & Stationery',
      type: 'expense',
      isSystem: true,
      isActive: true
    });

    // Existing settings
    await db.doc('tenant_data/school_1/accounts_settings/main').set({
      financialYearStartMonth: 4,
      entityType: 'trust_society',
      accountingBasis: 'cash'
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

  console.log('\n=== Category 1: School Admin Allowed Operations ===');
  await recordTest('A1', 'Admin can READ accounts_settings', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_settings/main').get());
  });
  await recordTest('A2', 'Admin can UPDATE accounts_settings', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_settings/main').update({ entityType: 'company' }));
  });
  await recordTest('A3', 'Admin can READ accounts_chart', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_chart/52100').get());
  });
  await recordTest('A4', 'Admin can CREATE custom accounts_chart account', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_chart/56000').set({
      code: '56000',
      name: 'Custom Annual Day Expense',
      type: 'expense',
      isSystem: false,
      isActive: true
    }));
  });
  await recordTest('A5', 'Admin can CREATE accounts_expenses', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_expenses/EXP_002').set({
      expenseNo: 'EXP-2026-27-0002',
      date: '2026-10-29',
      amountPaise: 50000,
      status: 'active'
    }));
  });
  await recordTest('A6', 'Admin can CANCEL active expense (status active → cancelled)', async () => {
    await assertSucceeds(admin1Db.doc('tenant_data/school_1/accounts_expenses/EXP_001').update({
      status: 'cancelled',
      cancelReason: 'Entered wrong payment mode',
      cancelledAt: new Date().toISOString(),
      cancelledBy: 'Admin'
    }));
  });

  console.log('\n=== Category 2: Admin Prohibited Operations (Immutability & No Deletes) ===');
  await recordTest('P1', 'Admin CANNOT edit expense amount / vendor (immutable fields)', async () => {
    // Re-seed EXP_IMMUTABLE as active
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('tenant_data/school_1/accounts_expenses/EXP_IMMUTABLE').set({
        amountPaise: 100000,
        vendorName: 'Vendor 1',
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

  console.log('\n=== Category 3: Teacher Role Gating (Strict Zero Accounts Access) ===');
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

  console.log('\n=== Category 4: Super Admin Zero Access on Accounts & Payroll ===');
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

  console.log('\n=== Category 5: Cross-Tenant Isolation & Anonymous Access ===');
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
