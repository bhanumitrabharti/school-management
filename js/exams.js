'use strict';

/* ============================================================
   Paathshala School ERP - Redesigned Examination Module
   ============================================================ */

(function() {
  var examEventsAttached = false;

  // FIX 1: Debounce timers to prevent Firebase write exhaustion
  var saveDebounceTimers = {};
  function debouncedSave(key, fn, delay) {
    if (saveDebounceTimers[key]) clearTimeout(saveDebounceTimers[key]);
    saveDebounceTimers[key] = setTimeout(function() {
      delete saveDebounceTimers[key];
      fn();
    }, delay || 800);
  }

  // Strip undefined/null values recursively before Firestore writes
  function cleanForFirestore(obj) {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object' || Array.isArray(obj) || obj instanceof Date) return obj;
    var clean = {};
    Object.keys(obj).forEach(function(key) {
      var v = obj[key];
      if (v !== undefined && v !== null) {
        if (typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
          var nested = cleanForFirestore(v);
          if (nested && Object.keys(nested).length > 0) clean[key] = nested;
        } else {
          clean[key] = v;
        }
      }
    });
    return clean;
  }

  var state = {
    includeInactiveLeft: false,
    activeSubTab: 'setup', // 'setup', 'marks_entry', 'results', 'report_cards'
    examTerm: '',
    classVal: '',
    sectionVal: '',
    subjectVal: '', // active subject for marks entry matrix
    loadingMarks: false,
    fetchedTerms: {},
    
    // Consolidated Combined Mode filters
    isCombined: false,
    combinedTerms: [], // array of selected term IDs to combine
    combinedWeightages: {}, // termId -> weightage
    
    // Wizard state
    wizardStep: 1,
    wizardTerms: [
      { id: 'term_1', name: 'Term 1 (Half-Yearly)', shortName: 'T1', startDate: '2025-10-01', endDate: '2025-10-15', weightage: 50, selected: true },
      { id: 'term_2', name: 'Term 2 (Annual)', shortName: 'T2', startDate: '2026-03-01', endDate: '2026-03-15', weightage: 50, selected: true },
      { id: 'term_ut1', name: 'Unit Test 1', shortName: 'UT1', startDate: '2025-07-10', endDate: '2025-07-15', weightage: 10, selected: false },
      { id: 'term_ut2', name: 'Unit Test 2', shortName: 'UT2', startDate: '2025-12-15', endDate: '2025-12-20', weightage: 10, selected: false },
      { id: 'term_pb', name: 'Pre-Board', shortName: 'PB', startDate: '2026-01-20', endDate: '2026-01-30', weightage: 20, selected: false }
    ],
    wizardSubjects: {},
    wizardDefaults: {
      Theory: { full: 100, pass: 33 },
      Practical: { full: 50, pass: 17 },
      Internal: { full: 25, pass: 8 },
      Language: { full: 100, pass: 33 }
    }
  };

  var pendingTermLoads = {};
  async function ensureMarksLoaded(termId) {
    if (!termId) return;
    if (state.fetchedTerms && state.fetchedTerms[termId]) {
      return;
    }
    var isRestr = typeof SchoolApp.isRestructured === 'function' && SchoolApp.isRestructured();
    if (!isRestr && SchoolApp.store && SchoolApp.store.examMarks && SchoolApp.store.examMarks[termId] && Object.keys(SchoolApp.store.examMarks[termId]).length > 0) {
      if (!state.fetchedTerms) state.fetchedTerms = {};
      state.fetchedTerms[termId] = true;
      return;
    }
    if (pendingTermLoads[termId]) {
      return pendingTermLoads[termId];
    }
    if (typeof SchoolApp.loadExamMarksTerm === 'function') {
      state.loadingMarks = true;
      pendingTermLoads[termId] = (async function() {
        try {
          await SchoolApp.loadExamMarksTerm(termId);
        } catch (e) {
          console.warn('[Exams] Failed to load exam marks for term:', termId, e);
        } finally {
          if (!state.fetchedTerms) state.fetchedTerms = {};
          state.fetchedTerms[termId] = true;
          state.loadingMarks = false;
          delete pendingTermLoads[termId];
        }
      })();
      return pendingTermLoads[termId];
    }
  }

  function renderMarksLoadingSpinner() {
    return '<div class="card mt-3"><div class="card-body text-center" style="padding:48px 24px;">' +
      '<div class="spinner" style="display:inline-block; width:36px; height:36px; border:3px solid #E5E7EB; border-top-color:#1E3A8A; border-radius:50%; animation:spin 1s linear infinite;"></div>' +
      '<p style="margin-top:14px; color:#6B7280; font-size:14px; font-weight:500;">Loading examination marks from database...</p>' +
      '</div></div>';
  }

  function printViaBlob(htmlContent, studentName, studentClass, v2Options) {
    if (v2Options) {
      return printViaBlobV2(htmlContent, studentName, studentClass, v2Options);
    }
    var safeName = (studentName || 'Student')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '_');

    var safeClass = (studentClass || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .trim();

    var filename = safeName + (safeClass ? '_Class_' + safeClass : '') + '_Report_Card.pdf';

    var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + filename + '</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap">' +
      '<style>' +
      '@page{size:A4 portrait;margin-top:18mm;margin-bottom:8mm;margin-left:8mm;margin-right:8mm;}' +
      '* { box-sizing: border-box; }' +
      'body{margin:0;padding:0;font-family:Inter,Arial,sans-serif;}' +
      '.marks-header th, .marks-header td {' +
      '  background:#1E3A8A !important;' +
      '  color:#FFFFFF !important;' +
      '  -webkit-print-color-adjust:exact !important;' +
      '  print-color-adjust:exact !important;' +
      '}' +
      '.total-row td {' +
      '  background:#1E3A8A !important;' +
      '  color:#FFFFFF !important;' +
      '  -webkit-print-color-adjust:exact !important;' +
      '  print-color-adjust:exact !important;' +
      '}' +
      '</style>' +
      '</head><body>' + htmlContent + '</body></html>';
    var blob = new Blob([fullHtml], {type: 'text/html'});
    var url = URL.createObjectURL(blob);
    var printWin = window.open(url, '_blank', 'width=900,height=700,toolbar=0,menubar=0');
    if (!printWin) {
      SchoolApp.showToast('Popup blocker prevented opening printable report card. Please allow popups.', 'warning');
      return;
    }
    printWin.onload = function() {
      printWin.document.title = filename;
      printWin.focus();
      printWin.print();
      setTimeout(function() {
        URL.revokeObjectURL(url);
      }, 5000);
    };
  }

  function printViaBlobV2(htmlContent, studentName, studentClass, options) {
    options = options || {};
    var safeName = (studentName || 'Student')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '_');

    var safeClass = (studentClass || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .trim();

    var filename = safeName + (safeClass ? '_Class_' + safeClass : '') + '_Report_Card.pdf';

    var orientation = options.orientation || (htmlContent && htmlContent.indexOf('data-orientation="landscape"') !== -1 ? 'landscape' : 'portrait');

    var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + filename + '</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;800;900&family=Inter:wght@400;500;600;700;800;900&display=swap">' +
      '<style>' +
      '@page{size:A4 ' + orientation + ';margin-top:8mm;margin-bottom:8mm;margin-left:8mm;margin-right:8mm;}' +
      '* { box-sizing: border-box; }' +
      'body{margin:0;padding:0;font-family:Inter,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#FFF;}' +
      '.marks-header th, .marks-header td {' +
      '  background:#1E3A8A !important;' +
      '  color:#FFFFFF !important;' +
      '  -webkit-print-color-adjust:exact !important;' +
      '  print-color-adjust:exact !important;' +
      '}' +
      '.total-row td {' +
      '  background:#0F172A !important;' +
      '  color:#FFFFFF !important;' +
      '  -webkit-print-color-adjust:exact !important;' +
      '  print-color-adjust:exact !important;' +
      '}' +
      '</style>' +
      '</head><body>' + htmlContent + '</body></html>';
    var blob = new Blob([fullHtml], {type: 'text/html'});
    var url = URL.createObjectURL(blob);
    var printWin = window.open(url, '_blank', 'width=950,height=750,toolbar=0,menubar=0');
    if (!printWin) {
      SchoolApp.showToast('Popup blocker prevented opening printable report card. Please allow popups.', 'warning');
      return;
    }
    printWin.onload = function() {
      printWin.document.title = filename;
      printWin.focus();
      printWin.print();
      setTimeout(function() {
        URL.revokeObjectURL(url);
      }, 60000);
    };
    printWin.onafterprint = function() {
      try { printWin.close(); } catch(e) {}
    };
  }

    // ==================== EXAM CALCULATION ENGINE (PURE ZERO-DOM) ====================
  var ExamCalculationEngine = {
    calculateGrade: function(percentage, customScale) {
      var scale = customScale || (SchoolApp.store && SchoolApp.store.examConfig && SchoolApp.store.examConfig.gradingScale) || [
        {min:91, max:100, grade:"A+", label:"Outstanding"},
        {min:81, max:90,  grade:"A",  label:"Excellent"},
        {min:71, max:80,  grade:"B+", label:"Very Good"},
        {min:61, max:70,  grade:"B",  label:"Good"},
        {min:51, max:60,  grade:"C+", label:"Above Average"},
        {min:41, max:50,  grade:"C",  label:"Average"},
        {min:33, max:40,  grade:"D",  label:"Pass"},
        {min:0,  max:32,  grade:"F",  label:"Fail"}
      ];
      for (var i = 0; i < scale.length; i++) {
        if (percentage >= scale[i].min && percentage <= scale[i].max) {
          return scale[i];
        }
      }
      return percentage >= 33 ? {grade:"D", label:"Pass"} : {grade:"F", label:"Fail"};
    },

    calculateStudentResult: function(params) {
      params = params || {};
      var marks = params.marks || {};
      var subjects = ensureSubjectsArray(params.subjects || []);
      var term = params.term || {};
      var schoolConfig = params.schoolConfig || {};
      var passPercent = (schoolConfig.passPercent !== undefined) ? Number(schoolConfig.passPercent) : 33;
      var decimals = (schoolConfig.percentageDecimals !== undefined) ? Number(schoolConfig.percentageDecimals) : 2;

      var totalObtained = 0;
      var totalFull = 0;
      var totalPass = 0;
      var mandatoryFailed = false;
      var optionalFailedOrAbsent = false;
      var missingMandatory = [];
      var missingOptional = [];
      var allAB = true;
      var enteredCount = 0;

      subjects.forEach(function(sub) {
        var sc = marks[sub.id];
        var subFull = sub.fullMarks || 100;
        var defaultSubPass = (passPercent / 100) * subFull;
        var subPass = (sub.passMarks !== undefined && sub.passMarks !== null) ? Number(sub.passMarks) : defaultSubPass;

        var hasEntry = sc && (sc.isAbsent || sc.isExempted || (sc.obtained !== undefined && sc.obtained !== null && String(sc.obtained).trim() !== ''));

        if (hasEntry) {
          enteredCount++;
          if (sc.isExempted) return;

          var obt = sc.isAbsent ? 0 : (parseFloat(sc.obtained) || 0);
          if (!sc.isAbsent) allAB = false;

          totalObtained += obt;
          totalFull += subFull;
          totalPass += subPass;

          var isFail = sc.isAbsent || (obt < subPass);
          if (sub.isOptional) {
            if (isFail) optionalFailedOrAbsent = true;
          } else {
            if (isFail) mandatoryFailed = true;
          }
        } else {
          // Missing subject entry
          if (sub.isOptional) {
            missingOptional.push(sub.id);
          } else {
            missingMandatory.push(sub.id);
            // In finalized/published terms, denominator includes full curriculum for mandatory subjects
            if (term.status === 'published' || term.status === 'locked') {
              totalFull += subFull;
              totalPass += subPass;
            }
          }
        }
      });

      var isComplete = (missingMandatory.length === 0);
      var rawPercentage = totalFull > 0 ? (totalObtained / totalFull) * 100 : 0;
      var displayPercentage = rawPercentage.toFixed(decimals) + '%';

      var requireOverallPass = schoolConfig.requireOverallPass !== false; // default true

      // Sorted descending division bands
      var bands = (schoolConfig.divisionBands && Array.isArray(schoolConfig.divisionBands) && schoolConfig.divisionBands.length > 0)
        ? schoolConfig.divisionBands.slice().sort(function(a, b) { return b.min - a.min; })
        : [
            {min:75, label:"First Division (Distinction)"},
            {min:60, label:"First Division"},
            {min:45, label:"Second Division"},
            {min:33, label:"Third Division"}
          ];
      var lowestPassBandLabel = bands.length > 0 ? bands[bands.length - 1].label : 'Third Division';

      var resultText = 'PASS';
      var divisionText = lowestPassBandLabel;

      if (!isComplete && (term.status === 'published' || term.status === 'locked')) {
        resultText = 'INCOMPLETE';
        divisionText = '—';
      } else if (allAB && subjects.length > 0) {
        resultText = 'ABSENT';
        divisionText = 'Not Applicable';
      } else if (mandatoryFailed || (requireOverallPass && rawPercentage < passPercent)) {
        resultText = 'FAIL';
        divisionText = 'Not Applicable';
      } else {
        resultText = 'PASS';
        if (optionalFailedOrAbsent) {
          divisionText = 'Not Awarded'; // Decision 2: Optional subject fail never fails overall
        } else {
          var matchedBand = null;
          for (var b = 0; b < bands.length; b++) {
            if (rawPercentage >= bands[b].min) {
              matchedBand = bands[b].label;
              break;
            }
          }
          divisionText = matchedBand || lowestPassBandLabel;
        }
      }

      var gradeObj = this.calculateGrade(rawPercentage, schoolConfig.gradingScale);

      var rankFailedStudents = schoolConfig.rankFailedStudents !== false; // default true
      var eligibleForRank = (resultText !== 'INCOMPLETE') && (rankFailedStudents || resultText !== 'FAIL');

      var finalDisplayPct = (resultText === 'INCOMPLETE') ? '—' : displayPercentage;
      var finalGrade = (resultText === 'INCOMPLETE') ? '—' : gradeObj.grade;
      var finalGradeLabel = (resultText === 'INCOMPLETE') ? 'Incomplete' : gradeObj.label;

      return {
        total: totalObtained,
        maxTotal: totalFull,
        passTotal: totalPass,
        percentage: rawPercentage,
        displayPercentage: finalDisplayPct,
        grade: finalGrade,
        gradeLabel: finalGradeLabel,
        division: divisionText,
        result: resultText,
        isComplete: isComplete,
        missingMandatorySubjects: missingMandatory,
        missingOptionalSubjects: missingOptional,
        eligibleForRank: eligibleForRank
      };
    },

    recalculateStudentEntryV2: function(entry, subjects, term, schoolConfig) {
      var res = this.calculateStudentResult({
        marks: entry.marks,
        subjects: subjects,
        term: term,
        schoolConfig: schoolConfig
      });
      entry.total = res.total;
      entry.maxTotal = res.maxTotal;
      entry.percentage = Math.round(res.percentage);
      entry.rawPercentage = res.percentage;
      entry.displayPercentage = res.displayPercentage;
      entry.grade = res.grade;
      entry.gradeLabel = res.gradeLabel;
      entry.division = res.division;
      entry.result = res.result;
      entry.isComplete = res.isComplete;
      entry.missingMandatorySubjects = res.missingMandatorySubjects;
      entry.eligibleForRank = res.eligibleForRank;
      return res;
    },

    autoSaveRecalculateV2: function(entry, subjectsArr, term, schoolConfig) {
      var res = this.calculateStudentResult({
        marks: entry.marks,
        subjects: subjectsArr,
        term: term,
        schoolConfig: schoolConfig
      });
      entry.total = res.total;
      entry.maxTotal = res.maxTotal;
      entry.percentage = Math.round(res.percentage);
      entry.rawPercentage = res.percentage;
      entry.displayPercentage = res.displayPercentage;
      entry.grade = res.grade;
      entry.gradeLabel = res.gradeLabel;
      entry.division = res.division;
      entry.result = res.result;
      entry.isComplete = res.isComplete;
      entry.missingMandatorySubjects = res.missingMandatorySubjects;
      entry.eligibleForRank = res.eligibleForRank;
      entry.lastUpdated = new Date().toISOString();
      return res;
    },

calculateMultiExamResult: function(params) {
      params = params || {};
      var terms = params.terms || [];
      if (terms.length === 0) return { total: 0, maxTotal: 0, percentage: 0, displayPercentage: '0.00%', grade: '—', division: '—', result: '—' };

      var marksMap = params.marksMap || {};
      var studentClass = params.studentClass || '';
      var schoolConfig = params.schoolConfig || (SchoolApp.store && SchoolApp.store.reportCardConfig) || {};
      var gradingScale = schoolConfig.gradingScale;
      var multiCfg = schoolConfig.multiExamAggregation || {};
      var mode = multiCfg.mode || 'none';
      var weights = multiCfg.weights || {};
      var allSubjects = ensureSubjectsArray(params.subjects || []);

      var termResults = {};
      var termTotals = {};

      var unitTerms = terms.filter(function(t) { return t.examType === 'unit_test'; });
      var mainTerms = terms.filter(function(t) { return t.examType !== 'unit_test'; });
      var hasUnitTests = unitTerms.length > 0;

      var utMode = schoolConfig.unitTestMode || (multiCfg && multiCfg.unitTestMode) || 'display_only';
      var utWeight = Number(schoolConfig.unitTestWeight !== undefined ? schoolConfig.unitTestWeight : (multiCfg.unitTestWeight !== undefined ? multiCfg.unitTestWeight : 20));
      var utBestOf = Number(schoolConfig.unitTestBestOf !== undefined ? schoolConfig.unitTestBestOf : (multiCfg.unitTestBestOf !== undefined ? multiCfg.unitTestBestOf : 1));

      terms.forEach(function(t) {
        var tSubs = (params.termSubjects && params.termSubjects[t.id]) ||
          (SchoolApp.store && SchoolApp.store.examSubjects && SchoolApp.store.examSubjects[t.id] &&
          (SchoolApp.store.examSubjects[t.id][studentClass] || SchoolApp.store.examSubjects[t.id]['Class ' + studentClass]) &&
          (SchoolApp.store.examSubjects[t.id][studentClass] || SchoolApp.store.examSubjects[t.id]['Class ' + studentClass]).subjects) || allSubjects;
        tSubs = ensureSubjectsArray(tSubs);

        var tMarks = marksMap[t.id] || {};
        var res = ExamCalculationEngine.calculateStudentResult({
          marks: tMarks,
          subjects: tSubs,
          term: t,
          schoolConfig: schoolConfig
        });
        termResults[t.id] = res;
        termTotals[t.id] = {
          obtained: res.total,
          maxTotal: res.maxTotal,
          passTotal: res.passTotal,
          percentage: res.percentage,
          displayPercentage: res.displayPercentage,
          grade: res.grade,
          division: res.division,
          result: res.result
        };
      });

      if (mode === 'none' && !hasUnitTests) {
        return {
          mode: 'none',
          isConsolidated: false,
          termTotals: termTotals,
          termResults: termResults,
          basisNote: '',
          hasUnitTests: false,
          unitTerms: [],
          mainTerms: terms
        };
      }

      var grandPct = 0;
      var grandObt = 0;
      var grandFull = 0;
      var grandPass = 0;
      var hasAnyIncomplete = false;
      var hasAnyFail = false;
      var allTermsAbsent = true;
      var pendingSubjects = [];
      var isConsolidated = true;
      var basisNote = '';
      var decimals = (schoolConfig.percentageDecimals !== undefined) ? Number(schoolConfig.percentageDecimals) : 2;

      if (hasUnitTests) {
        var evalMainTerms = mainTerms.length > 0 ? mainTerms : terms;
        var mainGrandObt = evalMainTerms.reduce(function(a, t) { return a + (termTotals[t.id] ? termTotals[t.id].obtained : 0); }, 0);
        var mainGrandFull = evalMainTerms.reduce(function(a, t) { return a + (termTotals[t.id] ? termTotals[t.id].maxTotal : 0); }, 0);
        grandPass = evalMainTerms.reduce(function(a, t) { return a + ((termResults[t.id] && termResults[t.id].passTotal) || 0); }, 0);
        var mainPct = mainGrandFull > 0 ? (mainGrandObt / mainGrandFull) * 100 : 0;

        var utGrandObt = unitTerms.reduce(function(a, t) { return a + (termTotals[t.id] ? termTotals[t.id].obtained : 0); }, 0);
        var utGrandFull = unitTerms.reduce(function(a, t) { return a + (termTotals[t.id] ? termTotals[t.id].maxTotal : 0); }, 0);
        var utPct = utGrandFull > 0 ? (utGrandObt / utGrandFull) * 100 : 0;

        if (utMode === 'display_only') {
          grandObt = mainGrandObt;
          grandFull = mainGrandFull;
          grandPct = mainPct;
          isConsolidated = (mode !== 'none');
          basisNote = 'Final result based on Main Examinations (Unit Tests shown for reference)';
        } else if (utMode === 'weighted') {
          var wUT = utWeight;
          var wMain = 100 - wUT;
          grandPct = (utPct * wUT + mainPct * wMain) / 100;
          grandObt = mainGrandObt + utGrandObt;
          grandFull = mainGrandFull + utGrandFull;
          isConsolidated = true;
          basisNote = 'Final result: Unit Tests ' + wUT + '% + Main Examinations ' + wMain + '%';
        } else if (utMode === 'best_of_n') {
          var n = Math.min(Math.max(1, utBestOf), unitTerms.length);
          var utPcts = unitTerms.map(function(t) { return (termResults[t.id] && termResults[t.id].percentage) || 0; }).sort(function(a, b) { return b - a; });
          var bestNPcts = utPcts.slice(0, n);
          var utBestPct = bestNPcts.length > 0 ? (bestNPcts.reduce(function(a, b) { return a + b; }, 0) / bestNPcts.length) : 0;
          var wUT = utWeight;
          var wMain = 100 - wUT;
          grandPct = (utBestPct * wUT + mainPct * wMain) / 100;
          grandObt = mainGrandObt;
          grandFull = mainGrandFull;
          isConsolidated = true;
          basisNote = 'Final result: Best ' + n + ' of ' + unitTerms.length + ' Unit Tests (' + wUT + '%) + Main Examinations (' + wMain + '%)';
        }

        hasAnyIncomplete = evalMainTerms.some(function(t) { return termResults[t.id] && termResults[t.id].result === 'INCOMPLETE'; });
        hasAnyFail = evalMainTerms.some(function(t) { return termResults[t.id] && termResults[t.id].result === 'FAIL'; });
        allTermsAbsent = evalMainTerms.every(function(t) { return termResults[t.id] && termResults[t.id].result === 'ABSENT'; });
      } else {
        terms.forEach(function(t) {
          var r = termResults[t.id];
          if (!r) return;
          grandObt += r.total;
          grandFull += r.maxTotal;
          grandPass += r.passTotal;
          if (r.result === 'INCOMPLETE') {
            hasAnyIncomplete = true;
            if (r.missingMandatorySubjects) {
              r.missingMandatorySubjects.forEach(function(m) {
                if (pendingSubjects.indexOf(m) === -1) pendingSubjects.push(m);
              });
            }
          }
          if (r.result === 'FAIL') hasAnyFail = true;
          if (r.result !== 'ABSENT') allTermsAbsent = false;
        });

        if (mode === 'sum') {
          grandPct = grandFull > 0 ? (grandObt / grandFull) * 100 : 0;
        } else if (mode === 'average') {
          var validTerms = terms.filter(function(t) { return termResults[t.id] && termResults[t.id].maxTotal > 0; });
          var sumPct = validTerms.reduce(function(acc, t) { return acc + termResults[t.id].percentage; }, 0);
          grandPct = validTerms.length > 0 ? (sumPct / validTerms.length) : 0;
        } else if (mode === 'weighted') {
          var totalW = 0;
          var weightedSum = 0;
          terms.forEach(function(t) {
            var hasExplicitW = (weights && weights[t.id] !== undefined && weights[t.id] !== null && String(weights[t.id]).trim() !== '');
            var w = hasExplicitW ? Number(weights[t.id]) : (100 / terms.length);
            if (isNaN(w) || w < 0) w = 0;
            totalW += w;
            var p = (termResults[t.id] && termResults[t.id].percentage) || 0;
            weightedSum += (p * w);
          });
          grandPct = totalW > 0 ? (weightedSum / totalW) : 0;
        } else if (mode === 'bestOfN') {
          var n = Number(multiCfg.bestOfNCount) || Math.max(1, terms.length - 1);
          var sortedPcts = terms.map(function(t) { return (termResults[t.id] && termResults[t.id].percentage) || 0; }).sort(function(a, b) { return b - a; });
          var bestN = sortedPcts.slice(0, n);
          var sumBest = bestN.reduce(function(a, b) { return a + b; }, 0);
          grandPct = bestN.length > 0 ? (sumBest / bestN.length) : 0;
        }
        isConsolidated = (mode !== 'none');
        basisNote = '';
      }

      var grandGradeObj = ExamCalculationEngine.calculateGrade(grandPct, gradingScale);
      var passPercent = (schoolConfig.passPercent !== undefined) ? Number(schoolConfig.passPercent) : 33;
      var requireOverallPass = schoolConfig.requireOverallPass !== false;

      var grandResult = 'PASS';
      var bands = (schoolConfig.divisionBands && Array.isArray(schoolConfig.divisionBands) && schoolConfig.divisionBands.length > 0)
        ? schoolConfig.divisionBands.slice().sort(function(a, b) { return b.min - a.min; })
        : [
            {min:75, label:"First Division (Distinction)"},
            {min:60, label:"First Division"},
            {min:45, label:"Second Division"},
            {min:33, label:"Third Division"}
          ];
      var lowestPassBandLabel = bands.length > 0 ? bands[bands.length - 1].label : 'Third Division';
      var grandDivision = lowestPassBandLabel;

      if (hasAnyIncomplete) {
        grandResult = 'INCOMPLETE';
        grandDivision = '—';
      } else if (allTermsAbsent) {
        grandResult = 'ABSENT';
        grandDivision = 'Not Applicable';
      } else if (hasAnyFail || (requireOverallPass && grandPct < passPercent)) {
        grandResult = 'FAIL';
        grandDivision = 'Not Applicable';
      } else {
        grandResult = 'PASS';
        var matchedBand = null;
        for (var b = 0; b < bands.length; b++) {
          if (grandPct >= bands[b].min) {
            matchedBand = bands[b].label;
            break;
          }
        }
        grandDivision = matchedBand || lowestPassBandLabel;
      }

      var displayGrandPct = grandResult === 'INCOMPLETE' ? '—' : grandPct.toFixed(decimals) + '%';
      var displayGrandGrade = grandResult === 'INCOMPLETE' ? '—' : grandGradeObj.grade;

      return {
        mode: mode,
        isConsolidated: isConsolidated,
        total: grandObt,
        maxTotal: grandFull,
        passTotal: grandPass,
        percentage: grandPct,
        displayPercentage: displayGrandPct,
        grade: displayGrandGrade,
        gradeLabel: grandGradeObj.label,
        division: grandDivision,
        result: grandResult,
        termTotals: termTotals,
        termResults: termResults,
        basisNote: basisNote,
        unitTerms: unitTerms,
        mainTerms: mainTerms,
        hasUnitTests: hasUnitTests
      };
    },

        recalculateRanksV2: function(termId, classId, sectionId, schoolConfig) {
      schoolConfig = schoolConfig || {};
      var rankScope = schoolConfig.rankScope || 'section';
      var rankFailedStudents = schoolConfig.rankFailedStudents !== false;

      var students = (SchoolApp.store.students || []).filter(function(s) {
        if (s.inTrash || s.status === 'Deleted' || s.status !== 'Active') return false;
        var matchCls = String(s.class).toLowerCase().trim() === String(classId).toLowerCase().trim();
        if (rankScope === 'class') return matchCls;
        var matchSec = String(s.section).toLowerCase().trim() === String(sectionId).toLowerCase().trim();
        return matchCls && matchSec;
      });

      var classMarks = (SchoolApp.store.examMarks && SchoolApp.store.examMarks[termId] && SchoolApp.store.examMarks[termId][classId]) || {};
      var rankList = [];

      students.forEach(function(s) {
        var secMarks = classMarks[s.section] || {};
        var sm = secMarks[s.id];
        if (sm) {
          if (!sm.isComplete || sm.result === 'INCOMPLETE' || sm.result === 'N/A') {
            sm.rank = null;
            return;
          }
          if (sm.result === 'FAIL' && !rankFailedStudents) {
            sm.rank = null;
            return;
          }
          var pct = (sm.rawPercentage !== undefined) ? sm.rawPercentage : (sm.percentage || 0);
          rankList.push({
            studentId: s.id,
            percentage: pct,
            total: sm.total || 0,
            sm: sm
          });
        }
      });

      // Sort descending by percentage, then total
      rankList.sort(function(a, b) {
        if (b.percentage !== a.percentage) {
          return b.percentage - a.percentage;
        }
        return b.total - a.total;
      });

      // Assign tied ranks: 1, 1, 3, 4
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
    },

    hasAnyMarksForTerm: function(termId) {
      var tm = (SchoolApp.store && SchoolApp.store.examMarks && SchoolApp.store.examMarks[termId]) || {};
      var classes = Object.keys(tm);
      for (var i = 0; i < classes.length; i++) {
        var cKey = classes[i];
        if (cKey.startsWith('_') || cKey === 'updatedAt' || cKey === 'migratedAt' || cKey === 'id') continue;
        var secObj = tm[cKey];
        if (typeof secObj === 'object' && secObj !== null) {
          var sections = Object.keys(secObj);
          for (var j = 0; j < sections.length; j++) {
            var stuObj = secObj[sections[j]];
            if (typeof stuObj === 'object' && stuObj !== null && Object.keys(stuObj).length > 0) {
              return true;
            }
          }
        }
      }
      return false;
    },

    generateSingleStudentCardHTMLV2: function(s, isCombined, savedMarks, combinedData, activeTerm, subjects, schoolConfig) {
      schoolConfig = schoolConfig || (SchoolApp.store && SchoolApp.store.reportCardConfig) || {};
      var store = (SchoolApp && SchoolApp.store) || {};
      var settings = store.settings || {};
      var schoolInfo = settings.schoolInfo || {};
      var schoolCfg = schoolConfig.school || {};
      var studentCfg = schoolConfig.student || {};
      var acaCfg = schoolConfig.academic || {};
      var colToggles = schoolConfig.columnToggles || { showPassMarks: true, showFullMarks: true, showObtained: true, showGrade: true };
      var secToggles = schoolConfig.sectionToggles || { showAttendance: true, showRemarks: true, showGradingLegend: true, showSignatures: true };
      var branding = schoolConfig.branding || {};
      var design = schoolConfig.design || {};
      var multiCfg = schoolConfig.multiExamAggregation || {};

      var primaryColor = branding.primaryColor || design.primaryColor || '#1E3A8A';
      var schoolName = settings.name || settings.schoolName || schoolInfo.name || branding.schoolName || '';
      var tagline = settings.tagline || settings.schoolTagline || schoolInfo.tagline || branding.schoolTagline || '';
      var address = settings.address || settings.schoolAddress || schoolInfo.address || '';
      var phone = settings.phone || settings.schoolPhone || schoolInfo.phone || '';
      var email = settings.email || settings.schoolEmail || schoolInfo.email || '';
      var website = settings.website || settings.schoolWebsite || schoolInfo.website || '';
      var udise = settings.udiseCode || settings.udiseNo || schoolInfo.udiseCode || '';
      var affiliation = settings.affiliation || settings.affiliationNo || schoolInfo.affiliation || '';
      var logo = settings.logoUrl || settings.schoolLogo || schoolInfo.logoUrl || '';

      var termName = activeTerm ? activeTerm.name : 'TERM EXAMINATION';
      // FIX 3: No invented session in v2 code (empty string if no session configured)
      var academicSession = (activeTerm && activeTerm.session) ||
        (schoolConfig && schoolConfig.academic && schoolConfig.academic.session) ||
        (settings && settings.academicYear) ||
        (store && store.examConfig && store.examConfig.session) ||
        '';

      var subjectsArr = ensureSubjectsArray(subjects || []);
      subjectsArr = sortSubjects(subjectsArr);
      var subCount = subjectsArr.length;

      // Multi-exam determination
      var hasCombinedTerms = isCombined && combinedData && combinedData.terms && combinedData.terms.length > 1;
      var cTerms = hasCombinedTerms ? combinedData.terms : [];

      // Split combined terms into unit tests and main exams
      var cUnitTerms = cTerms.filter(function(t) { return t.examType === 'unit_test'; });
      var cMainTerms = cTerms.filter(function(t) { return t.examType !== 'unit_test'; });
      var hasUnitTestsInCard = cUnitTerms.length > 0;

      // Orientation calculation: explicit config override vs auto measurement (portrait preferred)
      var orientation = 'portrait';
      if (schoolConfig.orientation === 'landscape') {
        orientation = 'landscape';
      } else if (schoolConfig.orientation === 'portrait') {
        orientation = 'portrait';
      } else {
        if (hasCombinedTerms && !hasUnitTestsInCard && cTerms.length >= 3) {
          orientation = 'landscape';
        }
      }

      // Multi-exam calculation vs Single-exam calculation
      var multiRes = null;
      var calcRes = null;

      if (hasCombinedTerms) {
        multiRes = ExamCalculationEngine.calculateMultiExamResult({
          terms: cTerms,
          marksMap: (combinedData && combinedData.marks) || {},
          termSubjects: (combinedData && combinedData.termSubjects) || null,
          subjects: subjectsArr,
          studentClass: s.class,
          schoolConfig: schoolConfig
        });
      } else {
        var marksMap = (savedMarks && savedMarks.marks) || {};
        calcRes = ExamCalculationEngine.calculateStudentResult({
          marks: marksMap,
          subjects: subjectsArr,
          term: activeTerm,
          schoolConfig: schoolConfig
        });
      }

      var fontStack = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

      // Helper for rank ordinal (NO EMOJIS)
      function toRankOrdinal(n) {
        if (!n || isNaN(n)) return '—';
        var num = parseInt(n, 10);
        var j = num % 10, k = num % 100;
        var suf = 'th';
        if (j === 1 && k !== 11) suf = 'st';
        else if (j === 2 && k !== 12) suf = 'nd';
        else if (j === 3 && k !== 13) suf = 'rd';
        return num + suf;
      }

      // Helper for date formatting DD-MM-YYYY
      function toDateDDMMYYYY(val) {
        if (!val) return '';
        if (val instanceof Date && !isNaN(val)) {
          var d = String(val.getDate()).padStart(2, '0');
          var m = String(val.getMonth() + 1).padStart(2, '0');
          var y = val.getFullYear();
          return d + '-' + m + '-' + y;
        }
        var str = String(val).trim();
        if (/^\d{2}-\d{2}-\d{4}$/.test(str)) return str;
        var mIso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (mIso) return mIso[3] + '-' + mIso[2] + '-' + mIso[1];
        var parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
          var dd = String(parsed.getDate()).padStart(2, '0');
          var mm = String(parsed.getMonth() + 1).padStart(2, '0');
          var yy = parsed.getFullYear();
          return dd + '-' + mm + '-' + yy;
        }
        return str;
      }

      // Collect Student details items
      var studentItems = [];
      var sName = s.name || ((s.firstName || '') + ' ' + (s.lastName || '')).trim();
      if (studentCfg.name !== false && sName) {
        studentItems.push({ label: 'Student Name', value: sName });
      }
      var sAdm = s.admissionNumber || s.admissionNo || s.admNo || '';
      if (studentCfg.admissionNumber !== false && sAdm) {
        studentItems.push({ label: 'Admission No', value: sAdm });
      }
      var sCls = s.class ? (['Nursery','LKG','UKG'].indexOf(s.class) !== -1 ? s.class : 'Class ' + s.class) : '';
      var sSec = s.section || '';
      var showCls = studentCfg.class !== false && !!sCls;
      var showSec = studentCfg.section !== false && !!sSec;
      if (showCls && showSec) {
        studentItems.push({ label: 'Class & Sec', value: sCls + ' - ' + sSec });
      } else if (showCls) {
        studentItems.push({ label: 'Class', value: sCls });
      } else if (showSec) {
        studentItems.push({ label: 'Section', value: sSec });
      }
      var sRoll = s.rollNumber || s.rollNo || s.roll || '';
      if (studentCfg.rollNumber !== false && sRoll) {
        studentItems.push({ label: 'Roll Number', value: sRoll });
      }
      var sDob = s.dateOfBirth || s.dob || '';
      if (studentCfg.dob !== false && sDob) {
        studentItems.push({ label: 'Date of Birth', value: toDateDDMMYYYY(sDob) });
      }
      var sFather = s.fatherName || s.father || '';
      if (studentCfg.fatherName !== false && sFather) {
        studentItems.push({ label: "Father's Name", value: sFather });
      }
      var sMother = s.motherName || s.mother || '';
      if (studentCfg.motherName !== false && sMother) {
        studentItems.push({ label: "Mother's Name", value: sMother });
      }
      var sParent = s.parentName || s.guardianName || s.guardian || '';
      if (studentCfg.parentName !== false && sParent && sParent !== sFather) {
        studentItems.push({ label: 'Parent / Guardian', value: sParent });
      }
      var sGender = s.gender || s.sex || '';
      if (studentCfg.gender !== false && sGender) {
        studentItems.push({ label: 'Gender', value: sGender });
      }
      var sAddr = s.address || s.studentAddress || '';
      if (studentCfg.address !== false && sAddr) {
        studentItems.push({ label: 'Address', value: sAddr });
      }
      var sAdmDate = s.admissionDate || '';
      if (studentCfg.admissionDate !== false && sAdmDate) {
        studentItems.push({ label: 'Admission Date', value: toDateDDMMYYYY(sAdmDate) });
      }

      var hasPhoto = (studentCfg.photo !== false) && !!(s.photoUrl || s.photo);
      var remarksText = (savedMarks && savedMarks.remarks) || '';
      var effectiveRemarks = remarksText || (calcRes && calcRes.result === 'PASS' ? 'Good performance. Promoted to next class.' : 'Needs improvement in weak subjects.');
      var isFinalTerm = !!(activeTerm && activeTerm.isFinal === true);
      var hasPromotion = isFinalTerm && (acaCfg.promotionStatus === true);
      var hasLegend = (secToggles.showGradingLegend !== false);
      var hasSignatures = (secToggles.showSignatures !== false);

      // FIX 1 & FIX 2: Tiers and genuine overflow height estimation
      var portraitTiers = [
        { name: 'spacious', fontBase: '12px', cellPad: '9px 12px',  studentPad: '6px 10px', logoH: '66px', sigH: '36px', remarksMinH: '46px', rowHMm: 9.0 },
        { name: 'standard', fontBase: '11px', cellPad: '7px 10px',  studentPad: '5px 8px',  logoH: '56px', sigH: '30px', remarksMinH: '36px', rowHMm: 7.2 },
        { name: 'compact',  fontBase: '10px', cellPad: '4.5px 8px', studentPad: '4px 8px',  logoH: '48px', sigH: '26px', remarksMinH: '26px', rowHMm: 5.4 },
        { name: 'dense',    fontBase: '9px',  cellPad: '3.5px 6px', studentPad: '3px 6px',  logoH: '42px', sigH: '22px', remarksMinH: '22px', rowHMm: 5.0 }
      ];

      var landscapeTier = { name: 'landscape', fontBase: '10px', cellPad: '4.5px 8px', studentPad: '3.5px 6px', logoH: '44px', sigH: '22px', remarksMinH: '24px', rowHMm: 5.2 };

      // Accurate estimation of minimum required content height (interior budget: 268mm)
      function estimateContentHeight(t, orient) {
        var h = 0;
        var hH = t.name === 'spacious' ? 32 : (t.name === 'standard' ? 28 : (t.name === 'compact' ? 24 : 22));
        if (schoolCfg.logo === false || !logo) hH -= 6;
        if (orient === 'landscape') hH = 20;
        h += hH;
        h += (orient === 'landscape' ? 8 : 10); // Title banner
        var gCols = orient === 'landscape' ? 3 : 2;
        var gRows = Math.ceil(studentItems.length / gCols);
        var rH = t.name === 'spacious' ? 6.5 : (t.name === 'standard' ? 5.5 : 4.8);
        h += (gRows * rH);
        var tHdr = hasCombinedTerms ? (orient === 'landscape' ? 12 : 14) : 7.0;
        h += tHdr + (subCount * t.rowHMm) + 6.5; // Table header + rows + total
        if (hasUnitTestsInCard) {
          h += 6.5 + (subCount * t.rowHMm) + 6.5 + 8; // Unit tests table + header + title
        }
        if (hasCombinedTerms && !multiRes.isConsolidated) {
          h += (orient === 'landscape' ? 8 : 10) + (cTerms.length * (orient === 'landscape' ? 4.5 : 5.5));
        } else {
          h += (t.name === 'spacious' ? 18 : 15);
        }
        if (secToggles.showRemarks !== false && acaCfg.remarks !== false) {
          var charsPerLine = orient === 'landscape' ? 140 : 90;
          var rLines = Math.max(1, Math.ceil(effectiveRemarks.length / charsPerLine));
          var rBoxH = Math.max(parseInt(t.remarksMinH, 10) * 0.2646, 6 + (rLines * 3.6));
          h += rBoxH;
        }
        if (hasPromotion) h += 10;
        if (hasLegend) h += (orient === 'landscape' ? 5.5 : 6.5);
        if (hasSignatures) {
          h += (parseInt(t.sigH, 10) * 0.2646) + 14;
        }
        return h;
      }

      var tier = null;
      var numPages = 1;

      if (orientation === 'landscape') {
        tier = landscapeTier;
        numPages = 1;
      } else {
        // Try tiers from largest to smallest to maximize font and page utilization
        for (var ti = 0; ti < portraitTiers.length; ti++) {
          var cand = portraitTiers[ti];
          var estH = estimateContentHeight(cand, 'portrait');
          // Available interior height is 268mm (280mm - 12mm padding)
          if (estH <= 265) {
            tier = cand;
            numPages = 1;
            break;
          }
        }
        // Genuine overflow fallback (Scenario 9: 25+ subjects):
        if (!tier || schoolConfig.forceTwoPages === true) {
          numPages = 2;
          tier = portraitTiers[2]; // Use Compact tier (10px >= 10px!) for 2-page layout
        }
      }

      var fontBase = tier.fontBase;
      var cellPad = tier.cellPad;
      var logoH = tier.logoH;
      var sigH = tier.sigH;
      var remarksMinH = tier.remarksMinH;

      // FIX 1: Exact dimensions so distance to printable bottom edge is <= 3mm (strictly 1.0mm)
      var maxW = orientation === 'landscape' ? '281mm' : '194mm';
      var cardH = orientation === 'landscape' ? '193mm' : '280mm';
      var borderStyle = design.showBorder !== false ? 'border:1.5px solid #CBD5E1; border-radius:8px;' : '';
      var containerStyle = 'box-sizing:border-box; font-family:' + fontStack + '; font-size:' + fontBase + '; color:#1F2937; background:#FFFFFF; width:' + maxW + '; max-width:' + maxW + '; height:' + cardH + '; min-height:' + cardH + '; margin:0 auto; padding:6mm 8mm; display:flex; flex-direction:column; justify-content:space-between; ' + borderStyle;

      // RENDER SECTION GENERATORS
      function renderHeader(isContinuation) {
        var hHtml = '';
        var showLogo = (schoolCfg.logo !== false) && !!logo;
        if (isContinuation) {
          var sesPart = academicSession ? ' &bull; Session: ' + escapeHTML(academicSession) : '';
          hHtml += '<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid ' + primaryColor + '; padding-bottom:6px;">';
          hHtml += '<div>';
          hHtml += '<div style="font-size:14px; font-weight:800; color:' + primaryColor + '; text-transform:uppercase; line-height:1.2;">' + escapeHTML(schoolName) + '</div>';
          hHtml += '<div style="font-size:9.5px; color:#4B5563; font-weight:600; margin-top:2px;">Official Report Card Continuation' + sesPart + '</div>';
          hHtml += '</div>';
          hHtml += '<div style="text-align:right; font-size:9.5px; color:#374151;">';
          hHtml += '<strong>Student:</strong> ' + escapeHTML(sName) + ' &bull; <strong>Adm No:</strong> ' + escapeHTML(sAdm || '—') + ' &bull; <strong>Class:</strong> ' + escapeHTML(sCls || '—');
          hHtml += '</div></div>';
          return hHtml;
        }

        hHtml += '<div style="display:flex; align-items:center; gap:14px; border-bottom:2.5px solid ' + primaryColor + '; padding-bottom:6px;">';
        if (showLogo) {
          hHtml += '<img src="' + logo + '" style="height:' + logoH + '; width:' + logoH + '; object-fit:contain; flex-shrink:0; border-radius:6px;" alt="School Logo">';
        }
        hHtml += '<div style="flex:1; text-align:center;">';
        if (schoolCfg.name !== false && schoolName) {
          hHtml += '<div style="font-size:20px; font-weight:900; color:' + primaryColor + '; letter-spacing:0.03em; text-transform:uppercase; line-height:1.2;">' + escapeHTML(schoolName) + '</div>';
        }
        if (schoolCfg.tagline !== false && tagline) {
          hHtml += '<div style="font-size:10px; font-style:italic; color:#4B5563; margin-top:2px;">&ldquo;' + escapeHTML(tagline) + '&rdquo;</div>';
        }
        if (schoolCfg.address !== false && address) {
          hHtml += '<div style="font-size:10px; font-weight:500; color:#374151; margin-top:2px;">' + escapeHTML(address) + '</div>';
        }
        var line2 = [];
        if (schoolCfg.phone !== false && phone) line2.push('Phone: ' + escapeHTML(phone));
        if (schoolCfg.email !== false && email) line2.push('Email: ' + escapeHTML(email));
        if (schoolCfg.website !== false && website) line2.push('Website: ' + escapeHTML(website));
        if (line2.length > 0) {
          hHtml += '<div style="font-size:9px; color:#4B5563; margin-top:2px;">' + line2.join(' &bull; ') + '</div>';
        }
        var line3 = [];
        if (schoolCfg.affiliationNo !== false && affiliation) {
          var affStr = String(affiliation).trim();
          if (affStr.indexOf('Affiliation') === -1) affStr = 'Affiliation No: ' + affStr;
          if (affStr.indexOf('CBSE') === -1 && (branding.board === 'CBSE' || settings.board === 'CBSE' || schoolInfo.board === 'CBSE' || affStr.length === 7 || affStr.indexOf('3430182') !== -1)) {
            affStr += ' (CBSE)';
          }
          line3.push(affStr);
        }
        if (schoolCfg.udiseCode !== false && udise) {
          var udStr = String(udise).trim();
          if (udStr.indexOf('UDISE') === -1) udStr = 'UDISE: ' + udStr;
          line3.push(udStr);
        }
        if (schoolCfg.session !== false && academicSession) {
          var sesStr = String(academicSession).trim();
          if (sesStr.indexOf('Session') === -1) sesStr = 'Session: ' + sesStr;
          line3.push(sesStr);
        }
        if (line3.length > 0) {
          hHtml += '<div style="font-size:9px; color:#4B5563; margin-top:2px; font-weight:600;">' + line3.join(' &bull; ') + '</div>';
        }
        hHtml += '</div></div>';
        return hHtml;
      }

      function renderTitleBanner() {
        var bHtml = '<div style="text-align:center;">';
        if (hasCombinedTerms) {
          var termNames = cTerms.map(function(t) { return t.name.toUpperCase(); }).join(' & ');
          bHtml += '<span style="background:' + primaryColor + '; color:#FFFFFF; border-radius:4px; padding:3px 18px; font-size:11px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; display:inline-block;">CONSOLIDATED REPORT CARD</span>';
          bHtml += '<div style="font-size:11px; font-weight:700; color:#374151; margin-top:2px;">' + escapeHTML(termNames) + '</div>';
        } else {
          bHtml += '<span style="background:' + primaryColor + '; color:#FFFFFF; border-radius:4px; padding:3px 18px; font-size:11px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; display:inline-block;">OFFICIAL REPORT CARD</span>';
          bHtml += '<div style="font-size:11px; font-weight:700; color:#374151; margin-top:2px;">' + escapeHTML(termName) + '</div>';
        }
        bHtml += '</div>';
        return bHtml;
      }

      function renderStudentGrid() {
        if (studentItems.length === 0) return '';
        var sHtml = '<div style="display:flex; gap:10px; align-items:stretch;">';
        var gridCols = orientation === 'landscape' ? 3 : 2;
        sHtml += '<div style="flex:1; display:grid; grid-template-columns:repeat(' + gridCols + ', 1fr); border:1px solid #BFDBFE; border-radius:6px; overflow:hidden; font-size:' + fontBase + '; background:#EFF6FF;">';
        studentItems.forEach(function(item, idx) {
          var isLastOdd = (idx === studentItems.length - 1) && (studentItems.length % gridCols !== 0);
          var spanStyle = isLastOdd ? 'grid-column: span ' + (gridCols - (studentItems.length % gridCols) + 1) + ';' : '';
          var borderRight = ((idx + 1) % gridCols !== 0 && !isLastOdd) ? 'border-right:1px solid #DBEAFE;' : '';
          var borderBottom = (idx < studentItems.length - (studentItems.length % gridCols || gridCols)) ? 'border-bottom:1px solid #DBEAFE;' : '';
          sHtml += '<div style="padding:' + tier.studentPad + '; ' + borderRight + ' ' + borderBottom + ' ' + spanStyle + '"><strong>' + escapeHTML(item.label) + ':</strong> ' + escapeHTML(item.value) + '</div>';
        });
        sHtml += '</div>';
        if (hasPhoto) {
          sHtml += '<div style="width:64px; flex-shrink:0; display:flex; align-items:center; justify-content:center; border:1px solid #CBD5E1; border-radius:6px; background:#F8FAFC; overflow:hidden; padding:2px;">';
          sHtml += '<img src="' + (s.photoUrl || s.photo) + '" style="width:100%; height:100%; max-height:76px; object-fit:cover; border-radius:4px;" alt="Student Photo">';
          sHtml += '</div>';
        }
        sHtml += '</div>';
        return sHtml;
      }

      function renderMarksTable() {
        var mHtml = '';
        if (hasCombinedTerms) {
          var isConsolidated = multiRes && multiRes.isConsolidated;
          var termTotalsMap = (multiRes && multiRes.termTotals) || {};

          if (hasUnitTestsInCard) {
            // TABLE 1: Periodic / Unit Tests (marks only, no per-test grade column)
            mHtml += '<div style="font-size:10px; font-weight:800; color:' + primaryColor + '; text-transform:uppercase; margin-top:4px; margin-bottom:3px; letter-spacing:0.04em;">Periodic / Unit Tests</div>';
            mHtml += '<table class="marks-table unit-tests-table" style="width:100%; border-collapse:collapse; border:1px solid #94A3B8; font-size:' + fontBase + '; margin-bottom:6px;">';
            mHtml += '<thead><tr class="marks-header" style="background:' + primaryColor + '; color:#FFFFFF; font-weight:700; text-transform:uppercase; letter-spacing:0.03em;">';
            mHtml += '<th style="padding:' + cellPad + '; text-align:left; border:1px solid #64748B;">Subject</th>';
            cUnitTerms.forEach(function(t) {
              mHtml += '<th style="padding:' + cellPad + '; text-align:center; border:1px solid #64748B;">' + escapeHTML(t.name) + '</th>';
            });
            mHtml += '<th style="padding:' + cellPad + '; text-align:center; border:1px solid #64748B; background:#1E293B;">Total</th>';
            mHtml += '</tr></thead><tbody>';

            subjectsArr.forEach(function(sub, idx) {
              mHtml += '<tr style="background:' + (idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF') + ';">';
              var optLabel = sub.isOptional ? ' <span style="font-size:8.5px; color:#6B7280;">(Opt)</span>' : '';
              mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:left; font-weight:600;">' + escapeHTML(sub.name) + optLabel + '</td>';
              var subUtTotal = 0;
              cUnitTerms.forEach(function(t) {
                var tMarks = (combinedData.marks && combinedData.marks[t.id] && combinedData.marks[t.id][sub.id]) || {};
                var isAB = tMarks.isAbsent === true;
                var isEX = tMarks.isExempted === true;
                var hasO = !isAB && !isEX && tMarks.obtained !== undefined && tMarks.obtained !== null && String(tMarks.obtained).trim() !== '';
                var o = hasO ? Number(tMarks.obtained) : null;
                var cellDisp = isAB ? 'AB' : (isEX ? 'EX' : (o !== null ? String(o) : '—'));
                var cellStyle = isAB ? 'color:#DC2626; font-weight:700;' : 'font-weight:700;';
                mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:center; ' + cellStyle + '">' + cellDisp + '</td>';
                if (o !== null) subUtTotal += o;
              });
              mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:center; font-weight:800; background:#F1F5F9;">' + subUtTotal + '</td>';
              mHtml += '</tr>';
            });

            mHtml += '<tr class="total-row" style="background:#0F172A; color:#FFFFFF; font-weight:800; font-size:10px;">';
            mHtml += '<td style="padding:' + cellPad + '; text-align:left; border:1px solid #0F172A;">TOTAL</td>';
            var utGrandSum = 0;
            cUnitTerms.forEach(function(t) {
              var tt = termTotalsMap[t.id] || { obtained: 0, maxTotal: 0 };
              mHtml += '<td style="padding:' + cellPad + '; text-align:center; border:1px solid #0F172A;">' + tt.obtained + ' / ' + tt.maxTotal + '</td>';
              utGrandSum += tt.obtained;
            });
            mHtml += '<td style="padding:' + cellPad + '; text-align:center; border:1px solid #0F172A;">' + utGrandSum + '</td>';
            mHtml += '</tr></tbody></table>';

            // TABLE 2: Main Examinations (Obt + Grade)
            mHtml += '<div style="font-size:10px; font-weight:800; color:' + primaryColor + '; text-transform:uppercase; margin-top:4px; margin-bottom:3px; letter-spacing:0.04em;">Main Examinations</div>';
            mHtml += '<table class="marks-table main-exams-table" style="width:100%; border-collapse:collapse; border:1px solid #94A3B8; font-size:' + fontBase + ';">';
            mHtml += '<thead><tr class="marks-header" style="background:' + primaryColor + '; color:#FFFFFF; font-weight:700; text-transform:uppercase; letter-spacing:0.03em;">';
            mHtml += '<th rowspan="2" style="padding:' + cellPad + '; text-align:left; border:1px solid #64748B;">Subject</th>';
            cMainTerms.forEach(function(t) {
              mHtml += '<th colspan="2" style="padding:' + cellPad + '; text-align:center; border:1px solid #64748B;">' + escapeHTML(t.name) + '</th>';
            });
            if (isConsolidated) {
              mHtml += '<th colspan="2" style="padding:' + cellPad + '; text-align:center; border:1px solid #64748B; background:#0F172A;">Consolidated</th>';
            }
            mHtml += '</tr><tr style="background:#1E293B; color:#FFF; font-weight:700;">';
            cMainTerms.forEach(function() {
              mHtml += '<th style="padding:2px 4px; text-align:center; border:1px solid #64748B; font-size:9.5px;">Obt</th>';
              mHtml += '<th style="padding:2px 4px; text-align:center; border:1px solid #64748B; font-size:9.5px;">Grade</th>';
            });
            if (isConsolidated) {
              mHtml += '<th style="padding:2px 4px; text-align:center; border:1px solid #0F172A; background:#0F172A; font-size:9.5px;">Total</th>';
              mHtml += '<th style="padding:2px 4px; text-align:center; border:1px solid #0F172A; background:#0F172A; font-size:9.5px;">Grade</th>';
            }
            mHtml += '</tr></thead><tbody>';

            subjectsArr.forEach(function(sub, idx) {
              mHtml += '<tr style="background:' + (idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF') + ';">';
              var optLabel = sub.isOptional ? ' <span style="font-size:8.5px; color:#6B7280;">(Opt)</span>' : '';
              mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:left; font-weight:600;">' + escapeHTML(sub.name) + optLabel + '</td>';

              var subGrandObt = 0;
              var subGrandFull = 0;

              cMainTerms.forEach(function(t) {
                var tSubs = (combinedData && combinedData.termSubjects && combinedData.termSubjects[t.id]) ||
                  (store.examSubjects && store.examSubjects[t.id] &&
                  (store.examSubjects[t.id][s.class] || store.examSubjects[t.id]['Class ' + s.class]) &&
                  (store.examSubjects[t.id][s.class] || store.examSubjects[t.id]['Class ' + s.class]).subjects) || subjectsArr;
                var tSub = (tSubs || []).find(function(x) { return x.id === sub.id; });
                var termSubFull = (tSub && tSub.fullMarks) ? Number(tSub.fullMarks) : (sub.fullMarks || 100);
                var termSubPass = (tSub && tSub.passMarks !== undefined && tSub.passMarks !== null) ? Number(tSub.passMarks) : (0.33 * termSubFull);

                var tMarks = (combinedData.marks && combinedData.marks[t.id] && combinedData.marks[t.id][sub.id]) || {};
                var isAB = tMarks.isAbsent === true;
                var isEX = tMarks.isExempted === true;
                var hasO = !isAB && !isEX && tMarks.obtained !== undefined && tMarks.obtained !== null && String(tMarks.obtained).trim() !== '';
                var o = hasO ? Number(tMarks.obtained) : null;

                var cellDisp = isAB ? 'AB' : (isEX ? 'EX' : (o !== null ? String(o) : '—'));
                var cellStyle = (isAB || (o !== null && o < termSubPass)) ? 'color:#DC2626; font-weight:700;' : 'font-weight:700;';

                var cellPct = o !== null ? (o / termSubFull) * 100 : 0;
                var cellGrade = isAB ? 'Ab' : (isEX ? 'Ex' : (o !== null ? ExamCalculationEngine.calculateGrade(cellPct, schoolConfig.gradingScale).grade : '—'));
                if (!isAB && !isEX && o !== null && o >= termSubPass && cellGrade === 'F') cellGrade = 'D';

                mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:center; ' + cellStyle + '">' + cellDisp + '</td>';
                mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:center; font-weight:700;">' + cellGrade + '</td>';

                if (o !== null) {
                  subGrandObt += o;
                  subGrandFull += termSubFull;
                }
              });

              if (isConsolidated) {
                var subConsolidatedGrade = subGrandFull > 0 ? ExamCalculationEngine.calculateGrade((subGrandObt / subGrandFull) * 100, schoolConfig.gradingScale).grade : '—';
                mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:center; font-weight:800; background:#F1F5F9;">' + subGrandObt + '</td>';
                mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:center; font-weight:800; background:#F1F5F9;">' + subConsolidatedGrade + '</td>';
              }
              mHtml += '</tr>';
            });

            mHtml += '<tr class="total-row" style="background:#0F172A; color:#FFFFFF; font-weight:800; font-size:11px;">';
            mHtml += '<td style="padding:' + cellPad + '; text-align:left; border:1px solid #0F172A;">TOTAL</td>';
            cMainTerms.forEach(function(t) {
              var tt = termTotalsMap[t.id] || { obtained: 0, maxTotal: 0, grade: '—' };
              mHtml += '<td style="padding:' + cellPad + '; text-align:center; border:1px solid #0F172A;">' + tt.obtained + ' / ' + tt.maxTotal + '</td>';
              mHtml += '<td style="padding:' + cellPad + '; text-align:center; border:1px solid #0F172A;">' + tt.grade + '</td>';
            });
            if (isConsolidated) {
              mHtml += '<td style="padding:' + cellPad + '; text-align:center; border:1px solid #0F172A;">' + multiRes.total + ' / ' + multiRes.maxTotal + '</td>';
              mHtml += '<td style="padding:' + cellPad + '; text-align:center; border:1px solid #0F172A;">' + multiRes.grade + '</td>';
            }
            mHtml += '</tr></tbody></table>';
          } else {

          var isConsolidated = multiRes && multiRes.isConsolidated;
          mHtml += '<table class="marks-table" style="width:100%; border-collapse:collapse; border:1px solid #94A3B8; font-size:' + fontBase + ';">';
          mHtml += '<thead><tr class="marks-header" style="background:' + primaryColor + '; color:#FFFFFF; font-weight:700; text-transform:uppercase; letter-spacing:0.03em;">';
          mHtml += '<th rowspan="2" style="padding:' + cellPad + '; text-align:left; border:1px solid #64748B;">Subject</th>';
          cTerms.forEach(function(t) {
            mHtml += '<th colspan="2" style="padding:' + cellPad + '; text-align:center; border:1px solid #64748B;">' + escapeHTML(t.name) + '</th>';
          });
          if (isConsolidated) {
            mHtml += '<th colspan="2" style="padding:' + cellPad + '; text-align:center; border:1px solid #64748B; background:#0F172A;">Consolidated</th>';
          }
          mHtml += '</tr><tr style="background:#1E293B; color:#FFF; font-weight:700;">';
          cTerms.forEach(function() {
            mHtml += '<th style="padding:2px 4px; text-align:center; border:1px solid #64748B; font-size:9.5px;">Obt</th>';
            mHtml += '<th style="padding:2px 4px; text-align:center; border:1px solid #64748B; font-size:9.5px;">Grade</th>';
          });
          if (isConsolidated) {
            mHtml += '<th style="padding:2px 4px; text-align:center; border:1px solid #0F172A; background:#0F172A; font-size:9.5px;">Total</th>';
            mHtml += '<th style="padding:2px 4px; text-align:center; border:1px solid #0F172A; background:#0F172A; font-size:9.5px;">Grade</th>';
          }
          mHtml += '</tr></thead><tbody>';

          var termTotalsMap = (multiRes && multiRes.termTotals) || {};

          subjectsArr.forEach(function(sub, idx) {
            mHtml += '<tr style="background:' + (idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF') + ';">';
            var optLabel = sub.isOptional ? ' <span style="font-size:8.5px; color:#6B7280;">(Opt)</span>' : '';
            mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:left; font-weight:600;">' + escapeHTML(sub.name) + optLabel + '</td>';

            var subGrandObt = 0;
            var subGrandFull = 0;

            cTerms.forEach(function(t) {
              var tSubs = (combinedData && combinedData.termSubjects && combinedData.termSubjects[t.id]) ||
                (store.examSubjects && store.examSubjects[t.id] &&
                (store.examSubjects[t.id][s.class] || store.examSubjects[t.id]['Class ' + s.class]) &&
                (store.examSubjects[t.id][s.class] || store.examSubjects[t.id]['Class ' + s.class]).subjects) || subjectsArr;
              var tSub = (tSubs || []).find(function(x) { return x.id === sub.id; });
              var termSubFull = (tSub && tSub.fullMarks) ? Number(tSub.fullMarks) : (sub.fullMarks || 100);
              var termSubPass = (tSub && tSub.passMarks !== undefined && tSub.passMarks !== null) ? Number(tSub.passMarks) : (0.33 * termSubFull);

              var tMarks = (combinedData.marks && combinedData.marks[t.id] && combinedData.marks[t.id][sub.id]) || {};
              var isAB = tMarks.isAbsent === true;
              var isEX = tMarks.isExempted === true;
              var hasO = !isAB && !isEX && tMarks.obtained !== undefined && tMarks.obtained !== null && String(tMarks.obtained).trim() !== '';
              var o = hasO ? Number(tMarks.obtained) : null;

              var cellDisp = isAB ? 'AB' : (isEX ? 'EX' : (o !== null ? String(o) : '—'));
              var cellStyle = (isAB || (o !== null && o < termSubPass)) ? 'color:#DC2626; font-weight:700;' : 'font-weight:700;';

              var cellPct = o !== null ? (o / termSubFull) * 100 : 0;
              var cellGrade = isAB ? 'Ab' : (isEX ? 'Ex' : (o !== null ? ExamCalculationEngine.calculateGrade(cellPct, schoolConfig.gradingScale).grade : '—'));
              if (!isAB && !isEX && o !== null && o >= termSubPass && cellGrade === 'F') cellGrade = 'D';

              mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:center; ' + cellStyle + '">' + cellDisp + '</td>';
              mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:center; font-weight:700;">' + cellGrade + '</td>';

              if (o !== null) {
                subGrandObt += o;
                subGrandFull += termSubFull;
              }
            });

            if (isConsolidated) {
              var subConsolidatedGrade = subGrandFull > 0 ? ExamCalculationEngine.calculateGrade((subGrandObt / subGrandFull) * 100, schoolConfig.gradingScale).grade : '—';
              mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:center; font-weight:800; background:#F1F5F9;">' + subGrandObt + '</td>';
              mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:center; font-weight:800; background:#F1F5F9;">' + subConsolidatedGrade + '</td>';
            }
            mHtml += '</tr>';
          });

          mHtml += '<tr class="total-row" style="background:#0F172A; color:#FFFFFF; font-weight:800; font-size:11px;">';
          mHtml += '<td style="padding:' + cellPad + '; text-align:left; border:1px solid #0F172A;">TOTAL</td>';
          cTerms.forEach(function(t) {
            var tt = termTotalsMap[t.id] || { obtained: 0, maxTotal: 0, grade: '—' };
            mHtml += '<td style="padding:' + cellPad + '; text-align:center; border:1px solid #0F172A;">' + tt.obtained + ' / ' + tt.maxTotal + '</td>';
            mHtml += '<td style="padding:' + cellPad + '; text-align:center; border:1px solid #0F172A;">' + tt.grade + '</td>';
          });
          if (isConsolidated) {
            mHtml += '<td style="padding:' + cellPad + '; text-align:center; border:1px solid #0F172A;">' + multiRes.total + ' / ' + multiRes.maxTotal + '</td>';
            mHtml += '<td style="padding:' + cellPad + '; text-align:center; border:1px solid #0F172A;">' + multiRes.grade + '</td>';
          }
          mHtml += '</tr></tbody></table>';


          }
        } else {
          // Single exam marks table
          var totalObtained = calcRes.total;
          var totalFull = calcRes.maxTotal;
          var totalPass = calcRes.passTotal;
          var totalGrade = calcRes.grade;

          mHtml += '<table class="marks-table" style="width:100%; border-collapse:collapse; border:1px solid #94A3B8; font-size:' + fontBase + ';">';
          mHtml += '<thead><tr class="marks-header" style="background:' + primaryColor + '; color:#FFFFFF; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">';
          mHtml += '<th style="padding:' + cellPad + '; text-align:left; border:1px solid #64748B;">Subject</th>';
          if (colToggles.showFullMarks !== false) mHtml += '<th style="padding:' + cellPad + '; text-align:center; border:1px solid #64748B; width:14%;">Full Marks</th>';
          if (colToggles.showPassMarks !== false) mHtml += '<th style="padding:' + cellPad + '; text-align:center; border:1px solid #64748B; width:14%;">Pass Marks</th>';
          if (colToggles.showObtained !== false) mHtml += '<th style="padding:' + cellPad + '; text-align:center; border:1px solid #64748B; width:18%;">Marks Obtained</th>';
          if (colToggles.showGrade !== false) mHtml += '<th style="padding:' + cellPad + '; text-align:center; border:1px solid #64748B; width:14%;">Grade</th>';
          mHtml += '</tr></thead><tbody>';

          var marksMap = (savedMarks && savedMarks.marks) || {};
          subjectsArr.forEach(function(sub, idx) {
            var sc = marksMap[sub.id];
            var isAB = sc && sc.isAbsent;
            var isEX = sc && sc.isExempted;
            var hasVal = sc && !isAB && !isEX && sc.obtained !== undefined && sc.obtained !== null && String(sc.obtained).trim() !== '';
            var num = hasVal ? Number(sc.obtained) : null;
            var passNum = (sub.passMarks !== undefined && sub.passMarks !== null) ? Number(sub.passMarks) : (33 / 100) * (sub.fullMarks || 100);
            var isSubFail = num !== null && num < passNum;

            var obtDisp = isAB ? 'AB' : (isEX ? 'EX' : (num !== null ? String(num) : '—'));
            var obtStyle = (isAB || isSubFail) ? 'color:#DC2626; font-weight:700;' : 'font-weight:700;';

            var subPct = num !== null ? (num / (sub.fullMarks || 100)) * 100 : 0;
            var subGrade = isAB ? 'Ab' : (isEX ? 'Ex' : (num !== null ? ExamCalculationEngine.calculateGrade(subPct, schoolConfig.gradingScale).grade : '—'));
            if (!isAB && !isEX && num !== null && num >= passNum && subGrade === 'F') subGrade = 'D';

            var optLabel = sub.isOptional ? ' <span style="font-size:8.5px; color:#6B7280;">(Opt)</span>' : '';

            mHtml += '<tr style="background:' + (idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF') + ';">';
            mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:left; font-weight:600;">' + escapeHTML(sub.name) + optLabel + '</td>';
            if (colToggles.showFullMarks !== false) mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:center;">' + (sub.fullMarks || 100) + '</td>';
            if (colToggles.showPassMarks !== false) mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:center;">' + passNum + '</td>';
            if (colToggles.showObtained !== false) mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:center; ' + obtStyle + '">' + obtDisp + '</td>';
            if (colToggles.showGrade !== false) mHtml += '<td style="padding:' + cellPad + '; border:1px solid #CBD5E1; text-align:center; font-weight:700;">' + subGrade + '</td>';
            mHtml += '</tr>';
          });

          mHtml += '<tr class="total-row" style="background:#0F172A; color:#FFFFFF; font-weight:800; font-size:11.5px;">';
          mHtml += '<td style="padding:' + cellPad + '; text-align:left; border:1px solid #0F172A;">TOTAL</td>';
          if (colToggles.showFullMarks !== false) mHtml += '<td style="padding:' + cellPad + '; text-align:center; border:1px solid #0F172A;">' + totalFull + '</td>';
          if (colToggles.showPassMarks !== false) mHtml += '<td style="padding:' + cellPad + '; text-align:center; border:1px solid #0F172A;">' + totalPass + '</td>';
          if (colToggles.showObtained !== false) mHtml += '<td style="padding:' + cellPad + '; text-align:center; border:1px solid #0F172A;">' + totalObtained + '</td>';
          if (colToggles.showGrade !== false) mHtml += '<td style="padding:' + cellPad + '; text-align:center; border:1px solid #0F172A;">' + totalGrade + '</td>';
          mHtml += '</tr></tbody></table>';
        }
        return mHtml;
      }

      function renderSummaryBlock() {
        var smHtml = '';
        var isIncomplete = false;
        var pendingSubjectsList = [];

        if (hasCombinedTerms) {
          if (!multiRes.isConsolidated) {
            smHtml += '<div style="border:1px solid #CBD5E1; border-radius:6px; overflow:hidden;">';
            smHtml += '<table style="width:100%; border-collapse:collapse; font-size:' + fontBase + '; text-align:center;">';
            smHtml += '<thead><tr style="background:#F1F5F9; color:#475569; font-weight:700; text-transform:uppercase; font-size:9px; letter-spacing:0.04em;">';
            smHtml += '<th style="padding:3px 6px; text-align:left; border-bottom:1px solid #CBD5E1;">Term Assessment</th>';
            smHtml += '<th style="padding:3px 6px; border-bottom:1px solid #CBD5E1;">Total Marks</th>';
            smHtml += '<th style="padding:3px 6px; border-bottom:1px solid #CBD5E1;">Percentage</th>';
            smHtml += '<th style="padding:3px 6px; border-bottom:1px solid #CBD5E1;">Grade</th>';
            smHtml += '<th style="padding:3px 6px; border-bottom:1px solid #CBD5E1;">Division</th>';
            smHtml += '<th style="padding:3px 6px; border-bottom:1px solid #CBD5E1;">Result</th>';
            smHtml += '</tr></thead><tbody>';

            cTerms.forEach(function(t) {
              var tr = multiRes.termResults[t.id];
              var divCol = '#15803D';
              if (tr.result === 'FAIL' || tr.result === 'INCOMPLETE') divCol = '#DC2626';
              else if (tr.division === 'Not Awarded') divCol = '#6B7280';
              else if (tr.division.indexOf('Second') !== -1) divCol = '#1D4ED8';
              else if (tr.division.indexOf('Third') !== -1) divCol = '#B45309';

              var resCol = tr.result === 'PASS' ? '#16A34A' : '#DC2626';

              smHtml += '<tr>';
              smHtml += '<td style="padding:3px 6px; text-align:left; font-weight:700; color:' + primaryColor + '; border-bottom:1px solid #F1F5F9;">' + escapeHTML(t.name) + '</td>';
              smHtml += '<td style="padding:3px 6px; font-weight:700; border-bottom:1px solid #F1F5F9;">' + tr.total + ' / ' + tr.maxTotal + '</td>';
              smHtml += '<td style="padding:3px 6px; font-weight:800; color:' + primaryColor + '; border-bottom:1px solid #F1F5F9;">' + tr.displayPercentage + '</td>';
              smHtml += '<td style="padding:3px 6px; font-weight:700; border-bottom:1px solid #F1F5F9;">' + tr.grade + '</td>';
              smHtml += '<td style="padding:3px 6px; font-weight:700; color:' + divCol + '; border-bottom:1px solid #F1F5F9;">' + escapeHTML(tr.division) + '</td>';
              smHtml += '<td style="padding:3px 6px; font-weight:800; color:' + resCol + '; border-bottom:1px solid #F1F5F9;">' + tr.result + '</td>';
              smHtml += '</tr>';
            });
            smHtml += '</tbody></table></div>';
          } else {
            var summaryItems = [];
            if (acaCfg.percentage !== false) {
              summaryItems.push({ label: 'Percentage', value: multiRes.displayPercentage, color: primaryColor });
            }
            if (acaCfg.division !== false) {
              var divColor = '#15803D';
              if (multiRes.result === 'FAIL' || multiRes.result === 'INCOMPLETE') divColor = '#DC2626';
              else if (multiRes.division === 'Not Awarded') divColor = '#6B7280';
              else if (multiRes.division.indexOf('Second') !== -1) divColor = '#1D4ED8';
              else if (multiRes.division.indexOf('Third') !== -1) divColor = '#B45309';
              summaryItems.push({ label: 'Division', value: multiRes.division, color: divColor });
            }
            if (acaCfg.result !== false) {
              summaryItems.push({ label: 'Final Result', value: multiRes.result, color: (multiRes.result === 'PASS' ? '#16A34A' : '#DC2626') });
            }
            if (multiRes && multiRes.basisNote) {
              smHtml += '<div style="font-size:9.5px; font-weight:700; color:#475569; text-align:center; margin-bottom:5px; font-style:italic;">' + escapeHTML(multiRes.basisNote) + '</div>';
            }
            if (summaryItems.length > 0) {
              smHtml += '<div style="display:grid; grid-template-columns:repeat(' + summaryItems.length + ', 1fr); gap:8px; padding:6px 12px; background:#F1F5F9; border:1px solid #CBD5E1; border-radius:6px; text-align:center;">';
              summaryItems.forEach(function(item) {
                smHtml += '<div><span style="font-size:9px; color:#64748B; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">' + escapeHTML(item.label) + '</span><div style="font-size:13.5px; font-weight:800; color:' + item.color + '; margin-top:2px;">' + escapeHTML(item.value) + '</div></div>';
              });
              smHtml += '</div>';
            }
            if (multiRes.result === 'INCOMPLETE') {
              isIncomplete = true;
              pendingSubjectsList = multiRes.pendingSubjects || [];
            }
          }
        } else {
          var summaryItems = [];
          var percentageStr = calcRes.displayPercentage;
          var resultText = calcRes.result;
          var divisionText = calcRes.division;

          var divisionColor = '#15803D';
          if (resultText === 'FAIL' || resultText === 'INCOMPLETE') divisionColor = '#DC2626';
          else if (divisionText === 'Not Awarded') divisionColor = '#6B7280';
          else if (divisionText.indexOf('Second') !== -1) divisionColor = '#1D4ED8';
          else if (divisionText.indexOf('Third') !== -1) divisionColor = '#B45309';

          var rankVal = '—';
          if (savedMarks && savedMarks.rank) {
            rankVal = toRankOrdinal(savedMarks.rank);
          }

          if (acaCfg.percentage !== false) {
            summaryItems.push({ label: 'Percentage', value: percentageStr, color: primaryColor });
          }
          if (acaCfg.division !== false) {
            summaryItems.push({ label: 'Division', value: divisionText, color: divisionColor });
          }
          if (acaCfg.rank !== false) {
            summaryItems.push({ label: 'Class Rank', value: rankVal, color: '#0F172A' });
          }
          if (acaCfg.result !== false) {
            summaryItems.push({ label: 'Final Result', value: resultText, color: (resultText === 'PASS' ? '#16A34A' : '#DC2626') });
          }
          if (secToggles.showAttendance !== false && acaCfg.attendance !== false) {
            var attPct = typeof getStudentAttendancePercentage === 'function'
              ? getStudentAttendancePercentage(s, activeTerm ? activeTerm.startDate : null, activeTerm ? activeTerm.endDate : null)
              : null;
            if (attPct !== null && attPct !== undefined) {
              summaryItems.push({ label: 'Attendance', value: attPct + '%', color: primaryColor });
            }
          }

          if (summaryItems.length > 0) {
            smHtml += '<div style="display:grid; grid-template-columns:repeat(' + summaryItems.length + ', 1fr); gap:8px; padding:6px 12px; background:#F1F5F9; border:1px solid #CBD5E1; border-radius:6px; text-align:center;">';
            summaryItems.forEach(function(item) {
              smHtml += '<div><span style="font-size:9px; color:#64748B; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">' + escapeHTML(item.label) + '</span><div style="font-size:13.5px; font-weight:800; color:' + item.color + '; margin-top:2px;">' + escapeHTML(item.value) + '</div></div>';
            });
            smHtml += '</div>';
          }

          if (calcRes.result === 'INCOMPLETE') {
            isIncomplete = true;
            var missingIds = calcRes.missingMandatorySubjects || [];
            pendingSubjectsList = missingIds.map(function(mId) {
              var found = subjectsArr.find(function(x) { return x.id === mId; });
              return found ? found.name : mId;
            });
          }
        }

        if (isIncomplete) {
          var missingMsg = pendingSubjectsList.length > 0 ? pendingSubjectsList.join(', ') : 'mandatory subjects';
          smHtml += '<div style="color:#DC2626; font-size:10px; font-weight:600; text-align:center; margin-top:4px;">Result withheld: marks pending in ' + escapeHTML(missingMsg) + '</div>';
        }
        return smHtml;
      }

      function renderRemarks(isPage2) {
        if (secToggles.showRemarks === false || acaCfg.remarks === false) return '';
        var minH = isPage2 ? '25mm' : remarksMinH;
        var rHtml = '<div style="border:1px solid #E2E8F0; border-radius:6px; padding:6px 10px; min-height:' + minH + '; font-size:10.5px; line-height:1.4; ">';
        rHtml += '<strong style="color:' + primaryColor + '; text-transform:uppercase; font-size:9.5px; letter-spacing:0.04em;">Teacher&#039;s Remarks: </strong>';
        rHtml += '<span style="color:#334155; font-style:italic;">' + escapeHTML(effectiveRemarks) + '</span>';
        rHtml += '</div>';
        return rHtml;
      }

      function renderPromotion() {
        if (!hasPromotion) return '';
        var promoMsg = schoolConfig.promotionMessage || 'Promoted to Next Higher Class';
        var pHtml = '<div style="display:flex; justify-content:space-between; align-items:center; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:5px 10px; font-size:10.5px;">';
        pHtml += '<div><strong>Academic Status:</strong> <span style="color:#15803D; font-weight:800; letter-spacing:0.02em;">' + escapeHTML(promoMsg) + '</span></div>';
        pHtml += '</div>';
        return pHtml;
      }

      function renderGradingLegend() {
        if (!hasLegend) return '';
        var gHtml = '<div style="font-size:9px; color:#64748B; text-align:center; padding:3px 0; border-top:1px solid #E2E8F0;">';
        gHtml += '<strong>Grading Scale:</strong> A+(91-100) &bull; A(81-90) &bull; B+(71-80) &bull; B(61-70) &bull; C+(51-60) &bull; C(41-50) &bull; D(33-40) &bull; F(&lt;33)';
        gHtml += '</div>';
        return gHtml;
      }

      function renderSignatures(sigGapOverride, hideErpLine) {
        if (!hasSignatures) return '';
        var dateStr = toDateDDMMYYYY(new Date());
        var sHtml = '<div style="border-top:1px solid #CBD5E1; padding-top:6px;">';
        sHtml += '<div style="display:flex; justify-content:space-between; align-items:flex-end;">';
        sHtml += '<div style="text-align:center; width:130px;"><div style="height:' + sigH + ';"></div><div style="border-top:1px solid #475569; padding-top:3px; font-size:9.5px; font-weight:700; color:#334155;">CLASS TEACHER</div></div>';
        sHtml += '<div style="text-align:center; width:90px; height:36px; border:1.5px dashed #94A3B8; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:8px; color:#94A3B8; font-weight:700; letter-spacing:0.08em;">SEAL</div>';
        if (secToggles.showParentSignature === true) {
          sHtml += '<div style="text-align:center; width:130px;"><div style="height:' + sigH + ';"></div><div style="border-top:1px solid #475569; padding-top:3px; font-size:9.5px; font-weight:700; color:#334155;">PARENT SIGNATURE</div></div>';
        }
        sHtml += '<div style="text-align:center; width:130px;"><div style="height:' + sigH + ';"></div><div style="border-top:1px solid #475569; padding-top:3px; font-size:9.5px; font-weight:700; color:#334155;">PRINCIPAL</div></div>';
        sHtml += '</div>';
        sHtml += '<div style="display:flex; justify-content:space-between; margin-top:4px; font-size:9px; color:#64748B;">';
        sHtml += '<div>Date of Issue: ' + dateStr + '</div>';
        if (!hideErpLine && schoolConfig.showPaathshalaFooter !== false) {
          sHtml += '<div>Generated by Paathshala ERP</div>';
        }
        sHtml += '</div>';
        sHtml += '</div>';
        return sHtml;
      }

      // 1-PAGE OR 2-PAGE OUTPUT
      if (numPages === 1) {
        var card = '<div class="report-card" data-orientation="' + orientation + '" style="' + containerStyle + ' page-break-after:always; page-break-inside:avoid;">';
        card += renderHeader(false);
        card += renderTitleBanner();
        card += renderStudentGrid();
        card += renderMarksTable();
        card += renderSummaryBlock();
        card += renderRemarks();
        card += renderPromotion();
        card += renderGradingLegend();
        card += renderSignatures(null, false);
        card += '</div>';
        return card;
      } else {
        // 2-PAGE NUMBERED LAYOUT (Decision 5 Approved)
        var p1 = '<div class="report-card report-card-page" data-page="1" data-orientation="' + orientation + '" style="' + containerStyle + ' page-break-after:always; break-after:page;">';
        p1 += renderHeader(false);
        p1 += renderTitleBanner();
        p1 += renderStudentGrid();
        p1 += renderMarksTable();
        p1 += '<div style="border-top:1px solid #CBD5E1; padding-top:6px; display:flex; justify-content:space-between; font-size:9.5px; color:#64748B;">';
        p1 += '<div>' + escapeHTML(schoolName) + ' &bull; Official Report Card</div>';
        p1 += '<div style="font-weight:700;">Page 1 of 2</div>';
        p1 += '</div></div>';

        var p2 = '<div class="report-card report-card-page" data-page="2" data-orientation="' + orientation + '" style="' + containerStyle + ' page-break-inside:avoid;">';
        p2 += '<div style="display:flex; flex-direction:column; gap:12px;">';
        p2 += renderHeader(true);
        p2 += renderSummaryBlock();
        p2 += renderRemarks(true);
        p2 += renderPromotion();
        p2 += renderGradingLegend();
        p2 += '</div>';
        p2 += '<div>';
        p2 += renderSignatures(null, true); // true = hide ERP line so it only appears in footer below
        p2 += '<div style="border-top:1px solid #CBD5E1; padding-top:6px; display:flex; justify-content:space-between; font-size:9.5px; color:#64748B;">';
        if (schoolConfig.showPaathshalaFooter !== false) {
          p2 += '<div>Generated by Paathshala ERP</div>';
        } else {
          p2 += '<div></div>';
        }
        p2 += '<div style="font-weight:700;">Page 2 of 2</div>';
        p2 += '</div></div></div>';

        return p1 + p2;
      }
    },

    printBulkReportCardsV2: function(state, schoolConfig) {
      schoolConfig = schoolConfig || (SchoolApp.store && SchoolApp.store.reportCardConfig) || {};
      var termId = state.examTerm;
      var classId = state.classVal;
      var sectionId = state.sectionVal;
      var activeTerm = SchoolApp.store.examTerms && SchoolApp.store.examTerms[termId];
      var subjects = (SchoolApp.store.examSubjects && SchoolApp.store.examSubjects[termId] && SchoolApp.store.examSubjects[termId][classId] && SchoolApp.store.examSubjects[termId][classId].subjects) || [];

      var students = (SchoolApp.store.students || []).filter(function(s) {
        if (s.inTrash || s.status === 'Deleted') return false;
        var matchCls = String(s.class).toLowerCase().trim() === String(classId).toLowerCase().trim();
        var matchSec = String(s.section).toLowerCase().trim() === String(sectionId).toLowerCase().trim();
        if (!matchCls || !matchSec) return false;
        if (s.status === 'Active') return true;
        if (state.includeInactiveLeft && (s.status === 'Inactive' || s.status === 'Left')) {
          var m = getStudentExamMarks(s.id, termId);
          return !!(m && (m.isComplete || m.total !== undefined || (m.marks && Object.keys(m.marks).length > 0)));
        }
        return false;
      });

      if (students.length === 0) {
        SchoolApp.showToast('No students to print report cards for.', 'warning');
        return;
      }

      var cardsHtml = '';
      var bulkOrientation = schoolConfig.orientation === 'landscape' ? 'landscape' : 'portrait';
      students.forEach(function(s) {
        var m = getStudentExamMarks(s.id, termId);
        var singleHtml = ExamCalculationEngine.generateSingleStudentCardHTMLV2(s, false, m, null, activeTerm, subjects, schoolConfig);
        if (singleHtml.indexOf('data-orientation="landscape"') !== -1) bulkOrientation = 'landscape';
        cardsHtml += singleHtml;
      });

      var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bulk Report Cards - Class ' + classId + ' ' + sectionId + '</title>';
      fullHtml += '<link rel="preconnect" href="https://fonts.googleapis.com">';
      fullHtml += '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;800;900&family=Inter:wght@400;500;600;700;800;900&display=swap">';
      fullHtml += '<style>';
      fullHtml += '@page { size: A4 ' + bulkOrientation + '; margin: 8mm; }';
      fullHtml += '* { box-sizing: border-box; }';
      fullHtml += 'body { margin: 0; padding: 0; font-family: "Inter", sans-serif; background: #FFF; -webkit-print-color-adjust: exact; print-color-adjust: exact; }';
      fullHtml += '.report-card { page-break-after: always; page-break-inside: avoid; }';
      fullHtml += '.marks-header th, .marks-header td { background:#1E3A8A !important; color:#FFFFFF !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }';
      fullHtml += '.total-row td { background:#0F172A !important; color:#FFFFFF !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }';
      fullHtml += '</style></head><body>';
      fullHtml += cardsHtml;
      fullHtml += '</body></html>';

      var blob = new Blob([fullHtml], {type: 'text/html'});
      var url = URL.createObjectURL(blob);
      var printWin = window.open(url, '_blank', 'width=950,height=750');
      if (printWin) {
        printWin.onload = function() {
          printWin.focus();
          printWin.print();
        };
      }
    }
  };
ExamCalculationEngine.getStudentAttendancePercentage = getStudentAttendancePercentage;
  window.ExamCalculationEngine = ExamCalculationEngine;

  function legacyRecalculateStudentEntry(entry, subjects) {
    var subjectsArr = ensureSubjectsArray(subjects);
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
    if (SchoolApp.calculateGrade) {
      entry.gradeObj = SchoolApp.calculateGrade(entry.percentage);
      entry.grade = entry.gradeObj.grade;
      entry.gradeLabel = entry.gradeObj.label;
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
  }

  // Version-aware dispatcher
  function recalculateStudentEntry(entry, subjects, term) {
    var isV2 = term && term.rulesVersion === 'v2';
    if (isV2) {
      var cfg = (SchoolApp.store && SchoolApp.store.reportCardConfig) || {};
      return ExamCalculationEngine.recalculateStudentEntryV2(entry, subjects, term, cfg);
    }
    return legacyRecalculateStudentEntry(entry, subjects);
  }

  function getObtainedDisplay(sc, sub) {
    if (!sc) return '—';
    if (sc.isExempted) return 'EX';
    if (sc.isAbsent) return '<span style="color:#DC2626; text-decoration:underline; font-weight:700;">AB</span>';
    if (sc.obtained === undefined || sc.obtained === null || String(sc.obtained).trim() === '') return '—';
    var val = Number(sc.obtained);
    if (isNaN(val)) return '—';
    if (val < (sub.passMarks || 0)) {
      return '<span style="color:#DC2626; text-decoration:underline; font-weight:700;">' + val + '</span>';
    }
    return '<strong>' + val + '</strong>';
  }


  function ensureSubjectsArray(subjectsInput) {
    if (Array.isArray(subjectsInput)) return subjectsInput;
    if (subjectsInput && typeof subjectsInput === 'object') {
      return Object.values(subjectsInput);
    }
    return [];
  }

  function sortSubjects(subjectsInput) {
    var arr = ensureSubjectsArray(subjectsInput);
    if (!arr.length) return [];

    var SUBJECT_ORDER = [
      'hindi', 'english', 'mathematics', 'maths', 'math', 'science',
      'social science', 'social study', 'evs', 'general knowledge', 'gk',
      'grammar', 'sanskrit', 'computer', 'drawing', 'handy craft', 'craft'
    ];

    return arr.slice().sort(function(a, b) {
      var an = ((a && a.name) || '').toLowerCase().trim();
      var bn = ((b && b.name) || '').toLowerCase().trim();
      var ai = SUBJECT_ORDER.findIndex(function(s) { return an.indexOf(s) !== -1; });
      var bi = SUBJECT_ORDER.findIndex(function(s) { return bn.indexOf(s) !== -1; });
      if (ai === -1) ai = 999;
      if (bi === -1) bi = 999;
      return ai - bi;
    });
  }


  // Run schema migration on load
  function runMigration() {
    if (!SchoolApp.store) return;
    if (SchoolApp.store.examConfig) return; // already migrated

    // SAFEGUARD: Never run migration or trigger auto-saves before tenant data has actually loaded from server
    if (!SchoolApp.tenantInitialized || !SchoolApp.store.currentSchoolId || !SchoolApp.store.students || SchoolApp.store.students.length === 0) {
      return;
    }

    console.log('[Migration] Migrating old exams schema to Paathshala Redesign schema...');
    
    SchoolApp.store.examConfig = {
      gradingScale: [
        {min:91, max:100, grade:"A+", label:"Outstanding"},
        {min:81, max:90,  grade:"A",  label:"Excellent"},
        {min:71, max:80,  grade:"B+", label:"Very Good"},
        {min:61, max:70,  grade:"B",  label:"Good"},
        {min:51, max:60,  grade:"C+", label:"Above Average"},
        {min:41, max:50,  grade:"C",  label:"Average"},
        {min:33, max:40,  grade:"D",  label:"Pass"},
        {min:0,  max:32,  grade:"F",  label:"Fail"}
      ],
      passingPercentage: 33,
      session: (SchoolApp.store.settings && SchoolApp.store.settings.academicYear) || "2025-26"
    };

    if (!SchoolApp.store.examTerms || Object.keys(SchoolApp.store.examTerms).length === 0) {
      SchoolApp.store.examTerms = {};
    }
    if (!SchoolApp.store.examSubjects || Object.keys(SchoolApp.store.examSubjects).length === 0) {
      SchoolApp.store.examSubjects = {};
    }
    if (!SchoolApp.store.examMarks) {
      SchoolApp.store.examMarks = {};
    }
    if (!SchoolApp.store.examAuditLog) {
      SchoolApp.store.examAuditLog = [];
    }

    var oldExams = SchoolApp.store.exams || [];
    if (Object.keys(SchoolApp.store.examTerms).length === 0) {
      // Only populate from legacy exams array if examTerms is empty
      oldExams.forEach(function(ex, idx) {
        SchoolApp.store.examTerms[ex.id] = {
          id: ex.id,
          name: ex.name,
          shortName: ex.name.substring(0, 5).trim(),
          session: SchoolApp.store.examConfig.session,
          startDate: ex.startDate || '',
          endDate: ex.endDate || '',
          resultDate: null,
          status: 'published',
          weightage: 50,
          createdAt: new Date().toISOString(),
          createdBy: 'migration',
          order: idx + 1
        };
      });
    }
    var oldMarks = SchoolApp.store.marks || [];
    var oldSubjectMapping = SchoolApp.store.subjectMapping || {};

    // Terms
    oldExams.forEach(function(ex, idx) {
      SchoolApp.store.examTerms[ex.id] = {
        id: ex.id,
        name: ex.name,
        shortName: ex.name.substring(0, 5).trim(),
        session: SchoolApp.store.examConfig.session,
        startDate: ex.startDate || '',
        endDate: ex.endDate || '',
        resultDate: null,
        status: 'published',
        weightage: 50,
        createdAt: new Date().toISOString(),
        createdBy: 'migration',
        order: idx + 1
      };
    });

    // Subjects
    Object.keys(oldSubjectMapping).forEach(function(key) {
      var termId = 'global';
      var classId = key;
      var parts = key.split('_');
      if (parts.length === 2) {
        termId = parts[0];
        classId = parts[1];
      } else {
        var terms = Object.keys(SchoolApp.store.examTerms);
        terms.forEach(function(tId) {
          if (!SchoolApp.store.examSubjects[tId]) SchoolApp.store.examSubjects[tId] = {};
          var list = oldSubjectMapping[key] || [];
          SchoolApp.store.examSubjects[tId][classId] = {
            subjects: list.map(function(sub, idx) {
              return {
                id: sub.id || ('subj_' + idx + '_' + Math.random().toString(36).substr(2, 4)),
                name: sub.name,
                code: sub.name.substring(0, 4).toUpperCase(),
                type: 'Theory',
                fullMarks: sub.maxMarks || 100,
                passMarks: sub.passMarks || 33,
                hasExam: true,
                isOptional: false,
                order: idx + 1
              };
            })
          };
        });
        return;
      }

      if (!SchoolApp.store.examSubjects[termId]) SchoolApp.store.examSubjects[termId] = {};
      var list = oldSubjectMapping[key] || [];
      SchoolApp.store.examSubjects[termId][classId] = {
        subjects: list.map(function(sub, idx) {
          return {
            id: sub.id || ('subj_' + idx + '_' + Math.random().toString(36).substr(2, 4)),
            name: sub.name,
            code: sub.name.substring(0, 4).toUpperCase(),
            type: 'Theory',
            fullMarks: sub.maxMarks || 100,
            passMarks: sub.passMarks || 33,
            hasExam: true,
            isOptional: false,
            order: idx + 1
          };
        })
      };
    });

    // Marks
    oldMarks.forEach(function(m) {
      var termId = m.examId;
      var classId = m.class;
      var sectionId = m.section;
      var studentId = m.studentId;

      if (!termId || !classId || !sectionId || !studentId) return;

      if (!SchoolApp.store.examMarks[termId]) SchoolApp.store.examMarks[termId] = {};
      if (!SchoolApp.store.examMarks[termId][classId]) SchoolApp.store.examMarks[termId][classId] = {};
      if (!SchoolApp.store.examMarks[termId][classId][sectionId]) SchoolApp.store.examMarks[termId][classId][sectionId] = {};

      var scoresMap = {};
      if (m.scores) {
        Object.keys(m.scores).forEach(function(subId) {
          scoresMap[subId] = {
            obtained: parseFloat(m.scores[subId]) || 0,
            fullMarks: 100,
            isAbsent: false,
            isExempted: false,
            enteredBy: 'migration',
            enteredAt: new Date().toISOString()
          };
        });
      }

      SchoolApp.store.examMarks[termId][classId][sectionId][studentId] = {
        marks: scoresMap,
        total: m.totalScored || 0,
        maxTotal: m.maxTotal || 100,
        percentage: m.percentage || 0,
        grade: m.grade || 'F',
        gradeLabel: m.grade === 'A+' ? 'Outstanding' : (m.grade === 'A' ? 'Excellent' : 'Satisfactory'),
        rank: m.rank || 0,
        result: m.status || 'Pass',
        attendancePercent: 96,
        isComplete: true,
        lastUpdated: new Date().toISOString()
      };
    });

    // In-memory migration complete; persisted on intentional user action
    console.log('[Migration] Exams schema migration complete.');
  }

  function getStudentExamMarks(studentId, examId) {
    if (!SchoolApp.store.examMarks || !SchoolApp.store.examMarks[examId]) return null;
    var student = (SchoolApp.store.students || []).find(function(x) { return x.id === studentId; });
    if (!student) return null;
    var classId = student.class;
    var sectionId = student.section;
    var classMarks = SchoolApp.store.examMarks[examId][classId] || {};
    var secMarks = classMarks[sectionId] || {};
    return secMarks[studentId] || null;
  }

  function calculateGrade(percentage) {
    var scale = (SchoolApp.store.examConfig && SchoolApp.store.examConfig.gradingScale) || [
      {min:91, max:100, grade:"A+", label:"Outstanding"},
      {min:81, max:90,  grade:"A",  label:"Excellent"},
      {min:71, max:80,  grade:"B+", label:"Very Good"},
      {min:61, max:70,  grade:"B",  label:"Good"},
      {min:51, max:60,  grade:"C+", label:"Above Average"},
      {min:41, max:50,  grade:"C",  label:"Average"},
      {min:33, max:40,  grade:"D",  label:"Pass"},
      {min:0,  max:32,  grade:"F",  label:"Fail"}
    ];

    var match = scale.find(function(g) {
      return percentage >= g.min && percentage <= g.max;
    });
    return match || { grade: 'F', label: 'Fail' };
  }

  function getStudentAttendancePercentage(student, startDate, endDate) {
    var totalDays = 0;
    var presentDays = 0;
    
    (SchoolApp.store.attendance || []).forEach(function(att) {
      if (startDate && att.date < startDate) return;
      if (endDate && att.date > endDate) return;
      
      if (String(att.class).toLowerCase().trim() === String(student.class).toLowerCase().trim() &&
          String(att.section).toLowerCase().trim() === String(student.section).toLowerCase().trim()) {
        var record = (att.records || []).find(function(r) { return r.studentId === student.id; });
        if (record) {
          totalDays++;
          if (record.status === 'present' || record.status === 'late') {
            presentDays++;
          }
        }
      }
    });
    
    return totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 96;
  }

  function getStudentMarksStatus(studentId, termId, subjects) {
    var subjectsArr = ensureSubjectsArray(subjects);
    var savedMarks = getStudentExamMarks(studentId, termId);
    var totalSubjects = subjectsArr.length;
    if (totalSubjects === 0) return { status: 'no_subjects' };

    var enteredCount = 0;
    if (savedMarks && savedMarks.marks) {
      subjectsArr.forEach(function(sub) {
        var scoreObj = savedMarks.marks[sub.id];
        if (scoreObj && (scoreObj.isAbsent || scoreObj.isExempted || (scoreObj.obtained !== undefined && scoreObj.obtained !== null && String(scoreObj.obtained).trim() !== ''))) {
          enteredCount++;
        }
      });
    }

    if (enteredCount === 0) {
      return { status: 'none' };
    } else if (enteredCount < totalSubjects) {
      return { status: 'incomplete', entered: enteredCount, total: totalSubjects };
    } else {
      return { status: 'complete', marks: savedMarks };
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;');
  }

  function getStatusBadge(status) {
    var badgeClass = 'badge-secondary';
    var text = 'Draft';
    if (status === 'active') { badgeClass = 'badge-primary'; text = 'Active'; }
    else if (status === 'marks_entry') { badgeClass = 'badge-warning'; text = 'Marks Entry'; }
    else if (status === 'review') { badgeClass = 'badge-purple'; text = 'Review'; }
    else if (status === 'published') { badgeClass = 'badge-success'; text = 'Published'; }
    else if (status === 'locked') { badgeClass = 'badge-dark'; text = 'Locked'; }
    return '<span class="badge ' + badgeClass + '">' + text + '</span>';
  }

  // -------------------- TAB RENDERERS --------------------

  function renderSetupTab() {
    var html = '';
    
    // Term Configuration Header
    html += '<div class="card mb-3"><div class="card-header">';
    html += '<h3><span class="material-icons-round">assignment</span> Configure Exam Terms</h3>';
    html += '<div class="flex gap-2">';
    html += '  <button class="btn btn-primary btn-sm" id="exam-wizard-btn"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">auto_awesome</span> Setup New Examination</button>';
    html += '  <button class="btn btn-primary btn-sm" id="exam-create-term-btn"><span class="material-icons-round">add</span> Add Exam Term</button>';
    html += '</div></div><div class="card-body">';

    var terms = Object.values(SchoolApp.store.examTerms || {}).sort(function(a, b) { return a.order - b.order; });
    if (terms.length > 0) {
      html += '<div class="table-container"><table class="data-table"><thead><tr><th>Term Name</th><th>Short Code</th><th>Dates</th><th>Weightage</th><th>Status</th><th>Rules</th><th>Actions</th></tr></thead><tbody>';
      terms.forEach(function(t) {
        html += '<tr>';
        html += '<td><strong>' + escapeHTML(t.name) + '</strong></td>';
        html += '<td>' + escapeHTML(t.shortName) + '</td>';
        html += '<td>' + (t.startDate ? t.startDate + ' to ' + t.endDate : '—') + '</td>';
        html += '<td>' + t.weightage + '%</td>';
        html += '<td>' + getStatusBadge(t.status) + '</td>';
        var rulesBadge = (t.rulesVersion === 'v2')
          ? '<span class="badge badge-success" style="font-size:11px;">Rules v2</span>'
          : '<span class="badge badge-secondary" style="font-size:11px;">Legacy (v1)</span>';
        html += '<td>' + rulesBadge + '</td>';
        html += '<td><div class="table-actions" style="display:flex; gap:6px; align-items:center;">';
        html += '  <button class="btn-icon exam-edit-term-btn" data-id="' + t.id + '" title="Edit Term" style="color:var(--accent-primary)"><span class="material-icons-round">edit</span></button>';
        html += '  <button class="btn-icon exam-delete-term-btn" data-id="' + t.id + '" title="Delete Term" style="color:var(--danger)"><span class="material-icons-round">delete</span></button>';
        
        // Upgrade v2 button: ONLY available when term has ZERO marks records
        var hasMarks = ExamCalculationEngine.hasAnyMarksForTerm(t.id);
        if ((!t.rulesVersion || t.rulesVersion === 'v1') && !hasMarks) {
          html += '  <button class="btn btn-xs btn-outline-primary exam-upgrade-term-btn" data-id="' + t.id + '" title="Upgrade to calculation rules v2" style="font-size:11px; padding:2px 8px;"><span class="material-icons-round" style="font-size:13px; vertical-align:middle; margin-right:2px;">upgrade</span> Upgrade v2</button>';
        }

        // Unlock button for locked or published terms (A7)
        if (t.status === 'locked' || t.status === 'published') {
          html += '  <button class="btn btn-xs btn-outline-warning exam-unlock-term-btn" data-id="' + t.id + '" title="Unlock Term" style="font-size:11px; padding:2px 8px;"><span class="material-icons-round" style="font-size:13px; vertical-align:middle; margin-right:2px;">lock_open</span> Unlock</button>';
        }

        html += '</div></td></tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state"><span class="material-icons-round">assignment</span><h3>No Exam Terms Configured</h3><p>Use the Wizard or Add button to set up your examination sessions.</p></div>';
    }
    html += '</div></div>';

    // Subject Mapping Table Configuration
    html += '<div class="card"><div class="card-header">';
    html += '<h3><span class="material-icons-round">schema</span> Class-Wise Subject Configurations</h3>';
    html += '</div><div class="card-body">';

    var termList = Object.values(SchoolApp.store.examTerms || {}).sort(function(a, b) { return a.order - b.order; });
    var classes = (SchoolApp.store.settings && SchoolApp.store.settings.classes) || [];

    if (termList.length === 0) {
      html += '<p class="text-muted">Please configure at least one Exam Term first.</p>';
    } else if (classes.length === 0) {
      html += '<p class="text-muted">Please configure Class Levels in School Settings first.</p>';
    } else {
      if (!state.examTerm) state.examTerm = termList[0].id;
      if (!state.classVal) state.classVal = classes[0];

      html += '<div class="form-grid mb-3" style="grid-template-columns: repeat(2, 1fr); gap:16px; max-width:600px;">';
      html += '  <div class="form-group"><label class="form-label">Exam Term</label>';
      html += '    <select class="form-select" id="setup-filter-term">';
      termList.forEach(function(t) {
        html += '      <option value="' + t.id + '"' + (state.examTerm === t.id ? ' selected' : '') + '>' + escapeHTML(t.name) + '</option>';
      });
      html += '    </select>';
      html += '  </div>';
      html += '  <div class="form-group"><label class="form-label">Class Level</label>';
      html += '    <select class="form-select" id="setup-filter-class">';
      classes.forEach(function(c) {
        html += '      <option value="' + c + '"' + (state.classVal === c ? ' selected' : '') + '>' + (['Nursery','LKG','UKG'].indexOf(c) !== -1 ? c : 'Class ' + c) + '</option>';
      });
      html += '    </select>';
      html += '  </div>';
      html += '</div>';

      // Term status actions info
      var activeTerm = SchoolApp.store.examTerms[state.examTerm];
      html += '<div class="flex justify-between align-center mb-3 p-3" style="background:var(--bg-secondary); border-radius:8px; border:1px solid var(--border-color); flex-wrap:wrap; gap:12px;">';
      html += '  <div><strong>Status:</strong> ' + getStatusBadge(activeTerm.status) + '</div>';
      html += '  <div class="flex gap-2">';
      if (activeTerm.status === 'draft') {
        html += '    <button class="btn btn-primary btn-sm term-status-advance" data-status="marks_entry"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">edit_note</span> Open Marks Entry</button>';
      } else if (activeTerm.status === 'marks_entry') {
        html += '    <button class="btn btn-warning btn-sm term-status-advance" data-status="review"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">rate_review</span> Close Marks Entry</button>';
      } else if (activeTerm.status === 'review') {
        html += '    <button class="btn btn-success btn-sm term-status-advance" data-status="published"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">publish</span> Publish Results</button>';
      } else if (activeTerm.status === 'published') {
        html += '    <button class="btn btn-dark btn-sm term-status-advance" data-status="locked"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">lock</span> Lock Term</button>';
      } else {
        html += '    <span class="text-muted" style="font-size:12px;">🔒 Term is permanently locked. No modifications allowed.</span>';
      }
      html += '  </div>';
      html += '</div>';

      // Render subjects list
      var termSubjects = ensureSubjectsArray((SchoolApp.store.examSubjects && SchoolApp.store.examSubjects[state.examTerm] && SchoolApp.store.examSubjects[state.examTerm][state.classVal] && SchoolApp.store.examSubjects[state.examTerm][state.classVal].subjects) || []);
      
      html += '<div class="flex justify-between align-center mb-3"><h4>Mapped Subjects</h4>';
      if (activeTerm.status !== 'locked') {
        html += '  <button class="btn btn-secondary btn-sm" id="exam-add-subject-btn"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">add</span> Add Subject</button>';
      }
      html += '</div>';

      if (termSubjects.length > 0) {
        html += '<div class="table-container"><table class="data-table"><thead><tr><th>Subject Name</th><th>Code</th><th>Type</th><th>Full Marks</th><th>Pass Marks</th><th>Has Exam</th><th>Actions</th></tr></thead><tbody>';
        termSubjects.forEach(function(sub) {
          html += '<tr>';
          html += '<td><strong>' + escapeHTML(sub.name) + '</strong></td>';
          html += '<td>' + escapeHTML(sub.code || '—') + '</td>';
          html += '<td>' + escapeHTML(sub.type) + '</td>';
          html += '<td>' + sub.fullMarks + '</td>';
          html += '<td>' + sub.passMarks + '</td>';
          html += '<td>' + (sub.hasExam ? 'Yes' : 'No') + '</td>';
          html += '<td>';
          if (activeTerm.status !== 'locked') {
            html += '<div class="table-actions" style="display:flex; gap:8px;">';
            html += '  <button class="btn-icon exam-edit-subject-btn" data-id="' + sub.id + '" title="Edit Subject" style="color:var(--accent-primary)"><span class="material-icons-round">edit</span></button>';
            html += '  <button class="btn-icon exam-delete-subject-btn" data-id="' + sub.id + '" title="Delete Subject" style="color:var(--danger)"><span class="material-icons-round">delete</span></button>';
            html += '</div>';
          } else {
            html += '—';
          }
          html += '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else {
        html += '<div class="empty-state"><span class="material-icons-round">schema</span><h3>No Mapped Subjects</h3><p>Map subjects for ' + (['Nursery','LKG','UKG'].indexOf(state.classVal) !== -1 ? state.classVal : 'Class ' + state.classVal) + ' in this term to begin assessments.</p></div>';
      }
    }

    html += '</div></div>';
    return html;
  }

  function renderMarksEntryTab() {
    var html = '';
    var termList = Object.values(SchoolApp.store.examTerms || {});
    var classes = (SchoolApp.store.settings && SchoolApp.store.settings.classes) || [];
    var sections = ['A', 'B', 'C', 'D'];

    if (SchoolApp.isTeacher()) {
      // Filter terms that are active for entry
      termList = termList.filter(function(t) { return t.status === 'marks_entry'; });
    }

    if (termList.length === 0) {
      return '<div class="card"><div class="card-body"><div class="empty-state"><span class="material-icons-round">lock</span><h3>Marks Entry Closed</h3><p>There are no exam terms currently open for marks entry.</p></div></div></div>';
    }

    // Initialize dropdown choices
    if (!state.examTerm || !SchoolApp.store.examTerms[state.examTerm]) {
      state.examTerm = termList[0].id;
    }
    
    // Teacher filters logic
    if (SchoolApp.isTeacher()) {
      var teacherOf = (SchoolApp.currentUser.subjectTeacherOf || []).concat(SchoolApp.currentUser.classTeacherOf || []);
      var teacherClasses = teacherOf.map(function(c) { return c.class; }).filter((v, i, a) => a.indexOf(v) === i);
      var teacherSections = teacherOf.map(function(c) { return c.section; }).filter((v, i, a) => a.indexOf(v) === i);
      
      if (teacherClasses.length > 0 && teacherClasses.indexOf(state.classVal) === -1) {
        state.classVal = teacherClasses[0];
      }
      if (teacherSections.length > 0 && teacherSections.indexOf(state.sectionVal) === -1) {
        state.sectionVal = teacherSections[0];
      }
      classes = classes.filter(function(c) { return teacherClasses.indexOf(c) !== -1; });
      sections = sections.filter(function(s) { return teacherSections.indexOf(s) !== -1; });
    }

    if (!state.classVal) state.classVal = classes[0];
    if (!state.sectionVal) state.sectionVal = sections[0];

    // Filter controls
    html += '<div class="card mb-3"><div class="card-body">';
    html += '<div class="form-grid" style="grid-template-columns: repeat(4, 1fr); gap:16px;">';
    
    // Term Select
    html += '  <div class="form-group"><label class="form-label">Exam Term</label>';
    html += '    <select class="form-select" id="marks-filter-term">';
    termList.forEach(function(t) {
      html += '      <option value="' + t.id + '"' + (state.examTerm === t.id ? ' selected' : '') + '>' + escapeHTML(t.name) + '</option>';
    });
    html += '    </select>';
    html += '  </div>';

    // Class Select
    html += '  <div class="form-group"><label class="form-label">Class</label>';
    html += '    <select class="form-select" id="marks-filter-class">';
    classes.forEach(function(c) {
      html += '      <option value="' + c + '"' + (state.classVal === c ? ' selected' : '') + '>' + (['Nursery','LKG','UKG'].indexOf(c) !== -1 ? c : 'Class ' + c) + '</option>';
    });
    html += '    </select>';
    html += '  </div>';

    // Section Select
    html += '  <div class="form-group"><label class="form-label">Section</label>';
    html += '    <select class="form-select" id="marks-filter-section">';
    sections.forEach(function(sec) {
      html += '      <option value="' + sec + '"' + (state.sectionVal === sec ? ' selected' : '') + '>Section ' + sec + '</option>';
    });
    html += '    </select>';
    html += '  </div>';

    // Subject Select
    var subjects = ensureSubjectsArray((SchoolApp.store.examSubjects && SchoolApp.store.examSubjects[state.examTerm] && SchoolApp.store.examSubjects[state.examTerm][state.classVal] && SchoolApp.store.examSubjects[state.examTerm][state.classVal].subjects) || []);
    
    if (SchoolApp.isTeacher()) {
      var assignedSubjects = (SchoolApp.currentUser.subjectTeacherOf || []).filter(function(item) {
        return item.class === state.classVal && item.section === state.sectionVal;
      }).map(function(item) { return item.subject; });
      subjects = subjects.filter(function(sub) {
        return assignedSubjects.indexOf(sub.name) !== -1;
      });
    }

    if (subjects.length > 0 && (!state.subjectVal || !subjects.some(function(s) { return s.id === state.subjectVal; }))) {
      state.subjectVal = subjects[0].id;
    }

    html += '  <div class="form-group"><label class="form-label">Subject</label>';
    html += '    <select class="form-select" id="marks-filter-subject">';
    subjects.forEach(function(sub) {
      html += '      <option value="' + sub.id + '"' + (state.subjectVal === sub.id ? ' selected' : '') + '>' + escapeHTML(sub.name) + '</option>';
    });
    html += '    </select>';
    html += '  </div>';

    html += '</div></div></div>';

    // Render marks entry area if selection matches
    if (state.examTerm && state.classVal && state.sectionVal && state.subjectVal) {
      if (state.loadingMarks || (!state.fetchedTerms || !state.fetchedTerms[state.examTerm])) {
        if (!pendingTermLoads[state.examTerm] && (!state.fetchedTerms || !state.fetchedTerms[state.examTerm])) {
          ensureMarksLoaded(state.examTerm).then(function() { render(); });
        }
        return html + renderMarksLoadingSpinner();
      }

      var students = (SchoolApp.store.students || []).filter(function(s) {
        return String(s.class).toLowerCase().trim() === String(state.classVal).toLowerCase().trim() &&
               String(s.section).toLowerCase().trim() === String(state.sectionVal).toLowerCase().trim() &&
               s.status === 'Active';
      });

      var activeSub = subjects.find(function(s) { return s.id === state.subjectVal; });

      if (!activeSub) {
        return html + '<div class="card"><div class="card-body"><p class="text-muted">No subject configuration found matching filters.</p></div></div>';
      }

      // Calculate progress indicator stats
      var totalMarksPossible = students.length;
      var enteredCount = 0;
      students.forEach(function(s) {
        var m = getStudentExamMarks(s.id, state.examTerm);
        if (m && m.marks && m.marks[state.subjectVal]) {
          var sc = m.marks[state.subjectVal];
          if (sc.isAbsent || sc.isExempted || (sc.obtained !== undefined && sc.obtained !== null && String(sc.obtained).trim() !== '')) {
            enteredCount++;
          }
        }
      });
      var progressPercent = totalMarksPossible > 0 ? Math.round((enteredCount / totalMarksPossible) * 100) : 0;

      html += '<div class="card mb-3"><div class="card-body">';
      html += '  <div class="flex justify-between align-center mb-3" style="flex-wrap:wrap; gap:12px;">';
      html += '    <div>';
      html += '      <h4 style="margin:0 0 4px 0;">Subject Assessment Matrix</h4>';
      html += '      <span style="font-size:12px;color:var(--text-secondary);">' + escapeHTML(activeSub.name) + ' (' + activeSub.type + ') • Max: ' + activeSub.fullMarks + ' · Pass: ' + activeSub.passMarks + '</span>';
      html += '    </div>';
      html += '    <div style="text-align:right;">';
      html += '      <div style="font-weight:600;font-size:13px;">Progress: ' + progressPercent + '% (' + enteredCount + '/' + totalMarksPossible + ' entered)</div>';
      html += '      <div class="progress-bar-container" style="width:180px;height:6px;background:var(--bg-secondary);border-radius:4px;overflow:hidden;margin-top:4px;display:inline-block;"><div style="width:' + progressPercent + '%;height:100%;background:var(--success);"></div></div>';
      html += '    </div>';
      html += '  </div>';

      // A7 Hard Freeze Check
      var activeTermObj = SchoolApp.store.examTerms && SchoolApp.store.examTerms[state.examTerm];
      var isTermFrozen = activeTermObj && (activeTermObj.status === 'locked' || activeTermObj.status === 'published');

      if (isTermFrozen) {
        html += '  <div class="alert alert-warning mb-3" style="background:#FEF3C7; border:1px solid #F59E0B; color:#92400E; padding:12px 16px; border-radius:8px; display:flex; align-items:center; gap:10px;">';
        html += '    <span class="material-icons-round" style="font-size:22px; color:#D97706;">lock</span>';
        html += '    <div><strong>Term is ' + (activeTermObj.status === 'published' ? 'Published' : 'Locked') + ':</strong> Marks entry and modifications are frozen for this term. (Client-side enforcement).</div>';
        html += '  </div>';
      }

      // Table
      html += '  <div class="table-container"><table class="data-table"><thead><tr><th>#</th><th>Student Name</th><th>Roll No</th><th class="center">Obtained Marks</th><th class="center">Absent</th><th class="center">Exempted</th><th class="center">Status</th></tr></thead><tbody>';
      
      students.forEach(function(s, idx) {
        var m = getStudentExamMarks(s.id, state.examTerm);
        var score = m && m.marks && m.marks[state.subjectVal] ? m.marks[state.subjectVal] : {};

        var val = score.obtained !== undefined ? score.obtained : '';
        var isAB = !!score.isAbsent;
        var isEX = !!score.isExempted;
        
        var inputStyle = '';
        var statusIcon = '🟡'; // incomplete default
        var tooltip = 'Enter mark';

        if (isAB) {
          val = '';
          inputStyle = 'background:#fee2e2; color:#b91c1c; font-weight:600;';
          statusIcon = '<span class="badge badge-danger">Absent</span>';
          tooltip = 'Marked Absent';
        } else if (isEX) {
          val = '';
          inputStyle = 'background:#e0f2fe; color:#0369a1; font-weight:600;';
          statusIcon = '<span class="badge badge-primary">Exempt</span>';
          tooltip = 'Medical Exemption';
        } else if (val !== '') {
          var num = parseFloat(val);
          if (num < activeSub.passMarks) {
            inputStyle = 'background:#fee2e2; border-color:#f87171; color:#991b1b;';
            statusIcon = '❌';
            tooltip = 'Failed (Below ' + activeSub.passMarks + ')';
          } else {
            statusIcon = '✅';
            tooltip = 'Passed';
          }
        }

        var stBadge = s.status === 'Left' ? ' <span class="badge badge-secondary" style="font-size:10px;">Left</span>' : (s.status === 'Inactive' ? ' <span class="badge badge-warning" style="font-size:10px;">Inactive</span>' : '');
        html += '<tr>';
        html += '<td>' + (idx + 1) + '</td>';
        html += '<td><strong>' + escapeHTML(SchoolApp.getStudentFullName(s)) + '</strong>' + stBadge + '</td>';
        html += '<td>' + s.rollNumber + '</td>';
        
        // Obtained input
        html += '<td class="center">';
        html += '  <input type="number" class="form-input mark-entry-score-input" ';
        html += '    data-student-id="' + s.id + '" ';
        html += '    data-full="' + activeSub.fullMarks + '" ';
        html += '    data-pass="' + activeSub.passMarks + '" ';
        html += '    value="' + val + '" ';
        html += '    style="width: 80px; text-align: center; font-weight:bold; ' + inputStyle + '" ';
        html += '    ' + ((isAB || isEX || isTermFrozen) ? 'disabled' : '') + '>';
        html += '</td>';

        // Absent Button
        html += '<td class="center">';
        html += '  <button class="btn ' + (isAB ? 'btn-danger' : 'btn-secondary') + ' btn-xs mark-entry-ab-btn" data-student-id="' + s.id + '" ' + (isTermFrozen ? 'disabled' : '') + '>AB</button>';
        html += '</td>';

        // Exempt Button
        html += '<td class="center">';
        html += '  <button class="btn ' + (isEX ? 'btn-primary' : 'btn-secondary') + ' btn-xs mark-entry-ex-btn" data-student-id="' + s.id + '" ' + (isTermFrozen ? 'disabled' : '') + '>EX</button>';
        html += '</td>';

        // Status
        html += '<td class="center" title="' + tooltip + '">' + statusIcon + '</td>';

        html += '</tr>';
      });

      html += '  </tbody></table></div>';

      // BUG 2: Sticky save bar — always visible, regardless of subjects loading
      html += '<div id="marks-save-bar" style="position:sticky; bottom:0; background:var(--bg-secondary); border-top:2px solid #1E3A8A; padding:12px 20px; display:flex; align-items:center; justify-content:space-between; z-index:10; box-shadow:0 -4px 12px rgba(0,0,0,0.1); margin-top:8px;">';
      html += '  <span id="save-status" style="font-size:13px; color:#6B7280;">Auto-saves on input</span>';
      html += '  <button id="save-marks-btn" style="padding:10px 24px; font-size:14px; font-weight:700; background:#1E3A8A; color:#fff; border:none; border-radius:8px; cursor:pointer;">&#128190; Save All Marks</button>';
      html += '</div>';

      html += '</div></div>';
    }

    return html;
  }

  function renderResultsTab() {
    var html = '';
    var termList = Object.values(SchoolApp.store.examTerms || {}).sort(function(a, b) { return a.order - b.order; });
    var classes = (SchoolApp.store.settings && SchoolApp.store.settings.classes) || [];
    var sections = ['A', 'B', 'C', 'D'];

    if (termList.length === 0) {
      return '<div class="card"><div class="card-body"><p class="text-muted">Please configure exam terms in the Setup tab first.</p></div></div>';
    }

    if (!state.examTerm) state.examTerm = termList[0].id;
    if (!state.classVal) state.classVal = classes[0];
    if (!state.sectionVal) state.sectionVal = sections[0];

    // Filter controls
    html += '<div class="card mb-3"><div class="card-body">';
    html += '<div class="form-grid" style="grid-template-columns: repeat(3, 1fr); gap:16px;">';
    
    // Term Select
    html += '  <div class="form-group"><label class="form-label">Exam Term</label>';
    html += '    <select class="form-select" id="results-filter-term">';
    termList.forEach(function(t) {
      html += '      <option value="' + t.id + '"' + (state.examTerm === t.id ? ' selected' : '') + '>' + escapeHTML(t.name) + '</option>';
    });
    html += '    </select>';
    html += '  </div>';

    // Class Select
    html += '  <div class="form-group"><label class="form-label">Class</label>';
    html += '    <select class="form-select" id="results-filter-class">';
    classes.forEach(function(c) {
      html += '      <option value="' + c + '"' + (state.classVal === c ? ' selected' : '') + '>' + (['Nursery','LKG','UKG'].indexOf(c) !== -1 ? c : 'Class ' + c) + '</option>';
    });
    html += '    </select>';
    html += '  </div>';

    // Section Select
    html += '  <div class="form-group"><label class="form-label">Section</label>';
    html += '    <select class="form-select" id="results-filter-section">';
    sections.forEach(function(sec) {
      html += '      <option value="' + sec + '"' + (state.sectionVal === sec ? ' selected' : '') + '>Section ' + sec + '</option>';
    });
    html += '    </select>';
    html += '  </div>';

    html += '</div></div></div>';

    if (state.examTerm) {
      if (state.loadingMarks) {
        return html + renderMarksLoadingSpinner();
      }
      if (!state.fetchedTerms || !state.fetchedTerms[state.examTerm]) {
        ensureMarksLoaded(state.examTerm).then(function() { render(); });
        return html + renderMarksLoadingSpinner();
      }
    }

    var students = (SchoolApp.store.students || []).filter(function(s) {
      return String(s.class).toLowerCase().trim() === String(state.classVal).toLowerCase().trim() &&
             String(s.section).toLowerCase().trim() === String(state.sectionVal).toLowerCase().trim() &&
             s.status === 'Active';
    });

    var subjects = (SchoolApp.store.examSubjects && SchoolApp.store.examSubjects[state.examTerm] && SchoolApp.store.examSubjects[state.examTerm][state.classVal] && SchoolApp.store.examSubjects[state.examTerm][state.classVal].subjects) || [];

    if (students.length === 0) {
      html += '<div class="card"><div class="card-body"><div class="empty-state"><span class="material-icons-round">groups</span><h3>No Active Students</h3><p>There are no active students in the selected class-section.</p></div></div></div>';
      return html;
    }

    // Completeness Checks
    var incompleteStudents = [];
    students.forEach(function(s) {
      var check = getStudentMarksStatus(s.id, state.examTerm, subjects);
      if (check.status !== 'complete') {
        incompleteStudents.push({ s: s, check: check });
      }
    });

    if (incompleteStudents.length > 0) {
      html += '<div class="alert alert-warning mb-3" style="background:#fffbeb; border:1px solid #fef3c7; color:#b45309; border-radius:8px; padding:16px; display:flex; flex-direction:column; gap:8px;">';
      html += '  <div style="font-weight:700;display:flex;align-items:center;gap:8px;"><span class="material-icons-round">warning</span> Marks Completeness Issue Detected</div>';
      html += '  <div style="font-size:13px;">Scores are missing or incomplete for ' + incompleteStudents.length + ' student(s) in this class. Rankings and results percentages may not be correct.</div>';
      html += '  <div class="flex gap-2 mt-2">';
      html += '    <button class="btn btn-warning btn-sm" id="view-incomplete-btn">View Incomplete List</button>';
      html += '  </div>';
      html += '</div>';
    }

    // Recalculate ranks in memory to match tie constraints before listing
    recalculateRanks(state.examTerm, state.classVal, state.sectionVal);

    // Calculate Summary Stats
    var totalCount = students.length;
    var passCount = 0;
    var maxPercentage = -1;
    var minPercentage = 101;
    var highestStudentName = 'N/A';
    var lowestStudentName = 'N/A';
    var totalPercentageSum = 0;
    var evaluatedCount = 0;

    students.forEach(function(s) {
      var m = getStudentExamMarks(s.id, state.examTerm);
      if (m && m.isComplete && m.result !== 'N/A') {
        evaluatedCount++;
        if (m.result === 'Pass') passCount++;
        totalPercentageSum += m.percentage;

        if (m.percentage > maxPercentage) {
          maxPercentage = m.percentage;
          highestStudentName = s.firstName + ' ' + s.lastName;
        }
        if (m.percentage < minPercentage) {
          minPercentage = m.percentage;
          lowestStudentName = s.firstName + ' ' + s.lastName;
        }
      }
    });

    var passPercent = evaluatedCount > 0 ? Math.round((passCount / evaluatedCount) * 100) : 0;
    var avgPercent = evaluatedCount > 0 ? Math.round(totalPercentageSum / evaluatedCount) : 0;

    // Summary Cards Grid
    html += '<div class="form-grid mb-3" style="grid-template-columns: repeat(3, 1fr); gap:16px;">';
    
    // Total & Pass Rate
    html += '  <div class="card p-3 flex flex-column justify-between" style="min-height:100px; border-left:4px solid var(--accent-primary);">';
    html += '    <div class="text-muted" style="font-size:12px;text-transform:uppercase;font-weight:700;">Total & Pass Rate</div>';
    html += '    <div style="font-size:24px;font-weight:800;margin:6px 0;">' + totalCount + ' <span style="font-size:14px;font-weight:400;color:var(--text-secondary);">Students</span></div>';
    html += '    <div style="font-size:13px;color:var(--success);font-weight:600;">Pass: ' + passPercent + '% (' + passCount + ' passed)</div>';
    html += '  </div>';

    // Highest & Lowest
    html += '  <div class="card p-3 flex flex-column justify-between" style="min-height:100px; border-left:4px solid var(--success);">';
    html += '    <div class="text-muted" style="font-size:12px;text-transform:uppercase;font-weight:700;">Performers</div>';
    html += '    <div style="font-size:13px;margin:6px 0;">';
    html += '      <div>🥇 <strong>Highest:</strong> ' + maxPercentage + '% (' + highestStudentName + ')</div>';
    html += '      <div style="margin-top:4px;">🔻 <strong>Lowest:</strong> ' + (minPercentage === 101 ? 0 : minPercentage) + '% (' + lowestStudentName + ')</div>';
    html += '    </div>';
    html += '  </div>';

    // Average
    html += '  <div class="card p-3 flex flex-column justify-between" style="min-height:100px; border-left:4px solid var(--warning);">';
    html += '    <div class="text-muted" style="font-size:12px;text-transform:uppercase;font-weight:700;">Class Average</div>';
    html += '    <div style="font-size:24px;font-weight:800;margin:6px 0;">' + avgPercent + '%</div>';
    html += '    <div class="progress-bar-container" style="width:100%;height:4px;background:var(--bg-secondary);border-radius:2px;overflow:hidden;"><div style="width:' + avgPercent + '%;height:100%;background:var(--warning);"></div></div>';
    html += '  </div>';

    html += '</div>';

    // Results table
    html += '<div class="card"><div class="card-header">';
    html += '  <h3>Results & Ledgers</h3>';
    html += '  <button class="btn btn-secondary btn-sm" id="exam-bulk-reportcard-btn"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">print</span> Generate All Report Cards</button>';
    html += '</div><div class="card-body">';

    html += '<div class="table-container"><table class="data-table"><thead><tr><th>Rank</th><th>Student Name</th><th class="center">Total Score</th><th class="center">Percentage</th><th class="center">Grade</th><th class="center">Result</th><th class="center">Action</th></tr></thead><tbody>';
    
    // Sort students by rank (putting N/A and unranked at bottom)
    var sortedStudents = students.map(function(s) {
      var m = getStudentExamMarks(s.id, state.examTerm);
      return { s: s, m: m };
    });
    sortedStudents.sort(function(a, b) {
      var rA = (a.m && a.m.rank) ? a.m.rank : 9999;
      var rB = (b.m && b.m.rank) ? b.m.rank : 9999;
      return rA - rB;
    });

    sortedStudents.forEach(function(item) {
      var s = item.s;
      var m = item.m;
      var isNA = m && m.result === 'N/A';

      var rankHtml = '—';
      if (m && m.rank && !isNA) {
        var medal = '';
        if (m.rank === 1) medal = '🥇 ';
        else if (m.rank === 2) medal = '🥈 ';
        else if (m.rank === 3) medal = '🥉 ';
        rankHtml = medal + m.rank;
      }

      html += '<tr class="result-expandable-row" data-student-id="' + s.id + '" style="cursor:pointer;" title="Click to view subject-wise breakdown">';
      html += '<td><strong>' + rankHtml + '</strong></td>';
      html += '<td>';
      html += '  <div style="font-weight:600;">' + escapeHTML(SchoolApp.getStudentFullName(s)) + '</div>';
      html += '  <div style="font-size:11px;color:var(--text-secondary);">Roll: ' + s.rollNumber + '</div>';
      html += '</td>';

      if (!m || !m.isComplete) {
        html += '<td colspan="4" class="center"><span style="color:#f97316; font-weight:600;">⚠️ Marks incomplete — cannot generate report card</span></td>';
        html += '<td class="center" class="no-propagate">';
        html += '  <button class="btn btn-secondary btn-sm" disabled title="Enter all marks first"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">print</span> Report</button>';
        html += '</td>';
      } else {
        var resClass = m.result === 'Pass' ? 'badge-success' : 'badge-danger';
        var resText = m.result === 'Pass' ? 'Pass ✅' : (m.result === 'Fail' ? 'Fail ❌' : m.result);

        html += '<td class="center font-semibold">' + m.total + ' / ' + m.maxTotal + '</td>';
        html += '<td class="center font-semibold">' + m.percentage + '%</td>';
        html += '<td class="center"><span class="badge badge-purple">' + m.grade + '</span></td>';
        html += '<td class="center"><span class="badge ' + resClass + '">' + resText + '</span></td>';
        html += '<td class="center" class="no-propagate">';
        html += '  <button class="btn btn-secondary btn-sm generate-reportcard-btn" data-student-id="' + s.id + '"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">print</span> Report</button>';
        html += '</td>';
      }
      html += '</tr>';

      // Dropdown Breakdown Row (Hidden by default)
      html += '<tr class="breakdown-details-row" id="breakdown-' + s.id + '" style="display:none; background:var(--bg-tertiary);"><td colspan="7">';
      html += '  <div class="p-3" style="border:1px solid var(--border-color); border-radius:8px;">';
      html += '    <h5 style="margin-top:0;">Subject Breakdown</h5>';
      
      if (m && m.marks) {
        html += '    <table class="data-table" style="background:var(--bg-secondary); margin-bottom:0;"><thead><tr><th>Subject</th><th>Full Marks</th><th>Pass Marks</th><th>Obtained</th><th>Grade</th><th>Status</th></tr></thead><tbody>';
        subjects.forEach(function(sub) {
          var scoreObj = m.marks[sub.id] || {};
          var obtained = scoreObj.isAbsent ? 'AB' : (scoreObj.isExempted ? 'EX' : (scoreObj.obtained !== undefined ? scoreObj.obtained : '—'));
          
          var passStatus = '—';
          var grade = '—';
          if (!scoreObj.isAbsent && !scoreObj.isExempted && scoreObj.obtained !== undefined) {
            var num = parseFloat(scoreObj.obtained);
            passStatus = num >= sub.passMarks ? '<span style="color:var(--success);font-weight:600;">Pass</span>' : '<span style="color:var(--danger);font-weight:600;">Fail</span>';
            var gradeObj = calculateGrade(Math.round((num / sub.fullMarks) * 100));
            grade = gradeObj.grade;
          }

          html += '<tr>';
          html += '<td><strong>' + escapeHTML(sub.name) + '</strong></td>';
          html += '<td>' + sub.fullMarks + '</td>';
          html += '<td>' + sub.passMarks + '</td>';
          html += '<td><strong>' + obtained + '</strong></td>';
          html += '<td>' + grade + '</td>';
          html += '<td>' + passStatus + '</td>';
          html += '</tr>';
        });
        html += '    </tbody></table>';
      } else {
        html += '    <p class="text-muted" style="margin:0;">No assessment logs exist for this student.</p>';
      }

      html += '  </div>';
      html += '</td></tr>';
    });

    html += '</tbody></table></div>';
    html += '</div></div>';

    return html;
  }

  function renderReportCardsTab() {
    var html = '';
    var termList = Object.values(SchoolApp.store.examTerms || {}).sort(function(a, b) { return a.order - b.order; });
    var classes = (SchoolApp.store.settings && SchoolApp.store.settings.classes) || [];
    var sections = ['A', 'B', 'C', 'D'];

    if (termList.length === 0) {
      return '<div class="card"><div class="card-body"><p class="text-muted">Please configure exam terms first.</p></div></div>';
    }

    if (!state.examTerm) state.examTerm = termList[0].id;
    if (!state.classVal) state.classVal = classes[0];
    if (!state.sectionVal) state.sectionVal = sections[0];

    // Single vs Combined Toggle Panel
    html += '<div class="flex gap-2 mb-3" style="border-bottom: 1px solid var(--border-color); padding-bottom: 12px; flex-wrap: wrap; align-items: center; justify-content: space-between; width: 100%;">';
    html += '  <div class="flex gap-2">';
    html += '    <button class="btn ' + (!state.isCombined ? 'btn-primary' : 'btn-secondary') + ' btn-sm" id="exam-mode-single"><span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">looks_one</span> Single Term Report</button>';
    if (termList.length >= 2) {
      html += '    <button class="btn ' + (state.isCombined ? 'btn-primary' : 'btn-secondary') + ' btn-sm" id="exam-mode-combined"><span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">looks_two</span> Combined Report Card Mode</button>';
    }
    html += '  </div>';
    html += '</div>';

    // Filters depending on Mode
    html += '<div class="card mb-3"><div class="card-body">';
    
    if (!state.isCombined) {
      html += '<div class="form-grid" style="grid-template-columns: repeat(3, 1fr); gap:16px;">';
      // Term
      html += '  <div class="form-group"><label class="form-label">Exam Term</label>';
      html += '    <select class="form-select" id="reports-filter-term">';
      termList.forEach(function(t) {
        html += '      <option value="' + t.id + '"' + (state.examTerm === t.id ? ' selected' : '') + '>' + escapeHTML(t.name) + '</option>';
      });
      html += '    </select>';
      html += '  </div>';
      // Class
      html += '  <div class="form-group"><label class="form-label">Class</label>';
      html += '    <select class="form-select" id="reports-filter-class">';
      classes.forEach(function(c) {
        html += '      <option value="' + c + '"' + (state.classVal === c ? ' selected' : '') + '>' + (['Nursery','LKG','UKG'].indexOf(c) !== -1 ? c : 'Class ' + c) + '</option>';
      });
      html += '    </select>';
      html += '  </div>';
      // Section
      html += '  <div class="form-group"><label class="form-label">Section</label>';
      html += '    <select class="form-select" id="reports-filter-section">';
      sections.forEach(function(sec) {
        html += '      <option value="' + sec + '"' + (state.sectionVal === sec ? ' selected' : '') + '>Section ' + sec + '</option>';
      });
      html += '    </select>';
      html += '  </div>';
      html += '</div>';
    } else {
      // Combined selection: Checkboxes for Terms
      html += '  <div class="form-group mb-3"><label class="form-label">Select Terms to Combine</label>';
      html += '    <div class="flex gap-4" style="flex-wrap:wrap; margin-top:8px;">';
      termList.forEach(function(t) {
        var isChecked = state.combinedTerms.indexOf(t.id) !== -1;
        var wt = state.combinedWeightages[t.id] !== undefined ? state.combinedWeightages[t.id] : 50;
        html += '      <label class="flex align-center gap-2" style="font-size:13px; font-weight:600; cursor:pointer;">';
        html += '        <input type="checkbox" class="combined-term-checkbox" value="' + t.id + '" ' + (isChecked ? 'checked' : '') + '> ' + escapeHTML(t.name);
        if (isChecked) {
          html += '      <input type="number" class="form-input combined-term-weight" data-id="' + t.id + '" value="' + wt + '" style="width:70px; padding:2px; text-align:center; height:24px; font-size:12px;" min="0" max="100">% Weight';
        }
        html += '      </label>';
      });
      html += '    </div>';
      html += '  </div>';

      html += '<div class="form-grid" style="grid-template-columns: repeat(2, 1fr); gap:16px;">';
      // Class
      html += '  <div class="form-group"><label class="form-label">Class</label>';
      html += '    <select class="form-select" id="reports-filter-class">';
      classes.forEach(function(c) {
        html += '      <option value="' + c + '"' + (state.classVal === c ? ' selected' : '') + '>' + (['Nursery','LKG','UKG'].indexOf(c) !== -1 ? c : 'Class ' + c) + '</option>';
      });
      html += '    </select>';
      html += '  </div>';
      // Section
      html += '  <div class="form-group"><label class="form-label">Section</label>';
      html += '    <select class="form-select" id="reports-filter-section">';
      sections.forEach(function(sec) {
        html += '      <option value="' + sec + '"' + (state.sectionVal === sec ? ' selected' : '') + '>Section ' + sec + '</option>';
      });
      html += '    </select>';
      html += '  </div>';
      html += '</div>';
    }

    // Check if the currently selected class has any Inactive or Left students
    var hasInactiveOrLeft = (SchoolApp.store.students || []).some(function(s) {
      if (s.inTrash || s.status === 'Deleted') return false;
      var matchCls = String(s.class || '').toLowerCase().trim() === String(state.classVal || '').toLowerCase().trim();
      return matchCls && (s.status === 'Inactive' || s.status === 'Left');
    });

    var disabledAttr = hasInactiveOrLeft ? '' : ' disabled';
    var titleAttr = hasInactiveOrLeft ? '' : ' title="No Inactive or Left students in this class"';
    var labelStyle = hasInactiveOrLeft ? 'cursor:pointer;' : 'opacity:0.6; cursor:not-allowed;';

    html += '<div style="margin-top:14px; padding-top:12px; border-top:1px solid var(--border-color); display:flex; align-items:center;">';
    html += '  <label style="font-size:13px; font-weight:500; display:inline-flex; align-items:center; gap:8px; ' + labelStyle + '"' + titleAttr + '>';
    html += '    <input type="checkbox" id="exam-include-inactive-toggle"' + (state.includeInactiveLeft && hasInactiveOrLeft ? ' checked' : '') + disabledAttr + '> ';
    html += '    Include Inactive / Left students with marks';
    html += '  </label>';
    html += '</div>';

    html += '</div></div>';

    if (!state.isCombined) {
      if (state.examTerm) {
        if (state.loadingMarks || (!state.fetchedTerms || !state.fetchedTerms[state.examTerm])) {
          if (!pendingTermLoads[state.examTerm] && (!state.fetchedTerms || !state.fetchedTerms[state.examTerm])) {
            ensureMarksLoaded(state.examTerm).then(function() { render(); });
          }
          return html + renderMarksLoadingSpinner();
        }
      }
    } else {
      var unLoadedTerms = (state.combinedTerms || []).filter(function(tId) {
        return (!state.fetchedTerms || !state.fetchedTerms[tId]) && !pendingTermLoads[tId];
      });
      if (state.loadingMarks || unLoadedTerms.length > 0) {
        if (unLoadedTerms.length > 0) {
          Promise.all(unLoadedTerms.map(ensureMarksLoaded)).then(function() { render(); });
        }
        return html + renderMarksLoadingSpinner();
      }
    }

    var subjects = (SchoolApp.store.examSubjects && SchoolApp.store.examSubjects[state.examTerm] && SchoolApp.store.examSubjects[state.examTerm][state.classVal] && SchoolApp.store.examSubjects[state.examTerm][state.classVal].subjects) || [];

    // Student List Table & Printing Cards
    var includeInactiveLeft = !!state.includeInactiveLeft;
    var students = (SchoolApp.store.students || []).filter(function(s) {
      if (s.inTrash || s.status === 'Deleted') return false;
      var matchCls = String(s.class).toLowerCase().trim() === String(state.classVal).toLowerCase().trim();
      var matchSec = String(s.section).toLowerCase().trim() === String(state.sectionVal).toLowerCase().trim();
      if (!matchCls || !matchSec) return false;
      if (s.status === 'Active') return true;
      if (includeInactiveLeft && (s.status === 'Inactive' || s.status === 'Left')) {
        var m = getStudentExamMarks(s.id, state.examTerm);
        return !!(m && (m.isComplete || m.total !== undefined || (m.marks && Object.keys(m.marks).length > 0)));
      }
      return false;
    });

    // Card 2: Report Card Status & Printing
    html += '<div class="card mt-3"><div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">';
    html += '  <h3><span class="material-icons-round">print</span> Report Card Status & Printing</h3>';
    if (students.length > 0) {
      html += '  <button class="btn btn-secondary btn-sm" id="exam-bulk-reportcard-btn-lower"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">print</span> Generate All Report Cards</button>';
    }
    html += '</div><div class="card-body">';

    if (students.length === 0) {
      html += '<div class="empty-state"><span class="material-icons-round">groups</span><h3>No Active Students</h3><p>There are no active students to print report cards for.</p></div>';
    } else {
      html += '<p style="color:var(--text-secondary);font-size:13px;margin:-8px 0 16px 0;">Verify grades and print individual report cards. Only students with complete marks can have their report cards generated.</p>';
      html += '<div class="table-container"><table class="data-table"><thead><tr>';
      html += '<th>#</th><th>Student Name</th><th class="center">Total</th><th class="center">Grade</th><th class="center">Status</th><th class="center">Action</th>';
      html += '</tr></thead><tbody>';

      students.forEach(function(s, idx) {
        var savedMarks = getStudentExamMarks(s.id, state.examTerm);
        var subjectsArr = ensureSubjectsArray(subjects);
        var missingSubjects = [];
        if (savedMarks && savedMarks.marks && subjectsArr.length > 0) {
          subjectsArr.forEach(function(sub) {
            var scoreObj = savedMarks.marks[sub.id];
            var hasEntry = scoreObj && (scoreObj.isAbsent || scoreObj.isExempted || (scoreObj.obtained !== undefined && scoreObj.obtained !== null && String(scoreObj.obtained).trim() !== ''));
            if (!hasEntry) {
              missingSubjects.push(sub.name || sub.id);
            }
          });
        }

        html += '<tr>';
        html += '<td>' + (idx + 1) + '</td>';
        html += '<td><strong>' + escapeHTML(SchoolApp.getStudentFullName(s)) + '</strong>';
        if (s.status === 'Inactive' || s.status === 'Left') {
          var badgeCls = s.status === 'Left' ? 'badge-danger' : 'badge-warning';
          html += ' <span class="badge ' + badgeCls + '" style="font-size:10px; margin-left:6px;">' + s.status + '</span>';
        }
        html += '</td>';

        var hasValidMarks = savedMarks && (savedMarks.isComplete || savedMarks.total !== undefined);

        if (!savedMarks || (!savedMarks.marks && savedMarks.total === undefined)) {
          html += '<td class="center"><span style="color: var(--danger); font-weight: 600;">No marks</span></td>';
          html += '<td class="center text-muted">—</td>';
          html += '<td class="center text-muted">—</td>';
          html += '<td class="center">';
          html += '  <button class="btn btn-secondary btn-sm" disabled title="No marks entered" style="cursor: not-allowed;"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">print</span> Report Card</button>';
          html += '</td>';
        } else if (!hasValidMarks) {
          html += '<td class="center"><span style="color: #f97316; font-weight: 600;">Marks incomplete</span></td>';
          html += '<td class="center text-muted">—</td>';
          html += '<td class="center text-muted">—</td>';
          html += '<td class="center">';
          html += '  <button class="btn btn-secondary btn-sm" disabled title="Enter all marks first" style="cursor: not-allowed;"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">print</span> Report Card</button>';
          html += '</td>';
        } else {
          var isPass = (savedMarks.result === 'Pass');
          var stColor = isPass ? 'badge-success' : 'badge-danger';
          var statusText = isPass ? 'Pass ✅' : (savedMarks.result ? (savedMarks.result + ' ❌') : '—');
          var totalDisp = (savedMarks.total !== undefined && savedMarks.maxTotal !== undefined) ? (savedMarks.total + ' / ' + savedMarks.maxTotal) : (savedMarks.total !== undefined ? String(savedMarks.total) : '—');
          var gradeDisp = savedMarks.grade || '—';
          
          html += '<td class="center font-semibold">';
          html += totalDisp;
          if (missingSubjects.length > 0) {
            var enteredCount = subjectsArr.length - missingSubjects.length;
            html += '<br><span class="badge badge-warning" style="font-size:10px; cursor:help; margin-top:2px;" title="Missing configured subjects: ' + escapeHTML(missingSubjects.join(', ')) + '">Partial (' + enteredCount + '/' + subjectsArr.length + ')</span>';
          }
          html += '</td>';
          html += '<td class="center"><span class="badge badge-purple">' + gradeDisp + '</span></td>';
          html += '<td class="center"><span class="badge ' + stColor + '">' + statusText + '</span></td>';
          html += '<td class="center">';
          html += '  <button class="btn btn-secondary btn-sm generate-reportcard-btn" data-student-id="' + s.id + '"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">print</span> Report Card</button>';
          html += '</td>';
        }
        html += '</tr>';
      });

      html += '</tbody></table></div>';
    }
    html += '</div></div>';

    return html;
  }

  // -------------------- INDIVIDUAL & BULK PRINT REPORT CARDS --------------------

    function rankToOrdinal(rank) {
    if (!rank) return '—';
    rank = parseInt(rank);
    if (rank === 1) return '🥇 1st (First)';
    if (rank === 2) return '🥈 2nd (Second)';
    if (rank === 3) return '🥉 3rd (Third)';
    var suffix = 
      rank % 10 === 1 && rank !== 11 ? 'st' :
      rank % 10 === 2 && rank !== 12 ? 'nd' :
      rank % 10 === 3 && rank !== 13 ? 'rd' : 'th';
    return rank + suffix;
  }

  var DEFAULT_TEMPLATES = {
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

    absent_and_fail:
      '{name} was absent in {subjects} and ' +
      'also needs to improve in the ' +
      'remaining weak subjects. Regular ' +
      'attendance and consistent practice ' +
      'are strongly recommended.',

    fail_result:
      '{name} needs to improve performance ' +
      'in {subjects}. Regular practice and ' +
      'focused preparation are recommended.'
  };

  window.DEFAULT_TEMPLATES = DEFAULT_TEMPLATES;

  function generateSmartRemark(student, subjects, savedMarks, entry, templates) {
    var tpl = Object.assign({}, DEFAULT_TEMPLATES, templates || {});

    var studentName = 'The student';
    if (student) {
      if (student.name && student.name.trim()) {
        studentName = student.name.trim();
      } else if (student.firstName || student.lastName) {
        studentName = ((student.firstName || '') + ' ' + (student.lastName || '')).trim();
      }
    }
    if (!studentName) studentName = 'The student';

    var subjectsArr = ensureSubjectsArray(subjects || []);

    // Separate mandatory vs optional
    var mandatorySubjects = subjectsArr.filter(function(s) {
      return !s.isOptional;
    });

    // Analyze each mandatory subject
    var absentMandatory = [];
    var weakMandatory = []; // close to passing (<= 10% gap)
    var significantFail = []; // far from passing (> 10% gap)
    var allWeakSubjects = [];

    mandatorySubjects.forEach(function(sub) {
      var sc = savedMarks && savedMarks[sub.id];
      if (!sc) return;

      var obtained = Number(sc.obtained) || 0;
      var passMarks = sub.passMarks || 33;
      var fullMarks = sub.fullMarks || 100;
      var gap = passMarks - obtained;
      var gapPct = (gap / fullMarks) * 100;

      if (sc.isAbsent) {
        absentMandatory.push(sub.name);
      } else if (obtained < passMarks) {
        if (gapPct <= 10) {
          weakMandatory.push(sub.name);
        } else {
          significantFail.push(sub.name);
        }
        allWeakSubjects.push(sub.name);
      }
    });

    // Combined: all failed + absent
    var allProblematic = absentMandatory.concat(significantFail).concat(weakMandatory);
    // Remove duplicates
    allProblematic = allProblematic.filter(function(v, i, a) {
      return a.indexOf(v) === i;
    });

    var overallResult = String(entry && entry.result ? entry.result : 'Pass').toUpperCase();
    var pct = (entry && entry.percentage !== undefined) ? entry.percentage : 0;

    // Helper to format subject list
    function formatSubjects(arr) {
      if (!arr || !arr.length) return '';
      if (arr.length === 1) return arr[0];
      if (arr.length === 2) return arr[0] + ' and ' + arr[1];
      return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
    }

    function fillTemplate(str, subArr) {
      if (!str) return '';
      return str
        .replace(/{name}/g, studentName)
        .replace(/{subjects}/g, formatSubjects(subArr));
    }

    var remark = '';

    if (allProblematic.length === 0) {
      // All passed — good/excellent logic
      if (overallResult === 'PASS' && pct < 50) {
        remark = fillTemplate(tpl.pass_low, []);
      } else if (overallResult === 'PASS' && pct >= 50 && pct < 75) {
        remark = fillTemplate(tpl.good, []);
      } else if (overallResult === 'PASS' && pct >= 75) {
        remark = fillTemplate(tpl.excellent, []);
      } else {
        remark = fillTemplate(tpl.good, []);
      }
    } else if (absentMandatory.length > 0 && allWeakSubjects.length > 0) {
      // Both absent AND failed subjects
      remark = fillTemplate(tpl.absent_and_fail, allProblematic);
    } else if (absentMandatory.length > 0) {
      // Only absent
      remark = fillTemplate(tpl.absent_mandatory, absentMandatory);
    } else if (allProblematic.length >= 2) {
      // Multiple failures
      remark = fillTemplate(tpl.fail_multiple, allProblematic);
    } else if (significantFail.length === 1) {
      // One significant fail
      remark = fillTemplate(tpl.fail_significant, significantFail);
    } else if (weakMandatory.length === 1) {
      // One slight fail
      remark = fillTemplate(tpl.fail_slightly, weakMandatory);
    } else {
      remark = fillTemplate(tpl.good, []);
    }

    return remark;
  }

  function legacyGenerateSingleStudentCardHTML(s, isCombined, savedMarks, combinedData, activeTerm, subjects) {
    var subjectsArr = ensureSubjectsArray(subjects || []);
    subjectsArr = sortSubjects(subjectsArr);

    var store = (SchoolApp && SchoolApp.store) || {};
    var settings = store.settings || {};
    var schoolInfo = settings.schoolInfo || {};
    var reportCardConfig = store.reportCardConfig || {};
    var schoolCfg = reportCardConfig.school || {};
    var studentCfg = reportCardConfig.student || {};
    var acaCfg = reportCardConfig.academic || {};
    var layoutCfg = reportCardConfig.layout || {};
    var designCfg = reportCardConfig.design || {};

    var primaryColor = designCfg.primaryColor || layoutCfg.primaryColor || '#1E3A8A';
    var schoolName = settings.name || settings.schoolName || schoolInfo.name || '';
    var tagline = settings.tagline || settings.schoolTagline || schoolInfo.tagline || '';
    var address = settings.address || settings.schoolAddress || schoolInfo.address || '';
    var phone = settings.phone || settings.schoolPhone || schoolInfo.phone || '';
    var email = settings.email || settings.schoolEmail || schoolInfo.email || '';
    var website = settings.website || settings.schoolWebsite || schoolInfo.website || '';
    var udise = settings.udiseCode || settings.udiseNo || settings.udise || schoolInfo.udiseCode || schoolInfo.udise || '';
    var logo = settings.logoUrl || schoolInfo.logoUrl || '';

    var termName = activeTerm ? activeTerm.name : 'ANNUAL EXAMINATION';
    var academicSession = (settings && settings.academicYear) || '2025-26';

    // Calculate marks summary
    var marksMap = (savedMarks && savedMarks.marks) || {};
    var totalFull = 0;
    var totalPass = 0;
    var totalObtained = 0;
    var mandatoryFailed = false;
    var optionalFailedOrAbsent = false;
    var hasAbsent = false;

    subjectsArr.forEach(function(sub) {
      var sc = marksMap[sub.id];
      if (!sc) return;
      if (sc.isExempted) return;

      var obtained = sc.isAbsent ? 0 : (Number(sc.obtained) || 0);
      totalFull += (sub.fullMarks || 100);
      totalPass += (sub.passMarks || 33);
      totalObtained += obtained;

      if (sc.isAbsent) hasAbsent = true;

      if (sub.isOptional) {
        if (sc.isAbsent || obtained < (sub.passMarks || 33)) {
          optionalFailedOrAbsent = true;
        }
      } else {
        if (sc.isAbsent || obtained < (sub.passMarks || 33)) {
          mandatoryFailed = true;
        }
      }
    });

    var percentage = totalFull > 0 ? Math.round((totalObtained / totalFull) * 100) : 0;
    var resultText = mandatoryFailed ? 'FAIL' : 'PASS';

    // Override with saved totals if available to match Result tab
    if (savedMarks && savedMarks.total !== undefined) {
      totalObtained = savedMarks.total;
      if (savedMarks.maxTotal !== undefined) totalFull = savedMarks.maxTotal;
      if (savedMarks.percentage !== undefined) percentage = savedMarks.percentage;
      if (savedMarks.result) resultText = savedMarks.result.toUpperCase();
    }

    var divisionText = '';
    var divisionColor = '#3730A3';
    var divisionBg = '#EEF2FF';
    var divisionBorder = '#A5B4FC';

    if (savedMarks && savedMarks.division) {
      divisionText = savedMarks.division;
      if (resultText === 'FAIL' || mandatoryFailed) {
        divisionColor = '#991B1B';
      } else if (optionalFailedOrAbsent) {
        divisionColor = '#6B7280';
      } else {
        divisionColor = '#15803D';
      }
    } else if (mandatoryFailed) {
      divisionText = 'Not Applicable';
      divisionColor = '#991B1B';
    } else if (optionalFailedOrAbsent) {
      divisionText = '---';
      divisionColor = '#6B7280';
    } else {
      if (percentage >= 60) {
        divisionText = 'First Division';
        divisionColor = '#15803D';
      } else if (percentage >= 45) {
        divisionText = 'Second Division';
        divisionColor = '#1D4ED8';
      } else if (percentage >= 33) {
        divisionText = 'Third Division';
        divisionColor = '#92400E';
      } else {
        divisionText = 'Pass Division';
        divisionColor = '#15803D';
      }
    }

    var rankVal = '—';
    if (savedMarks && savedMarks.rank) {
      rankVal = rankToOrdinal(savedMarks.rank);
    }

    var allMandatoryAbsent = subjectsArr.filter(function(sub){ return !sub.isOptional; }).every(function(sub) {
      var sc = marksMap[sub.id];
      return sc && sc.isAbsent;
    });
    var totalGrade = (savedMarks && savedMarks.grade) ? savedMarks.grade : (allMandatoryAbsent ? 'Ab' : (typeof calculateGrade === 'function' ? (calculateGrade(percentage).grade || '—') : '—'));

    var studentName = escapeHTML(((s.firstName || '') + ' ' + (s.lastName || '')).trim());
    var studentClass = escapeHTML(s.class || '—');
    var sectionVal = escapeHTML(s.section || '—');
    var rollNo = escapeHTML(s.rollNumber || '—');
    var parentName = escapeHTML(s.parentName || s.fatherName || '—');
    var studentAddress = escapeHTML(s.address || '');
    var dob = escapeHTML(s.dob || '');
    var remarks = (savedMarks && savedMarks.remarks) || '';

    var html = '';
    html += '<div class="report-card page-wrapper" style="width:194mm; height:271mm; max-height:271mm; border:2px solid ' + primaryColor + '; padding:14px 16px; margin:0 auto; box-sizing:border-box; display:flex; flex-direction:column; background:#fff; font-family:Inter,sans-serif; overflow:hidden;">';

    html += '<div style="display:flex; align-items:center; gap:16px; padding-bottom:8px; border-bottom:2px solid ' + primaryColor + ';">';
    if (logo && schoolCfg.logo !== false) {
      html += '<img src="' + logo + '" style="height:90px; width:90px; object-fit:contain; flex-shrink:0;" alt="School Logo">';
    }
    html += '<div style="flex:1; text-align:center;">';
    html += '<div style="font-family:\'Poppins\',sans-serif; font-size:28px; font-weight:700; color:' + primaryColor + '; letter-spacing:0.06em; text-transform:uppercase; line-height:1.2; margin-bottom:3px;">' + escapeHTML(schoolName) + '</div>';
    if (schoolCfg.tagline !== false && tagline) {
      html += '<div style="font-family:\'Inter\',sans-serif; font-size:12px; font-style:italic; font-weight:400; color:#4B5563; margin:2px 0 6px;">&ldquo;' + escapeHTML(tagline) + '&rdquo;</div>';
    }
    html += '<div style="border-top:1px solid rgba(30,58,110,0.2); margin:5px 20px;"></div>';
    if (schoolCfg.address !== false && address) {
      html += '<div style="font-family:\'Inter\',sans-serif; font-size:12px; font-weight:500; color:#1F2937; margin:3px 0 2px;">' + escapeHTML(address) + '</div>';
    }
    var contacts = [];
    if (schoolCfg.phone !== false && phone) contacts.push('&#9990; ' + escapeHTML(phone));
    if (schoolCfg.email !== false && email) contacts.push('&#9993; ' + escapeHTML(email));
    if (schoolCfg.website !== false && website) contacts.push('&#127760; ' + escapeHTML(website));
    if (contacts.length > 0) {
      html += '<div style="font-family:\'Inter\',sans-serif; font-size:11px; font-weight:400; color:#4B5563; margin:2px 0;">' + contacts.join(' &nbsp;|&nbsp; ') + '</div>';
    }
    var metaParts = [];
    if (schoolCfg.udiseCode !== false && udise) metaParts.push('UDISE: ' + escapeHTML(udise));
    if (schoolCfg.session !== false) metaParts.push('Session: ' + escapeHTML(academicSession));
    if (metaParts.length > 0) {
      html += '<div style="font-family:\'Inter\',sans-serif; font-size:11px; font-weight:600; color:#1E3A8A; margin:3px 0 0;">' + metaParts.join(' &nbsp;&bull;&nbsp; ') + '</div>';
    }
    html += '</div></div>';
    html += '<div style="height:3px; background:linear-gradient(to right,#1E3A6E,#3B82F6,#1E3A6E); margin:0 0 4px 0;"></div>';

    html += '<div style="text-align:center; margin:4px 0;">';
    html += '<span style="background:#1E3A6E; color:#FFFFFF; border-radius:4px; padding:5px 24px; font-size:13px; font-weight:800; letter-spacing:0.15em; display:inline-block; text-transform:uppercase;">REPORT CARD</span>';
    html += '<div style="font-size:12px; font-weight:600; color:#374151; margin-top:4px;">' + escapeHTML(termName) + '</div>';
    html += '</div>';

    // Student info — 2-column grid (FIX 1)
    var colCellBase = 'display:flex; align-items:center; gap:12px; padding:8px 14px;';
    var colLabelStyle = 'font-size:10px; color:#6B7280; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; flex-shrink:0;';
    var colValBlue = 'font-weight:700; color:#1E3A8A; font-size:13px;';
    var colValGrey = 'font-weight:600; color:#1F2937; font-size:12px;';
    var bdrB = 'border-bottom:1px solid #BFDBFE;';
    var bdrBR = 'border-bottom:1px solid #BFDBFE; border-right:1px solid #BFDBFE;';

    html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:0; border:1px solid #BFDBFE; border-radius:8px; overflow:hidden; margin:8px 0; font-size:12px;">';

    // Row 1: Student Name | Class
    html += '<div style="' + colCellBase + 'background:#EFF6FF;' + bdrBR + '">' +
      '<span style="' + colLabelStyle + ' min-width:100px;">Student Name</span>' +
      '<span style="font-weight:700; color:#1F2937; font-size:13px;">' + studentName + '</span></div>';
    html += '<div style="' + colCellBase + 'background:#EFF6FF;' + bdrB + '">' +
      '<span style="' + colLabelStyle + ' min-width:60px;">Class</span>' +
      '<span style="' + colValBlue + '">' + studentClass + (sectionVal && sectionVal !== '—' ? ' / Sec: ' + sectionVal : '') + '</span></div>';

    // Row 2: Guardian | Roll No (conditional)
    if (studentCfg.parentName !== false) {
      html += '<div style="' + colCellBase + bdrBR + '">' +
        '<span style="' + colLabelStyle + ' min-width:100px;">Guardian</span>' +
        '<span style="' + colValGrey + '">' + parentName + '</span></div>';
      html += '<div style="' + colCellBase + bdrB + '">' +
        '<span style="' + colLabelStyle + ' min-width:60px;">Roll No</span>' +
        '<span style="' + colValGrey + '">' + rollNo + '</span></div>';
    } else {
      html += '<div style="' + colCellBase + bdrBR + '">' +
        '<span style="' + colLabelStyle + ' min-width:100px;">Roll No</span>' +
        '<span style="' + colValGrey + '">' + rollNo + '</span></div>';
      html += '<div style="' + colCellBase + bdrB + '"></div>';
    }

    // Row 3: DOB if enabled
    if (studentCfg.dob !== false && dob) {
      html += '<div style="' + colCellBase + bdrBR + '">' +
        '<span style="' + colLabelStyle + ' min-width:100px;">Date of Birth</span>' +
        '<span style="' + colValGrey + '">' + dob + '</span></div>';
      html += '<div style="' + colCellBase + bdrB + '"></div>';
    }

    // Address — full width
    if (studentCfg.address !== false && studentAddress) {
      html += '<div style="' + colCellBase + 'grid-column:1/-1;">' +
        '<span style="' + colLabelStyle + ' min-width:100px;">Address</span>' +
        '<span style="font-weight:500; color:#374151; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + studentAddress + '</span></div>';
    }

    html += '</div>'; // end student info grid

    var subCount = subjectsArr.length;
    var tblFontSize = subCount > 10 ? '10px' : subCount > 8 ? '11px' : '12px';
    var cellPad = subCount > 10 ? '4px 8px' : '6px 10px';

    html += '<table class="marks-table" style="width:100%; border-collapse:collapse; border:1px solid #BFDBFE; overflow:hidden; font-size:' + tblFontSize + '; margin-bottom:6px;">';
    html += '<thead><tr class="marks-header" style="background:#1E3A8A; color:#FFFFFF; -webkit-print-color-adjust:exact; print-color-adjust:exact;">';
    html += '<th style="padding:' + cellPad + '; text-align:left; font-size:11.5px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; width:38%; border:none;">Subject</th>';
    html += '<th style="padding:' + cellPad + '; text-align:center; font-size:11.5px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; width:13%; border:none;">Full Marks</th>';
    html += '<th style="padding:' + cellPad + '; text-align:center; font-size:11.5px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; width:13%; border:none;">Pass Marks</th>';
    html += '<th style="padding:' + cellPad + '; text-align:center; font-size:11.5px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; width:18%; border:none;">Obtained</th>';
    html += '<th style="padding:' + cellPad + '; text-align:center; font-size:11.5px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; width:18%; border:none;">Grade</th>';
    html += '</tr></thead><tbody>';

    subjectsArr.forEach(function(sub, idx) {
      var sc = marksMap[sub.id];
      var isAbsent = sc && sc.isAbsent;
      var isExempted = sc && sc.isExempted;
      var hasScore = sc && !isAbsent && !isExempted && sc.obtained !== undefined && sc.obtained !== null && String(sc.obtained).trim() !== '';
      var obtNum = hasScore ? Number(sc.obtained) : null;
      if (obtNum !== null && isNaN(obtNum)) obtNum = null;
      var passNum = sub.passMarks || 33;
      var isFail = obtNum !== null && obtNum < passNum;
      var obtDisp = isAbsent ? 'AB' : (isExempted ? 'Ex' : (obtNum !== null ? String(obtNum) : '—'));
      var obtStyle = (isAbsent || isFail) ? 'text-align:center; font-weight:700; color:#DC2626; text-decoration:underline;' : 'text-align:center; font-weight:700; color:#1F2937;';
      var subPct = obtNum !== null ? (obtNum / (sub.fullMarks || 100)) * 100 : 0;
      var gr = isAbsent ? 'Ab' : (isExempted ? 'Ex' : (obtNum !== null && typeof calculateGrade === 'function' ? (calculateGrade(subPct).grade || '—') : '—'));
      if (!isAbsent && !isExempted && obtNum !== null && obtNum >= passNum && gr === 'F') {
        gr = 'D';
      }
      html += '<tr style="background:' + (idx % 2 === 0 ? '#EFF6FF' : '#FFFFFF') + ';">';
      html += '<td style="padding:' + cellPad + '; font-weight:600; color:#1F2937; text-align:left; border-bottom:1px solid #DBEAFE;">' + escapeHTML(sub.name) + '</td>';
      html += '<td style="padding:' + cellPad + '; text-align:center; border-bottom:1px solid #DBEAFE;">' + (sub.fullMarks || 100) + '</td>';
      html += '<td style="padding:' + cellPad + '; text-align:center; border-bottom:1px solid #DBEAFE;">' + passNum + '</td>';
      html += '<td style="padding:' + cellPad + '; ' + obtStyle + ' border-bottom:1px solid #DBEAFE;">' + obtDisp + '</td>';
      html += '<td style="padding:' + cellPad + '; text-align:center; font-weight:700; color:#1F2937; border-bottom:1px solid #DBEAFE;">' + gr + '</td>';
      html += '</tr>';
    });
    html += '<tr class="total-row" style="background:#1E3A8A; color:#FFFFFF; font-weight:800; font-size:13px; -webkit-print-color-adjust:exact; print-color-adjust:exact;">';
    html += '<td style="padding:' + cellPad + '; text-align:left; letter-spacing:0.05em;">TOTAL</td>';
    html += '<td style="padding:' + cellPad + '; text-align:center;">' + totalFull + '</td>';
    html += '<td style="padding:' + cellPad + '; text-align:center;">' + totalPass + '</td>';
    html += '<td style="padding:' + cellPad + '; text-align:center;">' + totalObtained + '</td>';
    html += '<td style="padding:' + cellPad + '; text-align:center;">' + totalGrade + '</td>';
    html += '</tr></tbody></table>';

    html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 16px; padding:10px 14px; background:#EFF6FF; border:1px solid #93C5FD; border-radius:8px; margin-top:6px;">';
    html += '<div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid #93C5FD;"><span style="font-size:11px; color:#6B7280; font-weight:500;">Percentage:</span><span style="font-size:13px; font-weight:700; color:#1E3A6E;">' + percentage + '%</span></div>';
    html += '<div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid #DBEAFE;"><span style="font-size:11px; color:#6B7280; font-weight:500;">Division:</span><span style="font-size:13px; font-weight:700; color:' + divisionColor + ';">' + escapeHTML(divisionText) + '</span></div>';
    if (acaCfg.rank !== false) {
      html += '<div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid #DBEAFE;"><span style="font-size:11px; color:#6B7280; font-weight:500;">Class Rank:</span><span style="font-size:13px; font-weight:700; color:#1E3A6E;">' + rankVal + '</span></div>';
    }
    html += '<div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid #DBEAFE;"><span style="font-size:11px; color:#6B7280; font-weight:500;">Final Result:</span><span style="font-size:13px; font-weight:700; color:' + (mandatoryFailed ? '#DC2626' : '#16A34A') + ';">' + resultText + '</span></div>';
    html += '</div>';

    var remarksText = '';
    var smartRemarksEnabled = acaCfg.smartRemarks === true;
    var showRemarks = acaCfg.remarks !== false;

    if (showRemarks) {
      if (smartRemarksEnabled) {
        var customTemplates = (reportCardConfig && reportCardConfig.remarkTemplates) || {};
        var entry = { result: resultText, percentage: percentage };
        remarksText = generateSmartRemark(
          s,
          subjectsArr,
          savedMarks && savedMarks.marks,
          entry,
          customTemplates
        );
      } else {
        remarksText = (savedMarks && savedMarks.remarks) || '';
      }

      html += '<div style="border:1px solid #E5E7EB; border-radius:6px; padding:8px 12px; min-height:16mm; max-height:28mm; margin-top:6px;">';
      html += '<div style="font-family:Inter,sans-serif; font-size:10px; color:#6B7280; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px;">TEACHER\'S REMARKS</div>';
      html += '<div style="font-size:12px; font-family:Inter,sans-serif; color:#374151; line-height:1.5;">' + escapeHTML(remarksText || '') + '</div>';
      html += '</div>';
    }

    html += '<div style="font-size:10px; color:#6B7280; text-align:center; padding:5px 0; border-top:1px solid #E5E7EB;">';
    html += '<strong>Grading Scale:</strong> A+(91-100) &nbsp;|&nbsp; A(81-90) &nbsp;|&nbsp; B+(71-80) &nbsp;|&nbsp; B(61-70) &nbsp;|&nbsp; C+(51-60) &nbsp;|&nbsp; C(41-50) &nbsp;|&nbsp; D(33-40) &nbsp;|&nbsp; F(&lt;33)';
    html += '</div>';

    html += '<div style="flex:1; min-height:2mm; max-height:10mm;"></div>';

    // 7. SIGNATURES + DATE OF ISSUE (FIX 10, FIX 11)
    var dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    html += '<div style="border-top:2px solid #E5E7EB; padding:10px 16px 8px; margin-top:auto;">';
    html += '<div style="display:flex; justify-content:space-between; align-items:flex-end;">';
    html += '<div style="text-align:center; width:150px;"><div style="height:32px;"></div><div style="border-top:1px solid #374151; padding-top:6px; font-size:10px; font-weight:700; letter-spacing:0.08em; color:#374151;">CLASS TEACHER</div></div>';
    html += '<div style="text-align:center; width:130px; height:50px; border:1px dashed #9CA3AF; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:9px; color:#9CA3AF; font-weight:600;">SCHOOL SEAL</div>';
    html += '<div style="text-align:center; width:150px;"><div style="height:32px;"></div><div style="border-top:1px solid #374151; padding-top:6px; font-size:10px; font-weight:700; letter-spacing:0.08em; color:#374151;">PRINCIPAL</div></div>';
    html += '</div>';
    html += '<div style="margin-top:10px; font-size:10.5px; color:#4B5563;">Date of Issue: <span style="font-weight:600; border-bottom:1px solid #555; padding-bottom:1px;">' + dateStr + '</span></div>';
    html += '</div>'; // end signatures

    html += '</div>'; // End .report-card
    return html;
  }

  function generateSingleStudentCardHTML(s, isCombined, savedMarks, combinedData, activeTerm, subjects) {
    var isV2 = activeTerm && activeTerm.rulesVersion === 'v2';
    if (isV2) {
      var cfg = (SchoolApp.store && SchoolApp.store.reportCardConfig) || {};
      return ExamCalculationEngine.generateSingleStudentCardHTMLV2(s, isCombined, savedMarks, combinedData, activeTerm, subjects, cfg);
    }
    return legacyGenerateSingleStudentCardHTML(s, isCombined, savedMarks, combinedData, activeTerm, subjects);
  }


  function printStudentMarksheet(studentId) {
    var s = SchoolApp.store.students.find(function(x) { return x.id === studentId; });
    if (!s) return;

    var activeTerm = SchoolApp.store.examTerms[state.examTerm];
    var classSubjectsObj = SchoolApp.store.examSubjects && SchoolApp.store.examSubjects[state.examTerm] && (SchoolApp.store.examSubjects[state.examTerm][s.class] || SchoolApp.store.examSubjects[state.examTerm]['Class ' + s.class]);
    var subjects = (classSubjectsObj && classSubjectsObj.subjects) || [];
    var savedMarks = getStudentExamMarks(s.id, state.examTerm);

    var cardHTML = generateSingleStudentCardHTML(s, false, savedMarks, null, activeTerm, subjects);
    var stuName = s.name || ((s.firstName || '') + ' ' + (s.lastName || '')).trim();
    if (activeTerm && activeTerm.rulesVersion === 'v2') {
      printViaBlobV2(cardHTML, stuName, s.class);
    } else {
      printViaBlob(cardHTML, stuName, s.class);
    }
  }

  function legacyPrintBulkReportCards() {
    var includeInactiveLeft = !!state.includeInactiveLeft;
    var subjects = (SchoolApp.store.examSubjects && SchoolApp.store.examSubjects[state.examTerm] && SchoolApp.store.examSubjects[state.examTerm][state.classVal] && SchoolApp.store.examSubjects[state.examTerm][state.classVal].subjects) || [];
    var students = (SchoolApp.store.students || []).filter(function(s) {
      if (s.inTrash || s.status === 'Deleted') return false;
      var matchCls = String(s.class).toLowerCase().trim() === String(state.classVal).toLowerCase().trim();
      var matchSec = String(s.section).toLowerCase().trim() === String(state.sectionVal).toLowerCase().trim();
      if (!matchCls || !matchSec) return false;
      if (s.status === 'Active') return true;
      if (includeInactiveLeft && (s.status === 'Inactive' || s.status === 'Left')) {
        var m = getStudentExamMarks(s.id, state.examTerm);
        return !!(m && (m.isComplete || m.total !== undefined || (m.marks && Object.keys(m.marks).length > 0)));
      }
      return false;
    });

    if (students.length === 0) {
      SchoolApp.showToast('No active students to print report cards for.', 'warning');
      return;
    }

    var settings = SchoolApp.store.settings || {};
    var info = settings.schoolInfo || {};
    var logoUrl = settings.logoUrl || info.logoUrl || '';
    if (!logoUrl) {
      logoUrl = new URL('school-logo-updated.jpg', window.location.href).href + '?t=' + new Date().getTime();
    }

    var printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      SchoolApp.showToast('Popup blocker prevented opening report cards.', 'warning');
      return;
    }

    var html = '<html><head><title>Class ' + state.classVal + ' ' + state.sectionVal + ' Report Cards</title>';
    html += '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">';
    html += '<link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">';
    
    html += '<style>';
    html += 'html, body { margin: 0; padding: 0; box-sizing: border-box; background:#fff; color:#000; }';
    html += 'body { font-family: "Inter", sans-serif; }';
    html += '.report-card { border: 3px double #1a1a3a; padding: 35px; border-radius: 12px; max-width: 750px; margin: 25px auto; box-shadow: 0 4px 12px rgba(0,0,0,0.05); display: flex; flex-direction: column; height: 275mm; box-sizing: border-box; justify-content: space-between; page-break-after: always; }';
    html += '.header { display: flex; align-items: center; justify-content: center; gap: 24px; border-bottom: 2px double #1a1a3a; padding-bottom: 20px; margin-bottom: 25px; }';
    html += '.header-logo { height: 110px; width: auto; object-fit: contain; }';
    html += '.header-text { text-align: left; }';
    html += '.school-title { font-size: 30px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #1a1a3a; margin: 0 0 6px 0; }';
    html += '.school-subtitle { font-size: 13px; color: #555; font-weight: 500; margin: 0; letter-spacing: 0.2px; }';
    html += '.title { font-size: 15px; font-weight: 700; text-transform: uppercase; color: #1a1a3a; margin: 0; border: 1px solid #1a1a3a; display: inline-block; padding: 3px 12px; border-radius: 4px; }';
    html += '.student-details { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 25px; font-size: 14px; line-height: 1.6; border: 1px solid #ddd; padding: 14px 18px; border-radius: 8px; background: #fafafa; }';
    html += '.student-details div span { font-weight: bold; color: #333; }';
    html += '.marks-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }';
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
    html += '  @page { size: A4; margin: 15mm; }';
    html += '  html, body { width: 210mm; height: 297mm; margin: 0; padding: 0; box-sizing: border-box; } ';
    html += '  .report-card { border: 3px double #000; box-shadow: none; padding: 12mm; max-width: 100%; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; page-break-inside: avoid; } ';
    html += '  .marks-table th, .marks-table td { padding: 16px 10px; font-size: 14px; }';
    html += '  .student-details { padding: 12px 16px; margin-bottom: 20px; font-size: 14px; }';
    html += '  .summary-footer { padding: 12px 16px; margin-bottom: 20px; font-size: 14px; }';
    html += '  .signature-box { border: 2px solid #000; }';
    html += '  .signatures { margin-top: auto !important; }';
    html += '}';
    html += '</style></head><body>';

    var schoolName = info.name || settings.schoolName || '';
    var tagline = info.tagline || '';
    var address = info.address || settings.address || '';
    var phone = info.phone || settings.phone || '';
    var udiseCode = info.udiseCode || settings.udiseCode || '';

    var subtitleHtml = (tagline ? tagline + ' · ' : '') + address + (phone ? ' · Phone: ' + phone : '');
    if (udiseCode) {
      subtitleHtml += ' · UDISE Code: ' + udiseCode;
    }

    students.forEach(function(s) {
      var subjects = (SchoolApp.store.examSubjects && SchoolApp.store.examSubjects[state.examTerm] && SchoolApp.store.examSubjects[state.examTerm][s.class] && SchoolApp.store.examSubjects[state.examTerm][s.class].subjects) || [];

        var subjectsArr = sortSubjects(subjects);

        if (!state.isCombined) {
          var savedMarks = getStudentExamMarks(s.id, state.examTerm);
          if (!savedMarks) return; // skip if no marks

          var activeTerm = SchoolApp.store.examTerms[state.examTerm];
          var examName = activeTerm.name || 'Term Examination';
          var attendancePercent = getStudentAttendancePercentage(s, activeTerm.startDate, activeTerm.endDate);

          html += '<div class="report-card">';
          html += '<div class="header">';
          html += '<img src="' + logoUrl + '" class="header-logo" alt="School Logo">';
          html += '<div class="header-text">';
          html += '<h1 class="school-title">' + schoolName + '</h1>';
          html += '<p class="school-subtitle">' + subtitleHtml + '</p>';
          html += '<div style="display:flex; align-items:center; gap:12px; margin-top:8px;">';
          html += '<h2 class="title">OFFICIAL REPORT CARD</h2>';
          html += '<span style="font-size:11px; font-weight:600; color:var(--text-muted);">Term: ' + examName + ' (' + (settings.academicYear || '2025-26') + ')</span>';
          html += '</div></div></div>';

          var displayClass = ['Nursery','LKG','UKG'].indexOf(s.class) !== -1 ? s.class : 'Class ' + s.class;
          html += '<div class="student-details">';
          html += '<div><span>Student Name:</span> ' + s.firstName + ' ' + (s.lastName || '') + '</div>';
          html += '<div><span>Roll Number:</span> ' + s.rollNumber + '</div>';
          html += '<div><span>Class:</span> ' + displayClass + '</div>';
          html += '<div><span>Section:</span> ' + s.section + '</div>';
          html += '</div>';

          html += '<table class="marks-table"><thead><tr>';
          html += '<th>Subject</th>';
          html += '<th class="center">Full Marks</th>';
          html += '<th class="center">Pass Marks</th>';
          html += '<th class="center">Obtained</th>';
          html += '<th class="center">Grade</th>';
          html += '</tr></thead><tbody>';

          subjectsArr.forEach(function(sub) {
            var scoreObj = (savedMarks.marks && savedMarks.marks[sub.id]) || {};
            var obtDisp = getObtainedDisplay(scoreObj, sub);

            var gradeText = '—';
            if (!scoreObj.isAbsent && !scoreObj.isExempted && scoreObj.obtained !== undefined && scoreObj.obtained !== null && String(scoreObj.obtained).trim() !== '') {
              var num = parseFloat(scoreObj.obtained);
              if (!isNaN(num)) {
                var gradeObj = calculateGrade(Math.round((num / (sub.fullMarks || 100)) * 100));
                gradeText = gradeObj.grade || '—';
              }
            }

            html += '<tr>';
            html += '<td><strong>' + escapeHTML(sub.name) + '</strong></td>';
            html += '<td class="center">' + sub.fullMarks + '</td>';
            html += '<td class="center">' + sub.passMarks + '</td>';
            html += '<td class="center">' + obtDisp + '</td>';
            html += '<td class="center" style="font-weight:700;">' + gradeText + '</td>';
            html += '</tr>';
          });

          html += '</tbody></table>';

        html += '<div class="report-card-footer" style="margin-top: auto; display: flex; flex-direction: column;">';

        var resClass = savedMarks.result === 'Pass' ? 'pass' : 'fail';
        var rankText = '—';
        if (savedMarks.rank) {
          if (savedMarks.rank === 1) rankText = '1st';
          else if (savedMarks.rank === 2) rankText = '2nd';
          else if (savedMarks.rank === 3) rankText = '3rd';
          else rankText = savedMarks.rank + 'th';
        }

        var medal = '';
        if (savedMarks.rank === 1) medal = ' 🥇';
        else if (savedMarks.rank === 2) medal = ' 🥈';
        else if (savedMarks.rank === 3) medal = ' 🥉';

        html += '<div class="summary-footer">';
        html += '<div><span>Grand Total Scored:</span> ' + savedMarks.total + ' / ' + savedMarks.maxTotal + '</div>';
        html += '<div><span>Overall Percentage:</span> ' + savedMarks.percentage + '%</div>';
        html += '<div><span>Academic Grade:</span> ' + savedMarks.grade + ' (' + savedMarks.gradeLabel + ')</div>';
        html += '<div><span>Academic Result:</span> <span class="result-badge ' + resClass + '">' + savedMarks.result + '</span></div>';
        html += '<div><span>Attendance:</span> ' + attendancePercent + '%</div>';
        html += '<div><span>Class Rank:</span> ' + rankText + medal + '</div>';
        html += '<div style="grid-column: span 2; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 4px;">';
        html += '  <span>Teacher\'s Remarks:</span> Satisfactory Performance';
        html += '</div>';
        html += '</div>';

        html += '<div class="grading-legend">';
        html += '<strong>Grading Scale:</strong> A+: 91-100% &nbsp;|&nbsp; A: 81-90% &nbsp;|&nbsp; B+: 71-80% &nbsp;|&nbsp; B: 61-70% &nbsp;|&nbsp; C+: 51-60% &nbsp;|&nbsp; C: 41-50% &nbsp;|&nbsp; D: 33-40% &nbsp;|&nbsp; F: Below 33%';
        html += '</div>';

        html += '<div class="important-notes">';
        html += '<strong>Important Notes:</strong> Parents are requested to review the performance and sign. This is a computer-generated document.';
        html += '</div>';

        html += '<div class="signatures">';
        html += '<div class="signature-box">Class Teacher</div>';
        html += '<div class="signature-box">Principal</div>';
        html += '</div></div></div>';
      }
    });

    html += '<script>window.onload = function() { window.print(); }</script>';
    html += '</body></html>';

    printWindow.document.write(html);
    printWindow.document.close();
  }

  function printBulkReportCards() {
    var activeTerm = SchoolApp.store.examTerms && SchoolApp.store.examTerms[state.examTerm];
    var isV2 = activeTerm && activeTerm.rulesVersion === 'v2';
    if (isV2) {
      var cfg = (SchoolApp.store && SchoolApp.store.reportCardConfig) || {};
      return ExamCalculationEngine.printBulkReportCardsV2(state, cfg);
    }
    return legacyPrintBulkReportCards();
  }

  // -------------------- EVENT ATTACHMENTS --------------------

  function attachEvents() {
    // Tab switching
    // NOTE: Direct DOM bindings run every render (elements are recreated by innerHTML).
    // Only the document-level delegated listener is guarded to run once.
    var setupTab = document.getElementById('exam-tab-setup');
    if (setupTab) {
      setupTab.addEventListener('click', function() { state.activeSubTab = 'setup'; render(); });
    }
    var marksTab = document.getElementById('exam-tab-marks');
    if (marksTab) {
      marksTab.addEventListener('click', async function() {
        state.activeSubTab = 'marks_entry';
        if (state.examTerm) {
          await ensureMarksLoaded(state.examTerm);
        }
        render();
      });
    }
    var resultsTab = document.getElementById('exam-tab-results');
    if (resultsTab) {
      resultsTab.addEventListener('click', async function() {
        state.activeSubTab = 'results';
        if (state.examTerm) {
          await ensureMarksLoaded(state.examTerm);
        }
        render();
      });
    }
    var reportsTab = document.getElementById('exam-tab-reports');
    if (reportsTab) {
      reportsTab.addEventListener('click', async function() {
        state.activeSubTab = 'report_cards';
        if (state.examTerm) {
          await ensureMarksLoaded(state.examTerm);
        }
        render();
      });
    }

    // Filter selectors
    var setupTerm = document.getElementById('setup-filter-term');
    if (setupTerm) {
      setupTerm.addEventListener('change', async function() {
        state.examTerm = this.value;
        await ensureMarksLoaded(this.value);
        render();
      });
    }
    var setupClass = document.getElementById('setup-filter-class');
    if (setupClass) {
      setupClass.addEventListener('change', function() { state.classVal = this.value; render(); });
    }

    var marksTerm = document.getElementById('marks-filter-term');
    if (marksTerm) {
      marksTerm.addEventListener('change', async function() {
        state.examTerm = this.value;
        await ensureMarksLoaded(this.value);
        render();
      });
    }
    var marksClass = document.getElementById('marks-filter-class');
    if (marksClass) {
      marksClass.addEventListener('change', function() { state.classVal = this.value; render(); });
    }
    var marksSection = document.getElementById('marks-filter-section');
    if (marksSection) {
      marksSection.addEventListener('change', function() { state.sectionVal = this.value; render(); });
    }
    var marksSub = document.getElementById('marks-filter-subject');
    if (marksSub) {
      marksSub.addEventListener('change', function() { state.subjectVal = this.value; render(); });
    }

    var resultsTerm = document.getElementById('results-filter-term');
    if (resultsTerm) {
      resultsTerm.addEventListener('change', async function() {
        state.examTerm = this.value;
        await ensureMarksLoaded(this.value);
        render();
      });
    }
    var resultsClass = document.getElementById('results-filter-class');
    if (resultsClass) {
      resultsClass.addEventListener('change', function() { state.classVal = this.value; render(); });
    }
    var resultsSection = document.getElementById('results-filter-section');
    if (resultsSection) {
      resultsSection.addEventListener('change', function() { state.sectionVal = this.value; render(); });
    }

    var reportsTerm = document.getElementById('reports-filter-term');
    if (reportsTerm) {
      reportsTerm.addEventListener('change', async function() {
        state.examTerm = this.value;
        await ensureMarksLoaded(this.value);
        render();
      });
    }
    var reportsClass = document.getElementById('reports-filter-class');
    if (reportsClass) {
      reportsClass.addEventListener('change', function() { state.classVal = this.value; render(); });
    }
    var reportsSection = document.getElementById('reports-filter-section');
    if (reportsSection) {
      reportsSection.addEventListener('change', function() { state.sectionVal = this.value; render(); });
    }

    // Term Status advance
    document.querySelectorAll('.term-status-advance').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var targetStatus = this.getAttribute('data-status');
        var term = SchoolApp.store.examTerms[state.examTerm];
        if (!term) return;

        SchoolApp.showConfirm(
          'Are you sure you want to advance this term status to "' + targetStatus.toUpperCase() + '"?',
          async function() {
            term.status = targetStatus;
            
            // Generate notifications if moving to active/marks_entry
            if (targetStatus === 'marks_entry') {
              if (!SchoolApp.store.notices) SchoolApp.store.notices = [];
              SchoolApp.store.notices.push({
                id: 'notice_me_' + Date.now().toString(36),
                title: '📝 Marks Entry Open for ' + term.name,
                message: 'Admin has opened marks entry portal. Teachers, please fill marks by ' + term.endDate + '.',
                date: new Date().toISOString().split('T')[0],
                priority: 'High',
                status: 'published'
              });
            }

            var success = await SchoolApp.save();
            if (success) {
              SchoolApp.showToast('Status advanced to ' + targetStatus.toUpperCase(), 'success');
              render();
            }
          },
          'Advance Status?'
        );
      });
    });

    // Create Term modal
    var createTermBtn = document.getElementById('exam-create-term-btn');
    if (createTermBtn) {
      createTermBtn.addEventListener('click', function() {
        var bodyHTML = '<div class="form-group mb-3"><label class="form-label">Term Name *</label>';
        bodyHTML += '  <input type="text" id="admin-examterm-name" class="form-input" placeholder="e.g. Term 1 (Half-Yearly)">';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-group mb-3"><label class="form-label">Short Code *</label>';
        bodyHTML += '  <input type="text" id="admin-examterm-short" class="form-input" placeholder="e.g. T1" maxlength="5">';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-group mb-3"><label class="form-label">Exam Type *</label>';
        bodyHTML += '  <select id="admin-examterm-type" class="form-input">';
        bodyHTML += '    <option value="main" selected>Main Examination</option>';
        bodyHTML += '    <option value="unit_test">Periodic / Unit Test</option>';
        bodyHTML += '  </select>';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-grid mb-3" style="grid-template-columns: 1fr 1fr; gap:16px;">';
        bodyHTML += '  <div class="form-group"><label class="form-label">Start Date *</label><input type="date" id="admin-examterm-start" class="form-input"></div>';
        bodyHTML += '  <div class="form-group"><label class="form-label">End Date *</label><input type="date" id="admin-examterm-end" class="form-input"></div>';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-group mb-3"><label class="form-label">Weightage % *</label>';
        bodyHTML += '  <input type="number" id="admin-examterm-weight" class="form-input" value="50" min="0" max="100">';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-group mb-3">';
        bodyHTML += '  <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13px;">';
        bodyHTML += '    <input type="checkbox" id="exam-term-is-final"> Final / Annual Examination (Enables Promotion Status on Report Cards)';
        bodyHTML += '  </label>';
        bodyHTML += '</div>';

        var footerHTML = '<button class="btn btn-secondary modal-close-btn">Cancel</button>';
        footerHTML += '<button class="btn btn-primary" id="admin-save-examterm-btn">Save Term</button>';

        SchoolApp.showModal('Create Exam Term', bodyHTML, footerHTML);

        var saveBtn = document.getElementById('admin-save-examterm-btn');
        if (saveBtn) {
          saveBtn.addEventListener('click', async function() {
            var name = document.getElementById('admin-examterm-name').value.trim();
            var short = document.getElementById('admin-examterm-short').value.trim();
            var start = document.getElementById('admin-examterm-start').value;
            var end = document.getElementById('admin-examterm-end').value;
            var weight = parseInt(document.getElementById('admin-examterm-weight').value) || 50;
            var isFinal = !!(document.getElementById('exam-term-is-final') && document.getElementById('exam-term-is-final').checked);
            var examType = (document.getElementById('admin-examterm-type') && document.getElementById('admin-examterm-type').value) || 'main';

            if (!name || !short || !start || !end) {
              SchoolApp.showToast('Please enter all required fields.', 'error');
              return;
            }

            var tId = 'term_' + Date.now().toString(36);
            if (!SchoolApp.store.examTerms) SchoolApp.store.examTerms = {};

            SchoolApp.store.examTerms[tId] = {
              id: tId,
              name: name,
              shortName: short,
              session: (SchoolApp.store.examConfig && SchoolApp.store.examConfig.session) || "2025-26",
              startDate: start,
              endDate: end,
              resultDate: null,
              status: 'draft',
              weightage: weight,
              isFinal: isFinal,
              examType: examType,
              rulesVersion: 'v2', // New terms get rulesVersion v2 by default
              createdAt: new Date().toISOString(),
              createdBy: SchoolApp.currentUser ? SchoolApp.currentUser.username : 'admin',
              order: Object.keys(SchoolApp.store.examTerms).length + 1
            };

            var success = await SchoolApp.save();
            if (success) {
              SchoolApp.closeModal();
              SchoolApp.showToast('Exam term created successfully.', 'success');
              render();
            }
          });
        }
      });
    }

    // Term Upgrade to v2 listener
    document.querySelectorAll('.exam-upgrade-term-btn').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var tId = this.getAttribute('data-id');
        var term = SchoolApp.store.examTerms && SchoolApp.store.examTerms[tId];
        if (!term) return;
        if (ExamCalculationEngine.hasAnyMarksForTerm(tId)) {
          SchoolApp.showToast('Cannot upgrade term: marks entries already exist.', 'error');
          return;
        }
        if (!confirm('Upgrade examination term "' + term.name + '" to Calculation Rules v2?\n\nThis enables strict pass/fail criteria, unrounded percentages, and modern report cards. This action cannot be undone.')) {
          return;
        }
        term.rulesVersion = 'v2';
        var ok = await SchoolApp.save(true);
        if (ok) {
          SchoolApp.showToast('Term upgraded to Rules v2 successfully!', 'success');
          render();
        } else {
          SchoolApp.showToast('Failed to save term upgrade.', 'error');
        }
      });
    });

    // Term Unlock listener (A7)
    document.querySelectorAll('.exam-unlock-term-btn').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var tId = this.getAttribute('data-id');
        var term = SchoolApp.store.examTerms && SchoolApp.store.examTerms[tId];
        if (!term) return;
        if (!confirm('Unlock examination term "' + term.name + '"?\n\nThis will reopen marks entry and allow modifications. (Client-side enforcement).')) {
          return;
        }
        term.status = 'marks_entry';
        var ok = await SchoolApp.save(true);
        if (ok) {
          SchoolApp.showToast('Term unlocked successfully!', 'success');
          render();
        } else {
          SchoolApp.showToast('Failed to unlock term.', 'error');
        }
      });
    });

    // Edit Term
    document.querySelectorAll('.exam-edit-term-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var term = SchoolApp.store.examTerms[id];
        if (!term) return;

        // Check if marks exist
        var marksExist = false;
        if (SchoolApp.store.examMarks && SchoolApp.store.examMarks[id]) {
          marksExist = true;
        }

        var bodyHTML = '';
        if (marksExist) {
          bodyHTML += '<div class="alert alert-warning mb-3" style="font-size:12px; padding:10px;"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;">warning</span> This term has marks entered. Changing dates will not affect existing marks data.</div>';
        }

        bodyHTML += '<div class="form-group mb-3"><label class="form-label">Term Name *</label>';
        bodyHTML += '  <input type="text" id="admin-examterm-name" class="form-input" value="' + escapeAttr(term.name) + '">';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-group mb-3"><label class="form-label">Short Code *</label>';
        bodyHTML += '  <input type="text" id="admin-examterm-short" class="form-input" value="' + escapeAttr(term.shortName) + '" maxlength="5">';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-group mb-3"><label class="form-label">Exam Type *</label>';
        bodyHTML += '  <select id="admin-examterm-type" class="form-input">';
        bodyHTML += '    <option value="main"' + (term.examType !== 'unit_test' ? ' selected' : '') + '>Main Examination</option>';
        bodyHTML += '    <option value="unit_test"' + (term.examType === 'unit_test' ? ' selected' : '') + '>Periodic / Unit Test</option>';
        bodyHTML += '  </select>';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-grid mb-3" style="grid-template-columns: 1fr 1fr; gap:16px;">';
        bodyHTML += '  <div class="form-group"><label class="form-label">Start Date *</label><input type="date" id="admin-examterm-start" class="form-input" value="' + term.startDate + '"></div>';
        bodyHTML += '  <div class="form-group"><label class="form-label">End Date *</label><input type="date" id="admin-examterm-end" class="form-input" value="' + term.endDate + '"></div>';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-group mb-3"><label class="form-label">Weightage % *</label>';
        bodyHTML += '  <input type="number" id="admin-examterm-weight" class="form-input" value="' + term.weightage + '" min="0" max="100">';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-group mb-3">';
        bodyHTML += '  <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13px;">';
        bodyHTML += '    <input type="checkbox" id="exam-term-is-final"' + (term.isFinal ? ' checked' : '') + '> Final / Annual Examination (Enables Promotion Status on Report Cards)';
        bodyHTML += '  </label>';
        bodyHTML += '</div>';

        var footerHTML = '<button class="btn btn-secondary modal-close-btn">Cancel</button>';
        footerHTML += '<button class="btn btn-primary" id="admin-update-examterm-btn">Save Changes</button>';

        SchoolApp.showModal('Edit Exam Term', bodyHTML, footerHTML);

        var updateBtn = document.getElementById('admin-update-examterm-btn');
        if (updateBtn) {
          updateBtn.addEventListener('click', async function() {
            var name = document.getElementById('admin-examterm-name').value.trim();
            var short = document.getElementById('admin-examterm-short').value.trim();
            var start = document.getElementById('admin-examterm-start').value;
            var end = document.getElementById('admin-examterm-end').value;
            var weight = parseInt(document.getElementById('admin-examterm-weight').value) || 50;

            if (!name || !short || !start || !end) {
              SchoolApp.showToast('Please enter all required fields.', 'error');
              return;
            }

            var isFinal = !!(document.getElementById('exam-term-is-final') && document.getElementById('exam-term-is-final').checked);
            term.name = name;
            term.shortName = short;
            term.startDate = start;
            term.endDate = end;
            term.weightage = weight;
            term.examType = (document.getElementById('admin-examterm-type') && document.getElementById('admin-examterm-type').value) || 'main';
            term.isFinal = isFinal;

            var success = await SchoolApp.save();
            if (success) {
              SchoolApp.closeModal();
              SchoolApp.showToast('Exam term updated successfully.', 'success');
              render();
            }
          });
        }
      });
    });

    // Delete Term
    document.querySelectorAll('.exam-delete-term-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var term = SchoolApp.store.examTerms[id];
        if (!term) return;

        // Calculate student marks count affected
        var affectedCount = 0;
        if (SchoolApp.store.examMarks && SchoolApp.store.examMarks[id]) {
          Object.keys(SchoolApp.store.examMarks[id]).forEach(function(cId) {
            Object.keys(SchoolApp.store.examMarks[id][cId]).forEach(function(secId) {
              affectedCount += Object.keys(SchoolApp.store.examMarks[id][cId][secId]).length;
            });
          });
        }

        var bodyHTML = '<div class="form-group mb-3" style="color:var(--danger); font-size:13px; line-height:1.6;">';
        bodyHTML += '  <strong>⚠️ WARNING: Deleting "' + escapeHTML(term.name) + '" is permanent!</strong><br>';
        bodyHTML += '  This action will permanently delete:<br>';
        bodyHTML += '  - All subject configurations for this term<br>';
        bodyHTML += '  - All marks logs (' + affectedCount + ' student records affected)<br>';
        bodyHTML += '  - All associated report cards';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-group"><label class="form-label">Type "DELETE" to confirm:</label>';
        bodyHTML += '  <input type="text" id="delete-term-confirm-input" class="form-input" style="border-color:var(--danger);" placeholder="DELETE">';
        bodyHTML += '</div>';

        var footerHTML = '<button class="btn btn-secondary modal-close-btn">Cancel</button>';
        bodyHTML += '<button class="btn btn-danger" id="delete-term-perm-btn" disabled>Delete Permanently</button>';

        SchoolApp.showModal('Delete Exam Term?', bodyHTML, footerHTML);

        var confirmInput = document.getElementById('delete-term-confirm-input');
        var permBtn = document.getElementById('delete-term-perm-btn');

        if (confirmInput && permBtn) {
          confirmInput.addEventListener('input', function() {
            permBtn.disabled = this.value !== 'DELETE';
          });

          permBtn.addEventListener('click', async function() {
            delete SchoolApp.store.examTerms[id];
            
            // Purge subjects
            if (SchoolApp.store.examSubjects) {
              delete SchoolApp.store.examSubjects[id];
            }
            // Purge marks
            if (typeof SchoolApp.deleteExamMarksTerm === 'function') {
              await SchoolApp.deleteExamMarksTerm(id);
            } else if (SchoolApp.store.examMarks) {
              delete SchoolApp.store.examMarks[id];
            }

            var success = await SchoolApp.save();
            if (success) {
              SchoolApp.closeModal();
              SchoolApp.showToast('Exam term deleted permanently.', 'warning');
              render();
            }
          });
        }
      });
    });

    // Setup Wizard Wizard step controls
    var wizardBtn = document.getElementById('exam-wizard-btn');
    if (wizardBtn) {
      wizardBtn.addEventListener('click', function() {
        state.wizardStep = 1;
        openSetupWizard();
      });
    }

    // Manual Add Subject
    var addSubjectBtn = document.getElementById('exam-add-subject-btn');
    if (addSubjectBtn) {
      addSubjectBtn.addEventListener('click', function() {
        var bodyHTML = '<div class="form-group mb-3"><label class="form-label">Subject Name *</label>';
        bodyHTML += '  <input type="text" id="admin-sub-name" class="form-input" placeholder="e.g. Mathematics">';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-group mb-3"><label class="form-label">Subject Code</label>';
        bodyHTML += '  <input type="text" id="admin-sub-code" class="form-input" placeholder="e.g. MATH">';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-group mb-3"><label class="form-label">Subject Type *</label>';
        bodyHTML += '  <select id="admin-sub-type" class="form-select">';
        bodyHTML += '    <option value="Theory">Theory</option>';
        bodyHTML += '    <option value="Practical">Practical</option>';
        bodyHTML += '    <option value="Internal">Internal</option>';
        bodyHTML += '    <option value="Language">Language</option>';
        bodyHTML += '  </select>';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-grid mb-3" style="grid-template-columns: 1fr 1fr; gap:16px;">';
        bodyHTML += '  <div class="form-group"><label class="form-label">Full Marks *</label><input type="number" id="admin-sub-full" class="form-input" value="100"></div>';
        bodyHTML += '  <div class="form-group"><label class="form-label">Pass Marks *</label><input type="number" id="admin-sub-pass" class="form-input" value="33"></div>';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-grid" style="grid-template-columns: 1fr 1fr; gap:16px;">';
        bodyHTML += '  <div class="form-group"><label class="form-label">Has Exam</label>';
        bodyHTML += '    <select id="admin-sub-hasexam" class="form-select"><option value="true">Yes</option><option value="false">No</option></select>';
        bodyHTML += '  </div>';
        bodyHTML += '  <div class="form-group"><label class="form-label">Is Optional</label>';
        bodyHTML += '    <select id="admin-sub-optional" class="form-select"><option value="false">No</option><option value="true">Yes</option></select>';
        bodyHTML += '  </div>';
        bodyHTML += '</div>';

        var footerHTML = '<button class="btn btn-secondary modal-close-btn">Cancel</button>';
        footerHTML += '<button class="btn btn-primary" id="admin-save-subject-btn">Add Subject</button>';

        SchoolApp.showModal('Add Subject Mapping', bodyHTML, footerHTML);

        // Auto pass marks check
        var fullInp = document.getElementById('admin-sub-full');
        var passInp = document.getElementById('admin-sub-pass');
        if (fullInp && passInp) {
          fullInp.addEventListener('input', function() {
            var full = parseFloat(this.value) || 0;
            passInp.value = Math.round(full * 0.33);
          });
        }

        var saveBtn = document.getElementById('admin-save-subject-btn');
        if (saveBtn) {
          saveBtn.addEventListener('click', async function() {
            var name = document.getElementById('admin-sub-name').value.trim();
            var code = document.getElementById('admin-sub-code').value.trim() || name.substring(0, 4).toUpperCase();
            var type = document.getElementById('admin-sub-type').value;
            var full = parseInt(document.getElementById('admin-sub-full').value) || 100;
            var pass = parseInt(document.getElementById('admin-sub-pass').value) || 33;
            var hasExam = document.getElementById('admin-sub-hasexam').value === 'true';
            var optional = document.getElementById('admin-sub-optional').value === 'true';

            if (!name) {
              SchoolApp.showToast('Please enter subject name.', 'error');
              return;
            }

            if (!SchoolApp.store.examSubjects) SchoolApp.store.examSubjects = {};
            if (!SchoolApp.store.examSubjects[state.examTerm]) SchoolApp.store.examSubjects[state.examTerm] = {};
            if (!SchoolApp.store.examSubjects[state.examTerm][state.classVal]) {
              SchoolApp.store.examSubjects[state.examTerm][state.classVal] = { subjects: [] };
            }

            var list = SchoolApp.store.examSubjects[state.examTerm][state.classVal].subjects;
            var subId = 'subj_' + Date.now().toString(36);
            list.push({
              id: subId,
              name: name,
              code: code,
              type: type,
              fullMarks: full,
              passMarks: pass,
              hasExam: hasExam,
              isOptional: optional,
              order: list.length + 1
            });

            var success = await SchoolApp.save();
            if (success) {
              SchoolApp.closeModal();
              SchoolApp.showToast('Subject mapped successfully.', 'success');
              render();
            }
          });
        }
      });
    }

    // Edit Subject
    document.querySelectorAll('.exam-edit-subject-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var subId = this.getAttribute('data-id');
        var subjectsList = SchoolApp.store.examSubjects[state.examTerm][state.classVal].subjects;
        var sub = subjectsList.find(function(x) { return x.id === subId; });
        if (!sub) return;

        var bodyHTML = '<div class="form-group mb-3"><label class="form-label">Subject Name *</label>';
        bodyHTML += '  <input type="text" id="admin-sub-name" class="form-input" value="' + escapeAttr(sub.name) + '">';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-group mb-3"><label class="form-label">Subject Code</label>';
        bodyHTML += '  <input type="text" id="admin-sub-code" class="form-input" value="' + escapeAttr(sub.code || '') + '">';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-group mb-3"><label class="form-label">Subject Type *</label>';
        bodyHTML += '  <select id="admin-sub-type" class="form-select">';
        bodyHTML += '    <option value="Theory" ' + (sub.type === 'Theory' ? 'selected' : '') + '>Theory</option>';
        bodyHTML += '    <option value="Practical" ' + (sub.type === 'Practical' ? 'selected' : '') + '>Practical</option>';
        bodyHTML += '    <option value="Internal" ' + (sub.type === 'Internal' ? 'selected' : '') + '>Internal</option>';
        bodyHTML += '    <option value="Language" ' + (sub.type === 'Language' ? 'selected' : '') + '>Language</option>';
        bodyHTML += '  </select>';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-grid mb-3" style="grid-template-columns: 1fr 1fr; gap:16px;">';
        bodyHTML += '  <div class="form-group"><label class="form-label">Full Marks *</label><input type="number" id="admin-sub-full" class="form-input" value="' + sub.fullMarks + '"></div>';
        bodyHTML += '  <div class="form-group"><label class="form-label">Pass Marks *</label><input type="number" id="admin-sub-pass" class="form-input" value="' + sub.passMarks + '"></div>';
        bodyHTML += '</div>';
        bodyHTML += '<div class="form-grid" style="grid-template-columns: 1fr 1fr; gap:16px;">';
        bodyHTML += '  <div class="form-group"><label class="form-label">Has Exam</label>';
        bodyHTML += '    <select id="admin-sub-hasexam" class="form-select"><option value="true" ' + (sub.hasExam ? 'selected' : '') + '>Yes</option><option value="false" ' + (!sub.hasExam ? 'selected' : '') + '>No</option></select>';
        bodyHTML += '  </div>';
        bodyHTML += '  <div class="form-group"><label class="form-label">Is Optional</label>';
        bodyHTML += '    <select id="admin-sub-optional" class="form-select"><option value="false" ' + (!sub.isOptional ? 'selected' : '') + '>No</option><option value="true" ' + (sub.isOptional ? 'selected' : '') + '>Yes</option></select>';
        bodyHTML += '  </div>';
        bodyHTML += '</div>';

        var footerHTML = '<button class="btn btn-secondary modal-close-btn">Cancel</button>';
        footerHTML += '<button class="btn btn-primary" id="admin-update-subject-btn">Save Changes</button>';

        SchoolApp.showModal('Edit Subject Mapping', bodyHTML, footerHTML);

        // Auto pass marks check
        var fullInp = document.getElementById('admin-sub-full');
        var passInp = document.getElementById('admin-sub-pass');
        if (fullInp && passInp) {
          fullInp.addEventListener('input', function() {
            var full = parseFloat(this.value) || 0;
            passInp.value = Math.round(full * 0.33);
          });
        }

        var updateBtn = document.getElementById('admin-update-subject-btn');
        if (updateBtn) {
          updateBtn.addEventListener('click', async function() {
            var name = document.getElementById('admin-sub-name').value.trim();
            var code = document.getElementById('admin-sub-code').value.trim() || name.substring(0, 4).toUpperCase();
            var type = document.getElementById('admin-sub-type').value;
            var full = parseInt(document.getElementById('admin-sub-full').value) || 100;
            var pass = parseInt(document.getElementById('admin-sub-pass').value) || 33;
            var hasExam = document.getElementById('admin-sub-hasexam').value === 'true';
            var optional = document.getElementById('admin-sub-optional').value === 'true';

            if (!name) {
              SchoolApp.showToast('Please enter subject name.', 'error');
              return;
            }

            sub.name = name;
            sub.code = code;
            sub.type = type;
            sub.fullMarks = full;
            sub.passMarks = pass;
            sub.hasExam = hasExam;
            sub.isOptional = optional;

            var success = await SchoolApp.save();
            if (success) {
              SchoolApp.closeModal();
              SchoolApp.showToast('Subject updated successfully.', 'success');
              render();
            }
          });
        }
      });
    });

    // Delete Subject Mapping
    document.querySelectorAll('.exam-delete-subject-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var subId = this.getAttribute('data-id');
        var subjectsList = SchoolApp.store.examSubjects[state.examTerm][state.classVal].subjects;
        var subIdx = subjectsList.findIndex(function(x) { return x.id === subId; });
        if (subIdx === -1) return;
        var sub = subjectsList[subIdx];

        // Check if marks exist for this subject
        var affectedCount = 0;
        var classMarks = (SchoolApp.store.examMarks && SchoolApp.store.examMarks[state.examTerm] && SchoolApp.store.examMarks[state.examTerm][state.classVal]) || {};
        Object.keys(classMarks).forEach(function(secId) {
          Object.keys(classMarks[secId]).forEach(function(sId) {
            var sm = classMarks[secId][sId];
            if (sm && sm.marks && sm.marks[subId]) {
              affectedCount++;
            }
          });
        });

        var message = 'Are you sure you want to remove subject "' + sub.name + '" from mappings?';
        if (affectedCount > 0) {
          message += ' ⚠️ Warning: ' + affectedCount + ' student(s) have marks entered for this subject. All marks for this subject will be permanently deleted.';
        }

        SchoolApp.showConfirm(message, async function() {
          subjectsList.splice(subIdx, 1);
          
          // Purge marks inside student mappings
          Object.keys(classMarks).forEach(function(secId) {
            Object.keys(classMarks[secId]).forEach(function(sId) {
              var sm = classMarks[secId][sId];
              if (sm && sm.marks && sm.marks[subId]) {
                delete sm.marks[subId];
              }
            });
          });

          var success = await SchoolApp.save();
          if (success) {
            SchoolApp.showToast('Subject removed and related marks purged.', 'warning');
            render();
          }
        }, 'Delete Subject?');
      });
    });

    // Marks Matrix Inputs (AB/EX buttons, numeric keydowns, auto-saves)
    document.querySelectorAll('.mark-entry-score-input').forEach(function(input) {
      var studentId = input.getAttribute('data-student-id');
      
      input.addEventListener('input', function() {
        // Immediate validation visuals
        var val = this.value.trim();
        var full = parseFloat(this.getAttribute('data-full'));
        var pass = parseFloat(this.getAttribute('data-pass'));
        
        if (val === '') {
          this.style = 'width: 80px; text-align: center; font-weight:bold;';
        } else {
          var num = parseFloat(val);
          if (isNaN(num) || num < 0 || num > full || val.indexOf('.') !== -1) {
            this.style = 'width: 80px; text-align: center; font-weight:bold; background:#fee2e2; border-color:#f87171; color:#991b1b;';
          } else if (num < pass) {
            this.style = 'width: 80px; text-align: center; font-weight:bold; background:#fee2e2; border-color:#f87171; color:#991b1b;';
          } else {
            this.style = 'width: 80px; text-align: center; font-weight:bold;';
          }
        }
      });

      input.addEventListener('blur', function() {
        var val = this.value.trim();
        var full = parseFloat(this.getAttribute('data-full'));
        if (val !== '') {
          var num = parseFloat(val);
          if (isNaN(num) || num < 0 || num > full || val.indexOf('.') !== -1) {
            SchoolApp.showToast('Invalid score entered. Must be a whole number between 0 and ' + full, 'error');
            this.value = '';
            this.style = 'width: 80px; text-align: center; font-weight:bold;';
            return;
          }
        }
        autoSaveMark(studentId, state.subjectVal, val, false, false);
      });

      // Arrow navigation
      input.addEventListener('keydown', function(e) {
        var key = e.key;
        if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'Enter') {
          e.preventDefault();
          var inputs = Array.from(document.querySelectorAll('.mark-entry-score-input'));
          var idx = inputs.indexOf(this);
          if (idx !== -1) {
            var nextIdx = key === 'ArrowUp' ? idx - 1 : idx + 1;
            if (nextIdx >= 0 && nextIdx < inputs.length) {
              inputs[nextIdx].focus();
              inputs[nextIdx].select();
            }
          }
        }
      });
    });

    document.querySelectorAll('.mark-entry-ab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var studentId = this.getAttribute('data-student-id');
        var wasAB = this.classList.contains('btn-danger');
        autoSaveMark(studentId, state.subjectVal, '', !wasAB, false);
      });
    });

    document.querySelectorAll('.mark-entry-ex-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var studentId = this.getAttribute('data-student-id');
        var wasEX = this.classList.contains('btn-primary');
        autoSaveMark(studentId, state.subjectVal, '', false, !wasEX);
      });
    });

    // Expand details row in results matrix
    document.querySelectorAll('.result-expandable-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var sId = this.getAttribute('data-student-id');
        var detailsRow = document.getElementById('breakdown-' + sId);
        if (detailsRow) {
          detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
        }
      });
    });

    // View Incomplete List click handler
    var viewIncompleteBtn = document.getElementById('view-incomplete-btn');
    if (viewIncompleteBtn) {
      viewIncompleteBtn.addEventListener('click', function() {
        var subjectsList = (SchoolApp.store.examSubjects && SchoolApp.store.examSubjects[state.examTerm] && SchoolApp.store.examSubjects[state.examTerm][state.classVal] && SchoolApp.store.examSubjects[state.examTerm][state.classVal].subjects) || [];
        var students = (SchoolApp.store.students || []).filter(function(s) {
          return String(s.class).toLowerCase().trim() === String(state.classVal).toLowerCase().trim() &&
                 String(s.section).toLowerCase().trim() === String(state.sectionVal).toLowerCase().trim() &&
                 s.status === 'Active';
        });

        var bodyHTML = '<p style="font-size:13px; margin-bottom:15px; color:var(--text-secondary);">The following students are missing scores in the listed subjects. Click any link to navigate directly to the entry matrix for that subject.</p>';
        bodyHTML += '<div class="table-container"><table class="data-table"><thead><tr><th>Student Name</th><th>Missing Subjects</th></tr></thead><tbody>';

        var count = 0;
        students.forEach(function(s) {
          var check = getStudentMarksStatus(s.id, state.examTerm, subjectsList);
          if (check.status !== 'complete') {
            count++;
            
            // Find which subjects are missing
            var missingList = [];
            var savedMarks = getStudentExamMarks(s.id, state.examTerm);
            subjectsList.forEach(function(sub) {
              var hasVal = false;
              if (savedMarks && savedMarks.marks && savedMarks.marks[sub.id]) {
                var score = savedMarks.marks[sub.id];
                if (score.isAbsent || score.isExempted || (score.obtained !== undefined && score.obtained !== null && String(score.obtained).trim() !== '')) {
                  hasVal = true;
                }
              }
              if (!hasVal) {
                missingList.push('<a href="#" class="quick-link-subject" data-sub-id="' + sub.id + '" style="color:var(--accent-primary); font-weight:600; text-decoration:underline; margin-right:8px;">' + escapeHTML(sub.name) + '</a>');
              }
            });

            bodyHTML += '<tr>';
            bodyHTML += '<td><strong>' + escapeHTML(SchoolApp.getStudentFullName(s)) + '</strong></td>';
            bodyHTML += '<td>' + (missingList.length > 0 ? missingList.join(', ') : 'All mapped subjects') + '</td>';
            bodyHTML += '</tr>';
          }
        });

        if (count === 0) {
          bodyHTML += '<tr><td colspan="2" class="center text-muted">All student scores are complete!</td></tr>';
        }

        bodyHTML += '</tbody></table></div>';
        var footerHTML = '<button class="btn btn-secondary modal-close-btn">Close</button>';

        SchoolApp.showModal('Missing Subject Scores List', bodyHTML, footerHTML);

        // Bind quick links inside modal
        document.querySelectorAll('.quick-link-subject').forEach(function(link) {
          link.addEventListener('click', function(e) {
            e.preventDefault();
            var subId = this.getAttribute('data-sub-id');
            state.subjectVal = subId;
            state.activeSubTab = 'marks_entry';
            SchoolApp.closeModal();
            render();
          });
        });
      });
    }

    // Toggle Single vs Combined Mode inside report card tab
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

    // Combined checkbox and weightage listeners
    document.querySelectorAll('.combined-term-checkbox').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var tId = this.value;
        if (this.checked) {
          if (state.combinedTerms.indexOf(tId) === -1) {
            state.combinedTerms.push(tId);
          }
        } else {
          var idx = state.combinedTerms.indexOf(tId);
          if (idx !== -1) {
            state.combinedTerms.splice(idx, 1);
          }
        }
        render();
      });
    });

    document.querySelectorAll('.combined-term-weight').forEach(function(inp) {
      inp.addEventListener('blur', function() {
        var tId = this.getAttribute('data-id');
        var wt = parseInt(this.value) || 50;
        state.combinedWeightages[tId] = wt;
      });
    });

    // FIX 3: Save All Marks button — sequential save with delay to avoid rate limits
    var saveMarksBtn = document.getElementById('save-marks-btn');
    if (saveMarksBtn) {
      saveMarksBtn.addEventListener('click', async function() {
        saveMarksBtn.disabled = true;
        saveMarksBtn.textContent = 'Saving\u2026';
        var statusEl = document.getElementById('save-status');

        // Cancel all pending debounce timers
        Object.keys(saveDebounceTimers).forEach(function(key) {
          clearTimeout(saveDebounceTimers[key]);
          delete saveDebounceTimers[key];
        });

        // Collect all unique student entries to save for this term/class/section
        var termId = state.examTerm;
        var classId = state.classVal;
        var sectionId = state.sectionVal;
        var examSubjectsForTerm = (SchoolApp.store.examSubjects && SchoolApp.store.examSubjects[termId]) || {};
        if (!examSubjectsForTerm[classId] && examSubjectsForTerm[state.classVal]) classId = state.classVal;

        var sectionMarks = SchoolApp.store.examMarks &&
          SchoolApp.store.examMarks[termId] &&
          SchoolApp.store.examMarks[termId][classId] &&
          SchoolApp.store.examMarks[termId][classId][sectionId];

        var studentIds = sectionMarks ? Object.keys(sectionMarks) : [];
        var saved = 0;

        for (var i = 0; i < studentIds.length; i++) {
          var sid = studentIds[i];
          var entry = sectionMarks[sid];
          if (!entry) continue;

          if (statusEl) {
            statusEl.textContent = 'Saving ' + (i + 1) + '/' + studentIds.length + '\u2026';
            statusEl.style.color = '#92400E';
          }

          var saveOk = false;
          if (typeof SchoolApp.saveMarks === 'function') {
            saveOk = await SchoolApp.saveMarks(termId, classId, sectionId, sid, entry);
          } else {
            saveOk = await SchoolApp.save(true);
          }
          if (saveOk) saved++;

          // 150ms gap between writes to avoid Firestore rate limits
          await new Promise(function(resolve) { setTimeout(resolve, 150); });
        }

        if (statusEl) {
          statusEl.textContent = 'Saved ' + saved + '/' + studentIds.length + ' \u2713 ' + new Date().toLocaleTimeString();
          statusEl.style.color = saved === studentIds.length ? '#16A34A' : '#DC2626';
        }

        saveMarksBtn.disabled = false;
        saveMarksBtn.innerHTML = '&#128190; Save All Marks';
        render();
      });
    }

    // Bulk Report Card clicks
    var bulkBtnHeader = document.getElementById('exam-bulk-reportcard-btn');
    if (bulkBtnHeader) {
      bulkBtnHeader.addEventListener('click', function() {
        printBulkReportCards();
      });
    }
    var bulkBtnLower = document.getElementById('exam-bulk-reportcard-btn-lower');
    if (bulkBtnLower) {
      bulkBtnLower.addEventListener('click', function() {
        printBulkReportCards();
      });
    }
    var incToggle = document.getElementById('exam-include-inactive-toggle');
    if (incToggle) {
      incToggle.addEventListener('change', function() {
        state.includeInactiveLeft = this.checked;
        render();
      });
    }

    // Delegated click listener — attached ONCE only (document level persists across renders)
    if (!examEventsAttached) {
      examEventsAttached = true;
      document.addEventListener('click', function(e) {
        var modalClose = e.target.closest('.modal-close-btn');
        if (modalClose) {
          if (window.SchoolApp && typeof window.SchoolApp.closeModal === 'function') {
            window.SchoolApp.closeModal();
          }
          return;
        }

        var btn = e.target.closest('.rc-btn, .generate-reportcard-btn');
        if (btn) {
          e.stopPropagation();
          var sid = btn.getAttribute('data-student-id') || btn.dataset.studentId;
          var tid = btn.getAttribute('data-term-id') || btn.dataset.termId || state.examTerm;
          if (sid) {
            printStudentMarksheet(sid, tid);
          }
          return;
        }

        var bulkBtn = e.target.closest('.rc-bulk-btn');
        if (bulkBtn) {
          e.stopPropagation();
          printBulkReportCards();
          return;
        }
      });
    }
  }

  // -------------------- OPTIMISTIC MARKS AUTO-SAVE --------------------

  async function autoSaveMark(studentId, subjectId, val, isAB, isEX) {
    var student = (SchoolApp.store.students || []).find(function(x) { return x.id === studentId; });
    if (!student) return;

    var termId = state.examTerm;
    var frozenTerm = SchoolApp.store.examTerms && SchoolApp.store.examTerms[termId];
    if (frozenTerm && (frozenTerm.status === 'locked' || frozenTerm.status === 'published')) {
      console.warn('[autoSaveMark] Frozen: Term is ' + frozenTerm.status + '. Writes blocked.');
      return;
    }
    // BUG 1 FIX: Normalize classId so Nursery/LKG/UKG always match examSubjects keys.
    // Try student.class first, then state.classVal as fallback.
    var classId = student.class;
    var sectionId = student.section;

    // Verify classId matches examSubjects key — if not, try state.classVal
    var examSubjectsForTerm = (SchoolApp.store.examSubjects && SchoolApp.store.examSubjects[termId]) || {};
    if (!examSubjectsForTerm[classId] && examSubjectsForTerm[state.classVal]) {
      classId = state.classVal;
    }

    console.log('[autoSaveMark] Saving:', { termId: termId, classId: classId, sectionId: sectionId, studentId: studentId, subjectId: subjectId, val: val, isAB: isAB, isEX: isEX });

    if (!SchoolApp.store.examMarks) SchoolApp.store.examMarks = {};
    if (!SchoolApp.store.examMarks[termId]) SchoolApp.store.examMarks[termId] = {};
    if (!SchoolApp.store.examMarks[termId][classId]) SchoolApp.store.examMarks[termId][classId] = {};
    if (!SchoolApp.store.examMarks[termId][classId][sectionId]) SchoolApp.store.examMarks[termId][classId][sectionId] = {};
    if (!SchoolApp.store.examMarks[termId][classId][sectionId][studentId]) {
      SchoolApp.store.examMarks[termId][classId][sectionId][studentId] = {
        marks: {},
        total: 0,
        maxTotal: 0,
        percentage: 0,
        grade: 'F',
        gradeLabel: 'Fail',
        rank: 0,
        result: 'Pass',
        attendancePercent: 96,
        isComplete: false,
        lastUpdated: new Date().toISOString()
      };
    }

    var entry = SchoolApp.store.examMarks[termId][classId][sectionId][studentId];
    if (!entry.marks) entry.marks = {};

    var subjects = ensureSubjectsArray(
      (SchoolApp.store.examSubjects &&
       SchoolApp.store.examSubjects[termId] &&
       SchoolApp.store.examSubjects[termId][classId] &&
       SchoolApp.store.examSubjects[termId][classId].subjects) || []
    );
    var activeSub = subjects.find(function(s) { return s.id === subjectId; });
    if (!activeSub) {
      console.warn('[autoSaveMark] Subject not found:', subjectId, 'in classId:', classId, 'examSubjects keys:', Object.keys(examSubjectsForTerm));
      return;
    }

    // Build the score log entry — no undefined values (Firestore rejects them)
    var currentScore = entry.marks[subjectId] || {};
    var oldVal = currentScore.obtained;
    var currentUser = SchoolApp.currentUser || {};
    var userName = currentUser.username || currentUser.name || currentUser.email || currentUser.displayName || 'teacher';

    var scoreObj = {
      obtained: (val === '' || val === null || val === undefined) ? 0 : parseFloat(val),
      fullMarks: activeSub.fullMarks || 100,
      passMarks: activeSub.passMarks || 33,
      isAbsent: isAB === true,
      isExempted: isEX === true,
      enteredBy: userName,
      enteredAt: new Date().toISOString()
    };

    if (currentUser.role === 'admin') {
      scoreObj.editedBy = userName;
      scoreObj.editedAt = new Date().toISOString();
      // If admin edited, append log to audit trail
      if (oldVal !== scoreObj.obtained) {
        if (!SchoolApp.store.examAuditLog) SchoolApp.store.examAuditLog = [];
        SchoolApp.store.examAuditLog.push({
          id: 'log_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4),
          termId: termId,
          classId: classId,
          sectionId: sectionId,
          studentId: studentId,
          subjectId: subjectId,
          action: 'marks_edited',
          oldValue: oldVal !== undefined ? oldVal : 'none',
          newValue: scoreObj.obtained,
          changedBy: userName,
          changedAt: new Date().toISOString(),
          reason: 'Admin Override'
        });
      }
    }

    // Clean before storing — no undefined/null values allowed in Firestore
    entry.marks[subjectId] = cleanForFirestore(scoreObj);

    // Calculate aggregated metrics
    var subjectsArr = ensureSubjectsArray(
      (SchoolApp.store.examSubjects &&
       SchoolApp.store.examSubjects[termId] &&
       SchoolApp.store.examSubjects[termId][classId] &&
       SchoolApp.store.examSubjects[termId][classId].subjects) || []
    );

    var term = SchoolApp.store.examTerms && SchoolApp.store.examTerms[termId];
    var isV2 = term && term.rulesVersion === 'v2';

    if (isV2) {
      var cfg = (SchoolApp.store && SchoolApp.store.reportCardConfig) || {};
      ExamCalculationEngine.autoSaveRecalculateV2(entry, subjectsArr, term, cfg);
    } else {
    var totalObtained = 0;
    var maxTotal = 0;
    var passedAll = true;
    var anyExempted = false;
    var allAB = true;
    var enteredCount = 0;

    subjectsArr.forEach(function(sub) {
      var sc = entry.marks[sub.id];
      if (sc) {
        if (sc.isAbsent || sc.isExempted || (sc.obtained !== undefined && sc.obtained !== null && String(sc.obtained).trim() !== '')) {
          enteredCount++;
        }
        
        if (sc.isExempted) {
          anyExempted = true;
        } else if (sc.isAbsent) {
          maxTotal += sub.fullMarks;
          passedAll = false;
        } else {
          allAB = false;
          totalObtained += parseFloat(sc.obtained) || 0;
          maxTotal += sub.fullMarks;
          if (parseFloat(sc.obtained) < sub.passMarks) {
            passedAll = false;
          }
        }
      }
    });

    entry.total = totalObtained;
    entry.maxTotal = maxTotal;
    entry.percentage = maxTotal > 0 ? Math.round((totalObtained / maxTotal) * 100) : 0;
    
    var gradeObj = calculateGrade(entry.percentage);
    entry.grade = gradeObj.grade;
    entry.gradeLabel = gradeObj.label;

    if (allAB && enteredCount === subjects.length) {
      entry.result = 'Absent';
    } else {
      entry.result = passedAll ? 'Pass' : 'Fail';
    }

    entry.isComplete = enteredCount === subjects.length;
    entry.lastUpdated = new Date().toISOString();
    }

    // Update save status immediately (UI feedback before actual write)
    var saveStatusEl = document.getElementById('save-status');
    if (saveStatusEl) {
      saveStatusEl.textContent = 'Pending save\u2026';
      saveStatusEl.style.color = '#92400E';
    }

    // Capture the entry snapshot for the debounced save closure
    var markEntry = SchoolApp.store.examMarks[termId][classId][sectionId][studentId];
    var debounceKey = termId + '_' + classId + '_' + studentId + '_' + subjectId;

    // FIX 1: Debounced save — waits 800ms after last input before writing to Firestore
    debouncedSave(debounceKey, async function() {
      var freshEntry = SchoolApp.store.examMarks[termId] &&
        SchoolApp.store.examMarks[termId][classId] &&
        SchoolApp.store.examMarks[termId][classId][sectionId] &&
        SchoolApp.store.examMarks[termId][classId][sectionId][studentId];
      if (!freshEntry) return;

      // Strip undefined/null before Firestore write
      var cleanEntry = cleanForFirestore(freshEntry);
      if (!cleanEntry) return;

      var saveOk = false;
      if (typeof SchoolApp.saveMarks === 'function') {
        saveOk = await SchoolApp.saveMarks(termId, classId, sectionId, studentId, cleanEntry);
      } else {
        saveOk = await SchoolApp.save(true);
      }

      var statusEl = document.getElementById('save-status');
      if (statusEl) {
        statusEl.textContent = saveOk ? ('Saved \u2713 ' + new Date().toLocaleTimeString()) : 'Save failed!';
        statusEl.style.color = saveOk ? '#16A34A' : '#DC2626';
      }

      // Re-render once after save to update status icons and progress bar
      render();

      // Rank recalculation — ensure term marks are fully loaded/merged before ranking
      if (typeof SchoolApp.loadExamMarksTerm === 'function') {
        await SchoolApp.loadExamMarksTerm(termId);
      }
      recalculateRanks(termId, classId, sectionId);
      var updatedEntry = SchoolApp.store.examMarks[termId][classId][sectionId][studentId];
      if (updatedEntry && typeof SchoolApp.saveMarks === 'function') {
        await SchoolApp.saveMarks(termId, classId, sectionId, studentId, updatedEntry);
      }
    }, 800);
  }

  // -------------------- SETUP WIZARD FLOW --------------------

  function openSetupWizard() {
    var bodyHTML = '<div class="exam-wizard-modal">';
    bodyHTML += '<div id="wizard-progress-bar-container" style="margin-bottom:20px; display:flex; justify-content:space-between; font-size:12px; font-weight:700;">';
    bodyHTML += '  <span style="' + (state.wizardStep === 1 ? 'color:var(--accent-primary);' : '') + '">1. Select Terms</span>';
    bodyHTML += '  <span style="' + (state.wizardStep === 2 ? 'color:var(--accent-primary);' : '') + '">2. Auto Subjects</span>';
    bodyHTML += '  <span style="' + (state.wizardStep === 3 ? 'color:var(--accent-primary);' : '') + '">3. Default Marks</span>';
    bodyHTML += '  <span style="' + (state.wizardStep === 4 ? 'color:var(--accent-primary);' : '') + '">4. Review</span>';
    bodyHTML += '</div>';

    bodyHTML += '<div id="wizard-step-content" style="min-height:300px; max-height:480px; overflow-y:auto; padding-right:8px;">';

    if (state.wizardStep === 1) {
      // Step 1: Select Terms
      bodyHTML += '<h4>Choose Terms & Dates</h4>';
      bodyHTML += '<p class="text-muted" style="font-size:12px; margin-top:-8px;">Configure the dates and weightages for each session term.</p>';
      
      state.wizardTerms.forEach(function(term, idx) {
        bodyHTML += '<div class="wizard-term-card" style="border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-bottom:12px; background:var(--bg-secondary);">';
        bodyHTML += '  <label style="display:flex; align-items:center; gap:8px; font-weight:700; cursor:pointer;">';
        bodyHTML += '    <input type="checkbox" class="wizard-term-select" data-idx="' + idx + '" ' + (term.selected ? 'checked' : '') + '> ' + term.name;
        bodyHTML += '  </label>';
        if (term.selected) {
          bodyHTML += '  <div class="form-grid mt-2" style="grid-template-columns: 1fr 1fr; gap:12px;">';
          bodyHTML += '    <div class="form-group"><label class="form-label" style="font-size:11px;">Start Date</label><input type="date" class="form-input wizard-term-start" data-idx="' + idx + '" value="' + term.startDate + '" style="height:28px; padding:4px;"></div>';
          bodyHTML += '    <div class="form-group"><label class="form-label" style="font-size:11px;">End Date</label><input type="date" class="form-input wizard-term-end" data-idx="' + idx + '" value="' + term.endDate + '" style="height:28px; padding:4px;"></div>';
          bodyHTML += '  </div>';
          bodyHTML += '  <div class="form-group mt-2"><label class="form-label" style="font-size:11px;">Weightage %</label><input type="number" class="form-input wizard-term-weight" data-idx="' + idx + '" value="' + term.weightage + '" style="height:28px; padding:4px; max-width:100px;"></div>';
        }
        bodyHTML += '</div>';
      });

    } else if (state.wizardStep === 2) {
      // Step 2: Auto-populate subjects from teacher assignments
      bodyHTML += '<h4>Verify Class Subjects Mappings</h4>';
      bodyHTML += '<p class="text-muted" style="font-size:12px; margin-top:-8px;">We parsed teacher timetables to auto-populate class mappings. Tweak or add subjects below.</p>';

      var classes = (SchoolApp.store.settings && SchoolApp.store.settings.classes) || [];
      
      // Auto-extract logic if wizardSubjects is empty
      if (Object.keys(state.wizardSubjects).length === 0) {
        var autoMap = {};
        (SchoolApp.store.teachers || []).forEach(function(t) {
          if (t.status !== 'Active') return;
          if (t.subjectTeacherOf) {
            t.subjectTeacherOf.forEach(function(mapping) {
              var cId = mapping.class;
              var subName = mapping.subject;
              if (cId && subName) {
                if (!autoMap[cId]) autoMap[cId] = new Set();
                autoMap[cId].add(subName);
              }
            });
          }
        });

        // Map to wizardSubjects state
        classes.forEach(function(c) {
          var set = autoMap[c] || new Set(['Hindi', 'English', 'Mathematics']);
          state.wizardSubjects[c] = Array.from(set).map(function(sName, idx) {
            var type = 'Theory';
            if (sName.toLowerCase().indexOf('art') !== -1 || sName.toLowerCase().indexOf('drawing') !== -1) type = 'Practical';
            var def = state.wizardDefaults[type] || { full: 100, pass: 33 };

            return {
              id: 'subj_' + idx + '_' + Math.random().toString(36).substr(2, 4),
              name: sName,
              code: sName.substring(0, 4).toUpperCase(),
              type: type,
              fullMarks: def.full,
              passMarks: def.pass,
              hasExam: true,
              selected: true
            };
          });
        });
      }

      // Render class mappings in wizard
      classes.forEach(function(cId) {
        var subs = state.wizardSubjects[cId] || [];
        var displayName = ['Nursery','LKG','UKG'].indexOf(cId) !== -1 ? cId : 'Class ' + cId;

        bodyHTML += '<div class="wizard-class-card" style="border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-bottom:12px; background:var(--bg-secondary);">';
        bodyHTML += '  <h5 style="margin:0 0 8px 0; color:var(--accent-primary);">' + displayName + '</h5>';
        
        subs.forEach(function(sub, subIdx) {
          bodyHTML += '  <div style="display:flex; align-items:center; justify-content:between; gap:12px; margin-bottom:8px; font-size:12px; flex-wrap:wrap;">';
          bodyHTML += '    <label style="display:inline-flex; align-items:center; gap:6px; font-weight:600; cursor:pointer; min-width:140px;">';
          bodyHTML += '      <input type="checkbox" class="wizard-sub-select" data-class="' + cId + '" data-sub-idx="' + subIdx + '" ' + (sub.selected ? 'checked' : '') + '> ' + escapeHTML(sub.name);
          bodyHTML += '    </label>';
          if (sub.selected) {
            bodyHTML += '    <select class="form-select wizard-sub-type" data-class="' + cId + '" data-sub-idx="' + subIdx + '" style="width:90px; height:24px; padding:2px; font-size:11px;">';
            bodyHTML += '      <option value="Theory" ' + (sub.type === 'Theory' ? 'selected' : '') + '>Theory</option>';
            bodyHTML += '      <option value="Practical" ' + (sub.type === 'Practical' ? 'selected' : '') + '>Practical</option>';
            bodyHTML += '      <option value="Internal" ' + (sub.type === 'Internal' ? 'selected' : '') + '>Internal</option>';
            bodyHTML += '      <option value="Language" ' + (sub.type === 'Language' ? 'selected' : '') + '>Language</option>';
            bodyHTML += '    </select>';
            bodyHTML += '    <span>Full: <input type="number" class="form-input wizard-sub-full" data-class="' + cId + '" data-sub-idx="' + subIdx + '" value="' + sub.fullMarks + '" style="width:50px; padding:2px; height:22px; text-align:center; font-size:11px;"></span>';
            bodyHTML += '    <span>Pass: <input type="number" class="form-input wizard-sub-pass" data-class="' + cId + '" data-sub-idx="' + subIdx + '" value="' + sub.passMarks + '" style="width:50px; padding:2px; height:22px; text-align:center; font-size:11px;"></span>';
          }
          bodyHTML += '  </div>';
        });

        // Add custom subject trigger inside wizard
        bodyHTML += '  <button class="btn btn-secondary btn-xs wizard-add-sub-trigger" data-class="' + cId + '" style="margin-top:6px;"><span class="material-icons-round" style="font-size:12px;vertical-align:middle;">add</span> Add Custom Subject</button>';
        bodyHTML += '</div>';
      });

    } else if (state.wizardStep === 3) {
      // Step 3: Default Marks Setup
      bodyHTML += '<h4>Default Marks Configs</h4>';
      bodyHTML += '<p class="text-muted" style="font-size:12px; margin-top:-8px;">Specify global default marks for subject types. These can be adjusted per class in Step 2.</p>';
      
      Object.keys(state.wizardDefaults).forEach(function(type) {
        var def = state.wizardDefaults[type];
        bodyHTML += '<div class="form-grid mb-3" style="grid-template-columns: 2fr 1fr 1fr; gap:16px; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:12px;">';
        bodyHTML += '  <strong>' + type + '</strong>';
        bodyHTML += '  <div class="form-group"><label class="form-label" style="font-size:11px;">Full Marks</label><input type="number" class="form-input wizard-default-full" data-type="' + type + '" value="' + def.full + '"></div>';
        bodyHTML += '  <div class="form-group"><label class="form-label" style="font-size:11px;">Pass Marks</label><input type="number" class="form-input wizard-default-pass" data-type="' + type + '" value="' + def.pass + '"></div>';
        bodyHTML += '</div>';
      });

    } else if (state.wizardStep === 4) {
      // Step 4: Review and Confirm
      bodyHTML += '<h4>Review Academic Structure</h4>';
      bodyHTML += '<p class="text-muted" style="font-size:12px; margin-top:-8px;">Review configurations before creating terms and subject structures.</p>';
      
      var selectedTerms = state.wizardTerms.filter(function(t) { return t.selected; });
      bodyHTML += '<div style="margin-bottom:15px;"><strong>Exam Terms (' + selectedTerms.length + ' to be created):</strong>';
      bodyHTML += '  <ul style="margin:5px 0; font-size:12px; line-height:1.5;">';
      selectedTerms.forEach(function(t) {
        bodyHTML += '    <li>' + escapeHTML(t.name) + ' (' + t.startDate + ' to ' + termEndDateStr(t) + ') • Weight: ' + t.weightage + '%</li>';
      });
      bodyHTML += '  </ul>';
      bodyHTML += '</div>';

      var totalClasses = 0;
      var totalSubjectsConfigured = 0;
      Object.keys(state.wizardSubjects).forEach(function(cId) {
        var count = state.wizardSubjects[cId].filter(function(x) { return x.selected; }).length;
        if (count > 0) {
          totalClasses++;
          totalSubjectsConfigured += count;
        }
      });

      bodyHTML += '<div style="background:var(--bg-secondary); border:1px solid var(--border-color); padding:16px; border-radius:8px; margin-bottom:15px;">';
      bodyHTML += '  <h5 style="margin:0 0 6px 0;">Summary Summary</h5>';
      bodyHTML += '  <div style="font-size:13px; line-height:1.5;">';
      bodyHTML += '    <div>Total Mapped Classes: <strong>' + totalClasses + ' classes</strong></div>';
      bodyHTML += '    <div>Total Subject Configurations: <strong>' + totalSubjectsConfigured + ' subjects</strong></div>';
      bodyHTML += '  </div>';
      bodyHTML += '</div>';
      bodyHTML += '<p style="font-size:11px; color:var(--text-muted);">⚠️ Confirmed setup will overwrite and seed subject settings for selected classes. Existing marks in conflicts will be deleted.</p>';
    }

    bodyHTML += '</div>'; // End step content
    bodyHTML += '</div>'; // End exam-wizard-modal

    var footerHTML = '';
    if (state.wizardStep > 1) {
      footerHTML += '<button class="btn btn-secondary" id="wizard-prev-btn" style="float:left;">Back</button>';
    }
    footerHTML += '<button class="btn btn-secondary modal-close-btn">Cancel</button>';
    if (state.wizardStep < 4) {
      footerHTML += '<button class="btn btn-primary" id="wizard-next-btn">Next</button>';
    } else {
      footerHTML += '<button class="btn btn-success" id="wizard-confirm-btn">Confirm & Create</button>';
    }

    SchoolApp.showModal('Examination setup wizard', bodyHTML, footerHTML);
    attachWizardEvents();
  }

  function termEndDateStr(term) {
    return term.endDate || '—';
  }

  function attachWizardEvents() {
    // Step 1 check/input updates
    document.querySelectorAll('.wizard-term-select').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var idx = parseInt(this.getAttribute('data-idx'));
        state.wizardTerms[idx].selected = this.checked;
        openSetupWizard();
      });
    });

    document.querySelectorAll('.wizard-term-start').forEach(function(inp) {
      inp.addEventListener('blur', function() {
        var idx = parseInt(this.getAttribute('data-idx'));
        state.wizardTerms[idx].startDate = this.value;
      });
    });

    document.querySelectorAll('.wizard-term-end').forEach(function(inp) {
      inp.addEventListener('blur', function() {
        var idx = parseInt(this.getAttribute('data-idx'));
        state.wizardTerms[idx].endDate = this.value;
      });
    });

    document.querySelectorAll('.wizard-term-weight').forEach(function(inp) {
      inp.addEventListener('blur', function() {
        var idx = parseInt(this.getAttribute('data-idx'));
        state.wizardTerms[idx].weightage = parseInt(this.value) || 50;
      });
    });

    // Step 2 subjects check/input updates
    document.querySelectorAll('.wizard-sub-select').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var cId = this.getAttribute('data-class');
        var idx = parseInt(this.getAttribute('data-sub-idx'));
        state.wizardSubjects[cId][idx].selected = this.checked;
        openSetupWizard();
      });
    });

    document.querySelectorAll('.wizard-sub-type').forEach(function(sel) {
      sel.addEventListener('change', function() {
        var cId = this.getAttribute('data-class');
        var idx = parseInt(this.getAttribute('data-sub-idx'));
        var type = this.value;
        state.wizardSubjects[cId][idx].type = type;
        
        // Auto-populate default marks
        var def = state.wizardDefaults[type] || { full: 100, pass: 33 };
        state.wizardSubjects[cId][idx].fullMarks = def.full;
        state.wizardSubjects[cId][idx].passMarks = def.pass;
        openSetupWizard();
      });
    });

    document.querySelectorAll('.wizard-sub-full').forEach(function(inp) {
      inp.addEventListener('blur', function() {
        var cId = this.getAttribute('data-class');
        var idx = parseInt(this.getAttribute('data-sub-idx'));
        state.wizardSubjects[cId][idx].fullMarks = parseInt(this.value) || 100;
        state.wizardSubjects[cId][idx].passMarks = Math.round((parseInt(this.value) || 100) * 0.33);
        openSetupWizard();
      });
    });

    document.querySelectorAll('.wizard-sub-pass').forEach(function(inp) {
      inp.addEventListener('blur', function() {
        var cId = this.getAttribute('data-class');
        var idx = parseInt(this.getAttribute('data-sub-idx'));
        state.wizardSubjects[cId][idx].passMarks = parseInt(this.value) || 33;
      });
    });

    // Add custom subject inside wizard
    document.querySelectorAll('.wizard-add-sub-trigger').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var cId = this.getAttribute('data-class');
        var name = prompt('Enter Custom Subject Name:');
        if (!name) return;
        name = name.trim();
        if (!name) return;

        if (!state.wizardSubjects[cId]) state.wizardSubjects[cId] = [];
        var idx = state.wizardSubjects[cId].length;
        state.wizardSubjects[cId].push({
          id: 'subj_' + idx + '_' + Math.random().toString(36).substr(2, 4),
          name: name,
          code: name.substring(0, 4).toUpperCase(),
          type: 'Theory',
          fullMarks: 100,
          passMarks: 33,
          hasExam: true,
          selected: true
        });
        openSetupWizard();
      });
    });

    // Step 3 defaults updates
    document.querySelectorAll('.wizard-default-full').forEach(function(inp) {
      inp.addEventListener('blur', function() {
        var type = this.getAttribute('data-type');
        var val = parseInt(this.value) || 100;
        state.wizardDefaults[type].full = val;
        state.wizardDefaults[type].pass = Math.round(val * 0.33);
        openSetupWizard();
      });
    });

    document.querySelectorAll('.wizard-default-pass').forEach(function(inp) {
      inp.addEventListener('blur', function() {
        var type = this.getAttribute('data-type');
        state.wizardDefaults[type].pass = parseInt(this.value) || 33;
      });
    });

    // Navigation buttons
    var nextBtn = document.getElementById('wizard-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        state.wizardStep++;
        openSetupWizard();
      });
    }

    var prevBtn = document.getElementById('wizard-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        state.wizardStep--;
        openSetupWizard();
      });
    }

    var confirmBtn = document.getElementById('wizard-confirm-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async function() {
        // Commiting structure
        SchoolApp.showLoader('Setting up examinations...');
        try {
          var selectedTerms = state.wizardTerms.filter(function(t) { return t.selected; });
          
          if (!SchoolApp.store.examTerms) SchoolApp.store.examTerms = {};
          if (!SchoolApp.store.examSubjects) SchoolApp.store.examSubjects = {};

          selectedTerms.forEach(function(term, idx) {
            var tId = term.id;
            // Create examTerm
            SchoolApp.store.examTerms[tId] = {
              id: tId,
              name: term.name,
              shortName: term.shortName,
              session: (SchoolApp.store.examConfig && SchoolApp.store.examConfig.session) || '2025-26',
              startDate: term.startDate,
              endDate: term.endDate,
              resultDate: null,
              status: 'draft',
              weightage: term.weightage,
              rulesVersion: 'v2', // Wizard-created terms get v2 rules
              createdAt: new Date().toISOString(),
              createdBy: SchoolApp.currentUser ? SchoolApp.currentUser.username : 'admin',
              order: idx + 1
            };

            // Seed subjects configurations
            SchoolApp.store.examSubjects[tId] = {};
            Object.keys(state.wizardSubjects).forEach(function(cId) {
              var selectedSubs = state.wizardSubjects[cId].filter(function(x) { return x.selected; });
              if (selectedSubs.length > 0) {
                SchoolApp.store.examSubjects[tId][cId] = {
                  subjects: selectedSubs.map(function(sub, subIdx) {
                    return {
                      id: sub.id,
                      name: sub.name,
                      code: sub.code,
                      type: sub.type,
                      fullMarks: sub.fullMarks,
                      passMarks: sub.passMarks,
                      hasExam: sub.hasExam,
                      isOptional: false,
                      order: subIdx + 1
                    };
                  })
                };
              }
            });
          });

          var success = await SchoolApp.save();
          if (success) {
            SchoolApp.closeModal();
            SchoolApp.showToast('Examinations setup completed successfully!', 'success');
            render();
          }
        } catch (err) {
          console.error(err);
          SchoolApp.showToast('Wizard creation failed. Check parameters and retry.', 'error');
        } finally {
          SchoolApp.hideLoader();
        }
      });
    }
  }

  // -------------------- RENDER EXAM MODULE ENTRY POINT --------------------

  function render() {
    console.log('=== EXAMS RENDER START ===');
    try {
      var container = 
        document.getElementById('page-exams') ||
        document.getElementById('exams-content') ||
        document.querySelector('[data-page="exams"]');
      if (!container) return;

      var store = (SchoolApp && SchoolApp.store) || {};

      // Security check
      if (typeof window.assertSchoolIsolation === 'function') {
        if (!window.assertSchoolIsolation(store.exams || [], store.currentSchoolId || 'svm_bokaro_001') ||
            !window.assertSchoolIsolation(store.marks || [], store.currentSchoolId || 'svm_bokaro_001') ||
            !window.assertSchoolIsolation(store.students || [], store.currentSchoolId || 'svm_bokaro_001')) {
          console.error("[SECURITY] Data isolation breach detected in Exams Tab!");
          SchoolApp.showToast("Security error. Please logout and login again.", "error");
          SchoolApp.logout();
          return;
        }
      }

      if (SchoolApp && typeof SchoolApp.isTeacher === 'function' && SchoolApp.isTeacher()) {
        state.activeSubTab = 'marks_entry';
      }

      var html = '<div class="page-header">';
      html += '  <div class="header-left">';
      html += '    <h2><span class="material-icons-round">assignment</span> Examinations & Assessment</h2>';
      html += '  </div>';
      html += '</div>';

      // Sub-tab Navigation
      html += '<div class="exam-tabs-nav flex gap-2 mb-3" style="border-bottom:1px solid var(--border-color); padding-bottom:12px;">';
      if (!SchoolApp.isTeacher()) {
        html += '  <button class="btn btn-sm ' + (state.activeSubTab === 'setup' ? 'btn-primary' : 'btn-secondary') + '" id="exam-tab-setup"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">settings</span> Setup</button>';
      }
      html += '  <button class="btn btn-sm ' + (state.activeSubTab === 'marks_entry' ? 'btn-primary' : 'btn-secondary') + '" id="exam-tab-marks"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">edit_note</span> Marks Entry</button>';
      if (!SchoolApp.isTeacher()) {
        html += '  <button class="btn btn-sm ' + (state.activeSubTab === 'results' ? 'btn-primary' : 'btn-secondary') + '" id="exam-tab-results"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">analytics</span> Results</button>';
        html += '  <button class="btn btn-sm ' + (state.activeSubTab === 'report_cards' ? 'btn-primary' : 'btn-secondary') + '" id="exam-tab-reports"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">print</span> Report Cards</button>';
      } else {
        html += '  <button class="btn btn-sm ' + (state.activeSubTab === 'report_cards' ? 'btn-primary' : 'btn-secondary') + '" id="exam-tab-reports"><span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px;">print</span> Report Cards</button>';
      }
      html += '</div>';

      // Render active tab view
      if (state.activeSubTab === 'setup') {
        html += renderSetupTab();
      } else if (state.activeSubTab === 'marks_entry') {
        html += renderMarksEntryTab();
      } else if (state.activeSubTab === 'results') {
        html += renderResultsTab();
      } else if (state.activeSubTab === 'report_cards') {
        html += renderReportCardsTab();
      }

      container.innerHTML = html;
      attachEvents();
    } catch(err) {
      console.error('EXAMS ERROR:', err);
      var container = 
        document.getElementById('page-exams') ||
        document.getElementById('exams-content') ||
        document.querySelector('[data-page="exams"]');
      if (container) {
        container.style.display = 'block';
        container.innerHTML = 
          '<div style="padding:40px; background:#FEF2F2; border:2px solid #DC2626; margin:20px; border-radius:8px;">' +
          '<h3 style="color:#DC2626;">Exams Error</h3>' +
          '<p><b>Message:</b> ' + escapeHTML(err.message || String(err)) + '</p>' +
          '<p><b>Line:</b> ' + escapeHTML((err.stack || '').split('\n')[1] || '') + '</p></div>';
      }
    }
  }


  function legacyRecalculateRanks(termId, classId, sectionId) {
    var classMarks = (SchoolApp.store.examMarks && SchoolApp.store.examMarks[termId] && SchoolApp.store.examMarks[termId][classId] && SchoolApp.store.examMarks[termId][classId][sectionId]) || {};
    var students = (SchoolApp.store.students || []).filter(function(s) {
      return String(s.class).toLowerCase().trim() === String(classId).toLowerCase().trim() &&
             String(s.section).toLowerCase().trim() === String(sectionId).toLowerCase().trim() &&
             s.status === 'Active';
    });

    var rankList = [];
    students.forEach(function(s) {
      var sm = classMarks[s.id];
      if (sm && sm.isComplete) {
        if (sm.result === 'N/A') return;
        
        rankList.push({
          studentId: s.id,
          percentage: sm.percentage || 0,
          total: sm.total || 0,
          sm: sm
        });
      }
    });

    // Sort descending by percentage, then total
    rankList.sort(function(a, b) {
      if (b.percentage !== a.percentage) {
        return b.percentage - a.percentage;
      }
      return b.total - a.total;
    });

    // Assign tied ranks: 1, 1, 3, 4
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
  }

  function recalculateRanks(termId, classId, sectionId) {
    var term = SchoolApp.store.examTerms && SchoolApp.store.examTerms[termId];
    var isV2 = term && term.rulesVersion === 'v2';
    if (isV2) {
      var cfg = (SchoolApp.store && SchoolApp.store.reportCardConfig) || {};
      return ExamCalculationEngine.recalculateRanksV2(termId, classId, sectionId, cfg);
    }
    return legacyRecalculateRanks(termId, classId, sectionId);
  }

  // Expose module functions on window for cross-module access (e.g. admin.js live preview and inline events)
  window.generateSingleStudentCardHTML = generateSingleStudentCardHTML;
  window.printStudentMarksheet = printStudentMarksheet;
  window.printBulkReportCards = printBulkReportCards;
  window.printViaBlob = printViaBlob;
  window.printViaBlobV2 = printViaBlobV2;
  window.generateSmartRemark = generateSmartRemark;
  window.recalculateStudentEntry = recalculateStudentEntry;
  window.recalculateRanks = recalculateRanks;
  window.ensureSubjectsArray = ensureSubjectsArray;

  // BUG 3: Expose renderMarksTable for onSnapshot in app.js to refresh marks UI on remote changes
  window.renderMarksTable = function() {
    // Only re-render if we're currently on the marks_entry subtab
    if (state.activeSubTab === 'marks_entry') {
      var container = document.getElementById('page-exams') ||
        document.querySelector('[data-page="exams"]');
      if (container) {
        render();
      }
    }
  };

  // Register Module
  SchoolApp.registerModule('exams', {
    init: function() {
      runMigration();
    },
    render: async function(container) {
      if (!SchoolApp.store.examConfig) {
        runMigration();
      }
      var termList = Object.values(SchoolApp.store.examTerms || {});
      if (!state.examTerm && termList.length > 0) {
        state.examTerm = termList[0].id;
      }
      if (state.activeSubTab !== 'setup' && state.examTerm) {
        await ensureMarksLoaded(state.examTerm);
      }
      render(container);
    },
    runMigration: runMigration
  });

})();