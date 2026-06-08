'use strict';

/* ============================================================
   Shishu Vikash Mandir - Fee Management Module
   ============================================================ */

(function() {

  var state = {
    searchQuery: '',
    classFilter: 'all',
    sectionFilter: 'all',
    statusFilter: 'all', // 'all' | 'unpaid' | 'paid'
    currentPage: 1,
    perPage: 10
  };

  function getStudentFeeStats(studentId) {
    var studentFees = (SchoolApp.store.fees || []).filter(function(f) {
      return f.studentId === studentId;
    });

    var totalDues = 0;
    var totalPaid = 0;

    studentFees.forEach(function(f) {
      if (f.type === 'due') {
        totalDues += parseFloat(f.amount || 0);
      } else if (f.type === 'payment') {
        totalPaid += parseFloat(f.amount || 0);
      }
    });

    return {
      totalDues: totalDues,
      totalPaid: totalPaid,
      outstanding: totalDues - totalPaid
    };
  }

  function getFilteredStudents() {
    var students = SchoolApp.store.students || [];

    // Teacher restrictions: only assigned classes
    if (SchoolApp.isTeacher() && SchoolApp.currentUser.assignedClasses) {
      var ac = SchoolApp.currentUser.assignedClasses;
      students = students.filter(function(s) {
        return ac.some(function(c) { return c.class === s.class && c.section === s.section; });
      });
    }

    // Class filter
    if (state.classFilter !== 'all') {
      students = students.filter(function(s) { return s.class === state.classFilter; });
    }

    // Section filter
    if (state.sectionFilter !== 'all') {
      students = students.filter(function(s) { return s.section === state.sectionFilter; });
    }

    // Fee Status filter
    if (state.statusFilter !== 'all') {
      students = students.filter(function(s) {
        var stats = getStudentFeeStats(s.id);
        if (state.statusFilter === 'unpaid') {
          return stats.outstanding > 0;
        } else if (state.statusFilter === 'paid') {
          return stats.outstanding <= 0;
        }
        return true;
      });
    }

    // Search query
    if (state.searchQuery) {
      var q = state.searchQuery.toLowerCase();
      students = students.filter(function(s) {
        return (s.firstName + ' ' + s.lastName).toLowerCase().indexOf(q) !== -1 ||
               s.rollNumber.toLowerCase().indexOf(q) !== -1;
      });
    }

    return students;
  }

  function render() {
    var container = document.getElementById('page-fees');
    if (!container) return;

    var filteredStudents = getFilteredStudents();
    var isAdmin = SchoolApp.isAdmin();

    // Calculate Dashboard Stats
    var schoolDues = 0;
    var schoolPaid = 0;
    (SchoolApp.store.fees || []).forEach(function(f) {
      if (f.type === 'due') schoolDues += parseFloat(f.amount || 0);
      else if (f.type === 'payment') schoolPaid += parseFloat(f.amount || 0);
    });
    var outstandingAmt = schoolDues - schoolPaid;

    // Check if the shell layout is already rendered for the current user role
    var dataContainer = document.getElementById('fees-data-container');
    var currentRenderedRole = container.getAttribute('data-rendered-role');
    var userRole = isAdmin ? 'admin' : 'teacher';

    if (!dataContainer || currentRenderedRole !== userRole) {
      container.setAttribute('data-rendered-role', userRole);
      var shellHtml = '';

      // Page Header
      shellHtml += '<div class="page-header">';
      shellHtml += '<h2>Fee Management</h2>';
      shellHtml += '<div class="header-actions">';
      if (isAdmin) {
        shellHtml += '<button class="btn btn-primary" id="bulk-charge-fee-btn"><span class="material-icons-round">campaign</span> Bulk Charge Class</button>';
      }
      shellHtml += '</div></div>';

      // Summary Cards Grid
      shellHtml += '<div class="stats-grid">';
      shellHtml += '<div class="stat-card purple"><div class="stat-icon"><span class="material-icons-round">assignment</span></div>';
      shellHtml += '<div class="stat-info"><div class="stat-number" id="fees-dues-value">₹' + schoolDues.toLocaleString('en-IN') + '</div><div class="stat-label">Total Dues Charged</div></div></div>';
      shellHtml += '<div class="stat-card green"><div class="stat-icon"><span class="material-icons-round">check_circle</span></div>';
      shellHtml += '<div class="stat-info"><div class="stat-number" id="fees-collected-value">₹' + schoolPaid.toLocaleString('en-IN') + '</div><div class="stat-label">Total Fees Collected</div></div></div>';
      
      shellHtml += '<div class="stat-card ' + (outstandingAmt > 0 ? 'amber' : 'cyan') + '" id="fees-outstanding-card"><div class="stat-icon"><span class="material-icons-round">error</span></div>';
      shellHtml += '<div class="stat-info"><div class="stat-number" id="fees-outstanding-value">₹' + outstandingAmt.toLocaleString('en-IN') + '</div><div class="stat-label">Outstanding Balance</div></div></div>';
      shellHtml += '</div>';

      // Toolbar
      shellHtml += '<div class="toolbar">';
      shellHtml += '<div class="search-wrapper"><span class="material-icons-round">search</span>';
      shellHtml += '<input type="text" id="fees-search" placeholder="Search student by name/roll..." value="' + (state.searchQuery || '') + '">';
      shellHtml += '</div>';

      // Show Defaulters Checkbox Toggle
      shellHtml += '<div class="defaulter-toggle-wrapper" style="display:flex; align-items:center; gap:6px; margin-left: 12px; margin-right: auto;">';
      shellHtml += '<label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; font-weight:600; color:var(--text-secondary);">';
      shellHtml += '<input type="checkbox" id="defaulters-only-toggle"' + (state.statusFilter === 'unpaid' ? ' checked' : '') + ' style="width:16px; height:16px; cursor:pointer; accent-color:var(--danger);">';
      shellHtml += '<span>Show Defaulters</span>';
      shellHtml += '</label>';
      shellHtml += '</div>';

      shellHtml += '<div class="filter-group">';
      
      // Class Select
      shellHtml += '<select class="form-select" id="fees-class-filter"><option value="all">All Classes</option>';
      (SchoolApp.store.settings.classes || []).forEach(function(c) {
        shellHtml += '<option value="' + c + '"' + (state.classFilter === c ? ' selected' : '') + '>' + (['Nursery','LKG','UKG'].indexOf(c) !== -1 ? c : 'Class ' + c) + '</option>';
      });
      shellHtml += '</select>';

      // Section Select
      shellHtml += '<select class="form-select" id="fees-section-filter"><option value="all">All Sections</option>';
      (SchoolApp.store.settings.sections || []).forEach(function(s) {
        shellHtml += '<option value="' + s + '"' + (state.sectionFilter === s ? ' selected' : '') + '>Section ' + s + '</option>';
      });
      shellHtml += '</select>';

      // Fee Status Select
      shellHtml += '<select class="form-select" id="fees-status-filter">';
      shellHtml += '<option value="all"' + (state.statusFilter === 'all' ? ' selected' : '') + '>All Statuses</option>';
      shellHtml += '<option value="unpaid"' + (state.statusFilter === 'unpaid' ? ' selected' : '') + '>Outstanding Balance</option>';
      shellHtml += '<option value="paid"' + (state.statusFilter === 'paid' ? ' selected' : '') + '>Fully Paid</option>';
      shellHtml += '</select>';

      shellHtml += '</div></div>';

      // Dynamic Data Container Placeholder
      shellHtml += '<div id="fees-data-container"></div>';

      container.innerHTML = shellHtml;
      attachStaticEvents();
      dataContainer = document.getElementById('fees-data-container');
    }

    // Programmatically sync stats card text contents and styles
    var duesVal = document.getElementById('fees-dues-value');
    if (duesVal) duesVal.textContent = '₹' + schoolDues.toLocaleString('en-IN');
    
    var colVal = document.getElementById('fees-collected-value');
    if (colVal) colVal.textContent = '₹' + schoolPaid.toLocaleString('en-IN');
    
    var outVal = document.getElementById('fees-outstanding-value');
    if (outVal) outVal.textContent = '₹' + outstandingAmt.toLocaleString('en-IN');
    
    var outCard = document.getElementById('fees-outstanding-card');
    if (outCard) {
      outCard.className = 'stat-card ' + (outstandingAmt > 0 ? 'amber' : 'cyan');
    }

    // Keep inputs/dropdowns updated in sync with state without full re-render
    var searchInput = document.getElementById('fees-search');
    if (searchInput && searchInput.value !== state.searchQuery) {
      searchInput.value = state.searchQuery;
    }
    var defaulterToggle = document.getElementById('defaulters-only-toggle');
    if (defaulterToggle) {
      defaulterToggle.checked = (state.statusFilter === 'unpaid');
    }
    var classFilter = document.getElementById('fees-class-filter');
    if (classFilter && classFilter.value !== state.classFilter) {
      classFilter.value = state.classFilter;
    }
    var sectionFilter = document.getElementById('fees-section-filter');
    if (sectionFilter && sectionFilter.value !== state.sectionFilter) {
      sectionFilter.value = state.sectionFilter;
    }
    var statusFilter = document.getElementById('fees-status-filter');
    if (statusFilter && statusFilter.value !== state.statusFilter) {
      statusFilter.value = state.statusFilter;
    }

    // Pagination calculations
    var totalPages = Math.ceil(filteredStudents.length / state.perPage);
    if (state.currentPage > totalPages && totalPages > 0) state.currentPage = totalPages;
    var start = (state.currentPage - 1) * state.perPage;
    var pageStudents = filteredStudents.slice(start, start + state.perPage);

    // Table list dynamic render
    var html = '';
    if (pageStudents.length > 0) {
      html += '<div class="table-container"><table class="data-table"><thead><tr>';
      html += '<th>Student</th><th>Class</th><th>Roll No.</th><th>Total Dues</th><th>Total Paid</th><th>Outstanding</th><th>Actions</th>';
      html += '</tr></thead><tbody>';

      pageStudents.forEach(function(s) {
        var initials = SchoolApp.getInitials(s.firstName, s.lastName);
        var color = SchoolApp.getAvatarColor(s.firstName + s.lastName);
        var stats = getStudentFeeStats(s.id);

        html += '<tr>';
        html += '<td><div class="table-student-name"><div class="avatar avatar-sm" data-color="' + color + '">' + initials + '</div><div><strong>' + s.firstName + ' ' + s.lastName + '</strong></div></div></td>';
        html += '<td><span class="badge badge-info">' + s.class + '-' + s.section + '</span></td>';
        html += '<td>' + s.rollNumber + '</td>';
        html += '<td>₹' + stats.totalDues.toLocaleString('en-IN') + '</td>';
        html += '<td>₹' + stats.totalPaid.toLocaleString('en-IN') + '</td>';
        
        var badgeColor = stats.outstanding > 0 ? 'badge-danger' : 'badge-success';
        html += '<td><span class="badge ' + badgeColor + '">₹' + stats.outstanding.toLocaleString('en-IN') + '</span></td>';

        html += '<td><div class="table-actions">';
        html += '<button class="btn-icon fees-collect-btn" data-id="' + s.id + '" title="Record Fee Payment" style="color:var(--success)"><span class="material-icons-round">payments</span></button>';
        html += '<button class="btn-icon fees-ledger-btn" data-id="' + s.id + '" title="View Fee Ledger" style="color:var(--accent-secondary)"><span class="material-icons-round">receipt_long</span></button>';
        if (isAdmin) {
          html += '<button class="btn-icon fees-charge-btn" data-id="' + s.id + '" title="Add Custom Charge/Fine" style="color:var(--accent-primary-light)"><span class="material-icons-round">add_card</span></button>';
        }
        html += '</div></td></tr>';
      });

      html += '</tbody></table></div>';

      // Pagination
      html += '<div class="pagination">';
      html += '<span class="pagination-info">Showing ' + (start + 1) + ' to ' + Math.min(start + state.perPage, filteredStudents.length) + ' of ' + filteredStudents.length + ' students</span>';
      html += '<button class="pagination-btn" ' + (state.currentPage <= 1 ? 'disabled' : '') + ' data-page="prev"><span class="material-icons-round">chevron_left</span></button>';
      for (var i = 1; i <= totalPages; i++) {
        html += '<button class="pagination-btn' + (i === state.currentPage ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
      }
      html += '<button class="pagination-btn" ' + (state.currentPage >= totalPages ? 'disabled' : '') + ' data-page="next"><span class="material-icons-round">chevron_right</span></button>';
      html += '</div>';

    } else {
      html += '<div class="empty-state"><span class="material-icons-round">payments</span><h3>No Students Found</h3><p>No student match your current filters.</p></div>';
    }

    dataContainer.innerHTML = html;
    attachDynamicEvents();
  }

  function getStudentLedger(studentId) {
    var studentFees = (SchoolApp.store.fees || []).filter(function(f) {
      return f.studentId === studentId;
    });

    // Sort chronologically
    studentFees.sort(function(a, b) {
      return new Date(a.date) - new Date(b.date);
    });

    var runningBalance = 0;
    var transactions = studentFees.map(function(t) {
      if (t.type === 'due') {
        runningBalance += parseFloat(t.amount || 0);
      } else {
        runningBalance -= parseFloat(t.amount || 0);
      }

      var headName = '';
      if (t.type === 'due') {
        var fh = (SchoolApp.store.feeHeads || []).find(function(x) { return x.id === t.feeHeadId; });
        headName = fh ? fh.name : 'Custom Charge';
      }

      return {
        id: t.id,
        date: t.date,
        type: t.type,
        amount: parseFloat(t.amount || 0),
        description: t.description || (t.type === 'due' ? headName : 'Payment (' + t.mode + ')'),
        mode: t.mode,
        remarks: t.remarks,
        balance: runningBalance
      };
    });

    var stats = getStudentFeeStats(studentId);

    return {
      transactions: transactions,
      totalDues: stats.totalDues,
      totalPaid: stats.totalPaid,
      outstanding: stats.outstanding
    };
  }

  function sendWhatsAppReceipt(studentId, amount, mode) {
    var s = SchoolApp.store.students.find(function(x) { return x.id === studentId; });
    if (!s) return;

    var parentPhone = s.parentPhone ? s.parentPhone.trim() : '';
    
    // Clean phone number (keep only digits)
    var cleanedPhone = parentPhone.replace(/\D/g, '');
    
    if (cleanedPhone.length < 10) {
      // Fallback Logic: Prompt admin to enter a 10-digit number
      var newPhone = prompt('Parent phone number is missing or invalid. Please enter a 10-digit mobile number:', parentPhone || '');
      if (newPhone === null) return; // Admin cancelled
      
      newPhone = newPhone.replace(/\D/g, '');
      if (newPhone.length !== 10) {
        SchoolApp.showToast('Please enter a valid 10-digit mobile number.', 'error');
        return;
      }
      cleanedPhone = newPhone;
    }
    
    // Ensure 10 digit numbers are prepended with country code (91 for India)
    if (cleanedPhone.length === 10) {
      cleanedPhone = '91' + cleanedPhone;
    }
    
    var studentName = s.firstName + ' ' + s.lastName;
    var displayClass = ['Nursery','LKG','UKG'].indexOf(s.class) !== -1 ? s.class : 'Class ' + s.class;
    
    var pMode = mode || 'Cash';
    var message = 
      'Namaste! 🙏\n' +
      'Aapke bacche ' + studentName + ' (Class: ' + displayClass + ') ki school fee jama ho gayi hai.\n\n' +
      'Jama ki gayi rashi (Amount): ₹' + amount + ' via ' + pMode + ' ✅\n\n' +
      'English: Dear Parent, we have received ₹' + amount + ' via ' + pMode + ' for ' + studentName + '\'s fee.\n\n' +
      'Dhanyawad!\n\n' +
      'Shishu Vikash Mandir 🏫';
    
    var url = 'https://wa.me/' + cleanedPhone + '?text=' + encodeURIComponent(message);
    window.open(url, '_blank');
  }

  function showLedgerModal(studentId) {
    var s = SchoolApp.store.students.find(function(x) { return x.id === studentId; });
    if (!s) return;

    var ledger = getStudentLedger(studentId);
    var isAdmin = SchoolApp.isAdmin();

    var bodyHTML = '<div class="student-ledger-view">';

    // Summary mini cards
    bodyHTML += '<div class="stats-grid mb-3" style="grid-template-columns: repeat(3, 1fr); gap: 12px">';
    bodyHTML += '<div class="stat-card purple" style="padding:14px"><div class="stat-info"><div class="stat-number" style="font-size:18px">₹' + ledger.totalDues.toLocaleString('en-IN') + '</div><div class="stat-label" style="font-size:11px">Total Dues</div></div></div>';
    bodyHTML += '<div class="stat-card green" style="padding:14px"><div class="stat-info"><div class="stat-number" style="font-size:18px">₹' + ledger.totalPaid.toLocaleString('en-IN') + '</div><div class="stat-label" style="font-size:11px">Total Paid</div></div></div>';
    
    var balColor = ledger.outstanding > 0 ? 'amber' : 'cyan';
    bodyHTML += '<div class="stat-card ' + balColor + '" style="padding:14px"><div class="stat-info"><div class="stat-number" style="font-size:18px">₹' + ledger.outstanding.toLocaleString('en-IN') + '</div><div class="stat-label" style="font-size:11px">Outstanding</div></div></div>';
    bodyHTML += '</div>';

    // Ledger transactions table
    if (ledger.transactions.length > 0) {
      bodyHTML += '<div class="table-container" style="max-height: 300px; overflow-y: auto;"><table class="data-table"><thead><tr>';
      bodyHTML += '<th>Date</th><th>Description</th><th>Type</th><th>Amount</th><th>Running Balance</th><th>Action</th>';
      bodyHTML += '</tr></thead><tbody>';

      ledger.transactions.forEach(function(t) {
        bodyHTML += '<tr>';
        bodyHTML += '<td style="font-size:12px">' + t.date + '</td>';
        bodyHTML += '<td><strong>' + t.description + '</strong>' + (t.remarks ? '<br><span style="font-size:11px;color:var(--text-muted)">' + t.remarks + '</span>' : '') + '</td>';
        
        var typeBadge = t.type === 'due' ? 'badge-danger' : 'badge-success';
        bodyHTML += '<td><span class="badge ' + typeBadge + '">' + (t.type === 'due' ? 'Due' : 'Paid') + '</span></td>';
        
        bodyHTML += '<td>₹' + t.amount.toLocaleString('en-IN') + '</td>';
        bodyHTML += '<td><strong>₹' + t.balance.toLocaleString('en-IN') + '</strong></td>';
        
        bodyHTML += '<td><div class="table-actions" style="display:flex; gap:4px; align-items:center;">';
        if (t.type === 'payment') {
          bodyHTML += '<button class="btn-icon fees-whatsapp-btn" data-student-id="' + studentId + '" data-amount="' + t.amount + '" data-mode="' + (t.mode || 'Cash') + '" title="Send WhatsApp Receipt" style="color:#25D366; min-width:32px; min-height:32px;"><span class="material-icons-round" style="font-size:18px">send</span></button>';
        }
        if (isAdmin) {
          bodyHTML += '<button class="btn-icon delete-ledger-txn-btn" data-id="' + t.id + '" data-student-id="' + studentId + '" style="color:var(--danger); min-width:32px; min-height:32px;"><span class="material-icons-round" style="font-size:16px">delete</span></button>';
        }
        bodyHTML += '</div></td>';
        bodyHTML += '</tr>';
      });

      bodyHTML += '</tbody></table></div>';
    } else {
      bodyHTML += '<div class="empty-state" style="padding:24px"><span class="material-icons-round">receipt_long</span><h3>Ledger Empty</h3><p>No fee transactions recorded for this student.</p></div>';
    }

    bodyHTML += '</div>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>';
    if (ledger.outstanding > 0) {
      footerHTML += '<button class="btn btn-primary" id="ledger-modal-collect-btn"><span class="material-icons-round">payments</span> Record Payment</button>';
    }

    SchoolApp.showModal(s.firstName + ' ' + s.lastName + ' - Fee Ledger (Bahi Khata)', bodyHTML, footerHTML);

    // Event listener for ledger modals
    var colBtn = document.getElementById('ledger-modal-collect-btn');
    if (colBtn) {
      colBtn.addEventListener('click', function() {
        SchoolApp.closeModal();
        setTimeout(function() { showPaymentModal(studentId); }, 200);
      });
    }

    // Ledger deletion click handlers
    document.querySelectorAll('.delete-ledger-txn-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var txnId = this.getAttribute('data-id');
        var sId = this.getAttribute('data-student-id');
        
        SchoolApp.showConfirm('Delete this transaction from the ledger? This will permanently recalculate outstanding balance.', function() {
          var idx = (SchoolApp.store.fees || []).findIndex(function(f) { return f.id === txnId; });
          if (idx !== -1) {
            SchoolApp.store.fees.splice(idx, 1);
            SchoolApp.save();
            SchoolApp.closeModal();
            SchoolApp.showToast('Transaction removed successfully!', 'success');
            setTimeout(function() { showLedgerModal(sId); }, 200);
            render();
          }
        });
      });
    });
  }

  function showPaymentModal(studentId) {
    var s = SchoolApp.store.students.find(function(x) { return x.id === studentId; });
    if (!s) return;

    var stats = getStudentFeeStats(studentId);

    var bodyHTML = '<form id="collect-payment-form" class="form-grid">';
    
    // Amount to pay
    bodyHTML += '<div class="form-group"><label class="form-label">Payment Amount (₹) *</label>';
    bodyHTML += '<input type="number" id="pay-amount" class="form-input" value="' + stats.outstanding + '" min="1" step="1" max="' + stats.outstanding + '" required>';
    bodyHTML += '</div>';

    // Payment Mode
    bodyHTML += '<div class="form-group"><label class="form-label">Payment Mode *</label>';
    bodyHTML += '<select id="pay-mode" class="form-select" required><option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Bank Transfer">Bank Transfer</option></select>';
    bodyHTML += '</div>';

    // Payment Date
    var todayStr = new Date().toISOString().split('T')[0];
    bodyHTML += '<div class="form-group"><label class="form-label">Date *</label>';
    bodyHTML += '<input type="date" id="pay-date" class="form-input" value="' + todayStr + '" required>';
    bodyHTML += '</div>';

    // Remarks
    bodyHTML += '<div class="form-group full-width"><label class="form-label">Remarks / Notes</label>';
    bodyHTML += '<input type="text" id="pay-remarks" class="form-input" placeholder="e.g. Receipt #1234 or UPI Txn ref">';
    bodyHTML += '</div>';

    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="collect-payment-save-btn"><span class="material-icons-round">payments</span> Record Payment</button>';

    SchoolApp.showModal('Record Payment - ' + s.firstName + ' ' + s.lastName, bodyHTML, footerHTML);

    var saveBtn = document.getElementById('collect-payment-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var amt = parseFloat(document.getElementById('pay-amount').value);
        var mode = document.getElementById('pay-mode').value;
        var date = document.getElementById('pay-date').value;
        var remarks = document.getElementById('pay-remarks').value.trim();

        if (isNaN(amt) || amt <= 0) {
          SchoolApp.showToast('Please enter a valid payment amount.', 'error');
          return;
        }
        if (!date) {
          SchoolApp.showToast('Please select a payment date.', 'error');
          return;
        }

        if (!SchoolApp.store.fees) SchoolApp.store.fees = [];

        SchoolApp.store.fees.push({
          id: SchoolApp.generateId(),
          studentId: studentId,
          type: 'payment',
          amount: amt,
          date: date,
          mode: mode,
          remarks: remarks,
          timestamp: new Date().toISOString()
        });

        SchoolApp.save();
        SchoolApp.closeModal();
        SchoolApp.showToast('Payment of ₹' + amt.toLocaleString('en-IN') + ' recorded successfully!', 'success');
        render();

        // Gracefully prompt parent confirmation for WhatsApp receipt
        setTimeout(function() {
          SchoolApp.showConfirm('Payment of ₹' + amt.toLocaleString('en-IN') + ' recorded successfully! Would you like to send a WhatsApp Fee Receipt notification to the parent?', function() {
            sendWhatsAppReceipt(studentId, amt, mode);
          });
        }, 300);
      });
    }
  }

  function showSingleChargeModal(studentId) {
    var s = SchoolApp.store.students.find(function(x) { return x.id === studentId; });
    if (!s) return;

    var feeHeads = SchoolApp.store.feeHeads || [];

    var bodyHTML = '<form id="charge-fee-form" class="form-grid">';
    
    // Fee Head Dropdown
    bodyHTML += '<div class="form-group"><label class="form-label">Fee Head Type *</label>';
    bodyHTML += '<select id="charge-feehead" class="form-select">';
    feeHeads.forEach(function(fh) {
      bodyHTML += '<option value="' + fh.id + '">' + fh.name + '</option>';
    });
    bodyHTML += '<option value="custom">Custom Non-Categorized</option>';
    bodyHTML += '</select></div>';

    // Amount
    bodyHTML += '<div class="form-group"><label class="form-label">Charge Amount (₹) *</label>';
    bodyHTML += '<input type="number" id="charge-amount" class="form-input" min="1" step="1" required>';
    bodyHTML += '</div>';

    // Due Date
    var todayStr = new Date().toISOString().split('T')[0];
    bodyHTML += '<div class="form-group"><label class="form-label">Billing Date *</label>';
    bodyHTML += '<input type="date" id="charge-date" class="form-input" value="' + todayStr + '" required>';
    bodyHTML += '</div>';

    // Period / Description
    bodyHTML += '<div class="form-group full-width"><label class="form-label">Billing Period / Description *</label>';
    bodyHTML += '<input type="text" id="charge-desc" class="form-input" placeholder="e.g. Monthly Tuition - June 2026 or Science Lab Fee" list="fee-head-suggestions" required>';
    bodyHTML += '</div>';

    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="charge-fee-save-btn"><span class="material-icons-round">add_card</span> Charge Fee</button>';

    SchoolApp.showModal('Charge Custom Fee - ' + s.firstName + ' ' + s.lastName, bodyHTML, footerHTML);

    // Auto-complete default fee head amounts on select change
    var fhSelect = document.getElementById('charge-feehead');
    var amtInput = document.getElementById('charge-amount');
    
    function updateDefaultAmount() {
      var headId = fhSelect.value;
      if (headId === 'custom') return;
      var classFees = (SchoolApp.store.feeStructures || {})[s.class] || {};
      var defaultAmt = classFees[headId] || '0';
      amtInput.value = defaultAmt;
    }
    
    if (fhSelect && amtInput) {
      fhSelect.addEventListener('change', updateDefaultAmount);
      updateDefaultAmount(); // Run once initially
    }

    var saveBtn = document.getElementById('charge-fee-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var headId = document.getElementById('charge-feehead').value;
        var amt = parseFloat(document.getElementById('charge-amount').value);
        var date = document.getElementById('charge-date').value;
        var desc = document.getElementById('charge-desc').value.trim();

        if (isNaN(amt) || amt <= 0) {
          SchoolApp.showToast('Please enter a valid charge amount.', 'error');
          return;
        }
        if (!date) {
          SchoolApp.showToast('Please select a billing date.', 'error');
          return;
        }
        if (!desc) {
          SchoolApp.showToast('Please enter a description/period.', 'error');
          return;
        }

        if (!SchoolApp.store.fees) SchoolApp.store.fees = [];

        SchoolApp.store.fees.push({
          id: SchoolApp.generateId(),
          studentId: studentId,
          type: 'due',
          feeHeadId: headId === 'custom' ? null : headId,
          amount: amt,
          date: date,
          description: desc
        });

        SchoolApp.save();
        SchoolApp.closeModal();
        SchoolApp.showToast('Fee charged to ledger successfully!', 'success');
        render();
      });
    }
  }

  function showBulkChargeModal() {
    var feeHeads = SchoolApp.store.feeHeads || [];
    var classes = SchoolApp.store.settings.classes || [];

    var bodyHTML = '<form id="bulk-charge-form" class="form-grid">';
    
    // Select Class
    bodyHTML += '<div class="form-group"><label class="form-label">Target Class *</label>';
    bodyHTML += '<select id="bulk-class" class="form-select">';
    bodyHTML += '<option value="all">All Classes (Entire School)</option>';
    classes.forEach(function(c) {
      bodyHTML += '<option value="' + c + '">' + (['Nursery','LKG','UKG'].indexOf(c) !== -1 ? c : 'Class ' + c) + '</option>';
    });
    bodyHTML += '</select></div>';

    // Fee Head
    bodyHTML += '<div class="form-group"><label class="form-label">Fee Head Type *</label>';
    bodyHTML += '<select id="bulk-feehead" class="form-select">';
    feeHeads.forEach(function(fh) {
      bodyHTML += '<option value="' + fh.id + '">' + fh.name + '</option>';
    });
    bodyHTML += '</select></div>';

    // Billing Date
    var todayStr = new Date().toISOString().split('T')[0];
    bodyHTML += '<div class="form-group"><label class="form-label">Billing Date *</label>';
    bodyHTML += '<input type="date" id="bulk-date" class="form-input" value="' + todayStr + '" required>';
    bodyHTML += '</div>';

    // Period / Description
    bodyHTML += '<div class="form-group"><label class="form-label">Billing Period / Description *</label>';
    bodyHTML += '<input type="text" id="bulk-desc" class="form-input" placeholder="e.g. Monthly Tuition - June 2026" list="fee-head-suggestions" required>';
    bodyHTML += '</div>';

    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="bulk-charge-save-btn"><span class="material-icons-round">campaign</span> Generate Dues</button>';

    SchoolApp.showModal('Bulk Charge Class Dues', bodyHTML, footerHTML);

    var saveBtn = document.getElementById('bulk-charge-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var cls = document.getElementById('bulk-class').value;
        var headId = document.getElementById('bulk-feehead').value;
        var date = document.getElementById('bulk-date').value;
        var desc = document.getElementById('bulk-desc').value.trim();

        if (!date) {
          SchoolApp.showToast('Please select a billing date.', 'error');
          return;
        }
        if (!desc) {
          SchoolApp.showToast('Please enter a description/period.', 'error');
          return;
        }

        // Get students to charge
        var students = SchoolApp.store.students || [];
        if (cls !== 'all') {
          students = students.filter(function(s) { return s.class === cls; });
        }

        if (students.length === 0) {
          SchoolApp.showToast('No students found in selected class(es).', 'error');
          return;
        }

        if (!SchoolApp.store.fees) SchoolApp.store.fees = [];

        var chargedCount = 0;
        SchoolApp.createRestorePoint('Auto-Backup before Bulk Fee Generation for Class ' + cls);

        students.forEach(function(s) {
          var classFees = (SchoolApp.store.feeStructures || {})[s.class] || {};
          var defaultAmt = parseFloat(classFees[headId] || 0);
          
          if (defaultAmt > 0) {
            SchoolApp.store.fees.push({
              id: SchoolApp.generateId(),
              studentId: s.id,
              type: 'due',
              feeHeadId: headId,
              amount: defaultAmt,
              date: date,
              description: desc
            });
            chargedCount++;
          }
        });

        if (chargedCount > 0) {
          SchoolApp.save();
          SchoolApp.closeModal();
          SchoolApp.showToast('Charged default fee dues to ' + chargedCount + ' students successfully!', 'success');
          render();
        } else {
          SchoolApp.showToast('No student charged. Make sure default fees are configured in Fee Setup settings.', 'error');
        }
      });
    }
  }

  function attachStaticEvents() {
    // Search
    var searchInput = document.getElementById('fees-search');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        state.searchQuery = this.value;
        state.currentPage = 1;
        render();
      });
    }

    // Defaulters Filter Checkbox Toggle
    var defaulterToggle = document.getElementById('defaulters-only-toggle');
    if (defaulterToggle) {
      defaulterToggle.addEventListener('change', function() {
        state.statusFilter = this.checked ? 'unpaid' : 'all';
        state.currentPage = 1;
        render();
      });
    }

    // Class Filter
    var classFilter = document.getElementById('fees-class-filter');
    if (classFilter) {
      classFilter.addEventListener('change', function() {
        state.classFilter = this.value;
        state.currentPage = 1;
        render();
      });
    }

    // Section Filter
    var sectionFilter = document.getElementById('fees-section-filter');
    if (sectionFilter) {
      sectionFilter.addEventListener('change', function() {
        state.sectionFilter = this.value;
        state.currentPage = 1;
        render();
      });
    }

    // Fee Status Filter
    var statusFilter = document.getElementById('fees-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', function() {
        state.statusFilter = this.value;
        state.currentPage = 1;
        render();
      });
    }

    // Bulk Charge
    var bulkChargeBtn = document.getElementById('bulk-charge-fee-btn');
    if (bulkChargeBtn) {
      bulkChargeBtn.addEventListener('click', showBulkChargeModal);
    }
  }

  function attachDynamicEvents() {
    // Record Payment
    document.querySelectorAll('.fees-collect-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        showPaymentModal(this.getAttribute('data-id'));
      });
    });

    // Send WhatsApp Receipt
    document.querySelectorAll('.fees-whatsapp-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var studentId = this.getAttribute('data-student-id');
        var amount = parseFloat(this.getAttribute('data-amount') || 0);
        var mode = this.getAttribute('data-mode') || 'Cash';
        sendWhatsAppReceipt(studentId, amount, mode);
      });
    });

    // View Ledger
    document.querySelectorAll('.fees-ledger-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        showLedgerModal(this.getAttribute('data-id'));
      });
    });

    // Charge Custom Fee
    document.querySelectorAll('.fees-charge-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        showSingleChargeModal(this.getAttribute('data-id'));
      });
    });

    // Pagination clicks
    document.querySelectorAll('.pagination-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var page = this.getAttribute('data-page');
        if (page === 'prev') {
          state.currentPage--;
        } else if (page === 'next') {
          state.currentPage++;
        } else {
          state.currentPage = parseInt(page);
        }
        render();
      });
    });
  }

  // Register Module
  SchoolApp.registerModule('fees', {
    init: function() {},
    render: render
  });

})();
