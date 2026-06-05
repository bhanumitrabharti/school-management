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
    currentDraftKey: ''
  };

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
    var timetable = SchoolApp.store.timetable || {};
    for (var classSection in timetable) {
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
    if (!state.draftTimetable || state.currentDraftKey !== currentClassSection) {
      var savedData = (SchoolApp.store.timetable && SchoolApp.store.timetable[currentClassSection]) || {};
      state.draftTimetable = JSON.parse(JSON.stringify(savedData));
      state.currentDraftKey = currentClassSection;
    }

    var dayData = state.draftTimetable[state.dayVal] || {};
    var savedClassData = (SchoolApp.store.timetable || {})[currentClassSection] || {};
    var savedDayData = savedClassData[state.dayVal] || {};

    var html = '';

    // Page Header
    html += '<div class="page-header">';
    html += '<h2><span class="material-icons-round">schedule</span> Timetable Management</h2>';
    html += '</div>';

    // Toolbar / Filters Row
    html += '<div class="toolbar" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); border-radius: var(--radius-lg); padding: 16px 20px;">';
    html += '  <div class="filter-group" style="display: flex; gap: 16px; width: 100%; align-items: flex-end;">';
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
    days.forEach(function(d) { html += '<option value="' + d + '"' + (state.dayVal === d ? ' selected' : '') + '>Select Day</option>'; });
    html += '      </select>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // Main Period Grid Card list
    html += '<div class="card" style="margin-top: 20px;">';
    html += '  <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-light); padding: 16px 20px; flex-wrap: wrap; gap: 10px;">';
    html += '    <h3 style="margin: 0; font-size: 16px;">Schedule for Class ' + currentClassSection + ' (' + state.dayVal + ')</h3>';
    html += '    <div style="display: flex; gap: 10px;">';
    html += '      <button class="btn btn-secondary btn-sm" id="timetable-settings-btn" style="background: rgba(6, 182, 212, 0.15); color: #06b6d4; border: 1px solid rgba(6, 182, 212, 0.3);"><span class="material-icons-round" style="font-size: 16px;">settings</span> Timing Settings</button>';
    html += '      <button class="btn btn-secondary btn-sm" id="auto-generate-btn" style="background: rgba(108, 92, 231, 0.15); color: #a29bfe; border: 1px solid rgba(108, 92, 231, 0.3);"><span class="material-icons-round" style="font-size: 16px;">bolt</span> Auto-Generate Draft</button>';
    html += '      <button class="btn btn-primary btn-sm" id="save-timetable-btn"><span class="material-icons-round">save</span> Save Timetable</button>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div class="card-body" style="padding: 20px;">';
    html += '    <div class="timetable-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">';

    var periodsCount = (state.dayVal === 'Saturday') ? 6 : 8;
    var classSubjects = getSubjectsForClass(state.classVal);

    for (var p = 1; p <= periodsCount; p++) {
      var savedSlot = savedDayData[p] || {};
      var draftSlot = dayData[p] || {};
      
      var savedSubject = draftSlot.subject || '';
      var savedTeacherId = draftSlot.teacherId || '';

      // Check if slot differs from the database (draft indicator)
      var isDraft = false;
      if ((draftSlot.subject || draftSlot.teacherId) &&
          (draftSlot.subject !== savedSlot.subject || draftSlot.teacherId !== savedSlot.teacherId)) {
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

    // Subject dropdown change listeners
    document.querySelectorAll('.period-subject').forEach(function(select) {
      select.addEventListener('change', function() {
        var period = this.getAttribute('data-period');
        var subVal = this.value;

        if (!state.draftTimetable[state.dayVal]) {
          state.draftTimetable[state.dayVal] = {};
        }

        if (!subVal) {
          delete state.draftTimetable[state.dayVal][period];
        } else {
          state.draftTimetable[state.dayVal][period] = { subject: subVal, teacherId: '' };
        }
        render();
      });
    });

    // Teacher dropdown change listeners
    document.querySelectorAll('.period-teacher').forEach(function(select) {
      select.addEventListener('change', function() {
        var period = this.getAttribute('data-period');
        var teachVal = this.value;

        if (!state.draftTimetable[state.dayVal]) {
          state.draftTimetable[state.dayVal] = {};
        }
        if (!state.draftTimetable[state.dayVal][period]) {
          state.draftTimetable[state.dayVal][period] = { subject: '', teacherId: '' };
        }
        state.draftTimetable[state.dayVal][period].teacherId = teachVal;
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

  function generateAutoTimetable() {
    var currentClassSection = state.classVal + '-' + state.sectionVal;
    var classSubjects = getSubjectsForClass(state.classVal);

    if (classSubjects.length === 0) {
      SchoolApp.showToast('No subjects mapped to this class. Setup subjects in Admin Panel first.', 'error');
      return;
    }

    SchoolApp.showConfirm('This will auto-fill empty slots for the selected Class for the entire week. Existing saved slots will not be overwritten. Proceed?', function() {
      var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      days.forEach(function(day) {
        var periodsCount = (day === 'Saturday') ? 6 : 8;
        if (!state.draftTimetable[day]) {
          state.draftTimetable[day] = {};
        }

        for (var p = 1; p <= periodsCount; p++) {
          // Skip check: respect manual inputs
          var existingSlot = state.draftTimetable[day][p];
          if (existingSlot && existingSlot.subject && existingSlot.teacherId) {
            continue; 
          }

          // Shuffle subjects
          var shuffledSubjects = classSubjects.slice().sort(function() { return 0.5 - Math.random(); });

          var assigned = false;
          for (var i = 0; i < shuffledSubjects.length; i++) {
            var subject = shuffledSubjects[i];
            var eligibleTeachers = getTeachersForSubject(state.classVal, state.sectionVal, subject);
            
            // Shuffle teachers
            var shuffledTeachers = eligibleTeachers.slice().sort(function() { return 0.5 - Math.random(); });

            for (var j = 0; j < shuffledTeachers.length; j++) {
              var teacher = shuffledTeachers[j];
              var conflict = getTeacherConflict(teacher.id, day, p, currentClassSection);
              if (!conflict) {
                state.draftTimetable[day][p] = { subject: subject, teacherId: teacher.id };
                assigned = true;
                break;
              }
            }

            if (assigned) break;
          }
        }
      });

      SchoolApp.showToast('Draft generated successfully! Please review and click Save to confirm.', 'success');
      render();
    }, 'Auto-Generate Draft');
  }

  function saveTimetable() {
    var currentClassSection = state.classVal + '-' + state.sectionVal;
    var periodsCount = (state.dayVal === 'Saturday') ? 6 : 8;
    var valid = true;

    // 1. Sync current page selections from the DOM into draftTimetable before checking
    for (var p = 1; p <= periodsCount; p++) {
      var subVal = document.querySelector('.period-subject[data-period="' + p + '"]').value;
      var teacherSelect = document.querySelector('.period-teacher[data-period="' + p + '"]');
      var teachVal = teacherSelect ? teacherSelect.value : '';

      if (!state.draftTimetable[state.dayVal]) {
        state.draftTimetable[state.dayVal] = {};
      }

      if (subVal && teachVal) {
        state.draftTimetable[state.dayVal][p] = { subject: subVal, teacherId: teachVal };
      } else if (!subVal && !teachVal) {
        delete state.draftTimetable[state.dayVal][p];
      } else {
        // Partially filled slot validation
        SchoolApp.showToast('Please select both Subject and Teacher for Period ' + p + '.', 'error');
        valid = false;
        
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

    if (!valid) return;

    // 2. Validate the ENTIRE week's draft for completeness and overlap conflicts
    for (var day in state.draftTimetable) {
      var daySchedule = state.draftTimetable[day];
      for (var p in daySchedule) {
        var slot = daySchedule[p];
        if (slot) {
          // Completeness check
          if ((slot.subject && !slot.teacherId) || (!slot.subject && slot.teacherId)) {
            SchoolApp.showToast('Please select both Subject and Teacher for Period ' + p + ' on ' + day + '.', 'error');
            return;
          }

          // Conflict overlap check
          if (slot.teacherId) {
            var conflict = getTeacherConflict(slot.teacherId, day, p, currentClassSection);
            if (conflict) {
              var teachers = SchoolApp.store.teachers || [];
              var tObj = teachers.find(function(t) { return t.id === slot.teacherId; });
              var tName = tObj ? (tObj.firstName + ' ' + tObj.lastName) : 'Teacher';
              SchoolApp.showToast('Conflict detected in draft: ' + tName + ' is already busy in Class ' + conflict + ' on ' + day + ' during Period ' + p + '.', 'error');
              return;
            }
          }
        }
      }
    }

    // 3. Commit weekly draft to database
    if (!SchoolApp.store.timetable) {
      SchoolApp.store.timetable = {};
    }
    SchoolApp.store.timetable[currentClassSection] = JSON.parse(JSON.stringify(state.draftTimetable));
    
    SchoolApp.save();
    SchoolApp.showToast('Timetable for Class ' + currentClassSection + ' saved successfully.', 'success');
    render();
  }

  // Register Module
  SchoolApp.registerModule('timetable', {
    init: function() {},
    render: render
  });

})();
