const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sa = JSON.parse(fs.readFileSync('service-account-key.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}
const db = admin.firestore();

function getHash(str) {
  if (!str) return 'EMPTY';
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

async function runLogoSync() {
  console.log('=== FIX 2(a): BACKUP SCHOOLS AND SYNC LOGOS FROM TENANT_DATA ===\n');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve('backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  // 1. FULL JSON BACKUP OF SCHOOLS COLLECTION
  console.log('[1/3] Backing up schools collection...');
  const snapBefore = await db.collection('schools').get();
  const backupSchools = {};
  snapBefore.forEach(docSnap => {
    backupSchools[docSnap.id] = docSnap.data();
  });

  const backupFilePath = path.join(backupDir, `schools_pre_logo_sync_${timestamp}.json`);
  const rawJson = JSON.stringify(backupSchools, null, 2);
  fs.writeFileSync(backupFilePath, rawJson, 'utf8');
  console.log(`[BACKUP] Saved ${snapBefore.size} schools docs to:\n  ${backupFilePath} (${rawJson.length} bytes)\n`);

  // 2. SYNC LOGOS FROM TENANT_DATA TO SCHOOLS
  console.log('[2/3] Syncing authentic logos from tenant_data to schools...');
  const report = [];

  for (const docSnap of snapBefore.docs) {
    const schoolId = docSnap.id;
    const schoolData = docSnap.data();
    const oldLogo = schoolData.logo_url || '';

    // Determine target tenant ID (for alias doc svm_bokaro_001_alias, use svm_bokaro_001)
    const targetTenantId = schoolData.school_id || schoolId;
    const tenantSnap = await db.collection('tenant_data').doc(targetTenantId).get();

    let newLogo = '';
    if (tenantSnap.exists) {
      const td = tenantSnap.data();
      const settingsLogo = td.settings && td.settings.logoUrl;
      const infoLogo = td.settings && td.settings.schoolInfo && td.settings.schoolInfo.logoUrl;
      newLogo = (settingsLogo && settingsLogo.trim() !== '') ? settingsLogo.trim() :
                ((infoLogo && infoLogo.trim() !== '') ? infoLogo.trim() : '');
    }

    let updated = false;
    // Condition: update if tenant has a logo, OR if school had './school-logo-updated.jpg' which must be replaced
    if (newLogo && newLogo !== oldLogo) {
      await db.collection('schools').doc(schoolId).update({
        logo_url: newLogo
      });
      updated = true;
    } else if (oldLogo === './school-logo-updated.jpg' && !newLogo) {
      // Clear incorrect hardcoded SVM logo if no tenant logo
      await db.collection('schools').doc(schoolId).update({
        logo_url: ''
      });
      updated = true;
    }

    report.push({
      SchoolDocId: schoolId,
      SchoolName: schoolData.school_name || 'UNKNOWN',
      Subdomain: schoolData.subdomain || 'NONE',
      'Before Len': oldLogo.length,
      'Before SHA': getHash(oldLogo),
      'After Len': updated ? (newLogo ? newLogo.length : 0) : oldLogo.length,
      'After SHA': updated ? getHash(newLogo) : getHash(oldLogo),
      Action: updated ? 'UPDATED ✅' : 'UNCHANGED (No Tenant Logo)'
    });
  }

  // 3. REPORT BEFORE AND AFTER TABLE
  console.log('\n[3/3] LOGO SYNC REPORT:');
  console.table(report);
  console.log('========================================================================\n');
}

runLogoSync().then(() => process.exit(0)).catch(err => {
  console.error('Fatal logo sync error:', err);
  process.exit(1);
});
