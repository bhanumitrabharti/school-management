/**
 * scripts/restore-greenwood-settings-2026-10-29.js
 * 
 * Incident Restore Script for Greenwood (svm_bokaro_001)
 * Restores dropped/overwritten settings keys from Firestore PITR (2026-10-29T16:05:00Z)
 * using dot-path updates per key (not a whole-map replace).
 * 
 * Usage:
 *   node scripts/restore-greenwood-settings-2026-10-29.js           (Dry-run by default)
 *   node scripts/restore-greenwood-settings-2026-10-29.js --apply   (Only with Bhanu's explicit GO)
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

/**
 * Hardened validator & parser for raw Firestore REST values:
 * - Rejects timestampValue, referenceValue, geoPointValue, bytesValue (ABORT)
 * - Converts integerValue to safe integer Number (or ABORT)
 * - Traverses maps and arrays recursively
 */
function validateAndParseFirestoreValue(val, keyPath) {
  if (val === null || val === undefined) return null;

  if ('timestampValue' in val) {
    throw new Error(`ABORT: Node at "${keyPath}" contains unsupported timestampValue`);
  }
  if ('referenceValue' in val) {
    throw new Error(`ABORT: Node at "${keyPath}" contains unsupported referenceValue`);
  }
  if ('geoPointValue' in val) {
    throw new Error(`ABORT: Node at "${keyPath}" contains unsupported geoPointValue`);
  }
  if ('bytesValue' in val) {
    throw new Error(`ABORT: Node at "${keyPath}" contains unsupported bytesValue`);
  }

  if ('stringValue' in val) {
    return val.stringValue;
  }

  if ('integerValue' in val) {
    const num = Number(val.integerValue);
    if (!Number.isSafeInteger(num)) {
      throw new Error(`ABORT: integerValue at "${keyPath}" (${val.integerValue}) is not a safe integer`);
    }
    return num;
  }

  if ('doubleValue' in val) {
    return val.doubleValue;
  }

  if ('booleanValue' in val) {
    return val.booleanValue;
  }

  if ('nullValue' in val) {
    return null;
  }

  if ('mapValue' in val) {
    const res = {};
    const fields = val.mapValue.fields || {};
    for (const k in fields) {
      res[k] = validateAndParseFirestoreValue(fields[k], `${keyPath}.${k}`);
    }
    return res;
  }

  if ('arrayValue' in val) {
    const vals = val.arrayValue.values || [];
    return vals.map((item, idx) => validateAndParseFirestoreValue(item, `${keyPath}[${idx}]`));
  }

  throw new Error(`ABORT: Unknown node format at "${keyPath}": ${JSON.stringify(val)}`);
}

function describeJsType(val) {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (Array.isArray(val)) return `Array (length: ${val.length})`;
  if (typeof val === 'object') return `Object/Map (keys: ${Object.keys(val).length})`;
  if (typeof val === 'number') {
    return Number.isInteger(val) ? 'number (integer)' : 'number (float)';
  }
  return typeof val;
}

