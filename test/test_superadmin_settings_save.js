const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rulesPath = path.resolve(__dirname, '../firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

async function runSuperAdminSettingsSaveTest() {
  console.log('========================================================');
  console.log('--- Testing Super Admin Edit-School Save Preservation ---');
  console.log('========================================================');

  const testEnv = await initializeTestEnvironment({
    projectId: 'ctrl-shift-solutions',
    firestore: {
      rules: rulesContent,
      host: '127.0.0.1',
      port: 8085
    }
  });

  const schoolId = 'test_school_preservation';

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // 1. Seed tenant with credentialsIsolated: true and extra settings keys
    console.log('--- Step 1: Seeding Tenant with credentialsIsolated and Extra Settings Keys ---');
    const initialSettings = {
      schoolName: 'Greenwood Test School',
      tagline: 'Excellence in Education',
      phone: '9876543210',
      email: 'info@greenwood.com',
      address: 'Bokaro Steel City',
      affiliation: 'CBSE',
      udiseCode: '2020202020',
      adminUsername: 'admin_greenwood',
      classes: ['1', '2', '3'],
      sections: { '1': ['A', 'B'], '2': ['A'], '3': ['A'] },
      feeStructure: { '1': { tuition: 1000 } },
      extraCharges: [],
      // SENSITIVE & CRITICAL EXTRA KEYS that must NEVER be wiped:
      credentialsIsolated: true,
      geofence: { lat: 23.78, lng: 85.96, radius: 500 },
      geofenceLat: 23.78,
      geofenceLng: 85.96,
      geofenceRadius: 500,
      customFieldDefinitions: [
        { id: 'cf_blood', name: 'Blood Group', type: 'text' },
        { id: 'cf_bus', name: 'Bus Route', type: 'text' }
      ],
      principalName: 'Dr. S. Sharma',
      principalSignatureUrl: 'https://storage/signature.png',
      attendancePolicyNotified: true,
      autoChargeEnabled: true,
      autoChargeTriggerDate: '2026-11-01',
      combinedReportCardStyle: 'cbse_standard',
      feeHeads: [{ id: 'fh_tuition', name: 'Tuition' }],
      studentsDualWrite: true,
      studentsMigrated: true,
      studentsMigrationTimestamp: '2026-09-01T00:00:00.000Z',
      subjects: ['English', 'Mathematics', 'Science'],
      upiId: 'greenwood@upi',
      website: 'https://greenwood.edu',
      theme: 'dark',
      attendanceTime: '09:00',
      academicYear: '2026-2027',
      restructured: true
    };

    const initialTenantDoc = {
      settings: initialSettings,
      restructured: true,
      students: [],
      teachers: []
    };

    const tenantRef = db.doc(`tenant_data/${schoolId}`);
    await tenantRef.set(initialTenantDoc);
    console.log('Seeded tenant_data/' + schoolId + ' with ' + Object.keys(initialSettings).length + ' settings keys.');

    // 2. Simulate Super Admin "Edit School" form submission
    console.log('\n--- Step 2: Simulating Super Admin Edit-School Save with Dot-Path Updates ---');
    // Admin modifies schoolName, phone, and feeStructure in the form
    const formName = 'Greenwood International School';
    const formTagline = 'Inspiring Minds';
    const formLogoUrl = 'https://storage/new-logo.png';
    const formPhone = '9998887776';
    const formEmail = 'admin@greenwood.com';
    const formAddress = 'Sector 4, Bokaro Steel City';
    const formAffiliation = 'CBSE';
    const formUdiseCode = '2020202020';
    const formAdminUsername = 'admin_greenwood';
    const formAdminEmail = 'admin@greenwood.com';
    const formClasses = ['1', '2', '3', '4'];
    const formSections = { '1': ['A', 'B'], '2': ['A'], '3': ['A'], '4': ['A'] };
    const formFeeStructure = { '1': { tuition: 1200 }, '4': { tuition: 1500 } };
    const formExtraCharges = [{ name: 'Lab Fee', amount: 200 }];

    // Read existing tenant data before saving (as super-admin.js does)
    const existingSnap = await tenantRef.get();
    const existingTenantData = existingSnap.data();

    // The fixed logic from js/super-admin.js:
    const existingSchoolInfo = (existingTenantData.settings && existingTenantData.settings.schoolInfo) || {};
    const mergedSchoolInfo = Object.assign({}, existingSchoolInfo, {
      name: formName,
      tagline: formTagline,
      logoUrl: formLogoUrl,
      phone: formPhone,
      email: formEmail,
      address: formAddress,
      affiliation: formAffiliation,
      udiseCode: formUdiseCode
    });

    const updatePayload = {
      'settings.schoolInfo': mergedSchoolInfo,
      'settings.schoolName': formName,
      'settings.tagline': formTagline,
      'settings.logoUrl': formLogoUrl,
      'settings.phone': formPhone,
      'settings.email': formEmail,
      'settings.address': formAddress,
      'settings.affiliation': formAffiliation,
      'settings.udiseCode': formUdiseCode,
      'settings.adminUsername': formAdminUsername,
      'settings.adminEmail': formAdminEmail,
      'settings.classes': formClasses,
      'settings.sections': formSections,
      'settings.feeStructure': formFeeStructure,
      'settings.extraCharges': formExtraCharges,
      'settings.setupCompletedBySuperAdmin': true,
      'settings.clientCanEdit': true
    };

    if (existingTenantData.settings && existingTenantData.settings.theme) {
      updatePayload['settings.theme'] = existingTenantData.settings.theme;
    } else {
      updatePayload['settings.theme'] = 'dark';
    }
    if (existingTenantData.settings && existingTenantData.settings.attendanceTime) {
      updatePayload['settings.attendanceTime'] = existingTenantData.settings.attendanceTime;
    } else {
      updatePayload['settings.attendanceTime'] = '09:00';
    }
    if (existingTenantData.settings && existingTenantData.settings.academicYear) {
      updatePayload['settings.academicYear'] = existingTenantData.settings.academicYear;
    } else {
      updatePayload['settings.academicYear'] = '2026-2027';
    }

    // Defense-in-depth guard:
    if (existingTenantData.settings && existingTenantData.settings.credentialsIsolated === true) {
      updatePayload['settings.credentialsIsolated'] = true;
    }

    if (existingTenantData.restructured || (existingTenantData.settings && existingTenantData.settings.restructured !== false)) {
      updatePayload.restructured = true;
      updatePayload['settings.restructured'] = true;
    }

    await tenantRef.update(updatePayload);
    console.log('Update executed with dot-path updatePayload.');

    // 3. Verify All Keys Post-Save
    console.log('\n--- Step 3: Verifying Tenant Settings Post-Save ---');
    const postSnap = await tenantRef.get();
    const postData = postSnap.data();
    const postSettings = postData.settings;
    const postKeys = Object.keys(postSettings).sort();

    console.log('Post-save settings key count:', postKeys.length);
    assert.strictEqual(postSettings.schoolName, 'Greenwood International School', 'schoolName should be updated');
    assert.strictEqual(postSettings.phone, '9998887776', 'phone should be updated');
    assert.strictEqual(postSettings.credentialsIsolated, true, 'CRITICAL: credentialsIsolated must STILL BE TRUE!');
    assert.deepStrictEqual(postSettings.geofence, { lat: 23.78, lng: 85.96, radius: 500 }, 'geofence map must be preserved');
    assert.strictEqual(postSettings.geofenceLat, 23.78, 'geofenceLat must be preserved');
    assert.strictEqual(postSettings.geofenceLng, 85.96, 'geofenceLng must be preserved');
    assert.strictEqual(postSettings.geofenceRadius, 500, 'geofenceRadius must be preserved');
    assert.strictEqual(postSettings.principalName, 'Dr. S. Sharma', 'principalName must be preserved');
    assert.strictEqual(postSettings.principalSignatureUrl, 'https://storage/signature.png', 'principalSignatureUrl must be preserved');
    assert.strictEqual(postSettings.attendancePolicyNotified, true, 'attendancePolicyNotified must be preserved');
    assert.strictEqual(postSettings.autoChargeEnabled, true, 'autoChargeEnabled must be preserved');
    assert.strictEqual(postSettings.autoChargeTriggerDate, '2026-11-01', 'autoChargeTriggerDate must be preserved');
    assert.strictEqual(postSettings.combinedReportCardStyle, 'cbse_standard', 'combinedReportCardStyle must be preserved');
    assert.strictEqual(postSettings.studentsDualWrite, true, 'studentsDualWrite must be preserved');
    assert.strictEqual(postSettings.studentsMigrated, true, 'studentsMigrated must be preserved');
    assert.strictEqual(postSettings.studentsMigrationTimestamp, '2026-09-01T00:00:00.000Z', 'studentsMigrationTimestamp must be preserved');
    assert.deepStrictEqual(postSettings.subjects, ['English', 'Mathematics', 'Science'], 'subjects list must be preserved');
    assert.strictEqual(postSettings.upiId, 'greenwood@upi', 'upiId must be preserved');
    assert.strictEqual(postSettings.website, 'https://greenwood.edu', 'website must be preserved');
    assert.strictEqual(postSettings.customFieldDefinitions.length, 2, 'customFieldDefinitions must be preserved');
    assert.strictEqual(postSettings.classes.length, 4, 'classes should have 4 classes');

    console.log('  ✔ PASS: credentialsIsolated is preserved: true');
    console.log('  ✔ PASS: geofence configuration is preserved');
    console.log('  ✔ PASS: customFieldDefinitions are preserved');
    console.log('  ✔ PASS: report card and fee config keys are preserved');
    console.log('  ✔ PASS: student migration flags are preserved');
    console.log('  ✔ PASS: form edits (schoolName, phone, classes) are applied correctly');

    // Clean up test document
    await tenantRef.delete();
    console.log('\nCleaned up test document.');
  });

  await testEnv.cleanup();
  console.log('\n========================================================');
  console.log('✅ ALL SUPER ADMIN SETTINGS SAVE EMULATOR TESTS PASSED!');
  console.log('========================================================');
}

runSuperAdminSettingsSaveTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
