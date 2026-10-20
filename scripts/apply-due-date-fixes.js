const fs = require('fs');
const path = require('path');

const norm = s => s.replace(/\r\n/g, '\n');

// =========================================================================
// 1. UPDATE js/admin.js
// =========================================================================
console.log('Updating js/admin.js...');
let adminCode = norm(fs.readFileSync('js/admin.js', 'utf8'));

const oldAdminCard4b = `    // Card 4b: Automated Monthly Fee Settings
    var isAutoChargeEnabled = !!settings.autoChargeEnabled;
    var autoChargeDay = parseInt(settings.autoChargeTriggerDate, 10) || 1;
    html += '  <div class="card fee-setup-card">';
    html += '    <div class="card-header fee-setup-header" style="display:flex; justify-content:space-between; align-items:center;">';
    html += '      <h3><span class="material-icons-round">bolt</span> Automated Monthly Fee Settings</h3>';
    html += '      <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:14px; color:var(--text-primary);">';
    html += '        <input type="checkbox" id="setup-autocharge-enabled" ' + (isAutoChargeEnabled ? 'checked' : '') + ' style="width:18px; height:18px; cursor:pointer; accent-color:var(--accent-primary);"> Enable Auto-Charge';
    html += '      </label>';
    html += '    </div>';
    html += '    <div class="card-body">';
    html += '      <div class="admin-form-grid fee-setup-form-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:16px;">';
    html += '        <div class="form-group">';
    html += '          <label class="form-label">Auto-Charge Trigger Day of Month</label>';
    html += '          <select class="form-select" id="setup-autocharge-trigger-date">';
    [1, 5, 10, 15, 20, 25].forEach(function(d) {
      html += '            <option value="' + d + '"' + (autoChargeDay === d ? ' selected' : '') + '>' + d + (d === 1 ? 'st' : 'th') + ' of each month</option>';
    });
    html += '          </select>';
    html += '        </div>';
    html += '      </div>';
    html += '      <div style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-radius:8px; padding:12px 16px; font-size:13px; color:var(--text-secondary); line-height:1.5;">';
    html += '        <span class="material-icons-round" style="font-size:16px; color:#f59e0b; vertical-align:text-bottom;">info</span> <strong>Auto-Charge Day:</strong> System automatically generates dues for all students on this day each month. Do NOT click Generate Dues manually after setting this.';
    html += '      </div>';
    html += '    </div>';`;

const newAdminCard4b = `    // Card 4b: Automated Monthly Fee Settings
    var isAutoChargeEnabled = !!settings.autoChargeEnabled;
    var autoChargeDay = parseInt(settings.autoChargeTriggerDate, 10) || 1;
    var graceDays = parseInt(settings.gracePeriodDays, 10);
    if (isNaN(graceDays) || graceDays < 0) graceDays = 0;

    var daysOptions = [];
    for (var d = 1; d <= 31; d++) {
      var suffix = 'th';
      if (d === 1 || d === 21 || d === 31) suffix = 'st';
      else if (d === 2 || d === 22) suffix = 'nd';
      else if (d === 3 || d === 23) suffix = 'rd';
      daysOptions.push({ day: d, label: d + suffix + ' of each month' });
    }

    html += '  <div class="card fee-setup-card">';
    html += '    <div class="card-header fee-setup-header" style="display:flex; justify-content:space-between; align-items:center;">';
    html += '      <h3><span class="material-icons-round">bolt</span> Automated Monthly Fee Settings</h3>';
    html += '      <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:14px; color:var(--text-primary);">';
    html += '        <input type="checkbox" id="setup-autocharge-enabled" ' + (isAutoChargeEnabled ? 'checked' : '') + ' style="width:18px; height:18px; cursor:pointer; accent-color:var(--accent-primary);"> Enable Auto-Charge';
    html += '      </label>';
    html += '    </div>';
    html += '    <div class="card-body">';
    html += '      <div class="admin-form-grid fee-setup-form-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:16px;">';
    html += '        <div class="form-group">';
    html += '          <label class="form-label">Auto-Charge Trigger Day of Month</label>';
    html += '          <select class="form-select" id="setup-autocharge-trigger-date">';
    daysOptions.forEach(function(opt) {
      html += '            <option value="' + opt.day + '"' + (autoChargeDay === opt.day ? ' selected' : '') + '>' + opt.label + '</option>';
    });
    html += '          </select>';
    html += '        </div>';
    html += '        <div class="form-group">';
    html += '          <label class="form-label">Grace Period (Days)</label>';
    html += '          <input type="number" id="setup-autocharge-grace-days" class="form-input" min="0" max="30" value="' + graceDays + '" placeholder="0">';
    html += '          <small style="color:var(--text-muted); font-size:11px; display:block; margin-top:4px;">Days after due date before a charge is marked Overdue or incurs late fines (default 0).</small>';
    html += '        </div>';
    html += '      </div>';
    html += '      <div style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-radius:8px; padding:12px 16px; font-size:13px; color:var(--text-secondary); line-height:1.5;">';
    html += '        <span class="material-icons-round" style="font-size:16px; color:var(--warning, #f59e0b); vertical-align:text-bottom;">info</span> <strong>Auto-Charge Day:</strong> System automatically generates dues for all students on this day each month. It serves as both the billing date and due date. Trigger days 29–31 automatically clamp to the last day of shorter months.';
    html += '      </div>';
    html += '    </div>';`;

