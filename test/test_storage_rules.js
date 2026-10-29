const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');

const storageRules = fs.readFileSync(path.resolve(__dirname, '../storage.rules'), 'utf8');
const firestoreRules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');

const SUPER_ADMIN_UID = 'cq647u1GfCXISzf7XMw8pxH76I72';

// Helper to generate byte buffers of specific sizes
function makeBuffer(kb) {
  return Buffer.alloc(Math.round(kb * 1024));
}

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

async function runStorageRulesTests() {
  console.log('========================================================');
  console.log('--- Initializing Storage + Firestore Emulator Test Env ---');
  console.log('========================================================');

  const testEnv = await initializeTestEnvironment({
    projectId: 'ctrl-shift-solutions',
    firestore: {
      rules: firestoreRules,
      host: '127.0.0.1',
      port: 8085
    },
    storage: {
      rules: storageRules,
      host: '127.0.0.1',
      port: 9199
    }
  });

  console.log('--- Seeding Firestore school_access Mappings ---');
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // School 1 admin & teacher
    await db.doc('school_access/admin_school_1').set({
      schoolId: 'school_1',
      role: 'admin',
      authType: 'password'
    });
    await db.doc('school_access/teacher_school_1').set({
      schoolId: 'school_1',
      role: 'teacher',
      teacherId: 'T1'
    });

    // School 2 admin & teacher
    await db.doc('school_access/admin_school_2').set({
      schoolId: 'school_2',
      role: 'admin',
      authType: 'password'
    });
    await db.doc('school_access/teacher_school_2').set({
      schoolId: 'school_2',
      role: 'teacher',
      teacherId: 'T2'
    });
  });

  // Client contexts
  const adminA = testEnv.authenticatedContext('admin_school_1');
  const adminB = testEnv.authenticatedContext('admin_school_2');
  const teacherA = testEnv.authenticatedContext('teacher_school_1');
  const teacherB = testEnv.authenticatedContext('teacher_school_2');
  const superAdmin = testEnv.authenticatedContext(SUPER_ADMIN_UID);
  const unmappedUser = testEnv.authenticatedContext('unmapped_logged_in_uid');
  const anon = testEnv.unauthenticatedContext();

  console.log('\n=== S1: School-A Admin Uploads to schools/school_1/ ===');
  await recordTest('S1.1', 'School-A admin uploads logo (100 KB PNG) → ALLOW', async () => {
    const ref = adminA.storage().ref('schools/school_1/logo.png');
    await assertSucceeds(ref.put(makeBuffer(100), { contentType: 'image/png' }));
  });
  await recordTest('S1.2', 'School-A admin uploads student photo (50 KB JPEG) → ALLOW', async () => {
    const ref = adminA.storage().ref('schools/school_1/students/S1/student.jpg');
    await assertSucceeds(ref.put(makeBuffer(50), { contentType: 'image/jpeg' }));
  });
  await recordTest('S1.3', 'School-A admin reads own logo via SDK getDownloadURL → ALLOW', async () => {
    const ref = adminA.storage().ref('schools/school_1/logo.png');
    await assertSucceeds(ref.getDownloadURL());
  });

  console.log('\n=== S2: Cross-Tenant Isolation: School-B Admin writes to schools/school_1/ ===');
  await recordTest('S2.1', 'School-B admin uploads logo to schools/school_1/ → DENY', async () => {
    const ref = adminB.storage().ref('schools/school_1/logo.png');
    await assertFails(ref.put(makeBuffer(50), { contentType: 'image/png' }));
  });
  await recordTest('S2.2', 'School-B admin writes student photo to schools/school_1/ → DENY', async () => {
    const ref = adminB.storage().ref('schools/school_1/students/S1/student.jpg');
    await assertFails(ref.put(makeBuffer(50), { contentType: 'image/jpeg' }));
  });
  await recordTest('S2.3', 'School-B admin writes to schools/school_1/accounts/ → DENY', async () => {
    const ref = adminB.storage().ref('schools/school_1/accounts/expenses/bill.jpg');
    await assertFails(ref.put(makeBuffer(50), { contentType: 'image/jpeg' }));
  });
  await recordTest('S2.4', 'School-B admin reads schools/school_1/logo.png → DENY', async () => {
    const ref = adminB.storage().ref('schools/school_1/logo.png');
    await assertFails(ref.getDownloadURL());
  });

  console.log('\n=== S3: Anonymous / Unmapped User Writes Anywhere ===');
  await recordTest('S3.1', 'Anonymous write to schools/school_1/logo.png → DENY', async () => {
    const ref = anon.storage().ref('schools/school_1/logo.png');
    await assertFails(ref.put(makeBuffer(10), { contentType: 'image/png' }));
  });
  await recordTest('S3.2', 'Anonymous write to schools/school_1/students/S1/student.jpg → DENY', async () => {
    const ref = anon.storage().ref('schools/school_1/students/S1/student.jpg');
    await assertFails(ref.put(makeBuffer(10), { contentType: 'image/jpeg' }));
  });
  await recordTest('S3.3', 'Anonymous write to schools/school_1/accounts/bill.pdf → DENY', async () => {
    const ref = anon.storage().ref('schools/school_1/accounts/bill.pdf');
    await assertFails(ref.put(makeBuffer(10), { contentType: 'application/pdf' }));
  });
  await recordTest('S3.4', 'Unmapped authenticated user write to schools/school_1/logo.png → DENY', async () => {
    const ref = unmappedUser.storage().ref('schools/school_1/logo.png');
    await assertFails(ref.put(makeBuffer(10), { contentType: 'image/png' }));
  });

  console.log('\n=== S4: Anonymous / Unmapped User Reads schools/school_1/ ===');
  await recordTest('S4.1', 'Anonymous SDK read of schools/school_1/logo.png → DENY', async () => {
    const ref = anon.storage().ref('schools/school_1/logo.png');
    await assertFails(ref.getDownloadURL());
  });
  await recordTest('S4.2', 'Anonymous SDK read of schools/school_1/students/S1/student.jpg → DENY', async () => {
    const ref = anon.storage().ref('schools/school_1/students/S1/student.jpg');
    await assertFails(ref.getDownloadURL());
  });
  await recordTest('S4.3', 'Unmapped authenticated user SDK read of schools/school_1/logo.png → DENY', async () => {
    const ref = unmappedUser.storage().ref('schools/school_1/logo.png');
    await assertFails(ref.getDownloadURL());
  });

  console.log('\n=== S5: Teacher Permissions: Reads Allowed for Same School, Writes DENIED ===');
  await recordTest('S5.1', 'Teacher A reads own school logo (schools/school_1/logo.png) → ALLOW', async () => {
    const ref = teacherA.storage().ref('schools/school_1/logo.png');
    await assertSucceeds(ref.getDownloadURL());
  });
  await recordTest('S5.2', 'Teacher A reads own school student photo → ALLOW', async () => {
    const ref = teacherA.storage().ref('schools/school_1/students/S1/student.jpg');
    await assertSucceeds(ref.getDownloadURL());
  });
  await recordTest('S5.3', 'Teacher A writes to logo (admin-only path) → DENY', async () => {
    const ref = teacherA.storage().ref('schools/school_1/logo.png');
    await assertFails(ref.put(makeBuffer(50), { contentType: 'image/png' }));
  });
  await recordTest('S5.4', 'Teacher A writes to student photo (admin-only path) → DENY', async () => {
    const ref = teacherA.storage().ref('schools/school_1/students/S1/student.jpg');
    await assertFails(ref.put(makeBuffer(50), { contentType: 'image/jpeg' }));
  });
  await recordTest('S5.5', 'Teacher B reads School 1 logo (cross-tenant) → DENY', async () => {
    const ref = teacherB.storage().ref('schools/school_1/logo.png');
    await assertFails(ref.getDownloadURL());
  });

  console.log('\n=== S6: Size and Content-Type Limits on Logo / Photos ===');
  await recordTest('S6.1', 'Admin A uploads oversize logo (> 500 KB, e.g. 520 KB) → DENY', async () => {
    const ref = adminA.storage().ref('schools/school_1/logo.png');
    await assertFails(ref.put(makeBuffer(520), { contentType: 'image/png' }));
  });
  await recordTest('S6.2', 'Admin A uploads non-image file type to logo (e.g. text/plain) → DENY', async () => {
    const ref = adminA.storage().ref('schools/school_1/logo.png');
    await assertFails(ref.put(makeBuffer(50), { contentType: 'text/plain' }));
  });
  await recordTest('S6.3', 'Admin A uploads oversize student photo (> 500 KB, e.g. 550 KB) → DENY', async () => {
    const ref = adminA.storage().ref('schools/school_1/students/S2/student.jpg');
    await assertFails(ref.put(makeBuffer(550), { contentType: 'image/jpeg' }));
  });
  await recordTest('S6.4', 'Admin A uploads PDF as student photo (wrong content type) → DENY', async () => {
    const ref = adminA.storage().ref('schools/school_1/students/S2/student.jpg');
    await assertFails(ref.put(makeBuffer(50), { contentType: 'application/pdf' }));
  });

  console.log('\n=== S7: Accounts Module Size & MIME Restrictions ===');
  await recordTest('S7.1', 'Admin A uploads 250 KB JPG to accounts/expenses/bill.jpg → ALLOW', async () => {
    const ref = adminA.storage().ref('schools/school_1/accounts/expenses/bill.jpg');
    await assertSucceeds(ref.put(makeBuffer(250), { contentType: 'image/jpeg' }));
  });
  await recordTest('S7.2', 'Admin A uploads 400 KB JPG to accounts/expenses/bill2.jpg (> 300 KB image cap) → DENY', async () => {
    const ref = adminA.storage().ref('schools/school_1/accounts/expenses/bill2.jpg');
    await assertFails(ref.put(makeBuffer(400), { contentType: 'image/jpeg' }));
  });
  await recordTest('S7.3', 'Admin A uploads 500 KB PDF to accounts/expenses/invoice.pdf (<= 600 KB PDF cap) → ALLOW', async () => {
    const ref = adminA.storage().ref('schools/school_1/accounts/expenses/invoice.pdf');
    await assertSucceeds(ref.put(makeBuffer(500), { contentType: 'application/pdf' }));
  });
  await recordTest('S7.4', 'Admin A uploads 700 KB PDF to accounts/expenses/audit.pdf (> 600 KB PDF cap) → DENY', async () => {
    const ref = adminA.storage().ref('schools/school_1/accounts/expenses/audit.pdf');
    await assertFails(ref.put(makeBuffer(700), { contentType: 'application/pdf' }));
  });
  await recordTest('S7.5', 'Admin A uploads non-image/non-pdf (text/plain) to accounts/ → DENY', async () => {
    const ref = adminA.storage().ref('schools/school_1/accounts/expenses/note.txt');
    await assertFails(ref.put(makeBuffer(5), { contentType: 'text/plain' }));
  });

  console.log('\n=== S8: Teacher Accounts & Payroll Access (Strict Zero Access) ===');
  await recordTest('S8.1', 'Teacher A reads accounts/expenses/bill.jpg → DENY', async () => {
    const ref = teacherA.storage().ref('schools/school_1/accounts/expenses/bill.jpg');
    await assertFails(ref.getDownloadURL());
  });
  await recordTest('S8.2', 'Teacher A writes to accounts/expenses/bill.jpg → DENY', async () => {
    const ref = teacherA.storage().ref('schools/school_1/accounts/expenses/bill.jpg');
    await assertFails(ref.put(makeBuffer(10), { contentType: 'image/jpeg' }));
  });
  await recordTest('S8.3', 'Teacher A reads payroll/payslips/oct2026.pdf → DENY', async () => {
    const ref = teacherA.storage().ref('schools/school_1/payroll/payslips/oct2026.pdf');
    await assertFails(ref.getDownloadURL());
  });
  await recordTest('S8.4', 'Teacher A writes to payroll/payslips/oct2026.pdf → DENY', async () => {
    const ref = teacherA.storage().ref('schools/school_1/payroll/payslips/oct2026.pdf');
    await assertFails(ref.put(makeBuffer(10), { contentType: 'application/pdf' }));
  });

  console.log('\n=== S9: Super Admin Scoped Permissions ===');
  await recordTest('S9.1', 'Super Admin writes logo to schools/school_1/logo.png → ALLOW', async () => {
    const ref = superAdmin.storage().ref('schools/school_1/logo.png');
    await assertSucceeds(ref.put(makeBuffer(50), { contentType: 'image/png' }));
  });
  await recordTest('S9.2', 'Super Admin reads schools/school_1/students/S1/student.jpg → ALLOW', async () => {
    const ref = superAdmin.storage().ref('schools/school_1/students/S1/student.jpg');
    await assertSucceeds(ref.getDownloadURL());
  });
  await recordTest('S9.3', 'Super Admin reads schools/school_1/accounts/expenses/bill.jpg → DENY', async () => {
    const ref = superAdmin.storage().ref('schools/school_1/accounts/expenses/bill.jpg');
    await assertFails(ref.getDownloadURL());
  });
  await recordTest('S9.4', 'Super Admin writes to schools/school_1/accounts/expenses/hack.jpg → DENY', async () => {
    const ref = superAdmin.storage().ref('schools/school_1/accounts/expenses/hack.jpg');
    await assertFails(ref.put(makeBuffer(50), { contentType: 'image/jpeg' }));
  });
  await recordTest('S9.5', 'Super Admin reads schools/school_1/payroll/payslips/oct2026.pdf → DENY', async () => {
    const ref = superAdmin.storage().ref('schools/school_1/payroll/payslips/oct2026.pdf');
    await assertFails(ref.getDownloadURL());
  });

  console.log('\n=== S10: Unknown Paths and Default Deny ===');
  await recordTest('S10.1', 'Admin A writes to unknown subpath schools/school_1/random/x → DENY', async () => {
    const ref = adminA.storage().ref('schools/school_1/random/x');
    await assertFails(ref.put(makeBuffer(10), { contentType: 'text/plain' }));
  });
  await recordTest('S10.2', 'Admin A writes non-logo file at school root schools/school_1/random.txt → DENY', async () => {
    const ref = adminA.storage().ref('schools/school_1/random.txt');
    await assertFails(ref.put(makeBuffer(10), { contentType: 'text/plain' }));
  });
  await recordTest('S10.3', 'Admin A writes to top-level bucket path other/file.txt → DENY', async () => {
    const ref = adminA.storage().ref('other/file.txt');
    await assertFails(ref.put(makeBuffer(10), { contentType: 'text/plain' }));
  });

  console.log('\n=== S11: Payroll Admin Operations (Parity with Accounts) ===');
  await recordTest('S11.1', 'Admin A uploads 200 KB PDF payslip to payroll/slips/t1.pdf → ALLOW', async () => {
    const ref = adminA.storage().ref('schools/school_1/payroll/slips/t1.pdf');
    await assertSucceeds(ref.put(makeBuffer(200), { contentType: 'application/pdf' }));
  });
  await recordTest('S11.2', 'Admin A reads payroll/slips/t1.pdf → ALLOW', async () => {
    const ref = adminA.storage().ref('schools/school_1/payroll/slips/t1.pdf');
    await assertSucceeds(ref.getDownloadURL());
  });

  console.log('\n========================================');
  console.log(`STORAGE TEST SUMMARY: Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log('========================================');

  await testEnv.cleanup();

  if (failedCount > 0) {
    process.exit(1);
  }
}

runStorageRulesTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
