const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const sa = JSON.parse(fs.readFileSync('service-account-key.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}
const db = admin.firestore();

async function runCleanup() {
  console.log('=== STEP 4: CLEANUP LEGACY SCHOOL_ACCESS SESSIONS (WITHOUT verifiedAt) ===\n');

  // Verify backup exists
  const backupFile = 'backups/school_access_full_2026-10-15T15-25-09-404Z.json';
  if (!fs.existsSync(backupFile)) {
    throw new Error('FATAL: Step 1 backup file missing: ' + backupFile);
  }
  const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  console.log(`[BACKUP CHECK] Verified backup at ${backupFile} (${backupData.metadata.totalCount} docs)\n`);

  const snapBefore = await db.collection('school_access').get();
  console.log(`[BEFORE] Total documents in school_access: ${snapBefore.size}`);

  const beforeCounts = {};
  const toDelete = [];

  snapBefore.forEach(docSnap => {
    const data = docSnap.data();
    const sch = data.schoolId || 'UNKNOWN';
    if (!beforeCounts[sch]) beforeCounts[sch] = { total: 0, withVerifiedAt: 0, withoutVerifiedAt: 0 };
    beforeCounts[sch].total++;

    if (data.verifiedAt) {
      beforeCounts[sch].withVerifiedAt++;
    } else {
      beforeCounts[sch].withoutVerifiedAt++;
      toDelete.push({ id: docSnap.id, schoolId: sch });
    }
  });

  console.log(`[PLAN] Documents to delete (WITHOUT verifiedAt): ${toDelete.length}`);
  console.log(`[PLAN] Documents to preserve (WITH verifiedAt): ${snapBefore.size - toDelete.length}`);

  if (toDelete.length === 0) {
    console.log('No legacy documents found to delete.');
    return;
  }

  // Perform deletions in batches
  const batchSize = 500;
  for (let i = 0; i < toDelete.length; i += batchSize) {
    const chunk = toDelete.slice(i, i + batchSize);
    const batch = db.batch();
    chunk.forEach(item => {
      batch.delete(db.collection('school_access').doc(item.id));
    });
    await batch.commit();
    console.log(`[DELETE] Deleted chunk of ${chunk.length} legacy docs.`);
  }

  // Verify after
  const snapAfter = await db.collection('school_access').get();
  const afterCounts = {};
  let totalAfterWithout = 0;

  snapAfter.forEach(docSnap => {
    const data = docSnap.data();
    const sch = data.schoolId || 'UNKNOWN';
    if (!afterCounts[sch]) afterCounts[sch] = { total: 0, withVerifiedAt: 0, withoutVerifiedAt: 0 };
    afterCounts[sch].total++;
    if (data.verifiedAt) {
      afterCounts[sch].withVerifiedAt++;
    } else {
      afterCounts[sch].withoutVerifiedAt++;
      totalAfterWithout++;
    }
  });

  console.log(`\n[AFTER] Total documents in school_access: ${snapAfter.size}`);
  console.log(`[AFTER] Documents without verifiedAt remaining: ${totalAfterWithout}`);

  if (totalAfterWithout !== 0) {
    console.error('❌ WARNING: Some documents without verifiedAt still remain!');
  } else {
    console.log('✅ SUCCESS: Exactly 0 legacy documents remain. All preserved sessions have verifiedAt.');
  }

  console.log('\n--- PER-SCHOOL BEFORE AND AFTER SUMMARY ---');
  const allSchools = Array.from(new Set([...Object.keys(beforeCounts), ...Object.keys(afterCounts)]));
  const table = allSchools.map(sch => {
    const b = beforeCounts[sch] || { total: 0, withVerifiedAt: 0, withoutVerifiedAt: 0 };
    const a = afterCounts[sch] || { total: 0, withVerifiedAt: 0, withoutVerifiedAt: 0 };
    return {
      School: sch,
      'Before Total': b.total,
      'Deleted (Legacy)': b.withoutVerifiedAt,
      'After Total (Active)': a.total
    };
  });
  console.table(table);
  console.log('===========================================\n');
}

runCleanup().then(() => process.exit(0)).catch(err => {
  console.error('Fatal cleanup error:', err);
  process.exit(1);
});