const oldAdminSave = `        var isEnabled = document.getElementById('setup-autocharge-enabled') ? document.getElementById('setup-autocharge-enabled').checked : false;
        var triggerDay = document.getElementById('setup-autocharge-trigger-date') ? (parseInt(document.getElementById('setup-autocharge-trigger-date').value, 10) || 1) : 1;

        if (!SchoolApp.store.settings) SchoolApp.store.settings = {};
        SchoolApp.store.settings.autoChargeEnabled = isEnabled;
        SchoolApp.store.settings.autoChargeTriggerDate = triggerDay;`;

const newAdminSave = `        var isEnabled = document.getElementById('setup-autocharge-enabled') ? document.getElementById('setup-autocharge-enabled').checked : false;
        var triggerDay = document.getElementById('setup-autocharge-trigger-date') ? (parseInt(document.getElementById('setup-autocharge-trigger-date').value, 10) || 1) : 1;
        var graceDaysInput = document.getElementById('setup-autocharge-grace-days') ? (parseInt(document.getElementById('setup-autocharge-grace-days').value, 10) || 0) : 0;
        if (graceDaysInput < 0) graceDaysInput = 0;

        if (!SchoolApp.store.settings) SchoolApp.store.settings = {};
        SchoolApp.store.settings.autoChargeEnabled = isEnabled;
        SchoolApp.store.settings.autoChargeTriggerDate = triggerDay;
        SchoolApp.store.settings.gracePeriodDays = graceDaysInput;`;

if (!adminCode.includes(oldAdminCard4b)) throw new Error('adminCode does not contain oldAdminCard4b');
if (!adminCode.includes(oldAdminSave)) throw new Error('adminCode does not contain oldAdminSave');

adminCode = adminCode.replace(oldAdminCard4b, newAdminCard4b);
adminCode = adminCode.replace(oldAdminSave, newAdminSave);
fs.writeFileSync('js/admin.js', adminCode, 'utf8');
console.log('✅ js/admin.js updated.');

// =========================================================================
// 2. UPDATE js/app.js
// =========================================================================
console.log('Updating js/app.js...');
let appCode = norm(fs.readFileSync('js/app.js', 'utf8'));

// A4: Clamp trigger day 29-31 in evaluateAutoFeeDues
const oldAppTriggerCalc = `      missedMonths.forEach(function(m) {
        var monthName = monthNames[m.month - 1];
        var desc = 'Monthly Tuition Fee - ' + monthName + ' ' + m.year;
        var triggerDayPad = triggerDay < 10 ? '0' + triggerDay : String(triggerDay);
        var chargeDate = m.year + '-' + (m.month < 10 ? '0' + m.month : m.month) + '-' + triggerDayPad;`;

const newAppTriggerCalc = `      missedMonths.forEach(function(m) {
        var monthName = monthNames[m.month - 1];
        var desc = 'Monthly Tuition Fee - ' + monthName + ' ' + m.year;
        // A4: Clamp trigger day 29-31 to the last day of short months
        var maxDaysInMonth = new Date(m.year, m.month, 0).getDate();
        var effectiveTriggerDay = Math.min(triggerDay, maxDaysInMonth);
        var triggerDayPad = effectiveTriggerDay < 10 ? '0' + effectiveTriggerDay : String(effectiveTriggerDay);
        var chargeDate = m.year + '-' + (m.month < 10 ? '0' + m.month : m.month) + '-' + triggerDayPad;`;

const oldAppTuitionPush = `          result.tuitionDues.push({
            id: self.generateId(),
            studentId: s.id,
            schoolId: self.currentSchoolId,
            type: 'due',
            feeHeadId: 'fh_tuition',
            amount: tuitionAmt,
            date: chargeDate,
            description: desc,
            billingPeriod: m.period,
            timestamp: new Date().toISOString()
          });`;

const newAppTuitionPush = `          result.tuitionDues.push({
            id: self.generateId(),
            studentId: s.id,
            schoolId: self.currentSchoolId,
            type: 'due',
            feeHeadId: 'fh_tuition',
            amount: tuitionAmt,
            date: chargeDate,
            billingDate: chargeDate,
            dueDate: chargeDate,
            feeMonth: m.period,
            description: desc,
            billingPeriod: m.period,
            timestamp: new Date().toISOString()
          });`;

const oldAppTransportPush = `          result.tuitionDues.push({
            id: self.generateId(),
            studentId: s.id,
            schoolId: self.currentSchoolId,
            type: 'due',
            feeHeadId: 'fh_transport',
            amount: tAmt,
            date: m.period + '-01',
            description: 'Monthly Transport Fee - ' + monthName + ' ' + m.year,
            billingPeriod: m.period,
            timestamp: new Date().toISOString()
          });`;

const newAppTransportPush = `          result.tuitionDues.push({
            id: self.generateId(),
            studentId: s.id,
            schoolId: self.currentSchoolId,
            type: 'due',
            feeHeadId: 'fh_transport',
            amount: tAmt,
            date: chargeDate,
            billingDate: chargeDate,
            dueDate: chargeDate,
            feeMonth: m.period,
            description: 'Monthly Transport Fee - ' + monthName + ' ' + m.year,
            billingPeriod: m.period,
            timestamp: new Date().toISOString()
          });`;

