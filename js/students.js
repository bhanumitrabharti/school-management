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

  function getFilteredStudents() {
    var students = SchoolApp.store.students || [];

    // Teacher: only show assigned classes
    if (SchoolApp.isTeacher() && SchoolApp.currentUser.assignedClasses) {
      var ac = SchoolApp.currentUser.assignedClasses;
      students = students.filter(function(s) {
        return ac.some(function(c) { return c.class === s.class && c.section === s.section; });
      });
    }

    // Apply filters
    if (state.classFilter !== 'all') {
      students = students.filter(function(s) { return s.class === state.classFilter; });
    }
    if (state.sectionFilter !== 'all') {
      students = students.filter(function(s) { return s.section === state.sectionFilter; });
    }
    if (state.statusFilter !== 'all') {
      students = students.filter(function(s) { return s.status === state.statusFilter; });
    }

    // Search
    if (state.searchQuery) {
      var q = state.searchQuery.toLowerCase();
      students = students.filter(function(s) {
        return (s.firstName + ' ' + s.lastName).toLowerCase().indexOf(q) !== -1 ||
               s.rollNumber.toLowerCase().indexOf(q) !== -1 ||
               s.parentName.toLowerCase().indexOf(q) !== -1;
      });
    }

    return students;
  }

  function render() {
    var container = document.getElementById('page-students');
    if (!container) return;

    var students = getFilteredStudents();
    var totalPages = Math.ceil(students.length / state.perPage) || 1;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    var start = (state.currentPage - 1) * state.perPage;
    var pageStudents = students.slice(start, start + state.perPage);

    var classes = SchoolApp.store.settings.classes || [];
    var sections = SchoolApp.store.settings.sections || [];
    var isAdmin = SchoolApp.isAdmin();

    var html = '';

    // Page Header
    html += '<div class="page-header">';
    html += '<h2><span class="material-icons-round">school</span> Student Management <span class="badge badge-purple">' + SchoolApp.store.students.length + '</span></h2>';
    html += '<div class="header-actions">';
    if (isAdmin) {
      html += '<button class="btn btn-secondary btn-sm" id="student-import-btn"><span class="material-icons-round">upload_file</span> Import</button>';
    }
    html += '<button class="btn btn-secondary btn-sm" id="student-export-btn"><span class="material-icons-round">download</span> Export</button>';
    if (isAdmin) {
      html += '<button class="btn btn-primary" id="student-add-btn"><span class="material-icons-round">add</span> Add Student</button>';
    }
    html += '</div></div>';

    // Toolbar
    html += '<div class="toolbar">';
    html += '<div class="search-wrapper"><span class="material-icons-round">search</span><input type="text" id="student-search" placeholder="Search students..." value="' + (state.searchQuery || '') + '"></div>';
    html += '<div class="filter-group">';
    html += '<select class="form-select" id="student-class-filter"><option value="all">All Classes</option>';
    classes.forEach(function(c) { html += '<option value="' + c + '"' + (state.classFilter === c ? ' selected' : '') + '>Class ' + c + '</option>'; });
    html += '</select>';
    html += '<select class="form-select" id="student-section-filter"><option value="all">All Sections</option>';
    sections.forEach(function(s) { html += '<option value="' + s + '"' + (state.sectionFilter === s ? ' selected' : '') + '>Section ' + s + '</option>'; });
    html += '</select>';
    html += '<select class="form-select" id="student-status-filter"><option value="all">All Status</option><option value="Active"' + (state.statusFilter === 'Active' ? ' selected' : '') + '>Active</option><option value="Inactive"' + (state.statusFilter === 'Inactive' ? ' selected' : '') + '>Inactive</option></select>';
    html += '</div></div>';

    // Bulk actions bar
    if (state.selectedIds.length > 0 && isAdmin) {
      html += '<div class="bulk-actions">';
      html += '<span class="selected-count">' + state.selectedIds.length + ' selected</span>';
      html += '<button class="btn btn-secondary btn-sm" id="bulk-export-btn"><span class="material-icons-round">download</span> Export Selected</button>';
      html += '<button class="btn btn-danger btn-sm" id="bulk-delete-btn"><span class="material-icons-round">delete</span> Delete Selected</button>';
      html += '</div>';
    }

    // Hidden file input for import
    html += '<input type="file" id="student-file-input" accept=".xlsx,.xls,.csv" style="display:none">';

    // Table
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
        html += '<td><div class="table-student-name"><div class="avatar avatar-sm" data-color="' + color + '">' + initials + '</div><div><strong>' + s.firstName + ' ' + s.lastName + '</strong></div></div></td>';
        html += '<td><span class="badge badge-info">' + s.class + '-' + s.section + '</span></td>';
        html += '<td>' + s.rollNumber + '</td>';
        html += '<td>' + s.parentName + '</td>';
        html += '<td>' + s.parentPhone + '</td>';
        html += '<td><span class="badge ' + (s.status === 'Active' ? 'badge-success' : 'badge-danger') + '">' + s.status + '</span></td>';
        html += '<td><div class="table-actions">';
        html += '<button class="btn-icon student-view-btn" data-id="' + s.id + '" title="View"><span class="material-icons-round">visibility</span></button>';
        if (isAdmin) {
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

    container.innerHTML = html;
    attachEvents();
  }

  function attachEvents() {
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

    // Import
    var importBtn = document.getElementById('student-import-btn');
    if (importBtn) importBtn.addEventListener('click', function() { document.getElementById('student-file-input').click(); });

    var fileInput = document.getElementById('student-file-input');
    if (fileInput) fileInput.addEventListener('change', function() { if (this.files[0]) importStudents(this.files[0]); this.value = ''; });

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

    // Edit buttons
    document.querySelectorAll('.student-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var student = SchoolApp.store.students.find(function(s) { return s.id === btn.getAttribute('data-id'); });
        showStudentForm(student);
      });
    });

    // Delete buttons
    document.querySelectorAll('.student-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { deleteStudent(this.getAttribute('data-id')); });
    });

    // Bulk delete
    var bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    if (bulkDeleteBtn) {
      bulkDeleteBtn.addEventListener('click', function() {
        SchoolApp.showConfirm('Delete ' + state.selectedIds.length + ' students? They can be recovered from the Recycle Bin.', function() {
          var deleted = SchoolApp.store.students.filter(function(s) {
            return state.selectedIds.indexOf(s.id) !== -1;
          });
          deleted.forEach(function(s) {
            SchoolApp.moveToTrash('student', s.id, s.firstName + ' ' + s.lastName, 'Class ' + s.class + '-' + s.section, s);
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

    // Bulk export
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
    var classes = SchoolApp.store.settings.classes || [];
    var sections = SchoolApp.store.settings.sections || [];

    var bodyHTML = '<form id="student-form" class="form-grid">';

    bodyHTML += '<div class="form-group"><label class="form-label">First Name *</label><input type="text" class="form-input" name="firstName" value="' + (student ? student.firstName : '') + '" required><span class="form-error">Required</span></div>';
    bodyHTML += '<div class="form-group"><label class="form-label">Last Name *</label><input type="text" class="form-input" name="lastName" value="' + (student ? student.lastName : '') + '" required><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Class *</label><select class="form-select" name="class" required><option value="">Select Class</option>';
    classes.forEach(function(c) { bodyHTML += '<option value="' + c + '"' + (student && student.class === c ? ' selected' : '') + '>Class ' + c + '</option>'; });
    bodyHTML += '</select><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Section *</label><select class="form-select" name="section" required><option value="">Select Section</option>';
    sections.forEach(function(s) { bodyHTML += '<option value="' + s + '"' + (student && student.section === s ? ' selected' : '') + '>Section ' + s + '</option>'; });
    bodyHTML += '</select><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Roll Number *</label><input type="text" class="form-input" name="rollNumber" value="' + (student ? student.rollNumber : '') + '" required><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Date of Birth *</label><input type="date" class="form-input" name="dateOfBirth" value="' + (student ? student.dateOfBirth : '') + '" required><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Gender *</label><select class="form-select" name="gender" required><option value="">Select Gender</option>';
    ['Male', 'Female', 'Other'].forEach(function(g) { bodyHTML += '<option value="' + g + '"' + (student && student.gender === g ? ' selected' : '') + '>' + g + '</option>'; });
    bodyHTML += '</select><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Aadhaar Number</label><input type="text" class="form-input" name="aadhaarNumber" value="' + (student ? student.aadhaarNumber : '') + '" placeholder="XXXX XXXX XXXX"><span class="form-error">Must be 12 digits</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Parent/Guardian Name *</label><input type="text" class="form-input" name="parentName" value="' + (student ? student.parentName : '') + '" required><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Parent Phone *</label><input type="text" class="form-input" name="parentPhone" value="' + (student ? student.parentPhone : '') + '" required><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Parent Email</label><input type="email" class="form-input" name="parentEmail" value="' + (student ? student.parentEmail : '') + '"><span class="form-error">Invalid email</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Admission Date</label><input type="date" class="form-input" name="admissionDate" value="' + (student ? student.admissionDate : new Date().toISOString().split('T')[0]) + '"></div>';

    bodyHTML += '<div class="form-group full-width"><label class="form-label">Address</label><textarea class="form-textarea" name="address" rows="2">' + (student ? student.address : '') + '</textarea></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Status</label><select class="form-select" name="status">';
    ['Active', 'Inactive'].forEach(function(s) { bodyHTML += '<option value="' + s + '"' + (student && student.status === s ? ' selected' : '') + '>' + s + '</option>'; });
    bodyHTML += '</select></div>';

    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="student-save-btn"><span class="material-icons-round">save</span> ' + (isEdit ? 'Update' : 'Add') + ' Student</button>';

    SchoolApp.showModal((isEdit ? 'Edit' : 'Add New') + ' Student', bodyHTML, footerHTML);

    // Save handler
    document.getElementById('student-save-btn').addEventListener('click', function() {
      saveStudent(student);
    });
  }

  function saveStudent(existing) {
    var form = document.getElementById('student-form');
    if (!form) return;

    var fields = {};
    var inputs = form.querySelectorAll('input, select, textarea');
    var valid = true;

    inputs.forEach(function(input) {
      var name = input.name;
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

    if (existing) {
      // Update
      var idx = SchoolApp.store.students.findIndex(function(s) { return s.id === existing.id; });
      if (idx !== -1) {
        Object.assign(SchoolApp.store.students[idx], fields);
        SchoolApp.showToast('Student updated successfully.', 'success');
      }
    } else {
      // Create
      fields.id = SchoolApp.generateId();
      SchoolApp.store.students.push(fields);
      SchoolApp.showToast('Student added successfully.', 'success');
    }

    SchoolApp.save();
    SchoolApp.closeModal();
    render();
  }

  function viewStudent(id) {
    var student = SchoolApp.store.students.find(function(s) { return s.id === id; });
    if (!student) return;

    var initials = SchoolApp.getInitials(student.firstName, student.lastName);
    var color = SchoolApp.getAvatarColor(student.firstName + student.lastName);

    var html = '<div class="detail-header">';
    html += '<div class="avatar avatar-xl" data-color="' + color + '">' + initials + '</div>';
    html += '<div><div class="detail-name">' + student.firstName + ' ' + student.lastName + '</div>';
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
    html += '<div class="detail-item"><span class="detail-item-label">Admission Date</span><span class="detail-item-value">' + SchoolApp.formatDate(student.admissionDate) + '</span></div>';
    html += '<div class="detail-item"><span class="detail-item-label">Status</span><span class="detail-item-value"><span class="badge ' + (student.status === 'Active' ? 'badge-success' : 'badge-danger') + '">' + student.status + '</span></span></div>';
    html += '</div></div>';

    html += '<div class="detail-section"><h4><span class="material-icons-round">family_restroom</span> Parent/Guardian Information</h4><div class="detail-grid">';
    html += '<div class="detail-item"><span class="detail-item-label">Parent Name</span><span class="detail-item-value">' + (student.parentName || '—') + '</span></div>';
    html += '<div class="detail-item"><span class="detail-item-label">Phone</span><span class="detail-item-value">' + (student.parentPhone || '—') + '</span></div>';
    html += '<div class="detail-item"><span class="detail-item-label">Email</span><span class="detail-item-value">' + (student.parentEmail || '—') + '</span></div>';
    html += '</div></div>';

    SchoolApp.showModal('Student Details', html, '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>');
  }

  function deleteStudent(id) {
    var student = SchoolApp.store.students.find(function(s) { return s.id === id; });
    if (!student) return;
    SchoolApp.showConfirm('Delete student "' + student.firstName + ' ' + student.lastName + '"? They can be recovered from the Recycle Bin.', function() {
      SchoolApp.moveToTrash('student', student.id, student.firstName + ' ' + student.lastName, 'Class ' + student.class + '-' + student.section, student);
      SchoolApp.store.students = SchoolApp.store.students.filter(function(s) { return s.id !== id; });
      SchoolApp.save();
      SchoolApp.showToast('Student moved to Recycle Bin.', 'success');
      render();
    });
  }

  function exportStudents(students) {
    var columns = [
      { header: 'First Name', key: 'firstName' },
      { header: 'Last Name', key: 'lastName' },
      { header: 'Class', key: 'class' },
      { header: 'Section', key: 'section' },
      { header: 'Roll Number', key: 'rollNumber' },
      { header: 'Date of Birth', key: 'dateOfBirth' },
      { header: 'Gender', key: 'gender' },
      { header: 'Aadhaar Number', key: 'aadhaarNumber' },
      { header: 'Address', key: 'address' },
      { header: 'Parent Name', key: 'parentName' },
      { header: 'Parent Phone', key: 'parentPhone' },
      { header: 'Parent Email', key: 'parentEmail' },
      { header: 'Admission Date', key: 'admissionDate' },
      { header: 'Status', key: 'status' }
    ];
    var dateStr = new Date().toISOString().split('T')[0];
    SchoolApp.utils.exportToExcel(students, columns, 'students_export_' + dateStr + '.xlsx');
  }

  function importStudents(file) {
    SchoolApp.utils.importFromExcel(file, function(data, headers) {
      if (!data || data.length === 0) {
        SchoolApp.showToast('No data found in file.', 'warning');
        return;
      }

      // Field mapping
      var mapping = {
        'First Name': 'firstName', 'first name': 'firstName', 'firstname': 'firstName', 'firstName': 'firstName',
        'Last Name': 'lastName', 'last name': 'lastName', 'lastname': 'lastName', 'lastName': 'lastName',
        'Class': 'class', 'class': 'class',
        'Section': 'section', 'section': 'section',
        'Roll Number': 'rollNumber', 'roll number': 'rollNumber', 'rollnumber': 'rollNumber', 'rollNumber': 'rollNumber',
        'Date of Birth': 'dateOfBirth', 'date of birth': 'dateOfBirth', 'dob': 'dateOfBirth', 'dateOfBirth': 'dateOfBirth',
        'Gender': 'gender', 'gender': 'gender',
        'Aadhaar Number': 'aadhaarNumber', 'aadhaar': 'aadhaarNumber', 'aadhaarNumber': 'aadhaarNumber',
        'Address': 'address', 'address': 'address',
        'Parent Name': 'parentName', 'parent name': 'parentName', 'parentName': 'parentName',
        'Parent Phone': 'parentPhone', 'parent phone': 'parentPhone', 'parentPhone': 'parentPhone',
        'Parent Email': 'parentEmail', 'parent email': 'parentEmail', 'parentEmail': 'parentEmail',
        'Admission Date': 'admissionDate', 'admissionDate': 'admissionDate',
        'Status': 'status', 'status': 'status'
      };

      var imported = 0;
      if (data && data.length > 0) {
        SchoolApp.createRestorePoint('Auto-Backup before Student Excel Import');
      }
      data.forEach(function(row) {
        var student = { id: SchoolApp.generateId(), status: 'Active' };
        Object.keys(row).forEach(function(key) {
          var mapped = mapping[key] || mapping[key.toLowerCase()];
          if (mapped) student[mapped] = String(row[key]).trim();
        });

        // Validate minimum fields
        if (student.firstName && student.class) {
          SchoolApp.store.students.push(student);
          imported++;
        }
      });

      SchoolApp.save();
      SchoolApp.showToast('Imported ' + imported + ' students from Excel.', 'success');
      render();
    });
  }

  // Register Module
  SchoolApp.registerModule('students', {
    init: function() {},
    render: render
  });

})();
