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
    if (SchoolApp.store && SchoolApp.store.settings && Array.isArray(SchoolApp.store.settings.subjects) && SchoolApp.store.settings.subjects.length > 0) {
      return SchoolApp.store.settings.subjects;
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

    function hasAssignedSlots(teacherId, timetable) {
    if (!timetable) return false;
    for (var classSection in timetable) {
      if (classSection === 'settings') continue;
      var daySchedule = timetable[classSection];
      if (!daySchedule) continue;
      for (var day in daySchedule) {
        var periodSchedule = daySchedule[day];
        if (!periodSchedule) continue;
        for (var period in periodSchedule) {
          if (periodSchedule[period] && periodSchedule[period].teacherId === teacherId) {
            return true;
          }
        }
      }
    }
    return false;
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

  function findInactiveTeacherSlots() {
    initGlobalDraft();
    var timetable = state.draftTimetable || {};
    var allTeachers = SchoolApp.store.teachers || [];
    var inactiveTeacherMap = {};
    allTeachers.forEach(function(t) {
      if (t.status !== 'Active') {
        inactiveTeacherMap[t.id] = t.firstName + ' ' + t.lastName;
      }
    });

    var inactiveSlots = [];
    for (var classSection in timetable) {
      if (classSection === 'settings') continue;
      var daySchedule = timetable[classSection];
      for (var day in daySchedule) {
        var periodSchedule = daySchedule[day];
        for (var period in periodSchedule) {
          var slot = periodSchedule[period];
          if (slot && slot.teacherId && inactiveTeacherMap[slot.teacherId]) {
            inactiveSlots.push({
              classSection: classSection,
              day: day,
              period: period,
              subject: slot.subject || 'Unassigned Subject',
              teacherName: inactiveTeacherMap[slot.teacherId],
              teacherId: slot.teacherId
            });
          }
        }
      }
    }

    if (inactiveSlots.length === 0) {
      SchoolApp.showToast("No timetable slots with inactive teachers found!", "success");
      return;
    }

    var html = '';
    html += '<div class="modal-backdrop" id="inactive-slots-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10000;">';
    html += '  <div class="modal-content" style="background: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: 12px; width: 90%; max-width: 650px; max-height: 80vh; display: flex; flex-direction: column; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">';
    html += '    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--border-light); padding-bottom: 12px;">';
    html += '      <h3 style="margin: 0; font-size: 18px; color: #f59e0b; display: flex; align-items: center; gap: 8px;"><span class="material-icons-round">warning</span> Slots with Inactive Teachers (' + inactiveSlots.length + ')</h3>';
    html += '      <button class="btn btn-xs btn-secondary" id="close-inactive-modal-x" style="background: transparent; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer;">&times;</button>';
    html += '    </div>';
    html += '    <div style="overflow-y: auto; flex: 1; margin-bottom: 16px;">';
    html += '      <table class="table" style="width: 100%; border-collapse: collapse;">';
    html += '        <thead>';
    html += '          <tr style="border-bottom: 2px solid var(--border-light); text-align: left;">';
    html += '            <th style="padding: 8px;">Class & Section</th>';
    html += '            <th style="padding: 8px;">Day & Period</th>';
    html += '            <th style="padding: 8px;">Subject</th>';
    html += '            <th style="padding: 8px;">Inactive Teacher</th>';
    html += '            <th style="padding: 8px; text-align: center;">Action</th>';
    html += '          </tr>';
    html += '        </thead>';
    html += '        <tbody>';

    inactiveSlots.forEach(function(s) {
      html += '          <tr style="border-bottom: 1px solid var(--border-light);">';
      html += '            <td style="padding: 10px 8px;"><strong>Class ' + s.classSection + '</strong></td>';
      html += '            <td style="padding: 10px 8px;">' + s.day + ' (Period ' + s.period + ')</td>';
      html += '            <td style="padding: 10px 8px;"><span class="badge badge-purple">' + s.subject + '</span></td>';
      html += '            <td style="padding: 10px 8px;"><span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);">' + s.teacherName + ' (Inactive)</span></td>';
      
      var parts = s.classSection.split('-');
      var cls = parts[0];
      var sec = parts[1] || '';
      
      html += '            <td style="padding: 10px 8px; text-align: center;">';
      html += '              <button class="btn btn-xs btn-primary nav-to-slot-btn" data-class="' + cls + '" data-section="' + sec + '" data-day="' + s.day + '" style="font-size: 11px;">Go to Class</button>';
      html += '            </td>';
      html += '          </tr>';
    });

    html += '        </tbody>';
    html += '      </table>';
    html += '    </div>';
    html += '    <div style="display: flex; justify-content: flex-end;">';
    html += '      <button class="btn btn-secondary btn-sm" id="close-inactive-modal-btn">Close</button>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    var existing = document.getElementById('inactive-slots-modal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', html);

    var closeModal = function() {
      var m = document.getElementById('inactive-slots-modal');
      if (m) m.remove();
    };

    document.getElementById('close-inactive-modal-btn').addEventListener('click', closeModal);
    document.getElementById('close-inactive-modal-x').addEventListener('click', closeModal);

    document.querySelectorAll('.nav-to-slot-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.viewMode = 'class';
        state.classVal = this.getAttribute('data-class');
        state.sectionVal = this.getAttribute('data-section');
        state.dayVal = this.getAttribute('data-day');
        closeModal();
        render();
      });
    });
  }

  function showAutoGenModal() {
    var settings = SchoolApp.store.settings || {};
    var classes = settings.classes || (settings.schoolInfo && settings.schoolInfo.classes) || [];
    if (classes.length === 0) {
      SchoolApp.showToast('No classes configured. Setup classes in Admin Panel first.', 'error');
      return;
    }

    var html = '';
    html += '<div class="modal-backdrop" id="auto-gen-modal-backdrop" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10000;">';
    html += '  <div class="modal-content auto-fill-modal" style="background: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: 12px; width: 90%; max-width: 520px; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">';
    html += '    <h3 style="margin-top: 0; margin-bottom: 16px; font-size: 18px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">';
    html += '      <span class="material-icons-round" style="color: var(--accent-primary);">auto_awesome</span> Auto-Generate Timetable';
    html += '    </h3>';
    html += '    <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.5;">';
    html += '      Choose how to proceed with auto-generating the timetable schedule across all classes:';
    html += '    </p>';
    html += '    <div class="auto-fill-scope-box" style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); padding: 16px; border-radius: 8px;">';
    html += '      <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 14px; color: var(--text-primary);">';
    html += '        <input type="radio" name="autoGenScope" value="fill-empty" checked style="margin-top: 3px;">';
    html += '        <div>';
    html += '          <strong>Fill only empty slots</strong>';
    html += '          <div class="auto-fill-subtext" style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Keeps your existing manual assignments and only fills unassigned periods across all classes.</div>';
    html += '        </div>';
    html += '      </label>';
    html += '      <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 14px; color: var(--text-primary);">';
    html += '        <input type="radio" name="autoGenScope" value="reset-all" style="margin-top: 3px;">';
    html += '        <div>';
    html += '          <strong style="color: #ef4444;">Reset everything and regenerate from scratch</strong>';
    html += '          <div class="auto-fill-subtext" style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Clears all existing manual and saved slots across all classes before populating a fresh clean timetable.</div>';
    html += '        </div>';
    html += '      </label>';
    html += '    </div>';
    html += '    <div style="display: flex; justify-content: flex-end; gap: 10px;">';
    html += '      <button class="btn btn-secondary btn-sm" id="auto-gen-cancel-btn">Cancel</button>';
    html += '      <button class="btn btn-primary btn-sm" id="auto-gen-proceed-btn">Proceed</button>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    var existing = document.getElementById('auto-gen-modal-backdrop');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', html);

    var closeModal = function() {
      var m = document.getElementById('auto-gen-modal-backdrop');
      if (m) m.remove();
    };

    document.getElementById('auto-gen-cancel-btn').addEventListener('click', closeModal);

    document.getElementById('auto-gen-proceed-btn').addEventListener('click', function() {
      var selectedRadio = document.querySelector('input[name="autoGenScope"]:checked');
      var option = selectedRadio ? selectedRadio.value : 'fill-empty';
      closeModal();
      
      generateAutoTimetable(option === 'reset-all');
    });
  }

  function render() {
    var container = document.getElementById('page-timetable');
    if (!container) return;

    if (!window.assertSchoolIsolation(SchoolApp.store.timetable, SchoolApp.store.currentSchoolId)) {
      console.error("[SECURITY] Data isolation breach detected in Timetable Tab!");
      SchoolApp.showToast("Security error. Please logout and login again.", "error");
      SchoolApp.logout();
      return;
    }

    var settings = SchoolApp.store.settings || {};
    var classes = settings.classes || (settings.schoolInfo && settings.schoolInfo.classes) || [];
    var rawSections = settings.sections || {};
    var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    if (!state.classVal && classes.length > 0) state.classVal = classes[0];
    
    var sections = [];
    if (Array.isArray(rawSections)) {
      sections = rawSections;
    } else if (typeof rawSections === 'object') {
      sections = rawSections[state.classVal] || [];
    }
    
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
    if (!SchoolApp.isTeacher()) {
      html += '  <div class="action-buttons-group" style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;">';
      html += '    <button class="btn btn-secondary btn-sm" id="timetable-settings-btn" style="background: rgba(6, 182, 212, 0.15); color: #06b6d4; border: 1px solid rgba(6, 182, 212, 0.3); display: inline-flex; align-items: center; gap: 6px;"><span class="material-icons-round" style="font-size: 16px;">settings</span> Timing Settings</button>';
      html += '    <button class="btn btn-secondary btn-sm" id="find-inactive-slots-btn" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); display: inline-flex; align-items: center; gap: 6px;"><span class="material-icons-round" style="font-size: 16px;">search</span> 🔍 Find Inactive Teacher Slots</button>';
      html += '    <button class="btn btn-secondary btn-sm" id="auto-generate-btn" style="background: rgba(108, 92, 231, 0.15); color: #a29bfe; border: 1px solid rgba(108, 92, 231, 0.3); display: inline-flex; align-items: center; gap: 6px;"><span class="material-icons-round" style="font-size: 16px;">auto_awesome</span> 🪄 Auto-Fill Empty Slots</button>';
      html += '    <button class="btn btn-primary btn-sm" id="save-timetable-btn" style="display: inline-flex; align-items: center; gap: 6px;"><span class="material-icons-round" style="font-size: 16px;">save</span> Save Timetable</button>';
      html += '    <button class="btn btn-danger btn-sm" id="btn-reset-timetable" style="display: inline-flex; align-items: center; gap: 6px;"><span class="material-icons-round" style="font-size: 16px;">delete_sweep</span> Reset Timetable</button>';
      html += '  </div>';
    }
    html += '</div>';

    if (state.viewMode === 'class') {
      // Main Period Grid Card list
      html += '<div class="card" style="margin-top: 20px;">';
      html += '  <div class="card-header" style="border-bottom: 1px solid var(--border-light); padding: 16px 20px;">';
      html += '    <h3 style="margin: 0; font-size: 16px;">Schedule for Class ' + currentClassSection + ' (' + state.dayVal + ')</h3>';
      html += '  </div>';
      html += '  <div class="card-body" style="padding: 20px;">';
      html += '    <div class="timetable-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">';

      var settings = (SchoolApp.store && SchoolApp.store.timetable && SchoolApp.store.timetable.settings) || {};
      var periodsCount = (state.dayVal === 'Saturday') ? (settings.satTotalPeriods || 6) : (settings.totalPeriods || 8);
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

        var assignedTeacher = (SchoolApp.store.teachers || []).find(function(t) { return t.id === savedTeacherId; });
        var isInactiveAssigned = !!(assignedTeacher && assignedTeacher.status !== 'Active');

        // Check if slot differs from the database (draft indicator)
        var isDraft = false;
        var hasDraftSlot = !!(draftSlot.subject || draftSlot.teacherId);
        var hasSavedSlot = !!(savedSlot.subject || savedSlot.teacherId);
        if (hasDraftSlot !== hasSavedSlot || 
            (hasDraftSlot && (draftSlot.subject !== savedSlot.subject || draftSlot.teacherId !== savedSlot.teacherId))) {
          isDraft = true;
        }

        var cardStyle = 'background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.2s;';
        if (isInactiveAssigned) {
          cardStyle = 'background: rgba(245, 158, 11, 0.08); border: 1.5px dashed #f59e0b; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.2s;';
        } else if (draftSlot.isWarning) {
          cardStyle = 'background: rgba(239, 68, 68, 0.03); border: 1.5px dashed #ef4444; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.2s;';
        } else if (draftSlot.isFallback) {
          cardStyle = 'background: rgba(245, 158, 11, 0.05); border: 1.5px dashed #f59e0b; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.2s;';
        } else if (isDraft) {
          cardStyle = 'background: rgba(251, 191, 36, 0.05); border: 1px dashed #fbbf24; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.2s;';
        }

        html += '      <div class="period-card" data-period="' + p + '" style="' + cardStyle + '">';
        html += '        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 8px;">';
        html += '          <strong style="color: var(--accent-primary); font-size: 14px;">Period ' + p + '</strong>';
        html += '          <span class="badge badge-info" style="font-size: 10px;">' + SchoolApp.getPeriodTimeStr(p, state.dayVal) + '</span>';
        html += '        </div>';

        if (isInactiveAssigned) {
          html += '      <div style="margin-top: 4px; display: flex; justify-content: center;">';
          html += '        <span class="badge badge-warning" style="font-size: 10px; background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4); width: 100%; text-align: center;">⚠️ ' + (savedSubject || 'Period') + ' — ' + assignedTeacher.firstName + ' ' + assignedTeacher.lastName + ' (Inactive) ⚠️ — Reassign needed</span>';
          html += '      </div>';
        } else if (draftSlot.isWarning) {
          html += '      <div style="margin-top: 4px; display: flex; justify-content: center;">';
          html += '        <span class="badge badge-danger" style="font-size: 10px; background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); width: 100%; text-align: center;">No teacher available — assign manually</span>';
          html += '      </div>';
        } else if (draftSlot.isFallback) {
          html += '      <div style="margin-top: 4px; display: flex; justify-content: center;">';
          html += '        <span class="badge" style="font-size: 10px; background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); width: 100%; text-align: center;">Fallback Assignment</span>';
          html += '      </div>';
        }

        // Subject Dropdown
        var isDisabledStr = SchoolApp.isTeacher() ? ' disabled' : '';
        html += '        <div>';
        html += '          <label class="form-label" style="font-size: 11px;">Subject</label>';
        html += '          <select class="form-select period-subject" data-period="' + p + '"' + isDisabledStr + ' style="width: 100%;"><option value="">Free Period</option>';
        classSubjects.forEach(function(sub) {
          html += '<option value="' + sub + '"' + (savedSubject === sub ? ' selected' : '') + '>' + sub + '</option>';
        });
        html += '          </select>';
        html += '        </div>';

        // Teacher Dropdown
        html += '        <div>';
        html += '          <label class="form-label" style="font-size: 11px;">Teacher</label>';
        html += '          <select class="form-select period-teacher" data-period="' + p + '"' + (savedSubject && !SchoolApp.isTeacher() ? '' : ' disabled') + ' style="width: 100%;"><option value="">Select Teacher</option>';
        
        if (savedSubject) {
          var eligibleTeachers = getTeachersForSubject(state.classVal, state.sectionVal, savedSubject);
          if (assignedTeacher && isInactiveAssigned && !eligibleTeachers.some(function(t) { return t.id === assignedTeacher.id; })) {
            eligibleTeachers.unshift(assignedTeacher);
          }
          eligibleTeachers.forEach(function(teacher) {
            var conflict = getTeacherConflict(teacher.id, state.dayVal, p, currentClassSection);
            var label = teacher.firstName + ' ' + teacher.lastName;
            if (teacher.status !== 'Active') {
              label += ' (Inactive) ⚠️';
            }
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
      var allTeachers = SchoolApp.store.teachers || [];
      var timetableForCheck = state.draftTimetable || SchoolApp.store.timetable || {};
      var activeTeachers = allTeachers.filter(function(t) {
        return t.status === 'Active' || hasAssignedSlots(t.id, timetableForCheck);
      });
      var settings = (SchoolApp.store && SchoolApp.store.timetable && SchoolApp.store.timetable.settings) || {};
      var periodsCount = (state.dayVal === 'Saturday') ? (settings.satTotalPeriods || 6) : (settings.totalPeriods || 8);

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
        var isInactive = t.status !== 'Active';
        var thStyle = isInactive 
          ? 'padding: 12px 16px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 700; text-align: center; color: #ef4444;' 
          : 'padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); font-weight: 700; text-align: center; color: var(--text-primary);';
        
        var nameStr = t.firstName + ' ' + t.lastName;
        if (isInactive) {
          nameStr += '<br><span class="badge" style="font-size: 9px; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4); margin-top: 2px;">⚠️ Inactive</span>';
        }
        
        html += '            <th style="' + thStyle + '">' + nameStr + '<br><span style="font-size: 9px; font-weight: 400; color: var(--text-muted);">' + (t.subject || 'N/A') + '</span></th>';
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
                  subject: daySchedule[p].subject,
                  isFallback: daySchedule[p].isFallback
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
            if (t.status !== 'Active') {
              borderStyle = 'border: 2px dashed #ef4444; background: rgba(239, 68, 68, 0.08);';
            } else if (draftAssignment.isFallback) {
              borderStyle = 'border: 2px dashed #f59e0b; background: rgba(245, 158, 11, 0.05);';
            }
            html += '            <td style="padding: 12px 16px; ' + borderStyle + ' text-align: center; vertical-align: middle; position: relative;">';
            html += '              <strong style="' + (t.status !== 'Active' ? 'color: #ef4444;' : 'color: var(--accent-primary-light);') + ' font-size: 13px;">Class ' + draftAssignment.classSection + '</strong><br>';
            var badgeClass = t.status !== 'Active' ? 'badge' : 'badge badge-purple';
            var badgeStyle = t.status !== 'Active' ? 'background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);' : '';
            html += '              <span class="' + badgeClass + '" style="font-size: 10px; margin-top: 4px; ' + badgeStyle + '">' + draftAssignment.subject + (t.status !== 'Active' ? ' (Inactive) ⚠️' : '') + '</span>';
            if (!SchoolApp.isTeacher()) {
              html += '              <button class="clear-cell-btn btn-xs" data-class="' + draftAssignment.classSection + '" data-period="' + p + '" data-day="' + state.dayVal + '" style="position: absolute; top: 2px; right: 2px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; border-radius: 4px; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: all 0.2s;" title="Unassign"><span class="material-icons-round" style="font-size: 12px;">close</span></button>';
            }
            html += '            </td>';
          } else {
            html += '            <td style="padding: 12px 16px; border: 1px solid var(--border-light); text-align: center; vertical-align: middle;">';
            if (!SchoolApp.isTeacher()) {
              html += '              <button class="btn btn-xs assign-cell-btn" data-teacher="' + t.id + '" data-period="' + p + '" data-day="' + state.dayVal + '" style="background: rgba(16, 185, 129, 0.1); color: var(--success); border: 1px dashed rgba(16, 185, 129, 0.4); padding: 6px 12px; border-radius: 6px; font-weight: 500; cursor: pointer; transition: all var(--transition-fast); width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">';
              html += '                <span class="material-icons-round" style="font-size: 14px;">add</span> Assign';
              html += '              </button>';
            } else {
              html += '              <span style="color: var(--text-muted); font-size: 11px; font-style: italic;">Free</span>';
            }
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

    var findInactiveBtn = document.getElementById('find-inactive-slots-btn');
    if (findInactiveBtn) findInactiveBtn.addEventListener('click', findInactiveTeacherSlots);

    var autoGenBtn = document.getElementById('auto-generate-btn');
    if (autoGenBtn) autoGenBtn.addEventListener('click', showAutoGenModal);

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
          state.draftTimetable[currentClassSection][state.dayVal][period] = { subject: subVal, teacherId: '', isFallback: false, isWarning: false };
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
        state.draftTimetable[currentClassSection][state.dayVal][period].isFallback = false;
        state.draftTimetable[currentClassSection][state.dayVal][period].isWarning = false;
        render();
      });
    });

    var resetBtn = document.getElementById('btn-reset-timetable');
    if (resetBtn) resetBtn.addEventListener('click', resetTimetable);
  }

  function showSettingsModal() {
    var s = (SchoolApp.store && SchoolApp.store.timetable && SchoolApp.store.timetable.settings) || {
      startTime: "08:00",
      endTime: "14:00",
      totalPeriods: 8,
      lunchAfterPeriod: 4,
      lunchDuration: 30,
      satStartTime: "08:00",
      satEndTime: "12:30",
      satTotalPeriods: 6,
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
    bodyHTML += '      <label class="form-label" style="font-size: 11px;">School End Time *</label>';
    bodyHTML += '      <input type="time" class="form-input" name="endTime" value="' + (s.endTime || '14:00') + '" required>';
    bodyHTML += '    </div>';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size: 11px;">Total Periods *</label>';
    bodyHTML += '      <input type="number" class="form-input" name="totalPeriods" min="1" value="' + (s.totalPeriods || 8) + '" required>';
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
    bodyHTML += '      <label class="form-label" style="font-size: 11px;">School End Time *</label>';
    bodyHTML += '      <input type="time" class="form-input" name="satEndTime" value="' + (s.satEndTime || '12:30') + '" required>';
    bodyHTML += '    </div>';
    bodyHTML += '    <div class="form-group">';
    bodyHTML += '      <label class="form-label" style="font-size: 11px;">Total Periods *</label>';
    bodyHTML += '      <input type="number" class="form-input" name="satTotalPeriods" min="1" value="' + (s.satTotalPeriods || 6) + '" required>';
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
        endTime: fields.endTime,
        totalPeriods: parseInt(fields.totalPeriods) || 8,
        lunchAfterPeriod: parseInt(fields.lunchAfterPeriod) || 0,
        lunchDuration: parseInt(fields.lunchDuration) || 0,
        satStartTime: fields.satStartTime,
        satEndTime: fields.satEndTime,
        satTotalPeriods: parseInt(fields.satTotalPeriods) || 6,
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
    var settings = SchoolApp.store.settings || {};
    var classes = settings.classes || (settings.schoolInfo && settings.schoolInfo.classes) || [];
    var rawSections = settings.sections || {};
    var availableClasses = [];

    classes.forEach(function(c) {
      var sectList = [];
      if (Array.isArray(rawSections)) {
        sectList = rawSections;
      } else if (typeof rawSections === 'object') {
        sectList = rawSections[c] || [];
      }
      sectList.forEach(function(s) {
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
        teacherId: teacherId,
        isFallback: false,
        isWarning: false
      };

      SchoolApp.showToast('Assignment added to draft.', 'success');
      SchoolApp.closeModal();
      render();
    });
  }

  function generateAutoTimetable(resetFirst) {
    var settings = SchoolApp.store.settings || {};
    var classes = settings.classes || (settings.schoolInfo && settings.schoolInfo.classes) || [];
    var rawSections = settings.sections || {};

    if (classes.length === 0) {
      SchoolApp.showToast('No classes configured. Setup classes in Admin Panel first.', 'error');
      return;
    }

    var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    if (resetFirst) {
      state.draftTimetable = {};
    } else {
      initGlobalDraft();
    }

      days.forEach(function(day) {
        var settings = (SchoolApp.store && SchoolApp.store.timetable && SchoolApp.store.timetable.settings) || {};
        var periodsCount = (day === 'Saturday') ? (settings.satTotalPeriods || 6) : (settings.totalPeriods || 8);

        classes.forEach(function(c) {
          var sectList = [];
          if (Array.isArray(rawSections)) {
            sectList = rawSections;
          } else if (typeof rawSections === 'object') {
            sectList = rawSections[c] || [];
          }
          sectList.forEach(function(s) {
            var classSection = c + '-' + s;

            if (!state.draftTimetable[classSection]) {
              state.draftTimetable[classSection] = {};
            }
            if (!state.draftTimetable[classSection][day]) {
              state.draftTimetable[classSection][day] = {};
            }

            var usedSubjectsToday = [];
            var lastPeriodSubject = null;

            // Pre-populate usedSubjectsToday from saved or manually assigned slots for this class and day
            for (var p = 1; p <= periodsCount; p++) {
              var slot = state.draftTimetable[classSection][day][p];
              if (slot && slot.subject) {
                var subNormalized = slot.subject.toLowerCase().trim();
                if (usedSubjectsToday.indexOf(subNormalized) === -1) {
                  usedSubjectsToday.push(subNormalized);
                }
              }
            }

            var allTeachers = SchoolApp.store.teachers || [];

            // Helper to check subject count for a teacher today across school draft
            var getSubjectCount = function(tId, sub) {
              var count = 0;
              var timetable = state.draftTimetable;
              for (var cs in timetable) {
                if (cs === 'settings') continue;
                var daySchedule = timetable[cs][day];
                if (daySchedule) {
                  for (var pr in daySchedule) {
                    var sl = daySchedule[pr];
                    if (sl && sl.teacherId === tId && sl.subject && sl.subject.toLowerCase().trim() === sub.toLowerCase().trim()) {
                      count++;
                    }
                  }
                }
              }
              return count;
            };

            // Helper to check if a teacher teaches a subject globally (either in t.subject or t.subjects)
            var teachesSub = function(t, sub) {
              var subs = [];
              if (t.subjects) {
                if (Array.isArray(t.subjects)) {
                  subs = t.subjects;
                } else if (typeof t.subjects === 'string') {
                  subs = t.subjects.split(',');
                }
              } else if (t.subject) {
                if (Array.isArray(t.subject)) {
                  subs = t.subject;
                } else if (typeof t.subject === 'string') {
                  subs = t.subject.split(',');
                }
              }
              return subs.map(function(item) { return item.trim().toLowerCase(); }).indexOf(sub.toLowerCase().trim()) !== -1;
            };

            // Helper to check if a teacher has the class assigned in t.assignedClasses
            var hasClass = function(t, cls, sect) {
              if (!t.assignedClasses) return false;
              return t.assignedClasses.some(function(ac) {
                return String(ac.class).toLowerCase().trim() === String(cls).toLowerCase().trim() &&
                       String(ac.section).toLowerCase().trim() === String(sect).toLowerCase().trim();
              });
            };

            for (var p = 1; p <= periodsCount; p++) {
              var existingSlot = state.draftTimetable[classSection][day][p];
              // Skip slot if it already has a subject and teacher assigned
              if (existingSlot && existingSlot.subject && existingSlot.teacherId) {
                lastPeriodSubject = existingSlot.subject;
                continue;
              }

              // Determine candidate subjects for this period
              var candidateSubjects = [];
              if (existingSlot && existingSlot.subject) {
                // If a subject was pre-selected (but no teacher), use only that subject
                candidateSubjects = [existingSlot.subject];
              } else {
                var classSubjects = getSubjectsForClass(c);
                if (classSubjects.length === 0) {
                  lastPeriodSubject = null;
                  continue;
                }

                // Partition class subjects into unused and used today
                var unusedSubs = [];
                var usedSubs = [];
                classSubjects.forEach(function(sub) {
                  var subNorm = sub.toLowerCase().trim();
                  if (usedSubjectsToday.indexOf(subNorm) === -1) {
                    unusedSubs.push(sub);
                  } else {
                    usedSubs.push(sub);
                  }
                });

                // Shuffle both lists for randomness
                unusedSubs.sort(function() { return 0.5 - Math.random(); });
                usedSubs.sort(function() { return 0.5 - Math.random(); });

                // Construct ordered candidate subjects list: unused first, then non-consecutive used, then consecutive used if necessary
                unusedSubs.forEach(function(sub) { candidateSubjects.push(sub); });
                usedSubs.forEach(function(sub) {
                  if (!lastPeriodSubject || sub.toLowerCase().trim() !== lastPeriodSubject.toLowerCase().trim()) {
                    candidateSubjects.push(sub);
                  }
                });
                if (lastPeriodSubject) {
                  var orig = usedSubs.find(function(sub) {
                    return sub.toLowerCase().trim() === lastPeriodSubject.toLowerCase().trim();
                  });
                  if (orig) {
                    candidateSubjects.push(orig);
                  }
                }
              }

              var assigned = false;

              // STEP 1 — Primary Assignment:
              // Find a teacher where ALL conditions are true:
              // - teacher.subjects includes the period's subject
              // - teacher.assignedClasses includes the period's class
              // - teacher has no other assignment in this period
              // - same subject for same teacher: max 2 times per day
              for (var i = 0; i < candidateSubjects.length; i++) {
                var subject = candidateSubjects[i];
                var primaryTeachers = allTeachers.filter(function(t) {
                  return t.status === 'Active' &&
                         teachesSub(t, subject) &&
                         hasClass(t, c, s) &&
                         !getTeacherConflict(t.id, day, p, classSection) &&
                         getSubjectCount(t.id, subject) < 2;
                });

                if (primaryTeachers.length > 0) {
                  var picked = primaryTeachers[Math.floor(Math.random() * primaryTeachers.length)];
                  state.draftTimetable[classSection][day][p] = {
                    subject: subject,
                    teacherId: picked.id,
                    isFallback: false,
                    isWarning: false
                  };
                  var subNorm = subject.toLowerCase().trim();
                  if (usedSubjectsToday.indexOf(subNorm) === -1) {
                    usedSubjectsToday.push(subNorm);
                  }
                  lastPeriodSubject = subject;
                  assigned = true;
                  break;
                }
              }

              // STEP 2 — Fallback Assignment (only if Step 1 fails):
              // Find any teacher where:
              // - teacher has no other assignment in this period
              // - count of times this teacher is assigned this subject today is less than 2
              // (same subject max 2 times per day per teacher)
              if (!assigned) {
                for (var i = 0; i < candidateSubjects.length; i++) {
                  var subject = candidateSubjects[i];
                  var fallbackTeachers = allTeachers.filter(function(t) {
                    return t.status === 'Active' &&
                           !getTeacherConflict(t.id, day, p, classSection) &&
                           getSubjectCount(t.id, subject) < 2;
                  });

                  if (fallbackTeachers.length > 0) {
                    var picked = fallbackTeachers[Math.floor(Math.random() * fallbackTeachers.length)];
                    state.draftTimetable[classSection][day][p] = {
                      subject: subject,
                      teacherId: picked.id,
                      isFallback: true,
                      isWarning: false
                    };
                    var subNorm = subject.toLowerCase().trim();
                    if (usedSubjectsToday.indexOf(subNorm) === -1) {
                      usedSubjectsToday.push(subNorm);
                    }
                    lastPeriodSubject = subject;
                    assigned = true;
                    break;
                  }
                }
              }

              // STEP 3 — Leave Blank (only if Step 2 also fails):
              // - Do not force assign anyone
              // - Leave period empty
              // - Show warning badge: "No teacher available — assign manually"
              if (!assigned) {
                state.draftTimetable[classSection][day][p] = {
                  subject: '',
                  teacherId: '',
                  isWarning: true,
                  isFallback: false
                };
                lastPeriodSubject = null;
              }
            }
          });
        });
      });

      render();
      var msg = resetFirst ? 'Timetable reset and regenerated from scratch!' : 'Empty timetable slots auto-filled across all classes!';
      SchoolApp.showToast(msg, 'success');
  }

  function saveTimetable() {
    var settings = SchoolApp.store.settings || {};
    var classes = settings.classes || [];
    var sections = settings.sections || [];
    
    // 1. If in Class View, sync current page selections from the DOM into draftTimetable before checking
    if (state.viewMode === 'class') {
      var currentClassSection = state.classVal + '-' + state.sectionVal;
       var settings = (SchoolApp.store && SchoolApp.store.timetable && SchoolApp.store.timetable.settings) || {};
      var periodsCount = (state.dayVal === 'Saturday') ? (settings.satTotalPeriods || 6) : (settings.totalPeriods || 8);

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

  function resetTimetable() {
    if (state.viewMode === 'class') {
      var currentClassSection = state.classVal + '-' + state.sectionVal;
      SchoolApp.showConfirm("Are you sure you want to clear the entire week's timetable for " + currentClassSection + "? This cannot be undone.", function() {
        if (SchoolApp.store.timetable) {
          delete SchoolApp.store.timetable[currentClassSection];
        }
        if (state.draftTimetable) {
          delete state.draftTimetable[currentClassSection];
        }
        SchoolApp.save();
        SchoolApp.showToast("Timetable for " + currentClassSection + " has been cleared.", "success");
        render();
      }, "Reset Timetable");
    } else {
      SchoolApp.showConfirm("WARNING: Are you sure you want to completely clear the timetable for the ENTIRE SCHOOL? All assigned periods for all classes will be wiped.", function() {
        var settings = SchoolApp.store.timetable ? SchoolApp.store.timetable.settings : null;
        SchoolApp.store.timetable = {};
        if (settings) {
          SchoolApp.store.timetable.settings = settings;
        }
        state.draftTimetable = null;
        SchoolApp.save();
        SchoolApp.showToast("School-wide timetable has been cleared.", "success");
        render();
      }, "Reset School Timetable");
    }
  }

  // Register Module
  SchoolApp.registerModule('timetable', {
    init: function() {},
    render: render
  });

})();
