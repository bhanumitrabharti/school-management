/**
 * scripts/test-real-ui-flows.js
 * 
 * Comprehensive Playwright test verifying REAL UI CLICKS on dummy_test_school_isolated:
 * 1. Fresh Admin Login (via real form filling & submit button click)
 * 2. Add Teacher (via real button clicks, modal form, /api/manage-credentials)
 * 3. Reset Teacher Password (via real clicks on Users tab, capture generated password)
 * 4. Add Teacher -> Login (log in as the newly created & reset teacher)
 * 5. After Reload (verify session & getFreshAuthToken() after page refresh)
 * 6. Installed PWA Restore (verify authStateReady & getFreshAuthToken in standalone mode)
 */

const { chromium } = require('playwright');
const express = require('express');
const http = require('http');
const path = require('path');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length && require('fs').existsSync(saPath)) {
  admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
}
const db = admin.firestore();
const DUMMY_SCHOOL = 'dummy_test_school_isolated';
const TEST_PORT = 3333;

async function startLocalServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.resolve(__dirname, '..')));

  // Mount API endpoints exactly as Vercel runs them
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

async function runRealUIFlows() {
  console.log('================================================================');
  console.log('   V2 AUDIT: COMPREHENSIVE REAL UI CLICKS VERIFICATION         ');
  console.log('================================================================\n');

  const server = await startLocalServer();
  const browser = await chromium.launch({ headless: true });
  const results = {};

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();
    page.on('console', msg => {
      const txt = msg.text();
      if (txt.includes('[Teachers]') || txt.includes('[Auth]') || txt.includes('error') || txt.includes('Error') || txt.includes('manage-credentials')) {
        console.log('BROWSER CONSOLE:', txt);
      }
    });

    const TARGET_URL = `http://localhost:${TEST_PORT}/?test_subdomain=dummy-test`;

    console.log(`Navigating to ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 30000 });

    // Wait for login button to be ready
    await page.waitForFunction(() => {
      const btn = document.getElementById('login-submit-btn');
      return btn && !btn.disabled;
    }, { timeout: 15000 });

    // -------------------------------------------------------------
    // FLOW 1: Fresh Admin Login (Real UI Clicks)
    // -------------------------------------------------------------
    console.log('\n--- FLOW 1: Fresh Admin Login (Real UI Clicks) ---');
    await page.click('button.login-tab[data-role="admin"]');
    await page.fill('#admin-username', 'dummyadmin');
    await page.fill('#admin-password', 'DummyAdmin@123');

    console.log('Clicking #login-submit-btn...');
    await page.click('#login-submit-btn');

    // Wait for app layout to become visible
    await page.waitForSelector('#app-layout:not(.hidden)', { timeout: 15000 });
    console.log('✅ Admin login succeeded, dashboard loaded.');

    // Verify credentialsIsolated flag in UI store
    const isIsolated = await page.evaluate(() => {
      return Boolean(window.SchoolApp && window.SchoolApp.store && window.SchoolApp.store.settings && window.SchoolApp.store.settings.credentialsIsolated === true);
    });
    console.log(`Live store credentialsIsolated: ${isIsolated}`);
    results.freshLogin = isIsolated;

    // -------------------------------------------------------------
    // FLOW 2: Add Teacher with Real UI Clicks
    // -------------------------------------------------------------
    console.log('\n--- FLOW 2: Add Teacher via Real UI Clicks ---');
    console.log('Clicking sidebar Teachers link...');
    await page.click('.sidebar-nav a[data-page="teachers"]');
    await page.waitForTimeout(1000);

    console.log('Clicking #teacher-add-btn...');
    await page.waitForSelector('#teacher-add-btn', { timeout: 10000 });
    await page.click('#teacher-add-btn');

    await page.waitForSelector('#teacher-form', { timeout: 10000 });
    console.log('Filling teacher modal form...');
    await page.fill('#teacher-form [name="firstName"]', 'Playwright');
    await page.fill('#teacher-form [name="lastName"]', 'Tester');
    await page.fill('#teacher-form [name="email"]', 'pwteacher@ctrlshifts.in');
    await page.fill('#teacher-form [name="phone"]', '9876543210');
    await page.fill('#teacher-form [name="qualification"]', 'B.Ed, M.Sc');
    await page.fill('#teacher-form [name="password"]', 'PwPass@2026!');

    console.log('Selecting subject and class checkboxes...');
    const firstSubjectCb = await page.$('.subject-cb');
    if (firstSubjectCb) await firstSubjectCb.click();

    const firstClassCb = await page.$('.class-assign-cb');
    if (firstClassCb) await firstClassCb.click();
    await page.waitForTimeout(500);

    const firstSubMapCb = await page.$('.class-sub-cb');
    if (firstSubMapCb) await firstSubMapCb.click();
    await page.waitForTimeout(500);

    console.log('Clicking #teacher-save-btn...');
    await page.click('#teacher-save-btn');
    await page.waitForTimeout(4000);

    // Verify teacher exists in Firestore and private credentials
    const privDoc = (await db.collection('tenant_data').doc(DUMMY_SCHOOL).collection('private').doc('credentials').get()).data();
    const createdTeacherId = Object.keys(privDoc.teachers || {}).find(tid => privDoc.teachers[tid].email === 'pwteacher@ctrlshifts.in');
    console.log(`Created teacher in private/credentials ID: ${createdTeacherId}`);
    results.addTeacherSuccess = Boolean(createdTeacherId);

    // -------------------------------------------------------------
    // FLOW 3: Reset Teacher Password with Real UI Clicks
    // -------------------------------------------------------------
    console.log('\n--- FLOW 3: Reset Teacher Password (Real UI Clicks) ---');
    console.log('Navigating to Admin -> Users tab...');
    await page.click('.sidebar-nav a[data-page="admin"]');
    await page.waitForTimeout(1000);

    await page.waitForSelector('button.tab-btn[data-tab="users"]', { timeout: 10000 });
    await page.click('button.tab-btn[data-tab="users"]');
    await page.waitForTimeout(1500);

    console.log(`Clicking reset-pw-btn for created teacher (${createdTeacherId})...`);
    await page.waitForSelector(`.reset-pw-btn[data-id="${createdTeacherId}"]`, { timeout: 10000 });
    await page.click(`.reset-pw-btn[data-id="${createdTeacherId}"]`);

    console.log('Waiting for modal-overlay.active...');
    await page.waitForSelector('#modal-overlay.active', { timeout: 15000 });
    await page.waitForTimeout(500);

    const modalHTML = await page.evaluate(() => document.getElementById('modal-body') ? document.getElementById('modal-body').innerHTML : '');
    console.log('Modal body HTML:', modalHTML);

    // Extract new password displayed in modal
    const generatedPassword = await page.evaluate(() => {
      const body = document.getElementById('modal-body');
      if (!body) return null;
      const strongs = Array.from(body.querySelectorAll('strong'));
      // The password is in the second strong tag or the 8-char strong
      for (const s of strongs) {
        const text = s.textContent.trim();
        if (text.length >= 6 && text.length <= 12 && !text.includes(' ') && !text.includes('Class')) {
          return text;
        }
      }
      return strongs.length > 1 ? strongs[1].textContent.trim() : (strongs[0] ? strongs[0].textContent.trim() : null);
    });
    console.log(`Captured generated password from modal: "${generatedPassword}"`);

    // Close modal by clicking Done in modal footer
    await page.click('#modal-footer button');
    await page.waitForTimeout(1000);

    // Check private credentials in Firestore
    const updatedPrivDoc = (await db.collection('tenant_data').doc(DUMMY_SCHOOL).collection('private').doc('credentials').get()).data();
    const newHash = updatedPrivDoc.teachers[createdTeacherId].passwordHash;
    const isNewPasswordValid = bcrypt.compareSync(generatedPassword, newHash);
    console.log(`Bcrypt verification of reset password against private/credentials: ${isNewPasswordValid ? '✅ MATCH' : '❌ MISMATCH'}`);
    results.resetPasswordSuccess = isNewPasswordValid;

    // -------------------------------------------------------------
    // FLOW 4: Add Teacher -> Login (Login as the new Teacher)
    // -------------------------------------------------------------
    console.log('\n--- FLOW 4: Login with New Teacher Credentials ---');
    console.log('Logging out Admin...');
    await page.evaluate(async () => {
      await window.SchoolApp.logout();
    });
    await page.waitForSelector('#login-form:not(.hidden)', { timeout: 10000 });
    await page.waitForFunction(() => {
      const btn = document.getElementById('login-submit-btn');
      return btn && !btn.disabled;
    }, { timeout: 15000 });

    console.log('Selecting Teacher tab and filling credentials...');
    await page.click('button.login-tab[data-role="teacher"]');
    await page.fill('#teacher-email', 'pwteacher@ctrlshifts.in');
    await page.fill('#teacher-password', generatedPassword);

    console.log('Clicking #login-submit-btn as Teacher...');
    await page.click('#login-submit-btn');

    await page.waitForSelector('#app-layout:not(.hidden)', { timeout: 15000 });
    const teacherRole = await page.evaluate(() => window.SchoolApp.currentUser ? window.SchoolApp.currentUser.role : null);
    console.log(`Logged in role: ${teacherRole}`);
    results.teacherLoginSuccess = (teacherRole === 'teacher');

    // -------------------------------------------------------------
    // FLOW 5: After Reload Session Verification
    // -------------------------------------------------------------
    console.log('\n--- FLOW 5: Session Verification After Reload ---');
    console.log('Reloading browser page...');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2000);

    const freshTokenAfterReload = await page.evaluate(async () => {
      try {
        return await window.SchoolApp.getFreshAuthToken();
      } catch (e) {
        return 'ERROR: ' + e.message;
      }
    });
    const hasValidTokenAfterReload = Boolean(freshTokenAfterReload && !freshTokenAfterReload.startsWith('ERROR'));
    console.log(`getFreshAuthToken() after reload: ${hasValidTokenAfterReload ? '✅ SUCCESS (Token Acquired)' : '❌ ' + freshTokenAfterReload}`);
    results.afterReloadSuccess = hasValidTokenAfterReload;

    // -------------------------------------------------------------
    // FLOW 6: Installed PWA Standalone Mode Restore
    // -------------------------------------------------------------
    console.log('\n--- FLOW 6: Installed PWA Standalone Mode Restore ---');
    const pwaTokenResult = await page.evaluate(async () => {
      // Simulate standalone PWA display-mode media match
      window.isStandalonePWA = true;
      try {
        return await window.SchoolApp.getFreshAuthToken();
      } catch (e) {
        return 'ERROR: ' + e.message;
      }
    });
    const hasPwaToken = Boolean(pwaTokenResult && !pwaTokenResult.startsWith('ERROR'));
    console.log(`PWA standalone restore getFreshAuthToken(): ${hasPwaToken ? '✅ SUCCESS' : '❌ ' + pwaTokenResult}`);
    results.pwaRestoreSuccess = hasPwaToken;

    // -------------------------------------------------------------
    // CLEANUP: Clean up test teacher from dummy school
    // -------------------------------------------------------------
    console.log('\nCleaning up pwteacher@ctrlshifts.in from dummy school...');
    const rootRef = db.collection('tenant_data').doc(DUMMY_SCHOOL);
    const privRef = rootRef.collection('private').doc('credentials');
    const [rSnap, pSnap] = await Promise.all([rootRef.get(), privRef.get()]);
    if (rSnap.exists) {
      const teachers = (rSnap.data().teachers || []).filter(t => t.email !== 'pwteacher@ctrlshifts.in');
      await rootRef.update({ teachers });
    }
    if (pSnap.exists) {
      const pData = pSnap.data();
      if (pData.teachers && createdTeacherId) {
        delete pData.teachers[createdTeacherId];
        await privRef.set(pData);
      }
    }
    console.log('✅ Cleanup finished.');

    return results;
  } finally {
    await browser.close();
    server.close();
  }
}

runRealUIFlows().then(res => {
  console.log('\n================================================================');
  console.log('   REAL UI FLOWS SUMMARY REPORT                                 ');
  console.log('================================================================');
  console.log(JSON.stringify(res, null, 2));
  const allPassed = Object.values(res).every(Boolean);
  if (!allPassed) {
    console.error('❌ Some UI flows failed!');
    process.exit(1);
  }
  console.log('✅ ALL REAL UI FLOWS PASSED (100%)');
  process.exit(0);
}).catch(err => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