async function main() {
  const isApply = process.argv.includes('--apply');
  console.log('================================================================');
  console.log(`GREENWOOD SETTINGS RESTORE — Mode: ${isApply ? '🚨 APPLY (LIVE WRITE)' : '🔍 DRY-RUN (READ-ONLY)'}`);
  console.log('================================================================');

  // Locate service account key
  const saPaths = [
    path.join(__dirname, '../service-account-key.json'),
    path.join(__dirname, 'service-account-key.json'),
    'C:/Users/bhanu/.gemini/antigravity/scratch/school-management/service-account-key.json'
  ];
  let saPath = saPaths.find(p => fs.existsSync(p));
  if (!saPath) {
    throw new Error('service-account-key.json not found!');
  }

  const sa = require(saPath);
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(sa)
    });
  }
  const db = admin.firestore();

  const schoolId = 'svm_bokaro_001';
  const tenantRef = db.doc(`tenant_data/${schoolId}`);
  const schoolRef = db.doc(`schools/${schoolId}`);

  // 1. Fetch current live Greenwood root doc
  console.log('\n--- Step 1: Reading Current Live Greenwood Root Doc ---');
  const snap = await tenantRef.get();
  if (!snap.exists) {
    throw new Error(`tenant_data/${schoolId} does not exist!`);
  }
  const currentRootData = snap.data();
  const currentSettings = currentRootData.settings || {};
  const currentSettingsKeys = Object.keys(currentSettings).sort();
  console.log(`Current settings key count: ${currentSettingsKeys.length}`);
  console.log(`Current credentialsIsolated: ${currentSettings.credentialsIsolated}`);

  // 2. Fetch PITR snapshot before incident (2026-10-29T16:05:00Z)
  console.log('\n--- Step 2: Fetching Pre-Incident Snapshot via PITR (2026-10-29T16:05:00Z) ---');
  const tokenObj = await admin.credential.cert(sa).getAccessToken();
  const token = tokenObj.access_token;
  const pitrUrl = `https://firestore.googleapis.com/v1/projects/ctrl-shift-solutions/databases/(default)/documents/tenant_data/${schoolId}?readTime=2026-10-29T16:05:00Z`;

  const pitrRes = await fetch(pitrUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!pitrRes.ok) {
    throw new Error(`PITR read failed with status ${pitrRes.status}: ${await pitrRes.text()}`);
  }
  const pitrDoc = await pitrRes.json();
  const rawFields = pitrDoc.fields || {};

  if (!rawFields.settings || !rawFields.settings.mapValue || !rawFields.settings.mapValue.fields) {
    throw new Error('PITR document does not contain raw fields.settings map!');
  }
  const rawSettingsFields = rawFields.settings.mapValue.fields;
  const pitrSettingsKeys = Object.keys(rawSettingsFields).sort();
  console.log(`PITR pre-incident settings key count: ${pitrSettingsKeys.length}`);

  // 3. Compute key diff
  console.log('\n--- Step 3: Computing Key-Level Differences ---');
  const droppedKeys = pitrSettingsKeys.filter(k => !(k in currentSettings));
  const changedKeys = pitrSettingsKeys.filter(k => (k in currentSettings));

  console.log(`Dropped settings keys count: ${droppedKeys.length}`);

  // 4. Harden and Validate each of the 23 keys to restore before proceeding
  console.log('\n--- Step 4: Validating & Parsing Raw REST Nodes (Hardening Guard) ---');
  const targetKeysToRestore = [
    ...droppedKeys,
    'schoolInfo',
    'phone',
    'feeStructure'
  ];
  // Deduplicate and sort
  const uniqueKeysToRestore = Array.from(new Set(targetKeysToRestore)).sort();

  const dotPathUpdates = {};

  for (const k of uniqueKeysToRestore) {
    const rawVal = rawSettingsFields[k];
    if (!rawVal) {
      throw new Error(`ABORT: Key "${k}" not found in PITR rawSettingsFields!`);
    }
    // Hardened recursive validation and parsing:
    const parsedVal = validateAndParseFirestoreValue(rawVal, `settings.${k}`);
    dotPathUpdates[`settings.${k}`] = parsedVal;
  }

  // Explicit defense-in-depth: credentialsIsolated MUST be true
  dotPathUpdates['settings.credentialsIsolated'] = true;

  console.log(`\nValidated all ${Object.keys(dotPathUpdates).length} fields successfully.`);
  console.log('\n--- Step 5: Dot-Path Keys and JS Types (No Sensitive Values Printed) ---');
  const restoreKeys = Object.keys(dotPathUpdates).sort();
  restoreKeys.forEach(k => {
    const val = dotPathUpdates[k];
    const typeDesc = describeJsType(val);
    console.log(`  • ${k.padEnd(40)} -> JS Type: ${typeDesc}`);
  });

  // 6. Check allowed_features on schools/{schoolId}
  console.log('\n--- Step 6: Checking allowed_features for "accounts" ---');
  const schoolSnap = await schoolRef.get();
  let schoolAllowed = [];
  if (schoolSnap.exists) {
    schoolAllowed = schoolSnap.data().allowed_features || [];
  }
  const hasAccounts = schoolAllowed.includes('accounts');
  console.log(`schools/${schoolId} allowed_features contains "accounts": ${hasAccounts}`);

  // 7. Action Execution
  if (!isApply) {
    console.log('\n================================================================');
    console.log('DRY-RUN COMPLETE — ZERO WRITES PERFORMED.');
    console.log('Validation passed: all 23 keys contain only safe types.');
    console.log('To apply these changes after receiving Bhanu\'s explicit GO, run:');
    console.log('  node scripts/restore-greenwood-settings-2026-10-29.js --apply');
    console.log('================================================================');
    return;
  }

  // --- APPLY MODE (Only runs when --apply is passed) ---
  console.log('\n================================================================');
  console.log('🚨 EXECUTING RESTORE — APPLYING TO PRODUCTION FIRESTORE...');
  console.log('================================================================');

  // A. Take a fresh backup of current Greenwood root doc
  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `greenwood_root_backup_pre_restore_${backupTimestamp}.json`;
  const backupFilePath = path.join(backupDir, backupFileName);
  fs.writeFileSync(backupFilePath, JSON.stringify(currentRootData, null, 2), 'utf8');

  // Also save a copy in scratch for safety
  const scratchDir = 'C:/Users/bhanu/.gemini/antigravity/brain/06985d1a-3444-4a82-be77-f91f40399cc3/scratch';
  if (fs.existsSync(scratchDir)) {
    fs.writeFileSync(path.join(scratchDir, backupFileName), JSON.stringify(currentRootData, null, 2), 'utf8');
  }

  console.log(`✅ Fresh pre-restore backup saved to: ${backupFilePath}`);

  // B. Perform dot-path update on tenant_data/svm_bokaro_001
  console.log('Applying dot-path updates to tenant_data/' + schoolId + '...');
  await tenantRef.update(dotPathUpdates);
  console.log('✅ tenant_data/' + schoolId + ' dot-path update complete.');

  // C. Ensure schools/svm_bokaro_001 preserves 'accounts' in allowed_features
  if (!hasAccounts && schoolSnap.exists) {
    const updatedFeatures = Array.from(new Set([...schoolAllowed, 'accounts']));
    await schoolRef.update({ allowed_features: updatedFeatures });
    console.log('✅ schools/' + schoolId + ' allowed_features updated to include "accounts".');
  }

  // D. Read-Back Verification
  console.log('\n--- Step 7: Live Read-Back Verification ---');
  const verifySnap = await tenantRef.get();
  const verifyData = verifySnap.data();
  const verifySettings = verifyData.settings || {};
  const finalSettingsKeys = Object.keys(verifySettings).sort();

  console.log(`Final settings key count: ${finalSettingsKeys.length} (Expected: 40)`);
  console.log(`credentialsIsolated: ${verifySettings.credentialsIsolated} (Expected: true)`);
  console.log(`geofence present?: ${'geofence' in verifySettings} (Expected: true)`);

  const credSnap = await db.doc(`tenant_data/${schoolId}/private/credentials`).get();
  console.log(`private/credentials exists: ${credSnap.exists}`);
  if (credSnap.exists) {
    console.log(`private/credentials keys: [${Object.keys(credSnap.data()).sort().join(', ')}]`);
  }

  const finalSchoolSnap = await schoolRef.get();
  const finalAllowed = (finalSchoolSnap.exists && finalSchoolSnap.data().allowed_features) || [];
  console.log(`allowed_features includes 'accounts': ${finalAllowed.includes('accounts')} (Expected: true)`);

  if (finalSettingsKeys.length !== 40 || verifySettings.credentialsIsolated !== true || !('geofence' in verifySettings) || !finalAllowed.includes('accounts')) {
    console.error('❌ Post-restore verification check failed!');
    process.exit(1);
  }

  console.log('\n================================================================');
  console.log('✅ RESTORE VERIFIED AND SUCCESSFULLY COMPLETED.');
  console.log('================================================================');
}

main().catch(err => {
  console.error('Restore script error:', err);
  process.exit(1);
});