// Late Fee Evaluation in app.js
const oldAppLateFeeLogic = `    var lateConfig = settings.lateFeeConfig || {};
    if (lateConfig.enabled === true) {
      var fineHeadId = lateConfig.feeHeadId || 'fh_fine';
      var graceDays = parseInt(lateConfig.gracePeriodDays, 10);
      if (isNaN(graceDays) || graceDays < 0) graceDays = 10;
      var fineType = lateConfig.type === 'percentage' ? 'percentage' : 'flat';
      var fineVal = parseFloat(lateConfig.value) || 0;
      var maxCap = parseFloat(lateConfig.maxCap) || 0;

      if (fineVal > 0) {
        var fees = this.store.fees || [];
        var finedDueIds = new Set();
        fees.forEach(function(f) {
          if (f.originatingDueId) finedDueIds.add(f.originatingDueId);
        });

        var allocationsByDue = {};
        var studentTotalPaid = {};
        var studentTotalDues = {};

        fees.forEach(function(f) {
          if (f.type === 'due') {
            studentTotalDues[f.studentId] = (studentTotalDues[f.studentId] || 0) + (parseFloat(f.amount) || 0);
          } else if (f.type === 'payment') {
            var grossSettled = (parseFloat(f.amount) || 0) + (parseFloat(f.discountAmount) || 0);
            studentTotalPaid[f.studentId] = (studentTotalPaid[f.studentId] || 0) + grossSettled;
            if (Array.isArray(f.allocations)) {
              f.allocations.forEach(function(a) {
                if (a.dueId) {
                  allocationsByDue[a.dueId] = (allocationsByDue[a.dueId] || 0) + (parseFloat(a.amount) || 0);
                }
              });
            }
          }
        });

        var activeStudentMap = {};
        activeStudents.forEach(function(s) { activeStudentMap[s.id] = s; });

        fees.forEach(function(due) {
          if (due.type !== 'due') return;
          if (!activeStudentMap[due.studentId]) return;
          if (due.feeHeadId === fineHeadId) return; // Do not fine a fine!
          if (due.originatingDueId) return; // Do not fine a fine transaction!
          if (finedDueIds.has(due.id)) return; // ONE-SHOT GUARANTEE: Already fined!

          var dueTime = new Date(due.date).getTime();
          if (isNaN(dueTime)) return;

          var overdueDeadline = dueTime + (graceDays * 86400000);
          if (evalDate.getTime() <= overdueDeadline) return; // Grace period active`;

const newAppLateFeeLogic = `    var lateConfig = settings.lateFeeConfig || {};
    if (lateConfig.enabled === true) {
      var fineHeadId = lateConfig.feeHeadId || 'fh_fine';
      var graceDays = settings.gracePeriodDays !== undefined ? parseInt(settings.gracePeriodDays, 10) : parseInt(lateConfig.gracePeriodDays, 10);
      if (isNaN(graceDays) || graceDays < 0) graceDays = (lateConfig.gracePeriodDays !== undefined ? parseInt(lateConfig.gracePeriodDays, 10) : 0);
      if (isNaN(graceDays) || graceDays < 0) graceDays = 0;
      var fineType = lateConfig.type === 'percentage' ? 'percentage' : 'flat';
      var fineVal = parseFloat(lateConfig.value) || 0;
      var maxCap = parseFloat(lateConfig.maxCap) || 0;

      if (fineVal > 0) {
        var fees = this.store.fees || [];
        var finedDueIds = new Set();
        fees.forEach(function(f) {
          if (f.originatingDueId) finedDueIds.add(f.originatingDueId);
        });

        var allocationsByDue = {};
        var studentTotalPaid = {};
        var studentTotalDues = {};

        fees.forEach(function(f) {
          if (f.type === 'due') {
            studentTotalDues[f.studentId] = (studentTotalDues[f.studentId] || 0) + (parseFloat(f.amount) || 0);
          } else if (f.type === 'payment') {
            var grossSettled = (parseFloat(f.amount) || 0) + (parseFloat(f.discountAmount) || 0);
            studentTotalPaid[f.studentId] = (studentTotalPaid[f.studentId] || 0) + grossSettled;
            if (Array.isArray(f.allocations)) {
              f.allocations.forEach(function(a) {
                if (a.dueId) {
                  allocationsByDue[a.dueId] = (allocationsByDue[a.dueId] || 0) + (parseFloat(a.amount) || 0);
                }
              });
            }
          }
        });

        var activeStudentMap = {};
        activeStudents.forEach(function(s) { activeStudentMap[s.id] = s; });

        fees.forEach(function(due) {
          if (due.type !== 'due') return;
          if (!activeStudentMap[due.studentId]) return;
          if (due.feeHeadId === fineHeadId) return; // Do not fine a fine!
          if (due.originatingDueId) return; // Do not fine a fine transaction!
          if (finedDueIds.has(due.id)) return; // ONE-SHOT GUARANTEE: Already fined!

          var effectiveDueDate = due.dueDate || due.date;
          var dueTime = new Date(effectiveDueDate).getTime();
          if (isNaN(dueTime)) return;

          var overdueDeadline = dueTime + (graceDays * 86400000);
          if (evalDate.getTime() <= overdueDeadline) return; // Grace period active`;

if (!appCode.includes(oldAppTriggerCalc)) throw new Error('appCode does not contain oldAppTriggerCalc');
if (!appCode.includes(oldAppTuitionPush)) throw new Error('appCode does not contain oldAppTuitionPush');
if (!appCode.includes(oldAppTransportPush)) throw new Error('appCode does not contain oldAppTransportPush');
if (!appCode.includes(oldAppLateFeeLogic)) throw new Error('appCode does not contain oldAppLateFeeLogic');

