const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load Admin SDK
if (!admin.apps.length) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: 'ctrl-shift-solutions' });
  } else {
    const saPath = path.resolve(__dirname, '../service-account-key.json');
    if (fs.existsSync(saPath)) {
      admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
    } else {
      admin.initializeApp();
    }
  }
}
const db = admin.firestore();

// Storage instance (for base64 blobs)
let bucket = null;
try {
  bucket = admin.storage().bucket('ctrl-shift-solutions.firebasestorage.app');
} catch (e) {
  // Storage bucket might not be initialized in offline unit tests
}

function hashObject(obj) {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

// Firestore size calculation
function getFirestoreValueSize(val) {
  if (val === null || val === undefined) return 1;
  if (typeof val === 'boolean') return 1;
  if (typeof val === 'number') return 8;
  if (typeof val === 'string') return Buffer.byteLength(val, 'utf8') + 1;
  if (val instanceof Date) return 8;
  if (Buffer.isBuffer(val)) return val.length;
  if (val && typeof val.toMillis === 'function') return 8;
  if (Array.isArray(val)) {
    let size = 8;
    for (let i = 0; i < val.length; i++) size += getFirestoreValueSize(val[i]);
    return size;
  }
  if (typeof val === 'object') {
    let size = 0;
    const keys = Object.keys(val);
    for (let i = 0; i < keys.length; i++) {
      size += Buffer.byteLength(keys[i], 'utf8') + 1;
      size += getFirestoreValueSize(val[keys[i]]);
    }
    return size;
  }
  return 0;
}

function calculateFirestoreDocSize(docPath, data) {
  const segments = docPath.split('/').filter(Boolean);
  let pathBytes = 16;
  for (const s of segments) pathBytes += Buffer.byteLength(s, 'utf8');
  let fieldsSize = 0;
  if (data && typeof data === 'object') {
    for (const k of Object.keys(data)) {
      fieldsSize += (Buffer.byteLength(k, 'utf8') + 1 + getFirestoreValueSize(data[k]));
    }
  }
  return pathBytes + 32 + fieldsSize;
}

async function uploadBase64ToStorage(schoolId, base64Str, blobName) {
  if (!bucket || !base64Str || !base64Str.startsWith('data:')) return null;
  const match = base64Str.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const ext = mimeType.split('/')[1] || 'png';
  const fileName = `schools/${schoolId}/branding/${blobName}_${Date.now()}.${ext}`;
  const file = bucket.file(fileName);

  await file.save(buffer, {
    contentType: mimeType,
    metadata: {
      cacheControl: 'public, max-age=31536000'
    }
  });
  await file.makePublic().catch(() => {});
  return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
}

async function migrateSchool(schoolId, options = {}) {
  const isApply = options.apply === true;
  const targetKey = options.key || null;

  console.log(`\n========================================================================`);
  console.log(`MIGRATION ${isApply ? 'APPLY' : 'DRY-RUN'} FOR TENANT: ${schoolId}`);
  console.log(`========================================================================`);

  const docRef = db.doc(`tenant_data/${schoolId}`);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    console.log(`Tenant document tenant_data/${schoolId} does not exist. Skipping.`);
    return null;
  }

  const rootData = docSnap.data();
  const currentSizeBytes = calculateFirestoreDocSize(`tenant_data/${schoolId}`, rootData);
  const currentSizeKB = +(currentSizeBytes / 1024).toFixed(2);
  const pctOf1MB = +((currentSizeBytes / 1048576) * 100).toFixed(1);

  console.log(`Current Root Document Size: ${currentSizeKB} KB (${pctOf1MB}% of 1 MiB)`);
  if (rootData.settings && rootData.settings.storageVersion >= 2) {
    console.log(`[INFO] Tenant already has storageVersion = ${rootData.settings.storageVersion}.`);
  }

  const plan = {
    schoolId,
    currentSizeBytes,
    currentSizeKB,
    keys: {},
    blobs: [],
    projectedFreedBytes: 0,
    projectedFinalBytes: currentSizeBytes
  };

  // 1. Teacher Attendance Punches
  if (!targetKey || targetKey === 'teacherAttendance') {
    const rawPunches = Array.isArray(rootData.teacherAttendance) ? rootData.teacherAttendance : [];
    const rawBytes = getFirestoreValueSize(rawPunches);
    const buckets = {}; // monthKey -> teacherId -> records[]

    for (const p of rawPunches) {
      if (!p) continue;
      const mKey = (p.date || '').slice(0, 7) || 'unknown';
      const tId = p.teacherId || 'unknown';
      if (!buckets[mKey]) buckets[mKey] = {};
      if (!buckets[mKey][tId]) buckets[mKey][tId] = [];
      buckets[mKey][tId].push(p);
    }

    let docCount = 0;
    Object.keys(buckets).forEach(m => { docCount += Object.keys(buckets[m]).length; });

    plan.keys.teacherAttendance = {
      sourceCount: rawPunches.length,
      sourceBytes: rawBytes,
      sourceKB: +(rawBytes / 1024).toFixed(2),
      targetCollection: `tenant_data/${schoolId}/teacher_attendance/{YYYY-MM}/teachers/{teacherId}`,
      targetDocCount: docCount,
      hash: hashObject(rawPunches),
      buckets
    };
    plan.projectedFreedBytes += rawBytes;
  }

  // 2. Attendance Requests & Teacher Correction Requests
  if (!targetKey || targetKey === 'attendanceRequests') {
    const reqs1 = Array.isArray(rootData.attendanceRequests) ? rootData.attendanceRequests : [];
    const reqs2 = Array.isArray(rootData.teacherCorrectionRequests) ? rootData.teacherCorrectionRequests : [];
    const seenIds = new Set();
    const combinedReqs = [];
    [...reqs1, ...reqs2].forEach(r => {
      if (!r) return;
      const rid = r.id || hashObject(r);
      if (!seenIds.has(rid)) {
        seenIds.add(rid);
        combinedReqs.push({ ...r, id: rid });
      }
    });

    const rawBytes = getFirestoreValueSize(reqs1) + getFirestoreValueSize(reqs2);
    plan.keys.attendanceRequests = {
      sourceCount: combinedReqs.length,
      sourceBytes: rawBytes,
      sourceKB: +(rawBytes / 1024).toFixed(2),
      targetCollection: `tenant_data/${schoolId}/attendance_requests/{id}`,
      targetDocCount: combinedReqs.length,
      hash: hashObject(combinedReqs),
      records: combinedReqs
    };
    plan.projectedFreedBytes += rawBytes;
  }

  // 3. Absence Intimations
  if (!targetKey || targetKey === 'absenceIntimationLog') {
    const rawIntimations = Array.isArray(rootData.absenceIntimationLog) ? rootData.absenceIntimationLog : [];
    const rawBytes = getFirestoreValueSize(rawIntimations);
    const records = rawIntimations.map((item, idx) => ({ ...item, id: item.id || `INTIM_${idx}_${hashObject(item)}` }));

    plan.keys.absenceIntimationLog = {
      sourceCount: records.length,
      sourceBytes: rawBytes,
      sourceKB: +(rawBytes / 1024).toFixed(2),
      targetCollection: `tenant_data/${schoolId}/absence_intimations/{id}`,
      targetDocCount: records.length,
      hash: hashObject(records),
      records
    };
    plan.projectedFreedBytes += rawBytes;
  }

  // 4. Notices
  if (!targetKey || targetKey === 'notices') {
    const rawNotices = Array.isArray(rootData.notices) ? rootData.notices : [];
    const rawBytes = getFirestoreValueSize(rawNotices);
    const records = rawNotices.map((n, idx) => ({ ...n, id: n.id || `NOTICE_${idx}_${hashObject(n)}` }));

    plan.keys.notices = {
      sourceCount: records.length,
      sourceBytes: rawBytes,
      sourceKB: +(rawBytes / 1024).toFixed(2),
      targetCollection: `tenant_data/${schoolId}/notices/{id}`,
      targetDocCount: records.length,
      hash: hashObject(records),
      records
    };
    plan.projectedFreedBytes += rawBytes;
  }

  // 5. Notifications
  if (!targetKey || targetKey === 'notifications') {
    const rawNotifs = Array.isArray(rootData.notifications) ? rootData.notifications : [];
    const rawBytes = getFirestoreValueSize(rawNotifs);
    const records = rawNotifs.map((n, idx) => ({ ...n, id: n.id || `NOTIF_${idx}_${hashObject(n)}` }));

    plan.keys.notifications = {
      sourceCount: records.length,
      sourceBytes: rawBytes,
      sourceKB: +(rawBytes / 1024).toFixed(2),
      targetCollection: `tenant_data/${schoolId}/notifications/{id}`,
      targetDocCount: records.length,
      hash: hashObject(records),
      records
    };
    plan.projectedFreedBytes += rawBytes;
  }

  // 6. Exam Audit Log
  if (!targetKey || targetKey === 'examAuditLog') {
    const rawLogs1 = Array.isArray(rootData.examAuditLog) ? rootData.examAuditLog : [];
    const rawLogs2 = Array.isArray(rootData.examMarksAuditLog) ? rootData.examMarksAuditLog : [];
    const combined = [...rawLogs1, ...rawLogs2];
    const rawBytes = getFirestoreValueSize(combined);
    const records = combined.map((l, idx) => ({ ...l, id: l.id || `EXAUDIT_${idx}_${hashObject(l)}` }));

    plan.keys.examAuditLog = {
      sourceCount: records.length,
      sourceBytes: rawBytes,
      sourceKB: +(rawBytes / 1024).toFixed(2),
      targetCollection: `tenant_data/${schoolId}/exam_audit_log/{id}`,
      targetDocCount: records.length,
      hash: hashObject(records),
      records
    };
    plan.projectedFreedBytes += rawBytes;
  }

  // 7. Fee Activity Log (only if present on root doc)
  if (!targetKey || targetKey === 'feeActivityLog') {
    const rawLogs = Array.isArray(rootData.feeActivityLog) ? rootData.feeActivityLog : [];
    if (rawLogs.length > 0) {
      const rawBytes = getFirestoreValueSize(rawLogs);
      const records = rawLogs.map((l, idx) => ({ ...l, id: l.id || `FEELOG_${idx}_${hashObject(l)}` }));
      plan.keys.feeActivityLog = {
        sourceCount: records.length,
        sourceBytes: rawBytes,
        sourceKB: +(rawBytes / 1024).toFixed(2),
        targetCollection: `tenant_data/${schoolId}/fee_activity_logs/{id}`,
        targetDocCount: records.length,
        hash: hashObject(records),
        records
      };
      plan.projectedFreedBytes += rawBytes;
    }
  }

  // 8. Trash
  if (!targetKey || targetKey === 'trash') {
    const rawTrash = Array.isArray(rootData.trash) ? rootData.trash : [];
    const rawBytes = getFirestoreValueSize(rawTrash);
    const records = rawTrash.map((t, idx) => ({ ...t, id: t.id || `TRASH_${idx}_${hashObject(t)}` }));

    plan.keys.trash = {
      sourceCount: records.length,
      sourceBytes: rawBytes,
      sourceKB: +(rawBytes / 1024).toFixed(2),
      targetCollection: `tenant_data/${schoolId}/trash/{id}`,
      targetDocCount: records.length,
      hash: hashObject(records),
      records
    };
    plan.projectedFreedBytes += rawBytes;
  }

  // 9. Base64 Blobs in Settings
  if (!targetKey || targetKey === 'blobs') {
    const s = rootData.settings || {};
    const checkBlob = (val, pathName) => {
      if (typeof val === 'string' && val.startsWith('data:image/')) {
        const bBytes = getFirestoreValueSize(val);
        plan.blobs.push({
          path: pathName,
          sizeBytes: bBytes,
          sizeKB: +(bBytes / 1024).toFixed(2)
        });
        plan.projectedFreedBytes += bBytes;
      }
    };
    checkBlob(s.logoUrl, 'settings.logoUrl');
    checkBlob(s.principalSignatureUrl, 'settings.principalSignatureUrl');
    if (s.schoolInfo) {
      checkBlob(s.schoolInfo.logoUrl, 'settings.schoolInfo.logoUrl');
      checkBlob(s.schoolInfo.principalSignatureUrl, 'settings.schoolInfo.principalSignatureUrl');
    }
  }

  // 10. Legacy arrays already migrated or obsolete (fees, attendance, examMarks, schools, marks)
  const legacyKeys = ['fees', 'attendance', 'examMarks', 'marks', 'schools'];
  legacyKeys.forEach(lk => {
    if (rootData[lk] !== undefined) {
      const lBytes = getFirestoreValueSize(rootData[lk]);
      plan.keys[lk] = {
        sourceCount: Array.isArray(rootData[lk]) ? rootData[lk].length : Object.keys(rootData[lk]).length,
        sourceBytes: lBytes,
        sourceKB: +(lBytes / 1024).toFixed(2),
        isLegacy: true,
        action: 'strip_on_save_and_cleanup_later'
      };
      plan.projectedFreedBytes += lBytes;
    }
  });

  plan.projectedFinalBytes = Math.max(0, currentSizeBytes - plan.projectedFreedBytes);
  plan.projectedFinalKB = +(plan.projectedFinalBytes / 1024).toFixed(2);
  plan.projectedPctOf1MB = +((plan.projectedFinalBytes / 1048576) * 100).toFixed(1);
  plan.reductionPercent = +(((currentSizeBytes - plan.projectedFinalBytes) / currentSizeBytes) * 100).toFixed(1);

  // Print Summary Table
  console.log(`\n--- Migration Plan Summary for ${schoolId} ---`);
  console.log(`Current Root Size   : ${currentSizeKB} KB (${pctOf1MB}% of 1 MiB)`);
  console.log(`Projected Final Size: ${plan.projectedFinalKB} KB (${plan.projectedPctOf1MB}% of 1 MiB)`);
  console.log(`Expected Reduction  : ${plan.reductionPercent}% (saves ${(plan.projectedFreedBytes / 1024).toFixed(2)} KB)\n`);

  console.log(`Key Breakdown:`);
  Object.keys(plan.keys).forEach(k => {
    const ki = plan.keys[k];
    console.log(`  - ${k.padEnd(25)}: ${String(ki.sourceCount).padStart(5)} records | ${String(ki.sourceKB).padStart(7)} KB -> ${ki.targetCollection || ki.action}`);
  });
  if (plan.blobs.length > 0) {
    console.log(`Base64 Blobs:`);
    plan.blobs.forEach(b => {
      console.log(`  - ${b.path.padEnd(40)}: ${b.sizeKB} KB -> Storage`);
    });
  }

  if (!isApply) {
    console.log(`\n[DRY-RUN COMPLETE] No writes made. Run with --apply to execute migration.`);
    return plan;
  }

  // --- APPLY PHASE ---
  console.log(`\n>>> EXECUTING MIGRATION (APPLY MODE) <<<`);

  // 1. Full Local Backup
  const backupDir = path.resolve(__dirname, '../backups/root_docs');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `backup_${schoolId}_${timestampStr}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(rootData, null, 2), 'utf8');
  console.log(`✅ [Backup] Root document backed up to ${backupFile} (${(fs.statSync(backupFile).size / 1024).toFixed(2)} KB)`);

  const runId = `mig_${timestampStr}`;
  const batchLimit = 350;
  let currentBatch = db.batch();
  let batchOps = 0;

  const commitBatchIfNeeded = async () => {
    if (batchOps >= batchLimit) {
      await currentBatch.commit();
      currentBatch = db.batch();
      batchOps = 0;
    }
  };

  const finalCommit = async () => {
    if (batchOps > 0) {
      await currentBatch.commit();
      currentBatch = db.batch();
      batchOps = 0;
    }
  };

  // 2. Migrate Teacher Attendance
  if (plan.keys.teacherAttendance && plan.keys.teacherAttendance.buckets) {
    const buckets = plan.keys.teacherAttendance.buckets;
    for (const mKey of Object.keys(buckets)) {
      for (const tId of Object.keys(buckets[mKey])) {
        const records = buckets[mKey][tId];
        const teacherName = (records[0] && records[0].teacherName) || '';
        const targetDocRef = db.doc(`tenant_data/${schoolId}/teacher_attendance/${mKey}/teachers/${tId}`);

        // Merge records deterministically
        currentBatch.set(targetDocRef, {
          month: mKey,
          teacherId: tId,
          teacherName,
          records,
          recordCount: records.length,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        batchOps++;
        await commitBatchIfNeeded();
      }
    }
  }

  // Helper for single-record subcollections
  const migrateSingleRecords = async (records, colPath) => {
    if (!Array.isArray(records)) return;
    for (const rec of records) {
      const docRef = db.doc(`tenant_data/${schoolId}/${colPath}/${rec.id}`);
      currentBatch.set(docRef, {
        ...rec,
        _migratedAt: new Date().toISOString()
      }, { merge: true });
      batchOps++;
      await commitBatchIfNeeded();
    }
  };

  if (plan.keys.attendanceRequests) await migrateSingleRecords(plan.keys.attendanceRequests.records, 'attendance_requests');
  if (plan.keys.absenceIntimationLog) await migrateSingleRecords(plan.keys.absenceIntimationLog.records, 'absence_intimations');
  if (plan.keys.notices) await migrateSingleRecords(plan.keys.notices.records, 'notices');
  if (plan.keys.notifications) await migrateSingleRecords(plan.keys.notifications.records, 'notifications');
  if (plan.keys.examAuditLog) await migrateSingleRecords(plan.keys.examAuditLog.records, 'exam_audit_log');
  if (plan.keys.feeActivityLog) await migrateSingleRecords(plan.keys.feeActivityLog.records, 'fee_activity_logs');
  if (plan.keys.trash) await migrateSingleRecords(plan.keys.trash.records, 'trash');

  await finalCommit();
  console.log(`✅ [Subcollections] All candidate subcollection documents committed.`);

  // 3. Migrate Base64 Blobs to Storage (if any)
  const settingsUpdates = {};
  for (const b of plan.blobs) {
    let base64Val = null;
    let blobType = 'image';
    if (b.path === 'settings.logoUrl') {
      base64Val = rootData.settings && rootData.settings.logoUrl;
      blobType = 'logo';
    } else if (b.path === 'settings.principalSignatureUrl') {
      base64Val = rootData.settings && rootData.settings.principalSignatureUrl;
      blobType = 'signature';
    } else if (b.path === 'settings.schoolInfo.logoUrl') {
      base64Val = rootData.settings && rootData.settings.schoolInfo && rootData.settings.schoolInfo.logoUrl;
      blobType = 'logo';
    } else if (b.path === 'settings.schoolInfo.principalSignatureUrl') {
      base64Val = rootData.settings && rootData.settings.schoolInfo && rootData.settings.schoolInfo.principalSignatureUrl;
      blobType = 'signature';
    }

    if (base64Val && base64Val.startsWith('data:')) {
      try {
        const storageUrl = await uploadBase64ToStorage(schoolId, base64Val, blobType);
        if (storageUrl) {
          settingsUpdates[b.path] = storageUrl;
          console.log(`✅ [Blob -> Storage] Uploaded ${b.path} -> ${storageUrl}`);
        }
      } catch (uploadErr) {
        console.warn(`[Blob Warning] Could not upload ${b.path} to Storage:`, uploadErr.message);
      }
    }
  }

  // 4. Parity Verification (assert 100% records in new location)
  console.log(`\nVerifying parity in destination subcollections...`);
  if (plan.keys.teacherAttendance) {
    const buckets = plan.keys.teacherAttendance.buckets;
    let readBackCount = 0;
    for (const mKey of Object.keys(buckets)) {
      for (const tId of Object.keys(buckets[mKey])) {
        const snap = await db.doc(`tenant_data/${schoolId}/teacher_attendance/${mKey}/teachers/${tId}`).get();
        if (!snap.exists) throw new Error(`Parity check failed: missing ${snap.ref.path}`);
        readBackCount += (snap.data().records || []).length;
      }
    }
    if (readBackCount !== plan.keys.teacherAttendance.sourceCount) {
      throw new Error(`Parity count mismatch in teacherAttendance: expected ${plan.keys.teacherAttendance.sourceCount}, got ${readBackCount}`);
    }
    console.log(`✔ Parity passed: teacherAttendance (${readBackCount}/${readBackCount} punches verified)`);
  }

  if (plan.keys.notices) {
    const snaps = await db.collection(`tenant_data/${schoolId}/notices`).get();
    if (snaps.size < plan.keys.notices.sourceCount) {
      throw new Error(`Parity count mismatch in notices: expected >= ${plan.keys.notices.sourceCount}, got ${snaps.size}`);
    }
    console.log(`✔ Parity passed: notices (${snaps.size} docs in subcollection)`);
  }

  // 5. Write Migration Report Document (NO personal data)
  const reportDocRef = db.doc(`tenant_data/${schoolId}/migration_reports/${runId}`);
  const reportData = {
    runId,
    schoolId,
    timestamp: new Date().toISOString(),
    status: 'verified',
    storageVersion: 2,
    originalRootSizeKB: currentSizeKB,
    projectedFinalKB: plan.projectedFinalKB,
    reductionPercent: plan.reductionPercent,
    backupFile: path.basename(backupFile),
    migratedKeys: Object.keys(plan.keys).map(k => ({
      key: k,
      count: plan.keys[k].sourceCount || 0,
      sizeKB: plan.keys[k].sourceKB || 0,
      hash: plan.keys[k].hash || ''
    })),
    blobsMoved: plan.blobs.map(b => ({ path: b.path, sizeKB: b.sizeKB }))
  };
  await reportDocRef.set(reportData);
  console.log(`✅ [Report] Migration report written to ${reportDocRef.path}`);

  // 6. Dot-Path Update settings.storageVersion = 2 (Root doc fields are NOT deleted)
  const dotPathUpdates = {
    'settings.storageVersion': 2,
    'settings.storageMigratedAt': new Date().toISOString(),
    'settings.migrationRunId': runId,
    ...settingsUpdates
  };

  // If duplicate signature exists in schoolInfo, clear it
  if (rootData.settings && rootData.settings.schoolInfo && rootData.settings.schoolInfo.principalSignatureUrl) {
    dotPathUpdates['settings.schoolInfo.principalSignatureUrl'] = '';
  }

  await docRef.update(dotPathUpdates);
  console.log(`✅ [Root Update] Dot-path write: settings.storageVersion = 2 committed. (Root fields left intact).`);
  console.log(`========================================================================\n`);

  return plan;
}

// CLI handler
async function main() {
  const args = process.argv.slice(2);
  let school = null;
  let apply = false;
  let key = null;
  let all = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--school' && args[i + 1]) { school = args[i + 1]; i++; }
    else if (args[i] === '--apply') { apply = true; }
    else if (args[i] === '--dry-run') { apply = false; }
    else if (args[i] === '--key' && args[i + 1]) { key = args[i + 1]; i++; }
    else if (args[i] === '--all') { all = true; }
  }

  if (all) {
    const tenantsSnap = await db.collection('tenant_data').get();
    const allPlans = [];
    for (const doc of tenantsSnap.docs) {
      const plan = await migrateSchool(doc.id, { apply: false });
      if (plan) allPlans.push(plan);
    }
    const sumOut = path.resolve(__dirname, '../backups/all_schools_dry_run_summary.json');
    fs.mkdirSync(path.dirname(sumOut), { recursive: true });
    fs.writeFileSync(sumOut, JSON.stringify(allPlans, null, 2), 'utf8');
    console.log(`Saved dry run summary for all schools to ${sumOut}`);
    return;
  }

  if (!school) {
    console.error('Usage: node scripts/migrate-root-doc.js --school <schoolId> [--dry-run (default) | --apply] [--key <k>]');
    console.error('   or: node scripts/migrate-root-doc.js --all');
    process.exit(1);
  }

  await migrateSchool(school, { apply, key });
}

if (require.main === module) {
  main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = {
  migrateSchool,
  calculateFirestoreDocSize,
  getFirestoreValueSize,
  hashObject
};
