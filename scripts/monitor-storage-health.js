/**
 * scripts/monitor-storage-health.js
 * 
 * Scans all tenant documents in tenant_data and produces a Storage Health Report.
 * Uses exact Firestore document size calculation formulas from scripts/migrate-root-doc.js.
 * Strictly read-only. Zero personal data printed.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { calculateFirestoreDocSize } = require('./migrate-root-doc');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: 'ctrl-shift-solutions' });
  } else {
    admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
  }
}
const db = admin.firestore();

async function runStorageHealthMonitor() {
  console.log('========================================================================');
  console.log('                 STORAGE HEALTH & TENANT SIZE MONITOR                   ');
  console.log('========================================================================\n');

  // Fetch all schools for friendly names
  const schoolsSnap = await db.collection('schools').get();
  const schoolNames = {};
  schoolsSnap.forEach(doc => {
    const d = doc.data();
    schoolNames[doc.id] = d.school_name || d.name || d.schoolName || doc.id;
  });

  // Fetch all tenant_data documents
  const tenantSnap = await db.collection('tenant_data').get();
  console.log(`Found ${tenantSnap.size} tenant documents in tenant_data.\n`);

  const rows = [];

  for (const doc of tenantSnap.docs) {
    const schoolId = doc.id;
    const data = doc.data();
    const sizeBytes = calculateFirestoreDocSize(`tenant_data/${schoolId}`, data);
    const sizeKB = +(sizeBytes / 1024).toFixed(2);
    const pctOf1MiB = +((sizeBytes / 1048576) * 100).toFixed(1);

    const s = data.settings || {};
    const storageVersion = s.storageVersion || 1;
    const studentsMigrated = s.studentsMigrated === true;
    const studentsDualWrite = s.studentsDualWrite === true;
    const credentialsIsolated = s.credentialsIsolated === true;
    const name = schoolNames[schoolId] || (s.schoolInfo && s.schoolInfo.name) || schoolId;

    rows.push({
      schoolId,
      name,
      sizeBytes,
      sizeKB,
      pctOf1MiB,
      storageVersion,
      studentsMigrated,
      studentsDualWrite,
      credentialsIsolated
    });
  }

  // Sort descending by size
  rows.sort((a, b) => b.sizeBytes - a.sizeBytes);

  console.log('| School ID | School Name | Root Size (KB) | % of 1 MiB | storageVersion | studentsMigrated | credentialsIsolated |');
  console.log('| :--- | :--- | :---: | :---: | :---: | :---: | :---: |');
  for (const r of rows) {
    console.log(`| \`${r.schoolId}\` | ${r.name} | ${r.sizeKB} KB | ${r.pctOf1MiB}% | v${r.storageVersion} | ${r.studentsMigrated ? 'Yes (Dual-Write)' : 'No'} | ${r.credentialsIsolated ? 'Yes' : 'No'} |`);
  }

  const totalBytes = rows.reduce((acc, r) => acc + r.sizeBytes, 0);
  const totalKB = (totalBytes / 1024).toFixed(2);
  const v2Count = rows.filter(r => r.storageVersion === 2).length;
  const migratedStudentsCount = rows.filter(r => r.studentsMigrated).length;

  console.log('\n------------------------------------------------------------------------');
  console.log(`Summary:`);
  console.log(`  • Total Tenants Analyzed: ${rows.length}`);
  console.log(`  • Total Tenant Storage: ${totalKB} KB (~${(totalKB / 1024).toFixed(2)} MB)`);
  console.log(`  • Tenants on storageVersion 2: ${v2Count} / ${rows.length} (${((v2Count / rows.length) * 100).toFixed(1)}%)`);
  console.log(`  • Tenants with studentsMigrated: ${migratedStudentsCount} / ${rows.length}`);
  console.log('------------------------------------------------------------------------\n');

  return rows;
}

if (require.main === module) {
  runStorageHealthMonitor().catch(err => {
    console.error('Failed to run storage monitor:', err);
    process.exit(1);
  });
}

module.exports = { runStorageHealthMonitor };