appCode = appCode.replace(oldAppTriggerCalc, newAppTriggerCalc);
appCode = appCode.replace(oldAppTuitionPush, newAppTuitionPush);
appCode = appCode.replace(oldAppTransportPush, newAppTransportPush);
appCode = appCode.replace(oldAppLateFeeLogic, newAppLateFeeLogic);

fs.writeFileSync('js/app.js', appCode, 'utf8');
console.log('✅ js/app.js updated.');

// =========================================================================
// 3. UPDATE js/fees.js
// =========================================================================
console.log('Updating js/fees.js...');
let feesCode = norm(fs.readFileSync('js/fees.js', 'utf8'));

// 3.1 Insert helper functions at top of fees.js
const feesTopAnchor = `(function() {

  var state = {`;

const helpersToAdd = `(function() {

  // --- Fee Due-Date & Overdue Lifecycle Helpers ---
  function formatFeeMonth(monthKey) {
    if (!monthKey) return '';
    var str = String(monthKey).trim();
    if (str.indexOf('-') === 4) {
      var parts = str.split('-');
      var mIdx = parseInt(parts[1], 10) - 1;
      var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      if (mIdx >= 0 && mIdx < 12) {
        return monthNames[mIdx] + ' ' + parts[0];
      }
    }
    return str;
  }

  function getFeeDueMetadata(due) {
    if (!due) return { billingDate: '', dueDate: '', feeMonth: '', feeMonthFormatted: '' };
    var bDate = due.billingDate || due.date || '';
    var dDate = due.dueDate || due.date || bDate;
    var monthKey = due.feeMonth || due.billingPeriod || (bDate ? bDate.substring(0, 7) : '');
    return {
      billingDate: bDate,
      dueDate: dDate,
      feeMonth: monthKey,
      feeMonthFormatted: formatFeeMonth(monthKey)
    };
  }

  // A2: FIFO Payment Allocation helper for unpaid dues
  function getStudentUnpaidDues(studentId, customTodayStr) {
    var todayStr = customTodayStr || new Date().toISOString().split('T')[0];
    var settings = (SchoolApp.store && SchoolApp.store.settings) || {};
    var graceDays = parseInt(settings.gracePeriodDays, 10);
    if (isNaN(graceDays) || graceDays < 0) graceDays = 0;

    var allTxns = (SchoolApp.store && Array.isArray(SchoolApp.store.fees)) ? SchoolApp.store.fees.filter(function(f) {
      return f && f.studentId === studentId && !f.isVoided && !f.isReversal;
    }) : [];

    // Sort chronologically by due date (oldest first for FIFO)
    var dues = [];
    var payments = [];

    allTxns.forEach(function(t) {
      if (t.type === 'due') {
        var meta = getFeeDueMetadata(t);
        dues.push({
          id: t.id,
          feeHeadId: t.feeHeadId || 'custom',
          description: t.description || 'Charge',
          amount: Number(t.amount || 0),
          remaining: Number(t.amount || 0),
          billingDate: meta.billingDate,
          dueDate: meta.dueDate,
          feeMonth: meta.feeMonth,
          feeMonthFormatted: meta.feeMonthFormatted,
          rawTxn: t
        });
      } else if (t.type === 'payment') {
        payments.push(t);
      }
    });

    dues.sort(function(a, b) {
      return (a.dueDate || a.billingDate).localeCompare(b.dueDate || b.billingDate);
    });

    // Deduct payments via allocations or chronological FIFO
    payments.forEach(function(p) {
      if (Array.isArray(p.allocations) && p.allocations.length > 0) {
        p.allocations.forEach(function(alloc) {
          var allocAmt = Number(alloc.amount || 0);
          if (alloc.dueId) {
            var targetDue = dues.find(function(d) { return d.id === alloc.dueId; });
            if (targetDue && targetDue.remaining > 0) {
              var deduct = Math.min(targetDue.remaining, allocAmt);
              targetDue.remaining -= deduct;
              allocAmt -= deduct;
            }
          }
          if (allocAmt > 0) {
            for (var i = 0; i < dues.length; i++) {
              if (allocAmt <= 0) break;
              if (dues[i].remaining > 0 && (!alloc.feeHeadId || dues[i].feeHeadId === alloc.feeHeadId)) {
                var dDeduct = Math.min(dues[i].remaining, allocAmt);
                dues[i].remaining -= dDeduct;
                allocAmt -= dDeduct;
              }
            }
          }
        });
      } else {
        var unallocatedAmt = Number(p.amount || 0) + Number(p.discount || 0);
        for (var i = 0; i < dues.length; i++) {
          if (unallocatedAmt <= 0) break;
          if (dues[i].remaining > 0) {
            var deduct = Math.min(dues[i].remaining, unallocatedAmt);
            dues[i].remaining -= deduct;
            unallocatedAmt -= deduct;
          }
        }
      }
    });

    // Return unpaid / partially paid dues with overdue status
    var unpaidDues = [];
    dues.forEach(function(d) {
      if (d.remaining > 0) {
        var dTime = new Date(d.dueDate || d.billingDate).getTime();
        var overdueDeadlineStr = d.dueDate || d.billingDate;
        if (!isNaN(dTime)) {
          var deadlineMs = dTime + (graceDays * 86400000);
          var deadlineDate = new Date(deadlineMs);
          overdueDeadlineStr = deadlineDate.toISOString().split('T')[0];
        }
        var isOverdue = todayStr > overdueDeadlineStr;
        unpaidDues.push({
          ...d,
          isPartiallyPaid: d.remaining < d.amount,
          isOverdue: isOverdue,
          overdueDeadline: overdueDeadlineStr
        });
      }
    });

    return unpaidDues;
  }

  var state = {`;

