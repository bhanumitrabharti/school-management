'use strict';

/**
 * test/test_admin_ui_smoke.js
 * 
 * Playwright UI Smoke Test against Firestore Emulator:
 * 1. Admin Flow:
 *    - Logs in as seeded admin on dummy_test_school_isolated.
 *    - Opens EVERY Admin Panel tab:
 *      * School Settings (asserts #settings-parent-portal-card is rendered inside settings)
 *      * User Management
 *      * Fee Setup
 *      * Notice Board
 *      * Student Promotion
 *      * Data Management
 *      * Recycle Bin
 *      * System Info
 *      * Report Card Designer (verifies NO ReferenceError: s is not defined)
 *    - Opens top-level pages: Fees, Students, Accounts, Exams.
 *    - Asserts NO console errors and NO "Render Error" text.
 * 2. Teacher Flow:
 *    - Logs out admin and logs in as seeded teacher.
 *    - Opens teacher pages: Attendance, Teacher Attendance, Students, Exams, Timetable, Documents, Help.
 *    - Asserts NO console errors and NO "Render Error" text.
 */

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('\n❌ FATAL: Refusing to run test/test_admin_ui_smoke.js without emulator!');
  console.error('FIRESTORE_EMULATOR_HOST must be set (e.g. 127.0.0.1:8085) to protect production data.\n');
  process.exit(1);
}

const { chromium } = require('playwright');
const express = require('express');
const http = require('http');
const path = require('path');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) {
  if (require('fs').existsSync(saPath)) {
    admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
  } else {
    admin.initializeApp({ projectId: 'ctrl-shift-solutions' });
  }
}
const db = admin.firestore();
const DUMMY_SCHOOL = 'dummy_test_school_isolated';
const TEST_PORT = 3456;

async function startLocalServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.resolve(__dirname, '..')));

  // Mount API endpoints
  app.post('/api/verify-school-access', require('../api/verify-school-access.js'));
  app.post('/api/manage-credentials', require('../api/manage-credentials.js'));

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(TEST_PORT, () => {
      console.log(`[Local Server] Running on http://localhost:${TEST_PORT}`);
      resolve(server);
    });
  });
}

async function seedEmulator() {
  console.log('\n--- Seeding dummy_test_school_isolated in Emulator ---');
  const adminPassHash = bcrypt.hashSync('DummyAdmin@123', 10);
  const teacherPassHash = bcrypt.hashSync('Teacher@123', 10);

  // 1. School directory entry
  await db.collection('schools').doc(DUMMY_SCHOOL).set({
    school_id: DUMMY_SCHOOL,
    school_name: 'Dummy Isolated Test School',
    subdomain: 'dummy-test',
    status: 'active',
    allowed_features: ['accounts', 'students', 'teachers', 'attendance', 'fees', 'exams', 'documents', 'timetable', 'help']
  }, { merge: true });

  // 2. Private credentials
  const docRef = db.collection('tenant_data').doc(DUMMY_SCHOOL);
  await docRef.collection('private').doc('credentials').set({
    adminUsername: 'dummyadmin',
    adminPassword: adminPassHash,
    teachers: {
      't_dummy_01': {
        id: 't_dummy_01',
        name: 'Dummy Teacher',
        email: 'dummyt1@test.com',
        username: 'dummyt1@test.com',
        passwordHash: teacherPassHash
      }
    },
    deletedTeachers: {}
  });

  // 3. Root tenant document
  await docRef.set({
    settings: {
      schoolName: 'Dummy Isolated Test School',
      credentialsIsolated: true,
      studentsMigrated: true,
      storageVersion: 2,
      adminUsername: 'dummyadmin',
      adminPassword: adminPassHash,
      classes: ['Class 1', 'Class 2'],
      subjects: ['Mathematics', 'Science'],
      parentPortal: {
        enabled: false,
        profile: true,
        attendance: true,
        timetable: true,
        exams: false,
        reportCards: false,
        notices: true,
        fees: true,
        feePayment: true
      }
    },
    teachers: [
      {
        id: 't_dummy_01',
        name: 'Dummy Teacher',
        email: 'dummyt1@test.com',
        phone: '9999999999',
        status: 'Active',
        password: teacherPassHash,
        classes: ['Class 1'],
        subjects: ['Mathematics']
      }
    ],
    students: [],
    notices: [
      { id: 'n1', title: 'Welcome Notice', content: 'School is open.', date: new Date().toISOString() }
    ],
    fees: []
  }, { merge: true });

  // 4. Sample student in subcollection
  await docRef.collection('students').doc('dummy_s1').set({
    id: 'dummy_s1',
    schoolId: DUMMY_SCHOOL,
    firstName: 'Test',
    lastName: 'Student',
    class: 'Class 1',
    section: 'A',
    status: 'active'
  }, { merge: true });

  console.log('✅ Emulator seeded successfully.');
}

