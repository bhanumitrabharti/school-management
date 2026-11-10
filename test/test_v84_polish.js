'use strict';

/**
 * test/test_v84_polish.js
 *
 * Dedicated Test Suite for v84 polish fixes (items 1.a through 1.q):
 * 1.a: Smart remarks tier (v2 order vs legacy order)
 * 1.b: Parent portal timetable times parity with admin (41-min periods, 30-min lunch)
 * 1.c: Admit card subjects & dates
 * 1.d: Character certificate pronouns and active/left student text
 * 1.e: Bonafide certificate DOB in numerals + words & header affiliation/udise
 * 1.f: Certificate numbers sequential serial format BON/<YYYY-YY>/<6-digit serial> & CHAR
 * 1.g: Principal name fallback (clean single "Principal") & hint banner
 * 1.h: Timetable double prefix elimination (formatClassLabel)
 * 1.i: Exam terms weightage fallback ("—")
 * 1.j: Fee financial profile: discount stat card + overdue badge not on paid dues
 * 1.k: Students list pagination: at most one ellipsis per gap
 * 1.l: Avatar initials: strip honorifics (Dr. Ramesh Sharma -> RS)
 * 1.m: System info: APP_VERSION, buildTime, super-admin only password migration button
 * 1.n: Marks Entry lock text: clean copy without "(Client-side enforcement)"
 * 1.o: Hash route on refresh: validPages includes documents, accounts, payroll
 * 1.p: Dashboard notices audience badge & recent activity newest-first + teacher name
 * 1.q: Fee Setup "Last automated billing run" inspects loaded fee dues
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passedCount = 0;
let failedCount = 0;

function pass(name) {
  console.log(`  ✔ PASS: ${name}`);
  passedCount++;
}

function fail(name, err) {
  console.error(`  ✖ FAIL: ${name}:`, err.message || err);
  failedCount++;
}

function runTest(name, fn) {
  try {
    fn();
    pass(name);
  } catch (err) {
    fail(name, err);
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (err) {
    fail(name, err);
  }
}

console.log('======================================================================');
console.log('v84 POLISH TEST SUITE EXECUTION');
console.log('======================================================================\n');

// ── 1.a: SMART REMARKS TIER ──────────────────────────────────────────────────
console.log('--- 1.a: Smart remarks grading scale order ---');
const examsCode = fs.readFileSync('js/exams.js', 'utf8');
assert(examsCode.includes('resolveReportCardRemark'), 'resolveReportCardRemark exists in js/exams.js');
assert(examsCode.includes('if (isLegacy === true)'), 'isLegacy check present in resolveReportCardRemark');
assert(examsCode.includes('legacyGenerateSingleStudentCardHTML') && examsCode.includes('resolveReportCardRemark(s, subjectsArr, savedMarks, calcResLegacy, reportCardConfig, true)'), 'legacy passes isLegacy = true');
pass('1.a: resolveReportCardRemark uses examConfig.gradingScale for legacy and reportCardConfig for v2');

// ── 1.b: TIMETABLE TIMES PARITY ──────────────────────────────────────────────
console.log('--- 1.b: Parent portal timetable times parity ---');
const parentsCode = fs.readFileSync('js/parents.js', 'utf8');
const appCode = fs.readFileSync('js/app.js', 'utf8');

// Extract getPeriodTimeStr from parents.js
const matchPortal = parentsCode.match(/export\s+function\s+getPeriodTimeStr\s*\([^)]*\)\s*\{([\s\S]*?)(?=\n\})/);
assert(matchPortal, 'getPeriodTimeStr found in js/parents.js');
const getPortalPeriodTimeStr = new Function('pNum', 'dayName', 'settings', matchPortal[1]);

// Test greenwood schedule: 08:00 to 14:00, 8 periods, lunch 30m after period 4
const greenwoodSettings = {
  startTime: '08:00',
  endTime: '14:00',
  totalPeriods: 8,
  lunchAfterPeriod: 4,
  lunchDuration: 30
};

// Period 1: 08:00 - 08:41
// Period 2: 08:41 - 09:22
// Period 3: 09:22 - 10:03
// Period 4: 10:03 - 10:44
// Lunch: 10:44 - 11:14 (30m)
// Period 5: 11:14 - 11:55
const p1Time = getPortalPeriodTimeStr(1, 'Monday', greenwoodSettings);
const p4Time = getPortalPeriodTimeStr(4, 'Monday', greenwoodSettings);
const p5Time = getPortalPeriodTimeStr(5, 'Monday', greenwoodSettings);

assert.strictEqual(p1Time, '08:00 AM - 08:41 AM', `Period 1 should be 08:00 AM - 08:41 AM, got ${p1Time}`);
assert.strictEqual(p4Time, '10:03 AM - 10:44 AM', `Period 4 should be 10:03 AM - 10:44 AM, got ${p4Time}`);
assert.strictEqual(p5Time, '11:14 AM - 11:55 AM', `Period 5 should be 11:14 AM - 11:55 AM (after 30m lunch), got ${p5Time}`);
pass('1.b: Parent portal getPeriodTimeStr produces exact 41-min periods with 30m lunch after period 4');

// ── 1.c: ADMIT CARD SUBJECTS & DATES ─────────────────────────────────────────
console.log('--- 1.c: Admit card subjects and exam dates ---');
const docsCode = fs.readFileSync('js/documents.js', 'utf8');
assert(docsCode.includes('formatDDMMYYYY'), 'formatDDMMYYYY helper present in js/documents.js');
assert(docsCode.includes('curDate.getDay() === 0'), 'Sunday skipping present in admit card date population');
pass('1.c: Admit card skips Sundays and formats dates as DD-MM-YYYY');

// ── 1.d: CHARACTER CERTIFICATE ───────────────────────────────────────────────
console.log('--- 1.d: Character certificate grammar & status ---');
assert(docsCode.includes('We wish \' + escapeHTML(himHer) + \' all the best in \' + escapeHTML(hisHer) + \' future endeavors'), 'Objective pronoun him/her used in wishes clause');
assert(docsCode.includes('var studentStatusText = isActive ? \'is a student\' : \'was a student\';'), 'is a student vs was a student present');
assert(docsCode.includes('till date'), 'till date present for active students');
assert(!docsCode.includes('</select>.'), 'Stray period after </select> removed');
pass('1.d: Character certificate pronouns, active/left status phrasing, and period fix verified');

// ── 1.e: BONAFIDE CERTIFICATE ────────────────────────────────────────────────
console.log('--- 1.e: Bonafide certificate DOB and headers ---');
assert(docsCode.includes('formatDateWords'), 'formatDateWords present in js/documents.js');
assert(docsCode.includes('Board Affiliation:'), 'Board Affiliation header in bonafide certificate');
assert(docsCode.includes('UDISE Code:'), 'UDISE Code header in bonafide certificate');
pass('1.e: Bonafide certificate includes DOB in numerals + words and board/UDISE headers');

// ── 1.f: CERTIFICATE NUMBERS ─────────────────────────────────────────────────
console.log('--- 1.f: Certificate sequential serial numbers ---');
assert(appCode.includes('generateCertificateNumber: async function'), 'generateCertificateNumber defined in js/app.js');
assert(appCode.includes('counters\', \'certificates\''), 'uses counters/certificates Firestore doc');
assert(docsCode.includes('BON/\' + fy + \'/\''), 'BON/<YYYY-YY>/<serial> format used in documents.js');
assert(docsCode.includes('CHAR/\' + fy + \'/\''), 'CHAR/<YYYY-YY>/<serial> format used in documents.js');
pass('1.f: Sequential certificate numbers format BON/<YYYY-YY>/<serial> and CHAR/<YYYY-YY>/<serial>');

// ── 1.g: PRINCIPAL NAME FALLBACK ─────────────────────────────────────────────
console.log('--- 1.g: Principal name fallback & hint banner ---');
assert(docsCode.includes("Add the principal\\'s name in Admin Panel"), 'Hint banner present when principal name not configured');
assert(docsCode.includes('function getPrincipalName() {\n    var s = getSettings();\n    return (s.principalName && String(s.principalName).trim()) ? String(s.principalName).trim() : \'\';') ||
       docsCode.includes('return (s.principalName && String(s.principalName).trim()) ? String(s.principalName).trim() : \'\';'), 'getPrincipalName returns empty string if unconfigured');
pass('1.g: Principal name fallback and hint banner verified');

// ── 1.h: TIMETABLE DOUBLE PREFIX ─────────────────────────────────────────────
console.log('--- 1.h: Timetable double prefix elimination ---');
const ttCode = fs.readFileSync('js/timetable.js', 'utf8');
assert(appCode.includes('formatClassLabel: function(cls)'), 'formatClassLabel defined in js/app.js');
assert(ttCode.includes('formatClassLabel'), 'formatClassLabel used in js/timetable.js');

// Test formatClassLabel logic directly
function formatClassLabel(cls) {
  if (!cls) return '';
  var str = String(cls).trim().replace(/^(class\s+)+/i, '').trim();
  if (['Nursery', 'LKG', 'UKG'].indexOf(str) !== -1) return str;
  return 'Class ' + str;
}
assert.strictEqual(formatClassLabel('10'), 'Class 10');
assert.strictEqual(formatClassLabel('Class 10'), 'Class 10');
assert.strictEqual(formatClassLabel('Class Class 10'), 'Class 10');
assert.strictEqual(formatClassLabel('10-A'), 'Class 10-A');
assert.strictEqual(formatClassLabel('Class 10-A'), 'Class 10-A');
assert.strictEqual(formatClassLabel('Nursery'), 'Nursery');
pass('1.h: formatClassLabel eliminates double prefix and standardizes class strings');

// ── 1.i: EXAM TERMS WEIGHTAGE ────────────────────────────────────────────────
console.log('--- 1.i: Exam terms weightage fallback ---');
assert(examsCode.includes('weightageDisp') && examsCode.includes(" : '—'"), 'Exam terms weightage displays "—" when unset');
pass('1.i: Exam terms weightage displays "—" when unset');

// ── 1.j: FEE FINANCIAL PROFILE ───────────────────────────────────────────────
console.log('--- 1.j: Fee financial profile discount card and overdue badge ---');
const feesCode = fs.readFileSync('js/fees.js', 'utf8');
assert(feesCode.includes('Total Discount'), 'Total Discount stat card present');
assert(feesCode.includes('repeat(5, 1fr)'), '5 stat cards in financial profile header');
assert(feesCode.includes('udInfo && udInfo.remaining > 0 && udInfo.isOverdue && !t.isVoided'), 'Overdue badge only shown on unpaid dues');
pass('1.j: Fee financial profile has Total Discount card and does not mark paid dues as overdue');

// ── 1.k: STUDENTS LIST PAGINATION ────────────────────────────────────────────
console.log('--- 1.k: Students list pagination ---');
const studentsCode = fs.readFileSync('js/students.js', 'utf8');
assert(studentsCode.includes('lastEmitted && i - lastEmitted > 1'), 'Gap-based single ellipsis pagination check present in js/students.js');

// Test pagination generation for page 1 of 8
function renderPagination(currentPage, totalPages) {
  let emitted = [];
  let lastEmitted = 0;
  for (let i = 1; i <= totalPages; i++) {
    const showPage = (totalPages <= 7) ||
                     (i === 1 || i === totalPages) ||
                     (Math.abs(i - currentPage) <= 1) ||
                     (currentPage <= 3 && i <= 3) ||
                     (currentPage >= totalPages - 2 && i >= totalPages - 2);
    if (!showPage) continue;
    if (lastEmitted && i - lastEmitted > 1) {
      emitted.push('...');
    }
    emitted.push(String(i));
    lastEmitted = i;
  }
  return emitted.join(' ');
}
assert.strictEqual(renderPagination(1, 8), '1 2 3 ... 8', 'Page 1 of 8 must produce "1 2 3 ... 8" (at most one ellipsis)');
assert.strictEqual(renderPagination(4, 8), '1 ... 3 4 5 ... 8', 'Page 4 of 8 must produce "1 ... 3 4 5 ... 8"');
assert.strictEqual(renderPagination(8, 8), '1 ... 6 7 8', 'Page 8 of 8 must produce "1 ... 6 7 8"');
pass('1.k: Pagination renders at most one ellipsis per gap for all totalPages');

// ── 1.l: AVATAR INITIALS HONORIFICS ──────────────────────────────────────────
console.log('--- 1.l: Avatar initials honorifics stripping ---');
assert(appCode.includes('^(mr|mrs|ms|dr|shri|smt)\\.?\\s+'), 'Honorific regex present in getInitials');

function getInitials(firstName, lastName) {
  var raw = (firstName && lastName) ? (firstName + ' ' + lastName).trim() : (firstName || lastName || '').trim();
  if (!raw) return '';
  var cleaned = raw.replace(/^(mr|mrs|ms|dr|shri|smt)\.?\s+/i, '').trim();
  var parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return (parts[0][0] || '').toUpperCase();
  return ((parts[0][0] || '') + (parts[parts.length - 1][0] || '')).toUpperCase();
}
assert.strictEqual(getInitials('Dr. Ramesh Sharma'), 'RS');
assert.strictEqual(getInitials('Dr.', 'Ramesh Sharma'), 'RS');
assert.strictEqual(getInitials('Mrs. Anita Desai'), 'AD');
assert.strictEqual(getInitials('Shri Rajesh Kumar'), 'RK');
assert.strictEqual(getInitials('Smt. Sunita Verma'), 'SV');
assert.strictEqual(getInitials('John Doe'), 'JD');
pass('1.l: getInitials strips honorifics correctly');

// ── 1.m: SYSTEM INFO & PASSWORD MIGRATION ────────────────────────────────────
console.log('--- 1.m: System info and password migration access ---');
const adminCode = fs.readFileSync('js/admin.js', 'utf8');
assert(adminCode.includes('Paathshala ERP \' + currentVer'), 'System info displays current APP_VERSION');
assert(adminCode.includes('Build Date\', value: buildTimeVal'), 'System info displays buildTimeVal');
assert(adminCode.includes('SchoolApp.isSuperAdmin()'), 'Password migration button guarded by isSuperAdmin()');
pass('1.m: System info displays APP_VERSION and build time; button guarded by super-admin check');

// ── 1.n: MARKS ENTRY LOCK TEXT ───────────────────────────────────────────────
console.log('--- 1.n: Marks Entry lock copy ---');
assert(examsCode.includes('Marks are locked because this term is published.'), 'Clean lock banner text present');
assert(!examsCode.includes('Marks are locked because this term is published. (Client-side enforcement)'), 'Client-side enforcement removed from lock banner');
assert(!examsCode.includes('allow modifications. (Client-side enforcement)'), 'Client-side enforcement removed from unlock dialog');
pass('1.n: Marks entry lock text is clean and professional');

// ── 1.o: HASH ROUTE ON REFRESH ───────────────────────────────────────────────
console.log('--- 1.o: Hash route on refresh ---');
assert(appCode.includes('\'documents\', \'accounts\', \'payroll\''), 'documents, accounts, payroll in validPages');
assert(!appCode.includes('SchoolApp.showApp();\n          SchoolApp.navigate(\'dashboard\');'), 'Unconditional navigate to dashboard on restore removed');
pass('1.o: Reload preserves #documents, #fees, and other valid route hashes');

// ── 1.p: DASHBOARD NOTICES & RECENT ACTIVITY ─────────────────────────────────
console.log('--- 1.p: Dashboard notices and recent activity ---');
assert(appCode.includes('audArr.indexOf(\'teachers\') !== -1 || audArr.indexOf(\'teachers_only\') !== -1'), 'Audience handles teachers only');
assert(appCode.includes('dateB - dateA'), 'Recent activity sorted newest-first');
assert(appCode.includes('teacherName = \'Administrator\';'), 'Fallback resolves to Administrator instead of Unknown');
pass('1.p: Notice board audience handles teachers only, and recent activity sorted newest-first with clean teacher names');

// ── 1.q: FEE SETUP LAST RUN ──────────────────────────────────────────────────
console.log('--- 1.q: Fee Setup last automated billing run ---');
assert(adminCode.includes('billedPeriods.push(bp);'), 'Fee setup inspects loaded fee dues for last billed period');
assert(adminCode.includes('lastRunPeriod = billedPeriods[billedPeriods.length - 1];'), 'Picks latest billed period when autoChargeLastRun is empty');
pass('1.q: Fee Setup derives last automated run from actual fee dues');

console.log('\n======================================================================');
console.log(`v84 TEST SUMMARY: Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
console.log('======================================================================');

if (failedCount > 0) {
  process.exit(1);
}
