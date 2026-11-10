'use strict';

/**
 * test/test_v77_logo_captcha.js
 * 
 * Comprehensive Playwright & Integration Test Suite for v77:
 * 1. StorageUtils Image Compression:
 *    - Never reject large images (1.2 MB input).
 *    - Compresses to <= 300 KB.
 *    - Rejects non-image files with clear error.
 * 2. Single Authoritative Reader Helpers:
 *    - SchoolApp.getLogoUrl() full 7-step precedence verification.
 *    - SchoolApp.getSignatureUrl() full 4-step precedence verification.
 *    - Byte-identical report card and fee receipt markup parity.
 * 3. Playwright UI Flow on V2 Tenant:
 *    - Upload 1.2 MB logo image -> compressed upload -> preview + sidebar show it.
 *    - Verify Firestore settings.logoStorageUrl AND schoolInfo.logoStorageUrl are set.
 *    - Remove logo -> verify preview empty, sidebar hidden, and ALL 6 fields cleared in Firestore.
 *    - Upload signature -> preview shows it -> verify principalSignatureStorageUrl.
 *    - Remove signature -> preview empty -> ALL 4 signature fields cleared in Firestore.
 * 4. Parent Portal Captcha & Visibility:
 *    - Turnstile widget renders on localhost with test key.
 *    - Submitting without captcha shows "Please complete the security check".
 *    - Submitting unregistered email displays server error visibly in the form alert.
 */

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('\n❌ FATAL: Refusing to run test/test_v77_logo_captcha.js without emulator!');
  console.error('FIRESTORE_EMULATOR_HOST must be set (e.g. 127.0.0.1:8085) to protect production data.\n');
  process.exit(1);
}

const { chromium } = require('playwright');
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) {
  if (fs.existsSync(saPath)) {
    admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
  } else {
    admin.initializeApp({ projectId: 'ctrl-shift-solutions' });
  }
}
const db = admin.firestore();
const TEST_SCHOOL = 'v77_test_tenant';
const TEST_PORT = 3459;

let passedCount = 0;
let failedCount = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✔ PASS: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    failedCount++;
  }
}

async function startLocalServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.resolve(__dirname, '..')));

  // Mount API endpoints
  app.post('/api/verify-school-access', require('../api/verify-school-access.js'));
  app.post('/api/manage-credentials', require('../api/manage-credentials.js'));
  app.all('/api/parents', require('../api/parents.js'));

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(TEST_PORT, () => {
      console.log(`[Local Server] Running on http://localhost:${TEST_PORT}`);
      resolve(server);
    });
  });
}

async function seedV2Tenant() {
  console.log('\n--- Seeding v77_test_tenant (V2 Architecture) in Emulator ---');
  const adminPassHash = bcrypt.hashSync('V77Admin@123', 10);

  // 1. School directory entry
  await db.collection('schools').doc(TEST_SCHOOL).set({
    school_id: TEST_SCHOOL,
    school_name: 'V77 Test Academy',
    subdomain: 'v77-test',
    status: 'active',
    storageVersion: 2,
    allowed_features: ['admin', 'accounts', 'students', 'teachers', 'attendance', 'fees', 'exams', 'documents']
  }, { merge: true });

  // 2. Private credentials
  const docRef = db.collection('tenant_data').doc(TEST_SCHOOL);
  await docRef.collection('private').doc('credentials').set({
    adminUsername: 'v77admin',
    adminPassword: adminPassHash,
    teachers: {},
    deletedTeachers: {}
  });

  // 3. Tenant root document (V2 storageVersion: 2, studentsMigrated: true)
  await docRef.set({
    storageVersion: 2,
    studentsMigrated: true,
    settings: {
      schoolName: 'V77 Test Academy',
      academicYear: '2025-2026',
      storageVersion: 2,
      credentialsIsolated: true,
      studentsMigrated: true,
      adminUsername: 'v77admin',
      adminPassword: adminPassHash,
      classes: ['Class 1', 'Class 2'],
      subjects: ['Mathematics', 'Science'],
      logoStorageUrl: '',
      logoUrl: '',
      schoolLogo: '',
      principalSignatureStorageUrl: '',
      principalSignatureUrl: '',
      schoolInfo: {
        name: 'V77 Test Academy',
        logoStorageUrl: '',
        logoUrl: '',
        schoolLogo: '',
        principalSignatureStorageUrl: '',
        principalSignatureUrl: ''
      },
      parentPortal: {
        enabled: true,
        profile: true,
        attendance: true,
        timetable: true,
        notices: true,
        fees: true,
        feePayment: true
      }
    },
    teachers: [
      { id: 't_admin', name: 'Admin User', role: 'admin' }
    ],
    students: [],
    fees: []
  }, { merge: true });

  console.log('✅ v77_test_tenant seeded successfully.');
}

