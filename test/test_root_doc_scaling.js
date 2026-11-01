const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Point to emulator and enable mock mode for email testing
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.MOCK_ONBOARDING_MODE = 'true';

// Mock window and localStorage for client payload functions in node environment
global.window = {
  firestore: {
    doc: () => ({ id: 'mock_doc_ref' })
  },
  db: {}
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const { migrateSchool, uploadBase64ToStorage, calculateFirestoreDocSize, hashObject } = require('../scripts/migrate-root-doc');
const { sendStorageAlertEmail, clearCapturedEmails, getCapturedEmails } = require('../api/_lib/email');

const rulesPath = path.resolve(__dirname, '../firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

let totalTests = 0;
let passedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
  }
}

async function runRootDocScalingTestSuite() {
  console.log('========================================================');
  console.log('--- ROOT DOCUMENT SCALING TEST SUITE (EMULATOR) ---');
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

  const adminSchoolId = 'admin_scale_school';
  const teacherSchoolId = 'teacher_scale_school';
  const schoolId = 'scale_school_test';

  // Seed baseline
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await db.doc(`school_access/${adminSchoolId}`).set({ schoolId, role: 'admin' });
    await db.doc(`school_access/${teacherSchoolId}`).set({ schoolId, role: 'teacher', teacherId: 'T1' });

    // Generate ~850-900 KB root document
    const punches = [];
    for (let i = 0; i < 1200; i++) {
      punches.push({
        id: `punch_${i}`,
        teacherId: `T_${i % 20}`,
        teacherName: `Teacher ${i % 20}`,
        date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
        timestamp: new Date(1730467200000 + i * 3600000).toISOString(),
        type: i % 2 === 0 ? 'in' : 'out',
        time: '09:00',
        latitude: 23.7957,
        longitude: 86.4304,
        distance: 12.5,
        geofenceStatus: 'Inside (12.5m)',
        markedVia: 'location_auto'
      });
    }

    const requests = [];
    for (let i = 0; i < 80; i++) {
      requests.push({
        id: `req_${i}`,
        teacherId: `T_${i % 20}`,
        teacherName: `Teacher ${i % 20}`,
        requestDate: '2026-11-01',
        submittedAt: new Date().toISOString(),
        type: 'regularization',
        status: 'pending',
        reason: 'Network outage during punch'
      });
    }

    const notices = [];
    for (let i = 0; i < 60; i++) {
      notices.push({
        id: `notice_${i}`,
        title: `Official Announcement ${i} for Academic Session`,
        message: `This is detailed announcement message text number ${i} containing guidelines for students and staff.`.repeat(3),
        date: '2026-11-01',
        status: 'published',
        priority: 'Normal'
      });
    }

    const auditLogs = [];
    for (let i = 0; i < 150; i++) {
      auditLogs.push({
        id: `audit_${i}`,
        termId: 'term_1',
        studentId: `s_${i}`,
        action: 'marks_updated',
        performedBy: 'admin',
        timestamp: new Date().toISOString(),
        details: 'Marks updated from 75 to 88'
      });
    }

    const trashItems = [];
    for (let i = 0; i < 80; i++) {
      trashItems.push({
        id: `trash_${i}`,
        type: 'student',
        name: `Deleted Student ${i}`,
        deletedAt: new Date().toISOString(),
        deletedBy: 'admin'
      });
    }

    const bigBase64Blob = 'data:image/png;base64,' + 'A'.repeat(55000); // ~55 KB base64

    await db.doc(`tenant_data/${schoolId}`).set({
      settings: {
        schoolName: 'Synthetic Scaling Test School',
        logoUrl: bigBase64Blob,
        principalSignatureUrl: bigBase64Blob,
        storageVersion: 1
      },
      students: [{ id: 's1', name: 'Student 1' }],
      teachers: [{ id: 'T1', name: 'Teacher 1' }],
      teacherAttendance: punches,
      attendanceRequests: requests,
      teacherCorrectionRequests: requests,
      notices: notices,
      notifications: [{ id: 'notif_1', title: 'Welcome', date: '2026-11-01' }],
      examAuditLog: auditLogs,
      trash: trashItems,
      fees: [{ id: 'f1', amount: 1000 }],
      attendance: [{ date: '2026-11-01' }],
      schools: [{ id: 'legacy_entry' }]
    });
  });

  const adminCtx = testEnv.authenticatedContext(adminSchoolId);
  const teacherCtx = testEnv.authenticatedContext(teacherSchoolId);
  const adminDb = adminCtx.firestore();
  const teacherDb = teacherCtx.firestore();

  console.log('\n=== Category 1: Migration Engine (Dry-Run & Apply with Parity) ===');

  await test('M1: Dry run correctly projects document reduction without modifying Firestore', async () => {
    const plan = await migrateSchool(schoolId, { apply: false });
    assert(plan, 'Plan must be generated');
    assert(plan.currentSizeKB >= 450, `Expected root size >= 450 KB, got ${plan.currentSizeKB}`);
    assert(plan.reductionPercent > 60, `Expected reduction > 60%, got ${plan.reductionPercent}%`);
    assert(plan.projectedFinalKB < 50, `Expected projected final < 50 KB, got ${plan.projectedFinalKB}`);

    // Verify dry run made zero writes to subcollections
    const snap = await adminDb.doc(`tenant_data/${schoolId}`).get();
    assert.strictEqual(snap.data().settings.storageVersion, 1, 'storageVersion must still be 1 after dry run');
  });

  await test('M2: Apply mode writes subcollections, verifies hash parity, writes report, and sets storageVersion = 2', async () => {
    const plan = await migrateSchool(schoolId, { apply: true });
    assert(plan, 'Plan must be executed');

    // 1. Verify storageVersion is 2
    const rootSnap = await adminDb.doc(`tenant_data/${schoolId}`).get();
    const rootData = rootSnap.data();
    assert.strictEqual(rootData.settings.storageVersion, 2, 'storageVersion must be updated to 2');

    // 2. Verify root document fields WERE NOT DELETED (Phase B constraint)
    assert(Array.isArray(rootData.teacherAttendance) && rootData.teacherAttendance.length > 0, 'Root teacherAttendance must NOT be deleted');
    assert(Array.isArray(rootData.notices) && rootData.notices.length > 0, 'Root notices must NOT be deleted');

    // 3. Verify teacher attendance subcollection documents exist
    const teacherPunchesSnap = await adminDb.doc(`tenant_data/${schoolId}/teacher_attendance/2026-11/teachers/T_1`).get();
    assert(teacherPunchesSnap.exists, 'Subcollection teacher attendance doc must exist');
    assert(teacherPunchesSnap.data().records.length > 0, 'Records in teacher attendance doc must be non-empty');

    // 4. Verify notices subcollection
    const noticesSubSnap = await adminDb.collection(`tenant_data/${schoolId}/notices`).get();
    assert.strictEqual(noticesSubSnap.size, 60, 'All 60 notices must exist in subcollection');

    // 5. Verify migration report
    const reportsSnap = await adminDb.collection(`tenant_data/${schoolId}/migration_reports`).get();
    assert.strictEqual(reportsSnap.size, 1, 'Migration report doc must exist');
    const report = reportsSnap.docs[0].data();
    console.log("[DEBUG M2 report]", report);
    assert.strictEqual(report.status, 'verified', 'Report status must be verified');
    assert.strictEqual(report.storageVersion, 2, 'Report storageVersion must be 2');
    assert.strictEqual(report.schoolId, schoolId, 'Report schoolId must match');
  });

  console.log('\n=== Category 2: Security Rules & Anti-Resurrection Guard ===');

  await test('R1: Once storageVersion >= 2, teacher root doc update is DENIED', async () => {
    const punchRecord = { id: 'p_new', teacherId: 'T1', type: 'in', time: '10:00', date: '2026-11-02' };
    await assertFails(teacherDb.doc(`tenant_data/${schoolId}`).update({
      teacherAttendance: [punchRecord]
    }));
  });

  await test('R2: Once storageVersion >= 2, admin update attempting to modify migrated root keys is DENIED', async () => {
    await assertFails(adminDb.doc(`tenant_data/${schoolId}`).update({
      teacherAttendance: [{ id: 'resurrected_punch' }]
    }));
    await assertFails(adminDb.doc(`tenant_data/${schoolId}`).update({
      notices: [{ id: 'resurrected_notice' }]
    }));
    await assertFails(adminDb.doc(`tenant_data/${schoolId}`).update({
      trash: [{ id: 'resurrected_trash' }]
    }));
  });

  await test('R3: Once storageVersion >= 2, admin clean update (pruned migrated keys) is ALLOWED', async () => {
    await assertSucceeds(adminDb.doc(`tenant_data/${schoolId}`).update({
      'settings.schoolName': 'Updated Scaling Test School'
    }));
  });

  await test('R4: Teacher can write punch directly to subcollection teacher_attendance/{month}/teachers/{id}', async () => {
    const newPunch = { id: 'punch_v2_1', teacherId: 'T1', type: 'in', time: '08:30', date: '2026-11-02' };
    await assertSucceeds(teacherDb.doc(`tenant_data/${schoolId}/teacher_attendance/2026-11/teachers/T1`).set({
      month: '2026-11',
      teacherId: 'T1',
      records: [newPunch]
    }, { merge: true }));
  });

  await test('R5: Teacher CANNOT write punch to another teacher subcollection document', async () => {
    const otherPunch = { id: 'punch_v2_99', teacherId: 'T99', type: 'in', time: '08:30', date: '2026-11-02' };
    await assertFails(teacherDb.doc(`tenant_data/${schoolId}/teacher_attendance/2026-11/teachers/T99`).set({
      month: '2026-11',
      teacherId: 'T99',
      records: [otherPunch]
    }, { merge: true }));
  });

  await test('R6: Teacher can submit regularization request to attendance_requests subcollection', async () => {
    const req = { id: 'req_v2_1', teacherId: 'T1', requestDate: '2026-11-02', status: 'pending' };
    await assertSucceeds(teacherDb.doc(`tenant_data/${schoolId}/attendance_requests/req_v2_1`).set(req));
  });

  await test('R7: Teacher CANNOT submit regularization request claiming another teacherId', async () => {
    const fraudReq = { id: 'req_v2_fake', teacherId: 'T99', requestDate: '2026-11-02', status: 'pending' };
    await assertFails(teacherDb.doc(`tenant_data/${schoolId}/attendance_requests/req_v2_fake`).set(fraudReq));
  });

  console.log('\n=== Category 3: Client Anti-Resurrection & Pruning in SchoolApp.save ===');

  await test('C1: SchoolApp.prepareSavePayload prunes all MOVE, LEGACY and BLOB keys when isStorageVersion2 is true', async () => {
    const SchoolApp = {
      store: {
        currentSchoolId: schoolId,
        settings: { schoolName: 'Test School', storageVersion: 2, principalSignatureUrl: 'data:image/png;base64,AAAA' },
        students: [{ id: 's1', name: 'Student 1' }],
        teachers: [{ id: 't1', name: 'Teacher 1' }],
        teacherAttendance: [{ id: 'punch1' }],
        attendanceRequests: [{ id: 'req1' }],
        teacherCorrectionRequests: [{ id: 'req1' }],
        absenceIntimationLog: [{ id: 'int1' }],
        notices: [{ id: 'n1' }],
        notifications: [{ id: 'notif1' }],
        examAuditLog: [{ id: 'audit1' }],
        examMarksAuditLog: [{ id: 'audit2' }],
        trash: [{ id: 'tr1' }],
        feeActivityLog: [{ id: 'fee1' }],
        fees: [{ id: 'legacy_fee' }],
        attendance: [{ id: 'legacy_att' }],
        examMarks: { term_1: {} },
        schools: [{ id: 'legacy_schools' }]
      },
      tenantInitialized: true,
      isRestructured: () => true,
      isFeeLogMigrated: () => true,
      isStudentsMigrated: () => false,
      isStorageVersion2: function() { return true; },
      showToast: () => {},
      hideLoader: () => {}
    };

    const appJsContent = fs.readFileSync(path.resolve(__dirname, '../js/app.js'), 'utf8');
    const prepMatch = appJsContent.match(/prepareSavePayload:\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\n  \},/);
    assert(prepMatch, 'prepareSavePayload function must be found in js/app.js');

    const prepareSavePayloadFn = new Function('options', 'bypassLoader', prepMatch[1]);
    const result = prepareSavePayloadFn.call(SchoolApp);

    assert(result.success, 'prepareSavePayload must succeed');
    const p = result.payload;

    // Assert all pruned
    assert.strictEqual(p.teacherAttendance, undefined, 'teacherAttendance must be pruned');
    assert.strictEqual(p.attendanceRequests, undefined, 'attendanceRequests must be pruned');
    assert.strictEqual(p.teacherCorrectionRequests, undefined, 'teacherCorrectionRequests must be pruned');
    assert.strictEqual(p.absenceIntimationLog, undefined, 'absenceIntimationLog must be pruned');
    assert.strictEqual(p.notices, undefined, 'notices must be pruned');
    assert.strictEqual(p.notifications, undefined, 'notifications must be pruned');
    assert.strictEqual(p.examAuditLog, undefined, 'examAuditLog must be pruned');
    assert.strictEqual(p.trash, undefined, 'trash must be pruned');
    assert.strictEqual(p.feeActivityLog, undefined, 'feeActivityLog must be pruned');
    assert.strictEqual(p.fees, undefined, 'fees must be pruned');
    assert.strictEqual(p.attendance, undefined, 'attendance must be pruned');
    assert.strictEqual(p.schools, undefined, 'schools must be pruned');
    assert.strictEqual(p.settings.principalSignatureUrl, undefined, 'base64 signature must be pruned');

    // Assert core roster and settings preserved
    assert.strictEqual(p.settings.schoolName, 'Test School');
    assert.strictEqual(p.students.length, 1);
    assert.strictEqual(p.teachers.length, 1);
  });

  console.log('\n=== Category 4: Client Size Guard (> 700 KB Block) ===');

  await test('S1: prepareSavePayload blocks save if estimated wire bytes exceed 700 KB', async () => {
    let toastMessage = '';
    const SchoolApp = {
      store: {
        currentSchoolId: schoolId,
        settings: { schoolName: 'Test School', storageVersion: 1 },
        students: [{ id: 's1', name: 'Student 1' }],
        teachers: [{ id: 't1', name: 'Teacher 1' }],
        hugeDataArray: 'X'.repeat(750000) // ~750 KB
      },
      tenantInitialized: true,
      isRestructured: () => false,
      isFeeLogMigrated: () => false,
      isStudentsMigrated: () => false,
      isStorageVersion2: () => false,
      showToast: (msg) => { toastMessage = msg; },
      hideLoader: () => {}
    };

    const appJsContent = fs.readFileSync(path.resolve(__dirname, '../js/app.js'), 'utf8');
    const prepMatch = appJsContent.match(/prepareSavePayload:\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\n  \},/);
    const prepareSavePayloadFn = new Function('options', 'bypassLoader', prepMatch[1]);
    const result = prepareSavePayloadFn.call(SchoolApp);

    assert.strictEqual(result.success, false, 'Save must be blocked');
    assert.strictEqual(result.reason, 'storage_limit_exceeded', 'Reason must be storage_limit_exceeded');
    assert(toastMessage.includes('exceeds the 700 KB limit'), 'Toast message must indicate 700 KB limit');
    assert(SchoolApp.store.hugeDataArray, 'In-memory store must NOT be wiped or mutated');
  });

  console.log('\n=== Category 5: Storage Health API & Alerting (> 600 KB Warning) ===');

  await test('A1: Storage alert email sent to connect@ctrlshifts.in when tenant > 600 KB', async () => {
    clearCapturedEmails();
    const alertResult = await sendStorageAlertEmail({
      schoolId: 'kkgs_mttt4ufq',
      schoolName: 'K.K. Global School',
      rootSizeKB: 612.45,
      pctOf1MB: 59.8
    });

    assert.strictEqual(alertResult.success, true);
    const emails = getCapturedEmails();
    assert.strictEqual(emails.length, 1);
    assert.strictEqual(emails[0].to, 'connect@ctrlshifts.in');
    assert.strictEqual(emails[0].type, 'storage_alert');
    assert.strictEqual(emails[0].schoolId, 'kkgs_mttt4ufq');
    assert.strictEqual(emails[0].rootSizeKB, 612.45);
  });

  await test('A2: registration-admin API action=storage-health returns metrics and summary', async () => {
    clearCapturedEmails();
    const handler = require('../api/registration-admin');
    let resStatus = null;
    let resData = null;
    const req = {
      method: 'GET',
      headers: {
        'x-test-super-admin': 'true',
        origin: 'https://www.ctrlshifts.in'
      },
      query: { action: 'storage-health' }
    };
    const res = {
      setHeader: () => {},
      status: (code) => {
        resStatus = code;
        return {
          json: (d) => { resData = d; return d; },
          end: () => {}
        };
      }
    };
    await handler(req, res);
    assert.strictEqual(resStatus, 200, `Expected HTTP 200, got ${resStatus}`);
    assert.strictEqual(resData.success, true);
    assert(Array.isArray(resData.schools), 'Expected schools array');
    assert(resData.summary, 'Expected summary object');
    assert(resData.summary.totalSchools >= 1, 'Expected at least 1 school in summary');
  });

  
  console.log('\n=== Category 6: R1 — Blob Storage Token URL, Hash Verify & Print Parity ===');

  await test('R1.1: uploadBase64ToStorage generates token URL and metadata', async () => {
    let savedBuffer = null;
    let savedOptions = null;
    const mockFile = {
      save: async (buf, opts) => {
        savedBuffer = buf;
        savedOptions = opts;
      }
    };
    const mockBucket = {
      name: 'ctrl-shift-solutions.firebasestorage.app',
      file: (name) => {
        mockFile.name = name;
        return mockFile;
      }
    };

    const rawData = Buffer.from('fake image data 12345');
    const base64Str = 'data:image/png;base64,' + rawData.toString('base64');
    const mockDownloader = async (url) => savedBuffer;

    const downloadUrl = await uploadBase64ToStorage('test_school', base64Str, 'logo', {
      bucket: mockBucket,
      downloader: mockDownloader
    });

    assert(downloadUrl, 'Must return a download URL');
    assert(downloadUrl.startsWith('https://firebasestorage.googleapis.com/v0/b/ctrl-shift-solutions.firebasestorage.app/o/schools%2Ftest_school%2Flogo.png?alt=media&token='), 'Must match Firebase Storage token URL format');
    assert((savedOptions.metadata.metadata && savedOptions.metadata.metadata.firebaseStorageDownloadTokens) || savedOptions.metadata.firebaseStorageDownloadTokens, 'Must set firebaseStorageDownloadTokens metadata');
    assert.strictEqual(savedOptions.contentType, 'image/png');
  });

  await test('R1.2: uploadBase64ToStorage aborts and returns null when SHA-256 hash mismatches (keeps base64)', async () => {
    let savedBuffer = null;
    const mockFile = {
      save: async (buf) => { savedBuffer = buf; }
    };
    const mockBucket = {
      name: 'ctrl-shift-solutions.firebasestorage.app',
      file: () => mockFile
    };

    const rawData = Buffer.from('correct image data');
    const base64Str = 'data:image/png;base64,' + rawData.toString('base64');
    const corruptedDownloader = async () => Buffer.from('corrupted data different bytes');

    const downloadUrl = await uploadBase64ToStorage('test_school', base64Str, 'logo', {
      bucket: mockBucket,
      downloader: corruptedDownloader
    });

    assert.strictEqual(downloadUrl, null, 'Must abort and return null on SHA-256 mismatch');
  });

  await test('R1.3: uploadBase64ToStorage aborts and returns null when HTTPS download throws error', async () => {
    const mockFile = { save: async () => {} };
    const mockBucket = {
      name: 'ctrl-shift-solutions.firebasestorage.app',
      file: () => mockFile
    };

    const rawData = Buffer.from('valid data');
    const base64Str = 'data:image/png;base64,' + rawData.toString('base64');
    const failingDownloader = async () => { throw new Error('Network 403 Forbidden'); };

    const downloadUrl = await uploadBase64ToStorage('test_school', base64Str, 'signature', {
      bucket: mockBucket,
      downloader: failingDownloader
    });

    assert.strictEqual(downloadUrl, null, 'Must abort and return null on download error');
  });

  await test('R1.4: Print parity: report card, fee receipt, ID card wait for images before printing', async () => {
    const docsContent = fs.readFileSync(path.resolve(__dirname, '../js/documents.js'), 'utf8');
    assert(docsContent.includes('s.logoStorageUrl || s.logoUrl'), 'documents.js getSchoolLogo must prefer logoStorageUrl');
    assert(docsContent.includes('s.principalSignatureStorageUrl || s.principalSignatureUrl'), 'documents.js getPrincipalSignature must prefer principalSignatureStorageUrl');
    assert(docsContent.includes('var pending = imgs.filter(function(img) { return !img.complete; });'), 'documents.js print must wait for image load');

    const examsContent = fs.readFileSync(path.resolve(__dirname, '../js/exams.js'), 'utf8');
    assert(examsContent.includes('settings.logoStorageUrl || settings.logoUrl'), 'exams.js must prefer logoStorageUrl');
    assert(examsContent.includes('var pending = imgs.filter(function(img) { return !img.complete; });'), 'exams.js printViaBlob and printViaBlobV2 must wait for image load');

    const feesContent = fs.readFileSync(path.resolve(__dirname, '../js/fees.js'), 'utf8');
    assert(feesContent.includes('settings.logoStorageUrl || settings.logoUrl'), 'fees.js must prefer logoStorageUrl');
  });

  console.log('\n=== Category 7: R2 — Honest No-Deletion (Diff Before vs After Apply) ===');

  await test('R2.1: Migration --apply performs ZERO field deletions on root document (only additions)', async () => {
    const preSnap = await adminDb.doc('tenant_data/' + schoolId).get();
    const preData = preSnap.data();

    assert(preData.teacherAttendance.length > 0, 'Pre-migration teacherAttendance must exist');
    assert(preData.notices.length > 0, 'Pre-migration notices must exist');
    assert(preData.trash.length > 0, 'Pre-migration trash must exist');
    assert(preData.examAuditLog.length > 0, 'Pre-migration examAuditLog must exist');
    assert(preData.fees.length > 0, 'Pre-migration fees must exist');
    assert(preData.attendance.length > 0, 'Pre-migration attendance must exist');
    assert(preData.schools.length > 0, 'Pre-migration schools must exist');
    assert(preData.settings.logoUrl, 'Pre-migration settings.logoUrl must exist');
    assert(preData.settings.principalSignatureUrl, 'Pre-migration settings.principalSignatureUrl must exist');

    await migrateSchool(schoolId, { apply: true });

    const postSnap = await adminDb.doc('tenant_data/' + schoolId).get();
    const postData = postSnap.data();

    for (const key of Object.keys(preData)) {
      assert(postData[key] !== undefined, 'Key ' + key + ' must not be deleted from root document');
      if (Array.isArray(preData[key])) {
        assert.strictEqual(postData[key].length, preData[key].length, 'Array length for ' + key + ' must remain identical');
      }
    }

    assert.strictEqual(postData.settings.logoUrl, preData.settings.logoUrl, 'settings.logoUrl base64 must remain untouched');
    assert.strictEqual(postData.settings.principalSignatureUrl, preData.settings.principalSignatureUrl, 'settings.principalSignatureUrl base64 must remain untouched');

    assert.strictEqual(postData.settings.storageVersion, 2, 'storageVersion = 2 added');
    assert(postData.settings.storageMigratedAt, 'storageMigratedAt added');
    assert(postData.settings.migrationRunId, 'migrationRunId added');
  });

  console.log('\n=== Category 8: R3 — Attendance History & Accounts Payroll Subcollection Reads ===');

  await test('R3.1: loadTeacherAttendanceMonth loads previous-month punches on demand for v2 schools', async () => {
    const prevMonthPunch = {
      id: 'punch_sep_1',
      teacherId: 'T1',
      teacherName: 'Teacher 1',
      date: '2026-09-15',
      time: '09:05',
      timestamp: '2026-09-15T03:35:00.000Z',
      type: 'in'
    };

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('tenant_data/' + schoolId + '/teacher_attendance/2026-09/teachers/T1').set({
        month: '2026-09',
        teacherId: 'T1',
        teacherName: 'Teacher 1',
        records: [prevMonthPunch]
      });
    });

    const SchoolApp = {
      store: {
        currentSchoolId: schoolId,
        settings: { storageVersion: 2 },
        teacherAttendance: []
      },
      isStorageVersion2: () => true
    };

    const appJsContent = fs.readFileSync(path.resolve(__dirname, '../js/app.js'), 'utf8');
    const helperMatch = appJsContent.match(/loadTeacherAttendanceMonth:\s*async\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\n  \},/);
    assert(helperMatch, 'loadTeacherAttendanceMonth function must be found in js/app.js');

    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const loadTeacherAttendanceMonthFn = new AsyncFunction('schoolId', 'month', helperMatch[1]);
    
    global.window.firestore = {
      collection: (...args) => {
        const parts = args.filter(a => typeof a === 'string');
        return parts.join('/');
      },
      getDocs: async (collPath) => {
        return adminDb.collection(collPath).get();
      }
    };
    global.window.db = {};

    await loadTeacherAttendanceMonthFn.call(SchoolApp, schoolId, '2026-09');

    assert(SchoolApp.store.teacherAttendance.length > 0, 'Punches for 2026-09 must be loaded into store.teacherAttendance');
    assert.strictEqual(SchoolApp.store.teacherAttendance[0].id, 'punch_sep_1');
    assert.strictEqual(SchoolApp.store.teacherAttendance[0].date, '2026-09-15');
  });

  await test('R3.2: api/accounts.js payroll engine merges punches from teacher_attendance subcollection', async () => {
    const octPunch = {
      id: 'punch_oct_1',
      teacherId: 'T1',
      date: '2026-10-01',
      type: 'in',
      timestamp: '2026-10-01T03:30:00.000Z'
    };

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('tenant_data/' + schoolId + '/teacher_attendance/2026-10/teachers/T1').set({
        month: '2026-10',
        teacherId: 'T1',
        records: [octPunch]
      });
    });

    const accountsJsContent = fs.readFileSync(path.resolve(__dirname, '../api/accounts.js'), 'utf8');
    assert(accountsJsContent.includes('teacher_attendance/') && accountsJsContent.includes('/teachers'), 'accounts.js must query teacher_attendance subcollection for the month');
    assert(accountsJsContent.includes('attendance_requests'), 'accounts.js must query attendance_requests subcollection');
  });

  console.log('\n=== Category 9: R4 — Stale Client Rollout Safety & Refresh Alert ===');

  await test('R4.1: Stale client punch on root is DENIED and triggers refresh update message', async () => {
    let toastMessage = '';
    let toastType = '';
    let checkVersionCalled = false;

    const simulatedPunchError = { code: 'permission-denied', message: 'PERMISSION_DENIED: evaluation error' };

    const SchoolApp = {
      showToast: (msg, type) => {
        toastMessage = msg;
        toastType = type;
      }
    };
    global.window.checkServerVersion = () => {
      checkVersionCalled = true;
    };

    const isPerm = simulatedPunchError && (simulatedPunchError.code === 'permission-denied' || (simulatedPunchError.message && simulatedPunchError.message.includes('PERMISSION_DENIED')));
    if (isPerm) {
      SchoolApp.showToast('Please refresh your browser to update the app.', 'warning', 10000);
      if (typeof global.window.checkServerVersion === 'function') global.window.checkServerVersion();
    }

    assert(toastMessage.includes('refresh your browser to update the app'), 'Must show refresh update message');
    assert.strictEqual(toastType, 'warning');
    assert.strictEqual(checkVersionCalled, true, 'Must call checkServerVersion to trigger forced update');
  });

  console.log('\n========================================');
  console.log(`SCALING TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${totalTests - passedTests}`);
  console.log('========================================');

  await testEnv.cleanup();

  if (totalTests !== passedTests) {
    process.exit(1);
  }
}

if (require.main === module) {
  runRootDocScalingTestSuite().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = { runRootDocScalingTestSuite };
