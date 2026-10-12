/**
 * ===================================================================
 *  DATA BACKFILL FOR HALF-ONBOARDED SCHOOLS
 *  Target Schools:
 *    - idealschoolgomoh_mv1xhpe5
 *    - usha_academy_mango_muzflr5z
 * ===================================================================
 *
 * SAFETY & INTEGRITY:
 *   - Uses Admin SDK via local service-account-key.json.
 *   - Takes JSON backup of schools docs before execution.
 *   - Uses docRef.create() so it FAILS if tenant_data already exists.
 *   - Never overwrites or resets any existing document.
 *   - Restores original bcrypt hash from pre-sanitization backup (no password changes).
 *   - Does NOT write school_access, does NOT log in.
 * ===================================================================
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const KEY_PATH = path.join(__dirname, '..', 'service-account-key.json');
const key = require(KEY_PATH);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key) });
}
const db = admin.firestore();

const PRE_SANITIZATION_BACKUP = path.join(
  __dirname,
  '..',
  'backups',
  'schools_live_sanitization_pre',
  'schools_backup_live.json'
);

const TARGET_IDS = [
  'idealschoolgomoh_mv1xhpe5',
  'usha_academy_mango_muzflr5z'
];

/**
 * Exact logic from js/super-admin.js lines 3063-3132
 */
function buildTenantDataFromOnboardingLogic(schoolDocData, preSanitizationSettings) {
  const settings = schoolDocData.settings || {};
  const formFeeStructure = settings.feeStructure || {};

  // Exact feeStructure conversion from js/super-admin.js L3063-3080
  const legacyFeeStructures = {};
  if (formFeeStructure) {
    Object.keys(formFeeStructure).forEach(function (c) {
      const clsFees = formFeeStructure[c] || {};
      const legacyFees = {};
      Object.keys(clsFees).forEach(function (k) {
        let legacyKey = k;
        if (k === 'tuition') legacyKey = 'fh_tuition';
        else if (k === 'transport') legacyKey = 'fh_transport';
        else if (k === 'exam') legacyKey = 'fh_exam';
        else if (k === 'fine') legacyKey = 'fh_fine';
        else if (k === 'annual') legacyKey = 'fh_annual';
        else if (!k.startsWith('fh_')) legacyKey = 'fh_' + k;
        legacyFees[legacyKey] = clsFees[k];
      });
      legacyFeeStructures[c] = legacyFees;
    });
  }

  const name = schoolDocData.school_name || '';
  const tagline = schoolDocData.tagline || '';
  const logoUrl = schoolDocData.logo_url || '';
  const phone = schoolDocData.phone || '';
  const email = schoolDocData.email || '';
  const address = schoolDocData.address || '';
  const affiliation = settings.affiliation || '';
  const udiseCode = settings.udiseCode || '';

  // Recovered credentials from pre-sanitization backup
  const adminUsername = preSanitizationSettings.adminUsername || '';
  const adminPasswordHashed = preSanitizationSettings.adminPassword || '';
  const adminEmail = preSanitizationSettings.adminEmail || '';

  const formClasses = settings.classes || [];
  const formSections = settings.sections || [];
  const formExtraCharges = settings.extraCharges || [];

  // Exact tenantData object from js/super-admin.js L3082-3132
  const tenantData = {
    settings: {
      schoolInfo: {
        name: name,
        tagline: tagline,
        logoUrl: logoUrl,
        phone: phone,
        email: email,
        address: address,
        affiliation: affiliation,
        udiseCode: udiseCode
      },
      schoolName: name,
      tagline: tagline,
      phone: phone,
      email: email,
      address: address,
      affiliation: affiliation,
      udiseCode: udiseCode,
      adminUsername: adminUsername,
      adminPassword: adminPasswordHashed,
      adminEmail: adminEmail,
      classes: formClasses,
      sections: formSections,
      feeStructure: formFeeStructure,
      extraCharges: formExtraCharges,
      setupCompletedBySuperAdmin: true,
      clientCanEdit: true,
      theme: settings.theme || 'dark',
      attendanceTime: settings.attendanceTime || '09:00',
      academicYear: settings.academicYear || '2025-2026',
      restructured: true
    },
    restructured: true,
    students: [],
    teachers: [],
    attendance: [],
    fees: [],
    feeHeads: [
      { id: 'fh_tuition', name: 'Tuition Fee' },
      { id: 'fh_transport', name: 'Transport Fee' },
      { id: 'fh_exam', name: 'Examination Fee' },
      { id: 'fh_fine', name: 'Late Fee / Fine' },
      { id: 'fh_annual', name: 'Annual Development Fee' }
    ],
    feeStructures: legacyFeeStructures,
    exams: [],
    marks: [],
    notices: [],
    timetable: {},
    subjectMapping: {},
    notifications: [],
    trash: [],
    lastAutomatedFeeRun: ""
  };

  return tenantData;
}

