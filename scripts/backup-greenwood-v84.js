'use strict';

/**
 * scripts/backup-greenwood-v84.js
 *
 * Full backup of Greenwood (svm_bokaro_001) before any demo cleanup:
 * - Root document: tenant_data/svm_bokaro_001
 * - Subcollections:
 *   * students
 *   * notices
 *   * counters
 *   * fees_years (and their months)
 *   * attendance_months
 *   * exam_marks
 *   * accounts_*
 *
 * Exports to scratch/backup_greenwood_<timestamp>.json
 * Computes and prints SHA-256 checksum.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');

delete process.env.FIRESTORE_EMULATOR_HOST;

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(saPath))
  });
}
const db = admin.firestore();

const SCHOOL_ID = 'svm_bokaro_001';

async function fullBackup() {
  console.log(`[Backup] Starting full export of tenant_data/${SCHOOL_ID}...`);
  const rootRef = db.collection('tenant_data').doc(SCHOOL_ID);
  const rootSnap = await rootRef.get();
  if (!rootSnap.exists) {
    throw new Error(`Tenant root document tenant_data/${SCHOOL_ID} does not exist!`);
  }

  const backupData = {
    schoolId: SCHOOL_ID,
    backupTimestamp: new Date().toISOString(),
    rootDoc: rootSnap.data(),
    subcollections: {}
  };

  const knownSubcollections = [
    'students',
    'notices',
    'counters',
    'attendance_months',
    'exam_marks',
    'accounts_settings',
    'accounts_chart',
    'accounts_expenses',
    'accounts_receipts',
    'accounts_transfers',
    'accounts_journal',
    'accounts_sync_state',
    'staff',
    'payroll_profiles',
    'payroll_runs',
    'payroll_payslips'
  ];

  for (const sub of knownSubcollections) {
    const colRef = rootRef.collection(sub);
    const snap = await colRef.get();
    if (!snap.empty) {
      backupData.subcollections[sub] = snap.docs.map(d => ({
        id: d.id,
        data: d.data()
      }));
      console.log(`  Included subcollection '${sub}': ${snap.size} documents`);
    }
  }

  // Also backup fees_years and their months (using listDocuments to handle phantom parent docs)
  const feesYearsDocs = await rootRef.collection('fees_years').listDocuments();
  if (feesYearsDocs.length > 0) {
    backupData.subcollections.fees_years = [];
    for (const yRef of feesYearsDocs) {
      const ySnap = await yRef.get();
      const yearData = { id: yRef.id, data: ySnap.exists ? ySnap.data() : {}, months: [] };
      const monthsSnap = await yRef.collection('months').get();
      if (!monthsSnap.empty) {
        yearData.months = monthsSnap.docs.map(m => ({ id: m.id, data: m.data() }));
      }
      backupData.subcollections.fees_years.push(yearData);
      console.log(`  Included 'fees_years/${yRef.id}': ${yearData.months.length} month documents`);
    }
  }

  const scratchDir = path.resolve(__dirname, '..', 'scratch');
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(scratchDir, `backup_greenwood_${timestamp}.json`);
  const jsonContent = JSON.stringify(backupData, null, 2);

  fs.writeFileSync(backupPath, jsonContent, 'utf8');

  const sha256 = crypto.createHash('sha256').update(jsonContent).digest('hex');
  const stats = fs.statSync(backupPath);

  console.log(`\n✅ Backup complete!`);
  console.log(`Path: ${backupPath}`);
  console.log(`Size: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`SHA-256: ${sha256}`);

  return { backupPath, sha256 };
}

fullBackup().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
