'use strict';

/* ============================================================
   Shishu Vikash Mandir - Timetable Management Module
   ============================================================ */

(function() {

  var state = {
    classVal: '',
    sectionVal: '',
    dayVal: 'Monday',
    draftTimetable: null,
    viewMode: 'teacher' // Default view mode is now 'teacher'
  };

  function initGlobalDraft() {
    if (!state.draftTimetable) {
      state.draftTimetable = {};
      var savedTimetable = SchoolApp.store.timetable || {};
      for (var key in savedTimetable) {
        if (key !== 'settings') {
          state.draftTimetable[key] = JSON.parse(JSON.stringify(savedTimetable[key]));
        }
      }
    }
  }

  function getSubjectsForClass(classVal) {
    var subjects = (SchoolApp.store.subjectMapping || {})[classVal] || [];
    if (subjects.length > 0) {
      return subjects.map(function(s) { return s.name; });
    }
    for (var key in (SchoolApp.store.subjectMapping || {})) {
      var suffix = '_' + classVal;
      if (key.slice(-suffix.length) === suffix) {
        var termSubs = SchoolApp.store.subjectMapping[key] || [];
        if (termSubs.length > 0) {
          return termSubs.map(function(s) { return s.name; });
        }
      }
    }
    return ['Mathematics', 'Science', 'English', 'Social Studies', 'Hindi', 'Computer Science', 'Physical Education', 'Art'];
  }

  function getTeachersForSubject(classVal, sectionVal, subjectName) {
    if (!subjectName) return [];
    var teachers = SchoolApp.store.teachers || [];
    
    // 1. Direct class-section-subject match
    var matched = teachers.filter(function(t) {
      var st = t.subjectTeacherOf || [];
      return st.some(function(item) {
        return String(item.class).toLowerCase().trim() === String(classVal).toLowerCase().trim() &&
               String(item.section).toLowerCase().trim() === String(sectionVal).toLowerCase().trim() &&
               String(item.subject).toLowerCase().trim() === String(subjectName).toLowerCase().trim();
      });
    });

    if (matched.length > 0) return matched;

    // 2. Global subject match (teacher teaches this subject globally)
    var globalMatched = teachers.filter(function(t) {
      if (!t.subject) return false;
      var subs = t.subject.split(',').map(function(s) { return s.trim().toLowerCase(); });
      return subs.indexOf(subjectName.toLowerCase()) !== -1;
    });

    if (globalMatched.length > 0) return globalMatched;

    // 3. Fallback to all active teachers
    return teachers.filter(function(t) { return t.status === 'Active'; });
  }

  function getTeacherConflict(teacherId, day, period, currentClassSection) {
    if (!teacherId) return null;
    initGlobalDraft();
    var timetable = state.draftTimetable;
    for (var classSection in timetable) {
      if (classSection === 'settings') continue;
      if (classSection.toLowerCase().trim() === currentClassSection.toLowerCase().trim()) continue;

      var daySchedule = timetable[classSection][day];
      if (daySchedule && daySchedule[period]) {
        if (daySchedule[period].teacherId === teacherId) {
          return classSection;
        }
      }
    }
    return null;
  }

  function render() {
    var container = document.getElementById('page-timetable');
    if (!container) return;

    var classes = SchoolApp.store.settings.classes || [];
    var sections = SchoolApp.store.settings.sections || [];
    var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    if (!state.classVal && classes.length > 0) state.classVal = classes[0];
    if (!state.sectionVal && sections.length > 0) state.sectionVal = sections[0];

    var currentClassSection = state.classVal + '-' + state.sectionVal;
    
    // Reactive draft initialization
    initGlobalDraft();

    var html = '';

    // Page Header
    html += '<div class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">';
    html += '  <h2><span class="material-icons-round">schedule</span> Timetable Management</h2>';
    html += '  <div class="toggle-group" style="display: flex; gap: 2px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-light); border-radius: var(--radius-md); padding: 2px;">';
    
    var classActiveStyle = state.viewMode === 'class' ? 'background: var(--accent-primary); color: white;' : 'background: transparent; color: var(--text-secondary);';
    var teacherActiveStyle = state.viewMode === 'teacher' ? 'background: var(--accent-primary); color: white;' : 'background: transparent; color: var(--text-secondary);';
    
    html += '    <button class="btn btn-xs" id="toggle-view-class" style="border: none; padding: 6px 12px; border-radius: 4px; font-weight: 600; font-size: 12px; transition: all var(--transition-fast); ' + classActiveStyle + '"><span class="material-icons-round" style="font-size:14px; margin-right:4px; vertical-align:middle;">class</span>Class View</button>';
    html += '    <button class="btn btn-xs" id="toggle-view-teacher" style="border: none; padding: 6px 12px; border-radius: 4px; font-weight: 600; font-size: 12px; transition: all var(--transition-fast); ' + teacherActiveStyle + '"><span class="material-icons-round" style="font-size:14px; margin-right:4px; vertical-align:middle;">person</span>Teacher View</button>';
    html += '  </div>';
    html += '</div>';

    // Toolbar / Filters Row (Action buttons permanently visible here)
    html += '<div class="toolbar" style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); border-radius: var(--radius-lg); padding: 16px 20px;">';
    
    if (state.viewMode === 'class') {
      html += '  <div class="filter-group" style="display: flex; gap: 16px; flex: 1; min-width: 280px; align-items: flex-end; flex-wrap: wrap;">';
      html += '    <div style="flex: 1; min-width: 140px;">';
      html += '      <label class="form-label" style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; display: block;">Select Class</label>';
      html += '      <select class="form-select" id="timetable-class-select" style="width: 100%;">';
      classes.forEach(function(c) { html += '<option value="' + c + '"' + (state.classVal === c ? ' selected' : '') + '>Class ' + c + '</option>'; });
      html += '      </select>';
      html += '    </div>';
      html += '    <div style="flex: 1; min-width: 100px;">';
      html += '      <label class="form-label" style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; display: block;">Select Section</label>';
      html += '      <select class="form-select" id="timetable-section-select" style="width: 100%;">';
      sections.forEach(function(s) { html += '<option value="' + s + '"' + (state.sectionVal === s ? ' selected' : '') + '>Section ' + s + '</option>'; });
      html += '      </select>';
      html += '    </div>';
      html += '    <div style="flex: 2; min-width: 160px;">';
      html += '      <label class="form-label" style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; display: block;">Select Day</label>';
      html += '      <select class="form-select" id="timetable-day-select" style="width: 100%;">';
      days.forEach(function(d) { html += '<option value="' + d + '"' + (state.dayVal === d ? ' selected' : '') + '>' + d + '</option>'; });
      html += '      </select>';
      html += '    </div>';
      html += '  </div>';
    } else {
      html += '  <div class="filter-group" style="display: flex; gap: 16px; flex: 1; min-width: 200px; align-items: flex-end;">';
      html += '    <div style="flex: 1; min-width: 200px;">';
      html += '      <label class="form-label" style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; display: block;">Select Day</label>';
      html += '      <select class="form-select" id="timetable-day-select" style="width: 100%;">';
      days.forEach(function(d) { html += '<option value="' + d + '"' + (state.dayVal === d ? ' selected' : '') + '>' + d + '</option>'; });
      html += '      </select>';
      html += '    </div>';
      html += '  </div>';
    }

    // Action buttons group (permanently visible)
    html += '  <div class="action-buttons-group" style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;">';
    html += '    <button class="btn btn-secondary btn-sm" id="timetable-settings-btn" style="background: rgba(6, 182, 212, 0.15); color: #06b6d4; border: 1px solid rgba(6, 182, 212, 0.3); display: inline-flex; align-items: center; gap: 6px;"><span class="material-icons-round" style="font-size: 16px;">settings</span> Timing Settings</button>';
    html += '    <button class="btn btn-secondary btn-sm" id="auto-generate-btn" style="background: rgba(108, 92, 231, 0.15); color: #a29bfe; border: 1px solid rgba(108, 92, 231, 0.3); display: inline-flex; align-items: center; gap: 6px;"><span class="material-icons-round" style="font-size: 16px;">bolt</span> Auto-Generate Draft</button>';
    html += '    <button class="btn btn-primary btn-sm" id="save-timetable-btn" style="display: inline-flex; align-items: center; gap: 6px;"><span class="material-icons-round" style="font-size: 16px;">save</span> Save Timetable</button>';
    html += '  </div>';
    html += '</div>';

    if (state.viewMode === 'class') {
      // Main Period Grid Card list
      html += '<div class="card" style="margin-top: 20px;">';
      html += '  <div class="card-header" style="border-bottom: 1px solid var(--border-light); padding: 16px 20px;">';
      html += '    <h3 style="margin: 0; font-size: 16px;">Schedule for Class ' + currentClassSection + ' (' + state.dayVal + ')</h3>';
      html += '  </div>';
      html += '  <div class="card-body" style="padding: 20px;">';
      html += '    <div class="timetable-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">';

      var periodsCount = (state.dayVal === 'Saturday') ? 6 : 8;
      var classSubjects = getSubjectsForClass(state.classVal);

      var classTimetable = state.draftTimetable[currentClassSection] || {};
      var dayData = classTimetable[state.dayVal] || {};
      var savedClassData = (SchoolApp.store.timetable || {})[currentClassSection] || {};
      var savedDayData = savedClassData[state.dayVal] || {};

      for (var p = 1; p <= periodsCount; p++) {
        var savedSlot = savedDayData[p] || {};
        var draftSlot = dayData[p] || {};
        
        var savedSubject = draftSlot.subject || '';
        var savedTeacherId = draftSlot.teacherId || '';

        // Check if slot differs from the database (draft indicator)
        var isDraft = false;
        var hasDraftSlot = !!(draftSlot.subject || draftSlot.teacherId);
        var hasSavedSlot = !!(savedSlot.subject || savedSlot.teacherId);
        if (hasDraftSlot !== hasSavedSlot || 
            (hasDraftSlot && (draftSlot.subject !== savedSlot.subject || draftSlot.teacherId !== savedSlot.teacherId))) {
          isDraft = true;
        }

        var cardStyle = 'background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.2s;';
        if (isDraft) {
          cardStyle = 'background: rgba(251, 191, 36, 0.05); border: 1px dashed #fbbf24; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.2s;';
        }

        html += '      <div class="period-card" data-period="' + p + '" style="' + cardStyle + '">';
        html += '        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 8px;">';
        html += '          <strong style="color: var(--accent-primary); font-size: 14px;">Period ' + p + '</strong>';
        html += '          <span class="badge badge-info" style="font-size: 10px;">' + SchoolApp.getPeriodTimeStr(p, state.dayVal) + '</span>';
        html += '        </div>';

        // Subject Dropdown
        html += '        <div>';
        html += '          <label class="form-label" style="font-size: 11px;">Subject</label>';
        html += '          <select class="form-select period-subject" data-period="' + p + '" style="width: 100%;"><option value="">Free Period</option>';
        classSubjects.forEach(function(sub) {
          html += '<option value="' + sub + '"' + (savedSubject === sub ? ' selected' : '') + '>' + sub + '</option>';
        });
        html += '          </select>';
        html += '        </div>';

        // Teacher Dropdown
        html += '        <div>';
        html += '          <label class="form-label" style="font-size: 11px;">Teacher</label>';
        html += '          <select class="form-select period-teacher" data-period="' + p + '"' + (savedSubject ? '' : ' disabled') + ' style="width: 100%;"><option value="">Select Teacher</option>';
        
        if (savedSubject) {
          var eligibleTeachers = getTeachersForSubject(state.classVal, state.sectionVal, savedSubject);
          eligibleTeachers.forEach(function(teacher) {
            var conflict = getTeacherConflict(teacher.id, state.dayVal, p, currentClassSection);
            var label = teacher.firstName + ' ' + teacher.lastName;
            var disabledAttr = '';
            if (conflict) {
              label += ' [Busy in ' + conflict + ']';
              if (teacher.id !== savedTeacherId) {
                disabledAttr = ' disabled';
              }
            }
            html += '<option value="' + teacher.id + '"' + (savedTeacherId === teacher.id ? ' selected' : '') + disabledAttr + '>' + label + '</option>';
          });
        }

        html += '          </select>';
        html += '        </div>';
        html += '      </div>';
      }

      html += '    </div>';
      html += '  </div>';
      html += '</div>';
    } else {
      // Teacher View Matrix Table (Interactive)
      var activeTeachers = (SchoolApp.store.teachers || []).filter(function(t) { return t.status === 'Active'; });
      var periodsCount = (state.dayVal === 'Saturday') ? 6 : 8;

      html += '<div class="card" style="margin-top: 20px;">';
      html += '  <div class="card-header" style="border-bottom: 1px solid var(--border-light); padding: 16px 20px;">';
      html += '    <h3 style="margin: 0; font-size: 16px;">Teacher Schedule Matrix (' + state.dayVal + ')</h3>';
      html += '  </div>';
      html += '  <div class="card-body" style="padding: 20px;">';
      html += '    <div class="table-container" style="overflow-x: auto; -webkit-overflow-scrolling: touch; width: 100%;">';
      html += '      <table class="table" style="width: 100%; border-collapse: collapse; min-width: 1000px;">';
      html += '        <thead>';
      html += '          <tr style="border-bottom: 2px solid var(--border-light);">';
      html += '            <th style="padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); font-weight: 700; text-align: left; width: 150px; color: var(--text-primary);">Period / Time</th>';
      
      activeTeachers.forEach(function(t) {
        html += '            <th style="padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); font-weight: 700; text-align: center; color: var(--text-primary);">' + t.firstName + ' ' + t.lastName + '<br><span style="font-size: 9px; font-weight: 400; color: var(--text-muted);">' + t.subject + '</span></th>';
      });
      html += '          </tr>';
      html += '        </thead>';
      html += '        <tbody>';

      for (var p = 1; p <= periodsCount; p++) {
        var timeStr = SchoolApp.getPeriodTimeStr(p, state.dayVal);
        html += '          <tr style="border-bottom: 1px solid var(--border-light);">';
        html += '            <td style="padding: 12px 16px; border: 1px solid var(--border-light); font-weight: 600;"><strong style="color: var(--accent-primary);">Period ' + p + '</strong><br><span style="font-size: 10px; color: var(--text-muted);">' + timeStr + '</span></td>';
        
        activeTeachers.forEach(function(t) {
          var draftAssignment = null;
          var draftTimetable = state.draftTimetable || {};
          for (var classSection in draftTimetable) {
            if (classSection === 'settings') continue;
            var daySchedule = draftTimetable[classSection][state.dayVal];
            if (daySchedule && daySchedule[p]) {
              if (daySchedule[p].teacherId === t.id) {
                draftAssignment = {
                  classSection: classSection,
                  subject: daySchedule[p].subject
                };
                break;
              }
            }
          }

          var savedAssignment = null;
          var savedTimetable = SchoolApp.store.timetable || {};
          for (var classSection in savedTimetable) {
            if (classSection === 'settings') continue;
            var daySchedule = savedTimetable[classSection][state.dayVal];
            if (daySchedule && daySchedule[p]) {
              if (daySchedule[p].teacherId === t.id) {
                savedAssignment = {
                  classSection: classSection,
                  subject: daySchedule[p].subject
                };
                break;
              }
            }
          }

          var isCellDraft = false;
          var hasDraft = !!draftAssignment;
          var hasSaved = !!savedAssignment;
          if (hasDraft !== hasSaved || 
              (hasDraft && (draftAssignment.classSection !== savedAssignment.classSection || draftAssignment.subject !== savedAssignment.subject))) {
            isCellDraft = true;
          }

          if (draftAssignment) {
            var borderStyle = isCellDraft ? 'border: 2px dashed #fbbf24; background: rgba(251, 191, 36, 0.05);' : 'border: 1px solid var(--border-light); background: rgba(124, 58, 237, 0.03);';
            html += '            <td style="padding: 12px 16px; ' + borderStyle + ' text-align: center; vertical-align: middle; position: relative;">';
            html += '              <strong style="color: var(--accent-primary-light); font-size: 13px;">Class ' + draftAssignment.classSection + '</strong><br>';
            html += '              <span class="badge badge-purple" style="font-size: 10px; margin-top: 4px;">' + draftAssignment.subject + '</span>';
            html += '              <button class="clear-cell-btn btn-xs" data-class="' + draftAssignment.classSection + '" data-period="' + p + '" data-day="' + state.dayVal + '" style="position: absolute; top: 2px; right: 2px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; border-radius: 4px; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: all 0.2s;" title="Unassign"><span class="material-icons-round" style="font-size: 12px;">close</span></button>';
            html += '            </td>';
          } else {
            html += '            <td style="padding: 12px 16px; border: 1px solid var(--border-light); text-align: center; vertical-align: middle;">';
            html += '              <button class="btn btn-xs assign-cell-btn" data-teacher="' + t.id + '" data-period="' + p + '" data-day="' + state.dayVal + '" style="background: rgba(16, 185, 129, 0.1); color: var(--success); border: 1px dashed rgba(16, 185, 129, 0.4); padding: 6px 12px; border-radius: 6px; font-weight: 500; cursor: pointer; transition: all var(--transition-fast); width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">';
            html += '                <span class="material-icons-round" style="font-size: 14px;">add</span> Assign';
            html += '              </button>';
            html += '            </td>';
          }
        });
        html += '          </tr>';
      }

      html += '        </tbody>';
      html += '      </table>';
      html += '    </div>';
      html += '  </div>';
      html += '</div>';
    }

    container.innerHTML = html;
    
    // Day Select needs correct dropdown selection
    var daySelect = document.getElementById('timetable-day-select');
    if (daySelect) {
      daySelect.value = state.dayVal;
    }
    
    attachEvents();
  }

  function attachEvents() {
    var classSelect = document.getElementById('timetable-class-select');
    var sectionSelect = document.getElementById('timetable-section-select');
    var daySelect = document.getElementById('timetable-day-select');

    if (classSelect) classSelect.addEventListener('change', function() { state.classVal = this.value; render(); });
    if (sectionSelect) sectionSelect.addEventListener('change', function() { state.sectionVal = this.value; render(); });
    if (daySelect) daySelect.addEventListener('change', function() { state.dayVal = this.value; render(); });

    var settingsBtn = document.getElementById('timetable-settings-btn');
    if (settingsBtn) settingsBtn.addEventListener('click', showSettingsModal);

    var saveBtn = document.getElementById('save-timetable-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveTimetable);

    var autoGenBtn = document.getElementById('auto-generate-btn');
    if (autoGenBtn) autoGenBtn.addEventListener('click', generateAutoTimetable);

    var classToggle = document.getElementById('toggle-view-class');
    var teacherToggle = document.getElementById('toggle-view-teacher');

    if (classToggle) {
      classToggle.addEventListener('click', function() {
        state.viewMode = 'class';
        render();
      });
    }

    if (teacherToggle) {
      teacherToggle.addEventListener('click', function() {
        state.viewMode = 'teacher';
        render();
      });
    }

    // Teacher cell click assignment listeners
    document.querySelectorAll('.assign-cell-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var teacherId = this.getAttribute('data-teacher');
        var period = parseInt(this.getAttribute('data-period'));
        var day = this.getAttribute('data-day');
        showTeacherAssignModal(teacherId, period, day);
      });
    });

    // Clear assignment cell listeners
    document.querySelectorAll('.clear-cell-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var classSection = this.getAttribute('data-class');
        var period = parseInt(this.getAttribute('data-period'));
        var day = this.getAttribute('data-day');

        if (state.draftTimetable && state.draftTimetable[classSection] && state.draftTimetable[classSection][day]) {
          delete state.draftTimetable[classSection][day][period];
          SchoolApp.showToast('Assignment removed from draft.', 'info');
          render();
        }
      });
    });

    // Subject dropdown change listeners
    document.querySelectorAll('.period-subject').forEach(function(select) {
      select.addEventListener('change', function() {
        var period = this.getAttribute('data-period');
        var subVal = this.value;
        var currentClassSection = state.classVal + '-' + state.sectionVal;

        if (!state.draftTimetable[currentClassSection]) {
          state.draftTimetable[currentClassSection] = {};
        }
        if (!state.draftTimetable[currentClassSection][state.dayVal]) {
          state.draftTimetable[currentClassSection][state.dayVal] = {};
        }

        if (!subVal) {
          delete state.draftTimetable[currentClassSection][state.dayVal][period];
        } else {
          state.draftTimetable[currentClassSection][state.dayVal][period] = { subject: subVal, teacherId: '' };
        }
        render();
      });
    });

    // Teacher dropdown change listeners
    document.querySelectorAll('.period-teacher').forEach(function(select) {
      select.addEventListener('change', function() {
        var period = this.getAttribute('data-period');
        var teachVal = this.value;
        var currentClassSection = state.classVal + '-' + state.sectionVal;

        if (!state.draftTimetable[currentClassSection]) {
          state.draftTimetable[currentClassSection] = {};
        }
        if (!state.draftTimetable[currentClassSection][state.dayVal]) {
          state.draftTimetable[currentClassSection][state.dayVal] = {};
        }
        if (!state.draftTimetable[currentClassSection][state.dayVal][period]) {
          state.draftTimetable[currentClassSection][state.dayVal][period] = { subject: '', teacherId: '' };
        }
        state.draftTimetable[currentClassSection][state.dayVal][period].teacherId = teachVal;
        render();
      });
    });
  }

  function showSettingsModal() {
    var s = (SchoolApp.store && SchoolApp.store.timetable && SchoolApp.store.timetable.settings) || {
      startTime: "08:00",
      periodDuration: 40,
      lunchAfterPeriod: 4,
      lunchDuration: 30,
      satStartTime: "08:00",
      satPeriodDuration: 35,
      satLunchAfterPeriod: 0
    };
    var satLunchDur = s.satLunchDuration !== undefined ? s.satLunchDuration : (s.lunchDuration || 30);

    var bodyHTML = '<form id="timetable-settings-form" style="display: flex; flex-direction: column; gap: 20px; max-height: 70vh; overflow-y: auto; padding: 4px;">';
    
    bodyHTML += '  <div style="border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px;">';
    bodyHTML += '    <h4 style="margin: 0; color: var(--accent-primary-light); font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Weekday Timings</h4>';
    bodyHTML += '  </div>';
    bodyHTML += '  <div class="form-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size: 11px;">Start Time *</label>';
    bodyHTML += '      <input type="time" class="form-input" name="startTime" value="' + (s.startTime || '08:00') + '" required>';
    bodyHTML += '    </div>';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size: 11px;">Period Duration (mins) *</label>';
    bodyHTML += '      <input type="number" class="form-input" name="periodDuration" min="1" value="' + (s.periodDuration || 40) + '" required>';
    bodyHTML += '    </div>';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size: 11px;">Lunch After Period *</label>';
    bodyHTML += '      <input type="number" class="form-input" name="lunchAfterPeriod" min="0" value="' + (s.lunchAfterPeriod !== undefined ? s.lunchAfterPeriod : 4) + '" required>';
    bodyHTML += '    </div>';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size: 11px;">Lunch Duration (mins) *</label>';
    bodyHTML += '      <input type="number" class="form-input" name="lunchDuration" min="0" value="' + (s.lunchDuration !== undefined ? s.lunchDuration : 30) + '" required>';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';

    bodyHTML += '  <div style="border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; margin-top: 10px;">';
    bodyHTML += '    <h4 style="margin: 0; color: #a29bfe; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Saturday Timings</h4>';
    bodyHTML += '  </div>';
    bodyHTML += '  <div class="form-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size: 11px;">Start Time *</label>';
    bodyHTML += '      <input type="time" class="form-input" name="satStartTime" value="' + (s.satStartTime || '08:00') + '" required>';
    bodyHTML += '    </div>';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size: 11px;">Period Duration (mins) *</label>';
    bodyHTML += '      <input type="number" class="form-input" name="satPeriodDuration" min="1" value="' + (s.satPeriodDuration || 35) + '" required>';
    bodyHTML += '    </div>';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size: 11px;">Lunch After Period *</label>';
    bodyHTML += '      <input type="number" class="form-input" name="satLunchAfterPeriod" min="0" value="' + (s.satLunchAfterPeriod !== undefined ? s.satLunchAfterPeriod : 0) + '" required>';
    bodyHTML += '    </div>';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size: 11px;">Lunch Duration (mins) *</label>';
    bodyHTML += '      <input type="number" class="form-input" name="satLunchDuration" min="0" value="' + satLunchDur + '" required>';
    bodyHTML += '    </div>';
    bodyHTML += '  </div>';
    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="timetable-settings-save-btn"><span class="material-icons-round">save</span> Save Settings</button>';

    SchoolApp.showModal('Timetable Timing Settings', bodyHTML, footerHTML);

    document.getElementById('timetable-settings-save-btn').addEventListener('click', function() {
      var form = document.getElementById('timetable-settings-form');
      if (!form) return;

      var inputs = form.querySelectorAll('input');
      var valid = true;
      var fields = {};
      inputs.forEach(function(input) {
        var val = input.value.trim();
        fields[input.name] = val;
        if (input.required && val === '') {
          input.closest('.form-group').classList.add('error');
          valid = false;
        } else {
          input.closest('.form-group').classList.remove('error');
        }
      });

      if (!valid) {
        SchoolApp.showToast('Please fill all required fields correctly.', 'error');
        return;
      }

      if (!SchoolApp.store.timetable) {
        SchoolApp.store.timetable = {};
      }
      
      SchoolApp.store.timetable.settings = {
        startTime: fields.startTime,
        periodDuration: parseInt(fields.periodDuration) || 40,
        lunchAfterPeriod: parseInt(fields.lunchAfterPeriod) || 0,
        lunchDuration: parseInt(fields.lunchDuration) || 0,
        satStartTime: fields.satStartTime,
        satPeriodDuration: parseInt(fields.satPeriodDuration) || 35,
        satLunchAfterPeriod: parseInt(fields.satLunchAfterPeriod) || 0,
        satLunchDuration: parseInt(fields.satLunchDuration) || 0
      };

      SchoolApp.save();
      SchoolApp.showToast('Timetable timing settings saved successfully.', 'success');
      SchoolApp.closeModal();
      render();
    });
  }

  function showTeacherAssignModal(teacherId, period, day) {
    var teachers = SchoolApp.store.teachers || [];
    var teacher = teachers.find(function(t) { return t.id === teacherId; });
    if (!teacher) return;

    var teacherName = teacher.firstName + ' ' + teacher.lastName;
    
    // Get all available classes (not occupied in this period on this day)
    var classes = SchoolApp.store.settings.classes || [];
    var sections = SchoolApp.store.settings.sections || [];
    var availableClasses = [];

    classes.forEach(function(c) {
      sections.forEach(function(s) {
        var classSection = c + '-' + s;
        var draftTimetable = state.draftTimetable || {};
        var daySchedule = draftTimetable[classSection] ? draftTimetable[classSection][day] : null;
        var slot = daySchedule ? daySchedule[period] : null;
        
        if (!slot || !slot.subject) {
          availableClasses.push(classSection);
        }
      });
    });

    if (availableClasses.length === 0) {
      SchoolApp.showToast('No classes are available for scheduling during this period.', 'error');
      return;
    }

    // Teacher allowed subjects
    var allowedSubjects = [];
    if (teacher.subject) {
      allowedSubjects = teacher.subject.split(',').map(function(s) { return s.trim(); });
    }
    if (teacher.subjectTeacherOf) {
      teacher.subjectTeacherOf.forEach(function(item) {
        if (item.subject && allowedSubjects.indexOf(item.subject) === -1) {
          allowedSubjects.push(item.subject);
        }
      });
    }

    var bodyHTML = '<form id="teacher-assign-form" style="display: flex; flex-direction: column; gap: 16px; padding: 4px;">';
    
    bodyHTML += '  <div class="form-group">';
    bodyHTML += '    <label class="form-label" style="font-size: 11px;">Select Class *</label>';
    bodyHTML += '    <select class="form-select" id="modal-assign-class" style="width: 100%;" required>';
    bodyHTML += '      <option value="">Select a Class Section</option>';
    availableClasses.forEach(function(cs) {
      bodyHTML += '    <option value="' + cs + '">Class ' + cs + '</option>';
    });
    bodyHTML += '    </select>';
    bodyHTML += '  </div>';

    bodyHTML += '  <div class="form-group">';
    bodyHTML += '    <label class="form-label" style="font-size: 11px;">Select Subject *</label>';
    bodyHTML += '    <select class="form-select" id="modal-assign-subject" style="width: 100%;" required disabled>';
    bodyHTML += '      <option value="">Select Subject</option>';
    bodyHTML += '    </select>';
    bodyHTML += '  </div>';
    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="teacher-assign-save-btn" disabled><span class="material-icons-round">save</span> Save Assignment</button>';

    SchoolApp.showModal('Assign Schedule: ' + teacherName, bodyHTML, footerHTML);

    var classSelect = document.getElementById('modal-assign-class');
    var subjectSelect = document.getElementById('modal-assign-subject');
    var saveBtn = document.getElementById('teacher-assign-save-btn');

    classSelect.addEventListener('change', function() {
      var selectedClassSection = this.value;
      if (!selectedClassSection) {
        subjectSelect.innerHTML = '<option value="">Select Subject</option>';
        subjectSelect.disabled = true;
        saveBtn.disabled = true;
        return;
      }

      var parts = selectedClassSection.split('-');
      var cVal = parts[0];
      var classSubjects = getSubjectsForClass(cVal);

      // Intersection of teacher's allowed subjects and class subjects
      var filteredSubjects = allowedSubjects.filter(function(sub) {
        return classSubjects.some(function(cs) { return cs.toLowerCase().trim() === sub.toLowerCase().trim(); });
      });

      if (filteredSubjects.length === 0) {
        filteredSubjects = classSubjects; // Fallback to all class subjects
      }

      var subHTML = '<option value="">Select Subject</option>';
      filteredSubjects.forEach(function(sub) {
        subHTML += '<option value="' + sub + '">' + sub + '</option>';
      });
      subjectSelect.innerHTML = subHTML;
      subjectSelect.disabled = false;
      saveBtn.disabled = false;
    });

    saveBtn.addEventListener('click', function() {
      var selectedClass = classSelect.value;
      var selectedSubject = subjectSelect.value;

      if (!selectedClass || !selectedSubject) {
        SchoolApp.showToast('Please select both class and subject.', 'error');
        return;
      }

      // Check conflict double insurance
      var conflict = getTeacherConflict(teacherId, day, period, selectedClass);
      if (conflict) {
        SchoolApp.showToast('Conflict: ' + teacherName + ' is already scheduled in Class ' + conflict + ' during this slot.', 'error');
        return;
      }

      // Inject assignment into draftTimetable
      if (!state.draftTimetable) {
        state.draftTimetable = {};
      }
      if (!state.draftTimetable[selectedClass]) {
        state.draftTimetable[selectedClass] = {};
      }
      if (!state.draftTimetable[selectedClass][day]) {
        state.draftTimetable[selectedClass][day] = {};
      }
      state.draftTimetable[selectedClass][day][period] = {
        subject: selectedSubject,
        teacherId: teacherId
      };

      SchoolApp.showToast('Assignment added to draft.', 'success');
      SchoolApp.closeModal();
      render();
    });
  }

  function generateAutoTimetable() {
    var classes = SchoolApp.store.settings.classes || [];
    var sections = SchoolApp.store.settings.sections || [];

    if (classes.length === 0) {
      SchoolApp.showToast('No classes configured. Setup classes in Admin Panel first.', 'error');
      return;
    }

    SchoolApp.showConfirm('This will auto-fill empty slots for all classes across the school for the entire week. Existing saved and draft slots will not be overwritten. Proceed?', function() {
      var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      initGlobalDraft();

      days.forEach(function(day) {
        var periodsCount = (day === 'Saturday') ? 6 : 8;
        
        // Track used subjects per class for this day in the draft
        var classUsedSubjects = {};
        classes.forEach(function(c) {
          sections.forEach(function(s) {
            var classSection = c + '-' + s;
            classUsedSubjects[classSection] = [];
            if (state.draftTimetable[classSection] && state.draftTimetable[classSection][day]) {
              for (var p = 1; p <= periodsCount; p++) {
                var slot = state.draftTimetable[classSection][day][p];
                if (slot && slot.subject) {
                  classUsedSubjects[classSection].push(slot.subject.toLowerCase().trim());
                }
              }
            }
          });
        });

        // Loop through each period and each class section to auto-assign
        for (var p = 1; p <= periodsCount; p++) {
          classes.forEach(function(c) {
            sections.forEach(function(s) {
              var classSection = c + '-' + s;

              if (!state.draftTimetable[classSection]) {
                state.draftTimetable[classSection] = {};
              }
              if (!state.draftTimetable[classSection][day]) {
                state.draftTimetable[classSection][day] = {};
              }

              var existingSlot = state.draftTimetable[classSection][day][p];
              // Skip slot if it already has a subject and teacher assigned
              if (existingSlot && existingSlot.subject && existingSlot.teacherId) {
                return;
              }

              var classSubjects = getSubjectsForClass(c);
              if (classSubjects.length === 0) return;

              // Daily Subject Uniqueness
              var availableSubjects = classSubjects.filter(function(sub) {
                return classUsedSubjects[classSection].indexOf(sub.toLowerCase().trim()) === -1;
              });

              // Shuffle subjects
              var shuffledSubjects = availableSubjects.slice().sort(function() { return 0.5 - Math.random(); });

              var assigned = false;
              for (var i = 0; i < shuffledSubjects.length; i++) {
                var subject = shuffledSubjects[i];
                var eligibleTeachers = getTeachersForSubject(c, s, subject);
                var shuffledTeachers = eligibleTeachers.slice().sort(function() { return 0.5 - Math.random(); });

                for (var j = 0; j < shuffledTeachers.length; j++) {
                  var teacher = shuffledTeachers[j];
                  
                  // Check conflict globally in draft
                  var conflict = getTeacherConflict(teacher.id, day, p, classSection);
                  if (!conflict) {
                    state.draftTimetable[classSection][day][p] = { subject: subject, teacherId: teacher.id };
                    classUsedSubjects[classSection].push(subject.toLowerCase().trim());
                    assigned = true;
                    break;
                  }
                }

                if (assigned) break;
              }

              // Graceful Blanking: If we were not able to assign a subject, delete/leave empty
              if (!assigned) {
                delete state.draftTimetable[classSection][day][p];
              }
            });
          });
        }
      });

      SchoolApp.showToast('School-wide draft generated successfully! Please review and click Save to confirm.', 'success');
      render();
    }, 'Auto-Generate Draft');
  }

  function saveTimetable() {
    var classes = SchoolApp.store.settings.classes || [];
    var sections = SchoolApp.store.settings.sections || [];
    
    // 1. If in Class View, sync current page selections from the DOM into draftTimetable before checking
    if (state.viewMode === 'class') {
      var currentClassSection = state.classVal + '-' + state.sectionVal;
      var periodsCount = (state.dayVal === 'Saturday') ? 6 : 8;

      for (var p = 1; p <= periodsCount; p++) {
        var subSelect = document.querySelector('.period-subject[data-period="' + p + '"]');
        var subVal = subSelect ? subSelect.value : '';
        var teacherSelect = document.querySelector('.period-teacher[data-period="' + p + '"]');
        var teachVal = teacherSelect ? teacherSelect.value : '';

        if (!state.draftTimetable[currentClassSection]) {
          state.draftTimetable[currentClassSection] = {};
        }
        if (!state.draftTimetable[currentClassSection][state.dayVal]) {
          state.draftTimetable[currentClassSection][state.dayVal] = {};
        }

        if (subVal && teachVal) {
          state.draftTimetable[currentClassSection][state.dayVal][p] = { subject: subVal, teacherId: teachVal };
        } else if (!subVal && !teachVal) {
          delete state.draftTimetable[currentClassSection][state.dayVal][p];
        } else {
          // Partially filled slot validation
          SchoolApp.showToast('Please select both Subject and Teacher for Period ' + p + '.', 'error');
          
          var pCard = document.querySelector('.period-card[data-period="' + p + '"]');
          if (pCard) {
            pCard.style.borderColor = 'var(--danger)';
            pCard.style.borderStyle = 'solid';
            setTimeout(function() {
              pCard.style.borderColor = 'var(--border-light)';
            }, 3000);
          }
          return;
        }
      }
    }

    initGlobalDraft();

    // 2. Validate the ENTIRE week's draft for completeness and overlap conflicts across the whole school
    for (var classSection in state.draftTimetable) {
      if (classSection === 'settings') continue;

      var classTimetable = state.draftTimetable[classSection];
      for (var day in classTimetable) {
        var daySchedule = classTimetable[day];
        for (var p in daySchedule) {
          var slot = daySchedule[p];
          if (slot) {
            // Completeness check
            if ((slot.subject && !slot.teacherId) || (!slot.subject && slot.teacherId)) {
              SchoolApp.showToast('Please select both Subject and Teacher for Class ' + classSection + ', Period ' + p + ' on ' + day + '.', 'error');
              return;
            }

            // Conflict overlap check across all other classes in draft
            if (slot.teacherId) {
              for (var otherClass in state.draftTimetable) {
                if (otherClass === classSection || otherClass === 'settings') continue;
                var otherSlot = state.draftTimetable[otherClass][day] ? state.draftTimetable[otherClass][day][p] : null;
                if (otherSlot && otherSlot.teacherId === slot.teacherId) {
                  var teachers = SchoolApp.store.teachers || [];
                  var tObj = teachers.find(function(t) { return t.id === slot.teacherId; });
                  var tName = tObj ? (tObj.firstName + ' ' + tObj.lastName) : 'Teacher';
                  SchoolApp.showToast('Conflict detected: ' + tName + ' is scheduled in both Class ' + classSection + ' and Class ' + otherClass + ' on ' + day + ' during Period ' + p + '.', 'error');
                  return;
                }
              }
            }
          }
        }
      }
    }

    // 3. Commit weekly draft to database
    if (!SchoolApp.store.timetable) {
      SchoolApp.store.timetable = {};
    }

    // Copy all class schedules from draftTimetable to SchoolApp.store.timetable
    for (var classSection in state.draftTimetable) {
      if (classSection !== 'settings') {
        SchoolApp.store.timetable[classSection] = JSON.parse(JSON.stringify(state.draftTimetable[classSection]));
      }
    }

    // Clean up any deleted classes or classes that might have been completely emptied
    for (var classSection in SchoolApp.store.timetable) {
      if (classSection !== 'settings' && !state.draftTimetable[classSection]) {
        delete SchoolApp.store.timetable[classSection];
      }
    }
    
    SchoolApp.save();
    state.draftTimetable = null; // Clear draft state
    SchoolApp.showToast('Timetable saved successfully for all classes.', 'success');
    render();
  }

  // Register Module
  SchoolApp.registerModule('timetable', {
    init: function() {},
    render: render
  });

})();