async function runBackfill() {
  console.log('=== STEP 1: PRE-BACKFILL BACKUP ===');
  const backupData = {};
  for (const id of TARGET_IDS) {
    const sDoc = await db.collection('schools').doc(id).get();
    if (!sDoc.exists) throw new Error(`schools/${id} does not exist!`);
    backupData[id] = sDoc.data();
  }

  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `schools_pre_backfill_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`✅ Saved pre-backfill backup to: ${backupFile}`);

  console.log('\n=== STEP 2: LOAD PRE-SANITIZATION CREDENTIALS ===');
  const rawPreSan = fs.readFileSync(PRE_SANITIZATION_BACKUP, 'utf8');
  const preSanList = JSON.parse(rawPreSan);

  const preSanMap = {};
  for (const item of preSanList) {
    if (TARGET_IDS.includes(item.id)) {
      preSanMap[item.id] = (item.data && item.data.settings) || {};
    }
  }

  for (const id of TARGET_IDS) {
    if (!preSanMap[id] || !preSanMap[id].adminPassword) {
      throw new Error(`Missing pre-sanitization password hash for ${id}`);
    }
    console.log(`✅ Verified pre-sanitization credentials found for ${id} (adminUsername: ${preSanMap[id].adminUsername}, password length: ${preSanMap[id].adminPassword.length})`);
  }

  console.log('\n=== STEP 3: CONSTRUCT & CREATE tenant_data (Using .create()) ===');
  for (const id of TARGET_IDS) {
    const schoolDoc = backupData[id];
    const preSanSettings = preSanMap[id];
    const tenantPayload = buildTenantDataFromOnboardingLogic(schoolDoc, preSanSettings);

    const docRef = db.collection('tenant_data').doc(id);
    // .create() guarantees failure if document already exists
    await docRef.create(tenantPayload);
    console.log(`✅ Successfully created tenant_data/${id} via .create()`);

    // Verify created document
    const createdSnap = await docRef.get();
    if (!createdSnap.exists) throw new Error(`Verification failed: ${id} not found after create!`);
    const createdData = createdSnap.data();

    // Verify properties
    const topKeys = Object.keys(createdData).sort();
    console.log(`   Top-level keys (${topKeys.length}): ${topKeys.join(', ')}`);
    console.log(`   settings.restructured: ${createdData.settings.restructured}`);
    console.log(`   restructured: ${createdData.restructured}`);
    console.log(`   students count: ${createdData.students.length} (is array: ${Array.isArray(createdData.students)})`);
    console.log(`   teachers count: ${createdData.teachers.length} (is array: ${Array.isArray(createdData.teachers)})`);
    console.log(`   feeHeads count: ${createdData.feeHeads.length}`);
    console.log(`   adminUsername: ${createdData.settings.adminUsername}`);
    console.log(`   adminPassword restored: ${!!createdData.settings.adminPassword && createdData.settings.adminPassword.length === 60}`);

    if (createdData.settings.restructured !== true ||
        createdData.restructured !== true ||
        createdData.students.length !== 0 ||
        createdData.teachers.length !== 0) {
      throw new Error(`Integrity assertion failed on ${id}`);
    }
  }

  console.log('\n=== ALL TARGET TENANT DOCUMENTS SUCCESSFULLY BACKFILLED ===');
}

runBackfill().catch(err => {
  console.error('\n❌ BACKFILL FAILED:', err);
  process.exit(1);
});
