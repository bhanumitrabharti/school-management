'use strict';

/* ============================================================
   Shishu Vikash Mandir - Teacher Management Module
   ============================================================ */

(function() {

  var state = {
    searchQuery: '',
    subjectFilter: 'all',
    statusFilter: 'all'
  };

  function getFilteredTeachers() {
    var teachers = SchoolApp.store.teachers || [];

    if (state.subjectFilter !== 'all') {
      teachers = teachers.filter(function(t) { return t.subject === state.subjectFilter; });
    }
    if (state.statusFilter !== 'all') {
      teachers = teachers.filter(function(t) { return t.status === state.statusFilter; });
    }
    if (state.searchQuery) {
      var q = state.searchQuery.toLowerCase();
      teachers = teachers.filter(function(t) {
        return (t.firstName + ' ' + t.lastName).toLowerCase().indexOf(q) !== -1 ||
               t.email.toLowerCase().indexOf(q) !== -1 ||
               t.subject.toLowerCase().indexOf(q) !== -1;
      });
    }

    return teachers;
  }

  function getSubjects() {
    return ['Mathematics', 'Science', 'English', 'Social Studies', 'Hindi', 'Computer Science', 'Physical Education', 'Art'];
  }

  function render() {
    var container = document.getElementById('page-teachers');
    if (!container) return;

    var teachers = getFilteredTeachers();
    var isAdmin = SchoolApp.isAdmin();

    var html = '';

    // Page Header
    html += '<div class="page-header">';
    html += '<h2><span class="material-icons-round">person</span> Teacher Management <span class="badge badge-purple">' + SchoolApp.store.teachers.length + '</span></h2>';
    html += '<div class="header-actions">';
    html += '<button class="btn btn-secondary btn-sm" id="teacher-export-btn"><span class="material-icons-round">download</span> Export</button>';
    if (isAdmin) {
      html += '<button class="btn btn-primary" id="teacher-add-btn"><span class="material-icons-round">add</span> Add Teacher</button>';
    }
    html += '</div></div>';

    // Toolbar
    html += '<div class="toolbar">';
    html += '<div class="search-wrapper"><span class="material-icons-round">search</span><input type="text" id="teacher-search" placeholder="Search teachers..." value="' + (state.searchQuery || '') + '"></div>';
    html += '<div class="filter-group">';
    html += '<select class="form-select" id="teacher-subject-filter"><option value="all">All Subjects</option>';
    getSubjects().forEach(function(s) { html += '<option value="' + s + '"' + (state.subjectFilter === s ? ' selected' : '') + '>' + s + '</option>'; });
    html += '</select>';
    html += '<select class="form-select" id="teacher-status-filter"><option value="all">All Status</option><option value="Active"' + (state.statusFilter === 'Active' ? ' selected' : '') + '>Active</option><option value="Inactive"' + (state.statusFilter === 'Inactive' ? ' selected' : '') + '>Inactive</option></select>';
    html += '</div></div>';

    // Teacher Cards Grid
    if (teachers.length > 0) {
      html += '<div class="teachers-grid">';
      teachers.forEach(function(t) {
        var initials = SchoolApp.getInitials(t.firstName, t.lastName);
        var color = SchoolApp.getAvatarColor(t.firstName + t.lastName);

        html += '<div class="teacher-card">';
        html += '<div class="teacher-card-header">';
        html += '<div class="avatar avatar-lg" data-color="' + color + '">' + initials + '</div>';
        html += '<div class="teacher-card-info"><div class="teacher-card-name">' + t.firstName + ' ' + t.lastName + '</div>';
        html += '<div class="teacher-card-subject">' + t.subject + '</div></div></div>';

        html += '<div class="teacher-card-detail"><span class="material-icons-round">email</span>' + t.email + '</div>';
        html += '<div class="teacher-card-detail"><span class="material-icons-round">phone</span>' + t.phone + '</div>';
        html += '<div class="teacher-card-detail"><span class="material-icons-round">school</span>' + t.qualification + '</div>';

        html += '<div class="teacher-card-classes">';
        (t.assignedClasses || []).forEach(function(c) {
          html += '<span class="badge badge-info">' + c.class + '-' + c.section + '</span>';
        });
        html += '</div>';

        html += '<div class="teacher-card-footer">';
        html += '<div class="status-indicator"><span class="status-dot ' + (t.status === 'Active' ? 'active' : 'inactive') + '"></span>' + t.status + '</div>';
        html += '<div class="table-actions">';
        html += '<button class="btn-icon teacher-view-btn" data-id="' + t.id + '" title="View"><span class="material-icons-round">visibility</span></button>';
        if (isAdmin) {
          html += '<button class="btn-icon teacher-edit-btn" data-id="' + t.id + '" title="Edit"><span class="material-icons-round">edit</span></button>';
          html += '<button class="btn-icon teacher-delete-btn" data-id="' + t.id + '" title="Delete"><span class="material-icons-round">delete</span></button>';
        }
        html += '</div></div>';

        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="empty-state"><span class="material-icons-round">person_off</span><h3>No Teachers Found</h3><p>No teachers match your current filters.</p></div>';
    }

    container.innerHTML = html;
    attachEvents();
  }

  function attachEvents() {
    var searchInput = document.getElementById('teacher-search');
    if (searchInput) searchInput.addEventListener('input', function() { state.searchQuery = this.value; render(); });

    var subjectFilter = document.getElementById('teacher-subject-filter');
    if (subjectFilter) subjectFilter.addEventListener('change', function() { state.subjectFilter = this.value; render(); });

    var statusFilter = document.getElementById('teacher-status-filter');
    if (statusFilter) statusFilter.addEventListener('change', function() { state.statusFilter = this.value; render(); });

    var addBtn = document.getElementById('teacher-add-btn');
    if (addBtn) addBtn.addEventListener('click', function() { showTeacherForm(null); });

    var exportBtn = document.getElementById('teacher-export-btn');
    if (exportBtn) exportBtn.addEventListener('click', function() { exportTeachers(); });

    document.querySelectorAll('.teacher-view-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { viewTeacher(this.getAttribute('data-id')); });
    });

    document.querySelectorAll('.teacher-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var teacher = SchoolApp.store.teachers.find(function(t) { return t.id === btn.getAttribute('data-id'); });
        showTeacherForm(teacher);
      });
    });

    document.querySelectorAll('.teacher-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { deleteTeacher(this.getAttribute('data-id')); });
    });
  }

  function showTeacherForm(teacher) {
    var isEdit = !!teacher;
    var classes = SchoolApp.store.settings.classes || [];
    var sections = SchoolApp.store.settings.sections || [];

    var bodyHTML = '<form id="teacher-form" class="form-grid">';

    bodyHTML += '<div class="form-group"><label class="form-label">First Name *</label><input type="text" class="form-input" name="firstName" value="' + (teacher ? teacher.firstName : '') + '" required><span class="form-error">Required</span></div>';
    bodyHTML += '<div class="form-group"><label class="form-label">Last Name *</label><input type="text" class="form-input" name="lastName" value="' + (teacher ? teacher.lastName : '') + '" required><span class="form-error">Required</span></div>';
    bodyHTML += '<div class="form-group"><label class="form-label">Email *</label><input type="email" class="form-input" name="email" value="' + (teacher ? teacher.email : '') + '" required><span class="form-error">Valid email required</span></div>';
    bodyHTML += '<div class="form-group"><label class="form-label">Phone *</label><input type="text" class="form-input" name="phone" value="' + (teacher ? teacher.phone : '') + '" required><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Subject *</label><select class="form-select" name="subject" required><option value="">Select Subject</option>';
    getSubjects().forEach(function(s) { bodyHTML += '<option value="' + s + '"' + (teacher && teacher.subject === s ? ' selected' : '') + '>' + s + '</option>'; });
    bodyHTML += '</select><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Qualification *</label><input type="text" class="form-input" name="qualification" value="' + (teacher ? teacher.qualification : '') + '" required><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Joining Date</label><input type="date" class="form-input" name="joiningDate" value="' + (teacher ? teacher.joiningDate : new Date().toISOString().split('T')[0]) + '"></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Password' + (isEdit ? '' : ' *') + '</label><input type="text" class="form-input" name="password" value="' + (isEdit ? '' : 'teacher123') + '" placeholder="' + (isEdit ? 'Leave blank to keep current' : 'Minimum 6 characters') + '"><span class="form-error">Min 6 characters</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Status</label><select class="form-select" name="status">';
    ['Active', 'Inactive'].forEach(function(s) { bodyHTML += '<option value="' + s + '"' + (teacher && teacher.status === s ? ' selected' : '') + '>' + s + '</option>'; });
    bodyHTML += '</select></div>';

    // Class Assignment Grid
    bodyHTML += '<div class="form-group full-width"><label class="form-label">Assigned Classes *</label>';
    bodyHTML += '<div class="class-grid">';
    bodyHTML += '<div class="class-grid-header"></div>';
    sections.forEach(function(s) { bodyHTML += '<div class="class-grid-header">' + s + '</div>'; });

    classes.forEach(function(c) {
      bodyHTML += '<div class="class-grid-label">Class ' + c + '</div>';
      sections.forEach(function(s) {
        var checked = teacher && teacher.assignedClasses && teacher.assignedClasses.some(function(ac) {
          return ac.class === c && ac.section === s;
        });
        bodyHTML += '<div class="class-grid-cell"><input type="checkbox" class="class-assign-cb" data-class="' + c + '" data-section="' + s + '"' + (checked ? ' checked' : '') + '></div>';
      });
    });
    bodyHTML += '</div><span class="form-error" id="class-error">Select at least one class</span></div>';

    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="teacher-save-btn"><span class="material-icons-round">save</span> ' + (isEdit ? 'Update' : 'Add') + ' Teacher</button>';

    SchoolApp.showModal((isEdit ? 'Edit' : 'Add New') + ' Teacher', bodyHTML, footerHTML);

    document.getElementById('teacher-save-btn').addEventListener('click', function() {
      saveTeacher(teacher);
    });
  }

  function saveTeacher(existing) {
    var form = document.getElementById('teacher-form');
    if (!form) return;

    var fields = {};
    var inputs = form.querySelectorAll('input[name], select[name]');
    var valid = true;

    inputs.forEach(function(input) {
      var name = input.name;
      var value = input.value.trim();
      fields[name] = value;

      var group = input.closest('.form-group');
      if (input.required && !value) {
        if (group) group.classList.add('error');
        valid = false;
      } else {
        if (group) group.classList.remove('error');
      }
    });

    // Validate email
    if (fields.email && !SchoolApp.utils.validate.email(fields.email)) {
      form.querySelector('[name="email"]').closest('.form-group').classList.add('error');
      valid = false;
    }

    // Validate password for new teachers
    if (!existing && fields.password && fields.password.length < 6) {
      form.querySelector('[name="password"]').closest('.form-group').classList.add('error');
      valid = false;
    }

    // Get assigned classes
    var assignedClasses = [];
    form.querySelectorAll('.class-assign-cb:checked').forEach(function(cb) {
      assignedClasses.push({
        class: cb.getAttribute('data-class'),
        section: cb.getAttribute('data-section')
      });
    });

    if (assignedClasses.length === 0) {
      document.getElementById('class-error').style.display = 'block';
      valid = false;
    } else {
      document.getElementById('class-error').style.display = 'none';
    }

    if (!valid) {
      SchoolApp.showToast('Please fill all required fields correctly.', 'error');
      return;
    }

    fields.assignedClasses = assignedClasses;

    if (existing) {
      var idx = SchoolApp.store.teachers.findIndex(function(t) { return t.id === existing.id; });
      if (idx !== -1) {
        if (!fields.password) fields.password = existing.password; // Keep existing password
        Object.assign(SchoolApp.store.teachers[idx], fields);
        SchoolApp.showToast('Teacher updated successfully.', 'success');
      }
    } else {
      fields.id = SchoolApp.generateId();
      SchoolApp.store.teachers.push(fields);
      SchoolApp.showToast('Teacher added successfully.', 'success');
    }

    SchoolApp.save();
    SchoolApp.closeModal();
    render();
  }

  function viewTeacher(id) {
    var teacher = SchoolApp.store.teachers.find(function(t) { return t.id === id; });
    if (!teacher) return;

    var initials = SchoolApp.getInitials(teacher.firstName, teacher.lastName);
    var color = SchoolApp.getAvatarColor(teacher.firstName + teacher.lastName);

    // Count students in assigned classes
    var studentCount = 0;
    (teacher.assignedClasses || []).forEach(function(ac) {
      studentCount += SchoolApp.store.students.filter(function(s) {
        return s.class === ac.class && s.section === ac.section;
      }).length;
    });

    var html = '<div class="detail-header">';
    html += '<div class="avatar avatar-xl" data-color="' + color + '">' + initials + '</div>';
    html += '<div><div class="detail-name">' + teacher.firstName + ' ' + teacher.lastName + '</div>';
    html += '<div class="detail-subtitle">' + teacher.subject + '</div>';
    html += '<span class="badge ' + (teacher.status === 'Active' ? 'badge-success' : 'badge-danger') + '">' + teacher.status + '</span>';
    html += '</div></div>';

    html += '<div class="detail-section"><h4><span class="material-icons-round">person</span> Personal Information</h4><div class="detail-grid">';
    html += '<div class="detail-item"><span class="detail-item-label">Email</span><span class="detail-item-value">' + teacher.email + '</span></div>';
    html += '<div class="detail-item"><span class="detail-item-label">Phone</span><span class="detail-item-value">' + teacher.phone + '</span></div>';
    html += '</div></div>';

    html += '<div class="detail-section"><h4><span class="material-icons-round">work</span> Professional Information</h4><div class="detail-grid">';
    html += '<div class="detail-item"><span class="detail-item-label">Subject</span><span class="detail-item-value">' + teacher.subject + '</span></div>';
    html += '<div class="detail-item"><span class="detail-item-label">Qualification</span><span class="detail-item-value">' + teacher.qualification + '</span></div>';
    html += '<div class="detail-item"><span class="detail-item-label">Joining Date</span><span class="detail-item-value">' + SchoolApp.formatDate(teacher.joiningDate) + '</span></div>';
    html += '<div class="detail-item"><span class="detail-item-label">Total Students</span><span class="detail-item-value">' + studentCount + '</span></div>';
    html += '</div></div>';

    html += '<div class="detail-section"><h4><span class="material-icons-round">class</span> Assigned Classes</h4>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px">';
    (teacher.assignedClasses || []).forEach(function(ac) {
      var classStudents = SchoolApp.store.students.filter(function(s) { return s.class === ac.class && s.section === ac.section; }).length;
      html += '<span class="badge badge-info">Class ' + ac.class + '-' + ac.section + ' (' + classStudents + ' students)</span>';
    });
    html += '</div></div>';

    if (SchoolApp.isAdmin()) {
      html += '<div class="detail-section"><h4><span class="material-icons-round">vpn_key</span> Login Credentials</h4><div class="detail-grid">';
      html += '<div class="detail-item"><span class="detail-item-label">Login Email</span><span class="detail-item-value">' + teacher.email + '</span></div>';
      html += '<div class="detail-item"><span class="detail-item-label">Password</span><span class="detail-item-value" style="font-family:monospace">••••••••</span></div>';
      html += '</div></div>';
    }

    SchoolApp.showModal('Teacher Details', html, '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>');
  }

  function deleteTeacher(id) {
    var teacher = SchoolApp.store.teachers.find(function(t) { return t.id === id; });
    if (!teacher) return;
    SchoolApp.showConfirm('Delete teacher "' + teacher.firstName + ' ' + teacher.lastName + '"? They can be recovered from the Recycle Bin.', function() {
      SchoolApp.moveToTrash('teacher', teacher.id, teacher.firstName + ' ' + teacher.lastName, teacher.subject, teacher);
      SchoolApp.store.teachers = SchoolApp.store.teachers.filter(function(t) { return t.id !== id; });
      SchoolApp.save();
      SchoolApp.showToast('Teacher moved to Recycle Bin.', 'success');
      render();
    });
  }

  function exportTeachers() {
    var columns = [
      { header: 'First Name', key: 'firstName' },
      { header: 'Last Name', key: 'lastName' },
      { header: 'Email', key: 'email' },
      { header: 'Phone', key: 'phone' },
      { header: 'Subject', key: 'subject' },
      { header: 'Qualification', key: 'qualification' },
      { header: 'Assigned Classes', key: 'assignedClasses', transform: function(val) {
        return (val || []).map(function(c) { return c.class + '-' + c.section; }).join(', ');
      }},
      { header: 'Joining Date', key: 'joiningDate' },
      { header: 'Status', key: 'status' }
    ];
    var dateStr = new Date().toISOString().split('T')[0];
    SchoolApp.utils.exportToExcel(getFilteredTeachers(), columns, 'teachers_export_' + dateStr + '.xlsx');
  }

  // Register Module
  SchoolApp.registerModule('teachers', {
    init: function() {},
    render: render
  });

})();
