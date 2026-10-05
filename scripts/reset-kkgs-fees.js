const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const sa = require('../service-account-key.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}
const db = admin.firestore();

const TARGET_SCHOOL_ID = 'kkgs_mttt4ufq';

async function resetKKGSFees() {
  console.log('=== PART A: RESET KKGS FEE DATA ===');
  console.log('Target School ID:', TARGET_SCHOOL_ID);

  if (TARGET_SCHOOL_ID !== 'kkgs_mttt4ufq') {
    throw new Error('SAFETY ABORT: TARGET_SCHOOL_ID must be strictly kkgs_mttt4ufq');
  }

  const tenantRef = db.collection('tenant_data').doc(TARGET_SCHOOL_ID);
  const tenantSnap = await tenantRef.get();
  if (!tenantSnap.exists) {
    throw new Error('Target school document not found: ' + TARGET_SCHOOL_ID);
  }

  const tenantData = tenantSnap.data();
  console.log('Initial State Verification:');
  console.log('  School Name:', tenantData.settings && tenantData.settings.schoolName);
  console.log('  Students count:', (tenantData.students || []).length);
  console.log('  Teachers count:', (tenantData.teachers || []).length);

  // Backup current state before any operation
  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `kkgs_fee_reset_backup_${Date.now()}.json`);

  // Collect current fee subcollection docs for backup
  const feesYearsRef = tenantRef.collection('fees_years');
  const yearsSnap = await feesYearsRef.listDocuments();
  const subcollectionBackup = {};

  for (const yDoc of yearsSnap) {
    subcollectionBackup[yDoc.id] = {};
    const monthsRef = yDoc.collection('months');
    const monthsDocs = await monthsRef.listDocuments();
    for (const mDoc of monthsDocs) {
      const mSnap = await mDoc.get();
      subcollectionBackup[yDoc.id][mDoc.id] = mSnap.data() || {};
    }
  }

  fs.writeFileSync(backupFile, JSON.stringify({
    schoolId: TARGET_SCHOOL_ID,
    timestamp: new Date().toISOString(),
    rootDoc: {
      fees: tenantData.fees,
      lastAutomatedFeeRun: tenantData.lastAutomatedFeeRun,
      settingsAutoCharge: {
        autoChargeEnabled: tenantData.settings && tenantData.settings.autoChargeEnabled,
        autoChargeTriggerDate: tenantData.settings && tenantData.settings.autoChargeTriggerDate,
        autoChargeLastRun: tenantData.settings && tenantData.settings.autoChargeLastRun
      }
    },
    subcollections: subcollectionBackup
  }, null, 2));
  console.log('  Backup safely written to:', backupFile);

  // STEP 1 — Delete all fee subcollection documents
  console.log('\n--- Step 1: Deleting subcollection documents ---');
  let deletedCount = 0;
  for (const yDoc of yearsSnap) {
    const monthsRef = yDoc.collection('months');
    const monthsDocs = await monthsRef.listDocuments();
    for (const mDoc of monthsDocs) {
      console.log(`  Deleting month doc: fees_years/${yDoc.id}/months/${mDoc.id}`);
      await mDoc.delete();
      deletedCount++;
    }
    console.log(`  Deleting year doc: fees_years/${yDoc.id}`);
    await yDoc.delete();
    deletedCount++;
  }
  console.log(`  Deleted ${deletedCount} subcollection documents.`);

  // STEP 2 & 3 — Clear legacy fees array and reset tracking fields in root tenant doc
  console.log('\n--- Step 2 & 3: Updating root tenant document ---');
  const updatePayload = {
    fees: [],
    lastAutomatedFeeRun: admin.firestore.FieldValue.delete(),
    'settings.autoChargeLastRun': admin.firestore.FieldValue.delete()
  };

  await tenantRef.update(updatePayload);
  console.log('  Root tenant document updated successfully.');

  // STEP 4 — Verification
  console.log('\n--- Step 4: Verification ---');
  const verifySnap = await tenantRef.get();
  const verifyData = verifySnap.data();

  console.log('  Students count intact:', (verifyData.students || []).length === 161, `(${verifyData.students.length})`);
  console.log('  Teachers count intact:', (verifyData.teachers || []).length === 12, `(${verifyData.teachers.length})`);
  console.log('  fees array empty:', Array.isArray(verifyData.fees) && verifyData.fees.length === 0);
  console.log('  lastAutomatedFeeRun deleted:', verifyData.lastAutomatedFeeRun === undefined);
  console.log('  settings.autoChargeLastRun deleted:', verifyData.settings.autoChargeLastRun === undefined);
  console.log('  settings.autoChargeEnabled intact:', verifyData.settings.autoChargeEnabled === true);
  console.log('  settings.autoChargeTriggerDate intact:', verifyData.settings.autoChargeTriggerDate === 25);

  // Check subcollections are empty
  const verifyYears = await feesYearsRef.listDocuments();
  let remainingSubDocs = 0;
  for (const yDoc of verifyYears) {
    const mDocs = await yDoc.collection('months').listDocuments();
    remainingSubDocs += mDocs.length + 1;
  }
  console.log('  fees_years subcollection empty:', remainingSubDocs === 0);

  if (verifyData.students.length !== 161 || verifyData.teachers.length !== 12 || remainingSubDocs !== 0) {
    throw new Error('VERIFICATION FAILED! State does not match expected targets.');
  }

  console.log('\n✅ PART A COMPLETE AND VERIFIED.');
}

resetKKGSFees()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('PART A Error:', err);
    process.exit(1);
  });