if (!feesCode.includes(feesTopAnchor)) throw new Error('feesCode does not contain feesTopAnchor');
feesCode = feesCode.replace(feesTopAnchor, helpersToAdd);

// 3.2 Update showBulkFeeRemindersModal defaulter evaluation
const oldDefaulterPush = `    students.forEach(function(s) {
      if (s.status === 'Inactive') return;
      var stmt = generateFeeStatement(s.id);
      if (stmt && stmt.netDue > 0) {
        defaulters.push({
          student: s,
          statement: stmt
        });
      }
    });`;

const newDefaulterPush = `    students.forEach(function(s) {
      if (s.status === 'Inactive') return;
      var stmt = generateFeeStatement(s.id);
      if (stmt && stmt.netDue > 0) {
        // Defaulter condition: Must have netDue > 0 AND at least one unpaid due that is overdue past dueDate + grace
        var unpaidDues = getStudentUnpaidDues(s.id);
        var hasOverdueDue = unpaidDues.some(function(d) { return d.isOverdue; });
        if (hasOverdueDue) {
          defaulters.push({
            student: s,
            statement: stmt,
            earliestOverdue: unpaidDues.find(function(d) { return d.isOverdue; })
          });
        }
      }
    });`;

if (!feesCode.includes(oldDefaulterPush)) throw new Error('feesCode does not contain oldDefaulterPush');
feesCode = feesCode.replace(oldDefaulterPush, newDefaulterPush);

// 3.3 Update Defaulters Filter Checkbox Toggle in fees table
const oldTableFilterDefaulters = `        if (state.statusFilter === 'unpaid') {
          return outstanding > 0;
        }`;

const newTableFilterDefaulters = `        if (state.statusFilter === 'unpaid') {
          if (outstanding <= 0) return false;
          var studentUnpaid = getStudentUnpaidDues(s.id);
          return studentUnpaid.some(function(d) { return d.isOverdue; });
        }`;

if (!feesCode.includes(oldTableFilterDefaulters)) throw new Error('feesCode does not contain oldTableFilterDefaulters');
feesCode = feesCode.replace(oldTableFilterDefaulters, newTableFilterDefaulters);

// 3.4 Update Student Financial Profile Summary Strip (Next Due Date & 3 States)
const oldNextDueStrip = `    // F2: Next Due Date (use earliest unpaid due date; otherwise next cycle from settings.autoChargeTriggerDate)
    var nextDueStr = '—';
    var settings = SchoolApp.store.settings || {};
    var triggerDay = parseInt(settings.autoChargeTriggerDate, 10) || 1;
    var padTriggerDay = triggerDay < 10 ? '0' + triggerDay : String(triggerDay);

    // 1. Check if student has pending unpaid dues (from statement or ledger transactions)
    var earliestUnpaidDate = null;
    var allDues = (ledger && Array.isArray(ledger.transactions)) ? ledger.transactions.filter(function(t) { return t.type === 'due' && !t.isVoided; }) : [];
    if (outstandingAmt > 0 && allDues.length > 0) {
      allDues.forEach(function(d) {
        if (d && d.date) {
          if (!earliestUnpaidDate || d.date < earliestUnpaidDate) {
            earliestUnpaidDate = d.date;
          }
        }
      });
    }

    if (earliestUnpaidDate) {
      // Format YYYY-MM-DD to DD/MM/YYYY
      var parts = earliestUnpaidDate.split('-');
      if (parts.length === 3) {
        nextDueStr = parts[2] + '/' + parts[1] + '/' + parts[0];
      } else {
        nextDueStr = formatDateDDMMYYYY(earliestUnpaidDate) || earliestUnpaidDate;
      }
    } else {
      // No unpaid overdue dues: project next billing cycle based on triggerDay
      var now = new Date();
      var nextYear = now.getFullYear();
      var nextMonth = now.getMonth() + 1; // 1-12
      if (now.getDate() >= triggerDay) {
        nextMonth++;
        if (nextMonth > 12) { nextMonth = 1; nextYear++; }
      }
      nextDueStr = padTriggerDay + '/' + (nextMonth < 10 ? '0' + nextMonth : nextMonth) + '/' + nextYear;
    }

    bodyHTML += '<div class="stats-grid mb-3" style="grid-template-columns: repeat(4, 1fr); gap: 10px;">';
    bodyHTML += '  <div class="stat-card purple" style="padding:12px 14px;">';
    bodyHTML += '    <div class="stat-info">';
    bodyHTML += '      <div class="stat-number" style="font-size:18px;">₹' + totalDueAmt.toLocaleString('en-IN') + '</div>';
    bodyHTML += '      <div class="stat-label" style="font-size:11px;">Total Due</div>';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';
    bodyHTML += '  <div class="stat-card green" style="padding:12px 14px;">';
    bodyHTML += '    <div class="stat-info">';
    bodyHTML += '      <div class="stat-number" style="font-size:18px;">₹' + totalPaidAmt.toLocaleString('en-IN') + '</div>';
    bodyHTML += '      <div class="stat-label" style="font-size:11px;">Total Paid</div>';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';
    var balColor = outstandingAmt > 0 ? 'amber' : 'green';
    bodyHTML += '  <div class="stat-card ' + balColor + '" style="padding:12px 14px;">';
    bodyHTML += '    <div class="stat-info">';
    bodyHTML += '      <div class="stat-number" style="font-size:18px;">₹' + outstandingAmt.toLocaleString('en-IN') + '</div>';
    bodyHTML += '      <div class="stat-label" style="font-size:11px;">Outstanding Balance</div>';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';
    bodyHTML += '  <div class="stat-card cyan" style="padding:12px 14px;">';
    bodyHTML += '    <div class="stat-info">';
    bodyHTML += '      <div class="stat-number" style="font-size:16px;">' + nextDueStr + '</div>';
    bodyHTML += '      <div class="stat-label" style="font-size:11px;">Next Due Date</div>';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';
    bodyHTML += '</div>';`;

