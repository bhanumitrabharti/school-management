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
    { code: '22900', name: 'Other Payroll Deductions Payable', type: 'liability', group: 'Current Liabilities', isSystem: true, isActive: true },
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
    payrollSubTab: 'runs',
    selectedPayrollMonth: '',
    currentRun: null,
    currentRunLines: [],
    staff: [],
    payrollProfiles: [],
    payrollSettings: null,
    advances: [],
    statutoryPayments: [],
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

      // 9. Fetch Staff Registry
      try {
        var staffColl = fs.collection(db, 'tenant_data', schoolId, 'staff');
        var staffSnap = await fs.getDocs(staffColl);
        this.staff = [];
        staffSnap.forEach(function (docSnap) {
          var d = docSnap.data();
          d.id = docSnap.id;
          this.staff.push(d);
        }.bind(this));
        this.staff.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
      } catch (e) {
        console.warn('[Accounts] Staff fetch error:', e);
        this.staff = [];
      }

      // 10. Fetch Payroll Profiles
      try {
        var profColl = fs.collection(db, 'tenant_data', schoolId, 'payroll_profiles');
        var profSnap = await fs.getDocs(profColl);
        this.payrollProfiles = [];
        profSnap.forEach(function (docSnap) {
          var d = docSnap.data();
          d.id = docSnap.id;
          this.payrollProfiles.push(d);
        }.bind(this));
      } catch (e) {
        console.warn('[Accounts] Profiles fetch error:', e);
        this.payrollProfiles = [];
      }

      // 11. Fetch Payroll Settings
      try {
        var pSetRef = fs.doc(db, 'tenant_data', schoolId, 'payroll_settings', 'main');
        var pSetSnap = await fs.getDoc(pSetRef);
        this.payrollSettings = pSetSnap.exists() ? pSetSnap.data() : null;
      } catch (e) {
        console.warn('[Accounts] Payroll settings fetch error:', e);
        this.payrollSettings = null;
      }

      // 12. Fetch Advances
      try {
        var advColl = fs.collection(db, 'tenant_data', schoolId, 'accounts_advances');
        var advSnap = await fs.getDocs(advColl);
        this.advances = [];
        advSnap.forEach(function (docSnap) {
          var d = docSnap.data();
          d.id = docSnap.id;
          this.advances.push(d);
        }.bind(this));
        this.advances.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
      } catch (e) {
        console.warn('[Accounts] Advances fetch error:', e);
        this.advances = [];
      }

      // 13. Fetch Statutory Payments
      try {
        var statColl = fs.collection(db, 'tenant_data', schoolId, 'accounts_statutory_payments');
        var statSnap = await fs.getDocs(statColl);
        this.statutoryPayments = [];
        statSnap.forEach(function (docSnap) {
          var d = docSnap.data();
          d.id = docSnap.id;
          this.statutoryPayments.push(d);
        }.bind(this));
        this.statutoryPayments.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
      } catch (e) {
        console.warn('[Accounts] Statutory fetch error:', e);
        this.statutoryPayments = [];
      }

      // 14. Load current payroll run for selected month
      if (!this.selectedPayrollMonth) {
        var now = new Date();
        var y = now.getFullYear();
        var m = String(now.getMonth() + 1).padStart(2, '0');
        this.selectedPayrollMonth = y + '-' + m;
      }
      await this.loadPayrollRunForMonth(this.selectedPayrollMonth);

      this.initialized = true;
    },

    loadPayrollRunForMonth: async function (month) {
      var schoolId = this.getSchoolId();
      if (!schoolId) return;
      var fs = window.firestore;
      var db = window.db;

      try {
        var runRef = fs.doc(db, 'tenant_data', schoolId, 'payroll_runs', month);
        var runSnap = await fs.getDoc(runRef);
        if (runSnap.exists()) {
          this.currentRun = runSnap.data();
          var linesColl = fs.collection(db, 'tenant_data', schoolId, 'payroll_runs', month, 'lines');
          var linesSnap = await fs.getDocs(linesColl);
          this.currentRunLines = [];
          linesSnap.forEach(function (docSnap) {
            this.currentRunLines.push(docSnap.data());
          }.bind(this));
          this.currentRunLines.sort(function (a, b) { return String(a.employeeName || '').localeCompare(String(b.employeeName || '')); });
        } else {
          this.currentRun = null;
          this.currentRunLines = [];
        }
      } catch (err) {
        console.warn('[Accounts] Error loading payroll run for ' + month + ':', err);
        this.currentRun = null;
        this.currentRunLines = [];
      }
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
        { id: 'payroll', label: 'Payroll', icon: 'badge' },
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
      } else if (this.activeTab === 'payroll') {
        contentEl.innerHTML = this.renderPayrollHTML();
        this.attachPayrollEvents();
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
      var nowY = now.getFullYear();
      var nowM = now.getMonth() + 1;
      var currentMonthPrefix = nowY + '-' + (nowM < 10 ? '0' : '') + nowM; // Local YYYY-MM

      // Calculate Cash & Bank Balances
      var cashInHandPaise = this.computeAccountBalance('11100');
      var pettyCashPaise = this.computeAccountBalance('11110');
      var bankAccounts = (this.settings && this.settings.bankAccounts) || [];
      var bankBalances = [];
      var totalBanksPaise = 0;
      var handledBankCodes = new Set();

      bankAccounts.forEach(function (b) {
        if (b.isActive === false) return;
        var bCode = b.ledgerAccountId || '11200';
        var bBal = this.computeAccountBalance(bCode);
        totalBanksPaise += bBal;
        bankBalances.push({
          label: b.label || b.bankName,
          code: bCode,
          balancePaise: bBal,
          last4: b.last4
        });
        handledBankCodes.add(bCode);
      }.bind(this));

      // B4: Show EVERY cash/bank asset ledger that has a non-zero balance
      var candidateAssetCodes = new Set(['11200', '11210']);
      (this.chart || []).forEach(function (a) {
        if (a && a.code && (a.code.startsWith('111') || a.code.startsWith('112'))) {
          candidateAssetCodes.add(a.code);
        }
      });
      var summaryAccounts = (this.summary && this.summary.accounts) ? this.summary.accounts : {};
      Object.keys(summaryAccounts).forEach(function (c) {
        if (c.startsWith('111') || c.startsWith('112')) {
          candidateAssetCodes.add(c);
        }
      });

      candidateAssetCodes.forEach(function (code) {
        if (code === '11100' || code === '11110' || handledBankCodes.has(code)) return;
        var bal = this.computeAccountBalance(code);
        if (bal !== 0) {
          var acc = this.chart ? this.chart.find(function (a) { return a.code === code; }) : null;
          var accName = acc ? acc.name : (code === '11200' ? 'Primary Bank Account' : (code === '11210' ? 'Secondary Bank Account' : 'Bank Ledger'));
          bankBalances.push({
            label: accName + ' (' + code + ') — no bank details linked',
            code: code,
            balancePaise: bal,
            last4: '—',
            unlinked: true
          });
          totalBanksPaise += bal;
          handledBankCodes.add(code);
        }
      }.bind(this));

      // Fallback if no configured bank accounts and no active bank ledgers
      if (bankBalances.length === 0) {
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
        } else if (bb.unlinked) {
          html += '      <span style="font-size:11px; color:var(--text-muted);"><a href="javascript:void(0)" onclick="SchoolApp.modules.accounts.switchTab(\'settings\')" style="color:var(--accent-primary); text-decoration:underline; font-weight:500;">Link in Settings</a></span>';
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

      // Section 2.5: Payroll & Statutory Dues Overview (Slice 3)
      var statPf = this.computeAccountBalance('22100');
      var statEmprPf = this.computeAccountBalance('22110');
      var statEsi = this.computeAccountBalance('22200');
      var statPt = this.computeAccountBalance('22300');
      var statTds = this.computeAccountBalance('22400');
      var totalStatutoryDues = statPf + statEmprPf + statEsi + statPt + statTds;

      var salaryStatusText = 'Not calculated';
      var salaryStatusColor = 'var(--text-muted)';
      var salaryAmountPaise = 0;
      if (this.currentRun) {
        salaryAmountPaise = (this.currentRun.totals && this.currentRun.totals.netPayPaise) || 0;
        if (this.currentRun.status === 'paid') {
          salaryStatusText = 'Disbursed (' + this.formatINR(salaryAmountPaise) + ')';
          salaryStatusColor = 'var(--success)';
        } else if (this.currentRun.status === 'approved') {
          salaryStatusText = 'Approved — Pending Payout';
          salaryStatusColor = 'var(--accent-primary)';
        } else if (this.currentRun.status === 'draft') {
          salaryStatusText = 'Draft Calculation';
          salaryStatusColor = 'var(--warning)';
        } else if (this.currentRun.status === 'reversed') {
          salaryStatusText = 'Reversed';
          salaryStatusColor = 'var(--danger)';
        }
      }

      html += '<div class="acc-overview-grid" style="margin-top:20px;">';
      
      // Card 1: Salary Payable This Month
      html += '  <div class="card" style="padding:20px; border-radius:10px;">';
      html += '    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">';
      html += '      <h4 style="font-size:14.5px; font-weight:700; margin:0; color:var(--text-primary); display:flex; align-items:center; gap:6px;">';
      html += '        <span class="material-icons-round" style="font-size:18px; color:var(--accent-primary);">badge</span>';
      html += '        Salary Payable (This Month)';
      html += '      </h4>';
      html += '      <span class="badge" style="background:rgba(255,255,255,0.06); font-size:11px; color:' + salaryStatusColor + ';">' + salaryStatusText + '</span>';
      html += '    </div>';
      html += '    <div style="font-size:24px; font-weight:700; color:var(--text-primary); margin-bottom:8px;">' + this.formatINR(salaryAmountPaise) + '</div>';
      html += '    <div style="font-size:12px; color:var(--text-secondary); margin-bottom:14px;">Net payroll amount payable to staff and teachers for ' + (this.selectedPayrollMonth || currentMonthPrefix) + '.</div>';
      html += '    <div>';
      html += '      <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.switchTab(\'payroll\')" style="font-size:11.5px; width:100%;">Open Monthly Payroll</button>';
      html += '    </div>';
      html += '  </div>';

      // Card 2: Statutory Dues Outstanding
      html += '  <div class="card" style="padding:20px; border-radius:10px;">';
      html += '    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">';
      html += '      <h4 style="font-size:14.5px; font-weight:700; margin:0; color:var(--text-primary); display:flex; align-items:center; gap:6px;">';
      html += '        <span class="material-icons-round" style="font-size:18px; color:#f59e0b;">account_balance</span>';
      html += '        Statutory Dues Outstanding';
      html += '      </h4>';
      html += '      <span class="badge ' + (totalStatutoryDues > 0 ? 'badge-warning' : 'badge-success') + '" style="font-size:11px;">' + (totalStatutoryDues > 0 ? 'Dues Pending' : 'Clear') + '</span>';
      html += '    </div>';
      html += '    <div style="font-size:24px; font-weight:700; color:' + (totalStatutoryDues > 0 ? '#f59e0b' : 'var(--success)') + '; margin-bottom:8px;">' + this.formatINR(totalStatutoryDues) + '</div>';
      html += '    <div style="font-size:12px; color:var(--text-secondary); display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">';
      html += '      <span>EPF: ' + this.formatINR(statPf + statEmprPf) + '</span>';
      html += '      <span>• ESIC: ' + this.formatINR(statEsi) + '</span>';
      html += '      <span>• PT: ' + this.formatINR(statPt) + '</span>';
      html += '      <span>• TDS: ' + this.formatINR(statTds) + '</span>';
      html += '    </div>';
      html += '    <div>';
      html += '      <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.switchPayrollSubTab(\'advances\'); SchoolApp.modules.accounts.switchTab(\'payroll\');" style="font-size:11.5px; width:100%;">Record Statutory Deposit</button>';
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
      var m = now.getMonth() + 1;
      var monthStr = y + '-' + (m < 10 ? '0' : '') + m;
      var lastDay = new Date(y, m, 0).getDate();
      var monthStart = monthStr + '-01';
      var monthEnd = monthStr + '-' + (lastDay < 10 ? '0' : '') + lastDay;

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
    getDayBookVouchers: function (startDate, endDate) {
      var vouchers = [];

      // Fee collections in range
      var feesList = (SchoolApp.store && Array.isArray(SchoolApp.store.fees)) ? SchoolApp.store.fees : [];
      feesList.forEach(function (f) {
        if (!f.date || f.date < startDate || f.date > endDate) return;
        var mode = (f.mode || 'Cash').toLowerCase();
        var drAccount = (mode === 'cash') ? '11100' : '11200';
        var amountPaise = Math.round(Number(f.amount || 0) * 100);
        if (amountPaise <= 0) return;
        vouchers.push({
          date: f.date,
          no: 'FEE-' + (f.receiptNo || f.id),
          type: 'receipt',
          narration: 'Fee collection: student ' + (f.studentId || '') + (f.remarks ? ' - ' + f.remarks : ''),
          lines: [
            { code: drAccount, dr: amountPaise, cr: 0 },
            { code: '41100', dr: 0, cr: amountPaise }
          ]
        });
      });

      // Expenses in range
      (this.expenses || []).forEach(function (e) {
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
      (this.receipts || []).forEach(function (r) {
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
      (this.transfers || []).forEach(function (t) {
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

      // Advances in range (C1)
      (this.advances || []).forEach(function (adv) {
        if (!adv.date || adv.date < startDate || adv.date > endDate) return;
        vouchers.push({
          date: adv.date,
          no: 'ADV-' + (adv.id ? adv.id.slice(-6).toUpperCase() : ''),
          type: 'payment',
          narration: 'Staff Advance: ' + (adv.employeeName || adv.employeeId || '') + (adv.reason ? ' (' + adv.reason + ')' : ''),
          lines: [
            { code: '13100', dr: adv.amountPaise || 0, cr: 0 },
            { code: adv.paidFromAccount || '11100', dr: 0, cr: adv.amountPaise || 0 }
          ]
        });
        if (adv.status === 'cancelled' && adv.cancelledAt) {
          var cDate = adv.cancelledAt.split('T')[0];
          if (cDate >= startDate && cDate <= endDate) {
            vouchers.push({
              date: cDate,
              no: 'CX-ADV-' + (adv.id ? adv.id.slice(-6).toUpperCase() : ''),
              type: 'journal',
              narration: 'Reversal of Staff Advance: ' + (adv.cancelReason || 'Cancelled'),
              lines: [
                { code: adv.paidFromAccount || '11100', dr: adv.amountPaise || 0, cr: 0 },
                { code: '13100', dr: 0, cr: adv.amountPaise || 0 }
              ]
            });
          }
        }
      });

      // Statutory payments in range (C1)
      (this.statutoryPayments || []).forEach(function (stat) {
        if (!stat.date || stat.date < startDate || stat.date > endDate) return;
        var lCode = stat.liabilityAccount;
        if (!lCode) {
          var st = String(stat.type || '').toLowerCase();
          lCode = (st === 'esic' ? '22200' : (st === 'pt' ? '22300' : (st === 'tds' ? '22400' : '22100')));
        }
        var statLines = [];
        if (String(stat.type || '').toLowerCase() === 'epf' && (stat.employeeSharePaise || stat.employerSharePaise)) {
          var ee = Number(stat.employeeSharePaise) || 0;
          var er = Number(stat.employerSharePaise) || 0;
          if (ee > 0) statLines.push({ code: '22100', dr: ee, cr: 0 });
          if (er > 0) statLines.push({ code: '22110', dr: er, cr: 0 });
          var rem = (stat.amountPaise || 0) - ee - er;
          if (rem !== 0) statLines.push({ code: lCode, dr: rem, cr: 0 });
        } else {
          statLines.push({ code: lCode, dr: stat.amountPaise || 0, cr: 0 });
        }
        statLines.push({ code: stat.paidFromAccount || '11200', dr: 0, cr: stat.amountPaise || 0 });

        vouchers.push({
          date: stat.date,
          no: 'STAT-' + (stat.id ? stat.id.slice(-6).toUpperCase() : ''),
          type: 'payment',
          narration: 'Statutory Deposit: ' + String(stat.type || '').toUpperCase() + (stat.challanNumber ? ' (' + stat.challanNumber + ')' : ''),
          lines: statLines
        });

        if (stat.status === 'cancelled' && stat.cancelledAt) {
          var cDate = stat.cancelledAt.split('T')[0];
          if (cDate >= startDate && cDate <= endDate) {
            var revStatLines = statLines.map(function (sl) {
              return { code: sl.code, dr: sl.cr, cr: sl.dr };
            });
            vouchers.push({
              date: cDate,
              no: 'CX-STAT-' + (stat.id ? stat.id.slice(-6).toUpperCase() : ''),
              type: 'journal',
              narration: 'Reversal of Statutory Deposit: ' + (stat.cancelReason || 'Cancelled'),
              lines: revStatLines
            });
          }
        }
      });

      // Payroll run in range (C1)
      if (this.currentRun && (this.currentRun.status === 'paid' || this.currentRun.status === 'reversed')) {
        var pDate = this.currentRun.paymentDate || (this.currentRun.paidFrom && this.currentRun.paidFrom.paidDate) || (this.currentRun.month + '-01');
        var totals = this.currentRun.totals || {};
        var pLines = [];
        if (totals.teacherGrossPaise > 0) pLines.push({ code: '51100', dr: totals.teacherGrossPaise, cr: 0 });
        if (totals.staffGrossPaise > 0) pLines.push({ code: '51200', dr: totals.staffGrossPaise, cr: 0 });
        if (totals.employerPfPaise > 0) pLines.push({ code: '51300', dr: totals.employerPfPaise, cr: 0 });
        if (totals.employerEsiPaise > 0) pLines.push({ code: '51400', dr: totals.employerEsiPaise, cr: 0 });
        if (totals.employeePfPaise > 0) pLines.push({ code: '22100', dr: 0, cr: totals.employeePfPaise });
        if (totals.employerPfPaise > 0) pLines.push({ code: '22110', dr: 0, cr: totals.employerPfPaise });
        if (totals.esiPaise > 0) pLines.push({ code: '22200', dr: 0, cr: totals.esiPaise });
        if (totals.ptPaise > 0) pLines.push({ code: '22300', dr: 0, cr: totals.ptPaise });
        if (totals.tdsPaise > 0) pLines.push({ code: '22400', dr: 0, cr: totals.tdsPaise });
        if (totals.advanceRecoveryPaise > 0) pLines.push({ code: '13100', dr: 0, cr: totals.advanceRecoveryPaise });
        if (totals.otherDeductionsPaise > 0) pLines.push({ code: '22900', dr: 0, cr: totals.otherDeductionsPaise });
        var payoutAcc = (this.currentRun.paidFrom && (this.currentRun.paidFrom.bankAccount || this.currentRun.paidFrom.cashAccount)) || this.currentRun.paidFromAccount || '11200';
        if (totals.netBankPaise > 0) pLines.push({ code: payoutAcc, dr: 0, cr: totals.netBankPaise });
        if (totals.netCashPaise > 0) pLines.push({ code: '11100', dr: 0, cr: totals.netCashPaise });

        if (pDate >= startDate && pDate <= endDate && pLines.length > 0) {
          vouchers.push({
            date: pDate,
            no: 'PAY-' + this.currentRun.month,
            type: 'payment',
            narration: 'Payroll Disbursement for ' + this.currentRun.month,
            lines: pLines
          });
        }

        if (this.currentRun.status === 'reversed' && this.currentRun.reversedAt) {
          var rDate = this.currentRun.reversedAt.split('T')[0];
          if (rDate >= startDate && rDate <= endDate && pLines.length > 0) {
            var revPLines = pLines.map(function (pl) { return { code: pl.code, dr: pl.cr, cr: pl.dr }; });
            vouchers.push({
              date: rDate,
              no: 'CX-PAY-' + this.currentRun.month,
              type: 'journal',
              narration: 'Reversal of Payroll ' + this.currentRun.month + ': ' + (this.currentRun.reversalReason || 'Reversed'),
              lines: revPLines
            });
          }
        }
      }

      vouchers.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
      return vouchers;
    },

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
        var rows = ['Date,Voucher No,Type,Account Code,Account Name,Narration,Debit (INR),Credit (INR)'];
        var vouchers = this.getDayBookVouchers(start, end);
        vouchers.forEach(function (v) {
          v.lines.forEach(function (l) {
            var acc = this.chart.find(function (a) { return a.code === l.code; });
            var accName = acc ? acc.name : l.code;
            rows.push([
              '"' + v.date + '"',
              '"' + (v.no || '').replace(/"/g, '""') + '"',
              '"' + (v.type || '').replace(/"/g, '""') + '"',
              '"' + l.code + '"',
              '"' + accName.replace(/"/g, '""') + '"',
              '"' + (v.narration || '').replace(/"/g, '""') + '"',
              ((l.dr || 0) / 100).toFixed(2),
              ((l.cr || 0) / 100).toFixed(2)
            ].join(','));
          }.bind(this));
        }.bind(this));
        var blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
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
      var isGoLivePendingBackfill = !isGoLiveSaved && hasFeeVouchers;
      var suggestedGoLive = currentFY.split('-')[0] + '-04-01';
      var curGoLive = s.goLiveDate || suggestedGoLive;

      html += '    <div class="form-group" style="margin-bottom:16px;">';
      html += '      <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Accounting Go-Live Date * ' +
        (isGoLiveLocked ? '<span class="badge badge-info" style="font-size:11px; margin-left:6px;">🔒 Locked</span>' : (isGoLivePendingBackfill ? '<span class="badge badge-info" style="font-size:11px; margin-left:6px;">🔒 Pending Sync</span>' : (!isGoLiveSaved ? '<span class="badge badge-warning" style="font-size:11px; margin-left:6px;">Not set</span>' : ''))) +
        '</label>';

      if (isGoLiveLocked) {
        html += '      <input type="date" class="form-control" id="settings-golive-date" value="' + curGoLive + '" disabled style="width:100%; background:var(--bg-secondary); cursor:not-allowed;" />';
        html += '      <small class="form-text text-muted" style="font-size:11.5px; display:block; margin-top:4px;">🔒 <strong>Locked:</strong> Fee vouchers have already been posted to the general ledger. Accounting go-live date cannot be changed.</small>';
      } else if (isGoLivePendingBackfill) {
        html += '      <input type="text" class="form-control" id="settings-golive-date" value="Will be set automatically on next sync" disabled style="width:100%; background:var(--bg-secondary); cursor:not-allowed;" />';
        html += '      <small class="form-text text-muted" style="font-size:11.5px; display:block; margin-top:4px;">🔒 <strong>Pending Sync:</strong> Fee vouchers have already been posted to the general ledger. Accounting go-live date will be set automatically on next sync (financial year start date: ' + suggestedGoLive + ').</small>';
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
      if (isCashLocked) {
        var cashChartAcc = this.chart ? this.chart.find(function (a) { return a.code === curCash; }) : null;
        var cashName = cashChartAcc ? cashChartAcc.name : (curCash === '11100' ? 'Cash in Hand' : 'Cash Account');
        html += '        <input type="text" class="form-control" id="settings-fee-cash-acc" value="' + curCash + ' - ' + SchoolApp.escapeHTML(cashName) + '" disabled style="background:var(--bg-secondary); cursor:not-allowed;" />';
        html += '        <small class="form-text text-muted" style="font-size:11px;">🔒 <strong>Locked:</strong> Cash fee vouchers have already been posted to the general ledger.</small>';
      } else {
        html += '        <input type="text" class="form-control" id="settings-fee-cash-acc" value="' + curCash + '" readonly style="background:var(--bg-secondary);" />';
        if (!isCashSaved) {
          html += '        <small class="form-text text-muted" style="font-size:11px;">11100 - Cash in Hand (suggested default)</small>';
        } else {
          html += '        <small class="form-text text-muted" style="font-size:11px;">11100 - Cash in Hand</small>';
        }
      }
      html += '      </div>';

      html += '      <div class="form-group">';
      html += '        <label class="form-label" style="font-weight:600; font-size:12.5px; display:block; margin-bottom:4px;">Digital Fee Collection Bank Ledger * ' +
        (isDigitalLocked ? '<span class="badge badge-info" style="font-size:11px; margin-left:6px;">🔒 Locked</span>' : (!isDigitalSaved ? '<span class="badge badge-warning" style="font-size:11px; margin-left:6px;">Not set</span>' : '')) +
        '</label>';

      if (isDigitalLocked) {
        var digChartAcc = this.chart ? this.chart.find(function (a) { return a.code === s.feeDigitalAccount; }) : null;
        var digBank = bankAccounts.find(function (b) { return b.ledgerAccountId === s.feeDigitalAccount; });
        var digName = digBank ? ((digBank.label || digBank.bankName) + ' (**' + (digBank.last4 || '') + ')') : (digChartAcc ? digChartAcc.name : (s.feeDigitalAccount === '11200' ? 'Primary Bank Account' : 'Bank Ledger'));
        var readOnlyDigText = s.feeDigitalAccount + ' - ' + digName;
        html += '        <input type="text" class="form-control" id="settings-fee-digital-acc" value="' + SchoolApp.escapeHTML(readOnlyDigText) + '" disabled style="background:var(--bg-secondary); cursor:not-allowed;" />';
        html += '        <small class="form-text text-muted" style="font-size:11px;">🔒 <strong>Locked:</strong> Digital fee vouchers have already been posted to the general ledger. Target bank ledger cannot be changed.</small>';
      } else {
        html += '        <select class="form-control form-select" id="settings-fee-digital-acc" required>';
        var offeredCodes = new Set();
        var selectedDigCode = s.feeDigitalAccount || ((bankAccounts.length > 0 && bankAccounts[0].isActive !== false) ? (bankAccounts[0].ledgerAccountId || '11200') : '11200');

        // 1. Configured active bank ledgers (B5)
        bankAccounts.forEach(function (b) {
          if (b.isActive !== false) {
            var bCode = b.ledgerAccountId || '11200';
            var sel = (selectedDigCode === bCode) ? 'selected' : '';
            html += '          <option value="' + bCode + '" ' + sel + '>' + bCode + ' - ' + SchoolApp.escapeHTML(b.label || b.bankName) + ' (**' + (b.last4 || '') + ')' + (!isDigitalSaved && bCode === selectedDigCode ? ' (suggested)' : '') + '</option>';
            offeredCodes.add(bCode);
          }
        });

        // 2. Seeded 11200/11210 if not among active configured banks (B5)
        if (!offeredCodes.has('11200')) {
          var sel11200 = (selectedDigCode === '11200') ? 'selected' : '';
          html += '          <option value="11200" ' + sel11200 + '>11200 - Primary Bank Account (no bank details linked · link below)' + (!isDigitalSaved && selectedDigCode === '11200' ? ' (suggested)' : '') + '</option>';
          offeredCodes.add('11200');
        }
        if (!offeredCodes.has('11210')) {
          var sel11210 = (selectedDigCode === '11210') ? 'selected' : '';
          html += '          <option value="11210" ' + sel11210 + '>11210 - Secondary Bank Account (no bank details linked · link below)</option>';
          offeredCodes.add('11210');
        }

        // 3. Saved value if not already in options (B1)
        if (s.feeDigitalAccount && !offeredCodes.has(s.feeDigitalAccount)) {
          var savedChartAcc = this.chart ? this.chart.find(function (a) { return a.code === s.feeDigitalAccount; }) : null;
          var savedName = savedChartAcc ? savedChartAcc.name : 'Saved Account';
          html += '          <option value="' + s.feeDigitalAccount + '" selected>' + s.feeDigitalAccount + ' - ' + SchoolApp.escapeHTML(savedName) + '</option>';
          offeredCodes.add(s.feeDigitalAccount);
        }

        html += '        </select>';

        if (!isDigitalSaved) {
          html += '        <small class="form-text text-muted" style="font-size:11px;"><strong>Not set:</strong> Suggested default is preselected. Choose the target bank ledger for UPI, Net Banking, and Cheque fee receipts.</small>';
        } else {
          html += '        <small class="form-text text-muted" style="font-size:11px;">Target bank ledger for UPI, Net Banking, and Cheque fee receipts. Can be updated until first digital fee voucher is posted.</small>';
        }
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
        var headOffered = new Set();
        incomeAccounts.forEach(function (acc) {
          var sel = (curMapped === acc.code) ? 'selected' : '';
          html += '                <option value="' + acc.code + '" ' + sel + '>' + acc.code + ' - ' + SchoolApp.escapeHTML(acc.name) + '</option>';
          headOffered.add(acc.code);
        });
        if (curMapped && !headOffered.has(curMapped)) {
          var cAcc = this.chart ? this.chart.find(function (a) { return a.code === curMapped; }) : null;
          var cName = cAcc ? cAcc.name : 'Mapped Account';
          html += '                <option value="' + curMapped + '" selected>' + curMapped + ' - ' + SchoolApp.escapeHTML(cName) + '</option>';
        }
        html += '              </select>';
        html += '            </td>';
        html += '          </tr>';
      }.bind(this));

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
      var unlinkedCodes = ['11200', '11210'].filter(function (c) {
        return !bankAccounts.some(function (x) { return x.ledgerAccountId === c && x.isActive !== false; });
      });

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

          // B3: Allow moving details from an empty ledger (zero balance, no vouchers) to an unlinked seeded ledger
          var bCode = b.ledgerAccountId || '11200';
          var bBal = this.computeAccountBalance(bCode);
          var bSumm = (this.summary && this.summary.accounts && this.summary.accounts[bCode]) ? this.summary.accounts[bCode] : {};
          var bHasVch = Object.values(bSumm).some(function (m) { return ((m.dr || 0) > 0 || (m.cr || 0) > 0); });
          var isEmptyLedger = (bBal === 0 && !bHasVch && isAct);
          var moveBtns = '';
          if (isEmptyLedger && unlinkedCodes.length > 0) {
            unlinkedCodes.forEach(function (uCode) {
              moveBtns += ' <button type="button" class="btn btn-sm btn-outline-primary b-move-btn" style="font-size:11px; padding:4px 8px; margin-left:4px;" onclick="SchoolApp.modules.accounts.moveBankToSeededLedger(\'' + bCode + '\', \'' + uCode + '\')" title="Move details to seeded ledger ' + uCode + ' and deactivate ' + bCode + '">Move to ' + uCode + '</button>';
            });
          }

          html += '      <div class="bank-row bank-row-existing acc-bank-row" data-id="' + SchoolApp.escapeHTML(b.id || ('bank_' + (b.ledgerAccountId || idx))) + '" data-ledger-code="' + SchoolApp.escapeHTML(b.ledgerAccountId || '11200') + '" data-is-active="' + (isAct ? 'true' : 'false') + '" >';
          html += '        <input type="text" class="form-control b-label" placeholder="Label" value="' + SchoolApp.escapeHTML(b.label || '') + '" required />';
          html += '        <input type="text" class="form-control b-name" placeholder="Bank Name" value="' + SchoolApp.escapeHTML(b.bankName || '') + '" required />';
          html += '        <input type="text" class="form-control b-last4" placeholder="Last 4" maxlength="4" pattern="\\d{4}" value="' + SchoolApp.escapeHTML(b.last4 || '') + '" required />';
          html += '        <div style="font-size:11.5px; color:var(--text-secondary); text-align:center;">Code: <strong>' + SchoolApp.escapeHTML(b.ledgerAccountId || '11200') + '</strong></div>';
          html += '        <div class="acc-bank-actions">' + statusBadge + ' ' + toggleBtn + moveBtns + '</div>';
          html += '      </div>';
        }.bind(this));
      }
      html += '    </div>';

      // B3: Display unlinked seeded ledgers with option to link bank details
      if (unlinkedCodes.length > 0) {
        html += '    <div style="margin-top:16px; padding:14px; background:var(--bg-secondary); border-radius:8px; border:1px dashed var(--border-color);">';
        html += '      <div style="font-size:12.5px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">Unlinked Seeded Bank Ledgers</div>';
        html += '      <p style="font-size:11.5px; color:var(--text-secondary); margin:0 0 10px 0;">Standard system bank accounts available in Chart of Accounts without linked bank details.</p>';
        unlinkedCodes.forEach(function (uCode) {
          var uBal = this.computeAccountBalance(uCode);
          var uName = (uCode === '11200') ? 'Primary Bank Account' : 'Secondary Bank Account';
          var balBadge = (uBal !== 0) ? (' <span class="badge badge-info" style="font-size:10.5px; margin-left:4px;">Balance: ' + this.formatINR(uBal) + '</span>') : '';
          html += '      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-top:1px solid var(--border-color); flex-wrap:wrap; gap:8px;">';
          html += '        <div>';
          html += '          <strong style="font-size:12.5px;">' + uCode + ' - ' + uName + '</strong>' + balBadge;
          html += '          <div style="font-size:11px; color:var(--text-muted);">No bank account details linked</div>';
          html += '        </div>';
          html += '        <button type="button" class="btn btn-sm btn-secondary" onclick="SchoolApp.modules.accounts.promptLinkBankDetails(\'' + uCode + '\')" style="font-size:11.5px; padding:4px 10px;">';
          html += '          <span class="material-icons-round" style="font-size:15px; vertical-align:middle;">link</span> Link Bank Details';
          html += '        </button>';
          html += '      </div>';
        }.bind(this));
        html += '    </div>';
      }
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
      var codesOffered = new Set();
      this.chart.forEach(function (acc) {
        var sel = (acc.code === code) ? 'selected' : '';
        html += '    <option value="' + acc.code + '" ' + sel + '>' + acc.code + ' - ' + SchoolApp.escapeHTML(acc.name) + '</option>';
        codesOffered.add(acc.code);
      });
      if (code && !codesOffered.has(code)) {
        html += '    <option value="' + code + '" selected>' + code + ' - Saved Account</option>';
      }
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

    getNextAvailableBankLedgerCode: function (currentBankAccounts) {
      var linkedCodes = new Set();
      (currentBankAccounts || []).forEach(function (b) {
        if (b && b.ledgerAccountId) linkedCodes.add(String(b.ledgerAccountId));
      });

      // Seeded ledgers: 11200 and 11210 count as available if no bank entry is linked to them (B2)
      if (!linkedCodes.has('11200')) {
        return '11200';
      }
      if (!linkedCodes.has('11210')) {
        return '11210';
      }

      // Next free 112xx (11220-11290)
      var chartCodes = new Set();
      (this.chart || []).forEach(function (a) {
        if (a && a.code) chartCodes.add(String(a.code));
      });

      for (var c = 11220; c <= 11290; c += 10) {
        var codeStr = String(c);
        if (!linkedCodes.has(codeStr) && !chartCodes.has(codeStr)) {
          return codeStr;
        }
      }

      throw new Error('Maximum bank accounts reached (range 11200-11299 full).');
    },

    moveBankToSeededLedger: async function (fromCode, toCode) {
      if (!fromCode || !toCode) return;
      if (toCode !== '11200' && toCode !== '11210') {
        SchoolApp.showToast('Target ledger must be a seeded ledger (11200 or 11210).', 'error');
        return;
      }

      var bankAccounts = (this.settings && Array.isArray(this.settings.bankAccounts)) ? this.settings.bankAccounts : [];
      var sourceBank = bankAccounts.find(function (b) { return b.ledgerAccountId === fromCode; });
      if (!sourceBank) {
        SchoolApp.showToast('Source bank entry not found for ledger ' + fromCode + '.', 'error');
        return;
      }

      var targetBank = bankAccounts.find(function (b) { return b.ledgerAccountId === toCode && b.isActive !== false; });
      if (targetBank) {
        SchoolApp.showToast('Seeded ledger ' + toCode + ' already has an active bank account linked.', 'error');
        return;
      }

      // Never re-point a ledger that has vouchers or non-zero balance (B3)
      var bal = this.computeAccountBalance(fromCode);
      var summaryData = (this.summary && this.summary.accounts && this.summary.accounts[fromCode]) ? this.summary.accounts[fromCode] : {};
      var hasVouchers = Object.values(summaryData).some(function (m) { return ((m.dr || 0) > 0 || (m.cr || 0) > 0); });
      if (bal !== 0 || hasVouchers) {
        SchoolApp.showToast('Cannot re-point ledger ' + fromCode + ': this ledger already has posted vouchers or transactions.', 'error');
        return;
      }

      if (typeof confirm === 'function' && !confirm('Move bank details from ' + fromCode + ' to seeded ledger ' + toCode + ' and deactivate ' + fromCode + '?')) {
        return;
      }

      try {
        var schoolId = this.getSchoolId();
        var fs = window.firestore;
        var db = window.db;
        var nowIso = new Date().toISOString();

        var updatedBankAccounts = bankAccounts.map(function (b) {
          if (b.ledgerAccountId === fromCode) {
            return Object.assign({}, b, { isActive: false });
          }
          return b;
        });

        var existingTargetIdx = updatedBankAccounts.findIndex(function (b) { return b.ledgerAccountId === toCode; });
        var targetEntry = {
          id: 'bank_' + toCode,
          label: sourceBank.label || sourceBank.bankName,
          bankName: sourceBank.bankName,
          last4: sourceBank.last4,
          ledgerAccountId: toCode,
          isActive: true
        };

        if (existingTargetIdx >= 0) {
          updatedBankAccounts[existingTargetIdx] = targetEntry;
        } else {
          updatedBankAccounts.push(targetEntry);
        }

        var updateSettings = {
          bankAccounts: updatedBankAccounts,
          updatedAt: nowIso
        };

        if (this.settings && this.settings.feeDigitalAccount === fromCode) {
          updateSettings.feeDigitalAccount = toCode;
          this.settings.feeDigitalAccount = toCode;
        }

        var batch = fs.writeBatch(db);
        var settingsRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'main');
        batch.update(settingsRef, updateSettings);

        if (parseInt(fromCode, 10) >= 11220) {
          var chartRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_chart', fromCode);
          batch.update(chartRef, { isActive: false, updatedAt: nowIso });
        }

        await batch.commit();

        this.settings.bankAccounts = updatedBankAccounts;
        if (this.chart) {
          var cAcc = this.chart.find(function (a) { return a.code === fromCode; });
          if (cAcc) cAcc.isActive = false;
        }

        SchoolApp.showToast('Bank details moved to ' + toCode + ' and ' + fromCode + ' deactivated.', 'success');
        await this.render();
      } catch (err) {
        console.error('Error moving bank to seeded ledger:', err);
        SchoolApp.showToast('Failed to move bank details: ' + err.message, 'error');
      }
    },

    linkBankDetails: async function (targetCode, details) {
      if (!targetCode || !details) return;
      if (targetCode !== '11200' && targetCode !== '11210') {
        SchoolApp.showToast('Target ledger must be a seeded ledger (11200 or 11210).', 'error');
        return;
      }

      var bankAccounts = (this.settings && Array.isArray(this.settings.bankAccounts)) ? this.settings.bankAccounts.slice() : [];
      var existingIdx = bankAccounts.findIndex(function (b) { return b.ledgerAccountId === targetCode; });
      var newEntry = {
        id: 'bank_' + targetCode,
        label: details.label || details.bankName,
        bankName: details.bankName,
        last4: String(details.last4 || '').slice(-4),
        ledgerAccountId: targetCode,
        isActive: true
      };

      if (existingIdx >= 0) {
        bankAccounts[existingIdx] = newEntry;
      } else {
        bankAccounts.push(newEntry);
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;
      var nowIso = new Date().toISOString();

      var updatePayload = {
        bankAccounts: bankAccounts,
        updatedAt: nowIso
      };

      if (!this.settings.feeDigitalAccount) {
        updatePayload.feeDigitalAccount = targetCode;
        this.settings.feeDigitalAccount = targetCode;
      }

      var settingsRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'main');
      await fs.updateDoc(settingsRef, updatePayload);

      this.settings.bankAccounts = bankAccounts;
      SchoolApp.showToast('Bank details linked to ledger ' + targetCode + '.', 'success');
      await this.render();
    },

    promptLinkBankDetails: function (targetCode) {
      var bankName = prompt('Enter Bank Name for ledger ' + targetCode + ' (e.g. ICICI Bank, SBI):');
      if (!bankName || !bankName.trim()) return;
      var last4 = prompt('Enter last 4 digits of bank account number:');
      if (!last4 || !last4.trim()) return;
      var label = prompt('Enter a label (optional, e.g. Operating Account):', bankName);

      this.linkBankDetails(targetCode, {
        bankName: bankName.trim(),
        last4: last4.trim(),
        label: (label || bankName).trim()
      });
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
        var isGoLivePendingBackfill = !isGoLiveSaved && hasFeeVouchers;

        var curGoLive = s.goLiveDate || '';
        var goLiveInput = document.getElementById('settings-golive-date');
        var newGoLive = isGoLivePendingBackfill ? '' : ((goLiveInput && !goLiveInput.disabled) ? goLiveInput.value : (curGoLive || (currentFY.split('-')[0] + '-04-01')));

        var isDigitalSaved = !!s.feeDigitalAccount;
        var isDigitalLocked = isDigitalSaved && !!s.hasDigitalFeeVouchers;
        var digitalAccInput = document.getElementById('settings-fee-digital-acc');
        var feeDigitalAccount = (digitalAccInput && !digitalAccInput.disabled) ? digitalAccInput.value : (s.feeDigitalAccount || '');

        var isCashSaved = !!s.feeCashAccount;
        var isCashLocked = isCashSaved && hasFeeVouchers;
        var cashAccInput = document.getElementById('settings-fee-cash-acc');
        var feeCashAccount = (cashAccInput && !cashAccInput.disabled) ? (cashAccInput.value.slice(0, 5)) : (s.feeCashAccount || '11100');

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

        var newChartAccountsToCreate = [];
        newRows.forEach(function (row) {
          var lbl = row.querySelector('.b-label').value.trim();
          var nm = row.querySelector('.b-name').value.trim();
          var l4 = row.querySelector('.b-last4').value.trim();

          if (nm && l4) {
            var targetCode = this.getNextAvailableBankLedgerCode(bankAccounts);
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
        }.bind(this));

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
    },

    // ══════════════════════════════════════════════════════════════════════════
    // TAB: PAYROLL & COMPENSATION (Accounts Slice 3)
    // ══════════════════════════════════════════════════════════════════════════

    switchPayrollSubTab: function (subTabId) {
      this.payrollSubTab = subTabId;
      this.renderCurrentTab();
    },

    changePayrollMonth: async function (month) {
      if (!month) return;
      this.selectedPayrollMonth = month;
      await this.loadPayrollRunForMonth(month);
      this.renderCurrentTab();
    },

    runPayrollAction: async function (actionName, payload) {
      var schoolId = this.getSchoolId();
      if (!schoolId) throw new Error('No school ID found');
      var authUser = window.auth && window.auth.currentUser;
      if (!authUser) throw new Error('Authentication session not ready');
      var idToken = await authUser.getIdToken();

      var body = Object.assign({
        idToken: idToken,
        schoolId: schoolId,
        action: 'payroll-' + actionName,
        month: this.selectedPayrollMonth
      }, payload || {});

      var res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      var data;
      try {
        data = await res.json();
      } catch (err) {
        throw new Error('Server returned invalid response');
      }

      if (!res.ok) {
        throw new Error(data.error || 'Server error (' + res.status + ')');
      }
      return data;
    },

    renderPayrollHTML: function () {
      var html = '';
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px;">';
      html += '  <div>';
      html += '    <h3 style="margin:0; font-size:19px; font-weight:700; color:var(--text-primary); display:flex; align-items:center; gap:8px;">';
      html += '      <span class="material-icons-round" style="color:var(--accent-primary);">badge</span> Payroll & Compensation';
      html += '    </h3>';
      html += '    <p style="margin:4px 0 0 0; font-size:12.5px; color:var(--text-secondary);">Manage staff registry, salary profiles, monthly runs, advances, and statutory payments.</p>';
      html += '  </div>';
      html += '</div>';

      // Sub-tab pills
      var subTabs = [
        { id: 'runs', label: 'Monthly Run', icon: 'calendar_month' },
        { id: 'staff', label: 'Staff Registry (' + this.staff.length + ')', icon: 'people' },
        { id: 'profiles', label: 'Salary Profiles', icon: 'badge' },
        { id: 'advances', label: 'Advances & Statutory (' + this.advances.filter(function (a) { return a.status !== 'cancelled'; }).length + ')', icon: 'account_balance' },
        { id: 'settings', label: 'Payroll Settings', icon: 'tune' }
      ];

      html += '<div class="acc-tab-bar" style="margin-bottom:18px;">';
      subTabs.forEach(function (s) {
        var isAct = (this.payrollSubTab === s.id);
        html += '<button class="tab-btn ' + (isAct ? 'active' : '') + '" onclick="SchoolApp.modules.accounts.switchPayrollSubTab(\'' + s.id + '\')">';
        html += '  <span class="material-icons-round">' + s.icon + '</span> ' + s.label;
        html += '</button>';
      }.bind(this));
      html += '</div>';

      if (this.payrollSubTab === 'runs') {
        html += this.renderPayrollRunsHTML();
      } else if (this.payrollSubTab === 'staff') {
        html += this.renderPayrollStaffHTML();
      } else if (this.payrollSubTab === 'profiles') {
        html += this.renderPayrollProfilesHTML();
      } else if (this.payrollSubTab === 'advances') {
        html += this.renderPayrollAdvancesHTML();
      } else if (this.payrollSubTab === 'settings') {
        html += this.renderPayrollSettingsHTML();
      }

      return html;
    },

    // ── 1. Monthly Run Sub-tab ───────────────────────────────────────────────
    renderPayrollRunsHTML: function () {
      var html = '';
      var run = this.currentRun;
      var status = run ? run.status : 'not_calculated';
      var lines = this.currentRunLines || [];

      // Top control bar
      html += '<div class="card" style="padding:14px 18px; border-radius:10px; margin-bottom:18px;">';
      html += '  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">';
      html += '    <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">';
      html += '      <div style="display:flex; align-items:center; gap:8px;">';
      html += '        <label style="font-weight:600; font-size:13px; margin:0; color:var(--text-secondary);">Payroll Month:</label>';
      html += '        <input type="month" class="form-control" style="width:auto; min-width:160px; font-weight:600;" value="' + this.selectedPayrollMonth + '" onchange="SchoolApp.modules.accounts.changePayrollMonth(this.value)" />';
      html += '      </div>';

      // Status pill
      if (!run || status === 'not_calculated') {
        html += '      <span class="badge" style="background:rgba(255,255,255,0.06); color:var(--text-muted); font-size:12px; padding:6px 12px;">Not Calculated</span>';
      } else if (status === 'draft') {
        html += '      <span class="badge badge-warning" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:4px;"><span class="material-icons-round" style="font-size:14px;">edit_note</span> Draft Calculation</span>';
      } else if (status === 'approved') {
        html += '      <span class="badge badge-info" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:4px;"><span class="material-icons-round" style="font-size:14px;">check_circle</span> Approved (Pending Payout)</span>';
      } else if (status === 'paid') {
        html += '      <span class="badge badge-success" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:4px;"><span class="material-icons-round" style="font-size:14px;">verified</span> Paid & Disbursed</span>';
      } else if (status === 'reversed') {
        html += '      <span class="badge badge-danger" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:4px;"><span class="material-icons-round" style="font-size:14px;">undo</span> Reversed</span>';
      }
      html += '    </div>';

      // Action buttons
      html += '    <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">';
      if (!run || status === 'not_calculated') {
        html += '      <button class="btn btn-primary" id="btn-calc-payroll" onclick="SchoolApp.modules.accounts.calculatePayrollRun()">';
        html += '        <span class="material-icons-round">calculate</span> Calculate Payroll';
        html += '      </button>';
      } else if (status === 'draft') {
        html += '      <button class="btn btn-secondary" id="btn-calc-payroll" onclick="SchoolApp.modules.accounts.calculatePayrollRun()">';
        html += '        <span class="material-icons-round">sync</span> Recalculate';
        html += '      </button>';
        html += '      <button class="btn btn-primary" onclick="SchoolApp.modules.accounts.confirmApproveRun()">';
        html += '        <span class="material-icons-round">check_circle</span> Approve Run';
        html += '      </button>';
        html += '      <button class="btn btn-secondary" onclick="SchoolApp.modules.accounts.exportSalaryRegisterCSV()">';
        html += '        <span class="material-icons-round">download</span> Salary Register CSV';
        html += '      </button>';
      } else if (status === 'approved') {
        html += '      <button class="btn btn-primary" onclick="SchoolApp.modules.accounts.openDisburseModal()">';
        html += '        <span class="material-icons-round">payments</span> Pay / Disburse';
        html += '      </button>';
        html += '      <button class="btn btn-secondary" onclick="SchoolApp.modules.accounts.reopenPayrollRun()">';
        html += '        <span class="material-icons-round">lock_open</span> Reopen Run';
        html += '      </button>';
        html += '      <button class="btn btn-secondary" onclick="SchoolApp.modules.accounts.exportSalaryRegisterCSV()">';
        html += '        <span class="material-icons-round">download</span> Salary Register CSV';
        html += '      </button>';
      } else if (status === 'paid') {
        html += '      <button class="btn btn-secondary" onclick="SchoolApp.modules.accounts.exportSalaryRegisterCSV()">';
        html += '        <span class="material-icons-round">download</span> Salary Register CSV';
        html += '      </button>';
        html += '      <button class="btn btn-danger btn-sm" onclick="SchoolApp.modules.accounts.openReverseModal()" style="margin-left:4px;">';
        html += '        <span class="material-icons-round">undo</span> Reverse Run';
        html += '      </button>';
      } else if (status === 'reversed') {
        html += '      <button class="btn btn-primary" id="btn-calc-payroll" onclick="SchoolApp.modules.accounts.calculatePayrollRun()">';
        html += '        <span class="material-icons-round">calculate</span> Recalculate Payroll';
        html += '      </button>';
        html += '      <button class="btn btn-secondary" onclick="SchoolApp.modules.accounts.exportSalaryRegisterCSV()">';
        html += '        <span class="material-icons-round">download</span> Salary Register CSV';
        html += '      </button>';
      }
      html += '    </div>';
      html += '  </div>';
      html += '</div>';

      // Warnings banner
      if (run && lines.length > 0) {
        var negativeNetEmps = lines.filter(function (l) { return l.hasNegativeNet || l.netPayPaise < 0; });
        var missingBankEmps = lines.filter(function (l) { return !l.last4; });

        if (run.warnings && run.warnings.length > 0) {
          run.warnings.forEach(function (w) {
            html += '<div style="margin-bottom:12px; padding:10px 14px; border-radius:8px; background:rgba(245, 158, 11, 0.1); border-left:4px solid #f59e0b; font-size:12.5px; color:#d97706; display:flex; align-items:center; gap:8px;">';
            html += '  <span class="material-icons-round" style="font-size:18px;">info</span>';
            html += '  <div>' + SchoolApp.escapeHTML(w) + '</div>';
            html += '</div>';
          });
        }

        if (negativeNetEmps.length > 0) {
          html += '<div style="margin-bottom:16px; padding:12px 16px; border-radius:8px; background:rgba(239, 68, 68, 0.12); border-left:4px solid var(--danger); font-size:13px; color:var(--danger); display:flex; align-items:center; gap:8px;">';
          html += '  <span class="material-icons-round" style="font-size:20px;">warning</span>';
          html += '  <div><strong>Negative Net Pay Warning:</strong> ' + negativeNetEmps.length + ' employee(s) (' + negativeNetEmps.map(function (e) { return e.employeeName; }).join(', ') + ') have deductions exceeding their gross pay. Please click "Inputs" to adjust deductions or advance recovery before approval.</div>';
          html += '</div>';
        }

        if (missingBankEmps.length > 0 && status !== 'paid') {
          html += '<div style="margin-bottom:16px; padding:10px 14px; border-radius:8px; background:rgba(245, 158, 11, 0.1); border-left:4px solid #f59e0b; font-size:12.5px; color:#d97706; display:flex; align-items:center; gap:8px;">';
          html += '  <span class="material-icons-round" style="font-size:18px;">info</span>';
          html += '  <div><strong>Missing Bank Details:</strong> ' + missingBankEmps.length + ' employee(s) do not have bank details (last 4 digits) configured in Salary Profiles. Cash payout or profile update required.</div>';
          html += '</div>';
        }
      }

      // Summary Cards
      if (run && run.totals) {
        var totals = run.totals;
        var totalEeDed = (totals.employeePfPaise || 0) + (totals.employeeEsiPaise || 0) + (totals.ptPaise || 0) + (totals.tdsPaise || 0) + (totals.advanceRecoveryPaise || 0) + (totals.otherDeductionsPaise || 0);
        var totalErContrib = (totals.employerPfPaise || 0) + (totals.employerEsiPaise || 0);
        var totalCostToSchool = (totals.grossPaise || 0) + totalErContrib;

        html += '<div class="acc-overview-grid" style="margin-bottom:20px;">';
        
        // Card 1: Gross Pay
        html += '  <div class="card" style="padding:16px; border-radius:10px;">';
        html += '    <div style="font-size:11.5px; font-weight:600; text-transform:uppercase; color:var(--text-secondary); margin-bottom:4px;">Gross Earnings</div>';
        html += '    <div style="font-size:22px; font-weight:700; color:var(--text-primary);">' + this.formatINR(totals.grossPaise || 0) + '</div>';
        html += '    <div style="font-size:11.5px; color:var(--text-muted); margin-top:4px;">' + (lines.length) + ' employees in run</div>';
        html += '  </div>';

        // Card 2: Total Deductions
        html += '  <div class="card" style="padding:16px; border-radius:10px;">';
        html += '    <div style="font-size:11.5px; font-weight:600; text-transform:uppercase; color:var(--text-secondary); margin-bottom:4px;">Total Deductions</div>';
        html += '    <div style="font-size:22px; font-weight:700; color:var(--danger);">' + this.formatINR(totalEeDed) + '</div>';
        html += '    <div style="font-size:11.5px; color:var(--text-muted); margin-top:4px;">PF, ESI, PT, TDS, Adv, Other</div>';
        html += '  </div>';

        // Card 3: Net Payable
        html += '  <div class="card" style="padding:16px; border-radius:10px; border:1px solid var(--accent-primary); background:rgba(99, 102, 241, 0.04);">';
        html += '    <div style="font-size:11.5px; font-weight:600; text-transform:uppercase; color:var(--accent-primary); margin-bottom:4px;">Net Payable to Staff</div>';
        html += '    <div style="font-size:24px; font-weight:700; color:var(--accent-primary);">' + this.formatINR(totals.netPayPaise || 0) + '</div>';
        html += '    <div style="font-size:11.5px; color:var(--text-secondary); margin-top:4px;">Disbursable amount</div>';
        html += '  </div>';

        // Card 4: Employer Costs
        html += '  <div class="card" style="padding:16px; border-radius:10px;">';
        html += '    <div style="font-size:11.5px; font-weight:600; text-transform:uppercase; color:var(--text-secondary); margin-bottom:4px;">Employer Statutory</div>';
        html += '    <div style="font-size:22px; font-weight:700; color:#f59e0b;">' + this.formatINR(totalErContrib) + '</div>';
        html += '    <div style="font-size:11.5px; color:var(--text-muted); margin-top:4px;">PF + EPS + ESIC share</div>';
        html += '  </div>';

        // Card 5: Total Cost to School
        html += '  <div class="card" style="padding:16px; border-radius:10px;">';
        html += '    <div style="font-size:11.5px; font-weight:600; text-transform:uppercase; color:var(--text-secondary); margin-bottom:4px;">Total CTC (Cost to School)</div>';
        html += '    <div style="font-size:22px; font-weight:700; color:var(--text-primary);">' + this.formatINR(totalCostToSchool) + '</div>';
        html += '    <div style="font-size:11.5px; color:var(--text-muted); margin-top:4px;">Gross + Employer Statutory</div>';
        html += '  </div>';

        html += '</div>';
      }

      // Employees Run Table
      if (!run || lines.length === 0) {
        html += '<div class="card" style="padding:48px 24px; text-align:center; border-radius:10px; color:var(--text-secondary);">';
        html += '  <span class="material-icons-round" style="font-size:48px; color:var(--text-muted); margin-bottom:12px;">badge</span>';
        html += '  <p style="font-weight:600; font-size:15px; margin:0 0 6px 0; color:var(--text-primary);">No payroll calculated for ' + this.selectedPayrollMonth + '</p>';
        html += '  <p style="font-size:13px; max-width:520px; margin:0 auto 20px auto;">Click "Calculate Payroll" to aggregate teacher attendance records, staff base salaries, statutory rules, and generate monthly payslips.</p>';
        html += '  <button class="btn btn-primary" onclick="SchoolApp.modules.accounts.calculatePayrollRun()">';
        html += '    <span class="material-icons-round">calculate</span> Calculate Payroll';
        html += '  </button>';
        html += '</div>';
      } else {
        html += '<div class="card" style="padding:0; border-radius:10px; overflow:hidden;">';
        html += '  <div class="table-responsive acc-table-container">';
        html += '    <table class="table acc-table" style="width:100%; margin:0; border-collapse:collapse; font-size:12.5px;">';
        html += '      <thead>';
        html += '        <tr style="text-align:left; color:var(--text-secondary); border-bottom:1px solid var(--border-color); font-size:11.5px;">';
        html += '          <th style="padding:10px 14px;">EMPLOYEE</th>';
        html += '          <th style="padding:10px 14px; text-align:center;">DAYS</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">GROSS</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">PF (EE)</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">ESI (EE)</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">PT</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">TDS</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">ADV REC</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">OTHER DED</th>';
        html += '          <th style="padding:10px 14px; text-align:right; font-weight:700;">NET PAY</th>';
        html += '          <th style="padding:10px 14px; text-align:center;">ACTIONS</th>';
        html += '        </tr>';
        html += '      </thead>';
        html += '      <tbody>';

        lines.forEach(function (l) {
          var isTeacher = (l.employeeType === 'teacher');
          var roleBadge = isTeacher ? '<span class="badge" style="background:rgba(99,102,241,0.1); color:var(--accent-primary); font-size:10px;">Teacher</span>' : '<span class="badge" style="background:rgba(107,114,128,0.1); color:var(--text-secondary); font-size:10px;">Staff</span>';
          var hasNeg = (l.hasNegativeNet || l.netPayPaise < 0);

          html += '        <tr style="border-bottom:1px solid var(--border-color); ' + (hasNeg ? 'background:rgba(239,68,68,0.05);' : '') + '">';
          html += '          <td style="padding:10px 14px;">';
          html += '            <div style="font-weight:600; color:var(--text-primary);">' + SchoolApp.escapeHTML(l.employeeName || l.employeeId) + '</div>';
          html += '            <div style="font-size:11px; margin-top:2px;">' + roleBadge + ' ' + (l.designation ? '<span style="color:var(--text-muted);">' + SchoolApp.escapeHTML(l.designation) + '</span>' : '') + '</div>';
          html += '          </td>';
          html += '          <td style="padding:10px 14px; text-align:center; font-size:11.5px;">';
          html += '            <div><strong>' + (l.paidDays || 0) + '</strong> / ' + (l.workingDaysInMonth || l.workingDays || 0) + '</div>';
          html += '            <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">Auto: <strong>' + (l.lopAuto || 0) + 'd</strong> | Final: <strong style="' + ((l.lopDays || 0) > 0 ? 'color:var(--danger);' : '') + '">' + (l.lopDays || 0) + 'd</strong></div>';
          html += '          </td>';
          html += '          <td style="padding:10px 14px; text-align:right; font-weight:600;">' + this.formatINR(l.grossPayPaise || 0) + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; color:var(--text-secondary);">' + (l.employeePfPaise > 0 ? this.formatINR(l.employeePfPaise) : '-') + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; color:var(--text-secondary);">' + (l.employeeEsiPaise > 0 ? this.formatINR(l.employeeEsiPaise) : '-') + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; color:var(--text-secondary);">' + (l.ptPaise > 0 ? this.formatINR(l.ptPaise) : '-') + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; color:var(--text-secondary);">' + (l.tdsPaise > 0 ? this.formatINR(l.tdsPaise) : '-') + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; color:var(--text-secondary);">' + (l.advanceRecoveryPaise > 0 ? this.formatINR(l.advanceRecoveryPaise) : '-') + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; color:var(--text-secondary);">' + (l.otherDeductionsPaise > 0 ? this.formatINR(l.otherDeductionsPaise) : '-') + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; font-weight:700; color:' + (hasNeg ? 'var(--danger)' : 'var(--text-primary)') + ';">' + this.formatINR(l.netPayPaise || 0) + '</td>';
          html += '          <td style="padding:10px 14px; text-align:center; white-space:nowrap;">';
          if (status === 'draft') {
            html += '            <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.openEditInputsModal(\'' + l.employeeId + '\')" style="padding:3px 8px; font-size:11px; margin-right:4px;" title="Adjust LOP days, additions, deductions, advance recovery">';
            html += '              <span class="material-icons-round" style="font-size:13px;">tune</span> Inputs';
            html += '            </button>';
          }
          html += '            <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.showPayslipModal(\'' + l.employeeId + '\')" style="padding:3px 8px; font-size:11px;" title="View and print payslip">';
          html += '              <span class="material-icons-round" style="font-size:13px;">receipt</span> Payslip';
          html += '            </button>';
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

    // ── Monthly Run Actions ──────────────────────────────────────────────────
    calculatePayrollRun: async function () {
      var btn = document.getElementById('btn-calc-payroll');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Calculating...';
      }
      try {
        await this.runPayrollAction('calc');
        await this.loadPayrollRunForMonth(this.selectedPayrollMonth);
        SchoolApp.showToast('Payroll calculated successfully for ' + this.selectedPayrollMonth, 'success');
        this.renderCurrentTab();
      } catch (err) {
        console.error('Payroll calc error:', err);
        SchoolApp.showToast('Calculation failed: ' + (err.message || 'Unknown error'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">calculate</span> Calculate Payroll';
        }
      }
    },

    confirmApproveRun: function () {
      if (!this.currentRun || !this.currentRun.totals) return;
      var totals = this.currentRun.totals;
      var count = (this.currentRunLines || []).length;

      var html = '';
      html += '<div style="padding:8px 0;">';
      html += '  <p style="font-size:13.5px; margin-bottom:16px;">Approving locks all employee inputs for <strong>' + this.selectedPayrollMonth + '</strong> and prepares the run for disbursement.</p>';
      html += '  <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:14px; display:flex; flex-direction:column; gap:8px; font-size:13px;">';
      html += '    <div style="display:flex; justify-content:space-between;"><span>Employees in run:</span> <strong>' + count + '</strong></div>';
      html += '    <div style="display:flex; justify-content:space-between;"><span>Total Gross Earnings:</span> <strong>' + this.formatINR(totals.grossPaise || 0) + '</strong></div>';
      html += '    <div style="display:flex; justify-content:space-between;"><span>Total Employee Deductions:</span> <strong style="color:var(--danger);">- ' + this.formatINR((totals.employeePfPaise || 0) + (totals.employeeEsiPaise || 0) + (totals.ptPaise || 0) + (totals.tdsPaise || 0) + (totals.advanceRecoveryPaise || 0) + (totals.otherDeductionsPaise || 0)) + '</strong></div>';
      html += '    <div style="border-top:1px dashed var(--border-color); padding-top:8px; display:flex; justify-content:space-between; font-size:15px;"><span>Net Payable to Staff:</span> <strong style="color:var(--accent-primary);">' + this.formatINR(totals.netPayPaise || 0) + '</strong></div>';
      html += '    <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-secondary); margin-top:4px;"><span>Employer Statutory Liability:</span> <span>' + this.formatINR((totals.employerPfPaise || 0) + (totals.employerEsiPaise || 0)) + '</span></div>';
      html += '  </div>';
      html += '</div>';

      var footer = '';
      footer += '<button type="button" class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
      footer += '<button type="button" class="btn btn-primary" id="btn-approve-confirm" onclick="SchoolApp.modules.accounts.executeApproveRun()">';
      footer += '  <span class="material-icons-round">check_circle</span> Confirm Approval';
      footer += '</button>';

      this.openModal('Approve Payroll Run (' + this.selectedPayrollMonth + ')', html, footer);
    },

    executeApproveRun: async function () {
      var btn = document.getElementById('btn-approve-confirm');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Approving...';
      }
      try {
        await this.runPayrollAction('approve');
        await this.loadPayrollRunForMonth(this.selectedPayrollMonth);
        SchoolApp.closeModal();
        SchoolApp.showToast('Payroll run approved successfully.', 'success');
        this.renderCurrentTab();
      } catch (err) {
        console.error('Approve error:', err);
        SchoolApp.showToast('Approval failed: ' + (err.message || 'Unknown error'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">check_circle</span> Confirm Approval';
        }
      }
    },

    reopenPayrollRun: async function () {
      if (!confirm('Reopen payroll run for ' + this.selectedPayrollMonth + '? This will unlock inputs and return status to Draft.')) return;
      try {
        await this.runPayrollAction('reopen');
        await this.loadPayrollRunForMonth(this.selectedPayrollMonth);
        SchoolApp.showToast('Payroll run reopened to Draft.', 'info');
        this.renderCurrentTab();
      } catch (err) {
        console.error('Reopen error:', err);
        SchoolApp.showToast('Reopen failed: ' + (err.message || 'Unknown error'), 'error');
      }
    },

    openDisburseModal: function () {
      if (!this.currentRun || !this.currentRun.totals) return;
      var totals = this.currentRun.totals;
      var today = new Date().toISOString().split('T')[0];
      var bankAccounts = (this.settings && this.settings.bankAccounts) || [];

      var html = '';
      html += '<form id="form-disburse-payroll" onsubmit="SchoolApp.modules.accounts.executeDisburseRun(event)">';
      html += '  <div style="background:rgba(99,102,241,0.06); border-radius:8px; padding:12px; margin-bottom:14px; font-size:13px;">';
      html += '    <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Disbursing Month:</span> <strong>' + this.selectedPayrollMonth + '</strong></div>';
      html += '    <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:700;"><span>Total Net Payout:</span> <span style="color:var(--accent-primary);">' + this.formatINR(totals.netPayPaise || 0) + '</span></div>';
      html += '  </div>';

      html += '  <div class="form-group" style="margin-bottom:12px;">';
      html += '    <label class="form-label" style="font-weight:600;">Disburse From Account *</label>';
      html += '    <select class="form-control form-select" id="disburse-account" required>';
      html += '      <optgroup label="Cash">';
      html += '        <option value="11100">11100 - Cash in Hand</option>';
      html += '      </optgroup>';
      html += '      <optgroup label="Bank Accounts">';
      if (bankAccounts.length === 0) {
        html += '        <option value="11200">11200 - Primary Bank Account</option>';
      } else {
        bankAccounts.forEach(function (b) {
          html += '        <option value="' + b.code + '">' + b.code + ' - ' + SchoolApp.escapeHTML(b.bankName || 'Bank') + ' (' + SchoolApp.escapeHTML(b.accountNumber || '') + ')</option>';
        });
      }
      html += '      </optgroup>';
      html += '    </select>';
      html += '  </div>';

      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Payment Date *</label>';
      html += '      <input type="date" class="form-control" id="disburse-date" value="' + today + '" required />';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Ref / Transaction No.</label>';
      html += '      <input type="text" class="form-control" id="disburse-ref" placeholder="e.g. NEFT BATCH #449" />';
      html += '    </div>';
      html += '  </div>';

      html += '  <div style="font-size:12px; color:var(--text-muted); line-height:1.4;">';
      html += '    Posting this disbursement automatically creates journal voucher <code>vch_pay_' + this.selectedPayrollMonth + '</code> and updates the General Ledger.';
      html += '  </div>';
      html += '</form>';

      var footer = '';
      footer += '<button type="button" class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
      footer += '<button type="submit" form="form-disburse-payroll" class="btn btn-primary" id="btn-confirm-disburse">';
      footer += '  <span class="material-icons-round">payments</span> Disburse & Post to Ledger';
      footer += '</button>';

      this.openModal('Disburse Monthly Payroll (' + this.selectedPayrollMonth + ')', html, footer);
    },

    executeDisburseRun: async function (e) {
      if (e) e.preventDefault();
      var paidFrom = document.getElementById('disburse-account').value;
      var pDate = document.getElementById('disburse-date').value;
      var refNo = document.getElementById('disburse-ref').value;

      var btn = document.getElementById('btn-confirm-disburse');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Disbursing...';
      }

      try {
        await this.runPayrollAction('pay', {
          paidFromAccount: paidFrom,
          paymentDate: pDate,
          referenceNo: refNo
        });
        await this.loadPayrollRunForMonth(this.selectedPayrollMonth);
        await this.loadData();
        SchoolApp.closeModal();
        SchoolApp.showToast('Payroll disbursed and posted to General Ledger!', 'success');
        this.renderCurrentTab();
      } catch (err) {
        console.error('Disburse error:', err);
        SchoolApp.showToast('Disbursement failed: ' + (err.message || 'Unknown error'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">payments</span> Disburse & Post to Ledger';
        }
      }
    },

    openReverseModal: function () {
      var html = '';
      html += '<form id="form-reverse-payroll" onsubmit="SchoolApp.modules.accounts.executeReverseRun(event)">';
      html += '  <div style="background:rgba(239, 68, 68, 0.1); border-left:4px solid var(--danger); border-radius:6px; padding:12px; margin-bottom:14px; font-size:13px; color:var(--danger);">';
      html += '    <strong>Caution:</strong> Reversing this payroll run will post an offsetting reversal voucher (<code>vch_payrev_' + this.selectedPayrollMonth + '</code>) to the General Ledger and mark the run as Reversed.';
      html += '  </div>';

      html += '  <div class="form-group" style="margin-bottom:12px;">';
      html += '    <label class="form-label" style="font-weight:600;">Reason for Reversal *</label>';
      html += '    <textarea class="form-control" id="reverse-reason" rows="3" placeholder="e.g. Bank payout cancelled / attendance corrections needed" required></textarea>';
      html += '  </div>';
      html += '</form>';

      var footer = '';
      footer += '<button type="button" class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
      footer += '<button type="submit" form="form-reverse-payroll" class="btn btn-danger" id="btn-confirm-reverse">';
      footer += '  <span class="material-icons-round">undo</span> Confirm Reversal';
      footer += '</button>';

      this.openModal('Reverse Payroll Run (' + this.selectedPayrollMonth + ')', html, footer);
    },

    executeReverseRun: async function (e) {
      if (e) e.preventDefault();
      var reason = document.getElementById('reverse-reason').value;
      var btn = document.getElementById('btn-confirm-reverse');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Reversing...';
      }

      try {
        await this.runPayrollAction('reverse', { reason: reason });
        await this.loadPayrollRunForMonth(this.selectedPayrollMonth);
        await this.loadData();
        SchoolApp.closeModal();
        SchoolApp.showToast('Payroll run reversed and reversal voucher posted.', 'info');
        this.renderCurrentTab();
      } catch (err) {
        console.error('Reverse error:', err);
        SchoolApp.showToast('Reversal failed: ' + (err.message || 'Unknown error'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">undo</span> Confirm Reversal';
        }
      }
    },

    // ── Edit Inputs Modal ────────────────────────────────────────────────────
    openEditInputsModal: async function (empId) {
      var line = (this.currentRunLines || []).find(function (l) { return l.employeeId === empId; });
      if (!line) return;

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      var existingInputs = {};
      try {
        var inpRef = fs.doc(db, 'tenant_data', schoolId, 'payroll_inputs', this.selectedPayrollMonth);
        var inpSnap = await fs.getDoc(inpRef);
        if (inpSnap.exists() && inpSnap.data().employees) {
          existingInputs = inpSnap.data().employees[empId] || {};
        }
      } catch (e) {
        console.warn('Failed to load existing inputs:', e);
      }

      var lopVal = (existingInputs.lopDaysOverride !== undefined && existingInputs.lopDaysOverride !== null) ? existingInputs.lopDaysOverride : (line.lopDays || 0);
      var addRupees = (existingInputs.additionPaise ? existingInputs.additionPaise / 100 : (line.oneTimeAdditionsPaise ? line.oneTimeAdditionsPaise / 100 : 0));
      var addReason = existingInputs.additionReason || '';
      var dedRupees = (existingInputs.deductionPaise ? existingInputs.deductionPaise / 100 : (line.oneTimeDeductionsPaise ? line.oneTimeDeductionsPaise / 100 : 0));
      var dedReason = existingInputs.deductionReason || '';
      var advRecRupees = (existingInputs.advanceRecoveryPaise !== undefined && existingInputs.advanceRecoveryPaise !== null ? existingInputs.advanceRecoveryPaise / 100 : (line.advanceRecoveryPaise ? line.advanceRecoveryPaise / 100 : 0));

      var html = '';
      html += '<form id="form-edit-inputs" onsubmit="SchoolApp.modules.accounts.savePayrollInputs(event, \'' + empId + '\')">';
      html += '  <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-bottom:14px; font-size:13px;">';
      html += '    <div style="font-weight:700; color:var(--text-primary);">' + SchoolApp.escapeHTML(line.employeeName) + '</div>';
      html += '    <div style="color:var(--text-secondary); font-size:12px;">Base Gross Salary: ' + this.formatINR(line.baseGrossPaise || 0) + ' | Working Days: ' + (line.workingDaysInMonth || 26) + '</div>';
      html += '  </div>';

      html += '  <div class="form-group" style="margin-bottom:12px;">';
      html += '    <label class="form-label" style="font-weight:600;">LOP Days Override (Loss of Pay)</label>';
      html += '    <input type="number" step="0.5" min="0" max="31" class="form-control" id="inp-lop" value="' + lopVal + '" />';
      html += '    <small style="color:var(--text-muted); font-size:11px;">Leave empty or set actual absent days for salary proration.</small>';
      html += '  </div>';

      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">One-time Additions (INR ₹)</label>';
      html += '      <input type="number" step="0.01" min="0" class="form-control" id="inp-add" value="' + addRupees + '" />';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Additions Reason / Note</label>';
      html += '      <input type="text" class="form-control" id="inp-add-reason" value="' + SchoolApp.escapeHTML(addReason) + '" placeholder="e.g. Festival bonus / exam duty" />';
      html += '    </div>';
      html += '  </div>';

      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">One-time Deductions (INR ₹)</label>';
      html += '      <input type="number" step="0.01" min="0" class="form-control" id="inp-ded" value="' + dedRupees + '" />';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Deductions Reason / Note</label>';
      html += '      <input type="text" class="form-control" id="inp-ded-reason" value="' + SchoolApp.escapeHTML(dedReason) + '" placeholder="e.g. Uniform / late coming" />';
      html += '    </div>';
      html += '  </div>';

      html += '  <div class="form-group" style="margin-bottom:12px;">';
      html += '    <label class="form-label" style="font-weight:600;">Advance Recovery Override (INR ₹)</label>';
      html += '    <input type="number" step="0.01" min="0" class="form-control" id="inp-adv-rec" value="' + advRecRupees + '" />';
      html += '    <small style="color:var(--text-muted); font-size:11px;">Defaults to open advance balance up to available gross salary.</small>';
      html += '  </div>';
      html += '</form>';

      var footer = '';
      footer += '<button type="button" class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
      footer += '<button type="submit" form="form-edit-inputs" class="btn btn-primary" id="btn-save-inputs">';
      footer += '  <span class="material-icons-round">save</span> Save & Recalculate';
      footer += '</button>';

      this.openModal('Monthly Adjustments — ' + SchoolApp.escapeHTML(line.employeeName), html, footer);
    },

    savePayrollInputs: async function (e, empId) {
      if (e) e.preventDefault();
      var btn = document.getElementById('btn-save-inputs');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Saving...';
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      var lop = parseFloat(document.getElementById('inp-lop').value) || 0;
      var addRupees = parseFloat(document.getElementById('inp-add').value) || 0;
      var addReason = document.getElementById('inp-add-reason').value.trim();
      var dedRupees = parseFloat(document.getElementById('inp-ded').value) || 0;
      var dedReason = document.getElementById('inp-ded-reason').value.trim();
      var advRecRupees = parseFloat(document.getElementById('inp-adv-rec').value) || 0;

      try {
        var inpRef = fs.doc(db, 'tenant_data', schoolId, 'payroll_inputs', this.selectedPayrollMonth);
        var authUser = window.auth && window.auth.currentUser;

        var payload = {
          employees: {}
        };
        payload.employees[empId] = {
          lopDaysOverride: lop,
          additionPaise: Math.round(addRupees * 100),
          additionReason: addReason,
          deductionPaise: Math.round(dedRupees * 100),
          deductionReason: dedReason,
          advanceRecoveryPaise: Math.round(advRecRupees * 100)
        };
        payload.updatedAt = new Date().toISOString();
        if (authUser) payload.updatedBy = authUser.email;

        await fs.setDoc(inpRef, payload, { merge: true });
        SchoolApp.closeModal();
        SchoolApp.showToast('Inputs updated. Recalculating...', 'info');
        await this.calculatePayrollRun();
      } catch (err) {
        console.error('Save inputs error:', err);
        SchoolApp.showToast('Failed to save inputs: ' + (err.message || 'Check connection'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">save</span> Save & Recalculate';
        }
      }
    },

    // ── Payslip View Modal ───────────────────────────────────────────────────
    showPayslipModal: function (empId) {
      var line = (this.currentRunLines || []).find(function (l) { return l.employeeId === empId; });
      if (!line) return;

      var schoolName = (SchoolApp.state && SchoolApp.state.school && SchoolApp.state.school.name) || 'School Management System';

      var html = '';
      html += '<div id="printable-payslip" style="padding:16px; font-family:inherit; color:#1e293b; background:#fff; border-radius:8px;">';
      
      // Header
      html += '  <div style="text-align:center; border-bottom:2px solid #e2e8f0; padding-bottom:12px; margin-bottom:14px;">';
      html += '    <h3 style="margin:0; font-size:18px; color:#0f172a; font-weight:800;">' + SchoolApp.escapeHTML(schoolName) + '</h3>';
      html += '    <div style="font-size:12px; color:#64748b; margin-top:2px; text-transform:uppercase; letter-spacing:0.5px;">Salary Payslip — ' + this.selectedPayrollMonth + '</div>';
      html += '  </div>';

      // Employee Info Grid
      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; font-size:12px; background:#f8fafc; padding:12px; border-radius:6px; margin-bottom:14px;">';
      html += '    <div><span style="color:#64748b;">Employee Name:</span> <strong>' + SchoolApp.escapeHTML(line.employeeName) + '</strong></div>';
      html += '    <div><span style="color:#64748b;">Designation / Role:</span> <strong>' + SchoolApp.escapeHTML(line.designation || line.employeeType) + '</strong></div>';
      html += '    <div><span style="color:#64748b;">Bank Name:</span> <span>' + SchoolApp.escapeHTML(line.bankName || 'Not configured') + '</span></div>';
      html += '    <div><span style="color:#64748b;">Account No:</span> <span>' + (line.last4 ? ('•••• ' + SchoolApp.escapeHTML(line.last4)) : '-') + '</span></div>';
      html += '    <div><span style="color:#64748b;">IFSC Code:</span> <span>' + SchoolApp.escapeHTML(line.ifscCode || '-') + '</span></div>';
      html += '    <div><span style="color:#64748b;">Paid Days / Total:</span> <strong>' + (line.paidDays || 0) + ' / ' + (line.workingDaysInMonth || 26) + '</strong> (LOP: ' + (line.lopDays || 0) + 'd)</div>';
      html += '  </div>';

      // 2-Column Earnings & Deductions
      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:14px; font-size:12.5px;">';
      
      // Earnings Column
      html += '    <div style="border:1px solid #e2e8f0; border-radius:6px; overflow:hidden;">';
      html += '      <div style="background:#f1f5f9; padding:8px 12px; font-weight:700; color:#334155; font-size:12px;">EARNINGS</div>';
      html += '      <div style="padding:10px 12px; display:flex; flex-direction:column; gap:6px;">';
      html += '        <div style="display:flex; justify-content:space-between;"><span>Basic Pay:</span> <span>' + this.formatINR(line.basicPaise || 0) + '</span></div>';
      if (line.daPaise > 0) html += '        <div style="display:flex; justify-content:space-between;"><span>Dearness Allowance (DA):</span> <span>' + this.formatINR(line.daPaise) + '</span></div>';
      if (line.hraPaise > 0) html += '        <div style="display:flex; justify-content:space-between;"><span>House Rent Allowance (HRA):</span> <span>' + this.formatINR(line.hraPaise) + '</span></div>';
      if (line.allowancesPaise > 0) html += '        <div style="display:flex; justify-content:space-between;"><span>Other Allowances:</span> <span>' + this.formatINR(line.allowancesPaise) + '</span></div>';
      if (line.oneTimeAdditionsPaise > 0) html += '        <div style="display:flex; justify-content:space-between; color:#16a34a;"><span>Additions / Incentives:</span> <span>+' + this.formatINR(line.oneTimeAdditionsPaise) + '</span></div>';
      html += '        <div style="border-top:1px dashed #cbd5e1; padding-top:6px; display:flex; justify-content:space-between; font-weight:700; color:#0f172a;"><span>Total Gross Earnings:</span> <span>' + this.formatINR(line.grossPayPaise || 0) + '</span></div>';
      html += '      </div>';
      html += '    </div>';

      // Deductions Column
      html += '    <div style="border:1px solid #e2e8f0; border-radius:6px; overflow:hidden;">';
      html += '      <div style="background:#f1f5f9; padding:8px 12px; font-weight:700; color:#334155; font-size:12px;">DEDUCTIONS</div>';
      html += '      <div style="padding:10px 12px; display:flex; flex-direction:column; gap:6px;">';
      if (line.employeePfPaise > 0) html += '        <div style="display:flex; justify-content:space-between;"><span>EPF (Employee Share):</span> <span>' + this.formatINR(line.employeePfPaise) + '</span></div>';
      if (line.employeeEsiPaise > 0) html += '        <div style="display:flex; justify-content:space-between;"><span>ESIC (Employee Share):</span> <span>' + this.formatINR(line.employeeEsiPaise) + '</span></div>';
      if (line.ptPaise > 0) html += '        <div style="display:flex; justify-content:space-between;"><span>Professional Tax (PT):</span> <span>' + this.formatINR(line.ptPaise) + '</span></div>';
      if (line.tdsPaise > 0) html += '        <div style="display:flex; justify-content:space-between;"><span>TDS on Salary:</span> <span>' + this.formatINR(line.tdsPaise) + '</span></div>';
      if (line.advanceRecoveryPaise > 0) html += '        <div style="display:flex; justify-content:space-between;"><span>Salary Advance Recovery:</span> <span>' + this.formatINR(line.advanceRecoveryPaise) + '</span></div>';
      if (line.otherDeductionsPaise > 0) html += '        <div style="display:flex; justify-content:space-between;"><span>Other Deductions:</span> <span>' + this.formatINR(line.otherDeductionsPaise) + '</span></div>';
      var totalLineDed = (line.employeePfPaise || 0) + (line.employeeEsiPaise || 0) + (line.ptPaise || 0) + (line.tdsPaise || 0) + (line.advanceRecoveryPaise || 0) + (line.otherDeductionsPaise || 0);
      html += '        <div style="border-top:1px dashed #cbd5e1; padding-top:6px; display:flex; justify-content:space-between; font-weight:700; color:#dc2626;"><span>Total Deductions:</span> <span>' + this.formatINR(totalLineDed) + '</span></div>';
      html += '      </div>';
      html += '    </div>';
      html += '  </div>';

      // Net Pay Banner
      html += '  <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:12px; display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">';
      html += '    <div>';
      html += '      <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:#166534;">Net Salary Payable</div>';
      html += '      <div style="font-size:12px; color:#15803d;">Take-home salary credited / disbursed</div>';
      html += '    </div>';
      html += '    <div style="font-size:22px; font-weight:800; color:#15803d;">' + this.formatINR(line.netPayPaise || 0) + '</div>';
      html += '  </div>';

      // Employer Contributions Note
      if (line.employerPfPaise > 0 || line.employerEsiPaise > 0) {
        html += '  <div style="font-size:11px; color:#64748b; border-top:1px dashed #e2e8f0; padding-top:8px;">';
        html += '    Employer Contributions (School Cost): EPF ' + this.formatINR(line.employerPfPaise || 0) + ' | EPS ' + this.formatINR(line.employerEpsPaise || 0) + ' | ESIC ' + this.formatINR(line.employerEsiPaise || 0);
        html += '  </div>';
      }
      html += '</div>';

      var footer = '';
      footer += '<button type="button" class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>';
      footer += '<button type="button" class="btn btn-primary" onclick="window.print()">';
      footer += '  <span class="material-icons-round">print</span> Print Payslip';
      footer += '</button>';

      this.openModal('Payslip — ' + SchoolApp.escapeHTML(line.employeeName), html, footer);
    },

    // ── Salary Register CSV Export ───────────────────────────────────────────
    exportSalaryRegisterCSV: function () {
      var lines = this.currentRunLines || [];
      if (lines.length === 0) {
        SchoolApp.showToast('No payroll lines available to export.', 'warning');
        return;
      }

      var headers = [
        'Employee ID', 'Employee Name', 'Role', 'Designation', 'Working Days', 'Paid Days', 'LOP Days',
        'Basic (INR)', 'DA (INR)', 'HRA (INR)', 'Allowances (INR)', 'Additions (INR)', 'Gross Pay (INR)',
        'PF Employee (INR)', 'ESI Employee (INR)', 'Professional Tax (INR)', 'TDS (INR)', 'Advance Recovery (INR)', 'Other Deductions (INR)', 'Total Deductions (INR)',
        'Net Pay (INR)', 'PF Employer (INR)', 'EPS Employer (INR)', 'ESI Employer (INR)', 'Total CTC (INR)',
        'Bank Name', 'Account Last 4', 'IFSC Code'
      ];

      var rows = lines.map(function (l) {
        var totalDed = (l.employeePfPaise || 0) + (l.employeeEsiPaise || 0) + (l.ptPaise || 0) + (l.tdsPaise || 0) + (l.advanceRecoveryPaise || 0) + (l.otherDeductionsPaise || 0);
        var totalCtc = (l.grossPayPaise || 0) + (l.employerPfPaise || 0) + (l.employerEsiPaise || 0);

        return [
          '"' + (l.employeeId || '').replace(/"/g, '""') + '"',
          '"' + (l.employeeName || '').replace(/"/g, '""') + '"',
          '"' + (l.employeeType || '').replace(/"/g, '""') + '"',
          '"' + (l.designation || '').replace(/"/g, '""') + '"',
          l.workingDaysInMonth || 26,
          l.paidDays || 0,
          l.lopDays || 0,
          ((l.basicPaise || 0) / 100).toFixed(2),
          ((l.daPaise || 0) / 100).toFixed(2),
          ((l.hraPaise || 0) / 100).toFixed(2),
          ((l.allowancesPaise || 0) / 100).toFixed(2),
          ((l.oneTimeAdditionsPaise || 0) / 100).toFixed(2),
          ((l.grossPayPaise || 0) / 100).toFixed(2),
          ((l.employeePfPaise || 0) / 100).toFixed(2),
          ((l.employeeEsiPaise || 0) / 100).toFixed(2),
          ((l.ptPaise || 0) / 100).toFixed(2),
          ((l.tdsPaise || 0) / 100).toFixed(2),
          ((l.advanceRecoveryPaise || 0) / 100).toFixed(2),
          ((l.otherDeductionsPaise || 0) / 100).toFixed(2),
          (totalDed / 100).toFixed(2),
          ((l.netPayPaise || 0) / 100).toFixed(2),
          ((l.employerPfPaise || 0) / 100).toFixed(2),
          ((l.employerEpsPaise || 0) / 100).toFixed(2),
          ((l.employerEsiPaise || 0) / 100).toFixed(2),
          (totalCtc / 100).toFixed(2),
          '"' + (l.bankName || '').replace(/"/g, '""') + '"',
          '"' + (l.last4 || '').replace(/"/g, '""') + '"',
          '"' + (l.ifscCode || '').replace(/"/g, '""') + '"'
        ].join(',');
      });

      var csvContent = [headers.join(',')].concat(rows).join('\r\n');
      var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'Salary_Register_' + this.selectedPayrollMonth + '.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      SchoolApp.showToast('Salary Register CSV downloaded.', 'success');
    },

    // ── 2. Staff Registry Sub-tab ────────────────────────────────────────────
    renderPayrollStaffHTML: function () {
      var html = '';
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">';
      html += '  <div>';
      html += '    <h4 style="margin:0; font-size:16px; font-weight:700;">Non-Teaching Staff Registry</h4>';
      html += '    <p style="margin:2px 0 0 0; font-size:12px; color:var(--text-secondary);">Manage drivers, ayahs, security guards, accountants, and other non-teaching school employees.</p>';
      html += '  </div>';
      html += '  <button class="btn btn-primary" onclick="SchoolApp.modules.accounts.openAddStaffModal()">';
      html += '    <span class="material-icons-round">person_add</span> Add Staff Member';
      html += '  </button>';
      html += '</div>';

      if (!this.staff || this.staff.length === 0) {
        html += '<div class="card" style="padding:48px 24px; text-align:center; border-radius:10px; color:var(--text-secondary);">';
        html += '  <span class="material-icons-round" style="font-size:48px; color:var(--text-muted); margin-bottom:12px;">people</span>';
        html += '  <p style="font-weight:600; font-size:15px; margin:0 0 6px 0; color:var(--text-primary);">No non-teaching staff registered yet</p>';
        html += '  <p style="font-size:13px; max-width:480px; margin:0 auto 18px auto;">Add administrative and support staff to calculate monthly compensation and track advances.</p>';
        html += '  <button class="btn btn-primary" onclick="SchoolApp.modules.accounts.openAddStaffModal()">';
        html += '    <span class="material-icons-round">person_add</span> Add First Staff Member';
        html += '  </button>';
        html += '</div>';
      } else {
        html += '<div class="card" style="padding:0; border-radius:10px; overflow:hidden;">';
        html += '  <div class="table-responsive acc-table-container">';
        html += '    <table class="table acc-table" style="width:100%; margin:0; border-collapse:collapse; font-size:13px;">';
        html += '      <thead>';
        html += '        <tr style="text-align:left; color:var(--text-secondary); border-bottom:1px solid var(--border-color); font-size:11.5px;">';
        html += '          <th style="padding:10px 14px;">NAME</th>';
        html += '          <th style="padding:10px 14px;">ROLE / DESIGNATION</th>';
        html += '          <th style="padding:10px 14px;">CONTACT</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">MONTHLY GROSS</th>';
        html += '          <th style="padding:10px 14px; text-align:center;">JOINING DATE</th>';
        html += '          <th style="padding:10px 14px; text-align:center;">STATUS</th>';
        html += '          <th style="padding:10px 14px; text-align:center;">ACTIONS</th>';
        html += '        </tr>';
        html += '      </thead>';
        html += '      <tbody>';

        this.staff.forEach(function (s) {
          var isLeft = (s.status === 'left');
          html += '        <tr style="border-bottom:1px solid var(--border-color); ' + (isLeft ? 'opacity:0.6;' : '') + '">';
          html += '          <td style="padding:10px 14px; font-weight:600; color:var(--text-primary);">' + SchoolApp.escapeHTML(s.name || s.id) + '</td>';
          html += '          <td style="padding:10px 14px;">' + SchoolApp.escapeHTML(s.role || 'Staff') + '</td>';
          html += '          <td style="padding:10px 14px; font-size:12px; color:var(--text-secondary);">' + SchoolApp.escapeHTML(s.phone || s.email || '-') + '</td>';
          var prof = (this.payrollProfiles || []).find(function (p) { return p.id === s.id || p.employeeId === s.id; });
          var grossDisplay = (prof && prof.grossSalaryPaise > 0)
            ? this.formatINR(prof.grossSalaryPaise)
            : '<span style="color:var(--text-muted); font-style:italic;">No salary profile</span>';
          html += '          <td style="padding:10px 14px; text-align:right; font-weight:600;">' + grossDisplay + '</td>';
          html += '          <td style="padding:10px 14px; text-align:center; font-size:12px; color:var(--text-secondary);">' + (s.joiningDate || '-') + '</td>';
          html += '          <td style="padding:10px 14px; text-align:center;">';
          if (isLeft) {
            html += '            <span class="badge" style="background:rgba(239,68,68,0.1); color:var(--danger); font-size:10.5px;">Left (' + (s.leavingDate || '') + ')</span>';
          } else {
            html += '            <span class="badge badge-success" style="font-size:10.5px;">Active</span>';
          }
          html += '          </td>';
          html += '          <td style="padding:10px 14px; text-align:center; white-space:nowrap;">';
          html += '            <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.openEditProfileModal(\'' + s.id + '\', \'staff\')" style="padding:3px 8px; font-size:11px; margin-right:4px;">';
          html += '              <span class="material-icons-round" style="font-size:13px;">tune</span> Salary Profile';
          html += '            </button>';
          if (!isLeft) {
            html += '            <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.markStaffLeft(\'' + s.id + '\', \'' + SchoolApp.escapeHTML(s.name || '') + '\')" style="padding:3px 8px; font-size:11px; color:var(--danger);" title="Mark employee as Left">';
            html += '              <span class="material-icons-round" style="font-size:13px;">person_remove</span>';
            html += '            </button>';
          }
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

    openAddStaffModal: function () {
      var today = new Date().toISOString().split('T')[0];
      var html = '';
      html += '<form id="form-add-staff" onsubmit="SchoolApp.modules.accounts.saveStaffMember(event)">';
      html += '  <div class="form-group" style="margin-bottom:12px;">';
      html += '    <label class="form-label" style="font-weight:600;">Full Name *</label>';
      html += '    <input type="text" class="form-control" id="staff-name" placeholder="e.g. Ramesh Kumar" required />';
      html += '  </div>';

      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Role / Category *</label>';
      html += '      <select class="form-control form-select" id="staff-role" required>';
      html += '        <option value="Accountant">Accountant / Cashier</option>';
      html += '        <option value="Clerk">Admin / Office Clerk</option>';
      html += '        <option value="Peon">Office Peon</option>';
      html += '        <option value="Security">Security Guard</option>';
      html += '        <option value="Driver">Bus Driver</option>';
      html += '        <option value="Conductor">Bus Conductor</option>';
      html += '        <option value="Ayah">Ayah / Housekeeping</option>';
      html += '        <option value="Lab Assistant">Lab Assistant</option>';
      html += '        <option value="Librarian">Librarian</option>';
      html += '        <option value="Maintenance">Maintenance / Electrician</option>';
      html += '        <option value="Other">Other Non-Teaching Staff</option>';
      html += '      </select>';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Monthly Gross Salary (₹) *</label>';
      html += '      <input type="number" step="1" min="1" class="form-control" id="staff-salary" placeholder="e.g. 15000" required />';
      html += '    </div>';
      html += '  </div>';

      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Phone Number</label>';
      html += '      <input type="tel" class="form-control" id="staff-phone" placeholder="10-digit mobile" />';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Joining Date *</label>';
      html += '      <input type="date" class="form-control" id="staff-joining" value="' + today + '" required />';
      html += '    </div>';
      html += '  </div>';
      html += '</form>';

      var footer = '';
      footer += '<button type="button" class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
      footer += '<button type="submit" form="form-add-staff" class="btn btn-primary" id="btn-save-staff">';
      footer += '  <span class="material-icons-round">save</span> Add Staff Member';
      footer += '</button>';

      this.openModal('Add Non-Teaching Staff Member', html, footer);
    },

    saveStaffMember: async function (e) {
      if (e) e.preventDefault();
      var btn = document.getElementById('btn-save-staff');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Saving...';
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      var name = document.getElementById('staff-name').value.trim();
      var role = document.getElementById('staff-role').value;
      var salaryRupees = parseFloat(document.getElementById('staff-salary').value) || 0;
      var phone = document.getElementById('staff-phone').value.trim();
      var joiningDate = document.getElementById('staff-joining').value;

      var staffId = 'staff_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      var grossPaise = Math.round(salaryRupees * 100);

      try {
        var batch = fs.writeBatch(db);
        var staffRef = fs.doc(db, 'tenant_data', schoolId, 'staff', staffId);
        batch.set(staffRef, {
          id: staffId,
          name: name,
          role: role,
          phone: phone,
          joiningDate: joiningDate,
          status: 'active',
          createdAt: new Date().toISOString()
        });

        // Initialize default payroll profile
        var profRef = fs.doc(db, 'tenant_data', schoolId, 'payroll_profiles', staffId);
        batch.set(profRef, {
          employeeId: staffId,
          employeeType: 'staff',
          name: name,
          grossSalaryPaise: grossPaise,
          basicPaise: Math.round(grossPaise * 0.5),
          hraPaise: Math.round(grossPaise * 0.4),
          allowancesPaise: Math.round(grossPaise * 0.1),
          epfEnabled: false,
          esicEnabled: false,
          ptEnabled: false,
          updatedAt: new Date().toISOString()
        });

        await batch.commit();
        await this.loadData();
        SchoolApp.closeModal();
        SchoolApp.showToast('Staff member registered successfully.', 'success');
        this.renderCurrentTab();
      } catch (err) {
        console.error('Save staff error:', err);
        SchoolApp.showToast('Failed to add staff: ' + (err.message || 'Check connection'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">save</span> Add Staff Member';
        }
      }
    },

    markStaffLeft: async function (staffId, name) {
      var today = new Date().toISOString().split('T')[0];
      var leavingDate = prompt('Enter leaving date for ' + name + ' (YYYY-MM-DD):', today);
      if (!leavingDate) return;

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      try {
        var staffRef = fs.doc(db, 'tenant_data', schoolId, 'staff', staffId);
        await fs.updateDoc(staffRef, {
          status: 'left',
          leavingDate: leavingDate,
          updatedAt: new Date().toISOString()
        });
        await this.loadData();
        SchoolApp.showToast(name + ' marked as left.', 'info');
        this.renderCurrentTab();
      } catch (err) {
        console.error('Mark left error:', err);
        SchoolApp.showToast('Failed to update status: ' + err.message, 'error');
      }
    },

    // ── 3. Salary Profiles Sub-tab ───────────────────────────────────────────
    renderPayrollProfilesHTML: function () {
      var html = '';
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">';
      html += '  <div>';
      html += '    <h4 style="margin:0; font-size:16px; font-weight:700;">Employee Salary Profiles & Statutory Settings</h4>';
      html += '    <p style="margin:2px 0 0 0; font-size:12px; color:var(--text-secondary);">Configure salary components (Basic, DA, HRA), EPF/ESIC/PT eligibility, and bank payout details for all staff.</p>';
      html += '  </div>';
      html += '</div>';

      // Aggregate all active employees: Teachers + Active Staff
      var teachers = (SchoolApp.state && SchoolApp.state.teachers) || [];
      var activeStaff = (this.staff || []).filter(function (s) { return s.status !== 'left'; });

      var allEmps = [];
      teachers.forEach(function (t) {
        if (t.status !== 'inactive') {
          allEmps.push({
            id: t.id,
            name: (t.firstName || '') + (t.lastName ? ' ' + t.lastName : '') || t.name || t.id,
            type: 'teacher',
            role: t.subject ? 'Teacher (' + t.subject + ')' : 'Teacher'
          });
        }
      });
      activeStaff.forEach(function (s) {
        allEmps.push({
          id: s.id,
          name: s.name,
          type: 'staff',
          role: s.role || 'Staff'
        });
      });

      allEmps.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });

      if (allEmps.length === 0) {
        html += '<div class="card" style="padding:48px 24px; text-align:center; border-radius:10px; color:var(--text-secondary);">';
        html += '  <span class="material-icons-round" style="font-size:48px; color:var(--text-muted); margin-bottom:12px;">badge</span>';
        html += '  <p style="font-weight:600; font-size:15px; margin:0 0 6px 0; color:var(--text-primary);">No active teachers or staff found</p>';
        html += '  <p style="font-size:13px; max-width:480px; margin:0 auto 18px auto;">Add teachers in the Teachers module or staff in Staff Registry to configure salary profiles.</p>';
        html += '</div>';
      } else {
        html += '<div class="card" style="padding:0; border-radius:10px; overflow:hidden;">';
        html += '  <div class="table-responsive acc-table-container">';
        html += '    <table class="table acc-table" style="width:100%; margin:0; border-collapse:collapse; font-size:12.5px;">';
        html += '      <thead>';
        html += '        <tr style="text-align:left; color:var(--text-secondary); border-bottom:1px solid var(--border-color); font-size:11.5px;">';
        html += '          <th style="padding:10px 14px;">EMPLOYEE</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">GROSS (CTC)</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">BASIC</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">DA</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">HRA</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">ALLOWANCES</th>';
        html += '          <th style="padding:10px 14px; text-align:center;">STATUTORY</th>';
        html += '          <th style="padding:10px 14px;">BANK ACCOUNT</th>';
        html += '          <th style="padding:10px 14px; text-align:center;">ACTION</th>';
        html += '        </tr>';
        html += '      </thead>';
        html += '      <tbody>';

        allEmps.forEach(function (emp) {
          var prof = (this.payrollProfiles || []).find(function (p) { return p.id === emp.id || p.employeeId === emp.id; }) || {};
          var grossPaise = prof.grossSalaryPaise || 0;
          var basicPaise = prof.basicPaise || 0;
          var daPaise = prof.daPaise || 0;
          var hraPaise = prof.hraPaise || 0;
          var allowPaise = prof.allowancesPaise || 0;

          html += '        <tr style="border-bottom:1px solid var(--border-color);">';
          html += '          <td style="padding:10px 14px;">';
          html += '            <div style="font-weight:600; color:var(--text-primary);">' + SchoolApp.escapeHTML(emp.name) + '</div>';
          html += '            <div style="font-size:11px; color:var(--text-muted);">' + (emp.type === 'teacher' ? '<span class="badge" style="background:rgba(99,102,241,0.1); color:var(--accent-primary); font-size:9.5px;">Teacher</span> ' : '<span class="badge" style="background:rgba(107,114,128,0.1); color:var(--text-secondary); font-size:9.5px;">Staff</span> ') + SchoolApp.escapeHTML(emp.role) + '</div>';
          html += '          </td>';
          html += '          <td style="padding:10px 14px; text-align:right; font-weight:700;">' + this.formatINR(grossPaise) + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; color:var(--text-secondary);">' + this.formatINR(basicPaise) + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; color:var(--text-secondary);">' + (daPaise > 0 ? this.formatINR(daPaise) : '-') + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; color:var(--text-secondary);">' + (hraPaise > 0 ? this.formatINR(hraPaise) : '-') + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; color:var(--text-secondary);">' + (allowPaise > 0 ? this.formatINR(allowPaise) : '-') + '</td>';
          html += '          <td style="padding:10px 14px; text-align:center; white-space:nowrap;">';
          html += '            <span class="badge ' + (prof.epfEnabled ? 'badge-success' : '') + '" style="' + (!prof.epfEnabled ? 'background:rgba(255,255,255,0.05); color:var(--text-muted);' : '') + ' font-size:10px;">PF</span> ';
          html += '            <span class="badge ' + (prof.esicEnabled ? 'badge-success' : '') + '" style="' + (!prof.esicEnabled ? 'background:rgba(255,255,255,0.05); color:var(--text-muted);' : '') + ' font-size:10px;">ESI</span> ';
          html += '            <span class="badge ' + (prof.ptEnabled ? 'badge-success' : '') + '" style="' + (!prof.ptEnabled ? 'background:rgba(255,255,255,0.05); color:var(--text-muted);' : '') + ' font-size:10px;">PT</span>';
          html += '          </td>';
          html += '          <td style="padding:10px 14px; font-size:12px;">';
          if (prof.last4) {
            html += '            <div style="font-weight:600;">' + SchoolApp.escapeHTML(prof.bankName || 'Bank') + '</div>';
            html += '            <div style="color:var(--text-muted); font-size:11px;">A/C: •••• ' + SchoolApp.escapeHTML(prof.last4) + '</div>';
          } else {
            html += '            <span style="color:var(--text-muted); font-style:italic;">Not configured</span>';
          }
          html += '          </td>';
          html += '          <td style="padding:10px 14px; text-align:center;">';
          html += '            <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.openEditProfileModal(\'' + emp.id + '\', \'' + emp.type + '\')" style="padding:3px 8px; font-size:11px;">';
          html += '              <span class="material-icons-round" style="font-size:13px;">edit</span> Edit';
          html += '            </button>';
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

    openEditProfileModal: function (empId, empType) {
      var prof = (this.payrollProfiles || []).find(function (p) { return p.id === empId || p.employeeId === empId; }) || {};
      
      var empName = prof.name;
      if (!empName) {
        if (empType === 'teacher') {
          var t = ((SchoolApp.state && SchoolApp.state.teachers) || []).find(function (x) { return x.id === empId; });
          empName = t ? ((t.firstName || '') + (t.lastName ? ' ' + t.lastName : '') || t.name) : empId;
        } else {
          var s = (this.staff || []).find(function (x) { return x.id === empId; });
          empName = s ? s.name : empId;
        }
      }

      var grossRupees = (prof.grossSalaryPaise || 0) / 100;
      var basicRupees = (prof.basicPaise || 0) / 100;
      var daRupees = (prof.daPaise || 0) / 100;
      var hraRupees = (prof.hraPaise || 0) / 100;
      var allowRupees = (prof.allowancesPaise || 0) / 100;

      var html = '';
      html += '<form id="form-edit-profile" onsubmit="SchoolApp.modules.accounts.savePayrollProfile(event, \'' + empId + '\', \'' + empType + '\')">';
      html += '  <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-bottom:14px; font-size:13px;">';
      html += '    <div style="font-weight:700; color:var(--text-primary); font-size:14px;">' + SchoolApp.escapeHTML(empName) + '</div>';
      html += '    <div style="color:var(--text-secondary); font-size:12px;">Type: ' + (empType === 'teacher' ? 'Teacher' : 'Non-Teaching Staff') + '</div>';
      html += '  </div>';

      html += '  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">';
      html += '    <label class="form-label" style="font-weight:700; margin:0;">Monthly Gross Salary (INR ₹) *</label>';
      html += '    <button type="button" class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.autoFillSalaryComponents()" style="font-size:11px; padding:2px 8px;">';
      html += '      <span class="material-icons-round" style="font-size:13px;">auto_fix_high</span> Auto-split (50% Basic, 40% HRA, 10% Other)';
      html += '    </button>';
      html += '  </div>';
      html += '  <input type="number" step="1" min="0" class="form-control" id="prof-gross" value="' + grossRupees + '" style="font-size:16px; font-weight:700; margin-bottom:14px;" required oninput="SchoolApp.modules.accounts.updateSalarySplitPreview()" />';

      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Basic Pay (₹) *</label>';
      html += '      <input type="number" step="1" min="0" class="form-control" id="prof-basic" value="' + basicRupees + '" required />';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">DA (Dearness Allowance ₹)</label>';
      html += '      <input type="number" step="1" min="0" class="form-control" id="prof-da" value="' + daRupees + '" />';
      html += '    </div>';
      html += '  </div>';

      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">HRA (House Rent Allowance ₹)</label>';
      html += '      <input type="number" step="1" min="0" class="form-control" id="prof-hra" value="' + hraRupees + '" />';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Other Allowances (₹)</label>';
      html += '      <input type="number" step="1" min="0" class="form-control" id="prof-allow" value="' + allowRupees + '" />';
      html += '    </div>';
      html += '  </div>';

      // Statutory Toggles
      html += '  <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-bottom:14px;">';
      html += '    <div style="font-weight:700; font-size:12.5px; margin-bottom:10px; color:var(--text-primary);">Statutory Deductions Eligibility</div>';
      html += '    <div style="display:flex; gap:20px; flex-wrap:wrap; font-size:13px;">';
      html += '      <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">';
      html += '        <input type="checkbox" id="prof-epf" ' + (prof.epfEnabled ? 'checked' : '') + ' /> EPF Eligible';
      html += '      </label>';
      html += '      <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">';
      html += '        <input type="checkbox" id="prof-esic" ' + (prof.esicEnabled ? 'checked' : '') + ' /> ESIC Eligible';
      html += '      </label>';
      html += '      <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">';
      html += '        <input type="checkbox" id="prof-pt" ' + (prof.ptEnabled ? 'checked' : '') + ' /> Professional Tax (PT)';
      html += '      </label>';
      html += '    </div>';
      html += '  </div>';

      // Bank Details
      html += '  <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-bottom:12px;">';
      html += '    <div style="font-weight:700; font-size:12.5px; margin-bottom:10px; color:var(--text-primary);">Bank Payout Details</div>';
      html += '    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">';
      html += '      <div class="form-group">';
      html += '        <label class="form-label" style="font-size:11.5px; font-weight:600;">Bank Name</label>';
      html += '        <input type="text" class="form-control" id="prof-bank-name" value="' + SchoolApp.escapeHTML(prof.bankName || '') + '" placeholder="e.g. SBI / HDFC" />';
      html += '      </div>';
      html += '      <div class="form-group">';
      html += '        <label class="form-label" style="font-size:11.5px; font-weight:600;">Bank Account (Last 4 Digits)</label>';
      html += '        <input type="text" class="form-control" id="prof-last4" value="' + SchoolApp.escapeHTML(prof.last4 || '') + '" placeholder="e.g. 5678" maxlength="4" />';
      html += '      </div>';
      html += '      <div class="form-group">';
      html += '        <label class="form-label" style="font-size:11.5px; font-weight:600;">IFSC Code</label>';
      html += '        <input type="text" class="form-control" id="prof-ifsc" value="' + SchoolApp.escapeHTML(prof.ifscCode || '') + '" placeholder="SBIN0001234" />';
      html += '      </div>';
      html += '    </div>';
      html += '  </div>';
      html += '</form>';

      var footer = '';
      footer += '<button type="button" class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
      footer += '<button type="submit" form="form-edit-profile" class="btn btn-primary" id="btn-save-profile">';
      footer += '  <span class="material-icons-round">save</span> Save Salary Profile';
      footer += '</button>';

      this.openModal('Salary Profile — ' + SchoolApp.escapeHTML(empName), html, footer);
    },

    autoFillSalaryComponents: function () {
      var gross = parseFloat(document.getElementById('prof-gross').value) || 0;
      var basic = Math.round(gross * 0.5);
      var hra = Math.round(gross * 0.4);
      var allow = gross - basic - hra;
      if (allow < 0) allow = 0;

      document.getElementById('prof-basic').value = basic;
      document.getElementById('prof-da').value = 0;
      document.getElementById('prof-hra').value = hra;
      document.getElementById('prof-allow').value = allow;
    },

    updateSalarySplitPreview: function () {
      // Optional realtime validation
    },

    savePayrollProfile: async function (e, empId, empType) {
      if (e) e.preventDefault();
      var btn = document.getElementById('btn-save-profile');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Saving...';
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      var grossRupees = parseFloat(document.getElementById('prof-gross').value) || 0;
      var basicRupees = parseFloat(document.getElementById('prof-basic').value) || 0;
      var daRupees = parseFloat(document.getElementById('prof-da').value) || 0;
      var hraRupees = parseFloat(document.getElementById('prof-hra').value) || 0;
      var allowRupees = parseFloat(document.getElementById('prof-allow').value) || 0;

      var epf = document.getElementById('prof-epf').checked;
      var esic = document.getElementById('prof-esic').checked;
      var pt = document.getElementById('prof-pt').checked;

      var bankName = document.getElementById('prof-bank-name').value.trim();
      var last4 = (document.getElementById('prof-last4').value.trim()).slice(-4);
      var ifsc = document.getElementById('prof-ifsc').value.trim().toUpperCase();

      var payload = {
        employeeId: empId,
        employeeType: empType,
        grossSalaryPaise: Math.round(grossRupees * 100),
        basicPaise: Math.round(basicRupees * 100),
        daPaise: Math.round(daRupees * 100),
        hraPaise: Math.round(hraRupees * 100),
        allowancesPaise: Math.round(allowRupees * 100),
        epfEnabled: epf,
        esicEnabled: esic,
        ptEnabled: pt,
        bankName: bankName,
        last4: last4,
        ifscCode: ifsc,
        updatedAt: new Date().toISOString()
      };

      try {
        var profRef = fs.doc(db, 'tenant_data', schoolId, 'payroll_profiles', empId);
        await fs.setDoc(profRef, payload, { merge: true });
        await this.loadData();
        SchoolApp.closeModal();
        SchoolApp.showToast('Salary profile saved successfully.', 'success');
        this.renderCurrentTab();
      } catch (err) {
        console.error('Save profile error:', err);
        SchoolApp.showToast('Failed to save profile: ' + (err.message || 'Check connection'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">save</span> Save Salary Profile';
        }
      }
    },

    // ── 4. Advances & Statutory Payments Sub-tab ─────────────────────────────
    renderPayrollAdvancesHTML: function () {
      var html = '';
      
      // SECTION A: Salary Advances
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:12px;">';
      html += '  <div>';
      html += '    <h4 style="margin:0; font-size:16px; font-weight:700;">Employee Salary Advances</h4>';
      html += '    <p style="margin:2px 0 0 0; font-size:12px; color:var(--text-secondary);">Record advances disbursed to teachers/staff. Advances post automatically to Ledger 13100 and recover via monthly payroll.</p>';
      html += '  </div>';
      html += '  <button class="btn btn-primary" onclick="SchoolApp.modules.accounts.openAddAdvanceModal()">';
      html += '    <span class="material-icons-round">payments</span> Give Salary Advance';
      html += '  </button>';
      html += '</div>';

      if (!this.advances || this.advances.length === 0) {
        html += '<div class="card" style="padding:28px 20px; text-align:center; border-radius:10px; color:var(--text-secondary); margin-bottom:28px;">';
        html += '  <span class="material-icons-round" style="font-size:36px; color:var(--text-muted); margin-bottom:8px;">receipt_long</span>';
        html += '  <p style="font-weight:600; font-size:13.5px; margin:0 0 4px 0;">No salary advances recorded</p>';
        html += '  <p style="font-size:12px; margin:0 auto 14px auto;">Disbursed advances recover automatically against future salary runs.</p>';
        html += '  <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.openAddAdvanceModal()">Give Advance</button>';
        html += '</div>';
      } else {
        html += '<div class="card" style="padding:0; border-radius:10px; overflow:hidden; margin-bottom:28px;">';
        html += '  <div class="table-responsive acc-table-container">';
        html += '    <table class="table acc-table" style="width:100%; margin:0; border-collapse:collapse; font-size:12.5px;">';
        html += '      <thead>';
        html += '        <tr style="text-align:left; color:var(--text-secondary); border-bottom:1px solid var(--border-color); font-size:11.5px;">';
        html += '          <th style="padding:10px 14px;">DATE</th>';
        html += '          <th style="padding:10px 14px;">EMPLOYEE</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">AMOUNT</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">REMAINING</th>';
        html += '          <th style="padding:10px 14px;">PAID FROM</th>';
        html += '          <th style="padding:10px 14px; text-align:center;">STATUS</th>';
        html += '          <th style="padding:10px 14px; text-align:center;">ACTIONS</th>';
        html += '        </tr>';
        html += '      </thead>';
        html += '      <tbody>';

        this.advances.forEach(function (adv) {
          var isCanc = (adv.status === 'cancelled');
          var isFullRec = (adv.status === 'recovered' || adv.balancePaise === 0);
          var canCancel = (adv.status === 'open' && adv.balancePaise === adv.amountPaise);

          html += '        <tr style="border-bottom:1px solid var(--border-color); ' + (isCanc ? 'opacity:0.5;' : '') + '">';
          html += '          <td style="padding:10px 14px; font-weight:600;">' + (adv.date || '-') + '</td>';
          html += '          <td style="padding:10px 14px;">';
          html += '            <div style="font-weight:600; color:var(--text-primary);">' + SchoolApp.escapeHTML(adv.employeeName || adv.employeeId) + '</div>';
          html += '            <div style="font-size:11px; color:var(--text-muted);">' + (adv.reason ? SchoolApp.escapeHTML(adv.reason) : 'Salary Advance') + '</div>';
          html += '          </td>';
          html += '          <td style="padding:10px 14px; text-align:right; font-weight:700;">' + this.formatINR(adv.amountPaise || 0) + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; font-weight:600; color:' + (isFullRec ? 'var(--text-muted)' : 'var(--accent-primary)') + ';">' + this.formatINR(adv.balancePaise || 0) + '</td>';
          html += '          <td style="padding:10px 14px; font-size:12px;">' + (adv.paidFromAccount === '11100' ? 'Cash in Hand' : (adv.paidFromAccount || 'Bank')) + '</td>';
          html += '          <td style="padding:10px 14px; text-align:center;">';
          if (isCanc) {
            html += '            <span class="badge" style="background:rgba(239,68,68,0.1); color:var(--danger); font-size:10px;">Cancelled</span>';
          } else if (isFullRec) {
            html += '            <span class="badge badge-success" style="font-size:10px;">Recovered</span>';
          } else if (adv.status === 'recovering') {
            html += '            <span class="badge badge-info" style="font-size:10px;">Recovering</span>';
          } else {
            html += '            <span class="badge badge-warning" style="font-size:10px;">Open</span>';
          }
          html += '          </td>';
          html += '          <td style="padding:10px 14px; text-align:center;">';
          if (canCancel) {
            html += '            <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.cancelAdvance(\'' + adv.id + '\')" style="padding:3px 8px; font-size:11px; color:var(--danger);" title="Cancel advance and reverse journal voucher">';
            html += '              <span class="material-icons-round" style="font-size:13px;">cancel</span> Cancel';
            html += '            </button>';
          } else {
            html += '            <span style="color:var(--text-muted); font-size:11px;">-</span>';
          }
          html += '          </td>';
          html += '        </tr>';
        }.bind(this));

        html += '      </tbody>';
        html += '    </table>';
        html += '  </div>';
        html += '</div>';
      }

      // SECTION B: Statutory Payments
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:12px;">';
      html += '  <div>';
      html += '    <h4 style="margin:0; font-size:16px; font-weight:700;">Statutory Payments & Challans</h4>';
      html += '    <p style="margin:2px 0 0 0; font-size:12px; color:var(--text-secondary);">Record monthly statutory deposits (EPF ECR, ESIC Challan, Jharkhand PT, TDS) to clear outstanding liabilities.</p>';
      html += '  </div>';
      html += '  <button class="btn btn-primary" onclick="SchoolApp.modules.accounts.openAddStatutoryPaymentModal()">';
      html += '    <span class="material-icons-round">account_balance</span> Record Statutory Deposit';
      html += '  </button>';
      html += '</div>';

      if (!this.statutoryPayments || this.statutoryPayments.length === 0) {
        html += '<div class="card" style="padding:28px 20px; text-align:center; border-radius:10px; color:var(--text-secondary);">';
        html += '  <span class="material-icons-round" style="font-size:36px; color:var(--text-muted); margin-bottom:8px;">account_balance</span>';
        html += '  <p style="font-weight:600; font-size:13.5px; margin:0 0 4px 0;">No statutory deposits recorded</p>';
        html += '  <p style="font-size:12px; margin:0 auto 14px auto;">Record monthly PF/ESIC challan payments to debit statutory liability ledgers and credit your bank.</p>';
        html += '  <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.openAddStatutoryPaymentModal()">Record First Deposit</button>';
        html += '</div>';
      } else {
        html += '<div class="card" style="padding:0; border-radius:10px; overflow:hidden;">';
        html += '  <div class="table-responsive acc-table-container">';
        html += '    <table class="table acc-table" style="width:100%; margin:0; border-collapse:collapse; font-size:12.5px;">';
        html += '      <thead>';
        html += '        <tr style="text-align:left; color:var(--text-secondary); border-bottom:1px solid var(--border-color); font-size:11.5px;">';
        html += '          <th style="padding:10px 14px;">DATE</th>';
        html += '          <th style="padding:10px 14px;">TYPE</th>';
        html += '          <th style="padding:10px 14px;">FOR MONTH</th>';
        html += '          <th style="padding:10px 14px;">CHALLAN / REF</th>';
        html += '          <th style="padding:10px 14px; text-align:right;">AMOUNT</th>';
        html += '          <th style="padding:10px 14px;">BREAKDOWN</th>';
        html += '          <th style="padding:10px 14px;">PAID FROM</th>';
        html += '          <th style="padding:10px 14px; text-align:center;">STATUS</th>';
        html += '          <th style="padding:10px 14px; text-align:center;">ACTIONS</th>';
        html += '        </tr>';
        html += '      </thead>';
        html += '      <tbody>';

        this.statutoryPayments.forEach(function (stat) {
          var isCanc = (stat.status === 'cancelled');
          var typeLabel = stat.type ? stat.type.toUpperCase() : 'STATUTORY';

          html += '        <tr style="border-bottom:1px solid var(--border-color); ' + (isCanc ? 'opacity:0.5;' : '') + '">';
          html += '          <td style="padding:10px 14px; font-weight:600;">' + (stat.date || '-') + '</td>';
          html += '          <td style="padding:10px 14px;"><span class="badge badge-info" style="font-size:10.5px;">' + typeLabel + '</span></td>';
          html += '          <td style="padding:10px 14px; font-weight:600;">' + (stat.forMonth || '-') + '</td>';
          html += '          <td style="padding:10px 14px; font-size:12px;">' + SchoolApp.escapeHTML(stat.challanNumber || '-') + '</td>';
          html += '          <td style="padding:10px 14px; text-align:right; font-weight:700;">' + this.formatINR(stat.amountPaise || 0) + '</td>';
          html += '          <td style="padding:10px 14px; font-size:11px; color:var(--text-secondary);">';
          if (stat.employeeSharePaise || stat.employerSharePaise) {
            html += '            <div>EE: ' + this.formatINR(stat.employeeSharePaise || 0) + '</div>';
            html += '            <div>ER: ' + this.formatINR(stat.employerSharePaise || 0) + '</div>';
          } else {
            html += '            <span>Direct Deposit</span>';
          }
          html += '          </td>';
          html += '          <td style="padding:10px 14px; font-size:12px;">' + (stat.paidFromAccount === '11100' ? 'Cash' : (stat.paidFromAccount || 'Bank')) + '</td>';
          html += '          <td style="padding:10px 14px; text-align:center;">';
          if (isCanc) {
            html += '            <span class="badge" style="background:rgba(239,68,68,0.1); color:var(--danger); font-size:10px;">Cancelled</span>';
          } else {
            html += '            <span class="badge badge-success" style="font-size:10px;">Deposited</span>';
          }
          html += '          </td>';
          html += '          <td style="padding:10px 14px; text-align:center;">';
          if (!isCanc) {
            html += '            <button class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.cancelStatutoryPayment(\'' + stat.id + '\')" style="padding:3px 8px; font-size:11px; color:var(--danger);" title="Cancel deposit and reverse journal voucher">';
            html += '              <span class="material-icons-round" style="font-size:13px;">cancel</span> Cancel';
            html += '            </button>';
          } else {
            html += '            <span style="color:var(--text-muted); font-size:11px;">-</span>';
          }
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

    openAddAdvanceModal: function () {
      var today = new Date().toISOString().split('T')[0];
      var teachers = (SchoolApp.state && SchoolApp.state.teachers) || [];
      var activeStaff = (this.staff || []).filter(function (s) { return s.status !== 'left'; });
      var bankAccounts = (this.settings && this.settings.bankAccounts) || [];

      var html = '';
      html += '<form id="form-add-advance" onsubmit="SchoolApp.modules.accounts.saveAdvance(event)">';
      html += '  <div class="form-group" style="margin-bottom:12px;">';
      html += '    <label class="form-label" style="font-weight:600;">Employee *</label>';
      html += '    <select class="form-control form-select" id="adv-emp" required>';
      html += '      <option value="">Select Teacher or Staff...</option>';
      html += '      <optgroup label="Teachers">';
      teachers.forEach(function (t) {
        if (t.status !== 'inactive') {
          var tName = (t.firstName || '') + (t.lastName ? ' ' + t.lastName : '') || t.name;
          html += '        <option value="teacher:' + t.id + ':' + SchoolApp.escapeHTML(tName) + '">' + SchoolApp.escapeHTML(tName) + ' (' + (t.subject || 'Teacher') + ')</option>';
        }
      });
      html += '      </optgroup>';
      html += '      <optgroup label="Non-Teaching Staff">';
      activeStaff.forEach(function (s) {
        html += '        <option value="staff:' + s.id + ':' + SchoolApp.escapeHTML(s.name) + '">' + SchoolApp.escapeHTML(s.name) + ' (' + (s.role || 'Staff') + ')</option>';
      });
      html += '      </optgroup>';
      html += '    </select>';
      html += '  </div>';

      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Advance Amount (INR ₹) *</label>';
      html += '      <input type="number" step="1" min="1" class="form-control" id="adv-amount" placeholder="e.g. 5000" required />';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Disbursement Date *</label>';
      html += '      <input type="date" class="form-control" id="adv-date" value="' + today + '" required />';
      html += '    </div>';
      html += '  </div>';

      html += '  <div class="form-group" style="margin-bottom:12px;">';
      html += '    <label class="form-label" style="font-weight:600;">Paid From Account *</label>';
      html += '    <select class="form-control form-select" id="adv-paid-from" required>';
      html += '      <optgroup label="Cash">';
      html += '        <option value="11100">11100 - Cash in Hand</option>';
      html += '      </optgroup>';
      html += '      <optgroup label="Bank Accounts">';
      if (bankAccounts.length === 0) {
        html += '        <option value="11200">11200 - Primary Bank Account</option>';
      } else {
        bankAccounts.forEach(function (b) {
          html += '        <option value="' + b.code + '">' + b.code + ' - ' + SchoolApp.escapeHTML(b.bankName || 'Bank') + ' (' + SchoolApp.escapeHTML(b.accountNumber || '') + ')</option>';
        });
      }
      html += '      </optgroup>';
      html += '    </select>';
      html += '  </div>';

      html += '  <div class="form-group" style="margin-bottom:12px;">';
      html += '    <label class="form-label" style="font-weight:600;">Reason / Narration</label>';
      html += '    <input type="text" class="form-control" id="adv-reason" placeholder="e.g. Festival advance / Medical emergency" />';
      html += '  </div>';
      html += '</form>';

      var footer = '';
      footer += '<button type="button" class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
      footer += '<button type="submit" form="form-add-advance" class="btn btn-primary" id="btn-save-adv">';
      footer += '  <span class="material-icons-round">save</span> Disburse Advance';
      footer += '</button>';

      this.openModal('Give Salary Advance', html, footer);
    },

    saveAdvance: async function (e) {
      if (e) e.preventDefault();
      var btn = document.getElementById('btn-save-adv');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Disbursing...';
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      var empVal = document.getElementById('adv-emp').value;
      if (!empVal) {
        SchoolApp.showToast('Please select an employee.', 'warning');
        if (btn) btn.disabled = false;
        return;
      }
      var parts = empVal.split(':');
      var empType = parts[0];
      var empId = parts[1];
      var empName = parts.slice(2).join(':');

      var amountRupees = parseFloat(document.getElementById('adv-amount').value) || 0;
      var date = document.getElementById('adv-date').value;
      var paidFrom = document.getElementById('adv-paid-from').value;
      var reason = document.getElementById('adv-reason').value.trim();

      var advId = 'adv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      var amountPaise = Math.round(amountRupees * 100);

      try {
        var advRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_advances', advId);
        var authUser = window.auth && window.auth.currentUser;

        await fs.setDoc(advRef, {
          id: advId,
          employeeId: empId,
          employeeType: empType,
          employeeName: empName,
          date: date,
          amountPaise: amountPaise,
          balancePaise: amountPaise,
          paidFromAccount: paidFrom,
          paidFromType: (paidFrom === '11100' ? 'cash' : 'bank'),
          status: 'open',
          reason: reason,
          createdAt: new Date().toISOString(),
          createdBy: authUser ? authUser.email : 'admin'
        });

        // Trigger background sync to post voucher immediately
        this.sync(true);

        await this.loadData();
        SchoolApp.closeModal();
        SchoolApp.showToast('Salary advance disbursed and ledger updated.', 'success');
        this.renderCurrentTab();
      } catch (err) {
        console.error('Save advance error:', err);
        SchoolApp.showToast('Failed to disburse advance: ' + (err.message || 'Check connection'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">save</span> Disburse Advance';
        }
      }
    },

    cancelAdvance: async function (advId) {
      var reason = prompt('Enter reason for cancelling this salary advance:');
      if (!reason) return;

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      try {
        var advRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_advances', advId);
        var authUser = window.auth && window.auth.currentUser;

        await fs.updateDoc(advRef, {
          status: 'cancelled',
          cancelReason: reason,
          cancelledAt: new Date().toISOString(),
          cancelledBy: authUser ? authUser.email : 'admin'
        });

        // Trigger background sync to post cancellation reversal voucher
        this.sync(true);

        await this.loadData();
        SchoolApp.showToast('Salary advance cancelled and reversal posted.', 'info');
        this.renderCurrentTab();
      } catch (err) {
        console.error('Cancel advance error:', err);
        SchoolApp.showToast('Failed to cancel advance: ' + err.message, 'error');
      }
    },

    openAddStatutoryPaymentModal: function () {
      var today = new Date().toISOString().split('T')[0];
      var now = new Date();
      var lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      var defaultMonth = lastMonth.getFullYear() + '-' + String(lastMonth.getMonth() + 1).padStart(2, '0');
      var bankAccounts = (this.settings && this.settings.bankAccounts) || [];

      var html = '';
      html += '<form id="form-add-statutory" onsubmit="SchoolApp.modules.accounts.saveStatutoryPayment(event)">';
      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Statutory Type *</label>';
      html += '      <select class="form-control form-select" id="stat-type" required onchange="SchoolApp.modules.accounts.toggleStatutoryShareFields(this.value)">';
      html += '        <option value="epf">EPF (Provident Fund ECR Deposit)</option>';
      html += '        <option value="esic">ESIC (Employee State Insurance)</option>';
      html += '        <option value="pt">Professional Tax (Jharkhand PT)</option>';
      html += '        <option value="tds">TDS on Salaries (Challan 281)</option>';
      html += '      </select>';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Wage Month (For Month) *</label>';
      html += '      <input type="month" class="form-control" id="stat-month" value="' + defaultMonth + '" required />';
      html += '    </div>';
      html += '  </div>';

      html += '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Challan / TRRN / BSR Ref No. *</label>';
      html += '      <input type="text" class="form-control" id="stat-challan" placeholder="e.g. TRRN 1012345678" required />';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-weight:600;">Deposit Date *</label>';
      html += '      <input type="date" class="form-control" id="stat-date" value="' + today + '" required />';
      html += '    </div>';
      html += '  </div>';

      html += '  <div class="form-group" style="margin-bottom:12px;">';
      html += '    <label class="form-label" style="font-weight:600;">Total Paid Amount (INR ₹) *</label>';
      html += '    <input type="number" step="0.01" min="1" class="form-control" id="stat-amount" placeholder="0.00" required oninput="SchoolApp.modules.accounts.splitStatutoryAmount()" />';
      html += '  </div>';

      html += '  <div id="stat-share-fields" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-size:12px; font-weight:600;">Employee Deductions Share (₹)</label>';
      html += '      <input type="number" step="0.01" min="0" class="form-control" id="stat-ee-share" placeholder="0.00" />';
      html += '      <small style="color:var(--text-muted); font-size:11px;">Clears Ledger 22100 / 22200</small>';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label" style="font-size:12px; font-weight:600;">Employer Contribution Share (₹)</label>';
      html += '      <input type="number" step="0.01" min="0" class="form-control" id="stat-er-share" placeholder="0.00" />';
      html += '      <small style="color:var(--text-muted); font-size:11px;">Clears Ledger 22110 / 22200</small>';
      html += '    </div>';
      html += '  </div>';

      html += '  <div class="form-group" style="margin-bottom:12px;">';
      html += '    <label class="form-label" style="font-weight:600;">Paid From Account *</label>';
      html += '    <select class="form-control form-select" id="stat-paid-from" required>';
      html += '      <optgroup label="Bank Accounts">';
      if (bankAccounts.length === 0) {
        html += '        <option value="11200">11200 - Primary Bank Account</option>';
      } else {
        bankAccounts.forEach(function (b) {
          html += '        <option value="' + b.code + '">' + b.code + ' - ' + SchoolApp.escapeHTML(b.bankName || 'Bank') + ' (' + SchoolApp.escapeHTML(b.accountNumber || '') + ')</option>';
        });
      }
      html += '      </optgroup>';
      html += '      <optgroup label="Cash">';
      html += '        <option value="11100">11100 - Cash in Hand</option>';
      html += '      </optgroup>';
      html += '    </select>';
      html += '  </div>';
      html += '</form>';

      var footer = '';
      footer += '<button type="button" class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
      footer += '<button type="submit" form="form-add-statutory" class="btn btn-primary" id="btn-save-stat">';
      footer += '  <span class="material-icons-round">save</span> Record Deposit';
      footer += '</button>';

      this.openModal('Record Statutory Deposit (Challan)', html, footer);
    },

    toggleStatutoryShareFields: function (type) {
      var shareFields = document.getElementById('stat-share-fields');
      if (shareFields) {
        if (type === 'epf' || type === 'esic') {
          shareFields.style.display = 'grid';
        } else {
          shareFields.style.display = 'none';
        }
      }
    },

    splitStatutoryAmount: function () {
      var typeEl = document.getElementById('stat-type');
      if (!typeEl) return;
      var type = typeEl.value;
      if (type !== 'epf') return;

      var total = parseFloat(document.getElementById('stat-amount').value) || 0;
      var ee = Math.round(total / 2);
      var er = total - ee;
      var eeEl = document.getElementById('stat-ee-share');
      var erEl = document.getElementById('stat-er-share');
      if (eeEl && !eeEl.value) eeEl.value = ee;
      if (erEl && !erEl.value) erEl.value = er;
    },

    saveStatutoryPayment: async function (e) {
      if (e) e.preventDefault();
      var btn = document.getElementById('btn-save-stat');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Recording...';
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      var type = document.getElementById('stat-type').value;
      var forMonth = document.getElementById('stat-month').value;
      var challan = document.getElementById('stat-challan').value.trim();
      var date = document.getElementById('stat-date').value;
      var amountRupees = parseFloat(document.getElementById('stat-amount').value) || 0;
      var eeShareRupees = parseFloat(document.getElementById('stat-ee-share') ? document.getElementById('stat-ee-share').value : 0) || 0;
      var erShareRupees = parseFloat(document.getElementById('stat-er-share') ? document.getElementById('stat-er-share').value : 0) || 0;
      var paidFrom = document.getElementById('stat-paid-from').value;

      var statId = 'stat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      var amountPaise = Math.round(amountRupees * 100);
      var eeSharePaise = Math.round(eeShareRupees * 100);
      var erSharePaise = Math.round(erShareRupees * 100);

      try {
        var statRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_statutory_payments', statId);
        var authUser = window.auth && window.auth.currentUser;

        await fs.setDoc(statRef, {
          id: statId,
          type: type,
          forMonth: forMonth,
          challanNumber: challan,
          date: date,
          amountPaise: amountPaise,
          employeeSharePaise: eeSharePaise,
          employerSharePaise: erSharePaise,
          paidFromAccount: paidFrom,
          paidFromType: (paidFrom === '11100' ? 'cash' : 'bank'),
          status: 'completed',
          createdAt: new Date().toISOString(),
          createdBy: authUser ? authUser.email : 'admin'
        });

        // Trigger background sync to post voucher immediately
        this.sync(true);

        await this.loadData();
        SchoolApp.closeModal();
        SchoolApp.showToast('Statutory deposit recorded and ledger updated.', 'success');
        this.renderCurrentTab();
      } catch (err) {
        console.error('Save statutory payment error:', err);
        SchoolApp.showToast('Failed to record deposit: ' + (err.message || 'Check connection'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">save</span> Record Deposit';
        }
      }
    },

    cancelStatutoryPayment: async function (statId) {
      var reason = prompt('Enter reason for cancelling this statutory deposit:');
      if (!reason) return;

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      try {
        var statRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_statutory_payments', statId);
        var authUser = window.auth && window.auth.currentUser;

        await fs.updateDoc(statRef, {
          status: 'cancelled',
          cancelReason: reason,
          cancelledAt: new Date().toISOString(),
          cancelledBy: authUser ? authUser.email : 'admin'
        });

        // Trigger background sync to post cancellation reversal voucher
        this.sync(true);

        await this.loadData();
        SchoolApp.showToast('Statutory payment cancelled and reversal posted.', 'info');
        this.renderCurrentTab();
      } catch (err) {
        console.error('Cancel statutory payment error:', err);
        SchoolApp.showToast('Failed to cancel payment: ' + err.message, 'error');
      }
    },

    // ── 5. Payroll Settings Sub-tab ──────────────────────────────────────────
    renderPayrollSettingsHTML: function () {
      var s = this.payrollSettings || {};
      var epf = s.epf || {};
      var esic = s.esic || {};
      var pt = s.pt || {};

      var html = '';
      html += '<div style="max-width:840px;">';
      html += '  <div style="margin-bottom:16px;">';
      html += '    <h4 style="margin:0; font-size:16px; font-weight:700;">Payroll Configuration & Statutory Rates</h4>';
      html += '    <p style="margin:2px 0 0 0; font-size:12px; color:var(--text-secondary);">Configure statutory deductions, working days basis, and state compliance presets.</p>';
      html += '  </div>';

      html += '  <form id="form-payroll-settings" onsubmit="SchoolApp.modules.accounts.savePayrollSettings(event)">';

      // General: Working Days Basis
      html += '    <div class="card" style="padding:18px; border-radius:10px; margin-bottom:18px;">';
      html += '      <h5 style="margin:0 0 12px 0; font-size:14px; font-weight:700;">Working Days Basis for Salary Proration</h5>';
      html += '      <div class="form-group" style="max-width:400px;">';
      html += '        <select class="form-control form-select" id="pset-days-basis">';
      html += '          <option value="working" ' + (s.workingDaysBasis === 'working' || !s.workingDaysBasis ? 'selected' : '') + '>Standard Working Days (Monday–Saturday, ~26 days)</option>';
      html += '          <option value="actual" ' + (s.workingDaysBasis === 'actual' ? 'selected' : '') + '>Actual Calendar Days (28–31 days in month)</option>';
      html += '          <option value="fixed30" ' + (s.workingDaysBasis === 'fixed30' ? 'selected' : '') + '>Fixed 30 Days (Uniform proration)</option>';
      html += '        </select>';
      html += '        <small style="color:var(--text-muted); font-size:11px; margin-top:4px; display:block;">Defines how per-day salary is calculated when an employee has Loss of Pay (LOP) days.</small>';
      html += '      </div>';
      html += '    </div>';

      // Biometric / GPS Attendance LOP Integration (C2)
      var holidaysStr = Array.isArray(s.holidays) ? s.holidays.join('\n') : '';
      html += '    <div class="card" style="padding:18px; border-radius:10px; margin-bottom:18px;">';
      html += '      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">';
      html += '        <div>';
      html += '          <h5 style="margin:0; font-size:14px; font-weight:700;">Biometric / GPS Attendance LOP Integration</h5>';
      html += '          <p style="margin:2px 0 0 0; font-size:12px; color:var(--text-secondary);">When enabled, unexcused absent working days are automatically counted as Loss of Pay (LOP).</p>';
      html += '        </div>';
      html += '        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13px;">';
      html += '          <input type="checkbox" id="pset-lop-att" ' + (s.lopFromAttendance ? 'checked' : '') + ' /> Enable Attendance LOP';
      html += '        </label>';
      html += '      </div>';
      html += '      <div class="form-group" style="margin-top:12px;">';
      html += '        <label class="form-label" style="font-size:12px; font-weight:600;">School Holidays List (YYYY-MM-DD, one per line)</label>';
      html += '        <textarea class="form-control" id="pset-holidays" rows="3" placeholder="e.g.\n2026-04-14\n2026-05-01">' + SchoolApp.escapeHTML(holidaysStr) + '</textarea>';
      html += '        <small style="color:var(--text-muted); font-size:11px; margin-top:4px; display:block;">Dates listed here are excluded from working days and will not incur attendance LOP.</small>';
      html += '      </div>';
      html += '    </div>';

      // EPF Settings
      html += '    <div class="card" style="padding:18px; border-radius:10px; margin-bottom:18px;">';
      html += '      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">';
      html += '        <div>';
      html += '          <h5 style="margin:0; font-size:14px; font-weight:700;">Employees Provident Fund (EPF)</h5>';
      html += '          <p style="margin:2px 0 0 0; font-size:12px; color:var(--text-secondary);">Statutory retirement fund contributions under EPFO rules.</p>';
      html += '        </div>';
      html += '        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13px;">';
      html += '          <input type="checkbox" id="pset-epf-enabled" ' + (epf.enabled ? 'checked' : '') + ' /> Enable EPF for School';
      html += '        </label>';
      html += '      </div>';

      html += '      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:12px;">';
      html += '        <div class="form-group">';
      html += '          <label class="form-label" style="font-size:12px; font-weight:600;">Employee Rate (%)</label>';
      html += '          <input type="number" step="0.01" class="form-control" id="pset-epf-ee-rate" value="' + (epf.employeeRate !== undefined ? epf.employeeRate : 12.0) + '" />';
      html += '        </div>';
      html += '        <div class="form-group">';
      html += '          <label class="form-label" style="font-size:12px; font-weight:600;">Employer EPF Rate (%)</label>';
      html += '          <input type="number" step="0.01" class="form-control" id="pset-epf-er-rate" value="' + (epf.employerRate !== undefined ? epf.employerRate : 12.0) + '" />';
      html += '        </div>';
      html += '        <div class="form-group">';
      html += '          <label class="form-label" style="font-size:12px; font-weight:600;">Employer EPS Rate (%)</label>';
      html += '          <input type="number" step="0.01" class="form-control" id="pset-epf-eps-rate" value="' + (epf.employerEpsRate !== undefined ? epf.employerEpsRate : 8.33) + '" />';
      html += '        </div>';
      html += '      </div>';

      html += '      <div class="form-group">';
      html += '        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px;">';
      html += '          <input type="checkbox" id="pset-epf-cap" ' + (epf.wageCeilingEnabled !== false ? 'checked' : '') + ' /> Apply Statutory EPF Wage Ceiling (₹15,000 / month cap on eligible wage)';
      html += '        </label>';
      html += '      </div>';
      html += '    </div>';

      // ESIC Settings
      html += '    <div class="card" style="padding:18px; border-radius:10px; margin-bottom:18px;">';
      html += '      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">';
      html += '        <div>';
      html += '          <h5 style="margin:0; font-size:14px; font-weight:700;">Employee State Insurance (ESIC)</h5>';
      html += '          <p style="margin:2px 0 0 0; font-size:12px; color:var(--text-secondary);">Social security medical insurance under ESIC Act (rounded up to next higher rupee).</p>';
      html += '        </div>';
      html += '        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13px;">';
      html += '          <input type="checkbox" id="pset-esic-enabled" ' + (esic.enabled ? 'checked' : '') + ' /> Enable ESIC for School';
      html += '        </label>';
      html += '      </div>';

      html += '      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">';
      html += '        <div class="form-group">';
      html += '          <label class="form-label" style="font-size:12px; font-weight:600;">Employee Rate (%)</label>';
      html += '          <input type="number" step="0.01" class="form-control" id="pset-esic-ee-rate" value="' + (esic.employeeRate !== undefined ? esic.employeeRate : 0.75) + '" />';
      html += '        </div>';
      html += '        <div class="form-group">';
      html += '          <label class="form-label" style="font-size:12px; font-weight:600;">Employer Rate (%)</label>';
      html += '          <input type="number" step="0.01" class="form-control" id="pset-esic-er-rate" value="' + (esic.employerRate !== undefined ? esic.employerRate : 3.25) + '" />';
      html += '        </div>';
      html += '      </div>';

      html += '      <div class="form-group">';
      html += '        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px;">';
      html += '          <input type="checkbox" id="pset-esic-cap" ' + (esic.wageCeilingEnabled !== false ? 'checked' : '') + ' /> Apply ESIC Wage Ceiling (exempt if gross exceeds ₹21,000 / month)';
      html += '        </label>';
      html += '      </div>';
      html += '    </div>';

      // Professional Tax (PT) Settings & Slabs
      html += '    <div class="card" style="padding:18px; border-radius:10px; margin-bottom:20px;">';
      html += '      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">';
      html += '        <div>';
      html += '          <h5 style="margin:0; font-size:14px; font-weight:700;">Professional Tax (PT)</h5>';
      html += '          <p style="margin:2px 0 0 0; font-size:12px; color:var(--text-secondary);">State statutory tax deducted from employee salaries.</p>';
      html += '        </div>';
      html += '        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13px;">';
      html += '          <input type="checkbox" id="pset-pt-enabled" ' + (pt.enabled ? 'checked' : '') + ' /> Enable PT for School';
      html += '        </label>';
      html += '      </div>';

      // CA Disclaimer Banner
      html += '      <div style="background:rgba(245, 158, 11, 0.08); border:1px solid rgba(245, 158, 11, 0.3); border-radius:8px; padding:12px; margin-bottom:14px; font-size:12.5px; color:#d97706; display:flex; align-items:center; gap:8px;">';
      html += '        <span class="material-icons-round" style="font-size:20px;">info</span>';
      html += '        <div><strong>Statutory Notice:</strong> Professional Tax slabs are governed by state-specific legislation and may change periodically. The preset below uses Jharkhand PT slabs. Please verify all statutory rates with your Chartered Accountant (CA) or Tax Consultant.</div>';
      html += '      </div>';

      // Slabs display
      html += '      <div style="font-weight:600; font-size:13px; margin-bottom:8px;">Jharkhand Professional Tax Slabs (Monthly Gross):</div>';
      html += '      <div class="table-responsive" style="margin-bottom:8px;">';
      html += '        <table class="table" style="width:100%; font-size:12px; border-collapse:collapse;">';
      html += '          <thead>';
      html += '            <tr style="border-bottom:1px solid var(--border-color); color:var(--text-secondary); text-align:left;">';
      html += '              <th style="padding:6px 10px;">Monthly Gross Wage Bracket</th>';
      html += '              <th style="padding:6px 10px; text-align:right;">Monthly Tax (₹)</th>';
      html += '              <th style="padding:6px 10px; text-align:right;">Annual Cap</th>';
      html += '            </tr>';
      html += '          </thead>';
      html += '          <tbody>';
      html += '            <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:6px 10px;">Up to ₹25,000</td><td style="padding:6px 10px; text-align:right; font-weight:600;">₹0</td><td style="padding:6px 10px; text-align:right; color:var(--text-muted);">Nil</td></tr>';
      html += '            <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:6px 10px;">₹25,001 to ₹41,666</td><td style="padding:6px 10px; text-align:right; font-weight:600;">₹100</td><td style="padding:6px 10px; text-align:right; color:var(--text-muted);">₹1,200</td></tr>';
      html += '            <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:6px 10px;">₹41,667 to ₹66,666</td><td style="padding:6px 10px; text-align:right; font-weight:600;">₹150</td><td style="padding:6px 10px; text-align:right; color:var(--text-muted);">₹1,800</td></tr>';
      html += '            <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:6px 10px;">₹66,667 to ₹83,333</td><td style="padding:6px 10px; text-align:right; font-weight:600;">₹175</td><td style="padding:6px 10px; text-align:right; color:var(--text-muted);">₹2,100</td></tr>';
      html += '            <tr><td style="padding:6px 10px;">Above ₹83,333</td><td style="padding:6px 10px; text-align:right; font-weight:600;">₹208.33</td><td style="padding:6px 10px; text-align:right; color:var(--text-muted);">₹2,500</td></tr>';
      html += '          </tbody>';
      html += '        </table>';
      html += '      </div>';
      html += '    </div>';

      // Submit Button
      html += '    <button type="submit" class="btn btn-primary" id="btn-save-pset" style="min-width:180px;">';
      html += '      <span class="material-icons-round">save</span> Save Payroll Settings';
      html += '    </button>';
      html += '  </form>';
      html += '</div>';

      return html;
    },

    savePayrollSettings: async function (e) {
      if (e) e.preventDefault();
      var btn = document.getElementById('btn-save-pset');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Saving...';
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      var daysBasis = document.getElementById('pset-days-basis').value;
      var lopAtt = document.getElementById('pset-lop-att').checked;
      var holidaysRaw = document.getElementById('pset-holidays').value || '';
      var holidaysList = holidaysRaw.split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(x); });
      var epfEnabled = document.getElementById('pset-epf-enabled').checked;
      var epfEeRate = parseFloat(document.getElementById('pset-epf-ee-rate').value) || 12.0;
      var epfErRate = parseFloat(document.getElementById('pset-epf-er-rate').value) || 12.0;
      var epfEpsRate = parseFloat(document.getElementById('pset-epf-eps-rate').value) || 8.33;
      var epfCap = document.getElementById('pset-epf-cap').checked;

      var esicEnabled = document.getElementById('pset-esic-enabled').checked;
      var esicEeRate = parseFloat(document.getElementById('pset-esic-ee-rate').value) || 0.75;
      var esicErRate = parseFloat(document.getElementById('pset-esic-er-rate').value) || 3.25;
      var esicCap = document.getElementById('pset-esic-cap').checked;

      var ptEnabled = document.getElementById('pset-pt-enabled').checked;

      var payload = {
        workingDaysBasis: daysBasis,
        lopFromAttendance: lopAtt,
        holidays: holidaysList,
        epf: {
          enabled: epfEnabled,
          employeeRate: epfEeRate,
          employerRate: epfErRate,
          employerEpsRate: epfEpsRate,
          wageCeilingEnabled: epfCap
        },
        esic: {
          enabled: esicEnabled,
          employeeRate: esicEeRate,
          employerRate: esicErRate,
          wageCeilingEnabled: esicCap
        },
        pt: {
          enabled: ptEnabled,
          state: 'Jharkhand'
        },
        updatedAt: new Date().toISOString()
      };

      try {
        var psetRef = fs.doc(db, 'tenant_data', schoolId, 'payroll_settings', 'main');
        await fs.setDoc(psetRef, payload, { merge: true });
        this.payrollSettings = payload;
        SchoolApp.showToast('Payroll settings saved successfully.', 'success');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">save</span> Save Payroll Settings';
        }
      } catch (err) {
        console.error('Save payroll settings error:', err);
        SchoolApp.showToast('Failed to save settings: ' + (err.message || 'Check connection'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">save</span> Save Payroll Settings';
        }
      }
    },

    attachPayrollEvents: function () {
      // Event bindings if needed
    },

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


