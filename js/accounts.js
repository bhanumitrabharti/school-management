/**
 * ==============================================================================
 *  ACCOUNTS & EXPENSES MODULE — CTRL Shift ERP (Slice 1)
 *  Subcollections: tenant_data/{schoolId}/accounts_settings, accounts_chart, accounts_expenses
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
    { code: '41100', name: 'Tuition Fees', type: 'income', group: 'Direct Educational Income', isSystem: true, isActive: true },
    { code: '41200', name: 'Admission & Registration Fees', type: 'income', group: 'Direct Educational Income', isSystem: true, isActive: true },
    { code: '41300', name: 'Examination Fees', type: 'income', group: 'Direct Educational Income', isSystem: true, isActive: true },
    { code: '41400', name: 'Annual / Development Charges', type: 'income', group: 'Direct Educational Income', isSystem: true, isActive: true },
    { code: '42100', name: 'Transport / Bus Charges', type: 'income', group: 'Direct Educational Income', isSystem: true, isActive: true },
    { code: '43100', name: 'Bank Interest Received', type: 'income', group: 'Other / Indirect Income', isSystem: true, isActive: true },
    { code: '43200', name: 'Miscellaneous Receipts', type: 'income', group: 'Other / Indirect Income', isSystem: true, isActive: true },

    // 5. Expenses (50000)
    { code: '51100', name: 'Teaching Staff Salaries', type: 'expense', group: 'Personnel Costs', isSystem: true, isActive: true },
    { code: '51200', name: 'Non-Teaching & Admin Salaries', type: 'expense', group: 'Personnel Costs', isSystem: true, isActive: true },
    { code: '51300', name: 'Employer EPF Contribution Expense', type: 'expense', group: 'Personnel Costs', isSystem: true, isActive: true },
    { code: '51400', name: 'Employer ESIC Contribution Expense', type: 'expense', group: 'Personnel Costs', isSystem: true, isActive: true },
    { code: '51500', name: 'Staff Welfare & Honorarium', type: 'expense', group: 'Personnel Costs', isSystem: true, isActive: true },
    { code: '52100', name: 'Printing, Stationery & Report Cards', type: 'expense', group: 'Operating & Academic Expenses', isSystem: true, isActive: true },
    { code: '52200', name: 'Examination & Evaluation Expenses', type: 'expense', group: 'Operating & Academic Expenses', isSystem: true, isActive: true },
    { code: '53100', name: 'Electricity & Water Utility', type: 'expense', group: 'Operating & Academic Expenses', isSystem: true, isActive: true },
    { code: '53200', name: 'Telecommunications & Internet', type: 'expense', group: 'Operating & Academic Expenses', isSystem: true, isActive: true },
    { code: '53300', name: 'Software, ERP & Website Hosting', type: 'expense', group: 'Operating & Academic Expenses', isSystem: true, isActive: true },
    { code: '54100', name: 'School Building & Campus Maintenance', type: 'expense', group: 'Repairs & Maintenance', isSystem: true, isActive: true },
    { code: '54200', name: 'Generator Fuel & Bus Fuel', type: 'expense', group: 'Repairs & Maintenance', isSystem: true, isActive: true },
    { code: '55100', name: 'Student Fee Concessions & Discounts', type: 'expense', group: 'Concessions & Scholarships', isSystem: true, isActive: true }
  ];

  const AccountsModule = {
    activeTab: 'overview',
    settings: null,
    chart: [],
    expenses: [],
    counters: null,
    loading: false,
    initialized: false,
    selectedAttachments: [], // temp array during expense creation

    filters: {
      search: '',
      dateRange: 'all',
      customStart: '',
      customEnd: '',
      category: 'all',
      paymentMode: 'all',
      status: 'all'
    },

    // ── Formatting Helpers ───────────────────────────────────────────────────
    formatINR: function (paise) {
      if (paise === null || paise === undefined || isNaN(paise)) return '₹0.00';
      var rupees = paise / 100;
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(rupees);
    },

    formatINRNumber: function (paise) {
      if (paise === null || paise === undefined || isNaN(paise)) return '0.00';
      var rupees = paise / 100;
      return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(rupees);
    },

    getFinancialYear: function (dateStr, startMonth) {
      startMonth = startMonth || (this.settings ? this.settings.financialYearStartMonth : 4) || 4;
      var d = dateStr ? new Date(dateStr) : new Date();
      var year = d.getFullYear();
      var month = d.getMonth() + 1; // 1-12
      var startYear = (month >= startMonth) ? year : (year - 1);
      var endYear = startYear + 1;
      return startYear + '-' + String(endYear).slice(-2);
    },

    getSchoolId: function () {
      return (SchoolApp.store && SchoolApp.store.currentSchoolId) || '';
    },

    // ── Entry Point (called by SchoolApp.navigate) ───────────────────────────
    render: async function () {
      var container = document.getElementById('page-accounts');
      if (!container) return;

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
        // First run; don't fetch full collections yet
        this.chart = [];
        this.expenses = [];
        return;
      }

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
      // Sort newest date first, then newest createdAt
      this.expenses.sort(function (a, b) {
        var dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (dateCmp !== 0) return dateCmp;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });

      this.initialized = true;
    },

    // ── First-Run Setup Wizard ───────────────────────────────────────────────
    renderSetupWizard: function (container) {
      var html = '';
      html += '<div style="max-width: 680px; margin: 32px auto; padding: 0 16px;">';
      html += '  <div class="card" style="padding: 32px; border-radius: 12px; box-shadow: var(--shadow-md);">';
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
      html += '        <div style="display:grid; grid-template-columns: 1fr 1fr 110px; gap: 10px; margin-top:8px;">';
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
      var submitBtn = document.getElementById('setup-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Initializing...';
      }

      var schoolId = this.getSchoolId();
      var fs = window.firestore;
      var db = window.db;

      try {
        var fyMonth = parseInt(document.getElementById('setup-fy-month').value, 10) || 4;
        var entityType = document.getElementById('setup-entity-type').value || 'trust_society';
        var bankLabel = (document.getElementById('setup-bank-label').value || '').trim();
        var bankName = (document.getElementById('setup-bank-name').value || '').trim();
        var bankLast4 = (document.getElementById('setup-bank-last4').value || '').trim();

        var bankAccounts = [];
        if (bankName && bankLast4) {
          bankAccounts.push({
            id: 'bank_1',
            label: bankLabel || 'Primary Bank Account',
            bankName: bankName,
            last4: bankLast4.slice(-4),
            ledgerAccountId: '11200'
          });
        }

        var nowIso = new Date().toISOString();
        var userDesc = (SchoolApp.currentUser && (SchoolApp.currentUser.firstName + ' ' + (SchoolApp.currentUser.lastName || '')).trim()) || 'Admin';

        // Use atomic WriteBatch for idempotent, single-transaction initialization
        var batch = fs.writeBatch(db);

        // 1. accounts_settings/main
        var settingsRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'main');
        batch.set(settingsRef, {
          financialYearStartMonth: fyMonth,
          entityType: entityType,
          accountingBasis: 'cash',
          bankAccounts: bankAccounts,
          setupCompletedAt: nowIso,
          setupBy: userDesc,
          updatedAt: nowIso
        });

        // 2. accounts_settings/counters
        var countersRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'counters');
        batch.set(countersRef, {
          expenseSeq: {}
        });

        // 3. Seed accounts_chart with default accounts
        DEFAULT_CHART_OF_ACCOUNTS.forEach(function (acc) {
          var accRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_chart', acc.code);
          batch.set(accRef, {
            code: acc.code,
            name: acc.name,
            type: acc.type,
            group: acc.group,
            isSystem: acc.isSystem,
            isActive: acc.isActive,
            createdAt: nowIso
          });
        });

        await batch.commit();

        SchoolApp.showToast('Accounts initialized successfully with Indian School Chart of Accounts!', 'success');
        await this.render();
      } catch (err) {
        console.error('[Accounts] Setup error:', err);
        SchoolApp.showToast('Setup failed: ' + (err.message || 'Permission denied'), 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span class="material-icons-round">check_circle</span> Confirm & Initialize Accounts';
        }
      }
    },

    // ── Main Workspace Renderer ──────────────────────────────────────────────
    renderWorkspace: function (container) {
      var html = '';

      // Header Banner
      html += '<div class="page-header" style="margin-bottom: 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">';
      html += '  <div>';
      html += '    <h2 style="font-size:20px; font-weight:700; color:var(--text-primary); display:flex; align-items:center; gap:8px; margin-bottom:4px;">';
      html += '      <span class="material-icons-round" style="color:var(--accent-primary);">account_balance</span>';
      html += '      Accounts & Financial Management';
      html += '      <span class="badge badge-info" style="font-size:11px; padding:3px 8px;">FY ' + this.getFinancialYear() + '</span>';
      html += '    </h2>';
      html += '    <p style="font-size:13px; color:var(--text-secondary); margin:0;">Source of truth expenses, bill attachments, and Chart of Accounts</p>';
      html += '  </div>';
      html += '  <div class="header-actions" style="display:flex; gap:10px; align-items:center;">';
      html += '    <button class="btn btn-primary" onclick="SchoolApp.modules.accounts.openAddExpenseModal()" id="btn-add-expense">';
      html += '      <span class="material-icons-round">add</span> Record Expense';
      html += '    </button>';
      html += '  </div>';
      html += '</div>';

      // Tab Navigation Bar
      html += '<div class="tabs" style="display:flex; border-bottom:1px solid var(--border-color); margin-bottom:24px; gap:8px;">';
      var tabs = [
        { id: 'overview', label: 'Overview', icon: 'dashboard' },
        { id: 'expenses', label: 'Expenses (' + this.expenses.filter(function (e) { return e.status !== 'cancelled'; }).length + ')', icon: 'receipt_long' },
        { id: 'chart', label: 'Chart of Accounts (' + this.chart.length + ')', icon: 'account_tree' },
        { id: 'settings', label: 'Settings', icon: 'tune' }
      ];
      tabs.forEach(function (t) {
        var activeClass = (this.activeTab === t.id) ? 'active' : '';
        html += '<button class="tab-btn ' + activeClass + '" onclick="SchoolApp.modules.accounts.switchTab(\'' + t.id + '\')" style="display:inline-flex; align-items:center; gap:6px; padding:10px 16px; font-size:13.5px; font-weight:600; border:none; background:none; cursor:pointer; border-bottom:2px solid transparent; color:var(--text-secondary);">';
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
      }
      this.renderCurrentTab();
    },

    renderCurrentTab: function () {
      var contentEl = document.getElementById('accounts-tab-content');
      if (!contentEl) return;

      if (this.activeTab === 'overview') {
        contentEl.innerHTML = this.renderOverviewHTML();
      } else if (this.activeTab === 'expenses') {
        contentEl.innerHTML = this.renderExpensesHTML();
        this.attachExpenseEvents();
      } else if (this.activeTab === 'chart') {
        contentEl.innerHTML = this.renderChartHTML();
      } else if (this.activeTab === 'settings') {
        contentEl.innerHTML = this.renderSettingsHTML();
      }
    },

    // ── Tab 1: Overview ──────────────────────────────────────────────────────
    renderOverviewHTML: function () {
      var currentFY = this.getFinancialYear();
      var now = new Date();
      var currentMonthPrefix = now.toISOString().slice(0, 7); // YYYY-MM

      var activeExpenses = this.expenses.filter(function (e) { return e.status !== 'cancelled'; });

      // Total This Month
      var monthTotalPaise = 0;
      activeExpenses.forEach(function (e) {
        if (e.date && e.date.startsWith(currentMonthPrefix)) {
          monthTotalPaise += (e.amountPaise || 0);
        }
      });

      // Total This Financial Year
      var fyTotalPaise = 0;
      activeExpenses.forEach(function (e) {
        if (e.financialYear === currentFY) {
          fyTotalPaise += (e.amountPaise || 0);
        }
      });

      // Group by Category
      var catTotals = {};
      activeExpenses.forEach(function (e) {
        var cat = e.categoryAccountId || '52100';
        catTotals[cat] = (catTotals[cat] || 0) + (e.amountPaise || 0);
      });

      var catList = Object.keys(catTotals).map(function (code) {
        var acc = this.chart.find(function (a) { return a.code === code; });
        return {
          code: code,
          name: acc ? acc.name : ('Account ' + code),
          totalPaise: catTotals[code]
        };
      }.bind(this));
      catList.sort(function (a, b) { return b.totalPaise - a.totalPaise; });

      var html = '';

      // Banner Note
      html += '<div class="alert alert-info" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:8px; margin-bottom:20px; background:rgba(37, 99, 235, 0.08); border:1px solid rgba(37, 99, 235, 0.2);">';
      html += '  <span class="material-icons-round" style="color:var(--accent-primary); font-size:22px;">info</span>';
      html += '  <div style="font-size:13px; color:var(--text-primary); line-height:1.4;">';
      html += '    <strong>Note on Balances:</strong> Cash and bank balances will arrive with the automated double-entry ledger update in Slice 2. Balances are never estimated or shown unverified.';
      html += '  </div>';
      html += '</div>';

      // KPI Metric Cards
      html += '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:16px; margin-bottom:24px;">';

      // Card 1: Month Total
      html += '  <div class="card" style="padding:20px; border-radius:10px; border-left:4px solid #3b82f6;">';
      html += '    <div style="font-size:12px; font-weight:600; text-transform:uppercase; color:var(--text-secondary); margin-bottom:4px;">Expenses This Month (' + now.toLocaleString('en-IN', { month: 'short' }) + ')</div>';
      html += '    <div style="font-size:24px; font-weight:700; color:var(--text-primary);">' + this.formatINR(monthTotalPaise) + '</div>';
      html += '    <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Active recorded expense vouchers</div>';
      html += '  </div>';

      // Card 2: FY Total
      html += '  <div class="card" style="padding:20px; border-radius:10px; border-left:4px solid #10b981;">';
      html += '    <div style="font-size:12px; font-weight:600; text-transform:uppercase; color:var(--text-secondary); margin-bottom:4px;">Total FY ' + currentFY + ' Expenses</div>';
      html += '    <div style="font-size:24px; font-weight:700; color:var(--text-primary);">' + this.formatINR(fyTotalPaise) + '</div>';
      html += '    <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Year-to-date total</div>';
      html += '  </div>';

      // Card 3: Total Count
      html += '  <div class="card" style="padding:20px; border-radius:10px; border-left:4px solid #8b5cf6;">';
      html += '    <div style="font-size:12px; font-weight:600; text-transform:uppercase; color:var(--text-secondary); margin-bottom:4px;">Total Vouchers Recorded</div>';
      html += '    <div style="font-size:24px; font-weight:700; color:var(--text-primary);">' + activeExpenses.length + ' <span style="font-size:13px; font-weight:400; color:var(--text-secondary);">active</span></div>';
      html += '    <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">' + (this.expenses.length - activeExpenses.length) + ' cancelled</div>';
      html += '  </div>';

      html += '</div>';

      // Two-column layout: Top Categories + Recent Expenses
      html += '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:20px;">';

      // Top Categories Card
      html += '  <div class="card" style="padding:20px; border-radius:10px;">';
      html += '    <h3 style="font-size:15px; font-weight:700; margin-bottom:14px; color:var(--text-primary); display:flex; justify-content:space-between; align-items:center;">';
      html += '      <span>Top Expense Categories</span>';
      html += '      <span style="font-size:12px; font-weight:400; color:var(--text-secondary);">All-time</span>';
      html += '    </h3>';
      if (catList.length === 0) {
        html += '    <p class="text-muted" style="font-size:13px; text-align:center; padding:24px;">No expense categories recorded yet.</p>';
      } else {
        html += '    <div style="display:flex; flex-direction:column; gap:12px;">';
        catList.slice(0, 5).forEach(function (c) {
          var pct = fyTotalPaise > 0 ? Math.round((c.totalPaise / fyTotalPaise) * 100) : 0;
          html += '      <div>';
          html += '        <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">';
          html += '          <span style="font-weight:600; color:var(--text-primary);">' + SchoolApp.escapeHTML(c.name) + '</span>';
          html += '          <span style="font-weight:700; color:var(--text-primary);">' + this.formatINR(c.totalPaise) + '</span>';
          html += '        </div>';
          html += '        <div style="height:6px; background:var(--border-color); border-radius:3px; overflow:hidden;">';
          html += '          <div style="width:' + Math.min(100, Math.max(5, pct)) + '%; height:100%; background:var(--accent-primary); border-radius:3px;"></div>';
          html += '        </div>';
          html += '      </div>';
        }.bind(this));
        html += '    </div>';
      }
      html += '  </div>';

      // Recent 10 Expenses Card
      html += '  <div class="card" style="padding:20px; border-radius:10px;">';
      html += '    <h3 style="font-size:15px; font-weight:700; margin-bottom:14px; color:var(--text-primary); display:flex; justify-content:space-between; align-items:center;">';
      html += '      <span>Recent Expenses</span>';
      html += '      <a href="javascript:void(0)" onclick="SchoolApp.modules.accounts.switchTab(\'expenses\')" style="font-size:12px; color:var(--accent-primary); text-decoration:none; font-weight:600;">View All</a>';
      html += '    </h3>';
      var recent = this.expenses.slice(0, 10);
      if (recent.length === 0) {
        html += '    <p class="text-muted" style="font-size:13px; text-align:center; padding:24px;">No expenses recorded yet.</p>';
      } else {
        html += '    <div style="display:flex; flex-direction:column; gap:8px;">';
        recent.forEach(function (e) {
          var isCan = e.status === 'cancelled';
          html += '      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border-color); font-size:13px;">';
          html += '        <div>';
          html += '          <div style="font-weight:600; color:' + (isCan ? 'var(--text-muted); text-decoration:line-through;' : 'var(--text-primary);') + '">' + SchoolApp.escapeHTML(e.vendorName || 'Expense') + '</div>';
          html += '          <div style="font-size:11.5px; color:var(--text-muted);">' + (e.expenseNo || '—') + ' • ' + (e.date || '—') + '</div>';
          html += '        </div>';
          html += '        <div style="text-align:right;">';
          html += '          <div style="font-weight:700; color:' + (isCan ? 'var(--danger); text-decoration:line-through;' : 'var(--text-primary);') + '">' + this.formatINR(e.amountPaise) + '</div>';
          if (isCan) {
            html += '          <span class="badge badge-danger" style="font-size:10px; padding:1px 4px;">Cancelled</span>';
          }
          html += '        </div>';
          html += '      </div>';
        }.bind(this));
        html += '    </div>';
      }
      html += '  </div>';

      html += '</div>';

      return html;
    },

    // ── Tab 2: Expenses List, Filters, Add & Cancel ──────────────────────────
    renderExpensesHTML: function () {
      var filtered = this.getFilteredExpenses();
      var html = '';

      // Toolbar / Filters
      html += '<div class="card" style="padding:16px; border-radius:10px; margin-bottom:20px;">';
      html += '  <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; align-items:flex-end;">';

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
      html += '  <div class="table-responsive">';
      html += '    <table class="table" style="width:100%; margin:0; border-collapse:collapse;">';
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
      var expenseAccounts = this.chart.filter(function (a) { return a.type === 'expense' && a.isActive; });
      var today = new Date().toISOString().split('T')[0];
      this.selectedAttachments = [];

      var html = '';
      html += '<form id="form-record-expense" onsubmit="SchoolApp.modules.accounts.saveExpense(event)">';
      html += '  <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:14px;">';

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

      html += '  <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:14px;">';

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
          html += '      <option value="' + (b.ledgerAccountId || '11200') + '">' + (b.ledgerAccountId || '11200') + ' - ' + SchoolApp.escapeHTML(b.label) + ' (' + SchoolApp.escapeHTML(b.bankName) + ' ••' + b.last4 + ')</option>';
        });
      }
      html += '    </select>';
      html += '  </div>';

      // Vendor Info
      html += '  <div style="display:grid; grid-template-columns: 2fr 1fr 1fr; gap:12px; margin-bottom:14px;">';
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

      SchoolApp.showModal('Record New Expense', html, footerHTML);
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

        // 2. Atomic Firestore Write with Sequential Counter
        var countersRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'counters');
        var expenseRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_expenses', expenseId);

        var userDesc = (SchoolApp.currentUser && (SchoolApp.currentUser.firstName + ' ' + (SchoolApp.currentUser.lastName || '')).trim()) || 'Admin';
        var nowIso = new Date().toISOString();

        var countersSnap = await fs.getDoc(countersRef);
        var currentCounters = countersSnap.exists() ? countersSnap.data() : { expenseSeq: {} };
        var seqObj = currentCounters.expenseSeq || {};
        var nextSeq = (seqObj[fy] || 0) + 1;
        var expenseNo = 'EXP-' + fy + '-' + String(nextSeq).padStart(4, '0');

        seqObj[fy] = nextSeq;

        var batch = fs.writeBatch(db);
        batch.set(countersRef, { expenseSeq: seqObj }, { merge: true });
        batch.set(expenseRef, {
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

        await batch.commit();

        SchoolApp.closeModal();
        SchoolApp.showToast('Expense ' + expenseNo + ' recorded successfully!', 'success');
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
      html += '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; font-size:13px; margin-bottom:16px;">';
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

      SchoolApp.showModal('Expense Details — ' + (exp.expenseNo || ''), html, footerHTML);
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

      SchoolApp.showModal('Cancel Expense', html, footerHTML);
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

    // ── Tab 3: Chart of Accounts ─────────────────────────────────────────────
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

        html += '  <div class="table-responsive">';
        html += '    <table class="table" style="width:100%; margin:0; border-collapse:collapse;">';
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

      SchoolApp.showModal('Add Custom Ledger Account', html, footerHTML);
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

    // ── Tab 4: Settings ──────────────────────────────────────────────────────
    renderSettingsHTML: function () {
      var s = this.settings || {};
      var hasExpenses = this.expenses.length > 0;
      var html = '';

      html += '<div style="max-width:760px; margin:0 auto;">';
      html += '  <div class="card" style="padding:24px; border-radius:10px; margin-bottom:20px;">';
      html += '    <h3 style="font-size:16px; font-weight:700; margin-bottom:16px; color:var(--text-primary);">Accounts Configuration</h3>';

      html += '    <form id="form-accounts-settings" onsubmit="SchoolApp.modules.accounts.saveSettings(event)">';

      // Financial Year Start Month
      html += '      <div class="form-group" style="margin-bottom:16px;">';
      html += '        <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Financial Year Start Month</label>';
      html += '        <select class="form-control form-select" id="settings-fy-month" ' + (hasExpenses ? 'disabled' : '') + ' style="width:100%;">';
      [
        { m: 1, name: 'January' },
        { m: 4, name: 'April (Standard Indian Financial Year)' },
        { m: 6, name: 'June' },
        { m: 7, name: 'July' }
      ].forEach(function (opt) {
        var sel = (s.financialYearStartMonth === opt.m) ? 'selected' : '';
        html += '          <option value="' + opt.m + '" ' + sel + '>' + opt.name + '</option>';
      });
      html += '        </select>';
      if (hasExpenses) {
        html += '        <small class="form-text text-muted" style="font-size:11.5px; color:var(--warning); display:block; margin-top:4px;">';
        html += '          🔒 Locked: Financial year start month cannot be changed after expenses have been recorded.';
        html += '        </small>';
      }
      html += '      </div>';

      // Entity Type
      html += '      <div class="form-group" style="margin-bottom:16px;">';
      html += '        <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Report Statement Format (Entity Type)</label>';
      html += '        <select class="form-control form-select" id="settings-entity-type" style="width:100%;">';
      html += '          <option value="trust_society" ' + (s.entityType === 'trust_society' ? 'selected' : '') + '>Trust / Society (Generates "Income & Expenditure")</option>';
      html += '          <option value="company" ' + (s.entityType === 'company' ? 'selected' : '') + '>Company (Generates "Profit & Loss")</option>';
      html += '        </select>';
      html += '      </div>';

      // Accounting Basis
      html += '      <div class="form-group" style="margin-bottom:24px;">';
      html += '        <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Accounting Basis</label>';
      html += '        <input type="text" class="form-control" value="Cash Basis" disabled style="width:100%;" />';
      html += '        <small class="form-text text-muted" style="font-size:11.5px; display:block; margin-top:4px;">In Slice 1, transactions are recorded on a Cash accounting basis.</small>';
      html += '      </div>';

      // Bank Accounts Manager
      html += '      <div style="border-top:1px solid var(--border-color); padding-top:20px; margin-bottom:24px;">';
      html += '        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">';
      html += '          <h4 style="font-size:14px; font-weight:700; margin:0; color:var(--text-primary);">Configured Bank Accounts</h4>';
      html += '          <button type="button" class="btn btn-secondary btn-sm" onclick="SchoolApp.modules.accounts.addBankAccountRow()">';
      html += '            <span class="material-icons-round" style="font-size:16px;">add</span> Add Bank Account';
      html += '          </button>';
      html += '        </div>';
      html += '        <div id="settings-bank-accounts-list">';

      var bankList = (s.bankAccounts && s.bankAccounts.length > 0) ? s.bankAccounts : [];
      if (bankList.length === 0) {
        html += '          <p style="font-size:12.5px; color:var(--text-muted); margin:0 0 10px 0;">No bank accounts configured yet.</p>';
      } else {
        bankList.forEach(function (b, idx) {
          html += '          <div class="bank-row" data-index="' + idx + '" style="display:grid; grid-template-columns: 1fr 1fr 90px 40px; gap:8px; margin-bottom:8px; align-items:center;">';
          html += '            <input type="text" class="form-control b-label" placeholder="Label" value="' + SchoolApp.escapeHTML(b.label || '') + '" required />';
          html += '            <input type="text" class="form-control b-name" placeholder="Bank Name" value="' + SchoolApp.escapeHTML(b.bankName || '') + '" required />';
          html += '            <input type="text" class="form-control b-last4" placeholder="Last 4" maxlength="4" pattern="\\d{4}" value="' + SchoolApp.escapeHTML(b.last4 || '') + '" required />';
          html += '            <button type="button" class="btn-icon" style="color:var(--danger);" onclick="this.closest(\'.bank-row\').remove()"><span class="material-icons-round">delete</span></button>';
          html += '          </div>';
        });
      }

      html += '        </div>';
      html += '      </div>';

      html += '      <div style="display:flex; justify-content:flex-end;">';
      html += '        <button type="submit" class="btn btn-primary" id="btn-save-settings">';
      html += '          <span class="material-icons-round">save</span> Save Settings';
      html += '        </button>';
      html += '      </div>';

      html += '    </form>';
      html += '  </div>';
      html += '</div>';

      return html;
    },

    addBankAccountRow: function () {
      var container = document.getElementById('settings-bank-accounts-list');
      if (!container) return;
      var row = document.createElement('div');
      row.className = 'bank-row';
      row.style.cssText = 'display:grid; grid-template-columns: 1fr 1fr 90px 40px; gap:8px; margin-bottom:8px; align-items:center;';
      row.innerHTML =
        '<input type="text" class="form-control b-label" placeholder="Label (e.g. HDFC General)" required />' +
        '<input type="text" class="form-control b-name" placeholder="Bank Name" required />' +
        '<input type="text" class="form-control b-last4" placeholder="Last 4" maxlength="4" pattern="\\d{4}" required />' +
        '<button type="button" class="btn-icon" style="color:var(--danger);" onclick="this.closest(\'.bank-row\').remove()"><span class="material-icons-round">delete</span></button>';
      container.appendChild(row);
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
        var entityType = document.getElementById('settings-entity-type').value;
        var fyMonthInput = document.getElementById('settings-fy-month');
        var fyMonth = fyMonthInput && !fyMonthInput.disabled ? parseInt(fyMonthInput.value, 10) : (this.settings ? this.settings.financialYearStartMonth : 4);

        var bankRows = document.querySelectorAll('#settings-bank-accounts-list .bank-row');
        var bankAccounts = [];
        bankRows.forEach(function (row, idx) {
          var lbl = row.querySelector('.b-label').value.trim();
          var nm = row.querySelector('.b-name').value.trim();
          var l4 = row.querySelector('.b-last4').value.trim();
          if (nm && l4) {
            bankAccounts.push({
              id: 'bank_' + (idx + 1),
              label: lbl || nm,
              bankName: nm,
              last4: l4.slice(-4),
              ledgerAccountId: (idx === 0 ? '11200' : ('112' + (idx * 10)))
            });
          }
        });

        var settingsRef = fs.doc(db, 'tenant_data', schoolId, 'accounts_settings', 'main');
        await fs.updateDoc(settingsRef, {
          entityType: entityType,
          financialYearStartMonth: fyMonth,
          bankAccounts: bankAccounts,
          updatedAt: new Date().toISOString()
        });

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

})();