const newNextDueStrip = `    // Dynamic Due-Date & Overdue Lifecycle Model
    var settings = SchoolApp.store.settings || {};
    var isAutoChargeOn = !!settings.autoChargeEnabled;
    var rawTriggerDay = parseInt(settings.autoChargeTriggerDate, 10) || 1;
    var graceDays = parseInt(settings.gracePeriodDays, 10);
    if (isNaN(graceDays) || graceDays < 0) graceDays = 0;

    var statusCardClass = 'cyan';
    var statusTitle = 'Next Due Date';
    var statusValueHTML = '—';

    if (outstandingAmt > 0) {
      // Unpaid dues exist: evaluate earliest unpaid due via FIFO allocation
      var unpaidDuesList = getStudentUnpaidDues(studentId);
      if (unpaidDuesList.length > 0) {
        var earliestDue = unpaidDuesList[0];
        var parts = (earliestDue.dueDate || earliestDue.billingDate).split('-');
        var formattedDueDate = parts.length === 3 ? (parts[2] + '/' + parts[1] + '/' + parts[0]) : (earliestDue.dueDate || earliestDue.billingDate);

        if (earliestDue.isOverdue) {
          // State 1: Overdue past dueDate + grace
          statusCardClass = 'red';
          statusTitle = 'Overdue Status';
          statusValueHTML = '<span style="color:var(--danger, #ef4444); font-weight:700;">Overdue since ' + escapeHTML(formattedDueDate) + '</span>';
        } else {
          // State 2: Due date within pending / grace window
          statusCardClass = 'amber';
          statusTitle = 'Next Due Date';
          statusValueHTML = '<span style="color:var(--warning, #f59e0b); font-weight:700;">Due on ' + escapeHTML(formattedDueDate) + '</span>';
        }
      } else {
        statusCardClass = 'amber';
        statusTitle = 'Next Due Date';
        statusValueHTML = '<span style="color:var(--warning, #f59e0b); font-weight:700;">Balance Pending</span>';
      }
    } else {
      // State 3: Nothing unpaid (Zero balance)
      if (!isAutoChargeOn) {
        // A3: Auto-charge disabled -> "Next Cycle: —" (no invented date)
        statusCardClass = 'cyan';
        statusTitle = 'Next Due Date';
        statusValueHTML = '<span style="color:var(--text-muted); font-weight:600;">Next Cycle: —</span>';
      } else {
        // Project next auto-charge cycle from triggerDay
        var now = new Date();
        var nextYear = now.getFullYear();
        var nextMonth = now.getMonth() + 1; // 1-12
        if (now.getDate() >= rawTriggerDay) {
          nextMonth++;
          if (nextMonth > 12) { nextMonth = 1; nextYear++; }
        }
        // A4: Clamp trigger day 29-31 to days in nextMonth
        var daysInNextMonth = new Date(nextYear, nextMonth, 0).getDate();
        var clampedDay = Math.min(rawTriggerDay, daysInNextMonth);
        var padClampedDay = clampedDay < 10 ? '0' + clampedDay : String(clampedDay);
        var padNextMonth = nextMonth < 10 ? '0' + nextMonth : String(nextMonth);
        var nextCycleStr = padClampedDay + '/' + padNextMonth + '/' + nextYear;

        statusCardClass = 'cyan';
        statusTitle = 'Next Due Date';
        statusValueHTML = '<span style="color:var(--success, #10b981); font-weight:700;">Next Cycle: ' + nextCycleStr + '</span>';
      }
    }

    bodyHTML += '<div class="stats-grid mb-3" style="grid-template-columns: repeat(4, 1fr); gap: 10px;">';
    bodyHTML += '  <div class="stat-card purple" style="padding:12px 14px;">';
    bodyHTML += '    <div class="stat-info">';
    bodyHTML += '      <div class="stat-number" style="font-size:18px;">₹' + totalDueAmt.toLocaleString('en-IN') + '</div>';
    bodyHTML += '      <div class="stat-label" style="font-size:11px;">Total Due</div>';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';
    bodyHTML += '  <div class="stat-card green" style="padding:12px 14px;">';
    bodyHTML += '    <div class="stat-info">';
    bodyHTML += '      <div class="stat-number" style="font-size:18px;">₹' + totalPaidAmt.toLocaleString('en-IN') + '</div>';
    bodyHTML += '      <div class="stat-label" style="font-size:11px;">Total Paid</div>';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';
    var balColor = outstandingAmt > 0 ? 'amber' : 'green';
    bodyHTML += '  <div class="stat-card ' + balColor + '" style="padding:12px 14px;">';
    bodyHTML += '    <div class="stat-info">';
    bodyHTML += '      <div class="stat-number" style="font-size:18px;">₹' + outstandingAmt.toLocaleString('en-IN') + '</div>';
    bodyHTML += '      <div class="stat-label" style="font-size:11px;">Outstanding Balance</div>';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';
    bodyHTML += '  <div class="stat-card ' + statusCardClass + '" style="padding:12px 14px;">';
    bodyHTML += '    <div class="stat-info">';
    bodyHTML += '      <div class="stat-number" style="font-size:15px;">' + statusValueHTML + '</div>';
    bodyHTML += '      <div class="stat-label" style="font-size:11px;">' + escapeHTML(statusTitle) + '</div>';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';
    bodyHTML += '</div>';`;