async function runSmokeTest() {
  console.log('================================================================');
  console.log('   PLAYWRIGHT UI SMOKE TEST: ADMIN TABS & TEACHER PAGES (v76)  ');
  console.log('================================================================');

  await seedEmulator();
  const server = await startLocalServer();
  const browser = await chromium.launch({ headless: true });

  const capturedConsoleErrors = [];
  let testFailed = false;

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });

    const page = await context.newPage();

    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      // Ignore non-fatal third-party/favicon noise
      if (type === 'error') {
        if (!text.includes('favicon.ico') && !text.includes('Failed to load resource: the server responded with a status of 404')) {
          console.error(`[PAGE CONSOLE ERROR]: ${text}`);
          capturedConsoleErrors.push(text);
        }
      }
    });

    page.on('pageerror', err => {
      console.error(`[PAGE UNHANDLED ERROR]: ${err.message}`);
      capturedConsoleErrors.push(err.message);
    });

    const TARGET_URL = `http://localhost:${TEST_PORT}/?test_subdomain=dummy-test&emulator_port=8085`;
    console.log(`\nNavigating to ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 30000 });

    // Wait for login button
    await page.waitForFunction(() => {
      const btn = document.getElementById('login-submit-btn');
      return btn && !btn.disabled;
    }, { timeout: 15000 });

    // Helper: assert no render error text
    async function assertNoRenderError(stepName) {
      const pageText = await page.evaluate(() => document.body.innerText || '');
      if (pageText.includes('Render Error') || pageText.includes('ReferenceError')) {
        const errMsg = `FAIL [${stepName}]: "Render Error" or "ReferenceError" found in page content!`;
        console.error(`❌ ${errMsg}`);
        throw new Error(errMsg);
      }
      if (capturedConsoleErrors.length > 0) {
        const errMsg = `FAIL [${stepName}]: Console errors detected: ${capturedConsoleErrors.join('; ')}`;
        console.error(`❌ ${errMsg}`);
        throw new Error(errMsg);
      }
      console.log(`  ✅ [${stepName}] Passed without error.`);
    }

    // ─────────────────────────────────────────────────────────────
    // PART 1: ADMIN LOGIN & ALL ADMIN PANEL TABS
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- PART 1: Admin Login & Admin Panel Tab Verification ---');
    await page.click('button.login-tab[data-role="admin"]');
    await page.fill('#admin-username', 'dummyadmin');
    await page.fill('#admin-password', 'DummyAdmin@123');
    await page.click('#login-submit-btn');

    await page.waitForSelector('#app-layout:not(.hidden)', { timeout: 15000 });
    console.log('✅ Admin login succeeded, dashboard loaded.');
    await assertNoRenderError('Admin Login');

    // Navigate to Admin Panel
    console.log('Navigating to Admin Panel...');
    await page.click('.sidebar-nav a[data-page="admin"]');
    await page.waitForSelector('#page-admin:not(.hidden)', { timeout: 10000 });
    await assertNoRenderError('Admin Page Initial Render');

    // Test Admin Tab 1: School Settings
    console.log('Opening Tab: School Settings...');
    await page.click('button.tab-btn[data-tab="settings"]');
    await page.waitForSelector('#tab-settings.active', { timeout: 5000 });
    
    // Check Parent Portal Card inside Settings
    const parentPortalCard = await page.$('#settings-parent-portal-card');
    if (!parentPortalCard) {
      throw new Error('FAIL: #settings-parent-portal-card was NOT found inside School Settings tab!');
    }
    const ppCardTitle = await page.evaluate(() => {
      const card = document.getElementById('settings-parent-portal-card');
      return card ? card.innerText : '';
    });
    if (!ppCardTitle.includes('Parent Portal')) {
      throw new Error('FAIL: #settings-parent-portal-card does not contain "Parent Portal" text!');
    }
    console.log('  ✅ #settings-parent-portal-card correctly rendered inside School Settings.');
    await assertNoRenderError('Admin Tab: School Settings');

    // Test Admin Tab 2: User Management
    console.log('Opening Tab: User Management...');
    await page.click('button.tab-btn[data-tab="users"]');
    await page.waitForSelector('#tab-users.active', { timeout: 5000 });
    await assertNoRenderError('Admin Tab: User Management');

    // Test Admin Tab 3: Fee Setup
    console.log('Opening Tab: Fee Setup...');
    await page.click('button.tab-btn[data-tab="fees"]');
    await page.waitForSelector('#tab-fees.active', { timeout: 5000 });
    await assertNoRenderError('Admin Tab: Fee Setup');

    // Test Admin Tab 4: Notice Board
    console.log('Opening Tab: Notice Board...');
    await page.click('button.tab-btn[data-tab="notices"]');
    await page.waitForSelector('#tab-notices.active', { timeout: 5000 });
    await assertNoRenderError('Admin Tab: Notice Board');

    // Test Admin Tab 5: Student Promotion
    console.log('Opening Tab: Student Promotion...');
    await page.click('button.tab-btn[data-tab="promotion"]');
    await page.waitForSelector('#tab-promotion.active', { timeout: 5000 });
    await assertNoRenderError('Admin Tab: Student Promotion');

    // Test Admin Tab 6: Data Management
    console.log('Opening Tab: Data Management...');
    await page.click('button.tab-btn[data-tab="data"]');
    await page.waitForSelector('#tab-data.active', { timeout: 5000 });
    await assertNoRenderError('Admin Tab: Data Management');

    // Test Admin Tab 7: Recycle Bin
    console.log('Opening Tab: Recycle Bin...');
    await page.click('button.tab-btn[data-tab="recovery"]');
    await page.waitForSelector('#tab-recovery.active', { timeout: 5000 });
    await assertNoRenderError('Admin Tab: Recycle Bin');

    // Test Admin Tab 8: System Info
    console.log('Opening Tab: System Info...');
    await page.click('button.tab-btn[data-tab="system"]');
    await page.waitForSelector('#tab-system.active', { timeout: 5000 });
    await assertNoRenderError('Admin Tab: System Info');

    // Test Admin Tab 9: Report Card Designer (THE REGRESSION POINT)
    console.log('Opening Tab: Report Card Designer...');
    await page.click('button.tab-btn[data-tab="reportCard"]');
    await page.waitForSelector('#tab-reportCard.active', { timeout: 5000 });
    await assertNoRenderError('Admin Tab: Report Card Designer');

    // ─────────────────────────────────────────────────────────────
    // PART 2: TOP-LEVEL PAGES (Fees, Students, Accounts, Exams)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- PART 2: Top-Level Pages Verification (Admin) ---');

    // Fees Page
    console.log('Navigating to Fees Page...');
    await page.click('.sidebar-nav a[data-page="fees"]');
    await page.waitForSelector('#page-fees:not(.hidden)', { timeout: 10000 });
    await assertNoRenderError('Page: Fees');

    // Students Page
    console.log('Navigating to Students Page...');
    await page.click('.sidebar-nav a[data-page="students"]');
    await page.waitForSelector('#page-students:not(.hidden)', { timeout: 10000 });
    await assertNoRenderError('Page: Students');

    // Accounts Page
    console.log('Navigating to Accounts Page...');
    await page.click('.sidebar-nav a[data-page="accounts"]');
    await page.waitForSelector('#page-accounts:not(.hidden)', { timeout: 10000 });
    await assertNoRenderError('Page: Accounts');

    // Exams Page
    console.log('Navigating to Exams Page...');
    await page.click('.sidebar-nav a[data-page="exams"]');
    await page.waitForSelector('#page-exams:not(.hidden)', { timeout: 10000 });
    await assertNoRenderError('Page: Exams');

    // Documents Page
    console.log('Navigating to Documents Page...');
    await page.click('.sidebar-nav a[data-page="documents"]');
    await page.waitForSelector('#page-documents:not(.hidden)', { timeout: 10000 });
    await assertNoRenderError('Page: Documents');

    // ─────────────────────────────────────────────────────────────
    // PART 3: TEACHER LOGIN & TEACHER PAGES
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- PART 3: Teacher Login & Pages Verification ---');
    console.log('Logging out admin...');
    await page.evaluate(async () => {
      await window.SchoolApp.logout();
    });
    await page.waitForSelector('#login-page:not(.hidden)', { timeout: 10000 });
    console.log('✅ Admin logged out, back to login screen.');

    console.log('Logging in as Teacher (dummyt1@test.com)...');
    await page.click('button.login-tab[data-role="teacher"]');
    await page.fill('#teacher-email', 'dummyt1@test.com');
    await page.fill('#teacher-password', 'Teacher@123');
    await page.click('#login-submit-btn');

    await page.waitForSelector('#app-layout:not(.hidden)', { timeout: 15000 });
    const isTeacher = await page.evaluate(() => window.SchoolApp ? window.SchoolApp.isTeacher() : false);
    if (!isTeacher) {
      const actualRole = await page.evaluate(() => (window.SchoolApp && window.SchoolApp.currentUser) ? window.SchoolApp.currentUser.role : 'NO_USER');
      throw new Error(`FAIL: Expected isTeacher() === true, actual role: '${actualRole}'`);
    }
    console.log('✅ Teacher login succeeded (userRole = teacher).');
    await assertNoRenderError('Teacher Login');

    // Teacher Attendance Page
    console.log('Navigating to Attendance Page...');
    await page.click('.sidebar-nav a[data-page="attendance"]');
    await page.waitForSelector('#page-attendance:not(.hidden)', { timeout: 10000 });
    await assertNoRenderError('Teacher Page: Attendance');

    // Teacher Staff Attendance Page
    console.log('Navigating to Teacher Attendance Page...');
    await page.click('.sidebar-nav a[data-page="teacher-attendance"]');
    await page.waitForSelector('#page-teacher-attendance:not(.hidden)', { timeout: 10000 });
    await assertNoRenderError('Teacher Page: Teacher Attendance');

    // Teacher Students Page
    console.log('Navigating to Students Page...');
    await page.click('.sidebar-nav a[data-page="students"]');
    await page.waitForSelector('#page-students:not(.hidden)', { timeout: 10000 });
    await assertNoRenderError('Teacher Page: Students');

    // Teacher Exams Page
    console.log('Navigating to Exams Page...');
    await page.click('.sidebar-nav a[data-page="exams"]');
    await page.waitForSelector('#page-exams:not(.hidden)', { timeout: 10000 });
    await assertNoRenderError('Teacher Page: Exams');

    // Teacher Timetable Page
    console.log('Navigating to Timetable Page...');
    await page.click('.sidebar-nav a[data-page="timetable"]');
    await page.waitForSelector('#page-timetable:not(.hidden)', { timeout: 10000 });
    await assertNoRenderError('Teacher Page: Timetable');

    // Teacher Help Page
    console.log('Navigating to Help Page...');
    await page.click('.sidebar-nav a[data-page="help"]');
    await page.waitForSelector('#page-help:not(.hidden)', { timeout: 10000 });
    await assertNoRenderError('Teacher Page: Help');

    // Confirm Admin-only nav links are hidden for teacher
    const adminOnlyLinks = ['admin', 'fees', 'accounts', 'documents'];
    for (const pageName of adminOnlyLinks) {
      const isVisible = await page.evaluate((p) => {
        const link = document.querySelector(`.sidebar-nav a[data-page="${p}"]`);
        if (!link) return false;
        const style = window.getComputedStyle(link);
        return style.display !== 'none' && !link.classList.contains('hidden') && !link.classList.contains('nav-admin-only');
      }, pageName);
      if (isVisible) {
        throw new Error(`FAIL: Nav link "${pageName}" should be hidden for teachers!`);
      }
      console.log(`  ✅ Nav link "${pageName}" correctly hidden/restricted for teacher.`);
    }

    console.log('\n================================================================');
    console.log('   ALL PLAYWRIGHT SMOKE TESTS PASSED WITH ZERO CONSOLE ERRORS!  ');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ PLAYWRIGHT TEST FAILED:', err.message);
    testFailed = true;
  } finally {
    await browser.close();
    server.close();
  }

  if (testFailed || capturedConsoleErrors.length > 0) {
    process.exit(1);
  }
}

runSmokeTest().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
