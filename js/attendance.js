'use strict';

/* ============================================================
   Shishu Vikash Mandir - Attendance Tracking Module
   ============================================================ */

(function() {

  var state = {
    currentView: 'mark', // 'mark' or 'history'
    selectedClass: '',
    selectedSection: '',
    selectedDate: new Date().toISOString().split('T')[0],
    attendanceStatus: {}, // { studentId: 'present'|'absent'|'late' }
    historyFilters: {
      fromDate: '',
      toDate: '',
      classFilter: 'all',
      sectionFilter: 'all'
    }
  };

  var archivedRecordsCache = null;
  var archiveModalFilters = {
    fromDate: '',
    toDate: '',
    classFilter: 'all',
    sectionFilter: 'all'
  };

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeClassName(cls) {
    if (!cls) return '';
    return cls.toString()
      .replace(/^class\s+/i, '')
      .trim()
      .toLowerCase();
  }

  function normalizeSectionName(sec) {
    if (!sec) return '';
    return sec.toString()
      .trim()
      .toLowerCase();
  }

  function parseClassSection(str) {
    if (!str) return { class: '', section: '' };
    var clean = str.replace(/class\s+/i, '').trim();
    var parts = clean.split('-');
    if (parts.length === 2) {
      return {
        class: parts[0].trim(),
        section: parts[1].trim()
      };
    }
    return {
      class: clean,
      section: ''
    };
  }

  function getAvailableClasses() {
    if (SchoolApp.isTeacher()) {
      return SchoolApp.currentUser.classTeacherOf || [];
    }
    var combos = [];
    var settings = SchoolApp.store.settings || {};
    var classesList = settings.classes || (settings.schoolInfo && settings.schoolInfo.classes) || [];
    var rawSections = settings.sections || {};
    
    classesList.forEach(function(c) {
      var sectList = [];
      if (Array.isArray(rawSections)) {
        sectList = rawSections;
      } else if (typeof rawSections === 'object') {
        sectList = rawSections[c] || [];
      }
      sectList.forEach(function(s) {
        // Only include classes that have students
        var hasStudents = SchoolApp.store.students.some(function(st) {
          return normalizeClassName(st.class) === normalizeClassName(c) &&
                 normalizeSectionName(st.section) === normalizeSectionName(s);
        });
        if (hasStudents) combos.push({ class: c, section: s });
      });
    });
    return combos;
  }

  function getStudentsForClass(cls, section) {
    return SchoolApp.store.students.filter(function(s) {
      return normalizeClassName(s.class) === normalizeClassName(cls) &&
             normalizeSectionName(s.section) === normalizeSectionName(section) &&
             s.status === 'Active';
    }).sort(function(a, b) {
      return a.rollNumber.localeCompare(b.rollNumber);
    });
  }

  function getAttendanceStats() {
    var todayStr = new Date().toISOString().split('T')[0];
    var todayRecords = SchoolApp.store.attendance.filter(function(a) { return a.date === todayStr; });
    var totalPresent = 0, totalAbsent = 0, totalLate = 0, totalStudents = 0;

    todayRecords.forEach(function(r) {
      r.records.forEach(function(rec) {
        totalStudents++;
        if (rec.status === 'present') totalPresent++;
        else if (rec.status === 'absent') totalAbsent++;
        else if (rec.status === 'late') totalLate++;
      });
    });

    // Week average
    var now = new Date();
    var weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    var weekStr = weekStart.toISOString().split('T')[0];
    var weekRecords = SchoolApp.store.attendance.filter(function(a) { return a.date >= weekStr; });
    var weekPresent = 0, weekTotal = 0;
    weekRecords.forEach(function(r) {
      r.records.forEach(function(rec) {
        weekTotal++;
        if (rec.status === 'present' || rec.status === 'late') weekPresent++;
      });
    });

    // Month average
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    var monthRecords = SchoolApp.store.attendance.filter(function(a) { return a.date >= monthStart; });
    var monthPresent = 0, monthTotal = 0;
    monthRecords.forEach(function(r) {
      r.records.forEach(function(rec) {
        monthTotal++;
        if (rec.status === 'present' || rec.status === 'late') monthPresent++;
      });
    });

    return {
      todayPercent: totalStudents > 0 ? Math.round((totalPresent + totalLate) / totalStudents * 100) : 0,
      todayPresent: totalPresent,
      todayAbsent: totalAbsent,
      todayLate: totalLate,
      todayTotal: totalStudents,
      weekPercent: weekTotal > 0 ? Math.round(weekPresent / weekTotal * 100) : 0,
      monthPercent: monthTotal > 0 ? Math.round(monthPresent / monthTotal * 100) : 0
    };
  }

  function render() {
    var container = document.getElementById('page-attendance');
    if (!container) return;

    if (!window.assertSchoolIsolation(SchoolApp.store.attendance, SchoolApp.store.currentSchoolId)) {
      console.error("[SECURITY] Data isolation breach detected in Attendance Tab!");
      SchoolApp.showToast("Security error. Please logout and login again.", "error");
      SchoolApp.logout();
      return;
    }

    var stats = getAttendanceStats();
    var html = '';

    // Page Header
    html += '<div class="page-header">';
    html += '<h2><span class="material-icons-round">fact_check</span> Attendance Tracking</h2>';
    html += '<div class="header-actions">';
    html += '<div class="view-toggle">';
    html += '<button class="view-toggle-btn' + (state.currentView === 'mark' ? ' active' : '') + '" data-view="mark"><span class="material-icons-round">edit_note</span> Mark</button>';
    html += '<button class="view-toggle-btn' + (state.currentView === 'history' ? ' active' : '') + '" data-view="history"><span class="material-icons-round">history</span> History</button>';
    html += '</div></div></div>';

    // Stats Cards
    html += '<div class="stats-grid">';
    html += '<div class="stat-card green"><div class="stat-icon"><span class="material-icons-round">check_circle</span></div><div class="stat-info"><div class="stat-number">' + stats.todayPercent + '%</div><div class="stat-label">Today\'s Attendance</div></div></div>';
    html += '<div class="stat-card cyan"><div class="stat-icon"><span class="material-icons-round">date_range</span></div><div class="stat-info"><div class="stat-number">' + stats.weekPercent + '%</div><div class="stat-label">This Week Avg</div></div></div>';
    html += '<div class="stat-card purple"><div class="stat-icon"><span class="material-icons-round">calendar_month</span></div><div class="stat-info"><div class="stat-number">' + stats.monthPercent + '%</div><div class="stat-label">This Month Avg</div></div></div>';
    html += '<div class="stat-card amber"><div class="stat-icon"><span class="material-icons-round">groups</span></div><div class="stat-info"><div class="stat-number">' + stats.todayTotal + '</div><div class="stat-label">Students Tracked Today</div></div></div>';
    html += '</div>';

    // Content based on view
    if (state.currentView === 'mark') {
      html += renderMarkView();
    } else {
      html += renderHistoryView();
    }

    container.innerHTML = html;
    attachEvents();
  }

  function renderMarkView() {
    var html = '';
    var availableClasses = getAvailableClasses();

    html += '<div class="card mt-2"><div class="card-header"><h3><span class="material-icons-round">edit_note</span> Mark Attendance</h3>';
    html += '<div class="flex gap-2">';
    html += '<input type="date" class="form-input" id="attendance-date" value="' + state.selectedDate + '" style="width:auto">';
    html += '</div></div><div class="card-body">';

    // Class Selection
    html += '<div class="flex gap-2 mb-3" style="flex-wrap:wrap">';
    html += '<select class="form-select" id="att-class-select" style="width:auto;min-width:150px"><option value="">Select Class</option>';
    availableClasses.forEach(function(c) {
      var val = c.class + '-' + c.section;
      var isSelected = normalizeClassName(state.selectedClass) === normalizeClassName(c.class) &&
                       normalizeSectionName(state.selectedSection) === normalizeSectionName(c.section);
      html += '<option value="' + val + '"' + (isSelected ? ' selected' : '') + '>Class ' + val + '</option>';
    });
    html += '</select>';

    if (state.selectedClass && state.selectedSection) {
      var students = getStudentsForClass(state.selectedClass, state.selectedSection);
      html += '<span class="badge badge-info" style="font-size:13px;padding:8px 16px">' + students.length + ' Students</span>';

      // Check for existing record
      var existing = SchoolApp.store.attendance.find(function(a) {
        return a.date === state.selectedDate &&
               normalizeClassName(a.class) === normalizeClassName(state.selectedClass) &&
               normalizeSectionName(a.section) === normalizeSectionName(state.selectedSection);
      });
      if (existing) {
        html += '<span class="badge badge-warning" style="font-size:13px;padding:8px 16px">⚠ Already submitted for this date</span>';
      }

      // Quick actions
      html += '<div style="margin-left:auto;display:flex;gap:8px">';
      html += '<button class="btn btn-success btn-sm" id="mark-all-present"><span class="material-icons-round">done_all</span> All Present</button>';
      html += '<button class="btn btn-danger btn-sm" id="mark-all-absent"><span class="material-icons-round">close</span> All Absent</button>';
      html += '<button class="btn btn-secondary btn-sm" id="mark-reset"><span class="material-icons-round">refresh</span> Reset</button>';
      html += '</div>';
    }
    html += '</div>';

    // Attendance Grid
    if (state.selectedClass && state.selectedSection) {
      var students = getStudentsForClass(state.selectedClass, state.selectedSection);

      if (students.length > 0) {
        html += '<div class="attendance-grid">';
        students.forEach(function(s) {
          var status = state.attendanceStatus[s.id] || 'present';
          var initials = SchoolApp.getInitials(s.firstName, s.lastName);
          var color = SchoolApp.getAvatarColor(s.firstName + s.lastName);

          html += '<div class="attendance-card ' + status + '">';
          html += '<div class="avatar avatar-md" data-color="' + color + '">' + initials + '</div>';
          html += '<div class="student-name" style="color:var(--accent-primary); text-decoration:underline; cursor:pointer;" onclick="openStudentProfile(\'' + s.id + '\')">' + escapeHTML(SchoolApp.getStudentFullName(s)) + '</div>';
          html += '<div class="student-roll">Roll #' + s.rollNumber + '</div>';
          html += '<div class="status-buttons">';
          html += '<button class="status-btn present-btn' + (status === 'present' ? ' active' : '') + '" data-student="' + s.id + '" data-status="present" title="Present">P</button>';
          html += '<button class="status-btn absent-btn' + (status === 'absent' ? ' active' : '') + '" data-student="' + s.id + '" data-status="absent" title="Absent">A</button>';
          html += '<button class="status-btn late-btn' + (status === 'late' ? ' active' : '') + '" data-student="' + s.id + '" data-status="late" title="Late">L</button>';
          html += '</div></div>';
        });
        html += '</div>';

        // Summary
        var presentCount = 0, absentCount = 0, lateCount = 0;
        students.forEach(function(s) {
          var st = state.attendanceStatus[s.id] || 'present';
          if (st === 'present') presentCount++;
          else if (st === 'absent') absentCount++;
          else lateCount++;
        });
        var total = students.length;
        var perc = total > 0 ? Math.round(((presentCount + lateCount) / total) * 100) : 0;

        html += '<div class="attendance-summary">';
        html += '<div class="summary-item"><span class="summary-dot green"></span><strong>' + presentCount + '</strong> Present</div>';
        html += '<div class="summary-item"><span class="summary-dot red"></span><strong>' + absentCount + '</strong> Absent</div>';
        html += '<div class="summary-item"><span class="summary-dot amber"></span><strong>' + lateCount + '</strong> Late</div>';
        html += '<div class="summary-item"><strong>' + perc + '%</strong> Attendance</div>';
        html += '<button class="btn btn-primary" id="submit-attendance"><span class="material-icons-round">save</span> Submit Attendance</button>';
        html += '</div>';

        // Progress bar
        html += '<div class="mt-2"><div class="progress-bar"><div class="progress-fill" style="width:' + perc + '%; background: ' + (perc >= 90 ? 'var(--success)' : perc >= 75 ? 'var(--warning)' : 'var(--danger)') + '"></div></div></div>';
      } else {
        html += '<div class="empty-state"><span class="material-icons-round">school</span><h3>No Students</h3><p>No active students found in this class.</p></div>';
      }
    } else {
      html += '<div class="empty-state"><span class="material-icons-round">touch_app</span><h3>Select a Class</h3><p>Choose a class above to start marking attendance.</p></div>';
    }

    html += '</div></div>';
    return html;
  }

  function renderHistoryView() {
    var html = '';
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

    if (SchoolApp.isTeacher()) {
      var ct = SchoolApp.currentUser.classTeacherOf || [];
      classes = classes.filter(function(c) {
        return ct.some(function(item) { return String(item.class).toLowerCase().trim() === String(c).toLowerCase().trim(); });
      });
      sections = sections.filter(function(s) {
        return ct.some(function(item) { return String(item.section).toLowerCase().trim() === String(s).toLowerCase().trim(); });
      });
    }

    html += '<div class="card mt-2"><div class="card-header"><h3><span class="material-icons-round">history</span> Attendance History</h3></div><div class="card-body">';

    // Filters
    html += '<div class="toolbar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">';
    html += '<div class="filter-group">';
    html += '<input type="date" class="form-input" id="history-from" value="' + (state.historyFilters.fromDate || '') + '" style="width:auto" placeholder="From Date">';
    html += '<input type="date" class="form-input" id="history-to" value="' + (state.historyFilters.toDate || '') + '" style="width:auto" placeholder="To Date">';
    html += '<select class="form-select" id="history-class"><option value="all">All Classes</option>';
    classes.forEach(function(c) { html += '<option value="' + c + '"' + (state.historyFilters.classFilter === c ? ' selected' : '') + '>Class ' + c + '</option>'; });
    html += '</select>';
    html += '<select class="form-select" id="history-section"><option value="all">All Sections</option>';
    sections.forEach(function(s) { html += '<option value="' + s + '"' + (state.historyFilters.sectionFilter === s ? ' selected' : '') + '>Section ' + s + '</option>'; });
    html += '</select>';
    html += '</div>';

    // Archived attendance history button if archive exists
    var archiveInfo = SchoolApp.store.settings && SchoolApp.store.settings.attendanceArchive;
    if (archiveInfo && archiveInfo.documentId) {
      var archivePeriod = archiveInfo.period || 'Past Sessions';
      var archiveCount = archiveInfo.recordCount ? ' (' + archiveInfo.recordCount + ' records)' : '';
      html += '<div>';
      html += '<button type="button" class="btn btn-secondary btn-sm" id="btn-view-archive-att" title="View archived attendance records stored separately from active database">';
      html += '<span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">inventory_2</span>';
      html += 'View Archived History: ' + escapeHTML(archivePeriod) + archiveCount;
      html += '</button>';
      html += '</div>';
    }

    html += '</div>';

    // Filter attendance records
    var records = SchoolApp.store.attendance.slice();

    // Teacher filter (only show class teacher classes)
    if (SchoolApp.isTeacher()) {
      var ct = SchoolApp.currentUser.classTeacherOf || [];
      records = records.filter(function(r) {
        return ct.some(function(c) {
          return normalizeClassName(c.class) === normalizeClassName(r.class) &&
                 normalizeSectionName(c.section) === normalizeSectionName(r.section);
        });
      });
    }

    if (state.historyFilters.fromDate) {
      records = records.filter(function(r) { return r.date >= state.historyFilters.fromDate; });
    }
    if (state.historyFilters.toDate) {
      records = records.filter(function(r) { return r.date <= state.historyFilters.toDate; });
    }
    if (state.historyFilters.classFilter !== 'all') {
      records = records.filter(function(r) { return r.class === state.historyFilters.classFilter; });
    }
    if (state.historyFilters.sectionFilter !== 'all') {
      records = records.filter(function(r) { return r.section === state.historyFilters.sectionFilter; });
    }

    records.sort(function(a, b) { return b.date.localeCompare(a.date); });

    if (records.length > 0) {
      html += '<div class="table-container mt-2"><table class="data-table"><thead><tr>';
      html += '<th>Date</th><th>Class</th><th>Teacher</th><th>Present</th><th>Absent</th><th>Late</th><th>Attendance %</th><th>Actions</th>';
      html += '</tr></thead><tbody>';

      records.forEach(function(r) {
        var teacher = SchoolApp.store.teachers.find(function(t) { return t.id === r.teacherId; });
        var teacherName = teacher ? teacher.firstName + ' ' + teacher.lastName : 'Unknown';
        var present = r.records.filter(function(rec) { return rec.status === 'present'; }).length;
        var absent = r.records.filter(function(rec) { return rec.status === 'absent'; }).length;
        var late = r.records.filter(function(rec) { return rec.status === 'late'; }).length;
        var total = r.records.length;
        var perc = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
        var percClass = perc >= 90 ? 'badge-success' : perc >= 75 ? 'badge-warning' : 'badge-danger';

        html += '<tr>';
        html += '<td>' + SchoolApp.formatDate(r.date) + '</td>';
        html += '<td><span class="badge badge-info">' + r.class + '-' + r.section + '</span></td>';
        html += '<td>' + teacherName + '</td>';
        html += '<td><span style="color:var(--success)">' + present + '</span></td>';
        html += '<td><span style="color:var(--danger)">' + absent + '</span></td>';
        html += '<td><span style="color:var(--warning)">' + late + '</span></td>';
        html += '<td><span class="badge ' + percClass + '">' + perc + '%</span></td>';
        html += '<td><button class="btn-icon history-view-btn" data-id="' + r.id + '" title="View Details"><span class="material-icons-round">visibility</span></button>';
        if (absent > 0) {
          html += '<button class="btn-icon history-absence-notify-btn" data-id="' + r.id + '" title="Send Absence Intimation" style="color:var(--warning);"><span class="material-icons-round">campaign</span></button>';
        }
        if (SchoolApp.isAdmin()) {
          html += '<button class="btn-icon history-delete-btn" data-id="' + r.id + '" title="Delete"><span class="material-icons-round">delete</span></button>';
        }
        html += '</td></tr>';
      });

      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state mt-2"><span class="material-icons-round">event_busy</span><h3>No Records Found</h3><p>No attendance records match your filters.</p></div>';
    }

    html += '</div></div>';
    return html;
  }

  function attachEvents() {
    // View toggle
    document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.currentView = this.getAttribute('data-view');
        render();
      });
    });

    // Date
    var dateInput = document.getElementById('attendance-date');
    if (dateInput) dateInput.addEventListener('change', function() { state.selectedDate = this.value; render(); });

    // Class selection
    var classSelect = document.getElementById('att-class-select');
    if (classSelect) {
      classSelect.addEventListener('change', function() {
        var val = this.value;
        if (val) {
          var parsed = parseClassSection(val);
          state.selectedClass = parsed.class;
          state.selectedSection = parsed.section;
          // Initialize all as present
          var students = getStudentsForClass(state.selectedClass, state.selectedSection);
          state.attendanceStatus = {};
          students.forEach(function(s) { state.attendanceStatus[s.id] = 'present'; });

          // Load existing record if any
          var existing = SchoolApp.store.attendance.find(function(a) {
            return a.date === state.selectedDate &&
                   normalizeClassName(a.class) === normalizeClassName(state.selectedClass) &&
                   normalizeSectionName(a.section) === normalizeSectionName(state.selectedSection);
          });
          if (existing) {
            existing.records.forEach(function(rec) {
              state.attendanceStatus[rec.studentId] = rec.status;
            });
          }
        } else {
          state.selectedClass = '';
          state.selectedSection = '';
          state.attendanceStatus = {};
        }
        render();
      });
    }

    // Status buttons
    document.querySelectorAll('.status-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var studentId = this.getAttribute('data-student');
        var status = this.getAttribute('data-status');
        state.attendanceStatus[studentId] = status;
        render();
      });
    });

    // Mark all present
    var markAllPresent = document.getElementById('mark-all-present');
    if (markAllPresent) {
      markAllPresent.addEventListener('click', function() {
        Object.keys(state.attendanceStatus).forEach(function(id) { state.attendanceStatus[id] = 'present'; });
        render();
      });
    }

    // Mark all absent
    var markAllAbsent = document.getElementById('mark-all-absent');
    if (markAllAbsent) {
      markAllAbsent.addEventListener('click', function() {
        Object.keys(state.attendanceStatus).forEach(function(id) { state.attendanceStatus[id] = 'absent'; });
        render();
      });
    }

    // Reset
    var resetBtn = document.getElementById('mark-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        Object.keys(state.attendanceStatus).forEach(function(id) { state.attendanceStatus[id] = 'present'; });
        render();
      });
    }

    // Submit attendance
    var submitBtn = document.getElementById('submit-attendance');
    if (submitBtn) {
      submitBtn.addEventListener('click', function() {
        submitAttendance();
      });
    }

    // History filters
    var historyFrom = document.getElementById('history-from');
    if (historyFrom) historyFrom.addEventListener('change', function() { state.historyFilters.fromDate = this.value; render(); });

    var historyTo = document.getElementById('history-to');
    if (historyTo) historyTo.addEventListener('change', function() { state.historyFilters.toDate = this.value; render(); });

    var historyClass = document.getElementById('history-class');
    if (historyClass) historyClass.addEventListener('change', function() { state.historyFilters.classFilter = this.value; render(); });

    var historySection = document.getElementById('history-section');
    if (historySection) historySection.addEventListener('change', function() { state.historyFilters.sectionFilter = this.value; render(); });

    // History view detail buttons
    document.querySelectorAll('.history-view-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { viewAttendanceDetail(this.getAttribute('data-id')); });
    });

    // History absence intimation buttons
    document.querySelectorAll('.history-absence-notify-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var att = SchoolApp.store.attendance.find(function(a) { return a.id === id; });
        if (!att) return;
        var absentRecs = att.records.filter(function(r) { return r.status === 'absent'; });
        var absentStudents = absentRecs.map(function(r) {
          return SchoolApp.store.students.find(function(s) { return s.id === r.studentId; });
        }).filter(Boolean);
        if (absentStudents.length > 0) {
          showAbsentIntimationModal(absentStudents, att.class, att.section, att.date);
        } else {
          SchoolApp.showToast('No absent students in this record.', 'info');
        }
      });
    });

    // History delete buttons
    document.querySelectorAll('.history-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var att = SchoolApp.store.attendance.find(function(a) { return a.id === id; });
        if (!att) return;
        SchoolApp.showConfirm('Delete this attendance record? It can be recovered from the Recycle Bin.', function() {
          SchoolApp.moveToTrash('attendance', att.id, 'Attendance: Class ' + att.class + '-' + att.section, SchoolApp.formatDate(att.date), att);
          SchoolApp.store.attendance = SchoolApp.store.attendance.filter(function(a) { return a.id !== id; });
          SchoolApp.save();
          SchoolApp.showToast('Attendance record moved to Recycle Bin.', 'success');
          render();
        });
      });
    });

    // View Archived Attendance History button
    var viewArchiveBtn = document.getElementById('btn-view-archive-att');
    if (viewArchiveBtn) {
      viewArchiveBtn.addEventListener('click', function() {
        openArchivedAttendanceModal();
      });
    }
  }

  function submitAttendance() {
    if (!state.selectedClass || !state.selectedSection) {
      SchoolApp.showToast('Please select a class first.', 'warning');
      return;
    }

    if (SchoolApp.isTeacher()) {
      var ct = SchoolApp.currentUser.classTeacherOf || [];
      var isCt = ct.some(function(c) {
        return normalizeClassName(c.class) === normalizeClassName(state.selectedClass) &&
               normalizeSectionName(c.section) === normalizeSectionName(state.selectedSection);
      });
      if (!isCt) {
        SchoolApp.showToast('Access Denied: You are not the Class Teacher for this class.', 'error');
        return;
      }
    }

    // Check for existing record
    var existingIdx = SchoolApp.store.attendance.findIndex(function(a) {
      return a.date === state.selectedDate &&
             normalizeClassName(a.class) === normalizeClassName(state.selectedClass) &&
             normalizeSectionName(a.section) === normalizeSectionName(state.selectedSection);
    });

    var records = Object.keys(state.attendanceStatus).map(function(studentId) {
      return { studentId: studentId, status: state.attendanceStatus[studentId] };
    });

    var teacherId = SchoolApp.currentUser.id;

    if (existingIdx !== -1) {
      // Update existing
      SchoolApp.store.attendance[existingIdx].records = records;
      SchoolApp.store.attendance[existingIdx].teacherId = teacherId;
      SchoolApp.store.attendance[existingIdx].timestamp = new Date().toISOString();
      SchoolApp.showToast('Attendance updated for Class ' + state.selectedClass + '-' + state.selectedSection + '.', 'success');
    } else {
      // Create new
      SchoolApp.store.attendance.push({
        id: SchoolApp.generateId(),
        date: state.selectedDate,
        class: state.selectedClass,
        section: state.selectedSection,
        teacherId: teacherId,
        records: records,
        timestamp: new Date().toISOString()
      });
      SchoolApp.showToast('Attendance submitted for Class ' + state.selectedClass + '-' + state.selectedSection + '!', 'success');
    }

    SchoolApp.save();
    render();

    // Auto-trigger Absent Student Parent Intimation modal if absent students exist
    var absentStudentRecords = records.filter(function(r) { return r.status === 'absent'; });
    if (absentStudentRecords.length > 0) {
      var absentStudents = absentStudentRecords.map(function(r) {
        return SchoolApp.store.students.find(function(s) { return s.id === r.studentId; });
      }).filter(Boolean);

      if (absentStudents.length > 0) {
        setTimeout(function() {
          showAbsentIntimationModal(absentStudents, state.selectedClass, state.selectedSection, state.selectedDate);
        }, 300);
      }
    }
  }

  function viewAttendanceDetail(recordOrId) {
    var record = null;
    if (typeof recordOrId === 'object' && recordOrId !== null) {
      record = recordOrId;
    } else {
      record = SchoolApp.store.attendance.find(function(a) { return a.id === recordOrId; });
      if (!record && archivedRecordsCache) {
        record = archivedRecordsCache.find(function(a) { return a.id === recordOrId; });
      }
    }
    if (!record) return;

    if (SchoolApp.isTeacher()) {
      var ct = SchoolApp.currentUser.classTeacherOf || [];
      var isCt = ct.some(function(c) {
        return normalizeClassName(c.class) === normalizeClassName(record.class) &&
               normalizeSectionName(c.section) === normalizeSectionName(record.section);
      });
      if (!isCt) {
        SchoolApp.showToast('Access Denied: You do not have permission to view attendance for this class.', 'error');
        return;
      }
    }

    var teacher = SchoolApp.store.teachers.find(function(t) { return t.id === record.teacherId; });
    var teacherName = teacher ? teacher.firstName + ' ' + teacher.lastName : 'Unknown';

    var present = record.records.filter(function(r) { return r.status === 'present'; }).length;
    var absent = record.records.filter(function(r) { return r.status === 'absent'; }).length;
    var late = record.records.filter(function(r) { return r.status === 'late'; }).length;
    var total = record.records.length;
    var perc = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    var html = '<div class="flex-between mb-3">';
    html += '<div><strong>Date:</strong> ' + SchoolApp.formatDate(record.date) + '</div>';
    html += '<div><strong>Class:</strong> ' + record.class + '-' + record.section + '</div>';
    html += '<div><strong>Teacher:</strong> ' + teacherName + '</div>';
    html += '</div>';

    html += '<div class="flex gap-2 mb-3">';
    html += '<span class="badge badge-success">Present: ' + present + '</span>';
    html += '<span class="badge badge-danger">Absent: ' + absent + '</span>';
    html += '<span class="badge badge-warning">Late: ' + late + '</span>';
    html += '<span class="badge badge-info">Total: ' + perc + '%</span>';
    html += '</div>';

    html += '<div class="table-container"><table class="data-table"><thead><tr><th>Student</th><th>Roll No.</th><th>Status</th></tr></thead><tbody>';

    record.records.forEach(function(rec) {
      var student = SchoolApp.store.students.find(function(s) { return s.id === rec.studentId; });
      var name = student ? SchoolApp.getStudentFullName(student) : 'Unknown';
      var roll = student ? student.rollNumber : '—';
      var statusClass = rec.status === 'present' ? 'badge-success' : rec.status === 'absent' ? 'badge-danger' : 'badge-warning';
      var statusText = rec.status.charAt(0).toUpperCase() + rec.status.slice(1);

      var nameHtml = student ? '<span style="color:var(--accent-primary); text-decoration:underline; cursor:pointer;" onclick="openStudentProfile(\'' + student.id + '\')">' + escapeHTML(name) + '</span>' : escapeHTML(name);
      html += '<tr><td>' + nameHtml + '</td><td>' + roll + '</td><td><span class="badge ' + statusClass + '">' + statusText + '</span></td></tr>';
    });

    html += '</tbody></table></div>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>';
    if (absent > 0) {
      footerHTML += '<button class="btn btn-warning" id="modal-absence-notify-btn"><span class="material-icons-round">campaign</span> Notify Absent Parents (' + absent + ')</button>';
    }
    footerHTML += '<button class="btn btn-primary" onclick="SchoolApp.utils.exportToExcel(' + JSON.stringify(record.records.map(function(rec) {
      var student = SchoolApp.store.students.find(function(s) { return s.id === rec.studentId; });
      return { Name: student ? SchoolApp.getStudentFullName(student) : 'Unknown', Roll: student ? student.rollNumber : '', Status: rec.status };
    })) + ', [{header:\'Name\',key:\'Name\'},{header:\'Roll No\',key:\'Roll\'},{header:\'Status\',key:\'Status\'}], \'attendance_' + record.date + '_' + record.class + record.section + '.xlsx\')"><span class="material-icons-round">download</span> Export</button>';

    SchoolApp.showModal('Attendance Details - ' + SchoolApp.formatDate(record.date), html, footerHTML);

    var notifyBtn = document.getElementById('modal-absence-notify-btn');
    if (notifyBtn) {
      notifyBtn.addEventListener('click', function() {
        var absentRecs = record.records.filter(function(r) { return r.status === 'absent'; });
        var absentStudents = absentRecs.map(function(r) {
          return SchoolApp.store.students.find(function(s) { return s.id === r.studentId; });
        }).filter(Boolean);
        if (absentStudents.length > 0) {
          showAbsentIntimationModal(absentStudents, record.class, record.section, record.date);
        }
      });
    }
  }

  /* ============================================================
     ARCHIVED ATTENDANCE HISTORY VIEWER (ON-DEMAND READ-ONLY)
     ============================================================ */

  async function openArchivedAttendanceModal() {
    var archiveInfo = SchoolApp.store.settings && SchoolApp.store.settings.attendanceArchive;
    if (!archiveInfo || !archiveInfo.documentId) {
      SchoolApp.showToast('No archived attendance configuration found for this school.', 'info');
      return;
    }

    var docId = archiveInfo.documentId;
    var periodLabel = archiveInfo.period || 'June 2026 – August 2026';

    // Show loading state modal
    var loadingHTML = '<div class="text-center p-4"><span class="material-icons-round spinning" style="font-size:36px;color:var(--accent-primary);">sync</span><p class="mt-2" style="color:var(--text-secondary);">Loading archived attendance records from cold storage...</p></div>';
    SchoolApp.showModal('Archived Attendance History — ' + escapeHTML(periodLabel), loadingHTML, '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>');

    try {
      if (!archivedRecordsCache) {
        if (!window.firestore || !window.db) {
          throw new Error('Firestore client is not available.');
        }
        var docRef = window.firestore.doc(window.db, 'tenant_data', docId);
        var docSnap = await window.firestore.getDoc(docRef);

        if (!docSnap.exists()) {
          throw new Error('Archive document "' + docId + '" does not exist.');
        }

        var data = docSnap.data() || {};
        archivedRecordsCache = Array.isArray(data.attendance) ? data.attendance : [];
      }

      // Reset filters when opening
      archiveModalFilters = {
        fromDate: '',
        toDate: '',
        classFilter: 'all',
        sectionFilter: 'all'
      };

      renderArchivedModalContent(periodLabel);
    } catch (err) {
      console.error('Failed to load archived attendance:', err);
      var errHTML = '<div class="empty-state"><span class="material-icons-round" style="color:var(--danger);font-size:40px;">error_outline</span><h3>Failed to Load Archive</h3><p>' + escapeHTML(err.message || 'An error occurred while fetching records.') + '</p></div>';
      SchoolApp.showModal('Archived Attendance History', errHTML, '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>');
    }
  }

  function renderArchivedModalContent(periodLabel) {
    var totalRecords = archivedRecordsCache ? archivedRecordsCache.length : 0;

    // Collect available classes and sections from the archived records
    var classSet = new Set();
    var sectionSet = new Set();
    if (archivedRecordsCache) {
      archivedRecordsCache.forEach(function(r) {
        if (r.class) classSet.add(r.class);
        if (r.section) sectionSet.add(r.section);
      });
    }
    var classes = Array.from(classSet).sort(function(a, b) {
      return String(a).localeCompare(String(b), undefined, { numeric: true });
    });
    var sections = Array.from(sectionSet).sort();

    // Teacher class filter check
    if (SchoolApp.isTeacher()) {
      var ct = SchoolApp.currentUser.classTeacherOf || [];
      classes = classes.filter(function(c) {
        return ct.some(function(item) { return String(item.class).toLowerCase().trim() === String(c).toLowerCase().trim(); });
      });
      sections = sections.filter(function(s) {
        return ct.some(function(item) { return String(item.section).toLowerCase().trim() === String(s).toLowerCase().trim(); });
      });
    }

    var bodyHTML = '<div style="display:flex; flex-direction:column; gap:16px;">';

    // Header notice banner
    bodyHTML += '<div style="background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.25); border-radius:var(--radius-md); padding:10px 14px; font-size:13px; color:var(--text-secondary); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">';
    bodyHTML += '<div><span class="material-icons-round" style="color:var(--accent-primary); font-size:16px; vertical-align:middle; margin-right:4px;">folder_special</span>';
    bodyHTML += '<span>Archive Period: <strong>' + escapeHTML(periodLabel) + '</strong> | Total: <strong>' + totalRecords + ' records</strong></span></div>';
    bodyHTML += '<span class="badge badge-info" style="font-size:11px;">Cold Storage • Read Only</span>';
    bodyHTML += '</div>';

    // Filter controls
    bodyHTML += '<div class="toolbar" style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">';
    bodyHTML += '<div class="filter-group" style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; width:100%;">';
    bodyHTML += '<input type="date" class="form-input" id="arch-filter-from" value="' + (archiveModalFilters.fromDate || '') + '" style="width:auto; flex:1; min-width:130px;" placeholder="From Date" title="From Date">';
    bodyHTML += '<input type="date" class="form-input" id="arch-filter-to" value="' + (archiveModalFilters.toDate || '') + '" style="width:auto; flex:1; min-width:130px;" placeholder="To Date" title="To Date">';
    bodyHTML += '<select class="form-select" id="arch-filter-class" style="width:auto; flex:1; min-width:120px;"><option value="all">All Classes</option>';
    classes.forEach(function(c) {
      bodyHTML += '<option value="' + escapeHTML(c) + '"' + (archiveModalFilters.classFilter === c ? ' selected' : '') + '>Class ' + escapeHTML(c) + '</option>';
    });
    bodyHTML += '</select>';
    bodyHTML += '<select class="form-select" id="arch-filter-section" style="width:auto; flex:1; min-width:120px;"><option value="all">All Sections</option>';
    sections.forEach(function(s) {
      bodyHTML += '<option value="' + escapeHTML(s) + '"' + (archiveModalFilters.sectionFilter === s ? ' selected' : '') + '>Section ' + escapeHTML(s) + '</option>';
    });
    bodyHTML += '</select>';
    bodyHTML += '<button type="button" class="btn btn-secondary btn-sm" id="arch-filter-reset" title="Reset Filters" style="padding:6px 12px;">Reset</button>';
    bodyHTML += '</div></div>';

    // Container for table
    bodyHTML += '<div id="arch-table-container"></div>';
    bodyHTML += '</div>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>';

    SchoolApp.showModal('Archived Attendance History — ' + escapeHTML(periodLabel), bodyHTML, footerHTML);

    // Expand modal-container width for comfortable wide-table display
    var container = document.getElementById('modal-container');
    if (container) {
      container.style.maxWidth = '900px';
    }

    // Attach filter listeners
    var fromInput = document.getElementById('arch-filter-from');
    var toInput = document.getElementById('arch-filter-to');
    var classSelect = document.getElementById('arch-filter-class');
    var secSelect = document.getElementById('arch-filter-section');
    var resetBtn = document.getElementById('arch-filter-reset');

    if (fromInput) {
      fromInput.addEventListener('change', function() {
        archiveModalFilters.fromDate = this.value;
        renderArchiveTableBody();
      });
    }
    if (toInput) {
      toInput.addEventListener('change', function() {
        archiveModalFilters.toDate = this.value;
        renderArchiveTableBody();
      });
    }
    if (classSelect) {
      classSelect.addEventListener('change', function() {
        archiveModalFilters.classFilter = this.value;
        renderArchiveTableBody();
      });
    }
    if (secSelect) {
      secSelect.addEventListener('change', function() {
        archiveModalFilters.sectionFilter = this.value;
        renderArchiveTableBody();
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        archiveModalFilters = { fromDate: '', toDate: '', classFilter: 'all', sectionFilter: 'all' };
        if (fromInput) fromInput.value = '';
        if (toInput) toInput.value = '';
        if (classSelect) classSelect.value = 'all';
        if (secSelect) secSelect.value = 'all';
        renderArchiveTableBody();
      });
    }

    renderArchiveTableBody();
  }

  function renderArchiveTableBody() {
    var tableContainer = document.getElementById('arch-table-container');
    if (!tableContainer) return;

    var filtered = (archivedRecordsCache || []).slice();

    // Teacher class filter check
    if (SchoolApp.isTeacher()) {
      var ct = SchoolApp.currentUser.classTeacherOf || [];
      filtered = filtered.filter(function(r) {
        return ct.some(function(c) {
          return normalizeClassName(c.class) === normalizeClassName(r.class) &&
                 normalizeSectionName(c.section) === normalizeSectionName(r.section);
        });
      });
    }

    if (archiveModalFilters.fromDate) {
      filtered = filtered.filter(function(r) { return r.date >= archiveModalFilters.fromDate; });
    }
    if (archiveModalFilters.toDate) {
      filtered = filtered.filter(function(r) { return r.date <= archiveModalFilters.toDate; });
    }
    if (archiveModalFilters.classFilter !== 'all') {
      filtered = filtered.filter(function(r) { return r.class === archiveModalFilters.classFilter; });
    }
    if (archiveModalFilters.sectionFilter !== 'all') {
      filtered = filtered.filter(function(r) { return r.section === archiveModalFilters.sectionFilter; });
    }

    filtered.sort(function(a, b) { return b.date.localeCompare(a.date); });

    var html = '';
    html += '<div style="font-size:12px; color:var(--text-muted); margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">';
    html += '<span>Showing <strong>' + filtered.length + '</strong> matching archived records</span>';
    if (filtered.length > 0) {
      html += '<span style="font-size:11px;">Sorted latest to oldest</span>';
    }
    html += '</div>';

    if (filtered.length > 0) {
      html += '<div class="table-container" style="max-height:480px; overflow-y:auto;"><table class="data-table"><thead><tr>';
      html += '<th>Date</th><th>Class</th><th>Teacher</th><th>Present</th><th>Absent</th><th>Late</th><th>Attendance %</th><th>Action</th>';
      html += '</tr></thead><tbody>';

      filtered.forEach(function(r) {
        var teacher = SchoolApp.store.teachers && SchoolApp.store.teachers.find(function(t) { return t.id === r.teacherId; });
        var teacherName = teacher ? (teacher.firstName + ' ' + (teacher.lastName || '')).trim() : (r.teacherName || 'Unknown');
        var recs = Array.isArray(r.records) ? r.records : [];
        var present = recs.filter(function(rec) { return rec.status === 'present'; }).length;
        var absent = recs.filter(function(rec) { return rec.status === 'absent'; }).length;
        var late = recs.filter(function(rec) { return rec.status === 'late'; }).length;
        var total = recs.length;
        var perc = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
        var percClass = perc >= 90 ? 'badge-success' : perc >= 75 ? 'badge-warning' : 'badge-danger';

        html += '<tr>';
        html += '<td>' + SchoolApp.formatDate(r.date) + '</td>';
        html += '<td><span class="badge badge-info">' + escapeHTML(r.class) + (r.section ? '-' + escapeHTML(r.section) : '') + '</span></td>';
        html += '<td>' + escapeHTML(teacherName) + '</td>';
        html += '<td><span style="color:var(--success);font-weight:600;">' + present + '</span></td>';
        html += '<td><span style="color:var(--danger);font-weight:600;">' + absent + '</span></td>';
        html += '<td><span style="color:var(--warning);font-weight:600;">' + late + '</span></td>';
        html += '<td><span class="badge ' + percClass + '">' + perc + '%</span></td>';
        html += '<td>';
        html += '<button type="button" class="btn-icon arch-record-view-btn" data-id="' + escapeHTML(r.id) + '" title="View Attendance Roster"><span class="material-icons-round">visibility</span></button>';
        html += '</td>';
        html += '</tr>';
      });

      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state" style="padding:24px 16px;"><span class="material-icons-round" style="font-size:32px;color:var(--text-muted);">event_busy</span><h4 style="margin:8px 0 4px 0;">No Archived Records Found</h4><p style="font-size:13px;color:var(--text-muted);margin:0;">No records in this archive match your selected filter criteria.</p></div>';
    }

    tableContainer.innerHTML = html;

    // Attach view roster click handlers
    tableContainer.querySelectorAll('.arch-record-view-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var recordId = this.getAttribute('data-id');
        var rec = archivedRecordsCache && archivedRecordsCache.find(function(a) { return a.id === recordId; });
        if (rec) {
          viewAttendanceDetail(rec);
        }
      });
    });
  }

  /* ============================================================
     ABSENT STUDENT PARENT INTIMATION MODULE
     ============================================================ */

  function buildAbsenceMessage(student, className, sectionName, date, schoolName) {
    var studentName = (student.firstName + ' ' + (student.lastName || '')).trim();
    return 'Dear Parent/Guardian,\n\n' +
      'This is to inform you that your ward ' + studentName +
      ' (Class ' + className + (sectionName ? ' - ' + sectionName : '') + ') was marked ABSENT from school today, ' + SchoolApp.formatDate(date) +
      '.\n\nRegards,\n' + (schoolName || 'School Management');
  }

  function getStudentParentPhone(student) {
    if (!student) return '';
    var raw = student.parentPhone || student.parentMobile || student.fatherMobile || student.phone || '';
    return String(raw).replace(/\D/g, '');
  }

  function markAbsenceRowSent(studentId, channel, rowEl) {
    var badgeEl = rowEl ? rowEl.querySelector('.status-badge') : document.querySelector('.status-badge-' + studentId);
    if (badgeEl) {
      badgeEl.className = 'status-badge status-badge-' + studentId + ' badge badge-success';
      badgeEl.innerHTML = channel === 'whatsapp' ? '✅ WhatsApp Sent' : '✅ SMS Sent';
    }
  }

  function logAbsenceIntimation(studentId, date, channel, status) {
    if (!SchoolApp.store.absenceIntimationLog) {
      SchoolApp.store.absenceIntimationLog = [];
    }
    SchoolApp.store.absenceIntimationLog.push({
      studentId: studentId,
      date: date,
      channel: channel,
      status: status,
      sentBy: (SchoolApp.currentUser && SchoolApp.currentUser.username) || 'unknown',
      sentAt: new Date().toISOString()
    });
    SchoolApp.save(true);
  }

  function sendAbsenceWhatsApp(student, className, sectionName, date, schoolSettings, rowEl) {
    var parentMobile = getStudentParentPhone(student);
    var studentName = (student.firstName + ' ' + (student.lastName || '')).trim();

    if (!parentMobile || parentMobile.length < 10) {
      SchoolApp.showToast('No valid parent phone number found for ' + studentName, 'error');
      return;
    }

    var schoolName = (schoolSettings && (schoolSettings.schoolName || (schoolSettings.schoolInfo && schoolSettings.schoolInfo.name))) || 'Shishu Vikash Mandir';
    var message = buildAbsenceMessage(student, className, sectionName, date, schoolName);

    var sent = SchoolApp.shareOnWhatsApp(parentMobile, message);
    if (sent) {
      markAbsenceRowSent(student.id, 'whatsapp', rowEl);
      logAbsenceIntimation(student.id, date, 'whatsapp', 'sent');
    }
  }

  async function sendAbsenceSMS(student, className, sectionName, date, schoolSettings, rowEl) {
    var apiKey = schoolSettings && schoolSettings.fast2smsApiKey;
    if (!apiKey) return;

    var parentMobile = getStudentParentPhone(student);
    var studentName = (student.firstName + ' ' + (student.lastName || '')).trim();
    if (!parentMobile || parentMobile.length < 10) {
      SchoolApp.showToast('No valid parent phone number found for ' + studentName, 'error');
      return;
    }

    var schoolName = (schoolSettings && (schoolSettings.schoolName || (schoolSettings.schoolInfo && schoolSettings.schoolInfo.name))) || 'School Management';
    var message = buildAbsenceMessage(student, className, sectionName, date, schoolName);

    try {
      SchoolApp.showToast('Sending SMS to parent of ' + studentName + '...', 'info');
      var response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route: 'q',
          message: message,
          language: 'english',
          flash: 0,
          numbers: parentMobile
        })
      });
      var result = await response.json();
      var isSent = result && result.return === true;
      if (isSent) {
        markAbsenceRowSent(student.id, 'sms', rowEl);
        SchoolApp.showToast('SMS sent successfully for ' + studentName, 'success');
      } else {
        SchoolApp.showToast('SMS failed: ' + (result.message || 'API error'), 'error');
      }
      logAbsenceIntimation(student.id, date, 'sms', isSent ? 'sent' : 'failed');
    } catch (err) {
      SchoolApp.showToast('SMS dispatch error for ' + studentName, 'error');
      logAbsenceIntimation(student.id, date, 'sms', 'failed');
    }
  }

  function showAbsentIntimationModal(absentStudents, className, sectionName, date) {
    if (!absentStudents || absentStudents.length === 0) return;

    var schoolSettings = SchoolApp.store.settings || {};
    var hasSMS = Boolean(schoolSettings.fast2smsApiKey && schoolSettings.fast2smsApiKey.trim() !== '');

    var bodyHTML = '<div class="absent-intimation-view">';
    bodyHTML += '<div style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); padding:12px 16px; border-radius:8px; margin-bottom:16px; display:flex; align-items:center; gap:12px;">';
    bodyHTML += '<span class="material-icons-round" style="color:var(--danger); font-size:28px;">campaign</span>';
    bodyHTML += '<div>';
    bodyHTML += '<h4 style="margin:0; color:var(--text-primary); font-size:15px;">📢 Inform Absent Student Parents (' + absentStudents.length + ')</h4>';
    bodyHTML += '<p style="margin:2px 0 0 0; color:var(--text-secondary); font-size:12px;">Class ' + escapeHTML(className) + (sectionName ? '-' + escapeHTML(sectionName) : '') + ' · Date: ' + SchoolApp.formatDate(date) + '</p>';
    bodyHTML += '</div></div>';

    bodyHTML += '<div class="table-container" style="max-height:360px; overflow-y:auto;">';
    bodyHTML += '<table class="data-table"><thead><tr>';
    bodyHTML += '<th>Student</th><th>Roll</th><th>Parent Contact</th><th>Actions</th><th>Status</th>';
    bodyHTML += '</tr></thead><tbody>';

    absentStudents.forEach(function(s) {
      var sName = (s.firstName + ' ' + (s.lastName || '')).trim();
      var rawPhone = s.parentPhone || s.parentMobile || s.fatherMobile || s.phone || '';
      var displayPhone = rawPhone ? rawPhone : '<span style="color:var(--danger)">No Phone</span>';

      bodyHTML += '<tr class="absent-row-' + s.id + '">';
      bodyHTML += '<td><strong>' + escapeHTML(sName) + '</strong></td>';
      bodyHTML += '<td>#' + (s.rollNumber || '—') + '</td>';
      bodyHTML += '<td>' + displayPhone + '</td>';
      bodyHTML += '<td><div style="display:flex; gap:6px; align-items:center;">';
      bodyHTML += '<button class="btn btn-sm absence-wa-btn" data-student-id="' + s.id + '" style="background:#25D366; color:#fff; border:none; padding:4px 10px; font-size:12px; display:inline-flex; align-items:center; gap:4px;"><span class="material-icons-round" style="font-size:14px">send</span> 📱 WhatsApp</button>';

      if (hasSMS) {
        bodyHTML += '<button class="btn btn-sm btn-primary absence-sms-btn" data-student-id="' + s.id + '" style="padding:4px 10px; font-size:12px; display:inline-flex; align-items:center; gap:4px;"><span class="material-icons-round" style="font-size:14px">sms</span> 💬 SMS</button>';
      } else {
        bodyHTML += '<button class="btn btn-sm btn-secondary absence-sms-btn" disabled title="SMS not configured. Contact admin to enable automatic SMS." style="padding:4px 10px; font-size:12px; opacity:0.5; cursor:not-allowed; display:inline-flex; align-items:center; gap:4px;"><span class="material-icons-round" style="font-size:14px">sms</span> 💬 SMS</button>';
      }

      bodyHTML += '</div></td>';
      bodyHTML += '<td><span class="status-badge status-badge-' + s.id + ' badge badge-secondary" style="font-size:11px;">⬜ Pending</span></td>';
      bodyHTML += '</tr>';
    });

    bodyHTML += '</tbody></table></div></div>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close / Skip</button>';

    SchoolApp.showModal('Absent Students Intimation', bodyHTML, footerHTML);

    document.querySelectorAll('.absence-wa-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var sId = this.getAttribute('data-student-id');
        var studentObj = absentStudents.find(function(x) { return x.id === sId; });
        var rowEl = document.querySelector('.absent-row-' + sId);
        if (studentObj) {
          sendAbsenceWhatsApp(studentObj, className, sectionName, date, schoolSettings, rowEl);
        }
      });
    });

    document.querySelectorAll('.absence-sms-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (this.disabled) return;
        var sId = this.getAttribute('data-student-id');
        var studentObj = absentStudents.find(function(x) { return x.id === sId; });
        var rowEl = document.querySelector('.absent-row-' + sId);
        if (studentObj) {
          sendAbsenceSMS(studentObj, className, sectionName, date, schoolSettings, rowEl);
        }
      });
    });
  }

  // Register Module
  SchoolApp.registerModule('attendance', {
    init: function() {},
    render: render
  });

})();

