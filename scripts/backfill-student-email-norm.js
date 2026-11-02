'use strict';

/**
 * scripts/backfill-student-email-norm.js
 * 
 * Backfills server-maintained normalized email fields:
 *   - parentEmailNorm (lowercase, trimmed)
 *   - secondaryParentEmailNorm (lowercase, trimmed)
 * across student records in both subcollections and legacy root documents.
 * 
 * USAGE:
 *   node scripts/backfill-student-email-norm.js               # Dry-run by default
 *   node scripts/backfill-student-email-norm.js --dry-run     # Explicit dry-run
 *   node scripts/backfill-student-email-norm.js --apply       # Live apply (requires GO)
 *   node scripts/backfill-student-email-norm.js --school <id> # Single school
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: 'ctrl-shift-solutions' });
  } else if (fs.existsSync(saPath)) {
    admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
  } else {
    admin.initializeApp();
  }
}
const db = admin.firestore();

function normalizeEmail(val) {
  if (!val || typeof val !== 'string') return '';
  return val.trim().toLowerCase();
}

async function runBackfill({ apply = false, targetSchoolId = null } = {}) {
  const mode = apply ? 'LIVE APPLY' : 'DRY-RUN (NO WRITES)';
  console.log('================================================================');
  console.log(` STUDENT EMAIL NORMALIZATION BACKFILL — ${mode}`);
  console.log('================================================================\n');

  const tenantSnap = await db.collection('tenant_data').get();
  const schoolIds = targetSchoolId 
    ? [targetSchoolId] 
    : tenantSnap.docs.map(d => d.id);

  const report = [];
  let grandTotalStudents = 0;
  let grandTotalNeedingUpdate = 0;
  let grandTotalUpdated = 0;

  for (const schoolId of schoolIds) {
    const tenantDocRef = db.collection('tenant_data').doc(schoolId);
    const tenantSnapDoc = await tenantDocRef.get();
    if (!tenantSnapDoc.exists) continue;

    const tenantData = tenantSnapDoc.data();
    const subColRef = tenantDocRef.collection('students');
    const subSnap = await subColRef.get();

    const isSubcollectionActive = subSnap.size > 0;
    let schoolStudentCount = 0;
    let needingUpdateCount = 0;
    let updatedCount = 0;
    let withParentEmail = 0;
    let withSecondaryEmail = 0;

    if (isSubcollectionActive) {
      // Process subcollection
      schoolStudentCount = subSnap.size;
      const docsToUpdate = [];

      subSnap.forEach(docSnap => {
        const data = docSnap.data();
        const pEmail = (data.parentEmail || '').trim();
        const sEmail = (data.secondaryParentEmail || '').trim();
        const pNorm = normalizeEmail(pEmail);
        const sNorm = normalizeEmail(sEmail);

        if (pEmail) withParentEmail++;
        if (sEmail) withSecondaryEmail++;

        if (data.parentEmailNorm !== pNorm || data.secondaryParentEmailNorm !== sNorm) {
          needingUpdateCount++;
          docsToUpdate.push({
            ref: docSnap.ref,
            updates: {
              parentEmailNorm: pNorm,
              secondaryParentEmailNorm: sNorm
            }
          });
        }
      });

      if (apply && docsToUpdate.length > 0) {
        const batchSize = 400;
        for (let i = 0; i < docsToUpdate.length; i += batchSize) {
          const chunk = docsToUpdate.slice(i, i + batchSize);
          const batch = db.batch();
          for (const item of chunk) {
            batch.update(item.ref, item.updates);
          }
          await batch.commit();
          updatedCount += chunk.length;
        }
      }
    } else {
      // Process root students array
      const rootStudents = Array.isArray(tenantData.students) ? tenantData.students : [];
      schoolStudentCount = rootStudents.length;
      let rootNeedsUpdate = false;

      const updatedRootStudents = rootStudents.map(student => {
        const pEmail = (student.parentEmail || '').trim();
        const sEmail = (student.secondaryParentEmail || '').trim();
        const pNorm = normalizeEmail(pEmail);
        const sNorm = normalizeEmail(sEmail);

        if (pEmail) withParentEmail++;
        if (sEmail) withSecondaryEmail++;

        if (student.parentEmailNorm !== pNorm || student.secondaryParentEmailNorm !== sNorm) {
          needingUpdateCount++;
          rootNeedsUpdate = true;
          return Object.assign({}, student, {
            parentEmailNorm: pNorm,
            secondaryParentEmailNorm: sNorm
          });
        }
        return student;
      });

      if (apply && rootNeedsUpdate) {
        await tenantDocRef.update({ students: updatedRootStudents });
        updatedCount = needingUpdateCount;
      }
    }

    grandTotalStudents += schoolStudentCount;
    grandTotalNeedingUpdate += needingUpdateCount;
    grandTotalUpdated += updatedCount;

    report.push({
      schoolId,
      storageType: isSubcollectionActive ? 'subcollection' : 'root_array',
      totalStudents: schoolStudentCount,
      withParentEmail,
      withSecondaryEmail,
      needingUpdate: needingUpdateCount,
      updated: apply ? updatedCount : 0
    });
  }

  console.table(report);
  console.log(`Total students inspected:   ${grandTotalStudents}`);
  console.log(`Total students needing norm: ${grandTotalNeedingUpdate}`);
  if (apply) {
    console.log(`Total students updated:     ${grandTotalUpdated}`);
  } else {
    console.log(`Mode: DRY-RUN completed. Zero writes performed.`);
  }

  return { report, grandTotalStudents, grandTotalNeedingUpdate, grandTotalUpdated };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  let schoolArg = null;
  const sIdx = args.indexOf('--school');
  if (sIdx !== -1 && args[sIdx + 1]) {
    schoolArg = args[sIdx + 1];
  }

  runBackfill({ apply: isApply, targetSchoolId: schoolArg })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Backfill error:', err);
      process.exit(1);
    });
}

module.exports = { runBackfill };
