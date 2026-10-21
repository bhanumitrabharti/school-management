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
const TEST_PORT = 3339;

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

async function runTest() {
  console.log('=== REAL UI TEST ON DUMMY: STEP 2 (No schools[] in tenant doc) ===\n');

  // 1. Prepare dummy_test_school_isolated in Firestore
  const dummyDocRef = db.collection('tenant_data').doc(DUMMY_SCHOOL);
  const credDocRef = dummyDocRef.collection('private').doc('credentials');

  const adminPassPlain = 'DummyAdmin@123';
  const adminHash = await bcrypt.hash(adminPassPlain, 10);
  const teacherHash = await bcrypt.hash('Teacher@123', 10);

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

  const rootInitial = {
    settings: {
      schoolName: 'Dummy Test School',
      adminUsername: 'dummyadmin',
      credentialsIsolated: true,
      tagline: 'Initial Tagline Before Step 2 Test',
      classes: ['Class 1'],
      sections: { 'Class 1': ['A'] }
    },
    teachers: [
      {
        id: 't_dummy_01',
        name: 'Dummy Teacher 1',
        email: 'dummyt1@test.com',
        phone: '9999999999'
      }
    ],
    students: [],
    trash: []
  };
  await dummyDocRef.set(rootInitial);
  console.log('✅ Dummy school prepared in Firestore.');

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
    if (t.includes('[API') || t.includes('Save') || t.includes('guard') || t.includes('error') || t.includes('Security')) {
      console.log('[PAGE]', msg.type(), t);
    }
  });

  try {
    const url = `http://localhost:${TEST_PORT}/?test_subdomain=dummy-test`;
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'load' });

    await page.waitForFunction(() => {
      const btn = document.getElementById('login-submit-btn');
      return btn && !btn.disabled;
    });

    console.log('Logging in as admin...');
    await page.click('button.login-tab[data-role="admin"]');
    await page.fill('#admin-username', 'dummyadmin');
    await page.fill('#admin-password', adminPassPlain);
    await page.click('#login-submit-btn');
    await page.waitForSelector('#app-layout:not(.hidden)', { timeout: 35000 });
    console.log('✅ Admin logged into Dummy School.');

    // Now inject dummy schools[] into in-memory SchoolApp.store to simulate foreign schools being present
    console.log('Injecting foreign schools list into SchoolApp.store in browser...');
    await page.evaluate(() => {
      window.SchoolApp.store.schools = [
        {
          school_id: 'fake_foreign_school_1',
          school_name: 'Fake Foreign School 1',
          subdomain: 'foreign1',
          settings: { adminPassword: '$2a$10$FakeForeignHash123456789012345678901234567890123456789012' }
        },
        {
          school_id: 'fake_foreign_school_2',
          school_name: 'Fake Foreign School 2',
          subdomain: 'foreign2'
        }
      ];
      // Modify a setting to trigger save
      window.SchoolApp.store.settings.tagline = 'Updated Tagline After Step 2 Test';
    });

    console.log('Calling window.SchoolApp.save() from UI...');
    const saveResult = await page.evaluate(async () => {
      return await window.SchoolApp.save(true);
    });
    console.log('Save result from UI:', saveResult);

    // Wait 2 seconds for Firestore write to propagate
    await new Promise(r => setTimeout(r, 2000));

    // Verify tenant_data/dummy_test_school_isolated in Firestore
    const snap = await dummyDocRef.get();
    const data = snap.data();

    console.log('\n--- VERIFICATION OF FIRESTORE ROOT DOC ---');
    console.log('Has "schools" field in root doc?', Object.prototype.hasOwnProperty.call(data, 'schools'));
    console.log('data.schools value:', data.schools);
    console.log('Updated tagline:', data.settings?.tagline);

    if (Object.prototype.hasOwnProperty.call(data, 'schools') || data.schools !== undefined) {
      throw new Error('FAILED: "schools" field was found in tenant_data root doc!');
    }
    if (data.settings?.tagline !== 'Updated Tagline After Step 2 Test') {
      throw new Error('FAILED: Tagline was not updated as expected!');
    }

    // Check for any bcrypt hashes in the entire root doc
    const rootJson = JSON.stringify(data);
    const hashesFound = (rootJson.match(/\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g) || []).length;
    console.log('Bcrypt hashes in dummy root doc:', hashesFound);
    if (hashesFound !== 0) {
      throw new Error(`FAILED: Found ${hashesFound} bcrypt hashes in dummy root doc!`);
    }

    console.log('\n✅ ALL STEP 2 REAL UI CHECKS PASSED:');
    console.log('1. In-memory store.schools was NOT persisted into tenant_data.');
    console.log('2. payload.schools was successfully pruned by prepareSavePayload.');
    console.log('3. Root doc contains 0 bcrypt hashes.');
    console.log('4. Changes were successfully saved.');

  } finally {
    await browser.close();
    server.close();
  }
}

runTest().then(() => process.exit(0)).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
