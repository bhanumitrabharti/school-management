/**
 * ===================================================
 *  DOCUMENTS & ID GENERATOR MODULE — CTRL Shift ERP
 *  Admit Cards, Official Certificates, and Student ID Cards
 * ===================================================
 */

(function() {
  'use strict';

  var currentWorkflow = null; // 'admit-card' | 'bonafide' | 'tc' | 'character' | 'id-standard' | 'id-parent'
  var selectedStudent = null;
  var timetableRows = [];

  function requireAdmin() {
    if (!window.SchoolApp || !SchoolApp.isAdmin || !SchoolApp.isAdmin()) {
      if (window.SchoolApp && SchoolApp.showToast) {
        SchoolApp.showToast('Access restricted: Administrator only.', 'error');
      }
      return false;
    }
    return true;
  }

  function escapeHTML(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getStore() {
    return (window.SchoolApp && SchoolApp.store) || {};
  }

  function getSettings() {
    var store = getStore();
    return store.settings || {};
  }

  function getSchoolName() {
    var s = getSettings();
    var store = getStore();
    return s.schoolName || (s.schoolInfo && s.schoolInfo.name) || (store.matchedSchool && store.matchedSchool.school_name) || 'Paathshala School';
  }

  function getSchoolLogo() {
    var s = getSettings();
    return s.logoUrl || s.schoolLogo || (s.schoolInfo && (s.schoolInfo.logoUrl || s.schoolInfo.schoolLogo)) || '';
  }

  function getPrincipalSignature() {
    var s = getSettings();
    return s.principalSignatureUrl || '';
  }

  function getPrincipalName() {
    var s = getSettings();
    return s.principalName || 'Principal';
  }

  function getAcademicYear() {
    var s = getSettings();
    var store = getStore();
    return s.academicYear || (store.examConfig && store.examConfig.session) || '2026-2027';
  }

  function getAllStudents() {
    var store = getStore();
    return (store.students || []).filter(function(st) {
      return !st.status || st.status.toLowerCase() === 'active';
    });
  }

  function getStudentInitials(name) {
    if (!name) return 'ST';
    var parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  function formatDateWords(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    var day = d.getDate();
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var month = monthNames[d.getMonth()];
    var year = d.getFullYear();

    var ones = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
      'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth',
      'Twenty-First', 'Twenty-Second', 'Twenty-Third', 'Twenty-Fourth', 'Twenty-Fifth', 'Twenty-Sixth', 'Twenty-Seventh', 'Twenty-Eighth', 'Twenty-Ninth', 'Thirtieth', 'Thirty-First'];
    
    var dayWords = ones[day] || (day + 'th');
    
    // Year to words helper
    function numberToWords(num) {
      var a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
      var b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
      if (num === 2000) return 'Two Thousand';
      if (num > 2000 && num < 2100) {
        var rem = num - 2000;
        if (rem < 20) return 'Two Thousand ' + a[rem];
        var tens = Math.floor(rem / 10);
        var unit = rem % 10;
        return 'Two Thousand ' + b[tens] + (unit ? ' ' + a[unit] : '');
      }
      return String(num);
    }

    var dd = (day < 10 ? '0' : '') + day;
    var mm = ((d.getMonth() + 1) < 10 ? '0' : '') + (d.getMonth() + 1);
    var formattedNumeric = dd + '-' + mm + '-' + year;
    return formattedNumeric + ' (' + dayWords + ' ' + month + ' ' + numberToWords(year) + ')';
  }

  // ==================== DOCUMENTS MODULE DEFINITION ====================
  var DocumentsModule = {

    init: function() {
      var container = document.getElementById('page-documents');
      if (!container) return;
      this.render();
    },

    render: function() {
      if (!requireAdmin()) return;

      var container = document.getElementById('page-documents');
      if (!container) return;

      var html = '';
      html += '<div class="docs-dashboard" style="max-width:1200px; margin:0 auto; padding:10px 15px 40px 15px;">';
      
      // Page Header
      html += '  <div class="docs-header" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:24px; border-bottom:1px solid var(--border-color); padding-bottom:16px;">';
      html += '    <div>';
      html += '      <h2 style="font-size:22px; font-weight:700; margin:0 0 6px 0; display:flex; align-items:center; gap:10px;">';
      html += '        <span style="font-size:24px;">🪪</span> Document &amp; ID Generator';
      html += '      </h2>';
      html += '      <p style="font-size:13px; color:var(--text-secondary); margin:0;">';
      html += '        Generate professional Examination Admit Cards, Official School Certificates, and Student ID Cards.';
      html += '      </p>';
      html += '    </div>';
      html += '    <div style="font-size:12px; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:8px; padding:8px 12px; display:flex; align-items:center; gap:8px;">';
      html += '      <span class="material-icons-round" style="color:var(--accent-primary); font-size:16px;">verified</span>';
      html += '      <span>Digital Signatures: ' + (getPrincipalSignature() ? '<b style="color:var(--success);">Active</b>' : '<b style="color:var(--warning);">Not Uploaded</b> (Configure in Admin Settings)') + '</span>';
      html += '    </div>';
      html += '  </div>';

      // SECTION A: Generate Document
      html += '  <section class="docs-section" style="margin-bottom:28px;">';
      html += '    <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">';
      html += '      <span class="material-icons-round" style="color:var(--accent-primary); font-size:20px;">description</span>';
      html += '      <h3 style="font-size:16px; font-weight:600; margin:0;">Generate Document</h3>';
      html += '    </div>';
      html += '    <div class="docs-cards-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:16px;">';

      // Card 1: Admit Card
      html += '      <div class="doc-card" id="card-admit-card" onclick="DocumentsModule.selectWorkflow(\'admit-card\')" style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:12px; padding:18px; cursor:pointer; transition:all 0.2s ease; position:relative; overflow:hidden;">';
      html += '        <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">';
      html += '          <div style="width:42px; height:42px; border-radius:10px; background:rgba(99, 102, 241, 0.12); display:flex; align-items:center; justify-content:center; font-size:22px;">📋</div>';
      html += '          <div>';
      html += '            <h4 style="margin:0; font-size:15px; font-weight:600;">Admit Card</h4>';
      html += '            <span style="font-size:11px; color:var(--text-secondary);">Exam Hall Ticket</span>';
      html += '          </div>';
      html += '        </div>';
      html += '        <p style="font-size:12px; color:var(--text-secondary); margin:0; line-height:1.4;">2 per A4 portrait. Exam schedule table, candidate &amp; principal signature.</p>';
      html += '      </div>';

      // Card 2: Bonafide Certificate
      html += '      <div class="doc-card" id="card-bonafide" onclick="DocumentsModule.selectWorkflow(\'bonafide\')" style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:12px; padding:18px; cursor:pointer; transition:all 0.2s ease; position:relative; overflow:hidden;">';
      html += '        <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">';
      html += '          <div style="width:42px; height:42px; border-radius:10px; background:rgba(16, 185, 129, 0.12); display:flex; align-items:center; justify-content:center; font-size:22px;">📄</div>';
      html += '          <div>';
      html += '            <h4 style="margin:0; font-size:15px; font-weight:600;">Bonafide Certificate</h4>';
      html += '            <span style="font-size:11px; color:var(--text-secondary);">Student Verification</span>';
      html += '          </div>';
      html += '        </div>';
      html += '        <p style="font-size:12px; color:var(--text-secondary); margin:0; line-height:1.4;">Official letterhead verification for bank, passport, or scholarship use.</p>';
      html += '      </div>';

      // Card 3: Transfer Certificate
      html += '      <div class="doc-card" id="card-tc" onclick="DocumentsModule.selectWorkflow(\'tc\')" style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:12px; padding:18px; cursor:pointer; transition:all 0.2s ease; position:relative; overflow:hidden;">';
      html += '        <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">';
      html += '          <div style="width:42px; height:42px; border-radius:10px; background:rgba(245, 158, 11, 0.12); display:flex; align-items:center; justify-content:center; font-size:22px;">🔄</div>';
      html += '          <div>';
      html += '            <h4 style="margin:0; font-size:15px; font-weight:600;">Transfer Certificate</h4>';
      html += '            <span style="font-size:11px; color:var(--text-secondary);">School Leaving TC</span>';
      html += '          </div>';
      html += '        </div>';
      html += '        <p style="font-size:12px; color:var(--text-secondary); margin:0; line-height:1.4;">State board compliant 18-point formal TC with leaving reason &amp; conduct.</p>';
      html += '      </div>';

      // Card 4: Character Certificate
      html += '      <div class="doc-card" id="card-character" onclick="DocumentsModule.selectWorkflow(\'character\')" style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:12px; padding:18px; cursor:pointer; transition:all 0.2s ease; position:relative; overflow:hidden;">';
      html += '        <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">';
      html += '          <div style="width:42px; height:42px; border-radius:10px; background:rgba(139, 92, 246, 0.12); display:flex; align-items:center; justify-content:center; font-size:22px;">📜</div>';
      html += '          <div>';
      html += '            <h4 style="margin:0; font-size:15px; font-weight:600;">Character Certificate</h4>';
      html += '            <span style="font-size:11px; color:var(--text-secondary);">Conduct &amp; Moral Record</span>';
      html += '          </div>';
      html += '        </div>';
      html += '        <p style="font-size:12px; color:var(--text-secondary); margin:0; line-height:1.4;">Official testament of commendable character, behavior, and tenure.</p>';
      html += '      </div>';

      html += '    </div>';
      html += '  </section>';

      // SECTION B: Generate ID Card
      html += '  <section class="docs-section" style="margin-bottom:28px;">';
      html += '    <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">';
      html += '      <span class="material-icons-round" style="color:var(--accent-primary); font-size:20px;">badge</span>';
      html += '      <h3 style="font-size:16px; font-weight:600; margin:0;">Generate ID Card</h3>';
      html += '    </div>';
      html += '    <div class="docs-cards-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px;">';

      // Card 5: Standard ID Card
      html += '      <div class="doc-card" id="card-id-standard" onclick="DocumentsModule.selectWorkflow(\'id-standard\')" style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:12px; padding:18px; cursor:pointer; transition:all 0.2s ease; position:relative; overflow:hidden;">';
      html += '        <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">';
      html += '          <div style="width:42px; height:42px; border-radius:10px; background:rgba(59, 130, 246, 0.12); display:flex; align-items:center; justify-content:center; font-size:22px;">🪪</div>';
      html += '          <div>';
      html += '            <h4 style="margin:0; font-size:15px; font-weight:600;">Student ID Card (Standard)</h4>';
      html += '            <span style="font-size:11px; color:var(--text-secondary);">4 per A4 Landscape</span>';
      html += '          </div>';
      html += '        </div>';
      html += '        <p style="font-size:12px; color:var(--text-secondary); margin:0; line-height:1.4;">Horizontal credit-card proportions (85.6mm &times; 54mm) with photo &amp; emergency contact.</p>';
      html += '      </div>';

      // Card 6: ID Card With Parent Photo
      html += '      <div class="doc-card" id="card-id-parent" onclick="DocumentsModule.selectWorkflow(\'id-parent\')" style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:12px; padding:18px; cursor:pointer; transition:all 0.2s ease; position:relative; overflow:hidden;">';
      html += '        <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">';
      html += '          <div style="width:42px; height:42px; border-radius:10px; background:rgba(236, 72, 153, 0.12); display:flex; align-items:center; justify-content:center; font-size:22px;">👨‍👩‍👧</div>';
      html += '          <div>';
      html += '            <h4 style="margin:0; font-size:15px; font-weight:600;">ID Card (With Parent Photo)</h4>';
      html += '            <span style="font-size:11px; color:var(--text-secondary);">Gate Security / Pickup Auth</span>';
      html += '          </div>';
      html += '        </div>';
      html += '        <p style="font-size:12px; color:var(--text-secondary); margin:0; line-height:1.4;">Dual photo format featuring student and parent/guardian photo placeholders.</p>';
      html += '      </div>';

      html += '    </div>';
      html += '  </section>';

      // Workflow Panel Container
      html += '  <div id="docs-workflow-panel" class="hidden" style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:14px; padding:24px; margin-top:20px; box-shadow:0 4px 20px rgba(0,0,0,0.06);"></div>';

      html += '</div>';

      container.innerHTML = html;

      // Restore active workflow if previously open
      if (currentWorkflow) {
        this.selectWorkflow(currentWorkflow);
      }
    },

    selectWorkflow: function(workflowKey) {
      if (!requireAdmin()) return;

      currentWorkflow = workflowKey;

      // Update card visual styles
      document.querySelectorAll('.doc-card').forEach(function(c) {
        c.style.borderColor = 'var(--border-color)';
        c.style.background = 'var(--bg-secondary)';
      });

      var activeCard = document.getElementById('card-' + workflowKey);
      if (activeCard) {
        activeCard.style.borderColor = 'var(--accent-primary)';
        activeCard.style.background = 'rgba(99, 102, 241, 0.05)';
      }

      var panel = document.getElementById('docs-workflow-panel');
      if (!panel) return;
      panel.classList.remove('hidden');

      if (workflowKey === 'admit-card') {
        this.showAdmitCardFlow();
      } else if (workflowKey === 'bonafide') {
        this.showCertificateFlow('bonafide');
      } else if (workflowKey === 'tc') {
        this.showCertificateFlow('tc');
      } else if (workflowKey === 'character') {
        this.showCertificateFlow('character');
      } else if (workflowKey === 'id-standard') {
        this.showIDCardFlow(false);
      } else if (workflowKey === 'id-parent') {
        this.showIDCardFlow(true);
      }

      // Smooth scroll to workflow panel
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },

    // =========================================================================
    // PHASE 3 — ADMIT CARD GENERATOR FLOW
    // =========================================================================
    showAdmitCardFlow: function() {
      var store = getStore();
      var panel = document.getElementById('docs-workflow-panel');
      if (!panel) return;

      var examTerms = store.examTerms || {};
      var termKeys = Object.keys(examTerms);
      var classes = (store.settings && store.settings.classes) || [];
      var sections = (store.settings && store.settings.sections) || ['A', 'B', 'C'];

      var html = '';
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; border-bottom:1px solid var(--border-color); padding-bottom:12px;">';
      html += '  <h3 style="margin:0; font-size:18px; font-weight:700; display:flex; align-items:center; gap:8px;">';
      html += '    <span>📋</span> Examination Admit Card Generator';
      html += '  </h3>';
      html += '  <button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'docs-workflow-panel\').classList.add(\'hidden\');">Close</button>';
      html += '</div>';

      // Step 1: Selection Form
      html += '<div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:10px; padding:18px; margin-bottom:20px;">';
      html += '  <div style="font-size:13px; font-weight:600; color:var(--text-primary); margin-bottom:12px;">Step 1: Select Exam &amp; Target Class</div>';
      html += '  <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px;">';
      
      // Exam Dropdown
      html += '    <div>';
      html += '      <label class="form-label" style="font-size:12px;">Examination</label>';
      html += '      <select id="ac-exam-select" class="form-select" onchange="DocumentsModule.onAdmitCardFilterChange()">';
      if (termKeys.length === 0) {
        html += '        <option value="term_annual">Annual Examination (' + escapeHTML(getAcademicYear()) + ')</option>';
      } else {
        termKeys.forEach(function(k) {
          var t = examTerms[k];
          html += '        <option value="' + escapeHTML(k) + '">' + escapeHTML(t.name || k) + '</option>';
        });
      }
      html += '      </select>';
      html += '    </div>';

      // Class Dropdown
      html += '    <div>';
      html += '      <label class="form-label" style="font-size:12px;">Class</label>';
      html += '      <select id="ac-class-select" class="form-select" onchange="DocumentsModule.onAdmitCardFilterChange()">';
      html += '        <option value="ALL">All Classes</option>';
      classes.forEach(function(c) {
        html += '        <option value="' + escapeHTML(c) + '">Class ' + escapeHTML(c) + '</option>';
      });
      html += '      </select>';
      html += '    </div>';

      // Section Dropdown
      html += '    <div>';
      html += '      <label class="form-label" style="font-size:12px;">Section</label>';
      html += '      <select id="ac-section-select" class="form-select" onchange="DocumentsModule.onAdmitCardFilterChange()">';
      html += '        <option value="ALL">All Sections</option>';
      sections.forEach(function(s) {
        html += '        <option value="' + escapeHTML(s) + '">Section ' + escapeHTML(s) + '</option>';
      });
      html += '      </select>';
      html += '    </div>';

      html += '  </div>';
      html += '</div>';

      // Step 2: Subject Timetable Container
      html += '<div id="ac-timetable-container" style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:10px; padding:18px; margin-bottom:20px;"></div>';

      // Step 3: Actions & Preview Container
      html += '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:20px;">';
      html += '  <div id="ac-student-count-badge" style="font-size:13px; font-weight:600; color:var(--text-secondary);">Loading students...</div>';
      html += '  <div style="display:flex; gap:10px;">';
      html += '    <button class="btn btn-secondary" onclick="DocumentsModule.renderAdmitCardsPreview()">';
      html += '      <span class="material-icons-round" style="font-size:16px; vertical-align:middle;">visibility</span> Preview Admit Cards';
      html += '    </button>';
      html += '    <button class="btn btn-primary" onclick="DocumentsModule.printAdmitCards()">';
      html += '      <span class="material-icons-round" style="font-size:16px; vertical-align:middle;">print</span> Print All Admit Cards';
      html += '    </button>';
      html += '  </div>';
      html += '</div>';

      html += '<div id="ac-preview-container" style="border:1px dashed var(--border-color); border-radius:10px; padding:16px; background:var(--bg-secondary); max-height:700px; overflow-y:auto;"></div>';

      panel.innerHTML = html;

      this.onAdmitCardFilterChange();
    },

    onAdmitCardFilterChange: function() {
      var store = getStore();
      var examSelect = document.getElementById('ac-exam-select');
      var classSelect = document.getElementById('ac-class-select');
      var secSelect = document.getElementById('ac-section-select');
      if (!examSelect || !classSelect || !secSelect) return;

      var termId = examSelect.value;
      var className = classSelect.value;
      var section = secSelect.value;

      // Resolve subjects
      var subjects = [];
      if (className !== 'ALL' && store.examSubjects && store.examSubjects[termId] && store.examSubjects[termId][className] && store.examSubjects[termId][className].subjects) {
        subjects = store.examSubjects[termId][className].subjects;
      } else if (store.settings && Array.isArray(store.settings.subjects) && store.settings.subjects.length > 0) {
        subjects = store.settings.subjects.map(function(s, idx) {
          return { name: s, fullMarks: 100 };
        });
      } else {
        subjects = [
          { name: 'English', fullMarks: 100 },
          { name: 'Hindi', fullMarks: 100 },
          { name: 'Mathematics', fullMarks: 100 },
          { name: 'Science', fullMarks: 100 },
          { name: 'Social Studies', fullMarks: 100 }
        ];
      }

      // Auto-assign dates starting from examTerm startDate (skip weekends)
      var examTerm = (store.examTerms && store.examTerms[termId]) || {};
      var curDate = examTerm.startDate ? new Date(examTerm.startDate) : new Date();
      if (isNaN(curDate.getTime())) curDate = new Date();

      timetableRows = subjects.map(function(sub) {
        // Skip Saturday (6) and Sunday (0)
        while (curDate.getDay() === 0 || curDate.getDay() === 6) {
          curDate.setDate(curDate.getDate() + 1);
        }
        var yyyy = curDate.getFullYear();
        var mm = String(curDate.getMonth() + 1).padStart(2, '0');
        var dd = String(curDate.getDate()).padStart(2, '0');
        var dateVal = yyyy + '-' + mm + '-' + dd;

        // Move to next day for subsequent subject
        curDate.setDate(curDate.getDate() + 1);

        return {
          subject: sub.name || 'Subject',
          date: dateVal,
          time: '09:00 AM – 12:00 PM',
          marks: sub.fullMarks || 100
        };
      });

      this.renderAdmitCardTimetableForm();
      this.updateAdmitCardStudentCount();
    },

    renderAdmitCardTimetableForm: function() {
      var container = document.getElementById('ac-timetable-container');
      if (!container) return;

      var html = '';
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">';
      html += '  <div style="font-size:13px; font-weight:600; color:var(--text-primary);">Step 2: Examination Schedule (Editable before print)</div>';
      html += '  <button type="button" class="btn btn-secondary btn-xs" onclick="DocumentsModule.addTimetableRow()">+ Add Subject</button>';
      html += '</div>';

      html += '<div style="overflow-x:auto;">';
      html += '  <table style="width:100%; border-collapse:collapse; font-size:12px;">';
      html += '    <thead>';
      html += '      <tr style="background:var(--bg-secondary); border-bottom:1px solid var(--border-color); text-align:left;">';
      html += '        <th style="padding:8px 10px;">Subject</th>';
      html += '        <th style="padding:8px 10px;">Date</th>';
      html += '        <th style="padding:8px 10px;">Time</th>';
      html += '        <th style="padding:8px 10px; width:90px;">Max Marks</th>';
      html += '        <th style="padding:8px 10px; width:40px;"></th>';
      html += '      </tr>';
      html += '    </thead>';
      html += '    <tbody>';

      timetableRows.forEach(function(row, idx) {
        html += '      <tr style="border-bottom:1px solid var(--border-color);">';
        html += '        <td style="padding:6px 10px;"><input type="text" class="form-input" style="padding:4px 8px; font-size:12px;" value="' + escapeHTML(row.subject) + '" onchange="DocumentsModule.updateTimetableRow(' + idx + ', \'subject\', this.value)"></td>';
        html += '        <td style="padding:6px 10px;"><input type="date" class="form-input" style="padding:4px 8px; font-size:12px;" value="' + escapeHTML(row.date) + '" onchange="DocumentsModule.updateTimetableRow(' + idx + ', \'date\', this.value)"></td>';
        html += '        <td style="padding:6px 10px;"><input type="text" class="form-input" style="padding:4px 8px; font-size:12px;" value="' + escapeHTML(row.time) + '" onchange="DocumentsModule.updateTimetableRow(' + idx + ', \'time\', this.value)"></td>';
        html += '        <td style="padding:6px 10px;"><input type="number" class="form-input" style="padding:4px 8px; font-size:12px;" value="' + escapeHTML(row.marks) + '" onchange="DocumentsModule.updateTimetableRow(' + idx + ', \'marks\', this.value)"></td>';
        html += '        <td style="padding:6px 10px; text-align:center;"><button type="button" class="btn btn-danger btn-xs" style="padding:2px 6px;" onclick="DocumentsModule.removeTimetableRow(' + idx + ')">&times;</button></td>';
        html += '      </tr>';
      });

      html += '    </tbody>';
      html += '  </table>';
      html += '</div>';

      container.innerHTML = html;
    },

    updateTimetableRow: function(idx, field, val) {
      if (timetableRows[idx]) {
        timetableRows[idx][field] = val;
      }
    },

    addTimetableRow: function() {
      timetableRows.push({
        subject: 'New Subject',
        date: new Date().toISOString().split('T')[0],
        time: '09:00 AM – 12:00 PM',
        marks: 100
      });
      this.renderAdmitCardTimetableForm();
    },

    removeTimetableRow: function(idx) {
      timetableRows.splice(idx, 1);
      this.renderAdmitCardTimetableForm();
    },

    getFilteredAdmitCardStudents: function() {
      var classSelect = document.getElementById('ac-class-select');
      var secSelect = document.getElementById('ac-section-select');
      var selectedClass = classSelect ? classSelect.value : 'ALL';
      var selectedSec = secSelect ? secSelect.value : 'ALL';

      var allStudents = getAllStudents();
      return allStudents.filter(function(st) {
        var matchClass = (selectedClass === 'ALL' || String(st.class).trim().toLowerCase() === String(selectedClass).trim().toLowerCase());
        var matchSec = (selectedSec === 'ALL' || String(st.section).trim().toLowerCase() === String(selectedSec).trim().toLowerCase());
        return matchClass && matchSec;
      });
    },

    updateAdmitCardStudentCount: function() {
      var badge = document.getElementById('ac-student-count-badge');
      if (!badge) return;
      var matching = this.getFilteredAdmitCardStudents();
      badge.innerHTML = '<span class="material-icons-round" style="font-size:16px; vertical-align:middle; color:var(--accent-primary);">groups</span> <b>' + matching.length + '</b> student(s) selected for printing';
    },

    buildAdmitCardHTML: function(student, examName, isPrint) {
      var schoolName = getSchoolName();
      var logo = getSchoolLogo();
      var signature = getPrincipalSignature();
      var principalName = getPrincipalName();
      var year = getAcademicYear();
      var sName = student.name || ((student.firstName || '') + ' ' + (student.lastName || '')).trim() || 'Student Name';
      var initials = getStudentInitials(sName);
      var roll = student.rollNumber || '—';
      var adm = student.admissionNumber || '—';
      var sClass = student.class || '—';
      var sSec = student.section || '—';
      var settings = getSettings();
      var contactLine = (settings.address || '') + (settings.phone ? ' · Ph: ' + settings.phone : '');

      var card = '';
      card += '<div class="admit-card" style="border:1.5px solid #1E293B; border-radius:8px; padding:12px 14px; background:#FFF; color:#0F172A; font-family:-apple-system, BlinkMacSystemFont, Roboto, sans-serif; position:relative; page-break-inside:avoid; break-inside:avoid; box-sizing:border-box; margin-bottom:12mm;">';
      
      // Header
      card += '  <div style="display:flex; align-items:center; gap:12px; border-bottom:1.5px solid #1E293B; padding-bottom:8px; margin-bottom:8px;">';
      if (logo) {
        card += '    <img src="' + logo + '" style="width:40px; height:40px; object-fit:contain;" />';
      }
      card += '    <div style="flex:1; text-align:center;">';
      card += '      <div style="font-size:15px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; line-height:1.2;">' + escapeHTML(schoolName) + '</div>';
      if (contactLine) {
        card += '      <div style="font-size:9.5px; color:#475569; margin-top:2px;">' + escapeHTML(contactLine) + '</div>';
      }
      card += '    </div>';
      card += '  </div>';

      // Title Subheader
      card += '  <div style="display:flex; justify-content:space-between; align-items:center; background:#F1F5F9; border:1px solid #CBD5E1; border-radius:4px; padding:4px 8px; margin-bottom:10px; font-size:11px;">';
      card += '    <span style="font-weight:700; text-transform:uppercase; color:#0F172A;">ADMIT CARD — ' + escapeHTML(examName) + '</span>';
      card += '    <span style="color:#475569; font-weight:600;">Academic Year: ' + escapeHTML(year) + '</span>';
      card += '  </div>';

      // Student Details with Photo Placeholder
      card += '  <div style="display:flex; gap:12px; align-items:center; margin-bottom:10px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:8px 10px;">';
      
      // Photo box
      if (student.photoUrl) {
        card += '    <img src="' + student.photoUrl + '" style="width:50px; height:60px; object-fit:cover; border-radius:4px; border:1px solid #CBD5E1;" />';
      } else {
        card += '    <div class="photo-placeholder" style="width:50px; height:60px; border:1px dashed #94A3B8; background:#FFFFFF; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:4px; text-align:center; flex-shrink:0;">';
        card += '      <span class="initials" style="font-size:16px; font-weight:700; color:#334155; line-height:1;">' + escapeHTML(initials) + '</span>';
        card += '      <span class="label" style="font-size:8px; color:#64748B; margin-top:4px; line-height:1; font-weight:500;">Affix Photo</span>';
        card += '    </div>';
      }

      // Fields
      card += '    <div style="flex:1; display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; font-size:11.5px;">';
      card += '      <div><span style="color:#64748B; font-weight:500;">Name:</span> <b style="color:#0F172A;">' + escapeHTML(sName) + '</b></div>';
      card += '      <div><span style="color:#64748B; font-weight:500;">Roll No:</span> <b style="color:#0F172A;">' + escapeHTML(roll) + '</b></div>';
      card += '      <div><span style="color:#64748B; font-weight:500;">Class:</span> <b style="color:#0F172A;">' + escapeHTML(sClass) + '</b> &nbsp; <span style="color:#64748B; font-weight:500;">Sec:</span> <b style="color:#0F172A;">' + escapeHTML(sSec) + '</b></div>';
      card += '      <div><span style="color:#64748B; font-weight:500;">Adm No:</span> <b style="color:#0F172A;">' + escapeHTML(adm) + '</b></div>';
      card += '    </div>';
      card += '  </div>';

      // Timetable Table
      card += '  <div style="margin-bottom:12px;">';
      card += '    <div style="font-size:10px; font-weight:700; text-transform:uppercase; color:#475569; margin-bottom:4px; letter-spacing:0.3px;">EXAMINATION SCHEDULE</div>';
      card += '    <table style="width:100%; border-collapse:collapse; font-size:10.5px; border:1px solid #CBD5E1;">';
      card += '      <thead>';
      card += '        <tr style="background:#F1F5F9; border-bottom:1px solid #CBD5E1; text-align:left;">';
      card += '          <th style="padding:4px 8px; border-right:1px solid #CBD5E1;">Subject</th>';
      card += '          <th style="padding:4px 8px; border-right:1px solid #CBD5E1;">Date</th>';
      card += '          <th style="padding:4px 8px; border-right:1px solid #CBD5E1;">Time</th>';
      card += '          <th style="padding:4px 8px; text-align:center;">Marks</th>';
      card += '        </tr>';
      card += '      </thead>';
      card += '      <tbody>';

      timetableRows.forEach(function(row, rIdx) {
        var bg = rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        card += '        <tr style="background:' + bg + '; border-bottom:1px solid #E2E8F0;">';
        card += '          <td style="padding:3.5px 8px; border-right:1px solid #E2E8F0; font-weight:600;">' + escapeHTML(row.subject) + '</td>';
        card += '          <td style="padding:3.5px 8px; border-right:1px solid #E2E8F0;">' + escapeHTML(row.date) + '</td>';
        card += '          <td style="padding:3.5px 8px; border-right:1px solid #E2E8F0;">' + escapeHTML(row.time) + '</td>';
        card += '          <td style="padding:3.5px 8px; text-align:center;">' + escapeHTML(row.marks) + '</td>';
        card += '        </tr>';
      });

      card += '      </tbody>';
      card += '    </table>';
      card += '  </div>';

      // Signatures
      card += '  <div style="display:flex; justify-content:space-between; align-items:flex-end; padding-top:10px; border-top:1px dashed #CBD5E1; font-size:11px;">';
      card += '    <div>';
      card += '      <div style="height:28px;"></div>';
      card += '      <div style="border-top:1px solid #475569; padding-top:2px; font-weight:600; width:130px;">Candidate Signature</div>';
      card += '    </div>';
      card += '    <div style="text-align:right;">';
      if (signature) {
        card += '      <img src="' + signature + '" style="max-height:35px; max-width:130px; object-fit:contain; display:block; margin-left:auto; margin-bottom:2px;" />';
      } else {
        card += '      <div style="height:28px;"></div>';
      }
      card += '      <div style="border-top:1px solid #475569; padding-top:2px; font-weight:600; min-width:130px;">';
      card += '        ' + escapeHTML(principalName) + '<br><span style="font-size:9.5px; color:#64748B; font-weight:400;">Principal</span>';
      card += '      </div>';
      card += '    </div>';
      card += '  </div>';

      card += '</div>';

      return card;
    },

    renderAdmitCardsPreview: function() {
      var preview = document.getElementById('ac-preview-container');
      if (!preview) return;

      var students = this.getFilteredAdmitCardStudents();
      if (students.length === 0) {
        preview.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-secondary);">No active students found matching the selected class/section.</div>';
        return;
      }

      var examSelect = document.getElementById('ac-exam-select');
      var examName = (examSelect && examSelect.options[examSelect.selectedIndex]) ? examSelect.options[examSelect.selectedIndex].text : 'Term Examination';

      var html = '<div style="display:flex; flex-direction:column; gap:16px;">';
      students.slice(0, 4).forEach(function(st) {
        html += DocumentsModule.buildAdmitCardHTML(st, examName, false);
      });
      if (students.length > 4) {
        html += '<div style="text-align:center; font-size:12px; color:var(--text-secondary); padding:10px; background:var(--bg-primary); border-radius:6px;">';
        html += 'Showing first 4 of ' + students.length + ' admit cards in preview. Click <b>Print All Admit Cards</b> to generate the complete print batch.';
        html += '</div>';
      }
      html += '</div>';

      preview.innerHTML = html;
    },

    printAdmitCards: function() {
      var students = this.getFilteredAdmitCardStudents();
      if (students.length === 0) {
        SchoolApp.showToast('No students to print.', 'warning');
        return;
      }

      var examSelect = document.getElementById('ac-exam-select');
      var examName = (examSelect && examSelect.options[examSelect.selectedIndex]) ? examSelect.options[examSelect.selectedIndex].text : 'Term Examination';

      // 2 per A4 portrait page
      var pagesHTML = '';
      for (var i = 0; i < students.length; i += 2) {
        var pageCards = '';
        pageCards += this.buildAdmitCardHTML(students[i], examName, true);
        if (students[i + 1]) {
          pageCards += this.buildAdmitCardHTML(students[i + 1], examName, true);
        }
        var pageBreak = (i + 2 < students.length) ? 'page-break' : '';
        pagesHTML += '<div class="' + pageBreak + '" style="min-height:280mm; box-sizing:border-box;">' + pageCards + '</div>';
      }

      this.printDocument(pagesHTML, 'portrait', '8mm');
    },

    // =========================================================================
    // PHASE 4 — CERTIFICATE GENERATOR FLOW
    // =========================================================================
    showCertificateFlow: function(certType) {
      var panel = document.getElementById('docs-workflow-panel');
      if (!panel) return;

      var titles = {
        bonafide: 'Bonafide Certificate Generator',
        tc: 'Transfer Certificate (TC) Generator',
        character: 'Character Certificate Generator'
      };

      var html = '';
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; border-bottom:1px solid var(--border-color); padding-bottom:12px;">';
      html += '  <h3 style="margin:0; font-size:18px; font-weight:700; display:flex; align-items:center; gap:8px;">';
      html += '    <span>📜</span> ' + escapeHTML(titles[certType] || 'Certificate Generator');
      html += '  </h3>';
      html += '  <button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'docs-workflow-panel\').classList.add(\'hidden\');">Close</button>';
      html += '</div>';

      // Shared Student Search Component
      html += '<div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:10px; padding:18px; margin-bottom:20px;">';
      html += '  <label class="form-label" style="font-size:13px; font-weight:600;">Search &amp; Select Student</label>';
      html += '  <div style="position:relative;">';
      html += '    <input type="text" id="cert-student-search" class="form-input" placeholder="Search student by name, roll number, or admission number..." oninput="DocumentsModule.searchStudents(this.value, \'' + certType + '\')" autocomplete="off">';
      html += '    <div id="cert-student-results" style="margin-top:8px; max-height:200px; overflow-y:auto; display:none; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:8px;"></div>';
      html += '  </div>';
      html += '  <div id="cert-selected-student-banner" style="margin-top:12px; display:none; padding:10px 14px; background:rgba(99, 102, 241, 0.08); border:1px solid rgba(99, 102, 241, 0.2); border-radius:8px; font-size:13px;"></div>';
      html += '</div>';

      // Certificate Editor & Live Preview Container
      html += '<div id="cert-editor-container" class="hidden">';
      html += '  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">';
      html += '    <div style="font-size:13px; font-weight:600; color:var(--text-primary);">Certificate Preview &amp; Configuration</div>';
      html += '    <button class="btn btn-primary" onclick="DocumentsModule.printCurrentCertificate(\'' + certType + '\')">';
      html += '      <span class="material-icons-round" style="font-size:16px; vertical-align:middle;">print</span> Print Certificate';
      html += '    </button>';
      html += '  </div>';
      html += '  <div id="cert-preview-card" style="background:#FFF; color:#111827; border:1px solid var(--border-color); border-radius:10px; padding:30px; box-shadow:0 4px 20px rgba(0,0,0,0.06); max-width:800px; margin:0 auto; overflow-x:auto;"></div>';
      html += '</div>';

      panel.innerHTML = html;

      // Reset student selection
      selectedStudent = null;
    },

    searchStudents: function(query, certType) {
      var resultsContainer = document.getElementById('cert-student-results');
      if (!resultsContainer) return;

      var q = (query || '').trim().toLowerCase();
      if (!q) {
        resultsContainer.innerHTML = '';
        resultsContainer.style.display = 'none';
        return;
      }

      var allStudents = getAllStudents();
      var matches = allStudents.filter(function(st) {
        var sName = ((st.name || '') + ' ' + (st.firstName || '') + ' ' + (st.lastName || '')).toLowerCase();
        var roll = String(st.rollNumber || '').toLowerCase();
        var adm = String(st.admissionNumber || '').toLowerCase();
        return sName.indexOf(q) !== -1 || roll.indexOf(q) !== -1 || adm.indexOf(q) !== -1;
      });

      if (matches.length === 0) {
        resultsContainer.innerHTML = '<div style="padding:10px 14px; color:var(--text-secondary); font-size:12px;">No matching students found.</div>';
        resultsContainer.style.display = 'block';
        return;
      }

      var html = '';
      matches.slice(0, 10).forEach(function(st) {
        var name = st.name || ((st.firstName || '') + ' ' + (st.lastName || '')).trim();
        var details = 'Class ' + (st.class || '—') + '-' + (st.section || '—') + ' | Roll: ' + (st.rollNumber || '—') + ' | Adm: ' + (st.admissionNumber || '—');
        html += '<div style="padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;" onmouseover="this.style.background=\'var(--bg-primary)\'" onmouseout="this.style.background=\'\'" onclick="DocumentsModule.selectStudentForCert(\'' + st.id + '\', \'' + certType + '\')">';
        html += '  <div>';
        html += '    <div style="font-weight:600; font-size:13px; color:var(--text-primary);">' + escapeHTML(name) + '</div>';
        html += '    <div style="font-size:11px; color:var(--text-secondary);">' + escapeHTML(details) + '</div>';
        html += '  </div>';
        html += '  <button class="btn btn-secondary btn-xs">Select</button>';
        html += '</div>';
      });

      resultsContainer.innerHTML = html;
      resultsContainer.style.display = 'block';
    },

    selectStudentForCert: function(studentId, certType) {
      var allStudents = getAllStudents();
      selectedStudent = allStudents.find(function(s) { return s.id === studentId; });
      if (!selectedStudent) return;

      var resultsContainer = document.getElementById('cert-student-results');
      if (resultsContainer) resultsContainer.style.display = 'none';

      var searchInput = document.getElementById('cert-student-search');
      if (searchInput) searchInput.value = '';

      var banner = document.getElementById('cert-selected-student-banner');
      if (banner) {
        var sName = selectedStudent.name || ((selectedStudent.firstName || '') + ' ' + (selectedStudent.lastName || '')).trim();
        banner.style.display = 'block';
        banner.innerHTML = '<span class="material-icons-round" style="color:var(--success); font-size:16px; vertical-align:middle;">check_circle</span> Selected Student: <b>' + escapeHTML(sName) + '</b> (Class ' + escapeHTML(selectedStudent.class || '—') + '-' + escapeHTML(selectedStudent.section || '—') + ', Adm No: ' + escapeHTML(selectedStudent.admissionNumber || '—') + ')';
      }

      var editorContainer = document.getElementById('cert-editor-container');
      if (editorContainer) editorContainer.classList.remove('hidden');

      this.renderCertificatePreview(certType);
    },

    renderCertificatePreview: function(certType) {
      var previewCard = document.getElementById('cert-preview-card');
      if (!previewCard || !selectedStudent) return;

      if (certType === 'bonafide') {
        previewCard.innerHTML = this.buildBonafideHTML(selectedStudent, false);
      } else if (certType === 'character') {
        previewCard.innerHTML = this.buildCharacterHTML(selectedStudent, false);
      } else if (certType === 'tc') {
        previewCard.innerHTML = this.buildTCHTML(selectedStudent, false);
      }
    },

    // 4A — BONAFIDE CERTIFICATE TEMPLATE
    buildBonafideHTML: function(student, isPrint) {
      var schoolName = getSchoolName();
      var logo = getSchoolLogo();
      var signature = getPrincipalSignature();
      var principalName = getPrincipalName();
      var year = getAcademicYear();
      var sName = student.name || ((student.firstName || '') + ' ' + (student.lastName || '')).trim() || 'Student Name';
      var adm = student.admissionNumber || student.rollNumber || '001';
      var pName = student.parentName || 'Father';
      var mName = student.motherName || 'Mother';
      var sClass = student.class || '—';
      var sSec = student.section || '—';
      var gender = (student.gender || '').toLowerCase();
      var sonDaughter = (gender === 'female' || gender === 'girl') ? 'Daughter' : (gender === 'male' || gender === 'boy') ? 'Son' : 'Ward';
      var heShe = (gender === 'female' || gender === 'girl') ? 'She' : 'He';
      var settings = getSettings();
      var address = settings.address || '';
      var phone = settings.phone || '';
      var email = settings.email || '';
      var today = new Date().toISOString().split('T')[0];

      var certNo = 'BON-' + year.replace(/[^0-9]/g, '').substring(0, 4) + '-' + adm;

      var purpose = 'General Purpose';
      var purposeInput = document.getElementById('cert-bonafide-purpose');
      if (purposeInput) purpose = purposeInput.value;

      var dateVal = today;
      var dateInput = document.getElementById('cert-bonafide-date');
      if (dateInput) dateVal = dateInput.value;

      var html = '';
      html += '<div class="certificate bonafide-cert" style="font-family:Georgia, serif; color:#1E293B; line-height:1.7; position:relative; box-sizing:border-box;">';

      // Letterhead
      html += '  <div style="text-align:center; border-bottom:2px solid #0F172A; padding-bottom:14px; margin-bottom:20px;">';
      if (logo) {
        html += '    <img src="' + logo + '" style="max-height:60px; max-width:180px; object-fit:contain; margin-bottom:8px;" />';
      }
      html += '    <h1 style="margin:0 0 4px 0; font-size:24px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#0F172A;">' + escapeHTML(schoolName) + '</h1>';
      html += '    <div style="font-size:12px; color:#475569; font-family:-apple-system, sans-serif;">';
      if (address) html += escapeHTML(address) + ' &nbsp;|&nbsp; ';
      if (phone) html += 'Ph: ' + escapeHTML(phone) + ' &nbsp;|&nbsp; ';
      if (email) html += 'Email: ' + escapeHTML(email);
      html += '    </div>';
      html += '  </div>';

      // Title & Reference
      html += '  <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-family:-apple-system, sans-serif; margin-bottom:24px;">';
      html += '    <div><b>Certificate No:</b> ' + escapeHTML(certNo) + '</div>';
      if (isPrint) {
        html += '    <div><b>Date:</b> ' + escapeHTML(dateVal) + '</div>';
      } else {
        html += '    <div><b>Date:</b> <input type="date" id="cert-bonafide-date" class="form-input" style="display:inline-block; width:140px; padding:3px 6px; font-size:12px;" value="' + escapeHTML(dateVal) + '" onchange="DocumentsModule.renderCertificatePreview(\'bonafide\')"></div>';
      }
      html += '  </div>';

      html += '  <div style="text-align:center; margin-bottom:28px;">';
      html += '    <span style="display:inline-block; font-size:18px; font-weight:800; text-transform:uppercase; letter-spacing:2px; border-bottom:2px solid #0F172A; padding-bottom:4px; color:#0F172A;">BONAFIDE CERTIFICATE</span>';
      html += '  </div>';

      html += '  <div style="text-align:center; font-weight:700; font-size:14px; text-transform:uppercase; letter-spacing:1px; margin-bottom:24px; color:#334155;">';
      html += '    TO WHOMSOEVER IT MAY CONCERN';
      html += '  </div>';

      // Body Paragraph
      html += '  <div style="font-size:15px; text-align:justify; margin-bottom:30px; text-indent:30px;">';
      html += '    This is to certify that <b>' + escapeHTML(sName) + '</b>, ' + escapeHTML(sonDaughter) + ' of <b>' + escapeHTML(pName) + '</b> and <b>' + escapeHTML(mName) + '</b>, bearing Admission Number <b>' + escapeHTML(adm) + '</b>, is a bonafide student of <b>' + escapeHTML(schoolName) + '</b>.';
      html += '  </div>';
      html += '  <div style="font-size:15px; text-align:justify; margin-bottom:30px; text-indent:30px;">';
      html += '    ' + escapeHTML(heShe) + ' is currently studying in <b>Class ' + escapeHTML(sClass) + '</b>, Section <b>' + escapeHTML(sSec) + '</b> during the Academic Year <b>' + escapeHTML(year) + '</b>.';
      html += '  </div>';

      html += '  <div style="font-size:14px; margin-bottom:40px;">';
      if (isPrint) {
        html += '    This certificate is issued on official request for the purpose of: <b>' + escapeHTML(purpose) + '</b>.';
      } else {
        html += '    This certificate is issued on official request for the purpose of: ';
        html += '    <select id="cert-bonafide-purpose" class="form-select" style="display:inline-block; width:200px; padding:4px 8px; font-size:13px; font-family:-apple-system, sans-serif;" onchange="DocumentsModule.renderCertificatePreview(\'bonafide\')">';
        var purposes = ['General Purpose', 'Bank Account', 'Scholarship', 'Passport', 'Other'];
        purposes.forEach(function(p) {
          html += '<option value="' + escapeHTML(p) + '"' + (p === purpose ? ' selected' : '') + '>' + escapeHTML(p) + '</option>';
        });
        html += '    </select>';
      }
      html += '  </div>';

      // Footer: Stamp & Signatures
      html += '  <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:60px; font-family:-apple-system, sans-serif;">';
      html += '    <div style="width:130px; height:80px; border:1px dashed #94A3B8; border-radius:6px; display:flex; align-items:center; justify-content:center; text-align:center; font-size:11px; color:#64748B;">';
      html += '      [ School Seal / Stamp ]';
      html += '    </div>';
      html += '    <div style="text-align:right;">';
      if (signature) {
        html += '      <img src="' + signature + '" style="max-height:48px; max-width:180px; object-fit:contain; display:block; margin-left:auto; margin-bottom:4px;" />';
      } else {
        html += '      <div style="height:48px;"></div>';
      }
      html += '      <div style="border-top:1px solid #1E293B; padding-top:4px; font-weight:700; font-size:13px; min-width:160px;">';
      html += '        ' + escapeHTML(principalName) + '<br>';
      html += '        <span style="font-size:11px; color:#64748B; font-weight:500;">Principal, ' + escapeHTML(schoolName) + '</span>';
      html += '      </div>';
      html += '    </div>';
      html += '  </div>';

      html += '</div>';

      return html;
    },

    // 4B — CHARACTER CERTIFICATE TEMPLATE
    buildCharacterHTML: function(student, isPrint) {
      var schoolName = getSchoolName();
      var logo = getSchoolLogo();
      var signature = getPrincipalSignature();
      var principalName = getPrincipalName();
      var year = getAcademicYear();
      var sName = student.name || ((student.firstName || '') + ' ' + (student.lastName || '')).trim() || 'Student Name';
      var adm = student.admissionNumber || student.rollNumber || '001';
      var pName = student.parentName || 'Father';
      var gender = (student.gender || '').toLowerCase();
      var sonDaughter = (gender === 'female' || gender === 'girl') ? 'Daughter' : (gender === 'male' || gender === 'boy') ? 'Son' : 'Ward';
      var hisHer = (gender === 'female' || gender === 'girl') ? 'her' : 'his';
      var heShe = (gender === 'female' || gender === 'girl') ? 'She' : 'He';
      var settings = getSettings();
      var address = settings.address || '';
      var phone = settings.phone || '';
      var email = settings.email || '';
      var today = new Date().toISOString().split('T')[0];

      var certNo = 'CHAR-' + year.replace(/[^0-9]/g, '').substring(0, 4) + '-' + adm;

      // Admission Date format
      var admDateText = 'April 2024';
      if (student.admissionDate) {
        var ad = new Date(student.admissionDate);
        if (!isNaN(ad.getTime())) {
          var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          admDateText = monthNames[ad.getMonth()] + ' ' + ad.getFullYear();
        }
      }

      var conduct = 'Good';
      var conductInput = document.getElementById('cert-character-conduct');
      if (conductInput) conduct = conductInput.value;

      var dateVal = today;
      var dateInput = document.getElementById('cert-character-date');
      if (dateInput) dateVal = dateInput.value;

      var html = '';
      html += '<div class="certificate character-cert" style="font-family:Georgia, serif; color:#1E293B; line-height:1.8; position:relative; box-sizing:border-box;">';

      // Letterhead
      html += '  <div style="text-align:center; border-bottom:2px solid #0F172A; padding-bottom:14px; margin-bottom:20px;">';
      if (logo) {
        html += '    <img src="' + logo + '" style="max-height:60px; max-width:180px; object-fit:contain; margin-bottom:8px;" />';
      }
      html += '    <h1 style="margin:0 0 4px 0; font-size:24px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#0F172A;">' + escapeHTML(schoolName) + '</h1>';
      html += '    <div style="font-size:12px; color:#475569; font-family:-apple-system, sans-serif;">';
      if (address) html += escapeHTML(address) + ' &nbsp;|&nbsp; ';
      if (phone) html += 'Ph: ' + escapeHTML(phone) + ' &nbsp;|&nbsp; ';
      if (email) html += 'Email: ' + escapeHTML(email);
      html += '    </div>';
      html += '  </div>';

      // Title & Reference
      html += '  <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-family:-apple-system, sans-serif; margin-bottom:24px;">';
      html += '    <div><b>Certificate No:</b> ' + escapeHTML(certNo) + '</div>';
      if (isPrint) {
        html += '    <div><b>Date:</b> ' + escapeHTML(dateVal) + '</div>';
      } else {
        html += '    <div><b>Date:</b> <input type="date" id="cert-character-date" class="form-input" style="display:inline-block; width:140px; padding:3px 6px; font-size:12px;" value="' + escapeHTML(dateVal) + '" onchange="DocumentsModule.renderCertificatePreview(\'character\')"></div>';
      }
      html += '  </div>';

      html += '  <div style="text-align:center; margin-bottom:30px;">';
      html += '    <span style="display:inline-block; font-size:18px; font-weight:800; text-transform:uppercase; letter-spacing:2px; border-bottom:2px solid #0F172A; padding-bottom:4px; color:#0F172A;">CHARACTER CERTIFICATE</span>';
      html += '  </div>';

      // Body Paragraphs
      html += '  <div style="font-size:15px; text-align:justify; margin-bottom:24px; text-indent:30px;">';
      html += '    This is to certify that <b>' + escapeHTML(sName) + '</b>, ' + escapeHTML(sonDaughter) + ' of <b>' + escapeHTML(pName) + '</b>, bearing Admission Number <b>' + escapeHTML(adm) + '</b>, was/is a student of <b>' + escapeHTML(schoolName) + '</b> from <b>' + escapeHTML(admDateText) + '</b> to <b>' + escapeHTML(dateVal) + '</b>.';
      html += '  </div>';

      html += '  <div style="font-size:15px; text-align:justify; margin-bottom:24px; text-indent:30px;">';
      if (isPrint) {
        html += '    During ' + escapeHTML(hisHer) + ' tenure at this institution, ' + escapeHTML(hisHer) + ' conduct and character have been found to be <b>' + escapeHTML(conduct) + '</b>.';
      } else {
        html += '    During ' + escapeHTML(hisHer) + ' tenure at this institution, ' + escapeHTML(hisHer) + ' conduct and character have been found to be ';
        html += '    <select id="cert-character-conduct" class="form-select" style="display:inline-block; width:140px; padding:3px 6px; font-size:13px; font-family:-apple-system, sans-serif;" onchange="DocumentsModule.renderCertificatePreview(\'character\')">';
        var conducts = ['Good', 'Very Good', 'Excellent'];
        conducts.forEach(function(c) {
          html += '<option value="' + escapeHTML(c) + '"' + (c === conduct ? ' selected' : '') + '>' + escapeHTML(c) + '</option>';
        });
        html += '    </select>.';
      }
      html += '  </div>';

      html += '  <div style="font-size:15px; text-align:justify; margin-bottom:24px; text-indent:30px;">';
      html += '    ' + escapeHTML(heShe) + ' bears a good moral character and ' + escapeHTML(hisHer) + ' behavior with teachers and fellow students has always been commendable.';
      html += '  </div>';

      html += '  <div style="font-size:15px; text-align:justify; margin-bottom:40px; text-indent:30px;">';
      html += '    We wish ' + escapeHTML(hisHer) + ' all the best in ' + escapeHTML(hisHer) + ' future endeavors.';
      html += '  </div>';

      // Footer
      html += '  <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:60px; font-family:-apple-system, sans-serif;">';
      html += '    <div style="width:130px; height:80px; border:1px dashed #94A3B8; border-radius:6px; display:flex; align-items:center; justify-content:center; text-align:center; font-size:11px; color:#64748B;">';
      html += '      [ School Seal / Stamp ]';
      html += '    </div>';
      html += '    <div style="text-align:right;">';
      if (signature) {
        html += '      <img src="' + signature + '" style="max-height:48px; max-width:180px; object-fit:contain; display:block; margin-left:auto; margin-bottom:4px;" />';
      } else {
        html += '      <div style="height:48px;"></div>';
      }
      html += '      <div style="border-top:1px solid #1E293B; padding-top:4px; font-weight:700; font-size:13px; min-width:160px;">';
      html += '        ' + escapeHTML(principalName) + '<br>';
      html += '        <span style="font-size:11px; color:#64748B; font-weight:500;">Principal, ' + escapeHTML(schoolName) + '</span>';
      html += '      </div>';
      html += '    </div>';
      html += '  </div>';

      html += '</div>';

      return html;
    },

    // 4C — TRANSFER CERTIFICATE (TC) TEMPLATE
    buildTCHTML: function(student, isPrint) {
      var schoolName = getSchoolName();
      var logo = getSchoolLogo();
      var signature = getPrincipalSignature();
      var principalName = getPrincipalName();
      var year = getAcademicYear();
      var sName = student.name || ((student.firstName || '') + ' ' + (student.lastName || '')).trim() || 'STUDENT NAME';
      var adm = student.admissionNumber || student.rollNumber || '001';
      var pName = student.parentName || 'Father Name';
      var mName = student.motherName || 'Mother Name';
      var dob = formatDateWords(student.dateOfBirth);
      var sClass = student.class || '—';
      var sSec = student.section || '—';
      var roll = student.rollNumber || '—';
      var admDate = student.admissionDate || '—';
      var settings = getSettings();
      var affiliation = settings.affiliation || 'State Board of Education';
      var udise = settings.udiseCode || '—';
      var today = new Date().toISOString().split('T')[0];

      var tcNo = 'TC-' + year.replace(/[^0-9]/g, '').substring(0, 4) + '-' + adm;

      var reason = 'On Request';
      var reasonInput = document.getElementById('cert-tc-reason');
      if (reasonInput) reason = reasonInput.value;

      var conduct = 'Good';
      var conductInput = document.getElementById('cert-tc-conduct');
      if (conductInput) conduct = conductInput.value;

      var remarks = 'Promoted to next class';
      var remarksInput = document.getElementById('cert-tc-remarks');
      if (remarksInput) remarks = remarksInput.value;

      var dateLeaving = today;
      var dateLeavingInput = document.getElementById('cert-tc-date-leaving');
      if (dateLeavingInput) dateLeaving = dateLeavingInput.value;

      var html = '';
      html += '<div class="certificate tc-cert" style="font-family:-apple-system, BlinkMacSystemFont, Roboto, sans-serif; color:#0F172A; line-height:1.5; position:relative; box-sizing:border-box;">';

      // Header
      html += '  <div style="text-align:center; border-bottom:2px solid #0F172A; padding-bottom:12px; margin-bottom:16px;">';
      if (logo) {
        html += '    <img src="' + logo + '" style="max-height:55px; max-width:160px; object-fit:contain; margin-bottom:6px;" />';
      }
      html += '    <h1 style="margin:0 0 4px 0; font-size:22px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">' + escapeHTML(schoolName) + '</h1>';
      html += '    <div style="font-size:12px; color:#475569;">';
      if (settings.address) html += escapeHTML(settings.address) + ' &nbsp;|&nbsp; ';
      html += 'Board Affiliation: ' + escapeHTML(affiliation);
      html += '    </div>';
      html += '  </div>';

      // Title & Reference
      html += '  <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-bottom:16px;">';
      html += '    <div><b>TC No:</b> ' + escapeHTML(tcNo) + '</div>';
      html += '    <div><b>Date of Issue:</b> ' + escapeHTML(today) + '</div>';
      html += '  </div>';

      html += '  <div style="text-align:center; margin-bottom:18px;">';
      html += '    <span style="display:inline-block; font-size:16px; font-weight:800; text-transform:uppercase; letter-spacing:2px; border-bottom:2px solid #0F172A; padding-bottom:3px;">TRANSFER CERTIFICATE</span>';
      html += '  </div>';

      // 18 Formal Table Rows
      html += '  <table style="width:100%; border-collapse:collapse; font-size:11.5px; border:1px solid #CBD5E1; margin-bottom:16px;">';
      
      var rows = [
        ['1.', 'Name of School', schoolName],
        ['2.', 'Affiliation / Board', affiliation],
        ['3.', 'UDISE Code', udise],
        ['4.', 'Name of Student', '<b style="text-transform:uppercase;">' + escapeHTML(sName) + '</b>'],
        ['5.', "Father's / Guardian's Name", pName],
        ['6.', "Mother's Name", mName],
        ['7.', 'Date of Birth (in words & numerals)', dob],
        ['8.', 'Nationality', 'Indian'],
        ['9.', 'Date of First Admission to School', admDate],
        ['10.', 'Class in which admitted', 'Class ' + escapeHTML(student.admissionClass || sClass)],
        ['11.', 'Class in which student last studied', 'Class ' + escapeHTML(sClass) + ', Section ' + escapeHTML(sSec)],
        ['12.', 'Roll Number', roll],
        ['13.', 'Admission / Scholar Number', adm],
        ['14.', 'Date of Leaving the School', isPrint ? dateLeaving : '<input type="date" id="cert-tc-date-leaving" class="form-input" style="padding:2px 6px; font-size:11.5px; width:130px; display:inline-block;" value="' + escapeHTML(dateLeaving) + '" onchange="DocumentsModule.renderCertificatePreview(\'tc\')">'],
        ['15.', 'Class studying at time of leaving', 'Class ' + escapeHTML(sClass) + ', Section ' + escapeHTML(sSec)],
        ['16.', 'Reason for Leaving the School', isPrint ? reason : '<select id="cert-tc-reason" class="form-select" style="padding:2px 6px; font-size:11.5px; width:180px; display:inline-block;" onchange="DocumentsModule.renderCertificatePreview(\'tc\')"><option value="Family Transfer"' + (reason==='Family Transfer'?' selected':'') + '>Family Transfer</option><option value="On Request"' + (reason==='On Request'?' selected':'') + '>On Request</option><option value="Course Completed"' + (reason==='Course Completed'?' selected':'') + '>Course Completed</option><option value="Withdrawn by Parents"' + (reason==='Withdrawn by Parents'?' selected':'') + '>Withdrawn by Parents</option><option value="Other"' + (reason==='Other'?' selected':'') + '>Other</option></select>'],
        ['17.', 'General Conduct', isPrint ? conduct : '<select id="cert-tc-conduct" class="form-select" style="padding:2px 6px; font-size:11.5px; width:140px; display:inline-block;" onchange="DocumentsModule.renderCertificatePreview(\'tc\')"><option value="Good"' + (conduct==='Good'?' selected':'') + '>Good</option><option value="Satisfactory"' + (conduct==='Satisfactory'?' selected':'') + '>Satisfactory</option><option value="Excellent"' + (conduct==='Excellent'?' selected':'') + '>Excellent</option></select>'],
        ['18.', 'Any Other Remarks', isPrint ? remarks : '<input type="text" id="cert-tc-remarks" class="form-input" style="padding:2px 6px; font-size:11.5px; width:220px; display:inline-block;" value="' + escapeHTML(remarks) + '" onchange="DocumentsModule.renderCertificatePreview(\'tc\')">']
      ];

      rows.forEach(function(r, idx) {
        var bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        html += '    <tr style="background:' + bg + '; border-bottom:1px solid #E2E8F0;">';
        html += '      <td style="padding:5px 8px; width:35px; color:#64748B; font-weight:600; border-right:1px solid #E2E8F0;">' + r[0] + '</td>';
        html += '      <td style="padding:5px 10px; width:260px; color:#475569; font-weight:600; border-right:1px solid #E2E8F0;">' + r[1] + '</td>';
        html += '      <td style="padding:5px 10px; color:#0F172A;">' + (r[1] === 'Name of Student' ? r[2] : escapeHTML(r[2])) + '</td>';
        html += '    </tr>';
      });

      html += '  </table>';

      html += '  <div style="font-size:11.5px; color:#475569; margin-bottom:24px; font-style:italic;">';
      html += '    Certified that the above particulars are in accordance with the school registers and records.';
      html += '  </div>';

      // Footer
      html += '  <div style="display:flex; justify-content:space-between; align-items:flex-end; font-size:11px;">';
      html += '    <div style="width:130px; height:75px; border:1px dashed #94A3B8; border-radius:6px; display:flex; align-items:center; justify-content:center; text-align:center; font-size:10.5px; color:#64748B;">';
      html += '      [ School Seal / Stamp ]';
      html += '    </div>';
      html += '    <div style="text-align:right;">';
      if (signature) {
        html += '      <img src="' + signature + '" style="max-height:44px; max-width:160px; object-fit:contain; display:block; margin-left:auto; margin-bottom:4px;" />';
      } else {
        html += '      <div style="height:44px;"></div>';
      }
      html += '      <div style="border-top:1px solid #1E293B; padding-top:4px; font-weight:700; font-size:12px; min-width:160px;">';
      html += '        Signature of Principal<br>';
      html += '        <span style="font-size:10px; color:#64748B; font-weight:400;">' + escapeHTML(principalName) + ' &bull; ' + escapeHTML(schoolName) + '</span>';
      html += '      </div>';
      html += '    </div>';
      html += '  </div>';

      html += '  <div style="font-size:9.5px; color:#94A3B8; text-align:center; margin-top:16px;">';
      html += '    NOTE: This Transfer Certificate is official and valid only when bearing the official school stamp and Principal\'s signature.';
      html += '  </div>';

      html += '</div>';

      return html;
    },

    printCurrentCertificate: function(certType) {
      if (!selectedStudent) {
        SchoolApp.showToast('Please select a student first.', 'warning');
        return;
      }

      var html = '';
      if (certType === 'bonafide') {
        html = this.buildBonafideHTML(selectedStudent, true);
      } else if (certType === 'character') {
        html = this.buildCharacterHTML(selectedStudent, true);
      } else if (certType === 'tc') {
        html = this.buildTCHTML(selectedStudent, true);
      }

      this.printDocument(html, 'portrait', '15mm');
    },

    // =========================================================================
    // PHASE 5 — STUDENT ID CARD GENERATOR FLOW
    // =========================================================================
    showIDCardFlow: function(withParentPhoto) {
      var store = getStore();
      var panel = document.getElementById('docs-workflow-panel');
      if (!panel) return;

      var classes = (store.settings && store.settings.classes) || [];
      var sections = (store.settings && store.settings.sections) || ['A', 'B', 'C'];

      var html = '';
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; border-bottom:1px solid var(--border-color); padding-bottom:12px;">';
      html += '  <h3 style="margin:0; font-size:18px; font-weight:700; display:flex; align-items:center; gap:8px;">';
      html += '    <span>🪪</span> ' + (withParentPhoto ? 'Student ID Card (With Parent Photo)' : 'Student ID Card (Standard)');
      html += '  </h3>';
      html += '  <button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'docs-workflow-panel\').classList.add(\'hidden\');">Close</button>';
      html += '</div>';

      // Controls Bar
      html += '<div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:10px; padding:18px; margin-bottom:20px;">';
      html += '  <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px; align-items:flex-end;">';

      // Template Toggle
      html += '    <div>';
      html += '      <label class="form-label" style="font-size:12px;">ID Card Template</label>';
      html += '      <div style="display:flex; gap:6px;">';
      html += '        <button type="button" class="btn ' + (!withParentPhoto ? 'btn-primary' : 'btn-secondary') + ' btn-sm" style="flex:1;" onclick="DocumentsModule.selectWorkflow(\'id-standard\')">Standard</button>';
      html += '        <button type="button" class="btn ' + (withParentPhoto ? 'btn-primary' : 'btn-secondary') + ' btn-sm" style="flex:1;" onclick="DocumentsModule.selectWorkflow(\'id-parent\')">+ Parent Photo</button>';
      html += '      </div>';
      html += '    </div>';

      // Class Filter
      html += '    <div>';
      html += '      <label class="form-label" style="font-size:12px;">Class</label>';
      html += '      <select id="id-class-select" class="form-select" onchange="DocumentsModule.updateIDCardPreview(' + withParentPhoto + ')">';
      html += '        <option value="ALL">All Classes</option>';
      classes.forEach(function(c) {
        html += '        <option value="' + escapeHTML(c) + '">Class ' + escapeHTML(c) + '</option>';
      });
      html += '      </select>';
      html += '    </div>';

      // Section Filter
      html += '    <div>';
      html += '      <label class="form-label" style="font-size:12px;">Section</label>';
      html += '      <select id="id-section-select" class="form-select" onchange="DocumentsModule.updateIDCardPreview(' + withParentPhoto + ')">';
      html += '        <option value="ALL">All Sections</option>';
      sections.forEach(function(s) {
        html += '        <option value="' + escapeHTML(s) + '">Section ' + escapeHTML(s) + '</option>';
      });
      html += '      </select>';
      html += '    </div>';

      // Print Button
      html += '    <div>';
      html += '      <button class="btn btn-primary" style="width:100%; height:38px;" onclick="DocumentsModule.printIDCards(' + withParentPhoto + ')">';
      html += '        <span class="material-icons-round" style="font-size:16px; vertical-align:middle;">print</span> Print Batch (4 per A4)';
      html += '      </button>';
      html += '    </div>';

      html += '  </div>';
      html += '</div>';

      // Count badge & Cards Preview Grid
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">';
      html += '  <div id="id-student-count-badge" style="font-size:13px; font-weight:600; color:var(--text-secondary);">Loading ID cards...</div>';
      html += '  <div style="font-size:11px; color:var(--text-secondary);">Cards layout: 85.6mm &times; 54mm (Credit-card proportions)</div>';
      html += '</div>';

      html += '<div id="id-cards-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px; max-height:700px; overflow-y:auto; padding:4px;"></div>';

      panel.innerHTML = html;

      this.updateIDCardPreview(withParentPhoto);
    },

    getFilteredIDStudents: function() {
      var classSelect = document.getElementById('id-class-select');
      var secSelect = document.getElementById('id-section-select');
      var selectedClass = classSelect ? classSelect.value : 'ALL';
      var selectedSec = secSelect ? secSelect.value : 'ALL';

      var allStudents = getAllStudents();
      return allStudents.filter(function(st) {
        var matchClass = (selectedClass === 'ALL' || String(st.class).trim().toLowerCase() === String(selectedClass).trim().toLowerCase());
        var matchSec = (selectedSec === 'ALL' || String(st.section).trim().toLowerCase() === String(selectedSec).trim().toLowerCase());
        return matchClass && matchSec;
      });
    },

    buildIDCardHTML: function(student, withParentPhoto, isPrint) {
      var schoolName = getSchoolName();
      var logo = getSchoolLogo();
      var year = getAcademicYear();
      var sName = student.name || ((student.firstName || '') + ' ' + (student.lastName || '')).trim() || 'STUDENT NAME';
      var initials = getStudentInitials(sName);
      var roll = student.rollNumber || '—';
      var adm = student.admissionNumber || '—';
      var sClass = student.class || '—';
      var sSec = student.section || '—';
      var phone = student.parentPhone || student.phone || '—';
      var parentName = student.parentName || 'Parent / Guardian';

      var cardWidth = isPrint ? '85.6mm' : '100%';
      var cardHeight = isPrint ? '54mm' : 'auto';

      var card = '';
      card += '<div class="id-card" style="width:' + cardWidth + '; height:' + cardHeight + '; min-height:190px; border:1.5px solid #0F172A; border-radius:8px; background:#FFF; color:#0F172A; font-family:-apple-system, BlinkMacSystemFont, Roboto, sans-serif; position:relative; overflow:hidden; box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; page-break-inside:avoid; break-inside:avoid; box-shadow:' + (isPrint ? 'none' : '0 2px 8px rgba(0,0,0,0.06)') + ';">';
      
      // Card Header
      card += '  <div style="background:#0F172A; color:#FFF; padding:6px 8px; display:flex; align-items:center; gap:8px;">';
      if (logo) {
        card += '    <img src="' + logo + '" style="width:28px; height:28px; object-fit:contain; background:#FFF; border-radius:50%; padding:1px;" />';
      }
      card += '    <div style="flex:1; overflow:hidden;">';
      card += '      <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHTML(schoolName) + '</div>';
      card += '      <div style="font-size:8px; color:#94A3B8;">Academic Year: ' + escapeHTML(year) + '</div>';
      card += '    </div>';
      card += '  </div>';

      // Card Body
      card += '  <div style="padding:8px 10px; display:flex; align-items:center; gap:10px; flex:1;">';

      // Student Photo
      if (student.photoUrl) {
        card += '    <img src="' + student.photoUrl + '" style="width:40px; height:48px; object-fit:cover; border:1px solid #CBD5E1; border-radius:4px; flex-shrink:0;" />';
      } else {
        card += '    <div style="width:40px; height:48px; border:1px dashed #94A3B8; background:#F8FAFC; border-radius:4px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; flex-shrink:0;">';
        card += '      <span style="font-size:13px; font-weight:700; color:#334155; line-height:1;">' + escapeHTML(initials) + '</span>';
        card += '      <span style="font-size:7px; color:#64748B; margin-top:2px; line-height:1;">Affix Photo</span>';
        card += '    </div>';
      }

      // Middle: Student Info
      card += '    <div style="flex:1; font-size:10px; line-height:1.35; overflow:hidden;">';
      card += '      <div style="font-size:11px; font-weight:800; color:#0F172A; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHTML(sName) + '</div>';
      card += '      <div><span style="color:#64748B;">Class:</span> <b>' + escapeHTML(sClass) + '</b> &nbsp; <span style="color:#64748B;">Sec:</span> <b>' + escapeHTML(sSec) + '</b></div>';
      card += '      <div><span style="color:#64748B;">Roll No:</span> <b>' + escapeHTML(roll) + '</b></div>';
      card += '      <div><span style="color:#64748B;">Adm No:</span> <b>' + escapeHTML(adm) + '</b></div>';
      card += '      <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><span style="color:#64748B;">Ph:</span> <b>' + escapeHTML(phone) + '</b></div>';
      card += '    </div>';

      // Optional: Parent Photo Column
      if (withParentPhoto) {
        card += '    <div style="width:48px; text-align:center; flex-shrink:0;">';
        if (student.parentPhotoUrl) {
          card += '      <img src="' + student.parentPhotoUrl + '" style="width:32px; height:40px; object-fit:cover; border:1px solid #CBD5E1; border-radius:4px; margin:0 auto;" />';
        } else {
          card += '      <div style="width:32px; height:40px; border:1px dashed #94A3B8; background:#F8FAFC; border-radius:4px; margin:0 auto; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">';
          card += '        <span style="font-size:11px; font-weight:700; color:#64748B;">P</span>';
          card += '        <span style="font-size:6.5px; color:#94A3B8; line-height:1;">Parent</span>';
          card += '      </div>';
        }
        card += '      <div style="font-size:7.5px; color:#475569; font-weight:600; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:48px;">' + escapeHTML(parentName) + '</div>';
        card += '    </div>';
      }

      card += '  </div>';

      // Card Bottom Accent Bar
      card += '  <div style="background:#F1F5F9; border-top:1px solid #E2E8F0; padding:3px 8px; font-size:7.5px; color:#64748B; display:flex; justify-content:space-between; align-items:center;">';
      card += '    <span>STUDENT IDENTITY CARD</span>';
      card += '    <span style="font-weight:600; color:#0F172A;">AUTHORIZED PASS</span>';
      card += '  </div>';

      card += '</div>';

      return card;
    },

    updateIDCardPreview: function(withParentPhoto) {
      var grid = document.getElementById('id-cards-grid');
      var badge = document.getElementById('id-student-count-badge');
      if (!grid) return;

      var students = this.getFilteredIDStudents();
      if (badge) {
        badge.innerHTML = '<span class="material-icons-round" style="font-size:16px; vertical-align:middle; color:var(--accent-primary);">groups</span> <b>' + students.length + '</b> card(s) ready for preview &amp; print';
      }

      if (students.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-secondary);">No active students found matching the selected class/section.</div>';
        return;
      }

      var html = '';
      students.forEach(function(st) {
        html += DocumentsModule.buildIDCardHTML(st, withParentPhoto, false);
      });

      grid.innerHTML = html;
    },

    printIDCards: function(withParentPhoto) {
      var students = this.getFilteredIDStudents();
      if (students.length === 0) {
        SchoolApp.showToast('No students to print.', 'warning');
        return;
      }

      // 4 cards per A4 landscape page (2x2 grid)
      var pagesHTML = '';
      for (var i = 0; i < students.length; i += 4) {
        var pageCards = '';
        for (var j = 0; j < 4; j++) {
          if (students[i + j]) {
            pageCards += this.buildIDCardHTML(students[i + j], withParentPhoto, true);
          } else {
            // Empty placeholder to preserve 2x2 grid alignment
            pageCards += '<div style="width:85.6mm; height:54mm; visibility:hidden;"></div>';
          }
        }

        var pageBreak = (i + 4 < students.length) ? 'page-break' : '';
        pagesHTML += '<div class="' + pageBreak + '" style="width:100%; min-height:190mm; display:grid; grid-template-columns:repeat(2, 85.6mm); gap:6mm 10mm; justify-content:center; align-content:center; padding:8mm; box-sizing:border-box;">' + pageCards + '</div>';
      }

      this.printDocument(pagesHTML, 'landscape', '8mm');
    },

    // =========================================================================
    // SHARED PRINT VIA BLOB PATTERN
    // =========================================================================
    printDocument: function(htmlContent, orientation, pageMargin) {
      orientation = orientation || 'portrait';
      pageMargin = pageMargin || '8mm';

      var fullHtml = '<!DOCTYPE html>' +
        '<html>' +
        '<head>' +
        '  <meta charset="UTF-8">' +
        '  <title>Document Print - Paathshala ERP</title>' +
        '  <style>' +
        '    @page { size: A4 ' + orientation + '; margin: ' + pageMargin + '; }' +
        '    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }' +
        '    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; background: #FFF; }' +
        '    .no-print { display: none !important; }' +
        '    .page-break { page-break-after: always; break-after: page; }' +
        '  </style>' +
        '</head>' +
        '<body>' + htmlContent + '</body>' +
        '</html>';

      try {
        var blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var win = window.open(url, '_blank');
        if (win) {
          win.onload = function() {
            win.focus();
            setTimeout(function() {
              win.print();
              URL.revokeObjectURL(url);
            }, 300);
          };
        } else {
          // Popup blocked fallback: hidden iframe print
          var iframe = document.createElement('iframe');
          iframe.style.position = 'fixed';
          iframe.style.right = '0';
          iframe.style.bottom = '0';
          iframe.style.width = '0';
          iframe.style.height = '0';
          iframe.style.border = '0';
          document.body.appendChild(iframe);
          iframe.contentWindow.document.open();
          iframe.contentWindow.document.write(fullHtml);
          iframe.contentWindow.document.close();
          iframe.contentWindow.focus();
          setTimeout(function() {
            iframe.contentWindow.print();
            setTimeout(function() {
              document.body.removeChild(iframe);
              URL.revokeObjectURL(url);
            }, 1000);
          }, 350);
        }
      } catch (err) {
        console.error('Print generation failed:', err);
        if (window.SchoolApp && SchoolApp.showToast) {
          SchoolApp.showToast('Unable to launch print window: ' + err.message, 'error');
        }
      }
    }
  };

  // Expose to window and register with SchoolApp
  window.DocumentsModule = DocumentsModule;
  if (window.SchoolApp && SchoolApp.registerModule) {
    SchoolApp.registerModule('documents', DocumentsModule);
  }

})();
