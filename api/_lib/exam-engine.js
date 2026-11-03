'use strict';

/**
 * api/_lib/exam-engine.js
 * 
 * Pure, Zero-DOM Exam Calculation Engine.
 * Exact server-side replica of the ERP's ExamCalculationEngine from js/exams.js:272-420.
 * Guarantees zero divergent math between school admin report cards and parent portal results.
 */

function ensureSubjectsArray(subjects) {
  if (Array.isArray(subjects)) return subjects;
  if (subjects && typeof subjects === 'object') return Object.values(subjects);
  return [];
}

const ExamCalculationEngine = {
  calculateGrade: function(percentage, customScale) {
    const scale = customScale || [
      { min: 91, max: 100, grade: 'A+', label: 'Outstanding' },
      { min: 81, max: 90,  grade: 'A',  label: 'Excellent' },
      { min: 71, max: 80,  grade: 'B+', label: 'Very Good' },
      { min: 61, max: 70,  grade: 'B',  label: 'Good' },
      { min: 51, max: 60,  grade: 'C+', label: 'Above Average' },
      { min: 41, max: 50,  grade: 'C',  label: 'Average' },
      { min: 33, max: 40,  grade: 'D',  label: 'Pass' },
      { min: 0,  max: 32,  grade: 'F',  label: 'Fail' }
    ];
    for (let i = 0; i < scale.length; i++) {
      if (percentage >= scale[i].min && percentage <= scale[i].max) {
        return scale[i];
      }
    }
    return percentage >= 33 ? { grade: 'D', label: 'Pass' } : { grade: 'F', label: 'Fail' };
  },

  calculateStudentResult: function(params) {
    params = params || {};
    const marks = params.marks || {};
    const subjects = ensureSubjectsArray(params.subjects || []);
    const term = params.term || {};
    const schoolConfig = params.schoolConfig || {};
    const passPercent = (schoolConfig.passPercent !== undefined) ? Number(schoolConfig.passPercent) : 33;
    const decimals = (schoolConfig.percentageDecimals !== undefined) ? Number(schoolConfig.percentageDecimals) : 2;

    let totalObtained = 0;
    let totalFull = 0;
    let totalPass = 0;
    let mandatoryFailed = false;
    let optionalFailedOrAbsent = false;
    const missingMandatory = [];
    const missingOptional = [];
    let allAB = true;
    let enteredCount = 0;

    subjects.forEach(function(sub) {
      const sc = marks[sub.id];
      const subFull = Number(sub.fullMarks) || 100;
      const defaultSubPass = (passPercent / 100) * subFull;
      const subPass = (sub.passMarks !== undefined && sub.passMarks !== null) ? Number(sub.passMarks) : defaultSubPass;

      const hasEntry = sc && (sc.isAbsent || sc.isExempted || (sc.obtained !== undefined && sc.obtained !== null && String(sc.obtained).trim() !== ''));

      if (hasEntry) {
        enteredCount++;
        if (sc.isExempted) return;

        const obt = sc.isAbsent ? 0 : (parseFloat(sc.obtained) || 0);
        if (!sc.isAbsent) allAB = false;

        totalObtained += obt;
        totalFull += subFull;
        totalPass += subPass;

        const isFail = sc.isAbsent || (obt < subPass);
        if (sub.isOptional) {
          if (isFail) optionalFailedOrAbsent = true;
        } else {
          if (isFail) mandatoryFailed = true;
        }
      } else {
        if (sub.isOptional) {
          missingOptional.push(sub.id);
        } else {
          missingMandatory.push(sub.id);
          if (term.status === 'published' || term.status === 'locked') {
            totalFull += subFull;
            totalPass += subPass;
          }
        }
      }
    });

    const isComplete = (missingMandatory.length === 0);
    const rawPercentage = totalFull > 0 ? (totalObtained / totalFull) * 100 : 0;
    const displayPercentage = rawPercentage.toFixed(decimals) + '%';
    const requireOverallPass = schoolConfig.requireOverallPass !== false;

    const bands = (schoolConfig.divisionBands && Array.isArray(schoolConfig.divisionBands) && schoolConfig.divisionBands.length > 0)
      ? schoolConfig.divisionBands.slice().sort((a, b) => b.min - a.min)
      : [
          { min: 75, label: 'First Division (Distinction)' },
          { min: 60, label: 'First Division' },
          { min: 45, label: 'Second Division' },
          { min: 33, label: 'Third Division' }
        ];
    const lowestPassBandLabel = bands.length > 0 ? bands[bands.length - 1].label : 'Third Division';

    let resultText = 'PASS';
    let divisionText = lowestPassBandLabel;

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
        divisionText = 'Not Awarded';
      } else {
        let matchedBand = null;
        for (let b = 0; b < bands.length; b++) {
          if (rawPercentage >= bands[b].min) {
            matchedBand = bands[b].label;
            break;
          }
        }
        divisionText = matchedBand || lowestPassBandLabel;
      }
    }

    const gradeObj = this.calculateGrade(rawPercentage, schoolConfig.gradingScale);
    const rankFailedStudents = schoolConfig.rankFailedStudents !== false;
    const eligibleForRank = (resultText !== 'INCOMPLETE') && (rankFailedStudents || resultText !== 'FAIL');

    const finalDisplayPct = (resultText === 'INCOMPLETE') ? '—' : displayPercentage;
    const finalGrade = (resultText === 'INCOMPLETE') ? '—' : gradeObj.grade;
    const finalGradeLabel = (resultText === 'INCOMPLETE') ? 'Incomplete' : gradeObj.label;

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
  }
};

module.exports = ExamCalculationEngine;
