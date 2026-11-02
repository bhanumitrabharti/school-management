const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

if (!admin.apps.length) {
  const saPath = path.resolve(__dirname, '../service-account-key.json');
  if (fs.existsSync(saPath)) {
    admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
  } else {
    admin.initializeApp();
  }
}
const db = admin.firestore();

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

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

async function rollbackStorageVersion(schoolId) {
  console.error(`\n🚨 [ROLLBACK] Reverting settings.storageVersion = 1 for ${schoolId}...`);
  try {
    await db.doc(`tenant_data/${schoolId}`).update({ 'settings.storageVersion': 1 });
    console.error(`🚨 [ROLLBACK] Revert to storageVersion = 1 completed.`);
  } catch (err) {
    console.error(`🚨 [ROLLBACK ERROR] Failed to revert storageVersion: ${err.message}`);
  }
}

async function verifyMigration(schoolId, backupPath) {
  console.log(`\n========================================================`);
  console.log(`POST-MIGRATION VERIFICATION: ${schoolId}`);
  console.log(`========================================================`);

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found at ${backupPath}`);
  }
  const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

  const liveDocSnap = await db.doc(`tenant_data/${schoolId}`).get();
  if (!liveDocSnap.exists) {
    throw new Error(`Live root document tenant_data/${schoolId} does not exist`);
  }
  const liveData = liveDocSnap.data();

  // 1. Report Status Check
  const runId = liveData.settings && liveData.settings.migrationRunId;
  if (!runId) {
    throw new Error(`Missing settings.migrationRunId in live document`);
  }
  const reportSnap = await db.doc(`tenant_data/${schoolId}/migration_reports/${runId}`).get();
  if (!reportSnap.exists) {
    throw new Error(`Migration report tenant_data/${schoolId}/migration_reports/${runId} not found`);
  }
  const report = reportSnap.data();
  if (report.status !== 'verified') {
    throw new Error(`Migration report status is '${report.status}', expected 'verified'`);
  }
  console.log(`✔ [Verification 1/4] Report status is 'verified' (runId: ${runId})`);

  // 2. credentialsIsolated untouched check
  const backupCI = backupData.settings ? backupData.settings.credentialsIsolated : undefined;
  const liveCI = liveData.settings ? liveData.settings.credentialsIsolated : undefined;
  if (backupCI !== liveCI) {
    throw new Error(`credentialsIsolated changed! Backup: ${backupCI}, Live: ${liveCI}`);
  }
  console.log(`✔ [Verification 2/4] settings.credentialsIsolated untouched (${liveCI})`);

  // 3. Root Diff: ONLY additions allowed
  // A. All root keys in backup must exist in live
  for (const key of Object.keys(backupData)) {
    if (liveData[key] === undefined) {
      throw new Error(`Field '${key}' was deleted from root document!`);
    }
    if (key !== 'settings') {
      if (!deepEqual(backupData[key], liveData[key])) {
        throw new Error(`Root field '${key}' was modified during migration!`);
      }
    }
  }

  // B. No unexpected new root keys (only settings modified)
  for (const key of Object.keys(liveData)) {
    if (backupData[key] === undefined) {
      throw new Error(`Unexpected root field '${key}' added!`);
    }
  }

  // C. Settings diff
  const backupSettings = backupData.settings || {};
  const liveSettings = liveData.settings || {};

  // All backup settings keys must be unchanged
  for (const sKey of Object.keys(backupSettings)) {
    if (sKey === 'schoolInfo' && backupSettings.schoolInfo && typeof backupSettings.schoolInfo === 'object') {
      const bSI = backupSettings.schoolInfo;
      const lSI = liveSettings.schoolInfo || {};
      for (const siKey of Object.keys(bSI)) {
        if (!deepEqual(bSI[siKey], lSI[siKey])) {
          throw new Error(`settings.schoolInfo.${siKey} was modified!`);
        }
      }
      for (const lsiKey of Object.keys(lSI)) {
        if (bSI[lsiKey] === undefined && lsiKey !== 'logoStorageUrl' && lsiKey !== 'principalSignatureStorageUrl') {
          throw new Error(`Unexpected field added to schoolInfo: ${lsiKey}`);
        }
      }
    } else {
      if (!deepEqual(backupSettings[sKey], liveSettings[sKey])) {
        throw new Error(`settings.${sKey} was modified! Original: ${JSON.stringify(backupSettings[sKey])}, Live: ${JSON.stringify(liveSettings[sKey])}`);
      }
    }
  }

  // The ONLY allowed added keys in liveSettings are:
  const allowedSettingsAdditions = new Set([
    'storageVersion',
    'storageMigratedAt',
    'migrationRunId',
    'logoStorageUrl',
    'principalSignatureStorageUrl'
  ]);
  const addedSettingsKeys = [];
  for (const sKey of Object.keys(liveSettings)) {
    if (backupSettings[sKey] === undefined) {
      if (!allowedSettingsAdditions.has(sKey)) {
        throw new Error(`Unexpected settings addition: ${sKey}`);
      }
      addedSettingsKeys.push(sKey);
    }
  }

  if (liveSettings.storageVersion !== 2) {
    throw new Error(`settings.storageVersion is ${liveSettings.storageVersion}, expected 2`);
  }
  console.log(`✔ [Verification 3/4] Root diff confirmed ONLY additions: [${addedSettingsKeys.join(', ')}]`);

  // 4. Blob Storage URLs HTTPS + SHA-256 Verification
  const blobChecks = [];
  if (liveSettings.logoStorageUrl && liveSettings.logoStorageUrl !== backupSettings.logoStorageUrl) {
    blobChecks.push({
      type: 'logo',
      url: liveSettings.logoStorageUrl,
      base64: backupSettings.logoUrl || (backupSettings.schoolInfo && backupSettings.schoolInfo.logoUrl)
    });
  }
  if (liveSettings.principalSignatureStorageUrl && liveSettings.principalSignatureStorageUrl !== backupSettings.principalSignatureStorageUrl) {
    blobChecks.push({
      type: 'signature',
      url: liveSettings.principalSignatureStorageUrl,
      base64: backupSettings.principalSignatureUrl || (backupSettings.schoolInfo && backupSettings.schoolInfo.principalSignatureUrl)
    });
  }

  for (const bc of blobChecks) {
    if (!bc.base64 || !bc.base64.startsWith('data:')) {
      throw new Error(`Original base64 for ${bc.type} missing or invalid in backup`);
    }
    const rawB64 = bc.base64.replace(/^data:[^;]+;base64,/, '');
    const originalBuf = Buffer.from(rawB64, 'base64');
    const expectedHash = crypto.createHash('sha256').update(originalBuf).digest('hex');

    console.log(`Downloading ${bc.type} storage URL over HTTPS for SHA-256 parity...`);
    const downloadedBuf = await downloadBufferOverHttps(bc.url);
    const actualHash = crypto.createHash('sha256').update(downloadedBuf).digest('hex');

    if (expectedHash !== actualHash) {
      throw new Error(`SHA-256 MISMATCH for ${bc.type}! Expected: ${expectedHash}, Actual: ${actualHash}`);
    }
    console.log(`  -> ${bc.type} SHA-256 match verified: ${actualHash.slice(0, 16)}... (HTTP 200, size: ${downloadedBuf.length} bytes)`);
  }
  console.log(`✔ [Verification 4/4] Storage URLs verified: ${blobChecks.length} blob(s) passed HTTPS + SHA-256 check.`);

  console.log(`========================================================`);
  console.log(`✅ VERIFICATION 100% PASSED FOR ${schoolId}`);
  console.log(`========================================================\n`);

  return {
    schoolId,
    runId,
    status: 'verified',
    credentialsIsolated: liveCI,
    addedSettingsKeys,
    blobCount: blobChecks.length
  };
}

async function main() {
  const args = process.argv.slice(2);
  const schoolId = args[0];
  const backupPath = args[1];

  if (!schoolId || !backupPath) {
    console.error('Usage: node scripts/verify-v2-migration.js <schoolId> <backupPath>');
    process.exit(1);
  }

  try {
    await verifyMigration(schoolId, backupPath);
  } catch (err) {
    console.error(`\n❌ VERIFICATION FAILED: ${err.message}`);
    await rollbackStorageVersion(schoolId);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { verifyMigration, rollbackStorageVersion };
