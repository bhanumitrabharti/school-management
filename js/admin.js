'use strict';

/* ============================================================
   Shishu Vikash Mandir - Admin Panel Module
   ============================================================ */

(function() {

  
  function compressImage(base64Str, maxW, maxH) {
    return new Promise(function(resolve) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        var width = img.width;
        var height = img.height;
        maxW = maxW || 300;
        maxH = maxH || 300;

        if (width > height) {
          if (width > maxW) {
            height = Math.round((height * maxW) / width);
            width = maxW;
          }
        } else {
          if (height > maxH) {
            width = Math.round((width * maxH) / height);
            height = maxH;
          }
        }
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function() {
        resolve(base64Str);
      };
      img.src = base64Str;
    });
  }

  function showLogoStatus(type, msg) {
    var container = document.getElementById('logo-status-container');
    if (!container) return;
    var color = type === 'success' ? '#15803D' : (type === 'error' ? '#DC2626' : '#2563EB');
    container.style.color = color;
    container.innerHTML = msg;
  }

  function showLogoPreview(src) {
    var preview = document.getElementById('logo-preview');
    if (!preview) return;
    if (!src) {
      preview.innerHTML = '<span class="text-muted" style="font-size:12px;">No logo uploaded</span>';
      return;
    }
    preview.innerHTML = 
      '<div style="margin-top:8px;">' +
      '  <img src="' + src + '" style="max-height:80px;border-radius:8px;border:1px solid #E5E7EB;padding:4px;background:var(--bg-secondary);object-fit:contain;">' +
      '  <div style="display:flex;gap:8px;margin-top:8px;">' +
      '    <button type="button" class="btn btn-secondary btn-xs" onclick="window.changeLogo()"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;">edit</span> Change Logo</button>' +
      '    <button type="button" class="btn btn-danger btn-xs" onclick="window.removeLogo()"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;">delete</span> Remove Logo</button>' +
      '  </div>' +
      '</div>';
  }

  window.changeLogo = function() {
    var input = document.getElementById('school-logo-input') || document.getElementById('logo-file-input');
    if (input) input.click();
  };

  window.removeLogo = function() {
    if (!confirm('Remove school logo?')) return;
    if (!SchoolApp.store.settings) SchoolApp.store.settings = {};
    SchoolApp.store.settings.schoolLogo = '';
    SchoolApp.store.settings.logoUrl = '';
    if (SchoolApp.store.settings.schoolInfo) {
      SchoolApp.store.settings.schoolInfo.schoolLogo = '';
      SchoolApp.store.settings.schoolInfo.logoUrl = '';
    }
    SchoolApp.save(true);
    showLogoPreview('');
    showLogoStatus('info', 'Logo removed');
    SchoolApp.showToast('Logo removed', 'info');
  };

  window.handleLogoSelect = function(input) {
    var file = input.files && input.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      SchoolApp.showToast('Please select an image file', 'error');
      showLogoStatus('error', '❌ Please select a valid image file');
      return;
    }

    if (file.size > 500 * 1024) {
      SchoolApp.showToast('Logo size should be under 500KB', 'error');
      showLogoStatus('error', '❌ Logo size should be under 500KB');
      return;
    }

    showLogoStatus('processing', 'Uploading...');

    var reader = new FileReader();
    reader.onload = async function(ev) {
      try {
        var rawBase64 = ev.target.result;
        var compressed = await compressImage(rawBase64, 300, 300);

        if (!SchoolApp.store.settings) SchoolApp.store.settings = {};
        SchoolApp.store.settings.schoolLogo = compressed;
        SchoolApp.store.settings.logoUrl = compressed;
        if (!SchoolApp.store.settings.schoolInfo) SchoolApp.store.settings.schoolInfo = {};
        SchoolApp.store.settings.schoolInfo.schoolLogo = compressed;
        SchoolApp.store.settings.schoolInfo.logoUrl = compressed;

        await SchoolApp.save(true);

        showLogoPreview(compressed);
        showLogoStatus('success', '✅ School Logo uploaded successfully!');
        SchoolApp.showToast('School Logo uploaded successfully!', 'success');
      } catch(err) {
        console.error('Logo upload error:', err);
        showLogoStatus('error', '❌ Upload failed. Try again.');
        SchoolApp.showToast('Upload failed. Try again.', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  var state = {
    activeTab: 'settings',
    activeSetupTab: 'profile',
    promotionSourceClass: '',
    promotionDestClass: '',
    examsSelectedClass: '',
    examsSelectedTerm: '',
    txnSearchQuery: '',
    txnStartDate: '',
    txnEndDate: ''
  };

  // Get dynamic dates for today, yesterday, etc. to keep dashboard metrics populated
  var todayISO = new Date();
  var getRelativeDateString = function(daysAgo, hours, minutes) {
    var d = new Date(todayISO);
    d.setDate(todayISO.getDate() - daysAgo);
    d.setHours(hours, minutes, 0, 0);
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd + 'T' + hh + ':' + min + ':00';
  };

  function getMergedTransactions() {
    var currentSchoolId = SchoolApp.store.currentSchoolId || 'svm_bokaro_001';
    
    // Get real transactions from SchoolApp.store.fees (filtered by current schoolId)
    var realPayments = (SchoolApp.store.fees || []).filter(function(f) {
      return f.type === 'payment' && (!f.schoolId || f.schoolId === currentSchoolId);
    });
    
    return realPayments.map(function(p) {
      var student = (SchoolApp.store.students || []).find(function(s) { return s.id === p.studentId; });
      var studentName = student ? (student.firstName + ' ' + (student.lastName || '')) : 'Unknown Student';
      var classSection = student ? (student.class + '-' + (student.section || 'A')) : 'Unknown';
      return {
        school_id: currentSchoolId,
        schoolId: currentSchoolId,
        transaction_id: p.id,
        date_time: p.date.indexOf('T') !== -1 ? p.date : (p.date + 'T12:00:00'),
        student_name: studentName,
        class_section: classSection,
        payment_method: p.mode || 'Cash',
        amount: parseFloat(p.amount)
      };
    });
  }



  function autoCarryoverSubjects(termId, classId) {
    if (!termId || !classId) return;

    var mappingKey = termId + '_' + classId;
    if (!SchoolApp.store.subjectMapping) {
      SchoolApp.store.subjectMapping = {};
    }

    var currentSubjects = SchoolApp.store.subjectMapping[mappingKey] || [];

    if (currentSubjects.length === 0) {
      var examsList = SchoolApp.store.exams || [];
      var foundSubjects = null;
      var foundTermName = '';

      for (var i = 0; i < examsList.length; i++) {
        var otherTermId = examsList[i].id;
        if (otherTermId === termId) continue;

        var otherKey = otherTermId + '_' + classId;
        var subjects = SchoolApp.store.subjectMapping[otherKey] || [];

        if (subjects.length > 0) {
          foundSubjects = subjects;
          foundTermName = examsList[i].name;
          break;
        }
      }

      if (!foundSubjects) {
        var legacySubjects = SchoolApp.store.subjectMapping[classId] || [];
        if (legacySubjects.length > 0) {
          foundSubjects = legacySubjects;
          foundTermName = 'Legacy Default';
        }
      }

      if (foundSubjects && foundSubjects.length > 0) {
        var cloned = foundSubjects.map(function(sub) {
          return {
            id: 'sub_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4),
            name: sub.name,
            maxMarks: sub.maxMarks,
            passMarks: sub.passMarks
          };
        });

        SchoolApp.store.subjectMapping[mappingKey] = cloned;
        SchoolApp.save();
        SchoolApp.showToast('Automatically carried over ' + cloned.length + ' subjects from ' + foundTermName + ' for ' + (['Nursery','LKG','UKG'].indexOf(classId) !== -1 ? classId : 'Class ' + classId) + '.', 'info');
      }
    }
  }

  function calculateGrade(percentage) {
    if (percentage >= 91) return 'A+';
    if (percentage >= 81) return 'A';
    if (percentage >= 71) return 'B+';
    if (percentage >= 61) return 'B';
    if (percentage >= 51) return 'C+';
    if (percentage >= 41) return 'C';
    if (percentage >= 33) return 'D';
    return 'F';
  }

  function getDefaultSubjectsForClass(cls) {
    var c = String(cls).trim();
    if (['Nursery', 'LKG', 'UKG'].indexOf(c) !== -1) {
      return ['Hindi', 'English', 'Maths', 'Drawing'];
    }
    if (c === '1' || c === '2') {
      return ['Hindi', 'English', 'Maths', 'EVS', 'Drawing'];
    }
    if (['3', '4', '5'].indexOf(c) !== -1) {
      return ['Hindi', 'English', 'Maths', 'Science', 'Social Studies', 'Sanskrit', 'Drawing'];
    }
    if (['6', '7', '8'].indexOf(c) !== -1) {
      return ['Hindi', 'English', 'Maths', 'Science', 'Social Studies', 'Sanskrit', 'Computer'];
    }
    if (['9', '10'].indexOf(c) !== -1) {
      return ['Hindi', 'English', 'Maths', 'Science', 'Social Studies', 'Computer Science'];
    }
    return ['English', 'Physics', 'Chemistry', 'Mathematics'];
  }

  function getSubjectType(name) {
    var n = String(name).toLowerCase();
    if (n.indexOf('drawing') !== -1 || n.indexOf('art') !== -1 || n.indexOf('handcraft') !== -1 || n.indexOf('practical') !== -1 || n.indexOf('music') !== -1 || n.indexOf('physical') !== -1) {
      return 'Practical';
    }
    if (n.indexOf('hindi') !== -1 || n.indexOf('english') !== -1 || n.indexOf('sanskrit') !== -1 || n.indexOf('language') !== -1 || n.indexOf('urdu') !== -1 || n.indexOf('bengali') !== -1) {
      return 'Language';
    }
    if (n.indexOf('internal') !== -1 || n.indexOf('viva') !== -1 || n.indexOf('project') !== -1 || n.indexOf('assignment') !== -1) {
      return 'Internal';
    }
    return 'Theory';
  }

  function openExamSetupWizard() {
    var wizardState = {
      step: 1,
      availableTerms: [
        { key: 't1', name: 'Term 1 (Half-Yearly)' },
        { key: 't2', name: 'Term 2 (Annual)' },
        { key: 'ut1', name: 'Unit Test 1' },
        { key: 'ut2', name: 'Unit Test 2' },
        { key: 'pb', name: 'Pre-Board' }
      ],
      selectedTerms: [],
      classSubjectMap: {},
      subjectTypeDefaults: {
        Theory: { full: 100, pass: 33 },
        Practical: { full: 50, pass: 17 },
        Language: { full: 100, pass: 33 },
        Internal: { full: 100, pass: 33 }
      }
    };

    function renderStep() {
      var title = 'Setup New Examination — Step ' + wizardState.step + ' of 4';
      var bodyHTML = '';
      var footerHTML = '';

      if (wizardState.step === 1) {
        bodyHTML += '<p style="color:var(--text-secondary); font-size:13px; margin-bottom:16px;">Select the exam terms you want to conduct and set their start/end dates. These dates are used for calculating student attendance percentages.</p>';
        bodyHTML += '<div style="display:flex; flex-direction:column; gap:12px;">';
        
        wizardState.availableTerms.forEach(function(term) {
          var matched = wizardState.selectedTerms.find(function(t) { return t.key === term.key; });
          var isChecked = !!matched;
          var startDate = matched ? matched.startDate || '' : '';
          var endDate = matched ? matched.endDate || '' : '';

          bodyHTML += '<div class="card mb-2" style="border: 1px solid var(--border-color); padding: 12px; background: rgba(255,255,255,0.02);">';
          bodyHTML += '  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">';
          bodyHTML += '    <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; cursor: pointer; user-select:none;">';
          bodyHTML += '      <input type="checkbox" class="wizard-term-cb" data-key="' + term.key + '" data-name="' + term.name + '"' + (isChecked ? ' checked' : '') + '>';
          bodyHTML += '      ' + term.name;
          bodyHTML += '    </label>';
          bodyHTML += '  </div>';
          bodyHTML += '  <div class="term-date-inputs" id="wizard-dates-' + term.key + '" style="display: ' + (isChecked ? 'grid' : 'none') + '; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px;">';
          bodyHTML += '    <div class="form-group mb-0">';
          bodyHTML += '      <label class="form-label" style="font-size: 11px; margin-bottom: 4px;">Term Start Date *</label>';
          bodyHTML += '      <input type="date" class="form-input wizard-term-start" data-key="' + term.key + '" value="' + startDate + '" style="padding: 6px; min-height: 32px;">';
          bodyHTML += '    </div>';
          bodyHTML += '    <div class="form-group mb-0">';
          bodyHTML += '      <label class="form-label" style="font-size: 11px; margin-bottom: 4px;">Term End Date *</label>';
          bodyHTML += '      <input type="date" class="form-input wizard-term-end" data-key="' + term.key + '" value="' + endDate + '" style="padding: 6px; min-height: 32px;">';
          bodyHTML += '    </div>';
          bodyHTML += '  </div>';
          bodyHTML += '</div>';
        });
        bodyHTML += '</div>';

        footerHTML += '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
        footerHTML += '<button class="btn btn-primary" id="wizard-next-btn"' + (wizardState.selectedTerms.length === 0 ? ' disabled' : '') + '>Next</button>';

      } else if (wizardState.step === 2) {
        bodyHTML += '<p style="color:var(--text-secondary); font-size:13px; margin-bottom:16px;">We analyzed teacher profiles to automatically map subjects for each class. If teacher data was incomplete, standard defaults were applied.</p>';
        bodyHTML += '<div style="max-height: 320px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; background: rgba(0,0,0,0.1);">';
        
        var classesList = SchoolApp.store.settings.classes || [];
        classesList.forEach(function(cls) {
          var subs = wizardState.classSubjectMap[cls] || [];
          var isFromTeacher = subs.some(function(s) { return s.fromTeacher; });
          var displayCls = ['Nursery','LKG','UKG'].indexOf(cls) !== -1 ? cls : 'Class ' + cls;
          
          bodyHTML += '<div style="display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 8px 0; gap:16px;">';
          bodyHTML += '  <div>';
          bodyHTML += '    <strong style="font-size:13px;">' + displayCls + '</strong><br>';
          bodyHTML += '    <span class="badge ' + (isFromTeacher ? 'badge-success' : 'badge-purple') + '" style="font-size: 9px; padding:2px 6px; display:inline-block; margin-top:4px;">';
          bodyHTML += '      ' + (isFromTeacher ? 'Teacher Assignments' : 'System Defaults');
          bodyHTML += '    </span>';
          bodyHTML += '  </div>';
          bodyHTML += '  <div style="font-size: 12px; color: var(--text-secondary); text-align: right; max-width: 65%; font-weight:500;">';
          bodyHTML += '    ' + subs.map(function(s) { return s.name; }).join(', ');
          bodyHTML += '  </div>';
          bodyHTML += '</div>';
        });
        bodyHTML += '</div>';

        footerHTML += '<button class="btn btn-secondary" id="wizard-prev-btn">Back</button>';
        footerHTML += '<button class="btn btn-primary" id="wizard-next-btn">Next</button>';

      } else if (wizardState.step === 3) {
        bodyHTML += '<p style="color:var(--text-secondary); font-size:13px; margin-bottom:16px;">Define the default Full Marks and Pass Marks for each subject type. Changing Full Marks will auto-suggest 33% for Passing Marks.</p>';
        bodyHTML += '<div class="form-grid" style="grid-template-columns: repeat(2, 1fr); gap: 16px;">';

        Object.keys(wizardState.subjectTypeDefaults).forEach(function(type) {
          var defaults = wizardState.subjectTypeDefaults[type];
          bodyHTML += '<div style="grid-column: span 2; font-weight: bold; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; margin-top: 8px; color:var(--accent-primary);">' + type + ' Default Scores</div>';
          bodyHTML += '<div class="form-group mb-0">';
          bodyHTML += '  <label class="form-label" style="font-size:11px;">Full Marks *</label>';
          bodyHTML += '  <input type="number" class="form-input wizard-default-full" data-type="' + type + '" value="' + defaults.full + '" min="1" required style="padding:6px; min-height:32px;">';
          bodyHTML += '</div>';
          bodyHTML += '<div class="form-group mb-0">';
          bodyHTML += '  <label class="form-label" style="font-size:11px;">Passing Marks *</label>';
          bodyHTML += '  <input type="number" class="form-input wizard-default-pass" data-type="' + type + '" value="' + defaults.pass + '" min="1" required style="padding:6px; min-height:32px;">';
          bodyHTML += '</div>';
        });

        bodyHTML += '</div>';

        footerHTML += '<button class="btn btn-secondary" id="wizard-prev-btn">Back</button>';
        footerHTML += '<button class="btn btn-primary" id="wizard-next-btn">Next</button>';

      } else if (wizardState.step === 4) {
        bodyHTML += '<p style="color:var(--text-secondary); font-size:13px; margin-bottom:16px;">Please review the setup configuration before creating the examinations. This will populate subject mappings for all classes.</p>';
        bodyHTML += '<div style="display:flex; flex-direction:column; gap:12px;">';
        bodyHTML += '  <div><strong>Exam Terms to Create:</strong>';
        bodyHTML += '    <ul style="margin: 6px 0; padding-left: 20px; font-size:13px; color:var(--text-secondary);">';
        wizardState.selectedTerms.forEach(function(t) {
          bodyHTML += '    <li>' + t.name + ' (' + (t.startDate ? SchoolApp.formatDate(t.startDate) : 'Not set') + ' to ' + (t.endDate ? SchoolApp.formatDate(t.endDate) : 'Not set') + ')</li>';
        });
        bodyHTML += '    </ul>';
        bodyHTML += '  </div>';

        var classesList = SchoolApp.store.settings.classes || [];
        bodyHTML += '  <div><strong>Classes Configured:</strong> ' + classesList.length + ' Classes</div>';
        bodyHTML += '  <div style="max-height: 180px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; background: rgba(0,0,0,0.1);">';
        
        classesList.forEach(function(cls) {
          var subs = wizardState.classSubjectMap[cls] || [];
          var displayCls = ['Nursery','LKG','UKG'].indexOf(cls) !== -1 ? cls : 'Class ' + cls;
          bodyHTML += '  <div style="margin-bottom: 6px; font-size:12px;">';
          bodyHTML += '    <span style="font-weight: 600;">' + displayCls + ':</span>';
          bodyHTML += '    <span style="color: var(--text-secondary);">' + subs.map(function(s) { return s.name + ' (' + s.type + ')'; }).join(', ') + '</span>';
          bodyHTML += '  </div>';
        });

        bodyHTML += '  </div>';
        bodyHTML += '</div>';

        footerHTML += '<button class="btn btn-secondary" id="wizard-prev-btn">Back</button>';
        footerHTML += '<button class="btn btn-primary" id="wizard-confirm-btn"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">check_circle</span> Confirm & Create</button>';
      }

      SchoolApp.showModal(title, bodyHTML, footerHTML);
      attachWizardEvents();
    }

    function attachWizardEvents() {
      if (wizardState.step === 1) {
        document.querySelectorAll('.wizard-term-cb').forEach(function(cb) {
          cb.addEventListener('change', function() {
            var key = this.getAttribute('data-key');
            var name = this.getAttribute('data-name');
            var datesDiv = document.getElementById('wizard-dates-' + key);
            
            if (this.checked) {
              datesDiv.style.display = 'grid';
              var startInput = datesDiv.querySelector('.wizard-term-start');
              var endInput = datesDiv.querySelector('.wizard-term-end');
              wizardState.selectedTerms.push({
                key: key,
                name: name,
                startDate: startInput.value,
                endDate: endInput.value
              });
            } else {
              datesDiv.style.display = 'none';
              wizardState.selectedTerms = wizardState.selectedTerms.filter(function(t) { return t.key !== key; });
            }
            
            var nextBtn = document.getElementById('wizard-next-btn');
            if (nextBtn) {
              nextBtn.disabled = wizardState.selectedTerms.length === 0;
            }
          });
        });

        document.querySelectorAll('.wizard-term-start, .wizard-term-end').forEach(function(input) {
          input.addEventListener('change', function() {
            var key = this.getAttribute('data-key');
            var matched = wizardState.selectedTerms.find(function(t) { return t.key === key; });
            if (matched) {
              if (this.classList.contains('wizard-term-start')) {
                matched.startDate = this.value;
              } else {
                matched.endDate = this.value;
              }
            }
          });
        });
      }

      if (wizardState.step === 3) {
        document.querySelectorAll('.wizard-default-full').forEach(function(input) {
          input.addEventListener('input', function() {
            var type = this.getAttribute('data-type');
            var val = parseFloat(this.value) || 0;
            wizardState.subjectTypeDefaults[type].full = val;
            
            var passVal = Math.round(val * 0.33);
            wizardState.subjectTypeDefaults[type].pass = passVal;
            
            var passInput = document.querySelector('.wizard-default-pass[data-type="' + type + '"]');
            if (passInput) passInput.value = passVal;
          });
        });

        document.querySelectorAll('.wizard-default-pass').forEach(function(input) {
          input.addEventListener('input', function() {
            var type = this.getAttribute('data-type');
            var val = parseFloat(this.value) || 0;
            wizardState.subjectTypeDefaults[type].pass = val;
          });
        });
      }

      var nextBtn = document.getElementById('wizard-next-btn');
      if (nextBtn) {
        nextBtn.addEventListener('click', function() {
          if (wizardState.step === 1) {
            var invalid = wizardState.selectedTerms.some(function(t) {
              return !t.startDate || !t.endDate;
            });
            if (invalid) {
              SchoolApp.showToast('Please fill out Start and End Dates for all selected terms.', 'error');
              return;
            }
          }

          if (wizardState.step === 1) {
            var classesList = SchoolApp.store.settings.classes || [];
            wizardState.classSubjectMap = {};
            classesList.forEach(function(cls) {
              var subs = new Set();
              var fromTeacherMap = {};
              
              (SchoolApp.store.teachers || []).forEach(function(t) {
                var assignedToClass = (t.assignedClasses || []).some(function(ac) {
                  return String(ac.class) === String(cls);
                });
                
                if (assignedToClass && t.subject) {
                  t.subject.split(',').forEach(function(s) {
                    var sTrim = s.trim();
                    if (sTrim) {
                      subs.add(sTrim);
                      fromTeacherMap[sTrim] = true;
                    }
                  });
                }

                (t.subjectTeacherOf || []).forEach(function(st) {
                  if (String(st.class) === String(cls) && st.subject) {
                    var sTrim = st.subject.trim();
                    subs.add(sTrim);
                    fromTeacherMap[sTrim] = true;
                  }
                });
              });

              var list = Array.from(subs);
              var isFromTeacher = list.length > 0;
              if (list.length === 0) {
                list = getDefaultSubjectsForClass(cls);
              }
              
              wizardState.classSubjectMap[cls] = list.map(function(name) {
                return {
                  name: name,
                  type: getSubjectType(name),
                  fromTeacher: !!fromTeacherMap[name]
                };
              });
            });
          }

          wizardState.step++;
          renderStep();
        });
      }

      var prevBtn = document.getElementById('wizard-prev-btn');
      if (prevBtn) {
        prevBtn.addEventListener('click', function() {
          wizardState.step--;
          renderStep();
        });
      }

      var confirmBtn = document.getElementById('wizard-confirm-btn');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', async function() {
          confirmBtn.disabled = true;
          confirmBtn.textContent = 'Creating...';

          try {
            if (!SchoolApp.store.exams) SchoolApp.store.exams = [];
            if (!SchoolApp.store.subjectMapping) SchoolApp.store.subjectMapping = {};

            var createdTermsCount = 0;
            var classesList = SchoolApp.store.settings.classes || [];

            wizardState.selectedTerms.forEach(function(term) {
              var examId = 'ex_' + term.key + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
              SchoolApp.store.exams.push({
                id: examId,
                name: term.name,
                startDate: term.startDate,
                endDate: term.endDate,
                schoolId: SchoolApp.store.currentSchoolId
              });
              createdTermsCount++;

              classesList.forEach(function(cls) {
                var mappingKey = examId + '_' + cls;
                var classSubjects = wizardState.classSubjectMap[cls] || [];
                
                SchoolApp.store.subjectMapping[mappingKey] = classSubjects.map(function(s, idx) {
                  var defaults = wizardState.subjectTypeDefaults[s.type] || wizardState.subjectTypeDefaults['Theory'];
                  return {
                    id: 'sub_' + term.key + '_' + idx + '_' + Math.random().toString(36).substr(2, 7),
                    name: s.name,
                    type: s.type,
                    maxMarks: defaults.full,
                    fullMarks: defaults.full,
                    passMarks: defaults.pass,
                    hasExam: true
                  };
                });
              });
            });

            SchoolApp.createRestorePoint('Auto-Backup before Save in Exam Wizard');
            var success = await SchoolApp.save();
            
            if (success) {
              SchoolApp.closeModal();
              SchoolApp.showToast('Exam setup complete for ' + classesList.length + ' classes ✅', 'success');
              render();
            } else {
              confirmBtn.disabled = false;
              confirmBtn.textContent = 'Confirm & Create';
            }
          } catch (e) {
            console.error('Error creating exams in wizard:', e);
            SchoolApp.showToast('An error occurred during setup. Please try again.', 'error');
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm & Create';
          }
        });
      }
    }

    renderStep();
  }

  function openAddEditSubjectModal(cls, subId) {
    var subjects = (SchoolApp.store.subjectMapping || {})[cls] || [];
    var sub = subId ? subjects.find(function(x) { return x.id === subId; }) : null;
    var isEdit = !!sub;

    var title = isEdit ? 'Edit Subject Details' : 'Add Subject';
    
    var subName = sub ? sub.name : '';
    var subType = sub ? sub.type || 'Theory' : 'Theory';
    var maxMarks = sub ? sub.maxMarks : 100;
    var passMarks = sub ? sub.passMarks : 33;
    var hasExam = sub && sub.hasExam !== undefined ? sub.hasExam : true;

    var bodyHTML = '<form id="admin-add-sub-form" class="form-grid">';
    bodyHTML += '<div class="form-group full-width"><label class="form-label">Subject Name *</label>';
    bodyHTML += '<input type="text" id="admin-sub-name" class="form-input" value="' + escapeAttr(subName) + '" placeholder="e.g. Hindi, Mathematics, Handcraft" required></div>';
    
    bodyHTML += '<div class="form-group"><label class="form-label">Subject Type *</label>';
    bodyHTML += '<select id="admin-sub-type" class="form-select">';
    bodyHTML += '<option value="Theory"' + (subType === 'Theory' ? ' selected' : '') + '>Theory</option>';
    bodyHTML += '<option value="Practical"' + (subType === 'Practical' ? ' selected' : '') + '>Practical</option>';
    bodyHTML += '<option value="Language"' + (subType === 'Language' ? ' selected' : '') + '>Language</option>';
    bodyHTML += '<option value="Internal"' + (subType === 'Internal' ? ' selected' : '') + '>Internal</option>';
    bodyHTML += '</select></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Has Exam? *</label>';
    bodyHTML += '<select id="admin-sub-has-exam" class="form-select">';
    bodyHTML += '<option value="yes"' + (hasExam ? ' selected' : '') + '>Yes</option>';
    bodyHTML += '<option value="no"' + (!hasExam ? ' selected' : '') + '>No (Internal Assessment Only)</option>';
    bodyHTML += '</select></div>';

    bodyHTML += '<div class="form-group"><label class="form-label">Full Marks *</label>';
    bodyHTML += '<input type="number" id="admin-sub-max" class="form-input" value="' + maxMarks + '" min="1" required></div>';
    
    bodyHTML += '<div class="form-group"><label class="form-label">Passing Marks (33% Suggested) *</label>';
    bodyHTML += '<input type="number" id="admin-sub-pass" class="form-input" value="' + passMarks + '" min="1" required></div>';
    
    bodyHTML += '</form>';

    var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
    footerHTML += '<button class="btn btn-primary" id="admin-save-subject-btn">' + (isEdit ? 'Save Changes' : 'Add Subject') + '</button>';

    var displayCls = cls;
    if (cls.indexOf('_') !== -1) {
      var parts = cls.split('_');
      var actualClass = parts[parts.length - 1];
      displayCls = ['Nursery','LKG','UKG'].indexOf(actualClass) !== -1 ? actualClass : 'Class ' + actualClass;
    } else {
      displayCls = ['Nursery','LKG','UKG'].indexOf(cls) !== -1 ? cls : 'Class ' + cls;
    }
    SchoolApp.showModal((isEdit ? 'Edit Subject - ' : 'Add Subject to ') + displayCls, bodyHTML, footerHTML);

    var maxInput = document.getElementById('admin-sub-max');
    var passInput = document.getElementById('admin-sub-pass');
    maxInput.addEventListener('input', function() {
      var val = parseFloat(this.value) || 0;
      passInput.value = Math.round(val * 0.33);
    });

    var saveBtn = document.getElementById('admin-save-subject-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        var name = document.getElementById('admin-sub-name').value.trim();
        var type = document.getElementById('admin-sub-type').value;
        var hasExamToggle = document.getElementById('admin-sub-has-exam').value === 'yes';
        var maxMarksVal = parseFloat(maxInput.value);
        var passMarksVal = parseFloat(passInput.value);

        if (!name || isNaN(maxMarksVal) || isNaN(passMarksVal) || maxMarksVal <= 0 || passMarksVal <= 0) {
          SchoolApp.showToast('Please fill out all fields with valid positive values.', 'error');
          return;
        }

        if (passMarksVal > maxMarksVal) {
          SchoolApp.showToast('Passing Marks cannot exceed Full Marks.', 'error');
          return;
        }

        if (!SchoolApp.store.subjectMapping) SchoolApp.store.subjectMapping = {};
        if (!SchoolApp.store.subjectMapping[cls]) SchoolApp.store.subjectMapping[cls] = [];

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        if (isEdit) {
          sub.name = name;
          sub.type = type;
          sub.hasExam = hasExamToggle;
          sub.maxMarks = maxMarksVal;
          sub.fullMarks = maxMarksVal;
          sub.passMarks = passMarksVal;
        } else {
          var newId = 'sub_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
          SchoolApp.store.subjectMapping[cls].push({
            id: newId,
            name: name,
            type: type,
            hasExam: hasExamToggle,
            maxMarks: maxMarksVal,
            fullMarks: maxMarksVal,
            passMarks: passMarksVal
          });
        }

        var success = await SchoolApp.save();
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? 'Save Changes' : 'Add Subject';

        if (success) {
          SchoolApp.closeModal();
          SchoolApp.showToast(isEdit ? 'Subject details updated!' : 'Subject added successfully!', 'success');
          render();
        }
      });
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
  function escapeAttr(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderSettingsClasses() {
    var container = document.getElementById('settings-classes-container');
    if (!container) return;

    var settings = SchoolApp.store.settings || {};
    var classes = settings.classes || [];
    var sections = settings.sections || {};

    var html = '';
    classes.forEach(function(c) {
      var sectList = [];
      if (Array.isArray(sections)) {
        sectList = sections;
      } else if (typeof sections === 'object') {
        sectList = sections[c] || [];
      }

      html += '<div class="class-structure-row">';
      html += '  <div class="class-name-badge">' + escapeHTML(c) + '</div>';
      html += '  <div class="section-tags-container">';
      sectList.forEach(function(sec) {
        html += '    <span class="section-tag">' + escapeHTML(sec);
        html += '      <span class="settings-remove-section" data-class="' + escapeAttr(c) + '" data-section="' + escapeAttr(sec) + '" title="Remove Section">&times;</span>';
        html += '    </span>';
      });
      if (sectList.length === 0) {
        html += '    <span style="font-size:12px; color:var(--text-muted); font-style:italic;">No sections</span>';
      }
      html += '  </div>';
      html += '  <div style="display:flex; gap:8px; align-items:center;">';
      html += '    <button type="button" class="btn btn-secondary btn-sm settings-add-section" data-class="' + escapeAttr(c) + '" style="height:32px; display:inline-flex; align-items:center; justify-content:center; gap:4px; font-size:12px;"><span class="material-icons-round" style="font-size:14px;">add</span> Section</button>';
      html += '    <button type="button" class="btn btn-danger btn-sm settings-delete-class" data-class="' + escapeAttr(c) + '" style="height:32px; width:32px; min-width:32px; display:inline-flex; align-items:center; justify-content:center; padding:0; border-radius:6px;"><span class="material-icons-round" style="font-size:16px;">delete</span></button>';
      html += '  </div>';
      html += '</div>';
    });

    if (classes.length === 0) {
      html = '<div style="text-align:center; padding:24px; color:var(--text-secondary); border: 1px dashed var(--border-color); border-radius: 12px;">No classes configured. Use "Add Class" above.</div>';
    }

    container.innerHTML = html;
    attachSettingsClassesEvents();
  }

  function renderSettingsSubjects() {
    var container = document.getElementById('settings-subjects-container');
    if (!container) return;

    var settings = SchoolApp.store.settings || {};
    var subjects = settings.subjects || [];

    var html = '<div class="subjects-config-grid">';
    subjects.forEach(function(sub) {
      html += '<div class="subject-config-chip">';
      html += '  <div class="subject-config-name" title="' + escapeAttr(sub) + '">' + escapeHTML(sub) + '</div>';
      html += '  <div class="subject-config-actions">';
      html += '    <button type="button" class="btn-icon settings-edit-subject" data-subject="' + escapeAttr(sub) + '" title="Edit Subject" style="color:var(--text-secondary);"><span class="material-icons-round" style="font-size:16px;">edit</span></button>';
      html += '    <button type="button" class="btn-icon settings-delete-subject" data-subject="' + escapeAttr(sub) + '" title="Delete Subject" style="color:var(--danger);"><span class="material-icons-round" style="font-size:16px;">close</span></button>';
      html += '  </div>';
      html += '</div>';
    });
    html += '</div>';

    if (subjects.length === 0) {
      html = '<div style="text-align:center; padding:24px; color:var(--text-secondary); border: 1px dashed var(--border-color); border-radius: 12px;">No subjects configured. Use "Add Subject" above.</div>';
    }

    container.innerHTML = html;
    attachSettingsSubjectsEvents();
  }

  function renderFeesMatrix() {
    var theadRow = document.getElementById('setup-feehead-row');
    var tbody = document.getElementById('setup-fee-matrix-body');
    if (!theadRow || !tbody) return;

    var settings = SchoolApp.store.settings || {};
    var classes = settings.classes || [];
    var feeStructure = settings.feeStructure || {};

    var heads = settings.feeHeads || [];

    var headHtml = '<th>Class</th>';
    heads.forEach(function(h) {
      headHtml += '<th>' + escapeHTML(h.name) + '</th>';
    });
    theadRow.innerHTML = headHtml;

    var bodyHtml = '';
    classes.forEach(function(c) {
      bodyHtml += '<tr>';
      bodyHtml += '  <td style="font-weight:600;">' + escapeHTML(c) + '</td>';
      heads.forEach(function(h) {
        var amt = (feeStructure[c] && feeStructure[c][h.id]) || 0;
        bodyHtml += '  <td><input type="number" class="fees-class-fee-input form-input" data-class="' + escapeAttr(c) + '" data-head="' + escapeAttr(h.id) + '" value="' + amt + '" style="padding:6px; width:90px; font-size:12px;" min="0"></td>';
      });
      bodyHtml += '</tr>';
    });

    if (classes.length === 0) {
      bodyHtml = '<tr><td colspan="' + (heads.length + 1) + '" style="text-align:center; color:var(--text-secondary);">Configure classes first.</td></tr>';
    }

    tbody.innerHTML = bodyHtml;
  }

  function renderFeesCharges() {
    var container = document.getElementById('setup-charges-list-container');
    if (!container) return;

    var settings = SchoolApp.store.settings || {};
    var charges = settings.extraCharges || [];

    var html = '';
    charges.forEach(function(item) {
      html += '<div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:var(--bg-glass); border:1px solid var(--border-color); border-radius:8px;">';
      html += '  <div><strong style="color:var(--text-primary);">' + escapeHTML(item.name) + '</strong> <span style="font-size:11px; color:var(--text-muted);">(' + escapeHTML(item.type) + ')</span></div>';
      html += '  <div style="display:flex; align-items:center; gap:12px;">';
      html += '    <strong style="color:#60a5fa;">₹' + item.amount + '</strong>';
      html += '    <span class="fees-remove-charge" data-id="' + escapeAttr(item.id) + '" style="cursor:pointer; font-size:18px; color:#f87171; font-weight:bold;">&times;</span>';
      html += '  </div>';
      html += '</div>';
    });

    if (charges.length === 0) {
      html = '<span style="color:var(--text-secondary); font-size:12px;">No extra charges added.</span>';
    }

    container.innerHTML = html;

    container.querySelectorAll('.fees-remove-charge').forEach(function(el) {
      el.addEventListener('click', function() {
        if (sessionStorage.getItem("isImpersonating") === "true") {
          SchoolApp.showToast("View-only mode. Edits blocked during impersonation.", "warning");
          return;
        }
        var id = this.getAttribute('data-id');
        settings.extraCharges = (settings.extraCharges || []).filter(function(x) { return x.id !== id; });
        renderFeesCharges();
      });
    });
  }

  function attachSettingsClassesEvents() {
    var container = document.getElementById('settings-classes-container');
    if (!container) return;

    var settings = SchoolApp.store.settings;

    container.querySelectorAll('.settings-remove-section').forEach(function(el) {
      el.addEventListener('click', async function() {
        if (sessionStorage.getItem("isImpersonating") === "true") {
          SchoolApp.showToast("View-only mode. Edits blocked during impersonation.", "warning");
          return;
        }
        var c = this.getAttribute('data-class');
        var sec = this.getAttribute('data-section');
        
        SchoolApp.createRestorePoint('Backup before removing section ' + sec + ' from class ' + c);
        if (typeof settings.sections === 'object') {
          settings.sections[c] = (settings.sections[c] || []).filter(function(s) { return s !== sec; });
        }
        
        SchoolApp.showLoader('Removing section...');
        var success = await SchoolApp.save(true);
        SchoolApp.hideLoader();
        
        if (success) {
          renderSettingsClasses();
          SchoolApp.showToast('Section removed.', 'info');
        }
      });
    });

    container.querySelectorAll('.settings-add-section').forEach(function(el) {
      el.addEventListener('click', async function() {
        if (sessionStorage.getItem("isImpersonating") === "true") {
          SchoolApp.showToast("View-only mode. Edits blocked during impersonation.", "warning");
          return;
        }
        var c = this.getAttribute('data-class');
        var sec = prompt("Enter section name (e.g. A, B, C):");
        if (sec) {
          sec = sec.trim().toUpperCase();
          if (typeof settings.sections !== 'object' || Array.isArray(settings.sections)) {
            settings.sections = {};
          }
          if (!settings.sections[c]) settings.sections[c] = [];
          if (settings.sections[c].indexOf(sec) !== -1) {
            SchoolApp.showToast('Section already exists.', 'error');
            return;
          }
          SchoolApp.createRestorePoint('Backup before adding section ' + sec + ' to class ' + c);
          settings.sections[c].push(sec);
          
          SchoolApp.showLoader('Adding section...');
          var success = await SchoolApp.save(true);
          SchoolApp.hideLoader();
          
          if (success) {
            renderSettingsClasses();
            SchoolApp.showToast('Section added.', 'success');
          }
        }
      });
    });

    container.querySelectorAll('.settings-delete-class').forEach(function(el) {
      el.addEventListener('click', async function() {
        if (sessionStorage.getItem("isImpersonating") === "true") {
          SchoolApp.showToast("View-only mode. Edits blocked during impersonation.", "warning");
          return;
        }
        var c = this.getAttribute('data-class');
        
        var students = SchoolApp.store.students || [];
        var studentsInClass = students.filter(function(s) { return s.class === c; });
        if (studentsInClass.length > 0) {
          alert("Cannot delete — students exist in this class. Move them first.");
          SchoolApp.showToast("Cannot delete: students exist in class " + c, "error");
          return;
        }

        SchoolApp.createRestorePoint('Backup before deleting class ' + c);
        settings.classes = (settings.classes || []).filter(function(cls) { return cls !== c; });
        if (typeof settings.sections === 'object') {
          delete settings.sections[c];
        }
        if (settings.feeStructure) {
          delete settings.feeStructure[c];
        }
        
        SchoolApp.showLoader('Deleting class...');
        var success = await SchoolApp.save(true);
        SchoolApp.hideLoader();
        
        if (success) {
          renderSettingsClasses();
          SchoolApp.showToast('Class deleted.', 'info');
        }
      });
    });
  }

  function attachSettingsSubjectsEvents() {
    var container = document.getElementById('settings-subjects-container');
    if (!container) return;

    var settings = SchoolApp.store.settings;

    container.querySelectorAll('.settings-edit-subject').forEach(function(el) {
      el.addEventListener('click', async function() {
        if (sessionStorage.getItem("isImpersonating") === "true") {
          SchoolApp.showToast("View-only mode. Edits blocked during impersonation.", "warning");
          return;
        }
        var oldSub = this.getAttribute('data-subject');
        var newSub = prompt("Edit subject name:", oldSub);
        if (newSub && newSub.trim() && newSub.trim() !== oldSub) {
          newSub = newSub.trim();
          var idx = (settings.subjects || []).indexOf(oldSub);
          if (idx !== -1) {
            settings.subjects[idx] = newSub;
            SchoolApp.createRestorePoint('Backup before editing subject ' + oldSub);
            
            SchoolApp.showLoader('Updating subject...');
            var success = await SchoolApp.save(true);
            SchoolApp.hideLoader();
            
            if (success) {
              renderSettingsSubjects();
              SchoolApp.showToast('Subject updated successfully.', 'success');
            }
          }
        }
      });
    });

    container.querySelectorAll('.settings-delete-subject').forEach(function(el) {
      el.addEventListener('click', function() {
        if (sessionStorage.getItem("isImpersonating") === "true") {
          SchoolApp.showToast("View-only mode. Edits blocked during impersonation.", "warning");
          return;
        }
        var sub = this.getAttribute('data-subject');
        
        var isMapped = false;
        var mapping = SchoolApp.store.subjectMapping || {};
        Object.values(mapping).forEach(function(list) {
          if (Array.isArray(list)) {
            list.forEach(function(item) {
              if (item && (item.id === sub || item.name === sub)) {
                isMapped = true;
              }
            });
          }
        });

        var doDelete = async function() {
          SchoolApp.createRestorePoint('Backup before deleting subject ' + sub);
          settings.subjects = (settings.subjects || []).filter(function(s) { return s !== sub; });
          
          SchoolApp.showLoader('Deleting subject...');
          var success = await SchoolApp.save(true);
          SchoolApp.hideLoader();
          
          if (success) {
            renderSettingsSubjects();
            SchoolApp.showToast('Subject deleted.', 'info');
          }
        };

        if (isMapped) {
          SchoolApp.showConfirm('Warning: This subject is currently mapped to examinations. Deleting it may cause inconsistency in existing exam marks. Are you sure you want to delete this subject?', doDelete);
        } else {
          doDelete();
        }
      });
    });
  }

  function render() {
    var container = document.getElementById('page-admin');
    if (!container) return;

    if (!SchoolApp.isAdmin()) {
      container.innerHTML = '<div class="empty-state"><span class="material-icons-round">lock</span><h3>Access Denied</h3><p>Only administrators can access the admin panel.</p></div>';
      return;
    }

    try {
      var html = '';

      // Page Header
      html += '<div class="page-header"><h2><span class="material-icons-round">admin_panel_settings</span> Admin Panel</h2></div>';
      html += '<div class="admin-panel-container">';
 
      // Left Column: Vertical Inner Sidebar Navigation
      html += '  <aside class="admin-sidebar">';
      html += '    <button class="tab-btn' + (state.activeTab === 'settings' ? ' active' : '') + '" data-tab="settings"><span class="material-icons-round">settings</span> School Settings</button>';
      html += '    <button class="tab-btn' + (state.activeTab === 'users' ? ' active' : '') + '" data-tab="users"><span class="material-icons-round">manage_accounts</span> User Management</button>';
      html += '    <button class="tab-btn' + (state.activeTab === 'fees' ? ' active' : '') + '" data-tab="fees"><span class="material-icons-round">payments</span> Fee Setup</button>';
      html += '    <button class="tab-btn' + (state.activeTab === 'notices' ? ' active' : '') + '" data-tab="notices"><span class="material-icons-round">campaign</span> Notice Board</button>';
      html += '    <button class="tab-btn' + (state.activeTab === 'promotion' ? ' active' : '') + '" data-tab="promotion"><span class="material-icons-round">upgrade</span> Student Promotion</button>';
      html += '    <button class="tab-btn' + (state.activeTab === 'data' ? ' active' : '') + '" data-tab="data"><span class="material-icons-round">storage</span> Data Management</button>';
      html += '    <button class="tab-btn' + (state.activeTab === 'recovery' ? ' active' : '') + '" data-tab="recovery"><span class="material-icons-round">delete_sweep</span> Recycle Bin</button>';
      html += '    <button class="tab-btn' + (state.activeTab === 'system' ? ' active' : '') + '" data-tab="system"><span class="material-icons-round">info</span> System Info</button>';
      html += '    <button class="tab-btn' + (state.activeTab === 'reportCard' ? ' active' : '') + '" data-tab="reportCard"><span class="material-icons-round">style</span> Report Card Designer</button>';
      html += '  </aside>';

      // Right Column: Active Tab Content Area
      html += '  <main class="admin-content">';
      html += renderSettingsTab();
      html += renderUsersTab();
      html += renderFeesTab();
      html += renderNoticesTab();
      html += renderPromotionTab();
      html += renderDataTab();
      html += renderRecoveryTab();
      html += renderSystemTab();
      html += renderReportCardTab();
      html += '  </main>';
 
      html += '</div>'; // End Two-Column Layout Container
 
      container.innerHTML = html;
      if (state.activeTab === 'transactions') {
        renderTransactionsTable();
      }
      if (state.activeTab === 'settings') {
        renderSettingsClasses();
        renderSettingsSubjects();
      }
      if (state.activeTab === 'fees') {
        renderFeesMatrix();
        renderFeesCharges();
      }
      attachEvents();
      if (typeof SchoolApp.updateDirtyIndicator === 'function') {
        SchoolApp.updateDirtyIndicator();
      }
    } catch (error) {
      console.error("Crash in renderAdminPanel:", error);
      container.innerHTML = '<div class="empty-state" style="padding: 40px; border: 1px dashed rgba(248, 113, 113, 0.4); background: rgba(248, 113, 113, 0.05); border-radius: 12px; margin: 20px;">' +
        '<span class="material-icons-round" style="color: #f87171; font-size: 48px;">warning</span>' +
        '<h3 style="color: #f87171; margin-top: 12px;">Admin Panel Render Error</h3>' +
        '<p style="color: var(--text-secondary); max-width: 500px; margin: 8px auto 16px auto; font-size: 14px;">An unexpected error occurred while loading the admin panel settings. Please refresh or contact support.</p>' +
        '<div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; font-family: monospace; font-size: 12px; text-align: left; max-width: 600px; margin: 0 auto; color: #f87171; overflow-x: auto;">' +
        'Error: ' + error.message + '\n' + error.stack +
        '</div></div>';
    }
  }

  var DEFAULT_TEMPLATES = window.DEFAULT_TEMPLATES || {
    excellent:
      'Excellent academic performance. ' +
      '{name} has demonstrated strong ' +
      'understanding and consistent effort. ' +
      'Keep up the good work.',

    good:
      '{name} has demonstrated very good ' +
      'academic performance. Consistent ' +
      'effort should be continued.',

    pass_low:
      '{name} has successfully passed all ' +
      'mandatory subjects but needs to ' +
      'improve overall performance. ' +
      'Greater consistency and regular ' +
      'revision are recommended.',

    fail_slightly:
      '{name} is close to the required ' +
      'level in {subjects}. With consistent ' +
      'practice and better preparation, ' +
      'improvement is expected.',

    fail_significant:
      '{subjects} require significant ' +
      'improvement. {name} should focus ' +
      'on strengthening fundamental concepts ' +
      'and practice regularly.',

    fail_multiple:
      '{name} has shown satisfactory ' +
      'performance in several subjects but ' +
      'needs additional attention in ' +
      '{subjects}. Regular revision and ' +
      'consistent practice are recommended.',

    absent_mandatory:
      '{name} was absent for the {subjects} ' +
      'examination. Regular attendance and ' +
      'participation in assessments ' +
      'are recommended.',

    fail_result:
      '{name} needs to improve performance ' +
      'in {subjects}. Regular practice and ' +
      'focused preparation are recommended.'
  };

  var TEMPLATE_LABELS = [
    { key: 'excellent', label: 'Excellent Performance (>= 75%)' },
    { key: 'good', label: 'Good Performance (50% - 74%)' },
    { key: 'pass_low', label: 'Passed but Low Marks (< 50%)' },
    { key: 'fail_slightly', label: 'Slightly Below Passing (Pass Gap <= 10%)' },
    { key: 'fail_significant', label: 'Significant Failures (Pass Gap > 10%)' },
    { key: 'fail_multiple', label: 'Multiple Subject Failures' },
    { key: 'absent_mandatory', label: 'Absent in Mandatory Exam' },
    { key: 'fail_result', label: 'General Failure Result' }
  ];


  function getDefaultReportCardConfig() {
    var defs = window.DEFAULT_TEMPLATES || DEFAULT_TEMPLATES;
    return {
      school: {
        logo: true,
        name: true,
        tagline: true,
        address: true,
        phone: true,
        email: true,
        website: false,
        udiseCode: false,
        session: true,
        affiliationNo: false
      },
      student: {
        name: true,
        rollNumber: true,
        class: true,
        section: false,
        admissionNumber: false,
        address: false,
        parentName: true,
        fatherName: false,
        motherName: false,
        dob: false,
        gender: false,
        photo: false,
        admissionDate: false
      },
      academic: {
        grandTotal: true,
        totalObtained: true,
        percentage: true,
        grade: true,
        result: true,
        rank: true,
        attendance: false,
        remarks: true,
        smartRemarks: false,
        promotionStatus: true,
        division: true
      },
      design: {
        primaryColor: '#1E40AF',
        showBorder: true,
        headerStyle: 'centered'
      },
      remarkTemplates: Object.assign({}, defs)
    };
  }

  function getReportCardConfig() {
    if (!SchoolApp.store.reportCardConfig) {
      SchoolApp.store.reportCardConfig = getDefaultReportCardConfig();
    }
    return SchoolApp.store.reportCardConfig;
  }

  function saveReportCardConfig() {
    try {
      var cfg = extractReportCardConfigFromForm();
      SchoolApp.store.reportCardConfig = cfg;
      SchoolApp.save(true);
      SchoolApp.showToast('✅ Report Card Configuration saved!', 'success');
    } catch(e) {
      console.error('Error saving report card config:', e);
      SchoolApp.showToast('❌ Failed to save configuration', 'error');
    }
  }

  function resetReportCardConfig() {
    if (!confirm('Reset Report Card Designer configuration to defaults?')) return;
    SchoolApp.store.reportCardConfig = getDefaultReportCardConfig();
    SchoolApp.save(true);
    SchoolApp.showToast('Configuration reset to defaults.', 'info');
    if (typeof window.renderAdminModule === 'function') {
      window.renderAdminModule();
    } else {
      render();
    }
  }

  function extractReportCardConfigFromForm() {
    var cfg = getDefaultReportCardConfig();
    var form = document.getElementById('rc-designer-form');
    if (!form) return getReportCardConfig();

    var checkboxes = form.querySelectorAll('input[type="checkbox"][data-section]');
    checkboxes.forEach(function(cb) {
      var sec = cb.getAttribute('data-section');
      var key = cb.getAttribute('data-key');
      if (sec && key && cfg[sec]) {
        cfg[sec][key] = cb.checked;
      }
    });

    var colorInput = document.getElementById('rc-primary-color');
    if (colorInput) {
      cfg.design.primaryColor = colorInput.value || '#1E40AF';
    }

    var borderCb = document.getElementById('rc-show-border');
    if (borderCb) {
      cfg.design.showBorder = borderCb.checked;
    }

    var defs = window.DEFAULT_TEMPLATES || DEFAULT_TEMPLATES;
    var templates = {};
    Object.keys(defs).forEach(function(key) {
      var field = document.getElementById('tpl-' + key);
      if (field) {
        templates[key] = field.value.trim() || defs[key];
      } else if (cfg.remarkTemplates && cfg.remarkTemplates[key]) {
        templates[key] = cfg.remarkTemplates[key];
      } else {
        templates[key] = defs[key];
      }
    });
    cfg.remarkTemplates = templates;

    return cfg;
  }

  window.resetRemarkTemplates = function() {
    var defs = window.DEFAULT_TEMPLATES || DEFAULT_TEMPLATES;
    Object.keys(defs).forEach(function(key) {
      var field = document.getElementById('tpl-' + key);
      if (field) {
        field.value = defs[key];
      }
    });
    if (typeof window.updateReportCardLivePreview === 'function') {
      window.updateReportCardLivePreview();
    }
  };

  var maxPreviewRetries = 10;
  var previewRetryCount = 0;

  window.updateReportCardLivePreview = function() {
    var previewContainer = document.getElementById('report-card-live-preview-container') || document.getElementById('rc-live-preview');
    if (!previewContainer) return;

    // Check if generator function is ready
    var generatorFn = window.generateSingleStudentCardHTML || (typeof generateSingleStudentCardHTML === 'function' ? generateSingleStudentCardHTML : null);

    if (typeof generatorFn !== 'function') {
      previewRetryCount++;
      if (previewRetryCount < maxPreviewRetries) {
        previewContainer.innerHTML = '<p style="color:#6B7280; text-align:center; padding:20px;">Loading preview...</p>';
        setTimeout(function() {
          if (typeof window.updateReportCardLivePreview === 'function') {
            window.updateReportCardLivePreview();
          }
        }, 500);
      } else {
        previewContainer.innerHTML = '<p style="color:#EF4444; padding:20px; text-align:center;">Preview unavailable. Please refresh page.</p>';
      }
      return;
    }
    previewRetryCount = 0;

    var cfg = extractReportCardConfigFromForm();
    if (SchoolApp && SchoolApp.store) {
      SchoolApp.store.reportCardConfig = cfg;
    }

    var sampleStudent = {
      id: 'sample',
      name: 'Sample Student',
      firstName: 'Sample',
      lastName: 'Student',
      rollNumber: '01',
      class: 'Class 5',
      section: 'A',
      fatherName: 'Parent Name',
      motherName: 'Mother Name',
      parentName: 'Parent Name',
      guardianName: 'Parent Name',
      dob: '2015-01-15',
      dateOfBirth: '2015-01-15',
      gender: 'Male',
      admissionNumber: 'ADM001',
      admissionNo: 'ADM001',
      address: 'Sample Address'
    };

    var sampleSubjects = [
      { id: 's1', name: 'Hindi', fullMarks: 100, passMarks: 33, isOptional: false },
      { id: 's2', name: 'English', fullMarks: 100, passMarks: 33, isOptional: false },
      { id: 's3', name: 'Mathematics', fullMarks: 100, passMarks: 33, isOptional: false },
      { id: 's4', name: 'Drawing', fullMarks: 50, passMarks: 17, isOptional: true }
    ];

    var sampleMarks = {
      marks: {
        's1': { obtained: 85, isAbsent: false },
        's2': { obtained: 90, isAbsent: false },
        's3': { obtained: 78, isAbsent: false },
        's4': { obtained: 42, isAbsent: false }
      },
      's1': { obtained: 85, isAbsent: false },
      's2': { obtained: 90, isAbsent: false },
      's3': { obtained: 78, isAbsent: false },
      's4': { obtained: 42, isAbsent: false },
      rank: 1,
      result: 'Pass'
    };

    try {
      var html = generatorFn(
        sampleStudent,
        false,
        sampleMarks,
        null,
        null,
        '2025-26',
        { name: 'Term 1 (Half-Yearly)' },
        sampleSubjects
      );

      previewContainer.innerHTML = '<div style="transform:scale(0.5); transform-origin:top left; width:200%; height:auto;">' + html + '</div>';
    } catch(err) {
      previewContainer.innerHTML = '<p style="color:red; padding:20px;">Preview error: ' + err.message + '</p>';
      console.error('Preview error:', err);
    }
  };

  window.saveReportCardConfig = saveReportCardConfig;
  window.resetReportCardConfig = resetReportCardConfig;
  window.renderReportCardDesigner = function() {
    renderReportCardTab();
  };

  function renderReportCardTab() {
    var cfg = getReportCardConfig();
    var displayStyle = (state.activeTab === 'reportCard' ? 'display:flex;' : 'display:none;');
    var html = '<div class="tab-content' + (state.activeTab === 'reportCard' ? ' active' : '') + '" id="tab-reportCard" style="' + displayStyle + ' flex-direction:column; gap:20px;">';

    html += '<div class="rc-header-bar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">';
    html += '  <div>';
    html += '    <h3 style="margin:0; font-size:18px; color:var(--text-primary);"><span class="material-icons-round" style="vertical-align:middle; margin-right:6px; color:#1E40AF;">badge</span> Report Card Designer</h3>';
    html += '    <p style="margin:4px 0 0 0; font-size:13px; color:var(--text-secondary);">Customize school header, student info, academic fields, and colors for report card prints.</p>';
    html += '  </div>';
    html += '  <div class="rc-action-buttons" style="display:flex; gap:10px;">';
    html += '    <button type="button" class="btn btn-secondary btn-sm" onclick="window.resetReportCardConfig()"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;">restart_alt</span> Reset Defaults</button>';
    html += '    <button type="button" class="btn btn-primary btn-sm" id="save-rc-config-btn" onclick="window.saveReportCardConfig()"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;">save</span> Save Configuration</button>';
    html += '  </div>';
    html += '</div>';

    // 2-Column Layout: Left Controls (Form), Right Live Preview
    html += '<form id="rc-designer-form" class="rc-designer-layout" onchange="window.updateReportCardLivePreview()" oninput="window.updateReportCardLivePreview()" style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; align-items:start;">';

    // Left Column: Configuration Controls
    html += '  <div class="rc-config-panel" style="display:flex; flex-direction:column; gap:16px;">';

    // Section A: School Information
    html += '    <div class="card" style="border: 1px solid var(--border-color); border-radius:10px;">';
    html += '      <div class="card-header" style="background:var(--bg-glass); border-bottom:1px solid var(--border-color); padding:12px 16px;">';
    html += '        <h4 style="margin:0; font-size:14px; font-weight:700;"><span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">school</span> SECTION A: School Information</h4>';
    html += '      </div>';
    html += '      <div class="card-body rc-section-grid rc-checkbox-grid" style="padding:14px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">';
    
    var schoolFields = [
      { key: 'logo', label: 'School Logo' },
      { key: 'name', label: 'School Name' },
      { key: 'tagline', label: 'School Tagline' },
      { key: 'address', label: 'Address' },
      { key: 'phone', label: 'Phone Number' },
      { key: 'email', label: 'Email Address' },
      { key: 'website', label: 'School Website' },
      { key: 'udiseCode', label: 'UDISE Code' },
      { key: 'session', label: 'Academic Session' },
      { key: 'affiliationNo', label: 'Affiliation Number' }
    ];

    schoolFields.forEach(function(f) {
      var isChecked = cfg.school[f.key] !== false;
      html += '        <label class="rc-section" style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; cursor:pointer;">';
      html += '          <input type="checkbox" data-section="school" data-key="' + f.key + '" ' + (isChecked ? 'checked' : '') + ' style="width:16px; height:16px; accent-color:#1E40AF;"> ' + f.label;
      html += '        </label>';
    });

    html += '      </div>';
    html += '    </div>';

    // Section B: Student Information
    html += '    <div class="card" style="border: 1px solid var(--border-color); border-radius:10px;">';
    html += '      <div class="card-header" style="background:var(--bg-glass); border-bottom:1px solid var(--border-color); padding:12px 16px;">';
    html += '        <h4 style="margin:0; font-size:14px; font-weight:700;"><span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">person</span> SECTION B: Student Information</h4>';
    html += '      </div>';
    html += '      <div class="card-body rc-section-grid rc-checkbox-grid" style="padding:14px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">';

    var studentFields = [
      { key: 'name', label: 'Student Name' },
      { key: 'rollNumber', label: 'Roll Number' },
      { key: 'class', label: 'Class' },
      { key: 'section', label: 'Section' },
      { key: 'admissionNumber', label: 'Admission Number' },
      { key: 'address', label: 'Student Address' },
      { key: 'parentName', label: 'Parent/Guardian Name' },
      { key: 'fatherName', label: 'Father Name' },
      { key: 'motherName', label: 'Mother Name' },
      { key: 'dob', label: 'Date of Birth' },
      { key: 'gender', label: 'Gender' },
      { key: 'photo', label: 'Student Photo' },
      { key: 'admissionDate', label: 'Admission Date' }
    ];

    studentFields.forEach(function(f) {
      var isChecked = cfg.student[f.key] !== false;
      html += '        <label class="rc-section" style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; cursor:pointer;">';
      html += '          <input type="checkbox" data-section="student" data-key="' + f.key + '" ' + (isChecked ? 'checked' : '') + ' style="width:16px; height:16px; accent-color:#1E40AF;"> ' + f.label;
      html += '        </label>';
    });

    html += '      </div>';
    html += '    </div>';

    // Section C: Academic Information
    html += '    <div class="card" style="border: 1px solid var(--border-color); border-radius:10px;">';
    html += '      <div class="card-header" style="background:var(--bg-glass); border-bottom:1px solid var(--border-color); padding:12px 16px;">';
    html += '        <h4 style="margin:0; font-size:14px; font-weight:700;"><span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">analytics</span> SECTION C: Academic Information</h4>';
    html += '      </div>';
    html += '      <div class="card-body rc-section-grid rc-checkbox-grid" style="padding:14px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">';

    var academicFields = [
      { key: 'grandTotal', label: 'Grand Total' },
      { key: 'totalObtained', label: 'Total Obtained Marks' },
      { key: 'percentage', label: 'Overall Percentage' },
      { key: 'grade', label: 'Academic Grade' },
      { key: 'result', label: 'Academic Result (Pass/Fail)' },
      { key: 'rank', label: 'Class Rank' },
      { key: 'attendance', label: 'Attendance %' },
      { key: 'remarks', label: 'Teacher Remarks' },
      { key: 'promotionStatus', label: 'Promotion Status' },
      { key: 'division', label: 'Division' }
    ];

    academicFields.forEach(function(f) {
      var isChecked = cfg.academic[f.key] !== false;
      html += '        <label class="rc-section" style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; cursor:pointer;">';
      html += '          <input type="checkbox" data-section="academic" data-key="' + f.key + '" ' + (isChecked ? 'checked' : '') + ' style="width:16px; height:16px; accent-color:#1E40AF;"> ' + f.label;
      html += '        </label>';
    });

    html += '      </div>';
    html += '    </div>';

    // Section D: Design Settings
    html += '    <div class="card" style="border: 1px solid var(--border-color); border-radius:10px;">';
    html += '      <div class="card-header" style="background:var(--bg-glass); border-bottom:1px solid var(--border-color); padding:12px 16px;">';
    html += '        <h4 style="margin:0; font-size:14px; font-weight:700;"><span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">palette</span> SECTION D: Design Settings</h4>';
    html += '      </div>';
    html += '      <div class="card-body rc-design-settings" style="padding:14px; display:flex; flex-direction:column; gap:12px;">';
    
    html += '        <div style="display:flex; align-items:center; gap:12px;">';
    html += '          <label style="font-size:13px; font-weight:600;">Primary Branding Color:</label>';
    html += '          <input type="color" id="rc-primary-color" value="' + (cfg.design.primaryColor || '#1E40AF') + '" style="width:40px; height:32px; border:1px solid var(--border-color); border-radius:6px; cursor:pointer; padding:2px;">';
    html += '          <span style="font-family:monospace; font-size:13px;">' + (cfg.design.primaryColor || '#1E40AF') + '</span>';
    html += '        </div>';

    html += '        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; cursor:pointer;">';
    html += '          <input type="checkbox" id="rc-show-border" ' + (cfg.design.showBorder !== false ? 'checked' : '') + ' style="width:16px; height:16px; accent-color:#1E40AF;"> Show Outer Border on Report Card';
    html += '        </label>';

    html += '      </div>';
    html += '    </div>';

    // SECTION E: Smart Teacher Remarks
    var smartRemarksChecked = cfg.academic && cfg.academic.smartRemarks === true;
    var savedTemplates = cfg.remarkTemplates || {};
    var defs = window.DEFAULT_TEMPLATES || DEFAULT_TEMPLATES;
    var currentTemplates = Object.assign({}, defs, savedTemplates);

    html += '    <div class="card" style="border: 1px solid var(--border-color); border-radius:10px;">';
    html += '      <div class="card-header" style="background:var(--bg-glass); border-bottom:1px solid var(--border-color); padding:12px 16px;">';
    html += '        <h4 style="margin:0; font-size:14px; font-weight:700;"><span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">auto_fix_high</span> SECTION E: Smart Teacher Remarks</h4>';
    html += '      </div>';
    html += '      <div class="card-body" style="padding:14px; display:flex; flex-direction:column; gap:12px;">';

    html += '        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; cursor:pointer;">';
    html += '          <input type="checkbox" id="rc-smart-remarks" data-section="academic" data-key="smartRemarks" ' + (smartRemarksChecked ? 'checked' : '') + ' style="width:16px; height:16px; accent-color:#1E40AF;" onchange="var box = document.getElementById(\'smart-remarks-templates\'); if(box) box.style.display = this.checked ? \'block\' : \'none\';">';
    html += '          <span>Auto-generate personalized remark based on performance</span>';
    html += '        </label>';

    html += '        <div id="smart-remarks-templates" style="margin-top:12px; display:' + (smartRemarksChecked ? 'block' : 'none') + ';">';
    html += '          <h4 style="margin:0 0 4px 0; font-size:13px; font-weight:700;">Remark Templates</h4>';
    html += '          <p style="font-size:12px; color:#6B7280; margin-bottom:12px;">Customize templates. Use {subjects} for subject names, {name} for student name.</p>';

    TEMPLATE_LABELS.forEach(function(t) {
      var val = currentTemplates[t.key] || defs[t.key] || '';
      html += '          <div class="rc-template-field" style="margin-bottom:12px;">';
      html += '            <label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px;">' + t.label + '</label>';
      html += '            <textarea id="tpl-' + t.key + '" rows="2" style="width:100%; font-size:12px; padding:8px; border:1px solid #E5E7EB; border-radius:6px; resize:vertical;">' + escapeHTML(val) + '</textarea>';
      html += '          </div>';
    });

    html += '          <button type="button" class="btn btn-secondary btn-sm" id="reset-templates-btn" onclick="window.resetRemarkTemplates()"><span class="material-icons-round" style="font-size:14px; vertical-align:middle;">restart_alt</span> Reset to Defaults</button>';
    html += '        </div>';

    html += '      </div>';
    html += '    </div>';

    html += '  </div>'; // End Left Column

    // Right Column: Live Preview Panel
    html += '  <div class="card rc-preview-panel" style="border: 1px solid var(--border-color); border-radius:10px; position:sticky; top:20px;">';
    html += '    <div class="card-header" style="background:var(--bg-glass); border-bottom:1px solid var(--border-color); padding:12px 16px; display:flex; justify-content:space-between; align-items:center;">';
    html += '      <h4 style="margin:0; font-size:14px; font-weight:700;"><span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">preview</span> Live Preview (Mini A4)</h4>';
    html += '      <span style="font-size:11px; font-weight:600; color:var(--text-secondary); background:rgba(30,64,175,0.1); padding:2px 8px; border-radius:12px;">Sample Student Data</span>';
    html += '    </div>';
    html += '    <div class="card-body" style="padding:14px; overflow:hidden; min-height:500px; background:#f8fafc;">';
    html += '      <div id="rc-live-preview"><div id="report-card-live-preview-container"></div></div>';
    html += '    </div>';
    html += '  </div>'; // End Right Column

    html += '</form>'; // End Form

    html += '</div>';

    // Trigger initial preview build after DOM paint
    setTimeout(function() {
      if (typeof window.updateReportCardLivePreview === 'function') {
        window.updateReportCardLivePreview();
      }
    }, 100);

    return html;
  }


  function renderSettingsTab() {
    var s = SchoolApp.store.settings || {};
    var displayStyle = (state.activeTab === 'settings' ? 'display:flex;' : 'display:none;');
    var html = '<div class="tab-content' + (state.activeTab === 'settings' ? ' active' : '') + '" id="tab-settings" style="' + displayStyle + ' flex-direction:column; gap:20px;">';
    
    html += '<form id="settings-form" style="display:flex; flex-direction:column; gap:20px;">';

    var tagline = s.tagline || (s.schoolInfo && s.schoolInfo.tagline) || '';
    var affiliation = s.affiliation || (s.schoolInfo && s.schoolInfo.affiliation) || '';
    var udiseCode = s.udiseCode || (s.schoolInfo && s.schoolInfo.udiseCode) || '';
    var phone = s.phone || (s.schoolInfo && s.schoolInfo.phone) || '';
    var email = s.email || (s.schoolInfo && s.schoolInfo.email) || '';
    var address = s.address || (s.schoolInfo && s.schoolInfo.address) || '';

    // Card 1: Basic Information
    html += '  <div class="card">';
    html += '    <div class="card-header"><h3><span class="material-icons-round">info</span> Basic Information</h3></div>';
    html += '    <div class="card-body">';
    html += '      <div class="admin-form-grid">';
    html += '        <div class="form-group"><label class="form-label">School Name</label><input type="text" class="form-input" name="schoolName" value="' + escapeAttr(s.schoolName || '') + '"></div>';
    html += '        <div class="form-group"><label class="form-label">Tagline</label><input type="text" class="form-input" name="tagline" value="' + escapeAttr(tagline) + '"></div>';
    html += '        <div class="form-group"><label class="form-label">Affiliation / Board</label><input type="text" class="form-input" name="affiliation" value="' + escapeAttr(affiliation) + '"></div>';
    html += '        <div class="form-group"><label class="form-label">UDISE Code (11 digits)</label><input type="text" class="form-input" name="udiseCode" value="' + escapeAttr(udiseCode) + '" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,\'\')"></div>';
    html += '        <div class="form-group"><label class="form-label">Academic Year</label><input type="text" class="form-input" name="academicYear" value="' + escapeAttr(s.academicYear || '') + '"></div>';
    html += '        <div class="form-group"><label class="form-label">Theme</label><select class="form-select" name="theme"><option value="dark"' + (s.theme === 'dark' ? ' selected' : '') + '>Dark</option><option value="light"' + (s.theme === 'light' ? ' selected' : '') + '>Light</option></select></div>';
    
        var logoSrc = s.schoolLogo || s.logoUrl || (s.schoolInfo && (s.schoolInfo.schoolLogo || s.schoolInfo.logoUrl)) || '';
    html += '        <div class="form-group">';
    html += '          <label class="form-label">School Logo</label>';
    html += '          <input type="file" id="school-logo-input" accept="image/*" class="form-input" onchange="window.handleLogoSelect(this)" />';
    html += '          <div id="logo-status-container" style="margin-top:6px; font-size:13px; font-weight:600;"></div>';
    html += '          <div id="logo-preview" style="margin-top:8px;">';
    if (logoSrc) {
      html += '            <img src="' + logoSrc + '" style="max-height:80px;border-radius:8px;border:1px solid #E5E7EB;padding:4px;background:var(--bg-secondary);object-fit:contain;">';
      html += '            <div style="display:flex;gap:8px;margin-top:8px;">';
      html += '              <button type="button" class="btn btn-secondary btn-xs" onclick="window.changeLogo()"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;">edit</span> Change Logo</button>';
      html += '              <button type="button" class="btn btn-danger btn-xs" onclick="window.removeLogo()"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;">delete</span> Remove Logo</button>';
      html += '            </div>';
    } else {
      html += '            <span class="text-muted" style="font-size:12px;">No logo uploaded</span>';
    }
    html += '          </div>';
    html += '        </div>';

    html += '      </div>';
    html += '    </div>';
    html += '  </div>';

    var website = s.website || (s.schoolInfo && s.schoolInfo.website) || '';
    var upiId = s.upiId || (s.schoolInfo && s.schoolInfo.upiId) || '';
    // Card 2: Contact Details
    html += '  <div class="card">';
    html += '    <div class="card-header"><h3><span class="material-icons-round">contact_mail</span> Contact Details</h3></div>';
    html += '    <div class="card-body">';
    html += '      <div class="admin-form-grid">';
    html += '        <div class="form-group"><label class="form-label">Phone</label><input type="text" class="form-input" name="phone" value="' + escapeAttr(phone) + '"></div>';
    html += '        <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" name="email" value="' + escapeAttr(email) + '"></div>';
    html += '        <div class="form-group"><label class="form-label">School Website</label><input type="url" class="form-input" name="website" id="school-website" placeholder="https://yourschool.com" value="' + escapeAttr(website) + '"></div>';
    html += '        <div class="form-group"><label class="form-label">Payment UPI ID <span style="color:#9CA3AF; font-weight:400; font-size:12px;">(Optional)</span></label><input type="text" class="form-input" name="upiId" id="school-upi-id" placeholder="yourschool@upi" value="' + escapeAttr(upiId) + '"></div>';
    html += '        <div class="form-group full-width" style="grid-column: span 2;"><label class="form-label">Address</label><textarea class="form-textarea" name="address" rows="2">' + escapeHTML(address) + '</textarea></div>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';

    // Card 3: Attendance Settings
    html += '  <div class="card">';
    html += '    <div class="card-header"><h3><span class="material-icons-round">schedule</span> Attendance Settings</h3></div>';
    html += '    <div class="card-body">';
    html += '      <div class="admin-form-grid">';
    html += '        <div class="form-group"><label class="form-label">Default Attendance Time</label><input type="time" class="form-input" name="attendanceTime" value="' + (s.attendanceTime || '09:00') + '"></div>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';

    // Card 3.5: Examination Settings
    html += '  <div class="card">';
    html += '    <div class="card-header"><h3><span class="material-icons-round">assignment</span> Examination Settings</h3></div>';
    html += '    <div class="card-body">';
    html += '      <div class="admin-form-grid">';
    html += '        <div class="form-group"><label class="form-label">Combined Report Card Style</label>';
    html += '          <select class="form-select" name="combinedReportCardStyle">';
    html += '            <option value="separate"' + (s.combinedReportCardStyle !== 'weighted' ? ' selected' : '') + '>Show marks separately (default)</option>';
    html += '            <option value="weighted"' + (s.combinedReportCardStyle === 'weighted' ? ' selected' : '') + '>Calculate weighted result</option>';
    html += '          </select>';
    html += '        </div>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';

    // Card 4: Class & Section Config Structure
    html += '  <div class="card">';
    html += '    <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">';
    html += '      <h3><span class="material-icons-round">class</span> Classes & Sections Configuration</h3>';
    html += '      <div style="display:flex; gap:8px; align-items:center;">';
    html += '        <input type="text" id="settings-new-class-input" placeholder="e.g. Class 1" style="width:140px; padding:8px; font-size:13px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:6px; color:var(--text-primary);">';
    html += '        <button type="button" class="btn btn-primary btn-sm" id="settings-add-class-btn">Add Class</button>';
    html += '      </div>';
    html += '    </div>';
    html += '    <div class="card-body" id="settings-classes-container" style="display:flex; flex-direction:column; gap:12px;">';
    html += '    </div>';
    html += '  </div>';

    // Card 5: Subjects Configuration
    html += '  <div class="card">';
    html += '    <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">';
    html += '      <h3><span class="material-icons-round">subject</span> Subjects Configuration</h3>';
    html += '      <div style="display:flex; gap:8px; align-items:center;">';
    html += '        <input type="text" id="settings-new-subject-input" placeholder="e.g. Science" style="width:140px; padding:8px; font-size:13px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:6px; color:var(--text-primary);">';
    html += '        <button type="button" class="btn btn-primary btn-sm" id="settings-add-subject-btn">Add Subject</button>';
    html += '      </div>';
    html += '    </div>';
    html += '    <div class="card-body" id="settings-subjects-container" style="display:flex; flex-direction:column; gap:12px;">';
    html += '    </div>';
    html += '  </div>';

    // Card 6: Staff Attendance Location
    var geo = s.geofence || {};
    var geofenceLat = (geo.lat !== undefined) ? geo.lat : '';
    var geofenceLng = (geo.lng !== undefined) ? geo.lng : '';
    var geofenceRadius = (geo.radius !== undefined) ? geo.radius : 200;

    html += '  <div class="card">';
    html += '    <div class="card-header"><h3><span class="material-icons-round">pin_drop</span> Staff Attendance Location</h3></div>';
    html += '    <div class="card-body">';
    html += '      <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">Define the school\'s geographical coordinates and allowed attendance radius. Staff must be physically located within this radius to punch in/out.</p>';
    html += '      <div class="admin-form-grid">';
    html += '        <div class="form-group"><label class="form-label">Latitude *</label><input type="number" step="any" class="form-input" name="geofenceLat" id="geofence-lat" value="' + geofenceLat + '" required></div>';
    html += '        <div class="form-group"><label class="form-label">Longitude *</label><input type="number" step="any" class="form-input" name="geofenceLng" id="geofence-lng" value="' + geofenceLng + '" required></div>';
    html += '        <div class="form-group"><label class="form-label">Allowed Radius (meters) *</label><input type="number" class="form-input" name="geofenceRadius" id="geofence-radius" value="' + geofenceRadius + '" min="10" required></div>';
    html += '        <div class="form-group" style="display:flex; align-items:flex-end;"><button type="button" class="btn btn-secondary" id="settings-capture-gps-btn" style="width:100%; height:42px; display:inline-flex; align-items:center; justify-content:center; gap:8px;"><span class="material-icons-round">my_location</span> Use Current Location</button></div>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';

    html += '</form>';

    html += '<div class="flex gap-2 mt-2">';
    html += '  <button class="btn btn-primary" id="save-settings-btn"><span class="material-icons-round">save</span> Save Settings</button>';
    html += '  <button class="btn btn-secondary" id="reset-settings-btn"><span class="material-icons-round">refresh</span> Reset to Defaults</button>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  function renderUsersTab() {
    var s = SchoolApp.store.settings || {};
    var html = '<div class="tab-content' + (state.activeTab === 'users' ? ' active' : '') + '" id="tab-users">';

    // Admin Account
    html += '<div class="card mb-3 users-card"><div class="card-header users-header"><h3><span class="material-icons-round">admin_panel_settings</span> Admin Account</h3></div><div class="card-body">';
    html += '<form id="admin-creds-form" class="form-grid users-form-grid">';
    html += '<div class="form-group"><label class="form-label">Username</label><input type="text" class="form-input" name="adminUsername" value="' + (s.adminUsername || 'admin') + '"></div>';
    html += '<div class="form-group"><label class="form-label">Password</label><div class="password-wrapper"><input type="password" class="form-input" name="adminPassword" value="' + (s.adminPassword || 'admin123') + '"><i class="fa fa-eye toggle-password"></i></div></div>';
    html += '</form>';
    html += '<button class="btn btn-primary btn-sm mt-2 users-submit-btn" id="save-admin-creds"><span class="material-icons-round">save</span> Update Credentials</button>';
    html += '</div></div>';

    // Teacher Accounts
    html += '<div class="card users-card"><div class="card-header users-header"><h3><span class="material-icons-round">people</span> Teacher Accounts</h3>';
    html += '<button class="btn btn-secondary btn-sm users-bulk-btn" id="bulk-reset-passwords"><span class="material-icons-round">lock_reset</span> Reset All Passwords</button>';
    html += '</div><div class="card-body">';

    var teachers = SchoolApp.store.teachers || [];
    if (teachers.length > 0) {
      html += '<div class="table-container users-table-container"><table class="data-table users-teacher-table"><thead><tr><th>Name</th><th>Email</th><th>Subject</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
      teachers.forEach(function(t) {
        html += '<tr>';
        html += '<td data-label="Name"><strong>' + t.firstName + ' ' + t.lastName + '</strong></td>';
        html += '<td data-label="Email">' + t.email + '</td>';
        html += '<td data-label="Subject">' + t.subject + '</td>';
        html += '<td data-label="Status"><span class="badge ' + (t.status === 'Active' ? 'badge-success' : 'badge-danger') + '">' + t.status + '</span></td>';
        html += '<td data-label="Actions"><div class="table-actions users-table-actions">';
        html += '<button class="btn btn-secondary btn-sm reset-pw-btn" data-id="' + t.id + '" title="Reset Password"><span class="material-icons-round">lock_reset</span></button>';
        html += '<button class="btn btn-sm toggle-status-btn ' + (t.status === 'Active' ? 'btn-danger' : 'btn-success') + '" data-id="' + t.id + '" title="' + (t.status === 'Active' ? 'Deactivate' : 'Activate') + '"><span class="material-icons-round">' + (t.status === 'Active' ? 'block' : 'check_circle') + '</span></button>';
        html += '<button class="btn btn-secondary btn-sm check-exam-access-btn" data-id="' + t.id + '" title="Check Exam Access"><span class="material-icons-round">rule</span></button>';
        html += '</div></td></tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state"><span class="material-icons-round">person_off</span><h3>No Teachers</h3><p>Add teachers to manage their accounts.</p></div>';
    }

    html += '</div></div></div>';
    return html;
  }

  function renderFeesTab() {
    var settings = SchoolApp.store.settings || {};
    var displayStyle = (state.activeTab === 'fees' ? 'display:flex;' : 'display:none;');
    var html = '<div class="tab-content' + (state.activeTab === 'fees' ? ' active' : '') + '" id="tab-fees" style="' + displayStyle + ' flex-direction:column; gap:20px;">';

    // Card 1: Customizable Fee Heads
    html += '<div class="card fee-setup-card"><div class="card-header fee-setup-header"><h3><span class="material-icons-round">category</span> Customizable Fee Heads</h3>';
    html += '<button class="btn btn-primary btn-sm" id="admin-add-feehead-btn"><span class="material-icons-round">add</span> Add Fee Head</button>';
    html += '</div><div class="card-body">';

    var feeHeads = SchoolApp.store.feeHeads || [];
    if (feeHeads.length > 0) {
      html += '<div class="table-container fee-setup-table-container"><table class="data-table fee-setup-table"><thead><tr><th>Fee Head Name</th><th>Actions</th></tr></thead><tbody>';
      feeHeads.forEach(function(fh) {
        html += '<tr>';
        html += '<td data-label="Fee Head Name"><strong>' + fh.name + '</strong></td>';
        html += '<td data-label="Actions"><div class="table-actions">';
        html += '<button class="btn-icon admin-edit-feehead-btn" data-id="' + fh.id + '" title="Edit Name"><span class="material-icons-round">edit</span></button>';
        html += '<button class="btn-icon admin-delete-feehead-btn" data-id="' + fh.id + '" title="Delete Fee Head" style="color:var(--danger)"><span class="material-icons-round">delete</span></button>';
        html += '</div></td></tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state"><span class="material-icons-round">payments</span><h3>No Fee Heads</h3><p>Create customizable fee heads to define default fees.</p></div>';
    }
    html += '</div></div>';

    // Card 2: Fee Structure Matrix
    html += '  <div class="card fee-setup-card">';
    html += '    <div class="card-header fee-setup-header">';
    html += '      <h3><span class="material-icons-round">grid_on</span> Fee Structure Matrix</h3>';
    html += '    </div>';
    html += '    <div class="fee-setup-matrix-wrapper">';
    html += '      <div class="fee-matrix-scroll-hint" style="display:none; font-size:12px; color:var(--text-muted); padding:8px 12px; background:var(--bg-glass); border-bottom:1px solid var(--border-color); text-align:center;">← Swipe to see more →</div>';
    html += '      <div class="card-body fee-matrix-body" style="overflow-x:auto; -webkit-overflow-scrolling:touch;">';
    html += '        <table class="data-table fee-matrix-table" style="min-width:600px;">';
    html += '          <thead>';
    html += '            <tr id="setup-feehead-row"><th>Class</th><th>Tuition</th><th>Transport</th><th>Exam</th></tr>';
    html += '          </thead>';
    html += '          <tbody id="setup-fee-matrix-body">';
    html += '          </tbody>';
    html += '        </table>';
    html += '      </div>';
    html += '    </div>';
    html += '    <div class="card-footer fee-setup-actions" style="padding:16px 24px; display:flex; justify-content:flex-end; border-top:1px solid rgba(255,255,255,0.06);">';
    html += '      <button type="button" class="btn btn-primary" id="setup-save-fees-btn"><span class="material-icons-round">save</span> Save Changes</button>';
    html += '    </div>';
    html += '  </div>';

    // Card 3: Extra Charges
    html += '  <div class="card fee-setup-card">';
    html += '    <div class="card-header fee-setup-header"><h3><span class="material-icons-round">receipt</span> Extra Charges</h3></div>';
    html += '    <div class="card-body">';
    html += '      <div class="admin-form-grid fee-setup-form-grid fee-setup-form" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-bottom:20px; align-items:flex-end;">';
    html += '        <div class="form-group"><label class="form-label">Charge Name</label><input type="text" class="form-input" id="setup-charge-name" placeholder="e.g. Admission Fee"></div>';
    html += '        <div class="form-group"><label class="form-label">Amount (₹)</label><input type="number" class="form-input" id="setup-charge-amount" placeholder="e.g. 5000" min="0"></div>';
    html += '        <div class="form-group"><label class="form-label">Billing Type</label><select class="form-select" id="setup-charge-type"><option value="one-time">One-time</option><option value="annual">Annual</option><option value="monthly">Monthly</option></select></div>';
    html += '        <div class="form-group fee-setup-add-btn-group" style="grid-column: span 3; display:flex; justify-content:flex-end;"><button type="button" class="btn btn-primary" id="setup-add-charge-btn" style="height:38px; padding:0 24px;">Add Charge</button></div>';
    html += '      </div>';
    html += '      <div id="setup-charges-list-container" style="display:flex; flex-direction:column; gap:8px;"></div>';
    html += '    </div>';
    html += '    <div class="card-footer fee-setup-actions" style="padding:16px 24px; display:flex; justify-content:flex-end; border-top:1px solid rgba(255,255,255,0.06);">';
    html += '      <button type="button" class="btn btn-primary" id="setup-save-charges-btn"><span class="material-icons-round">save</span> Save Charges</button>';
    html += '    </div>';
    html += '  </div>';

    html += '</div>';
    return html;
  }

  function renderExamsTab() {
    var settings = SchoolApp.store.settings || {};
    var html = '<div class="tab-content' + (state.activeTab === 'exams' ? ' active' : '') + '" id="tab-exams">';

    // Card 1: Exam Terms
    html += '<div class="card mb-3"><div class="card-header"><h3><span class="material-icons-round">assignment</span> Configure Exam Terms</h3>';
    html += '<div class="flex gap-2">';
    html += '<button class="btn btn-primary btn-sm" id="admin-setup-exam-wizard-btn"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">auto_awesome</span> Setup New Examination</button>';
    html += '<button class="btn btn-primary btn-sm" id="admin-add-examterm-btn"><span class="material-icons-round">add</span> Add Exam Term</button>';
    html += '</div></div><div class="card-body">';
    html += '<p style="color:var(--text-secondary);font-size:13px;margin:-8px 0 16px 0;">Define terms for recording grades, e.g. "Half-Yearly" and "Annual Exam" to enable consolidated multi-term marksheets.</p>';

    var exams = SchoolApp.store.exams || [];
    if (exams.length > 0) {
      html += '<div class="table-container"><table class="data-table"><thead><tr><th>Exam Term Name</th><th>Actions</th></tr></thead><tbody>';
      exams.forEach(function(ex) {
        html += '<tr>';
        html += '<td><strong>' + ex.name + '</strong></td>';
        html += '<td><div class="table-actions" style="display:flex; gap:8px;">';
        html += '<button class="btn-icon admin-edit-examterm-btn" data-id="' + ex.id + '" title="Edit Exam Term" style="color:var(--accent-primary)"><span class="material-icons-round">edit</span></button>';
        html += '<button class="btn-icon admin-delete-examterm-btn" data-id="' + ex.id + '" title="Delete Exam Term" style="color:var(--danger)"><span class="material-icons-round">delete</span></button>';
        html += '</div></td></tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state"><span class="material-icons-round">assignment</span><h3>No Exam Terms</h3><p>Create exam term like "Half-Yearly" or "Annual Exam" to record marks.</p></div>';
    }
    html += '</div></div>';

    // Card 2: Subject Class Mapping
    html += '<div class="card"><div class="card-header"><h3><span class="material-icons-round">schema</span> Class-Wise Subject Mappings</h3></div><div class="card-body">';
    
    var classes = settings.classes || [];
    if (classes.length > 0) {
      if (!state.examsSelectedClass) {
        state.examsSelectedClass = classes[0];
      }
      if (!state.examsSelectedTerm && exams.length > 0) {
        state.examsSelectedTerm = exams[0].id;
      }

      // Auto-carryover trigger
      if (state.examsSelectedTerm && state.examsSelectedClass) {
        autoCarryoverSubjects(state.examsSelectedTerm, state.examsSelectedClass);
      }

      var mappingKey = state.examsSelectedTerm + '_' + state.examsSelectedClass;

      // Select selectors side-by-side
      html += '<div class="form-grid" style="grid-template-columns: repeat(2, 1fr); gap:16px; max-width:600px; margin-bottom: 20px;">';
      
      // Select Exam Term
      html += '<div class="form-group"><label class="form-label">Select Exam Term</label>';
      html += '<select class="form-select" id="admin-exams-term-select">';
      if (exams.length > 0) {
        exams.forEach(function(ex) {
          html += '<option value="' + ex.id + '"' + (state.examsSelectedTerm === ex.id ? ' selected' : '') + '>' + ex.name + '</option>';
        });
      } else {
        html += '<option value="">-- No Exam Terms Configured --</option>';
      }
      html += '</select></div>';

      // Class selector dropdown for mapping
      html += '<div class="form-group"><label class="form-label">Select Class to Map Subjects</label>';
      html += '<select class="form-select" id="admin-exams-class-select">';
      classes.forEach(function(c) {
        html += '<option value="' + c + '"' + (state.examsSelectedClass === c ? ' selected' : '') + '>' + (['Nursery','LKG','UKG'].indexOf(c) !== -1 ? c : 'Class ' + c) + '</option>';
      });
      html += '</select></div>';
      
      html += '</div>'; // End selectors grid

      // Mapped subjects list
      var subjects = (SchoolApp.store.subjectMapping || {})[mappingKey] || [];
      var displayClsName = ['Nursery','LKG','UKG'].indexOf(state.examsSelectedClass) !== -1 ? state.examsSelectedClass : 'Class ' + state.examsSelectedClass;
      
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">';
      html += '<h4>Subjects mapped for ' + displayClsName + '</h4>';
      html += '</div>';

      if (subjects.length > 0) {
        html += '<div class="table-container"><table class="data-table"><thead><tr><th>Subject</th><th>Type</th><th class="center">Full Marks</th><th class="center">Pass</th><th>Action</th></tr></thead><tbody>';
        subjects.forEach(function(sub) {
          var typeText = sub.type || 'Theory';
          html += '<tr>';
          html += '<td><strong>' + escapeHTML(sub.name) + '</strong></td>';
          html += '<td><span class="badge badge-purple">' + typeText + '</span></td>';
          html += '<td class="center">' + sub.maxMarks + '</td>';
          html += '<td class="center">' + sub.passMarks + '</td>';
          html += '<td><div class="table-actions">';
          html += '<button class="btn-icon admin-edit-subject-btn" data-class="' + mappingKey + '" data-sub-id="' + sub.id + '" title="Edit Subject"><span class="material-icons-round">edit</span></button>';
          html += '<button class="btn-icon admin-delete-subject-btn" data-class="' + mappingKey + '" data-sub-id="' + sub.id + '" title="Delete Subject" style="color:var(--danger)"><span class="material-icons-round">delete</span></button>';
          html += '</div></td></tr>';
        });
        html += '</tbody></table></div>';
        html += '<div style="display:flex; justify-content:flex-end; margin-top:16px;">';
        html += '  <button class="btn btn-primary btn-sm" id="admin-add-subject-btn" data-class="' + mappingKey + '"><span class="material-icons-round">add</span> Add Subject</button>';
        html += '</div>';
      } else {
        html += '<div class="empty-state"><span class="material-icons-round">schema</span><h3>No Subjects Mapped</h3><p>There are no subjects configured for ' + displayClsName + ' yet. Click "Add Subject" to define subjects.</p>';
        html += '  <button class="btn btn-primary btn-sm mt-3" id="admin-add-subject-btn" data-class="' + mappingKey + '"><span class="material-icons-round">add</span> Add Subject</button>';
        html += '</div>';
      }
    } else {
      html += '<div class="empty-state"><span class="material-icons-round">school</span><h3>No Classes Available</h3><p>Please configure available classes in School Settings first.</p></div>';
    }

    html += '</div></div></div>';
    return html;
  }

  function renderNoticesTab() {
    var html = '<div class="tab-content' + (state.activeTab === 'notices' ? ' active' : '') + '" id="tab-notices">';

    // Card 1: Publish New Notice Form
    html += '<div class="card mb-3 notices-card"><div class="card-header"><h3><span class="material-icons-round">campaign</span> Publish New Announcement</h3></div><div class="card-body">';
    html += '<form id="admin-notice-form" class="form-grid notices-form-grid">';
    html += '<div class="form-group full-width"><label class="form-label">Notice Title *</label>';
    html += '<input type="text" id="admin-notice-title" class="form-input" placeholder="e.g. Science Fair Registration" required></div>';
    
    html += '<div class="form-group full-width"><label class="form-label">Announcement Description *</label>';
    html += '<textarea id="admin-notice-message" class="form-textarea" rows="3" placeholder="Enter announcement description..." required></textarea></div>';
    
    html += '<div class="form-group"><label class="form-label">Date *</label>';
    html += '<input type="date" id="admin-notice-date" class="form-input" value="' + new Date().toISOString().split('T')[0] + '" required></div>';
    
    html += '<div class="form-group"><label class="form-label">Priority Level *</label>';
    html += '<select id="admin-notice-priority" class="form-select">';
    html += '<option value="Normal">Normal (Blue/Green)</option>';
    html += '<option value="Urgent">Urgent (Red/Orange)</option>';
    html += '</select></div>';

    html += '<div class="form-group"><label class="form-label">Audience Target *</label>';
    html += '<select id="admin-notice-audience" class="form-select">';
    html += '<option value="everyone">👥 Everyone (All Users)</option>';
    html += '<option value="teachers">👨‍🏫 Teachers Only</option>';
    html += '<option value="students">🎓 Students Only</option>';
    html += '</select></div>';
    
    html += '<div class="form-group full-width flex gap-2 notices-form-actions" style="justify-content:flex-end; margin-top: 10px;">';
    html += '<input type="hidden" id="admin-notice-edit-id" value="">';
    html += '<button type="button" class="btn btn-secondary btn-sm" id="admin-notice-reset-btn" style="display:none;"><span class="material-icons-round">close</span> Cancel Edit</button>';
    html += '<button type="submit" class="btn btn-primary btn-sm" id="admin-notice-submit-btn"><span class="material-icons-round">publish</span> Publish Notice</button>';
    html += '</div>';
    html += '</form>';
    html += '</div></div>';

    // Card 2: List of Active Notices
    html += '<div class="card notices-card"><div class="card-header"><h3><span class="material-icons-round">list</span> Active Announcements</h3></div><div class="card-body">';
    
    var notices = SchoolApp.store.notices || [];
    if (notices.length > 0) {
      html += '<div class="table-container notices-table-container"><table class="data-table notices-table"><thead><tr>';
      html += '<th>Date</th><th>Announcement Info</th><th class="center">Audience</th><th class="center">Priority</th><th class="center">Status</th><th>Actions</th>';
      html += '</tr></thead><tbody>';
      
      notices.forEach(function(notice) {
        var priorityBadge = notice.priority === 'Urgent' ? 'badge-danger' : 'badge-purple';
        var status = notice.status || 'published';
        var statusBadge = status === 'published' ? 'badge-success' : 'badge-warning';
        
        var audArr = notice.audience || ['everyone'];
        if (!Array.isArray(audArr)) audArr = [audArr];
        var audLabel = '👥 Everyone';
        var audBadge = 'badge-info';
        if (audArr.indexOf('teachers') !== -1) {
          audLabel = '👨‍🏫 Teachers';
          audBadge = 'badge-purple';
        } else if (audArr.indexOf('students') !== -1) {
          audLabel = '🎓 Students';
          audBadge = 'badge-cyan';
        }

        html += '<tr>';
        html += '<td data-label="Date" style="font-size:12px; white-space:nowrap;">' + SchoolApp.formatDate(notice.date) + '</td>';
        html += '<td data-label="Announcement"><strong>' + notice.title + '</strong><br><span style="font-size:12px; color:var(--text-secondary); white-space: normal; display: block; max-width: 450px;">' + notice.message + '</span></td>';
        html += '<td data-label="Audience" class="center"><span class="badge ' + audBadge + '">' + audLabel + '</span></td>';
        html += '<td data-label="Priority" class="center"><span class="badge ' + priorityBadge + '">' + notice.priority + '</span></td>';
        html += '<td data-label="Status" class="center"><span class="badge ' + statusBadge + '">' + status.toUpperCase() + '</span></td>';
        html += '<td data-label="Actions"><div class="table-actions notices-table-actions" style="flex-wrap: nowrap !important; justify-content: flex-end;">';
        
        if (status === 'draft') {
          html += '<button class="btn btn-success btn-sm admin-approve-notice-btn" data-id="' + notice.id + '" title="Approve & Publish" style="padding: 4px 8px !important; min-height: 28px !important; font-size: 11px !important;"><span class="material-icons-round" style="font-size:14px; vertical-align:middle; margin-right:2px;">check_circle</span> Approve</button>';
        }
        
        html += '<button class="btn-icon admin-edit-notice-btn" data-id="' + notice.id + '" title="Edit Announcement"><span class="material-icons-round">edit</span></button>';
        html += '<button class="btn-icon admin-delete-notice-btn" data-id="' + notice.id + '" title="Delete Announcement" style="color:var(--danger)"><span class="material-icons-round">delete</span></button>';
        html += '</div></td>';
        html += '</tr>';
      });
      
      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state"><span class="material-icons-round">campaign</span><h3>No Announcements Published</h3><p>Use the form above to post notices directly to the dashboard.</p></div>';
    }
    
    html += '</div></div></div>';
    return html;
  }

  function renderDataTab() {
    var studentCount = (SchoolApp.store.students || []).length;
    var teacherCount = (SchoolApp.store.teachers || []).length;
    var attendanceCount = (SchoolApp.store.attendance || []).length;
    var dataSize = (new Blob([JSON.stringify(SchoolApp.store)])).size;
    var dataSizeKB = (dataSize / 1024).toFixed(1);

    var html = '<div class="tab-content' + (state.activeTab === 'data' ? ' active' : '') + '" id="tab-data">';

    // Database Stats
    html += '<div class="stats-grid mb-3">';
    html += '<div class="stat-card purple"><div class="stat-icon"><span class="material-icons-round">groups</span></div><div class="stat-info"><div class="stat-number">' + studentCount + '</div><div class="stat-label">Students</div></div></div>';
    html += '<div class="stat-card cyan"><div class="stat-icon"><span class="material-icons-round">person</span></div><div class="stat-info"><div class="stat-number">' + teacherCount + '</div><div class="stat-label">Teachers</div></div></div>';
    html += '<div class="stat-card green"><div class="stat-icon"><span class="material-icons-round">fact_check</span></div><div class="stat-info"><div class="stat-number">' + attendanceCount + '</div><div class="stat-label">Attendance Records</div></div></div>';
    html += '<div class="stat-card amber"><div class="stat-icon"><span class="material-icons-round">storage</span></div><div class="stat-info"><div class="stat-number">' + dataSizeKB + ' KB</div><div class="stat-label">Data Size</div></div></div>';
    html += '</div>';

    // Import/Export
    html += '<div class="card mb-3"><div class="card-header"><h3><span class="material-icons-round">import_export</span> Import & Export</h3></div><div class="card-body">';
    html += '<div class="dashboard-grid">';

    // Export section
    html += '<div><h4 style="margin-bottom:12px;color:var(--accent-primary-light)"><span class="material-icons-round" style="font-size:18px;vertical-align:middle">download</span> Export Data</h4>';
    html += '<div style="display:flex;flex-direction:column;gap:8px">';
    html += '<button class="btn btn-secondary w-full" id="export-json-btn"><span class="material-icons-round">code</span> Export Full Backup (JSON)</button>';
    html += '<button class="btn btn-secondary w-full" id="export-students-btn"><span class="material-icons-round">groups</span> Export Students (Excel)</button>';
    html += '<button class="btn btn-secondary w-full" id="export-teachers-btn"><span class="material-icons-round">person</span> Export Teachers (Excel)</button>';
    html += '<button class="btn btn-secondary w-full" id="export-attendance-btn"><span class="material-icons-round">fact_check</span> Export Attendance (Excel)</button>';
    html += '</div></div>';

    // Import section
    html += '<div><h4 style="margin-bottom:12px;color:var(--accent-secondary)"><span class="material-icons-round" style="font-size:18px;vertical-align:middle">upload</span> Import Data</h4>';
    html += '<div style="display:flex;flex-direction:column;gap:8px">';
    html += '<button class="btn btn-secondary w-full" id="import-json-btn"><span class="material-icons-round">restore</span> Restore from Backup (JSON)</button>';
    html += '<button class="btn btn-secondary w-full" id="import-students-btn"><span class="material-icons-round">groups</span> Import Students (Excel)</button>';
    html += '<input type="file" id="admin-json-input" accept=".json" style="display:none">';
    html += '<input type="file" id="admin-excel-input" accept=".xlsx,.xls,.csv" style="display:none">';
    html += '</div></div>';

    html += '</div></div></div>';

    // Demo Data Tools
    html += '<div class="card mb-3"><div class="card-header"><h3><span class="material-icons-round">movie</span> 🎬 Demo Data Tools</h3></div><div class="card-body">';
    html += '<p style="color:var(--text-secondary);font-size:13px;margin-bottom:14px">Generate or clear synthetic exam terms, subjects, and realistic marks for all students for sales demonstrations.</p>';
    html += '<div class="flex gap-2" style="flex-wrap:wrap">';
    html += '<button class="btn btn-primary" id="seed-demo-exam-btn"><span class="material-icons-round">auto_fix_high</span> 🎬 Generate Demo Exam Data</button>';
    html += '<button class="btn btn-secondary" id="clear-demo-exam-btn"><span class="material-icons-round">delete</span> 🗑️ Clear Demo Exam Data</button>';
    html += '</div></div></div>';

    // Danger Zone
    html += '<div class="danger-zone"><h3><span class="material-icons-round">warning</span> Danger Zone</h3>';
    html += '<p style="color:var(--text-secondary);margin-bottom:16px">These actions are irreversible. Proceed with caution.</p>';
    html += '<div class="flex gap-2" style="flex-wrap:wrap">';
    html += '<button class="btn btn-danger" id="reset-attendance-btn"><span class="material-icons-round">delete_sweep</span> Reset Attendance Data</button>';
    html += '<button class="btn btn-danger" id="reset-all-btn"><span class="material-icons-round">delete_forever</span> Reset All Data</button>';
    html += '</div></div>';

    html += '</div>';
    return html;
  }

  function renderRecoveryTab() {
    var trash = SchoolApp.store.trash || [];
    var restorePoints = [];
    try {
      var existing = localStorage.getItem('shishuvikash_restore_points');
      if (existing) restorePoints = JSON.parse(existing);
    } catch (e) {
      console.error(e);
    }

    var html = '<div class="tab-content' + (state.activeTab === 'recovery' ? ' active' : '') + '" id="tab-recovery">';

    html += '<div class="dashboard-grid">';

    // LEFT COLUMN: RECYCLE BIN
    html += '<div class="card"><div class="card-header">';
    html += '<h3><span class="material-icons-round">delete_outline</span> Recycle Bin</h3>';
    if (trash.length > 0) {
      html += '<button class="btn btn-danger btn-sm" id="empty-trash-btn"><span class="material-icons-round">delete_sweep</span> Empty Bin</button>';
    }
    html += '</div><div class="card-body">';
    html += '<p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">Deleted students, teachers, and attendance logs are held here. Restoring returns them immediately to their modules.</p>';

    if (trash.length > 0) {
      html += '<div class="table-container" style="max-height: 400px; overflow-y: auto;"><table class="data-table recovery-table" id="recovery-center-table"><thead><tr>';
      html += '<th>Item</th><th>Type</th><th>Deleted On</th><th>Actions</th>';
      html += '</tr></thead><tbody>';

      trash.forEach(function(item) {
        var typeBadge = '';
        if (item.type === 'student') typeBadge = 'badge-purple';
        else if (item.type === 'teacher') typeBadge = 'badge-cyan';
        else typeBadge = 'badge-green';

        var deletedAt = item.deletedAt || '';
        var formattedDate = '';
        if (typeof deletedAt === 'string' && deletedAt.indexOf('T') !== -1) {
          var parts = deletedAt.split('T');
          formattedDate = SchoolApp.formatDate(parts[0]) + ' ' + (parts[1] || '').substr(0, 5);
        } else {
          formattedDate = SchoolApp.formatDate(deletedAt);
        }

        html += '<tr>';
        html += '<td data-label="Item"><strong>' + item.name + '</strong><br><span style="font-size:11px;color:var(--text-muted)">' + item.details + '</span></td>';
        html += '<td data-label="Type"><span class="badge ' + typeBadge + '">' + item.type + '</span></td>';
        html += '<td data-label="Deleted" style="font-size:12px">' + formattedDate + '</td>';
        html += '<td data-label="Action"><div class="table-actions">';
        html += '<button class="btn btn-success btn-sm restore-trash-btn" data-id="' + item.id + '" title="Restore Item"><span class="material-icons-round" style="font-size:16px">restore</span></button>';
        html += '<button class="btn btn-danger btn-sm delete-trash-btn" data-id="' + item.id + '" title="Delete Permanently"><span class="material-icons-round" style="font-size:16px">delete_forever</span></button>';
        html += '</div></td>';
        html += '</tr>';
      });

      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state" style="padding:40px 20px">';
      html += '<span class="material-icons-round" style="font-size:48px;color:var(--text-muted)">delete_outline</span>';
      html += '<h3>Recycle Bin is Empty</h3>';
      html += '<p>Deleted records will appear here for easy recovery.</p>';
      html += '</div>';
    }
    html += '</div></div>';

    // RIGHT COLUMN: RESTORE POINTS
    html += '<div class="card"><div class="card-header">';
    html += '<h3><span class="material-icons-round">history</span> System Restore Points</h3>';
    html += '<button class="btn btn-primary btn-sm" id="create-manual-rp-btn"><span class="material-icons-round">add</span> Create Snapshot</button>';
    html += '</div><div class="card-body">';
    html += '<p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">Before performing destructive database resets or restoring backups, the system automatically takes snapshots of your state.</p>';

    if (restorePoints.length > 0) {
      html += '<div class="table-container" style="max-height: 400px; overflow-y: auto;"><table class="data-table recovery-table"><thead><tr>';
      html += '<th>Snapshot Name</th><th>Date Taken</th><th>Actions</th>';
      html += '</tr></thead><tbody>';

      restorePoints.forEach(function(rp) {
        var timestamp = rp.timestamp || '';
        var formattedDate = '';
        if (typeof timestamp === 'string' && timestamp.indexOf('T') !== -1) {
          var parts = timestamp.split('T');
          formattedDate = SchoolApp.formatDate(parts[0]) + ' ' + (parts[1] || '').substr(0, 5);
        } else {
          formattedDate = SchoolApp.formatDate(timestamp);
        }

        // Count items in the snapshot
        var sCount = rp.store.students ? rp.store.students.length : 0;
        var tCount = rp.store.teachers ? rp.store.teachers.length : 0;
        var aCount = rp.store.attendance ? rp.store.attendance.length : 0;

        html += '<tr>';
        html += '<td data-label="Item"><strong>' + rp.description + '</strong><br><span style="font-size:11px;color:var(--text-muted)">' + sCount + ' Students · ' + tCount + ' Teachers · ' + aCount + ' Attendance</span></td>';
        html += '<td data-label="Deleted" style="font-size:12px">' + formattedDate + '</td>';
        html += '<td data-label="Action"><div class="table-actions">';
        html += '<button class="btn btn-secondary btn-sm rollback-rp-btn" data-id="' + rp.id + '" title="Restore entire database to this point"><span class="material-icons-round" style="font-size:16px">settings_backup_restore</span> Rollback</button>';
        html += '<button class="btn-icon delete-rp-btn" data-id="' + rp.id + '" title="Delete Snapshot" style="color:var(--danger)"><span class="material-icons-round" style="font-size:16px">delete</span></button>';
        html += '</div></td>';
        html += '</tr>';
      });

      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state" style="padding:40px 20px">';
      html += '<span class="material-icons-round" style="font-size:48px;color:var(--text-muted)">history_toggle_off</span>';
      html += '<h3>No Restore Points</h3>';
      html += '<p>Snapshots are automatically created during database operations.</p>';
      html += '</div>';
    }
    html += '</div></div>';

    html += '</div></div>'; // End dashboard-grid & tab-content
    return html;
  }

  function renderSystemTab() {
    var html = '<div class="tab-content' + (state.activeTab === 'system' ? ' active' : '') + '" id="tab-system">';
    html += '<div class="card"><div class="card-header"><h3><span class="material-icons-round">info</span> System Information</h3></div><div class="card-body">';

    var info = [
      { label: 'Application', value: 'Shishu Vikash Mandir v1.0.0' },
      { label: 'Build Date', value: SchoolApp.formatDate(new Date().toISOString().split('T')[0]) },
      { label: 'Browser', value: navigator.userAgent.split('(')[0].trim() },
      { label: 'Screen Resolution', value: screen.width + ' × ' + screen.height },
      { label: 'Window Size', value: window.innerWidth + ' × ' + window.innerHeight },
      { label: 'localStorage Used', value: (JSON.stringify(localStorage).length / 1024).toFixed(1) + ' KB' },
      { label: 'Platform', value: navigator.platform },
      { label: 'Language', value: navigator.language }
    ];

    html += '<div class="detail-grid">';
    info.forEach(function(item) {
      html += '<div class="detail-item"><span class="detail-item-label">' + item.label + '</span><span class="detail-item-value">' + item.value + '</span></div>';
    });
    html += '</div>';

    // Password migration button
    html += '<div style="margin-top:20px;">';
    html += '  <button class="btn btn-primary" onclick="migrateAllPasswords()">🔐 Migrate Passwords to Secure Hash</button>';
    html += '</div>';

    html += '</div></div></div>';
    return html;
  }

  function calculateTransactionStats() {
    var todayStr = getRelativeDateString(0, 0, 0).split('T')[0];
    var currentMonthStr = todayStr.substring(0, 7);
    
    var ftd = 0;
    var mtd = 0;
    var cashInHand = 0;
    
    var txns = getMergedTransactions();
    
    // Isolation check
    if (!window.assertSchoolIsolation(txns, SchoolApp.store.currentSchoolId)) {
      console.error("[SECURITY] Data isolation breach in stats!");
      SchoolApp.logout();
      return { ftd: 0, mtd: 0, cashInHand: 0 };
    }
    
    txns.forEach(function(t) {
      var tDate = t.date_time.split('T')[0];
      var tMonth = t.date_time.substring(0, 7);
      
      if (tDate === todayStr) {
        ftd += t.amount;
        if (t.payment_method === 'Cash') {
          cashInHand += t.amount;
        }
      }
      
      if (tMonth === currentMonthStr) {
        mtd += t.amount;
      }
    });
    
    return {
      ftd: ftd,
      mtd: mtd,
      cashInHand: cashInHand
    };
  }

  function getFilteredTransactions() {
    var filtered = getMergedTransactions();
    
    // Isolation check
    if (!window.assertSchoolIsolation(filtered, SchoolApp.store.currentSchoolId)) {
      console.error("[SECURITY] Data isolation breach in transactions list!");
      SchoolApp.logout();
      return [];
    }
    
    if (state.txnSearchQuery) {
      var q = state.txnSearchQuery.toLowerCase();
      filtered = filtered.filter(function(t) {
        return t.student_name.toLowerCase().indexOf(q) !== -1 ||
               t.transaction_id.toLowerCase().indexOf(q) !== -1 ||
               (t.school_id && t.school_id.toLowerCase().indexOf(q) !== -1) ||
               (t.schoolId && t.schoolId.toLowerCase().indexOf(q) !== -1);
      });
    }
    
    if (state.txnStartDate) {
      filtered = filtered.filter(function(t) {
        var tDate = t.date_time.split('T')[0];
        return tDate >= state.txnStartDate;
      });
    }
    
    if (state.txnEndDate) {
      filtered = filtered.filter(function(t) {
        var tDate = t.date_time.split('T')[0];
        return tDate <= state.txnEndDate;
      });
    }
    
    filtered.sort(function(a, b) {
      return new Date(b.date_time) - new Date(a.date_time);
    });
    
    return filtered;
  }

  function renderTransactionsTab() {
    var currentSchoolId = SchoolApp.store.currentSchoolId;
    if (!window.assertSchoolIsolation(SchoolApp.store.fees, currentSchoolId)) {
      console.error("[SECURITY] Data isolation breach detected in Transactions Tab!");
      SchoolApp.logout();
      return '';
    }

    var displayStyle = (state.activeTab === 'transactions' ? 'display:block;' : 'display:none;');
    var html = '<div class="tab-content' + (state.activeTab === 'transactions' ? ' active' : '') + '" id="tab-transactions" style="' + displayStyle + '">';
    
    var stats = calculateTransactionStats();
    
    html += '<div class="stats-grid mb-3">';
    html += '  <div class="stat-card purple">';
    html += '    <div class="stat-icon"><span class="material-icons-round">payments</span></div>';
    html += '    <div class="stat-info">';
    html += '      <div class="stat-number">₹' + stats.ftd.toLocaleString('en-IN') + '</div>';
    html += '      <div class="stat-label">FTD Collection (Today)</div>';
    html += '    </div>';
    html += '  </div>';
    
    html += '  <div class="stat-card green">';
    html += '    <div class="stat-icon"><span class="material-icons-round">trending_up</span></div>';
    html += '    <div class="stat-info">';
    html += '      <div class="stat-number">₹' + stats.mtd.toLocaleString('en-IN') + '</div>';
    html += '      <div class="stat-label">MTD Collection (This Month)</div>';
    html += '    </div>';
    html += '  </div>';
    
    html += '  <div class="stat-card amber">';
    html += '    <div class="stat-icon"><span class="material-icons-round">account_balance_wallet</span></div>';
    html += '    <div class="stat-info">';
    html += '      <div class="stat-number">₹' + stats.cashInHand.toLocaleString('en-IN') + '</div>';
    html += '      <div class="stat-label">Cash in Hand (Today)</div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';
    
    html += '<div class="card">';
    html += '  <div class="card-header">';
    html += '    <h3><span class="material-icons-round">receipt_long</span> Fee Ledger & Transactions</h3>';
    html += '  </div>';
    html += '  <div class="card-body">';
    
    html += '    <div class="toolbar" style="flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">';
    html += '      <div class="search-wrapper" style="flex: 1; min-width: 200px;">';
    html += '        <span class="material-icons-round">search</span>';
    html += '        <input type="text" id="txn-search" placeholder="Search by student name or txn ID..." value="' + (state.txnSearchQuery || '') + '">';
    html += '      </div>';
    
    html += '      <div class="filter-group" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: flex-end;">';
    html += '        <label style="font-size: 12px; font-weight:600; color: var(--text-secondary);">FROM:</label>';
    html += '        <input type="date" id="txn-start-date" class="form-input" style="width: auto;" value="' + (state.txnStartDate || '') + '">';
    html += '        <label style="font-size: 12px; font-weight:600; color: var(--text-secondary);">TO:</label>';
    html += '        <input type="date" id="txn-end-date" class="form-input" style="width: auto;" value="' + (state.txnEndDate || '') + '">';
    html += '        <button class="btn btn-primary" id="txn-export-csv-btn"><span class="material-icons-round">file_download</span> Export CSV</button>';
    html += '      </div>';
    html += '    </div>';
    
    html += '    <div id="txn-table-container"></div>';
    
    html += '  </div>';
    html += '</div>';
    
    html += '</div>';
    return html;
  }

  function renderTransactionsTable() {
    var tblContainer = document.getElementById('txn-table-container');
    if (!tblContainer) return;
    
    var currentSchoolId = SchoolApp.store.currentSchoolId;
    var filtered = getFilteredTransactions();
    
    if (!window.assertSchoolIsolation(filtered, currentSchoolId)) {
      console.error("[SECURITY] Data isolation breach detected in Transactions Table!");
      SchoolApp.logout();
      return;
    }
    
    var html = '';
    if (filtered.length > 0) {
      html += '<div class="table-container" style="overflow-x: auto; -webkit-overflow-scrolling: touch;">';
      html += '  <table class="data-table" id="txn-ledger-table">';
      html += '    <thead>';
      html += '      <tr>';
      html += '        <th>School ID</th>';
      html += '        <th>Transaction ID</th>';
      html += '        <th>Date & Time</th>';
      html += '        <th>Student Name</th>';
      html += '        <th>Class & Section</th>';
      html += '        <th>Payment Method</th>';
      html += '        <th>Amount</th>';
      html += '        <th style="text-align: center;">Action</th>';
      html += '      </tr>';
      html += '    </thead>';
      html += '    <tbody>';
      
      filtered.forEach(function(t) {
        var dateObj = new Date(t.date_time);
        var formattedDate = dateObj.toLocaleDateString('en-IN') + ' ' + dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        
        var methodBadge = '';
        if (t.payment_method === 'Cash') methodBadge = 'badge-success';
        else if (t.payment_method === 'UPI') methodBadge = 'badge-purple';
        else methodBadge = 'badge-info';
        
        html += '      <tr>';
        html += '        <td><span style="font-family: monospace; font-size: 12px; color: var(--text-muted);">' + t.school_id + '</span></td>';
        html += '        <td><strong>' + t.transaction_id + '</strong></td>';
        html += '        <td>' + formattedDate + '</td>';
        html += '        <td><strong>' + t.student_name + '</strong></td>';
        html += '        <td><span class="badge badge-info">' + t.class_section + '</span></td>';
        html += '        <td><span class="badge ' + methodBadge + '">' + t.payment_method + '</span></td>';
        html += '        <td><strong>₹' + t.amount.toLocaleString('en-IN') + '</strong></td>';
        html += '        <td style="text-align: center;">';
        html += '          <button class="btn btn-primary btn-sm txn-print-btn" data-id="' + t.transaction_id + '" style="padding: 4px 8px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; justify-content: center; margin: 0 auto;">';
        html += '            <span class="material-icons-round" style="font-size: 14px;">print</span> Print';
        html += '          </button>';
        html += '        </td>';
        html += '      </tr>';
      });
      
      html += '    </tbody>';
      html += '  </table>';
      html += '</div>';
    } else {
      html += '<div class="empty-state">';
      html += '  <span class="material-icons-round">receipt_long</span>';
      html += '  <h3>No Transactions Found</h3>';
      html += '  <p>No records match your filters.</p>';
      html += '</div>';
    }
    
    tblContainer.innerHTML = html;
  }

  function exportTransactionsToCSV() {
    var filtered = getFilteredTransactions();
    if (filtered.length === 0) {
      SchoolApp.showToast('No transaction data to export.', 'error');
      return;
    }
    
    var csvContent = 'School ID,Transaction ID,Date & Time,Student Name,Class & Section,Payment Method,Amount\n';
    
    filtered.forEach(function(t) {
      var dateObj = new Date(t.date_time);
      var formattedDate = dateObj.toLocaleDateString('en-IN') + ' ' + dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      
      var name = t.student_name.replace(/"/g, '""');
      if (name.indexOf(',') !== -1) {
        name = '"' + name + '"';
      }
      
      csvContent += [
        t.school_id,
        t.transaction_id,
        formattedDate,
        name,
        t.class_section,
        t.payment_method,
        t.amount
      ].join(',') + '\n';
    });
    
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    if (link.download !== undefined) {
      var url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'Fee_Ledger_Transactions_' + new Date().toISOString().split('T')[0] + '.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  function printTransactionReceipt(txnId) {
    var txns = getMergedTransactions();
    var t = txns.find(function(item) { 
      return item.transaction_id === txnId && (item.schoolId || item.school_id) === SchoolApp.store.currentSchoolId; 
    });
    if (!t) {
      SchoolApp.showToast('Transaction not found.', 'error');
      return;
    }
    
    var settings = SchoolApp.store.settings || {};
    var schoolName = settings.schoolName || "Shishu Vikash Mandir";
    var schoolPhone = settings.phone || "";
    var schoolEmail = settings.email || "";
    
    document.getElementById('receipt-school-name').innerText = schoolName;
    document.getElementById('receipt-school-address').innerText = "Bokaro Steel City, Jharkhand" + (schoolPhone ? " | Ph: " + schoolPhone : "") + (schoolEmail ? " | Email: " + schoolEmail : "");
    
    document.getElementById('receipt-txn-id').innerText = t.transaction_id;
    
    var dateObj = new Date(t.date_time);
    var formattedDate = dateObj.toLocaleDateString('en-IN') + ' ' + dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('receipt-date').innerText = formattedDate;
    
    document.getElementById('receipt-student-name').innerText = t.student_name;
    document.getElementById('receipt-class').innerText = t.class_section;
    document.getElementById('receipt-payment-method').innerText = t.payment_method;
    document.getElementById('receipt-amount').innerText = '₹' + t.amount.toLocaleString('en-IN');
    
    window.print();
  }



  function renderPromotionTab() {
    var settings = SchoolApp.store.settings || {};
    var classes = settings.classes || [];
    var html = '<div class="tab-content' + (state.activeTab === 'promotion' ? ' active' : '') + '" id="tab-promotion">';

    html += '<div class="card promotion-card"><div class="card-header"><h3><span class="material-icons-round">trending_up</span> Academic Class Promotion</h3></div><div class="card-body">';
    html += '<p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">Use this module at the end of the academic year to promote active students to their next classes in bulk. Students left unchecked will be held back in their current class.</p>';

    // Select source & destination class grid
    html += '<div class="form-grid mb-3 promotion-select-grid">';
    
    // Source Class Select
    html += '<div class="form-group"><label class="form-label">Source Class (Current) *</label>';
    html += '<select class="form-select" id="promotion-source-class"><option value="">-- Select Source Class --</option>';
    classes.forEach(function(c) {
      html += '<option value="' + c + '"' + (state.promotionSourceClass === c ? ' selected' : '') + '>' + (['Nursery','LKG','UKG'].indexOf(c) !== -1 ? c : 'Class ' + c) + '</option>';
    });
    html += '</select></div>';

    // Destination Class Select
    html += '<div class="form-group"><label class="form-label">Destination Class (Next Year) *</label>';
    html += '<select class="form-select" id="promotion-dest-class"><option value="">-- Select Destination Class --</option>';
    classes.forEach(function(c) {
      html += '<option value="' + c + '"' + (state.promotionDestClass === c ? ' selected' : '') + '>' + (['Nursery','LKG','UKG'].indexOf(c) !== -1 ? c : 'Class ' + c) + '</option>';
    });
    html += '<option value="Graduated"' + (state.promotionDestClass === 'Graduated' ? ' selected' : '') + '>Graduated (Out of School)</option>';
    html += '</select></div>';

    html += '</div>'; // End form-grid

    // Student Checklist Box
    html += '<div class="promotion-checklist-box" style="margin-top:20px;border:1px solid var(--border-color);border-radius:8px;padding:16px;background:rgba(0,0,0,0.15)">';
    html += '<h4 style="margin-bottom:12px;color:var(--text-primary)">Student Checklist</h4>';
    html += '<div id="promotion-student-list-container" class="promotion-wrapper">';
    html += '<div class="empty-state" style="padding: 20px;"><p style="color:var(--text-muted)">Select a source class to view students checklist.</p></div>';
    html += '</div>'; // End checklist container
    html += '</div>';

    // Promote Selected Action Button
    html += '<div class="flex mt-3 promotion-action-bar" style="justify-content:flex-end">';
    html += '<button class="btn btn-primary" id="promote-selected-btn" disabled><span class="material-icons-round">trending_up</span> Promote Selected Students</button>';
    html += '</div>';

    html += '</div></div></div>'; // End card & tab-content
    return html;
  }

  function updateDestinationClassSelection(srcCls) {
    var destSelect = document.getElementById('promotion-dest-class');
    if (!destSelect) return;

    var settings = SchoolApp.store.settings || {};
    var classes = settings.classes || [];
    var idx = classes.indexOf(srcCls);
    if (idx !== -1 && idx < classes.length - 1) {
      destSelect.value = classes[idx + 1];
      state.promotionDestClass = classes[idx + 1];
    } else if (idx === classes.length - 1) {
      destSelect.value = 'Graduated';
      state.promotionDestClass = 'Graduated';
    } else {
      destSelect.value = '';
      state.promotionDestClass = '';
    }
  }

  function renderPromotionStudentList(srcCls) {
    var container = document.getElementById('promotion-student-list-container');
    if (!container) return;

    if (!srcCls) {
      container.innerHTML = '<div class="empty-state" style="padding: 20px;"><p style="color:var(--text-muted)">Select a source class to view students checklist.</p></div>';
      updatePromoteButtonState();
      return;
    }

    var students = (SchoolApp.store.students || []).filter(function(s) {
      return s.class === srcCls && s.status === 'Active';
    });

    if (students.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding: 20px;"><span class="material-icons-round" style="font-size:32px;color:var(--text-muted)">groups</span><h3>No Active Students</h3><p style="color:var(--text-muted)">There are no active students currently in this class.</p></div>';
      updatePromoteButtonState();
      return;
    }

    var html = '';
    // Header for Checklist with toggle all
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:6px;border:1px solid var(--border-color)">';
    html += '<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer"><input type="checkbox" id="promotion-toggle-all" checked> Select All Students (' + students.length + ')</label>';
    html += '</div>';

    // Students Grid
    html += '<div class="promotion-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:10px">';
    students.forEach(function(s) {
      var color = SchoolApp.getAvatarColor(s.firstName + s.lastName);
      var initials = SchoolApp.getInitials(s.firstName, s.lastName);
      
      html += '<label class="promotion-card-item" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:rgba(255,255,255,0.02);cursor:pointer;transition:all var(--transition-fast)">';
      html += '<input type="checkbox" class="promotion-student-cb" value="' + s.id + '" checked style="flex-shrink:0">';
      html += '<div class="avatar avatar-sm" data-color="' + color + '" style="font-size:12px;width:32px;height:32px;flex-shrink:0">' + initials + '</div>';
      html += '<div style="min-width:0;flex:1">';
      html += '<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + s.firstName + ' ' + s.lastName + '</div>';
      html += '<div style="font-size:11px;color:var(--text-muted)">Roll: ' + s.rollNumber + '</div>';
      html += '</div>';
      html += '</label>';
    });
    html += '</div>';

    container.innerHTML = html;

    // Attach toggle listener dynamically
    var toggleAll = document.getElementById('promotion-toggle-all');
    if (toggleAll) {
      toggleAll.addEventListener('change', function() {
        var checked = this.checked;
        document.querySelectorAll('.promotion-student-cb').forEach(function(cb) {
          cb.checked = checked;
        });
        updatePromoteButtonState();
      });
    }

    // Attach student checkboxes change listeners dynamically
    document.querySelectorAll('.promotion-student-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        // Update toggle all state if some are unchecked
        var total = document.querySelectorAll('.promotion-student-cb').length;
        var checked = document.querySelectorAll('.promotion-student-cb:checked').length;
        var toggleAll = document.getElementById('promotion-toggle-all');
        if (toggleAll) {
          toggleAll.checked = (total === checked);
          toggleAll.indeterminate = (checked > 0 && checked < total);
        }
        updatePromoteButtonState();
      });
    });

    updatePromoteButtonState();
  }

  function updatePromoteButtonState() {
    var promoteBtn = document.getElementById('promote-selected-btn');
    if (!promoteBtn) return;
    
    var checked = document.querySelectorAll('.promotion-student-cb:checked').length;
    promoteBtn.disabled = (checked === 0);
  }

  var DEFAULT_SUBJECTS_BY_CLASS = {
    'nursery': ['Hindi', 'English', 'Mathematics'],
    'lkg': ['Hindi', 'English', 'Mathematics'],
    'ukg': ['Hindi', 'English', 'Mathematics'],
    '1': ['Hindi', 'English', 'Mathematics', 'EVS', 'Drawing'],
    '2': ['Hindi', 'English', 'Mathematics', 'EVS', 'Drawing'],
    '3': ['Hindi', 'English', 'Mathematics', 'Science', 'Social Science', 'Drawing'],
    '4': ['Hindi', 'English', 'Mathematics', 'Science', 'Social Science', 'Drawing'],
    '5': ['Hindi', 'English', 'Mathematics', 'Science', 'Social Science', 'Drawing'],
    '6': ['Hindi', 'English', 'Mathematics', 'Science', 'Social Science', 'General Knowledge', 'Drawing'],
    '7': ['Hindi', 'English', 'Mathematics', 'Science', 'Social Science', 'General Knowledge', 'Drawing'],
    '8': ['Hindi', 'English', 'Mathematics', 'Science', 'Social Science', 'General Knowledge', 'Drawing'],
    '9': ['Hindi', 'English', 'Mathematics', 'Science', 'Social Science', 'General Knowledge', 'Handy craft'],
    '10': ['Hindi', 'English', 'Mathematics', 'Science', 'Social Science', 'General Knowledge', 'Handy craft'],
    'default': ['Hindi', 'English', 'Mathematics', 'Science', 'Social Science', 'General Knowledge', 'Drawing', 'Handy craft']
  };

  function normalizeClassDbKey(clsInput) {
    if (!clsInput) return '1';
    var str = String(clsInput).trim();
    str = str.replace(/^Class\s+/i, '');
    return str;
  }

  async function seedDemoExamTerm() {
    var termId = 'term_demo_1';

    if (!SchoolApp.store.examTerms)
      SchoolApp.store.examTerms = {};

    if (!SchoolApp.store.examTerms[termId]) {
      SchoolApp.store.examTerms[termId] = {
        id: termId,
        name: 'Term 1 (Half-Yearly)',
        shortName: 'T1',
        session: '2025-26',
        startDate: '2025-10-01',
        endDate: '2025-10-15',
        status: 'published',
        order: 1
      };
    }
    return termId;
  }

  async function ensureSubjectsForClass(termId, classId) {
    if (!SchoolApp.store.examSubjects)
      SchoolApp.store.examSubjects = {};
    if (!SchoolApp.store.examSubjects[termId])
      SchoolApp.store.examSubjects[termId] = {};

    if (SchoolApp.store.examSubjects[termId][classId] &&
        SchoolApp.store.examSubjects[termId][classId].subjects &&
        SchoolApp.store.examSubjects[termId][classId].subjects.length > 0) {
      return; // already configured
    }

    var normalizedKey = String(classId || '').toLowerCase().trim().replace(/^class\s+/i, '');
    var subjectNames = DEFAULT_SUBJECTS_BY_CLASS[normalizedKey] || DEFAULT_SUBJECTS_BY_CLASS['default'];

    var subjects = subjectNames.map(function(name, idx) {
      var isOptional = (name === 'Drawing' || name === 'Handy craft');
      return {
        id: 'subj_' + idx + '_' + Math.random().toString(36).substr(2, 4),
        name: name,
        type: isOptional ? 'Practical' : 'Theory',
        fullMarks: isOptional ? 50 : 100,
        passMarks: isOptional ? 15 : 33,
        isOptional: isOptional,
        hasExam: true,
        order: idx
      };
    });

    SchoolApp.store.examSubjects[termId][classId] = { subjects: subjects };
  }

  function generateDemoMarks(studentIndex, subject) {
    // Create different student profiles based on index for variety:
    var profile = studentIndex % 6;
    var fullMarks = subject.fullMarks || 100;

    switch(profile) {
      case 0: // Topper (85-98%)
        return Math.round(fullMarks * (0.85 + Math.random() * 0.13));

      case 1: // Good student (65-84%)
        return Math.round(fullMarks * (0.65 + Math.random() * 0.19));

      case 2: // Average (45-64%)
        return Math.round(fullMarks * (0.45 + Math.random() * 0.19));

      case 3: // Weak in specific subjects (35-50%, sometimes below pass)
        var isWeakSubject = (subject.name === 'Mathematics' || subject.name === 'Science');
        if (isWeakSubject) {
          return Math.round(fullMarks * (0.20 + Math.random() * 0.15));
        }
        return Math.round(fullMarks * (0.50 + Math.random() * 0.20));

      case 4: // Optional subject absent case
        if (subject.isOptional) {
          return 'ABSENT'; // special marker
        }
        return Math.round(fullMarks * (0.60 + Math.random() * 0.25));

      case 5: // One mandatory subject failed
        var isFailSubject = (subject.name === 'English');
        if (isFailSubject) {
          return Math.round(fullMarks * (0.15 + Math.random() * 0.10));
        }
        return Math.round(fullMarks * (0.55 + Math.random() * 0.25));
    }
  }

  async function generateDemoExamData() {
    var btn = document.getElementById('seed-demo-exam-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Generating...';
    }

    try {
      var termId = await seedDemoExamTerm();

      var students = SchoolApp.store.students || [];
      if (students.length === 0) {
        SchoolApp.showToast('No students found to generate demo exam marks for.', 'warning');
        if (btn) {
          btn.disabled = false;
          btn.textContent = '🎬 Generate Demo Exam Data';
        }
        return;
      }

      var classesProcessed = {};
      var sectionsProcessed = {};
      var totalMarksEntries = 0;

      var ensureSubArr = window.ensureSubjectsArray || function(input) {
        if (Array.isArray(input)) return input;
        if (input && typeof input === 'object') return Object.values(input);
        return [];
      };

      var recalcEntry = window.recalculateStudentEntry || function(entry, subjects) {
        var subjectsArr = ensureSubArr(subjects);
        var totalFull = 0;
        var totalObtained = 0;
        var mandatoryFailed = false;
        var optionalFailedOrAbsent = false;

        subjectsArr.forEach(function(sub) {
          var sc = entry.marks && entry.marks[sub.id];
          if (!sc) return;
          if (sc.isExempted) return;

          var obtained = sc.isAbsent ? 0 : (Number(sc.obtained) || 0);

          totalFull += (sub.fullMarks || 0);
          totalObtained += obtained;

          if (sub.isOptional) {
            if (sc.isAbsent || obtained < (sub.passMarks || 0)) {
              optionalFailedOrAbsent = true;
            }
          } else {
            if (sc.isAbsent || obtained < (sub.passMarks || 0)) {
              mandatoryFailed = true;
            }
          }
        });

        entry.total = totalObtained;
        entry.maxTotal = totalFull;
        entry.percentage = totalFull > 0 ? Math.round((totalObtained / totalFull) * 100) : 0;
        if (typeof calculateGrade === 'function') {
          var gradeObj = calculateGrade(entry.percentage);
          entry.grade = gradeObj.grade;
          entry.gradeLabel = gradeObj.label;
        }
        if (mandatoryFailed) {
          entry.result = 'FAIL';
          entry.division = 'Not Applicable';
        } else {
          entry.result = 'PASS';
          if (optionalFailedOrAbsent) {
            entry.division = 'Not Awarded';
          } else {
            if (entry.percentage >= 75) entry.division = 'First Division (Distinction)';
            else if (entry.percentage >= 60) entry.division = 'First Division';
            else if (entry.percentage >= 45) entry.division = 'Second Division';
            else if (entry.percentage >= 33) entry.division = 'Third Division';
            else entry.division = 'Pass Division';
          }
        }
      };

      for (var i = 0; i < students.length; i++) {
        var student = students[i];
        var classId = normalizeClassDbKey(student.class);
        var sectionId = student.section || 'A';
        var keyCS = classId + '_' + sectionId;

        // Ensure subjects configured for this class (once per class)
        if (!classesProcessed[classId]) {
          await ensureSubjectsForClass(termId, classId);
          classesProcessed[classId] = true;
        }
        sectionsProcessed[keyCS] = { classId: classId, sectionId: sectionId };

        var subjects = ensureSubArr(
          SchoolApp.store.examSubjects[termId][classId].subjects
        );

        var marksObj = {};
        subjects.forEach(function(sub) {
          var val = generateDemoMarks(i, sub);

          if (val === 'ABSENT') {
            marksObj[sub.id] = {
              obtained: 0,
              fullMarks: sub.fullMarks,
              isAbsent: true,
              isExempted: false,
              enteredBy: 'Demo Data'
            };
          } else {
            marksObj[sub.id] = {
              obtained: val,
              fullMarks: sub.fullMarks,
              isAbsent: false,
              isExempted: false,
              enteredBy: 'Demo Data'
            };
          }
        });

        var entry = {
          marks: marksObj,
          isComplete: true,
          lastUpdated: new Date().toISOString()
        };
        recalcEntry(entry, subjects);

        if (!SchoolApp.store.examMarks) SchoolApp.store.examMarks = {};
        if (!SchoolApp.store.examMarks[termId]) SchoolApp.store.examMarks[termId] = {};
        if (!SchoolApp.store.examMarks[termId][classId]) SchoolApp.store.examMarks[termId][classId] = {};
        if (!SchoolApp.store.examMarks[termId][classId][sectionId]) SchoolApp.store.examMarks[termId][classId][sectionId] = {};

        SchoolApp.store.examMarks[termId][classId][sectionId][student.id] = entry;

        totalMarksEntries++;

        if (btn) {
          btn.textContent = 'Generating ' + (i + 1) + '/' + students.length + '...';
        }
      }

      var recalcRanks = window.recalculateRanks || function(tId, cId, sId) {
        var classMarks = (SchoolApp.store.examMarks && SchoolApp.store.examMarks[tId] && SchoolApp.store.examMarks[tId][cId] && SchoolApp.store.examMarks[tId][cId][sId]) || {};
        var stus = (SchoolApp.store.students || []).filter(function(s) {
          return String(s.class).toLowerCase().trim().replace(/^class\s+/i, '') === String(cId).toLowerCase().trim() &&
                 String(s.section || 'A').toLowerCase().trim() === String(sId).toLowerCase().trim() &&
                 s.status === 'Active';
        });

        var rankList = [];
        stus.forEach(function(s) {
          var sm = classMarks[s.id];
          if (sm && sm.isComplete) {
            if (sm.result === 'N/A') return;
            rankList.push({ studentId: s.id, percentage: sm.percentage || 0, total: sm.total || 0, sm: sm });
          }
        });
        rankList.sort(function(a, b) {
          if (b.percentage !== a.percentage) return b.percentage - a.percentage;
          return b.total - a.total;
        });
        var currentRank = 1;
        var skipped = 0;
        rankList.forEach(function(item, idx) {
          if (idx > 0) {
            var prev = rankList[idx - 1];
            if (item.percentage === prev.percentage && item.total === prev.total) {
              skipped++;
            } else {
              currentRank += skipped + 1;
              skipped = 0;
            }
          }
          item.sm.rank = currentRank;
        });
      };

      var secKeys = Object.keys(sectionsProcessed);
      for (var k = 0; k < secKeys.length; k++) {
        var secItem = sectionsProcessed[secKeys[k]];
        recalcRanks(termId, secItem.classId, secItem.sectionId);
      }

      await SchoolApp.save(true);

      if (btn) {
        btn.textContent = '✅ Done!';
      }
      SchoolApp.showToast(
        'Demo exam data generated for ' + totalMarksEntries + ' students!',
        'success'
      );

    } catch(err) {
      console.error('Demo seed error:', err);
      SchoolApp.showToast('Failed: ' + err.message, 'error');
    } finally {
      if (btn) {
        setTimeout(function() {
          btn.disabled = false;
          btn.textContent = '🎬 Generate Demo Exam Data';
        }, 2000);
      }
    }
  }

  async function clearDemoExamData() {
    SchoolApp.showConfirm('Clear all demo exam data? This cannot be undone.', async function() {
      var termId = 'term_demo_1';
      if (SchoolApp.store.examTerms && SchoolApp.store.examTerms[termId]) {
        delete SchoolApp.store.examTerms[termId];
      }
      if (SchoolApp.store.examSubjects && SchoolApp.store.examSubjects[termId]) {
        delete SchoolApp.store.examSubjects[termId];
      }
      if (SchoolApp.store.examMarks && SchoolApp.store.examMarks[termId]) {
        delete SchoolApp.store.examMarks[termId];
      }

      await SchoolApp.save(true);
      SchoolApp.showToast('Demo exam data cleared.', 'info');
    });
  }

  function attachEvents() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tabId = this.getAttribute('data-tab');
        if (SchoolApp.adminIsDirty) {
          SchoolApp.pendingNavigation = { page: 'admin', tab: tabId, fromHistory: false };
          SchoolApp.confirmUnsavedChanges(function() {
            switchTab(tabId);
          });
        } else {
          switchTab(tabId);
        }
      });
    });

    function switchTab(tabId) {
      state.activeTab = tabId;
      
      // Update history state
      if (window.history) {
        var currentState = window.history.state;
        if (currentState && currentState.page === 'admin') {
          if (currentState.tab === 'settings' && tabId !== 'settings') {
            // Push new state when moving from settings to another tab
            window.history.pushState({page: 'admin', tab: tabId}, '', '#admin-' + tabId);
          } else {
            // Replace state when moving between non-settings tabs, or back to settings
            window.history.replaceState({page: 'admin', tab: tabId}, '', '#admin' + (tabId === 'settings' ? '' : '-' + tabId));
          }
        } else {
          window.history.pushState({page: 'admin', tab: tabId}, '', '#admin-' + tabId);
        }
      }

      // Track last clean tab
      SchoolApp.lastCleanTab = tabId;

      // Hide all content sections first
      var sections = document.querySelectorAll('.tab-content');
      sections.forEach(function(sec) {
        sec.style.setProperty('display', 'none', 'important');
        sec.classList.remove('active');
      });
      
      // Render
      render();
      
      // Enforce visibility of only target section
      var allSections = document.querySelectorAll('.tab-content');
      allSections.forEach(function(sec) {
        sec.style.setProperty('display', 'none', 'important');
        sec.classList.remove('active');
      });
      
      var targetSec = document.getElementById('tab-' + tabId);
      if (targetSec) {
        targetSec.classList.add('active');
        if (tabId === 'settings') {
          targetSec.style.setProperty('display', 'flex', 'important');
        } else {
          targetSec.style.setProperty('display', 'block', 'important');
        }
      }
    }


    // Add Class inside Settings
    var settingsAddClassBtn = document.getElementById('settings-add-class-btn');
    if (settingsAddClassBtn) {
      settingsAddClassBtn.addEventListener('click', function() {
        if (sessionStorage.getItem("isImpersonating") === "true") {
          SchoolApp.showToast("View-only mode. Edits blocked during impersonation.", "warning");
          return;
        }
        var input = document.getElementById('settings-new-class-input');
        var c = input ? input.value.trim() : '';
        if (!c) {
          SchoolApp.showToast("Class name cannot be empty.", "error");
          return;
        }
        
        var settings = SchoolApp.store.settings;
        if (!settings.classes) settings.classes = [];
        if (settings.classes.indexOf(c) !== -1) {
          SchoolApp.showToast("Class already exists.", "error");
          return;
        }
        
        SchoolApp.createRestorePoint('Backup before adding class ' + c);
        settings.classes.push(c);
        if (typeof settings.sections !== 'object' || Array.isArray(settings.sections)) {
          settings.sections = {};
        }
        settings.sections[c] = ["A"]; // default A
        
        if (!settings.feeStructure) settings.feeStructure = {};
        if (!settings.feeStructure[c]) {
          settings.feeStructure[c] = { tuition: 0, transport: 0, exam: 0 };
        }
        
        if (input) input.value = '';
        SchoolApp.save();
        renderSettingsClasses();
        SchoolApp.showToast("Class added successfully!", "success");
      });
    }

    // Add Subject inside Settings
    var settingsAddSubjectBtn = document.getElementById('settings-add-subject-btn');
    if (settingsAddSubjectBtn) {
      settingsAddSubjectBtn.addEventListener('click', function() {
        if (sessionStorage.getItem("isImpersonating") === "true") {
          SchoolApp.showToast("View-only mode. Edits blocked during impersonation.", "warning");
          return;
        }
        var input = document.getElementById('settings-new-subject-input');
        var sub = input ? input.value.trim() : '';
        if (!sub) {
          SchoolApp.showToast("Subject name cannot be empty.", "error");
          return;
        }
        
        var settings = SchoolApp.store.settings;
        if (!settings.subjects) settings.subjects = [];
        if (settings.subjects.indexOf(sub) !== -1) {
          SchoolApp.showToast("Subject already exists.", "error");
          return;
        }
        
        SchoolApp.createRestorePoint('Backup before adding subject ' + sub);
        settings.subjects.push(sub);
        
        if (input) input.value = '';
        SchoolApp.save();
        renderSettingsSubjects();
        SchoolApp.showToast("Subject added successfully!", "success");
      });
    }

    // Capture GPS inside Settings
    var settingsCaptureGpsBtn = document.getElementById('settings-capture-gps-btn');
    if (settingsCaptureGpsBtn) {
      settingsCaptureGpsBtn.addEventListener('click', function() {
        if (sessionStorage.getItem("isImpersonating") === "true") {
          SchoolApp.showToast("View-only mode. Edits blocked during impersonation.", "warning");
          return;
        }
        if (!navigator.geolocation) {
          SchoolApp.showToast("Geolocation is not supported by your browser.", "error");
          return;
        }
        SchoolApp.showLoader("Getting location...");
        navigator.geolocation.getCurrentPosition(function(position) {
          SchoolApp.hideLoader();
          var latInput = document.getElementById('geofence-lat');
          var lngInput = document.getElementById('geofence-lng');
          if (latInput && lngInput) {
            latInput.value = position.coords.latitude.toFixed(6);
            lngInput.value = position.coords.longitude.toFixed(6);
            SchoolApp.showToast("Coordinates captured successfully!", "success");
          }
        }, function(error) {
          SchoolApp.hideLoader();
          console.error("GPS capture failure:", error);
          SchoolApp.showToast("Failed to capture location coordinates.", "error");
        });
      });
    }

    // Save Fees Matrix
    var setupSaveFeesBtn = document.getElementById('setup-save-fees-btn');
    if (setupSaveFeesBtn) {
      setupSaveFeesBtn.addEventListener('click', async function() {
        if (sessionStorage.getItem("isImpersonating") === "true") {
          SchoolApp.showToast("View-only mode. Edits blocked during impersonation.", "warning");
          return;
        }
        
        var settings = SchoolApp.store.settings;
        if (!settings.feeStructure) settings.feeStructure = {};
        if (!SchoolApp.store.feeStructures) SchoolApp.store.feeStructures = {};
        
        var isValid = true;
        var inputs = document.querySelectorAll('.fees-class-fee-input');
        inputs.forEach(function(input) {
          var c = input.getAttribute('data-class');
          var h = input.getAttribute('data-head');
          var val = parseFloat(input.value) || 0;
          if (val < 0) {
            isValid = false;
          } else {
            if (!settings.feeStructure[c]) settings.feeStructure[c] = {};
            settings.feeStructure[c][h] = val;
 
            // Also sync to legacy feeStructures
            if (!SchoolApp.store.feeStructures[c]) SchoolApp.store.feeStructures[c] = {};
            SchoolApp.store.feeStructures[c][h] = val;
          }
        });
        
        if (!isValid) {
          SchoolApp.showToast("Fee amounts must be positive numbers.", "error");
          return;
        }
        
        setupSaveFeesBtn.disabled = true;
        var originalHTML = setupSaveFeesBtn.innerHTML;
        setupSaveFeesBtn.innerHTML = '<span class="material-icons-round">sync</span> Saving...';
        
        SchoolApp.createRestorePoint('Backup before saving fee structure');
        var success = await SchoolApp.save();
        
        setupSaveFeesBtn.disabled = false;
        setupSaveFeesBtn.innerHTML = originalHTML;
        
        if (success) {
          alert("Fee changes apply to NEW bills only. Existing dues are unchanged.");
          SchoolApp.showToast("Fee Structure saved successfully!", "success");
        }
      });
    }
 
    // Add Charge
    var setupAddChargeBtn = document.getElementById('setup-add-charge-btn');
    if (setupAddChargeBtn) {
      setupAddChargeBtn.addEventListener('click', function() {
        if (sessionStorage.getItem("isImpersonating") === "true") {
          SchoolApp.showToast("View-only mode. Edits blocked during impersonation.", "warning");
          return;
        }
        
        var nameInput = document.getElementById('setup-charge-name');
        var amtInput = document.getElementById('setup-charge-amount');
        var typeSelect = document.getElementById('setup-charge-type');
        
        var name = nameInput ? nameInput.value.trim() : '';
        var amount = amtInput ? parseFloat(amtInput.value) : 0;
        var type = typeSelect ? typeSelect.value : 'one-time';
        
        if (!name) {
          SchoolApp.showToast("Charge Name is required.", "error");
          return;
        }
        if (isNaN(amount) || amount <= 0) {
          SchoolApp.showToast("Amount must be a positive number.", "error");
          return;
        }
        
        var settings = SchoolApp.store.settings;
        if (!settings.extraCharges) settings.extraCharges = [];
        
        settings.extraCharges.push({
          id: 'charge_' + Date.now(),
          name: name,
          amount: amount,
          type: type
        });
        
        if (nameInput) nameInput.value = '';
        if (amtInput) amtInput.value = '';
        
        renderFeesCharges();
        SchoolApp.showToast("Extra charge added.", "success");
      });
    }
 
    // Save Charges List
    var setupSaveChargesBtn = document.getElementById('setup-save-charges-btn');
    if (setupSaveChargesBtn) {
      setupSaveChargesBtn.addEventListener('click', async function() {
        if (sessionStorage.getItem("isImpersonating") === "true") {
          SchoolApp.showToast("View-only mode. Edits blocked during impersonation.", "warning");
          return;
        }
        
        setupSaveChargesBtn.disabled = true;
        var originalHTML = setupSaveChargesBtn.innerHTML;
        setupSaveChargesBtn.innerHTML = '<span class="material-icons-round">sync</span> Saving...';
        
        var success = await SchoolApp.save();
        
        setupSaveChargesBtn.disabled = false;
        setupSaveChargesBtn.innerHTML = originalHTML;
        
        if (success) {
          SchoolApp.showToast("Extra Charges saved successfully!", "success");
        }
      });
    }

    // Source class change event listener
    var sourceSelect = document.getElementById('promotion-source-class');
    if (sourceSelect) {
      sourceSelect.addEventListener('change', function() {
        var srcCls = this.value;
        state.promotionSourceClass = srcCls;
        updateDestinationClassSelection(srcCls);
        renderPromotionStudentList(srcCls);
      });
    }

    var destSelect = document.getElementById('promotion-dest-class');
    if (destSelect) {
      destSelect.addEventListener('change', function() {
        state.promotionDestClass = this.value;
      });
    }

    // Auto-render checklist if source class is pre-selected on load/re-render
    if (state.activeTab === 'promotion' && state.promotionSourceClass) {
      renderPromotionStudentList(state.promotionSourceClass);
    }

    // Promote selected button listener
    var promoteBtn = document.getElementById('promote-selected-btn');
    if (promoteBtn) {
      promoteBtn.addEventListener('click', function() {
        var srcCls = state.promotionSourceClass;
        var destCls = state.promotionDestClass;
        
        if (!srcCls || !destCls) {
          SchoolApp.showToast('Please select source and destination classes.', 'error');
          return;
        }

        if (srcCls === destCls) {
          SchoolApp.showToast('Source and Destination classes must be different.', 'error');
          return;
        }

        var checkedCbs = document.querySelectorAll('.promotion-student-cb:checked');
        if (checkedCbs.length === 0) {
          SchoolApp.showToast('No students selected for promotion.', 'error');
          return;
        }

        var studentIds = [];
        checkedCbs.forEach(function(cb) {
          studentIds.push(cb.value);
        });

        var displaySource = ['Nursery','LKG','UKG'].indexOf(srcCls) !== -1 ? srcCls : 'Class ' + srcCls;
        var displayDest = destCls === 'Graduated' ? 'Graduated' : (['Nursery','LKG','UKG'].indexOf(destCls) !== -1 ? destCls : 'Class ' + destCls);

        SchoolApp.showConfirm(
          'Promote ' + studentIds.length + ' students from ' + displaySource + ' to ' + displayDest + '? This will update their class records.',
          function() {
            // Take backup snapshot first
            SchoolApp.createRestorePoint('Auto-Backup before Academic Transition from ' + srcCls + ' to ' + displayDest);
            
            var students = SchoolApp.store.students || [];
            var promotedCount = 0;
            
            studentIds.forEach(function(sId) {
              var sObj = students.find(function(s) { return s.id === sId; });
              if (sObj) {
                if (destCls === 'Graduated') {
                  sObj.status = 'Graduated';
                } else {
                  sObj.class = destCls;
                }
                promotedCount++;
              }
            });
            
            // Clear selections
            state.promotionSourceClass = '';
            state.promotionDestClass = '';
            
            SchoolApp.save();
            SchoolApp.showToast('Successfully promoted ' + promotedCount + ' students!', 'success');
            
            // Re-render
            render();
          },
          'Confirm Promotion'
        );
      });
    }

    // Theme change listener
    var themeSelect = document.querySelector('select[name="theme"]');
    if (themeSelect) {
      themeSelect.addEventListener('change', function() {
        var theme = this.value;
        if (theme === 'light') {
          document.body.classList.add('light-theme');
          document.documentElement.classList.add('light-theme');
          localStorage.setItem('erp_theme_preference', 'light');
          if (SchoolApp.currentUser && SchoolApp.currentUser.id) {
            localStorage.setItem('erp_theme_preference_' + SchoolApp.currentUser.id, 'light');
          }
        } else {
          document.body.classList.remove('light-theme');
          document.documentElement.classList.remove('light-theme');
          localStorage.setItem('erp_theme_preference', 'dark');
          if (SchoolApp.currentUser && SchoolApp.currentUser.id) {
            localStorage.setItem('erp_theme_preference_' + SchoolApp.currentUser.id, 'dark');
          }
        }
        var themeIcon = document.getElementById('app-theme-icon');
        if (themeIcon) {
          themeIcon.textContent = (theme === 'light') ? 'dark_mode' : 'light_mode';
        }
      });
    }

    // Save settings
    var saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        var form = document.getElementById('settings-form');
        if (!form) return;

        if (sessionStorage.getItem("isImpersonating") === "true") {
          SchoolApp.showToast("View-only mode. Edits blocked during impersonation.", "warning");
          return;
        }

        // Disable button and show saving text
        saveBtn.disabled = true;
        var originalBtnHTML = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span class="material-icons-round">sync</span> Saving...';

        if (!SchoolApp.store.settings) SchoolApp.store.settings = {};

        // Upload logo if selected
        const logoFile = document.getElementById("logo-file-input")?.files[0];
        if (logoFile) {
          SchoolApp.showLoader('Uploading logo...');
          try {
            const uploadedLogo = await StorageUtils.uploadSchoolLogo(logoFile, SchoolApp.store.currentSchoolId, "logo-progress");
            if (uploadedLogo) {
              SchoolApp.store.settings.logoUrl = uploadedLogo;
              SchoolApp.store.settings.schoolLogo = uploadedLogo;
            } else {
              // Fallback to base64 preview data URL
              const logoPreview = document.getElementById("logo-preview");
              if (logoPreview && logoPreview.src && logoPreview.src.startsWith("data:image/")) {
                SchoolApp.store.settings.logoUrl = logoPreview.src;
                SchoolApp.store.settings.schoolLogo = logoPreview.src;
              }
            }
          } catch (err) {
            console.warn("Logo upload failed:", err.message);
            // Fallback to base64 preview data URL
            const logoPreview = document.getElementById("logo-preview");
            if (logoPreview && logoPreview.src && logoPreview.src.startsWith("data:image/")) {
              SchoolApp.store.settings.logoUrl = logoPreview.src;
              SchoolApp.store.settings.schoolLogo = logoPreview.src;
            }
          }
        }

        // Validate logo size to prevent Firestore 1MB document limit write failure
        if (SchoolApp.store.settings.logoUrl && SchoolApp.store.settings.logoUrl.startsWith("data:") && SchoolApp.store.settings.logoUrl.length > 500000) {
          SchoolApp.hideLoader();
          SchoolApp.showToast("Logo file too large even after compression. Please use a smaller/simpler image.", "error");
          saveBtn.disabled = false;
          saveBtn.innerHTML = originalBtnHTML;
          return;
        }

        SchoolApp.showLoader('Saving settings...');

        var inputs = form.querySelectorAll('input[name], select[name], textarea[name]');
        inputs.forEach(function(input) {
          SchoolApp.store.settings[input.name] = input.value.trim();
        });

        // Sync settings to settings.schoolInfo
        var s = SchoolApp.store.settings;
        if (s.schoolLogo && !s.logoUrl) s.logoUrl = s.schoolLogo;
        if (s.logoUrl && !s.schoolLogo) s.schoolLogo = s.logoUrl;

        if (!s.schoolInfo) s.schoolInfo = {};
        s.schoolInfo.name = s.schoolName || '';
        s.schoolInfo.tagline = s.tagline || '';
        s.schoolInfo.phone = s.phone || '';
        s.schoolInfo.email = s.email || '';
        s.schoolInfo.logoUrl = s.logoUrl || '';
        s.schoolInfo.schoolLogo = s.logoUrl || '';
        s.schoolInfo.affiliation = s.affiliation || '';
        s.schoolInfo.address = s.address || '';
        s.schoolInfo.udiseCode = s.udiseCode || '';

        s.website = document.getElementById('school-website') ? document.getElementById('school-website').value.trim() : (s.website || '');
        s.schoolInfo.website = s.website;
        s.upiId = document.getElementById('school-upi-id') ? document.getElementById('school-upi-id').value.trim() : (s.upiId || '');
        s.schoolInfo.upiId = s.upiId;
        s.phone = s.schoolInfo.phone;
        s.email = s.schoolInfo.email;
        s.address = s.schoolInfo.address;

        // Parse geofence settings
        var latVal = parseFloat(document.getElementById('geofence-lat').value);
        var lngVal = parseFloat(document.getElementById('geofence-lng').value);
        var radiusVal = parseFloat(document.getElementById('geofence-radius').value) || 200;

        if (!isNaN(latVal) && !isNaN(lngVal)) {
          s.geofence = {
            lat: latVal,
            lng: lngVal,
            radius: radiusVal
          };
        } else {
          s.geofence = null;
        }

        // Save to Firestore and verify success
        var success = await SchoolApp.save(true);
        SchoolApp.hideLoader();
        
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalBtnHTML;

        if (success) {
          SchoolApp.showToast('Settings saved successfully!', 'success');
        }
      });
    }

    // Reset settings
    var resetSettingsBtn = document.getElementById('reset-settings-btn');
    if (resetSettingsBtn) {
      resetSettingsBtn.addEventListener('click', function() {
        SchoolApp.showConfirm('Reset all settings to defaults?', function() {
          SchoolApp.store.settings = {
            schoolName: 'Shishu Vikash Mandir',
            academicYear: '2025-2026',
            address: '123 Education Lane, Knowledge City, Karnataka 560001',
            phone: '+91 98765 43210',
            email: 'bhanu.bharti@ctrlshifts.in',
            classes: ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
            sections: ['A','B','C'],
            attendanceTime: '09:00',
            theme: 'dark',
            adminUsername: 'admin',
            adminPassword: 'admin123',
            enableCloudSync: false,
            firebaseConfig: ''
          };
          document.body.classList.remove('light-theme');
          document.documentElement.classList.remove('light-theme');
          localStorage.setItem('erp_theme_preference', 'dark');
          if (SchoolApp.currentUser && SchoolApp.currentUser.id) {
            localStorage.setItem('erp_theme_preference_' + SchoolApp.currentUser.id, 'dark');
          }
          var themeIcon = document.getElementById('app-theme-icon');
          if (themeIcon) themeIcon.textContent = 'light_mode';
          SchoolApp.save();
          SchoolApp.showToast('Settings reset to defaults.', 'info');
          render();
        });
      });
    }

    // Save admin credentials
    var saveAdminCreds = document.getElementById('save-admin-creds');
    if (saveAdminCreds) {
      saveAdminCreds.addEventListener('click', async function() {
        var form = document.getElementById('admin-creds-form');
        var username = form.querySelector('[name="adminUsername"]').value.trim();
        var password = form.querySelector('[name="adminPassword"]').value.trim();
        if (username && password.length >= 4) {
          SchoolApp.store.settings.adminUsername = username;
          if (password && !AuthUtils.isHashed(password)) {
            SchoolApp.store.settings.adminPassword = await AuthUtils.hashPassword(password);
          } else {
            SchoolApp.store.settings.adminPassword = password;
          }
          await SchoolApp.save();
          SchoolApp.showToast('Admin credentials updated.', 'success');
        } else {
          SchoolApp.showToast('Username required, password min 4 characters.', 'error');
        }
      });
    }

    // Reset password buttons
    document.querySelectorAll('.reset-pw-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var teacher = SchoolApp.store.teachers.find(function(t) { return t.id === id; });
        if (!teacher) return;

        var chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        var newPw = '';
        for (var i = 0; i < 8; i++) newPw += chars.charAt(Math.floor(Math.random() * chars.length));

        teacher.password = newPw;
        SchoolApp.save();

        SchoolApp.showModal('Password Reset', '<div class="text-center"><div style="font-size:48px;margin-bottom:16px">🔑</div><p>New password for <strong>' + teacher.firstName + ' ' + teacher.lastName + '</strong>:</p><div style="font-family:monospace;font-size:24px;padding:16px;background:var(--bg-tertiary);border:1px solid var(--border-light);border-radius:8px;margin:16px 0;letter-spacing:2px;text-align:center"><strong>' + newPw + '</strong></div><p style="color:var(--text-muted);font-size:13px">Please share this password securely with the teacher.</p></div>',
          '<button class="btn btn-primary" onclick="SchoolApp.closeModal()">Done</button>');
      });
    });

    // Toggle status buttons
    document.querySelectorAll('.toggle-status-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var teacher = SchoolApp.store.teachers.find(function(t) { return t.id === id; });
        if (!teacher) return;
        teacher.status = teacher.status === 'Active' ? 'Inactive' : 'Active';
        SchoolApp.save();
        SchoolApp.showToast('Teacher status updated to ' + teacher.status + '.', 'success');
        render();
      });
    });

    // Check Exam Access diagnostic buttons
    document.querySelectorAll('.check-exam-access-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        showExamAccessDiagnostic(id);
      });
    });

    // Bulk reset passwords
    var bulkResetBtn = document.getElementById('bulk-reset-passwords');
    if (bulkResetBtn) {
      bulkResetBtn.addEventListener('click', function() {
        SchoolApp.showConfirm('Reset passwords for ALL teachers to "teacher123"?', function() {
          SchoolApp.store.teachers.forEach(function(t) { t.password = 'teacher123'; });
          SchoolApp.save();
          SchoolApp.showToast('All teacher passwords reset to "teacher123".', 'success');
        });
      });
    }

    // Export JSON
    var exportJsonBtn = document.getElementById('export-json-btn');
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', function() {
        var dateStr = new Date().toISOString().split('T')[0];
        SchoolApp.utils.downloadJSON(SchoolApp.store, 'shishuvikash_backup_' + dateStr + '.json');
        SchoolApp.showToast('Full backup exported.', 'success');
      });
    }

    // Import JSON
    var importJsonBtn = document.getElementById('import-json-btn');
    if (importJsonBtn) {
      importJsonBtn.addEventListener('click', function() {
        document.getElementById('admin-json-input').click();
      });
    }

    var jsonInput = document.getElementById('admin-json-input');
    if (jsonInput) {
      jsonInput.addEventListener('change', function() {
        if (!this.files[0]) return;
        var file = this.files[0];
        SchoolApp.showConfirm('Restoring from backup will OVERWRITE all current data. Continue?', function() {
          SchoolApp.createRestorePoint('Auto-Backup before JSON Import');
          SchoolApp.utils.importJSON(file, async function(data) {
            if (data && data.students && data.teachers) {
              SchoolApp.store = data;
              SchoolApp.showLoader('Restoring data...');
              var success = await SchoolApp.save(true);
              SchoolApp.hideLoader();
              if (success) {
                SchoolApp.showToast('Data restored successfully! Reloading...', 'success');
                setTimeout(function() { location.reload(); }, 1000);
              }
            } else {
              SchoolApp.showToast('Invalid backup file format.', 'error');
            }
          });
        });
        this.value = '';
      });
    }

    // Export Students Excel
    var exportStudentsBtn = document.getElementById('export-students-btn');
    if (exportStudentsBtn) {
      exportStudentsBtn.addEventListener('click', function() {
        var cols = [
          { header: 'First Name', key: 'firstName' }, { header: 'Last Name', key: 'lastName' },
          { header: 'Class', key: 'class' }, { header: 'Section', key: 'section' },
          { header: 'Roll Number', key: 'rollNumber' }, { header: 'DOB', key: 'dateOfBirth' },
          { header: 'Gender', key: 'gender' }, { header: 'Aadhaar', key: 'aadhaarNumber' },
          { header: 'Parent Name', key: 'parentName' }, { header: 'Parent Phone', key: 'parentPhone' },
          { header: 'Status', key: 'status' }
        ];
        SchoolApp.utils.exportToExcel(SchoolApp.store.students, cols, 'students_export_' + new Date().toISOString().split('T')[0] + '.xlsx');
      });
    }

    // Export Teachers Excel
    var exportTeachersBtn = document.getElementById('export-teachers-btn');
    if (exportTeachersBtn) {
      exportTeachersBtn.addEventListener('click', function() {
        var cols = [
          { header: 'First Name', key: 'firstName' }, { header: 'Last Name', key: 'lastName' },
          { header: 'Email', key: 'email' }, { header: 'Phone', key: 'phone' },
          { header: 'Subject', key: 'subject' }, { header: 'Qualification', key: 'qualification' },
          { header: 'Classes', key: 'assignedClasses', transform: function(v) { return (v||[]).map(function(c){return c.class+'-'+c.section}).join(', '); } },
          { header: 'Status', key: 'status' }
        ];
        SchoolApp.utils.exportToExcel(SchoolApp.store.teachers, cols, 'teachers_export_' + new Date().toISOString().split('T')[0] + '.xlsx');
      });
    }

    // Export Attendance Excel
    var exportAttendanceBtn = document.getElementById('export-attendance-btn');
    if (exportAttendanceBtn) {
      exportAttendanceBtn.addEventListener('click', function() {
        var data = SchoolApp.store.attendance.map(function(a) {
          var teacher = SchoolApp.store.teachers.find(function(t) { return t.id === a.teacherId; });
          var present = a.records.filter(function(r) { return r.status === 'present'; }).length;
          var absent = a.records.filter(function(r) { return r.status === 'absent'; }).length;
          var late = a.records.filter(function(r) { return r.status === 'late'; }).length;
          return {
            date: a.date, class: a.class, section: a.section,
            teacher: teacher ? teacher.firstName + ' ' + teacher.lastName : 'Unknown',
            total: a.records.length, present: present, absent: absent, late: late,
            percentage: a.records.length > 0 ? Math.round(((present+late)/a.records.length)*100) + '%' : '0%'
          };
        });
        var cols = [
          { header: 'Date', key: 'date' }, { header: 'Class', key: 'class' },
          { header: 'Section', key: 'section' }, { header: 'Teacher', key: 'teacher' },
          { header: 'Total', key: 'total' }, { header: 'Present', key: 'present' },
          { header: 'Absent', key: 'absent' }, { header: 'Late', key: 'late' },
          { header: 'Attendance %', key: 'percentage' }
        ];
        SchoolApp.utils.exportToExcel(data, cols, 'attendance_export_' + new Date().toISOString().split('T')[0] + '.xlsx');
      });
    }

    // Import Students Excel
    var importStudentsBtn = document.getElementById('import-students-btn');
    if (importStudentsBtn) {
      importStudentsBtn.addEventListener('click', function() {
        document.getElementById('admin-excel-input').click();
      });
    }

    var excelInput = document.getElementById('admin-excel-input');
    if (excelInput) {
      excelInput.addEventListener('change', function() {
        if (!this.files[0]) return;
        SchoolApp.utils.importFromExcel(this.files[0], function(data) {
          var mapping = {
            'First Name': 'firstName', 'Last Name': 'lastName', 'Class': 'class',
            'Section': 'section', 'Roll Number': 'rollNumber', 'DOB': 'dateOfBirth',
            'Gender': 'gender', 'Aadhaar': 'aadhaarNumber', 'Parent Name': 'parentName',
            'Parent Phone': 'parentPhone', 'Status': 'status',
            'firstName': 'firstName', 'lastName': 'lastName', 'class': 'class',
            'section': 'section', 'rollNumber': 'rollNumber', 'dateOfBirth': 'dateOfBirth',
            'gender': 'gender', 'aadhaarNumber': 'aadhaarNumber', 'parentName': 'parentName',
            'parentPhone': 'parentPhone', 'status': 'status'
          };
          var imported = 0;
          (data || []).forEach(function(row) {
            var student = { id: SchoolApp.generateId(), status: 'Active' };
            Object.keys(row).forEach(function(key) {
              if (mapping[key]) student[mapping[key]] = String(row[key]).trim();
            });
            if (student.firstName && student.class) {
              SchoolApp.store.students.push(student);
              imported++;
            }
          });
          SchoolApp.save();
          SchoolApp.showToast('Imported ' + imported + ' students.', 'success');
          render();
        });
        this.value = '';
      });
    }

    // Seed Demo Exam Data
    var seedDemoBtn = document.getElementById('seed-demo-exam-btn');
    if (seedDemoBtn) {
      seedDemoBtn.addEventListener('click', function() {
        SchoolApp.showConfirm('This will create a demo exam term (if not exists) with subjects and marks for ALL existing students. Use this for sales demos only. Continue?', function() {
          generateDemoExamData();
        });
      });
    }

    // Clear Demo Exam Data
    var clearDemoBtn = document.getElementById('clear-demo-exam-btn');
    if (clearDemoBtn) {
      clearDemoBtn.addEventListener('click', function() {
        clearDemoExamData();
      });
    }

    // Reset attendance
    var resetAttBtn = document.getElementById('reset-attendance-btn');
    if (resetAttBtn) {
      resetAttBtn.addEventListener('click', function() {
        SchoolApp.showConfirm('Delete ALL attendance records? This cannot be undone.', function() {
          SchoolApp.createRestorePoint('Auto-Backup before Reset Attendance');
          SchoolApp.store.attendance = [];
          SchoolApp.save();
          SchoolApp.showToast('All attendance data cleared.', 'warning');
          render();
        });
      });
    }

    // Reset all data
    var resetAllBtn = document.getElementById('reset-all-btn');
    if (resetAllBtn) {
      resetAllBtn.addEventListener('click', function() {
        SchoolApp.showConfirm('This will DELETE ALL DATA and reset the application. This CANNOT be undone. Are you absolutely sure?', function() {
          SchoolApp.createRestorePoint('Auto-Backup before Complete Database Reset');
          SchoolApp.store.students = [];
          SchoolApp.store.teachers = [];
          SchoolApp.store.attendance = [];
          SchoolApp.store.trash = [];
          SchoolApp.store.fees = [];
          SchoolApp.store.marks = [];
          SchoolApp.store.notices = [];
          SchoolApp.store.timetable = {};
          if (SchoolApp.store.currentSchoolId === 'svm_bokaro_001') {
            SchoolApp.generateDemoData();
          }
          SchoolApp.save().then(function() {
            SchoolApp.showToast('All data reset. Reloading...', 'warning');
            setTimeout(function() { location.reload(); }, 1500);
          }).catch(function(err) {
            console.error('Failed to save reset state:', err);
            SchoolApp.showToast('Reset failed on cloud storage.', 'error');
          });
        }, 'Reset All Data');
      });
    }

    // --- Recycle Bin Handlers ---

    // Restore Item
    document.querySelectorAll('.restore-trash-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var trash = SchoolApp.store.trash || [];
        var idx = trash.findIndex(function(x) { return x.id === id; });
        if (idx === -1) return;
        var item = trash[idx];

        SchoolApp.showConfirm('Restore ' + item.type + ' "' + item.name + '"?', function() {
          // Restore to corresponding array
          if (item.type === 'student') {
            SchoolApp.store.students.push(item.data);
          } else if (item.type === 'teacher') {
            SchoolApp.store.teachers.push(item.data);
          } else if (item.type === 'attendance') {
            SchoolApp.store.attendance.push(item.data);
          }

          // Remove from trash
          SchoolApp.store.trash.splice(idx, 1);
          SchoolApp.save();
          SchoolApp.showToast('"' + item.name + '" restored successfully!', 'success');
          render();
        });
      });
    });

    // Delete Permanently
    document.querySelectorAll('.delete-trash-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var trash = SchoolApp.store.trash || [];
        var idx = trash.findIndex(function(x) { return x.id === id; });
        if (idx === -1) return;
        var item = trash[idx];

        SchoolApp.showConfirm('Permanently delete ' + item.type + ' "' + item.name + '"? This CANNOT be undone.', function() {
          // Remove from trash
          SchoolApp.store.trash.splice(idx, 1);
          SchoolApp.save();
          SchoolApp.showToast('"' + item.name + '" permanently deleted.', 'warning');
          render();
        });
      });
    });

    // Empty Recycle Bin
    var emptyTrashBtn = document.getElementById('empty-trash-btn');
    if (emptyTrashBtn) {
      emptyTrashBtn.addEventListener('click', function() {
        SchoolApp.showConfirm('Empty the Recycle Bin? All items will be PERMANENTLY deleted.', function() {
          SchoolApp.store.trash = [];
          SchoolApp.save();
          SchoolApp.showToast('Recycle Bin emptied.', 'warning');
          render();
        });
      });
    }

    // --- Restore Point Handlers ---

    // Create Manual Snapshot
    var createRpBtn = document.getElementById('create-manual-rp-btn');
    if (createRpBtn) {
      createRpBtn.addEventListener('click', function() {
        var bodyHTML = '<div class="form-group"><label class="form-label">Snapshot Description *</label>';
        bodyHTML += '<input type="text" id="manual-rp-desc" class="form-input" placeholder="e.g. Before editing student list" value="Manual Database Backup">';
        bodyHTML += '</div>';

        var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
        footerHTML += '<button class="btn btn-primary" id="save-manual-rp-btn">Create Snapshot</button>';

        SchoolApp.showModal('Create Database Snapshot', bodyHTML, footerHTML);

        var saveBtn = document.getElementById('save-manual-rp-btn');
        if (saveBtn) {
          saveBtn.addEventListener('click', function() {
            var desc = document.getElementById('manual-rp-desc').value.trim();
            if (!desc) desc = 'Manual Backup';
            SchoolApp.createRestorePoint(desc);
            SchoolApp.closeModal();
            SchoolApp.showToast('Database snapshot created!', 'success');
            render();
          });
        }
      });
    }

    // Rollback to Snapshot
    document.querySelectorAll('.rollback-rp-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var existing = localStorage.getItem('shishuvikash_restore_points');
        if (!existing) return;
        var restorePoints = JSON.parse(existing);
        var rp = restorePoints.find(function(r) { return r.id === id; });
        if (!rp) return;

        SchoolApp.showConfirm('Rollback database to snapshot "' + rp.description + '"? Current changes will be overwritten.', async function() {
          // Backup current state first, just in case!
          SchoolApp.createRestorePoint('Auto-Backup before Rollback to ' + rp.description);
          
          SchoolApp.store = rp.store;
          SchoolApp.showLoader('Rolling back database...');
          var success = await SchoolApp.save(true);
          SchoolApp.hideLoader();
          if (success) {
            SchoolApp.showToast('Database rolled back successfully! Reloading...', 'success');
            setTimeout(function() { location.reload(); }, 1000);
          }
        });
      });
    });

    // Delete Snapshot
    document.querySelectorAll('.delete-rp-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var existing = localStorage.getItem('shishuvikash_restore_points');
        if (!existing) return;
        var restorePoints = JSON.parse(existing);
        var idx = restorePoints.findIndex(function(r) { return r.id === id; });
        if (idx === -1) return;

        SchoolApp.showConfirm('Delete snapshot "' + restorePoints[idx].description + '"?', function() {
          restorePoints.splice(idx, 1);
          localStorage.setItem('shishuvikash_restore_points', JSON.stringify(restorePoints));
          SchoolApp.showToast('Snapshot deleted.', 'info');
          render();
        });
      });
    });

    // --- Fee Setup Handlers ---

    // Add Fee Head
    var addFeeHeadBtn = document.getElementById('admin-add-feehead-btn');
    if (addFeeHeadBtn) {
      addFeeHeadBtn.addEventListener('click', function() {
        var bodyHTML = '<div class="form-group"><label class="form-label">Fee Head Name *</label>';
        bodyHTML += '<input type="text" id="admin-feehead-name" class="form-input" placeholder="e.g. Library Fee, Computer Fee" list="fee-head-suggestions">';
        bodyHTML += '</div>';

        var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
        footerHTML += '<button class="btn btn-primary" id="admin-save-feehead-btn">Add Fee Head</button>';

        SchoolApp.showModal('Add Customizable Fee Head', bodyHTML, footerHTML);

        var saveBtn = document.getElementById('admin-save-feehead-btn');
        if (saveBtn) {
          saveBtn.addEventListener('click', async function() {
            var name = document.getElementById('admin-feehead-name').value.trim();
            if (!name) {
              SchoolApp.showToast('Please enter a fee head name.', 'error');
              return;
            }
            var settings = SchoolApp.store.settings || {};
            if (!settings.feeHeads) settings.feeHeads = [];

            // Case-insensitive duplicate check
            var exists = settings.feeHeads.some(function(fh) {
              return fh.name.toLowerCase() === name.toLowerCase();
            });
            if (exists) {
              SchoolApp.showToast('Fee Head already exists.', 'error');
              return;
            }

            var id = 'fh_' + Date.now().toString(36);
            settings.feeHeads.push({ id: id, name: name });
            SchoolApp.store.feeHeads = settings.feeHeads; // sync back

            // Initialize matrix column to 0 for all classes
            if (!settings.feeStructure) settings.feeStructure = {};
            var classes = settings.classes || [];
            classes.forEach(function(c) {
              if (!settings.feeStructure[c]) settings.feeStructure[c] = {};
              settings.feeStructure[c][id] = 0;
            });
            
            saveBtn.disabled = true;
            saveBtn.textContent = 'Adding...';
            var success = await SchoolApp.save();
            saveBtn.disabled = false;
            saveBtn.textContent = 'Add Fee Head';
            
            if (success) {
              SchoolApp.closeModal();
              SchoolApp.showToast('Fee Head added successfully!', 'success');
              render();
            }
          });
        }
      });
    }

    // Edit Fee Head
    document.querySelectorAll('.admin-edit-feehead-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var settings = SchoolApp.store.settings || {};
        var feeHeads = settings.feeHeads || [];
        var fh = feeHeads.find(function(x) { return x.id === id; });
        if (!fh) return;

        var bodyHTML = '<div class="form-group"><label class="form-label">Fee Head Name *</label>';
        bodyHTML += '<input type="text" id="admin-edit-feehead-name" class="form-input" value="' + fh.name + '" list="fee-head-suggestions">';
        bodyHTML += '</div>';

        var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
        footerHTML += '<button class="btn btn-primary" id="admin-update-feehead-btn">Save Changes</button>';

        SchoolApp.showModal('Rename Fee Head', bodyHTML, footerHTML);

        var updateBtn = document.getElementById('admin-update-feehead-btn');
        if (updateBtn) {
          updateBtn.addEventListener('click', async function() {
            var name = document.getElementById('admin-edit-feehead-name').value.trim();
            if (!name) {
              SchoolApp.showToast('Please enter a name.', 'error');
              return;
            }
            fh.name = name;
            SchoolApp.store.feeHeads = feeHeads; // sync back
            
            updateBtn.disabled = true;
            updateBtn.textContent = 'Saving...';
            var success = await SchoolApp.save();
            updateBtn.disabled = false;
            updateBtn.textContent = 'Save Changes';
            
            if (success) {
              SchoolApp.closeModal();
              SchoolApp.showToast('Fee Head updated successfully!', 'success');
              render();
            }
          });
        }
      });
    });

    // Delete Fee Head
    document.querySelectorAll('.admin-delete-feehead-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var settings = SchoolApp.store.settings || {};
        var feeHeads = settings.feeHeads || [];
        var idx = feeHeads.findIndex(function(x) { return x.id === id; });
        if (idx === -1) return;
        var fh = feeHeads[idx];

        // Check if amounts exist in the matrix
        var hasAmount = false;
        var feeStructure = settings.feeStructure || {};
        Object.keys(feeStructure).forEach(function(cls) {
          var amt = parseFloat(feeStructure[cls][id]);
          if (amt && amt > 0) {
            hasAmount = true;
          }
        });

        var confirmMsg = 'Delete Customizable Fee Head "' + fh.name + '"? This will remove it from all class structures.';
        if (hasAmount) {
          confirmMsg = 'WARNING: Fee amounts already exist in the matrix for "' + fh.name + '". Deleting it will permanently remove these amounts. Are you sure you want to proceed?';
        }

        SchoolApp.showConfirm(confirmMsg, async function() {
          // Remove from fee structures
          var classes = settings.classes || [];
          classes.forEach(function(cls) {
            if (settings.feeStructure && settings.feeStructure[cls]) {
              delete settings.feeStructure[cls][id];
            }
            if (SchoolApp.store.feeStructures && SchoolApp.store.feeStructures[cls]) {
              delete SchoolApp.store.feeStructures[cls][id];
            }
          });
          
          feeHeads.splice(idx, 1);
          settings.feeHeads = feeHeads;
          SchoolApp.store.feeHeads = feeHeads; // sync back
          
          SchoolApp.showLoader('Deleting fee head...');
          var success = await SchoolApp.save(true);
          SchoolApp.hideLoader();
          
          if (success) {
            SchoolApp.showToast('Fee Head deleted.', 'warning');
            render();
          }
        });
      });
    });

    // Edit Class default fee structures
    document.querySelectorAll('.admin-edit-feestruct-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var cls = this.getAttribute('data-class');
        var settings = SchoolApp.store.settings || {};
        var classFees = (settings.feeStructure && settings.feeStructure[cls]) || (SchoolApp.store.feeStructures || {})[cls] || {};
        var feeHeads = settings.feeHeads || [];

        var bodyHTML = '<form id="class-fee-form" class="form-grid">';
        feeHeads.forEach(function(fh) {
          var amt = classFees[fh.id] || '0';
          bodyHTML += '<div class="form-group"><label class="form-label">' + fh.name + ' (₹) *</label>';
          bodyHTML += '<input type="number" name="' + fh.id + '" class="form-input" value="' + amt + '" min="0" step="1" required>';
          bodyHTML += '</div>';
        });
        bodyHTML += '</form>';

        var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
        footerHTML += '<button class="btn btn-primary" id="admin-save-feestruct-btn">Save Structure</button>';

        var displayClass = ['Nursery','LKG','UKG'].indexOf(cls) !== -1 ? cls : 'Class ' + cls;
        SchoolApp.showModal('Configure default fees for ' + displayClass, bodyHTML, footerHTML);

        var saveBtn = document.getElementById('admin-save-feestruct-btn');
        if (saveBtn) {
          saveBtn.addEventListener('click', async function() {
            var form = document.getElementById('class-fee-form');
            if (!form) return;
            
            var inputs = form.querySelectorAll('input[name]');
            var newFees = {};
            var isValid = true;
            
            inputs.forEach(function(input) {
              var val = input.value.trim();
              if (val === '' || parseFloat(val) < 0) {
                isValid = false;
              } else {
                newFees[input.name] = val;
              }
            });

            if (!isValid) {
              SchoolApp.showToast('Please enter valid, non-negative amounts.', 'error');
              return;
            }

            if (!SchoolApp.store.feeStructures) SchoolApp.store.feeStructures = {};
            SchoolApp.store.feeStructures[cls] = newFees;

            // Sync to settings.feeStructure
            if (!settings.feeStructure) settings.feeStructure = {};
            settings.feeStructure[cls] = {};
            Object.keys(newFees).forEach(function(key) {
              settings.feeStructure[cls][key] = parseFloat(newFees[key]) || 0;
            });

            // Propagate updated fees to all students in this class
            var students = SchoolApp.store.students || [];
            var classStudents = students.filter(function(s) { return s.class === cls; });
            
            if (!SchoolApp.store.fees) SchoolApp.store.fees = [];
            
            classStudents.forEach(function(s) {
              feeHeads.forEach(function(fh) {
                var newAmt = parseFloat(newFees[fh.id] || 0);
                
                // Find all existing due entries for this student and fee head
                var existingDues = SchoolApp.store.fees.filter(function(f) {
                  return f.studentId === s.id && f.type === 'due' && f.feeHeadId === fh.id;
                });
                
                if (existingDues.length > 0) {
                  // Update all existing matching dues to the new value
                  existingDues.forEach(function(ed) {
                    ed.amount = newAmt;
                  });
                } else if (newAmt > 0) {
                  // Create a new due entry
                  SchoolApp.store.fees.push({
                    id: SchoolApp.generateId(),
                    studentId: s.id,
                    schoolId: SchoolApp.currentSchoolId,
                    type: 'due',
                    feeHeadId: fh.id,
                    amount: newAmt,
                    date: new Date().toISOString().split('T')[0],
                    description: fh.name
                  });
                }
              });
            });

            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            var success = await SchoolApp.save();
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Structure';

            if (success) {
              SchoolApp.closeModal();
              SchoolApp.showToast('Fee structure updated and propagated successfully!', 'success');
              render();
            }
          });
        }
      });
    });
    // --- Exams Tab Handlers ---

    // Setup New Examination Wizard Trigger
    var setupExamWizardBtn = document.getElementById('admin-setup-exam-wizard-btn');
    if (setupExamWizardBtn) {
      setupExamWizardBtn.addEventListener('click', function() {
        openExamSetupWizard();
      });
    }

    // Add Exam Term
    var addExamBtn = document.getElementById('admin-add-examterm-btn');
    if (addExamBtn) {
      addExamBtn.addEventListener('click', function() {
        var bodyHTML = '<div class="form-group"><label class="form-label">Exam Term Name *</label>';
        bodyHTML += '<input type="text" id="admin-examterm-name" class="form-input" placeholder="e.g. Mid-Term, Final Exam">';
        bodyHTML += '</div>';

        var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
        footerHTML += '<button class="btn btn-primary" id="admin-save-examterm-btn">Add Exam Term</button>';

        SchoolApp.showModal('Add Exam Term', bodyHTML, footerHTML);

        var saveBtn = document.getElementById('admin-save-examterm-btn');
        if (saveBtn) {
          saveBtn.addEventListener('click', async function() {
            var name = document.getElementById('admin-examterm-name').value.trim();
            if (!name) {
              SchoolApp.showToast('Please enter an exam term name.', 'error');
              return;
            }
            if (!SchoolApp.store.exams) SchoolApp.store.exams = [];
            var id = 'exam_' + Date.now().toString(36);
            SchoolApp.store.exams.push({ id: id, name: name });

            // Automatically generate notice in database in draft status
            if (!SchoolApp.store.notices) SchoolApp.store.notices = [];
            var noticeId = 'notice_' + Date.now().toString(36) + '_exam';
            SchoolApp.store.notices.push({
              id: noticeId,
              title: 'Upcoming Examination: ' + name,
              message: 'The ' + name + ' examinations have been scheduled. Please start your preparations and consult the teachers for subject syllabi and datesheet details.',
              date: new Date().toISOString().split('T')[0],
              priority: 'Normal',
              status: 'draft'
            });

            saveBtn.disabled = true;
            saveBtn.textContent = 'Adding...';
            var success = await SchoolApp.save();
            saveBtn.disabled = false;
            saveBtn.textContent = 'Add Exam Term';

            if (success) {
              SchoolApp.closeModal();
              SchoolApp.showToast('Exam Term added successfully and notice announcement drafted!', 'success');
              render();
            }
          });
        }
      });
    }

    // Edit Exam Term
    document.querySelectorAll('.admin-edit-examterm-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var idx = SchoolApp.store.exams.findIndex(function(x) { return x.id === id; });
        if (idx === -1) return;
        var ex = SchoolApp.store.exams[idx];

        var bodyHTML = '<div class="form-group"><label class="form-label">Exam Term Name *</label>';
        bodyHTML += '<input type="text" id="admin-edit-examterm-name" class="form-input" value="' + escapeAttr(ex.name) + '" placeholder="e.g. Mid-Term, Final Exam">';
        bodyHTML += '</div>';

        var footerHTML = '<button class="btn btn-secondary" onclick="SchoolApp.closeModal()">Cancel</button>';
        footerHTML += '<button class="btn btn-primary" id="admin-update-examterm-btn">Save Changes</button>';

        SchoolApp.showModal('Edit Exam Term', bodyHTML, footerHTML);

        var updateBtn = document.getElementById('admin-update-examterm-btn');
        if (updateBtn) {
          updateBtn.addEventListener('click', async function() {
            var name = document.getElementById('admin-edit-examterm-name').value.trim();
            if (!name) {
              SchoolApp.showToast('Please enter an exam term name.', 'error');
              return;
            }

            ex.name = name;

            updateBtn.disabled = true;
            updateBtn.textContent = 'Saving...';
            var success = await SchoolApp.save();
            updateBtn.disabled = false;
            updateBtn.textContent = 'Save Changes';

            if (success) {
              SchoolApp.closeModal();
              SchoolApp.showToast('Exam term renamed successfully', 'success');
              render();
            }
          });
        }
      });
    });

    // Delete Exam Term
    document.querySelectorAll('.admin-delete-examterm-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var idx = SchoolApp.store.exams.findIndex(function(x) { return x.id === id; });
        if (idx === -1) return;
        var ex = SchoolApp.store.exams[idx];

        SchoolApp.showConfirm(
          'Are you sure you want to delete ' + ex.name + '? This will also delete all marks and subject data associated with this term. This action cannot be undone.',
          async function() {
            SchoolApp.store.exams.splice(idx, 1);
            
            // Clean up marks associated with this exam term
            if (SchoolApp.store.marks) {
              SchoolApp.store.marks = SchoolApp.store.marks.filter(function(m) {
                return m.examId !== id;
              });
            }

            // Clean up subject mappings associated with this exam term
            if (SchoolApp.store.subjectMapping) {
              Object.keys(SchoolApp.store.subjectMapping).forEach(function(key) {
                if (key.indexOf(id + '_') === 0) {
                  delete SchoolApp.store.subjectMapping[key];
                }
              });
            }

            var success = await SchoolApp.save();
            if (success) {
              SchoolApp.showToast('Exam Term deleted.', 'warning');
              render();
            }
          },
          'Delete Exam Term?'
        );
      });
    });

    // Class selection changed inside examinations tab
    var examClassSelect = document.getElementById('admin-exams-class-select');
    if (examClassSelect) {
      examClassSelect.addEventListener('change', function() {
        state.examsSelectedClass = this.value;
        autoCarryoverSubjects(state.examsSelectedTerm, state.examsSelectedClass);
        render();
      });
    }

    // Term selection changed inside examinations tab
    var examTermSelect = document.getElementById('admin-exams-term-select');
    if (examTermSelect) {
      examTermSelect.addEventListener('change', function() {
        state.examsSelectedTerm = this.value;
        autoCarryoverSubjects(state.examsSelectedTerm, state.examsSelectedClass);
        render();
      });
    }

    // Add Subject to Class
    var addSubBtn = document.getElementById('admin-add-subject-btn');
    if (addSubBtn) {
      addSubBtn.addEventListener('click', function() {
        var cls = this.getAttribute('data-class');
        openAddEditSubjectModal(cls);
      });
    }

    // Edit Subject mapping
    document.querySelectorAll('.admin-edit-subject-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var cls = this.getAttribute('data-class');
        var subId = this.getAttribute('data-sub-id');
        openAddEditSubjectModal(cls, subId);
      });
    });

    // Delete Subject from Class mapping
    document.querySelectorAll('.admin-delete-subject-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var cls = this.getAttribute('data-class');
        var subId = this.getAttribute('data-sub-id');
        var subjects = (SchoolApp.store.subjectMapping || {})[cls] || [];
        var idx = subjects.findIndex(function(x) { return x.id === subId; });
        if (idx === -1) return;
        var sub = subjects[idx];

        var parts = cls.split('_');
        var termId = parts.slice(0, parts.length - 1).join('_');
        var classId = parts[parts.length - 1];

        var termName = (SchoolApp.store.exams.find(function(ex) { return ex.id === termId; }) || { name: termId }).name;
        var className = ['Nursery','LKG','UKG'].indexOf(classId) !== -1 ? classId : 'Class ' + classId;

        SchoolApp.showConfirm('Remove "' + sub.name + '" from ' + className + ' ' + termName + '? This will delete all marks entered for this subject.', function() {
          subjects.splice(idx, 1);

          if (SchoolApp.store.marks) {
            SchoolApp.store.marks.forEach(function(m) {
              if (m.examId === termId && m.class === classId) {
                if (m.scores && m.scores[subId] !== undefined) {
                  delete m.scores[subId];

                  var totalScored = 0;
                  var maxTotal = 0;
                  var passedAll = true;
                  subjects.forEach(function(s) {
                    if (s.id !== subId) {
                      var scoreVal = m.scores[s.id];
                      var score = scoreVal !== undefined && scoreVal !== '' ? parseFloat(scoreVal) : 0;
                      totalScored += score;
                      maxTotal += s.maxMarks;
                      if (score < s.passMarks) passedAll = false;
                    }
                  });

                  m.totalScored = totalScored;
                  m.maxTotal = maxTotal;
                  m.percentage = maxTotal > 0 ? Math.round((totalScored / maxTotal) * 100) : 0;
                  m.grade = calculateGrade(m.percentage);
                  m.status = passedAll ? 'Pass' : 'Fail';
                }
              }
            });
          }

          SchoolApp.save();
          SchoolApp.showToast('Subject removed and student scores updated.', 'warning');
          render();
        });
      });
    });

    // --- Notice Board Tab Handlers ---

    // Submit Notice Form (Add or Edit)
    var noticeForm = document.getElementById('admin-notice-form');
    if (noticeForm) {
      noticeForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        var title = document.getElementById('admin-notice-title').value.trim();
        var message = document.getElementById('admin-notice-message').value.trim();
        var date = document.getElementById('admin-notice-date').value;
        var priority = document.getElementById('admin-notice-priority').value;
        var audienceVal = document.getElementById('admin-notice-audience') ? document.getElementById('admin-notice-audience').value : 'everyone';
        var editId = document.getElementById('admin-notice-edit-id').value;

        if (!title || !message || !date) {
          SchoolApp.showToast('Please fill out all required fields.', 'error');
          return;
        }

        if (!SchoolApp.store.notices) SchoolApp.store.notices = [];
        var audienceArray = [audienceVal]; //Stored as array for future Parent Portal extensibility

        if (editId) {
          // Edit existing notice
          var notice = SchoolApp.store.notices.find(function(n) { return n.id === editId; });
          if (notice) {
            notice.title = title;
            notice.message = message;
            notice.date = date;
            notice.priority = priority;
            notice.audience = audienceArray;
            SchoolApp.showToast('Announcement updated successfully!', 'success');
          }
        } else {
          // Add new notice
          var id = 'notice_' + Date.now().toString(36);
          SchoolApp.store.notices.push({
            id: id,
            title: title,
            message: message,
            date: date,
            priority: priority,
            audience: audienceArray,
            status: 'published'
          });
          SchoolApp.showToast('Announcement published to dashboard!', 'success');
        }

        SchoolApp.save();
        render();
      });
    }

    // Edit Notice Button Handler
    document.querySelectorAll('.admin-edit-notice-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var notice = SchoolApp.store.notices.find(function(n) { return n.id === id; });
        if (!notice) return;

        document.getElementById('admin-notice-title').value = notice.title;
        document.getElementById('admin-notice-message').value = notice.message;
        document.getElementById('admin-notice-date').value = notice.date;
        document.getElementById('admin-notice-priority').value = notice.priority;
        var aud = notice.audience ? (Array.isArray(notice.audience) ? notice.audience[0] : notice.audience) : 'everyone';
        if (document.getElementById('admin-notice-audience')) {
          document.getElementById('admin-notice-audience').value = aud;
        }
        document.getElementById('admin-notice-edit-id').value = notice.id;

        // Update button states
        var submitBtn = document.getElementById('admin-notice-submit-btn');
        if (submitBtn) {
          submitBtn.innerHTML = '<span class="material-icons-round">save</span> Save Changes';
        }
        var resetBtn = document.getElementById('admin-notice-reset-btn');
        if (resetBtn) {
          resetBtn.style.display = 'inline-flex';
        }

        // Scroll to form
        document.getElementById('admin-notice-form').scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Reset Edit State
    var resetNoticeBtn = document.getElementById('admin-notice-reset-btn');
    if (resetNoticeBtn) {
      resetNoticeBtn.addEventListener('click', function() {
        document.getElementById('admin-notice-form').reset();
        document.getElementById('admin-notice-edit-id').value = '';
        
        var submitBtn = document.getElementById('admin-notice-submit-btn');
        if (submitBtn) {
          submitBtn.innerHTML = '<span class="material-icons-round">publish</span> Publish Notice';
        }
        this.style.display = 'none';
      });
    }

    // Delete Notice Button Handler
    document.querySelectorAll('.admin-delete-notice-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var idx = SchoolApp.store.notices.findIndex(function(n) { return n.id === id; });
        if (idx === -1) return;
        var notice = SchoolApp.store.notices[idx];

        SchoolApp.showConfirm('Delete announcement "' + notice.title + '"? This will remove it from the dashboard.', function() {
          SchoolApp.store.notices.splice(idx, 1);
          SchoolApp.save();
          SchoolApp.showToast('Announcement deleted.', 'warning');
          render();
        });
      });
    });

    // Approve Notice Button Handler
    document.querySelectorAll('.admin-approve-notice-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var notice = SchoolApp.store.notices.find(function(n) { return n.id === id; });
        if (!notice) return;

        notice.status = 'published';
        SchoolApp.save();
        SchoolApp.showToast('Announcement approved and published to dashboard.', 'success');
        render();
      });
    });

    // Transactions Tab Event Bindings
    if (state.activeTab === 'transactions') {
      var txnSearch = document.getElementById('txn-search');
      if (txnSearch) {
        txnSearch.addEventListener('input', function() {
          state.txnSearchQuery = this.value;
          renderTransactionsTable();
        });
      }

      var txnStartDate = document.getElementById('txn-start-date');
      if (txnStartDate) {
        txnStartDate.addEventListener('change', function() {
          state.txnStartDate = this.value;
          renderTransactionsTable();
        });
      }

      var txnEndDate = document.getElementById('txn-end-date');
      if (txnEndDate) {
        txnEndDate.addEventListener('change', function() {
          state.txnEndDate = this.value;
          renderTransactionsTable();
        });
      }

      var txnExportBtn = document.getElementById('txn-export-csv-btn');
      if (txnExportBtn) {
        txnExportBtn.addEventListener('click', exportTransactionsToCSV);
      }

      var txnTableContainer = document.getElementById('txn-table-container');
      if (txnTableContainer) {
        txnTableContainer.addEventListener('click', function(e) {
          var printBtn = e.target.closest('.txn-print-btn');
          if (printBtn) {
            var txnId = printBtn.getAttribute('data-id');
            printTransactionReceipt(txnId);
          }
        });
      }
    }


  }

  // Register Module
  SchoolApp.registerModule('admin', {
    init: function() {},
    render: render,
    setActiveTab: function(tabId) {
      state.activeTab = tabId;
    },
    getActiveTab: function() {
      return state.activeTab;
    }
  });

  window.migrateAllPasswords = async function() {
    const count = await AuthUtils.bulkMigrateTeacherPasswords();
    SchoolApp.showToast(count > 0 ? count + " passwords secured." : "All passwords already secure.", "success");
  };

  window.showExamAccessDiagnostic = function(teacherId) {
    var teacher = (SchoolApp.store.teachers || []).find(function(t) { return t.id === teacherId; });
    if (!teacher) {
      SchoolApp.showToast('Teacher not found', 'error');
      return;
    }

    var normalizedSubjects = (
      Array.isArray(teacher.subjects) 
        ? teacher.subjects 
        : (teacher.subject ? String(teacher.subject).split(',') : [])
    ).map(function(s) { return s.trim(); });

    var assignedClasses = teacher.assignedClasses || [];
    var subjectTeacherOf = teacher.subjectTeacherOf || [];

    var bodyHTML = '<div style="max-height: 450px; overflow-y: auto; padding-right: 8px;">';
    
    // Summary
    bodyHTML += '<p>Analyzing exam marks entry access for <strong>' + escapeHTML(teacher.firstName + ' ' + (teacher.lastName || '')) + '</strong>.</p>';
    
    // Teacher metadata details
    bodyHTML += '<div class="alert alert-info mb-3" style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.1); border-radius:6px; padding:12px;">';
    bodyHTML += '  <h4 style="margin-top:0; margin-bottom:8px; font-size:14px; color:var(--accent-primary);">Profile Mappings</h4>';
    bodyHTML += '  <p style="margin:4px 0; font-size:13px;"><strong>Assigned Subjects:</strong> ' + (normalizedSubjects.length > 0 ? normalizedSubjects.join(', ') : '<span style="color:var(--danger)">None</span>') + '</p>';
    bodyHTML += '  <p style="margin:4px 0; font-size:13px;"><strong>Assigned Classes (General):</strong> ' + (assignedClasses.length > 0 ? assignedClasses.map(function(c) {
      return typeof c === 'object' ? (c.class + '-' + c.section) : c;
    }).join(', ') : '<span style="color:var(--danger)">None</span>') + '</p>';
    bodyHTML += '  <p style="margin:4px 0; font-size:13px;"><strong>Subject Teacher Of Assignments:</strong> ' + (subjectTeacherOf.length > 0 ? subjectTeacherOf.map(function(s) {
      var cls = s.class || s.classId || '';
      var sec = s.section || '';
      var sub = s.subject || s.subjectName || '';
      return sub + ' in Class ' + cls + '-' + sec;
    }).join(', ') : '<span style="color:var(--text-muted)">None</span>') + '</p>';
    bodyHTML += '</div>';

    // Exam subjects analysis
    bodyHTML += '<h4 style="margin-top:16px; margin-bottom:8px; font-size:14px;">Evaluated Exam Term Access Matrix</h4>';
    
    var examTerms = Object.values(SchoolApp.store.examTerms || {});
    if (examTerms.length === 0) {
      bodyHTML += '<p style="color:var(--text-muted); font-size:13px;">No exam terms configured.</p>';
    } else {
      bodyHTML += '<table class="table table-sm" style="font-size:12px; width:100%; border-collapse:collapse;">';
      bodyHTML += '  <thead>';
      bodyHTML += '    <tr style="border-bottom:1px solid rgba(255,255,255,0.1); text-align:left;">';
      bodyHTML += '      <th style="padding:6px;">Exam Term</th>';
      bodyHTML += '      <th style="padding:6px;">Class-Sec</th>';
      bodyHTML += '      <th style="padding:6px;">Exam Subject</th>';
      bodyHTML += '      <th style="padding:6px; text-align:center;">Match Status</th>';
      bodyHTML += '    </tr>';
      bodyHTML += '  </thead>';
      bodyHTML += '  <tbody>';

      var totalEvaluations = 0;
      var matchedCount = 0;

      examTerms.forEach(function(term) {
        var termSubjects = SchoolApp.store.examSubjects && SchoolApp.store.examSubjects[term.id];
        if (termSubjects) {
          Object.keys(termSubjects).forEach(function(classKey) {
            var classObj = termSubjects[classKey];
            var subs = classObj.subjects || [];
            
            // Evaluated section letters (A, B, C, D)
            ['A', 'B', 'C', 'D'].forEach(function(sectionLetter) {
              var classSectionStr = classKey + '-' + sectionLetter;
              var classSectionNorm = window.normalizeClassId(classSectionStr);
              
              subs.forEach(function(sub) {
                totalEvaluations++;
                
                var examSubjectName = sub.name.toLowerCase().trim();
                
                // 1. General Profile Match
                var subjectMatch = normalizedSubjects.some(function(ts) {
                  return window.subjectsMatch(ts, examSubjectName);
                });
                
                var classMatch = (teacher.assignedClasses || []).some(function(c) {
                  return window.normalizeClassId(c) === classSectionNorm;
                });
                
                // 2. Direct assignment
                var directAssignment = (teacher.subjectTeacherOf || []).some(function(assignment) {
                  var assignmentClassNorm = window.normalizeClassId(assignment.classId || assignment.class || assignment);
                  var assignmentSubjectName = (assignment.subjectName || assignment.subject || "").toLowerCase().trim();
                  return assignmentClassNorm === classSectionNorm && window.subjectsMatch(assignmentSubjectName, examSubjectName);
                });

                var isMatched = (subjectMatch && classMatch) || directAssignment;
                
                if (isMatched) {
                  matchedCount++;
                  var reason = "";
                  if (directAssignment) {
                    reason = "Direct subjectTeacherOf assignment";
                  } else {
                    reason = "Matched general profile (" + sub.name + " + Class " + classSectionStr + ")";
                  }
                  
                  bodyHTML += '    <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">';
                  bodyHTML += '      <td style="padding:6px; color:var(--text-muted);">' + escapeHTML(term.name) + '</td>';
                  bodyHTML += '      <td style="padding:6px;"><strong>Class ' + escapeHTML(classSectionStr) + '</strong></td>';
                  bodyHTML += '      <td style="padding:6px;">' + escapeHTML(sub.name) + '</td>';
                  bodyHTML += '      <td style="padding:6px; text-align:center;"><span class="badge badge-success" title="' + escapeHTML(reason) + '">✅ Accessible</span></td>';
                  bodyHTML += '    </tr>';
                }
              });
            });
          });
        }
      });

      if (matchedCount === 0) {
        bodyHTML += '    <tr><td colspan="4" style="text-align:center; padding:12px; color:var(--danger);">No matched exam subjects found. Teacher has NO access to enter marks.</td></tr>';
      }

      bodyHTML += '  </tbody>';
      bodyHTML += '</table>';
    }

    bodyHTML += '</div>';

    var footerHTML = '<button class="btn btn-primary" onclick="SchoolApp.closeModal()">Close</button>';
    SchoolApp.showModal('Exam Marks Entry Access Diagnostics', bodyHTML, footerHTML);
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

})();
