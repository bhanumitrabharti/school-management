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

  function getSubjects(teacher) {
    var settings = SchoolApp.store.settings || {};
    var base = settings.subjects || ['Hindi', 'English', 'Mathematics', 'Science', 'Social Studies', 'Computer Science', 'Sanskrit', 'Art'];
    var subjectSet = new Set(base);
    if (teacher) {
      if (typeof teacher.subject === 'string') {
        teacher.subject.split(',').forEach(function(s) { if (s.trim()) subjectSet.add(s.trim()); });
      } else if (Array.isArray(teacher.subject)) {
        teacher.subject.forEach(function(s) { if (s && s.trim()) subjectSet.add(s.trim()); });
      }
      if (Array.isArray(teacher.subjectTeacherOf)) {
        teacher.subjectTeacherOf.forEach(function(st) { if (st && st.subject && st.subject.trim()) subjectSet.add(st.subject.trim()); });
      }
    }
    return Array.from(subjectSet);
  }

  function render() {
    var container = document.getElementById('page-teachers');
    if (!container) return;

    if (!window.assertSchoolIsolation(SchoolApp.store.teachers, SchoolApp.store.currentSchoolId)) {
      console.error("[SECURITY] Data isolation breach detected in Teachers Tab!");
      SchoolApp.showToast("Security error. Please logout and login again.", "error");
      SchoolApp.logout();
      return;
    }

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
      var totalCount = (SchoolApp.store.teachers || []).length;
      shellHtml += '<h2><span class="material-icons-round">person</span> Teacher Management <span class="badge badge-purple" id="teachers-total-badge">' + totalCount + '</span></h2>';
      shellHtml += '<div class="header-actions">';
      shellHtml += '<button class="btn btn-secondary btn-sm" id="teacher-export-btn"><span class="material-icons-round">download</span> Export</button>';
      var canAdd = isAdmin && SchoolApp.checkFeatureAccess('teachers');
      if (canAdd) {
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
      totalBadge.textContent = (SchoolApp.store.teachers || []).length;
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

        html += '<div class="teacher-card-detail"><span class="material-icons-round">vpn_key</span><strong>Login ID:</strong> ' + t.email + '</div>';
        html += '<div class="teacher-card-detail"><span class="material-icons-round">phone</span>' + t.phone + '</div>';
        html += '<div class="teacher-card-detail"><span class="material-icons-round">school</span>' + t.qualification + '</div>';

        html += '<div class="teacher-card-classes">';
        if (t.classTeacherOf && t.classTeacherOf.length > 0) {
          t.classTeacherOf.forEach(function(ct) {
            var ctCls = (ct.class && ct.class.startsWith('Class ')) ? ct.class : ('Class ' + (ct.class || ''));
            html += '<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 11px; font-weight: 600;" title="Class Teacher"><span class="material-icons-round" style="font-size: 11px; vertical-align: middle;">stars</span> ' + ctCls + '-' + ct.section + ' (CT)</span>';
          });
        }
        (t.assignedClasses || []).forEach(function(c) {
          var clsStr = (c.class && c.class.startsWith('Class ')) ? c.class : ('Class ' + (c.class || ''));
          html += '<span class="badge badge-info">' + clsStr + '-' + c.section + '</span>';
        });
        html += '</div>';

        html += '<div class="teacher-card-footer">';
        html += '<div class="status-indicator"><span class="status-dot ' + (t.status === 'Active' ? 'active' : 'inactive') + '"></span>' + t.status + '</div>';
        html += '<div class="table-actions">';
        html += '<button class="btn-icon teacher-view-btn" data-id="' + t.id + '" title="View"><span class="material-icons-round">visibility</span></button>';
        var canEdit = isAdmin && SchoolApp.checkFeatureAccess('teachers');
        if (canEdit) {
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
        if (Array.isArray(existingTeacher.classTeacherOf)) {
          isCT = existingTeacher.classTeacherOf.some(function(item) {
            return String(item.class).toLowerCase().trim() === String(c).toLowerCase().trim() &&
                   String(item.section).toLowerCase().trim() === String(s).toLowerCase().trim();
          });
        } else if (typeof existingTeacher.classTeacherOf === 'string') {
          var str = existingTeacher.classTeacherOf.toLowerCase().replace('class', '').trim();
          isCT = str.includes(String(c).toLowerCase().trim() + '-' + String(s).toLowerCase().trim()) ||
                 str.includes(String(c).toLowerCase().trim());
        }
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
        if (existingTeacher && existingTeacher.subjectTeacherOf && Array.isArray(existingTeacher.subjectTeacherOf)) {
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

  // ── TeacherProfileService (Teacher Subcollections Storage Engine) ──────────
  var TeacherProfileService = {
    getTeacherProfile: async function(schoolId, teacherId) {
      if (!schoolId || !teacherId) {
        return { teacherId: teacherId, customFields: {}, updatedAt: null, updatedBy: null };
      }
      try {
        var db = window.db;
        var fs = window.firestore;
        var docRef = fs.doc(db, 'tenant_data', schoolId, 'teacher_profiles', teacherId);
        var snap = await fs.getDoc(docRef);
        if (snap.exists()) {
          var data = snap.data();
          return {
            teacherId: teacherId,
            customFields: data.customFields || {},
            updatedAt: data.updatedAt || null,
            updatedBy: data.updatedBy || null
          };
        }
      } catch (err) {
        console.warn('[TeacherProfileService] getTeacherProfile warning for ' + teacherId + ':', err);
      }
      return { teacherId: teacherId, customFields: {}, updatedAt: null, updatedBy: null };
    },

    saveTeacherWithProfile: async function(schoolId, coreTeacherData, customFieldValues, expectedUpdatedAt) {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem("isImpersonating") === "true") {
        console.warn("[Security] Write blocked: Super Admin impersonation mode.");
        SchoolApp.showToast("View-only mode. Changes not saved during impersonation.", "warning");
        return { success: false, reason: 'impersonating' };
      }

      var db = window.db;
      var fs = window.firestore;
      var teacherId = coreTeacherData.id;

      var profileDocRef = fs.doc(db, 'tenant_data', schoolId, 'teacher_profiles', teacherId);
      var rootDocRef = fs.doc(db, 'tenant_data', schoolId);

      // Stale-Write Protection: Check if server doc was updated since this edit form opened
      if (expectedUpdatedAt) {
        try {
          var liveSnap = await fs.getDoc(profileDocRef);
          if (liveSnap.exists()) {
            var liveData = liveSnap.data();
            var liveUpdatedAt = liveData && liveData.updatedAt;
            if (liveUpdatedAt && liveUpdatedAt !== expectedUpdatedAt) {
              console.warn('[TeacherProfileService] Stale write collision detected. Server:', liveUpdatedAt, 'Local expected:', expectedUpdatedAt);
              return {
                success: false,
                staleConflict: true,
                serverData: liveData,
                pendingCustomFields: customFieldValues
              };
            }
          }
        } catch (e) {
          console.warn('[TeacherProfileService] Stale check error (proceeding):', e);
        }
      }

      var nowIso = new Date().toISOString();
      var updatedByInfo = {
        uid: (SchoolApp.currentUser && SchoolApp.currentUser.uid) || 'admin',
        name: (SchoolApp.currentUser && (SchoolApp.currentUser.name || SchoolApp.currentUser.email)) || 'Admin'
      };

      // Profile doc
      var profileDoc = {
        teacherId: teacherId,
        schoolId: schoolId,
        customFields: customFieldValues || {},
        updatedAt: nowIso,
        updatedBy: updatedByInfo
      };

      // Update root teachers array in memory
      var currentTeachers = (SchoolApp.store.teachers || []).slice();
      var existingIdx = currentTeachers.findIndex(function(t) { return t.id === teacherId; });
      if (existingIdx !== -1) {
        currentTeachers[existingIdx] = Object.assign({}, currentTeachers[existingIdx], coreTeacherData);
      } else {
        currentTeachers.push(coreTeacherData);
      }

      // Temporarily stage in store to build and guard the full root payload
      var prevStoreTeachers = SchoolApp.store.teachers;
      SchoolApp.store.teachers = currentTeachers;

      var prep = (typeof SchoolApp.prepareSavePayload === 'function') ? SchoolApp.prepareSavePayload() : null;
      var rootPayload = (prep && prep.success) ? prep.payload : { teachers: currentTeachers };
      if (prep && !prep.success) {
        SchoolApp.store.teachers = prevStoreTeachers; // revert on validation failure
        return { success: false, reason: prep.reason || 'Validation failed' };
      }

      // Construct atomic writeBatch writing the exact guarded rootPayload and teacher profile
      var batch = fs.writeBatch(db);
      batch.set(rootDocRef, rootPayload, { merge: true });
      batch.set(profileDocRef, profileDoc);

      await batch.commit();

      // Commit to local in-memory store and cache
      SchoolApp.store.teachers = currentTeachers;
      try {
        var cachedRaw = localStorage.getItem('cached_tenant_data_' + schoolId);
        if (cachedRaw) {
          var cached = JSON.parse(cachedRaw);
          cached.teachers = currentTeachers;
          localStorage.setItem('cached_tenant_data_' + schoolId, JSON.stringify(cached));
        }
      } catch (err) {
        console.warn('Cache update warning:', err);
      }

      return { success: true, updatedAt: nowIso };
    }
  };

  window.TeacherProfileService = TeacherProfileService;

  function showTeacherStaleWriteDiffModal(teacher, serverData, pendingCustomFields, expectedUpdatedAt) {
    var defs = (SchoolApp.store.settings && SchoolApp.store.settings.customFieldDefinitions && SchoolApp.store.settings.customFieldDefinitions.teacher) || [];
    var serverFields = serverData.customFields || {};
    var serverBy = (serverData.updatedBy && serverData.updatedBy.name) ? serverData.updatedBy.name : 'Another Administrator';
    var serverTime = serverData.updatedAt ? new Date(serverData.updatedAt).toLocaleTimeString() : 'recently';

    var html = '<div style="margin-bottom:16px;">';
    html += '<div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:12px; margin-bottom:16px;">';
    html += '<p style="margin:0; font-size:13px; color:#EF4444; font-weight:600;"><span class="material-icons-round" style="vertical-align:middle; font-size:18px;">warning</span> Concurrency Conflict Detected</p>';
    html += '<p style="margin:6px 0 0 0; font-size:12px; color:var(--text-secondary); line-height:1.5;">This teacher profile was updated on the server by <strong>' + SchoolApp.escapeHTML(serverBy) + '</strong> at ' + SchoolApp.escapeHTML(serverTime) + ' after you opened the form. Your unsaved changes were NOT overwritten.</p>';
    html += '</div>';

    html += '<table style="width:100%; border-collapse:collapse; font-size:12px; border:1px solid var(--border-color);">';
    html += '<thead style="background:var(--bg-tertiary);">';
    html += '<tr><th style="padding:8px; text-align:left; border-bottom:1px solid var(--border-color);">Field</th><th style="padding:8px; text-align:left; border-bottom:1px solid var(--border-color); color:#10B981;">Server Value (Current)</th><th style="padding:8px; text-align:left; border-bottom:1px solid var(--border-color); color:#F59E0B;">Your Pending Value</th></tr>';
    html += '</thead><tbody>';

    defs.forEach(function(def) {
      if (def.status === 'archived') return;
      var sVal = serverFields[def.fieldId] || '—';
      var pVal = (pendingCustomFields && pendingCustomFields[def.fieldId]) || '—';
      var isDiff = String(sVal).trim() !== String(pVal).trim();
      var rowStyle = isDiff ? 'background:rgba(245,158,11,0.08); font-weight:600;' : '';
      html += '<tr style="' + rowStyle + '">';
      html += '<td style="padding:8px; border-bottom:1px solid var(--border-color);">' + SchoolApp.escapeHTML(def.label) + '</td>';
      html += '<td style="padding:8px; border-bottom:1px solid var(--border-color); color:#10B981;">' + SchoolApp.escapeHTML(String(sVal)) + '</td>';
      html += '<td style="padding:8px; border-bottom:1px solid var(--border-color); color:#F59E0B;">' + SchoolApp.escapeHTML(String(pVal)) + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>';
    footerHTML += '<button class="btn btn-primary" id="t-conflict-reload-server-btn"><span class="material-icons-round">refresh</span> Reload Server Data</button>';

    SchoolApp.showModal('Conflict: Stale Write Detected', html, footerHTML);

    var reloadBtn = document.getElementById('t-conflict-reload-server-btn');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', function() {
        SchoolApp.closeModal();
        setTimeout(function() {
          showTeacherForm(teacher);
        }, 150);
      });
    }
  }

  var _currentEditingTeacherLoadedUpdatedAt = null;
  var _currentEditingTeacherInitialCustomFields = {};

  async function showTeacherForm(teacher) {
    var isEdit = !!teacher;
    var settings = SchoolApp.store.settings || {};
    var schoolId = (SchoolApp.store && SchoolApp.store.currentSchoolId) || 'default';
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

    _currentEditingTeacherLoadedUpdatedAt = null;
    _currentEditingTeacherInitialCustomFields = {};

    if (isEdit) {
      SchoolApp.showLoader('Loading teacher profile...');
      try {
        var profile = await TeacherProfileService.getTeacherProfile(schoolId, teacher.id);
        _currentEditingTeacherLoadedUpdatedAt = profile.updatedAt || null;
        _currentEditingTeacherInitialCustomFields = profile.customFields || {};
      } catch (e) {
        console.warn('Failed to load teacher profile:', e);
      } finally {
        SchoolApp.hideLoader();
      }
    }

    var defs = (settings.customFieldDefinitions && settings.customFieldDefinitions.teacher) || [];
    var activeDefs = defs.filter(function(d) { return d.status !== 'archived'; })
                         .sort(function(a, b) { return (a.order || 0) - (b.order || 0); });

    var fieldsBySection = {
      personal: [],
      academic: [],
      employment: [],
      other: []
    };
    activeDefs.forEach(function(d) {
      var sec = d.section || 'other';
      if (!fieldsBySection[sec]) fieldsBySection[sec] = [];
      fieldsBySection[sec].push(d);
    });

    function renderTeacherCustomFieldsForSection(secList) {
      if (!secList || secList.length === 0) return '';
      var out = '';
      secList.forEach(function(d) {
        var val = isEdit ? (_currentEditingTeacherInitialCustomFields[d.fieldId] || '') : '';
        var wasInitiallyEmpty = isEdit && (!_currentEditingTeacherInitialCustomFields[d.fieldId]);
        var isRequired = !!d.required;
        var reqLabel = '';

        if (isRequired) {
          if (isEdit && wasInitiallyEmpty) {
            reqLabel = ' <span class="badge badge-warning" style="font-size:10px; margin-left:6px; background:rgba(245,158,11,0.15); color:#F59E0B; padding:2px 6px; border-radius:4px; font-weight:500;">Missing Info (Optional for existing record)</span>';
          } else {
            reqLabel = ' *';
          }
        } else {
          reqLabel = ' <span style="color:#9CA3AF;font-weight:400;font-size:12px;">(Optional)</span>';
        }

        var fullWidthClass = (d.type === 'text' && d.label.length > 25) ? ' full-width' : '';
        out += '<div class="form-group' + fullWidthClass + '">';
        out += '  <label class="form-label">' + SchoolApp.escapeHTML(d.label) + reqLabel + '</label>';

        if (d.type === 'dropdown') {
          var opts = Array.isArray(d.options) ? d.options : (typeof d.options === 'string' ? d.options.split(',').map(function(s){return s.trim();}) : []);
          out += '  <select class="form-select" name="cf_' + d.fieldId + '" data-field-id="' + d.fieldId + '"' + ((isRequired && (!isEdit || !wasInitiallyEmpty)) ? ' required' : '') + '>';
          out += '    <option value="">Select ' + SchoolApp.escapeHTML(d.label) + '</option>';
          opts.forEach(function(opt) {
            out += '    <option value="' + SchoolApp.escapeHTML(opt) + '"' + (val === opt ? ' selected' : '') + '>' + SchoolApp.escapeHTML(opt) + '</option>';
          });
          out += '  </select>';
        } else if (d.type === 'yes/no') {
          out += '  <select class="form-select" name="cf_' + d.fieldId + '" data-field-id="' + d.fieldId + '"' + ((isRequired && (!isEdit || !wasInitiallyEmpty)) ? ' required' : '') + '>';
          out += '    <option value="">Select</option>';
          out += '    <option value="Yes"' + (val === 'Yes' ? ' selected' : '') + '>Yes</option>';
          out += '    <option value="No"' + (val === 'No' ? ' selected' : '') + '>No</option>';
          out += '  </select>';
        } else if (d.type === 'number') {
          out += '  <input type="number" class="form-input" name="cf_' + d.fieldId + '" data-field-id="' + d.fieldId + '" value="' + SchoolApp.escapeHTML(String(val)) + '"' + ((isRequired && (!isEdit || !wasInitiallyEmpty)) ? ' required' : '') + '>';
        } else if (d.type === 'date') {
          out += '  <input type="date" class="form-input" name="cf_' + d.fieldId + '" data-field-id="' + d.fieldId + '" value="' + SchoolApp.escapeHTML(String(val)) + '"' + ((isRequired && (!isEdit || !wasInitiallyEmpty)) ? ' required' : '') + '>';
        } else if (d.type === 'phone') {
          out += '  <input type="tel" class="form-input" name="cf_' + d.fieldId + '" data-field-id="' + d.fieldId + '" maxlength="10" placeholder="10-digit number" value="' + SchoolApp.escapeHTML(String(val)) + '"' + ((isRequired && (!isEdit || !wasInitiallyEmpty)) ? ' required' : '') + '>';
        } else if (d.type === 'email') {
          out += '  <input type="email" class="form-input" name="cf_' + d.fieldId + '" data-field-id="' + d.fieldId + '" placeholder="name@example.com" value="' + SchoolApp.escapeHTML(String(val)) + '"' + ((isRequired && (!isEdit || !wasInitiallyEmpty)) ? ' required' : '') + '>';
        } else {
          // default text
          out += '  <input type="text" class="form-input" name="cf_' + d.fieldId + '" data-field-id="' + d.fieldId + '" value="' + SchoolApp.escapeHTML(String(val)) + '"' + ((isRequired && (!isEdit || !wasInitiallyEmpty)) ? ' required' : '') + '>';
        }

        out += '  <span class="form-error">Required</span>';
        out += '</div>';
      });
      return out;
    }

    var bodyHTML = '<form id="teacher-form" class="form-grid">';

    bodyHTML += '<div class="form-group"><label class="form-label">First Name *</label><input type="text" class="form-input" name="firstName" value="' + (teacher ? teacher.firstName : '') + '" required><span class="form-error">Required</span></div>';
    bodyHTML += '<div class="form-group"><label class="form-label">Last Name *</label><input type="text" class="form-input" name="lastName" value="' + (teacher ? teacher.lastName : '') + '" required><span class="form-error">Required</span></div>';
    bodyHTML += '<div class="form-group"><label class="form-label">Email *</label><input type="email" class="form-input" name="email" value="' + (teacher ? teacher.email : '') + '" required><span class="form-error">Valid email required</span></div>';
    if (isEdit) {
      bodyHTML += '<div class="form-group full-width" style="grid-column: span 2; background: rgba(37,99,235,0.08); padding: 10px; border-radius: 8px; border: 1px solid rgba(37,99,235,0.15); margin-bottom: 12px; margin-top: 4px;">';
      bodyHTML += '  <span style="font-size: 11px; font-weight: 700; color: var(--accent-secondary); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Login Email (used to sign in)</span>';
      bodyHTML += '  <strong style="color: var(--text-primary); font-size: 14px;">' + teacher.email + '</strong>';
      bodyHTML += '</div>';
    }
    bodyHTML += '<div class="form-group"><label class="form-label">Phone *</label><input type="text" class="form-input" name="phone" value="' + (teacher ? teacher.phone : '') + '" required><span class="form-error">Required</span></div>';

    // Personal Custom Fields
    bodyHTML += renderTeacherCustomFieldsForSection(fieldsBySection.personal);

    // Global subjects checkboxes selection
    bodyHTML += '<div class="form-group full-width"><label class="form-label">Subjects Taught *</label>';
    bodyHTML += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; margin-top: 6px;">';
    getSubjects(teacher).forEach(function(s) {
      var isChecked = false;
      if (teacher) {
        if (Array.isArray(teacher.subject)) {
          isChecked = teacher.subject.indexOf(s) !== -1;
        } else if (typeof teacher.subject === 'string') {
          isChecked = teacher.subject.split(',').map(function(sub) { return sub.trim(); }).indexOf(s) !== -1;
        }
      }
      bodyHTML += '<label class="subject-cb-label"><input type="checkbox" value="' + s + '"' + (isChecked ? ' checked' : '') + ' class="subject-cb" style="width: 16px; height: 16px;"> ' + s + '</label>';
    });
    bodyHTML += '</div><span class="form-error" id="subject-error" style="display: none;">Select at least one subject</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Qualification *</label><input type="text" class="form-input" name="qualification" value="' + (teacher ? teacher.qualification : '') + '" required><span class="form-error">Required</span></div>';

    // Academic Custom Fields
    bodyHTML += renderTeacherCustomFieldsForSection(fieldsBySection.academic);

    bodyHTML += '<div class="form-group"><label class="form-label">Joining Date</label><input type="date" class="form-input" name="joiningDate" value="' + (teacher ? teacher.joiningDate : new Date().toISOString().split('T')[0]) + '"></div>';

    // Employment Custom Fields
    bodyHTML += renderTeacherCustomFieldsForSection(fieldsBySection.employment);

    bodyHTML += '<div class="form-group"><label class="form-label">Password' + (isEdit ? '' : ' *') + '</label><div class="password-wrapper"><input type="password" class="form-input" name="password" value="' + (isEdit ? '' : 'teacher123') + '" placeholder="' + (isEdit ? 'Leave blank to keep current' : 'Minimum 6 characters') + '"><i class="fa fa-eye toggle-password"></i></div><span class="form-error">Min 6 characters</span></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Status</label><select class="form-select" name="status">';
    ['Active', 'Inactive'].forEach(function(s) { bodyHTML += '<option value="' + s + '"' + (teacher && teacher.status === s ? ' selected' : '') + '>' + s + '</option>'; });
    bodyHTML += '</select></div>';

    // Assigned Classes Section (Organized & Responsive Card Grid)
    bodyHTML += '<div class="form-group full-width">';
    bodyHTML += '  <div class="assigned-classes-header">';
    bodyHTML += '    <label class="form-label" style="margin-bottom: 0;">Assigned Classes *</label>';
    bodyHTML += '    <span class="assigned-classes-hint">Select the classes & sections this teacher instructs</span>';
    bodyHTML += '  </div>';
    bodyHTML += '  <div class="assigned-classes-grid">';

    classes.forEach(function(c) {
      var displayCls = (c && String(c).startsWith('Class ')) ? c : ('Class ' + c);
      bodyHTML += '    <div class="assigned-class-card">';
      bodyHTML += '      <div class="assigned-class-card-header">';
      bodyHTML += '        <span class="assigned-class-badge"><span class="material-icons-round">school</span> ' + displayCls + '</span>';
      bodyHTML += '      </div>';
      bodyHTML += '      <div class="assigned-class-sections-wrap">';

      sections.forEach(function(s) {
        var hasSection = true;
        if (typeof rawSections === 'object' && !Array.isArray(rawSections)) {
          hasSection = (rawSections[c] || []).indexOf(s) !== -1;
        }
        if (!hasSection) return;

        var checked = teacher && teacher.assignedClasses && teacher.assignedClasses.some(function(ac) {
          return String(ac.class).toLowerCase().trim() === String(c).toLowerCase().trim() &&
                 String(ac.section).toLowerCase().trim() === String(s).toLowerCase().trim();
        });

        bodyHTML += '        <label class="assigned-section-chip' + (checked ? ' is-selected' : '') + '">';
        bodyHTML += '          <input type="checkbox" class="class-assign-cb" data-class="' + c + '" data-section="' + s + '"' + (checked ? ' checked' : '') + '>';
        bodyHTML += '          <span class="section-chip-text">Sec ' + s + '</span>';
        bodyHTML += '        </label>';
      });

      bodyHTML += '      </div>';
      bodyHTML += '    </div>';
    });

    bodyHTML += '  </div>';
    bodyHTML += '  <span class="form-error" id="class-error" style="display: none;">Select at least one class</span>';
    bodyHTML += '</div>';

    // Class-Subject and Class Teacher Mapping Section
    bodyHTML += '<div class="form-group full-width" id="class-subject-mapping-section" style="margin-top: 15px; display: none;">';
    bodyHTML += '<label class="form-label">Class-Subject & Class Teacher Mapping *</label>';
    bodyHTML += '<div id="class-subject-mapping-container" style="display: flex; flex-direction: column; gap: 10px; margin-top: 8px;"></div>';
    bodyHTML += '</div>';

    // Other / Additional Custom Fields
    bodyHTML += renderTeacherCustomFieldsForSection(fieldsBySection.other);

    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="teacher-save-btn"><span class="material-icons-round">save</span> ' + (isEdit ? 'Update' : 'Add') + ' Teacher</button>';

    SchoolApp.showModal((isEdit ? 'Edit' : 'Add New') + ' Teacher', bodyHTML, footerHTML);

    // Initial load of class-subject mapping
    updateClassSubjectMappingUI(teacher);

    // Attach dynamic listeners
    document.querySelectorAll('.class-assign-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var chip = this.closest('.assigned-section-chip');
        if (chip) {
          if (this.checked) chip.classList.add('is-selected');
          else chip.classList.remove('is-selected');
        }
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

  async function saveTeacher(existing) {
    var form = document.getElementById('teacher-form');
    if (!form) return;

    var fields = {};
    var inputs = form.querySelectorAll('input[name], select[name]');
    var valid = true;

    inputs.forEach(function(input) {
      var name = input.name;
      // Skip Class Teacher / Subject checkbox inputs and custom field inputs, they are processed separately
      if (name.indexOf('ct-') === 0 || name.indexOf('sub-') === 0 || name.indexOf('cf_') === 0) return;

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

    // Validate custom fields with soft validation for old records
    var customFieldValues = {};
    var defs = (SchoolApp.store.settings && SchoolApp.store.settings.customFieldDefinitions && SchoolApp.store.settings.customFieldDefinitions.teacher) || [];
    var activeDefs = defs.filter(function(d) { return d.status !== 'archived'; });

    activeDefs.forEach(function(def) {
      var input = form.querySelector('[name="cf_' + def.fieldId + '"]');
      if (!input) return;
      var val = input.value.trim();
      customFieldValues[def.fieldId] = val;

      var group = input.closest('.form-group');
      var wasInitiallyEmpty = existing && (!_currentEditingTeacherInitialCustomFields || !_currentEditingTeacherInitialCustomFields[def.fieldId]);

      if (def.required) {
        if (existing && wasInitiallyEmpty && !val) {
          // Soft validation for existing teacher who had this field empty: allow saving!
          if (group) group.classList.remove('error');
        } else {
          // Hard validation
          if (!val) {
            if (group) group.classList.add('error');
            valid = false;
          } else {
            if (group) group.classList.remove('error');
          }
        }
      }

      // Format validation for phone / email custom fields
      if (val) {
        if (def.type === 'phone' && !/^\d{10}$/.test(val)) {
          if (group) group.classList.add('error');
          valid = false;
        } else if (def.type === 'email' && !SchoolApp.utils.validate.email(val)) {
          if (group) group.classList.add('error');
          valid = false;
        }
      }
    });

    if (!valid) {
      SchoolApp.showToast('Please fill all required fields correctly.', 'error');
      return;
    }

    // SANITIZATION: Ensure NO custom field keys leak into fields
    Object.keys(fields).forEach(function(k) {
      if (k.startsWith('cf_') || k === 'customFields') {
        delete fields[k];
      }
    });

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

    var isNewTeacher = !existing;
    var rawPasswordInput = form.querySelector('[name="password"]') ? form.querySelector('[name="password"]').value.trim() : '';

    if (SchoolApp.store.settings && SchoolApp.store.settings.credentialsIsolated === true) {
      if (isNewTeacher) {
        fields.id = SchoolApp.generateId();
        var rawPassword = rawPasswordInput || 'teacher123';
        try {
          var idToken = await SchoolApp.getFreshAuthToken();
          var resp = await fetch('/api/manage-credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken: idToken,
              schoolId: (SchoolApp.store && SchoolApp.store.currentSchoolId) || 'default',
              action: 'add-teacher',
              teacherData: fields,
              rawPassword: rawPassword
            })
          });
          var resData = await resp.json();
          if (!resp.ok) throw new Error(resData.error || 'Server error creating teacher.');
          fields.id = resData.teacherId || fields.id;
          fields.password = 'PROTECTED';
          SchoolApp.store.teachers.push(fields);
          SchoolApp.showToast('Teacher added successfully via secure server.', 'success');
          SchoolApp.closeModal();
          render();
          checkExamAccess();
          return;
        } catch (err) {
          console.error('[Teachers] Server add teacher failed:', err);
          var msg = (err && err.message) || '';
          if (msg.includes('Session expired')) {
            SchoolApp.showToast('Session expired, please login again.', 'error');
          } else {
            SchoolApp.showToast('Failed to add teacher: ' + msg, 'error');
          }
          // Rollback local state: no half-added teacher in store (store.teachers was not pushed)
          return;
        }
      } else {
        fields.id = existing.id;
        fields.password = existing.password;
        if (rawPasswordInput) {
          try {
            var idToken = await SchoolApp.getFreshAuthToken();
            var resp = await fetch('/api/manage-credentials', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                idToken: idToken,
                schoolId: (SchoolApp.store && SchoolApp.store.currentSchoolId) || 'default',
                action: 'set-teacher-password',
                teacherId: existing.id,
                newPassword: rawPasswordInput
              })
            });
            var resData = await resp.json();
            if (!resp.ok) throw new Error(resData.error || 'Server error updating teacher password.');
            SchoolApp.showToast('Teacher password updated via secure server.', 'success');
          } catch (err) {
            console.error('[Teachers] Server update teacher password failed:', err);
            var msg = (err && err.message) || '';
            if (msg.includes('Session expired')) {
              SchoolApp.showToast('Session expired, please login again.', 'error');
            } else {
              SchoolApp.showToast('Failed to update teacher password: ' + msg, 'error');
            }
            return;
          }
        }
      }
    } else {
      // Legacy unisolated behavior
      if (existing) {
        fields.id = existing.id;
        if (!fields.password) {
          fields.password = existing.password; // Keep existing password hash untouched
        } else if (!AuthUtils.isHashed(fields.password)) {
          fields.password = await AuthUtils.hashPassword(fields.password);
        }
      } else {
        fields.id = SchoolApp.generateId();
        var rawPassword = rawPasswordInput || 'teacher123';
        fields.password = rawPassword;
        if (fields.password && !AuthUtils.isHashed(fields.password)) {
          fields.password = await AuthUtils.hashPassword(fields.password);
        }
      }
    }

    var schoolId = (SchoolApp.store && SchoolApp.store.currentSchoolId) || 'default';
    var hasCustomFieldDefinitions = defs.length > 0;

    if (!hasCustomFieldDefinitions && !_currentEditingTeacherLoadedUpdatedAt) {
      // ZERO CUSTOM FIELDS SAVE PATH (Schools like SVM, IPS, KKGS before adding teacher custom fields)
      // Save directly via SchoolApp.save() — 100% byte-identical save path and data
      if (existing) {
        var idx = SchoolApp.store.teachers.findIndex(function(t) { return t.id === existing.id; });
        if (idx !== -1) {
          Object.assign(SchoolApp.store.teachers[idx], fields);
          SchoolApp.showToast('Teacher updated successfully.', 'success');
        }
      } else {
        SchoolApp.store.teachers.push(fields);
        SchoolApp.showToast('Teacher added successfully.', 'success');
      }

      await SchoolApp.save();
      SchoolApp.closeModal();
      render();
      checkExamAccess();
      return;
    }

    // Execute atomic save via TeacherProfileService
    var saveResult = await TeacherProfileService.saveTeacherWithProfile(
      schoolId,
      fields,
      customFieldValues,
      _currentEditingTeacherLoadedUpdatedAt
    );

    if (saveResult && saveResult.staleConflict) {
      showTeacherStaleWriteDiffModal(
        existing,
        saveResult.serverData,
        saveResult.pendingCustomFields,
        _currentEditingTeacherLoadedUpdatedAt
      );
      return;
    }

    if (saveResult && saveResult.success) {
      var successMessage = existing ? 'Teacher updated successfully.' : 'Teacher added successfully.';
      SchoolApp.showToast(successMessage, 'success');
      SchoolApp.closeModal();
      render();
      checkExamAccess();
    } else {
      SchoolApp.showToast((saveResult && saveResult.reason) || 'Failed to save teacher.', 'error');
    }

    function checkExamAccess() {
      var activeTerms = Object.values(SchoolApp.store.examTerms || {}).filter(function(t) {
        return t.status !== 'locked';
      });

      var missingEntries = [];
      var teacherName = fields.firstName + ' ' + (fields.lastName || '');

      var uniqueKeys = {};
      (fields.subjectTeacherOf || []).forEach(function(assignment) {
        var assignedSub = assignment.subject;
        var assignedCls = assignment.class;
        var assignedSec = assignment.section;

        activeTerms.forEach(function(term) {
          var examSubs = (SchoolApp.store.examSubjects && 
                          SchoolApp.store.examSubjects[term.id] && 
                          SchoolApp.store.examSubjects[term.id][assignedCls] && 
                          SchoolApp.store.examSubjects[term.id][assignedCls].subjects) || [];

          var subjectsMatch = window.subjectsMatch || function(s1, s2) {
            if (!s1 || !s2) return false;
            return String(s1).toLowerCase().trim() === String(s2).toLowerCase().trim();
          };

          var exists = examSubs.some(function(es) {
            return subjectsMatch(es.name, assignedSub);
          });

          if (!exists) {
            var key = term.id + '_' + assignedCls + '_' + assignedSub;
            if (!uniqueKeys[key]) {
              uniqueKeys[key] = {
                termId: term.id,
                termName: term.name,
                classId: assignedCls,
                subjectName: assignedSub,
                sections: []
              };
            }
            if (uniqueKeys[key].sections.indexOf(assignedSec) === -1) {
              uniqueKeys[key].sections.push(assignedSec);
            }
          }
        });
      });

      var missingList = Object.values(uniqueKeys);
      if (missingList.length === 0) return;

      var escapeHTML = function(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      };

      var warningHtml = '<div style="font-size: 14px; line-height: 1.6; color: var(--text-primary); padding: 8px 0; max-height: 400px; overflow-y: auto; padding-right: 6px;">';
      
      missingList.forEach(function(entry, idx) {
        var displaySections = entry.sections.map(function(s) { return entry.classId + '-' + s; }).join(', ');
        
        warningHtml += '<div style="margin-bottom: 16px; background: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.15); border-radius: 8px; padding: 14px;">';
        warningHtml += '  <div style="font-weight: 600; margin-bottom: 8px; display: flex; align-items: flex-start; gap: 6px;">';
        warningHtml += '    <span class="material-icons-round" style="color: #f59e0b; font-size: 18px; margin-top: 2px;">warning</span>';
        warningHtml += '    <span>⚠️ ' + escapeHTML(entry.subjectName) + ' is assigned to ' + escapeHTML(teacherName) + ' but is not configured in ' + escapeHTML(entry.termName) + ' &mdash; Class ' + escapeHTML(displaySections) + '</span>';
        warningHtml += '  </div>';
        
        warningHtml += '  <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; font-weight: 500;">Configure as:</div>';
        warningHtml += '  <div style="display: flex; flex-direction: column; gap: 8px; padding-left: 4px;">';
        
        warningHtml += '    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">';
        warningHtml += '      <input type="radio" name="config-type-' + idx + '" value="Theory" style="margin: 0;">';
        warningHtml += '      <span>Theory (Full: 100, Pass: 33)</span>';
        warningHtml += '    </label>';
        
        warningHtml += '    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">';
        warningHtml += '      <input type="radio" name="config-type-' + idx + '" value="Practical" checked style="margin: 0;">';
        warningHtml += '      <span>Practical (Full: 50, Pass: 17) <span style="font-size: 11px; color: var(--text-muted);">(default)</span></span>';
        warningHtml += '    </label>';
        
        warningHtml += '    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">';
        warningHtml += '      <input type="radio" name="config-type-' + idx + '" value="Internal" style="margin: 0;">';
        warningHtml += '      <span>Internal (Full: 25, Pass: 8)</span>';
        warningHtml += '    </label>';
        
        warningHtml += '    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">';
        warningHtml += '      <input type="radio" name="config-type-' + idx + '" value="Custom" style="margin: 0;" id="radio-custom-' + idx + '">';
        warningHtml += '      <span>Custom: Full <input type="number" id="custom-full-' + idx + '" value="50" style="width: 55px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 2px 6px; color: var(--text-primary); font-size:12px; text-align:center;"> Pass <input type="number" id="custom-pass-' + idx + '" value="17" style="width: 50px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 2px 6px; color: var(--text-primary); font-size:12px; text-align:center;"></span>';
        warningHtml += '    </label>';
        
        warningHtml += '  </div>';
        warningHtml += '</div>';
      });

      warningHtml += '<p style="margin: 12px 0 0 0; font-weight: 500;">Would you like to add the missing subjects to these exam terms now?</p>';
      warningHtml += '</div>';

      var footerHTML = '<button class="btn btn-secondary" id="warning-skip-btn">Skip</button>';
      footerHTML += '<button class="btn btn-primary" id="warning-add-now-btn"><span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">add_task</span>Add Now</button>';

      SchoolApp.showModal('Exam Configuration Warning', warningHtml, footerHTML);

      missingList.forEach(function(entry, idx) {
        var customFullInput = document.getElementById('custom-full-' + idx);
        var customPassInput = document.getElementById('custom-pass-' + idx);
        var customRadio = document.getElementById('radio-custom-' + idx);

        var selectCustomRadio = function() {
          if (customRadio) customRadio.checked = true;
        };

        if (customFullInput) {
          customFullInput.addEventListener('focus', selectCustomRadio);
          customFullInput.addEventListener('input', selectCustomRadio);
        }
        if (customPassInput) {
          customPassInput.addEventListener('focus', selectCustomRadio);
          customPassInput.addEventListener('input', selectCustomRadio);
        }
      });

      var skipBtn = document.getElementById('warning-skip-btn');
      if (skipBtn) {
        skipBtn.addEventListener('click', function() {
          SchoolApp.closeModal();
        });
      }

      var addNowBtn = document.getElementById('warning-add-now-btn');
      if (addNowBtn) {
        addNowBtn.addEventListener('click', async function() {
          addNowBtn.disabled = true;
          addNowBtn.innerHTML = 'Adding...';

          if (!SchoolApp.store.examSubjects) {
            SchoolApp.store.examSubjects = {};
          }

          missingList.forEach(function(entry, idx) {
            var selectedType = 'Practical';
            var selectedFull = 50;
            var selectedPass = 17;

            var checkedRadio = document.querySelector('input[name="config-type-' + idx + '"]:checked');
            if (checkedRadio) {
              selectedType = checkedRadio.value;
            }

            if (selectedType === 'Theory') {
              selectedFull = 100;
              selectedPass = 33;
            } else if (selectedType === 'Practical') {
              selectedFull = 50;
              selectedPass = 17;
            } else if (selectedType === 'Internal') {
              selectedFull = 25;
              selectedPass = 8;
            } else if (selectedType === 'Custom') {
              var customFullInput = document.getElementById('custom-full-' + idx);
              var customPassInput = document.getElementById('custom-pass-' + idx);
              selectedFull = customFullInput ? parseInt(customFullInput.value) || 50 : 50;
              selectedPass = customPassInput ? parseInt(customPassInput.value) || 17 : 17;
              selectedType = 'Theory';
            }

            if (!SchoolApp.store.examSubjects[entry.termId]) {
              SchoolApp.store.examSubjects[entry.termId] = {};
            }
            if (!SchoolApp.store.examSubjects[entry.termId][entry.classId]) {
              SchoolApp.store.examSubjects[entry.termId][entry.classId] = { subjects: [] };
            }

            var list = SchoolApp.store.examSubjects[entry.termId][entry.classId].subjects;
            var subId = 'subj_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4);

            list.push({
              id: subId,
              name: entry.subjectName,
              code: entry.subjectName.substring(0, 4).toUpperCase(),
              type: selectedType,
              fullMarks: selectedFull,
              passMarks: selectedPass,
              hasExam: true,
              isOptional: false,
              order: list.length + 1
            });
          });

          var success = await SchoolApp.save();
          SchoolApp.closeModal();
          if (success) {
            SchoolApp.showToast('Subjects successfully added to Exam configuration.', 'success');
            if (SchoolApp.modules.exams && typeof SchoolApp.modules.exams.render === 'function') {
              SchoolApp.modules.exams.render();
            }
          }
        });
      }
    }

    if (isNewTeacher) {
      var hostname = window.location.hostname;
      var activeSchool = (SchoolApp.store.schools || []).find(function(s) { return s.school_id === SchoolApp.store.currentSchoolId; });
      var subdomainUrl = '';
      if (activeSchool && activeSchool.subdomain) {
        if (hostname.indexOf('localhost') !== -1) {
          subdomainUrl = activeSchool.subdomain + '.localhost' + (window.location.port ? ':' + window.location.port : '');
        } else {
          subdomainUrl = activeSchool.subdomain + '.ctrlshifts.in';
        }
      } else {
        subdomainUrl = window.location.host;
      }
      
      var escapeHTMLStr = function(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      };

      setTimeout(function() {
        SchoolApp.showModal('Teacher Added!', 
          '<div style="padding: 10px; text-align: center;">' +
          '  <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>' +
          '  <h3 style="margin-bottom: 8px;">Teacher Account Created!</h3>' +
          '  <p style="margin-bottom: 16px; color: var(--text-secondary); font-size: 13px;">Please share these login credentials with the teacher:</p>' +
          '  <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 16px; text-align: left; max-width: 400px; margin: 0 auto; display: flex; flex-direction: column; gap: 8px; font-size: 13px;">' +
          '    <div><strong>Login ID:</strong> <span style="font-family: monospace; font-size: 14px; color: #60a5fa; margin-left: 6px;">' + escapeHTMLStr(fields.email) + '</span></div>' +
          '    <div><strong>Password:</strong> <span style="font-family: monospace; font-size: 14px; color: #60a5fa; margin-left: 6px;">' + escapeHTMLStr(rawPassword) + '</span></div>' +
          '    <div><strong>Sign-in Link:</strong> <a href="' + window.location.protocol + '//' + subdomainUrl + '" target="_blank" style="color: var(--accent-secondary); font-family: monospace; font-size: 13px; margin-left: 6px; text-decoration: underline;">' + subdomainUrl + '</a></div>' +
          '  </div>' +
          '</div>',
          '<button class="btn btn-primary" id="teacher-added-done-btn">Done</button>'
        );

        var doneBtn = document.getElementById('teacher-added-done-btn');
        if (doneBtn) {
          doneBtn.addEventListener('click', function() {
            SchoolApp.closeModal();
            checkExamAccess();
          });
        }
      }, 200);
    } else {
      checkExamAccess();
    }
  }

  async function viewTeacher(id) {
    var teacher = SchoolApp.store.teachers.find(function(t) { return t.id === id; });
    if (!teacher) return;

    var schoolId = (SchoolApp.store && SchoolApp.store.currentSchoolId) || 'default';
    var profile = await TeacherProfileService.getTeacherProfile(schoolId, teacher.id);
    var customFields = (profile && profile.customFields) || {};

    var defs = (SchoolApp.store.settings && SchoolApp.store.settings.customFieldDefinitions && SchoolApp.store.settings.customFieldDefinitions.teacher) || [];
    var activeDefs = defs.filter(function(d) { return d.status !== 'archived'; })
                         .sort(function(a, b) { return (a.order || 0) - (b.order || 0); });

    var fieldsBySection = {
      personal: [],
      academic: [],
      employment: [],
      other: []
    };
    activeDefs.forEach(function(d) {
      var sec = d.section || 'other';
      if (!fieldsBySection[sec]) fieldsBySection[sec] = [];
      fieldsBySection[sec].push(d);
    });

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

    // Personal Information
    html += '<div class="detail-section"><h4><span class="material-icons-round">person</span> Personal Information</h4><div class="detail-grid">';
    html += '<div class="detail-item"><span class="detail-item-label">Email</span><span class="detail-item-value">' + teacher.email + '</span></div>';
    html += '<div class="detail-item"><span class="detail-item-label">Phone</span><span class="detail-item-value">' + teacher.phone + '</span></div>';
    fieldsBySection.personal.forEach(function(d) {
      var val = customFields[d.fieldId];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        html += '<div class="detail-item"><span class="detail-item-label">' + SchoolApp.escapeHTML(d.label) + '</span><span class="detail-item-value">' + SchoolApp.escapeHTML(String(val)) + '</span></div>';
      }
    });
    html += '</div></div>';

    // Professional & Academic Information
    html += '<div class="detail-section"><h4><span class="material-icons-round">work</span> Professional & Academic Information</h4><div class="detail-grid">';
    html += '<div class="detail-item"><span class="detail-item-label">Subject</span><span class="detail-item-value">' + teacher.subject + '</span></div>';
    html += '<div class="detail-item"><span class="detail-item-label">Qualification</span><span class="detail-item-value">' + teacher.qualification + '</span></div>';
    fieldsBySection.academic.forEach(function(d) {
      var val = customFields[d.fieldId];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        html += '<div class="detail-item"><span class="detail-item-label">' + SchoolApp.escapeHTML(d.label) + '</span><span class="detail-item-value">' + SchoolApp.escapeHTML(String(val)) + '</span></div>';
      }
    });
    html += '<div class="detail-item"><span class="detail-item-label">Total Students</span><span class="detail-item-value">' + studentCount + '</span></div>';
    html += '</div></div>';

    // Employment Information
    html += '<div class="detail-section"><h4><span class="material-icons-round">badge</span> Employment Information</h4><div class="detail-grid">';
    html += '<div class="detail-item"><span class="detail-item-label">Joining Date</span><span class="detail-item-value">' + SchoolApp.formatDate(teacher.joiningDate) + '</span></div>';
    fieldsBySection.employment.forEach(function(d) {
      var val = customFields[d.fieldId];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        html += '<div class="detail-item"><span class="detail-item-label">' + SchoolApp.escapeHTML(d.label) + '</span><span class="detail-item-value">' + SchoolApp.escapeHTML(String(val)) + '</span></div>';
      }
    });
    html += '</div></div>';

    // Additional / Other Custom Fields
    if (fieldsBySection.other.some(function(d) { return customFields[d.fieldId]; })) {
      html += '<div class="detail-section"><h4><span class="material-icons-round">more_horiz</span> Additional Information</h4><div class="detail-grid">';
      fieldsBySection.other.forEach(function(d) {
        var val = customFields[d.fieldId];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          html += '<div class="detail-item"><span class="detail-item-label">' + SchoolApp.escapeHTML(d.label) + '</span><span class="detail-item-value">' + SchoolApp.escapeHTML(String(val)) + '</span></div>';
        }
      });
      html += '</div></div>';
    }

    html += '<div class="detail-section"><h4><span class="material-icons-round">class</span> Assigned Classes</h4>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px">';
    (teacher.assignedClasses || []).forEach(function(ac) {
      var classStudents = SchoolApp.store.students.filter(function(s) { return s.class === ac.class && s.section === ac.section; }).length;
      var clsLabel = (ac.class && ac.class.startsWith('Class ')) ? ac.class : ('Class ' + (ac.class || ''));
      html += '<span class="badge badge-info">' + clsLabel + '-' + ac.section + ' (' + classStudents + ' students)</span>';
    });
    html += '</div></div>';

    if (teacher.classTeacherOf && teacher.classTeacherOf.length > 0) {
      html += '<div class="detail-section"><h4><span class="material-icons-round" style="color: #f59e0b;">stars</span> Class Teacher Assignment</h4>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px">';
      teacher.classTeacherOf.forEach(function(ct) {
        var ctLabel = (ct.class && ct.class.startsWith('Class ')) ? ct.class : ('Class ' + (ct.class || ''));
        html += '<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-weight: 600; padding: 6px 12px; font-size: 13px;"><span class="material-icons-round" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">workspace_premium</span>Class Teacher of ' + ctLabel + '-' + ct.section + '</span>';
      });
      html += '</div></div>';
    }

    if (teacher.subjectTeacherOf && teacher.subjectTeacherOf.length > 0) {
      html += '<div class="detail-section"><h4><span class="material-icons-round">menu_book</span> Subjects Taught per Class</h4>';
      html += '<div class="table-container" style="margin-top: 6px;"><table class="data-table" style="font-size: 13px; width: 100%;"><thead><tr><th style="padding: 8px 12px;">Class & Section</th><th style="padding: 8px 12px;">Subject</th></tr></thead><tbody>';
      teacher.subjectTeacherOf.forEach(function(st) {
        var stCls = (st.class && st.class.startsWith('Class ')) ? st.class : ('Class ' + (st.class || ''));
        html += '<tr><td style="padding: 8px 12px;"><strong>' + stCls + '-' + (st.section || '') + '</strong></td><td style="padding: 8px 12px;"><span class="badge badge-info">' + (st.subject || '') + '</span></td></tr>';
      });
      html += '</tbody></table></div></div>';
    }

    if (SchoolApp.isAdmin()) {
      html += '<div class="detail-section"><h4><span class="material-icons-round">vpn_key</span> Login Credentials</h4><div class="detail-grid">';
      html += '<div class="detail-item full-width" style="grid-column: span 2; background: rgba(37,99,235,0.08); padding: 10px; border-radius: 8px; border: 1px solid rgba(37,99,235,0.15);"><span class="detail-item-label" style="color: var(--accent-secondary); font-weight: 700;">Login Email (used to sign in)</span><span class="detail-item-value" style="font-weight: 700; color: var(--text-primary); font-size: 14px;">' + teacher.email + '</span></div>';
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
