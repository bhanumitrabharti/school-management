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

// Helper to convert Firestore REST JSON value to JS value
function parseFirestoreValue(val) {
  if (val === null || val === undefined) return null;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return val.doubleValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('mapValue' in val) {
    const res = {};
    const fields = val.mapValue.fields || {};
    for (const k in fields) res[k] = parseFirestoreValue(fields[k]);
    return res;
  }
  if ('arrayValue' in val) {
    const vals = val.arrayValue.values || [];
    return vals.map(parseFirestoreValue);
  }
  return val;
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
  const parsedRoot = {};
  for (const k in rawFields) {
    parsedRoot[k] = parseFirestoreValue(rawFields[k]);
  }
  const pitrSettings = parsedRoot.settings || {};
  const pitrSettingsKeys = Object.keys(pitrSettings).sort();
  console.log(`PITR pre-incident settings key count: ${pitrSettingsKeys.length}`);
  console.log(`PITR credentialsIsolated: ${pitrSettings.credentialsIsolated}`);

  // 3. Compute key diff
  console.log('\n--- Step 3: Computing Key-Level Differences ---');
  const droppedKeys = pitrSettingsKeys.filter(k => !(k in currentSettings));
  const changedKeys = pitrSettingsKeys.filter(k => (k in currentSettings) && JSON.stringify(pitrSettings[k]) !== JSON.stringify(currentSettings[k]));

  console.log(`Dropped settings keys (${droppedKeys.length}):`, droppedKeys);
  console.log(`Changed settings keys (${changedKeys.length}):`, changedKeys);

  // 4. Build dot-path update payload
  // We restore all dropped keys, and restore original values for critical metadata/branding fields
  const dotPathUpdates = {};

  // All dropped keys must be restored
  for (const k of droppedKeys) {
    dotPathUpdates[`settings.${k}`] = pitrSettings[k];
  }

  // Critical keys that must match pre-incident configuration:
  // schoolInfo had extra fields (logoUrl, etc.)
  if (pitrSettings.schoolInfo) {
    dotPathUpdates['settings.schoolInfo'] = pitrSettings.schoolInfo;
  }
  if (pitrSettings.phone) {
    dotPathUpdates['settings.phone'] = pitrSettings.phone;
  }
  if (pitrSettings.feeStructure) {
    dotPathUpdates['settings.feeStructure'] = pitrSettings.feeStructure;
  }

  // Explicit defense-in-depth: credentialsIsolated MUST be true
  dotPathUpdates['settings.credentialsIsolated'] = true;

  console.log('\n--- Step 4: Keys Prepared for Dot-Path Restoration ---');
  const restoreKeys = Object.keys(dotPathUpdates).sort();
  console.log(`Total dot-path fields to update (${restoreKeys.length}):`);
  restoreKeys.forEach(k => console.log(`  • ${k}`));

  // 5. Check allowed_features on schools/{schoolId}
  console.log('\n--- Step 5: Checking allowed_features for "accounts" ---');
  const schoolSnap = await schoolRef.get();
  let schoolAllowed = [];
  if (schoolSnap.exists) {
    schoolAllowed = schoolSnap.data().allowed_features || [];
  }
  const hasAccounts = schoolAllowed.includes('accounts');
  console.log(`schools/${schoolId} allowed_features contains "accounts": ${hasAccounts}`);
  if (!hasAccounts) {
    console.log('Will ensure "accounts" is added to allowed_features.');
  } else {
    console.log('"accounts" feature is already preserved in schools/' + schoolId);
  }

  // 6. Action Execution
  if (!isApply) {
    console.log('\n================================================================');
    console.log('DRY-RUN COMPLETE — ZERO WRITES PERFORMED.');
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
  const backupFilePath = path.join(backupDir, `greenwood_root_backup_pre_restore_${backupTimestamp}.json`);
  fs.writeFileSync(backupFilePath, JSON.stringify(currentRootData, null, 2), 'utf8');
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

  // D. Verify post-restore document
  const verifySnap = await tenantRef.get();
  const verifyData = verifySnap.data();
  const verifySettings = verifyData.settings || {};
  console.log('\n--- Post-Restore Verification ---');
  console.log(`Settings key count now: ${Object.keys(verifySettings).length}`);
  console.log(`credentialsIsolated: ${verifySettings.credentialsIsolated}`);
  if (verifySettings.credentialsIsolated === true) {
    console.log('✅ CONFIRMED: settings.credentialsIsolated is TRUE.');
  } else {
    console.error('❌ ERROR: settings.credentialsIsolated is NOT TRUE!');
  }

  console.log('\n================================================================');
  console.log('RESTORE SUCCESSFULLY COMPLETED.');
  console.log('================================================================');
}

main().catch(err => {
  console.error('Restore script error:', err);
  process.exit(1);
});
