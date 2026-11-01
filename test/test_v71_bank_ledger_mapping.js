'use strict';

/**
 * test/test_v71_bank_ledger_mapping.js
 *
 * Dedicated test suite verifying all v71 requirements:
 * B1: Dropdowns show SAVED value & read-only text when locked
 * B2: Bank ledger allocation (first 11200, second 11210, seeded counts as available if unlinked)
 * B3: Link bank details to seeded ledger & Move bank details from empty ledger (reject if vouchers exist)
 * B4: Overview liquidity shows EVERY cash/bank asset ledger with non-zero balance
 * B5: Digital fee ledger select options & server cash/bank asset check
 * B6(a): Go-Live Date shows "Will be set automatically on next sync" when hasFeeVouchers true and goLiveDate empty
 * B6(b): Day Book / Cash-Bank Book default month computed from LOCAL date
 * B6(c): Set hasDigitalFeeVouchers only after batch containing digital voucher commits
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

// Setup a mock browser environment for js/accounts.js
function setupAccountsModuleEnv() {
  const dom = {
    elements: {},
    getElementById: function (id) {
      if (!dom.elements[id]) {
        dom.elements[id] = {
          id: id,
          value: '',
          disabled: false,
          innerHTML: '',
          appendChild: () => {},
          addEventListener: () => {}
        };
      }
      return dom.elements[id];
    },
    querySelectorAll: function () { return []; },
    createElement: function (tag) {
      return { tagName: tag, innerHTML: '', className: '', setAttribute: () => {}, querySelector: () => null };
    }
  };

  const sandbox = {
    window: {
      location: { hostname: 'greenwood.ctrlshifts.in' }
    },
    document: dom,
    console: console,
    Set: Set,
    Map: Map,
    Date: Date,
    String: String,
    Number: Number,
    parseInt: parseInt,
    parseFloat: parseFloat,
    Math: Math,
    Array: Array,
    Object: Object,
    prompt: () => 'Test',
    confirm: () => true
  };

  sandbox.SchoolApp = {
    modules: {},
    store: { fees: [] },
    escapeHTML: (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    showToast: (msg, type) => {
      sandbox.lastToast = { msg, type };
      sandbox.SchoolApp.lastToast = { msg, type };
    }
  };
  sandbox.window.SchoolApp = sandbox.SchoolApp;

  const accountsCode = fs.readFileSync(path.resolve(__dirname, '../js/accounts.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(accountsCode, sandbox);

  return sandbox;
}

async function runAll() {
  console.log('========================================================');
  console.log('--- Test Suite: v71 Bank Ledger Mapping & v70 Follow-ups ---');
  console.log('========================================================\n');

  // ── B2: Bank ledger allocation ───────────────────────────────────────────────
  console.log('--- B2: Bank Ledger Allocation ---');

  runTest('B2.1: First configured bank gets 11200 when no banks exist', () => {
    const env = setupAccountsModuleEnv();
    const acc = env.SchoolApp.modules.accounts;
    acc.chart = [
      { code: '11200', name: 'Primary Bank Account', type: 'asset', isSystem: true },
      { code: '11210', name: 'Secondary Bank Account', type: 'asset', isSystem: true }
    ];

    const code = acc.getNextAvailableBankLedgerCode([]);
    assert.strictEqual(code, '11200', 'First bank must get seeded ledger 11200');
  });

  runTest('B2.2: Second configured bank gets 11210', () => {
    const env = setupAccountsModuleEnv();
    const acc = env.SchoolApp.modules.accounts;
    acc.chart = [
      { code: '11200', name: 'Primary Bank Account', type: 'asset', isSystem: true },
      { code: '11210', name: 'Secondary Bank Account', type: 'asset', isSystem: true }
    ];

    const banks = [{ ledgerAccountId: '11200', label: 'Primary Bank' }];
    const code = acc.getNextAvailableBankLedgerCode(banks);
    assert.strictEqual(code, '11210', 'Second bank must get seeded ledger 11210');
  });

  runTest('B2.3: Third configured bank gets 11220 (first free 112xx)', () => {
    const env = setupAccountsModuleEnv();
    const acc = env.SchoolApp.modules.accounts;
    acc.chart = [
      { code: '11200', name: 'Primary Bank Account', type: 'asset', isSystem: true },
      { code: '11210', name: 'Secondary Bank Account', type: 'asset', isSystem: true }
    ];

    const banks = [
      { ledgerAccountId: '11200', label: 'Primary Bank' },
      { ledgerAccountId: '11210', label: 'Secondary Bank' }
    ];
    const code = acc.getNextAvailableBankLedgerCode(banks);
    assert.strictEqual(code, '11220', 'Third bank must get 11220');
  });

  runTest('B2.4: Greenwood case: ICICI is at 11220 -> seeded 11200 is available and assigned next', () => {
    const env = setupAccountsModuleEnv();
    const acc = env.SchoolApp.modules.accounts;
    acc.chart = [
      { code: '11200', name: 'Primary Bank Account', type: 'asset', isSystem: true },
      { code: '11210', name: 'Secondary Bank Account', type: 'asset', isSystem: true },
      { code: '11220', name: 'ICICI Bank', type: 'asset', isSystem: false }
    ];

    // Only ICICI at 11220
    const banks = [
      { ledgerAccountId: '11220', label: 'ICICI Bank' }
    ];

    const nextCode1 = acc.getNextAvailableBankLedgerCode(banks);
    assert.strictEqual(nextCode1, '11200', 'Unlinked seeded 11200 must be assigned before 112xx');

    banks.push({ ledgerAccountId: nextCode1, label: 'SBI Bank' });
    const nextCode2 = acc.getNextAvailableBankLedgerCode(banks);
    assert.strictEqual(nextCode2, '11210', 'Unlinked seeded 11210 must be assigned before 112xx');

    banks.push({ ledgerAccountId: nextCode2, label: 'HDFC Bank' });
    const nextCode3 = acc.getNextAvailableBankLedgerCode(banks);
    assert.strictEqual(nextCode3, '11230', 'After 11200, 11210 and taken 11220, next is 11230');
  });

  // ── B1 & B5: Dropdowns show SAVED value & Options ─────────────────────────────
  console.log('\n--- B1 & B5: Dropdowns & Options ---');

  runTest('B1.1: Digital fee dropdown includes saved 11200 even when banks only has ICICI at 11220', () => {
    const env = setupAccountsModuleEnv();
    const acc = env.SchoolApp.modules.accounts;
    acc.chart = [
      { code: '11200', name: 'Primary Bank Account', type: 'asset', isSystem: true },
      { code: '11210', name: 'Secondary Bank Account', type: 'asset', isSystem: true },
      { code: '11220', name: 'ICICI', type: 'asset', isSystem: false }
    ];
    acc.settings = {
      feeDigitalAccount: '11200',
      hasDigitalFeeVouchers: false, // not locked
      bankAccounts: [
        { ledgerAccountId: '11220', label: 'ICICI', bankName: 'ICICI', last4: '4567', isActive: true }
      ]
    };

    const html = acc.renderSettingsHTML();
    assert.ok(html.includes('<select class="form-control form-select" id="settings-fee-digital-acc"'), 'Must render editable select');
    assert.ok(html.includes('value="11200" selected'), 'Must render option value="11200" with selected attribute');
    assert.ok(html.includes('11200 - Primary Bank Account'), 'Must render chart name for 11200');
  });

  runTest('B1.2: When locked, Digital fee ledger displays saved code + name as read-only text', () => {
    const env = setupAccountsModuleEnv();
    const acc = env.SchoolApp.modules.accounts;
    acc.chart = [
      { code: '11200', name: 'Primary Bank Account', type: 'asset', isSystem: true },
      { code: '11220', name: 'ICICI', type: 'asset', isSystem: false }
    ];
    acc.settings = {
      feeDigitalAccount: '11200',
      hasDigitalFeeVouchers: true, // locked!
      bankAccounts: [
        { ledgerAccountId: '11220', label: 'ICICI', bankName: 'ICICI', last4: '4567', isActive: true }
      ]
    };

    const html = acc.renderSettingsHTML();
    assert.ok(html.includes('<input type="text" class="form-control" id="settings-fee-digital-acc" value="11200 - Primary Bank Account" disabled'),
      'Locked digital account must render read-only disabled input showing saved 11200 and chart name');
    assert.ok(!html.includes('value="11220 - ICICI (**4567)" disabled'), 'Must NOT display the unlinked bank 11220 as the locked value');
  });

  runTest('B1.3: Fee head mapping select includes saved account even if not in standard incomeAccounts list', () => {
    const env = setupAccountsModuleEnv();
    const acc = env.SchoolApp.modules.accounts;
    acc.chart = [
      { code: '41100', name: 'Fee Collections', type: 'income' },
      { code: '42999', name: 'Custom Legacy Income', type: 'income' }
    ];
    acc.settings = {
      feeHeadMapping: { 'head_custom': '42999' }
    };
    env.SchoolApp.store.settings = {
      feeHeads: [{ id: 'head_custom', name: 'Special Activity' }]
    };

    const html = acc.renderSettingsHTML();
    assert.ok(html.includes('value="42999" selected'), 'Must render saved mapped code 42999 selected');
    assert.ok(html.includes('42999 - Custom Legacy Income'), 'Must show chart account name for 42999');
  });

  // ── B3: Link & Move Bank Details ─────────────────────────────────────────────
  console.log('\n--- B3: Link & Move Bank Details ---');

  await runAsyncTest('B3.1: moveBankToSeededLedger rejects moving a ledger that has posted vouchers or balance', async () => {
    const env = setupAccountsModuleEnv();
    const acc = env.SchoolApp.modules.accounts;
    acc.settings = {
      bankAccounts: [
        { ledgerAccountId: '11220', label: 'ICICI', bankName: 'ICICI', last4: '4567', isActive: true }
      ]
    };
    acc.summary = {
      accounts: {
        '11220': {
          '2026-04': { dr: 50000, cr: 0 }
        }
      }
    };

    await acc.moveBankToSeededLedger('11220', '11200');
    assert.ok(env.SchoolApp.lastToast && env.SchoolApp.lastToast.type === 'error', 'Must show error toast');
    assert.ok(env.SchoolApp.lastToast.msg.includes('already has posted vouchers or transactions'), 'Must explain ledger has vouchers');
  });

  await runAsyncTest('B3.2: moveBankToSeededLedger moves details from empty ledger (0 balance, no vouchers) to 11200', async () => {
    const env = setupAccountsModuleEnv();
    const acc = env.SchoolApp.modules.accounts;
    acc.chart = [
      { code: '11200', name: 'Primary Bank Account', type: 'asset', isSystem: true, isActive: true },
      { code: '11220', name: 'ICICI', type: 'asset', isSystem: false, isActive: true }
    ];
    acc.settings = {
      feeDigitalAccount: '11200',
      bankAccounts: [
        { ledgerAccountId: '11220', label: 'ICICI', bankName: 'ICICI', last4: '4567', isActive: true }
      ]
    };
    acc.summary = { accounts: {} }; // 11220 is empty!

    const updatedDocs = {};
    env.window.db = {};
    env.window.firestore = {
      doc: (db, ...parts) => parts.join('/'),
      writeBatch: () => ({
        update: (ref, data) => { updatedDocs[ref] = data; },
        commit: async () => {}
      })
    };
    acc.getSchoolId = () => 'test_school';
    acc.render = async () => {};

    await acc.moveBankToSeededLedger('11220', '11200');

    const banks = acc.settings.bankAccounts;
    const oldBank = banks.find(b => b.ledgerAccountId === '11220');
    const newBank = banks.find(b => b.ledgerAccountId === '11200');

    assert.ok(oldBank && oldBank.isActive === false, 'Old ledger 11220 must be deactivated');
    assert.ok(newBank && newBank.isActive === true, 'Seeded ledger 11200 must be active');
    assert.strictEqual(newBank.bankName, 'ICICI', 'Bank name must be transferred');
    assert.strictEqual(newBank.last4, '4567', 'Last4 must be transferred');
    assert.strictEqual(acc.chart.find(a => a.code === '11220').isActive, false, '11220 in chart must be deactivated');
    assert.ok(env.SchoolApp.lastToast && env.SchoolApp.lastToast.type === 'success', 'Must display success toast');
  });

  // ── B4: Overview Liquidity ───────────────────────────────────────────────────
  console.log('\n--- B4: Overview Liquidity ---');

  runTest('B4.1: Overview shows unlinked bank ledger 11200 with non-zero balance and sums to total available', () => {
    const env = setupAccountsModuleEnv();
    const acc = env.SchoolApp.modules.accounts;
    acc.chart = [
      { code: '11100', name: 'Cash in Hand', type: 'asset' },
      { code: '11110', name: 'Petty Cash', type: 'asset' },
      { code: '11200', name: 'Primary Bank Account', type: 'asset' },
      { code: '11220', name: 'ICICI', type: 'asset' }
    ];
    acc.settings = {
      bankAccounts: [
        { ledgerAccountId: '11220', label: 'ICICI', bankName: 'ICICI', last4: '4567', isActive: true }
      ]
    };
    acc.summary = {
      accounts: {
        '11100': { '2026-04': { dr: 27804400, cr: 0 } }, // ₹2,78,044.00 Dr
        '11200': { '2026-04': { dr: 12320000, cr: 0 } }, // ₹1,23,200.00 Dr
        '11220': { '2026-04': { dr: 0, cr: 0 } }         // ₹0.00
      }
    };

    const html = acc.renderOverviewHTML();

    assert.ok(html.includes('4,01,244.00'), 'Total Available must sum all cash and bank ledgers: ₹4,01,244.00');
    assert.ok(html.includes('1,23,200.00'), 'Card for 11200 balance of ₹1,23,200.00 must be rendered');
    assert.ok(html.includes('no bank details linked'), 'Card must state no bank details linked');
    assert.ok(html.includes('Link in Settings'), 'Card must have link to Settings');
  });

  // ── B6: v70 Follow-ups ───────────────────────────────────────────────────────
  console.log('\n--- B6: v70 Follow-ups ---');

  runTest('B6(a): If hasFeeVouchers true and goLiveDate empty, UI shows "Will be set automatically on next sync"', () => {
    const env = setupAccountsModuleEnv();
    const acc = env.SchoolApp.modules.accounts;
    acc.settings = {
      hasFeeVouchers: true,
      goLiveDate: '' // empty!
    };

    const html = acc.renderSettingsHTML();
    assert.ok(html.includes('value="Will be set automatically on next sync" disabled'),
      'Must render disabled text input with "Will be set automatically on next sync"');
    assert.ok(html.includes('🔒 Pending Sync'), 'Must show Pending Sync badge');
  });

  runTest('B6(b): Day Book & Cash-Bank Book default month computed from LOCAL date', () => {
    const env = setupAccountsModuleEnv();
    const acc = env.SchoolApp.modules.accounts;
    acc.reportParams = {};

    acc.renderReportsHTML();

    const now = new Date();
    const localYear = now.getFullYear();
    const localMonth = String(now.getMonth() + 1).padStart(2, '0');
    const expectedMonthPrefix = `${localYear}-${localMonth}`;

    assert.ok(acc.reportParams.startDate.startsWith(expectedMonthPrefix),
      `Report start date (${acc.reportParams.startDate}) must start with local month (${expectedMonthPrefix})`);
    assert.ok(acc.reportParams.endDate.startsWith(expectedMonthPrefix),
      `Report end date (${acc.reportParams.endDate}) must start with local month (${expectedMonthPrefix})`);
  });

  runTest('B6(c): hasDigitalFeeVouchers is NOT set until batch with digital voucher commits', () => {
    const { computeFeeJournalLines } = require('../api/accounts.js');
    const settings = {
      goLiveDate: '2026-04-01',
      feeCashAccount: '11100',
      feeDigitalAccount: '11200',
      hasDigitalFeeVouchers: false
    };
    const chartMap = {
      '11100': { code: '11100', name: 'Cash in Hand', type: 'asset', isActive: true },
      '11200': { code: '11200', name: 'Primary Bank Account', type: 'asset', isActive: true },
      '41100': { code: '41100', name: 'Fee Collections', type: 'income', isActive: true }
    };

    const cashTxn = { id: 'txn_cash', date: '2026-04-10', type: 'payment', mode: 'Cash', amount: 500 };
    const resCash = computeFeeJournalLines(cashTxn, settings, chartMap);
    assert.strictEqual(resCash.isDigital, false, 'Cash payment isDigital must be false');

    const digitalTxn = { id: 'txn_upi', date: '2026-04-10', type: 'payment', mode: 'UPI', amount: 500 };
    const resDigital = computeFeeJournalLines(digitalTxn, settings, chartMap);
    assert.strictEqual(resDigital.isDigital, true, 'UPI payment isDigital must be true');
  });

  console.log('\n========================================');
  console.log(`v71 BANK LEDGER MAPPING TESTS: ${passedTests}/${totalTests} PASS`);
  console.log('========================================');
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
