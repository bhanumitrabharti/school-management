'use strict';

/* ============================================================
   Shishu Vikash Mandir - Examination & Assessment Module
   ============================================================ */

(function() {

  var state = {
    examTerm: '',
    classVal: '',
    sectionVal: '',
    isCombined: false,
    combinedTerm1: '',
    combinedTerm2: ''
  };

  function getStudentExamMarks(studentId, examId) {
    return (SchoolApp.store.marks || []).find(function(m) {
      return m.studentId === studentId && m.examId === examId;
    });
  }

  function calculateGrade(percentage) {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B';
    if (percentage >= 60) return 'C';
    if (percentage >= 33) return 'D';
    return 'F';
  }

  function render() {
    var container = document.getElementById('page-exams');
    if (!container) return;

    if (SchoolApp.isTeacher()) {
      state.isCombined = false;
    }

    var examsList = SchoolApp.store.exams || [];
    var classes = SchoolApp.store.settings.classes || [];
    var sections = SchoolApp.store.settings.sections || [];

    if (SchoolApp.isTeacher()) {
      var ct = SchoolApp.currentUser.classTeacherOf || [];
      var st = SchoolApp.currentUser.subjectTeacherOf || [];
      classes = classes.filter(function(c) {
        return ct.some(function(item) { return item.class === c; }) ||
               st.some(function(item) { return item.class === c; });
      });
      sections = sections.filter(function(s) {
        return ct.some(function(item) { return item.section === s; }) ||
               st.some(function(item) { return item.section === s; });
      });
    }

    var html = '';

    // Page Header
    html += '<div class="page-header">';
    if (SchoolApp.isTeacher()) {
      html += '<h2><span class="material-icons-round">edit_note</span> Marks Entry</h2>';
    } else {
      html += '<h2><span class="material-icons-round">assignment</span> Examination & Marksheet Generator</h2>';
    }
    html += '</div>';

    // Filters / Selectors Panel
    html += '<div class="card mb-3"><div class="card-body">';
    
    // Toggle for Single vs Combined Mode
    if (!SchoolApp.isTeacher()) {
      html += '<div class="flex gap-2 mb-3" style="border-bottom: 1px solid var(--border-color); padding-bottom: 12px; flex-wrap: wrap;">';
      html += '<button class="btn ' + (!state.isCombined ? 'btn-primary' : 'btn-secondary') + ' btn-sm" id="exam-mode-single"><span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">looks_one</span> Single Term View</button>';
      html += '<button class="btn ' + (state.isCombined ? 'btn-primary' : 'btn-secondary') + ' btn-sm" id="exam-mode-combined"><span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">looks_two</span> Combined Report Card Mode</button>';
      html += '</div>';
    }

    html += '<div class="form-grid exams-filter-grid">';
    
    if (!state.isCombined) {
      // Single Term Filters
      html += '<div class="form-group"><label class="form-label">Exam Term *</label>';
      html += '<select class="form-select" id="exam-select-term"><option value="">-- Select Exam Term --</option>';
      examsList.forEach(function(ex) {
        html += '<option value="' + ex.id + '"' + (state.examTerm === ex.id ? ' selected' : '') + '>' + ex.name + '</option>';
      });
      html += '</select></div>';
    } else {
      // Combined Mode Filters: Term 1 and Term 2 selectors
      html += '<div class="form-group"><label class="form-label">Term 1 (e.g. Half-Yearly) *</label>';
      html += '<select class="form-select" id="exam-select-term1"><option value="">-- Select Term 1 --</option>';
      examsList.forEach(function(ex) {
        html += '<option value="' + ex.id + '"' + (state.combinedTerm1 === ex.id ? ' selected' : '') + '>' + ex.name + '</option>';
      });
      html += '</select></div>';

      html += '<div class="form-group"><label class="form-label">Term 2 (e.g. Annual) *</label>';
      html += '<select class="form-select" id="exam-select-term2"><option value="">-- Select Term 2 --</option>';
      examsList.forEach(function(ex) {
        html += '<option value="' + ex.id + '"' + (state.combinedTerm2 === ex.id ? ' selected' : '') + '>' + ex.name + '</option>';
      });
      html += '</select></div>';
    }

    // Select Class
    html += '<div class="form-group"><label class="form-label">Target Class *</label>';
    html += '<select class="form-select" id="exam-select-class"><option value="">-- Select Class --</option>';
    classes.forEach(function(c) {
      html += '<option value="' + c + '"' + (state.classVal === c ? ' selected' : '') + '>' + (['Nursery','LKG','UKG'].indexOf(c) !== -1 ? c : 'Class ' + c) + '</option>';
    });
    html += '</select></div>';

    // Select Section
    html += '<div class="form-group"><label class="form-label">Section *</label>';
    html += '<select class="form-select" id="exam-select-section"><option value="">-- Select Section --</option>';
    sections.forEach(function(sec) {
      html += '<option value="' + sec + '"' + (state.sectionVal === sec ? ' selected' : '') + '>Section ' + sec + '</option>';
    });
    html += '</select></div>';

    html += '</div></div></div>'; // End filters panel

    // Marks Entry / Listing Panel
    if (!state.isCombined) {
      if (state.examTerm && state.classVal && state.sectionVal) {
        if (SchoolApp.isTeacher()) {
          var ct = SchoolApp.currentUser.classTeacherOf || [];
          var st = SchoolApp.currentUser.subjectTeacherOf || [];
          var isAssigned = ct.some(function(c) {
            return String(c.class).toLowerCase().trim() === String(state.classVal).toLowerCase().trim() &&
                   String(c.section).toLowerCase().trim() === String(state.sectionVal).toLowerCase().trim();
          }) || st.some(function(c) {
            return String(c.class).toLowerCase().trim() === String(state.classVal).toLowerCase().trim() &&
                   String(c.section).toLowerCase().trim() === String(state.sectionVal).toLowerCase().trim();
          });
          if (!isAssigned) {
            html += '<div class="card"><div class="card-body">';
            html += '<div class="empty-state"><span class="material-icons-round">lock</span><h3>Access Denied</h3><p>You are not assigned to Class ' + state.classVal + '-' + state.sectionVal + ' as either a Class Teacher or Subject Teacher.</p></div>';
            html += '</div></div>';
            container.innerHTML = html;
            attachEvents();
            return;
          }
        }

        var isClassTeacher = true;
        if (SchoolApp.isTeacher()) {
          var ct = SchoolApp.currentUser.classTeacherOf || [];
          isClassTeacher = ct.some(function(c) {
            return String(c.class).toLowerCase().trim() === String(state.classVal).toLowerCase().trim() &&
                   String(c.section).toLowerCase().trim() === String(state.sectionVal).toLowerCase().trim();
          });
        }

        var students = (SchoolApp.store.students || []).filter(function(s) {
          return String(s.class).toLowerCase().trim() === String(state.classVal).toLowerCase().trim() &&
                 String(s.section).toLowerCase().trim() === String(state.sectionVal).toLowerCase().trim() &&
                 s.status === 'Active';
        });

        var mappingKey = state.examTerm + '_' + state.classVal;
        var subjects = (SchoolApp.store.subjectMapping || {})[mappingKey] || (SchoolApp.store.subjectMapping || {})[state.classVal] || [];

        if (SchoolApp.isTeacher() && !isClassTeacher) {
          var st = SchoolApp.currentUser.subjectTeacherOf || [];
          var assignedSubjects = st.filter(function(item) {
            return String(item.class).toLowerCase().trim() === String(state.classVal).toLowerCase().trim() &&
                   String(item.section).toLowerCase().trim() === String(state.sectionVal).toLowerCase().trim();
          }).map(function(item) { return item.subject; });
          
          subjects = subjects.filter(function(sub) {
            return assignedSubjects.some(function(asName) {
              var sName = sub.name.toLowerCase().trim();
              var aName = asName.toLowerCase().trim();
              if (sName === aName) return true;
              if (sName === 'mathematics' && (aName === 'maths' || aName === 'mathematics')) return true;
              if (sName === 'maths' && (aName === 'mathematics' || aName === 'maths')) return true;
              if (sName === 'social studies' && (aName === 'sst' || aName === 'social studies')) return true;
              if (sName === 'sst' && (aName === 'social studies' || aName === 'sst')) return true;
              return false;
            });
          });
        }

        html += '<div class="card"><div class="card-header">';
        var termName = (examsList.find(function(ex) { return ex.id === state.examTerm; }) || { name: '' }).name;
        var className = ['Nursery','LKG','UKG'].indexOf(state.classVal) !== -1 ? state.classVal : 'Class ' + state.classVal;
        html += '<h3><span class="material-icons-round">edit_note</span> Student Marks Entry Matrix · ' + termName + ' · ' + className + '-' + state.sectionVal + '</h3>';
        if (students.length > 0 && subjects.length > 0) {
          html += '<button class="btn btn-primary btn-sm" id="exam-save-all-marks-btn"><span class="material-icons-round">save</span> Save All Marks</button>';
        }
        html += '</div><div class="card-body">';

        if (subjects.length === 0) {
          html += '<div class="empty-state"><span class="material-icons-round">schema</span><h3>No Mapped Subjects</h3><p>Subjects have not been configured for this class level. Please map subjects inside the Examinations settings tab in the Admin Panel.</p></div>';
        } else if (students.length === 0) {
          html += '<div class="empty-state"><span class="material-icons-round">groups</span><h3>No Active Students</h3><p>There are no active students in this class/section combination currently.</p></div>';
        } else {
          html += '<div class="table-container"><table class="data-table"><thead><tr>';
          html += '<th>Student</th><th>Roll No.</th>';
          
          // Subject Columns
          subjects.forEach(function(sub) {
            html += '<th class="center">' + sub.name + '<br><span style="font-size:10px;font-weight:normal;color:var(--text-muted)">Max: ' + sub.maxMarks + ' · Pass: ' + sub.passMarks + '</span></th>';
          });

          html += '<th class="center">Total</th><th class="center">Perc (%)</th><th class="center">Grade</th><th class="center">Status</th>';
          if (!SchoolApp.isTeacher() || isClassTeacher) {
            html += '<th class="center">Action</th>';
          }
          html += '</tr></thead><tbody>';

          students.forEach(function(s) {
            var initials = SchoolApp.getInitials(s.firstName, s.lastName);
            var color = SchoolApp.getAvatarColor(s.firstName + s.lastName);
            var savedMarks = getStudentExamMarks(s.id, state.examTerm);

            html += '<tr>';
            html += '<td><div class="table-student-name"><div class="avatar avatar-sm" data-color="' + color + '">' + initials + '</div><div><strong>' + s.firstName + ' ' + s.lastName + '</strong></div></div></td>';
            html += '<td>' + s.rollNumber + '</td>';

            // Score inputs for each mapped subject
            subjects.forEach(function(sub) {
              var scoreVal = '';
              if (savedMarks && savedMarks.scores && savedMarks.scores[sub.id] !== undefined) {
                scoreVal = savedMarks.scores[sub.id];
              }
              html += '<td class="center">';
              html += '<input type="number" class="form-input exam-score-input" data-student-id="' + s.id + '" data-subject-id="' + sub.id + '" data-max="' + sub.maxMarks + '" data-pass="' + sub.passMarks + '" value="' + scoreVal + '" style="width: 70px; text-align: center; padding: 6px; min-height: 32px;" min="0" max="' + sub.maxMarks + '">';
              html += '</td>';
            });

            // Metrics cells
            if (savedMarks) {
              html += '<td class="center font-semibold">' + savedMarks.totalScored + '/' + savedMarks.maxTotal + '</td>';
              html += '<td class="center font-semibold">' + savedMarks.percentage + '%</td>';
              html += '<td class="center"><span class="badge badge-purple">' + savedMarks.grade + '</span></td>';
              
              var stColor = savedMarks.status === 'Pass' ? 'badge-success' : 'badge-danger';
              html += '<td class="center"><span class="badge ' + stColor + '">' + savedMarks.status + '</span></td>';
              
              if (!SchoolApp.isTeacher() || isClassTeacher) {
                html += '<td class="center">';
                html += '<button class="btn btn-secondary btn-sm generate-reportcard-btn" data-student-id="' + s.id + '"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;">print</span> Report Card</button>';
                html += '</td>';
              }
            } else {
              html += '<td class="center text-muted">—</td><td class="center text-muted">—</td><td class="center text-muted">—</td><td class="center text-muted">—</td>';
              if (!SchoolApp.isTeacher() || isClassTeacher) {
                html += '<td class="center"><button class="btn btn-secondary btn-sm" disabled><span class="material-icons-round" style="font-size:16px;vertical-align:middle;">print</span> Report Card</button></td>';
              }
            }

            html += '</tr>';
          });

          html += '</tbody></table></div>';
        }

        html += '</div></div>';
      } else {
        html += '<div class="card"><div class="card-body">';
        html += '<div class="empty-state"><span class="material-icons-round">fact_check</span><h3>Select Configurations</h3><p>Please select an Exam Term, Target Class, and Section from the dropdown panel above to load the student scores matrix.</p></div>';
        html += '</div></div>';
      }
    } else {
      // Consolidated Combined Matrix Panel
      if (state.combinedTerm1 && state.combinedTerm2 && state.classVal && state.sectionVal) {
        if (SchoolApp.isTeacher()) {
          var ct = SchoolApp.currentUser.classTeacherOf || [];
          var st = SchoolApp.currentUser.subjectTeacherOf || [];
          var isAssigned = ct.some(function(c) { return c.class === state.classVal && c.section === state.sectionVal; }) ||
                            st.some(function(c) { return c.class === state.classVal && c.section === state.sectionVal; });
          if (!isAssigned) {
            html += '<div class="card"><div class="card-body">';
            html += '<div class="empty-state"><span class="material-icons-round">lock</span><h3>Access Denied</h3><p>You are not assigned to Class ' + state.classVal + '-' + state.sectionVal + ' as either a Class Teacher or Subject Teacher.</p></div>';
            html += '</div></div>';
            container.innerHTML = html;
            attachEvents();
            return;
          }
        }

        var isClassTeacher = true;
        if (SchoolApp.isTeacher()) {
          var ct = SchoolApp.currentUser.classTeacherOf || [];
          isClassTeacher = ct.some(function(c) { return c.class === state.classVal && c.section === state.sectionVal; });
        }

        var students = (SchoolApp.store.students || []).filter(function(s) {
          return s.class === state.classVal && s.section === state.sectionVal && s.status === 'Active';
        });

        var mappingKey1 = state.combinedTerm1 + '_' + state.classVal;
        var mappingKey2 = state.combinedTerm2 + '_' + state.classVal;
        var subjects = (SchoolApp.store.subjectMapping || {})[mappingKey1] || (SchoolApp.store.subjectMapping || {})[mappingKey2] || (SchoolApp.store.subjectMapping || {})[state.classVal] || [];
        var term1Name = (examsList.find(function(ex) { return ex.id === state.combinedTerm1; }) || { name: 'Term 1' }).name;
        var term2Name = (examsList.find(function(ex) { return ex.id === state.combinedTerm2; }) || { name: 'Term 2' }).name;

        html += '<div class="card"><div class="card-header">';
        var className = ['Nursery','LKG','UKG'].indexOf(state.classVal) !== -1 ? state.classVal : 'Class ' + state.classVal;
        html += '<h3><span class="material-icons-round">analytics</span> Consolidated Performance Matrix · ' + className + '-' + state.sectionVal + '</h3>';
        html += '</div><div class="card-body">';

        if (subjects.length === 0) {
          html += '<div class="empty-state"><span class="material-icons-round">schema</span><h3>No Mapped Subjects</h3><p>Subjects have not been configured for this class level. Please map subjects inside the Examinations settings tab in the Admin Panel.</p></div>';
        } else if (students.length === 0) {
          html += '<div class="empty-state"><span class="material-icons-round">groups</span><h3>No Active Students</h3><p>There are no active students in this class/section combination currently.</p></div>';
        } else {
          html += '<div class="table-container"><table class="data-table"><thead><tr>';
          html += '<th>Student</th><th>Roll No.</th>';
          html += '<th class="center">' + term1Name + ' %</th>';
          html += '<th class="center">' + term2Name + ' %</th>';
          html += '<th class="center">Combined Score</th>';
          html += '<th class="center">Combined %</th>';
          html += '<th class="center">Grade</th>';
          html += '<th class="center">Status</th>';
          html += '<th class="center">Action</th>';
          html += '</tr></thead><tbody>';

          students.forEach(function(s) {
            var initials = SchoolApp.getInitials(s.firstName, s.lastName);
            var color = SchoolApp.getAvatarColor(s.firstName + s.lastName);

            var m1 = getStudentExamMarks(s.id, state.combinedTerm1);
            var m2 = getStudentExamMarks(s.id, state.combinedTerm2);

            var p1Text = m1 ? m1.percentage + '%' : '<span class="badge badge-warning">Missing</span>';
            var p2Text = m2 ? m2.percentage + '%' : '<span class="badge badge-warning">Missing</span>';

            var hasData = !!(m1 || m2);
            var combinedTotal = 0;
            var combinedMax = 0;
            var combinedPercentage = 0;
            var combinedGrade = '—';
            var combinedStatus = '—';
            var statusColor = 'badge-danger';
            var warningBadge = '';

            if (hasData) {
              combinedTotal = (m1 ? m1.totalScored : 0) + (m2 ? m2.totalScored : 0);
              combinedMax = (m1 ? m1.maxTotal : 0) + (m2 ? m2.maxTotal : 0);
              combinedPercentage = combinedMax > 0 ? Math.round((combinedTotal / combinedMax) * 100) : 0;
              combinedGrade = calculateGrade(combinedPercentage);

              // Calculation status: check if failed in any available subjects
              var passedAll = true;
              subjects.forEach(function(sub) {
                var s1 = m1 && m1.scores && m1.scores[sub.id] !== undefined ? parseFloat(m1.scores[sub.id]) : null;
                var s2 = m2 && m2.scores && m2.scores[sub.id] !== undefined ? parseFloat(m2.scores[sub.id]) : null;
                
                var subObtained = 0;
                var subMax = 0;
                var subPass = 0;

                if (s1 !== null) {
                  subObtained += s1;
                  subMax += sub.maxMarks;
                  subPass += sub.passMarks;
                }
                if (s2 !== null) {
                  subObtained += s2;
                  subMax += sub.maxMarks;
                  subPass += sub.passMarks;
                }

                if (subMax > 0 && subObtained < subPass) {
                  passedAll = false;
                }
              });

              combinedStatus = passedAll ? 'Pass' : 'Fail';
              statusColor = combinedStatus === 'Pass' ? 'badge-success' : 'badge-danger';

              if (!m1 || !m2) {
                warningBadge = ' <span class="badge badge-warning" title="Missing one term data" style="font-size: 9px; padding: 2px 6px;">Incomplete</span>';
              }
            }

            html += '<tr>';
            html += '<td><div class="table-student-name"><div class="avatar avatar-sm" data-color="' + color + '">' + initials + '</div><div><strong>' + s.firstName + ' ' + s.lastName + '</strong></div></div></td>';
            html += '<td>' + s.rollNumber + '</td>';
            html += '<td class="center">' + p1Text + '</td>';
            html += '<td class="center">' + p2Text + '</td>';

            if (hasData) {
              html += '<td class="center font-semibold">' + combinedTotal + '/' + combinedMax + '</td>';
              html += '<td class="center font-semibold">' + combinedPercentage + '%' + warningBadge + '</td>';
              html += '<td class="center"><span class="badge badge-purple">' + combinedGrade + '</span></td>';
              html += '<td class="center"><span class="badge ' + statusColor + '">' + combinedStatus + '</span></td>';
              html += '<td class="center">';
              if (isClassTeacher) {
                html += '<button class="btn btn-secondary btn-sm generate-combined-reportcard-btn" data-student-id="' + s.id + '"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;">print</span> Report Card</button>';
              } else {
                html += '<button class="btn btn-secondary btn-sm" disabled title="Only Class Teachers can print report cards"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;">print</span> Report Card</button>';
              }
              html += '</td>';
            } else {
              html += '<td class="center text-muted">—</td><td class="center text-muted">—</td><td class="center text-muted">—</td><td class="center text-muted">—</td>';
              html += '<td class="center"><button class="btn btn-secondary btn-sm" disabled><span class="material-icons-round" style="font-size:16px;vertical-align:middle;">print</span> Report Card</button></td>';
            }
            html += '</tr>';
          });

          html += '</tbody></table></div>';
        }

        html += '</div></div>';
      } else {
        html += '<div class="card"><div class="card-body">';
        html += '<div class="empty-state"><span class="material-icons-round">fact_check</span><h3>Select Configurations</h3><p>Please select both consolidated Term 1 and Term 2, along with Class and Section parameters above to generate the cumulative performance ledger.</p></div>';
        html += '</div></div>';
      }
    }

    container.innerHTML = html;
    attachEvents();
  }

  function printStudentMarksheet(studentId) {
    var s = SchoolApp.store.students.find(function(x) { return x.id === studentId; });
    if (!s) return;

    if (SchoolApp.isTeacher()) {
      var ct = SchoolApp.currentUser.classTeacherOf || [];
      var isCt = ct.some(function(c) {
        return String(c.class).toLowerCase().trim() === String(s.class).toLowerCase().trim() &&
               String(c.section).toLowerCase().trim() === String(s.section).toLowerCase().trim();
      });
      if (!isCt) {
        SchoolApp.showToast('Access Denied: Only Class Teachers can print/view student report cards.', 'error');
        return;
      }
    }

    var mappingKey = '';
    if (state.isCombined) {
      mappingKey = state.combinedTerm1 + '_' + s.class;
      if (!SchoolApp.store.subjectMapping[mappingKey]) {
        mappingKey = state.combinedTerm2 + '_' + s.class;
      }
    } else {
      mappingKey = state.examTerm + '_' + s.class;
    }
    var subjects = SchoolApp.store.subjectMapping[mappingKey] || SchoolApp.store.subjectMapping[s.class] || [];
    
    // --- Smart Class Ranking Logic (Top 3 Only) ---
    var classStudents = (SchoolApp.store.students || []).filter(function(x) {
      return x.class === s.class && x.status === 'Active';
    });

    var studentsRankData = classStudents.map(function(stud) {
      if (state.isCombined) {
        var m1 = (SchoolApp.store.marks || []).find(function(m) {
          return m.studentId === stud.id && m.examId === state.combinedTerm1;
        });
        var m2 = (SchoolApp.store.marks || []).find(function(m) {
          return m.studentId === stud.id && m.examId === state.combinedTerm2;
        });

        var combinedTotal = 0;
        var combinedMax = 0;
        if (m1 || m2) {
          combinedTotal = (m1 ? m1.totalScored : 0) + (m2 ? m2.totalScored : 0);
          combinedMax = (m1 ? m1.maxTotal : 0) + (m2 ? m2.maxTotal : 0);
        }
        var percentage = combinedMax > 0 ? (combinedTotal / combinedMax) * 100 : 0;
        return {
          studentId: stud.id,
          percentage: percentage,
          totalScore: combinedTotal
        };
      } else {
        var m = (SchoolApp.store.marks || []).find(function(mk) {
          return mk.studentId === stud.id && mk.examId === state.examTerm;
        });
        var percentage = m ? m.percentage : 0;
        var totalScore = m ? m.totalScored : 0;
        return {
          studentId: stud.id,
          percentage: percentage,
          totalScore: totalScore
        };
      }
    });

    // Sort descending by percentage, then by total score
    studentsRankData.sort(function(a, b) {
      if (b.percentage !== a.percentage) {
        return b.percentage - a.percentage;
      }
      return b.totalScore - a.totalScore;
    });

    var targetRankIndex = studentsRankData.findIndex(function(x) {
      return x.studentId === studentId;
    });
    var rank = targetRankIndex + 1; // 1-indexed

    var rankText = '';
    if (rank === 1) rankText = '1st';
    else if (rank === 2) rankText = '2nd';
    else if (rank === 3) rankText = '3rd';

    var logoUrl = new URL('school-logo-updated.jpg', window.location.href).href + '?t=' + new Date().getTime();

    // Construct printable HTML
    var printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      SchoolApp.showToast('Popup blocker prevented opening report card. Please allow popups for this site.', 'warning');
      return;
    }

    var html = '<html><head><title>Report Card - ' + s.firstName + ' ' + s.lastName + '</title>';
    html += '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">';
    html += '<link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">';
    
    // Add CSS stylesheet inside printable window
    html += '<style>';
    html += 'html, body { height: 100%; margin: 0; padding: 0; box-sizing: border-box; }';
    html += 'body { font-family: "Inter", sans-serif; background: #fff; color: #000; padding: 25px; display: flex; flex-direction: column; box-sizing: border-box; }';
    html += '.report-card { border: 3px double #1a1a3a; padding: 35px; border-radius: 12px; max-width: 750px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.1); display: flex; flex-direction: column; height: calc(100% - 10px); box-sizing: border-box; justify-content: space-between; }';
    html += '.header { display: flex; align-items: center; justify-content: center; gap: 24px; border-bottom: 2px double #1a1a3a; padding-bottom: 20px; margin-bottom: 25px; }';
    html += '.header-logo { height: 110px; width: auto; object-fit: contain; }';
    html += '.header-text { text-align: left; }';
    html += '.school-title { font-size: 30px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #1a1a3a; margin: 0 0 6px 0; }';
    html += '.school-subtitle { font-size: 13px; color: #555; font-weight: 500; margin: 0; letter-spacing: 0.2px; }';
    html += '.title { font-size: 15px; font-weight: 700; text-transform: uppercase; color: #1a1a3a; margin: 0; border: 1px solid #1a1a3a; display: inline-block; padding: 3px 12px; border-radius: 4px; }';
    html += '.student-details { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 25px; font-size: 14px; line-height: 1.6; border: 1px solid #ddd; padding: 14px 18px; border-radius: 8px; background: #fafafa; }';
    html += '.student-details div span { font-weight: bold; color: #333; }';
    html += '.marks-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }';
    html += '.marks-table th, .marks-table td { border: 1px solid #1a1a3a; padding: 16px 10px; text-align: left; font-size: 14px; }';
    html += '.marks-table th { background: #f2f2f8; font-weight: 700; color: #1a1a3a; }';
    html += '.marks-table td.center, .marks-table th.center { text-align: center; }';
    html += '.summary-footer { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; border: 1px solid #1a1a3a; padding: 16px; border-radius: 8px; font-size: 14px; background: #fdfdfd; margin-bottom: 25px; }';
    html += '.summary-footer div span { font-weight: bold; color: #1a1a3a; }';
    html += '.result-badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: bold; font-size: 12px; text-transform: uppercase; border: 1px solid; }';
    html += '.pass { background: #e6f4ea; color: #137333; border-color: #137333; }';
    html += '.fail { background: #fce8e6; color: #c5221f; border-color: #c5221f; }';
    html += '.grading-legend { font-size: 11px; color: #444; border: 1px solid #ddd; padding: 10px 12px; border-radius: 6px; background: #fafafa; margin-bottom: 16px; text-align: center; line-height: 1.4; }';
    html += '.important-notes { font-size: 10px; color: #666; border: 1px dashed #ccc; padding: 10px 12px; border-radius: 6px; background: #fdfdfd; margin-bottom: 20px; line-height: 1.4; }';
    html += '.signatures { display: flex; justify-content: space-between; margin-top: 40px; font-size: 12px; }';
    html += '.signature-box { width: 200px; height: 85px; border: 2px solid #1a1a3a; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 10px; font-weight: bold; border-radius: 6px; background: #fafafa; }';
    html += '.warning-notice { padding: 8px 12px; border: 1px dashed #e5a93c; background: #fffbeb; color: #b7791f; border-radius: 6px; font-size: 12px; font-weight: 500; margin-bottom: 20px; text-align: center; }';
    html += '@media print { ';
    html += '  html, body { width: 210mm; height: 297mm; margin: 0; padding: 0; box-sizing: border-box; } ';
    html += '  body { padding: 12mm; box-sizing: border-box; background: #fff; display: flex; flex-direction: column; } ';
    html += '  .report-card { border: 3px double #000; box-shadow: none; padding: 12mm; max-width: 100%; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; } ';
    html += '  .marks-table th, .marks-table td { padding: 16px 10px; font-size: 14px; }';
    html += '  .student-details { padding: 12px 16px; margin-bottom: 20px; font-size: 14px; }';
    html += '  .summary-footer { padding: 12px 16px; margin-bottom: 20px; font-size: 14px; }';
    html += '  .signature-box { border: 2px solid #000; }';
    html += '  .signatures { margin-top: auto !important; }';
    html += '}';
    html += '</style></head><body>';

    if (!state.isCombined) {
      // -------------------- SINGLE TERM MODE --------------------
      var savedMarks = getStudentExamMarks(studentId, state.examTerm);
      if (!savedMarks) {
        SchoolApp.showToast('Please enter and save marks for this student first.', 'error');
        printWindow.close();
        return;
      }
      var examName = (SchoolApp.store.exams.find(function(ex) { return ex.id === state.examTerm; }) || { name: 'Term Examination' }).name;

      // Build template content
      html += '<div class="report-card">';
      
      // Upgraded Header with Logo space
      html += '<div class="header">';
      html += '<img src="' + logoUrl + '" class="header-logo" alt="School Logo">';
      html += '<div class="header-text">';
      html += '<h1 class="school-title">Shishu Vikash Mandir</h1>';
      html += '<p class="school-subtitle">123 Education Lane, Knowledge City, Bangalore · Phone: +91 98765 43210</p>';
      html += '<div style="display:flex; align-items:center; gap:12px; margin-top:8px;">';
      html += '<h2 class="title">OFFICIAL REPORT CARD</h2>';
      html += '<span style="font-size:11px; font-weight:600; color:#555;">Term: ' + examName + ' (' + SchoolApp.store.settings.academicYear + ')</span>';
      html += '</div></div></div>';

      // Student profile metadata
      html += '<div class="student-details">';
      html += '<div><span>Student Name:</span> ' + s.firstName + ' ' + s.lastName + '</div>';
      html += '<div><span>Roll Number:</span> ' + s.rollNumber + '</div>';
      
      var displayClass = ['Nursery','LKG','UKG'].indexOf(s.class) !== -1 ? s.class : 'Class ' + s.class;
      html += '<div><span>Class Level:</span> ' + displayClass + '</div>';
      html += '<div><span>Section Group:</span> ' + s.section + '</div>';
      html += '</div>';

      // Score Table
      html += '<table class="marks-table"><thead><tr>';
      html += '<th>Subject Mapped</th>';
      html += '<th class="center">Max Marks</th>';
      html += '<th class="center">Passing Marks</th>';
      html += '<th class="center">Marks Obtained</th>';
      html += '<th class="center">Remarks</th>';
      html += '</tr></thead><tbody>';

      subjects.forEach(function(sub) {
        var scoreObtained = parseFloat(savedMarks.scores[sub.id] || 0);
        var statusText = scoreObtained >= sub.passMarks ? 'Pass' : 'Fail';
        
        html += '<tr>';
        html += '<td><strong>' + sub.name + '</strong></td>';
        html += '<td class="center">' + sub.maxMarks + '</td>';
        html += '<td class="center">' + sub.passMarks + '</td>';
        html += '<td class="center" style="font-weight:600">' + scoreObtained + '</td>';
        
        var remStyle = scoreObtained >= sub.passMarks ? 'color:#137333;' : 'color:#c5221f;font-weight:bold;';
        html += '<td class="center" style="' + remStyle + '">' + statusText + '</td>';
        html += '</tr>';
      });

      html += '</tbody></table>';

      // Wrapper to push footer elements to bottom
      html += '<div class="report-card-footer" style="margin-top: auto; display: flex; flex-direction: column;">';

      // Bottom summaries
      html += '<div class="summary-footer">';
      html += '<div><span>Grand Total Scored:</span> ' + savedMarks.totalScored + ' / ' + savedMarks.maxTotal + '</div>';
      html += '<div><span>Overall Percentage:</span> ' + savedMarks.percentage + '%</div>';
      html += '<div><span>Academic Grade:</span> ' + savedMarks.grade + '</div>';
      
      var resClass = savedMarks.status === 'Pass' ? 'pass' : 'fail';
      html += '<div><span>Academic Result:</span> <span class="result-badge ' + resClass + '">' + savedMarks.status + '</span></div>';
      
      if (rank <= 3) {
        html += '<div style="margin-top: 10px; grid-column: span 2; display: flex; align-items: center; justify-content: center; background: #fffdf0; border: 1px solid #ffd700; color: #b8860b; font-weight: bold; font-size: 13px; padding: 6px; border-radius: 6px; gap: 4px;">';
        html += '<span class="material-icons-round" style="font-size: 18px; color: #ffd700; vertical-align: middle;">emoji_events</span> Class Rank: ' + rankText + ' (Top Performer)</div>';
      }
      html += '</div>';

      // 1. Grading Scale Legend
      html += '<div class="grading-legend">';
      html += '<strong>Grading Scale:</strong> A+: 90-100% &nbsp;|&nbsp; A: 80-89% &nbsp;|&nbsp; B: 70-79% &nbsp;|&nbsp; C: 60-69% &nbsp;|&nbsp; D: 33-59% &nbsp;|&nbsp; F: Below 33%';
      html += '</div>';

      // 2. Important Notes Block
      html += '<div class="important-notes">';
      html += '<strong>Important Notes:</strong><br>';
      html += '1. Parents are requested to review the performance and sign.<br>';
      html += '2. This is a computer-generated document.';
      html += '</div>';

      // 3. Signatures
      html += '<div class="signatures">';
      html += '<div class="signature-box">Class Teacher</div>';
      html += '<div class="signature-box">Principal</div>';
      html += '</div>';

      html += '</div>'; // End report-card-footer

    } else {
      // -------------------- COMBINED MODE --------------------
      var m1 = getStudentExamMarks(studentId, state.combinedTerm1);
      var m2 = getStudentExamMarks(studentId, state.combinedTerm2);

      if (!m1 && !m2) {
        SchoolApp.showToast('Please enter and save marks for at least one selected term.', 'error');
        printWindow.close();
        return;
      }

      var term1Name = (SchoolApp.store.exams.find(function(ex) { return ex.id === state.combinedTerm1; }) || { name: 'Term 1' }).name;
      var term2Name = (SchoolApp.store.exams.find(function(ex) { return ex.id === state.combinedTerm2; }) || { name: 'Term 2' }).name;

      var hasWarning = !m1 || !m2;

      // Build template content
      html += '<div class="report-card">';
      
      // Upgraded Header with Logo space
      html += '<div class="header">';
      html += '<img src="' + logoUrl + '" class="header-logo" alt="School Logo">';
      html += '<div class="header-text">';
      html += '<h1 class="school-title">Shishu Vikash Mandir</h1>';
      html += '<p class="school-subtitle">123 Education Lane, Knowledge City, Bangalore · Phone: +91 98765 43210</p>';
      html += '<div style="display:flex; align-items:center; gap:12px; margin-top:8px;">';
      html += '<h2 class="title">CONSOLIDATED REPORT CARD</h2>';
      html += '<span style="font-size:11px; font-weight:600; color:#555;">Terms: ' + term1Name + ' & ' + term2Name + '</span>';
      html += '</div></div></div>';

      if (hasWarning) {
        var missingTermName = !m1 ? term1Name : term2Name;
        html += '<div class="warning-notice">⚠️ Warning: Complete scores for ' + missingTermName + ' are missing. Report card calculations are based on available term data only.</div>';
      }

      // Student profile metadata
      html += '<div class="student-details">';
      html += '<div><span>Student Name:</span> ' + s.firstName + ' ' + s.lastName + '</div>';
      html += '<div><span>Roll Number:</span> ' + s.rollNumber + '</div>';
      
      var displayClass = ['Nursery','LKG','UKG'].indexOf(s.class) !== -1 ? s.class : 'Class ' + s.class;
      html += '<div><span>Class Level:</span> ' + displayClass + '</div>';
      html += '<div><span>Section Group:</span> ' + s.section + '</div>';
      html += '</div>';

      // Unified Score Table
      html += '<table class="marks-table"><thead><tr>';
      html += '<th>Subject Mapped</th>';
      html += '<th class="center">' + term1Name + ' Marks<br><span style="font-size:9px;font-weight:normal;">Obtained / Max</span></th>';
      html += '<th class="center">' + term2Name + ' Marks<br><span style="font-size:9px;font-weight:normal;">Obtained / Max</span></th>';
      html += '<th class="center">Grand Total<br><span style="font-size:9px;font-weight:normal;">Obtained / Max</span></th>';
      html += '<th class="center">Subject Grade</th>';
      html += '</tr></thead><tbody>';

      var totalObtained = 0;
      var totalMax = 0;
      var passedAll = true;

      subjects.forEach(function(sub) {
        var s1 = m1 && m1.scores && m1.scores[sub.id] !== undefined ? parseFloat(m1.scores[sub.id]) : null;
        var s2 = m2 && m2.scores && m2.scores[sub.id] !== undefined ? parseFloat(m2.scores[sub.id]) : null;

        var t1Text = s1 !== null ? s1 + ' / ' + sub.maxMarks : '—';
        var t2Text = s2 !== null ? s2 + ' / ' + sub.maxMarks : '—';

        var subObtained = 0;
        var subMax = 0;
        var subPass = 0;

        if (s1 !== null) {
          subObtained += s1;
          subMax += sub.maxMarks;
          subPass += sub.passMarks;
        }
        if (s2 !== null) {
          subObtained += s2;
          subMax += sub.maxMarks;
          subPass += sub.passMarks;
        }

        totalObtained += subObtained;
        totalMax += subMax;

        var combPerc = subMax > 0 ? Math.round((subObtained / subMax) * 100) : 0;
        var combGrade = subMax > 0 ? calculateGrade(combPerc) : '—';

        if (subMax > 0 && subObtained < subPass) {
          passedAll = false;
        }

        html += '<tr>';
        html += '<td><strong>' + sub.name + '</strong></td>';
        html += '<td class="center">' + t1Text + '</td>';
        html += '<td class="center">' + t2Text + '</td>';
        
        var combText = subMax > 0 ? subObtained + ' / ' + subMax : '—';
        html += '<td class="center" style="font-weight:600">' + combText + '</td>';
        html += '<td class="center"><span class="badge badge-purple" style="border: 1px solid #1a1a3a; padding: 2px 8px; border-radius: 4px; font-weight: bold; background: #f2f2f8; color: #1a1a3a;">' + combGrade + '</span></td>';
        html += '</tr>';
      });

      html += '</tbody></table>';

      var combinedPercentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;
      var combinedGrade = totalMax > 0 ? calculateGrade(combinedPercentage) : '—';
      var combinedStatus = passedAll ? 'Pass' : 'Fail';

      // Wrapper to push footer elements to bottom
      html += '<div class="report-card-footer" style="margin-top: auto; display: flex; flex-direction: column;">';

      // Bottom summaries
      html += '<div class="summary-footer">';
      html += '<div><span>Grand Total Scored:</span> ' + totalObtained + ' / ' + totalMax + '</div>';
      html += '<div><span>Overall Percentage:</span> ' + combinedPercentage + '%</div>';
      html += '<div><span>Academic Grade:</span> ' + combinedGrade + '</div>';
      
      var resClass = combinedStatus === 'Pass' ? 'pass' : 'fail';
      html += '<div><span>Academic Result:</span> <span class="result-badge ' + resClass + '">' + combinedStatus + '</span></div>';
      
      if (rank <= 3) {
        html += '<div style="margin-top: 10px; grid-column: span 2; display: flex; align-items: center; justify-content: center; background: #fffdf0; border: 1px solid #ffd700; color: #b8860b; font-weight: bold; font-size: 13px; padding: 6px; border-radius: 6px; gap: 4px;">';
        html += '<span class="material-icons-round" style="font-size: 18px; color: #ffd700; vertical-align: middle;">emoji_events</span> Class Rank: ' + rankText + ' (Top Performer)</div>';
      }
      html += '</div>';

      // 1. Grading Scale Legend
      html += '<div class="grading-legend">';
      html += '<strong>Grading Scale:</strong> A+: 90-100% &nbsp;|&nbsp; A: 80-89% &nbsp;|&nbsp; B: 70-79% &nbsp;|&nbsp; C: 60-69% &nbsp;|&nbsp; D: 33-59% &nbsp;|&nbsp; F: Below 33%';
      html += '</div>';

      // 2. Important Notes Block
      html += '<div class="important-notes">';
      html += '<strong>Important Notes:</strong><br>';
      html += '1. Parents are requested to review the performance and sign.<br>';
      html += '2. This is a computer-generated document.';
      html += '</div>';

      // 3. Signatures
      html += '<div class="signatures">';
      html += '<div class="signature-box">Class Teacher</div>';
      html += '<div class="signature-box">Principal</div>';
      html += '</div>';

      html += '</div>'; // End report-card-footer
    }

    html += '</div>'; // End report-card
    html += '<script>window.onload = function() { window.print(); }</script>';
    html += '</body></html>';

    printWindow.document.write(html);
    printWindow.document.close();
  }

  function attachEvents() {
    // Mode toggles
    var modeSingle = document.getElementById('exam-mode-single');
    if (modeSingle) {
      modeSingle.addEventListener('click', function() {
        state.isCombined = false;
        render();
      });
    }

    var modeCombined = document.getElementById('exam-mode-combined');
    if (modeCombined) {
      modeCombined.addEventListener('click', function() {
        state.isCombined = true;
        render();
      });
    }

    // Combined Term 1 Select changes
    var term1Sel = document.getElementById('exam-select-term1');
    if (term1Sel) {
      term1Sel.addEventListener('change', function() {
        state.combinedTerm1 = this.value;
        render();
      });
    }

    // Combined Term 2 Select changes
    var term2Sel = document.getElementById('exam-select-term2');
    if (term2Sel) {
      term2Sel.addEventListener('change', function() {
        state.combinedTerm2 = this.value;
        render();
      });
    }

    // Exam Select changes
    var examSel = document.getElementById('exam-select-term');
    if (examSel) {
      examSel.addEventListener('change', function() {
        state.examTerm = this.value;
        render();
      });
    }

    // Class Select changes
    var classSel = document.getElementById('exam-select-class');
    if (classSel) {
      classSel.addEventListener('change', function() {
        state.classVal = this.value;
        render();
      });
    }

    // Section Select changes
    var secSel = document.getElementById('exam-select-section');
    if (secSel) {
      secSel.addEventListener('change', function() {
        state.sectionVal = this.value;
        render();
      });
    }

    // Save All Marks click handler
    var saveBtn = document.getElementById('exam-save-all-marks-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        if (SchoolApp.isTeacher()) {
          var ct = SchoolApp.currentUser.classTeacherOf || [];
          var st = SchoolApp.currentUser.subjectTeacherOf || [];
          var isAssigned = ct.some(function(c) {
            return String(c.class).toLowerCase().trim() === String(state.classVal).toLowerCase().trim() &&
                   String(c.section).toLowerCase().trim() === String(state.sectionVal).toLowerCase().trim();
          }) || st.some(function(c) {
            return String(c.class).toLowerCase().trim() === String(state.classVal).toLowerCase().trim() &&
                   String(c.section).toLowerCase().trim() === String(state.sectionVal).toLowerCase().trim();
          });
          if (!isAssigned) {
            SchoolApp.showToast('Access Denied: You are not assigned to this class/section.', 'error');
            return;
          }
        }

        var scoreInputs = document.querySelectorAll('.exam-score-input');
        
        var studentScores = {};
        var isValid = true;

        scoreInputs.forEach(function(input) {
          var sId = input.getAttribute('data-student-id');
          var subId = input.getAttribute('data-subject-id');
          var maxVal = parseFloat(input.getAttribute('data-max') || 100);
          var val = input.value.trim();

          if (val === '') {
            isValid = false;
            input.style.borderColor = 'var(--danger)';
          } else {
            var score = parseFloat(val);
            if (isNaN(score) || score < 0 || score > maxVal) {
              isValid = false;
              input.style.borderColor = 'var(--danger)';
            } else {
              input.style.borderColor = '';
              if (!studentScores[sId]) studentScores[sId] = {};
              studentScores[sId][subId] = String(score);
            }
          }
        });

        if (!isValid) {
          SchoolApp.showToast('Please enter valid, non-negative scores within Max Marks thresholds.', 'error');
          return;
        }

        SchoolApp.createRestorePoint('Auto-Backup before saving student marks');

        var mappingKey = state.examTerm + '_' + state.classVal;
        var subjects = SchoolApp.store.subjectMapping[mappingKey] || SchoolApp.store.subjectMapping[state.classVal] || [];
        var students = (SchoolApp.store.students || []).filter(function(s) {
          return s.class === state.classVal && s.section === state.sectionVal && s.status === 'Active';
        });

        if (!SchoolApp.store.marks) SchoolApp.store.marks = [];

        students.forEach(function(s) {
          var scores = studentScores[s.id];
          if (!scores) return;

          // Find existing mark entry for this student and exam
          var existingIdx = SchoolApp.store.marks.findIndex(function(m) {
            return m.studentId === s.id && m.examId === state.examTerm;
          });
          var existingEntry = existingIdx !== -1 ? SchoolApp.store.marks[existingIdx] : null;

          var mergedScores = {};
          if (existingEntry && existingEntry.scores) {
            Object.assign(mergedScores, existingEntry.scores);
          }
          Object.assign(mergedScores, scores);

          var totalScored = 0;
          var maxTotal = 0;
          var passedAll = true;

          subjects.forEach(function(sub) {
            var scoreVal = mergedScores[sub.id];
            var score = scoreVal !== undefined && scoreVal !== '' ? parseFloat(scoreVal) : 0;
            totalScored += score;
            maxTotal += sub.maxMarks;
            if (score < sub.passMarks) passedAll = false;
          });

          var percentage = Math.round((totalScored / maxTotal) * 100);
          var grade = calculateGrade(percentage);

          var entry = {
            studentId: s.id,
            examId: state.examTerm,
            class: state.classVal,
            section: state.sectionVal,
            scores: mergedScores,
            totalScored: totalScored,
            maxTotal: maxTotal,
            percentage: percentage,
            grade: grade,
            status: passedAll ? 'Pass' : 'Fail'
          };

          if (existingIdx !== -1) {
            // Merge ID to preserve key
            entry.id = SchoolApp.store.marks[existingIdx].id;
            SchoolApp.store.marks[existingIdx] = entry;
          } else {
            entry.id = SchoolApp.generateId();
            SchoolApp.store.marks.push(entry);
          }
        });

        SchoolApp.save();
        SchoolApp.showToast('Student examination scores committed successfully!', 'success');
        render();
      });
    }

    // Individual Generate Marksheet button click handler
    document.querySelectorAll('.generate-reportcard-btn, .generate-combined-reportcard-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        printStudentMarksheet(this.getAttribute('data-student-id'));
      });
    });
  }

  // Register Module
  SchoolApp.registerModule('exams', {
    init: function() {},
    render: render
  });

})();