if (!feesCode.includes(oldNextDueStrip)) throw new Error('feesCode does not contain oldNextDueStrip');
feesCode = feesCode.replace(oldNextDueStrip, newNextDueStrip);

// 3.5 Update Ledger Table row rendering with formatted month and overdue badge
const oldLedgerRowDesc = `          bodyHTML += '<tr>';
          bodyHTML += '<td style="font-size:12px; white-space:nowrap;">' + formatDateDDMMYYYY(t.date) + '</td>';
          bodyHTML += '<td><strong>' + escapeHTML(t.description) + '</strong>';`;

const newLedgerRowDesc = `          bodyHTML += '<tr>';
          bodyHTML += '<td style="font-size:12px; white-space:nowrap;">' + formatDateDDMMYYYY(t.date) + '</td>';
          var dueMeta = getFeeDueMetadata(t);
          var rowDescHTML = escapeHTML(t.description);
          if (t.type === 'due' && dueMeta.feeMonthFormatted && rowDescHTML.indexOf(dueMeta.feeMonthFormatted) === -1) {
            rowDescHTML += ' <span style="font-size:11px; color:var(--text-secondary); font-weight:normal;">(' + escapeHTML(dueMeta.feeMonthFormatted) + ')</span>';
          }
          if (t.type === 'due') {
            var partsD = dueMeta.dueDate.split('-');
            var dFmt = partsD.length === 3 ? (partsD[2] + '/' + partsD[1] + '/' + partsD[0]) : dueMeta.dueDate;
            rowDescHTML += '<br><small style="color:var(--text-muted); font-size:11px;">Due: ' + escapeHTML(dFmt) + '</small>';
            var gDays = parseInt((SchoolApp.store.settings && SchoolApp.store.settings.gracePeriodDays), 10) || 0;
            var dTimeMs = new Date(dueMeta.dueDate).getTime();
            if (!isNaN(dTimeMs) && !t.isVoided) {
              var isDueOverdue = (new Date().toISOString().split('T')[0]) > new Date(dTimeMs + gDays * 86400000).toISOString().split('T')[0];
              if (isDueOverdue) {
                rowDescHTML += ' <span class="badge" style="background:rgba(239,68,68,0.12); color:var(--danger, #ef4444); border:1px solid rgba(239,68,68,0.25); font-size:10px; padding:1px 5px; border-radius:10px; font-weight:600;">Overdue</span>';
              }
            }
          }
          bodyHTML += '<td><strong>' + rowDescHTML + '</strong>';`;

if (!feesCode.includes(oldLedgerRowDesc)) throw new Error('feesCode does not contain oldLedgerRowDesc');
feesCode = feesCode.replace(oldLedgerRowDesc, newLedgerRowDesc);

// 3.6 Update Bulk Charge Modal: A5 fee-month picker
const oldBulkInputs = `    // Due Date (renamed from Billing Date)
    var todayStr = new Date().toISOString().split('T')[0];
    bodyHTML += '<div class="form-group"><label class="form-label">Due Date *</label>';
    bodyHTML += '<input type="date" id="bulk-date" class="form-input" value="' + todayStr + '" required>';
    bodyHTML += '</div>';

    // Period / Description
    bodyHTML += '<div class="form-group"><label class="form-label">Billing Period / Description *</label>';
    bodyHTML += '<input type="text" id="bulk-desc" class="form-input" placeholder="e.g. Monthly Tuition - June 2026" list="fee-head-suggestions" required>';
    bodyHTML += '</div>';`;

const newBulkInputs = `    // Due Date & Fee Month (A5)
    var todayStr = new Date().toISOString().split('T')[0];
    var currentMonthStr = todayStr.substring(0, 7);
    bodyHTML += '<div class="form-group"><label class="form-label">Due Date *</label>';
    bodyHTML += '<input type="date" id="bulk-date" class="form-input" value="' + todayStr + '" required>';
    bodyHTML += '</div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Fee Month *</label>';
    bodyHTML += '<input type="month" id="bulk-fee-month" class="form-input" value="' + currentMonthStr + '" required>';
    bodyHTML += '</div>';

    // Period / Description
    bodyHTML += '<div class="form-group"><label class="form-label">Billing Period / Description *</label>';
    bodyHTML += '<input type="text" id="bulk-desc" class="form-input" placeholder="e.g. Monthly Tuition - June 2026" list="fee-head-suggestions" required>';
    bodyHTML += '</div>';`;

if (!feesCode.includes(oldBulkInputs)) throw new Error('feesCode does not contain oldBulkInputs');
feesCode = feesCode.replace(oldBulkInputs, newBulkInputs);

