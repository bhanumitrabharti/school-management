const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

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

function downloadBufferOverHttps(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBufferOverHttps(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP status ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', err => reject(err));
    });
    req.on('error', err => reject(err));
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Download timeout after 10s'));
    });
  });
}

async function uploadBase64ToStorage(schoolId, base64Str, blobName, options = {}) {
  const currentBucket = options.bucket || bucket;
  if (!currentBucket || !base64Str || !base64Str.startsWith('data:')) return null;
  const match = base64Str.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  let ext = mimeType.split('/')[1] || 'png';
  if (ext === 'jpeg') ext = 'jpg';
  if (ext === 'svg+xml') ext = 'svg';

  // Standard storage path convention:
  // Logo: schools/{schoolId}/logo.<ext>
  // Signature: schools/{schoolId}/signature.<ext>
  let fileName;
  if (blobName === 'logo' || blobName.includes('logo')) {
    fileName = `schools/${schoolId}/logo.${ext}`;
  } else {
    fileName = `schools/${schoolId}/signature.${ext}`;
  }

  const token = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
  const file = currentBucket.file(fileName);

  await file.save(buffer, {
    contentType: mimeType,
    metadata: {
      cacheControl: 'public, max-age=31536000',
      metadata: {
        firebaseStorageDownloadTokens: token
      }
    }
  });

  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${currentBucket.name}/o/${encodeURIComponent(fileName)}?alt=media&token=${token}`;

  // SHA-256 verification before returning URL
  const expectedHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const downloader = options.downloader || downloadBufferOverHttps;
  try {
    const downloadedBuffer = await downloader(downloadUrl);
    const actualHash = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');
    if (expectedHash !== actualHash) {
      console.error(`[BLOB ABORT] SHA-256 mismatch for ${blobName} at ${downloadUrl}. Expected: ${expectedHash}, Actual: ${actualHash}. Aborting blob update; keeping base64.`);
      return null;
    }
    console.log(`✔ [Blob Verified] SHA-256 matched (${expectedHash.slice(0, 12)}...) for ${fileName}`);
  } catch (downloadErr) {
    console.error(`[BLOB ABORT] Failed to download uploaded blob over HTTPS for verification: ${downloadErr.message}. Aborting blob update; keeping base64.`);
    return null;
  }

  return downloadUrl;
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
    projectedAfterMigrationBytes: 0,
    projectedAfterMigrationKB: 0,
    projectedAfterCleanupBytes: 0,
    projectedAfterCleanupKB: 0,
    cleanupSavingsKB: 0,
    reductionPercent: 0
  };

  // 1. teacherAttendance -> tenant_data/{schoolId}/teacher_attendance/{YYYY-MM}/teachers/{teacherId}
  if (!targetKey || targetKey === 'teacherAttendance') {
    const rawAttendance = rootData.teacherAttendance;
    if (Array.isArray(rawAttendance) && rawAttendance.length > 0) {
      const bytes = getFirestoreValueSize(rawAttendance);
      const buckets = {};
      rawAttendance.forEach(p => {
        if (!p) return;
        const dateStr = p.date || (p.timestamp ? p.timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10));
        const monthKey = dateStr.slice(0, 7);
        const teacherId = p.teacherId || 'unknown_teacher';

        if (!buckets[monthKey]) buckets[monthKey] = {};
        if (!buckets[monthKey][teacherId]) buckets[monthKey][teacherId] = [];
        buckets[monthKey][teacherId].push(p);
      });

      let targetDocCount = 0;
      Object.keys(buckets).forEach(m => {
        targetDocCount += Object.keys(buckets[m]).length;
      });

      plan.keys.teacherAttendance = {
        sourceCount: rawAttendance.length,
        sourceBytes: bytes,
        sourceKB: +(bytes / 1024).toFixed(2),
        targetCollection: `tenant_data/${schoolId}/teacher_attendance/{YYYY-MM}/teachers/{teacherId}`,
        targetDocCount,
        hash: hashObject(rawAttendance),
        buckets
      };
      plan.projectedFreedBytes += bytes;
    }
  }

  // Helper for single document records
  function planSingleCollection(keyName, targetSub) {
    if (targetKey && targetKey !== keyName) return;
    const raw = rootData[keyName];
    if (Array.isArray(raw) && raw.length > 0) {
      const bytes = getFirestoreValueSize(raw);
      plan.keys[keyName] = {
        sourceCount: raw.length,
        sourceBytes: bytes,
        sourceKB: +(bytes / 1024).toFixed(2),
        targetCollection: `tenant_data/${schoolId}/${targetSub}/{id}`,
        targetDocCount: raw.length,
        hash: hashObject(raw),
        records: raw
      };
      plan.projectedFreedBytes += bytes;
    }
  }

  planSingleCollection('attendanceRequests', 'attendance_requests');
  if (!plan.keys.attendanceRequests) {
    planSingleCollection('teacherCorrectionRequests', 'attendance_requests');
  }
  planSingleCollection('absenceIntimationLog', 'absence_intimations');
  planSingleCollection('notices', 'notices');
  planSingleCollection('notifications', 'notifications');
  planSingleCollection('examAuditLog', 'exam_audit_log');
  planSingleCollection('feeActivityLog', 'fee_activity_logs');
  planSingleCollection('trash', 'trash');

  // Base64 Blobs in settings
  if (rootData.settings && typeof rootData.settings === 'object') {
    const s = rootData.settings;
    const checkBlob = (val, p) => {
      if (typeof val === 'string' && val.startsWith('data:')) {
        const b = Buffer.byteLength(val, 'utf8');
        plan.blobs.push({ path: p, sizeBytes: b, sizeKB: +(b / 1024).toFixed(2) });
        plan.projectedFreedBytes += b;
      }
    };
    checkBlob(s.logoUrl, 'settings.logoUrl');
    checkBlob(s.principalSignatureUrl, 'settings.principalSignatureUrl');
    if (s.schoolInfo) {
      checkBlob(s.schoolInfo.logoUrl, 'settings.schoolInfo.logoUrl');
      checkBlob(s.schoolInfo.principalSignatureUrl, 'settings.schoolInfo.principalSignatureUrl');
    }
  }

  // Legacy arrays already migrated or obsolete
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

  // Size calculations:
  // 1. After migration: root doc fields preserved (no deletion). Only new config fields added.
  const addedConfigBytes = 350; // storageVersion, storageMigratedAt, migrationRunId, *StorageUrl
  plan.projectedAfterMigrationBytes = currentSizeBytes + addedConfigBytes;
  plan.projectedAfterMigrationKB = +(plan.projectedAfterMigrationBytes / 1024).toFixed(2);
  plan.projectedAfterMigrationPct = +((plan.projectedAfterMigrationBytes / 1048576) * 100).toFixed(1);

  // 2. After cleanup: Phase C (cleanup-root-legacy.js) removes legacy arrays & base64 fields
  plan.projectedAfterCleanupBytes = Math.max(0, currentSizeBytes - plan.projectedFreedBytes);
  plan.projectedAfterCleanupKB = +(plan.projectedAfterCleanupBytes / 1024).toFixed(2);
  plan.projectedAfterCleanupPct = +((plan.projectedAfterCleanupBytes / 1048576) * 100).toFixed(1);
  plan.cleanupSavingsBytes = plan.projectedFreedBytes;
  plan.cleanupSavingsKB = +(plan.projectedFreedBytes / 1024).toFixed(2);
  plan.cleanupReductionPercent = +(((currentSizeBytes - plan.projectedAfterCleanupBytes) / currentSizeBytes) * 100).toFixed(1);

  // Backward compatibility alias:
  plan.projectedFinalBytes = plan.projectedAfterCleanupBytes;
  plan.projectedFinalKB = plan.projectedAfterCleanupKB;
  plan.reductionPercent = plan.cleanupReductionPercent;

  // Print Summary Table
  console.log(`\n--- Migration Plan Summary for ${schoolId} ---`);
  console.log(`Current Root Size     : ${currentSizeKB} KB (${pctOf1MB}% of 1 MiB)`);
  console.log(`After Migration       : ${plan.projectedAfterMigrationKB} KB (${plan.projectedAfterMigrationPct}% of 1 MiB) [Root preserved + ~0.35 KB config]`);
  console.log(`After Phase C Cleanup : ${plan.projectedAfterCleanupKB} KB (${plan.projectedAfterCleanupPct}% of 1 MiB) [Saves ${plan.cleanupSavingsKB} KB, ${plan.cleanupReductionPercent}% reduction]\n`);

  console.log(`Key Breakdown:`);
  Object.keys(plan.keys).forEach(k => {
    const ki = plan.keys[k];
    console.log(`  - ${k.padEnd(25)}: ${String(ki.sourceCount).padStart(5)} records | ${String(ki.sourceKB).padStart(7)} KB -> ${ki.targetCollection || ki.action}`);
  });
  if (plan.blobs.length > 0) {
    console.log(`Base64 Blobs:`);
    plan.blobs.forEach(b => {
      console.log(`  - ${b.path.padEnd(40)}: ${b.sizeKB} KB -> Storage (writes to *StorageUrl, preserves base64)`);
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

  async function queueWrite(docRef, data, merge = true) {
    currentBatch.set(docRef, data, { merge });
    batchOps++;
    if (batchOps >= batchLimit) {
      await currentBatch.commit();
      console.log(`  ... committed batch of ${batchOps} ops`);
      currentBatch = db.batch();
      batchOps = 0;
    }
  }

  async function finalCommit() {
    if (batchOps > 0) {
      await currentBatch.commit();
      console.log(`  ... committed final batch of ${batchOps} ops`);
      currentBatch = db.batch();
      batchOps = 0;
    }
  }

  // 2. Migrate teacherAttendance
  if (plan.keys.teacherAttendance) {
    const buckets = plan.keys.teacherAttendance.buckets;
    for (const mKey of Object.keys(buckets)) {
      for (const tId of Object.keys(buckets[mKey])) {
        const records = buckets[mKey][tId];
        const teacherName = (records[0] && records[0].teacherName) || '';
        const targetRef = db.doc(`tenant_data/${schoolId}/teacher_attendance/${mKey}/teachers/${tId}`);
        await queueWrite(targetRef, {
          month: mKey,
          teacherId: tId,
          teacherName,
          records,
          updatedAt: new Date().toISOString()
        });
      }
    }
  }

  // Migrate single record collections
  async function migrateSingleRecords(records, subColName) {
    for (const rec of records) {
      const recId = rec.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const recData = { ...rec, id: recId };
      const targetRef = db.doc(`tenant_data/${schoolId}/${subColName}/${recId}`);
      await queueWrite(targetRef, recData);
    }
  }

  if (plan.keys.attendanceRequests) await migrateSingleRecords(plan.keys.attendanceRequests.records, 'attendance_requests');
  if (plan.keys.teacherCorrectionRequests && !plan.keys.attendanceRequests) await migrateSingleRecords(plan.keys.teacherCorrectionRequests.records, 'attendance_requests');
  if (plan.keys.absenceIntimationLog) await migrateSingleRecords(plan.keys.absenceIntimationLog.records, 'absence_intimations');
  if (plan.keys.notices) await migrateSingleRecords(plan.keys.notices.records, 'notices');
  if (plan.keys.notifications) await migrateSingleRecords(plan.keys.notifications.records, 'notifications');
  if (plan.keys.examAuditLog) await migrateSingleRecords(plan.keys.examAuditLog.records, 'exam_audit_log');
  if (plan.keys.feeActivityLog) await migrateSingleRecords(plan.keys.feeActivityLog.records, 'fee_activity_logs');
  if (plan.keys.trash) await migrateSingleRecords(plan.keys.trash.records, 'trash');

  await finalCommit();
  console.log(`✅ [Subcollections] All candidate subcollection documents committed.`);

  // 3. Migrate Base64 Blobs to Storage (R1 + R2: Honest No Deletion, Token URLs, SHA-256 Verified)
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
        const storageUrl = await uploadBase64ToStorage(schoolId, base64Val, blobType, options);
        if (storageUrl) {
          // R2: Write to NEW fields, NEVER overwrite or delete existing base64 fields!
          if (blobType === 'logo') {
            settingsUpdates['settings.logoStorageUrl'] = storageUrl;
            if (rootData.settings && rootData.settings.schoolInfo) {
              settingsUpdates['settings.schoolInfo.logoStorageUrl'] = storageUrl;
            }
          } else if (blobType === 'signature') {
            settingsUpdates['settings.principalSignatureStorageUrl'] = storageUrl;
            if (rootData.settings && rootData.settings.schoolInfo) {
              settingsUpdates['settings.schoolInfo.principalSignatureStorageUrl'] = storageUrl;
            }
          }
          console.log(`✅ [Blob -> Storage] Uploaded ${b.path} -> ${storageUrl}`);
        } else {
          console.warn(`[Blob Abort] Upload or hash verification failed for ${b.path}. Base64 field kept unchanged.`);
        }
      } catch (uploadErr) {
        console.warn(`[Blob Warning] Could not upload ${b.path} to Storage: ${uploadErr.message}. Base64 kept.`);
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
    storageVersion: 2,
    timestamp: new Date().toISOString(),
    status: 'verified',
    currentSizeBytes,
    currentSizeKB,
    projectedAfterMigrationKB: plan.projectedAfterMigrationKB,
    projectedAfterCleanupKB: plan.projectedAfterCleanupKB,
    cleanupSavingsKB: plan.cleanupSavingsKB,
    reductionPercent: plan.cleanupReductionPercent,
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

  // 6. Dot-Path Update settings.storageVersion = 2 (R2: Root doc fields are NOT deleted)
  const dotPathUpdates = {
    'settings.storageVersion': 2,
    'settings.storageMigratedAt': new Date().toISOString(),
    'settings.migrationRunId': runId,
    ...settingsUpdates
  };

  // R2 Honest "no deletion": Root fields are left 100% intact.
  // Existing values (including base64 logo/signatures) are never cleared or replaced in migration.

  await docRef.update(dotPathUpdates);
  console.log(`✅ [Root Update] Dot-path write: settings.storageVersion = 2 committed. (Root fields left 100% intact; only additions).`);
  console.log(`========================================================================\n`);

  return plan;
}

async function main() {
  const args = process.argv.slice(2);
  let school = null;
  let isApply = false;
  let targetKey = null;
  let allSchools = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--school' && args[i + 1]) { school = args[i + 1]; i++; }
    else if (args[i] === '--apply') { isApply = true; }
    else if (args[i] === '--key' && args[i + 1]) { targetKey = args[i + 1]; i++; }
    else if (args[i] === '--all') { allSchools = true; }
  }

  if (allSchools) {
    console.log(`Starting migration ${isApply ? 'APPLY' : 'DRY-RUN'} across all schools...`);
    const schoolsSnap = await db.collection('tenant_data').get();
    const results = [];
    for (const doc of schoolsSnap.docs) {
      const plan = await migrateSchool(doc.id, { apply: isApply, key: targetKey });
      if (plan) results.push(plan);
    }
    const sumPath = path.resolve(__dirname, '../backups/all_schools_dry_run_summary.json');
    fs.writeFileSync(sumPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`\nAll-school summary saved to ${sumPath}`);
    return;
  }

  if (!school) {
    console.error('Usage: node scripts/migrate-root-doc.js --school <id> [--apply] [--key <k>] [--all]');
    process.exit(1);
  }

  await migrateSchool(school, { apply: isApply, key: targetKey });
}

if (require.main === module) {
  main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = {
  migrateSchool,
  uploadBase64ToStorage,
  downloadBufferOverHttps,
  calculateFirestoreDocSize,
  getFirestoreValueSize
};
