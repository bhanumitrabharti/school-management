'use strict';

/**
 * Canonical School Template & Constants (CommonJS)
 * Single source of truth for Paathshala ERP school documents across
 * Self-Service Onboarding and Super Admin creation.
 */

// C2: Canonical full-feature list derived from Super Admin source (17 modules)
const CANONICAL_FULL_FEATURES = [
  'dashboard',
  'admin',
  'teacher-attendance',
  'students',
  'teachers',
  'attendance',
  'fees',
  'fee_ledger',
  'print_receipt',
  'timetable',
  'exams',
  'report_cards',
  'notices',
  'promotion',
  'users',
  'recovery',
  'help'
];

const STANDARD_FEE_HEADS = [
  { id: 'fh_tuition', name: 'Tuition Fee' },
  { id: 'fh_transport', name: 'Transport Fee' },
  { id: 'fh_exam', name: 'Examination Fee' },
  { id: 'fh_fine', name: 'Late Fee / Fine' },
  { id: 'fh_annual', name: 'Annual Development Fee' }
];

const DEFAULT_CLASSES = [
  'Nursery', 'LKG', 'UKG',
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'
];

const DEFAULT_SECTIONS = ['A'];

/**
 * Computes current April-March academic year (e.g. 2026-2027)
 */
function getCurrentAcademicYear(referenceDate = new Date()) {
  const d = new Date(referenceDate);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = Jan, 3 = April
  const startYear = month >= 3 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

/**
 * Builds public school document for schools/{schoolId}
 * C5 Security: Never contains adminUsername, adminEmail, or adminPassword.
 */
function buildSchoolRecord(options = {}) {
  const nowIso = new Date().toISOString();
  const academicYear = options.academicYear || getCurrentAcademicYear();

  // 30-day trial dates (display only, no feature locking)
  const trialStart = options.trialStartDate || nowIso;
  const trialEndDate = new Date(new Date(trialStart).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  return {
    school_id: options.schoolId,
    school_name: options.schoolName,
    subdomain: options.subdomain,
    plan: 'Free Trial',
    requestedPlan: options.requestedPlan || null,
    status: options.status || 'Active',
    storage_used: '0 MB',
    created_at: nowIso,
    last_login: null,
    phone: options.schoolPhone || '',
    email: options.schoolEmail || '',
    address: options.address || (options.city ? `${options.city}, ${options.state || ''}`.trim() : ''),
    logo_url: options.logoUrl || '',
    tagline: options.tagline || '',
    affiliation: options.affiliation || '',
    udiseCode: options.udiseCode || '',
    allowed_features: options.allowedFeatures || CANONICAL_FULL_FEATURES.slice(),
    settings: {
      classes: options.classes || DEFAULT_CLASSES.slice(),
      sections: options.sections || DEFAULT_SECTIONS.slice(),
      feeStructure: options.feeStructure || {},
      extraCharges: options.extraCharges || {},
      theme: 'dark',
      attendanceTime: options.attendanceTime || '09:00',
      academicYear: academicYear,
      credentialsIsolated: true,
      restructured: true,
      setupCompletedBySuperAdmin: options.setupCompletedBySuperAdmin !== false,
      clientCanEdit: true
    },
    trial_start: trialStart,
    trial_end: trialEndDate,
    onboarding_source: options.onboardingSource || 'self_service',
    referral_code: options.referralCode || null,
    referral_attribution: options.referralAttribution || null
  };
}

/**
 * Builds root tenant_data/{schoolId} document
 */
function buildTenantRecord(options = {}, publicSchoolRecord = null) {
  const academicYear = options.academicYear || getCurrentAcademicYear();
  const schoolRecord = publicSchoolRecord || buildSchoolRecord(options);
  const nowIso = new Date().toISOString();
  const trialStart = options.trialStartDate || schoolRecord.trial_start || nowIso;
  const trialEndDate = options.trialEndDate || schoolRecord.trial_end;

  return {
    settings: {
      schoolInfo: {
        name: options.schoolName,
        tagline: options.tagline || '',
        logoUrl: options.logoUrl || '',
        phone: options.phone || '',
        email: options.adminEmail || '',
        address: schoolRecord.address,
        affiliation: options.affiliation || '',
        udiseCode: options.udiseCode || ''
      },
      logoUrl: options.logoUrl || '',
      schoolName: options.schoolName,
      tagline: options.tagline || '',
      phone: options.phone || '',
      email: options.adminEmail || '',
      address: schoolRecord.address,
      affiliation: options.affiliation || '',
      udiseCode: options.udiseCode || '',
      adminUsername: options.adminUsername,
      adminEmail: options.adminEmail,
      classes: schoolRecord.settings.classes,
      sections: schoolRecord.settings.sections,
      feeStructure: schoolRecord.settings.feeStructure,
      extraCharges: schoolRecord.settings.extraCharges,
      setupCompletedBySuperAdmin: options.setupCompletedBySuperAdmin !== false,
      clientCanEdit: true,
      theme: 'dark',
      attendanceTime: options.attendanceTime || '09:00',
      academicYear: academicYear,
      credentialsIsolated: true,
      restructured: true,
      studentsMigrated: true,
      trialStartDate: trialStart,
      trialEndDate: trialEndDate
    },
    restructured: true,
    students: [],
    teachers: [],
    attendance: [],
    fees: [],
    feeHeads: STANDARD_FEE_HEADS.slice(),
    feeStructures: {},
    feeActivityLog: [],
    exams: [],
    marks: [],
    timetable: {},
    notices: [],
    trash: [],
    schools: [
      {
        school_id: schoolRecord.school_id,
        school_name: schoolRecord.school_name,
        subdomain: schoolRecord.subdomain,
        logo_url: schoolRecord.logo_url,
        plan: schoolRecord.plan,
        status: schoolRecord.status,
        allowed_features: schoolRecord.allowed_features
      }
    ]
  };
}

/**
 * Builds private credentials record for tenant_data/{schoolId}/private/credentials
 * C1 Security: { adminUsername, adminPassword: <bcrypt hash>, teachers: {} }
 */
function buildPrivateCredentialsRecord(options = {}) {
  return {
    adminUsername: options.adminUsername,
    adminPassword: options.adminPasswordHash, // 60-character bcrypt hash
    teachers: {}
  };
}

module.exports = {
  CANONICAL_FULL_FEATURES,
  STANDARD_FEE_HEADS,
  DEFAULT_CLASSES,
  DEFAULT_SECTIONS,
  getCurrentAcademicYear,
  buildSchoolRecord,
  buildTenantRecord,
  buildPrivateCredentialsRecord
};