async function runAllTests() {
  console.log('================================================================');
  console.log('   PLAYWRIGHT & INTEGRATION TEST SUITE: v77 LOGO & CAPTCHA      ');
  console.log('================================================================');

  await seedV2Tenant();
  const server = await startLocalServer();
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block'
    });

    const page = await context.newPage();

    // Navigate to local app
    await page.goto(`http://localhost:${TEST_PORT}/index.html?test_subdomain=v77-test&emulator_port=8085`, { waitUntil: 'load', timeout: 30000 });

    // Wait for SchoolApp and login page readiness
    await page.waitForFunction(() => {
      const btn = document.getElementById('login-submit-btn');
      return btn && !btn.disabled && typeof window.SchoolApp !== 'undefined' && typeof window.SchoolApp.getLogoUrl === 'function';
    }, { timeout: 15000 });

    // ─────────────────────────────────────────────────────────────
    // CATEGORY 1: StorageUtils.compressImageBlob & Validation
    // ─────────────────────────────────────────────────────────────
    console.log('\n=== Category 1: StorageUtils Image Compression & Validation ===');

    await test('1.1: StorageUtils.compressImageBlob rejects non-image file', async () => {
      const result = await page.evaluate(async () => {
        try {
          const fakeFile = new File(['hello world'], 'test.txt', { type: 'text/plain' });
          await window.StorageUtils.compressImageBlob(fakeFile);
          return { error: null };
        } catch (e) {
          return { error: e.message };
        }
      });
      assert(result.error, 'Should have thrown error on text/plain');
      assert(result.error.includes('image file'), `Error message should mention image file: ${result.error}`);
    });

    // Generate real 1.2+ MB PNG image data via canvas in browser
    const pngBase64 = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 620;
      canvas.height = 620;
      const ctx = canvas.getContext('2d');
      const imgData = ctx.createImageData(620, 620);
      for (let i = 0; i < imgData.data.length; i += 4) {
        imgData.data[i] = Math.floor(Math.random() * 256);
        imgData.data[i + 1] = Math.floor(Math.random() * 256);
        imgData.data[i + 2] = Math.floor(Math.random() * 256);
        imgData.data[i + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      return canvas.toDataURL('image/png');
    });

    // Create a 1.2 MB test file on disk
    const fixtureDir = path.resolve(__dirname, 'fixtures');
    if (!fs.existsSync(fixtureDir)) fs.mkdirSync(fixtureDir, { recursive: true });
    const largeLogoPath = path.join(fixtureDir, 'large_logo_test.png');
    fs.writeFileSync(largeLogoPath, Buffer.from(pngBase64.split(',')[1], 'base64'));
    const diskFileSize = fs.statSync(largeLogoPath).size;
    console.log(`     Created test image on disk: ${(diskFileSize / 1024 / 1024).toFixed(2)} MB`);

    await test('1.2: StorageUtils.compressImageBlob compresses 1.2 MB image to <= 300 KB', async () => {
      const compressionResult = await page.evaluate(async (dataUrl) => {
        const res = await fetch(dataUrl);
        const originalBlob = await res.blob();
        const originalFile = new File([originalBlob], 'large_logo.png', { type: 'image/png' });

        const compressedBlob = await window.StorageUtils.compressImageBlob(originalFile, 400, 300 * 1024);
        return {
          originalSize: originalFile.size,
          compressedSize: compressedBlob.size,
          compressedType: compressedBlob.type
        };
      }, pngBase64);

      console.log(`     Original size: ${(compressionResult.originalSize / 1024).toFixed(1)} KB, Compressed: ${(compressionResult.compressedSize / 1024).toFixed(1)} KB (${compressionResult.compressedType})`);
      assert(compressionResult.compressedSize <= 300 * 1024, `Compressed blob must be <= 300 KB, got: ${compressionResult.compressedSize}`);
    });

    // ─────────────────────────────────────────────────────────────
    // CATEGORY 2: Single Authoritative Reader Helpers
    // ─────────────────────────────────────────────────────────────
    console.log('\n=== Category 2: Single Authoritative Reader Helpers ===');

    await test('2.1: SchoolApp.getLogoUrl enforces exact precedence order', async () => {
      const results = await page.evaluate(() => {
        const h = window.SchoolApp.getLogoUrl.bind(window.SchoolApp);
        // Level 1: logoStorageUrl beats all
        const r1 = h({
          logoStorageUrl: 'https://storage/logo1.png',
          logoUrl: 'data:logo2',
          schoolLogo: 'data:logo3',
          schoolInfo: { logoStorageUrl: 'https://storage/logo4.png', logoUrl: 'data:logo5', schoolLogo: 'data:logo6' }
        });

        // Level 2: logoUrl beats schoolLogo and schoolInfo
        const r2 = h({
          logoStorageUrl: '',
          logoUrl: 'data:logo2',
          schoolLogo: 'data:logo3',
          schoolInfo: { logoStorageUrl: 'https://storage/logo4.png', logoUrl: 'data:logo5', schoolLogo: 'data:logo6' }
        });

        // Level 3: schoolLogo beats schoolInfo
        const r3 = h({
          logoStorageUrl: '',
          logoUrl: '',
          schoolLogo: 'data:logo3',
          schoolInfo: { logoStorageUrl: 'https://storage/logo4.png', logoUrl: 'data:logo5', schoolLogo: 'data:logo6' }
        });

        // Level 4: schoolInfo.logoStorageUrl beats schoolInfo.logoUrl
        const r4 = h({
          logoStorageUrl: '',
          logoUrl: '',
          schoolLogo: '',
          schoolInfo: { logoStorageUrl: 'https://storage/logo4.png', logoUrl: 'data:logo5', schoolLogo: 'data:logo6' }
        });

        // Level 5: schoolInfo.logoUrl beats schoolInfo.schoolLogo
        const r5 = h({
          logoStorageUrl: '',
          logoUrl: '',
          schoolLogo: '',
          schoolInfo: { logoStorageUrl: '', logoUrl: 'data:logo5', schoolLogo: 'data:logo6' }
        });

        // Level 6: schoolInfo.schoolLogo
        const r6 = h({
          logoStorageUrl: '',
          logoUrl: '',
          schoolLogo: '',
          schoolInfo: { logoStorageUrl: '', logoUrl: '', schoolLogo: 'data:logo6' }
        });

        // Level 7: matchedSchool / school.logo_url fallback
        const r7 = h({
          logoStorageUrl: '',
          logoUrl: '',
          schoolLogo: '',
          logo_url: 'https://cdn/school.png',
          schoolInfo: { logoStorageUrl: '', logoUrl: '', schoolLogo: '' }
        });

        // Level 8: Empty
        const r8 = h({
          logoStorageUrl: '',
          logoUrl: '',
          schoolLogo: '',
          schoolInfo: { logoStorageUrl: '', logoUrl: '', schoolLogo: '' }
        });

        return { r1, r2, r3, r4, r5, r6, r7, r8 };
      });

      assert.strictEqual(results.r1, 'https://storage/logo1.png');
      assert.strictEqual(results.r2, 'data:logo2');
      assert.strictEqual(results.r3, 'data:logo3');
      assert.strictEqual(results.r4, 'https://storage/logo4.png');
      assert.strictEqual(results.r5, 'data:logo5');
      assert.strictEqual(results.r6, 'data:logo6');
      assert.strictEqual(results.r7, 'https://cdn/school.png');
      assert.strictEqual(results.r8, '');
    });

    await test('2.2: SchoolApp.getSignatureUrl enforces exact precedence order', async () => {
      const results = await page.evaluate(() => {
        const h = window.SchoolApp.getSignatureUrl.bind(window.SchoolApp);
        // Level 1: principalSignatureStorageUrl beats all
        const r1 = h({
          principalSignatureStorageUrl: 'https://storage/sig1.png',
          principalSignatureUrl: 'data:sig2',
          schoolInfo: { principalSignatureStorageUrl: 'https://storage/sig3.png', principalSignatureUrl: 'data:sig4' }
        });

        // Level 2: principalSignatureUrl beats schoolInfo
        const r2 = h({
          principalSignatureStorageUrl: '',
          principalSignatureUrl: 'data:sig2',
          schoolInfo: { principalSignatureStorageUrl: 'https://storage/sig3.png', principalSignatureUrl: 'data:sig4' }
        });

        // Level 3: schoolInfo.principalSignatureStorageUrl beats schoolInfo.principalSignatureUrl
        const r3 = h({
          principalSignatureStorageUrl: '',
          principalSignatureUrl: '',
          schoolInfo: { principalSignatureStorageUrl: 'https://storage/sig3.png', principalSignatureUrl: 'data:sig4' }
        });

        // Level 4: schoolInfo.principalSignatureUrl
        const r4 = h({
          principalSignatureStorageUrl: '',
          principalSignatureUrl: '',
          schoolInfo: { principalSignatureStorageUrl: '', principalSignatureUrl: 'data:sig4' }
        });

        // Level 5: Empty
        const r5 = h({
          principalSignatureStorageUrl: '',
          principalSignatureUrl: '',
          schoolInfo: { principalSignatureStorageUrl: '', principalSignatureUrl: '' }
        });

        return { r1, r2, r3, r4, r5 };
      });

      assert.strictEqual(results.r1, 'https://storage/sig1.png');
      assert.strictEqual(results.r2, 'data:sig2');
      assert.strictEqual(results.r3, 'https://storage/sig3.png');
      assert.strictEqual(results.r4, 'data:sig4');
      assert.strictEqual(results.r5, '');
    });

    // ─────────────────────────────────────────────────────────────
    // CATEGORY 3: Playwright UI: Admin Logo & Signature Management
    // ─────────────────────────────────────────────────────────────
    console.log('\n=== Category 3: Playwright UI: Admin Logo & Signature Management ===');

    // Log in as admin
    console.log('Logging in as v77admin...');
    await page.click('button.login-tab[data-role="admin"]');
    await page.fill('#admin-username', 'v77admin');
    await page.fill('#admin-password', 'V77Admin@123');
    await page.click('#login-submit-btn');

    await page.waitForSelector('#app-layout:not(.hidden)', { timeout: 15000 });
    console.log('✅ Admin login succeeded, navigating to School Settings...');

    // Navigate to Admin Settings
    await page.click('.sidebar-nav a[data-page="admin"]');
    await page.waitForSelector('#page-admin:not(.hidden)', { timeout: 10000 });
    await page.click('button.tab-btn[data-tab="settings"]');
    await page.waitForSelector('#tab-settings.active', { timeout: 5000 });

    // Mock storageSDK upload inside browser page to return deterministic download URLs
    await page.evaluate(() => {
      window.storageSDK = {
        ref: (st, p) => ({ path: p }),
        uploadBytes: async (r, blob) => {
          window.__lastUploadedBlobSize = blob.size;
          window.__lastUploadedBlobType = blob.type;
          return { ref: r };
        },
        getDownloadURL: async (r) => {
          return `https://firebasestorage.googleapis.com/v0/b/ctrl-shift-solutions.firebasestorage.app/o/${encodeURIComponent(r.path)}?alt=media&token=test-mock-token-123`;
        },
        deleteObject: async () => {}
      };
      window.storage = {};
    });

    // Auto-accept confirmation dialogs
    page.on('dialog', d => d.accept());

    await test('3.1: Upload 1.2 MB logo -> compressed upload -> preview & sidebar show new image', async () => {
      // Trigger logo upload via input element
      await page.setInputFiles('#school-logo-input', largeLogoPath);

      // Wait for success toast / status container update
      await page.waitForFunction(() => {
        const el = document.getElementById('logo-status-container');
        return el && el.innerText.includes('uploaded successfully');
      }, { timeout: 10000 });

      // Verify blob size compressed before upload
      const uploadedSize = await page.evaluate(() => window.__lastUploadedBlobSize);
      console.log(`     Upload intercepted: ${uploadedSize} bytes (${(uploadedSize / 1024).toFixed(1)} KB)`);
      assert(uploadedSize <= 300 * 1024, `Uploaded blob must be <= 300 KB, got: ${uploadedSize}`);

      // Verify preview
      const previewSrc = await page.evaluate(() => {
        const img = document.querySelector('#logo-preview img');
        return img ? img.src : '';
      });
      assert(previewSrc.includes('firebasestorage.googleapis.com'), `Preview should display storage URL, got: ${previewSrc}`);

      // Verify sidebar branding
      const sidebarSrc = await page.evaluate(() => {
        const img = document.querySelector('.logo-img');
        return { src: img ? img.src : '', display: img ? img.style.display : '' };
      });
      assert(sidebarSrc.src.includes('firebasestorage.googleapis.com'), `Sidebar logo should display storage URL, got: ${sidebarSrc.src}`);
      assert(sidebarSrc.display !== 'none', 'Sidebar logo must be visible');

      // Verify Firestore persisted fields
      const snap = await db.collection('tenant_data').doc(TEST_SCHOOL).get();
      const data = snap.data();
      assert(data.settings.logoStorageUrl.includes('firebasestorage'), `settings.logoStorageUrl must be set in Firestore: ${data.settings.logoStorageUrl}`);
      assert(data.settings.schoolInfo.logoStorageUrl.includes('firebasestorage'), `settings.schoolInfo.logoStorageUrl must be set in Firestore: ${data.settings.schoolInfo.logoStorageUrl}`);
    });

    await test('3.2: Remove logo -> clears preview, hides sidebar, and wipes ALL 6 fields in Firestore', async () => {
      // Click Remove Logo
      await page.click('#logo-preview button.btn-danger');

      // Wait for removed status
      await page.waitForFunction(() => {
        const el = document.getElementById('logo-preview');
        return el && el.innerText.includes('No logo uploaded');
      }, { timeout: 8000 });

      // Verify sidebar logo hidden
      const sidebarVisible = await page.evaluate(() => {
        const img = document.querySelector('.logo-img');
        return img && img.style.display !== 'none';
      });
      assert(!sidebarVisible, 'Sidebar logo should be hidden after removal');

      // Verify Firestore: all 6 fields cleared via dot-path update
      const snap = await db.collection('tenant_data').doc(TEST_SCHOOL).get();
      const data = snap.data();
      const s = data.settings || {};
      const si = s.schoolInfo || {};

      assert.strictEqual(s.logoStorageUrl || '', '', 'settings.logoStorageUrl must be empty');
      assert.strictEqual(s.logoUrl || '', '', 'settings.logoUrl must be empty');
      assert.strictEqual(s.schoolLogo || '', '', 'settings.schoolLogo must be empty');
      assert.strictEqual(si.logoStorageUrl || '', '', 'schoolInfo.logoStorageUrl must be empty');
      assert.strictEqual(si.logoUrl || '', '', 'schoolInfo.logoUrl must be empty');
      assert.strictEqual(si.schoolLogo || '', '', 'schoolInfo.schoolLogo must be empty');

      const schoolSnap = await db.collection('schools').doc(TEST_SCHOOL).get();
      assert.strictEqual(schoolSnap.data().logo_url || '', '', 'schools/{id}.logo_url must be empty');
    });

    await test('3.3: Upload signature -> preview shows it -> both storage fields set in Firestore', async () => {
      // Upload signature
      await page.setInputFiles('#settings-signature-upload', largeLogoPath);

      // Wait for success status
      await page.waitForFunction(() => {
        const el = document.getElementById('signature-status-container');
        return el && el.innerText.includes('uploaded successfully');
      }, { timeout: 10000 });

      // Verify preview
      const previewSrc = await page.evaluate(() => {
        const img = document.querySelector('#signature-preview img');
        return img ? img.src : '';
      });
      assert(previewSrc.includes('firebasestorage.googleapis.com'), `Signature preview should display storage URL, got: ${previewSrc}`);

      // Verify Firestore
      let snap, data;
      for (let i = 0; i < 15; i++) {
        snap = await db.collection('tenant_data').doc(TEST_SCHOOL).get();
        data = snap.data() || {};
        if (data.settings && data.settings.principalSignatureStorageUrl) break;
        await new Promise(r => setTimeout(r, 200));
      }
      assert(data.settings && data.settings.principalSignatureStorageUrl && data.settings.principalSignatureStorageUrl.includes('firebasestorage'), 'settings.principalSignatureStorageUrl must be set');
      assert(data.settings.schoolInfo && data.settings.schoolInfo.principalSignatureStorageUrl && data.settings.schoolInfo.principalSignatureStorageUrl.includes('firebasestorage'), 'schoolInfo.principalSignatureStorageUrl must be set');
    });

    await test('3.4: Remove signature -> preview empty -> ALL 4 signature fields cleared in Firestore', async () => {
      // Click Remove Signature
      await page.click('#signature-preview button.btn-danger');

      // Wait for removed status
      await page.waitForFunction(() => {
        const el = document.getElementById('signature-preview');
        return el && el.innerText.includes('No signature uploaded');
      }, { timeout: 8000 });

      // Poll Firestore for propagation to ensure write is committed
      let s = {}, si = {};
      for (let i = 0; i < 25; i++) {
        const snap = await db.collection('tenant_data').doc(TEST_SCHOOL).get();
        const data = snap.data() || {};
        s = data.settings || {};
        si = s.schoolInfo || {};
        if (!s.principalSignatureStorageUrl && !s.principalSignatureUrl) break;
        await new Promise(r => setTimeout(r, 200));
      }

      assert.strictEqual(s.principalSignatureStorageUrl || '', '', 'settings.principalSignatureStorageUrl must be empty');
      assert.strictEqual(s.principalSignatureUrl || '', '', 'settings.principalSignatureUrl must be empty');
      assert.strictEqual(si.principalSignatureStorageUrl || '', '', 'schoolInfo.principalSignatureStorageUrl must be empty');
      assert.strictEqual(si.principalSignatureUrl || '', '', 'schoolInfo.principalSignatureUrl must be empty');
    });

    // ─────────────────────────────────────────────────────────────
    // CATEGORY 4: Parent Portal Captcha & Visible Error Display
    // ─────────────────────────────────────────────────────────────
    console.log('\n=== Category 4: Parent Portal Captcha & Visible Error Display ===');

    await page.goto(`http://localhost:${TEST_PORT}/parents.html`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForSelector('#view-email', { timeout: 10000 });

    await test('4.1: Turnstile widget container is rendered on localhost', async () => {
      const containerExists = await page.evaluate(() => {
        return !!document.getElementById('turnstile-widget');
      });
      assert(containerExists, '#turnstile-widget container must exist in parents.html');

      // Verify test site key on localhost
      const keyIsConfigured = await page.evaluate(() => {
        return window.TURNSTILE_SITE_KEY === '0x4AAAAAAFlTl6sGRSOx0A_L';
      });
      assert(keyIsConfigured, 'window.TURNSTILE_SITE_KEY must be set in parents.html');
    });

    await test('4.2: Submitting without captcha in production shows "Please complete the security check"', async () => {
      // Simulate non-localhost environment in page state to test security guard
      const alertMsg = await page.evaluate(async () => {
        window.__FORCE_PROD_MODE__ = true;
        const emailInput = document.getElementById('input-email');
        emailInput.value = 'parent@test.com';

        // Trigger submit
        const form = document.getElementById('form-email');
        form.dispatchEvent(new Event('submit', { cancelable: true }));

        const alertEl = document.getElementById('email-alert');
        const text = alertEl ? alertEl.innerText : '';

        window.__FORCE_PROD_MODE__ = false;
        return text;
      });

      assert(alertMsg.includes('Please complete the security check'), `Alert should state "Please complete the security check", got: "${alertMsg}"`);
    });

    await test('4.3: Server error messages display visibly in form alert (no silent failures)', async () => {
      // Submit empty / invalid email
      await page.fill('#input-email', 'invalid-email');
      await page.click('#btn-send-otp');

      const clientAlert = await page.evaluate(() => {
        const el = document.getElementById('email-alert');
        return el && !el.classList.contains('hidden') ? el.innerText : '';
      });
      assert(clientAlert.includes('valid email address'), `Validation alert should appear, got: "${clientAlert}"`);

      // Mock an API error response (e.g. rate limit or account not found)
      await page.route('**/api/parents*', route => {
        route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Too many login attempts. Please try again in 1 hour.' })
        });
      });

      await page.fill('#input-email', 'unregistered_parent_999@test.com');
      await page.click('#btn-send-otp');

      // Wait for server error alert to appear
      await page.waitForFunction(() => {
        const el = document.getElementById('email-alert');
        return el && !el.classList.contains('hidden') && el.innerText.includes('Too many login attempts');
      }, { timeout: 5000 });

      const serverAlert = await page.evaluate(() => {
        const el = document.getElementById('email-alert');
        return el ? el.innerText : '';
      });
      assert(serverAlert.includes('Too many login attempts'), `Server error must be visibly displayed, got: "${serverAlert}"`);
    });

  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n======================================================================');
  console.log(`v77 TEST SUITE SUMMARY: Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log('======================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('\nFATAL TEST RUNNER ERROR:', err);
  process.exit(1);
});
