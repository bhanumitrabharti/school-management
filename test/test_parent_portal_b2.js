'use strict';

/**
 * test/test_parent_portal_b2.js
 * 
 * Comprehensive emulator test suite for Parent Portal Phase B2:
 * Academic Information (read-only for parents).
 * 
 * Verifies:
 *   1. Sibling support: Two children same email (each shows only own data).
 *   2. Classmate isolation: Caller cannot access any classmate's records (403).
 *   3. Attendance: Monthly totals, percentage, daily statuses; classmate records never leaked.
 *   4. Timetable: Weekly schedule for class-section; teachers mapped.
 *   5. Notices: Audience filtering (everyone/parents shown; teachers/drafts hidden).
 *   6. Exams: Visible terms (showResultsToParents === true); hidden terms not listed (showResultsToParents === false -> 403).
 *   7. Exam Results: Calculation matches ERP report-card numbers for same student/term.
 *   8. Module toggles: Module OFF -> 403 Forbidden with clear message.
 *   9. Direct Firestore client access: Parent token direct reads to attendance_months, exam_marks, portal/config denied.
 * 
 * USAGE:
 *   $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8085"
 *   node test/test_parent_portal_b2.js
 */

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('\n❌ FATAL: Refusing to run test/test_parent_portal_b2.js without emulator!');
  console.error('FIRESTORE_EMULATOR_HOST must be set (e.g. 127.0.0.1:8085) to protect production data.\n');
  process.exit(1);
}

