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
    var currentSchoolId = SchoolApp.store.currentSchoolId || 'svm_bokaro_001';
    if (currentSchoolId !== 'svm_bokaro_001') {
      return [];
    }
    var teachers = SchoolApp.store.teachers || [];

    if (state.subjectFilter !== 'all') {
      teachers = teachers.filter(function(t) {
        if (!t.subject) return false;
        var subjectsList = t.subject.split(',').map(function(s) { return s.trim().toLowerCase(); });
        return subjectsList.indexOf(state.subjectFilter.toLowerCase()) !== -1;
      });
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

    var isAdmin = SchoolApp.isAdmin();

    // Check if the shell layout is already rendered for the current user role
    var dataContainer = document.getElementById('teachers-data-container');
    var currentRenderedRole = container.getAttribute('data-rendered-role');
    var userRole = isAdmin ? 'admin' : 'teacher';

    if (!dataContainer || currentRenderedRole !== userRole) {
      container.setAttribute('data-rendered-role', userRole);
      var shellHtml = '';

      // Page Header
      shellHtml += '<div class="page-header">';
      var currentSchoolId = SchoolApp.store.currentSchoolId || 'svm_bokaro_001';
      var totalCount = (currentSchoolId === 'svm_bokaro_001') ? (SchoolApp.store.teachers || []).length : 0;
      shellHtml += '<h2><span class="material-icons-round">person</span> Teacher Management <span class="badge badge-purple" id="teachers-total-badge">' + totalCount + '</span></h2>';
      shellHtml += '<div class="header-actions">';
      shellHtml += '<button class="btn btn-secondary btn-sm" id="teacher-export-btn"><span class="material-icons-round">download</span> Export</button>';
      if (isAdmin) {
        shellHtml += '<button class="btn btn-primary" id="teacher-add-btn"><span class="material-icons-round">add</span> Add Teacher</button>';
      }
      shellHtml += '</div></div>';

      // Toolbar
      shellHtml += '<div class="toolbar">';
      shellHtml += '<div class="search-wrapper"><span class="material-icons-round">search</span><input type="text" id="teacher-search" placeholder="Search teachers..." value="' + (state.searchQuery || '') + '"></div>';
      shellHtml += '<div class="filter-group">';
      shellHtml += '<select class="form-select" id="teacher-subject-filter"><option value="all">All Subjects</option>';
      getSubjects().forEach(function(s) { shellHtml += '<option value="' + s + '"' + (state.subjectFilter === s ? ' selected' : '') + '>' + s + '</option>'; });
      shellHtml += '</select>';
      shellHtml += '<select class="form-select" id="teacher-status-filter"><option value="all">All Status</option><option value="Active"' + (state.statusFilter === 'Active' ? ' selected' : '') + '>Active</option><option value="Inactive"' + (state.statusFilter === 'Inactive' ? ' selected' : '') + '>Inactive</option></select>';
      shellHtml += '</div></div>';

      // Dynamic Data container
      shellHtml += '<div id="teachers-data-container"></div>';

      container.innerHTML = shellHtml;
      attachStaticEvents();
      dataContainer = document.getElementById('teachers-data-container');
    }

    // Keep search and filter controls in sync with state without full re-render
    var searchInput = document.getElementById('teacher-search');
    if (searchInput && searchInput.value !== state.searchQuery) {
      searchInput.value = state.searchQuery;
    }
    var subjectFilter = document.getElementById('teacher-subject-filter');
    if (subjectFilter && subjectFilter.value !== state.subjectFilter) {
      subjectFilter.value = state.subjectFilter;
    }
    var statusFilter = document.getElementById('teacher-status-filter');
    if (statusFilter && statusFilter.value !== state.statusFilter) {
      statusFilter.value = state.statusFilter;
    }

    // Update total badge count
    var totalBadge = document.getElementById('teachers-total-badge');
    if (totalBadge) {
      var currentSchoolId = SchoolApp.store.currentSchoolId || 'svm_bokaro_001';
      totalBadge.textContent = (currentSchoolId === 'svm_bokaro_001') ? (SchoolApp.store.teachers || []).length : 0;
    }

    var teachers = getFilteredTeachers();

    // Teacher Cards Grid dynamic render
    var html = '';
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

    dataContainer.innerHTML = html;
    attachDynamicEvents();
  }

  function attachStaticEvents() {
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
  }

  function attachDynamicEvents() {
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

  function updateClassSubjectMappingUI(existingTeacher) {
    var containerSection = document.getElementById('class-subject-mapping-section');
    var container = document.getElementById('class-subject-mapping-container');
    if (!containerSection || !container) return;

    var checkedCbs = document.querySelectorAll('.class-assign-cb:checked');
    if (checkedCbs.length === 0) {
      containerSection.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    containerSection.style.display = 'block';

    var selectedGlobalSubjects = [];
    document.querySelectorAll('.subject-cb:checked').forEach(function(cb) {
      selectedGlobalSubjects.push(cb.value);
    });

    if (selectedGlobalSubjects.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; padding: 8px 0;">Please select at least one Subject above.</div>';
      return;
    }

    var html = '';
    checkedCbs.forEach(function(cb) {
      var c = cb.getAttribute('data-class');
      var s = cb.getAttribute('data-section');
      var classSectionStr = c + '-' + s;

      var isCT = false;
      if (existingTeacher && existingTeacher.classTeacherOf) {
        isCT = existingTeacher.classTeacherOf.some(function(item) {
          return String(item.class).toLowerCase().trim() === String(c).toLowerCase().trim() &&
                 String(item.section).toLowerCase().trim() === String(s).toLowerCase().trim();
        });
      }

      var existingCTInput = document.querySelector('input[name="ct-' + classSectionStr + '"]');
      if (existingCTInput) {
        isCT = existingCTInput.checked;
      }

      html += '<div class="mapping-row" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">';
      html += '  <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">';
      html += '    <strong style="color: var(--text-primary); font-size: 14px;">Class ' + classSectionStr + '</strong>';
      html += '    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px; color: var(--accent-secondary); font-weight: 600;">';
      html += '      <input type="checkbox" name="ct-' + classSectionStr + '" value="1"' + (isCT ? ' checked' : '') + ' style="width: 14px; height: 14px;"> Is Class Teacher';
      html += '    </label>';
      html += '  </div>';
      
      html += '  <div style="display: flex; flex-direction: column; gap: 4px;">';
      html += '    <span style="font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Subjects taught in Class ' + classSectionStr + ' *</span>';
      html += '    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;">';
      
      selectedGlobalSubjects.forEach(function(sub) {
        var isSubAssigned = false;
        if (existingTeacher && existingTeacher.subjectTeacherOf) {
          isSubAssigned = existingTeacher.subjectTeacherOf.some(function(item) {
            return String(item.class).toLowerCase().trim() === String(c).toLowerCase().trim() &&
                   String(item.section).toLowerCase().trim() === String(s).toLowerCase().trim() &&
                   String(item.subject).toLowerCase().trim() === String(sub).toLowerCase().trim();
          });
        }

        var existingSubInput = document.querySelector('input[name="sub-' + classSectionStr + '"][value="' + sub + '"]');
        if (existingSubInput) {
          isSubAssigned = existingSubInput.checked;
        } else if (!existingTeacher) {
          if (selectedGlobalSubjects.length === 1) {
            isSubAssigned = true;
          }
        }

        html += '      <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px; background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-light);">';
        html += '        <input type="checkbox" name="sub-' + classSectionStr + '" value="' + sub + '"' + (isSubAssigned ? ' checked' : '') + ' style="width: 14px; height: 14px;"> ' + sub;
        html += '      </label>';
      });

      html += '    </div>';
      html += '    <span class="form-error" id="sub-error-' + classSectionStr + '" style="display: none; font-size: 11px; margin-top: 4px; color: var(--danger);">Select at least one subject</span>';
      html += '  </div>';
      html += '</div>';
    });

    container.innerHTML = html;
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

    // Global subjects checkboxes selection
    bodyHTML += '<div class="form-group full-width"><label class="form-label">Subjects Taught *</label>';
    bodyHTML += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; margin-top: 6px;">';
    getSubjects().forEach(function(s) {
      var isChecked = false;
      if (teacher) {
        if (Array.isArray(teacher.subject)) {
          isChecked = teacher.subject.indexOf(s) !== -1;
        } else if (typeof teacher.subject === 'string') {
          isChecked = teacher.subject.split(',').map(function(sub) { return sub.trim(); }).indexOf(s) !== -1;
        }
      }
      bodyHTML += '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; font-weight: 500;"><input type="checkbox" value="' + s + '"' + (isChecked ? ' checked' : '') + ' class="subject-cb" style="width: 16px; height: 16px;"> ' + s + '</label>';
    });
    bodyHTML += '</div><span class="form-error" id="subject-error" style="display: none;">Select at least one subject</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Qualification *</label><input type="text" class="form-input" name="qualification" value="' + (teacher ? teacher.qualification : '') + '" required><span class="form-error">Required</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Joining Date</label><input type="date" class="form-input" name="joiningDate" value="' + (teacher ? teacher.joiningDate : new Date().toISOString().split('T')[0]) + '"></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Password' + (isEdit ? '' : ' *') + '</label><div class="password-wrapper"><input type="password" class="form-input" name="password" value="' + (isEdit ? '' : 'teacher123') + '" placeholder="' + (isEdit ? 'Leave blank to keep current' : 'Minimum 6 characters') + '"><i class="fa fa-eye toggle-password"></i></div><span class="form-error">Min 6 characters</span></div>';

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
    bodyHTML += '</div><span class="form-error" id="class-error" style="display: none;">Select at least one class</span></div>';

    // Class-Subject and Class Teacher Mapping Section
    bodyHTML += '<div class="form-group full-width" id="class-subject-mapping-section" style="margin-top: 15px; display: none;">';
    bodyHTML += '<label class="form-label">Class-Subject & Class Teacher Mapping *</label>';
    bodyHTML += '<div id="class-subject-mapping-container" style="display: flex; flex-direction: column; gap: 10px; margin-top: 8px;"></div>';
    bodyHTML += '</div>';

    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="teacher-save-btn"><span class="material-icons-round">save</span> ' + (isEdit ? 'Update' : 'Add') + ' Teacher</button>';

    SchoolApp.showModal((isEdit ? 'Edit' : 'Add New') + ' Teacher', bodyHTML, footerHTML);

    // Initial load of class-subject mapping
    updateClassSubjectMappingUI(teacher);

    // Attach dynamic listeners
    document.querySelectorAll('.class-assign-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        updateClassSubjectMappingUI(teacher);
      });
    });

    document.querySelectorAll('.subject-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        updateClassSubjectMappingUI(teacher);
      });
    });

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
      // Skip Class Teacher / Subject checkbox inputs, they are processed separately
      if (name.indexOf('ct-') === 0 || name.indexOf('sub-') === 0) return;

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

    // Collect global subjects
    var selectedGlobalSubjects = [];
    form.querySelectorAll('.subject-cb:checked').forEach(function(cb) {
      selectedGlobalSubjects.push(cb.value);
    });

    if (selectedGlobalSubjects.length === 0) {
      document.getElementById('subject-error').style.display = 'block';
      valid = false;
    } else {
      document.getElementById('subject-error').style.display = 'none';
    }

    // Collect assigned classes and mappings
    var assignedClasses = [];
    var classTeacherOf = [];
    var subjectTeacherOf = [];

    form.querySelectorAll('.class-assign-cb:checked').forEach(function(cb) {
      var clsVal = cb.getAttribute('data-class');
      var secVal = cb.getAttribute('data-section');
      if (clsVal && secVal) {
        var classSectionStr = clsVal + '-' + secVal;
        assignedClasses.push({
          class: String(clsVal).trim(),
          section: String(secVal).trim()
        });

        // Check if Class Teacher checkbox is checked for this class
        var ctInput = form.querySelector('input[name="ct-' + classSectionStr + '"]');
        if (ctInput && ctInput.checked) {
          classTeacherOf.push({
            class: String(clsVal).trim(),
            section: String(secVal).trim()
          });
        }

        // Collect checked subjects for this class
        var classSubCbs = form.querySelectorAll('input[name="sub-' + classSectionStr + '"]:checked');
        var subErrorEl = document.getElementById('sub-error-' + classSectionStr);
        if (classSubCbs.length === 0) {
          if (subErrorEl) subErrorEl.style.display = 'block';
          valid = false;
        } else {
          if (subErrorEl) subErrorEl.style.display = 'none';
          classSubCbs.forEach(function(subCb) {
            subjectTeacherOf.push({
              class: String(clsVal).trim(),
              section: String(secVal).trim(),
              subject: String(subCb.value).trim()
            });
          });
        }
      }
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

    // Enforce strict One Class Teacher Per Class Validation
    var conflictFound = false;
    var conflictingTeacherName = '';
    
    for (var i = 0; i < classTeacherOf.length; i++) {
      var proposedCT = classTeacherOf[i];
      var propClass = String(proposedCT.class).toLowerCase().trim();
      var propSection = String(proposedCT.section).toLowerCase().trim();

      // Find if any other teacher has this class/section in classTeacherOf
      var conflictingTeacher = (SchoolApp.store.teachers || []).find(function(t) {
        if (existing && t.id === existing.id) return false; // skip current teacher
        var otherCT = t.classTeacherOf || [];
        return otherCT.some(function(item) {
          return String(item.class).toLowerCase().trim() === propClass &&
                 String(item.section).toLowerCase().trim() === propSection;
        });
      });

      if (conflictingTeacher) {
        conflictFound = true;
        conflictingTeacherName = conflictingTeacher.firstName + ' ' + conflictingTeacher.lastName;
        break;
      }
    }

    if (conflictFound) {
      SchoolApp.showToast('Validation Error: ' + conflictingTeacherName + ' is already assigned as the Class Teacher for this class.', 'error');
      return;
    }

    // Assign collected values
    fields.subject = selectedGlobalSubjects.join(', ');
    fields.assignedClasses = assignedClasses;
    fields.classTeacherOf = classTeacherOf;
    fields.subjectTeacherOf = subjectTeacherOf;

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
    render: render,
    viewTeacher: viewTeacher
  });

})();
