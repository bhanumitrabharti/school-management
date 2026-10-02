'use strict';

/* ============================================================
   Shishu Vikash Mandir - Student Management Module
   ============================================================ */

(function() {

  var state = {
    searchQuery: '',
    classFilter: 'all',
    sectionFilter: 'all',
    statusFilter: 'all',
    currentPage: 1,
    perPage: 10,
    selectedIds: [],
    editingStudent: null
  };

  function getStudentFullName(student) {
    if (!student) return 'Unknown';
    if (student.name && String(student.name).trim()) return String(student.name).trim();
    if (student.firstName || student.lastName) {
      return ((student.firstName || '') + ' ' + (student.lastName || '')).trim();
    }
    return 'Unknown';
  }

  var _migratedSchoolId = null;

  function migrateStudentNames() {
    var currentSchoolId = (SchoolApp.store && SchoolApp.store.currentSchoolId) || 'default';
    if (_migratedSchoolId === currentSchoolId) return;

    var students = SchoolApp.store.students || [];
    var changed = false;

    students.forEach(function(s) {
      if (!s) return;

      // 1. Derive fullName if missing but firstName/lastName exist
      if (!s.name && (s.firstName || s.lastName)) {
        var fullName = getStudentFullName(s);
        if (s.name !== fullName) {
          s.name = fullName;
          changed = true;
        }
      }

      // 2. Derive firstName and lastName from name if missing/empty
      if (s.name && (s.firstName === undefined || s.lastName === undefined || (!s.firstName && !s.lastName))) {
        var parts = s.name.trim().split(/\s+/);
        var newFirst = parts[0] || '';
        var newLast = parts.slice(1).join(' ') || '';
        if (s.firstName !== newFirst || s.lastName !== newLast) {
          s.firstName = newFirst;
          s.lastName = newLast;
          changed = true;
        }
      }

      // 3. Ensure firstName & lastName are never undefined or null
      if (s.firstName === undefined || s.firstName === null) {
        s.firstName = s.name || '';
        changed = true;
      }
      if (s.lastName === undefined || s.lastName === null) {
        s.lastName = '';
        changed = true;
      }
    });

    _migratedSchoolId = currentSchoolId;

    if (changed) {
      SchoolApp.save(true); // Bypass loader for silent background migration
    }
  }

  function getStudentAvatar(student, size) {
    size = size || 40;
    if (student && student.photoUrl) {
      return '<img src="' + student.photoUrl + '" style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;" />';
    }
    var name = getStudentFullName(student);
    var initials = name.split(" ").filter(Boolean).map(function(w) { return w[0]; }).slice(0, 2).join("").toUpperCase();
    var colors = ["#e74c3c","#3498db","#2ecc71","#9b59b6","#f39c12","#1abc9c"];
    var color = colors[name.charCodeAt(0) % colors.length] || colors[0];
    return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + color + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:' + Math.round(size*0.35) + 'px;">' + initials + '</div>';
  }

  function getFilteredStudents() {
    var students = SchoolApp.store.students || [];

    // Teacher: only show assigned classes (combining classTeacherOf and subjectTeacherOf)
    if (SchoolApp.isTeacher()) {
      var ct = SchoolApp.currentUser.classTeacherOf || [];
      var st = SchoolApp.currentUser.subjectTeacherOf || [];
      students = students.filter(function(s) {
        var studentClass = String(s.class).replace(/^class\s+/i, '').trim().toLowerCase();
        var studentSection = String(s.section).trim().toLowerCase();

        var isCt = ct.some(function(item) {
          var itemClass = String(item.class).replace(/^class\s+/i, '').trim().toLowerCase();
          var itemSection = String(item.section).trim().toLowerCase();
          return itemClass === studentClass && itemSection === studentSection;
        });
        var isSt = st.some(function(item) {
          var itemClass = String(item.class).replace(/^class\s+/i, '').trim().toLowerCase();
          var itemSection = String(item.section).trim().toLowerCase();
          return itemClass === studentClass && itemSection === studentSection;
        });
        return isCt || isSt;
      });
    }

    // Apply filters
    if (state.classFilter !== 'all') {
      var filterClass = String(state.classFilter).replace(/^class\s+/i, '').trim().toLowerCase();
      students = students.filter(function(s) {
        var studentClass = String(s.class).replace(/^class\s+/i, '').trim().toLowerCase();
        return studentClass === filterClass;
      });
    }
    if (state.sectionFilter !== 'all') {
      var filterSection = String(state.sectionFilter).trim().toLowerCase();
      students = students.filter(function(s) {
        return String(s.section).trim().toLowerCase() === filterSection;
      });
    }
    if (state.statusFilter !== 'all') {
      students = students.filter(function(s) { return s.status === state.statusFilter; });
    }

    // Search
    if (state.searchQuery) {
      var q = state.searchQuery.toLowerCase();
      students = students.filter(function(s) {
        return getStudentFullName(s).toLowerCase().indexOf(q) !== -1 ||
               (s.rollNumber && s.rollNumber.toLowerCase().indexOf(q) !== -1) ||
               (s.parentName && s.parentName.toLowerCase().indexOf(q) !== -1);
      });
    }

    return students;
  }

  function render() {
    var container = document.getElementById('page-students');
    if (!container) return;

    migrateStudentNames();

    if (SchoolApp.preselectedStudent) {
      var ps = SchoolApp.preselectedStudent;
      state.searchQuery = ps.rollNumber || getStudentFullName(ps);
      state.classFilter = 'all';
      state.sectionFilter = 'all';
      state.statusFilter = 'all';
      state.currentPage = 1;
      SchoolApp.preselectedStudent = null; // clear after using
    }

    if (!window.assertSchoolIsolation(SchoolApp.store.students, SchoolApp.store.currentSchoolId)) {
      console.error("[SECURITY] Data isolation breach detected in Students Tab!");
      SchoolApp.showToast("Security error. Please logout and login again.", "error");
      SchoolApp.logout();
      return;
    }

    var settings = SchoolApp.store.settings || {};
    var classes = settings.classes || (settings.schoolInfo && settings.schoolInfo.classes) || [];
    var rawSections = settings.sections || {};
    var sections = [];
    if (Array.isArray(rawSections)) {
      sections = rawSections;
    } else if (typeof rawSections === 'object') {
      var allSecs = new Set();
      Object.values(rawSections).forEach(function(arr) {
        if (Array.isArray(arr)) arr.forEach(function(s) { allSecs.add(s); });
      });
      sections = Array.from(allSecs);
    }

    // Filter classes and sections for teacher to prevent bypassing filters
    if (SchoolApp.isTeacher()) {
      var ct = SchoolApp.currentUser.classTeacherOf || [];
      var st = SchoolApp.currentUser.subjectTeacherOf || [];
      classes = classes.filter(function(c) {
        var inCt = ct.some(function(item) { return String(item.class).toLowerCase().trim() === String(c).toLowerCase().trim(); });
        var inSt = st.some(function(item) { return String(item.class).toLowerCase().trim() === String(c).toLowerCase().trim(); });
        return inCt || inSt;
      });
      sections = sections.filter(function(s) {
        var inCt = ct.some(function(item) { return String(item.section).toLowerCase().trim() === String(s).toLowerCase().trim(); });
        var inSt = st.some(function(item) { return String(item.section).toLowerCase().trim() === String(s).toLowerCase().trim(); });
        return inCt || inSt;
      });
    }

    var isAdmin = SchoolApp.isAdmin();

    // Check if the shell layout is already rendered for the current user role
    var dataContainer = document.getElementById('students-data-container');
    var currentRenderedRole = container.getAttribute('data-rendered-role');
    var userRole = isAdmin ? 'admin' : 'teacher';

    if (!dataContainer || currentRenderedRole !== userRole) {
      container.setAttribute('data-rendered-role', userRole);
      var shellHtml = '';

      // Page Header
      shellHtml += '<div class="page-header">';
      var totalCount = (SchoolApp.store.students || []).length;
      shellHtml += '<h2><span class="material-icons-round">school</span> Student Management <span class="badge badge-purple" id="students-total-badge">' + totalCount + '</span></h2>';
      shellHtml += '<div class="header-actions">';
      var canAdd = isAdmin && SchoolApp.checkFeatureAccess('students');
      if (canAdd) {
        shellHtml += '<button class="btn btn-secondary btn-sm" id="student-template-btn"><span class="material-icons-round">description</span> Download Template</button>';
        shellHtml += '<button class="btn btn-secondary btn-sm" id="student-import-btn"><span class="material-icons-round">upload_file</span> Import</button>';
      }
      shellHtml += '<button class="btn btn-secondary btn-sm" id="student-export-btn"><span class="material-icons-round">download</span> Export</button>';
      if (canAdd) {
        shellHtml += '<button class="btn btn-primary" id="student-add-btn"><span class="material-icons-round">add</span> Add Student</button>';
      }
      shellHtml += '</div></div>';

      // Toolbar
      shellHtml += '<div class="toolbar">';
      shellHtml += '<div class="search-wrapper"><span class="material-icons-round">search</span><input type="text" id="student-search" placeholder="Search students..." value="' + (state.searchQuery || '') + '"></div>';
      shellHtml += '<div class="filter-group">';
      shellHtml += '<select class="form-select" id="student-class-filter"><option value="all">All Classes</option>';
      classes.forEach(function(c) { shellHtml += '<option value="' + c + '"' + (state.classFilter === c ? ' selected' : '') + '>Class ' + c + '</option>'; });
      shellHtml += '</select>';
      shellHtml += '<select class="form-select" id="student-section-filter"><option value="all">All Sections</option>';
      sections.forEach(function(s) { shellHtml += '<option value="' + s + '"' + (state.sectionFilter === s ? ' selected' : '') + '>Section ' + s + '</option>'; });
      shellHtml += '</select>';
      shellHtml += '<select class="form-select" id="student-status-filter"><option value="all">All Status</option><option value="Active"' + (state.statusFilter === 'Active' ? ' selected' : '') + '>Active</option><option value="Inactive"' + (state.statusFilter === 'Inactive' ? ' selected' : '') + '>Inactive</option></select>';
      shellHtml += '</div></div>';

      // Bulk actions container
      shellHtml += '<div id="students-bulk-actions-container"></div>';

      // Hidden file input for import
      shellHtml += '<input type="file" id="student-file-input" accept=".xlsx,.xls,.csv" style="display:none">';

      // Dynamic Data container
      shellHtml += '<div id="students-data-container"></div>';

      container.innerHTML = shellHtml;
      attachStaticEvents();
      dataContainer = document.getElementById('students-data-container');
    }

    // Keep search and filter controls in sync with state without full re-render
    var searchInput = document.getElementById('student-search');
    if (searchInput && searchInput.value !== state.searchQuery) {
      searchInput.value = state.searchQuery;
    }
    var classFilter = document.getElementById('student-class-filter');
    if (classFilter && classFilter.value !== state.classFilter) {
      classFilter.value = state.classFilter;
    }
    var sectionFilter = document.getElementById('student-section-filter');
    if (sectionFilter && sectionFilter.value !== state.sectionFilter) {
      sectionFilter.value = state.sectionFilter;
    }
    var statusFilter = document.getElementById('student-status-filter');
    if (statusFilter && statusFilter.value !== state.statusFilter) {
      statusFilter.value = state.statusFilter;
    }

    // Update total badge count
    var totalBadge = document.getElementById('students-total-badge');
    if (totalBadge) {
      totalBadge.textContent = (SchoolApp.store.students || []).length;
    }

    var students = getFilteredStudents();
    var totalPages = Math.ceil(students.length / state.perPage) || 1;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    var start = (state.currentPage - 1) * state.perPage;
    var pageStudents = students.slice(start, start + state.perPage);

    // Update bulk actions bar
    var bulkActionsContainer = document.getElementById('students-bulk-actions-container');
    if (bulkActionsContainer) {
      var bulkHtml = '';
      if (state.selectedIds.length > 0 && isAdmin) {
        bulkHtml += '<div class="bulk-actions">';
        bulkHtml += '<span class="selected-count">' + state.selectedIds.length + ' selected</span>';
        bulkHtml += '<button class="btn btn-secondary btn-sm" id="bulk-export-btn"><span class="material-icons-round">download</span> Export Selected</button>';
        bulkHtml += '<button class="btn btn-danger btn-sm" id="bulk-delete-btn"><span class="material-icons-round">delete</span> Delete Selected</button>';
        bulkHtml += '</div>';
      }
      bulkActionsContainer.innerHTML = bulkHtml;
    }

    // Dynamic data content
    var html = '';
    if (pageStudents.length > 0) {
      html += '<div class="table-container"><table class="data-table"><thead><tr>';
      if (isAdmin) html += '<th><input type="checkbox" id="select-all-students" ' + (state.selectedIds.length === pageStudents.length && pageStudents.length > 0 ? 'checked' : '') + ' style="cursor:pointer"></th>';
      html += '<th>Student</th><th>Class</th><th>Roll No.</th><th>Parent</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead><tbody>';

      pageStudents.forEach(function(s) {
        var initials = SchoolApp.getInitials(s.firstName, s.lastName);
        var color = SchoolApp.getAvatarColor(s.firstName + s.lastName);
        var isSelected = state.selectedIds.indexOf(s.id) !== -1;

        html += '<tr>';
        if (isAdmin) html += '<td><input type="checkbox" class="student-checkbox" data-id="' + s.id + '"' + (isSelected ? ' checked' : '') + ' style="cursor:pointer"></td>';
        html += '<td><div class="table-student-name">' + getStudentAvatar(s, 32) + '<div><strong>' + getStudentFullName(s) + '</strong></div></div></td>';
        html += '<td><span class="badge badge-info">' + s.class + '-' + s.section + '</span></td>';
        html += '<td>' + s.rollNumber + '</td>';
        html += '<td>' + s.parentName + '</td>';
        html += '<td>' + s.parentPhone + '</td>';
        html += '<td><span class="badge ' + (s.status === 'Active' ? 'badge-success' : 'badge-danger') + '">' + s.status + '</span></td>';
        html += '<td><div class="table-actions">';
        if (isAdmin) {
          html += '<button class="btn-icon student-fee-btn" data-id="' + s.id + '" title="Financial Profile" style="color:var(--accent-primary);"><span class="material-icons-round">account_balance_wallet</span></button>';
        }
        html += '<button class="btn-icon student-view-btn" data-id="' + s.id + '" title="View"><span class="material-icons-round">visibility</span></button>';
        var canEdit = isAdmin && SchoolApp.checkFeatureAccess('students');
        if (canEdit) {
          html += '<button class="btn-icon student-edit-btn" data-id="' + s.id + '" title="Edit"><span class="material-icons-round">edit</span></button>';
          html += '<button class="btn-icon student-delete-btn" data-id="' + s.id + '" title="Delete"><span class="material-icons-round">delete</span></button>';
        }
        html += '</div></td></tr>';
      });

      html += '</tbody></table></div>';

      // Pagination
      html += '<div class="pagination">';
      html += '<span class="pagination-info">Showing ' + (start + 1) + ' to ' + Math.min(start + state.perPage, students.length) + ' of ' + students.length + ' students</span>';
      html += '<button class="pagination-btn" ' + (state.currentPage <= 1 ? 'disabled' : '') + ' data-page="prev"><span class="material-icons-round">chevron_left</span></button>';
      for (var i = 1; i <= totalPages; i++) {
        if (totalPages > 7 && i > 3 && i < totalPages - 2 && Math.abs(i - state.currentPage) > 1) {
          if (i === 4 || i === totalPages - 3) html += '<span style="padding:0 4px;color:var(--text-muted)">...</span>';
          continue;
        }
        html += '<button class="pagination-btn' + (i === state.currentPage ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
      }
      html += '<button class="pagination-btn" ' + (state.currentPage >= totalPages ? 'disabled' : '') + ' data-page="next"><span class="material-icons-round">chevron_right</span></button>';
      html += '</div>';
    } else {
      html += '<div class="empty-state"><span class="material-icons-round">school</span><h3>No Students Found</h3><p>No students match your current filters. Try adjusting your search or filters.</p></div>';
    }

    dataContainer.innerHTML = html;
    attachDynamicEvents();
  }

  function attachStaticEvents() {
    // Search
    var searchInput = document.getElementById('student-search');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        state.searchQuery = this.value;
        state.currentPage = 1;
        render();
      });
    }

    // Filters
    var classFilter = document.getElementById('student-class-filter');
    if (classFilter) classFilter.addEventListener('change', function() { state.classFilter = this.value; state.currentPage = 1; render(); });

    var sectionFilter = document.getElementById('student-section-filter');
    if (sectionFilter) sectionFilter.addEventListener('change', function() { state.sectionFilter = this.value; state.currentPage = 1; render(); });

    var statusFilter = document.getElementById('student-status-filter');
    if (statusFilter) statusFilter.addEventListener('change', function() { state.statusFilter = this.value; state.currentPage = 1; render(); });

    // Add button
    var addBtn = document.getElementById('student-add-btn');
    if (addBtn) addBtn.addEventListener('click', function() { showStudentForm(null); });

    // Export
    var exportBtn = document.getElementById('student-export-btn');
    if (exportBtn) exportBtn.addEventListener('click', function() { exportStudents(getFilteredStudents()); });

    // Template Download
    var templateBtn = document.getElementById('student-template-btn');
    if (templateBtn) templateBtn.addEventListener('click', function() { downloadStudentTemplate(); });

    // Import
    var importBtn = document.getElementById('student-import-btn');
    if (importBtn) importBtn.addEventListener('click', function() { document.getElementById('student-file-input').click(); });

    var fileInput = document.getElementById('student-file-input');
    if (fileInput) fileInput.addEventListener('change', function() { if (this.files[0]) importStudents(this.files[0]); this.value = ''; });
  }

  function attachDynamicEvents() {
    var isAdmin = SchoolApp.isAdmin();

    // Select all
    var selectAll = document.getElementById('select-all-students');
    if (selectAll) {
      selectAll.addEventListener('change', function() {
        var students = getFilteredStudents();
        var start = (state.currentPage - 1) * state.perPage;
        var pageStudents = students.slice(start, start + state.perPage);
        if (this.checked) {
          state.selectedIds = pageStudents.map(function(s) { return s.id; });
        } else {
          state.selectedIds = [];
        }
        render();
      });
    }

    // Individual checkboxes
    document.querySelectorAll('.student-checkbox').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var id = this.getAttribute('data-id');
        if (this.checked) {
          if (state.selectedIds.indexOf(id) === -1) state.selectedIds.push(id);
        } else {
          state.selectedIds = state.selectedIds.filter(function(sid) { return sid !== id; });
        }
        render();
      });
    });

    // View buttons
    document.querySelectorAll('.student-view-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { viewStudent(this.getAttribute('data-id')); });
    });

    // Fee Profile buttons
    document.querySelectorAll('.student-fee-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var sId = this.getAttribute('data-id');
        if (typeof SchoolApp.openStudentFinancialProfile === 'function') {
          SchoolApp.openStudentFinancialProfile(sId);
        } else if (typeof window.openStudentProfile === 'function') {
          window.openStudentProfile(sId);
        }
      });
    });

    // Edit/delete buttons (admin-only check occurs dynamically in template, bind if present)
    document.querySelectorAll('.student-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var student = SchoolApp.store.students.find(function(s) { return s.id === btn.getAttribute('data-id'); });
        showStudentForm(student);
      });
    });

    document.querySelectorAll('.student-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { deleteStudent(this.getAttribute('data-id')); });
    });

    // Bulk actions
    var bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    if (bulkDeleteBtn) {
      bulkDeleteBtn.addEventListener('click', function() {
        SchoolApp.showConfirm('Delete ' + state.selectedIds.length + ' students? They can be recovered from the Recycle Bin.', function() {
          var deleted = SchoolApp.store.students.filter(function(s) {
            return state.selectedIds.indexOf(s.id) !== -1;
          });
          deleted.forEach(function(s) {
            SchoolApp.moveToTrash('student', s.id, getStudentFullName(s), 'Class ' + s.class + '-' + s.section, s);
          });
          SchoolApp.store.students = SchoolApp.store.students.filter(function(s) {
            return state.selectedIds.indexOf(s.id) === -1;
          });
          SchoolApp.save();
          state.selectedIds = [];
          SchoolApp.showToast('Deleted students moved to Recycle Bin.', 'success');
          render();
        });
      });
    }

    var bulkExportBtn = document.getElementById('bulk-export-btn');
    if (bulkExportBtn) {
      bulkExportBtn.addEventListener('click', function() {
        var selected = SchoolApp.store.students.filter(function(s) { return state.selectedIds.indexOf(s.id) !== -1; });
        exportStudents(selected);
      });
    }

    // Pagination
    document.querySelectorAll('.pagination-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var page = this.getAttribute('data-page');
        if (page === 'prev') state.currentPage--;
        else if (page === 'next') state.currentPage++;
        else state.currentPage = parseInt(page);
        render();
      });
    });
  }


  function showStudentForm(student) {
    var isEdit = !!student;
    var settings = SchoolApp.store.settings || {};
    var classes = settings.classes || [];

    var bodyHTML = '<form id="student-form" class="form-grid">';

    bodyHTML += '<div class="form-group full-width"><label class="form-label">Full Name *</label><input type="text" class="form-input" name="name" id="student-fullname" value="' + (student ? getStudentFullName(student) : '') + '" placeholder="Full Name" required><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Class *</label><select class="form-select" name="class" required><option value="">Select Class</option>';
    classes.forEach(function(c) { bodyHTML += '<option value="' + c + '"' + (student && student.class === c ? ' selected' : '') + '>' + c + '</option>'; });
    bodyHTML += '</select><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Section *</label><select class="form-select" name="section" required><option value="">Select Section</option>';
    // Populated dynamically below
    bodyHTML += '</select><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Roll Number *</label><input type="text" class="form-input" name="rollNumber" value="' + (student ? student.rollNumber : '') + '" required><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Admission Number <span style="color:#9CA3AF;font-weight:400;font-size:12px;">(Optional)</span></label><input type="text" class="form-input" name="admissionNumber" value="' + (student && student.admissionNumber ? student.admissionNumber : '') + '" placeholder="e.g. ADM-2024-001"></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Date of Birth *</label><input type="date" class="form-input" name="dateOfBirth" value="' + (student ? student.dateOfBirth : '') + '" required><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Gender *</label><select class="form-select" name="gender" required><option value="">Select Gender</option>';
    ['Male', 'Female', 'Other'].forEach(function(g) { bodyHTML += '<option value="' + g + '"' + (student && student.gender === g ? ' selected' : '') + '>' + g + '</option>'; });
    bodyHTML += '</select><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Aadhaar Number <span style="color:#9CA3AF;font-weight:400;font-size:12px;">(Optional)</span></label><input type="text" class="form-input" name="aadhaarNumber" value="' + (student ? student.aadhaarNumber : '') + '" placeholder="XXXX XXXX XXXX"><span class="form-error">Must be 12 digits</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Parent/Guardian Name *</label><input type="text" class="form-input" name="parentName" value="' + (student ? student.parentName : '') + '" required><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Mother\'s Name <span style="color:#9CA3AF;font-weight:400;font-size:12px;">(Optional)</span></label><input type="text" class="form-input" name="motherName" value="' + (student && student.motherName ? student.motherName : '') + '" placeholder="Mother\'s Name"></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Parent Phone *</label><input type="text" class="form-input" name="parentPhone" value="' + (student ? student.parentPhone : '') + '" required><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Parent Email <span style="color:#9CA3AF;font-weight:400;font-size:12px;">(Optional)</span></label><input type="email" class="form-input" name="parentEmail" value="' + (student ? student.parentEmail : '') + '"><span class="form-error">Invalid email</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Admission Date <span style="color:#9CA3AF;font-weight:400;font-size:12px;">(Optional)</span></label><input type="date" class="form-input" name="admissionDate" value="' + (student ? student.admissionDate : new Date().toISOString().split('T')[0]) + '"></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Monthly Transport Fee (₹) <span style="color:#9CA3AF;font-weight:400;font-size:12px;">(Optional)</span></label><input type="number" class="form-input" name="transportFee" min="0" step="1" value="' + (student && (student.transportFee || student.transport_fee) ? (student.transportFee || student.transport_fee) : '') + '" placeholder="0"></div>';

    bodyHTML += '<div class="form-group full-width"><label class="form-label">Address <span style="color:#9CA3AF;font-weight:400;font-size:12px;">(Optional)</span></label><textarea class="form-textarea" name="address" rows="2">' + (student ? student.address : '') + '</textarea></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Status <span style="color:#9CA3AF;font-weight:400;font-size:12px;">(Optional)</span></label><select class="form-select" name="status">';
    ['Active', 'Inactive'].forEach(function(s) { bodyHTML += '<option value="' + s + '"' + (student && student.status === s ? ' selected' : '') + '>' + s + '</option>'; });
    bodyHTML += '</select></div>';

    var photoDisplay = (student && student.photoUrl) ? 'block' : 'none';
    var photoSrc = (student && student.photoUrl) || '';
    bodyHTML += '<div class="form-group">';
    bodyHTML += '  <label class="form-label">Student Photo <span style="color:#9CA3AF;font-weight:400;font-size:12px;">(Optional)</span></label>';
    bodyHTML += '  <input type="file" id="student-photo-input" accept="image/*"';
    bodyHTML += '    onchange="StorageUtils.previewImage(this.files[0], \'student-photo-preview\')" />';
    bodyHTML += '  <img id="student-photo-preview" src="' + photoSrc + '" style="max-width:80px;max-height:80px;display:' + photoDisplay + ';border-radius:50%;margin-top:8px;object-fit:cover;" />';
    bodyHTML += '</div>';

    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="student-save-btn"><span class="material-icons-round">save</span> ' + (isEdit ? 'Update' : 'Add') + ' Student</button>';

    SchoolApp.showModal((isEdit ? 'Edit' : 'Add New') + ' Student', bodyHTML, footerHTML);

    var form = document.getElementById('student-form');
    var classSelect = form.querySelector('select[name="class"]');
    var sectionSelect = form.querySelector('select[name="section"]');

    function updateSectionsDropdown(selectedClass, selectedSection) {
      if (!sectionSelect) return;
      sectionSelect.innerHTML = '<option value="">Select Section</option>';

      var sectList = [];
      var settings = SchoolApp.store.settings || {};
      if (settings.sections) {
        if (Array.isArray(settings.sections)) {
          sectList = settings.sections;
        } else if (typeof settings.sections === 'object') {
          sectList = settings.sections[selectedClass] || [];
        }
      }

      sectList.forEach(function(s) {
        var opt = document.createElement('option');
        opt.value = s;
        opt.textContent = 'Section ' + s;
        if (selectedSection && s === selectedSection) {
          opt.selected = true;
        }
        sectionSelect.appendChild(opt);
      });
    }

    if (classSelect) {
      classSelect.addEventListener('change', function() {
        updateSectionsDropdown(this.value);
      });
      updateSectionsDropdown(classSelect.value, student ? student.section : null);
    }

    // Save handler with in-flight guard
    var isSaving = false;
    var saveBtn = document.getElementById('student-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        if (isSaving) return; // block duplicate clicks
        isSaving = true;
        var btn = this;
        btn.disabled = true;
        var originalHTML = btn.innerHTML;
        btn.textContent = 'Saving...';

        saveStudent(student)
          .finally(function() {
            isSaving = false;
            if (btn) {
              btn.disabled = false;
              btn.innerHTML = originalHTML || '<span class="material-icons-round">save</span> ' + (isEdit ? 'Update' : 'Add') + ' Student';
            }
          });
      });
    }
  }

  async function saveStudent(existing) {
    var form = document.getElementById('student-form');
    if (!form) return;

    var fields = {};
    var inputs = form.querySelectorAll('input, select, textarea');
    var valid = true;

    inputs.forEach(function(input) {
      var name = input.name;
      if (input.type === 'file' || !name) return;
      var value = input.value.trim();
      fields[name] = value;

      // Validate required
      var group = input.closest('.form-group');
      if (input.required && !value) {
        if (group) group.classList.add('error');
        valid = false;
      } else {
        if (group) group.classList.remove('error');
      }
    });

    // Populate firstName & lastName for legacy compatibility
    if (fields.name) {
      var nameParts = fields.name.trim().split(/\s+/);
      fields.firstName = nameParts[0] || '';
      fields.lastName = nameParts.slice(1).join(' ') || '';
    }

    // Process optional additional fields
    fields.transportFee = parseFloat(fields.transportFee) || 0;
    fields.transport_fee = fields.transportFee;
    fields.motherName = (fields.motherName || '').trim();
    fields.admissionNumber = (fields.admissionNumber || '').trim();

    // Validate aadhaar
    if (fields.aadhaarNumber && !SchoolApp.utils.validate.aadhaar(fields.aadhaarNumber)) {
      var aadhaarGroup = form.querySelector('[name="aadhaarNumber"]').closest('.form-group');
      if (aadhaarGroup) aadhaarGroup.classList.add('error');
      valid = false;
    }

    if (!valid) {
      SchoolApp.showToast('Please fill all required fields correctly.', 'error');
      return;
    }

    var studentId = existing ? existing.id : SchoolApp.generateId();
    fields.id = studentId;

    const photoFile = document.getElementById("student-photo-input")?.files[0];
    if (photoFile) {
      // Photo uploads are not enabled yet — StorageUtils.uploadStudentPhoto is
      // currently a stub that never stores anything. Tell the admin plainly
      // instead of silently discarding the photo they picked.
      SchoolApp.showToast('Photo uploads are not available yet on your plan. Contact support to enable this.', 'warning');
    }

    var rollbackFn = null;
    var successMessage = existing ? 'Student updated successfully.' : 'Student added successfully.';

    if (existing) {
      // Update
      var idx = SchoolApp.store.students.findIndex(function(s) { return s.id === existing.id; });
      if (idx !== -1) {
        if (!fields.photoUrl) fields.photoUrl = existing.photoUrl;
        var previousSnapshot = Object.assign({}, SchoolApp.store.students[idx]);
        Object.assign(SchoolApp.store.students[idx], fields);
        rollbackFn = function() { SchoolApp.store.students[idx] = previousSnapshot; };
      }
    } else {
      // Create
      SchoolApp.store.students.push(fields);
      var newIdx = SchoolApp.store.students.length - 1;
      rollbackFn = function() { SchoolApp.store.students.splice(newIdx, 1); };
    }

    var saveOk = await SchoolApp.save();
    if (saveOk !== false) {
      // Only confirm success — and only close the modal / re-render — once the
      // write has actually persisted to Firestore.
      SchoolApp.showToast(successMessage, 'success');
      SchoolApp.closeModal();
      render();
    } else {
      // Save failed (SchoolApp.save() already showed a specific error toast).
      // Roll back the local in-memory change so a retry doesn't create a
      // duplicate record and doesn't push an already-oversized document further.
      if (rollbackFn) rollbackFn();
    }
  }

  function viewStudent(id) {
    var student = SchoolApp.store.students.find(function(s) { return s.id === id; });
    if (!student) return;

    // Strict access control check for teachers
    if (SchoolApp.isTeacher()) {
      var ct = SchoolApp.currentUser.classTeacherOf || [];
      var st = SchoolApp.currentUser.subjectTeacherOf || [];
      var isAssigned = ct.some(function(c) {
        return String(c.class).toLowerCase().trim() === String(student.class).toLowerCase().trim() &&
               String(c.section).toLowerCase().trim() === String(student.section).toLowerCase().trim();
      }) || st.some(function(c) {
        return String(c.class).toLowerCase().trim() === String(student.class).toLowerCase().trim() &&
               String(c.section).toLowerCase().trim() === String(student.section).toLowerCase().trim();
      });
      if (!isAssigned) {
        SchoolApp.showToast('Access Denied: This student is not in your assigned class.', 'error');
        return;
      }
    }

    var sName = getStudentFullName(student);
    var initials = SchoolApp.getInitials(sName);
    var color = SchoolApp.getAvatarColor(sName);

    var html = '<div class="detail-header">';
    html += getStudentAvatar(student, 80);
    html += '<div><div class="detail-name">' + sName + '</div>';
    html += '<div class="detail-subtitle">Class ' + student.class + '-' + student.section + ' · Roll No. ' + student.rollNumber + '</div>';
    html += '<span class="badge ' + (student.status === 'Active' ? 'badge-success' : 'badge-danger') + '">' + student.status + '</span>';
    html += '</div></div>';

    html += '<div class="detail-section"><h4><span class="material-icons-round">person</span> Personal Information</h4><div class="detail-grid">';
    html += '<div class="detail-item"><span class="detail-item-label">Date of Birth</span><span class="detail-item-value">' + SchoolApp.formatDate(student.dateOfBirth) + '</span></div>';
    html += '<div class="detail-item"><span class="detail-item-label">Gender</span><span class="detail-item-value">' + (student.gender || '—') + '</span></div>';
    html += '<div class="detail-item"><span class="detail-item-label">Aadhaar Number</span><span class="detail-item-value">' + (student.aadhaarNumber || '—') + '</span></div>';
    html += '<div class="detail-item full-width"><span class="detail-item-label">Address</span><span class="detail-item-value">' + (student.address || '—') + '</span></div>';
    html += '</div></div>';

    html += '<div class="detail-section"><h4><span class="material-icons-round">school</span> Academic Information</h4><div class="detail-grid">';
    html += '<div class="detail-item"><span class="detail-item-label">Class & Section</span><span class="detail-item-value">Class ' + student.class + ' - Section ' + student.section + '</span></div>';
    html += '<div class="detail-item"><span class="detail-item-label">Roll Number</span><span class="detail-item-value">' + student.rollNumber + '</span></div>';
    if (student.admissionNumber) {
      html += '<div class="detail-item"><span class="detail-item-label">Admission Number</span><span class="detail-item-value">' + student.admissionNumber + '</span></div>';
    }
    html += '<div class="detail-item"><span class="detail-item-label">Admission Date</span><span class="detail-item-value">' + SchoolApp.formatDate(student.admissionDate) + '</span></div>';
    html += '<div class="detail-item"><span class="detail-item-label">Status</span><span class="detail-item-value"><span class="badge ' + (student.status === 'Active' ? 'badge-success' : 'badge-danger') + '">' + student.status + '</span></span></div>';
    var tFee = parseFloat(student.transportFee || student.transport_fee || 0);
    if (tFee > 0) {
      html += '<div class="detail-item"><span class="detail-item-label">Monthly Transport Fee</span><span class="detail-item-value" style="color:var(--accent-primary); font-weight:600;">₹' + tFee.toLocaleString('en-IN') + ' / mo</span></div>';
    }
    html += '</div></div>';

    html += '<div class="detail-section"><h4><span class="material-icons-round">family_restroom</span> Parent/Guardian Information</h4><div class="detail-grid">';
    html += '<div class="detail-item"><span class="detail-item-label">Parent Name</span><span class="detail-item-value">' + (student.parentName || '—') + '</span></div>';
    if (student.motherName) {
      html += '<div class="detail-item"><span class="detail-item-label">Mother\'s Name</span><span class="detail-item-value">' + student.motherName + '</span></div>';
    }
    html += '<div class="detail-item"><span class="detail-item-label">Phone</span><span class="detail-item-value">' + (student.parentPhone || '—') + '</span></div>';
    html += '<div class="detail-item"><span class="detail-item-label">Email</span><span class="detail-item-value">' + (student.parentEmail || '—') + '</span></div>';
    html += '</div></div>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>';
    if (SchoolApp.isAdmin()) {
      footerHTML += '<button class="btn btn-primary" id="view-student-fee-btn" style="display:inline-flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:16px;">account_balance_wallet</span> Fee Profile</button>';
    }
    SchoolApp.showModal('Student Details', html, footerHTML);

    var feeBtn = document.getElementById('view-student-fee-btn');
    if (feeBtn) {
      feeBtn.addEventListener('click', function() {
        SchoolApp.closeModal();
        setTimeout(function() {
          if (typeof SchoolApp.openStudentFinancialProfile === 'function') {
            SchoolApp.openStudentFinancialProfile(id);
          } else if (typeof window.openStudentProfile === 'function') {
            window.openStudentProfile(id);
          }
        }, 150);
      });
    }
  }

  function deleteStudent(id) {
    var student = SchoolApp.store.students.find(function(s) { return s.id === id; });
    if (!student) return;
    var sName = getStudentFullName(student);
    SchoolApp.showConfirm('Delete student "' + sName + '"? They can be recovered from the Recycle Bin.', function() {
      SchoolApp.moveToTrash('student', student.id, sName, 'Class ' + student.class + '-' + student.section, student);
      SchoolApp.store.students = SchoolApp.store.students.filter(function(s) { return s.id !== id; });
      SchoolApp.save();
      SchoolApp.showToast('Student moved to Recycle Bin.', 'success');
      render();
    });
  }

  // ─── Unified Student Column Format ───
  // Download Template and Export used to disclose two DIFFERENT column sets
  // (Template had 11 columns, Export had 15 including a confusing Full Name /
  // First Name / Last Name split). Schools that filled the Template were more
  // likely to leave required-looking fields blank than schools re-editing an
  // Export (which already had real, complete data in every column). Both now
  // share this exact single definition, in the same order, with the same
  // "*"/"(Optional)" convention already used on the manual Add Student form —
  // so whichever one a school learns from, the other behaves identically.
  var STUDENT_SHEET_COLUMNS = [
    { header: 'Student Name *', key: 'name', transform: function(v, row) { return getStudentFullName(row); } },
    { header: 'Class *', key: 'class' },
    { header: 'Section *', key: 'section' },
    { header: 'Roll Number *', key: 'rollNumber' },
    { header: 'Admission Number (Optional)', key: 'admissionNumber' },
    { header: 'Date of Birth *', key: 'dateOfBirth' },
    { header: 'Gender *', key: 'gender' },
    { header: 'Parent/Guardian Name *', key: 'parentName' },
    { header: 'Mother\'s Name (Optional)', key: 'motherName' },
    { header: 'Parent Phone *', key: 'parentPhone' },
    { header: 'Parent Email (Optional)', key: 'parentEmail' },
    { header: 'Monthly Transport Fee (Optional)', key: 'transportFee', transform: function(v, row) { return row.transportFee || row.transport_fee || 0; } },
    { header: 'Aadhaar Number (Optional)', key: 'aadhaarNumber' },
    { header: 'Address (Optional)', key: 'address' },
    { header: 'Admission Date (Optional)', key: 'admissionDate' },
    { header: 'Status (Optional)', key: 'status' }
  ];

  function exportStudents(students) {
    var dateStr = new Date().toISOString().split('T')[0];
    SchoolApp.utils.exportToExcel(students, STUDENT_SHEET_COLUMNS, 'students_export_' + dateStr + '.xlsx');
  }

  // ─── Phase 1B: Template Download ───

  function downloadStudentTemplate() {
    var sampleRows = [
      {
        name: 'Aarav Kumar',
        class: '1',
        section: 'A',
        rollNumber: '1',
        // Shown as DD-MM-YYYY — the format Indian schools commonly write dates
        // in by hand. Import parsing (parseFlexibleDate below) accepts this,
        // plain YYYY-MM-DD (e.g. from a re-imported Export), and Excel's own
        // date cells, so either convention works regardless of which one a
        // school actually types into the sheet.
        dateOfBirth: '15-05-2018',
        gender: 'Male',
        parentName: 'Rajesh Kumar',
        parentPhone: '9876543210',
        parentEmail: 'rajesh@example.com',
        aadhaarNumber: '',
        admissionDate: '01-04-2024',
        status: 'Active'
      },
      {
        name: 'Priya Sharma',
        class: '1',
        section: 'A',
        rollNumber: '2',
        dateOfBirth: '20-08-2018',
        gender: 'Female',
        parentName: 'Sunil Sharma',
        parentPhone: '9876543211',
        parentEmail: 'sunil@example.com',
        aadhaarNumber: '',
        address: 'Sector 4, Bokaro, Jharkhand',
        admissionDate: '01-04-2024',
        status: 'Active'
      }
    ];

    SchoolApp.utils.exportToExcel(sampleRows, STUDENT_SHEET_COLUMNS, 'student_import_template.xlsx');
  }

  // ─── Import Helpers (Phase 1A + 1B) ───

  var HEADER_MAPPING_DICTIONARY = {
    'full name': 'name', 'fullname': 'name', 'name': 'name', 'student name': 'name',
    // firstName/lastName kept here for backward compatibility with files exported
    // under the old 3-column name format — new Template/Export no longer generate
    // these columns, but a school's already-saved older export must still import fine.
    'first name': 'firstName', 'firstname': 'firstName',
    'last name': 'lastName', 'lastname': 'lastName',
    'class': 'class',
    'section': 'section',
    'roll number': 'rollNumber', 'rollnumber': 'rollNumber',
    'date of birth': 'dateOfBirth', 'dob': 'dateOfBirth',
    'gender': 'gender',
    'aadhaar number': 'aadhaarNumber', 'aadhaar': 'aadhaarNumber',
    'address': 'address',
    'parent name': 'parentName', 'parent/guardian name': 'parentName', 'parent guardian name': 'parentName',
    'parent phone': 'parentPhone',
    'parent email': 'parentEmail',
    'admission date': 'admissionDate',
    'status': 'status'
  };

  var HEADER_KEYWORD_GROUPS = {
    'name': ['name', 'student name', 'full name', 'pupil name', 'student'],
    'firstName': ['first name', 'firstname', 'fname'],
    'lastName': ['last name', 'lastname', 'lname', 'surname'],
    'class': ['class', 'std', 'std.', 'standard', 'grade'],
    'section': ['section', 'sec'],
    'rollNumber': ['roll number', 'roll no', 'rollno', 'roll', 'serial no'],
    'dateOfBirth': ['date of birth', 'dob', 'birth date', 'birthdate'],
    'gender': ['gender', 'sex'],
    'parentName': ['parent name', 'parent/guardian name', 'parent guardian name', 'father name', "father's name", 'guardian', 'guardian name'],
    'parentPhone': ['parent phone', 'mobile', 'phone', 'contact', 'contact no', 'whatsapp', 'ph no', 'parent mobile'],
    'parentEmail': ['parent email', 'email', 'email id'],
    'aadhaarNumber': ['aadhaar', 'aadhaar number', 'adhar'],
    'address': ['address'],
    'admissionDate': ['admission date', 'adm date', 'doa'],
    'status': ['status']
  };

  var AVAILABLE_FIELDS = [
    { id: 'name', label: 'Student Name' },
    { id: 'firstName', label: 'First Name' },
    { id: 'lastName', label: 'Last Name' },
    { id: 'class', label: 'Class' },
    { id: 'section', label: 'Section' },
    { id: 'rollNumber', label: 'Roll Number' },
    { id: 'dateOfBirth', label: 'Date of Birth' },
    { id: 'gender', label: 'Gender' },
    { id: 'parentName', label: 'Parent Name' },
    { id: 'parentPhone', label: 'Parent Phone' },
    { id: 'parentEmail', label: 'Parent Email' },
    { id: 'aadhaarNumber', label: 'Aadhaar Number' },
    { id: 'address', label: 'Address' },
    { id: 'admissionDate', label: 'Admission Date' },
    { id: 'status', label: 'Status' }
  ];

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(str) {
    return escapeHTML(str);
  }

  // Normalizes a Date-of-Birth / Admission Date value from an imported sheet
  // into the app's internal YYYY-MM-DD storage format (required by the
  // <input type="date"> fields on the Add/Edit Student form — anything else
  // in that value would silently show blank there). Handles:
  //  - an actual JS Date object (Excel cell typed as a date, read with
  //    cellDates:true)
  //  - a raw Excel serial-date number (safety net if cellDates wasn't applied)
  //  - "DD-MM-YYYY" / "DD/MM/YYYY" — the format Indian schools commonly write
  //    by hand (what the Template's sample rows now use)
  //  - "YYYY-MM-DD" / "YYYY/MM/DD" — already-internal format (e.g. a
  //    re-imported Export)
  // Anything else is returned unchanged rather than dropped, so an unusual
  // format doesn't silently erase data — it just won't auto-normalize.
  function parseFlexibleDate(val) {
    if (val === undefined || val === null || val === '') return '';

    function pad2(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
    function toISO(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

    if (val instanceof Date && !isNaN(val.getTime())) {
      return toISO(val);
    }

    if (typeof val === 'number' && isFinite(val) && val > 20000 && val < 60000) {
      // Excel's date epoch is 1899-12-30 (accounts for its leap-year quirk)
      var fromSerial = new Date(Date.UTC(1899, 11, 30) + val * 86400000);
      return toISO(fromSerial);
    }

    var str = String(val).trim();
    if (!str) return '';

    var iso = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if (iso) return iso[1] + '-' + pad2(iso[2]) + '-' + pad2(iso[3]);

    var dmy = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (dmy) return dmy[3] + '-' + pad2(dmy[2]) + '-' + pad2(dmy[1]);

    return str;
  }

  function sanitizeHeader(header) {
    return String(header)
      .trim()
      .toLowerCase()
      // Strip the "*" (mandatory) and "(Optional)"/"(Required)"/"(Mandatory)"
      // markers now shown in the Template/Export headers, so "Student Name *"
      // and "Parent Phone (Optional)" still map exactly like their bare form.
      .replace(/\(optional\)/g, '')
      .replace(/\(required\)/g, '')
      .replace(/\(mandatory\)/g, '')
      .replace(/\*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function detectColumnMapping(header) {
    var clean = sanitizeHeader(header);

    // Try exact match against existing dictionary first
    var exactMatch = HEADER_MAPPING_DICTIONARY[clean];
    if (exactMatch) {
      return {
        field: exactMatch,
        confidence: 'exact'
      };
    }

    // Try fuzzy keyword match
    for (var field in HEADER_KEYWORD_GROUPS) {
      var keywords = HEADER_KEYWORD_GROUPS[field];
      if (keywords.includes(clean)) {
        return {
          field: field,
          confidence: 'fuzzy'
        };
      }
    }

    return { field: null, confidence: 'none' };
  }

  function normalizeImportedClass(rawClass, configuredClasses) {
    if (!rawClass) return rawClass;
    var clean = String(rawClass).trim();
    if (!configuredClasses || !Array.isArray(configuredClasses) || configuredClasses.length === 0) {
      return clean;
    }

    var strClasses = configuredClasses.map(function(c) { return String(c).trim(); });

    // 1. Exact match (case-insensitive)
    var exactIdx = strClasses.findIndex(function(c) { return c.toLowerCase() === clean.toLowerCase(); });
    if (exactIdx !== -1) {
      return strClasses[exactIdx];
    }

    // 2. Try common prefix variations: Class, Std, Std., Grade
    var stripped = clean
      .replace(/^class\s*/i, '')
      .replace(/^std\.?\s*/i, '')
      .replace(/^grade\s*/i, '')
      .trim();

    var strippedMatch = strClasses.find(function(c) { return c.toLowerCase() === stripped.toLowerCase(); });
    if (strippedMatch) {
      return strippedMatch;
    }

    // 3. Try with "Class " prefix
    var withPrefix = 'Class ' + stripped;
    var prefixMatch = strClasses.find(function(c) { return c.toLowerCase() === withPrefix.toLowerCase(); });
    if (prefixMatch) {
      return prefixMatch;
    }

    // 4. Roman Numeral Conversion (I–XII)
    var ROMAN_TO_ARABIC = {
      'i': '1',
      'ii': '2',
      'iii': '3',
      'iv': '4',
      'v': '5',
      'vi': '6',
      'vii': '7',
      'viii': '8',
      'ix': '9',
      'x': '10',
      'xi': '11',
      'xii': '12'
    };

    var romanKey = stripped.toLowerCase();
    if (ROMAN_TO_ARABIC[romanKey]) {
      var arabicNum = ROMAN_TO_ARABIC[romanKey];
      // Check for "Class N" (e.g. "Class 1")
      var romanWithPrefixMatch = strClasses.find(function(c) {
        return c.toLowerCase() === ('class ' + arabicNum).toLowerCase();
      });
      if (romanWithPrefixMatch) return romanWithPrefixMatch;

      // Check for standalone arabic number (e.g. "1")
      var romanArabicMatch = strClasses.find(function(c) {
        return c.toLowerCase() === arabicNum;
      });
      if (romanArabicMatch) return romanArabicMatch;
    }

    // 5. Common Pre-primary aliases (NUR <-> Nursery, KG <-> K.G)
    var PREPRIMARY_ALIASES = {
      'nur': ['Nursery', 'NUR'],
      'nursery': ['Nursery', 'NUR'],
      'kg': ['K.G', 'KG', 'Kindergarten'],
      'k.g': ['K.G', 'KG', 'Kindergarten'],
      'lkg': ['LKG', 'L.K.G'],
      'ukg': ['UKG', 'U.K.G']
    };

    var aliasKey = stripped.toLowerCase().replace(/\s+/g, '');
    if (PREPRIMARY_ALIASES[aliasKey]) {
      var candidates = PREPRIMARY_ALIASES[aliasKey];
      for (var i = 0; i < candidates.length; i++) {
        var candMatch = strClasses.find(function(c) {
          return c.toLowerCase() === candidates[i].toLowerCase();
        });
        if (candMatch) return candMatch;
      }
    }

    // No match found — flag for admin review, don't silently guess
    return null;
  }

  function isDuplicateStudent(newStudent, existingStudents) {
    if (!existingStudents || !existingStudents.length) return false;
    return existingStudents.some(function(s) {
      // Only use rollNumber+class+section match if rollNumber is a REAL assigned value
      // (not 0, not blank, not undefined)
      var hasRealRoll =
        newStudent.rollNumber !== undefined &&
        newStudent.rollNumber !== null &&
        String(newStudent.rollNumber).trim() !== '' &&
        String(newStudent.rollNumber).trim() !== '0';

      var sHasRealRoll =
        s.rollNumber !== undefined &&
        s.rollNumber !== null &&
        String(s.rollNumber).trim() !== '' &&
        String(s.rollNumber).trim() !== '0';

      if (hasRealRoll && sHasRealRoll &&
          String(s.rollNumber).trim() === String(newStudent.rollNumber).trim() &&
          String(s.class || '').trim() === String(newStudent.class || '').trim() &&
          String(s.section || '').trim() === String(newStudent.section || '').trim()) {
        return true;
      }

      // Fallback: name + parent phone (works regardless of roll number)
      if (newStudent.name && newStudent.parentPhone &&
          s.name && s.parentPhone &&
          String(s.name).trim().toLowerCase() === String(newStudent.name).trim().toLowerCase() &&
          String(s.parentPhone).trim() === String(newStudent.parentPhone).trim()) {
        return true;
      }

      return false;
    });
  }

  // ─── Step 2: Preview Modal & Evaluation ───

  function showImportPreviewModal(fileName, data, rawHeaders, initialMapping, mappingConfidence) {
    var currentMapping = Object.assign({}, initialMapping);

    // Classes/sections the admin has chosen to create (via the "+ Create" buttons
    // below), applied to the real store only when the import is confirmed.
    var pendingNewClasses = [];
    var pendingNewSections = {}; // { className: [sectionName, ...] }

    function getEffectiveClasses() {
      var base = (SchoolApp.store.settings && SchoolApp.store.settings.classes) || [];
      return base.concat(pendingNewClasses.filter(function(c) { return base.indexOf(c) === -1; }));
    }

    function getEffectiveSections() {
      var base = (SchoolApp.store.settings && SchoolApp.store.settings.sections) || {};
      var merged = {};
      Object.keys(base).forEach(function(c) { merged[c] = (base[c] || []).slice(); });
      pendingNewClasses.forEach(function(c) {
        if (!merged[c]) merged[c] = ['A']; // a newly-created class gets a default "A" section
      });
      Object.keys(pendingNewSections).forEach(function(c) {
        if (!merged[c]) merged[c] = [];
        pendingNewSections[c].forEach(function(s) {
          if (merged[c].indexOf(s) === -1) merged[c].push(s);
        });
      });
      return merged;
    }

    function evaluateCurrentData() {
      var configuredClasses = getEffectiveClasses();
      var configuredSections = getEffectiveSections();
      var readyStudents = [];
      var classMismatchList = [];
      var sectionMismatchList = [];
      var duplicateList = [];
      var skippedRows = [];
      var incompleteList = [];

      // Fields the manual "Add Student" form treats as mandatory, beyond the
      // bare minimum (Name + Class) that bulk import blocks on below. A row
      // missing these still imports (so existing import habits never suddenly
      // break), but is now surfaced as a warning instead of silently going
      // through incomplete — this was the actual root cause of "Template
      // imports have mistakes, Export re-imports come out cleaner": the
      // Template gave no signal about which columns actually mattered.
      var RECOMMENDED_FIELDS = [
        { key: 'section', label: 'Section' },
        { key: 'rollNumber', label: 'Roll Number' },
        { key: 'dateOfBirth', label: 'Date of Birth' },
        { key: 'gender', label: 'Gender' },
        { key: 'parentName', label: 'Parent/Guardian Name' },
        { key: 'parentPhone', label: 'Parent Phone' }
      ];

      data.forEach(function(row, index) {
        var student = { id: SchoolApp.generateId(), status: 'Active' };

        // Apply mapping
        rawHeaders.forEach(function(origH) {
          var targetField = currentMapping[origH];
          if (!targetField) return;
          var val = row[origH];
          if (val === undefined || val === null) {
            var cleanTarget = sanitizeHeader(origH);
            for (var rk in row) {
              if (sanitizeHeader(rk) === cleanTarget) {
                val = row[rk];
                break;
              }
            }
          }
          if (val !== undefined && val !== null) {
            var strVal = (targetField === 'dateOfBirth' || targetField === 'admissionDate')
              ? parseFlexibleDate(val)
              : String(val).trim();
            if (strVal !== '') student[targetField] = strVal;
          }
        });

        // Name decomposition / composition
        if (student.name && (!student.firstName || !student.lastName)) {
          var parts = student.name.trim().split(/\s+/);
          student.firstName = parts[0] || '';
          student.lastName = parts.slice(1).join(' ') || '';
        } else if ((student.firstName || student.lastName) && !student.name) {
          student.name = getStudentFullName(student);
        }
        if (student.firstName === undefined) student.firstName = '';
        if (student.lastName === undefined) student.lastName = '';

        // Minimum required fields check
        var hasName = !!((student.name && student.name.trim()) || (student.firstName && student.firstName.trim()));
        var hasClass = !!(student.class && student.class.trim());

        if (!hasName || !hasClass) {
          var reason = !hasName && !hasClass
            ? 'Missing name and class'
            : (!hasClass ? 'Missing class' : 'Missing name');
          skippedRows.push({
            rowNumber: index + 2,
            reason: reason,
            name: student.name || '(Empty)'
          });
          return;
        }

        // Class normalization — a class that doesn't exist in Paathshala yet is
        // held OUT of the import (not silently written with a bad value) until
        // the admin either creates it here or fixes the source file.
        var rawClass = student.class;
        var normalizedClass = normalizeImportedClass(rawClass, configuredClasses);
        if (!normalizedClass) {
          classMismatchList.push({
            rowNumber: index + 2,
            name: student.name,
            rawClass: rawClass
          });
          return;
        }
        student.class = normalizedClass;

        // Section normalization — only meaningful once the class itself resolved,
        // and only when that class actually has a defined section list to check against.
        var rawSection = student.section && String(student.section).trim();
        if (rawSection) {
          var validSections = configuredSections[student.class];
          if (Array.isArray(validSections) && validSections.length > 0 && validSections.indexOf(rawSection) === -1) {
            sectionMismatchList.push({
              rowNumber: index + 2,
              name: student.name,
              class: student.class,
              rawSection: rawSection
            });
            return;
          }
        }

        // Duplicate check (against existing students and already ready students in this batch)
        if (isDuplicateStudent(student, SchoolApp.store.students) || isDuplicateStudent(student, readyStudents)) {
          duplicateList.push({
            rowNumber: index + 2,
            name: student.name,
            rollNumber: student.rollNumber || 'N/A',
            class: student.class,
            section: student.section || ''
          });
          return;
        }

        var missingRecommended = [];
        RECOMMENDED_FIELDS.forEach(function(f) {
          if (!student[f.key] || !String(student[f.key]).trim()) missingRecommended.push(f.label);
        });
        if (missingRecommended.length > 0) {
          incompleteList.push({
            rowNumber: index + 2,
            name: student.name,
            missingFields: missingRecommended
          });
        }

        readyStudents.push(student);
      });

      return {
        readyStudents: readyStudents,
        classMismatchList: classMismatchList,
        sectionMismatchList: sectionMismatchList,
        duplicateList: duplicateList,
        skippedRows: skippedRows,
        incompleteList: incompleteList
      };
    }

    function buildSummaryCardsHTML(evalRes) {
      var html = '<div style="padding:14px; border-radius:8px; border:1px solid var(--border-color); background:rgba(255,255,255,0.03); display:flex; flex-direction:column; gap:8px;">';
      html += '<div style="font-weight:700; font-size:13px; margin-bottom:4px;">Validation Summary</div>';

      html += '<div style="display:flex; flex-direction:column; gap:6px; font-size:12px;">';
      html += '<div style="color:#10B981; font-weight:600; display:flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:16px;">check_circle</span> ' + evalRes.readyStudents.length + ' students ready to import</div>';

      if (evalRes.classMismatchList.length > 0) {
        html += '<div style="color:#EF4444; font-weight:600; display:flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:16px;">warning</span> ' + evalRes.classMismatchList.length + ' NOT imported — class does not exist yet</div>';
      }

      if (evalRes.sectionMismatchList.length > 0) {
        html += '<div style="color:#EF4444; font-weight:600; display:flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:16px;">warning</span> ' + evalRes.sectionMismatchList.length + ' NOT imported — section does not exist yet</div>';
      }

      if (evalRes.duplicateList.length > 0) {
        html += '<div style="color:#F59E0B; font-weight:600; display:flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:16px;">content_copy</span> ' + evalRes.duplicateList.length + ' skipped as duplicates</div>';
      }

      if (evalRes.skippedRows.length > 0) {
        var rowNums = evalRes.skippedRows.slice(0, 5).map(function(r) { return 'Row ' + r.rowNumber; }).join(', ');
        if (evalRes.skippedRows.length > 5) rowNums += ', +' + (evalRes.skippedRows.length - 5) + ' more';
        html += '<div style="color:#EF4444; font-weight:600; display:flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:16px;">cancel</span> ' + evalRes.skippedRows.length + ' rows skipped (missing required fields) — ' + rowNums + '</div>';
      }

      if (evalRes.incompleteList.length > 0) {
        var incRowNums = evalRes.incompleteList.slice(0, 5).map(function(r) { return 'Row ' + r.rowNumber; }).join(', ');
        if (evalRes.incompleteList.length > 5) incRowNums += ', +' + (evalRes.incompleteList.length - 5) + ' more';
        html += '<div style="color:#F59E0B; font-weight:600; display:flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:16px;">info</span> ' + evalRes.incompleteList.length + ' will import but are missing recommended fields — ' + incRowNums + '</div>';
      }
      html += '</div>';

      // View Details Collapsible
      var hasIssues = evalRes.classMismatchList.length > 0 || evalRes.sectionMismatchList.length > 0 || evalRes.duplicateList.length > 0 || evalRes.skippedRows.length > 0 || evalRes.incompleteList.length > 0;
      if (hasIssues) {
        html += '<details open style="margin-top:8px; border-top:1px solid var(--border-color); padding-top:8px;">';
        html += '<summary style="cursor:pointer; font-size:12px; font-weight:600; color:var(--primary); user-select:none;">View Details (Expand to see rows)</summary>';
        html += '<div style="display:flex; flex-direction:column; gap:10px; margin-top:8px; font-size:11px; max-height:220px; overflow-y:auto;">';

        if (evalRes.classMismatchList.length > 0) {
          // Group rows by the unique raw class value so we offer ONE "Create Class" button per value
          var uniqueClasses = {};
          evalRes.classMismatchList.forEach(function(item) {
            var key = item.rawClass;
            if (!uniqueClasses[key]) uniqueClasses[key] = [];
            uniqueClasses[key].push(item);
          });
          html += '<div><span style="font-weight:700; color:#EF4444;">Class does not exist in Paathshala:</span>';
          Object.keys(uniqueClasses).forEach(function(rawClass) {
            var items = uniqueClasses[rawClass];
            html += '<div style="margin:4px 0 6px 8px; padding:6px 8px; background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.2); border-radius:6px;">';
            html += '  <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">';
            html += '    <span>Class "<strong>' + escapeHTML(rawClass) + '</strong>" — ' + items.length + ' student(s), e.g. Row ' + items[0].rowNumber + ' (' + escapeHTML(items[0].name || 'Unnamed') + ')</span>';
            html += '    <button type="button" class="btn btn-secondary btn-sm import-create-class-btn" data-class="' + escapeAttr(rawClass) + '" style="font-size:11px; padding:4px 8px; white-space:nowrap;">+ Create Class "' + escapeHTML(rawClass) + '"</button>';
            html += '  </div>';
            html += '</div>';
          });
          html += '</div>';
        }

        if (evalRes.sectionMismatchList.length > 0) {
          // Group by class + section pair
          var uniqueSections = {};
          evalRes.sectionMismatchList.forEach(function(item) {
            var key = item.class + '␟' + item.rawSection;
            if (!uniqueSections[key]) uniqueSections[key] = { class: item.class, section: item.rawSection, items: [] };
            uniqueSections[key].items.push(item);
          });
          html += '<div><span style="font-weight:700; color:#EF4444;">Section does not exist under its class:</span>';
          Object.keys(uniqueSections).forEach(function(key) {
            var grp = uniqueSections[key];
            html += '<div style="margin:4px 0 6px 8px; padding:6px 8px; background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.2); border-radius:6px;">';
            html += '  <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">';
            html += '    <span>Section "<strong>' + escapeHTML(grp.section) + '</strong>" under Class "<strong>' + escapeHTML(grp.class) + '</strong>" — ' + grp.items.length + ' student(s), e.g. Row ' + grp.items[0].rowNumber + ' (' + escapeHTML(grp.items[0].name || 'Unnamed') + ')</span>';
            html += '    <button type="button" class="btn btn-secondary btn-sm import-create-section-btn" data-class="' + escapeAttr(grp.class) + '" data-section="' + escapeAttr(grp.section) + '" style="font-size:11px; padding:4px 8px; white-space:nowrap;">+ Create Section "' + escapeHTML(grp.section) + '"</button>';
            html += '  </div>';
            html += '</div>';
          });
          html += '</div>';
        }

        if (evalRes.duplicateList.length > 0) {
          html += '<div><span style="font-weight:700; color:#F59E0B;">Duplicates Skipped:</span>';
          evalRes.duplicateList.forEach(function(item) {
            var classSec = item.class + (item.section ? '-' + item.section : '');
            html += '<div style="color:var(--text-secondary); margin-left:8px;">• Row ' + item.rowNumber + ': ' + escapeHTML(item.name || 'Unnamed') + ' (Class: ' + escapeHTML(classSec) + ', Roll: ' + escapeHTML(item.rollNumber) + ')</div>';
          });
          html += '</div>';
        }

        if (evalRes.skippedRows.length > 0) {
          html += '<div><span style="font-weight:700; color:#EF4444;">Missing Required Fields:</span>';
          evalRes.skippedRows.forEach(function(item) {
            html += '<div style="color:var(--text-secondary); margin-left:8px;">• Row ' + item.rowNumber + ': ' + escapeHTML(item.reason) + '</div>';
          });
          html += '</div>';
        }

        if (evalRes.incompleteList.length > 0) {
          html += '<div><span style="font-weight:700; color:#F59E0B;">Missing Recommended Fields (will still import):</span>';
          evalRes.incompleteList.forEach(function(item) {
            html += '<div style="color:var(--text-secondary); margin-left:8px;">• Row ' + item.rowNumber + ' (' + escapeHTML(item.name || 'Unnamed') + '): missing ' + escapeHTML(item.missingFields.join(', ')) + '</div>';
          });
          html += '</div>';
        }

        html += '</div></details>';
      }

      html += '</div>';
      return html;
    }

    function buildBodyHTML(evalRes) {
      var html = '<div class="import-preview-modal" style="display:flex; flex-direction:column; gap:16px; max-height:75vh; overflow-y:auto; padding-right:4px;">';

      // Section: Column Mapping Detected
      html += '<div>';
      html += '<h4 style="margin:0 0 8px 0; font-size:14px; font-weight:700; display:flex; align-items:center; gap:6px;"><span class="material-icons-round" style="font-size:18px; color:var(--primary);">view_column</span> Column Mapping Detected</h4>';
      html += '<p style="margin:0 0 10px 0; font-size:12px; color:var(--text-secondary);">Your Column &rarr; Paathshala Field. Each row has a dropdown to override if auto-detection is wrong.</p>';

      html += '<div style="border:1px solid var(--border-color); border-radius:8px; overflow:hidden; background:var(--bg-glass, rgba(255,255,255,0.02));">';
      html += '<table class="table" style="margin:0; width:100%; font-size:12px;">';
      html += '<thead><tr style="background:rgba(255,255,255,0.04); border-bottom:1px solid var(--border-color);">';
      html += '<th style="padding:8px 12px; text-align:left;">Your Column</th>';
      html += '<th style="padding:8px 12px; text-align:left;">Paathshala Field</th>';
      html += '<th style="padding:8px 12px; text-align:center; width:130px;">Detection</th>';
      html += '</tr></thead><tbody>';

      rawHeaders.forEach(function(h) {
        var conf = mappingConfidence[h] || 'none';
        var currentField = currentMapping[h] || '';

        var badgeHtml = '';
        if (conf === 'exact') {
          badgeHtml = '<span class="badge badge-success" style="font-size:10px; padding:3px 6px;">✅ exact</span>';
        } else if (conf === 'fuzzy') {
          badgeHtml = '<span class="badge badge-info" style="font-size:10px; padding:3px 6px;">✅ auto-detected</span>';
        } else {
          badgeHtml = '<span class="badge badge-secondary" style="font-size:10px; padding:3px 6px;">⚪ unmapped</span>';
        }

        html += '<tr style="border-bottom:1px solid var(--border-color);">';
        html += '<td style="padding:8px 12px; font-weight:600;">' + escapeHTML(h) + '</td>';
        html += '<td style="padding:8px 12px;">';
        html += '<select class="form-select import-col-map-select" data-header="' + escapeAttr(h) + '" style="padding:4px 8px; font-size:12px; width:100%; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-primary);">';
        html += '<option value="">[Ignore / Do not import]</option>';
        AVAILABLE_FIELDS.forEach(function(f) {
          html += '<option value="' + f.id + '"' + (currentField === f.id ? ' selected' : '') + '>' + f.label + '</option>';
        });
        html += '</select></td>';
        html += '<td style="padding:8px 12px; text-align:center;">' + badgeHtml + '</td>';
        html += '</tr>';
      });

      html += '</tbody></table></div></div>';

      // Section: Validation Summary
      html += '<div id="import-preview-summary-container">';
      html += buildSummaryCardsHTML(evalRes);
      html += '</div>';

      html += '</div>';
      return html;
    }

    var evalRes = evaluateCurrentData();
    var bodyHTML = buildBodyHTML(evalRes);
    var footerHTML = '<button class="btn btn-secondary" id="import-preview-cancel-btn">Cancel</button>' +
      '<button class="btn btn-primary" id="import-preview-confirm-btn"' + (evalRes.readyStudents.length === 0 ? ' disabled' : '') + '>' +
      '<span class="material-icons-round" style="font-size:16px;">check_circle</span> Confirm Import — ' + evalRes.readyStudents.length + ' students</button>';

    SchoolApp.showModal('Import Preview — ' + fileName, bodyHTML, footerHTML);

    // Cancel Button Handler (0 writes to Firestore)
    var cancelBtn = document.getElementById('import-preview-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function() {
        SchoolApp.closeModal();
      });
    }

    // Confirm Button Handler (writes to Firestore only here)
    var confirmBtn = document.getElementById('import-preview-confirm-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function() {
        // Commit any classes/sections the admin chose to create during this
        // preview into the real store BEFORE the final evaluation, so those
        // students land as normal "ready" imports rather than mismatches.
        if (pendingNewClasses.length > 0 || Object.keys(pendingNewSections).length > 0) {
          if (!SchoolApp.store.settings) SchoolApp.store.settings = {};
          if (!SchoolApp.store.settings.classes) SchoolApp.store.settings.classes = [];
          if (!SchoolApp.store.settings.sections) SchoolApp.store.settings.sections = {};
          pendingNewClasses.forEach(function(c) {
            if (SchoolApp.store.settings.classes.indexOf(c) === -1) SchoolApp.store.settings.classes.push(c);
            if (!SchoolApp.store.settings.sections[c]) SchoolApp.store.settings.sections[c] = ['A'];
          });
          Object.keys(pendingNewSections).forEach(function(c) {
            if (!SchoolApp.store.settings.sections[c]) SchoolApp.store.settings.sections[c] = [];
            pendingNewSections[c].forEach(function(s) {
              if (SchoolApp.store.settings.sections[c].indexOf(s) === -1) SchoolApp.store.settings.sections[c].push(s);
            });
          });
        }

        var currentEval = evaluateCurrentData();
        SchoolApp.closeModal();

        if (currentEval.readyStudents.length > 0) {
          SchoolApp.createRestorePoint('Auto-Backup before Student Excel Import');
          currentEval.readyStudents.forEach(function(s) {
            SchoolApp.store.students.push(s);
          });
        }

        // Summary feedback reporting
        var summaryParts = [currentEval.readyStudents.length + ' imported'];
        if (currentEval.duplicateList.length > 0) {
          summaryParts.push(currentEval.duplicateList.length + ' skipped as duplicates');
        }
        if (currentEval.classMismatchList.length > 0) {
          summaryParts.push(currentEval.classMismatchList.length + ' NOT imported (unknown class)');
        }
        if (currentEval.sectionMismatchList.length > 0) {
          summaryParts.push(currentEval.sectionMismatchList.length + ' NOT imported (unknown section)');
        }
        if (currentEval.incompleteList.length > 0) {
          summaryParts.push(currentEval.incompleteList.length + ' imported with missing recommended fields');
        }

        var summaryMsg = summaryParts.join(', ');
        if (currentEval.skippedRows.length > 0) {
          var rowList = currentEval.skippedRows.slice(0, 3).map(function(r) {
            return 'Row ' + r.rowNumber + ' (' + r.reason + ')';
          }).join(', ');
          if (currentEval.skippedRows.length > 3) {
            rowList += ', +' + (currentEval.skippedRows.length - 3) + ' more';
          }
          summaryMsg += '. ' + currentEval.skippedRows.length + ' rows skipped: ' + rowList;
        } else {
          summaryMsg += '.';
        }

        var hasUnresolved = currentEval.classMismatchList.length > 0 || currentEval.sectionMismatchList.length > 0 || currentEval.skippedRows.length > 0;
        var toastType = (hasUnresolved || currentEval.incompleteList.length > 0) ? 'warning' : 'success';

        // Persist once, after both the settings changes (new classes/sections)
        // and the student additions are applied, then update the UI.
        SchoolApp.save().then(function() {
          SchoolApp.showToast(summaryMsg, toastType);
          if (currentEval.classMismatchList.length > 0 || currentEval.sectionMismatchList.length > 0) {
            setTimeout(function() {
              SchoolApp.showToast('Some rows were not imported — fix the class/section in your file (or in Settings) and re-import just those rows.', 'warning');
            }, 1200);
          }
          render();
        });
      });
    }

    // Re-render the summary panel + confirm button count + re-wire its buttons.
    // Shared by both the column-mapping override and the "+ Create" actions.
    function refreshPreviewUI() {
      var updatedEval = evaluateCurrentData();

      var summaryContainer = document.getElementById('import-preview-summary-container');
      if (summaryContainer) {
        summaryContainer.innerHTML = buildSummaryCardsHTML(updatedEval);
      }

      var confirmBtnLive = document.getElementById('import-preview-confirm-btn');
      if (confirmBtnLive) {
        confirmBtnLive.disabled = updatedEval.readyStudents.length === 0;
        confirmBtnLive.innerHTML = '<span class="material-icons-round" style="font-size:16px;">check_circle</span> Confirm Import — ' + updatedEval.readyStudents.length + ' students';
      }

      attachSummaryActionListeners();
    }

    // "+ Create Class" / "+ Create Section" buttons inside the summary panel.
    // These only stage the change locally (pendingNewClasses/pendingNewSections);
    // nothing is written to Firestore until "Confirm Import" is clicked.
    function attachSummaryActionListeners() {
      document.querySelectorAll('.import-create-class-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var cls = this.getAttribute('data-class');
          if (cls && pendingNewClasses.indexOf(cls) === -1) {
            pendingNewClasses.push(cls);
            SchoolApp.showToast('Class "' + cls + '" will be created when you confirm the import.', 'info');
            refreshPreviewUI();
          }
        });
      });
      document.querySelectorAll('.import-create-section-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var cls = this.getAttribute('data-class');
          var sec = this.getAttribute('data-section');
          if (cls && sec) {
            if (!pendingNewSections[cls]) pendingNewSections[cls] = [];
            if (pendingNewSections[cls].indexOf(sec) === -1) {
              pendingNewSections[cls].push(sec);
              SchoolApp.showToast('Section "' + sec + '" under Class "' + cls + '" will be created when you confirm the import.', 'info');
              refreshPreviewUI();
            }
          }
        });
      });
    }

    attachSummaryActionListeners();

    // Dynamic Override Listeners
    var selects = document.querySelectorAll('.import-col-map-select');
    selects.forEach(function(sel) {
      sel.addEventListener('change', function() {
        var h = this.getAttribute('data-header');
        currentMapping[h] = this.value;
        refreshPreviewUI();
      });
    });
  }

  function processParsedData(data, headers, fileName) {
    var rawHeaders = (headers && headers.length > 0) ? headers : Object.keys(data[0] || {});
    var initialMapping = {};
    var mappingConfidence = {};

    rawHeaders.forEach(function(h) {
      var res = detectColumnMapping(h);
      initialMapping[h] = res.field || '';
      mappingConfidence[h] = res.confidence;
    });

    showImportPreviewModal(fileName, data, rawHeaders, initialMapping, mappingConfidence);
  }

  function importStudents(fileOrData, optionalFileName) {
    if (Array.isArray(fileOrData)) {
      processParsedData(fileOrData, [], optionalFileName || 'Students Import');
      return;
    }

    var file = fileOrData;
    SchoolApp.utils.importFromExcel(file, function(data, headers) {
      if (!data || data.length === 0) {
        SchoolApp.showToast('No data found in file.', 'warning');
        return;
      }
      processParsedData(data, headers, (file && file.name) ? file.name : 'Students File');
    });
  }

  // Expose import utils for testing and preview modals
  window.StudentImportUtils = {
    sanitizeHeader: sanitizeHeader,
    normalizeImportedClass: normalizeImportedClass,
    isDuplicateStudent: isDuplicateStudent,
    detectColumnMapping: detectColumnMapping,
    HEADER_KEYWORD_GROUPS: HEADER_KEYWORD_GROUPS,
    HEADER_MAPPING_DICTIONARY: HEADER_MAPPING_DICTIONARY,
    AVAILABLE_FIELDS: AVAILABLE_FIELDS,
    showImportPreviewModal: showImportPreviewModal,
    downloadStudentTemplate: downloadStudentTemplate,
    importStudents: importStudents
  };

  // Register Module
  SchoolApp.registerModule('students', {
    init: function() {},
    render: render,
    viewStudent: viewStudent
  });

})();
