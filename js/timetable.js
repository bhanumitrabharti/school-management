'use strict';

/* ============================================================
   Shishu Vikash Mandir - Timetable Management Module
   ============================================================ */

(function() {

  var state = {
    classVal: '',
    sectionVal: '',
    dayVal: 'Monday'
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
    var timetableData = (SchoolApp.store.timetable || {})[currentClassSection] || {};
    var dayData = timetableData[state.dayVal] || {};

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
    days.forEach(function(d) { html += '<option value="' + d + '"' + (state.dayVal === d ? ' selected' : '') + '>' + d + '</option>'; });
    html += '      </select>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // Main Period Grid Card list
    html += '<div class="card" style="margin-top: 20px;">';
    html += '  <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-light); padding: 16px 20px;">';
    html += '    <h3 style="margin: 0; font-size: 16px;">Schedule for Class ' + currentClassSection + ' (' + state.dayVal + ')</h3>';
    html += '    <button class="btn btn-primary" id="save-timetable-btn"><span class="material-icons-round">save</span> Save Timetable</button>';
    html += '  </div>';
    html += '  <div class="card-body" style="padding: 20px;">';
    html += '    <div class="timetable-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">';

    var periodsCount = (state.dayVal === 'Saturday') ? 6 : 8;
    var classSubjects = getSubjectsForClass(state.classVal);

    for (var p = 1; p <= periodsCount; p++) {
      var savedSlot = dayData[p] || {};
      var savedSubject = savedSlot.subject || '';
      var savedTeacherId = savedSlot.teacherId || '';

      html += '      <div class="period-card" data-period="' + p + '" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.2s;">';
      html += '        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 8px;">';
      html += '          <strong style="color: var(--accent-primary); font-size: 14px;">Period ' + p + '</strong>';
      html += '          <span class="badge badge-info" style="font-size: 10px;">' + SchoolApp.getPeriodTimeStr(p) + '</span>';
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
    attachEvents();
  }

  function attachEvents() {
    var classSelect = document.getElementById('timetable-class-select');
    var sectionSelect = document.getElementById('timetable-section-select');
    var daySelect = document.getElementById('timetable-day-select');

    if (classSelect) classSelect.addEventListener('change', function() { state.classVal = this.value; render(); });
    if (sectionSelect) sectionSelect.addEventListener('change', function() { state.sectionVal = this.value; render(); });
    if (daySelect) daySelect.addEventListener('change', function() { state.dayVal = this.value; render(); });

    var saveBtn = document.getElementById('save-timetable-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveTimetable);

    // Subject dropdown change listeners to dynamically populate and check teacher overlap
    document.querySelectorAll('.period-subject').forEach(function(select) {
      select.addEventListener('change', function() {
        var period = this.getAttribute('data-period');
        var teacherSelect = document.querySelector('.period-teacher[data-period="' + period + '"]');
        if (!teacherSelect) return;

        var subVal = this.value;
        if (!subVal) {
          teacherSelect.innerHTML = '<option value="">Select Teacher</option>';
          teacherSelect.value = '';
          teacherSelect.disabled = true;
          return;
        }

        teacherSelect.disabled = false;
        var currentClassSection = state.classVal + '-' + state.sectionVal;
        var eligibleTeachers = getTeachersForSubject(state.classVal, state.sectionVal, subVal);
        
        var html = '<option value="">Select Teacher</option>';
        eligibleTeachers.forEach(function(teacher) {
          var conflict = getTeacherConflict(teacher.id, state.dayVal, period, currentClassSection);
          var label = teacher.firstName + ' ' + teacher.lastName;
          var disabledAttr = '';
          if (conflict) {
            label += ' [Busy in ' + conflict + ']';
            disabledAttr = ' disabled';
          }
          html += '<option value="' + teacher.id + '"' + disabledAttr + '>' + label + '</option>';
        });
        teacherSelect.innerHTML = html;
        teacherSelect.value = '';
      });
    });
  }

  function saveTimetable() {
    var currentClassSection = state.classVal + '-' + state.sectionVal;
    var periodsCount = (state.dayVal === 'Saturday') ? 6 : 8;
    var dayData = {};
    var valid = true;

    for (var p = 1; p <= periodsCount; p++) {
      var subVal = document.querySelector('.period-subject[data-period="' + p + '"]').value;
      var teacherSelect = document.querySelector('.period-teacher[data-period="' + p + '"]');
      var teachVal = teacherSelect ? teacherSelect.value : '';

      // Validate that slot is not partially filled
      if ((subVal && !teachVal) || (!subVal && teachVal)) {
        SchoolApp.showToast('Please select both Subject and Teacher for Period ' + p + '.', 'error');
        valid = false;
        
        var pCard = document.querySelector('.period-card[data-period="' + p + '"]');
        if (pCard) {
          pCard.style.borderColor = 'var(--danger)';
          setTimeout(function() {
            pCard.style.borderColor = 'var(--border-light)';
          }, 3000);
        }
        return;
      }

      if (subVal && teachVal) {
        // Double check teacher conflict on save to prevent any bypassing
        var conflict = getTeacherConflict(teachVal, state.dayVal, p, currentClassSection);
        if (conflict) {
          var teachers = SchoolApp.store.teachers || [];
          var tObj = teachers.find(function(t) { return t.id === teachVal; });
          var tName = tObj ? (tObj.firstName + ' ' + tObj.lastName) : 'Teacher';
          SchoolApp.showToast('Conflict detected: ' + tName + ' is already busy in Class ' + conflict + ' during Period ' + p + '.', 'error');
          
          var pCard = document.querySelector('.period-card[data-period="' + p + '"]');
          if (pCard) {
            pCard.style.borderColor = 'var(--danger)';
            setTimeout(function() {
              pCard.style.borderColor = 'var(--border-light)';
            }, 3000);
          }
          return;
        }

        dayData[p] = { subject: subVal, teacherId: teachVal };
      }
    }

    if (!valid) return;

    if (!SchoolApp.store.timetable) {
      SchoolApp.store.timetable = {};
    }
    if (!SchoolApp.store.timetable[currentClassSection]) {
      SchoolApp.store.timetable[currentClassSection] = {};
    }

    SchoolApp.store.timetable[currentClassSection][state.dayVal] = dayData;
    SchoolApp.save();
    SchoolApp.showToast('Timetable for Class ' + currentClassSection + ' (' + state.dayVal + ') saved successfully.', 'success');
    render();
  }

  // Register Module
  SchoolApp.registerModule('timetable', {
    init: function() {},
    render: render
  });

})();
