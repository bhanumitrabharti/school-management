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
const TEST_PORT = 3338;

async function startLocalServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.resolve(__dirname, '..')));
  app.post('/api/verify-school-access', async (req, res) => {
    try {
      const handler = require('../api/verify-school-access.js');
      await handler(req, res);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post('/api/manage-credentials', require('../api/manage-credentials.js'));

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(TEST_PORT, () => {
      resolve(server);
    });
  });
}

async function runStaleTabTest() {
  console.log('--- 1. Setting up dummy_test_school_isolated for Stale-Tab Guard Test ---');
  const dummyDocRef = db.collection('tenant_data').doc(DUMMY_SCHOOL);
  const credDocRef = dummyDocRef.collection('private').doc('credentials');

  const adminPassPlain = 'DummyAdmin@123';
  const adminHash = await bcrypt.hash(adminPassPlain, 10);
  const teacherHash = await bcrypt.hash('Teacher@123', 10);

  // Set up private/credentials
  await credDocRef.set({
    adminUsername: 'dummyadmin',
    adminPassword: adminHash,
    teachers: {
      't_dummy_01': {
        username: 'dummyt1@test.com',
        email: 'dummyt1@test.com',
        passwordHash: teacherHash
      }
    }
  });

  // Set up root doc with hashes (as if before removal)
  const rootInitial = {
    settings: {
      schoolName: 'Dummy Test School',
      adminUsername: 'dummyadmin',
      adminPassword: adminHash,
      credentialsIsolated: true,
      tagline: 'Initial Tagline'
    },
    teachers: [
      {
        id: 't_dummy_01',
        name: 'Dummy Teacher 1',
        email: 'dummyt1@test.com',
        phone: '9999999999',
        password: teacherHash
      }
    ],
    students: [],
    trash: []
  };
  await dummyDocRef.set(rootInitial);
  console.log('✅ Dummy school initialized with credentialsIsolated=true and initial root hashes.');

  const server = await startLocalServer();
  console.log(`Local test server running on http://localhost:${TEST_PORT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  await context.addInitScript(() => {
    sessionStorage.setItem('sw_controllerchange_v54', 'true');
    sessionStorage.setItem('sw_controllerchange_v55', 'true');
  });
  const page = await context.newPage();

  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('[API') || t.includes('Save') || t.includes('guard') || t.includes('error')) {
      console.log('[PAGE]', msg.type(), t);
    }
  });

  try {
    const url = `http://localhost:${TEST_PORT}/?test_subdomain=dummy-test`;
    console.log(`[Tab 1] Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'load' });

    await page.waitForFunction(() => {
      const btn = document.getElementById('login-submit-btn');
      return btn && !btn.disabled;
    });

    console.log('[Tab 1] Logging in as admin...');
    await page.click('button.login-tab[data-role="admin"]');
    await page.fill('#admin-username', 'dummyadmin');
    await page.fill('#admin-password', adminPassPlain);
    await page.click('#login-submit-btn');
    await page.waitForSelector('#app-layout:not(.hidden)', { timeout: 35000 });
    console.log('✅ Tab 1 logged in. In-memory store has loaded initial credentials.');

    // Step 2: Simulate Phase 1b Removal in Firestore (Admin SDK)
    console.log('\n--- 2. Background: Phase 1b Removal on Root Doc in Firestore ---');
    await db.runTransaction(async tx => {
      const snap = await tx.get(dummyDocRef);
      const data = snap.data();
      delete data.settings.adminPassword;
      (data.teachers || []).forEach(t => delete t.password);
      tx.set(dummyDocRef, data);
    });

    // Verify root is currently hash-free
    let snapAfterRemoval = await dummyDocRef.get();
    let rootJson1 = JSON.stringify(snapAfterRemoval.data());
    let hashesCount1 = (rootJson1.match(/\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g) || []).length;
    console.log(`Hashes in root immediately after removal: ${hashesCount1}`);
    if (hashesCount1 !== 0) throw new Error('Root still has hashes after background removal!');

    // Step 3: Tab 1 (which had hashes in memory when opened) modifies data and saves
    console.log('\n--- 3. Tab 1 Saves Changes (Stale-Tab Action) ---');
    await page.evaluate(async () => {
      // Stale tab modifies tagline and attempts to save with in-memory password
      window.SchoolApp.store.settings.tagline = 'Updated Tagline From Stale Tab';
      window.SchoolApp.store.settings.adminPassword = '$2a$10$STALE_HASH_IN_MEMORY_SHOULD_NEVER_BE_WRITTEN_12345678901';
      if (window.SchoolApp.store.teachers && window.SchoolApp.store.teachers[0]) {
        window.SchoolApp.store.teachers[0].password = '$2a$10$STALE_TEACHER_HASH_IN_MEMORY_SHOULD_BE_STRIPPED_1234567';
      }
      return await window.SchoolApp.save();
    });

    // Step 4: Verify Firestore Root Doc
    console.log('\n--- 4. Post-Save Verification of Firestore Root Doc ---');
    let snapAfterStaleSave = await dummyDocRef.get();
    let dataAfterSave = snapAfterStaleSave.data();
    let rootJson2 = JSON.stringify(dataAfterSave);
    let hashesCount2 = (rootJson2.match(/\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g) || []).length;

    console.log(`Hashes in root after stale tab save: ${hashesCount2}`);
    console.log(`settings.adminPassword: ${dataAfterSave.settings.adminPassword}`);
    console.log(`teachers[0].password:   ${dataAfterSave.teachers && dataAfterSave.teachers[0] ? dataAfterSave.teachers[0].password : undefined}`);
    console.log(`settings.tagline:        ${dataAfterSave.settings.tagline}`);
    console.log(`settings.adminUsername:   ${dataAfterSave.settings.adminUsername}`);
    console.log(`teachers[0].name:        ${dataAfterSave.teachers[0].name}`);

    // Verify localStorage cache
    const cachedData = await page.evaluate(() => {
      return localStorage.getItem('cached_tenant_data_dummy_test_school_isolated');
    });
    const cacheHashes = (cachedData ? cachedData.match(/\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g) || [] : []).length;
    console.log(`Hashes in localStorage cache: ${cacheHashes}`);

    const passed = (
      hashesCount2 === 0 &&
      dataAfterSave.settings.adminPassword === undefined &&
      dataAfterSave.teachers[0].password === undefined &&
      dataAfterSave.settings.tagline === 'Updated Tagline From Stale Tab' &&
      dataAfterSave.settings.adminUsername === 'dummyadmin' &&
      cacheHashes === 0
    );

    console.log('\n================================================================');
    console.log(`STALE-TAB GUARD TEST VERDICT: ${passed ? '✅ PASSED (ROOT REMAINS 100% HASH-FREE)' : '❌ FAILED'}`);
    console.log('================================================================');

    if (!passed) {
      process.exit(1);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

runStaleTabTest().then(() => process.exit(0)).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