// 3.7 Update Bulk Charge listener to auto-sync month and save feeMonth
const oldBulkSaveBlock = `        var cls = document.getElementById('bulk-class').value;
        var headId = document.getElementById('bulk-feehead').value;
        var date = document.getElementById('bulk-date').value;
        var desc = document.getElementById('bulk-desc').value.trim();
        var note = document.getElementById('bulk-note') ? document.getElementById('bulk-note').value.trim() : '';`;

const newBulkSaveBlock = `        var cls = document.getElementById('bulk-class').value;
        var headId = document.getElementById('bulk-feehead').value;
        var date = document.getElementById('bulk-date').value;
        var feeMonthVal = document.getElementById('bulk-fee-month') ? document.getElementById('bulk-fee-month').value : (date ? date.substring(0, 7) : '');
        var desc = document.getElementById('bulk-desc').value.trim();
        var note = document.getElementById('bulk-note') ? document.getElementById('bulk-note').value.trim() : '';`;

const oldBulkTxnCreation = `            var newTxn = {
              id: SchoolApp.generateId(),
              studentId: s.id,
              schoolId: SchoolApp.currentSchoolId,
              type: 'due',
              feeHeadId: headId,
              amount: defaultAmt,
              date: date,
              description: desc,
              billingPeriod: targetMonth
            };`;

const newBulkTxnCreation = `            var newTxn = {
              id: SchoolApp.generateId(),
              studentId: s.id,
              schoolId: SchoolApp.currentSchoolId,
              type: 'due',
              feeHeadId: headId,
              amount: defaultAmt,
              date: date,
              billingDate: todayStr,
              dueDate: date,
              feeMonth: feeMonthVal,
              description: desc,
              billingPeriod: feeMonthVal
            };`;

if (!feesCode.includes(oldBulkSaveBlock)) throw new Error('feesCode does not contain oldBulkSaveBlock');
if (!feesCode.includes(oldBulkTxnCreation)) throw new Error('feesCode does not contain oldBulkTxnCreation');

feesCode = feesCode.replace(oldBulkSaveBlock, newBulkSaveBlock);
feesCode = feesCode.replace(oldBulkTxnCreation, newBulkTxnCreation);

// Also add auto-sync listener for bulk-date -> bulk-fee-month
const oldModalShowAnchor = `    SchoolApp.showModal('Bulk Charge Class Dues', bodyHTML, footerHTML);

    var saveBtn = document.getElementById('bulk-charge-save-btn');`;

const newModalShowAnchor = `    SchoolApp.showModal('Bulk Charge Class Dues', bodyHTML, footerHTML);

    var bulkDateEl = document.getElementById('bulk-date');
    var bulkMonthEl = document.getElementById('bulk-fee-month');
    if (bulkDateEl && bulkMonthEl) {
      bulkDateEl.addEventListener('change', function() {
        if (!bulkMonthEl.dataset.manuallyEdited && this.value) {
          bulkMonthEl.value = this.value.substring(0, 7);
        }
      });
      bulkMonthEl.addEventListener('input', function() {
        this.dataset.manuallyEdited = 'true';
      });
    }

    var saveBtn = document.getElementById('bulk-charge-save-btn');`;

if (!feesCode.includes(oldModalShowAnchor)) throw new Error('feesCode does not contain oldModalShowAnchor');
feesCode = feesCode.replace(oldModalShowAnchor, newModalShowAnchor);

// 3.8 Update Receipt: A7 clarity without changing receipt number or amount
const oldReceiptAllocationRow = `        html += '      <tr style="border-bottom:1px solid #e2e8f0;">';
        html += '        <td style="padding:8px 12px; font-weight:500;">' + escapeHTML(a.feeHeadName || a.feeHeadId || 'Fee Head') + '</td>';
        html += '        <td style="padding:8px 12px; color:#64748b;">' + escapeHTML(remarks) + '</td>';
        html += '        <td style="padding:8px 12px; text-align:right; font-weight:600; color:#0f172a;">₹' + Number(a.amount || 0).toLocaleString('en-IN') + '.00</td>';
        html += '      </tr>';`;

const newReceiptAllocationRow = `        var allocHeadName = escapeHTML(a.feeHeadName || a.feeHeadId || 'Fee Head');
        var allocPeriodStr = formatFeeMonth(a.feeMonth || a.billingPeriod);
        if (allocPeriodStr && allocHeadName.indexOf(allocPeriodStr) === -1) {
          allocHeadName += ' <span style="font-size:11px; color:#64748b; font-weight:normal;">(' + escapeHTML(allocPeriodStr) + ')</span>';
        }
        html += '      <tr style="border-bottom:1px solid #e2e8f0;">';
        html += '        <td style="padding:8px 12px; font-weight:500;">' + allocHeadName + '</td>';
        html += '        <td style="padding:8px 12px; color:#64748b;">' + escapeHTML(remarks) + '</td>';
        html += '        <td style="padding:8px 12px; text-align:right; font-weight:600; color:#0f172a;">₹' + Number(a.amount || 0).toLocaleString('en-IN') + '.00</td>';
        html += '      </tr>';`;

if (!feesCode.includes(oldReceiptAllocationRow)) throw new Error('feesCode does not contain oldReceiptAllocationRow');
feesCode = feesCode.replace(oldReceiptAllocationRow, newReceiptAllocationRow);

fs.writeFileSync('js/fees.js', feesCode, 'utf8');
console.log('✅ js/fees.js updated.');
