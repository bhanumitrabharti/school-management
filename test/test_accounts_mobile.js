/**
 * Playwright Mobile Responsiveness & Overflow Test for Accounts Module (v68)
 * Verifies document.documentElement.scrollWidth === window.innerWidth across
 * [320, 360, 390, 414, 768, 1280] widths for all Accounts tabs, setup view, and modals.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));

const PORT = 8490;
const REPO_ROOT = path.join(__dirname, '..');
const ARTIFACTS_DIR = 'C:/Users/bhanu/.gemini/antigravity/brain/06985d1a-3444-4a82-be77-f91f40399cc3';

function createServer() {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  return http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(REPO_ROOT, reqPath);

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    });
  });
}

const WIDTHS = [320, 360, 390, 414, 768, 1280];

async function run() {
  console.log('--- Starting Accounts Mobile Responsiveness Playwright Test Suite ---');
  const server = createServer();
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`[PASS] Local static server listening on http://localhost:${PORT}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = [];
  let totalChecks = 0;
  let passedChecks = 0;

  try {
    for (const width of WIDTHS) {
      console.log(`\nTesting viewport width: ${width}px...`);
      const context = await browser.newContext({
        serviceWorkers: 'block',
        viewport: { width: width, height: 850 },
        deviceScaleFactor: 1
      });

      // Intercept version check to avoid auto-reload
      await context.route('**/version.json*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ version: 'v67' })
        });
      });

      // Prevent any navigation/reload
      await context.addInitScript(() => {
        window.checkServerVersion = function() {};
        window.addEventListener('beforeunload', (e) => {
          e.preventDefault();
          return false;
        });
      });

      const page = await context.newPage();
      await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });

      // Disable login redirection and setup mock authenticated admin session
      await page.evaluate(() => {
        window.SchoolApp.showLoginPage = function() {};
        
        window.SchoolApp.currentUser = {
          id: 'admin',
          firstName: 'Admin',
          lastName: 'User',
          role: 'admin'
        };
        window.SchoolApp.store = window.SchoolApp.store || {};
        window.SchoolApp.store.currentSchoolId = 'mock_school_001';
        window.SchoolApp.store.schools = [
          {
            school_id: 'mock_school_001',
            school_name: 'Test Academy',
            allowed_features: ['accounts']
          }
        ];
        window.SchoolApp.matchedSchool = window.SchoolApp.store.schools[0];
        window.SchoolApp.store.settings = {
          schoolName: 'Test Academy',
          schoolInfo: { name: 'Test Academy' }
        };

        // Render app UI
        window.SchoolApp.showApp();
        window.SchoolApp.navigate('accounts');

        // Populate accounts module mock data
        const acc = window.SchoolApp.modules.accounts;
        acc.ensureScopedStyles();
        acc.settings = {
          setupCompletedAt: new Date().toISOString(),
          financialYearStartMonth: 4,
          entityType: 'trust_society',
          bankAccounts: [
            { id: 'b1', ledgerAccountId: '11200', label: 'Primary Operations A/c', bankName: 'State Bank of India', last4: '4821', isActive: true },
            { id: 'b2', ledgerAccountId: '11210', label: 'Fee Collection A/c', bankName: 'HDFC Bank', last4: '1092', isActive: true }
          ]
        };
        acc.chart = (acc.chart && acc.chart.length > 0) ? acc.chart : [
          { code: '11100', name: 'Cash in Hand', type: 'asset', group: 'Current Assets', isSystem: true, isActive: true },
          { code: '11200', name: 'Primary Bank Account', type: 'asset', group: 'Current Assets', isSystem: true, isActive: true },
          { code: '52100', name: 'Printing & Stationery', type: 'expense', group: 'Operating Expenses', isSystem: true, isActive: true },
          { code: '53100', name: 'Electricity Utility', type: 'expense', group: 'Operating Expenses', isSystem: true, isActive: true }
        ];
        acc.expenses = [
          {
            id: 'exp_1',
            expenseNo: 'EXP-2026-0001',
            date: '2026-10-30',
            financialYear: '2026-27',
            vendorName: 'Shyam Book Depot & Stationery Suppliers',
            vendorPhone: '9876543210',
            categoryAccountId: '52100',
            paymentMode: 'Cash',
            paidFromAccountId: '11100',
            amountPaise: 450000,
            referenceNo: 'BILL-892',
            description: 'Annual examination answer sheets and student report card jackets',
            status: 'active',
            attachments: [{ name: 'bill_receipt.pdf', url: '#', sizeBytes: 124500 }],
            createdAt: new Date().toISOString()
          },
          {
            id: 'exp_2',
            expenseNo: 'EXP-2026-0002',
            date: '2026-10-31',
            financialYear: '2026-27',
            vendorName: 'City Power Corporation Ltd',
            vendorPhone: '9123456789',
            categoryAccountId: '53100',
            paymentMode: 'Bank Transfer',
            paidFromAccountId: '11200',
            amountPaise: 1250000,
            referenceNo: 'TXN-9928192',
            description: 'Electricity bill for campus main block',
            status: 'cancelled',
            cancelReason: 'Wrong meter invoice reference entered by staff',
            cancelledAt: new Date().toISOString(),
            cancelledBy: 'Admin',
            attachments: [],
            createdAt: new Date().toISOString()
          }
        ];

        acc.renderWorkspace(document.getElementById('page-accounts'));
      });

      // Helper to check horizontal scroll overflow
      async function checkOverflow(viewName, screenshotPath) {
        totalChecks++;
        await page.waitForTimeout(60);
        const metrics = await page.evaluate(() => {
          return {
            windowInnerWidth: window.innerWidth,
            docScrollWidth: document.documentElement.scrollWidth,
            bodyScrollWidth: document.body.scrollWidth
          };
        });

        const isOk = metrics.docScrollWidth === width && metrics.bodyScrollWidth <= width;
        if (isOk) {
          passedChecks++;
          console.log(`  [PASS] ${viewName} (${width}px): scrollWidth=${metrics.docScrollWidth}, innerWidth=${metrics.windowInnerWidth}`);
        } else {
          console.error(`  [FAIL] ${viewName} (${width}px): scrollWidth=${metrics.docScrollWidth} !== innerWidth=${metrics.windowInnerWidth}`);
        }

        if (screenshotPath) {
          await page.screenshot({ path: screenshotPath, fullPage: false });
        }

        results.push({
          width,
          view: viewName,
          docScrollWidth: metrics.docScrollWidth,
          expectedWidth: width,
          passed: isOk
        });

        assert.strictEqual(
          metrics.docScrollWidth,
          width,
          `Horizontal overflow detected on ${viewName} at ${width}px width: docScrollWidth=${metrics.docScrollWidth} > ${width}`
        );
      }

      // 1. Overview Tab
      await page.evaluate(() => window.SchoolApp.modules.accounts.switchTab('overview'));
      await checkOverflow('Overview Tab', path.join(ARTIFACTS_DIR, `accounts_overview_${width}px.png`));

      // 2. Expenses Tab
      await page.evaluate(() => window.SchoolApp.modules.accounts.switchTab('expenses'));
      await checkOverflow('Expenses Tab', path.join(ARTIFACTS_DIR, `accounts_expenses_${width}px.png`));

      // 3. Chart of Accounts Tab
      await page.evaluate(() => window.SchoolApp.modules.accounts.switchTab('chart'));
      await checkOverflow('Chart of Accounts Tab', path.join(ARTIFACTS_DIR, `accounts_chart_${width}px.png`));

      // 4. Settings Tab
      await page.evaluate(() => window.SchoolApp.modules.accounts.switchTab('settings'));
      await checkOverflow('Settings Tab', path.join(ARTIFACTS_DIR, `accounts_settings_${width}px.png`));

      // 5. First-Run Setup Wizard View
      await page.evaluate(() => window.SchoolApp.modules.accounts.renderSetupWizard(document.getElementById('page-accounts')));
      await checkOverflow('Setup Wizard View', path.join(ARTIFACTS_DIR, `accounts_setup_${width}px.png`));

      // Re-render workspace for modal testing
      await page.evaluate(() => window.SchoolApp.modules.accounts.renderWorkspace(document.getElementById('page-accounts')));

      // 6. Record New Expense Modal
      await page.evaluate(() => window.SchoolApp.modules.accounts.openAddExpenseModal());
      await checkOverflow('Record New Expense Modal', path.join(ARTIFACTS_DIR, `accounts_modal_add_expense_${width}px.png`));
      await page.evaluate(() => window.SchoolApp.closeModal());

      // 7. Expense Details Modal
      await page.evaluate(() => window.SchoolApp.modules.accounts.viewExpenseDetails('exp_1'));
      await checkOverflow('Expense Details Modal', path.join(ARTIFACTS_DIR, `accounts_modal_details_${width}px.png`));
      await page.evaluate(() => window.SchoolApp.closeModal());

      // 8. Cancel Expense Modal
      await page.evaluate(() => window.SchoolApp.modules.accounts.promptCancelExpense('exp_1'));
      await checkOverflow('Cancel Expense Modal', path.join(ARTIFACTS_DIR, `accounts_modal_cancel_${width}px.png`));
      await page.evaluate(() => window.SchoolApp.closeModal());

      // 9. Add Custom Account Modal
      await page.evaluate(() => window.SchoolApp.modules.accounts.openAddCustomAccountModal());
      await checkOverflow('Add Custom Account Modal', path.join(ARTIFACTS_DIR, `accounts_modal_custom_acc_${width}px.png`));
      await page.evaluate(() => window.SchoolApp.closeModal());

      await context.close();
    }

    console.log(`\n=======================================================`);
    console.log(`All Responsiveness Tests Passed: ${passedChecks}/${totalChecks} assertions passed.`);
    console.log(`=======================================================`);
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('[FATAL TEST ERROR]', err);
  process.exit(1);
});
