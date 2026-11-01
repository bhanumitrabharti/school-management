/**
 * ==============================================================================
 *  ACCOUNTS & EXPENSES MODULE — CTRL Shift ERP (Slice 2)
 *  Subcollections: tenant_data/{schoolId}/accounts_settings, accounts_chart, accounts_expenses,
 *                  accounts_receipts, accounts_transfers, accounts_journal, accounts_summary, accounts_sync_state
 *  Role: School Admin only (Strictly gated behind 'accounts' feature flag)
 * ==============================================================================
 */

(function () {
  'use strict';

  if (!window.SchoolApp) {
    window.SchoolApp = {};
  }
  if (!SchoolApp.modules) {
    SchoolApp.modules = {};
  }

  // ── Default Indian School Chart of Accounts (Phase A Seed) ─────────────────
  const DEFAULT_CHART_OF_ACCOUNTS = [
    // 1. Assets (10000)
    { code: '11100', name: 'Cash in Hand (Main School Cash)', type: 'asset', group: 'Current Assets', isSystem: true, isActive: true },
    { code: '11110', name: 'Petty Cash', type: 'asset', group: 'Current Assets', isSystem: true, isActive: true },
    { code: '11200', name: 'Primary Bank Account', type: 'asset', group: 'Current Assets', isSystem: true, isActive: true },
    { code: '11210', name: 'Secondary Bank Account', type: 'asset', group: 'Current Assets', isSystem: true, isActive: true },
    { code: '12100', name: 'Student Fee Receivables', type: 'asset', group: 'Current Assets', isSystem: true, isActive: true },
    { code: '13100', name: 'Staff Salary Advances', type: 'asset', group: 'Current Assets', isSystem: true, isActive: true },
    { code: '13200', name: 'Security Deposits Paid', type: 'asset', group: 'Current Assets', isSystem: true, isActive: true },

    // 2. Liabilities (20000)
    { code: '21100', name: 'Accounts Payable / Sundry Creditors', type: 'liability', group: 'Current Liabilities', isSystem: true, isActive: true },
    { code: '22100', name: 'Employee PF Payable', type: 'liability', group: 'Current Liabilities', isSystem: true, isActive: true },
    { code: '22110', name: 'Employer PF Contribution Payable', type: 'liability', group: 'Current Liabilities', isSystem: true, isActive: true },
    { code: '22200', name: 'ESIC Payable', type: 'liability', group: 'Current Liabilities', isSystem: true, isActive: true },
    { code: '22300', name: 'Professional Tax (PT) Payable', type: 'liability', group: 'Current Liabilities', isSystem: true, isActive: true },
    { code: '22400', name: 'TDS on Salaries Payable', type: 'liability', group: 'Current Liabilities', isSystem: true, isActive: true },
    { code: '22410', name: 'TDS on Vendor Contracts Payable', type: 'liability', group: 'Current Liabilities', isSystem: true, isActive: true },
    { code: '23100', name: 'Advance Fees Received from Students', type: 'liability', group: 'Current Liabilities', isSystem: true, isActive: true },
    { code: '24100', name: 'Student Caution Money / Security Deposits', type: 'liability', group: 'Current Liabilities', isSystem: true, isActive: true },

    // 3. Equity / Corpus Fund (30000)
    { code: '31100', name: 'General / Corpus Reserve', type: 'equity', group: 'Corpus / Capital Fund', isSystem: true, isActive: true },
    { code: '32100', name: "Prior Years' Accumulated Surplus / (Deficit)", type: 'equity', group: 'Corpus / Capital Fund', isSystem: true, isActive: true },

    // 4. Income (40000)
    { code: '41100', name: 'Tuition Fees', type: 'income', group: 'Direct Educational Income', isSystem: true, isActive: true, reservedFor: 'fees' },
    { code: '41200', name: 'Admission & Registration Fees', type: 'income', group: 'Direct Educational Income', isSystem: true, isActive: true, reservedFor: 'fees' },
    { code: '41300', name: 'Examination Fees', type: 'income', group: 'Direct Educational Income', isSystem: true, isActive: true, reservedFor: 'fees' },
    { code: '41400', name: 'Annual / Development Charges', type: 'income', group: 'Direct Educational Income', isSystem: true, isActive: true, reservedFor: 'fees' },
    { code: '42100', name: 'Transport / Bus Charges', type: 'income', group: 'Direct Educational Income', isSystem: true, isActive: true, reservedFor: 'fees' },
    // 43100 & 43200 unreserved in Slice 2 so Other Income receipts can use them:
    { code: '43100', name: 'Bank Interest Received', type: 'income', group: 'Other / Indirect Income', isSystem: true, isActive: true },
    { code: '43200', name: 'Miscellaneous Receipts', type: 'income', group: 'Other / Indirect Income', isSystem: true, isActive: true },

    // 5. Expenses (50000)
    { code: '51100', name: 'Teaching Staff Salaries', type: 'expense', group: 'Personnel Costs', isSystem: true, isActive: true, reservedFor: 'payroll' },
    { code: '51200', name: 'Non-Teaching & Admin Salaries', type: 'expense', group: 'Personnel Costs', isSystem: true, isActive: true, reservedFor: 'payroll' },
    { code: '51300', name: 'Employer EPF Contribution Expense', type: 'expense', group: 'Personnel Costs', isSystem: true, isActive: true, reservedFor: 'payroll' },
    { code: '51400', name: 'Employer ESIC Contribution Expense', type: 'expense', group: 'Personnel Costs', isSystem: true, isActive: true, reservedFor: 'payroll' },
    { code: '51500', name: 'Staff Welfare & Honorarium', type: 'expense', group: 'Personnel Costs', isSystem: true, isActive: true },
    { code: '52100', name: 'Printing, Stationery & Report Cards', type: 'expense', group: 'Operating & Academic Expenses', isSystem: true, isActive: true },
    { code: '52200', name: 'Examination & Evaluation Expenses', type: 'expense', group: 'Operating & Academic Expenses', isSystem: true, isActive: true },
    { code: '53100', name: 'Electricity & Water Utility', type: 'expense', group: 'Operating & Academic Expenses', isSystem: true, isActive: true },
    { code: '53200', name: 'Telecommunications & Internet', type: 'expense', group: 'Operating & Academic Expenses', isSystem: true, isActive: true },
    { code: '53300', name: 'Software, ERP & Website Hosting', type: 'expense', group: 'Operating & Academic Expenses', isSystem: true, isActive: true },
    { code: '54100', name: 'School Building & Campus Maintenance', type: 'expense', group: 'Repairs & Maintenance', isSystem: true, isActive: true },
    { code: '54200', name: 'Generator Fuel & Bus Fuel', type: 'expense', group: 'Repairs & Maintenance', isSystem: true, isActive: true },
    { code: '55100', name: 'Student Fee Concessions & Discounts', type: 'expense', group: 'Concessions & Scholarships', isSystem: true, isActive: true, reservedFor: 'fees' }
  ];

  const AccountsModule = {
    activeTab: 'overview',
    settings: null,
    chart: [],
    expenses: [],
    receipts: [],
    transfers: [],
    opening: null,
    summary: null,
    syncState: null,
    counters: null,
    loading: false,
    initialized: false,
    syncing: false,
    selectedAttachments: [],

    reportType: 'daybook',
    reportParams: {
      startDate: '',
      endDate: '',
      accountCode: '11100',
      fy: ''
    },

    filters: {
      search: '',
      dateRange: 'all',
      customStart: '',
      customEnd: '',
      category: 'all',
      paymentMode: 'all',
      status: 'all'
    },

    receiptFilters: {
      search: '',
      category: 'all',
      dateRange: 'all'
    },

    transferFilters: {
      search: '',
      dateRange: 'all'
    },

    // ── Scoped Styles & Responsive Modal Helper ──────────────────────────────
    ensureScopedStyles: function () {
      if (typeof document === 'undefined' || document.getElementById('accounts-module-styles')) return;
      var style = document.createElement('style');
      style.id = 'accounts-module-styles';
      style.textContent = [
        '/* Scoped styles for Accounts & Expenses module */',
        '#page-accounts { width: 100%; max-width: 100%; box-sizing: border-box; }',
        '.acc-tab-bar {',
        '  display: flex !important;',
        '  flex-wrap: nowrap !important;',
        '  overflow-x: auto !important;',
        '  -webkit-overflow-scrolling: touch !important;',
        '  scrollbar-width: none !important;',
        '  -ms-overflow-style: none !important;',
        '  border-bottom: 1px solid var(--border-color);',
        '  margin-bottom: 24px;',
        '  gap: 8px;',
        '  width: 100%;',
        '}',
        '.acc-tab-bar::-webkit-scrollbar { display: none !important; }',
        '.acc-tab-bar .tab-btn {',
        '  flex-shrink: 0 !important;',
        '  white-space: nowrap !important;',
        '  min-height: 40px !important;',
        '  display: inline-flex !important;',
        '  align-items: center !important;',
        '  gap: 6px !important;',
        '  padding: 10px 16px !important;',
        '  font-size: 13.5px !important;',
        '  font-weight: 600 !important;',
        '  border: none !important;',
        '  background: none !important;',
        '  cursor: pointer !important;',
        '  border-bottom: 2px solid transparent !important;',
        '  color: var(--text-secondary);',
        '}',
        '.acc-tab-bar .tab-btn.active {',
        '  border-bottom-color: var(--accent-primary) !important;',
        '  color: var(--accent-primary) !important;',
        '}',
        '.acc-table-container {',
        '  width: 100% !important;',
        '  max-width: 100% !important;',
        '  overflow-x: auto !important;',
        '  -webkit-overflow-scrolling: touch !important;',
        '}',
        '.acc-table-container > table, table.acc-table {',
        '  min-width: 680px !important;',
        '  width: 100% !important;',
        '  margin: 0 !important;',
        '  border-collapse: collapse !important;',
        '}',
        '.acc-setup-card {',
        '  padding: 32px;',
        '  border-radius: 12px;',
        '  box-shadow: var(--shadow-md);',
        '}',
        '.acc-setup-bank-row {',
        '  display: grid;',
        '  grid-template-columns: 1fr 1fr 110px;',
        '  gap: 8px;',
        '  margin-bottom: 8px;',
        '  width: 100%;',
        '}',
        '.acc-overview-grid {',
        '  display: grid;',
        '  grid-template-columns: minmax(min(100%, 320px), 1fr) minmax(min(100%, 320px), 1fr);',
        '  gap: 20px;',
        '  margin-bottom: 24px;',
        '}',
        '.acc-metrics-grid {',
        '  display: grid;',
        '  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));',
        '  gap: 16px;',
        '  margin-bottom: 24px;',
        '}',
        '.acc-recon-card {',
        '  padding: 20px;',
        '  border-radius: 10px;',
        '  margin-bottom: 24px;',
        '  border: 1px solid var(--border-color);',
        '}',
        '.acc-filters-grid {',
        '  display: grid;',
        '  grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));',
        '  gap: 12px;',
        '  margin-bottom: 16px;',
        '}',
        '.acc-form-vendor-row {',
        '  display: grid;',
        '  grid-template-columns: 2fr 1fr 1fr;',
        '  gap: 12px;',
        '  margin-bottom: 14px;',
        '}',
        '.acc-detail-grid {',
        '  display: grid;',
        '  grid-template-columns: 1fr 1fr;',
        '  gap: 12px 24px;',
        '  margin-bottom: 16px;',
        '  font-size: 13px;',
        '}',
        '.acc-bank-row {',
        '  display: grid;',
        '  grid-template-columns: 1fr 1fr 85px 85px 85px;',
        '  gap: 8px;',
        '  align-items: center;',
        '  margin-bottom: 10px;',
        '}',
        '.acc-ca-disclaimer {',
        '  margin-top: 24px;',
        '  padding: 12px 16px;',
        '  background: var(--bg-tertiary);',
        '  border-left: 4px solid var(--accent-primary);',
        '  font-size: 12px;',
        '  color: var(--text-secondary);',
        '  border-radius: 4px;',
        '  box-sizing: border-box;',
        '  width: 100%;',
        '}',
        '.acc-report-nav {',
        '  display: flex;',
        '  gap: 8px;',
        '  overflow-x: auto;',
        '  padding-bottom: 8px;',
        '  margin-bottom: 16px;',
        '}',
        '@media (max-width: 640px) {',
        '  .acc-setup-card { padding: 20px 14px; }',
        '  .acc-setup-bank-row { grid-template-columns: 1fr !important; gap: 8px !important; }',
        '  .acc-overview-grid { grid-template-columns: 1fr !important; }',
        '  .acc-form-vendor-row { grid-template-columns: 1fr !important; }',
        '  .acc-bank-row {',
        '    display: flex !important;',
        '    flex-direction: column !important;',
        '    align-items: stretch !important;',
        '    gap: 8px !important;',
        '    padding: 12px !important;',
        '    background: var(--bg-secondary) !important;',
        '    border-radius: 8px !important;',
        '    margin-bottom: 12px !important;',
        '  }',
        '  .acc-bank-actions {',
        '    display: flex !important;',
        '    flex-wrap: wrap !important;',
        '    gap: 8px !important;',
        '    align-items: center !important;',
        '    justify-content: flex-start !important;',
        '  }',
        '}',
        '@media (max-width: 480px) {',
        '  .acc-detail-grid { grid-template-columns: 1fr !important; gap: 8px !important; }',
        '}'
      ].join('\n');
      document.head.appendChild(style);
    },

    openModal: function (title, bodyHTML, footerHTML) {
      if (typeof SchoolApp.showModal === 'function') {
        SchoolApp.showModal(title, bodyHTML, footerHTML);
      } else {
        alert(title);
      }
    },

    init: function () {
      this.ensureScopedStyles();
    },

    formatINR: function (paise) {
      if (paise === null || paise === undefined || isNaN(paise)) return '₹0.00';
      var rupees = paise / 100;
      var isNegative = rupees < 0;
      var abs = Math.abs(rupees).toFixed(2);
      var parts = abs.split('.');
      var intPart = parts[0];
      var decPart = parts[1];
      var lastThree = intPart.substring(intPart.length - 3);
      var otherNumbers = intPart.substring(0, intPart.length - 3);
      if (otherNumbers !== '') {
        lastThree = ',' + lastThree;
      }
      var res = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree + '.' + decPart;
      return (isNegative ? '-₹' : '₹') + res;
    },

    formatINRNumber: function (paise) {
      if (paise === null || paise === undefined || isNaN(paise)) return '0.00';
      return (paise / 100).toFixed(2);
    },

    getFinancialYear: function (dateStr, startMonth) {
      var sm = startMonth || (this.settings && this.settings.financialYearStartMonth) || 4;
      var d = dateStr ? new Date(dateStr) : new Date();
      var year = d.getFullYear();
      var month = d.getMonth() + 1; // 1-12
      if (month >= sm) {
        var nextYY = String(year + 1).slice(-2);
        return year + '-' + nextYY;
      } else {
        var prevYY = String(year).slice(-2);
        return (year - 1) + '-' + prevYY;
      }
    },

    getSchoolId: function () {
      return (SchoolApp.store && SchoolApp.store.currentSchoolId) || null;
    },

    // ── Entry Point (called by SchoolApp.navigate) ───────────────────────────
    render: async function () {
      var container = document.getElementById('page-accounts');
      if (!container) return;

      this.ensureScopedStyles();

      // Role & Feature check
      if (!SchoolApp.isAdmin() || !SchoolApp.checkFeatureAccess('accounts')) {
        container.innerHTML = '<div class="p-6 text-center text-muted">Access Denied: You do not have permission to view Accounts.</div>';
        return;
      }

      this.loading = true;
      container.innerHTML = '<div style="text-align:center; padding: 48px; color: var(--text-secondary);">' +
        '<span class="material-icons-round" style="font-size:36px; animation:spin 1s linear infinite;">sync</span>' +
        '<p style="margin-top:12px; font-weight:600;">Loading Accounts & Financial Management...</p>' +
        '</div>';

      try {
        await this.loadData();
        if (!this.settings || !this.settings.setupCompletedAt) {
          this.renderSetupWizard(container);
        } else {
          this.renderWorkspace(container);
          // Auto-sync in background on open
          this.sync(true);
        }
      } catch (err) {
        console.error('[Accounts] Load error:', err);
        container.innerHTML = '<div style="padding:32px; text-align:center;">' +
          '<div style="color:var(--danger); font-size:18px; font-weight:700; margin-bottom:8px;">Failed to load accounts data</div>' +
          '<p style="color:var(--text-secondary);">' + SchoolApp.escapeHTML(err.message || 'Check network connection.') + '</p>' +
          '<button class="btn btn-primary" onclick="SchoolApp.modules.accounts.render()" style="margin-top:16px;">' +
          '<span class="material-icons-round">refresh</span> Retry</button>' +
          '</div>';
      } finally {
        this.loading = false;
      }
    },

    // ── Data Loader ──────────────────────────────────────────────────────────
    loadData: async function () {
      var schoolId = this.getSchoolId();
      if (!schoolId) throw new Error('No active school context found.');
      var fs = window.firestore;
      var db = window.db;

      // 1. Fetch settings
      var settingsRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'main');
      var settingsSnap = await fs.getDoc(settingsRef);
      this.settings = settingsSnap.exists() ? settingsSnap.data() : null;

      if (!this.settings || !this.settings.setupCompletedAt) {
        this.chart = [];
        this.expenses = [];
        this.receipts = [];
        this.transfers = [];
        return;
      }

      var currentFY = this.getFinancialYear();

      // 2. Fetch Chart of Accounts
      var chartColl = fs.collection(db, 'tenant_data', schoolId, 'accounts_chart');
      var chartSnap = await fs.getDocs(chartColl);
      this.chart = [];
      chartSnap.forEach(function (docSnap) {
        this.chart.push(docSnap.data());
      }.bind(this));
      this.chart.sort(function (a, b) { return String(a.code).localeCompare(String(b.code)); });

      // 3. Fetch Expenses
      var expColl = fs.collection(db, 'tenant_data', schoolId, 'accounts_expenses');
      var expSnap = await fs.getDocs(expColl);
      this.expenses = [];
      expSnap.forEach(function (docSnap) {
        var d = docSnap.data();
        d.id = docSnap.id;
        this.expenses.push(d);
      }.bind(this));
      this.expenses.sort(function (a, b) {
        var dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (dateCmp !== 0) return dateCmp;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });

      // 4. Fetch Receipts (Other Income)
      var rcpColl = fs.collection(db, 'tenant_data', schoolId, 'accounts_receipts');
      var rcpSnap = await fs.getDocs(rcpColl);
      this.receipts = [];
      rcpSnap.forEach(function (docSnap) {
        var d = docSnap.data();
        d.id = docSnap.id;
        this.receipts.push(d);
      }.bind(this));
      this.receipts.sort(function (a, b) {
        var dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (dateCmp !== 0) return dateCmp;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });

      // 5. Fetch Transfers (Contra)
      var trfColl = fs.collection(db, 'tenant_data', schoolId, 'accounts_transfers');
      var trfSnap = await fs.getDocs(trfColl);
      this.transfers = [];
      trfSnap.forEach(function (docSnap) {
        var d = docSnap.data();
        d.id = docSnap.id;
        this.transfers.push(d);
      }.bind(this));
      this.transfers.sort(function (a, b) {
        var dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (dateCmp !== 0) return dateCmp;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });

      // 6. Fetch Opening Balances doc
      var openRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'opening');
      var openSnap = await fs.getDoc(openRef);
      this.opening = openSnap.exists() ? openSnap.data() : null;

      // 7. Fetch Summary doc for current FY
      var summaryRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_summary', currentFY);
      var summarySnap = await fs.getDoc(summaryRef);
      this.summary = summarySnap.exists() ? summarySnap.data() : null;

      // 8. Fetch Sync State doc for current FY
      var syncStateRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_sync_state', currentFY);
      var syncStateSnap = await fs.getDoc(syncStateRef);
      this.syncState = syncStateSnap.exists() ? syncStateSnap.data() : null;

      this.initialized = true;
    },

    // ── Server Sync Engine Caller ────────────────────────────────────────────
    sync: async function (silent) {
      if (this.syncing) return;
      var schoolId = this.getSchoolId();
      if (!schoolId) return;

      this.syncing = true;
      this.renderSyncButton(true);

      try {
        var authUser = window.auth && window.auth.currentUser;
        if (!authUser) {
          if (!silent) SchoolApp.showToast('Authentication session not ready.', 'warning');
          return;
        }
        var idToken = await authUser.getIdToken();
        var currentFY = this.getFinancialYear();

        var done = false;
        var iterations = 0;
        var busyRetries = 0;
        var lastRes = null;

        while (!done && iterations < 15) {
          iterations++;
          var res = await fetch('/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken: idToken,
              schoolId: schoolId,
              action: 'sync',
              fy: currentFY
            })
          });

          if (!res.ok) {
            var errJson = await res.json().catch(function () { return {}; });
            throw new Error(errJson.error || ('Sync failed with HTTP ' + res.status));
          }

          lastRes = await res.json();
          if (lastRes && lastRes.busy) {
            busyRetries++;
            if (busyRetries > 10) {
              throw new Error('Sync in progress in another session. Please wait a moment and try again.');
            }
            if (!silent && SchoolApp.showToast && busyRetries === 1) {
              SchoolApp.showToast('Another sync is running; waiting for it to finish...', 'info');
            }
            await new Promise(function (resolve) { setTimeout(resolve, 2000); });
            iterations--;
            continue;
          }
          done = lastRes.done;
        }

        await this.loadData();

        var lastSyncedEl = document.getElementById('acc-last-synced');
        if (lastSyncedEl && this.syncState && this.syncState.lastSyncAt) {
          lastSyncedEl.textContent = 'Last synced: ' + new Date(this.syncState.lastSyncAt).toLocaleTimeString();
        }

        if (!silent && SchoolApp.showToast) {
          var p = (lastRes && lastRes.postedThisRun) ? lastRes.postedThisRun : {};
          var tot = (p.fees || 0) + (p.expenses || 0) + (p.receipts || 0) + (p.transfers || 0) + (p.opening || 0);
          SchoolApp.showToast('General ledger synced. ' + tot + ' new voucher(s) posted.', 'success');
        }

        this.renderCurrentTab();
      } catch (err) {
        console.warn('[Accounts Sync Warn]:', err);
        if (!silent) {
          SchoolApp.showToast('Sync error: ' + (err.message || 'Check connection'), 'error');
        }
      } finally {
        this.syncing = false;
        this.renderSyncButton(false);
      }
    },

    renderSyncButton: function (isSyncing) {
      var btn = document.getElementById('acc-btn-sync');
      if (!btn) return;
      if (isSyncing) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="font-size:16px; animation:spin 1s linear infinite;">sync</span> Syncing...';
      } else {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons-round" style="font-size:16px;">sync</span> Sync now';
      }
    },

    toggleSyncAlerts: function () {
      var box = document.getElementById('acc-sync-alerts-detail');
      if (!box) return;
      box.style.display = (box.style.display === 'none') ? 'block' : 'none';
    },

    // ── First-Run Setup Wizard ───────────────────────────────────────────────
    renderSetupWizard: function (container) {
      var html = '';
      html += '<div style="max-width: 680px; margin: 32px auto; padding: 0 16px; box-sizing: border-box; width: 100%;">';
      html += '  <div class="card acc-setup-card">';
      html += '    <div style="text-align:center; margin-bottom: 24px;">';
      html += '      <div style="width:56px; height:56px; border-radius:50%; background:rgba(37, 99, 235, 0.12); color:var(--accent-primary); display:grid; place-items:center; margin:0 auto 12px auto;">';
      html += '        <span class="material-icons-round" style="font-size:32px;">account_balance</span>';
      html += '      </div>';
      html += '      <h2 style="font-size:22px; font-weight:700; color:var(--text-primary); margin-bottom:6px;">Set Up Accounts & Financial Management</h2>';
      html += '      <p style="font-size:14px; color:var(--text-secondary); line-height:1.5;">Configure your financial year, accounting entity type, and bank accounts. This seeds your Indian standard Chart of Accounts.</p>';
      html += '    </div>';

      html += '    <form id="accounts-setup-form" onsubmit="SchoolApp.modules.accounts.handleSetupSubmit(event)">';

      // 1. Financial Year Start Month
      html += '      <div class="form-group" style="margin-bottom:20px;">';
      html += '        <label class="form-label" style="font-weight:600; margin-bottom:6px; display:block;">Financial Year Start Month</label>';
      html += '        <select class="form-control form-select" id="setup-fy-month" required style="width:100%;">';
      html += '          <option value="4" selected>April (Standard Indian Financial Year: April – March)</option>';
      html += '          <option value="1">January (Calendar Year: January – December)</option>';
      html += '          <option value="6">June (June – May)</option>';
      html += '          <option value="7">July (July – June)</option>';
      html += '        </select>';
      html += '        <small class="form-text text-muted" style="font-size:12px; display:block; margin-top:4px;">Cannot be changed after expenses are recorded.</small>';
      html += '      </div>';

      // 2. Entity Type
      html += '      <div class="form-group" style="margin-bottom:20px;">';
      html += '        <label class="form-label" style="font-weight:600; margin-bottom:6px; display:block;">School Entity / Governance Type</label>';
      html += '        <select class="form-control form-select" id="setup-entity-type" required style="width:100%;">';
      html += '          <option value="trust_society" selected>Educational Trust / Society (Non-Profit → Generates "Income & Expenditure")</option>';
      html += '          <option value="company">Private Limited / Section 8 Company (Generates "Profit & Loss")</option>';
      html += '        </select>';
      html += '      </div>';

      // 3. Bank Account Configuration
      html += '      <div class="form-group" style="margin-bottom:24px;">';
      html += '        <label class="form-label" style="font-weight:600; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">';
      html += '          <span>Primary Bank Account</span>';
      html += '          <span style="font-size:11.5px; color:var(--text-muted); font-weight:400;">Optional — can also be added later</span>';
      html += '        </label>';
      html += '        <div class="acc-setup-bank-row">';
      html += '          <input type="text" class="form-control" id="setup-bank-label" placeholder="Label (e.g. Main Operations)" value="Main Operations A/c" />';
      html += '          <input type="text" class="form-control" id="setup-bank-name" placeholder="Bank Name (e.g. SBI)" value="State Bank of India" />';
      html += '          <input type="text" class="form-control" id="setup-bank-last4" placeholder="Last 4 (e.g. 4821)" maxlength="4" pattern="\\d{4}" title="Exactly 4 digits" />';
      html += '        </div>';
      html += '        <small class="form-text text-muted" style="font-size:11.5px; display:block; margin-top:4px;">Security rule: Only the last 4 digits of bank accounts are stored.</small>';
      html += '      </div>';

      html += '      <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:28px;">';
      html += '        <button type="submit" class="btn btn-primary" id="setup-submit-btn" style="padding:10px 24px; font-weight:600;">';
      html += '          <span class="material-icons-round" style="font-size:18px; vertical-align:middle; margin-right:4px;">check_circle</span>';
      html += '          Confirm & Initialize Accounts';
      html += '        </button>';
      html += '      </div>';
      html += '    </form>';
      html += '  </div>';
      html += '</div>';

      container.innerHTML = html;
    },

    handleSetupSubmit: async function (e) {
      if (e) e.preventDefault();
      var btn = document.getElementById('setup-submit-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="font-size:18px; vertical-align:middle; animation:spin 1s linear infinite;">sync</span> Setting up accounts...';
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      var fyMonth = parseInt(document.getElementById('setup-fy-month').value, 10) || 4;
      var entityType = document.getElementById('setup-entity-type').value || 'trust_society';
      var bankLabel = (document.getElementById('setup-bank-label').value || '').trim();
      var bankName = (document.getElementById('setup-bank-name').value || '').trim();
      var bankLast4 = (document.getElementById('setup-bank-last4').value || '').trim();

      var bankAccounts = [];
      if (bankName && bankLast4) {
        bankAccounts.push({
          id: 'bank_primary',
          label: bankLabel || bankName,
          bankName: bankName,
          last4: bankLast4.slice(-4),
          ledgerAccountId: '11200',
          isActive: true
        });
      }

      var settingsRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'main');
      var countersRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'counters');
      var nowIso = new Date().toISOString();

      try {
        var alreadyConfigured = await fs.runTransaction(db, async function (tx) {
          var snap = await tx.get(settingsRef);
          if (snap.exists() && snap.data().setupCompletedAt) {
            return true;
          }

          var countersSnap = await tx.get(countersRef);
          if (!countersSnap.exists()) {
            tx.set(countersRef, {
              expenseSeq: {},
              receiptSeq: {},
              transferSeq: {}
            });
          }

          var initialSettings = {
            financialYearStartMonth: fyMonth,
            entityType: entityType,
            bankAccounts: bankAccounts,
            setupCompletedAt: nowIso,
            accountingBasis: 'cash',
            feeCashAccount: '11100',
            feeDigitalAccount: bankAccounts.length > 0 ? '11200' : '11120',
            feeHeadMapping: {},
            goLiveDate: nowIso.split('T')[0],
            isConfigured: true,
            createdAt: nowIso
          };

          tx.set(settingsRef, initialSettings);
          return false;
        });

        if (alreadyConfigured) {
          SchoolApp.showToast('Accounts already initialized for this school.', 'info');
          await this.render();
          return;
        }

        var chartBatch = fs.writeBatch(db);
        DEFAULT_CHART_OF_ACCOUNTS.forEach(function (acc) {
          var accDocRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_chart', acc.code);
          chartBatch.set(accDocRef, {
            code: acc.code,
            name: acc.name,
            type: acc.type,
            group: acc.group,
            isSystem: acc.isSystem,
            isActive: acc.isActive,
            reservedFor: acc.reservedFor || null,
            createdAt: nowIso
          });
        });
        await chartBatch.commit();

        SchoolApp.showToast('Accounts setup completed successfully!', 'success');
        await this.render();
      } catch (err) {
        console.error('[Accounts] Setup error:', err);
        SchoolApp.showToast('Failed to initialize accounts: ' + (err.message || 'Permission denied'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round" style="font-size:18px; vertical-align:middle; margin-right:4px;">check_circle</span> Confirm & Initialize Accounts';
        }
      }
    },

    // ── Setup Checklist Helper (F4) ─────────────────────────────────────────
    renderChecklistHTML: function () {
      var s = this.settings || {};
      var bankAccounts = (s.bankAccounts && Array.isArray(s.bankAccounts)) ? s.bankAccounts : [];
      var storeHeads = (SchoolApp.store && (SchoolApp.store.feeHeads || (SchoolApp.store.settings && SchoolApp.store.settings.feeHeads))) || [];
      var feeHeadMap = s.feeHeadMapping || {};
      var unmappedHeads = storeHeads.filter(function (h) { return !feeHeadMap[h.id]; });

      var item1Done = !!(s.setupCompletedAt);
      var item2Done = (bankAccounts.length > 0);
      var item3Done = !!(s.feeDigitalAccount);
      var item4Done = (unmappedHeads.length === 0);
      var syncRan = !!(this.syncState && this.syncState.lastSyncAt);
      var warnCount = (this.syncState && this.syncState.warnings) ? this.syncState.warnings.length : 0;
      var item5Done = (syncRan && warnCount === 0);

      var allDone = (item1Done && item2Done && item3Done && item4Done && item5Done);
      var completedCount = [item1Done, item2Done, item3Done, item4Done, item5Done].filter(Boolean).length;

      // Hide card when all are done unless user explicitly clicked to re-open from Settings
      if (allDone && !this._forceShowChecklist) {
        return '';
      }

      var html = '';
      html += '<div class="card" style="margin-bottom:20px; padding:18px 20px; border-radius:10px; border-left:4px solid ' + (allDone ? 'var(--success)' : 'var(--accent-primary)') + '; background:var(--bg-primary); box-shadow:0 1px 3px rgba(0,0,0,0.05);">';
      html += '  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">';
      html += '    <div>';
      html += '      <h3 style="font-size:15px; font-weight:700; margin:0; color:var(--text-primary); display:flex; align-items:center; gap:8px;">';
      html += '        <span class="material-icons-round" style="color:' + (allDone ? 'var(--success)' : 'var(--accent-primary)') + '; font-size:20px;">' + (allDone ? 'check_circle' : 'checklist') + '</span>';
      html += '        Accounts Setup Checklist (' + completedCount + '/5 Complete)';
      html += '      </h3>';
      html += '      <p style="font-size:12px; color:var(--text-secondary); margin:2px 0 0 0;">Complete these initial configuration steps to enable automated ledger sync and reconciliation.</p>';
      html += '    </div>';
      if (allDone) {
        html += '    <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.toggleChecklist(false)" style="font-size:11.5px; padding:4px 10px;">Dismiss</button>';
      }
      html += '  </div>';

      html += '  <div style="display:flex; flex-direction:column; gap:10px;">';

      // Item 1: Accounts set up
      html += '    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--bg-secondary); border-radius:8px; gap:12px;">';
      html += '      <div style="display:flex; align-items:center; gap:10px;">';
      html += '        <span class="material-icons-round" style="color:' + (item1Done ? 'var(--success)' : 'var(--warning)') + '; font-size:20px;">' + (item1Done ? 'check_circle' : 'radio_button_unchecked') + '</span>';
      html += '        <div>';
      html += '          <div style="font-size:13px; font-weight:600; color:var(--text-primary);">1. Accounts set up</div>';
      html += '          <div style="font-size:11.5px; color:var(--text-secondary);">Chart of Accounts seeded and basic financial parameters initialized.</div>';
      html += '        </div>';
      html += '      </div>';
      if (!item1Done) {
        html += '      <button class="btn btn-primary btn-sm" onclick="SchoolApp.modules.accounts.renderSetupWizard(document.getElementById(\'page-accounts\'))" style="font-size:11.5px; padding:4px 12px;">Fix</button>';
      }
      html += '    </div>';

      // Item 2: Bank account added
      html += '    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--bg-secondary); border-radius:8px; gap:12px;">';
      html += '      <div style="display:flex; align-items:center; gap:10px;">';
      html += '        <span class="material-icons-round" style="color:' + (item2Done ? 'var(--success)' : 'var(--warning)') + '; font-size:20px;">' + (item2Done ? 'check_circle' : 'radio_button_unchecked') + '</span>';
      html += '        <div>';
      html += '          <div style="font-size:13px; font-weight:600; color:var(--text-primary);">2. Bank account added (label, bank, last 4)</div>';
      html += '          <div style="font-size:11.5px; color:var(--text-secondary);">' + (item2Done ? ('Configured: ' + SchoolApp.escapeHTML(bankAccounts[0].label || bankAccounts[0].bankName) + ' (**' + (bankAccounts[0].last4 || '') + ')') : 'At least one active bank ledger added with label, bank name, and last 4 digits.') + '</div>';
      html += '        </div>';
      html += '      </div>';
      if (!item2Done) {
        html += '      <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.switchTab(\'settings\')" style="font-size:11.5px; padding:4px 12px;">Fix</button>';
      }
      html += '    </div>';

      // Item 3: Bank for UPI/Bank fee receipts chosen
      html += '    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--bg-secondary); border-radius:8px; gap:12px;">';
      html += '      <div style="display:flex; align-items:center; gap:10px;">';
      html += '        <span class="material-icons-round" style="color:' + (item3Done ? 'var(--success)' : 'var(--warning)') + '; font-size:20px;">' + (item3Done ? 'check_circle' : 'radio_button_unchecked') + '</span>';
      html += '        <div>';
      html += '          <div style="font-size:13px; font-weight:600; color:var(--text-primary);">3. Bank for UPI/Bank fee receipts chosen</div>';
      html += '          <div style="font-size:11.5px; color:var(--text-secondary);">' + (item3Done ? ('Target ledger: ' + s.feeDigitalAccount) : 'Digital fee collection ledger assigned for UPI, Net Banking, and Cheque fee receipts.') + '</div>';
      html += '        </div>';
      html += '      </div>';
      if (!item3Done) {
        html += '      <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.switchTab(\'settings\')" style="font-size:11.5px; padding:4px 12px;">Fix</button>';
      }
      html += '    </div>';

      // Item 4: Fee heads mapped to income accounts
      var unmappedNames = unmappedHeads.map(function (h) { return h.name || h.id; }).join(', ');
      html += '    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--bg-secondary); border-radius:8px; gap:12px;">';
      html += '      <div style="display:flex; align-items:center; gap:10px;">';
      html += '        <span class="material-icons-round" style="color:' + (item4Done ? 'var(--success)' : 'var(--warning)') + '; font-size:20px;">' + (item4Done ? 'check_circle' : 'radio_button_unchecked') + '</span>';
      html += '        <div>';
      html += '          <div style="font-size:13px; font-weight:600; color:var(--text-primary);">4. Fee heads mapped to income accounts</div>';
      html += '          <div style="font-size:11.5px; color:var(--text-secondary);">' + (item4Done ? 'All school fee heads are mapped to general ledger revenue accounts.' : ('Unmapped: <span class="badge badge-warning" style="font-size:11px;">' + SchoolApp.escapeHTML(unmappedNames) + '</span> (defaulting to Tuition Fees 41100).')) + '</div>';
      html += '        </div>';
      html += '      </div>';
      if (!item4Done) {
        html += '      <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.switchTab(\'settings\')" style="font-size:11.5px; padding:4px 12px;">Fix</button>';
      }
      html += '    </div>';

      // Item 5: First sync done with 0 warnings
      html += '    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--bg-secondary); border-radius:8px; gap:12px;">';
      html += '      <div style="display:flex; align-items:center; gap:10px;">';
      html += '        <span class="material-icons-round" style="color:' + (item5Done ? 'var(--success)' : 'var(--warning)') + '; font-size:20px;">' + (item5Done ? 'check_circle' : 'radio_button_unchecked') + '</span>';
      html += '        <div>';
      html += '          <div style="font-size:13px; font-weight:600; color:var(--text-primary);">5. First sync done with 0 warnings</div>';
      html += '          <div style="font-size:11.5px; color:var(--text-secondary);">' + (item5Done ? 'General ledger is fully up-to-date with 0 sync warnings.' : (!syncRan ? 'Sync has not been run yet.' : ('Sync completed with ' + warnCount + ' active warning(s).'))) + '</div>';
      html += '        </div>';
      html += '      </div>';
      if (!item5Done) {
        html += '      <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.sync(false)" style="font-size:11.5px; padding:4px 12px;">Sync now</button>';
      }
      html += '    </div>';

      html += '  </div>';
      html += '</div>';

      return html;
    },

    toggleChecklist: function (force) {
      if (typeof force === 'boolean') {
        this._forceShowChecklist = force;
      } else {
        this._forceShowChecklist = !this._forceShowChecklist;
      }
      if (this._forceShowChecklist) {
        this.switchTab('overview');
      } else {
        this.render();
      }
    },

    // ── Main Workspace Renderer ──────────────────────────────────────────────
    renderWorkspace: function (container) {
      var html = '';
      var currentFY = this.getFinancialYear();

      // Header Banner
      html += '<div class="page-header" style="margin-bottom: 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">';
      html += '  <div>';
      html += '    <h2 style="font-size:20px; font-weight:700; color:var(--text-primary); display:flex; align-items:center; gap:8px; margin-bottom:4px;">';
      html += '      <span class="material-icons-round" style="color:var(--accent-primary);">account_balance</span>';
      html += '      Accounts & Financial Management';
      html += '      <span class="badge badge-info" style="font-size:11px; padding:3px 8px;">FY ' + currentFY + '</span>';
      html += '    </h2>';
      html += '    <p style="font-size:13px; color:var(--text-secondary); margin:0;">General ledger, income, expenses, contra transfers, and statutory reports</p>';
      html += '  </div>';

      // Header Actions & Sync Indicator
      var lastSyncStr = (this.syncState && this.syncState.lastSyncAt)
        ? new Date(this.syncState.lastSyncAt).toLocaleTimeString()
        : 'Never';

      html += '  <div class="header-actions" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">';
      html += '    <span id="acc-last-synced" style="font-size:12px; color:var(--text-secondary); font-weight:500;">Last synced: ' + lastSyncStr + '</span>';
      html += '    <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.sync(false)" id="acc-btn-sync" style="display:inline-flex; align-items:center; gap:4px; font-size:12px; padding:6px 12px;">';
      html += '      <span class="material-icons-round" style="font-size:16px;">sync</span> Sync now';
      html += '    </button>';
      html += '    <button class="btn btn-primary btn-sm" onclick="SchoolApp.modules.accounts.openAddExpenseModal()" id="btn-add-expense" style="display:inline-flex; align-items:center; gap:4px; font-size:12px; padding:6px 12px;">';
      html += '      <span class="material-icons-round" style="font-size:16px;">add</span> Record Expense';
      html += '    </button>';
      html += '  </div>';
      html += '</div>';

      // F4: Setup checklist card at top of Accounts
      html += this.renderChecklistHTML();

      // Skipped records or warnings alert banner (if any)
      var hasSkipped = (this.syncState && this.syncState.skipped && this.syncState.skipped.length > 0);
      var hasWarnings = (this.syncState && this.syncState.warnings && this.syncState.warnings.length > 0);
      if (hasSkipped || hasWarnings) {
        var skipCount = (this.syncState.skipped || []).length;
        var warnCount = (this.syncState.warnings || []).length;
        html += '<div class="card" style="margin-bottom:16px; padding:12px 16px; border-left:4px solid var(--warning); background:rgba(245, 158, 11, 0.08);">';
        html += '  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">';
        html += '    <div style="font-weight:600; font-size:13px; color:var(--text-primary); display:flex; align-items:center; gap:6px;">';
        html += '      <span class="material-icons-round" style="color:var(--warning); font-size:18px;">warning</span>';
        html += '      Sync Notice: ' + skipCount + ' skipped record(s), ' + warnCount + ' warning(s)';
        html += '    </div>';
        html += '    <button class="btn btn-link btn-sm" onclick="SchoolApp.modules.accounts.toggleSyncAlerts()" style="font-size:12px; padding:0; text-decoration:underline;">Toggle Details</button>';
        html += '  </div>';
        html += '  <div id="acc-sync-alerts-detail" style="display:none; margin-top:10px; font-size:12px; color:var(--text-secondary); max-height:160px; overflow-y:auto;">';
        if (hasSkipped) {
          html += '    <div style="font-weight:600; margin-bottom:4px; color:var(--text-primary);">Skipped Records:</div>';
          this.syncState.skipped.forEach(function (s) {
            html += '    <div>• [' + s.type + ' ' + (s.id || '') + ']: ' + SchoolApp.escapeHTML(s.reason || '') + '</div>';
          });
        }
        if (hasWarnings) {
          html += '    <div style="font-weight:600; margin-top:6px; margin-bottom:4px; color:var(--text-primary);">Warnings:</div>';
          this.syncState.warnings.forEach(function (w) {
            html += '    <div>• [' + w.type + ' ' + (w.id || '') + ']: ' + SchoolApp.escapeHTML(w.message || '') + '</div>';
          });
        }
        html += '  </div>';
        html += '</div>';
      }

      // Tab Navigation Bar
      html += '<div class="tabs acc-tab-bar">';
      var tabs = [
        { id: 'overview', label: 'Overview', icon: 'dashboard' },
        { id: 'income', label: 'Income (' + this.receipts.filter(function (r) { return r.status !== 'cancelled'; }).length + ')', icon: 'payments' },
        { id: 'expenses', label: 'Expenses (' + this.expenses.filter(function (e) { return e.status !== 'cancelled'; }).length + ')', icon: 'receipt_long' },
        { id: 'transfers', label: 'Transfers (' + this.transfers.filter(function (t) { return t.status !== 'cancelled'; }).length + ')', icon: 'swap_horiz' },
        { id: 'reports', label: 'Reports', icon: 'assessment' },
        { id: 'chart', label: 'Chart of Accounts (' + this.chart.length + ')', icon: 'account_tree' },
        { id: 'settings', label: 'Settings', icon: 'tune' }
      ];
      tabs.forEach(function (t) {
        var activeClass = (this.activeTab === t.id) ? 'active' : '';
        html += '<button class="tab-btn ' + activeClass + '" onclick="SchoolApp.modules.accounts.switchTab(\'' + t.id + '\')">';
        html += '  <span class="material-icons-round" style="font-size:18px;">' + t.icon + '</span> ' + t.label;
        html += '</button>';
      }.bind(this));
      html += '</div>';

      // Tab Content Area
      html += '<div id="accounts-tab-content"></div>';

      container.innerHTML = html;

      // Render the active tab
      this.renderCurrentTab();
    },

    switchTab: function (tabId) {
      this.activeTab = tabId;
      document.querySelectorAll('#page-accounts .tab-btn').forEach(function (btn) {
        btn.classList.remove('active');
        btn.style.borderBottomColor = 'transparent';
        btn.style.color = 'var(--text-secondary)';
      });
      var activeBtn = document.querySelector('#page-accounts .tab-btn[onclick*="' + tabId + '"]');
      if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.borderBottomColor = 'var(--accent-primary)';
        activeBtn.style.color = 'var(--accent-primary)';
        if (typeof activeBtn.scrollIntoView === 'function') {
          try {
            activeBtn.scrollIntoView({ inline: 'nearest', behavior: 'smooth', block: 'nearest' });
          } catch (_) {}
        }
      }
      this.renderCurrentTab();
    },

    renderCurrentTab: function () {
      var contentEl = document.getElementById('accounts-tab-content');
      if (!contentEl) return;

      if (this.activeTab === 'overview') {
        contentEl.innerHTML = this.renderOverviewHTML();
      } else if (this.activeTab === 'income') {
        contentEl.innerHTML = this.renderIncomeHTML();
      } else if (this.activeTab === 'expenses') {
        contentEl.innerHTML = this.renderExpensesHTML();
        this.attachExpenseEvents();
      } else if (this.activeTab === 'transfers') {
        contentEl.innerHTML = this.renderTransfersHTML();
      } else if (this.activeTab === 'reports') {
        contentEl.innerHTML = this.renderReportsHTML();
      } else if (this.activeTab === 'chart') {
        contentEl.innerHTML = this.renderChartHTML();
      } else if (this.activeTab === 'settings') {
        contentEl.innerHTML = this.renderSettingsHTML();
      }
    },


    // ── Tab 1: Overview ──────────────────────────────────────────────────────
    computeAccountBalance: function (code) {
      var summaryData = (this.summary && this.summary.accounts) ? this.summary.accounts : {};
      var mData = summaryData[code] || {};
      var drSum = 0;
      var crSum = 0;

      Object.values(mData).forEach(function (m) {
        drSum += (m.dr || 0);
        crSum += (m.cr || 0);
      });

      // If opening balance voucher was NOT yet posted in summary, incorporate opening draft/locked line
      var openingPosted = (this.syncState && this.syncState.counts && this.syncState.counts.openingPosted > 0);
      if (!openingPosted && this.opening && Array.isArray(this.opening.lines)) {
        var opLine = this.opening.lines.find(function (l) { return l.accountCode === code; });
        if (opLine) {
          drSum += (opLine.debitPaise || 0);
          crSum += (opLine.creditPaise || 0);
        }
      }

      var isAssetOrExpense = code.startsWith('1') || code.startsWith('5');
      return isAssetOrExpense ? (drSum - crSum) : (crSum - drSum);
    },

    computeFeeReconciliation: function () {
      var currentFY = this.getFinancialYear();
      var startYr = parseInt(currentFY.split('-')[0], 10);
      var endYr = startYr + 1;
      var fyStart = startYr + '-04-01';
      var fyEnd = endYr + '-03-31';

      var goLive = (this.settings && this.settings.goLiveDate) || fyStart;
      var effectiveStart = goLive > fyStart ? goLive : fyStart;

      // 1. Net Collections from Fees Module (store.fees)
      var feesList = (SchoolApp.store && Array.isArray(SchoolApp.store.fees)) ? SchoolApp.store.fees : [];
      var netFeeCollectedPaise = 0;
      var feePaymentsCount = 0;
      var feeReversalsCount = 0;
      var unpostedDigitalPaise = 0;
      var hasDigitalFeeAcc = !!(this.settings && this.settings.feeDigitalAccount);

      feesList.forEach(function (f) {
        if (f.type !== 'payment') return;
        if (!f.date || f.date < effectiveStart || f.date > fyEnd) return;
        var amt = Number(f.amount || 0);
        var pAmt = Math.round(amt * 100);
        netFeeCollectedPaise += pAmt;
        if (amt >= 0 && !f.isReversal) {
          feePaymentsCount++;
        } else {
          feeReversalsCount++;
        }

        var mode = (f.mode || 'Cash').trim().toLowerCase();
        if (mode !== 'cash') {
          // If digital account missing or digital vouchers not posted, track unposted digital receipts
          if (!hasDigitalFeeAcc || (this.settings && !this.settings.hasDigitalFeeVouchers)) {
            unpostedDigitalPaise += pAmt;
          }
        }
      }.bind(this));

      // 2. Ledger Fee Income from accounts_summary
      var summaryData = (this.summary && this.summary.accounts) ? this.summary.accounts : {};
      var feeHeadMapping = (this.settings && this.settings.feeHeadMapping) || {};
      var feeIncomeCodes = new Set(['41100', '41200', '41300', '41400', '42100']);
      Object.values(feeHeadMapping).forEach(function (c) { if (c) feeIncomeCodes.add(c); });

      var ledgerFeeIncomePaise = 0;
      feeIncomeCodes.forEach(function (code) {
        var months = summaryData[code] || {};
        Object.values(months).forEach(function (m) {
          ledgerFeeIncomePaise += ((m.cr || 0) - (m.dr || 0));
        });
      });

      // 3. Ledger Fee Discounts / Concessions (Account 55100)
      var ledgerDiscountPaise = 0;
      var discMonths = summaryData['55100'] || {};
      Object.values(discMonths).forEach(function (m) {
        ledgerDiscountPaise += ((m.dr || 0) - (m.cr || 0));
      });

      // Net Ledger Fees = Fee Income (Cr) - Fee Concessions (Dr)
      var netLedgerPaise = ledgerFeeIncomePaise - ledgerDiscountPaise;
      var diffPaise = netFeeCollectedPaise - netLedgerPaise;
      var isMatched = (diffPaise === 0);

      return {
        fy: currentFY,
        effectiveStart: effectiveStart,
        netFeeCollectedPaise: netFeeCollectedPaise,
        ledgerFeeIncomePaise: ledgerFeeIncomePaise,
        ledgerDiscountPaise: ledgerDiscountPaise,
        netLedgerPaise: netLedgerPaise,
        diffPaise: diffPaise,
        unpostedDigitalPaise: unpostedDigitalPaise,
        isMatched: isMatched,
        feePaymentsCount: feePaymentsCount,
        feeReversalsCount: feeReversalsCount
      };
    },

    renderOverviewHTML: function () {
      var currentFY = this.getFinancialYear();
      var now = new Date();
      var currentMonthPrefix = now.toISOString().slice(0, 7); // YYYY-MM

      // Calculate Cash & Bank Balances
      var cashInHandPaise = this.computeAccountBalance('11100');
      var pettyCashPaise = this.computeAccountBalance('11110');
      var bankAccounts = (this.settings && this.settings.bankAccounts) || [];
      var bankBalances = [];
      var totalBanksPaise = 0;

      bankAccounts.forEach(function (b) {
        var bCode = b.ledgerAccountId || '11200';
        var bBal = this.computeAccountBalance(bCode);
        totalBanksPaise += bBal;
        bankBalances.push({
          label: b.label || b.bankName,
          code: bCode,
          balancePaise: bBal,
          last4: b.last4
        });
      }.bind(this));

      // Fallback if no configured bank accounts yet
      if (bankAccounts.length === 0) {
        var primBal = this.computeAccountBalance('11200');
        totalBanksPaise += primBal;
        bankBalances.push({
          label: 'Primary Bank A/c',
          code: '11200',
          balancePaise: primBal,
          last4: '—',
          isFallback: true
        });
      }

      var totalLiquidityPaise = cashInHandPaise + pettyCashPaise + totalBanksPaise;

      // Compute This Month's Income & Expenses from summary
      var summaryData = (this.summary && this.summary.accounts) ? this.summary.accounts : {};
      var monthIncomePaise = 0;
      var monthExpensePaise = 0;

      Object.keys(summaryData).forEach(function (code) {
        var mObj = summaryData[code][currentMonthPrefix];
        if (!mObj) return;
        if (code.startsWith('4')) {
          monthIncomePaise += ((mObj.cr || 0) - (mObj.dr || 0));
        } else if (code.startsWith('5')) {
          monthExpensePaise += ((mObj.dr || 0) - (mObj.cr || 0));
        }
      });

      var monthNetPaise = monthIncomePaise - monthExpensePaise;
      var recon = this.computeFeeReconciliation();

      var html = '';

      // Section 1: Liquidity & Balances
      html += '<div style="margin-bottom:24px;">';
      html += '  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">';
      html += '    <h3 style="font-size:16px; font-weight:700; color:var(--text-primary); margin:0;">Real-Time Cash & Bank Liquidity</h3>';
      html += '    <span style="font-size:12px; color:var(--text-secondary);">Total Available: <strong>' + this.formatINR(totalLiquidityPaise) + '</strong></span>';
      html += '  </div>';

      html += '  <div class="acc-metrics-grid">';
      // Cash in Hand Card
      html += '    <div class="card" style="padding:16px; border-radius:10px; border-left:4px solid #10b981;">';
      html += '      <span style="font-size:11.5px; color:var(--text-secondary); text-transform:uppercase; font-weight:600; display:block;">Cash in Hand (11100)</span>';
      html += '      <div style="font-size:20px; font-weight:800; color:var(--text-primary); margin:6px 0 2px 0;">' + this.formatINR(cashInHandPaise) + '</div>';
      html += '      <span style="font-size:11px; color:var(--text-muted);">Main School Counter</span>';
      html += '    </div>';

      // Petty Cash Card
      html += '    <div class="card" style="padding:16px; border-radius:10px; border-left:4px solid #3b82f6;">';
      html += '      <span style="font-size:11.5px; color:var(--text-secondary); text-transform:uppercase; font-weight:600; display:block;">Petty Cash (11110)</span>';
      html += '      <div style="font-size:20px; font-weight:800; color:var(--text-primary); margin:6px 0 2px 0;">' + this.formatINR(pettyCashPaise) + '</div>';
      html += '      <span style="font-size:11px; color:var(--text-muted);">Daily Office Operations</span>';
      html += '    </div>';

      // Bank Accounts Cards
      bankBalances.forEach(function (bb) {
        html += '    <div class="card" style="padding:16px; border-radius:10px; border-left:4px solid #8b5cf6;">';
        html += '      <span style="font-size:11.5px; color:var(--text-secondary); text-transform:uppercase; font-weight:600; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + SchoolApp.escapeHTML(bb.label) + ' (' + bb.code + ')</span>';
        html += '      <div style="font-size:20px; font-weight:800; color:var(--text-primary); margin:6px 0 2px 0;">' + this.formatINR(bb.balancePaise) + '</div>';
        if (bb.isFallback) {
          html += '      <span style="font-size:11px;"><a href="javascript:void(0)" onclick="SchoolApp.modules.accounts.switchTab(\'settings\')" style="color:var(--accent-primary); text-decoration:underline; font-weight:500;">Add bank in Settings</a></span>';
        } else {
          html += '      <span style="font-size:11px; color:var(--text-muted);">A/c **' + SchoolApp.escapeHTML(bb.last4) + '</span>';
        }
        html += '    </div>';
      }.bind(this));
      html += '  </div>';
      html += '</div>';

      // Section 2: This Month Performance & Fee Reconciliation
      html += '<div class="acc-overview-grid">';

      // Monthly Operating Performance Card
      html += '  <div class="card" style="padding:20px; border-radius:10px;">';
      html += '    <h4 style="font-size:14.5px; font-weight:700; margin:0 0 16px 0; color:var(--text-primary); display:flex; align-items:center; justify-content:space-between;">';
      html += '      <span>Operating Performance (This Month)</span>';
      html += '      <span class="badge badge-info" style="font-size:10.5px;">' + currentMonthPrefix + '</span>';
      html += '    </h4>';
      html += '    <div style="display:flex; flex-direction:column; gap:12px;">';
      html += '      <div style="display:flex; justify-content:space-between; align-items:center; font-size:13.5px;">';
      html += '        <span style="color:var(--text-secondary);">Total Monthly Income:</span>';
      html += '        <strong style="color:var(--success);">' + this.formatINR(monthIncomePaise) + '</strong>';
      html += '      </div>';
      html += '      <div style="display:flex; justify-content:space-between; align-items:center; font-size:13.5px;">';
      html += '        <span style="color:var(--text-secondary);">Total Monthly Expenses:</span>';
      html += '        <strong style="color:var(--danger);">' + this.formatINR(monthExpensePaise) + '</strong>';
      html += '      </div>';
      html += '      <div style="border-top:1px dashed var(--border-color); padding-top:10px; display:flex; justify-content:space-between; align-items:center; font-size:14px;">';
      html += '        <span style="font-weight:600; color:var(--text-primary);">Net Monthly ' + (monthNetPaise >= 0 ? 'Surplus' : 'Deficit') + ':</span>';
      html += '        <strong style="font-size:16px; color:' + (monthNetPaise >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + this.formatINR(monthNetPaise) + '</strong>';
      html += '      </div>';
      html += '    </div>';
      html += '    <div style="margin-top:16px; display:flex; gap:8px;">';
      html += '      <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.switchTab(\'reports\')" style="font-size:11.5px; flex:1;">View P&L Report</button>';
      html += '      <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.switchTab(\'expenses\')" style="font-size:11.5px; flex:1;">Manage Expenses</button>';
      html += '    </div>';
      html += '  </div>';

      // Fee Reconciliation Card
      var reconBg = recon.isMatched ? 'rgba(16, 185, 129, 0.06)' : 'rgba(245, 158, 11, 0.08)';
      var reconBorder = recon.isMatched ? 'var(--success)' : 'var(--warning)';
      html += '  <div class="card" style="padding:20px; border-radius:10px; border:1px solid ' + reconBorder + '; background:' + reconBg + ';">';
      html += '    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">';
      html += '      <h4 style="font-size:14.5px; font-weight:700; margin:0; color:var(--text-primary); display:flex; align-items:center; gap:6px;">';
      html += '        <span class="material-icons-round" style="font-size:18px; color:' + (recon.isMatched ? 'var(--success)' : 'var(--warning)') + ';">' + (recon.isMatched ? 'verified' : 'sync_problem') + '</span>';
      html += '        Fee Reconciliation (FY ' + currentFY + ')';
      html += '      </h4>';
      html += '      <span class="badge ' + (recon.isMatched ? 'badge-success' : 'badge-warning') + '" style="font-size:11px;">' + (recon.isMatched ? 'Reconciled' : 'Mismatch') + '</span>';
      html += '    </div>';

      html += '    <div style="font-size:13px; display:flex; flex-direction:column; gap:8px;">';
      html += '      <div style="display:flex; justify-content:space-between;">';
      html += '        <span style="color:var(--text-secondary);">Fees Module Net Collections:</span>';
      html += '        <strong>' + this.formatINR(recon.netFeeCollectedPaise) + '</strong>';
      html += '      </div>';
      html += '      <div style="display:flex; justify-content:space-between;">';
      html += '        <span style="color:var(--text-secondary);">Ledger Fee Income (Cr):</span>';
      html += '        <span>' + this.formatINR(recon.ledgerFeeIncomePaise) + '</span>';
      html += '      </div>';
      html += '      <div style="display:flex; justify-content:space-between;">';
      html += '        <span style="color:var(--text-secondary);">Less: Concessions / Discounts (Dr):</span>';
      html += '        <span style="color:var(--text-muted);">- ' + this.formatINR(recon.ledgerDiscountPaise) + '</span>';
      html += '      </div>';
      html += '      <div style="border-top:1px dashed var(--border-color); padding-top:6px; display:flex; justify-content:space-between; font-weight:600;">';
      html += '        <span>Net Ledger Fee Income:</span>';
      html += '        <strong style="color:var(--accent-primary);">' + this.formatINR(recon.netLedgerPaise) + '</strong>';
      html += '      </div>';

      if (!recon.isMatched) {
        var unpostedDigitalNote = '';
        if (recon.unpostedDigitalPaise > 0) {
          unpostedDigitalNote = ' — includes ' + this.formatINR(recon.unpostedDigitalPaise) + ' in unposted digital (UPI/Bank) fee receipts' + (!this.settings.feeDigitalAccount ? ' because no bank account is configured in Settings' : '') + '.';
        }
        html += '      <div style="margin-top:8px; padding:8px 10px; background:rgba(239, 68, 68, 0.1); border-radius:6px; color:var(--danger); font-size:12px; font-weight:600;">';
        html += '        ⚠️ Variance of ' + this.formatINR(recon.diffPaise) + ' detected' + unpostedDigitalNote + ' ' + (!this.settings.feeDigitalAccount ? 'Set the digital fee bank account in Settings, then click' : 'Click') + ' "Sync now" above to post pending fee transactions to the ledger.';
        html += '      </div>';
      } else {
        html += '      <div style="margin-top:8px; font-size:12px; color:var(--success); font-weight:500;">';
        html += '        ✅ Every fee collection and concession in Fees is completely verified and posted in the ledger.';
        html += '      </div>';
      }
      html += '    </div>';
      html += '  </div>';

      html += '</div>';

      // Section 3: Quick Action Navigation
      html += '<div style="margin-top:20px; display:flex; gap:12px; flex-wrap:wrap;">';
      html += '  <button class="btn btn-secondary" onclick="SchoolApp.modules.accounts.openAddReceiptModal()" style="display:inline-flex; align-items:center; gap:6px;">';
      html += '    <span class="material-icons-round" style="color:var(--success);">payments</span> Record Other Income';
      html += '  </button>';
      html += '  <button class="btn btn-secondary" onclick="SchoolApp.modules.accounts.openAddTransferModal()" style="display:inline-flex; align-items:center; gap:6px;">';
      html += '    <span class="material-icons-round" style="color:var(--accent-primary);">swap_horiz</span> Contra Transfer';
      html += '  </button>';
      html += '  <button class="btn btn-secondary" onclick="SchoolApp.modules.accounts.switchTab(\'reports\')" style="display:inline-flex; align-items:center; gap:6px;">';
      html += '    <span class="material-icons-round" style="color:#8b5cf6;">menu_book</span> Open Day Book';
      html += '  </button>';
      html += '</div>';

      return html;
    },


    // ── Tab 2: Income ────────────────────────────────────────────────────────
    getFilteredReceipts: function () {
      var search = (this.receiptFilters.search || '').toLowerCase();
      var cat = this.receiptFilters.category;
      var range = this.receiptFilters.dateRange;
      var now = new Date();
      var todayStr = now.toISOString().split('T')[0];
      var monthStr = todayStr.slice(0, 7);

      return this.receipts.filter(function (r) {
        if (cat !== 'all' && r.categoryAccountId !== cat) return false;
        if (range === 'today' && r.date !== todayStr) return false;
        if (range === 'this_month' && (!r.date || !r.date.startsWith(monthStr))) return false;

        if (search) {
          var matchPayer = (r.payerName || '').toLowerCase().indexOf(search) >= 0;
          var matchNo = (r.receiptNo || '').toLowerCase().indexOf(search) >= 0;
          var matchRef = (r.referenceNo || '').toLowerCase().indexOf(search) >= 0;
          var matchDesc = (r.description || '').toLowerCase().indexOf(search) >= 0;
          if (!matchPayer && !matchNo && !matchRef && !matchDesc) return false;
        }
        return true;
      });
    },

    renderIncomeHTML: function () {
      var currentFY = this.getFinancialYear();
      var summaryData = (this.summary && this.summary.accounts) ? this.summary.accounts : {};
      var feeHeadMapping = (this.settings && this.settings.feeHeadMapping) || {};
      var storeHeads = (SchoolApp.store && (SchoolApp.store.feeHeads || (SchoolApp.store.settings && SchoolApp.store.settings.feeHeads))) || [
        { id: 'fh_tuition', name: 'Tuition Fee' },
        { id: 'fh_transport', name: 'Transport Fee' },
        { id: 'fh_exam', name: 'Examination Fee' },
        { id: 'fh_annual', name: 'Annual Development Fee' }
      ];

      var html = '';

      // Section A: Fee Income by Head
      html += '<div class="card" style="padding:20px; border-radius:10px; margin-bottom:24px;">';
      html += '  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">';
      html += '    <div>';
      html += '      <h3 style="font-size:15px; font-weight:700; color:var(--text-primary); margin:0;">Fee Income by Head (FY ' + currentFY + ')</h3>';
      html += '      <p style="font-size:12px; color:var(--text-secondary); margin:2px 0 0 0;">Derived automatically from Fees Module payments via general ledger sync.</p>';
      html += '    </div>';
      html += '    <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.switchTab(\'settings\')">';
      html += '      <span class="material-icons-round" style="font-size:15px;">tune</span> Configure Head Mappings';
      html += '    </button>';
      html += '  </div>';

      html += '  <div class="table-responsive acc-table-container">';
      html += '    <table class="table acc-table" style="width:100%; border-collapse:collapse; font-size:13px;">';
      html += '      <thead>';
      html += '        <tr style="text-align:left; color:var(--text-secondary); border-bottom:1px solid var(--border-color);">';
      html += '          <th style="padding:8px 12px;">FEE HEAD</th>';
      html += '          <th style="padding:8px 12px;">MAPPED LEDGER ACCOUNT</th>';
      html += '          <th style="padding:8px 12px; text-align:right;">TOTAL EARNED IN FY</th>';
      html += '        </tr>';
      html += '      </thead>';
      html += '      <tbody>';

      var totalFeeEarnedPaise = 0;
      storeHeads.forEach(function (h) {
        var accCode = feeHeadMapping[h.id] || '41100';
        var acc = this.chart.find(function (a) { return a.code === accCode; });
        var accName = acc ? acc.name : 'Tuition Fees';
        var mObj = summaryData[accCode] || {};
        var earnedPaise = 0;
        Object.values(mObj).forEach(function (m) {
          earnedPaise += ((m.cr || 0) - (m.dr || 0));
        });
        totalFeeEarnedPaise += earnedPaise;

        html += '        <tr style="border-bottom:1px solid var(--border-color);">';
        html += '          <td style="padding:10px 12px; font-weight:600;">' + SchoolApp.escapeHTML(h.name) + '</td>';
        html += '          <td style="padding:10px 12px; color:var(--text-secondary);">';
        html += '            <code>' + accCode + '</code> — ' + SchoolApp.escapeHTML(accName);
        if (!feeHeadMapping[h.id]) {
          html += '          <span class="badge badge-warning" style="font-size:10px; margin-left:6px;">Default</span>';
        }
        html += '          </td>';
        html += '          <td style="padding:10px 12px; text-align:right; font-weight:700; color:var(--success);">' + this.formatINR(earnedPaise) + '</td>';
        html += '        </tr>';
      }.bind(this));

      html += '        <tr style="background:var(--bg-secondary); font-weight:700;">';
      html += '          <td style="padding:10px 12px;" colspan="2">TOTAL LEDGER FEE INCOME</td>';
      html += '          <td style="padding:10px 12px; text-align:right; color:var(--success); font-size:14px;">' + this.formatINR(totalFeeEarnedPaise) + '</td>';
      html += '        </tr>';
      html += '      </tbody>';
      html += '    </table>';
      html += '  </div>';
      html += '</div>';

      // Section B: Other Income Receipts
      var filtered = this.getFilteredReceipts();
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">';
      html += '  <div>';
      html += '    <h3 style="font-size:16px; font-weight:700; color:var(--text-primary); margin:0;">Other Income & Miscellaneous Receipts</h3>';
      html += '    <p style="font-size:12.5px; color:var(--text-secondary); margin:2px 0 0 0;">Direct receipts for bank interest (43100), donations, grants, and miscellaneous receipts</p>';
      html += '  </div>';
      html += '  <div style="display:flex; gap:10px; align-items:center;">';
      html += '    <button class="btn btn-secondary" onclick="SchoolApp.modules.accounts.exportReceiptsCSV()">';
      html += '      <span class="material-icons-round">download</span> Export CSV';
      html += '    </button>';
      html += '    <button class="btn btn-primary" onclick="SchoolApp.modules.accounts.openAddReceiptModal()">';
      html += '      <span class="material-icons-round">add</span> Record Income';
      html += '    </button>';
      html += '  </div>';
      html += '</div>';

      // Filter Bar
      html += '<div class="card" style="padding:14px 16px; border-radius:10px; margin-bottom:16px;">';
      html += '  <div class="acc-filters-grid">';
      html += '    <input type="text" class="form-control" placeholder="Search payer, ref, no..." value="' + SchoolApp.escapeHTML(this.receiptFilters.search) + '" oninput="SchoolApp.modules.accounts.receiptFilters.search = this.value; SchoolApp.modules.accounts.renderCurrentTab();" />';
      html += '    <select class="form-control form-select" onchange="SchoolApp.modules.accounts.receiptFilters.category = this.value; SchoolApp.modules.accounts.renderCurrentTab();">';
      html += '      <option value="all" ' + (this.receiptFilters.category === 'all' ? 'selected' : '') + '>All Categories</option>';
      html += '      <option value="43100" ' + (this.receiptFilters.category === '43100' ? 'selected' : '') + '>43100 - Bank Interest</option>';
      html += '      <option value="43200" ' + (this.receiptFilters.category === '43200' ? 'selected' : '') + '>43200 - Misc Receipts</option>';
      html += '    </select>';
      html += '    <select class="form-control form-select" onchange="SchoolApp.modules.accounts.receiptFilters.dateRange = this.value; SchoolApp.modules.accounts.renderCurrentTab();">';
      html += '      <option value="all" ' + (this.receiptFilters.dateRange === 'all' ? 'selected' : '') + '>All Dates</option>';
      html += '      <option value="today" ' + (this.receiptFilters.dateRange === 'today' ? 'selected' : '') + '>Today</option>';
      html += '      <option value="this_month" ' + (this.receiptFilters.dateRange === 'this_month' ? 'selected' : '') + '>This Month</option>';
      html += '    </select>';
      html += '  </div>';
      html += '</div>';

      // Receipts Table
      if (filtered.length === 0) {
        html += '<div class="card" style="padding:48px; text-align:center; color:var(--text-secondary); border-radius:10px;">';
        html += '  <span class="material-icons-round" style="font-size:40px; color:var(--text-muted); margin-bottom:8px;">inbox</span>';
        html += '  <p style="font-weight:600; margin:0;">No other income receipts found</p>';
        html += '  <p style="font-size:12px; margin:4px 0 16px 0;">Record interest received, donations, or other miscellaneous receipts.</p>';
        html += '  <button class="btn btn-primary btn-sm" onclick="SchoolApp.modules.accounts.openAddReceiptModal()">Record First Receipt</button>';
        html += '</div>';
      } else {
        html += '<div class="card" style="padding:0; border-radius:10px; overflow:hidden;">';
        html += '  <div class="table-responsive acc-table-container">';
        html += '    <table class="table acc-table" style="width:100%; margin:0; border-collapse:collapse; font-size:13px;">';
        html += '      <thead>';
        html += '        <tr style="text-align:left; color:var(--text-secondary); border-bottom:1px solid var(--border-color); font-size:11.5px;">';
        html += '          <th style="padding:10px 14px;">RECEIPT #</th>';
        html += '          <th style="padding:10px 14px;">DATE</th>';
        html += '          <th style="padding:10px 14px;">PAYER / SOURCE</th>';
        html += '          <th style="padding:10px 14px;">CATEGORY</th>';
        html += '          <th style="padding:10px 14px;">RECEIVED IN</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">AMOUNT</th>';
        html += '          <th style="padding:10px 14px; text-align:center;">STATUS</th>';
        html += '          <th style="padding:10px 14px; text-align:center;">ACTIONS</th>';
        html += '        </tr>';
        html += '      </thead>';
        html += '      <tbody>';

        filtered.forEach(function (r) {
          var isCan = (r.status === 'cancelled');
          var catAcc = this.chart.find(function (a) { return a.code === r.categoryAccountId; });
          var catName = catAcc ? catAcc.name : r.categoryAccountId;

          html += '        <tr style="border-bottom:1px solid var(--border-color);' + (isCan ? ' opacity:0.6;' : '') + '">';
          html += '          <td style="padding:10px 14px; font-weight:700;">' + SchoolApp.escapeHTML(r.receiptNo || r.id) + '</td>';
          html += '          <td style="padding:10px 14px; color:var(--text-secondary);">' + (r.date || '—') + '</td>';
          html += '          <td style="padding:10px 14px; font-weight:600;">' + SchoolApp.escapeHTML(r.payerName || '—') + '</td>';
          html += '          <td style="padding:10px 14px; color:var(--text-secondary);">' + SchoolApp.escapeHTML(catName) + '</td>';
          html += '          <td style="padding:10px 14px; color:var(--text-secondary);"><code>' + SchoolApp.escapeHTML(r.receivedInAccountId || '11100') + '</code></td>';
          html += '          <td style="padding:10px 14px; text-align:right; font-weight:700; color:' + (isCan ? 'var(--text-muted); text-decoration:line-through;' : 'var(--success);') + '">';
          html += '            ' + this.formatINR(r.amountPaise);
          html += '          </td>';
          html += '          <td style="padding:10px 14px; text-align:center;">';
          if (isCan) {
            html += '            <span class="badge badge-danger" style="font-size:10.5px;">Cancelled</span>';
          } else {
            html += '            <span class="badge badge-success" style="font-size:10.5px;">Active</span>';
          }
          html += '          </td>';
          html += '          <td style="padding:10px 14px; text-align:center;">';
          html += '            <div style="display:inline-flex; gap:6px;">';
          html += '              <button class="btn btn-secondary btn-sm" style="font-size:11px; padding:3px 8px;" onclick="SchoolApp.modules.accounts.viewReceiptDetails(\'' + r.id + '\')">View</button>';
          if (!isCan) {
            html += '              <button class="btn btn-danger btn-sm" style="font-size:11px; padding:3px 8px;" onclick="SchoolApp.modules.accounts.promptCancelReceipt(\'' + r.id + '\')">Cancel</button>';
          }
          html += '            </div>';
          html += '          </td>';
          html += '        </tr>';
        }.bind(this));

        html += '      </tbody>';
        html += '    </table>';
        html += '  </div>';
        html += '</div>';
      }

      return html;
    },

    openAddReceiptModal: function () {
      var today = new Date().toISOString().split('T')[0];
      var incomeAccounts = this.chart.filter(function (a) {
        return a.type === 'income' && a.isActive !== false && a.reservedFor !== 'fees';
      });

      var bankAccounts = (this.settings && this.settings.bankAccounts) || [];

      var html = '';
      html += '<form id="form-add-receipt" onsubmit="SchoolApp.modules.accounts.saveReceipt(event)">';

      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Receipt Date *</label>';
      html += '      <input type="date" class="form-control" id="rcp-date" value="' + today + '" required />';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Amount (INR ₹) *</label>';
      html += '      <input type="number" step="0.01" min="1" class="form-control" id="rcp-amount" placeholder="0.00" required />';
      html += '    </div>';
      html += '  </div>';

      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Income Category Account *</label>';
      html += '      <select class="form-control form-select" id="rcp-category" required>';
      incomeAccounts.forEach(function (acc) {
        html += '        <option value="' + acc.code + '">' + acc.code + ' - ' + SchoolApp.escapeHTML(acc.name) + '</option>';
      });
      html += '      </select>';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Received Into *</label>';
      html += '      <select class="form-control form-select" id="rcp-received-in" required>';
      html += '        <option value="11100">11100 - Cash in Hand</option>';
      html += '        <option value="11110">11110 - Petty Cash</option>';
      bankAccounts.forEach(function (b) {
        if (b.isActive !== false) {
          html += '      <option value="' + (b.ledgerAccountId || '11200') + '">' + (b.ledgerAccountId || '11200') + ' - ' + SchoolApp.escapeHTML(b.label || b.bankName) + ' (**' + (b.last4 || '') + ')</option>';
        }
      });
      html += '      </select>';
      html += '    </div>';
      html += '  </div>';

      html += '  <div style="display:grid; grid-template-columns:2fr 1fr; gap:12px; margin-bottom:14px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Payer Name / Source *</label>';
      html += '      <input type="text" class="form-control" id="rcp-payer-name" placeholder="e.g. State Bank of India, Rotary Club, or Parent Name" required />';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Payer Phone</label>';
      html += '      <input type="tel" class="form-control" id="rcp-payer-phone" placeholder="Optional" />';
      html += '    </div>';
      html += '  </div>';

      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Payment Mode</label>';
      html += '      <select class="form-control form-select" id="rcp-payment-mode">';
      html += '        <option value="Bank Transfer">Bank Transfer / NEFT / RTGS</option>';
      html += '        <option value="UPI">UPI / QR Code</option>';
      html += '        <option value="Cash">Cash</option>';
      html += '        <option value="Cheque">Cheque</option>';
      html += '        <option value="Other">Other</option>';
      html += '      </select>';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Reference / Transaction ID</label>';
      html += '      <input type="text" class="form-control" id="rcp-ref-no" placeholder="e.g. UTR # or Cheque #" />';
      html += '    </div>';
      html += '  </div>';

      html += '  <div class="form-group" style="margin-bottom:16px;">';
      html += '    <label class="form-label" style="font-weight:600;">Description / Narration</label>';
      html += '    <textarea class="form-control" id="rcp-desc" rows="2" placeholder="e.g. Quarterly savings account interest credit"></textarea>';
      html += '  </div>';

      html += '</form>';

      var footerHTML = '';
      footerHTML += '<button type="button" class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
      footerHTML += '<button type="submit" form="form-add-receipt" class="btn btn-primary" id="btn-save-receipt">';
      footerHTML += '  <span class="material-icons-round">save</span> Save Receipt';
      footerHTML += '</button>';

      this.openModal('Record Other Income Receipt', html, footerHTML);
    },

    saveReceipt: async function (e) {
      if (e) e.preventDefault();
      var btn = document.getElementById('btn-save-receipt');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Saving...';
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      var date = document.getElementById('rcp-date').value;
      var amountRupees = parseFloat(document.getElementById('rcp-amount').value);
      var category = document.getElementById('rcp-category').value;
      var receivedIn = document.getElementById('rcp-received-in').value;
      var payerName = document.getElementById('rcp-payer-name').value.trim();
      var payerPhone = (document.getElementById('rcp-payer-phone').value || '').trim();
      var paymentMode = document.getElementById('rcp-payment-mode').value;
      var refNo = (document.getElementById('rcp-ref-no').value || '').trim();
      var desc = (document.getElementById('rcp-desc').value || '').trim();

      if (!date || isNaN(amountRupees) || amountRupees <= 0 || !category || !payerName) {
        SchoolApp.showToast('Please fill all required fields.', 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">save</span> Save Receipt';
        }
        return;
      }

      var amountPaise = Math.round(amountRupees * 100);
      var fy = this.getFinancialYear(date);
      var receiptId = 'rcp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

      try {
        var countersRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'counters');
        var receiptRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_receipts', receiptId);

        var userDesc = (SchoolApp.currentUser && (SchoolApp.currentUser.firstName + ' ' + (SchoolApp.currentUser.lastName || '')).trim()) || 'Admin';
        var nowIso = new Date().toISOString();

        var assignedNo = await fs.runTransaction(db, async function (tx) {
          var countersSnap = await tx.get(countersRef);
          var countersData = countersSnap.exists() ? countersSnap.data() : { receiptSeq: {} };
          var seqObj = Object.assign({}, countersData.receiptSeq || {});
          var nextSeq = (seqObj[fy] || 0) + 1;
          var receiptNo = 'RCP-' + fy + '-' + String(nextSeq).padStart(4, '0');

          seqObj[fy] = nextSeq;

          tx.set(countersRef, { receiptSeq: seqObj }, { merge: true });
          tx.set(receiptRef, {
            receiptNo: receiptNo,
            date: date,
            financialYear: fy,
            payerName: payerName,
            payerPhone: payerPhone || null,
            categoryAccountId: category,
            receivedInAccountId: receivedIn,
            amountPaise: amountPaise,
            paymentMode: paymentMode,
            referenceNo: refNo || null,
            description: desc || null,
            status: 'active',
            createdBy: userDesc,
            createdAt: nowIso
          });

          return receiptNo;
        });

        SchoolApp.closeModal();
        SchoolApp.showToast('Receipt ' + assignedNo + ' recorded successfully!', 'success');
        await this.render();
      } catch (err) {
        console.error('Receipt save error:', err);
        SchoolApp.showToast('Failed to save receipt: ' + (err.message || 'Check connection'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">save</span> Save Receipt';
        }
      }
    },

    viewReceiptDetails: function (receiptId) {
      var rcp = this.receipts.find(function (r) { return r.id === receiptId; });
      if (!rcp) return;

      var isCan = (rcp.status === 'cancelled');
      var catAcc = this.chart.find(function (a) { return a.code === rcp.categoryAccountId; });
      var catLabel = catAcc ? (catAcc.code + ' - ' + catAcc.name) : rcp.categoryAccountId;

      var html = '';
      html += '<div style="padding:4px 0;">';
      html += '  <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:16px;">';
      html += '    <div>';
      html += '      <span style="font-size:12px; color:var(--text-muted); font-weight:600;">RECEIPT NUMBER</span>';
      html += '      <div style="font-size:18px; font-weight:700; color:var(--text-primary);">' + SchoolApp.escapeHTML(rcp.receiptNo || '—') + '</div>';
      html += '    </div>';
      html += '    <div style="text-align:right;">';
      html += '      <span style="font-size:12px; color:var(--text-muted); font-weight:600;">TOTAL AMOUNT</span>';
      html += '      <div style="font-size:20px; font-weight:800; color:' + (isCan ? 'var(--danger); text-decoration:line-through;' : 'var(--success);') + '">' + this.formatINR(rcp.amountPaise) + '</div>';
      html += '    </div>';
      html += '  </div>';

      if (isCan) {
        html += '<div class="alert alert-danger" style="margin-bottom:16px; padding:10px 14px; border-radius:6px; background:rgba(239, 68, 68, 0.08); border:1px solid var(--danger);">';
        html += '  <div style="font-weight:700; color:var(--danger); font-size:13px;">This receipt was CANCELLED</div>';
        html += '  <div style="font-size:12.5px; color:var(--text-primary); margin-top:4px;"><strong>Reason:</strong> ' + SchoolApp.escapeHTML(rcp.cancelReason || 'Unspecified') + '</div>';
        html += '  <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">Cancelled on ' + (rcp.cancelledAt ? new Date(rcp.cancelledAt).toLocaleString('en-IN') : '—') + ' by ' + SchoolApp.escapeHTML(rcp.cancelledBy || 'Admin') + '</div>';
        html += '</div>';
      }

      html += '<div class="acc-detail-grid">';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Date</span><strong>' + (rcp.date || '—') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Financial Year</span><strong>FY ' + (rcp.financialYear || '—') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Payer / Source</span><strong>' + SchoolApp.escapeHTML(rcp.payerName || '—') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Payer Phone</span><strong>' + SchoolApp.escapeHTML(rcp.payerPhone || '—') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Category Account</span><strong>' + SchoolApp.escapeHTML(catLabel) + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Received In</span><strong><code>' + SchoolApp.escapeHTML(rcp.receivedInAccountId || '11100') + '</code></strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Payment Mode</span><strong>' + SchoolApp.escapeHTML(rcp.paymentMode || '—') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Reference No</span><strong>' + SchoolApp.escapeHTML(rcp.referenceNo || '—') + '</strong></div>';
      html += '</div>';

      if (rcp.description) {
        html += '<div style="margin-top:12px;">';
        html += '  <span style="color:var(--text-muted); display:block; font-size:11.5px; margin-bottom:2px;">Description</span>';
        html += '  <div style="background:var(--bg-secondary); padding:8px 12px; border-radius:6px; font-size:13px;">' + SchoolApp.escapeHTML(rcp.description) + '</div>';
        html += '</div>';
      }
      html += '</div>';

      var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>';
      if (!isCan) {
        footerHTML += '<button class="btn btn-danger" style="margin-left:8px;" onclick="SchoolApp.closeModal(); setTimeout(function() { SchoolApp.modules.accounts.promptCancelReceipt(\'' + rcp.id + '\'); }, 150);">Cancel Receipt</button>';
      }

      this.openModal('Receipt Details — ' + (rcp.receiptNo || ''), html, footerHTML);
    },

    promptCancelReceipt: function (receiptId) {
      var rcp = this.receipts.find(function (r) { return r.id === receiptId; });
      if (!rcp) return;

      var html = '';
      html += '<div style="padding:6px 0;">';
      html += '  <p style="font-size:14px; color:var(--text-primary); margin-bottom:12px;">';
      html += '    Are you sure you want to cancel receipt <strong>' + SchoolApp.escapeHTML(rcp.receiptNo || '') + '</strong> for <strong>' + this.formatINR(rcp.amountPaise) + '</strong> (' + SchoolApp.escapeHTML(rcp.payerName || '') + ')?';
      html += '  </p>';
      html += '  <div class="form-group">';
      html += '    <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Reason for Cancellation *</label>';
      html += '    <textarea class="form-control" id="cancel-receipt-reason" rows="3" placeholder="Explain why this receipt is being cancelled..." required></textarea>';
      html += '  </div>';
      html += '  <small class="form-text text-muted" style="font-size:12px; display:block; margin-top:6px;">This action cannot be undone. Reversal voucher will be posted in the ledger.</small>';
      html += '</div>';

      var footerHTML = '';
      footerHTML += '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Keep Receipt</button>';
      footerHTML += '<button class="btn btn-danger" id="btn-confirm-cancel-rcp" style="margin-left:8px;" onclick="SchoolApp.modules.accounts.executeCancelReceipt(\'' + receiptId + '\')">';
      footerHTML += '  <span class="material-icons-round">block</span> Confirm Cancellation';
      footerHTML += '</button>';

      this.openModal('Cancel Income Receipt', html, footerHTML);
    },

    executeCancelReceipt: async function (receiptId) {
      var reasonInput = document.getElementById('cancel-receipt-reason');
      var reason = reasonInput ? reasonInput.value.trim() : '';
      if (!reason) {
        SchoolApp.showToast('Please provide a cancellation reason.', 'error');
        return;
      }

      var btn = document.getElementById('btn-confirm-cancel-rcp');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Cancelling...';
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;
      var userDesc = (SchoolApp.currentUser && (SchoolApp.currentUser.firstName + ' ' + (SchoolApp.currentUser.lastName || '')).trim()) || 'Admin';

      try {
        var rcpRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_receipts', receiptId);
        await fs.updateDoc(rcpRef, {
          status: 'cancelled',
          cancelReason: reason,
          cancelledAt: new Date().toISOString(),
          cancelledBy: userDesc
        });

        SchoolApp.closeModal();
        SchoolApp.showToast('Receipt cancelled successfully.', 'success');
        await this.render();
      } catch (err) {
        console.error('Receipt cancel error:', err);
        SchoolApp.showToast('Failed to cancel receipt: ' + (err.message || 'Permission denied'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = 'Confirm Cancellation';
        }
      }
    },

    exportReceiptsCSV: function () {
      var filtered = this.getFilteredReceipts();
      if (filtered.length === 0) {
        SchoolApp.showToast('No receipts to export.', 'warning');
        return;
      }

      var headers = ['Receipt No', 'Date', 'FY', 'Payer Name', 'Payer Phone', 'Category Code', 'Category Name', 'Received In', 'Amount (INR)', 'Mode', 'Ref No', 'Status', 'Description', 'Cancel Reason'];
      var csvRows = [headers.join(',')];

      var escapeCSV = function (str) {
        if (str === null || str === undefined) return '""';
        return '"' + String(str).replace(/"/g, '""') + '"';
      };

      filtered.forEach(function (r) {
        var catAcc = this.chart.find(function (a) { return a.code === r.categoryAccountId; });
        var catName = catAcc ? catAcc.name : '';
        var amt = ((r.amountPaise || 0) / 100).toFixed(2);

        csvRows.push([
          escapeCSV(r.receiptNo),
          escapeCSV(r.date),
          escapeCSV(r.financialYear),
          escapeCSV(r.payerName),
          escapeCSV(r.payerPhone || ''),
          escapeCSV(r.categoryAccountId),
          escapeCSV(catName),
          escapeCSV(r.receivedInAccountId),
          amt,
          escapeCSV(r.paymentMode || ''),
          escapeCSV(r.referenceNo || ''),
          escapeCSV(r.status || 'active'),
          escapeCSV(r.description || ''),
          escapeCSV(r.cancelReason || '')
        ].join(','));
      }.bind(this));

      var blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'Income_Receipts_' + this.getSchoolId() + '_' + new Date().toISOString().split('T')[0] + '.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },


    // ── Tab 3: Expenses ─────────────────────────────────────────────────────
    renderExpensesHTML: function () {
      var filtered = this.getFilteredExpenses();
      var html = '';

      // Toolbar / Filters
      html += '<div class="card" style="padding:16px; border-radius:10px; margin-bottom:20px;">';
      html += '  <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap:12px; align-items:flex-end;">';

      // Search
      html += '    <div>';
      html += '      <label class="form-label" style="font-size:12px; font-weight:600; margin-bottom:4px; display:block;">Search</label>';
      html += '      <input type="text" class="form-control" id="exp-search-input" placeholder="Vendor / Description..." value="' + SchoolApp.escapeHTML(this.filters.search) + '" />';
      html += '    </div>';

      // Category
      html += '    <div>';
      html += '      <label class="form-label" style="font-size:12px; font-weight:600; margin-bottom:4px; display:block;">Category</label>';
      html += '      <select class="form-control form-select" id="exp-cat-filter">';
      html += '        <option value="all">All Categories</option>';
      this.chart.filter(function (a) { return a.type === 'expense'; }).forEach(function (a) {
        var sel = (this.filters.category === a.code) ? 'selected' : '';
        html += '        <option value="' + a.code + '" ' + sel + '>' + a.code + ' - ' + SchoolApp.escapeHTML(a.name) + '</option>';
      }.bind(this));
      html += '      </select>';
      html += '    </div>';

      // Payment Mode
      html += '    <div>';
      html += '      <label class="form-label" style="font-size:12px; font-weight:600; margin-bottom:4px; display:block;">Payment Mode</label>';
      html += '      <select class="form-control form-select" id="exp-mode-filter">';
      html += '        <option value="all">All Modes</option>';
      ['Cash', 'UPI', 'Bank Transfer', 'Cheque'].forEach(function (m) {
        var sel = (this.filters.paymentMode === m) ? 'selected' : '';
        html += '        <option value="' + m + '" ' + sel + '>' + m + '</option>';
      }.bind(this));
      html += '      </select>';
      html += '    </div>';

      // Status
      html += '    <div>';
      html += '      <label class="form-label" style="font-size:12px; font-weight:600; margin-bottom:4px; display:block;">Status</label>';
      html += '      <select class="form-control form-select" id="exp-status-filter">';
      html += '        <option value="all" ' + (this.filters.status === 'all' ? 'selected' : '') + '>All Statuses</option>';
      html += '        <option value="active" ' + (this.filters.status === 'active' ? 'selected' : '') + '>Active</option>';
      html += '        <option value="cancelled" ' + (this.filters.status === 'cancelled' ? 'selected' : '') + '>Cancelled</option>';
      html += '      </select>';
      html += '    </div>';

      // Actions (Export CSV)
      html += '    <div style="display:flex; gap:8px;">';
      html += '      <button class="btn btn-secondary" onclick="SchoolApp.modules.accounts.exportExpensesCSV()" style="width:100%;">';
      html += '        <span class="material-icons-round">file_download</span> Export CSV';
      html += '      </button>';
      html += '    </div>';

      html += '  </div>';
      html += '</div>';

      // Table View
      html += '<div class="card" style="padding:0; border-radius:10px; overflow:hidden;">';
      html += '  <div class="table-responsive acc-table-container">';
      html += '    <table class="table acc-table" style="width:100%; margin:0; border-collapse:collapse;">';
      html += '      <thead>';
      html += '        <tr style="background:var(--bg-secondary); border-bottom:1px solid var(--border-color); text-align:left; font-size:12px; color:var(--text-secondary);">';
      html += '          <th style="padding:12px 16px;">VOUCHER #</th>';
      html += '          <th style="padding:12px 16px;">DATE</th>';
      html += '          <th style="padding:12px 16px;">VENDOR</th>';
      html += '          <th style="padding:12px 16px;">CATEGORY</th>';
      html += '          <th style="padding:12px 16px;">MODE / PAID FROM</th>';
      html += '          <th style="padding:12px 16px; text-align:right;">AMOUNT</th>';
      html += '          <th style="padding:12px 16px; text-align:center;">ATTACHMENTS</th>';
      html += '          <th style="padding:12px 16px; text-align:center;">STATUS</th>';
      html += '          <th style="padding:12px 16px; text-align:center;">ACTIONS</th>';
      html += '        </tr>';
      html += '      </thead>';
      html += '      <tbody>';

      if (filtered.length === 0) {
        html += '        <tr><td colspan="9" style="text-align:center; padding:32px; color:var(--text-muted);">No matching expenses found.</td></tr>';
      } else {
        filtered.forEach(function (exp) {
          var isCan = exp.status === 'cancelled';
          var catAcc = this.chart.find(function (a) { return a.code === exp.categoryAccountId; });
          var catLabel = catAcc ? catAcc.name : ('Acct ' + (exp.categoryAccountId || ''));
          var attCount = (exp.attachments && exp.attachments.length) || 0;

          html += '        <tr style="border-bottom:1px solid var(--border-color); font-size:13px; ' + (isCan ? 'opacity:0.65; background:rgba(239, 68, 68, 0.03);' : '') + '">';
          html += '          <td style="padding:12px 16px; font-weight:600;">' + SchoolApp.escapeHTML(exp.expenseNo || '—') + '</td>';
          html += '          <td style="padding:12px 16px;">' + (exp.date || '—') + '</td>';
          html += '          <td style="padding:12px 16px; font-weight:500;">' + SchoolApp.escapeHTML(exp.vendorName || '—') + '</td>';
          html += '          <td style="padding:12px 16px;"><span class="badge badge-info" style="font-size:11px;">' + SchoolApp.escapeHTML(catLabel) + '</span></td>';
          html += '          <td style="padding:12px 16px;">' + SchoolApp.escapeHTML(exp.paymentMode || 'Cash') + '</td>';
          html += '          <td style="padding:12px 16px; text-align:right; font-weight:700;' + (isCan ? ' text-decoration:line-through; color:var(--danger);' : '') + '">' + this.formatINR(exp.amountPaise) + '</td>';
          html += '          <td style="padding:12px 16px; text-align:center;">';
          if (attCount > 0) {
            html += '            <span class="badge badge-purple" style="font-size:11px; cursor:pointer;" onclick="SchoolApp.modules.accounts.viewExpenseDetails(\'' + exp.id + '\')"><span class="material-icons-round" style="font-size:12px; vertical-align:middle;">attach_file</span> ' + attCount + '</span>';
          } else {
            html += '            <span style="color:var(--text-muted); font-size:11px;">—</span>';
          }
          html += '          </td>';
          html += '          <td style="padding:12px 16px; text-align:center;">';
          if (isCan) {
            html += '            <span class="badge badge-danger" title="' + SchoolApp.escapeHTML(exp.cancelReason || '') + '" style="font-size:11px;">Cancelled</span>';
          } else {
            html += '            <span class="badge badge-success" style="font-size:11px;">Active</span>';
          }
          html += '          </td>';
          html += '          <td style="padding:12px 16px; text-align:center;">';
          html += '            <div style="display:inline-flex; gap:6px;">';
          html += '              <button class="btn-icon" title="View Details" onclick="SchoolApp.modules.accounts.viewExpenseDetails(\'' + exp.id + '\')"><span class="material-icons-round">visibility</span></button>';
          if (!isCan) {
            html += '              <button class="btn-icon" title="Cancel Expense" style="color:var(--danger);" onclick="SchoolApp.modules.accounts.promptCancelExpense(\'' + exp.id + '\')"><span class="material-icons-round">block</span></button>';
          }
          html += '            </div>';
          html += '          </td>';
          html += '        </tr>';
        }.bind(this));
      }

      html += '      </tbody>';
      html += '    </table>';
      html += '  </div>';
      html += '</div>';

      return html;
    },

    attachExpenseEvents: function () {
      var searchInput = document.getElementById('exp-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', function (e) {
          this.filters.search = e.target.value.toLowerCase();
          document.getElementById('accounts-tab-content').innerHTML = this.renderExpensesHTML();
          this.attachExpenseEvents();
        }.bind(this));
      }

      var catFilter = document.getElementById('exp-cat-filter');
      if (catFilter) {
        catFilter.addEventListener('change', function (e) {
          this.filters.category = e.target.value;
          document.getElementById('accounts-tab-content').innerHTML = this.renderExpensesHTML();
          this.attachExpenseEvents();
        }.bind(this));
      }

      var modeFilter = document.getElementById('exp-mode-filter');
      if (modeFilter) {
        modeFilter.addEventListener('change', function (e) {
          this.filters.paymentMode = e.target.value;
          document.getElementById('accounts-tab-content').innerHTML = this.renderExpensesHTML();
          this.attachExpenseEvents();
        }.bind(this));
      }

      var statusFilter = document.getElementById('exp-status-filter');
      if (statusFilter) {
        statusFilter.addEventListener('change', function (e) {
          this.filters.status = e.target.value;
          document.getElementById('accounts-tab-content').innerHTML = this.renderExpensesHTML();
          this.attachExpenseEvents();
        }.bind(this));
      }
    },

    getFilteredExpenses: function () {
      var self = this;
      return this.expenses.filter(function (e) {
        if (self.filters.status !== 'all') {
          var st = e.status || 'active';
          if (st !== self.filters.status) return false;
        }
        if (self.filters.category !== 'all' && e.categoryAccountId !== self.filters.category) {
          return false;
        }
        if (self.filters.paymentMode !== 'all' && e.paymentMode !== self.filters.paymentMode) {
          return false;
        }
        if (self.filters.search) {
          var term = self.filters.search;
          var matchVendor = (e.vendorName || '').toLowerCase().indexOf(term) !== -1;
          var matchDesc = (e.description || '').toLowerCase().indexOf(term) !== -1;
          var matchNo = (e.expenseNo || '').toLowerCase().indexOf(term) !== -1;
          if (!matchVendor && !matchDesc && !matchNo) return false;
        }
        return true;
      });
    },

    // ── Add Expense Modal ────────────────────────────────────────────────────
    openAddExpenseModal: function () {
      var expenseAccounts = this.chart.filter(function (a) { return a.type === 'expense' && a.isActive && !a.reservedFor; });
      var today = new Date().toISOString().split('T')[0];
      this.selectedAttachments = [];

      var html = '';
      html += '<form id="form-record-expense" onsubmit="SchoolApp.modules.accounts.saveExpense(event)">';
      html += '  <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap:12px; margin-bottom:14px;">';

      // Date
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Date *</label>';
      html += '      <input type="date" class="form-control" id="exp-date" value="' + today + '" required />';
      html += '    </div>';

      // Amount (₹)
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Amount (₹) *</label>';
      html += '      <input type="number" step="0.01" min="0.01" class="form-control" id="exp-amount" placeholder="0.00" required />';
      html += '    </div>';

      html += '  </div>';

      html += '  <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap:12px; margin-bottom:14px;">';

      // Category
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Category Account *</label>';
      html += '      <select class="form-control form-select" id="exp-category" required>';
      html += '        <option value="" disabled selected>Select Category Account</option>';
      expenseAccounts.forEach(function (a) {
        html += '        <option value="' + a.code + '">' + a.code + ' - ' + SchoolApp.escapeHTML(a.name) + '</option>';
      });
      html += '      </select>';
      html += '    </div>';

      // Payment Mode
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Payment Mode *</label>';
      html += '      <select class="form-control form-select" id="exp-payment-mode" required onchange="SchoolApp.modules.accounts.handleModeChange(this.value)">';
      html += '        <option value="Cash" selected>Cash</option>';
      html += '        <option value="UPI">UPI</option>';
      html += '        <option value="Bank Transfer">Bank Transfer / NEFT</option>';
      html += '        <option value="Cheque">Cheque</option>';
      html += '      </select>';
      html += '    </div>';

      html += '  </div>';

      // Paid From Account
      html += '  <div class="form-group" style="margin-bottom:14px;">';
      html += '    <label class="form-label" style="font-weight:600;">Paid From Ledger Account *</label>';
      html += '    <select class="form-control form-select" id="exp-paid-from" required>';
      html += '      <option value="11100" selected>11100 - Cash in Hand</option>';
      html += '      <option value="11110">11110 - Petty Cash</option>';
      if (this.settings && Array.isArray(this.settings.bankAccounts)) {
        this.settings.bankAccounts.forEach(function (b) {
          if (b.isActive === false) return; // Hide deactivated banks from dropdown
          var safeLedgerCode = SchoolApp.escapeHTML(String(b.ledgerAccountId || '11200'));
          var safeLabel = SchoolApp.escapeHTML(String(b.label || 'Bank Account'));
          var safeBankName = SchoolApp.escapeHTML(String(b.bankName || ''));
          var safeLast4 = SchoolApp.escapeHTML(String(b.last4 || '').slice(-4));
          html += '      <option value="' + safeLedgerCode + '">' + safeLedgerCode + ' - ' + safeLabel + ' (' + safeBankName + ' ••' + safeLast4 + ')</option>';
        });
      }
      html += '    </select>';
      html += '  </div>';

      // Vendor Info
      html += '  <div class="acc-vendor-row">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Vendor / Payee Name *</label>';
      html += '      <input type="text" class="form-control" id="exp-vendor" placeholder="e.g. Shyam Book Depot" required />';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Vendor Phone</label>';
      html += '      <input type="tel" class="form-control" id="exp-vendor-phone" placeholder="10 digits" maxlength="10" pattern="\\d{10}" />';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Reference / Cheque #</label>';
      html += '      <input type="text" class="form-control" id="exp-ref-no" placeholder="UTR / Cheque #" />';
      html += '    </div>';
      html += '  </div>';

      // Description / Narration
      html += '  <div class="form-group" style="margin-bottom:16px;">';
      html += '    <label class="form-label" style="font-weight:600;">Description / Narration</label>';
      html += '    <textarea class="form-control" id="exp-desc" rows="2" placeholder="Details of goods/services purchased..."></textarea>';
      html += '  </div>';

      // Attachments Upload Area
      html += '  <div class="form-group" style="margin-bottom:20px;">';
      html += '    <label class="form-label" style="font-weight:600; display:flex; justify-content:space-between;">';
      html += '      <span>Bill / Receipt Attachments (Max 3 files)</span>';
      html += '      <span style="font-size:11.5px; color:var(--text-muted);">Images ≤ 200 KB, PDF ≤ 600 KB</span>';
      html += '    </label>';
      html += '    <input type="file" id="exp-file-input" accept="image/*,application/pdf" multiple style="display:none;" onchange="SchoolApp.modules.accounts.handleFileSelection(this.files)" />';
      html += '    <div onclick="document.getElementById(\'exp-file-input\').click()" style="border:2px dashed var(--border-color); border-radius:8px; padding:16px; text-align:center; cursor:pointer; background:var(--bg-secondary);">';
      html += '      <span class="material-icons-round" style="color:var(--accent-primary); font-size:28px;">cloud_upload</span>';
      html += '      <p style="margin:4px 0 0 0; font-size:12.5px; color:var(--text-secondary);">Click to browse receipts or bills (Photo or PDF)</p>';
      html += '    </div>';
      html += '    <div id="exp-attachments-preview" style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;"></div>';
      html += '  </div>';

      var footerHTML = '';
      footerHTML += '<button type="button" class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
      footerHTML += '<button type="submit" form="form-record-expense" class="btn btn-primary" id="btn-save-expense">';
      footerHTML += '  <span class="material-icons-round">save</span> Save Expense';
      footerHTML += '</button>';

      this.openModal('Record New Expense', html, footerHTML);
    },

    handleModeChange: function (mode) {
      var paidFromSelect = document.getElementById('exp-paid-from');
      if (!paidFromSelect) return;
      if (mode === 'Cash') {
        paidFromSelect.value = '11100';
      } else {
        // default to first bank account if available, else 11200
        if (this.settings && this.settings.bankAccounts && this.settings.bankAccounts.length > 0) {
          paidFromSelect.value = this.settings.bankAccounts[0].ledgerAccountId || '11200';
        } else {
          paidFromSelect.value = '11200';
        }
      }
    },

    handleFileSelection: async function (files) {
      if (!files || files.length === 0) return;
      var previewContainer = document.getElementById('exp-attachments-preview');

      for (var i = 0; i < files.length; i++) {
        var file = files[i];

        if (this.selectedAttachments.length >= 3) {
          SchoolApp.showToast('Maximum 3 attachments allowed per expense.', 'warning');
          break;
        }

        // Validate File Type
        var isImage = file.type.startsWith('image/');
        var isPdf = file.type === 'application/pdf';

        if (!isImage && !isPdf) {
          SchoolApp.showToast(file.name + ' rejected: Only images (JPG, PNG) and PDF are allowed.', 'error');
          continue;
        }

        // Handle PDF
        if (isPdf) {
          if (file.size > 600 * 1024) {
            SchoolApp.showToast(file.name + ' rejected: PDF size exceeds 600 KB limit (' + Math.round(file.size / 1024) + ' KB). Please compress it first.', 'error');
            continue;
          }
          this.selectedAttachments.push({
            file: file,
            name: file.name,
            size: file.size,
            type: 'application/pdf',
            previewUrl: null
          });
        }

        // Handle Image: compress client-side to <= 200 KB
        if (isImage) {
          try {
            var compressedFile = await this.compressImageTo200KB(file);
            this.selectedAttachments.push({
              file: compressedFile,
              name: file.name,
              size: compressedFile.size,
              type: 'image/jpeg',
              previewUrl: URL.createObjectURL(compressedFile)
            });
          } catch (err) {
            console.error('Image compression failed:', err);
            SchoolApp.showToast('Failed to process image ' + file.name, 'error');
          }
        }
      }

      this.renderAttachmentPreviews();
    },

    compressImageTo200KB: function (file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function (e) {
          var img = new Image();
          img.src = e.target.result;
          img.onload = function () {
            var canvas = document.createElement('canvas');
            var maxDim = 1200;
            var w = img.width;
            var h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round(h * maxDim / w);
                w = maxDim;
              } else {
                w = Math.round(w * maxDim / h);
                h = maxDim;
              }
            }
            canvas.width = w;
            canvas.height = h;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);

            // Compress to JPEG 0.75
            canvas.toBlob(function (blob) {
              if (!blob) return reject(new Error('Canvas compression failed'));
              // If still > 200 KB, re-compress with smaller dimensions
              if (blob.size > 200 * 1024) {
                canvas.width = Math.round(w * 0.75);
                canvas.height = Math.round(h * 0.75);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(function (blob2) {
                  resolve(new File([blob2 || blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.65);
              } else {
                resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
              }
            }, 'image/jpeg', 0.75);
          };
          img.onerror = reject;
        };
        reader.onerror = reject;
      });
    },

    renderAttachmentPreviews: function () {
      var container = document.getElementById('exp-attachments-preview');
      if (!container) return;
      var html = '';
      this.selectedAttachments.forEach(function (att, idx) {
        html += '<div style="display:inline-flex; align-items:center; gap:6px; background:var(--bg-primary); border:1px solid var(--border-color); padding:4px 8px; border-radius:6px; font-size:12px;">';
        if (att.previewUrl) {
          html += '<img src="' + att.previewUrl + '" style="width:24px; height:24px; border-radius:4px; object-fit:cover;" />';
        } else {
          html += '<span class="material-icons-round" style="color:var(--danger); font-size:18px;">picture_as_pdf</span>';
        }
        html += '<span style="max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + SchoolApp.escapeHTML(att.name) + ' (' + Math.round(att.size / 1024) + 'KB)</span>';
        html += '<span class="material-icons-round" style="cursor:pointer; color:var(--text-muted); font-size:16px;" onclick="SchoolApp.modules.accounts.removeAttachment(' + idx + ')">close</span>';
        html += '</div>';
      });
      container.innerHTML = html;
    },

    removeAttachment: function (index) {
      if (this.selectedAttachments[index] && this.selectedAttachments[index].previewUrl) {
        URL.revokeObjectURL(this.selectedAttachments[index].previewUrl);
      }
      this.selectedAttachments.splice(index, 1);
      this.renderAttachmentPreviews();
    },

    saveExpense: async function (e) {
      if (e) e.preventDefault();
      var btn = document.getElementById('btn-save-expense');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Saving...';
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      var date = document.getElementById('exp-date').value;
      var amountRupees = parseFloat(document.getElementById('exp-amount').value);
      var category = document.getElementById('exp-category').value;
      var paymentMode = document.getElementById('exp-payment-mode').value;
      var paidFrom = document.getElementById('exp-paid-from').value;
      var vendor = document.getElementById('exp-vendor').value.trim();
      var vendorPhone = (document.getElementById('exp-vendor-phone').value || '').trim();
      var refNo = (document.getElementById('exp-ref-no').value || '').trim();
      var desc = (document.getElementById('exp-desc').value || '').trim();

      if (!date || isNaN(amountRupees) || amountRupees <= 0 || !category || !vendor) {
        SchoolApp.showToast('Please fill all required fields with valid values.', 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">save</span> Save Expense';
        }
        return;
      }

      var amountPaise = Math.round(amountRupees * 100);
      var fy = this.getFinancialYear(date);
      var expenseId = 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      var uploadedAttachments = [];

      try {
        // 1. Upload Attachments first (if any)
        if (this.selectedAttachments.length > 0 && window.storage && window.storageSDK) {
          for (var i = 0; i < this.selectedAttachments.length; i++) {
            var att = this.selectedAttachments[i];
            var safeName = att.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            var storagePath = 'schools/' + schoolId + '/accounts/expenses/' + expenseId + '/' + safeName;
            var storageRef = window.storageSDK.ref(window.storage, storagePath);
            var snapshot = await window.storageSDK.uploadBytes(storageRef, att.file, { contentType: att.type });
            var downloadUrl = await window.storageSDK.getDownloadURL(snapshot.ref);

            uploadedAttachments.push({
              storagePath: storagePath,
              url: downloadUrl,
              fileName: att.name,
              sizeBytes: att.size,
              mimeType: att.type
            });
          }
        }

        // 2. Atomic Firestore Write with Sequential Counter via runTransaction
        var countersRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'counters');
        var expenseRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_expenses', expenseId);

        var userDesc = (SchoolApp.currentUser && (SchoolApp.currentUser.firstName + ' ' + (SchoolApp.currentUser.lastName || '')).trim()) || 'Admin';
        var nowIso = new Date().toISOString();

        var assignedExpenseNo = await fs.runTransaction(db, async function (tx) {
          var countersSnap = await tx.get(countersRef);
          var countersData = countersSnap.exists() ? countersSnap.data() : { expenseSeq: {} };
          var seqObj = Object.assign({}, countersData.expenseSeq || {});
          var nextSeq = (seqObj[fy] || 0) + 1;
          var expenseNo = 'EXP-' + fy + '-' + String(nextSeq).padStart(4, '0');

          seqObj[fy] = nextSeq;

          tx.set(countersRef, { expenseSeq: seqObj }, { merge: true });
          tx.set(expenseRef, {
            expenseNo: expenseNo,
            date: date,
            financialYear: fy,
            vendorName: vendor,
            vendorPhone: vendorPhone || null,
            categoryAccountId: category,
            amountPaise: amountPaise,
            paymentMode: paymentMode,
            paidFromAccountId: paidFrom,
            referenceNo: refNo || null,
            description: desc || null,
            attachments: uploadedAttachments,
            status: 'active',
            createdBy: userDesc,
            createdAt: nowIso
          });

          return expenseNo;
        });

        SchoolApp.closeModal();
        SchoolApp.showToast('Expense ' + assignedExpenseNo + ' recorded successfully!', 'success');
        await this.render();
      } catch (err) {
        console.error('[Accounts] Expense save error:', err);
        SchoolApp.showToast('Failed to save expense: ' + (err.message || 'Check connection'), 'error');

        // Cleanup orphaned storage files if any
        if (uploadedAttachments.length > 0 && window.storageSDK && window.storage) {
          uploadedAttachments.forEach(function (att) {
            try {
              var ref = window.storageSDK.ref(window.storage, att.storagePath);
              window.storageSDK.deleteObject(ref).catch(function () {});
            } catch (ignore) {}
          });
        }

        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">save</span> Save Expense';
        }
      }
    },

    // ── View Details Modal ───────────────────────────────────────────────────
    viewExpenseDetails: function (expenseId) {
      var exp = this.expenses.find(function (e) { return e.id === expenseId; });
      if (!exp) return;

      var isCan = exp.status === 'cancelled';
      var catAcc = this.chart.find(function (a) { return a.code === exp.categoryAccountId; });
      var catLabel = catAcc ? (catAcc.code + ' - ' + catAcc.name) : (exp.categoryAccountId || '—');

      var html = '';
      html += '<div style="padding:4px 0;">';

      // Header summary
      html += '  <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:16px;">';
      html += '    <div>';
      html += '      <span style="font-size:12px; color:var(--text-muted); font-weight:600;">VOUCHER NUMBER</span>';
      html += '      <div style="font-size:18px; font-weight:700; color:var(--text-primary);">' + SchoolApp.escapeHTML(exp.expenseNo || '—') + '</div>';
      html += '    </div>';
      html += '    <div style="text-align:right;">';
      html += '      <span style="font-size:12px; color:var(--text-muted); font-weight:600;">TOTAL AMOUNT</span>';
      html += '      <div style="font-size:20px; font-weight:800; color:' + (isCan ? 'var(--danger); text-decoration:line-through;' : 'var(--accent-primary);') + '">' + this.formatINR(exp.amountPaise) + '</div>';
      html += '    </div>';
      html += '  </div>';

      // Status indicator if cancelled
      if (isCan) {
        html += '<div class="alert alert-danger" style="margin-bottom:16px; padding:10px 14px; border-radius:6px; background:rgba(239, 68, 68, 0.08); border:1px solid var(--danger);">';
        html += '  <div style="font-weight:700; color:var(--danger); font-size:13px;">This expense was CANCELLED</div>';
        html += '  <div style="font-size:12.5px; color:var(--text-primary); margin-top:4px;"><strong>Reason:</strong> ' + SchoolApp.escapeHTML(exp.cancelReason || 'Unspecified') + '</div>';
        html += '  <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">Cancelled on ' + (exp.cancelledAt ? new Date(exp.cancelledAt).toLocaleString('en-IN') : '—') + ' by ' + SchoolApp.escapeHTML(exp.cancelledBy || 'Admin') + '</div>';
        html += '</div>';
      }

      // Metadata Grid
      html += '<div class="acc-detail-grid">';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Date</span><strong>' + (exp.date || '—') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Financial Year</span><strong>FY ' + (exp.financialYear || '—') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Vendor / Payee</span><strong>' + SchoolApp.escapeHTML(exp.vendorName || '—') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Vendor Phone</span><strong>' + SchoolApp.escapeHTML(exp.vendorPhone || '—') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Category Account</span><strong>' + SchoolApp.escapeHTML(catLabel) + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Payment Mode</span><strong>' + SchoolApp.escapeHTML(exp.paymentMode || 'Cash') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Paid From Account</span><strong>' + SchoolApp.escapeHTML(exp.paidFromAccountId || '11100') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Reference / Cheque #</span><strong>' + SchoolApp.escapeHTML(exp.referenceNo || '—') + '</strong></div>';
      html += '</div>';

      if (exp.description) {
        html += '<div style="margin-bottom:16px; font-size:13px;">';
        html += '  <span style="color:var(--text-muted); display:block; font-size:11.5px; margin-bottom:2px;">Description</span>';
        html += '  <div style="background:var(--bg-secondary); padding:8px 12px; border-radius:6px;">' + SchoolApp.escapeHTML(exp.description) + '</div>';
        html += '</div>';
      }

      // Attachments Section
      html += '<div style="margin-top:16px;">';
      html += '  <span style="color:var(--text-muted); display:block; font-size:11.5px; margin-bottom:8px; font-weight:600;">ATTACHMENTS (' + ((exp.attachments && exp.attachments.length) || 0) + ')</span>';
      if (!exp.attachments || exp.attachments.length === 0) {
        html += '  <p style="font-size:12.5px; color:var(--text-muted); margin:0;">No bill or receipt attachments uploaded.</p>';
      } else {
        html += '  <div style="display:flex; flex-direction:column; gap:8px;">';
        exp.attachments.forEach(function (att) {
          var isPdf = att.mimeType === 'application/pdf';
          html += '    <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-secondary); padding:8px 12px; border-radius:6px; border:1px solid var(--border-color);">';
          html += '      <div style="display:flex; align-items:center; gap:8px;">';
          html += '        <span class="material-icons-round" style="color:' + (isPdf ? 'var(--danger)' : 'var(--accent-primary)') + ';">' + (isPdf ? 'picture_as_pdf' : 'image') + '</span>';
          html += '        <span style="font-size:13px; font-weight:600;">' + SchoolApp.escapeHTML(att.fileName) + '</span>';
          html += '        <span style="font-size:11px; color:var(--text-muted);">(' + Math.round((att.sizeBytes || 0) / 1024) + ' KB)</span>';
          html += '      </div>';
          html += '      <a href="' + att.url + '" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="display:inline-flex; align-items:center; gap:4px; font-size:11.5px;">';
          html += '        <span class="material-icons-round" style="font-size:14px;">open_in_new</span> View';
          html += '      </a>';
          html += '    </div>';
        });
        html += '  </div>';
      }
      html += '</div>';

      html += '</div>';

      var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>';
      if (!isCan) {
        footerHTML += '<button class="btn btn-danger" style="margin-left:8px;" onclick="SchoolApp.closeModal(); setTimeout(function() { SchoolApp.modules.accounts.promptCancelExpense(\'' + exp.id + '\'); }, 150);">Cancel Expense</button>';
      }

      this.openModal('Expense Details — ' + (exp.expenseNo || ''), html, footerHTML);
    },

    // ── Prompt Cancel Expense Modal ──────────────────────────────────────────
    promptCancelExpense: function (expenseId) {
      var exp = this.expenses.find(function (e) { return e.id === expenseId; });
      if (!exp) return;

      var html = '';
      html += '<div style="padding:6px 0;">';
      html += '  <p style="font-size:14px; color:var(--text-primary); margin-bottom:12px;">';
      html += '    Are you sure you want to cancel expense <strong>' + SchoolApp.escapeHTML(exp.expenseNo || '') + '</strong> for <strong>' + this.formatINR(exp.amountPaise) + '</strong> (' + SchoolApp.escapeHTML(exp.vendorName || '') + ')?';
      html += '  </p>';
      html += '  <div class="form-group">';
      html += '    <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Reason for Cancellation *</label>';
      html += '    <textarea class="form-control" id="cancel-reason-input" rows="3" placeholder="Explain why this expense is being cancelled (required)..." required></textarea>';
      html += '  </div>';
      html += '  <small class="form-text text-muted" style="font-size:12px; display:block; margin-top:6px;">This action cannot be undone. To correct an expense, cancel it with a reason and create a new one.</small>';
      html += '</div>';

      var footerHTML = '';
      footerHTML += '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Keep Expense</button>';
      footerHTML += '<button class="btn btn-danger" id="btn-confirm-cancel" style="margin-left:8px;" onclick="SchoolApp.modules.accounts.executeCancelExpense(\'' + expenseId + '\')">';
      footerHTML += '  <span class="material-icons-round">block</span> Confirm Cancellation';
      footerHTML += '</button>';

      this.openModal('Cancel Expense', html, footerHTML);
    },

    executeCancelExpense: async function (expenseId) {
      var reasonInput = document.getElementById('cancel-reason-input');
      var reason = reasonInput ? reasonInput.value.trim() : '';

      if (!reason) {
        SchoolApp.showToast('Please enter a cancellation reason.', 'error');
        return;
      }

      var btn = document.getElementById('btn-confirm-cancel');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Cancelling...';
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;
      var userDesc = (SchoolApp.currentUser && (SchoolApp.currentUser.firstName + ' ' + (SchoolApp.currentUser.lastName || '')).trim()) || 'Admin';

      try {
        var expenseRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_expenses', expenseId);

        // Targeted updateDoc matching firestore.rules cancel transition rule
        await fs.updateDoc(expenseRef, {
          status: 'cancelled',
          cancelReason: reason,
          cancelledAt: new Date().toISOString(),
          cancelledBy: userDesc
        });

        SchoolApp.closeModal();
        SchoolApp.showToast('Expense cancelled successfully.', 'success');
        await this.render();
      } catch (err) {
        console.error('[Accounts] Cancellation error:', err);
        SchoolApp.showToast('Failed to cancel expense: ' + (err.message || 'Permission denied'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = 'Confirm Cancellation';
        }
      }
    },

    // ── Export Filtered Expenses to CSV ──────────────────────────────────────
    exportExpensesCSV: function () {
      var filtered = this.getFilteredExpenses();
      if (filtered.length === 0) {
        SchoolApp.showToast('No expenses to export.', 'warning');
        return;
      }

      var headers = [
        'Voucher Number',
        'Date',
        'Financial Year',
        'Vendor Name',
        'Vendor Phone',
        'Category Code',
        'Category Name',
        'Payment Mode',
        'Paid From Account',
        'Amount (INR)',
        'Status',
        'Reference No',
        'Description',
        'Attachments Count',
        'Cancel Reason',
        'Created By'
      ];

      var csvRows = [headers.join(',')];

      filtered.forEach(function (e) {
        var catAcc = this.chart.find(function (a) { return a.code === e.categoryAccountId; });
        var catName = catAcc ? catAcc.name : '';
        var amountRupees = ((e.amountPaise || 0) / 100).toFixed(2);

        var escapeCSV = function (str) {
          if (str === null || str === undefined) return '""';
          var s = String(str).replace(/"/g, '""');
          return '"' + s + '"';
        };

        var row = [
          escapeCSV(e.expenseNo),
          escapeCSV(e.date),
          escapeCSV(e.financialYear),
          escapeCSV(e.vendorName),
          escapeCSV(e.vendorPhone || ''),
          escapeCSV(e.categoryAccountId),
          escapeCSV(catName),
          escapeCSV(e.paymentMode),
          escapeCSV(e.paidFromAccountId),
          amountRupees, // plain decimal number
          escapeCSV(e.status || 'active'),
          escapeCSV(e.referenceNo || ''),
          escapeCSV(e.description || ''),
          (e.attachments && e.attachments.length) || 0,
          escapeCSV(e.cancelReason || ''),
          escapeCSV(e.createdBy || '')
        ];
        csvRows.push(row.join(','));
      }.bind(this));

      var csvContent = csvRows.join('\r\n');
      var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      var link = document.createElement('a');
      var url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'Expenses_' + this.getSchoolId() + '_' + new Date().toISOString().split('T')[0] + '.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },


    // ── Tab 4: Transfers (Contra) ───────────────────────────────────────────
    getFilteredTransfers: function () {
      var search = (this.transferFilters.search || '').toLowerCase();
      var range = this.transferFilters.dateRange;
      var now = new Date();
      var todayStr = now.toISOString().split('T')[0];
      var monthStr = todayStr.slice(0, 7);

      return this.transfers.filter(function (t) {
        if (range === 'today' && t.date !== todayStr) return false;
        if (range === 'this_month' && (!t.date || !t.date.startsWith(monthStr))) return false;

        if (search) {
          var matchNo = (t.transferNo || '').toLowerCase().indexOf(search) >= 0;
          var matchRef = (t.referenceNo || '').toLowerCase().indexOf(search) >= 0;
          var matchDesc = (t.description || '').toLowerCase().indexOf(search) >= 0;
          if (!matchNo && !matchRef && !matchDesc) return false;
        }
        return true;
      });
    },

    renderTransfersHTML: function () {
      var filtered = this.getFilteredTransfers();
      var html = '';

      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">';
      html += '  <div>';
      html += '    <h3 style="font-size:16px; font-weight:700; color:var(--text-primary); margin:0;">Contra Fund Transfers</h3>';
      html += '    <p style="font-size:12.5px; color:var(--text-secondary); margin:2px 0 0 0;">Internal fund movements between Cash in Hand, Petty Cash, and Bank Accounts (Contra Vouchers)</p>';
      html += '  </div>';
      html += '  <div style="display:flex; gap:10px; align-items:center;">';
      html += '    <button class="btn btn-secondary" onclick="SchoolApp.modules.accounts.exportTransfersCSV()">';
      html += '      <span class="material-icons-round">download</span> Export CSV';
      html += '    </button>';
      html += '    <button class="btn btn-primary" onclick="SchoolApp.modules.accounts.openAddTransferModal()">';
      html += '      <span class="material-icons-round">add</span> New Transfer';
      html += '    </button>';
      html += '  </div>';
      html += '</div>';

      // Filters
      html += '<div class="card" style="padding:14px 16px; border-radius:10px; margin-bottom:16px;">';
      html += '  <div style="display:grid; grid-template-columns:2fr 1fr; gap:12px;">';
      html += '    <input type="text" class="form-control" placeholder="Search transfer #, ref, description..." value="' + SchoolApp.escapeHTML(this.transferFilters.search) + '" oninput="SchoolApp.modules.accounts.transferFilters.search = this.value; SchoolApp.modules.accounts.renderCurrentTab();" />';
      html += '    <select class="form-control form-select" onchange="SchoolApp.modules.accounts.transferFilters.dateRange = this.value; SchoolApp.modules.accounts.renderCurrentTab();">';
      html += '      <option value="all" ' + (this.transferFilters.dateRange === 'all' ? 'selected' : '') + '>All Dates</option>';
      html += '      <option value="today" ' + (this.transferFilters.dateRange === 'today' ? 'selected' : '') + '>Today</option>';
      html += '      <option value="this_month" ' + (this.transferFilters.dateRange === 'this_month' ? 'selected' : '') + '>This Month</option>';
      html += '    </select>';
      html += '  </div>';
      html += '</div>';

      if (filtered.length === 0) {
        html += '<div class="card" style="padding:48px; text-align:center; color:var(--text-secondary); border-radius:10px;">';
        html += '  <span class="material-icons-round" style="font-size:40px; color:var(--text-muted); margin-bottom:8px;">swap_horiz</span>';
        html += '  <p style="font-weight:600; margin:0;">No fund transfers recorded</p>';
        html += '  <p style="font-size:12px; margin:4px 0 16px 0;">Transfer funds from Cash in Hand to Bank, or withdraw for Petty Cash.</p>';
        html += '  <button class="btn btn-primary btn-sm" onclick="SchoolApp.modules.accounts.openAddTransferModal()">Record First Transfer</button>';
        html += '</div>';
      } else {
        html += '<div class="card" style="padding:0; border-radius:10px; overflow:hidden;">';
        html += '  <div class="table-responsive acc-table-container">';
        html += '    <table class="table acc-table" style="width:100%; margin:0; border-collapse:collapse; font-size:13px;">';
        html += '      <thead>';
        html += '        <tr style="text-align:left; color:var(--text-secondary); border-bottom:1px solid var(--border-color); font-size:11.5px;">';
        html += '          <th style="padding:10px 14px;">TRANSFER #</th>';
        html += '          <th style="padding:10px 14px;">DATE</th>';
        html += '          <th style="padding:10px 14px;">FROM ACCOUNT</th>';
        html += '          <th style="padding:10px 14px;">TO ACCOUNT</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">AMOUNT</th>';
        html += '          <th style="padding:10px 14px;">REFERENCE</th>';
        html += '          <th style="padding:10px 14px; text-align:center;">STATUS</th>';
        html += '          <th style="padding:10px 14px; text-align:center;">ACTIONS</th>';
        html += '        </tr>';
        html += '      </thead>';
        html += '      <tbody>';

        filtered.forEach(function (t) {
          var isCan = (t.status === 'cancelled');
          var fromAcc = this.chart.find(function (a) { return a.code === t.fromAccountId; });
          var toAcc = this.chart.find(function (a) { return a.code === t.toAccountId; });
          var fromLabel = fromAcc ? fromAcc.name : t.fromAccountId;
          var toLabel = toAcc ? toAcc.name : t.toAccountId;

          html += '        <tr style="border-bottom:1px solid var(--border-color);' + (isCan ? ' opacity:0.6;' : '') + '">';
          html += '          <td style="padding:10px 14px; font-weight:700;">' + SchoolApp.escapeHTML(t.transferNo || t.id) + '</td>';
          html += '          <td style="padding:10px 14px; color:var(--text-secondary);">' + (t.date || '—') + '</td>';
          html += '          <td style="padding:10px 14px;"><code>' + t.fromAccountId + '</code> ' + SchoolApp.escapeHTML(fromLabel) + '</td>';
          html += '          <td style="padding:10px 14px;"><code>' + t.toAccountId + '</code> ' + SchoolApp.escapeHTML(toLabel) + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; font-weight:700; color:' + (isCan ? 'var(--text-muted); text-decoration:line-through;' : 'var(--text-primary);') + '">';
          html += '            ' + this.formatINR(t.amountPaise);
          html += '          </td>';
          html += '          <td style="padding:10px 14px; color:var(--text-secondary);">' + SchoolApp.escapeHTML(t.referenceNo || '—') + '</td>';
          html += '          <td style="padding:10px 14px; text-align:center;">';
          if (isCan) {
            html += '            <span class="badge badge-danger" style="font-size:10.5px;">Cancelled</span>';
          } else {
            html += '            <span class="badge badge-success" style="font-size:10.5px;">Active</span>';
          }
          html += '          </td>';
          html += '          <td style="padding:10px 14px; text-align:center;">';
          html += '            <div style="display:inline-flex; gap:6px;">';
          html += '              <button class="btn btn-secondary btn-sm" style="font-size:11px; padding:3px 8px;" onclick="SchoolApp.modules.accounts.viewTransferDetails(\'' + t.id + '\')">View</button>';
          if (!isCan) {
            html += '              <button class="btn btn-danger btn-sm" style="font-size:11px; padding:3px 8px;" onclick="SchoolApp.modules.accounts.promptCancelTransfer(\'' + t.id + '\')">Cancel</button>';
          }
          html += '            </div>';
          html += '          </td>';
          html += '        </tr>';
        }.bind(this));

        html += '      </tbody>';
        html += '    </table>';
        html += '  </div>';
        html += '</div>';
      }

      return html;
    },

    openAddTransferModal: function () {
      var today = new Date().toISOString().split('T')[0];
      var bankAccounts = (this.settings && this.settings.bankAccounts) || [];

      var options = [
        { code: '11100', label: '11100 - Cash in Hand (Main School Cash)' },
        { code: '11110', label: '11110 - Petty Cash' }
      ];

      bankAccounts.forEach(function (b) {
        if (b.isActive !== false) {
          options.push({
            code: b.ledgerAccountId || '11200',
            label: (b.ledgerAccountId || '11200') + ' - ' + (b.label || b.bankName) + ' (**' + (b.last4 || '') + ')'
          });
        }
      });

      var html = '';
      html += '<form id="form-add-transfer" onsubmit="SchoolApp.modules.accounts.saveTransfer(event)">';

      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Transfer Date *</label>';
      html += '      <input type="date" class="form-control" id="trf-date" value="' + today + '" required />';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Amount (INR ₹) *</label>';
      html += '      <input type="number" step="0.01" min="1" class="form-control" id="trf-amount" placeholder="0.00" required />';
      html += '    </div>';
      html += '  </div>';

      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">From Account (Credit / Source) *</label>';
      html += '      <select class="form-control form-select" id="trf-from" required>';
      options.forEach(function (opt) {
        html += '        <option value="' + opt.code + '">' + SchoolApp.escapeHTML(opt.label) + '</option>';
      });
      html += '      </select>';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">To Account (Debit / Destination) *</label>';
      html += '      <select class="form-control form-select" id="trf-to" required>';
      options.forEach(function (opt, idx) {
        var sel = (idx === 1 || idx === options.length - 1) ? 'selected' : '';
        html += '        <option value="' + opt.code + '" ' + sel + '>' + SchoolApp.escapeHTML(opt.label) + '</option>';
      });
      html += '      </select>';
      html += '    </div>';
      html += '  </div>';

      html += '  <div class="form-group" style="margin-bottom:14px;">';
      html += '    <label class="form-label" style="font-weight:600;">Reference / Cheque / UTR #</label>';
      html += '    <input type="text" class="form-control" id="trf-ref-no" placeholder="e.g. Deposit slip # or Cheque #" />';
      html += '  </div>';

      html += '  <div class="form-group" style="margin-bottom:16px;">';
      html += '    <label class="form-label" style="font-weight:600;">Narration / Description</label>';
      html += '    <textarea class="form-control" id="trf-desc" rows="2" placeholder="e.g. Cash collected from fees deposited into SBI bank account"></textarea>';
      html += '  </div>';

      html += '</form>';

      var footerHTML = '';
      footerHTML += '<button type="button" class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
      footerHTML += '<button type="submit" form="form-add-transfer" class="btn btn-primary" id="btn-save-transfer">';
      footerHTML += '  <span class="material-icons-round">swap_horiz</span> Save Transfer';
      footerHTML += '</button>';

      this.openModal('Record Contra Fund Transfer', html, footerHTML);
    },

    saveTransfer: async function (e) {
      if (e) e.preventDefault();
      var from = document.getElementById('trf-from').value;
      var to = document.getElementById('trf-to').value;

      if (from === to) {
        SchoolApp.showToast('Source and Destination accounts must be different.', 'error');
        return;
      }

      var date = document.getElementById('trf-date').value;
      var amountRupees = parseFloat(document.getElementById('trf-amount').value);
      var refNo = (document.getElementById('trf-ref-no').value || '').trim();
      var desc = (document.getElementById('trf-desc').value || '').trim();

      if (!date || isNaN(amountRupees) || amountRupees <= 0) {
        SchoolApp.showToast('Please enter a valid transfer amount.', 'error');
        return;
      }

      var btn = document.getElementById('btn-save-transfer');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Saving...';
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      var amountPaise = Math.round(amountRupees * 100);
      var fy = this.getFinancialYear(date);
      var transferId = 'trf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

      try {
        var countersRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'counters');
        var transferRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_transfers', transferId);

        var userDesc = (SchoolApp.currentUser && (SchoolApp.currentUser.firstName + ' ' + (SchoolApp.currentUser.lastName || '')).trim()) || 'Admin';
        var nowIso = new Date().toISOString();

        var assignedNo = await fs.runTransaction(db, async function (tx) {
          var countersSnap = await tx.get(countersRef);
          var countersData = countersSnap.exists() ? countersSnap.data() : { transferSeq: {} };
          var seqObj = Object.assign({}, countersData.transferSeq || {});
          var nextSeq = (seqObj[fy] || 0) + 1;
          var transferNo = 'TRF-' + fy + '-' + String(nextSeq).padStart(4, '0');

          seqObj[fy] = nextSeq;

          tx.set(countersRef, { transferSeq: seqObj }, { merge: true });
          tx.set(transferRef, {
            transferNo: transferNo,
            date: date,
            financialYear: fy,
            fromAccountId: from,
            toAccountId: to,
            amountPaise: amountPaise,
            referenceNo: refNo || null,
            description: desc || null,
            status: 'active',
            createdBy: userDesc,
            createdAt: nowIso
          });

          return transferNo;
        });

        SchoolApp.closeModal();
        SchoolApp.showToast('Transfer ' + assignedNo + ' recorded successfully!', 'success');
        await this.render();
      } catch (err) {
        console.error('Transfer save error:', err);
        SchoolApp.showToast('Failed to save transfer: ' + (err.message || 'Check connection'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">swap_horiz</span> Save Transfer';
        }
      }
    },

    viewTransferDetails: function (transferId) {
      var t = this.transfers.find(function (trf) { return trf.id === transferId; });
      if (!t) return;

      var isCan = (t.status === 'cancelled');
      var fromAcc = this.chart.find(function (a) { return a.code === t.fromAccountId; });
      var toAcc = this.chart.find(function (a) { return a.code === t.toAccountId; });

      var html = '';
      html += '<div style="padding:4px 0;">';
      html += '  <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:16px;">';
      html += '    <div>';
      html += '      <span style="font-size:12px; color:var(--text-muted); font-weight:600;">CONTRA VOUCHER NUMBER</span>';
      html += '      <div style="font-size:18px; font-weight:700; color:var(--text-primary);">' + SchoolApp.escapeHTML(t.transferNo || '—') + '</div>';
      html += '    </div>';
      html += '    <div style="text-align:right;">';
      html += '      <span style="font-size:12px; color:var(--text-muted); font-weight:600;">TRANSFER AMOUNT</span>';
      html += '      <div style="font-size:20px; font-weight:800; color:' + (isCan ? 'var(--danger); text-decoration:line-through;' : 'var(--text-primary);') + '">' + this.formatINR(t.amountPaise) + '</div>';
      html += '    </div>';
      html += '  </div>';

      if (isCan) {
        html += '<div class="alert alert-danger" style="margin-bottom:16px; padding:10px 14px; border-radius:6px; background:rgba(239, 68, 68, 0.08); border:1px solid var(--danger);">';
        html += '  <div style="font-weight:700; color:var(--danger); font-size:13px;">This transfer was CANCELLED</div>';
        html += '  <div style="font-size:12.5px; color:var(--text-primary); margin-top:4px;"><strong>Reason:</strong> ' + SchoolApp.escapeHTML(t.cancelReason || 'Unspecified') + '</div>';
        html += '  <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">Cancelled on ' + (t.cancelledAt ? new Date(t.cancelledAt).toLocaleString('en-IN') : '—') + ' by ' + SchoolApp.escapeHTML(t.cancelledBy || 'Admin') + '</div>';
        html += '</div>';
      }

      html += '<div class="acc-detail-grid">';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Date</span><strong>' + (t.date || '—') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Financial Year</span><strong>FY ' + (t.financialYear || '—') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">From Account (Credit)</span><strong><code>' + t.fromAccountId + '</code> ' + SchoolApp.escapeHTML(fromAcc ? fromAcc.name : '') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">To Account (Debit)</span><strong><code>' + t.toAccountId + '</code> ' + SchoolApp.escapeHTML(toAcc ? toAcc.name : '') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Reference No</span><strong>' + SchoolApp.escapeHTML(t.referenceNo || '—') + '</strong></div>';
      html += '  <div><span style="color:var(--text-muted); display:block; font-size:11.5px;">Recorded By</span><strong>' + SchoolApp.escapeHTML(t.createdBy || 'Admin') + '</strong></div>';
      html += '</div>';

      if (t.description) {
        html += '<div style="margin-top:12px;">';
        html += '  <span style="color:var(--text-muted); display:block; font-size:11.5px; margin-bottom:2px;">Description</span>';
        html += '  <div style="background:var(--bg-secondary); padding:8px 12px; border-radius:6px; font-size:13px;">' + SchoolApp.escapeHTML(t.description) + '</div>';
        html += '</div>';
      }
      html += '</div>';

      var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>';
      if (!isCan) {
        footerHTML += '<button class="btn btn-danger" style="margin-left:8px;" onclick="SchoolApp.closeModal(); setTimeout(function() { SchoolApp.modules.accounts.promptCancelTransfer(\'' + t.id + '\'); }, 150);">Cancel Transfer</button>';
      }

      this.openModal('Transfer Details — ' + (t.transferNo || ''), html, footerHTML);
    },

    promptCancelTransfer: function (transferId) {
      var t = this.transfers.find(function (trf) { return trf.id === transferId; });
      if (!t) return;

      var html = '';
      html += '<div style="padding:6px 0;">';
      html += '  <p style="font-size:14px; color:var(--text-primary); margin-bottom:12px;">';
      html += '    Are you sure you want to cancel contra transfer <strong>' + SchoolApp.escapeHTML(t.transferNo || '') + '</strong> for <strong>' + this.formatINR(t.amountPaise) + '</strong>?';
      html += '  </p>';
      html += '  <div class="form-group">';
      html += '    <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Reason for Cancellation *</label>';
      html += '    <textarea class="form-control" id="cancel-transfer-reason" rows="3" placeholder="Explain why this transfer is being cancelled..." required></textarea>';
      html += '  </div>';
      html += '  <small class="form-text text-muted" style="font-size:12px; display:block; margin-top:6px;">This action cannot be undone. Reversal contra voucher will be posted in the ledger.</small>';
      html += '</div>';

      var footerHTML = '';
      footerHTML += '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Keep Transfer</button>';
      footerHTML += '<button class="btn btn-danger" id="btn-confirm-cancel-trf" style="margin-left:8px;" onclick="SchoolApp.modules.accounts.executeCancelTransfer(\'' + transferId + '\')">';
      footerHTML += '  <span class="material-icons-round">block</span> Confirm Cancellation';
      footerHTML += '</button>';

      this.openModal('Cancel Contra Fund Transfer', html, footerHTML);
    },

    executeCancelTransfer: async function (transferId) {
      var reasonInput = document.getElementById('cancel-transfer-reason');
      var reason = reasonInput ? reasonInput.value.trim() : '';
      if (!reason) {
        SchoolApp.showToast('Please provide a cancellation reason.', 'error');
        return;
      }

      var btn = document.getElementById('btn-confirm-cancel-trf');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Cancelling...';
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;
      var userDesc = (SchoolApp.currentUser && (SchoolApp.currentUser.firstName + ' ' + (SchoolApp.currentUser.lastName || '')).trim()) || 'Admin';

      try {
        var trfRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_transfers', transferId);
        await fs.updateDoc(trfRef, {
          status: 'cancelled',
          cancelReason: reason,
          cancelledAt: new Date().toISOString(),
          cancelledBy: userDesc
        });

        SchoolApp.closeModal();
        SchoolApp.showToast('Transfer cancelled successfully.', 'success');
        await this.render();
      } catch (err) {
        console.error('Transfer cancel error:', err);
        SchoolApp.showToast('Failed to cancel transfer: ' + (err.message || 'Permission denied'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = 'Confirm Cancellation';
        }
      }
    },

    exportTransfersCSV: function () {
      var filtered = this.getFilteredTransfers();
      if (filtered.length === 0) {
        SchoolApp.showToast('No transfers to export.', 'warning');
        return;
      }

      var headers = ['Transfer No', 'Date', 'FY', 'From Account', 'To Account', 'Amount (INR)', 'Ref No', 'Status', 'Description', 'Cancel Reason'];
      var csvRows = [headers.join(',')];

      var escapeCSV = function (str) {
        if (str === null || str === undefined) return '""';
        return '"' + String(str).replace(/"/g, '""') + '"';
      };

      filtered.forEach(function (t) {
        var amt = ((t.amountPaise || 0) / 100).toFixed(2);
        csvRows.push([
          escapeCSV(t.transferNo),
          escapeCSV(t.date),
          escapeCSV(t.financialYear),
          escapeCSV(t.fromAccountId),
          escapeCSV(t.toAccountId),
          amt,
          escapeCSV(t.referenceNo || ''),
          escapeCSV(t.status || 'active'),
          escapeCSV(t.description || ''),
          escapeCSV(t.cancelReason || '')
        ].join(','));
      });

      var blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'Transfers_' + this.getSchoolId() + '_' + new Date().toISOString().split('T')[0] + '.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },


    // ── Tab 5: Reports ──────────────────────────────────────────────────────
    renderReportsHTML: function () {
      var currentFY = this.getFinancialYear();
      var now = new Date();
      var y = now.getFullYear();
      var m = now.getMonth();
      var lastDay = new Date(y, m + 1, 0).getDate();
      var monthStart = now.toISOString().slice(0, 7) + '-01';
      var monthEnd = now.toISOString().slice(0, 7) + '-' + (lastDay < 10 ? '0' : '') + lastDay;

      if (!this.reportParams.startDate) this.reportParams.startDate = monthStart;
      if (!this.reportParams.endDate) this.reportParams.endDate = monthEnd;
      if (!this.reportParams.fy) this.reportParams.fy = currentFY;

      var html = '';
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">';
      html += '  <div>';
      html += '    <h3 style="font-size:16px; font-weight:700; color:var(--text-primary); margin:0;">Financial Reports & Statutory Books</h3>';
      html += '    <p style="font-size:12.5px; color:var(--text-secondary); margin:2px 0 0 0;">Derived from the double-entry general ledger. Verified on cash basis.</p>';
      html += '  </div>';
      html += '  <div style="display:flex; gap:10px; align-items:center;">';
      html += '    <button class="btn btn-secondary" onclick="SchoolApp.modules.accounts.exportReportCSV()">';
      html += '      <span class="material-icons-round">download</span> Export Report CSV';
      html += '    </button>';
      html += '  </div>';
      html += '</div>';

      // Report Navigation Pills
      var reportsList = [
        { id: 'daybook', label: 'Day Book', icon: 'menu_book' },
        { id: 'cashbook', label: 'Cash / Bank Book', icon: 'account_balance_wallet' },
        { id: 'trialbalance', label: 'Trial Balance', icon: 'scale' },
        { id: 'income_expenditure', label: (this.settings && this.settings.entityType === 'company') ? 'Profit & Loss' : 'Income & Expenditure', icon: 'bar_chart' }
      ];

      html += '<div class="acc-report-nav">';
      reportsList.forEach(function (r) {
        var isAct = (this.reportType === r.id);
        html += '<button class="btn ' + (isAct ? 'btn-primary' : 'btn-secondary') + ' btn-sm" onclick="SchoolApp.modules.accounts.switchReportType(\'' + r.id + '\')" style="display:inline-flex; align-items:center; gap:6px; font-size:12.5px; padding:6px 14px;">';
        html += '  <span class="material-icons-round" style="font-size:16px;">' + r.icon + '</span> ' + r.label;
        html += '</button>';
      }.bind(this));
      html += '</div>';

      // Report Specific Content
      if (this.reportType === 'daybook') {
        html += this.renderDayBookHTML();
      } else if (this.reportType === 'cashbook') {
        html += this.renderCashBookHTML();
      } else if (this.reportType === 'trialbalance') {
        html += this.renderTrialBalanceHTML();
      } else if (this.reportType === 'income_expenditure') {
        html += this.renderIncomeExpenditureHTML();
      }

      // Mandatory CA Disclaimer line on EVERY report view
      html += '<div class="acc-ca-disclaimer">';
      html += '  <div style="display:flex; align-items:center; gap:8px;">';
      html += '    <span class="material-icons-round" style="font-size:18px; color:var(--accent-primary);">info</span>';
      html += '    <span><strong>Statutory Notice:</strong> Internal management report, not a statutory audit; verify with your CA.</span>';
      html += '  </div>';
      html += '</div>';

      return html;
    },

    switchReportType: function (type) {
      this.reportType = type;
      this.renderCurrentTab();
    },

    // ── 1. Day Book Report ───────────────────────────────────────────────────
    renderDayBookHTML: function () {
      var html = '';
      html += '<div class="card" style="padding:16px; border-radius:10px; margin-bottom:16px;">';
      html += '  <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">';
      html += '    <div class="form-group" style="margin:0;">';
      html += '      <label class="form-label" style="font-size:11.5px; font-weight:600; margin-bottom:4px; display:block;">Start Date</label>';
      html += '      <input type="date" class="form-control" id="rep-start-date" value="' + this.reportParams.startDate + '" onchange="SchoolApp.modules.accounts.reportParams.startDate = this.value; SchoolApp.modules.accounts.renderCurrentTab();" />';
      html += '    </div>';
      html += '    <div class="form-group" style="margin:0;">';
      html += '      <label class="form-label" style="font-size:11.5px; font-weight:600; margin-bottom:4px; display:block;">End Date</label>';
      html += '      <input type="date" class="form-control" id="rep-end-date" value="' + this.reportParams.endDate + '" onchange="SchoolApp.modules.accounts.reportParams.endDate = this.value; SchoolApp.modules.accounts.renderCurrentTab();" />';
      html += '    </div>';
      html += '    <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.renderCurrentTab()" style="padding:8px 12px;">';
      html += '      <span class="material-icons-round" style="font-size:16px;">refresh</span> Load Journal';
      html += '    </button>';
      html += '  </div>';
      html += '</div>';

      // Synthesize entries for date range from source records
      var startDate = this.reportParams.startDate;
      var endDate = this.reportParams.endDate;

      var vouchers = [];

      // Fee payments in range
      var feesList = (SchoolApp.store && Array.isArray(SchoolApp.store.fees)) ? SchoolApp.store.fees : [];
      feesList.forEach(function (f) {
        if (f.type !== 'payment') return;
        if (!f.date || f.date < startDate || f.date > endDate) return;
        var amt = Math.round(Number(f.amount || 0) * 100);
        var disc = Math.round(Number(f.discount || 0) * 100);
        var gross = amt + disc;
        var mode = (f.mode || 'Cash').toLowerCase();
        var assetAcc = (mode === 'cash') ? '11100' : '11200';

        var lines = [];
        if (!f.isReversal) {
          if (amt > 0) lines.push({ code: assetAcc, dr: amt, cr: 0 });
          if (disc > 0) lines.push({ code: '55100', dr: disc, cr: 0 });
          lines.push({ code: '41100', dr: 0, cr: gross });
        } else {
          var absAmt = Math.abs(amt);
          lines.push({ code: '41100', dr: absAmt, cr: 0 });
          lines.push({ code: assetAcc, dr: 0, cr: absAmt });
        }

        vouchers.push({
          date: f.date,
          no: 'VCH-FEE-' + f.id,
          type: f.isReversal ? 'reversal' : 'receipt',
          narration: 'Fee payment student ' + (f.studentId || '') + ' (' + (f.mode || 'Cash') + ')',
          lines: lines
        });
      });

      // Expenses in range
      this.expenses.forEach(function (e) {
        if (!e.date || e.date < startDate || e.date > endDate) return;
        vouchers.push({
          date: e.date,
          no: e.expenseNo || e.id,
          type: 'payment',
          narration: 'Expense: ' + (e.vendorName || '') + ' - ' + (e.description || ''),
          lines: [
            { code: e.categoryAccountId, dr: e.amountPaise, cr: 0 },
            { code: e.paidFromAccountId || '11100', dr: 0, cr: e.amountPaise }
          ]
        });
        if (e.status === 'cancelled' && e.cancelledAt) {
          var cDate = e.cancelledAt.split('T')[0];
          if (cDate >= startDate && cDate <= endDate) {
            vouchers.push({
              date: cDate,
              no: 'CX-' + (e.expenseNo || e.id),
              type: 'journal',
              narration: 'Reversal: ' + (e.cancelReason || 'Cancelled'),
              lines: [
                { code: e.paidFromAccountId || '11100', dr: e.amountPaise, cr: 0 },
                { code: e.categoryAccountId, dr: 0, cr: e.amountPaise }
              ]
            });
          }
        }
      });

      // Receipts in range
      this.receipts.forEach(function (r) {
        if (!r.date || r.date < startDate || r.date > endDate) return;
        vouchers.push({
          date: r.date,
          no: r.receiptNo || r.id,
          type: 'receipt',
          narration: 'Other Income: ' + (r.payerName || '') + ' - ' + (r.description || ''),
          lines: [
            { code: r.receivedInAccountId || '11100', dr: r.amountPaise, cr: 0 },
            { code: r.categoryAccountId, dr: 0, cr: r.amountPaise }
          ]
        });
        if (r.status === 'cancelled' && r.cancelledAt) {
          var cDate = r.cancelledAt.split('T')[0];
          if (cDate >= startDate && cDate <= endDate) {
            vouchers.push({
              date: cDate,
              no: 'CX-' + (r.receiptNo || r.id),
              type: 'journal',
              narration: 'Reversal: ' + (r.cancelReason || 'Cancelled'),
              lines: [
                { code: r.categoryAccountId, dr: r.amountPaise, cr: 0 },
                { code: r.receivedInAccountId || '11100', dr: 0, cr: r.amountPaise }
              ]
            });
          }
        }
      });

      // Transfers in range
      this.transfers.forEach(function (t) {
        if (!t.date || t.date < startDate || t.date > endDate) return;
        vouchers.push({
          date: t.date,
          no: t.transferNo || t.id,
          type: 'contra',
          narration: 'Contra: From ' + t.fromAccountId + ' to ' + t.toAccountId + ' (' + (t.description || '') + ')',
          lines: [
            { code: t.toAccountId, dr: t.amountPaise, cr: 0 },
            { code: t.fromAccountId, dr: 0, cr: t.amountPaise }
          ]
        });
        if (t.status === 'cancelled' && t.cancelledAt) {
          var cDate = t.cancelledAt.split('T')[0];
          if (cDate >= startDate && cDate <= endDate) {
            vouchers.push({
              date: cDate,
              no: 'CX-' + (t.transferNo || t.id),
              type: 'contra',
              narration: 'Reversal of Transfer: ' + (t.cancelReason || 'Cancelled'),
              lines: [
                { code: t.fromAccountId, dr: t.amountPaise, cr: 0 },
                { code: t.toAccountId, dr: 0, cr: t.amountPaise }
              ]
            });
          }
        }
      });

      vouchers.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });

      var grandDr = 0;
      var grandCr = 0;

      html += '<div class="card" style="padding:0; border-radius:10px; overflow:hidden;">';
      html += '  <div class="table-responsive acc-table-container">';
      html += '    <table class="table acc-table" style="width:100%; border-collapse:collapse; font-size:12.5px;">';
      html += '      <thead>';
      html += '        <tr style="text-align:left; color:var(--text-secondary); border-bottom:1px solid var(--border-color); font-size:11.5px;">';
      html += '          <th style="padding:10px 14px;">DATE</th>';
      html += '          <th style="padding:10px 14px;">VOUCHER #</th>';
      html += '          <th style="padding:10px 14px;">TYPE</th>';
      html += '          <th style="padding:10px 14px;">ACCOUNT PARTICULARS & NARRATION</th>';
      html += '          <th style="padding:10px 14px; text-align:right;">DEBIT (DR)</th>';
      html += '          <th style="padding:10px 14px; text-align:right;">CREDIT (CR)</th>';
      html += '        </tr>';
      html += '      </thead>';
      html += '      <tbody>';

      if (vouchers.length === 0) {
        html += '        <tr><td colspan="6" style="padding:32px; text-align:center; color:var(--text-muted);">No journal vouchers found for the selected date range.</td></tr>';
      } else {
        vouchers.forEach(function (v) {
          v.lines.forEach(function (l, lIdx) {
            grandDr += (l.dr || 0);
            grandCr += (l.cr || 0);
            var acc = this.chart.find(function (a) { return a.code === l.code; });
            var accName = acc ? acc.name : l.code;

            html += '        <tr style="border-bottom:1px solid var(--border-color);' + (lIdx === 0 ? ' background:rgba(0,0,0,0.01);' : '') + '">';
            html += '          <td style="padding:8px 14px; color:var(--text-secondary);">' + (lIdx === 0 ? v.date : '') + '</td>';
            html += '          <td style="padding:8px 14px; font-weight:600;">' + (lIdx === 0 ? SchoolApp.escapeHTML(v.no) : '') + '</td>';
            html += '          <td style="padding:8px 14px;">' + (lIdx === 0 ? '<span class="badge badge-secondary" style="font-size:10px; text-transform:uppercase;">' + v.type + '</span>' : '') + '</td>';
            html += '          <td style="padding:8px 14px;">';
            html += '            <span style="' + (l.cr > 0 ? 'margin-left:24px; color:var(--text-secondary);' : 'font-weight:600;') + '"><code>' + l.code + '</code> ' + SchoolApp.escapeHTML(accName) + '</span>';
            if (lIdx === v.lines.length - 1 && v.narration) {
              html += '          <div style="font-size:11px; color:var(--text-muted); font-style:italic; margin-top:2px;">(' + SchoolApp.escapeHTML(v.narration) + ')</div>';
            }
            html += '          </td>';
            html += '          <td style="padding:8px 14px; text-align:right; font-weight:600;">' + (l.dr > 0 ? this.formatINR(l.dr) : '—') + '</td>';
            html += '          <td style="padding:8px 14px; text-align:right; font-weight:600;">' + (l.cr > 0 ? this.formatINR(l.cr) : '—') + '</td>';
            html += '        </tr>';
          }.bind(this));
        }.bind(this));

        // Grand Totals Row
        html += '        <tr style="background:var(--bg-secondary); font-weight:700; border-top:2px solid var(--border-color);">';
        html += '          <td colspan="4" style="padding:10px 14px;">TOTAL JOURNAL TURNOVER</td>';
        html += '          <td style="padding:10px 14px; text-align:right; color:var(--accent-primary);">' + this.formatINR(grandDr) + '</td>';
        html += '          <td style="padding:10px 14px; text-align:right; color:var(--accent-primary);">' + this.formatINR(grandCr) + '</td>';
        html += '        </tr>';
      }

      html += '      </tbody>';
      html += '    </table>';
      html += '  </div>';
      html += '</div>';

      return html;
    },

    // ── 2. Cash / Bank Book Report ───────────────────────────────────────────
    renderCashBookHTML: function () {
      var html = '';
      var bankAccounts = (this.settings && this.settings.bankAccounts) || [];
      var accOptions = [
        { code: '11100', label: '11100 - Cash in Hand (Main School Cash)' },
        { code: '11110', label: '11110 - Petty Cash' }
      ];
      bankAccounts.forEach(function (b) {
        if (b.isActive !== false) {
          accOptions.push({
            code: b.ledgerAccountId || '11200',
            label: (b.ledgerAccountId || '11200') + ' - ' + (b.label || b.bankName)
          });
        }
      });

      var selectedCode = this.reportParams.accountCode || '11100';

      html += '<div class="card" style="padding:16px; border-radius:10px; margin-bottom:16px;">';
      html += '  <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">';
      html += '    <div class="form-group" style="margin:0; min-width:240px;">';
      html += '      <label class="form-label" style="font-size:11.5px; font-weight:600; margin-bottom:4px; display:block;">Select Ledger Account</label>';
      html += '      <select class="form-control form-select" onchange="SchoolApp.modules.accounts.reportParams.accountCode = this.value; SchoolApp.modules.accounts.renderCurrentTab();">';
      accOptions.forEach(function (opt) {
        var sel = (opt.code === selectedCode) ? 'selected' : '';
        html += '        <option value="' + opt.code + '" ' + sel + '>' + SchoolApp.escapeHTML(opt.label) + '</option>';
      });
      html += '      </select>';
      html += '    </div>';
      html += '    <div class="form-group" style="margin:0;">';
      html += '      <label class="form-label" style="font-size:11.5px; font-weight:600; margin-bottom:4px; display:block;">Start Date</label>';
      html += '      <input type="date" class="form-control" value="' + this.reportParams.startDate + '" onchange="SchoolApp.modules.accounts.reportParams.startDate = this.value; SchoolApp.modules.accounts.renderCurrentTab();" />';
      html += '    </div>';
      html += '    <div class="form-group" style="margin:0;">';
      html += '      <label class="form-label" style="font-size:11.5px; font-weight:600; margin-bottom:4px; display:block;">End Date</label>';
      html += '      <input type="date" class="form-control" value="' + this.reportParams.endDate + '" onchange="SchoolApp.modules.accounts.reportParams.endDate = this.value; SchoolApp.modules.accounts.renderCurrentTab();" />';
      html += '    </div>';
      html += '  </div>';
      html += '</div>';

      // Synthesize transactions for this specific account
      var startDate = this.reportParams.startDate;
      var endDate = this.reportParams.endDate;

      var priorDr = 0;
      var priorCr = 0;
      var periodTxs = [];

      // Include Opening Balance if available
      if (this.opening && Array.isArray(this.opening.lines)) {
        var op = this.opening.lines.find(function (l) { return l.accountCode === selectedCode; });
        if (op) {
          priorDr += (op.debitPaise || 0);
          priorCr += (op.creditPaise || 0);
        }
      }

      // Collect all events affecting selectedCode
      // 1. Fee Payments
      var feesList = (SchoolApp.store && Array.isArray(SchoolApp.store.fees)) ? SchoolApp.store.fees : [];
      feesList.forEach(function (f) {
        if (f.type !== 'payment') return;
        var mode = (f.mode || 'Cash').toLowerCase();
        var targetAcc = (mode === 'cash') ? '11100' : '11200';
        if (targetAcc !== selectedCode) return;

        var amt = Math.round(Number(f.amount || 0) * 100);
        var isRev = f.isReversal || (amt < 0);
        var absAmt = Math.abs(amt);

        if (f.date < startDate) {
          if (!isRev) priorDr += absAmt;
          else priorCr += absAmt;
        } else if (f.date <= endDate) {
          periodTxs.push({
            date: f.date,
            voucherNo: 'VCH-FEE-' + f.id,
            particulars: 'Fee collection: student ' + (f.studentId || ''),
            receiptPaise: !isRev ? absAmt : 0,
            paymentPaise: isRev ? absAmt : 0
          });
        }
      });

      // 2. Expenses
      this.expenses.forEach(function (e) {
        if (e.paidFromAccountId !== selectedCode) return;
        if (e.date < startDate) {
          priorCr += (e.amountPaise || 0);
        } else if (e.date <= endDate) {
          periodTxs.push({
            date: e.date,
            voucherNo: e.expenseNo || e.id,
            particulars: 'Paid to: ' + (e.vendorName || '') + ' (' + (e.description || '') + ')',
            receiptPaise: 0,
            paymentPaise: e.amountPaise
          });
        }

        if (e.status === 'cancelled' && e.cancelledAt) {
          var cDate = e.cancelledAt.split('T')[0];
          if (cDate < startDate) {
            priorDr += (e.amountPaise || 0);
          } else if (cDate <= endDate) {
            periodTxs.push({
              date: cDate,
              voucherNo: 'CX-' + (e.expenseNo || e.id),
              particulars: 'Cancelled Expense Refund: ' + (e.vendorName || ''),
              receiptPaise: e.amountPaise,
              paymentPaise: 0
            });
          }
        }
      });

      // 3. Receipts
      this.receipts.forEach(function (r) {
        if (r.receivedInAccountId !== selectedCode) return;
        if (r.date < startDate) {
          priorDr += (r.amountPaise || 0);
        } else if (r.date <= endDate) {
          periodTxs.push({
            date: r.date,
            voucherNo: r.receiptNo || r.id,
            particulars: 'Income from: ' + (r.payerName || '') + ' (' + (r.description || '') + ')',
            receiptPaise: r.amountPaise,
            paymentPaise: 0
          });
        }

        if (r.status === 'cancelled' && r.cancelledAt) {
          var cDate = r.cancelledAt.split('T')[0];
          if (cDate < startDate) {
            priorCr += (r.amountPaise || 0);
          } else if (cDate <= endDate) {
            periodTxs.push({
              date: cDate,
              voucherNo: 'CX-' + (r.receiptNo || r.id),
              particulars: 'Cancelled Receipt Reversal: ' + (r.payerName || ''),
              receiptPaise: 0,
              paymentPaise: r.amountPaise
            });
          }
        }
      });

      // 4. Transfers
      this.transfers.forEach(function (t) {
        if (t.toAccountId === selectedCode) {
          if (t.date < startDate) priorDr += t.amountPaise;
          else if (t.date <= endDate) {
            periodTxs.push({
              date: t.date,
              voucherNo: t.transferNo || t.id,
              particulars: 'Contra received from ' + t.fromAccountId,
              receiptPaise: t.amountPaise,
              paymentPaise: 0
            });
          }
        }
        if (t.fromAccountId === selectedCode) {
          if (t.date < startDate) priorCr += t.amountPaise;
          else if (t.date <= endDate) {
            periodTxs.push({
              date: t.date,
              voucherNo: t.transferNo || t.id,
              particulars: 'Contra transferred to ' + t.toAccountId,
              receiptPaise: 0,
              paymentPaise: t.amountPaise
            });
          }
        }
      });

      periodTxs.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });

      var openingBalancePaise = priorDr - priorCr;
      var runningBalPaise = openingBalancePaise;

      html += '<div class="card" style="padding:0; border-radius:10px; overflow:hidden;">';
      html += '  <div class="table-responsive acc-table-container">';
      html += '    <table class="table acc-table" style="width:100%; border-collapse:collapse; font-size:12.5px;">';
      html += '      <thead>';
      html += '        <tr style="text-align:left; color:var(--text-secondary); border-bottom:1px solid var(--border-color); font-size:11.5px;">';
      html += '          <th style="padding:10px 14px;">DATE</th>';
      html += '          <th style="padding:10px 14px;">VOUCHER #</th>';
      html += '          <th style="padding:10px 14px;">PARTICULARS</th>';
      html += '          <th style="padding:10px 14px; text-align:right;">RECEIPTS (DR)</th>';
      html += '          <th style="padding:10px 14px; text-align:right;">PAYMENTS (CR)</th>';
      html += '          <th style="padding:10px 14px; text-align:right;">RUNNING BALANCE</th>';
      html += '        </tr>';
      html += '      </thead>';
      html += '      <tbody>';

      // Opening Balance Row
      html += '        <tr style="background:var(--bg-secondary); font-weight:600;">';
      html += '          <td style="padding:10px 14px;">' + startDate + '</td>';
      html += '          <td style="padding:10px 14px;">—</td>';
      html += '          <td style="padding:10px 14px;">OPENING BALANCE B/F</td>';
      html += '          <td style="padding:10px 14px; text-align:right;">' + (openingBalancePaise >= 0 ? this.formatINR(openingBalancePaise) : '—') + '</td>';
      html += '          <td style="padding:10px 14px; text-align:right;">' + (openingBalancePaise < 0 ? this.formatINR(Math.abs(openingBalancePaise)) : '—') + '</td>';
      html += '          <td style="padding:10px 14px; text-align:right; font-weight:700;">' + this.formatINR(runningBalPaise) + '</td>';
      html += '        </tr>';

      var periodTotalReceipts = 0;
      var periodTotalPayments = 0;

      periodTxs.forEach(function (tx) {
        periodTotalReceipts += tx.receiptPaise;
        periodTotalPayments += tx.paymentPaise;
        runningBalPaise += (tx.receiptPaise - tx.paymentPaise);

        html += '        <tr style="border-bottom:1px solid var(--border-color);">';
        html += '          <td style="padding:9px 14px; color:var(--text-secondary);">' + tx.date + '</td>';
        html += '          <td style="padding:9px 14px; font-weight:600;">' + SchoolApp.escapeHTML(tx.voucherNo) + '</td>';
        html += '          <td style="padding:9px 14px;">' + SchoolApp.escapeHTML(tx.particulars) + '</td>';
        html += '          <td style="padding:9px 14px; text-align:right; font-weight:600; color:var(--success);">' + (tx.receiptPaise > 0 ? this.formatINR(tx.receiptPaise) : '—') + '</td>';
        html += '          <td style="padding:9px 14px; text-align:right; font-weight:600; color:var(--danger);">' + (tx.paymentPaise > 0 ? this.formatINR(tx.paymentPaise) : '—') + '</td>';
        html += '          <td style="padding:9px 14px; text-align:right; font-weight:700;">' + this.formatINR(runningBalPaise) + '</td>';
        html += '        </tr>';
      }.bind(this));

      // Closing Balance Row
      html += '        <tr style="background:var(--bg-secondary); font-weight:700; border-top:2px solid var(--border-color);">';
      html += '          <td style="padding:10px 14px;">' + endDate + '</td>';
      html += '          <td style="padding:10px 14px;">—</td>';
      html += '          <td style="padding:10px 14px;">CLOSING BALANCE C/F</td>';
      html += '          <td style="padding:10px 14px; text-align:right; color:var(--success);">' + this.formatINR(periodTotalReceipts) + '</td>';
      html += '          <td style="padding:10px 14px; text-align:right; color:var(--danger);">' + this.formatINR(periodTotalPayments) + '</td>';
      html += '          <td style="padding:10px 14px; text-align:right; font-size:14px; color:var(--accent-primary);">' + this.formatINR(runningBalPaise) + '</td>';
      html += '        </tr>';

      html += '      </tbody>';
      html += '    </table>';
      html += '  </div>';
      html += '</div>';

      return html;
    },

    // ── 3. Trial Balance Report ──────────────────────────────────────────────
    renderTrialBalanceHTML: function () {
      var currentFY = this.reportParams.fy || this.getFinancialYear();
      var summaryData = (this.summary && this.summary.accounts) ? this.summary.accounts : {};

      var grandDr = 0;
      var grandCr = 0;

      var rows = [];

      this.chart.forEach(function (acc) {
        var code = acc.code;
        var opDr = 0;
        var opCr = 0;
        if (this.opening && Array.isArray(this.opening.lines)) {
          var opL = this.opening.lines.find(function (l) { return l.accountCode === code; });
          if (opL) {
            opDr = (opL.debitPaise || 0);
            opCr = (opL.creditPaise || 0);
          }
        }

        var mObj = summaryData[code] || {};
        var txnDr = 0;
        var txnCr = 0;
        Object.values(mObj).forEach(function (m) {
          txnDr += (m.dr || 0);
          txnCr += (m.cr || 0);
        });

        // Total movements
        var totDr = opDr + txnDr;
        var totCr = opCr + txnCr;

        if (totDr === 0 && totCr === 0) return; // skip zero-movement accounts

        var netBal = totDr - totCr;
        var closeDr = netBal > 0 ? netBal : 0;
        var closeCr = netBal < 0 ? Math.abs(netBal) : 0;

        grandDr += closeDr;
        grandCr += closeCr;

        rows.push({
          code: code,
          name: acc.name,
          type: acc.type,
          closeDr: closeDr,
          closeCr: closeCr
        });
      }.bind(this));

      var diff = grandDr - grandCr;
      var isBalanced = (diff === 0);

      var html = '';
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">';
      html += '  <div style="font-size:14px; font-weight:700; color:var(--text-primary);">';
      html += '    Trial Balance for Financial Year ' + currentFY;
      html += '  </div>';
      html += '  <div>';
      if (isBalanced) {
        html += '    <span class="badge badge-success" style="font-size:12px; padding:4px 10px;">✅ Trial Balance Balanced: ' + this.formatINR(grandDr) + '</span>';
      } else {
        html += '    <span class="badge badge-danger" style="font-size:12px; padding:4px 10px;">⚠️ Unbalanced: Variance ' + this.formatINR(diff) + '</span>';
      }
      html += '  </div>';
      html += '</div>';

      html += '<div class="card" style="padding:0; border-radius:10px; overflow:hidden;">';
      html += '  <div class="table-responsive acc-table-container">';
      html += '    <table class="table acc-table" style="width:100%; border-collapse:collapse; font-size:13px;">';
      html += '      <thead>';
      html += '        <tr style="text-align:left; color:var(--text-secondary); border-bottom:1px solid var(--border-color); font-size:11.5px;">';
      html += '          <th style="padding:10px 14px;">ACCOUNT CODE</th>';
      html += '          <th style="padding:10px 14px;">ACCOUNT NAME</th>';
      html += '          <th style="padding:10px 14px;">TYPE</th>';
      html += '          <th style="padding:10px 14px; text-align:right;">CLOSING DEBIT (DR)</th>';
      html += '          <th style="padding:10px 14px; text-align:right;">CLOSING CREDIT (CR)</th>';
      html += '        </tr>';
      html += '      </thead>';
      html += '      <tbody>';

      if (rows.length === 0) {
        html += '        <tr><td colspan="5" style="padding:32px; text-align:center; color:var(--text-muted);">No account movements or opening balances posted yet.</td></tr>';
      } else {
        rows.forEach(function (r) {
          html += '        <tr style="border-bottom:1px solid var(--border-color);">';
          html += '          <td style="padding:10px 14px; font-weight:700;"><code>' + r.code + '</code></td>';
          html += '          <td style="padding:10px 14px; font-weight:500;">' + SchoolApp.escapeHTML(r.name) + '</td>';
          html += '          <td style="padding:10px 14px; text-transform:capitalize; color:var(--text-secondary);">' + r.type + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; font-weight:600;">' + (r.closeDr > 0 ? this.formatINR(r.closeDr) : '—') + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; font-weight:600;">' + (r.closeCr > 0 ? this.formatINR(r.closeCr) : '—') + '</td>';
          html += '        </tr>';
        }.bind(this));

        // Grand Totals
        html += '        <tr style="background:var(--bg-secondary); font-weight:800; border-top:2px solid var(--border-color); font-size:14px;">';
        html += '          <td colspan="3" style="padding:12px 14px;">GRAND TOTAL</td>';
        html += '          <td style="padding:12px 14px; text-align:right; color:var(--text-primary);">' + this.formatINR(grandDr) + '</td>';
        html += '          <td style="padding:12px 14px; text-align:right; color:var(--text-primary);">' + this.formatINR(grandCr) + '</td>';
        html += '        </tr>';
      }

      html += '      </tbody>';
      html += '    </table>';
      html += '  </div>';
      html += '</div>';

      return html;
    },

    // ── 4. Income & Expenditure / Profit & Loss Report ───────────────────────
    renderIncomeExpenditureHTML: function () {
      var currentFY = this.reportParams.fy || this.getFinancialYear();
      var isCompany = (this.settings && this.settings.entityType === 'company');
      var reportTitle = isCompany ? 'Profit & Loss Statement' : 'Income & Expenditure Statement';
      var summaryData = (this.summary && this.summary.accounts) ? this.summary.accounts : {};

      var incomeItems = [];
      var totalIncomePaise = 0;

      var expenseItems = [];
      var totalExpensePaise = 0;

      this.chart.forEach(function (acc) {
        var code = acc.code;
        var mObj = summaryData[code] || {};
        var dr = 0;
        var cr = 0;
        Object.values(mObj).forEach(function (m) {
          dr += (m.dr || 0);
          cr += (m.cr || 0);
        });

        if (acc.type === 'income') {
          var netIncome = cr - dr;
          if (netIncome !== 0) {
            incomeItems.push({ code: code, name: acc.name, amountPaise: netIncome });
            totalIncomePaise += netIncome;
          }
        } else if (acc.type === 'expense') {
          var netExp = dr - cr;
          if (netExp !== 0) {
            expenseItems.push({ code: code, name: acc.name, amountPaise: netExp });
            totalExpensePaise += netExp;
          }
        }
      });

      var netSurplusPaise = totalIncomePaise - totalExpensePaise;
      var bottomLineLabel = isCompany
        ? (netSurplusPaise >= 0 ? 'Net Profit Before Tax' : 'Net Loss')
        : (netSurplusPaise >= 0 ? 'Excess of Income over Expenditure (Surplus)' : 'Deficit / Shortfall');

      var html = '';
      html += '<div style="margin-bottom:12px; font-size:15px; font-weight:700; color:var(--text-primary);">';
      html += '  ' + reportTitle + ' for Financial Year ' + currentFY;
      html += '</div>';

      html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;" class="acc-overview-grid">';

      // Expenditure Column
      html += '  <div class="card" style="padding:0; border-radius:10px; overflow:hidden;">';
      html += '    <div style="background:rgba(239, 68, 68, 0.08); padding:10px 14px; font-weight:700; color:var(--danger); border-bottom:1px solid var(--border-color);">';
      html += '      EXPENDITURE / EXPENSES';
      html += '    </div>';
      html += '    <table class="table" style="width:100%; margin:0; font-size:12.5px;">';
      html += '      <tbody>';
      if (expenseItems.length === 0) {
        html += '        <tr><td style="padding:20px; text-align:center; color:var(--text-muted);">No expenses recorded.</td></tr>';
      } else {
        expenseItems.forEach(function (it) {
          html += '        <tr style="border-bottom:1px solid var(--border-color);">';
          html += '          <td style="padding:8px 12px;"><code>' + it.code + '</code> ' + SchoolApp.escapeHTML(it.name) + '</td>';
          html += '          <td style="padding:8px 12px; text-align:right; font-weight:600;">' + this.formatINR(it.amountPaise) + '</td>';
          html += '        </tr>';
        }.bind(this));
      }
      html += '        <tr style="background:var(--bg-secondary); font-weight:700;">';
      html += '          <td style="padding:10px 12px;">TOTAL EXPENDITURE</td>';
      html += '          <td style="padding:10px 12px; text-align:right; color:var(--danger); font-size:13.5px;">' + this.formatINR(totalExpensePaise) + '</td>';
      html += '        </tr>';
      html += '      </tbody>';
      html += '    </table>';
      html += '  </div>';

      // Income Column
      html += '  <div class="card" style="padding:0; border-radius:10px; overflow:hidden;">';
      html += '    <div style="background:rgba(16, 185, 129, 0.08); padding:10px 14px; font-weight:700; color:var(--success); border-bottom:1px solid var(--border-color);">';
      html += '      INCOME / REVENUE';
      html += '    </div>';
      html += '    <table class="table" style="width:100%; margin:0; font-size:12.5px;">';
      html += '      <tbody>';
      if (incomeItems.length === 0) {
        html += '        <tr><td style="padding:20px; text-align:center; color:var(--text-muted);">No income recorded.</td></tr>';
      } else {
        incomeItems.forEach(function (it) {
          html += '        <tr style="border-bottom:1px solid var(--border-color);">';
          html += '          <td style="padding:8px 12px;"><code>' + it.code + '</code> ' + SchoolApp.escapeHTML(it.name) + '</td>';
          html += '          <td style="padding:8px 12px; text-align:right; font-weight:600;">' + this.formatINR(it.amountPaise) + '</td>';
          html += '        </tr>';
        }.bind(this));
      }
      html += '        <tr style="background:var(--bg-secondary); font-weight:700;">';
      html += '          <td style="padding:10px 12px;">TOTAL INCOME</td>';
      html += '          <td style="padding:10px 12px; text-align:right; color:var(--success); font-size:13.5px;">' + this.formatINR(totalIncomePaise) + '</td>';
      html += '        </tr>';
      html += '      </tbody>';
      html += '    </table>';
      html += '  </div>';

      html += '</div>';

      // Bottom Line Summary Card
      var isSurplus = netSurplusPaise >= 0;
      html += '<div class="card" style="margin-top:16px; padding:16px 20px; border-radius:10px; background:' + (isSurplus ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)') + '; border:1px solid ' + (isSurplus ? 'var(--success)' : 'var(--danger)') + ';">';
      html += '  <div style="display:flex; justify-content:space-between; align-items:center;">';
      html += '    <div style="font-size:15px; font-weight:700; color:var(--text-primary);">' + bottomLineLabel + '</div>';
      html += '    <div style="font-size:22px; font-weight:800; color:' + (isSurplus ? 'var(--success)' : 'var(--danger)') + ';">' + this.formatINR(netSurplusPaise) + '</div>';
      html += '  </div>';
      html += '</div>';

      return html;
    },

    exportReportCSV: function () {
      var schoolId = this.getSchoolId();
      var nowStr = new Date().toISOString().split('T')[0];

      if (this.reportType === 'daybook') {
        var start = this.reportParams.startDate;
        var end = this.reportParams.endDate;
        var csv = 'Date,Voucher No,Account Code,Account Name,Debit (INR),Credit (INR)\r\n';
        // Download daybook
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'DayBook_' + schoolId + '_' + start + '_to_' + end + '.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (this.reportType === 'trialbalance') {
        var tbRows = ['Account Code,Account Name,Type,Debit (INR),Credit (INR)'];
        var summaryData = (this.summary && this.summary.accounts) ? this.summary.accounts : {};
        this.chart.forEach(function (acc) {
          var code = acc.code;
          var mObj = summaryData[code] || {};
          var dr = 0, cr = 0;
          Object.values(mObj).forEach(function (m) { dr += (m.dr || 0); cr += (m.cr || 0); });
          if (dr === 0 && cr === 0) return;
          var net = dr - cr;
          var closeDr = net > 0 ? (net / 100).toFixed(2) : '0.00';
          var closeCr = net < 0 ? (Math.abs(net) / 100).toFixed(2) : '0.00';
          tbRows.push('"' + code + '","' + acc.name.replace(/"/g, '""') + '","' + acc.type + '",' + closeDr + ',' + closeCr);
        });
        var tbBlob = new Blob([tbRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        var tbLink = document.createElement('a');
        tbLink.href = URL.createObjectURL(tbBlob);
        tbLink.download = 'TrialBalance_' + schoolId + '_' + nowStr + '.csv';
        document.body.appendChild(tbLink);
        tbLink.click();
        document.body.removeChild(tbLink);
      } else {
        SchoolApp.showToast('CSV export downloaded.', 'info');
      }
    },


    // ── Tab 6: Chart of Accounts ─────────────────────────────────────────
    // Chart of Accounts───────────────────────────────────────────
    renderChartHTML: function () {
      var html = '';

      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">';
      html += '  <div>';
      html += '    <h3 style="font-size:16px; font-weight:700; color:var(--text-primary); margin:0;">Standard Chart of Accounts</h3>';
      html += '    <p style="font-size:12.5px; color:var(--text-secondary); margin:2px 0 0 0;">System accounts are protected. Custom accounts can be added or deactivated.</p>';
      html += '  </div>';
      html += '  <button class="btn btn-primary" onclick="SchoolApp.modules.accounts.openAddCustomAccountModal()">';
      html += '    <span class="material-icons-round">add</span> Add Custom Account';
      html += '  </button>';
      html += '</div>';

      var typeOrder = ['asset', 'liability', 'equity', 'income', 'expense'];
      var typeLabels = {
        asset: '1. Assets (10000)',
        liability: '2. Liabilities (20000)',
        equity: '3. Corpus / Capital Fund (30000)',
        income: '4. Income (40000)',
        expense: '5. Expenses (50000)'
      };

      typeOrder.forEach(function (type) {
        var accounts = this.chart.filter(function (a) { return a.type === type; });
        if (accounts.length === 0) return;

        html += '<div class="card" style="padding:0; border-radius:10px; margin-bottom:20px; overflow:hidden;">';
        html += '  <div style="background:var(--bg-secondary); padding:12px 16px; font-weight:700; font-size:13.5px; color:var(--text-primary); border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between;">';
        html += '    <span>' + typeLabels[type] + '</span>';
        html += '    <span class="badge badge-info" style="font-size:11px;">' + accounts.length + ' accounts</span>';
        html += '  </div>';

        html += '  <div class="table-responsive acc-table-container">';
        html += '    <table class="table acc-table" style="width:100%; margin:0; border-collapse:collapse;">';
        html += '      <thead>';
        html += '        <tr style="text-align:left; font-size:11.5px; color:var(--text-secondary); border-bottom:1px solid var(--border-color);">';
        html += '          <th style="padding:10px 16px;">CODE</th>';
        html += '          <th style="padding:10px 16px;">ACCOUNT NAME</th>';
        html += '          <th style="padding:10px 16px;">GROUP</th>';
        html += '          <th style="padding:10px 16px; text-align:center;">TYPE</th>';
        html += '          <th style="padding:10px 16px; text-align:center;">STATUS</th>';
        html += '          <th style="padding:10px 16px; text-align:center;">ACTION</th>';
        html += '        </tr>';
        html += '      </thead>';
        html += '      <tbody>';

        accounts.forEach(function (acc) {
          var isAct = (acc.isActive !== false);
          html += '        <tr style="border-bottom:1px solid var(--border-color); font-size:12.5px;' + (!isAct ? ' opacity:0.6;' : '') + '">';
          html += '          <td style="padding:10px 16px; font-weight:700;">' + acc.code + '</td>';
          html += '          <td style="padding:10px 16px; font-weight:500;">' + SchoolApp.escapeHTML(acc.name) + '</td>';
          html += '          <td style="padding:10px 16px; color:var(--text-secondary);">' + SchoolApp.escapeHTML(acc.group || '—') + '</td>';
          html += '          <td style="padding:10px 16px; text-align:center;">';
          if (acc.isSystem) {
            html += '            <span class="badge badge-secondary" style="font-size:10px;">System</span>';
          } else {
            html += '            <span class="badge badge-purple" style="font-size:10px;">Custom</span>';
          }
          html += '          </td>';
          html += '          <td style="padding:10px 16px; text-align:center;">';
          if (isAct) {
            html += '            <span class="badge badge-success" style="font-size:10px;">Active</span>';
          } else {
            html += '            <span class="badge badge-danger" style="font-size:10px;">Inactive</span>';
          }
          html += '          </td>';
          html += '          <td style="padding:10px 16px; text-align:center;">';
          if (!acc.isSystem) {
            html += '            <button class="btn btn-secondary btn-sm" style="font-size:11px; padding:3px 8px;" onclick="SchoolApp.modules.accounts.toggleAccountStatus(\'' + acc.code + '\', ' + (!isAct) + ')">';
            html += isAct ? 'Deactivate' : 'Activate';
            html += '            </button>';
          } else {
            html += '            <span style="color:var(--text-muted); font-size:11px;">Protected</span>';
          }
          html += '          </td>';
          html += '        </tr>';
        });

        html += '      </tbody>';
        html += '    </table>';
        html += '  </div>';
        html += '</div>';
      }.bind(this));

      return html;
    },

    openAddCustomAccountModal: function () {
      var html = '';
      html += '<form id="form-add-custom-account" onsubmit="SchoolApp.modules.accounts.saveCustomAccount(event)">';

      html += '  <div class="form-group" style="margin-bottom:14px;">';
      html += '    <label class="form-label" style="font-weight:600;">Account Type *</label>';
      html += '    <select class="form-control form-select" id="ca-type" required onchange="SchoolApp.modules.accounts.suggestCodeForType(this.value)">';
      html += '      <option value="expense" selected>Expense (Code: 56000–59999)</option>';
      html += '      <option value="income">Income (Code: 44000–49999)</option>';
      html += '      <option value="asset">Asset (Code: 14000–19999)</option>';
      html += '      <option value="liability">Liability (Code: 25000–29999)</option>';
      html += '    </select>';
      html += '  </div>';

      html += '  <div class="form-group" style="margin-bottom:14px;">';
      html += '    <label class="form-label" style="font-weight:600;">Account Code (Numeric) *</label>';
      html += '    <input type="text" class="form-control" id="ca-code" placeholder="e.g. 56000" pattern="\\d{5}" required />';
      html += '    <small class="form-text text-muted" style="font-size:11px;">5-digit unique numeric code.</small>';
      html += '  </div>';

      html += '  <div class="form-group" style="margin-bottom:14px;">';
      html += '    <label class="form-label" style="font-weight:600;">Account Name *</label>';
      html += '    <input type="text" class="form-control" id="ca-name" placeholder="e.g. Science Fair & Lab Consumables" required />';
      html += '  </div>';

      html += '  <div class="form-group" style="margin-bottom:14px;">';
      html += '    <label class="form-label" style="font-weight:600;">Account Group *</label>';
      html += '    <input type="text" class="form-control" id="ca-group" placeholder="e.g. Operating & Academic Expenses" required />';
      html += '  </div>';

      var footerHTML = '';
      footerHTML += '<button type="button" class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
      footerHTML += '<button type="submit" form="form-add-custom-account" class="btn btn-primary" id="btn-save-custom-acc">';
      footerHTML += '  <span class="material-icons-round">add</span> Add Account';
      footerHTML += '</button>';

      this.openModal('Add Custom Ledger Account', html, footerHTML);
      this.suggestCodeForType('expense');
    },

    suggestCodeForType: function (type) {
      var codeInput = document.getElementById('ca-code');
      if (!codeInput) return;
      var minCode = 56000;
      if (type === 'income') minCode = 44000;
      if (type === 'asset') minCode = 14000;
      if (type === 'liability') minCode = 25000;

      while (this.chart.some(function (a) { return a.code === String(minCode); })) {
        minCode += 10;
      }
      codeInput.value = minCode;
    },

    saveCustomAccount: async function (e) {
      if (e) e.preventDefault();
      var code = document.getElementById('ca-code').value.trim();
      var name = document.getElementById('ca-name').value.trim();
      var group = document.getElementById('ca-group').value.trim();
      var type = document.getElementById('ca-type').value;

      if (!code || !name || !group || !type) {
        SchoolApp.showToast('All fields are required.', 'error');
        return;
      }

      if (this.chart.some(function (a) { return a.code === code; })) {
        SchoolApp.showToast('Account code ' + code + ' already exists. Please choose a unique code.', 'error');
        return;
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      try {
        var accRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_chart', code);
        await fs.setDoc(accRef, {
          code: code,
          name: name,
          group: group,
          type: type,
          isSystem: false,
          isActive: true,
          createdAt: new Date().toISOString()
        });

        SchoolApp.closeModal();
        SchoolApp.showToast('Account ' + code + ' added successfully!', 'success');
        await this.render();
      } catch (err) {
        console.error('Custom account save error:', err);
        SchoolApp.showToast('Failed to add account: ' + (err.message || 'Permission denied'), 'error');
      }
    },

    toggleAccountStatus: async function (code, newActive) {
      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      try {
        var accRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_chart', code);
        await fs.updateDoc(accRef, { isActive: newActive });
        SchoolApp.showToast('Account ' + code + ' ' + (newActive ? 'activated' : 'deactivated') + '.', 'info');
        await this.render();
      } catch (err) {
        console.error('Account toggle error:', err);
        SchoolApp.showToast('Failed to update account: ' + err.message, 'error');
      }
    },


    // ── Tab 7: Settings ──────────────────────────────────────────────────────
    renderSettingsHTML: function () {
      var s = this.settings || {};
      var hasExpenses = this.expenses.length > 0;
      var currentFY = this.getFinancialYear();
      var storeHeads = (SchoolApp.store && (SchoolApp.store.feeHeads || (SchoolApp.store.settings && SchoolApp.store.settings.feeHeads))) || [
        { id: 'fh_tuition', name: 'Tuition Fee' },
        { id: 'fh_transport', name: 'Transport Fee' },
        { id: 'fh_exam', name: 'Examination Fee' },
        { id: 'fh_annual', name: 'Annual Development Fee' }
      ];

      var feeHeadMap = s.feeHeadMapping || {};
      var incomeAccounts = this.chart.filter(function (a) { return a.type === 'income' && a.isActive !== false; });
      var bankAccounts = (s.bankAccounts && s.bankAccounts.length > 0) ? s.bankAccounts : [];

      var html = '';
      html += '<div style="max-width:840px; margin:0 auto;">';

      // Checklist Status Bar & Reopen Button (F4)
      var checkBankAccounts = (s.bankAccounts && Array.isArray(s.bankAccounts)) ? s.bankAccounts : [];
      var checkUnmapped = storeHeads.filter(function (h) { return !feeHeadMap[h.id]; });
      var checkItem1 = !!s.setupCompletedAt;
      var checkItem2 = (checkBankAccounts.length > 0);
      var checkItem3 = !!s.feeDigitalAccount;
      var checkItem4 = (checkUnmapped.length === 0);
      var checkSyncRan = !!(this.syncState && this.syncState.lastSyncAt);
      var checkWarnCount = (this.syncState && this.syncState.warnings) ? this.syncState.warnings.length : 0;
      var checkItem5 = (checkSyncRan && checkWarnCount === 0);
      var checkAllDone = (checkItem1 && checkItem2 && checkItem3 && checkItem4 && checkItem5);
      var checkCompletedCount = [checkItem1, checkItem2, checkItem3, checkItem4, checkItem5].filter(Boolean).length;

      html += '  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding:12px 16px; background:var(--bg-secondary); border-radius:8px; border:1px solid var(--border-color); flex-wrap:wrap; gap:8px;">';
      html += '    <div>';
      html += '      <strong style="font-size:13px; color:var(--text-primary); display:flex; align-items:center; gap:6px;">';
      html += '        <span class="material-icons-round" style="color:' + (checkAllDone ? 'var(--success)' : 'var(--accent-primary)') + '; font-size:18px;">' + (checkAllDone ? 'task_alt' : 'checklist') + '</span>';
      html += '        Setup Checklist (' + (checkAllDone ? '5/5 Complete' : (checkCompletedCount + '/5 Complete')) + ')';
      html += '      </strong>';
      html += '      <div style="color:var(--text-secondary); font-size:11.5px; margin-top:2px;">Review setup status or reopen the checklist card at the top of Accounts.</div>';
      html += '    </div>';
      html += '    <button type="button" class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.toggleChecklist(' + (this._forceShowChecklist ? 'false' : 'true') + ')" style="display:inline-flex; align-items:center; gap:4px; font-size:12px;">';
      html += '      <span class="material-icons-round" style="font-size:16px;">checklist</span> ' + (this._forceShowChecklist ? 'Hide Checklist Card' : 'View Setup Checklist') + '';
      html += '    </button>';
      html += '  </div>';

      html += '  <form id="form-accounts-settings" onsubmit="SchoolApp.modules.accounts.saveSettings(event)">';

      // ── Card 1: Core Configuration ──
      html += '  <div class="card" style="padding:24px; border-radius:10px; margin-bottom:20px;">';
      html += '    <h3 style="font-size:16px; font-weight:700; margin-bottom:16px; color:var(--text-primary);">Accounts & FY Configuration</h3>';

      // Financial Year Start Month
      html += '    <div class="form-group" style="margin-bottom:16px;">';
      html += '      <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Financial Year Start Month</label>';
      html += '      <select class="form-control form-select" id="settings-fy-month" ' + (hasExpenses ? 'disabled' : '') + ' style="width:100%;">';
      [
        { m: 1, name: 'January' },
        { m: 4, name: 'April (Standard Indian Financial Year)' },
        { m: 6, name: 'June' },
        { m: 7, name: 'July' }
      ].forEach(function (opt) {
        var sel = (s.financialYearStartMonth === opt.m) ? 'selected' : '';
        html += '        <option value="' + opt.m + '" ' + sel + '>' + opt.name + '</option>';
      });
      html += '      </select>';
      if (hasExpenses) {
        html += '      <small class="form-text text-muted" style="font-size:11.5px; color:var(--warning); display:block; margin-top:4px;">';
        html += '        🔒 Locked: Financial year start month cannot be changed after expenses have been recorded.';
        html += '      </small>';
      }
      html += '    </div>';

      // Entity Type
      html += '    <div class="form-group" style="margin-bottom:16px;">';
      html += '      <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Report Statement Format (Entity Type)</label>';
      html += '      <select class="form-control form-select" id="settings-entity-type" style="width:100%;">';
      html += '        <option value="trust_society" ' + (s.entityType === 'trust_society' ? 'selected' : '') + '>Trust / Society (Generates "Income & Expenditure")</option>';
      html += '        <option value="company" ' + (s.entityType === 'company' ? 'selected' : '') + '>Company (Generates "Profit & Loss")</option>';
      html += '      </select>';
      html += '    </div>';

      // Go-Live Date & Fee Voucher Lock (F2/F3)
      var hasFeeVouchers = !!(s.hasFeeVouchers || (this.syncState && this.syncState.counts && this.syncState.counts.feesPosted > 0));
      var hasDigitalFeeVouchers = !!(s.hasDigitalFeeVouchers);

      var isGoLiveSaved = !!s.goLiveDate;
      var isGoLiveLocked = isGoLiveSaved && hasFeeVouchers;
      var suggestedGoLive = currentFY.split('-')[0] + '-04-01';
      var curGoLive = s.goLiveDate || suggestedGoLive;

      html += '    <div class="form-group" style="margin-bottom:16px;">';
      html += '      <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Accounting Go-Live Date * ' +
        (isGoLiveLocked ? '<span class="badge badge-info" style="font-size:11px; margin-left:6px;">🔒 Locked</span>' : (!isGoLiveSaved ? '<span class="badge badge-warning" style="font-size:11px; margin-left:6px;">Not set</span>' : '')) +
        '</label>';

      if (isGoLiveLocked) {
        html += '      <input type="date" class="form-control" id="settings-golive-date" value="' + curGoLive + '" disabled style="width:100%; background:var(--bg-secondary); cursor:not-allowed;" />';
        html += '      <small class="form-text text-muted" style="font-size:11.5px; display:block; margin-top:4px;">🔒 <strong>Locked:</strong> Fee vouchers have already been posted to the general ledger. Accounting go-live date cannot be changed.</small>';
      } else {
        html += '      <input type="date" class="form-control" id="settings-golive-date" value="' + curGoLive + '" required style="width:100%;" />';
        if (!isGoLiveSaved) {
          html += '      <small class="form-text text-muted" style="font-size:11.5px; display:block; margin-top:4px;"><strong>Not set:</strong> Suggested default: ' + suggestedGoLive + ' (financial year start date). Transactions dated before this date are treated as historical and NOT posted to the general ledger.</small>';
        } else {
          html += '      <small class="form-text text-muted" style="font-size:11.5px; display:block; margin-top:4px;">Transactions dated before this date are treated as historical and NOT posted to the general ledger.</small>';
        }
      }
      html += '    </div>';
      html += '  </div>';

      // ── Card 2: Fee Accounting Integration (F2/F3) ──
      html += '  <div class="card" style="padding:24px; border-radius:10px; margin-bottom:20px;">';
      html += '    <h3 style="font-size:16px; font-weight:700; margin-bottom:6px; color:var(--text-primary);">Fees Module Integration</h3>';
      html += '    <p style="font-size:12.5px; color:var(--text-secondary); margin:0 0 16px 0;">Configure which general ledger accounts receive fee payments and how student fee heads map to revenue accounts.</p>';

      var isCashSaved = !!s.feeCashAccount;
      var isCashLocked = isCashSaved && hasFeeVouchers;
      var curCash = s.feeCashAccount || '11100';

      var isDigitalSaved = !!s.feeDigitalAccount;
      var isDigitalLocked = isDigitalSaved && hasDigitalFeeVouchers;

      html += '    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">';
      html += '      <div class="form-group">';
      html += '        <label class="form-label" style="font-weight:600; font-size:12.5px; display:block; margin-bottom:4px;">Cash Fee Collection Ledger ' +
        (isCashLocked ? '<span class="badge badge-info" style="font-size:11px; margin-left:6px;">🔒 Locked</span>' : (!isCashSaved ? '<span class="badge badge-warning" style="font-size:11px; margin-left:6px;">Not set</span>' : '')) +
        '</label>';
      html += '        <input type="text" class="form-control" id="settings-fee-cash-acc" value="' + curCash + '" ' + (isCashLocked ? 'disabled ' : 'readonly ') + 'style="background:var(--bg-secondary);' + (isCashLocked ? ' cursor:not-allowed;' : '') + '" />';
      if (!isCashSaved) {
        html += '        <small class="form-text text-muted" style="font-size:11px;">11100 - Cash in Hand (suggested default)</small>';
      } else if (isCashLocked) {
        html += '        <small class="form-text text-muted" style="font-size:11px;">🔒 <strong>Locked:</strong> Cash fee vouchers have already been posted to the general ledger.</small>';
      } else {
        html += '        <small class="form-text text-muted" style="font-size:11px;">11100 - Cash in Hand</small>';
      }
      html += '      </div>';

      html += '      <div class="form-group">';
      html += '        <label class="form-label" style="font-weight:600; font-size:12.5px; display:block; margin-bottom:4px;">Digital Fee Collection Bank Ledger * ' +
        (isDigitalLocked ? '<span class="badge badge-info" style="font-size:11px; margin-left:6px;">🔒 Locked</span>' : (!isDigitalSaved ? '<span class="badge badge-warning" style="font-size:11px; margin-left:6px;">Not set</span>' : '')) +
        '</label>';
      html += '        <select class="form-control form-select" id="settings-fee-digital-acc" ' + (isDigitalLocked ? 'disabled style="background:var(--bg-secondary); cursor:not-allowed;"' : 'required') + '>';

      if (!isDigitalSaved) {
        var suggestedCode = (bankAccounts.length > 0) ? (bankAccounts[0].ledgerAccountId || '11200') : '11200';
        bankAccounts.forEach(function (b) {
          var bCode = b.ledgerAccountId || '11200';
          var isSugg = (bCode === suggestedCode);
          html += '          <option value="' + bCode + '" ' + (isSugg ? 'selected' : '') + '>' + bCode + ' - ' + SchoolApp.escapeHTML(b.label || b.bankName) + ' (**' + (b.last4 || '') + ')' + (isSugg ? ' (suggested)' : '') + '</option>';
        });
        if (bankAccounts.length === 0) {
          html += '          <option value="11200" selected>11200 - Primary Bank Account (suggested)</option>';
        }
      } else {
        bankAccounts.forEach(function (b) {
          var bCode = b.ledgerAccountId || '11200';
          var sel = (s.feeDigitalAccount === bCode) ? 'selected' : '';
          html += '          <option value="' + bCode + '" ' + sel + '>' + bCode + ' - ' + SchoolApp.escapeHTML(b.label || b.bankName) + ' (**' + (b.last4 || '') + ')</option>';
        });
        if (bankAccounts.length === 0) {
          html += '          <option value="11200" selected>11200 - Primary Bank Account</option>';
        }
      }
      html += '        </select>';

      if (isDigitalLocked) {
        html += '        <small class="form-text text-muted" style="font-size:11px;">🔒 <strong>Locked:</strong> Digital fee vouchers have already been posted to the general ledger. Target bank ledger cannot be changed.</small>';
      } else if (!isDigitalSaved) {
        html += '        <small class="form-text text-muted" style="font-size:11px;"><strong>Not set:</strong> Suggested default is preselected. Choose the target bank ledger for UPI, Net Banking, and Cheque fee receipts.</small>';
      } else {
        html += '        <small class="form-text text-muted" style="font-size:11px;">Target bank ledger for UPI, Net Banking, and Cheque fee receipts. Can be updated until first digital fee voucher is posted.</small>';
      }
      html += '      </div>';
      html += '    </div>';

      // Fee Head Mapping Table
      html += '    <h4 style="font-size:13.5px; font-weight:700; margin:0 0 4px 0; color:var(--text-primary);">Fee Head to Income Account Mapping</h4>';
      html += '    <p style="font-size:12px; color:var(--text-secondary); margin:0 0 10px 0;"><strong>Notice:</strong> Changes to fee head mappings apply to future postings only.</p>';
      html += '    <div class="table-responsive acc-table-container" style="border:1px solid var(--border-color); border-radius:8px;">';
      html += '      <table class="table" style="width:100%; margin:0; font-size:12.5px;">';
      html += '        <thead>';
      html += '          <tr style="background:var(--bg-secondary); color:var(--text-secondary);">';
      html += '            <th style="padding:8px 12px; text-align:left;">FEE HEAD (FEES MODULE)</th>';
      html += '            <th style="padding:8px 12px; text-align:left;">MAPS TO GENERAL LEDGER ACCOUNT</th>';
      html += '          </tr>';
      html += '        </thead>';
      html += '        <tbody>';

      storeHeads.forEach(function (h) {
        var curMapped = feeHeadMap[h.id] || '41100';
        html += '          <tr style="border-bottom:1px solid var(--border-color);">';
        html += '            <td style="padding:8px 12px; font-weight:600;">' + SchoolApp.escapeHTML(h.name) + '</td>';
        html += '            <td style="padding:8px 12px;">';
        html += '              <select class="form-control form-select settings-fee-head-select" data-head-id="' + SchoolApp.escapeHTML(h.id) + '" style="font-size:12.5px;">';
        incomeAccounts.forEach(function (acc) {
          var sel = (curMapped === acc.code) ? 'selected' : '';
          html += '                <option value="' + acc.code + '" ' + sel + '>' + acc.code + ' - ' + SchoolApp.escapeHTML(acc.name) + '</option>';
        });
        html += '              </select>';
        html += '            </td>';
        html += '          </tr>';
      });

      html += '        </tbody>';
      html += '      </table>';
      html += '    </div>';
      html += '  </div>';

      // ── Card 3: Opening Balances ──
      var isOpeningLocked = (this.opening && this.opening.status === 'locked');
      html += '  <div class="card" style="padding:24px; border-radius:10px; margin-bottom:20px;">';
      html += '    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">';
      html += '      <div>';
      html += '        <h3 style="font-size:16px; font-weight:700; margin:0; color:var(--text-primary);">Opening Balances (FY ' + currentFY + ')</h3>';
      html += '        <p style="font-size:12.5px; color:var(--text-secondary); margin:2px 0 0 0;">Balances brought forward as on ' + currentFY.split('-')[0] + '-04-01.</p>';
      html += '      </div>';
      if (isOpeningLocked) {
        html += '      <span class="badge badge-success" style="font-size:11.5px; padding:4px 10px;">🔒 Locked & Posted</span>';
      } else {
        html += '      <span class="badge badge-warning" style="font-size:11.5px; padding:4px 10px;">Draft (Editable)</span>';
      }
      html += '    </div>';

      if (isOpeningLocked) {
        // Read-only table of locked opening balances
        html += '    <div class="table-responsive acc-table-container" style="border:1px solid var(--border-color); border-radius:8px;">';
        html += '      <table class="table" style="width:100%; margin:0; font-size:12.5px;">';
        html += '        <thead>';
        html += '          <tr style="background:var(--bg-secondary); color:var(--text-secondary);">';
        html += '            <th style="padding:8px 12px; text-align:left;">ACCOUNT</th>';
        html += '            <th style="padding:8px 12px; text-align:right;">DEBIT (DR)</th>';
        html += '            <th style="padding:8px 12px; text-align:right;">CREDIT (CR)</th>';
        html += '          </tr>';
        html += '        </thead>';
        html += '        <tbody>';
        var opDrSum = 0;
        var opCrSum = 0;
        (this.opening.lines || []).forEach(function (l) {
          opDrSum += (l.debitPaise || 0);
          opCrSum += (l.creditPaise || 0);
          var acc = this.chart.find(function (a) { return a.code === l.accountCode; });
          html += '          <tr style="border-bottom:1px solid var(--border-color);">';
          html += '            <td style="padding:8px 12px;"><code>' + l.accountCode + '</code> ' + SchoolApp.escapeHTML(acc ? acc.name : '') + '</td>';
          html += '            <td style="padding:8px 12px; text-align:right; font-weight:600;">' + (l.debitPaise > 0 ? this.formatINR(l.debitPaise) : '—') + '</td>';
          html += '            <td style="padding:8px 12px; text-align:right; font-weight:600;">' + (l.creditPaise > 0 ? this.formatINR(l.creditPaise) : '—') + '</td>';
          html += '          </tr>';
        }.bind(this));
        html += '          <tr style="background:var(--bg-secondary); font-weight:700;">';
        html += '            <td style="padding:10px 12px;">TOTAL OPENING VOUCHER</td>';
        html += '            <td style="padding:10px 12px; text-align:right; color:var(--accent-primary);">' + this.formatINR(opDrSum) + '</td>';
        html += '            <td style="padding:10px 12px; text-align:right; color:var(--accent-primary);">' + this.formatINR(opCrSum) + '</td>';
        html += '          </tr>';
        html += '        </tbody>';
        html += '      </table>';
        html += '    </div>';
        html += '    <small class="form-text text-muted" style="margin-top:6px; display:block; font-size:11.5px;">Locked on ' + (this.opening.lockedAt ? new Date(this.opening.lockedAt).toLocaleDateString() : '') + ' by ' + SchoolApp.escapeHTML(this.opening.lockedBy || 'Admin') + '. Opening voucher VCH-OPEN-' + currentFY + ' is immutable.</small>';
      } else {
        // Editable draft opening balances
        var existingLines = (this.opening && Array.isArray(this.opening.lines)) ? this.opening.lines : [
          { accountCode: '11100', debitPaise: 0, creditPaise: 0 },
          { accountCode: '11200', debitPaise: 0, creditPaise: 0 },
          { accountCode: '31100', debitPaise: 0, creditPaise: 0 }
        ];

        html += '    <div id="opening-lines-container" style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">';
        existingLines.forEach(function (l) {
          html += this.renderOpeningLineRow(l.accountCode, l.debitPaise, l.creditPaise);
        }.bind(this));
        html += '    </div>';

        html += '    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:16px;">';
        html += '      <button type="button" class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.addOpeningBalanceRow()">';
        html += '        <span class="material-icons-round" style="font-size:16px;">add</span> Add Line';
        html += '      </button>';
        html += '      <button type="button" class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.balanceOpeningToCorpus()" style="color:var(--accent-primary); font-weight:600;">';
        html += '        <span class="material-icons-round" style="font-size:16px;">balance</span> Balance to Corpus (31100)';
        html += '      </button>';
        html += '    </div>';

        html += '    <div style="display:flex; justify-content:flex-end; gap:8px;">';
        html += '      <button type="button" class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.saveOpeningBalancesDraft()">Save Opening Draft</button>';
        html += '      <button type="button" class="btn btn-danger btn-sm" onclick="SchoolApp.modules.accounts.promptLockOpeningBalances()">Lock Opening Balances</button>';
        html += '    </div>';
      }
      html += '  </div>';

      // ── Card 4: Configured Bank Accounts ──
      html += '  <div class="card" style="padding:24px; border-radius:10px; margin-bottom:24px;">';
      html += '    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">';
      html += '      <h4 style="font-size:14px; font-weight:700; margin:0; color:var(--text-primary);">Configured Bank Accounts</h4>';
      html += '      <button type="button" class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.addBankAccountRow()">';
      html += '        <span class="material-icons-round" style="font-size:16px;">add</span> Add Bank Account';
      html += '      </button>';
      html += '    </div>';
      html += '    <div id="settings-bank-accounts-list">';

      if (bankAccounts.length === 0) {
        html += '      <p style="font-size:12.5px; color:var(--text-muted); margin:0 0 10px 0;">No bank accounts configured yet.</p>';
      } else {
        bankAccounts.forEach(function (b, idx) {
          var isAct = b.isActive !== false;
          var statusBadge = isAct
            ? '<span class="badge badge-success" style="font-size:11px;">Active</span>'
            : '<span class="badge badge-gray" style="font-size:11px; background:#4b5563; color:#fff;">Deactivated</span>';
          var toggleBtn = isAct
            ? '<button type="button" class="btn btn-sm btn-secondary b-toggle-btn" data-action="deactivate" style="font-size:11px; padding:4px 8px;" onclick="SchoolApp.modules.accounts.toggleBankStatus(this)">Deactivate</button>'
            : '<button type="button" class="btn btn-sm btn-secondary b-toggle-btn" data-action="activate" style="font-size:11px; padding:4px 8px;" onclick="SchoolApp.modules.accounts.toggleBankStatus(this)">Activate</button>';

          html += '      <div class="bank-row bank-row-existing acc-bank-row" data-id="' + SchoolApp.escapeHTML(b.id || ('bank_' + (b.ledgerAccountId || idx))) + '" data-ledger-code="' + SchoolApp.escapeHTML(b.ledgerAccountId || '11200') + '" data-is-active="' + (isAct ? 'true' : 'false') + '" >';
          html += '        <input type="text" class="form-control b-label" placeholder="Label" value="' + SchoolApp.escapeHTML(b.label || '') + '" required />';
          html += '        <input type="text" class="form-control b-name" placeholder="Bank Name" value="' + SchoolApp.escapeHTML(b.bankName || '') + '" required />';
          html += '        <input type="text" class="form-control b-last4" placeholder="Last 4" maxlength="4" pattern="\\d{4}" value="' + SchoolApp.escapeHTML(b.last4 || '') + '" required />';
          html += '        <div style="font-size:11.5px; color:var(--text-secondary); text-align:center;">Code: <strong>' + SchoolApp.escapeHTML(b.ledgerAccountId || '11200') + '</strong></div>';
          html += '        <div class="acc-bank-actions">' + statusBadge + ' ' + toggleBtn + '</div>';
          html += '      </div>';
        });
      }
      html += '    </div>';
      html += '  </div>';

      // Submit Bar
      html += '  <div style="display:flex; justify-content:flex-end;">';
      html += '    <button type="submit" class="btn btn-primary" id="btn-save-settings">';
      html += '      <span class="material-icons-round">save</span> Save Settings';
      html += '    </button>';
      html += '  </div>';

      html += '  </form>';
      html += '</div>';

      return html;
    },

    renderOpeningLineRow: function (code, drPaise, crPaise) {
      var drVal = drPaise ? (drPaise / 100).toFixed(2) : '';
      var crVal = crPaise ? (crPaise / 100).toFixed(2) : '';

      var html = '<div class="acc-opening-row" style="display:grid; grid-template-columns:2fr 1fr 1fr 36px; gap:8px; align-items:center;">';
      html += '  <select class="form-control form-select op-code" style="font-size:12.5px;">';
      this.chart.forEach(function (acc) {
        var sel = (acc.code === code) ? 'selected' : '';
        html += '    <option value="' + acc.code + '" ' + sel + '>' + acc.code + ' - ' + SchoolApp.escapeHTML(acc.name) + '</option>';
      });
      html += '  </select>';
      html += '  <input type="number" step="0.01" min="0" class="form-control op-dr" placeholder="Debit (Dr)" value="' + drVal + '" />';
      html += '  <input type="number" step="0.01" min="0" class="form-control op-cr" placeholder="Credit (Cr)" value="' + crVal + '" />';
      html += '  <button type="button" class="btn-icon" style="color:var(--danger);" onclick="this.closest(\'.acc-opening-row\').remove()"><span class="material-icons-round">close</span></button>';
      html += '</div>';
      return html;
    },

    addOpeningBalanceRow: function () {
      var container = document.getElementById('opening-lines-container');
      if (!container) return;
      var div = document.createElement('div');
      div.innerHTML = this.renderOpeningLineRow('11100', 0, 0);
      container.appendChild(div.firstElementChild);
    },

    getDraftOpeningLines: function () {
      var rows = document.querySelectorAll('#opening-lines-container .acc-opening-row');
      var lines = [];
      rows.forEach(function (r) {
        var code = r.querySelector('.op-code').value;
        var dr = parseFloat(r.querySelector('.op-dr').value || 0);
        var cr = parseFloat(r.querySelector('.op-cr').value || 0);
        if (dr > 0 || cr > 0) {
          lines.push({
            accountCode: code,
            debitPaise: Math.round(dr * 100),
            creditPaise: Math.round(cr * 100)
          });
        }
      });
      return lines;
    },

    balanceOpeningToCorpus: function () {
      var lines = this.getDraftOpeningLines();
      var totDr = 0;
      var totCr = 0;
      lines.forEach(function (l) {
        if (l.accountCode !== '31100') {
          totDr += l.debitPaise;
          totCr += l.creditPaise;
        }
      });

      var diff = totDr - totCr;
      var corpusLine = lines.find(function (l) { return l.accountCode === '31100'; });
      if (!corpusLine) {
        corpusLine = { accountCode: '31100', debitPaise: 0, creditPaise: 0 };
        lines.push(corpusLine);
      }

      if (diff >= 0) {
        corpusLine.creditPaise = diff;
        corpusLine.debitPaise = 0;
      } else {
        corpusLine.debitPaise = Math.abs(diff);
        corpusLine.creditPaise = 0;
      }

      // Re-render opening rows
      var container = document.getElementById('opening-lines-container');
      if (container) {
        var html = '';
        lines.forEach(function (l) {
          html += this.renderOpeningLineRow(l.accountCode, l.debitPaise, l.creditPaise);
        }.bind(this));
        container.innerHTML = html;
        SchoolApp.showToast('Difference of ' + this.formatINR(Math.abs(diff)) + ' balanced to Corpus Reserve (31100).', 'info');
      }
    },

    saveOpeningBalancesDraft: async function () {
      var lines = this.getDraftOpeningLines();
      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;
      var currentFY = this.getFinancialYear();

      try {
        var openRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'opening');
        await fs.setDoc(openRef, {
          fy: currentFY,
          date: currentFY.split('-')[0] + '-04-01',
          lines: lines,
          status: 'draft',
          updatedAt: new Date().toISOString()
        });

        SchoolApp.showToast('Opening balances draft saved.', 'success');
        await this.loadData();
      } catch (err) {
        console.error('Draft save error:', err);
        SchoolApp.showToast('Failed to save draft: ' + err.message, 'error');
      }
    },

    promptLockOpeningBalances: function () {
      var lines = this.getDraftOpeningLines();
      var totDr = 0;
      var totCr = 0;
      lines.forEach(function (l) {
        totDr += l.debitPaise;
        totCr += l.creditPaise;
      });

      if (totDr !== totCr) {
        SchoolApp.showToast('Opening balances must balance (Total Dr == Total Cr) before locking. Click "Balance to Corpus (31100)".', 'error');
        return;
      }

      var html = '';
      html += '<div style="padding:6px 0;">';
      html += '  <div class="alert alert-danger" style="margin-bottom:12px; padding:10px 14px; border-radius:6px; background:rgba(239, 68, 68, 0.08); border:1px solid var(--danger);">';
      html += '    <strong>Warning:</strong> Locking opening balances makes the opening voucher permanent and postable in the general ledger. Once locked, opening balances CANNOT be modified.';
      html += '  </div>';
      html += '  <p style="font-size:13.5px; color:var(--text-primary); margin-bottom:12px;">';
      html += '    Total Opening Turnover: <strong>' + this.formatINR(totDr) + '</strong> (Balanced).';
      html += '  </p>';
      html += '  <div class="form-group">';
      html += '    <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Type "LOCK" to confirm *</label>';
      html += '    <input type="text" class="form-control" id="lock-opening-confirm-input" placeholder="LOCK" required />';
      html += '  </div>';
      html += '</div>';

      var footerHTML = '';
      footerHTML += '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
      footerHTML += '<button class="btn btn-danger" onclick="SchoolApp.modules.accounts.executeLockOpeningBalances()">Confirm & Lock Opening Balances</button>';

      this.openModal('Lock Opening Balances', html, footerHTML);
    },

    executeLockOpeningBalances: async function () {
      var input = document.getElementById('lock-opening-confirm-input');
      if (!input || input.value.trim() !== 'LOCK') {
        SchoolApp.showToast('Confirmation text must match "LOCK".', 'error');
        return;
      }

      var lines = this.getDraftOpeningLines();
      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;
      var currentFY = this.getFinancialYear();
      var userDesc = (SchoolApp.currentUser && (SchoolApp.currentUser.firstName + ' ' + (SchoolApp.currentUser.lastName || '')).trim()) || 'Admin';

      try {
        var openRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'opening');
        await fs.setDoc(openRef, {
          fy: currentFY,
          date: currentFY.split('-')[0] + '-04-01',
          lines: lines,
          status: 'locked',
          lockedAt: new Date().toISOString(),
          lockedBy: userDesc
        });

        SchoolApp.closeModal();
        SchoolApp.showToast('Opening balances locked successfully! Triggering ledger sync...', 'success');
        await this.sync(false);
      } catch (err) {
        console.error('Lock error:', err);
        SchoolApp.showToast('Failed to lock opening balances: ' + err.message, 'error');
      }
    },

    addBankAccountRow: function () {
      var container = document.getElementById('settings-bank-accounts-list');
      if (!container) return;
      var row = document.createElement('div');
      row.className = 'bank-row bank-row-new acc-bank-row';
      row.innerHTML =
        '<input type="text" class="form-control b-label" placeholder="Label (e.g. HDFC General)" required />' +
        '<input type="text" class="form-control b-name" placeholder="Bank Name" required />' +
        '<input type="text" class="form-control b-last4" placeholder="Last 4" maxlength="4" pattern="\\d{4}" required />' +
        '<div style="font-size:11.5px; color:var(--text-muted); text-align:center;"><em>(Auto-assigned)</em></div>' +
        '<div class="acc-bank-actions"><button type="button" class="btn-icon" style="color:var(--danger);" title="Discard un-saved row" onclick="this.closest(\'.bank-row-new\').remove()"><span class="material-icons-round">close</span></button></div>';
      container.appendChild(row);
    },

    toggleBankStatus: function (btn) {
      var row = btn.closest('.bank-row-existing');
      if (!row) return;
      var currentActive = row.getAttribute('data-is-active') !== 'false';
      var newActive = !currentActive;
      row.setAttribute('data-is-active', newActive ? 'true' : 'false');

      var statusBadge = row.querySelector('.badge');
      if (statusBadge) {
        if (newActive) {
          statusBadge.className = 'badge badge-success';
          statusBadge.textContent = 'Active';
          statusBadge.style.background = '';
          statusBadge.style.color = '';
          btn.setAttribute('data-action', 'deactivate');
          btn.textContent = 'Deactivate';
        } else {
          statusBadge.className = 'badge badge-gray';
          statusBadge.textContent = 'Deactivated';
          statusBadge.style.background = '#4b5563';
          statusBadge.style.color = '#fff';
          btn.setAttribute('data-action', 'activate');
          btn.textContent = 'Activate';
        }
      }
    },

    saveSettings: async function (e) {
      if (e) e.preventDefault();
      var btn = document.getElementById('btn-save-settings');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Saving...';
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      try {
        var s = this.settings || {};
        var hasFeeVouchers = !!(s.hasFeeVouchers || (this.syncState && this.syncState.counts && this.syncState.counts.feesPosted > 0));

        var entityType = document.getElementById('settings-entity-type').value;
        var fyMonthInput = document.getElementById('settings-fy-month');
        var fyMonth = fyMonthInput && !fyMonthInput.disabled ? parseInt(fyMonthInput.value, 10) : (s.financialYearStartMonth || 4);
        
        var isGoLiveSaved = !!s.goLiveDate;
        var isGoLiveLocked = isGoLiveSaved && hasFeeVouchers;

        var curGoLive = s.goLiveDate || '';
        var goLiveInput = document.getElementById('settings-golive-date');
        var newGoLive = (goLiveInput && !goLiveInput.disabled) ? goLiveInput.value : (curGoLive || (currentFY.split('-')[0] + '-04-01'));

        var isDigitalSaved = !!s.feeDigitalAccount;
        var isDigitalLocked = isDigitalSaved && !!s.hasDigitalFeeVouchers;
        var digitalAccInput = document.getElementById('settings-fee-digital-acc');
        var feeDigitalAccount = (digitalAccInput && !digitalAccInput.disabled) ? digitalAccInput.value : (s.feeDigitalAccount || '');

        var isCashSaved = !!s.feeCashAccount;
        var isCashLocked = isCashSaved && hasFeeVouchers;
        var cashAccInput = document.getElementById('settings-fee-cash-acc');
        var feeCashAccount = (cashAccInput && !cashAccInput.disabled) ? cashAccInput.value : (s.feeCashAccount || '11100');

        var shouldClearMonthDocUpdateTimes = (!hasFeeVouchers && newGoLive && curGoLive && newGoLive !== curGoLive);

        // Fee Head Mapping
        var headSelects = document.querySelectorAll('.settings-fee-head-select');
        var feeHeadMapping = {};
        headSelects.forEach(function (sel) {
          var hid = sel.getAttribute('data-head-id');
          feeHeadMapping[hid] = sel.value;
        });

        // Bank Accounts
        var existingRows = document.querySelectorAll('#settings-bank-accounts-list .bank-row-existing');
        var newRows = document.querySelectorAll('#settings-bank-accounts-list .bank-row-new');
        var bankAccounts = [];
        var assignedCodes = new Set();

        existingRows.forEach(function (row) {
          var id = row.getAttribute('data-id');
          var ledgerCode = row.getAttribute('data-ledger-code');
          var isAct = row.getAttribute('data-is-active') !== 'false';
          var lbl = row.querySelector('.b-label').value.trim();
          var nm = row.querySelector('.b-name').value.trim();
          var l4 = row.querySelector('.b-last4').value.trim();

          if (nm && l4) {
            assignedCodes.add(ledgerCode);
            bankAccounts.push({
              id: id,
              label: lbl || nm,
              bankName: nm,
              last4: l4.slice(-4),
              ledgerAccountId: ledgerCode,
              isActive: isAct
            });
          }
        });

        (this.chart || []).forEach(function (a) { assignedCodes.add(a.code); });

        var newChartAccountsToCreate = [];
        newRows.forEach(function (row) {
          var lbl = row.querySelector('.b-label').value.trim();
          var nm = row.querySelector('.b-name').value.trim();
          var l4 = row.querySelector('.b-last4').value.trim();

          if (nm && l4) {
            var targetCode = null;
            if (!assignedCodes.has('11200')) {
              targetCode = '11200';
            } else if (!assignedCodes.has('11210')) {
              targetCode = '11210';
            } else {
              for (var c = 11220; c <= 11299; c += 10) {
                var codeStr = String(c);
                if (!assignedCodes.has(codeStr)) {
                  targetCode = codeStr;
                  break;
                }
              }
            }

            if (!targetCode) {
              throw new Error('Maximum bank accounts reached (range 11200-11299 full).');
            }

            assignedCodes.add(targetCode);
            var permanentId = 'bank_' + targetCode;
            bankAccounts.push({
              id: permanentId,
              label: lbl || nm,
              bankName: nm,
              last4: l4.slice(-4),
              ledgerAccountId: targetCode,
              isActive: true
            });

            if (parseInt(targetCode, 10) >= 11220) {
              newChartAccountsToCreate.push({
                code: targetCode,
                name: lbl || (nm + ' ••' + l4.slice(-4)),
                type: 'asset',
                group: 'Current Assets',
                isSystem: false,
                isActive: true,
                createdAt: new Date().toISOString()
              });
            }
          }
        });

        var batch = fs.writeBatch(db);
        var settingsRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'main');
        var updatePayload = {
          entityType: entityType,
          financialYearStartMonth: fyMonth,
          bankAccounts: bankAccounts,
          goLiveDate: newGoLive,
          feeDigitalAccount: feeDigitalAccount,
          feeCashAccount: feeCashAccount,
          feeHeadMapping: feeHeadMapping,
          updatedAt: new Date().toISOString()
        };
        if (shouldClearMonthDocUpdateTimes) {
          updatePayload.clearMonthDocUpdateTimes = true;
        }
        batch.update(settingsRef, updatePayload);

        newChartAccountsToCreate.forEach(function (acc) {
          var accRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_chart', acc.code);
          batch.set(accRef, acc);
        });

        await batch.commit();

        SchoolApp.showToast('Accounts settings updated successfully!', 'success');
        await this.render();
      } catch (err) {
        console.error('Settings save error:', err);
        SchoolApp.showToast('Failed to save settings: ' + (err.message || 'Check connection'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">save</span> Save Settings';
        }
      }
    }
  };

  SchoolApp.modules.accounts = AccountsModule;
  if (typeof SchoolApp.registerModule === 'function') {
    SchoolApp.registerModule('accounts', AccountsModule);
  }
  window.AccountsModule = AccountsModule;
  if (typeof document !== 'undefined') {
    AccountsModule.ensureScopedStyles();
  }

})();