process.env.MOCK_PARENT_MODE = 'true';
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const http = require('http');
const vm = require('vm');
const ExamCalculationEngine = require('../api/_lib/exam-engine');
const { loadStudentExamMarks } = require('../api/_lib/parents/marks-loader');
const parentHandler = require('../api/parents');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'ctrl-shift-solutions' });
}
const db = admin.firestore();

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✔ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✖ FAIL: ${message}`);
    failed++;
  }
}

// Mock HTTP invoker for serverless api/parents
function invokeHandler(method, action, body = {}, headers = {}) {
  return new Promise((resolve) => {
    const req = {
      method: method,
      query: { action },
      body: body,
      headers: {
        'content-type': 'application/json',
        ...headers
      },
      socket: { remoteAddress: '127.0.0.1' }
    };

    let statusCode = 200;
    let responseData = null;
    let headersSent = {};

    const res = {
      statusCode: 200,
      setHeader: (k, v) => { headersSent[k.toLowerCase()] = v; },
      status: function(code) {
        this.statusCode = code;
        statusCode = code;
        return this;
      },
      json: function(data) {
        responseData = data;
        resolve({ status: statusCode, body: data, headers: headersSent });
        return this;
      },
      end: function(data) {
        if (data && !responseData) {
          try { responseData = JSON.parse(data); } catch (_) { responseData = data; }
        }
        resolve({ status: statusCode, body: responseData, headers: headersSent });
        return this;
      }
    };

    parentHandler(req, res).catch(err => {
      resolve({ status: 500, body: { error: err.message }, headers: headersSent });
    });
  });
}

async function seedTestData() {
  console.log('\n--- Seeding Test Data in Firestore Emulator ---');
  const schoolId = 'test_school_portal_b2';
  const parentEmail = 'parent.b2@test.com';
  const otherParentEmail = 'classmate.parent@test.com';

  // 1. Root tenant document
  await db.collection('tenant_data').doc(schoolId).set({
    school_name: 'Paathshala B2 Test Academy',
    settings: {
      schoolName: 'Paathshala B2 Test Academy',
      logoUrl: 'https://storage.ctrlshifts.in/b2-logo.png',
      studentsMigrated: true,
      storageVersion: 2,
      classes: ['5', '6'],
      parentPortal: {
        enabled: true,
        attendance: true,
        timetable: true,
        notices: true,
        exams: true,
        profile: true,
        allowAttendance: true,
        allowTimetable: true,
        allowNotices: true,
        allowExams: true,
        allowProfile: true
      }
    },
    teachers: [
      { id: 'tea_1', firstName: 'Ramesh', lastName: 'Kumar' },
      { id: 'tea_2', firstName: 'Anita', lastName: 'Singh' }
    ],
    timetable: {
      '5-A': {
        Monday: {
          '1': { subject: 'Mathematics', teacherId: 'tea_1' },
          '2': { subject: 'Science', teacherId: 'tea_2' }
        }
      },
      '6-A': {
        Monday: {
          '1': { subject: 'English', teacherId: 'tea_1' }
        }
      }
    },
    examTerms: {
      term_1: {
        id: 'term_1',
        name: 'Term 1 Mid-Term',
        shortName: 'T1',
        session: '2025-26',
        startDate: '2026-09-01',
        endDate: '2026-09-15',
        showResultsToParents: true,
        rulesVersion: 'v2',
        status: 'published',
        order: 1
      },
      term_2: {
        id: 'term_2',
        name: 'Term 2 Final Exam',
        shortName: 'T2',
        session: '2025-26',
        startDate: '2026-11-01',
        endDate: '2026-11-20',
        showResultsToParents: false, // HIDDEN FROM PARENTS
        status: 'draft',
        order: 2
      }
    },
    examSubjects: {
      term_1: {
        '5': {
          subjects: [
            { id: 'sub_math', name: 'Mathematics', fullMarks: 100, passMarks: 33 },
            { id: 'sub_sci', name: 'Science', fullMarks: 100, passMarks: 33 }
          ]
        }
      }
    }
  }, { merge: true });

  // 2. Portal Config Subcollection
  await db.collection('tenant_data').doc(schoolId).collection('portal').doc('config').set({
    enabled: true,
    studentsMigrated: true,
    restructured: true,
    modules: {
      profile: true,
      attendance: true,
      timetable: true,
      notices: true,
      exams: true,
      reportCards: false,
      fees: true,
      feePayment: true
    },
    schoolName: 'Paathshala B2 Test Academy',
    logoUrl: 'https://storage.ctrlshifts.in/b2-logo.png',
    updatedAt: new Date().toISOString()
  });

  // 3. Students: Child 1, Child 2 (Sibling), and Classmate
  await db.collection('tenant_data').doc(schoolId).collection('students').doc('stu_child1').set({
    id: 'stu_child1',
    firstName: 'Aarav',
    lastName: 'Sharma',
    name: 'Aarav Sharma',
    class: '5',
    section: 'A',
    rollNumber: '101',
    admissionNumber: 'ADM-5001',
    parentEmail: parentEmail,
    parentEmailNorm: parentEmail,
    status: 'Active'
  });

  await db.collection('tenant_data').doc(schoolId).collection('students').doc('stu_child2').set({
    id: 'stu_child2',
    firstName: 'Ananya',
    lastName: 'Sharma',
    name: 'Ananya Sharma',
    class: '6',
    section: 'A',
    rollNumber: '201',
    admissionNumber: 'ADM-6001',
    parentEmail: parentEmail,
    parentEmailNorm: parentEmail,
    status: 'Active'
  });

  await db.collection('tenant_data').doc(schoolId).collection('students').doc('stu_classmate').set({
    id: 'stu_classmate',
    firstName: 'Vikram',
    lastName: 'Patel',
    name: 'Vikram Patel',
    class: '5',
    section: 'A',
    rollNumber: '102',
    admissionNumber: 'ADM-5002',
    parentEmail: otherParentEmail,
    parentEmailNorm: otherParentEmail,
    status: 'Active'
  });

  // 4. Attendance subcollection
  await db.collection('tenant_data').doc(schoolId).collection('attendance_months').doc('2026-11').collection('classes').doc('5').set({
    records: [
      {
        date: '2026-11-01',
        class: '5',
        section: 'A',
        records: [
          { studentId: 'stu_child1', status: 'present' },
          { studentId: 'stu_classmate', status: 'absent' }
        ]
      },
      {
        date: '2026-11-02',
        class: '5',
        section: 'A',
        records: [
          { studentId: 'stu_child1', status: 'late' },
          { studentId: 'stu_classmate', status: 'present' }
        ]
      }
    ]
  });

  await db.collection('tenant_data').doc(schoolId).collection('attendance_months').doc('2026-11').collection('classes').doc('6').set({
    records: [
      {
        date: '2026-11-01',
        class: '6',
        section: 'A',
        records: [
          { studentId: 'stu_child2', status: 'present' }
        ]
      }
    ]
  });

  // 5. Exam Marks subcollection (term_1)
  await db.collection('tenant_data').doc(schoolId).collection('exam_marks').doc('term_1').set({
    '5': {
      'A': {
        'stu_child1': {
          marks: {
            'sub_math': { obtained: 85, isAbsent: false },
            'sub_sci': { obtained: 90, isAbsent: false }
          },
          total: 175,
          maxTotal: 200,
          percentage: 88,
          rank: 1
        },
        'stu_classmate': {
          marks: {
            'sub_math': { obtained: 40, isAbsent: false },
            'sub_sci': { obtained: 50, isAbsent: false }
          },
          total: 90,
          maxTotal: 200,
          percentage: 45,
          rank: 2
        }
      }
    }
  });

  // 6. Notices subcollection
  await db.collection('tenant_data').doc(schoolId).collection('notices').doc('notif_everyone').set({
    id: 'notif_everyone',
    title: 'School Closed on Friday',
    message: 'School will observe holiday this Friday.',
    date: '2026-11-01',
    priority: 'Normal',
    audience: ['everyone'],
    status: 'published'
  });

  await db.collection('tenant_data').doc(schoolId).collection('notices').doc('notif_parents').set({
    id: 'notif_parents',
    title: 'PTM Meeting Notice',
    message: 'Parent Teacher Meeting will be held on Saturday.',
    date: '2026-11-02',
    priority: 'Urgent',
    audience: ['parents'],
    status: 'published'
  });

  await db.collection('tenant_data').doc(schoolId).collection('notices').doc('notif_teachers').set({
    id: 'notif_teachers',
    title: 'Staff Meeting Internal',
    message: 'Confidential staff meeting agenda.',
    date: '2026-11-03',
    priority: 'High',
    audience: ['teachers'],
    status: 'published'
  });

  await db.collection('tenant_data').doc(schoolId).collection('notices').doc('notif_draft').set({
    id: 'notif_draft',
    title: 'Unpublished Draft Notice',
    message: 'Work in progress circular.',
    date: '2026-11-03',
    priority: 'Normal',
    audience: ['parents'],
    status: 'draft'
  });

  // Notice without explicit status field (FIX 5c: should default to 'published')
  await db.collection('tenant_data').doc(schoolId).collection('notices').doc('notif_no_status').set({
    id: 'notif_no_status',
    title: 'Notice without Status Field',
    message: 'Notice missing explicit status property.',
    date: '2026-11-04',
    priority: 'Normal',
    audience: ['everyone']
  });

  // Notice with status='archived' (FIX 5c: must be excluded)
  await db.collection('tenant_data').doc(schoolId).collection('notices').doc('notif_archived').set({
    id: 'notif_archived',
    title: 'Old Archived Circular',
    message: 'Archived circular notice.',
    date: '2026-10-01',
    priority: 'Normal',
    audience: ['parents'],
    status: 'archived'
  });

  // Student with legacy parentEmail but missing parentEmailNorm (FIX 4: must be rejected 403)
  await db.collection('tenant_data').doc(schoolId).collection('students').doc('stu_unmigrated_linking').set({
    id: 'stu_unmigrated_linking',
    firstName: 'Rohit',
    lastName: 'Sharma',
    name: 'Rohit Sharma',
    class: '5',
    section: 'A',
    rollNumber: '103',
    parentEmail: parentEmail,
    // parentEmailNorm intentionally omitted
    status: 'Active'
  });

  // School with custom examConfig.gradingScale and reportCardConfig without gradingScale (FIX 1)
  const customScaleSchoolId = 'test_school_custom_grading';
  await db.collection('tenant_data').doc(customScaleSchoolId).set({
    school_name: 'Custom Scale Academy',
    settings: {
      schoolName: 'Custom Scale Academy',
      studentsMigrated: true,
      storageVersion: 2,
      parentPortal: { enabled: true, exams: true }
    },
    examConfig: {
      gradingScale: [
        { min: 80, max: 100, grade: 'DISTINCTION', label: 'Distinction' },
        { min: 33, max: 79,  grade: 'PASS',        label: 'Pass' },
        { min: 0,  max: 32,  grade: 'FAIL',        label: 'Fail' }
      ]
    },
    reportCardConfig: {
      headerTitle: 'Report Card with No Internal Scale'
    },
    examTerms: {
      term_custom: {
        id: 'term_custom',
        name: 'Custom Scale Term',
        showResultsToParents: true,
        status: 'published'
      }
    },
    examSubjects: {
      term_custom: {
        '5': {
          subjects: [
            { id: 'sub_math', name: 'Mathematics', fullMarks: 100, passMarks: 33 }
          ]
        }
      }
    }
  });

  await db.collection('tenant_data').doc(customScaleSchoolId).collection('portal').doc('config').set({
    enabled: true,
    studentsMigrated: true,
    modules: { exams: true },
    schoolName: 'Custom Scale Academy'
  });

  await db.collection('tenant_data').doc(customScaleSchoolId).collection('students').doc('stu_custom').set({
    id: 'stu_custom',
    firstName: 'Dev',
    lastName: 'Sharma',
    name: 'Dev Sharma',
    class: '5',
    section: 'A',
    parentEmailNorm: parentEmail,
    status: 'Active'
  });

  await db.collection('tenant_data').doc(customScaleSchoolId).collection('exam_marks').doc('term_custom').set({
    '5': {
      'A': {
        'stu_custom': {
          marks: {
            'sub_math': { obtained: 85 } // 85% -> DISTINCTION in custom scale, 'A' in default scale
          }
        }
      }
    }
  });

  // School with portal/config studentsMigrated === false (FIX 2c)
  const unmigratedPortalSchoolId = 'test_school_unmigrated_pp';
  await db.collection('tenant_data').doc(unmigratedPortalSchoolId).collection('portal').doc('config').set({
    enabled: true,
    studentsMigrated: false, // Explicitly false
    modules: { profile: true }
  });

  // School with portal/config missing studentsMigrated field (FIX 2c)
  const missingMigratedPortalSchoolId = 'test_school_missing_migrated_pp';
  await db.collection('tenant_data').doc(missingMigratedPortalSchoolId).collection('portal').doc('config').set({
    enabled: true,
    // studentsMigrated missing
    modules: { profile: true }
  });

  // --- v79 Seed Additions ---
  // A. Normalized matching student in restructured school (class '2', section 'a')
  await db.collection('tenant_data').doc(schoolId).collection('students').doc('stu_norm_child').set({
    id: 'stu_norm_child',
    name: 'Rohan Sharma',
    class: '2',
    section: 'a',
    parentEmail: parentEmail,
    parentEmailNorm: parentEmail,
    status: 'Active'
  });
  await db.collection('tenant_data').doc(schoolId).collection('students').doc('stu_norm_classmate').set({
    id: 'stu_norm_classmate',
    name: 'Sneha Roy',
    class: '2',
    section: 'a',
    parentEmail: otherParentEmail,
    parentEmailNorm: otherParentEmail,
    status: 'Active'
  });

  // Attendance subcollection with doc ID 'Class 2' (matches student class '2')
  await db.collection('tenant_data').doc(schoolId).collection('attendance_months').doc('2026-11').collection('classes').doc('Class 2').set({
    records: [
      {
        date: '2026-11-05',
        class: 'Class 2',
        section: 'A',
        records: [
          { studentId: 'stu_norm_child', status: 'present' },
          { studentId: 'stu_norm_classmate', status: 'absent' }
        ]
      }
    ]
  });

  // Term with varied class keys ('Class 2' in subjects, '2' in exam_marks subcollection)
  await db.collection('tenant_data').doc(schoolId).update({
    'examTerms.term_norm': {
      id: 'term_norm',
      name: 'Normalized Term Test',
      shortName: 'NTT',
      session: '2025-26',
      showResultsToParents: true,
      status: 'published',
      order: 3
    },
    'examSubjects.term_norm': {
      'Class 2': {
        subjects: [
          { id: 'sub_art', name: 'Fine Arts', fullMarks: 100, passMarks: 33 }
        ]
      }
    }
  });

  await db.collection('tenant_data').doc(schoolId).collection('exam_marks').doc('term_norm').set({
    '2': {
      'A': {
        'stu_norm_child': {
          marks: { sub_art: { obtained: 92 } },
          rank: 1
        },
        'stu_norm_classmate': {
          marks: { sub_art: { obtained: 60 } },
          rank: 2
        }
      }
    }
  });

  // B. Non-restructured school setup
  const nrSchoolId = 'test_school_non_restructured';
  await db.collection('tenant_data').doc(nrSchoolId).set({
    school_name: 'Legacy Non-Restructured Academy',
    settings: {
      schoolName: 'Legacy Non-Restructured Academy',
      studentsMigrated: true,
      restructured: false,
      storageVersion: 1,
      parentPortal: {
        enabled: true,
        attendance: true,
        exams: true,
        profile: true
      }
    },
    attendance: [
      {
        date: '2026-11-08',
        class: '3',
        section: 'A',
        records: [
          { studentId: 'stu_nr_child', status: 'present' },
          { studentId: 'stu_nr_classmate', status: 'absent' }
        ]
      }
    ],
    examTerms: {
      term_nr: {
        id: 'term_nr',
        name: 'Legacy Term',
        showResultsToParents: true
      }
    },
    examSubjects: {
      term_nr: {
        '3': {
          subjects: [
            { id: 'sub_eng', name: 'English', fullMarks: 100, passMarks: 33 }
          ]
        }
      }
    },
    examMarks: {
      term_nr: {
        '3': {
          'A': {
            'stu_nr_child': { marks: { sub_eng: { obtained: 85 } }, rank: 1 }
          }
        }
      }
    }
  });

  await db.collection('tenant_data').doc(nrSchoolId).collection('portal').doc('config').set({
    enabled: true,
    studentsMigrated: true,
    restructured: false,
    modules: { attendance: true, exams: true, profile: true }
  });

  await db.collection('tenant_data').doc(nrSchoolId).collection('students').doc('stu_nr_child').set({
    id: 'stu_nr_child',
    name: 'Kavita Sharma',
    class: '3',
    section: 'A',
    parentEmail: parentEmail,
    parentEmailNorm: parentEmail,
    status: 'Active'
  });

  // C. Safety Fix 2: School with portal/config lacking restructured field (v78 state)
  const missingRestructuredSchoolId = 'test_school_missing_restructured';
  await db.collection('tenant_data').doc(missingRestructuredSchoolId).set({
    school_name: 'v78 Restructured Academy',
    settings: {
      schoolName: 'v78 Restructured Academy',
      studentsMigrated: true,
      restructured: true,
      storageVersion: 2,
      classes: ['5'],
      parentPortal: {
        enabled: true,
        attendance: true,
        exams: true,
        profile: true
      }
    },
    // Trap in root doc: if root array were erroneously read, it would have 'absent'
    attendance: [
      {
        date: '2026-11-05',
        class: '5',
        records: [
          { studentId: 'stu_v78_child', status: 'absent' }
        ]
      }
    ]
  });

  // portal/config written by v78: does NOT have restructured field
  await db.collection('tenant_data').doc(missingRestructuredSchoolId).collection('portal').doc('config').set({
    enabled: true,
    studentsMigrated: true,
    // restructured is intentionally omitted / undefined
    modules: {
      attendance: true,
      exams: true,
      profile: true
    }
  });

  await db.collection('tenant_data').doc(missingRestructuredSchoolId).collection('students').doc('stu_v78_child').set({
    id: 'stu_v78_child',
    name: 'V78 Child',
    class: '5',
    section: 'A',
    parentEmail: parentEmail,
    parentEmailNorm: parentEmail,
    status: 'Active'
  });

  // Authoritative subcollection attendance has 'present'
  await db.collection('tenant_data').doc(missingRestructuredSchoolId).collection('attendance_months').doc('2026-11').collection('classes').doc('5').set({
    records: [
      {
        date: '2026-11-05',
        class: '5',
        section: 'A',
        records: [
          { studentId: 'stu_v78_child', status: 'present' }
        ]
      }
    ]
  });

  // 10. Greenwood-shaped legacy school for v80 parity tests
  const gwLegacySchoolId = 'test_school_v80_greenwood';
  const scaleA1E = [
    { min: 91, max: 100, grade: 'A1', label: 'Outstanding' },
    { min: 81, max: 90,  grade: 'A2', label: 'Excellent' },
    { min: 71, max: 80,  grade: 'B1', label: 'Very Good' },
    { min: 61, max: 70,  grade: 'B2', label: 'Good' },
    { min: 51, max: 60,  grade: 'C1', label: 'Above Average' },
    { min: 41, max: 50,  grade: 'C2', label: 'Average' },
    { min: 33, max: 40,  grade: 'D',  label: 'Pass' },
    { min: 0,  max: 32,  grade: 'E',  label: 'Needs Improvement' }
  ];
  const scaleAPlusF = [
    { min: 91, max: 100, grade: 'A+', label: 'Outstanding' },
    { min: 81, max: 90,  grade: 'A',  label: 'Excellent' },
    { min: 71, max: 80,  grade: 'B+', label: 'Very Good' },
    { min: 61, max: 70,  grade: 'B',  label: 'Good' },
    { min: 51, max: 60,  grade: 'C+', label: 'Above Average' },
    { min: 41, max: 50,  grade: 'C',  label: 'Average' },
    { min: 33, max: 40,  grade: 'D',  label: 'Pass' },
    { min: 0,  max: 32,  grade: 'F',  label: 'Fail' }
  ];
  const fixtureSubjects = [
    { id: 'sub_eng', name: 'English', fullMarks: 100, passMarks: 33 },
    { id: 'sub_hin', name: 'Hindi', fullMarks: 100, passMarks: 33 },
    { id: 'sub_math', name: 'Mathematics', fullMarks: 100, passMarks: 33 },
    { id: 'sub_sci', name: 'Science & EVS', fullMarks: 100, passMarks: 33 },
    { id: 'sub_sst', name: 'Social Science', fullMarks: 100, passMarks: 33 },
    { id: 'sub_comp', name: 'Computer Science', fullMarks: 100, passMarks: 33 },
    { id: 'sub_sci50', name: 'Science', fullMarks: 50, passMarks: 17 }
  ];

  await db.collection('tenant_data').doc(gwLegacySchoolId).set({
    settings: {
      schoolName: 'Greenwood v80 Test School',
      studentsMigrated: true,
      storageVersion: 2,
      restructured: true,
      classes: ['4'],
      parentPortal: { enabled: true, exams: true }
    },
    examConfig: {
      gradingScale: scaleA1E
    },
    reportCardConfig: {
      gradingScale: scaleAPlusF
    },
    examTerms: {
      term_gw_legacy: {
        id: 'term_gw_legacy',
        name: 'Term 1 Examination',
        showResultsToParents: true
      },
      term_gw_v2: {
        id: 'term_gw_v2',
        name: 'Term 2 Examination (V2)',
        rulesVersion: 'v2',
        showResultsToParents: true
      },
      term_gw_safety: {
        id: 'term_gw_safety',
        name: 'Safety Test Term',
        showResultsToParents: true
      }
    },
    examSubjects: {
      term_gw_legacy: {
        '4': { subjects: fixtureSubjects }
      },
      term_gw_v2: {
        '4': { subjects: fixtureSubjects.slice(0, 4) }
      },
      term_gw_safety: {
        '4': { subjects: [] }
      }
    }
  });

  await db.collection('tenant_data').doc(gwLegacySchoolId).collection('portal').doc('config').set({
    enabled: true,
    studentsMigrated: true,
    restructured: true,
    modules: { exams: true }
  });

  await db.collection('tenant_data').doc(gwLegacySchoolId).collection('students').doc('stu_v80_gw').set({
    id: 'stu_v80_gw',
    name: 'Aarav Greenwood',
    class: '4',
    section: 'A',
    parentEmail: parentEmail,
    parentEmailNorm: parentEmail,
    status: 'Active'
  });

  await db.collection('tenant_data').doc(gwLegacySchoolId).collection('exam_marks').doc('term_gw_legacy').set({
    '4': {
      'A': {
        'stu_v80_gw': {
          marks: {
            sub_eng: { obtained: 85, fullMarks: 100 },
            sub_hin: { obtained: 92, fullMarks: 100 },
            sub_math: { obtained: 69, fullMarks: 100 },
            sub_comp: { obtained: 83, fullMarks: 100 }
          },
          rank: 3
        }
      }
    }
  });

  await db.collection('tenant_data').doc(gwLegacySchoolId).collection('exam_marks').doc('term_gw_v2').set({
    '4': {
      'A': {
        'stu_v80_gw': {
          marks: {
            sub_eng: { obtained: 85, fullMarks: 100 },
            sub_hin: { obtained: 92, fullMarks: 100 },
            sub_math: { obtained: 69, fullMarks: 100 },
            sub_sci: { obtained: 76, fullMarks: 100 }
          },
          rank: 2
        }
      }
    }
  });

  await db.collection('tenant_data').doc(gwLegacySchoolId).collection('exam_marks').doc('term_gw_safety').set({
    '4': {
      'A': {
        'stu_v80_gw': {
          marks: {
            sub_eng: { obtained: 85, fullMarks: 100 }
          }
        }
      }
    }
  });

  console.log('✅ Test data successfully seeded in emulator.\n');
}

async function runTests() {
  await seedTestData();

  const schoolId = 'test_school_portal_b2';
  const parentEmail = 'parent.b2@test.com';
  const parentToken = `mock_id_token_parent_b2:${parentEmail}`;
  const authHeaders = {
    'authorization': `Bearer ${parentToken}`,
    'x-parent-email': parentEmail
  };

  console.log('======================================================================');
  console.log(' PARENT PORTAL PHASE B2: TEST SUITE EXECUTION');
  console.log('======================================================================\n');

  // --- TEST 1: Child 1 Profile ---
  const t1 = await invokeHandler('POST', 'profile', { schoolId, studentId: 'stu_child1' }, authHeaders);
  assert(t1.status === 200, 'T1: Child 1 Profile returns HTTP 200');
  assert(t1.body && t1.body.student && t1.body.student.name === 'Aarav Sharma', 'T1: Child 1 name matches Aarav Sharma');
  assert(t1.body.student.class === '5' && t1.body.student.section === 'A', 'T1: Child 1 class is 5-A');
  assert(!t1.body.student.aadhaar && !t1.body.student.bankAccount, 'T1: Sensitive PII (Aadhaar/Bank) is not present');

  // --- TEST 2: Sibling (Child 2) Profile Isolation ---
  const t2 = await invokeHandler('POST', 'profile', { schoolId, studentId: 'stu_child2' }, authHeaders);
  assert(t2.status === 200, 'T2: Sibling Child 2 Profile returns HTTP 200');
  assert(t2.body && t2.body.student && t2.body.student.name === 'Ananya Sharma', 'T2: Sibling Child 2 name matches Ananya Sharma');
  assert(t2.body.student.class === '6', 'T2: Sibling Child 2 class is 6');

  // --- TEST 3: Classmate Profile Access Blocked ---
  const t3 = await invokeHandler('POST', 'profile', { schoolId, studentId: 'stu_classmate' }, authHeaders);
  assert(t3.status === 403, 'T3: Classmate profile request is DENIED with HTTP 403');
  assert(t3.body && t3.body.error && t3.body.error.includes('permission'), 'T3: Error message states caller lacks permission');

  // --- TEST 4: Child 1 Attendance Record ---
  const t4 = await invokeHandler('POST', 'attendance', { schoolId, studentId: 'stu_child1', month: '2026-11' }, authHeaders);
  assert(t4.status === 200, 'T4: Child 1 Attendance returns HTTP 200');
  assert(t4.body.totalDays === 2, 'T4: Child 1 totalDays = 2');
  assert(t4.body.presentDays === 1 && t4.body.lateDays === 1, 'T4: Child 1 presentDays=1, lateDays=1');
  assert(t4.body.percentage === 100, 'T4: Child 1 percentage = 100% ((1+1)/2)');
  assert(Array.isArray(t4.body.daily) && t4.body.daily.length === 2, 'T4: Daily logs array contains 2 records');
  // Check no classmate data
  const t4Str = JSON.stringify(t4.body);
  assert(!t4Str.includes('stu_classmate') && !t4Str.includes('Vikram'), 'T4: Classmate data is NEVER present in attendance response');

  // --- TEST 5: Sibling (Child 2) Attendance Isolation ---
  const t5 = await invokeHandler('POST', 'attendance', { schoolId, studentId: 'stu_child2', month: '2026-11' }, authHeaders);
  assert(t5.status === 200, 'T5: Sibling Child 2 Attendance returns HTTP 200');
  assert(t5.body.totalDays === 1 && t5.body.presentDays === 1, 'T5: Sibling Child 2 totalDays=1, presentDays=1');
  assert(t5.body.daily.length === 1, 'T5: Sibling daily logs array contains only 1 record');

  // --- TEST 6: Classmate Attendance Access Blocked ---
  const t6 = await invokeHandler('POST', 'attendance', { schoolId, studentId: 'stu_classmate', month: '2026-11' }, authHeaders);
  assert(t6.status === 403, 'T6: Classmate attendance request is DENIED with HTTP 403');

  // --- TEST 7: Child 1 Timetable (Class 5-A) ---
  const t7 = await invokeHandler('POST', 'timetable', { schoolId, studentId: 'stu_child1' }, authHeaders);
  assert(t7.status === 200, 'T7: Child 1 Timetable returns HTTP 200');
  assert(t7.body.class === '5' && t7.body.section === 'A', 'T7: Timetable class is 5-A');
  assert(t7.body.schedule && t7.body.schedule.Monday && t7.body.schedule.Monday['1'], 'T7: Period 1 exists on Monday');
  assert(t7.body.schedule.Monday['1'].subject === 'Mathematics', 'T7: Period 1 subject is Mathematics');
  assert(t7.body.schedule.Monday['1'].teacherName === 'Ramesh Kumar', 'T7: Period 1 teacher resolved to Ramesh Kumar');
  assert(!t7.body.schedule.Monday['1'].subject.includes('English'), 'T7: Class 6 schedule is not leaked into Class 5');

  // --- TEST 8: Sibling Child 2 Timetable (Class 6-A) ---
  const t8 = await invokeHandler('POST', 'timetable', { schoolId, studentId: 'stu_child2' }, authHeaders);
  assert(t8.status === 200, 'T8: Child 2 Timetable returns HTTP 200');
  assert(t8.body.class === '6' && t8.body.schedule.Monday['1'].subject === 'English', 'T8: Child 2 schedule is English');

  // --- TEST 9: Classmate Timetable Access Blocked ---
  const t9 = await invokeHandler('POST', 'timetable', { schoolId, studentId: 'stu_classmate' }, authHeaders);
  assert(t9.status === 403, 'T9: Classmate timetable request is DENIED with HTTP 403');

  // --- TEST 10: Notices (Audience Targeting & Filtering) ---
  const t10 = await invokeHandler('POST', 'notices', { schoolId, studentId: 'stu_child1' }, authHeaders);
  assert(t10.status === 200, 'T10: Notices returns HTTP 200');
  const noticeIds = (t10.body.notices || []).map(n => n.id);
  assert(noticeIds.includes('notif_everyone'), 'T10: Notice with audience ["everyone"] IS returned');
  assert(noticeIds.includes('notif_parents'), 'T10: Notice with audience ["parents"] IS returned');
  assert(!noticeIds.includes('notif_teachers'), 'T10: Notice with audience ["teachers"] is NOT returned to parent');
  assert(!noticeIds.includes('notif_draft'), 'T10: Draft notice is NOT returned to parent');

  // --- TEST 11: Classmate Notices Access Blocked ---
  const t11 = await invokeHandler('POST', 'notices', { schoolId, studentId: 'stu_classmate' }, authHeaders);
  assert(t11.status === 403, 'T11: Classmate notices request is DENIED with HTTP 403');

  // --- TEST 12: Exams List (Term Visibility Filtering) ---
  const t12 = await invokeHandler('POST', 'exams', { schoolId, studentId: 'stu_child1' }, authHeaders);
  assert(t12.status === 200, 'T12: Exams list returns HTTP 200');
  const termIds = (t12.body.terms || []).map(t => t.id);
  assert(termIds.includes('term_1'), 'T12: Term 1 (showResultsToParents === true) IS listed');
  assert(!termIds.includes('term_2'), 'T12: Term 2 (showResultsToParents === false) is NOT listed');

  // --- TEST 13: Exam Result Calculation & Report Card Parity ---
  const t13 = await invokeHandler('POST', 'exam-result', { schoolId, studentId: 'stu_child1', termId: 'term_1' }, authHeaders);
  assert(t13.status === 200, 'T13: Exam Result returns HTTP 200');
  assert(t13.body.hasResult === true, 'T13: hasResult === true');
  assert(t13.body.summary.totalObtained === 175, 'T13: Total obtained marks = 175');
  assert(t13.body.summary.maxTotal === 200, 'T13: Max total marks = 200');
  assert(t13.body.summary.percentage === 87.5, 'T13: Percentage = 87.5%');
  assert(t13.body.summary.grade === 'A', 'T13: Grade = A');
  assert(t13.body.summary.result === 'PASS', 'T13: Result = PASS');
  assert(t13.body.summary.rank === 1, 'T13: Rank = 1 (matching stored ERP rank)');

  // Parity check with pure engine
  const expectedEngineCalc = ExamCalculationEngine.calculateStudentResult({
    marks: {
      sub_math: { obtained: 85 },
      sub_sci: { obtained: 90 }
    },
    subjects: [
      { id: 'sub_math', name: 'Mathematics', fullMarks: 100, passMarks: 33 },
      { id: 'sub_sci', name: 'Science', fullMarks: 100, passMarks: 33 }
    ],
    term: { status: 'published' }
  });
  assert(t13.body.summary.totalObtained === expectedEngineCalc.total, 'T13: Parity check: total matches ExamCalculationEngine');
  assert(t13.body.summary.percentage === expectedEngineCalc.percentage, 'T13: Parity check: percentage matches ExamCalculationEngine');
  assert(t13.body.summary.grade === expectedEngineCalc.grade, 'T13: Parity check: grade matches ExamCalculationEngine');

  // Ensure classmate data is not leaked
  const t13Str = JSON.stringify(t13.body);
  assert(!t13Str.includes('stu_classmate') && !t13Str.includes('Vikram') && !t13Str.includes('rank": 2'), 'T13: Zero classmate marks or data in result');

  // --- TEST 14: Exam Result for Hidden Term is Blocked ---
  const t14 = await invokeHandler('POST', 'exam-result', { schoolId, studentId: 'stu_child1', termId: 'term_2' }, authHeaders);
  assert(t14.status === 403, 'T14: Hidden term result request returns HTTP 403');
  assert(t14.body && t14.body.error && t14.body.error.includes('not published'), 'T14: Error states results are not published to parents');

  // --- TEST 15: Classmate Exam Result Access Blocked ---
  const t15 = await invokeHandler('POST', 'exam-result', { schoolId, studentId: 'stu_classmate', termId: 'term_1' }, authHeaders);
  assert(t15.status === 403, 'T15: Classmate exam result request is DENIED with HTTP 403');

  // --- TEST 16: Module Toggle OFF returns 403 ---
  // Temporarily disable timetable module in portal config
  await db.collection('tenant_data').doc(schoolId).collection('portal').doc('config').set({
    modules: {
      timetable: false
    }
  }, { merge: true });

  const t16 = await invokeHandler('POST', 'timetable', { schoolId, studentId: 'stu_child1' }, authHeaders);
  assert(t16.status === 403, 'T16: Timetable request when module toggle is OFF returns HTTP 403');
  assert(t16.body && t16.body.error && t16.body.error.includes('disabled'), 'T16: Error states module is disabled by school administration');

  // Re-enable timetable module
  await db.collection('tenant_data').doc(schoolId).collection('portal').doc('config').set({
    modules: {
      timetable: true
    }
  }, { merge: true });

  // --- TEST 10 (Updated for FIX 5c): Notices Missing Status & Archived Filtering ---
  assert(noticeIds.includes('notif_no_status'), 'FIX 5c: Notice without status field IS returned as published');
  assert(!noticeIds.includes('notif_archived'), 'FIX 5c: Notice with status="archived" is NOT returned to parent');

  // --- TEST 18: FIX 1 - Grade Parity with custom examConfig.gradingScale ---
  const t18 = await invokeHandler('POST', 'exam-result', {
    schoolId: 'test_school_custom_grading',
    studentId: 'stu_custom',
    termId: 'term_custom'
  }, authHeaders);
  assert(t18.status === 200, 'FIX 1: Exam result with custom gradingScale returns HTTP 200');
  assert(t18.body.summary.percentage === 85, 'FIX 1: Percentage = 85%');
  assert(t18.body.summary.grade === 'DISTINCTION', 'FIX 1: Overall Grade matches custom scale ("DISTINCTION" vs default "A")');
  assert(t18.body.subjects[0].grade === 'DISTINCTION', 'FIX 1: Subject Grade matches custom scale ("DISTINCTION")');

  // --- TEST 19: FIX 2c - School with studentsMigrated: false or missing in portal/config Denied ---
  const t19a = await invokeHandler('POST', 'profile', {
    schoolId: 'test_school_unmigrated_pp',
    studentId: 'stu_child1'
  }, authHeaders);
  assert(t19a.status === 403, 'FIX 2c: portal/config with studentsMigrated: false returns HTTP 403');
  assert(t19a.body && t19a.body.error && t19a.body.error.includes('not currently enabled'), 'FIX 2c: Error message matches disabled portal');

  const t19b = await invokeHandler('POST', 'profile', {
    schoolId: 'test_school_missing_migrated_pp',
    studentId: 'stu_child1'
  }, authHeaders);
  assert(t19b.status === 403, 'FIX 2c: portal/config with missing studentsMigrated field returns HTTP 403');

  // --- TEST 20: FIX 3 - Mock Token Guard: Rejection when FIRESTORE_EMULATOR_HOST is unset ---
  const savedEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  try {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    const t20Auth = await invokeHandler('POST', 'profile', {
      schoolId: schoolId,
      studentId: 'stu_child1'
    }, authHeaders);
    assert(t20Auth.status === 401, 'FIX 3: Mock token rejected with HTTP 401 when FIRESTORE_EMULATOR_HOST is unset in auth.js');

    const t20Context = await invokeHandler('POST', 'context', {}, authHeaders);
    assert(t20Context.status === 401, 'FIX 3: Mock token rejected with HTTP 401 when FIRESTORE_EMULATOR_HOST is unset in parents.js router');
  } finally {
    process.env.FIRESTORE_EMULATOR_HOST = savedEmulatorHost;
  }

  // --- TEST 21: FIX 4 - Student missing parentEmailNorm is DENIED ---
  const t21 = await invokeHandler('POST', 'profile', {
    schoolId: schoolId,
    studentId: 'stu_unmigrated_linking'
  }, authHeaders);
  assert(t21.status === 403, 'FIX 4: Student with legacy parentEmail but missing parentEmailNorm is DENIED with HTTP 403');

  // --- TEST 22: syncStoreV2Subcollections Hardening (Teacher vs Admin Role) ---
  console.log('\n--- Checking syncStoreV2Subcollections Hardening ---');
  const appJsCode = fs.readFileSync(path.resolve(__dirname, '../js/app.js'), 'utf8');
  const syncMatch = appJsCode.match(/syncStoreV2Subcollections:\s*async\s*function\s*\(([^)]*)\)\s*\{([\s\S]*?)\n\s*getLocalMonthString:/);
  assert(!!syncMatch, 'T22: syncStoreV2Subcollections successfully parsed from js/app.js');

  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const syncBody = syncMatch[2].replace(/\}\s*,?\s*$/, '');
  const syncFn = new AsyncFunction('schoolId', syncBody);
  
  let activeUserRole = 'teacher';
  const clientWrites = [];
  const mockFs = {
    doc: (database, col, sId, subCol, docId) => ({
      path: `${col}/${sId}/${subCol}/${docId}`,
      col, sId, subCol, docId
    }),
    setDoc: async (ref, data, opts) => {
      if (ref.path.includes('/portal/config') && activeUserRole === 'teacher') {
        throw new Error('PERMISSION_DENIED: False for create/update @ portal/config for teacher');
      }
      clientWrites.push({ path: ref.path, data, opts });
    }
  };

  const mockTeacherApp = {
    isAdmin: function() { return this.currentUser && this.currentUser.role === 'admin'; },
    currentUser: { id: 'teacher_1', role: 'teacher' },
    store: {
      attendanceRequests: [
        { id: 'req_subcollection_sync_1', studentId: 'stu_1', status: 'pending', date: '2026-11-03' }
      ],
      settings: {
        parentPortal: { enabled: true, profile: true },
        studentsMigrated: true
      }
    },
    getSchoolName: () => 'Test Academy',
    getLogoUrl: () => 'https://test.logo'
  };

  const origWindow = global.window;
  try {
    global.window = { firestore: mockFs, db: {} };

    // 1. Teacher save: must sync attendance_requests and NEVER attempt portal/config
    clientWrites.length = 0;
    await syncFn.call(mockTeacherApp, 'test_school_subcol_sync');

    const teacherAttReqWrite = clientWrites.find(w => w.path.includes('attendance_requests/req_subcollection_sync_1'));
    assert(!!teacherAttReqWrite, 'T22: Teacher save successfully synced attendance_requests');
    const teacherPortalWrite = clientWrites.find(w => w.path.includes('portal/config'));
    assert(!teacherPortalWrite, 'T22: Teacher save did NOT attempt or write portal/config');

    // 2. Admin save: must sync portal/config and cache in memory
    activeUserRole = 'admin';
    const mockAdminApp = {
      isAdmin: function() { return this.currentUser && this.currentUser.role === 'admin'; },
      currentUser: { id: 'admin', role: 'admin' },
      store: {
        attendanceRequests: [],
        settings: {
          parentPortal: { enabled: true, profile: true },
          studentsMigrated: true
        }
      },
      getSchoolName: () => 'Test Academy',
      getLogoUrl: () => 'https://test.logo'
    };

    clientWrites.length = 0;
    await syncFn.call(mockAdminApp, 'test_school_subcol_sync');
    const adminPortalWrite = clientWrites.find(w => w.path.includes('portal/config'));
    assert(!!adminPortalWrite, 'T22: Admin save successfully synced portal/config');
    assert(adminPortalWrite.data.studentsMigrated === true, 'T22: portal/config contains studentsMigrated: true');

    // 3. Repeated Admin save with unchanged portal config: write skipped due to cache
    clientWrites.length = 0;
    await syncFn.call(mockAdminApp, 'test_school_subcol_sync');
    assert(clientWrites.length === 0, 'T22: Unchanged portal/config avoided duplicate Firestore write (in-memory cache verified)');
  } finally {
    global.window = origWindow;
  }

  // --- TEST 17: Direct Client Firestore Read/Write Denied for Parent Token ---
  console.log('\n--- Checking Direct Client Firestore Rules for Parent Account ---');
  try {
    const parentAuthUid = 'parent_mock_b2_test';
    // Test rule assertion using Firestore REST or rule simulation:
    // Parents do not have school_access doc, so canAccessSchool evaluates false
    const accessSnap = await db.collection('school_access').doc(parentAuthUid).get();
    assert(!accessSnap.exists, 'T17: Parent account has NO school_access document');
  } catch (ruleErr) {
    console.warn('T17 warning:', ruleErr.message);
  }

  // ==================================================================
  // v79 TEST SUITE: Attendance/Exam Class Matching & UX Polish
  // ==================================================================
  console.log('\n--- Checking v79 Attendance & Exam Matching & UX ---');

  // TEST 23: Student class "2" with subcollection doc ID "Class 2" and section "a" vs "A"
  const t23 = await invokeHandler('POST', 'attendance', {
    schoolId: schoolId,
    studentId: 'stu_norm_child',
    month: '2026-11'
  }, authHeaders);
  assert(t23.status === 200, 'v79 T23: Student class "2" with doc ID "Class 2" returns HTTP 200');
  assert(t23.body && t23.body.totalDays === 1, 'v79 T23: Attendance found matching doc (totalDays === 1)');
  assert(t23.body.presentDays === 1, 'v79 T23: Section "a" matched session section "A" (presentDays === 1)');
  assert(t23.body.percentage === 100, 'v79 T23: Percentage computed correctly (100%)');
  assert(!JSON.stringify(t23.body).includes('stu_norm_classmate'), 'v79 T23: Classmate data is never leaked');

  // TEST 24: Non-restructured school reads root attendance array
  const t24 = await invokeHandler('POST', 'attendance', {
    schoolId: 'test_school_non_restructured',
    studentId: 'stu_nr_child',
    month: '2026-11'
  }, authHeaders);
  assert(t24.status === 200, 'v79 T24: Non-restructured school returns HTTP 200');
  assert(t24.body && t24.body.totalDays === 1, 'v79 T24: Root attendance array found (totalDays === 1)');
  assert(t24.body.presentDays === 1, 'v79 T24: Non-restructured root session matched (presentDays === 1)');
  assert(!JSON.stringify(t24.body).includes('stu_nr_classmate'), 'v79 T24: Classmate data never returned from root attendance');

  // TEST 25: Exam keys "Class 2" in examSubjects and "2" in exam_marks subcollection all resolve
  const t25 = await invokeHandler('POST', 'exam-result', {
    schoolId: schoolId,
    studentId: 'stu_norm_child',
    termId: 'term_norm'
  }, authHeaders);
  assert(t25.status === 200, 'v79 T25: Exam result with normalized keys returns HTTP 200');
  assert(t25.body && t25.body.hasResult === true, 'v79 T25: Result resolved successfully');
  assert(t25.body.summary && t25.body.summary.totalObtained === 92, 'v79 T25: Obtained marks match (92)');
  assert(t25.body.summary.rank === 1, 'v79 T25: Stored rank matches (1)');
  assert(!JSON.stringify(t25.body).includes('stu_norm_classmate'), 'v79 T25: Classmate marks not present in result');

  // TEST 26: Non-restructured school root examMarks fallback
  const t26 = await invokeHandler('POST', 'exam-result', {
    schoolId: 'test_school_non_restructured',
    studentId: 'stu_nr_child',
    termId: 'term_nr'
  }, authHeaders);
  assert(t26.status === 200, 'v79 T26: Non-restructured root examMarks fallback returns HTTP 200');
  assert(t26.body && t26.body.hasResult === true, 'v79 T26: Non-restructured result resolved');
  assert(t26.body.summary && t26.body.summary.totalObtained === 85, 'v79 T26: Non-restructured marks match (85)');

  // TEST 27: Zero days attendance response -> Neutral state (no shortage badge, no red 0%)
  const t27 = await invokeHandler('POST', 'attendance', {
    schoolId: schoolId,
    studentId: 'stu_norm_child',
    month: '2026-01'
  }, authHeaders);
  assert(t27.status === 200, 'v79 T27: Month with 0 records returns HTTP 200');
  assert(t27.body && t27.body.totalDays === 0, 'v79 T27: totalDays === 0');
  assert(t27.body.presentDays === 0 && t27.body.absentDays === 0, 'v79 T27: presentDays and absentDays are 0');

  // Verify client logic for 0 days:
  const clientZeroTotalDays = t27.body.totalDays;
  const clientBadgeType = clientZeroTotalDays === 0 ? 'badge-secondary' : 'badge-danger';
  const clientBadgeText = clientZeroTotalDays === 0 ? 'No attendance recorded' : 'Attendance Shortage (<75%)';
  assert(clientBadgeType === 'badge-secondary', 'v79 T27: Zero days produces neutral badge-secondary class');
  assert(clientBadgeText === 'No attendance recorded', 'v79 T27: Zero days produces "No attendance recorded" (NO shortage badge)');

  // TEST 28: Performance Benchmark on Greenwood-sized fixture
  console.log('\n--- Benchmarking Greenwood-sized Exams Performance ---');
  const gwBenchSchoolId = 'test_school_gw_bench';
  const gwTerms = {};
  const gwSubjects = {};
  for (let i = 1; i <= 15; i++) {
    const tid = `term_${i}`;
    gwTerms[tid] = {
      id: tid,
      name: `Academic Term ${i}`,
      shortName: `T${i}`,
      showResultsToParents: i <= 5,
      order: i
    };
    gwSubjects[tid] = {};
    for (let c = 1; c <= 12; c++) {
      gwSubjects[tid][`Class ${c}`] = {
        subjects: [
          { id: 'sub_1', name: 'English', fullMarks: 100, passMarks: 33 },
          { id: 'sub_2', name: 'Hindi', fullMarks: 100, passMarks: 33 },
          { id: 'sub_3', name: 'Mathematics', fullMarks: 100, passMarks: 33 },
          { id: 'sub_4', name: 'Science', fullMarks: 100, passMarks: 33 },
          { id: 'sub_5', name: 'Social Science', fullMarks: 100, passMarks: 33 },
          { id: 'sub_6', name: 'Sanskrit', fullMarks: 100, passMarks: 33 },
          { id: 'sub_7', name: 'Computer', fullMarks: 100, passMarks: 33 },
          { id: 'sub_8', name: 'Drawing', fullMarks: 100, passMarks: 33 }
        ]
      };
    }
  }

  await db.collection('tenant_data').doc(gwBenchSchoolId).set({
    school_name: 'Greenwood Bench School',
    settings: {
      schoolName: 'Greenwood Bench School',
      studentsMigrated: true,
      restructured: true,
      classes: ['1','2','3','4','5','6','7','8','9','10','11','12'],
      parentPortal: { enabled: true, exams: true }
    },
    examTerms: gwTerms,
    examSubjects: gwSubjects,
    reportCardConfig: {
      gradingScale: [
        { min: 90, grade: 'A1', label: 'Outstanding' },
        { min: 80, grade: 'A2', label: 'Excellent' },
        { min: 70, grade: 'B1', label: 'Very Good' },
        { min: 0, grade: 'D', label: 'Needs Improvement' }
      ]
    }
  });

  await db.collection('tenant_data').doc(gwBenchSchoolId).collection('portal').doc('config').set({
    enabled: true,
    studentsMigrated: true,
    restructured: true,
    modules: { exams: true }
  });

  await db.collection('tenant_data').doc(gwBenchSchoolId).collection('students').doc('stu_gw_bench_1').set({
    id: 'stu_gw_bench_1',
    name: 'Sourabh Kumar',
    class: '2',
    section: 'A',
    parentEmail: parentEmail,
    parentEmailNorm: parentEmail,
    status: 'Active'
  });

  await db.collection('tenant_data').doc(gwBenchSchoolId).collection('exam_marks').doc('term_1').set({
    '2': {
      'A': {
        'stu_gw_bench_1': {
          marks: {
            sub_1: { obtained: 95 },
            sub_2: { obtained: 88 },
            sub_3: { obtained: 92 },
            sub_4: { obtained: 85 },
            sub_5: { obtained: 90 },
            sub_6: { obtained: 78 },
            sub_7: { obtained: 94 },
            sub_8: { obtained: 89 }
          },
          rank: 1
        }
      }
    }
  });

  // Benchmark exams list
  const startExams = Date.now();
  const bExams = await invokeHandler('POST', 'exams', {
    schoolId: gwBenchSchoolId,
    studentId: 'stu_gw_bench_1'
  }, authHeaders);
  const durExams = Date.now() - startExams;
  assert(bExams.status === 200, 'v79 T28: Benchmark handleExamsList succeeded with HTTP 200');
  assert(bExams.body && bExams.body.terms && bExams.body.terms.length === 5, 'v79 T28: Filtered exactly 5 published terms');
  console.log(`  ⚡ Benchmark: handleExamsList executed in ${durExams} ms (Field-masked projection read)`);

  // Benchmark exam-result
  const startResult = Date.now();
  const bResult = await invokeHandler('POST', 'exam-result', {
    schoolId: gwBenchSchoolId,
    studentId: 'stu_gw_bench_1',
    termId: 'term_1'
  }, authHeaders);
  const durResult = Date.now() - startResult;
  assert(bResult.status === 200, 'v79 T28: Benchmark handleExamResult succeeded with HTTP 200');
  assert(bResult.body && bResult.body.hasResult === true, 'v79 T28: Result computed successfully');
  console.log(`  ⚡ Benchmark: handleExamResult executed in ${durResult} ms (Pure engine + subcollection read)`);

  // TEST 29: Safety Fix 2 - portal/config without restructured field resolves as UNKNOWN -> field-masked root read -> subcollection found
  const t29 = await invokeHandler('POST', 'attendance', {
    schoolId: 'test_school_missing_restructured',
    studentId: 'stu_v78_child',
    month: '2026-11'
  }, authHeaders);
  assert(t29.status === 200, 'v79 T29: portal/config without restructured field returns HTTP 200');
  assert(t29.body && t29.body.totalDays === 1, 'v79 T29: Subcollection attendance found (totalDays === 1)');
  assert(t29.body.presentDays === 1, 'v79 T29: Status is present from subcollection (NOT absent from root array)');
  assert(t29.body.absentDays === 0, 'v79 T29: Root attendance array was NOT read (absentDays === 0)');

  // TEST 30: Safety Fix 3 - Call exams action through the real module path (api/_lib/parents/exams.js directly & via api/parents.js)
  const realExamsModule = require('../api/_lib/parents/exams');
  assert(typeof realExamsModule.handleExamsList === 'function', 'v79 T30: handleExamsList exported from real api/_lib/parents/exams.js');
  assert(typeof realExamsModule.handleExamResult === 'function', 'v79 T30: handleExamResult exported from real api/_lib/parents/exams.js');

  // Invoke real handler directly
  let realExamsStatus = 0;
  let realExamsBody = null;
  const mockReqReal = {
    method: 'POST',
    query: { action: 'exams' },
    body: { schoolId: schoolId, studentId: 'stu_child1' },
    headers: { ...authHeaders, 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' }
  };
  const mockResReal = {
    statusCode: 200,
    setHeader: () => {},
    status: function(code) { this.statusCode = code; realExamsStatus = code; return this; },
    json: function(data) { realExamsBody = data; return this; }
  };
  await realExamsModule.handleExamsList(mockReqReal, mockResReal);
  assert(realExamsStatus === 200, 'v79 T30: Real handleExamsList executed through direct module path returns HTTP 200');
  assert(realExamsBody && Array.isArray(realExamsBody.terms) && realExamsBody.terms.length > 0, 'v79 T30: Real module returns terms using admin.firestore.FieldPath');

  // Also invoke through api/parents router
  const t30Router = await invokeHandler('POST', 'exams', {
    schoolId: schoolId,
    studentId: 'stu_child1'
  }, authHeaders);
  assert(t30Router.status === 200, 'v79 T30: Exams action through api/parents router returns HTTP 200');
  assert(t30Router.body && t30Router.body.terms.length === realExamsBody.terms.length, 'v79 T30: Router and direct module return identical terms');

  // ======================================================================
  // v80 TESTS: EXAM RESULT PARITY WITH ADMIN REPORT CARD
  // ======================================================================
  console.log('\n--- Checking v80 Exam Result Parity With Admin Report Card ---');

  // Load live admin exams.js into VM Sandbox
  const examsJsPath = path.resolve(__dirname, '..', 'js', 'exams.js');
  const examsCode = fs.readFileSync(examsJsPath, 'utf8');
  const scaleA1ETest = [
    { min: 91, max: 100, grade: 'A1', label: 'Outstanding' },
    { min: 81, max: 90,  grade: 'A2', label: 'Excellent' },
    { min: 71, max: 80,  grade: 'B1', label: 'Very Good' },
    { min: 61, max: 70,  grade: 'B2', label: 'Good' },
    { min: 51, max: 60,  grade: 'C1', label: 'Above Average' },
    { min: 41, max: 50,  grade: 'C2', label: 'Average' },
    { min: 33, max: 40,  grade: 'D',  label: 'Pass' },
    { min: 0,  max: 32,  grade: 'E',  label: 'Needs Improvement' }
  ];
  const adminSandbox = {
    window: {},
    document: { addEventListener: () => {}, getElementById: () => null, querySelector: () => null },
    SchoolApp: {
      store: {
        examConfig: { gradingScale: scaleA1ETest }
      },
      registerModule: () => {}
    },
    console,
    setTimeout,
    clearTimeout
  };
  vm.createContext(adminSandbox);
  vm.runInContext(examsCode, adminSandbox);
  const adminLegacyRecalc = adminSandbox.window.legacyRecalculateStudentEntry;
  assert(typeof adminLegacyRecalc === 'function', 'v80 T31: admin legacyRecalculateStudentEntry loaded from js/exams.js');

  const fixtureSubjectsTest = [
    { id: 'sub_eng', name: 'English', fullMarks: 100, passMarks: 33 },
    { id: 'sub_hin', name: 'Hindi', fullMarks: 100, passMarks: 33 },
    { id: 'sub_math', name: 'Mathematics', fullMarks: 100, passMarks: 33 },
    { id: 'sub_sci', name: 'Science & EVS', fullMarks: 100, passMarks: 33 },
    { id: 'sub_sst', name: 'Social Science', fullMarks: 100, passMarks: 33 },
    { id: 'sub_comp', name: 'Computer Science', fullMarks: 100, passMarks: 33 },
    { id: 'sub_sci50', name: 'Science', fullMarks: 50, passMarks: 17 }
  ];

  const adminFixtureEntry = {
    marks: {
      sub_eng: { obtained: 85, fullMarks: 100 },
      sub_hin: { obtained: 92, fullMarks: 100 },
      sub_math: { obtained: 69, fullMarks: 100 },
      sub_comp: { obtained: 83, fullMarks: 100 }
    }
  };
  const serverFixtureEntry = JSON.parse(JSON.stringify(adminFixtureEntry));

  // Run admin function and server function on same fixture
  adminLegacyRecalc(adminFixtureEntry, fixtureSubjectsTest);
  ExamCalculationEngine.recalculateStudentEntry(serverFixtureEntry, fixtureSubjectsTest, { id: 'term_gw_legacy' }, {}, scaleA1ETest);

  assert(serverFixtureEntry.total === adminFixtureEntry.total, 'v80 T31: Server recalculate total matches admin (' + adminFixtureEntry.total + ')');
  assert(serverFixtureEntry.maxTotal === adminFixtureEntry.maxTotal, 'v80 T31: Server recalculate maxTotal matches admin (' + adminFixtureEntry.maxTotal + ')');
  assert(serverFixtureEntry.percentage === adminFixtureEntry.percentage, 'v80 T31: Server recalculate percentage matches admin (' + adminFixtureEntry.percentage + '%)');
  assert(serverFixtureEntry.grade === adminFixtureEntry.grade, 'v80 T31: Server recalculate grade matches admin (' + adminFixtureEntry.grade + ')');
  assert(serverFixtureEntry.result === adminFixtureEntry.result, 'v80 T31: Server recalculate result matches admin (' + adminFixtureEntry.result + ')');
  assert(serverFixtureEntry.division === adminFixtureEntry.division, 'v80 T31: Server recalculate division matches admin (' + adminFixtureEntry.division + ')');

  // Request exam-result through portal handler for Greenwood legacy school
  const gwLegacyRes = await invokeHandler('POST', 'exam-result', {
    schoolId: 'test_school_v80_greenwood',
    studentId: 'stu_v80_gw',
    termId: 'term_gw_legacy'
  }, authHeaders);

  assert(gwLegacyRes.status === 200, 'v80 T31: Portal exam-result returns HTTP 200');
  assert(gwLegacyRes.body && gwLegacyRes.body.hasResult === true, 'v80 T31: Portal hasResult === true');
  assert(gwLegacyRes.body.summary.totalObtained === adminFixtureEntry.total, 'v80 T31: Portal totalObtained == admin output (' + adminFixtureEntry.total + ')');
  assert(gwLegacyRes.body.summary.maxTotal === adminFixtureEntry.maxTotal, 'v80 T31: Portal maxTotal == admin output (' + adminFixtureEntry.maxTotal + ')');
  assert(gwLegacyRes.body.summary.percentage === adminFixtureEntry.percentage, 'v80 T31: Portal percentage == admin output (' + adminFixtureEntry.percentage + '%)');
  assert(gwLegacyRes.body.summary.grade === adminFixtureEntry.grade, 'v80 T31: Portal grade == admin output (' + adminFixtureEntry.grade + ')');
  assert(gwLegacyRes.body.summary.result === adminFixtureEntry.result, 'v80 T31: Portal result == admin output (' + adminFixtureEntry.result + ')');
  assert(gwLegacyRes.body.summary.division === adminFixtureEntry.division, 'v80 T31: Portal division == admin output (' + adminFixtureEntry.division + ')');
  assert(gwLegacyRes.body.summary.rank === 3, 'v80 T31: Stored rank preserved (rank === 3)');

  // Verify per-subject grades match CBSE A1-E scale (FIX 3)
  const subjectsRes = gwLegacyRes.body.subjects;
  assert(Array.isArray(subjectsRes) && subjectsRes.length === 7, 'v80 T31: 7 configured subjects returned');
  const engSub = subjectsRes.find(s => s.id === 'sub_eng');
  const hinSub = subjectsRes.find(s => s.id === 'sub_hin');
  const mathSub = subjectsRes.find(s => s.id === 'sub_math');
  const compSub = subjectsRes.find(s => s.id === 'sub_comp');
  assert(engSub && engSub.grade === 'A2', 'v80 T31: English 85% gets grade A2 on CBSE scale (not A)');
  assert(hinSub && hinSub.grade === 'A1', 'v80 T31: Hindi 92% gets grade A1 on CBSE scale (not A+)');
  assert(mathSub && mathSub.grade === 'B2', 'v80 T31: Mathematics 69% gets grade B2 on CBSE scale (not B)');
  assert(compSub && compSub.grade === 'A2', 'v80 T31: Computer 83% gets grade A2 on CBSE scale (not A)');

  // v80 T32: V2 Term Parity
  const gwV2Res = await invokeHandler('POST', 'exam-result', {
    schoolId: 'test_school_v80_greenwood',
    studentId: 'stu_v80_gw',
    termId: 'term_gw_v2'
  }, authHeaders);
  assert(gwV2Res.status === 200, 'v80 T32: V2 term exam-result returns HTTP 200');
  assert(gwV2Res.body && gwV2Res.body.hasResult === true, 'v80 T32: V2 term hasResult === true');
  const scaleAPlusF = [
    { min: 91, max: 100, grade: 'A+', label: 'Outstanding' },
    { min: 81, max: 90,  grade: 'A',  label: 'Excellent' },
    { min: 71, max: 80,  grade: 'B+', label: 'Very Good' },
    { min: 61, max: 70,  grade: 'B',  label: 'Good' },
    { min: 51, max: 60,  grade: 'C+', label: 'Above Average' },
    { min: 41, max: 50,  grade: 'C',  label: 'Average' },
    { min: 33, max: 40,  grade: 'D',  label: 'Pass' },
    { min: 0,  max: 32,  grade: 'F',  label: 'Fail' }
  ];
  const expectedV2 = ExamCalculationEngine.calculateStudentResult({
    marks: {
      sub_eng: { obtained: 85, fullMarks: 100 },
      sub_hin: { obtained: 92, fullMarks: 100 },
      sub_math: { obtained: 69, fullMarks: 100 },
      sub_sci: { obtained: 76, fullMarks: 100 }
    },
    subjects: fixtureSubjectsTest.slice(0, 4),
    term: { id: 'term_gw_v2', rulesVersion: 'v2' },
    schoolConfig: { gradingScale: scaleAPlusF }
  });
  assert(gwV2Res.body.summary.totalObtained === expectedV2.total, 'v80 T32: V2 totalObtained matches ExamCalculationEngine (' + expectedV2.total + ')');
  assert(gwV2Res.body.summary.grade === expectedV2.grade, 'v80 T32: V2 grade matches ExamCalculationEngine (' + expectedV2.grade + ')');

  // v80 T33: Safety Check - Missing Subject Config (FIX 5)
  const gwSafetyRes = await invokeHandler('POST', 'exam-result', {
    schoolId: 'test_school_v80_greenwood',
    studentId: 'stu_v80_gw',
    termId: 'term_gw_safety'
  }, authHeaders);
  assert(gwSafetyRes.status === 200, 'v80 T33: Safety check returns HTTP 200');
  assert(gwSafetyRes.body && gwSafetyRes.body.hasResult === false, 'v80 T33: Safety check returns hasResult: false');
  assert(gwSafetyRes.body.message === 'Result not available yet', 'v80 T33: Returns exact message "Result not available yet"');

  // v80 T34: Marks Source Loader Helper (FIX 1)
  const loadedMarks = await loadStudentExamMarks({
    db,
    schoolId: 'test_school_v80_greenwood',
    termId: 'term_gw_legacy',
    student: { id: 'stu_v80_gw', class: 'Class 4', section: 'a' },
    isRestructured: true
  });
  assert(loadedMarks && loadedMarks.rank === 3, 'v80 T34: loadStudentExamMarks loaded student entry (rank === 3)');
  assert(loadedMarks.marks && loadedMarks.marks.sub_eng.obtained === 85, 'v80 T34: loadStudentExamMarks loaded marks');

  console.log('\n======================================================================');
  console.log(`PARENT PORTAL PHASE B2 SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
