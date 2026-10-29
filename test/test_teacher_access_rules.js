const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');

const rulesPath = path.resolve(__dirname, '../firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

async function runTests() {
  console.log('--- Initializing Firestore Emulator Test Environment ---');
  const testEnv = await initializeTestEnvironment({
    projectId: 'ctrl-shift-solutions',
    firestore: {
      rules: rulesContent,
      host: '127.0.0.1',
      port: 8085
    }
  });

  console.log('--- Seeding Test Fixtures (Bypassing Rules) ---');
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    
    // 1. school_access mappings
    await db.doc('school_access/admin_school_1').set({ schoolId: 'school_1', role: 'admin' });
    await db.doc('school_access/teacher_school_1').set({ schoolId: 'school_1', role: 'teacher', teacherId: 'T1' });
    await db.doc('school_access/teacher_school_2').set({ schoolId: 'school_2', role: 'teacher', teacherId: 'T2' });

    // 2. tenant_data/school_1 root doc
    await db.doc('tenant_data/school_1').set({
      settings: { schoolName: 'School 1', restructured: true, feeStructures: { '1': { tuition: 500 } } },
      students: [{ id: 'S1', name: 'Student 1' }],
      teachers: [{ id: 'T1', name: 'Teacher 1' }],
      fees: [],
      attendance: [],
      examTerms: { term_1: { name: 'Term 1' } },
      timetable: {},
      teacherAttendance: [],
      attendanceRequests: [],
      teacherCorrectionRequests: [],
      absenceIntimationLog: []
    });

    // 3. Subcollections
    await db.doc('tenant_data/school_1/fees_years/2026/months/2026-10').set({ transactions: [{ id: 'TX1', amount: 100 }] });
    await db.doc('tenant_data/school_1/attendance_months/2026-10/classes/1').set({ records: [] });
    await db.doc('tenant_data/school_1/exam_marks/term_1').set({ '1': { 'A': { 'S1': { total: 95 } } } });
    await db.doc('tenant_data/school_1/students/S1').set({ id: 'S1', name: 'Student 1', schoolId: 'school_1' });
    await db.doc('tenant_data/school_1/student_profiles/S1').set({ aadhaar: '1234' });
    await db.doc('tenant_data/school_1/student_profiles_shared/S1').set({ medical: 'none' });
    await db.doc('tenant_data/school_1/teacher_profiles/T1').set({ phone: '9999' });
    await db.doc('tenant_data/school_1/teacher_profiles/T99').set({ phone: '8888' });
    await db.doc('tenant_data/school_1/fee_activity_logs/LOG1').set({ action: 'fee_collected' });
    await db.doc('tenant_data/school_1/private/credentials').set({ adminPassword: 'xxx' });
    await db.doc('tenant_data/school_1/payroll_payslips/PAY_T1').set({ teacherId: 'T1', salary: 50000 });
    await db.doc('tenant_data/school_1/payroll_payslips/PAY_T2').set({ teacherId: 'T2', salary: 60000 });
    await db.doc('tenant_data/school_1/accounts_vouchers/V1').set({ amount: 5000 });
    await db.doc('tenant_data/school_1/settings/general').set({ timezone: 'IST' });

    // 4. Public school doc
    await db.doc('schools/school_1').set({ school_id: 'school_1', school_name: 'School 1' });
  });

  const teacher1Db = testEnv.authenticatedContext('teacher_school_1').firestore();
  const teacher2Db = testEnv.authenticatedContext('teacher_school_2').firestore();
  const adminDb = testEnv.authenticatedContext('admin_school_1').firestore();
  const superAdminDb = testEnv.authenticatedContext('cq647u1GfCXISzf7XMw8pxH76I72').firestore();
  const anonDb = testEnv.unauthenticatedContext().firestore();

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  \x1b[32m✔ PASS\x1b[0m: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${name}`);
      console.error('    Error:', err.message);
      failed++;
    }
  }

  // Need arrayUnion in client SDK for tests
  // When using @firebase/rules-unit-testing, firebase firestore FieldValue is available
  const { FieldValue } = require('firebase-admin/firestore');

  console.log('\n=== Category A: Teacher Same School (teacher_school_1) ===');
  await test('A1: Teacher can READ root doc (tenant_data/school_1)', async () => {
    await assertSucceeds(teacher1Db.doc('tenant_data/school_1').get());
  });

  await test('A2: Teacher can arrayUnion punch into teacherAttendance on root doc', async () => {
    const punchRecord = { id: 'p1', teacherId: 'T1', type: 'in', time: '08:00', date: '2026-10-29' };
    await assertSucceeds(teacher1Db.doc('tenant_data/school_1').update({
      teacherAttendance: [punchRecord]
    }));
  });

  await test('A3: Teacher can arrayUnion regularization request into attendanceRequests & teacherCorrectionRequests', async () => {
    const req = { id: 'r1', teacherId: 'T1', date: '2026-10-28', status: 'pending' };
    await assertSucceeds(teacher1Db.doc('tenant_data/school_1').update({
      attendanceRequests: [req],
      teacherCorrectionRequests: [req]
    }));
  });

  await test('A4: Teacher can arrayUnion absence intimation log into absenceIntimationLog', async () => {
    const entry = { studentId: 'S1', date: '2026-10-29', status: 'sent', channel: 'whatsapp' };
    await assertSucceeds(teacher1Db.doc('tenant_data/school_1').update({
      absenceIntimationLog: [entry]
    }));
  });

  await test('A5: Teacher update to settings is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1').update({
      'settings.schoolName': 'Hacked Name'
    }));
  });

  await test('A6: Teacher update to feeStructures is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1').update({
      feeStructures: { '1': { tuition: 0 } }
    }));
  });

  await test('A7: Teacher update to teachers roster is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1').update({
      teachers: [{ id: 'T1', name: 'Altered Teacher' }]
    }));
  });

  await test('A8: Teacher whole-store setDoc merge on root doc is DENIED', async () => {
    const wholePayload = {
      settings: { schoolName: 'School 1 (Modified)', restructured: true },
      students: [{ id: 'S1', name: 'Student 1' }],
      teachers: [{ id: 'T1', name: 'Teacher 1' }],
      teacherAttendance: [{ id: 'p1', type: 'in' }],
      attendance: [],
      fees: [],
      lastModified: Date.now()
    };
    await assertFails(teacher1Db.doc('tenant_data/school_1').set(wholePayload, { merge: true }));
  });

  await test('A9: Teacher READ of fees_years is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/fees_years/2026/months/2026-10').get());
  });

  await test('A10: Teacher WRITE to fees_years is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/fees_years/2026/months/2026-10').set({
      transactions: [{ id: 'HACK', amount: 0 }]
    }));
  });

  await test('A11: Teacher can READ attendance_months', async () => {
    await assertSucceeds(teacher1Db.doc('tenant_data/school_1/attendance_months/2026-10/classes/1').get());
  });

  await test('A12: Teacher can WRITE attendance_months', async () => {
    await assertSucceeds(teacher1Db.doc('tenant_data/school_1/attendance_months/2026-10/classes/1').set({
      records: [{ studentId: 'S1', status: 'present' }]
    }));
  });

  await test('A13: Teacher can READ exam_marks', async () => {
    await assertSucceeds(teacher1Db.doc('tenant_data/school_1/exam_marks/term_1').get());
  });

  await test('A14: Teacher can WRITE exam_marks', async () => {
    await assertSucceeds(teacher1Db.doc('tenant_data/school_1/exam_marks/term_1').update({
      '1.A.S1.total': 99
    }));
  });

  await test('A15: Teacher can READ core students subcollection', async () => {
    await assertSucceeds(teacher1Db.doc('tenant_data/school_1/students/S1').get());
  });

  await test('A16: Teacher WRITE to core students subcollection is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/students/S1').update({
      name: 'Tampered Student'
    }));
  });

  await test('A17: Teacher READ of private student_profiles is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/student_profiles/S1').get());
  });

  await test('A18: Teacher can READ student_profiles_shared', async () => {
    await assertSucceeds(teacher1Db.doc('tenant_data/school_1/student_profiles_shared/S1').get());
  });

  await test('A19: Teacher WRITE to student_profiles_shared is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/student_profiles_shared/S1').update({
      medical: 'altered'
    }));
  });

  await test('A20: Teacher can READ own teacher_profiles (T1)', async () => {
    await assertSucceeds(teacher1Db.doc('tenant_data/school_1/teacher_profiles/T1').get());
  });

  await test('A21: Teacher READ of another teacher_profiles (T99) is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/teacher_profiles/T99').get());
  });

  await test('A22: Teacher WRITE to teacher_profiles is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/teacher_profiles/T1').set({
      phone: '0000000000'
    }));
  });

  await test('A23: Teacher READ of fee_activity_logs is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/fee_activity_logs/LOG1').get());
  });

  await test('A24: Teacher READ of private subcollection is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/private/credentials').get());
  });

  await test('A25: Teacher can READ own payroll_payslips (PAY_T1 for T1)', async () => {
    await assertSucceeds(teacher1Db.doc('tenant_data/school_1/payroll_payslips/PAY_T1').get());
  });

  await test('A26: Teacher READ of another teacher payslip (PAY_T2) is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/payroll_payslips/PAY_T2').get());
  });

  await test('A27: Teacher WRITE to payroll_payslips is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/payroll_payslips/PAY_T1').set({
      teacherId: 'T1',
      salary: 1000000
    }));
  });

  await test('A28: Teacher READ of accounts_* (accounts_vouchers) is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/accounts_vouchers/V1').get());
  });

  await test('A29: Teacher WRITE to settings subcollection is DENIED', async () => {
    await assertFails(teacher1Db.doc('tenant_data/school_1/settings/general').set({ timezone: 'GMT' }));
  });

  console.log('\n=== Category B: School Admin (admin_school_1) ===');
  await test('B1: Admin can READ root doc', async () => {
    await assertSucceeds(adminDb.doc('tenant_data/school_1').get());
  });

  await test('B2: Admin can UPDATE root doc settings', async () => {
    await assertSucceeds(adminDb.doc('tenant_data/school_1').update({
      'settings.schoolName': 'School 1 Renamed By Admin'
    }));
  });

  await test('B3: Admin can READ fees_years', async () => {
    await assertSucceeds(adminDb.doc('tenant_data/school_1/fees_years/2026/months/2026-10').get());
  });

  await test('B4: Admin can WRITE fees_years with validFeeMonthDoc', async () => {
    await assertSucceeds(adminDb.doc('tenant_data/school_1/fees_years/2026/months/2026-10').set({
      transactions: [{ id: 'TX2', amount: 200 }]
    }));
  });

  await test('B5: Admin can READ & WRITE attendance_months', async () => {
    await assertSucceeds(adminDb.doc('tenant_data/school_1/attendance_months/2026-10/classes/1').get());
    await assertSucceeds(adminDb.doc('tenant_data/school_1/attendance_months/2026-10/classes/1').set({
      records: [{ studentId: 'S1', status: 'late' }]
    }));
  });

  await test('B6: Admin can READ & WRITE exam_marks', async () => {
    await assertSucceeds(adminDb.doc('tenant_data/school_1/exam_marks/term_1').get());
    await assertSucceeds(adminDb.doc('tenant_data/school_1/exam_marks/term_1').update({
      '1.A.S1.total': 100
    }));
  });

  await test('B7: Admin can WRITE core students subcollection', async () => {
    await assertSucceeds(adminDb.doc('tenant_data/school_1/students/S2').set({
      id: 'S2',
      name: 'Student 2',
      schoolId: 'school_1'
    }));
  });

  await test('B8: Admin can READ & WRITE student_profiles (private)', async () => {
    await assertSucceeds(adminDb.doc('tenant_data/school_1/student_profiles/S1').get());
    await assertSucceeds(adminDb.doc('tenant_data/school_1/student_profiles/S1').update({ aadhaar: '5678' }));
  });

  await test('B9: Admin can READ & WRITE fee_activity_logs', async () => {
    await assertSucceeds(adminDb.doc('tenant_data/school_1/fee_activity_logs/LOG1').get());
    await assertSucceeds(adminDb.doc('tenant_data/school_1/fee_activity_logs/LOG2').set({ action: 'fee_void' }));
  });

  await test('B10: Admin can READ & WRITE accounts_* vouchers', async () => {
    await assertSucceeds(adminDb.doc('tenant_data/school_1/accounts_vouchers/V1').get());
    await assertSucceeds(adminDb.doc('tenant_data/school_1/accounts_vouchers/V2').set({ amount: 12000 }));
  });

  await test('B11: Admin can READ all payroll_payslips (both T1 and T2)', async () => {
    await assertSucceeds(adminDb.doc('tenant_data/school_1/payroll_payslips/PAY_T1').get());
    await assertSucceeds(adminDb.doc('tenant_data/school_1/payroll_payslips/PAY_T2').get());
  });

  await test('B12: Admin can WRITE payroll_payslips', async () => {
    await assertSucceeds(adminDb.doc('tenant_data/school_1/payroll_payslips/PAY_T3').set({
      teacherId: 'T3',
      salary: 45000
    }));
  });

  console.log('\n=== Category C: Cross-Tenant Isolation (Teacher School 2) ===');
  await test('C1: Teacher 2 READ of School 1 root doc is DENIED', async () => {
    await assertFails(teacher2Db.doc('tenant_data/school_1').get());
  });

  await test('C2: Teacher 2 WRITE to School 1 root doc is DENIED', async () => {
    await assertFails(teacher2Db.doc('tenant_data/school_1').update({
      teacherAttendance: [{ id: 'p2', teacherId: 'T2', type: 'in' }]
    }));
  });

  await test('C3: Teacher 2 READ of School 1 attendance_months is DENIED', async () => {
    await assertFails(teacher2Db.doc('tenant_data/school_1/attendance_months/2026-10/classes/1').get());
  });

  await test('C4: Teacher 2 READ of School 1 exam_marks is DENIED', async () => {
    await assertFails(teacher2Db.doc('tenant_data/school_1/exam_marks/term_1').get());
  });

  await test('C5: Teacher 2 READ of School 1 students is DENIED', async () => {
    await assertFails(teacher2Db.doc('tenant_data/school_1/students/S1').get());
  });

  console.log('\n=== Category D: Anonymous / Unauthenticated ===');
  await test('D1: Anonymous READ of root doc is DENIED', async () => {
    await assertFails(anonDb.doc('tenant_data/school_1').get());
  });

  await test('D2: Anonymous WRITE to root doc is DENIED', async () => {
    await assertFails(anonDb.doc('tenant_data/school_1').set({ hacked: true }));
  });

  await test('D3: Anonymous READ of fees_years is DENIED', async () => {
    await assertFails(anonDb.doc('tenant_data/school_1/fees_years/2026/months/2026-10').get());
  });

  await test('D4: Anonymous can READ public schools registry', async () => {
    await assertSucceeds(anonDb.doc('schools/school_1').get());
  });

  await test('D5: Anonymous READ of registrations is DENIED', async () => {
    await assertFails(anonDb.doc('registrations/reg_1').get());
  });

  console.log('\n========================================');
  console.log(`EMULATOR TEST SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('========================================');

  await testEnv.cleanup();

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error during emulator test execution:', err);
  process.exit(1);
});
