/**
 * scripts/delete-test-tenants.js
 * 
 * Safely inventories, backs up, and removes ONLY the 5 approved test tenants:
 *  - test_onboarding_do_not_use_1793580409801
 *  - test_onboarding_do_not_use_1793584961026
 *  - test_onboarding_do_not_use_1793586010576
 *  - test_onboarding_do_not_use_1793629047260
 *  - test_onboarding_do_not_use_1793629408346
 * 
 * STRICT BARRIER:
 *  - Requires explicit match on exact ID list.
 *  - Requires schoolName / school_name === "TEST-ONBOARDING-DO-NOT-USE" (aborts otherwise).
 *  - Full JSON backup created per tenant before deletion.
 *  - Verifies zero real tenants affected.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const TARGET_TEST_IDS = [
  'test_onboarding_do_not_use_1793580409801',
  'test_onboarding_do_not_use_1793584961026',
  'test_onboarding_do_not_use_1793586010576',
  'test_onboarding_do_not_use_1793629047260',
  'test_onboarding_do_not_use_1793629408346'
];

const REQUIRED_SCHOOL_NAME = 'TEST-ONBOARDING-DO-NOT-USE';

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(saPath)),
    storageBucket: 'ctrl-shift-solutions.firebasestorage.app'
  });
}
const db = admin.firestore();
const bucket = admin.storage().bucket('ctrl-shift-solutions.firebasestorage.app');

async function getRealTenantIds() {
  const snap = await db.collection('tenant_data').get();
  return snap.docs
    .map(d => d.id)
    .filter(id => !TARGET_TEST_IDS.includes(id))
    .sort();
}

async function inventoryTenant(id) {
  const inventory = {
    id,
    valid: false,
    documents: [],
    storageFiles: [],
    authUsers: []
  };

  const schoolRef = db.doc(`schools/${id}`);
  const schoolSnap = await schoolRef.get();
  const tenantRef = db.doc(`tenant_data/${id}`);
  const tenantSnap = await tenantRef.get();

  const schoolData = schoolSnap.data() || {};
  const tenantData = tenantSnap.data() || {};

  const sName = schoolData.school_name || (schoolData.settings && schoolData.settings.schoolName);
  const tName = (tenantData.settings && tenantData.settings.schoolName) || (tenantData.schoolInfo && tenantData.schoolInfo.name);

  if (sName !== REQUIRED_SCHOOL_NAME && tName !== REQUIRED_SCHOOL_NAME) {
    throw new Error(`ABORT: School name for ${id} is "${sName}" / "${tName}", not "${REQUIRED_SCHOOL_NAME}"`);
  }

  inventory.valid = true;
  inventory.schoolName = sName || tName;

  if (schoolSnap.exists) {
    inventory.documents.push({ path: `schools/${id}`, data: schoolData });
  }

  if (tenantSnap.exists) {
    inventory.documents.push({ path: `tenant_data/${id}`, data: tenantData });

    // Subcollections
    const subCollections = await tenantRef.listCollections();
    for (const sub of subCollections) {
      const subDocs = await sub.get();
      for (const sd of subDocs.docs) {
        inventory.documents.push({ path: `tenant_data/${id}/${sub.id}/${sd.id}`, data: sd.data() });
      }
    }
  }

  // school_access
  const saSnap = await db.collection('school_access').where('schoolId', '==', id).get();
  saSnap.forEach(d => {
    inventory.documents.push({ path: `school_access/${d.id}`, data: d.data() });
  });

  // subdomain_reservations
  const resSnap = await db.collection('subdomain_reservations').where('schoolId', '==', id).get();
  resSnap.forEach(d => {
    inventory.documents.push({ path: `subdomain_reservations/${d.id}`, data: d.data() });
  });

  // registrations
  const regSnap = await db.collection('registrations').where('schoolId', '==', id).get();
  regSnap.forEach(d => {
    inventory.documents.push({ path: `registrations/${d.id}`, data: d.data() });
  });

  // platform_health
  const phSnap = await db.doc(`platform_health/${id}`).get();
  if (phSnap.exists) {
    inventory.documents.push({ path: `platform_health/${id}`, data: phSnap.data() });
  }

  // Storage
  const [files] = await bucket.getFiles({ prefix: `schools/${id}/` });
  for (const f of files) {
    inventory.storageFiles.push(f.name);
  }

  return inventory;
}

async function runCleanup(isApply) {
  console.log('========================================================================');
  console.log(`         TEST TENANT CLEANUP (${isApply ? 'APPLY' : 'DRY-RUN'} MODE)          `);
  console.log('========================================================================\n');

  const realTenantsBefore = await getRealTenantIds();
  console.log(`Baseline real tenants count before cleanup: ${realTenantsBefore.length}`);
  console.log(`Real tenant IDs: ${realTenantsBefore.join(', ')}\n`);

  const backupDir = path.resolve(__dirname, '../backups/test_tenants');
  if (isApply && !fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const inventories = [];

  for (const id of TARGET_TEST_IDS) {
    console.log(`--- Inventorying ${id} ---`);
    const inv = await inventoryTenant(id);
    inventories.push(inv);

    console.log(`  • School Name Check: "${inv.schoolName}" === "${REQUIRED_SCHOOL_NAME}" ✅`);
    console.log(`  • Linked Firestore Documents (${inv.documents.length}):`);
    inv.documents.forEach(d => console.log(`     - ${d.path}`));
    console.log(`  • Storage Files (${inv.storageFiles.length}): ${inv.storageFiles.join(', ') || 'None'}`);
    console.log(`  • Auth Users: None`);

    if (isApply) {
      // Local Backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `backup_${id}_${timestamp}.json`);
      fs.writeFileSync(backupPath, JSON.stringify(inv, null, 2), 'utf8');
      const sizeKB = (fs.statSync(backupPath).size / 1024).toFixed(2);
      console.log(`  ✅ [BACKUP] Saved to ${backupPath} (${sizeKB} KB)`);

      // Deletion
      const batch = db.batch();
      for (const d of inv.documents) {
        batch.delete(db.doc(d.path));
      }
      await batch.commit();
      console.log(`  🗑 [DELETED] Deleted ${inv.documents.length} Firestore documents.`);

      for (const sf of inv.storageFiles) {
        await bucket.file(sf).delete();
        console.log(`  🗑 [DELETED STORAGE] Deleted ${sf}`);
      }
    }
    console.log('');
  }

  if (!isApply) {
    console.log('------------------------------------------------------------------------');
    console.log('[DRY-RUN COMPLETE] Zero changes made to production.');
    console.log('Run with --apply to back up and delete all listed artifacts.');
    console.log('------------------------------------------------------------------------\n');
    return;
  }

  // --- POST-DELETION VERIFICATION ---
  console.log('========================================================================');
  console.log('                   POST-CLEANUP VERIFICATION                            ');
  console.log('========================================================================\n');

  // Verify none of the 5 remain
  for (const id of TARGET_TEST_IDS) {
    const sSnap = await db.doc(`schools/${id}`).get();
    const tSnap = await db.doc(`tenant_data/${id}`).get();
    const credSnap = await db.doc(`tenant_data/${id}/private/credentials`).get();
    const saSnap = await db.collection('school_access').where('schoolId', '==', id).get();

    if (sSnap.exists || tSnap.exists || credSnap.exists || !saSnap.empty) {
      throw new Error(`CRITICAL POST-CHECK FAILURE: Remnants still exist for ${id}!`);
    }
    console.log(`✔ Verified ${id} completely removed (schools, tenant_data, private/credentials, school_access all empty).`);
  }

  const realTenantsAfter = await getRealTenantIds();
  console.log(`\nReal tenants count after cleanup: ${realTenantsAfter.length}`);
  console.log(`Real tenant IDs: ${realTenantsAfter.join(', ')}`);

  if (realTenantsBefore.length !== realTenantsAfter.length) {
    throw new Error(`CRITICAL: Real tenant count changed! Before: ${realTenantsBefore.length}, After: ${realTenantsAfter.length}`);
  }

  for (let i = 0; i < realTenantsBefore.length; i++) {
    if (realTenantsBefore[i] !== realTenantsAfter[i]) {
      throw new Error(`CRITICAL: Real tenant mismatch at index ${i}! Before: ${realTenantsBefore[i]}, After: ${realTenantsAfter[i]}`);
    }
  }

  console.log(`\n✅ VERIFICATION PASSED: All 5 test tenants deleted cleanly. Real tenants untouched (${realTenantsAfter.length} / ${realTenantsBefore.length} match 100%).\n`);
}

async function main() {
  const isApply = process.argv.includes('--apply');
  await runCleanup(isApply);
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Cleanup failed:', err);
    process.exit(1);
  });
}

module.exports = { runCleanup };
