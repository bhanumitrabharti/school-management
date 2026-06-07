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
    var currentSchoolId = SchoolApp.store.currentSchoolId || 'svm_bokaro_001';
    if (currentSchoolId !== 'svm_bokaro_001') {
      return [];
    }
    var combos = [];
    (SchoolApp.store.settings.classes || []).forEach(function(c) {
      (SchoolApp.store.settings.sections || []).forEach(function(s) {
        // Only include classes that have students
        var hasStudents = SchoolApp.store.students.some(function(st) {
          var studentClass = String(st.class).replace(/^class\s+/i, '').trim().toLowerCase();
          var studentSection = String(st.section).trim().toLowerCase();
          return studentClass === String(c).replace(/^class\s+/i, '').trim().toLowerCase() &&
                 studentSection === String(s).trim().toLowerCase();
        });
        if (hasStudents) combos.push({ class: c, section: s });
      });
    });
    return combos;
  }

  function getStudentsForClass(cls, section) {
    var currentSchoolId = SchoolApp.store.currentSchoolId || 'svm_bokaro_001';
    if (currentSchoolId !== 'svm_bokaro_001') {
      return [];
    }
    return SchoolApp.store.students.filter(function(s) {
      var studentClass = String(s.class).replace(/^class\s+/i, '').trim().toLowerCase();
      var studentSection = String(s.section).trim().toLowerCase();
      var filterClass = String(cls).replace(/^class\s+/i, '').trim().toLowerCase();
      var filterSection = String(section).trim().toLowerCase();
      return studentClass === filterClass && studentSection === filterSection && s.status === 'Active';
    }).sort(function(a, b) {
      return a.rollNumber.localeCompare(b.rollNumber);
    });
  }

  function getAttendanceStats() {
    var currentSchoolId = SchoolApp.store.currentSchoolId || 'svm_bokaro_001';
    if (currentSchoolId !== 'svm_bokaro_001') {
      return {
        todayPercent: 0,
        todayPresent: 0,
        todayAbsent: 0,
        todayLate: 0,
        todayTotal: 0,
        weekPercent: 0,
        monthPercent: 0
      };
    }
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
      var isSelected = String(state.selectedClass).replace(/^class\s+/i, '').trim().toLowerCase() === String(c.class).replace(/^class\s+/i, '').trim().toLowerCase() &&
                       String(state.selectedSection).trim().toLowerCase() === String(c.section).trim().toLowerCase();
      html += '<option value="' + val + '"' + (isSelected ? ' selected' : '') + '>Class ' + val + '</option>';
    });
    html += '</select>';

    if (state.selectedClass && state.selectedSection) {
      var students = getStudentsForClass(state.selectedClass, state.selectedSection);
      html += '<span class="badge badge-info" style="font-size:13px;padding:8px 16px">' + students.length + ' Students</span>';

      // Check for existing record
      var existing = SchoolApp.store.attendance.find(function(a) {
        return a.date === state.selectedDate &&
               String(a.class).replace(/^class\s+/i, '').trim().toLowerCase() === String(state.selectedClass).replace(/^class\s+/i, '').trim().toLowerCase() &&
               String(a.section).trim().toLowerCase() === String(state.selectedSection).trim().toLowerCase();
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
          html += '<div class="student-name">' + s.firstName + ' ' + s.lastName + '</div>';
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
    var classes = SchoolApp.store.settings.classes || [];
    var sections = SchoolApp.store.settings.sections || [];

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
    html += '<div class="toolbar">';
    html += '<div class="filter-group">';
    html += '<input type="date" class="form-input" id="history-from" value="' + (state.historyFilters.fromDate || '') + '" style="width:auto" placeholder="From Date">';
    html += '<input type="date" class="form-input" id="history-to" value="' + (state.historyFilters.toDate || '') + '" style="width:auto" placeholder="To Date">';
    html += '<select class="form-select" id="history-class"><option value="all">All Classes</option>';
    classes.forEach(function(c) { html += '<option value="' + c + '"' + (state.historyFilters.classFilter === c ? ' selected' : '') + '>Class ' + c + '</option>'; });
    html += '</select>';
    html += '<select class="form-select" id="history-section"><option value="all">All Sections</option>';
    sections.forEach(function(s) { html += '<option value="' + s + '"' + (state.historyFilters.sectionFilter === s ? ' selected' : '') + '>Section ' + s + '</option>'; });
    html += '</select>';
    html += '</div></div>';

    // Filter attendance records
    var records = SchoolApp.store.attendance.slice();

    // Teacher filter (only show class teacher classes)
    if (SchoolApp.isTeacher()) {
      var ct = SchoolApp.currentUser.classTeacherOf || [];
      records = records.filter(function(r) {
        return ct.some(function(c) {
          return String(c.class).toLowerCase().trim() === String(r.class).toLowerCase().trim() &&
                 String(c.section).toLowerCase().trim() === String(r.section).toLowerCase().trim();
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
                   String(a.class).replace(/^class\s+/i, '').trim().toLowerCase() === String(state.selectedClass).replace(/^class\s+/i, '').trim().toLowerCase() &&
                   String(a.section).trim().toLowerCase() === String(state.selectedSection).trim().toLowerCase();
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
  }

  function submitAttendance() {
    if (!state.selectedClass || !state.selectedSection) {
      SchoolApp.showToast('Please select a class first.', 'warning');
      return;
    }

    if (SchoolApp.isTeacher()) {
      var ct = SchoolApp.currentUser.classTeacherOf || [];
      var isCt = ct.some(function(c) {
        return String(c.class).toLowerCase().trim() === String(state.selectedClass).toLowerCase().trim() &&
               String(c.section).toLowerCase().trim() === String(state.selectedSection).toLowerCase().trim();
      });
      if (!isCt) {
        SchoolApp.showToast('Access Denied: You are not the Class Teacher for this class.', 'error');
        return;
      }
    }

    // Check for existing record
    var existingIdx = SchoolApp.store.attendance.findIndex(function(a) {
      return a.date === state.selectedDate && a.class === state.selectedClass && a.section === state.selectedSection;
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
  }

  function viewAttendanceDetail(id) {
    var record = SchoolApp.store.attendance.find(function(a) { return a.id === id; });
    if (!record) return;

    if (SchoolApp.isTeacher()) {
      var ct = SchoolApp.currentUser.classTeacherOf || [];
      var isCt = ct.some(function(c) {
        return String(c.class).toLowerCase().trim() === String(record.class).toLowerCase().trim() &&
               String(c.section).toLowerCase().trim() === String(record.section).toLowerCase().trim();
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
      var name = student ? student.firstName + ' ' + student.lastName : 'Unknown';
      var roll = student ? student.rollNumber : '—';
      var statusClass = rec.status === 'present' ? 'badge-success' : rec.status === 'absent' ? 'badge-danger' : 'badge-warning';
      var statusText = rec.status.charAt(0).toUpperCase() + rec.status.slice(1);

      html += '<tr><td>' + name + '</td><td>' + roll + '</td><td><span class="badge ' + statusClass + '">' + statusText + '</span></td></tr>';
    });

    html += '</tbody></table></div>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Close</button>';
    footerHTML += '<button class="btn btn-primary" onclick="SchoolApp.utils.exportToExcel(' + JSON.stringify(record.records.map(function(rec) {
      var student = SchoolApp.store.students.find(function(s) { return s.id === rec.studentId; });
      return { Name: student ? student.firstName + ' ' + student.lastName : 'Unknown', Roll: student ? student.rollNumber : '', Status: rec.status };
    })) + ', [{header:\'Name\',key:\'Name\'},{header:\'Roll No\',key:\'Roll\'},{header:\'Status\',key:\'Status\'}], \'attendance_' + record.date + '_' + record.class + record.section + '.xlsx\')"><span class="material-icons-round">download</span> Export</button>';

    SchoolApp.showModal('Attendance Details - ' + SchoolApp.formatDate(record.date), html, footerHTML);
  }

  // Register Module
  SchoolApp.registerModule('attendance', {
    init: function() {},
    render: render
  });

})();
