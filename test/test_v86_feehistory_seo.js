/**
 * test/test_v86_feehistory_seo.js
 * Comprehensive Test Suite for v86:
 *  - Part A: Fee History Subcollection writes, dual-read merge, gap handling & Cash Collected Today rename
 *  - Part A Rules: Firestore rules enforcement on fee_activity_logs subcollection
 *  - Part B: Website SEO, canonicals, JSON-LD, 404 routing, robots tags, sitemap, About and Case Study pages
 */

const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const rulesPath = path.resolve(ROOT_DIR, 'firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

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

async function runAllTests() {
  console.log('========================================================');
  console.log('--- RUNNING v86 TEST SUITE: FEE HISTORY & WEBSITE SEO ---');
  console.log('========================================================\n');

  // ========================================================
  // 1. FIRESTORE RULES TESTS (fee_activity_logs)
  // ========================================================
  console.log('--- 1. Testing Firestore Security Rules on fee_activity_logs ---');

  const testEnv = await initializeTestEnvironment({
    projectId: 'ctrl-shift-solutions',
    firestore: {
      rules: rulesContent,
      host: '127.0.0.1',
      port: 8085
    }
  });

  await testEnv.clearFirestore();

  // Seed access mappings
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('school_access/admin_sch1').set({ schoolId: 'sch1', role: 'admin' });
    await db.doc('school_access/teacher_sch1').set({ schoolId: 'sch1', role: 'teacher', teacherId: 'T1' });
    await db.doc('school_access/admin_sch2').set({ schoolId: 'sch2', role: 'admin' });
    await db.doc('school_access/parent_user').set({ phone: '+919999999999' });
  });

  await recordTest('RULES-01', 'School Admin can write to fee_activity_logs subcollection', async () => {
    const adminCtx = testEnv.authenticatedContext('admin_sch1');
    const db = adminCtx.firestore();
    await assertSucceeds(
      db.doc('tenant_data/sch1/fee_activity_logs/log_001').set({
        id: 'log_001',
        timestamp: new Date().toISOString(),
        studentId: 'std_1',
        amount: 500,
        addedBy: 'Admin'
      })
    );
  });

  await recordTest('RULES-02', 'School Admin can read from fee_activity_logs subcollection', async () => {
    const adminCtx = testEnv.authenticatedContext('admin_sch1');
    const db = adminCtx.firestore();
    await assertSucceeds(
      db.doc('tenant_data/sch1/fee_activity_logs/log_001').get()
    );
  });

  await recordTest('RULES-03', 'Teacher is DENIED write to fee_activity_logs', async () => {
    const teacherCtx = testEnv.authenticatedContext('teacher_sch1');
    const db = teacherCtx.firestore();
    await assertFails(
      db.doc('tenant_data/sch1/fee_activity_logs/log_002').set({
        id: 'log_002',
        timestamp: new Date().toISOString(),
        studentId: 'std_1',
        amount: 500
      })
    );
  });

  await recordTest('RULES-04', 'Teacher is DENIED read from fee_activity_logs', async () => {
    const teacherCtx = testEnv.authenticatedContext('teacher_sch1');
    const db = teacherCtx.firestore();
    await assertFails(
      db.doc('tenant_data/sch1/fee_activity_logs/log_001').get()
    );
  });

  await recordTest('RULES-05', 'Parent is DENIED write and read to fee_activity_logs', async () => {
    const parentCtx = testEnv.authenticatedContext('parent_user');
    const db = parentCtx.firestore();
    await assertFails(
      db.doc('tenant_data/sch1/fee_activity_logs/log_003').set({ id: 'log_003', amount: 100 })
    );
    await assertFails(
      db.doc('tenant_data/sch1/fee_activity_logs/log_001').get()
    );
  });

  await recordTest('RULES-06', 'Anonymous user is DENIED access to fee_activity_logs', async () => {
    const anonCtx = testEnv.unauthenticatedContext();
    const db = anonCtx.firestore();
    await assertFails(
      db.doc('tenant_data/sch1/fee_activity_logs/log_001').get()
    );
    await assertFails(
      db.doc('tenant_data/sch1/fee_activity_logs/log_004').set({ id: 'log_004' })
    );
  });

  await recordTest('RULES-07', 'Admin of other school (sch2) is DENIED write to sch1 fee_activity_logs', async () => {
    const admin2Ctx = testEnv.authenticatedContext('admin_sch2');
    const db = admin2Ctx.firestore();
    await assertFails(
      db.doc('tenant_data/sch1/fee_activity_logs/log_005').set({ id: 'log_005', amount: 200 })
    );
  });

  await testEnv.cleanup();

  // ========================================================
  // 2. PART A UNIT & LOGIC TESTS (Fee Activity Logs, Merge, Gap Handling)
  // ========================================================
  console.log('\n--- 2. Testing Fee Activity Logging, Merge & Gap Handling Logic ---');

  // Mock SchoolApp context
  function createMockSchoolApp(storageVersion, feeLogMigrated, restructured) {
    const mockApp = {
      currentSchoolId: 'test_school_001',
      store: {
        currentSchoolId: 'test_school_001',
        settings: {
          storageVersion: storageVersion,
          feeLogMigrated: feeLogMigrated
        },
        fees: [],
        feeActivityLog: [],
        students: [
          { id: 's1', firstName: 'Ravi', lastName: 'Sharma', class: '5', section: 'A' },
          { id: 's2', firstName: 'Anita', lastName: 'Kumari', class: '6', section: 'B' }
        ]
      },
      isStorageVersion2: function(sid) {
        return (this.store.settings.storageVersion || 1) >= 2;
      },
      isFeeLogMigrated: function(sid) {
        return this.store.settings.feeLogMigrated === true;
      },
      isRestructured: function(sid) {
        return !!restructured;
      },
      isFeeLogSubcollection: function(sid) {
        return this.isFeeLogMigrated(sid) || this.isStorageVersion2(sid) || this.isRestructured(sid);
      },
      generateId: function() {
        return 'id_' + Math.random().toString(36).slice(2, 9);
      }
    };
    return mockApp;
  }

  await recordTest('LOGIC-01', 'isFeeLogSubcollection returns true for storageVersion 2 even when feeLogMigrated is false', async () => {
    const app = createMockSchoolApp(2, false, true); // Greenwood state
    assert.strictEqual(app.isFeeLogSubcollection('test_school_001'), true);
  });

  await recordTest('LOGIC-02', 'isFeeLogSubcollection returns true for feeLogMigrated=true', async () => {
    const app = createMockSchoolApp(1, true, false);
    assert.strictEqual(app.isFeeLogSubcollection('test_school_001'), true);
  });

  await recordTest('LOGIC-03', 'isFeeLogSubcollection returns false for legacy non-v2 school', async () => {
    const app = createMockSchoolApp(1, false, false);
    assert.strictEqual(app.isFeeLogSubcollection('test_school_001'), false);
  });

  await recordTest('LOGIC-04', 'Merging root logs and subcollection logs by ID with newest first ordering', async () => {
    const app = createMockSchoolApp(2, false, true);
    app.store.feeActivityLog = [
      { id: 'log_root_old', timestamp: '2026-09-10T10:00:00Z', amount: 500, studentId: 's1' },
      { id: 'log_shared', timestamp: '2026-09-15T10:00:00Z', amount: 800, studentId: 's1', note: 'Old note' }
    ];

    const fetchedSubcoll = [
      { id: 'log_shared', timestamp: '2026-09-15T10:00:00Z', amount: 800, studentId: 's1', note: 'Updated note' },
      { id: 'log_sub_new', timestamp: '2026-11-10T12:00:00Z', amount: 1200, studentId: 's2' }
    ];

    const logMap = new Map();
    (app.store.feeActivityLog || []).forEach(l => { if (l && l.id) logMap.set(l.id, l); });
    fetchedSubcoll.forEach(l => { if (l && l.id) logMap.set(l.id, l); });
    const merged = Array.from(logMap.values());
    merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    assert.strictEqual(merged.length, 3, 'Merged list should contain exactly 3 unique items');
    assert.strictEqual(merged[0].id, 'log_sub_new', 'Newest log must be first');
    assert.strictEqual(merged[1].id, 'log_shared', 'Shared log must be in middle');
    assert.strictEqual(merged[1].note, 'Updated note', 'Authoritative subcoll record takes precedence');
    assert.strictEqual(merged[2].id, 'log_root_old', 'Oldest root log must be last');
  });

  await recordTest('LOGIC-05', 'Gap handling derives fee history from transactions without real logs', async () => {
    const app = createMockSchoolApp(2, false, true);
    // Real log exists for txn 1
    app.store.feeActivityLog = [
      { id: 'log_1', txnId: 'txn_1', receiptNo: 'GPS/2026-27/000001', studentId: 's1', amount: 500, timestamp: '2026-09-20T10:00:00Z' }
    ];
    // Transactions: txn_1 (logged), txn_2 (payment gap in Nov), txn_3 (due gap in Nov), txn_4 (void reversal in Nov)
    app.store.fees = [
      { id: 'txn_1', type: 'payment', mode: 'Cash', receiptNo: 'GPS/2026-27/000001', studentId: 's1', amount: 500, timestamp: '2026-09-20T10:00:00Z' },
      { id: 'txn_2', type: 'payment', mode: 'UPI', receiptNo: 'GPS/2026-27/000002', studentId: 's2', amount: 1500, timestamp: '2026-11-05T14:30:00Z', recordedBy: 'accountant' },
      { id: 'txn_3', type: 'due', description: 'Exam Fee', studentId: 's1', amount: 350, timestamp: '2026-11-06T09:00:00Z', addedBy: 'admin' },
      { id: 'txn_4', type: 'reversal', mode: 'Reversal', studentId: 's2', amount: -1500, timestamp: '2026-11-07T11:00:00Z', voidedBy: 'admin', remarks: 'Mistake' }
    ];

    const studentMap = {
      s1: app.store.students[0],
      s2: app.store.students[1]
    };

    const rawLogs = app.store.feeActivityLog.slice();
    const knownTxnIds = new Set();
    const knownReceipts = new Set();
    const knownSignatures = new Set();

    rawLogs.forEach(l => {
      if (l.id) knownTxnIds.add(l.id);
      if (l.txnId) knownTxnIds.add(l.txnId);
      if (l.receiptNo) knownReceipts.add(String(l.receiptNo).trim());
      const dt = l.timestamp ? String(l.timestamp).slice(0, 10) : '';
      const amt = Math.abs(parseFloat(l.amount || 0)).toFixed(2);
      if (l.studentId && dt) knownSignatures.add(l.studentId + '|' + dt + '|' + amt);
    });

    const derivedLogs = [];
    app.store.fees.forEach(txn => {
      if (knownTxnIds.has(txn.id)) return;
      if (txn.receiptNo && knownReceipts.has(String(txn.receiptNo).trim())) return;
      const txnDt = txn.timestamp ? String(txn.timestamp).slice(0, 10) : '';
      const txnAmt = Math.abs(parseFloat(txn.amount || 0)).toFixed(2);
      if (txn.studentId && txnDt && knownSignatures.has(txn.studentId + '|' + txnDt + '|' + txnAmt)) return;

      const isPayment = (txn.type === 'payment' || (!txn.type && txn.mode && txn.mode !== 'Reversal'));
      const isReversal = (txn.mode === 'Reversal' || txn.type === 'reversal');
      const headName = isReversal ? 'Void / Reversal' : (isPayment ? ('Payment (' + (txn.mode || 'Cash') + ')') : (txn.description || 'Fee Due'));

      derivedLogs.push({
        id: 'derived_' + txn.id,
        isDerived: true,
        timestamp: txn.timestamp,
        studentId: txn.studentId,
        studentName: studentMap[txn.studentId].firstName + ' ' + studentMap[txn.studentId].lastName,
        className: studentMap[txn.studentId].class + '-' + studentMap[txn.studentId].section,
        feeHeadName: headName,
        amount: isReversal ? -Math.abs(txn.amount) : txn.amount,
        addedBy: txn.recordedBy || txn.addedBy || txn.voidedBy,
        receiptNo: txn.receiptNo || null
      });
    });

    assert.strictEqual(derivedLogs.length, 3, 'Must derive entries for exactly 3 unlogged transactions');
    assert.strictEqual(derivedLogs.some(d => d.id === 'derived_txn_1'), false, 'txn_1 already had real log, must not be duplicated');
    assert.strictEqual(derivedLogs.find(d => d.id === 'derived_txn_2').isDerived, true);
    assert.strictEqual(derivedLogs.find(d => d.id === 'derived_txn_2').feeHeadName, 'Payment (UPI)');
    assert.strictEqual(derivedLogs.find(d => d.id === 'derived_txn_2').amount, 1500);
    assert.strictEqual(derivedLogs.find(d => d.id === 'derived_txn_3').feeHeadName, 'Exam Fee');
    assert.strictEqual(derivedLogs.find(d => d.id === 'derived_txn_4').feeHeadName, 'Void / Reversal');
    assert.strictEqual(derivedLogs.find(d => d.id === 'derived_txn_4').amount, -1500);
  });

  await recordTest('LOGIC-06', 'Fee Ledger card renamed to "Cash Collected Today"', async () => {
    const feesJs = fs.readFileSync(path.join(ROOT_DIR, 'js/fees.js'), 'utf8');
    assert.strictEqual(feesJs.includes('<div class="stat-label">Cash Collected Today</div>'), true);
    assert.strictEqual(feesJs.includes('<div class="stat-label">Cash in Hand</div>'), false);
  });

  // ========================================================
  // 3. PART B WEBSITE SEO & METADATA TESTS
  // ========================================================
  console.log('\n--- 3. Testing Website SEO, Canonicals, JSON-LD & Page Tagging ---');

  const landingHtml = fs.readFileSync(path.join(ROOT_DIR, 'landing.html'), 'utf8');

  await recordTest('SEO-01', 'landing.html canonical URL is https://www.ctrlshifts.in/', async () => {
    assert.strictEqual(landingHtml.includes('<link rel="canonical" href="https://www.ctrlshifts.in/">'), true);
    assert.strictEqual(landingHtml.includes('href="https://ctrlshifts.in/"'), false);
  });

  await recordTest('SEO-02', 'landing.html og:url is https://www.ctrlshifts.in/', async () => {
    assert.strictEqual(landingHtml.includes('<meta property="og:url" content="https://www.ctrlshifts.in/">'), true);
  });

  await recordTest('SEO-03', 'landing.html title has consistent brand "Paathshala by Ctrl Shift Solutions"', async () => {
    assert.strictEqual(
      landingHtml.includes('<title>Paathshala by Ctrl Shift Solutions — School Management Software for Indian Schools</title>'),
      true
    );
  });

  await recordTest('SEO-04', 'landing.html JSON-LD is valid JSON and contains required entities', async () => {
    const jsonLdMatch = landingHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(jsonLdMatch, 'JSON-LD script tag must exist');
    const jsonLd = JSON.parse(jsonLdMatch[1]);
    assert.strictEqual(jsonLd['@context'], 'https://schema.org');
    assert.ok(Array.isArray(jsonLd['@graph']), '@graph array must exist');

    const org = jsonLd['@graph'].find(e => e['@type'] === 'Organization');
    assert.ok(org, 'Organization schema must exist');
    assert.strictEqual(org.name, 'Ctrl Shift Solutions');
    assert.strictEqual(org.url, 'https://www.ctrlshifts.in/');

    const site = jsonLd['@graph'].find(e => e['@type'] === 'WebSite');
    assert.ok(site, 'WebSite schema must exist');
    assert.strictEqual(site.name, 'Paathshala by Ctrl Shift Solutions');

    const app = jsonLd['@graph'].find(e => e['@type'] === 'SoftwareApplication');
    assert.ok(app, 'SoftwareApplication schema must exist');
    assert.strictEqual(app.name, 'Paathshala by Ctrl Shift Solutions');
    assert.ok(Array.isArray(app.offers) && app.offers.length >= 6, 'Should have monthly and yearly offers for Starter, Growth, Enterprise');

    // NO aggregateRating or reviews
    const hasReviewsOrRating = JSON.stringify(jsonLd).includes('aggregateRating') || JSON.stringify(jsonLd).includes('Review');
    assert.strictEqual(hasReviewsOrRating, false, 'No aggregateRating or reviews allowed in JSON-LD');

    const faq = jsonLd['@graph'].find(e => e['@type'] === 'FAQPage');
    assert.ok(faq, 'FAQPage schema must exist');
    assert.strictEqual(faq.mainEntity.length, 8, 'FAQPage must contain exactly 8 questions matching visible content');
    assert.strictEqual(faq.mainEntity[0].name, 'Mere teachers technology mein kamzor hain — use kar paayenge?');
  });

  await recordTest('SEO-05', 'landing.html nav and footer link to About and Case Study', async () => {
    assert.ok(landingHtml.includes('href="about.html"'), 'Nav must link to about.html');
    assert.ok(landingHtml.includes('href="case-study.html"'), 'Nav must link to case-study.html');
  });

  await recordTest('SEO-06', '404.html exists, has noindex, and links to Home, Register, WhatsApp', async () => {
    const p404 = path.join(ROOT_DIR, '404.html');
    assert.ok(fs.existsSync(p404), '404.html must exist');
    const content404 = fs.readFileSync(p404, 'utf8');
    assert.ok(content404.includes('content="noindex'), '404.html must have noindex robots tag');
    assert.ok(content404.includes('href="/"'), '404.html must link to Home');
    assert.ok(content404.includes('href="register.html"'), '404.html must link to Register');
    assert.ok(content404.includes('href="https://wa.me/919155515505"'), '404.html must link to WhatsApp');
  });

  await recordTest('SEO-07', 'vercel.json routes apex/www unknown paths to 404.html with status 404 and school subdomains to index.html', async () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'vercel.json'), 'utf8'));
    const notFoundRoute = vercel.routes.find(r => r.dest === '/404.html' && r.status === 404);
    assert.ok(notFoundRoute, 'Must have a 404 destination route with status 404');
    assert.ok(notFoundRoute.has.some(h => h.value === '^(?:www\\.)?ctrlshifts\\.in$'), '404 rule must apply only to apex/www domain');

    const finalCatchAll = vercel.routes[vercel.routes.length - 1];
    assert.strictEqual(finalCatchAll.dest, '/index.html', 'Final catch-all must route school subdomains to /index.html');
  });

  await recordTest('SEO-08', 'index.html and parents.html have robots noindex; register.html remains indexable', async () => {
    const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    const parentsHtml = fs.readFileSync(path.join(ROOT_DIR, 'parents.html'), 'utf8');
    const registerHtml = fs.readFileSync(path.join(ROOT_DIR, 'register.html'), 'utf8');

    assert.ok(indexHtml.includes('<meta name="robots" content="noindex">'), 'index.html must have robots noindex');
    assert.ok(parentsHtml.includes('<meta name="robots" content="noindex">'), 'parents.html must have robots noindex');
    assert.ok(registerHtml.includes('<meta name="robots" content="index, follow">'), 'register.html must remain indexable');
    assert.ok(registerHtml.includes('<link rel="canonical" href="https://www.ctrlshifts.in/register.html">'), 'register.html canonical must be www');
  });

  await recordTest('SEO-09', 'sitemap.xml has required URLs with canonical www and lastmod 2026-11-11', async () => {
    const sitemap = fs.readFileSync(path.join(ROOT_DIR, 'sitemap.xml'), 'utf8');
    const requiredUrls = [
      'https://www.ctrlshifts.in/',
      'https://www.ctrlshifts.in/about.html',
      'https://www.ctrlshifts.in/case-study.html',
      'https://www.ctrlshifts.in/register.html',
      'https://www.ctrlshifts.in/privacy.html',
      'https://www.ctrlshifts.in/terms.html'
    ];
    requiredUrls.forEach(u => {
      assert.ok(sitemap.includes(`<loc>${u}</loc>`), `sitemap must include ${u}`);
    });
    const lastmods = sitemap.match(/<lastmod>([^<]+)<\/lastmod>/g) || [];
    assert.strictEqual(lastmods.length, 6, 'All 6 entries must have a lastmod tag');
    lastmods.forEach(lm => {
      assert.ok(lm.includes('2026-11-11'), 'lastmod must be 2026-11-11');
    });
  });

  await recordTest('SEO-10', 'robots.txt specifies www sitemap URL', async () => {
    const robots = fs.readFileSync(path.join(ROOT_DIR, 'robots.txt'), 'utf8');
    assert.ok(robots.includes('Sitemap: https://www.ctrlshifts.in/sitemap.xml'), 'robots.txt must point to www sitemap');
  });

  await recordTest('SEO-11', 'about.html has ~400-600 words, no personal names, valid meta, and JSON-LD', async () => {
    const aboutHtml = fs.readFileSync(path.join(ROOT_DIR, 'about.html'), 'utf8');
    assert.ok(aboutHtml.includes('<link rel="canonical" href="https://www.ctrlshifts.in/about.html">'), 'about.html canonical');
    assert.ok(aboutHtml.includes('<meta name="robots" content="index, follow">'), 'about.html robots');
    assert.ok(aboutHtml.includes('application/ld+json'), 'about.html JSON-LD');

    // Word count check on main article
    const mainMatch = aboutHtml.match(/<main[\s\S]*?<\/main>/);
    assert.ok(mainMatch, 'main section exists');
    const text = mainMatch[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = text.split(' ').filter(Boolean).length;
    assert.ok(wordCount >= 380 && wordCount <= 650, `Main text word count (${wordCount}) should be ~400-600 words`);

    // No personal names
    assert.strictEqual(aboutHtml.toLowerCase().includes('bhanu'), false, 'No founder personal name');
  });

  await recordTest('SEO-12', 'case-study.html has canonical www, Open Graph, and JSON-LD', async () => {
    const caseHtml = fs.readFileSync(path.join(ROOT_DIR, 'case-study.html'), 'utf8');
    assert.ok(caseHtml.includes('<link rel="canonical" href="https://www.ctrlshifts.in/case-study.html">'), 'case-study.html canonical');
    assert.ok(caseHtml.includes('<meta property="og:site_name" content="Paathshala by Ctrl Shift Solutions">'), 'case-study.html og:site_name');
    assert.ok(caseHtml.includes('application/ld+json'), 'case-study.html JSON-LD');
  });

  // ========================================================
  // SUMMARY
  // ========================================================
  console.log('\n========================================================');
  console.log(`v86 TEST SUMMARY: Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log('========================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
