/**
 * scripts/backup-greenwood-credentials.js
 * 
 * Creates a complete safety backup of Greenwood (svm_bokaro_001)
 * including the root document and all known subcollections,
 * and verifies integrity.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SCHOOL_ID = 'svm_bokaro_001';

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!fs.existsSync(saPath)) {
  console.error('FATAL: service-account-key.json not found at', saPath);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
}
const db = admin.firestore();

async function runBackup() {
  console.log('================================================================');
  console.log('   BACKUP GREENWOOD (svm_bokaro_001) — PRE-CREDENTIAL-ISOLATION  ');
  console.log('================================================================\n');

  const rootRef = db.collection('tenant_data').doc(SCHOOL_ID);
  const rootSnap = await rootRef.get();
  if (!rootSnap.exists) {
    throw new Error(`School document tenant_data/${SCHOOL_ID} does not exist!`);
  }

  const rootData = rootSnap.data();
  console.log(`[ROOT] Document fetched. Size approx: ${JSON.stringify(rootData).length} bytes`);
  console.log(`[ROOT] Admin user: ${(rootData.settings || {}).adminUsername}`);
  console.log(`[ROOT] Teachers count: ${(rootData.teachers || []).length}`);
  console.log(`[ROOT] Students count in root: ${(rootData.students || []).length}`);

  // Subcollections to backup
  const subcollections = [
    'students',
    'student_profiles',
    'student_profiles_shared',
    'teacher_profiles',
    'attendance_months',
    'fees_years',
    'exam_marks',
    'teacher_attendance'
  ];

  const subcollectionData = {};
  for (const sub of subcollections) {
    const snap = await rootRef.collection(sub).get();
    subcollectionData[sub] = {};
    snap.docs.forEach(d => {
      subcollectionData[sub][d.id] = d.data();
    });
    console.log(`[SUBCOLLECTION] ${sub}: ${snap.size} docs fetched.`);
  }

  const backupDir = path.resolve(__dirname, '..', 'backups', 'greenwood');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = path.join(backupDir, `greenwood_pre_credentials_isolated_${timestamp}.json`);

  const payload = {
    metadata: {
      action: 'pre-credentials-isolation-backup',
      schoolId: SCHOOL_ID,
      timestamp: new Date().toISOString(),
      adminUsername: (rootData.settings || {}).adminUsername,
      adminPasswordHashPresent: Boolean((rootData.settings || {}).adminPassword),
      teachersCount: (rootData.teachers || []).length
    },
    rootDoc: rootData,
    subcollections: subcollectionData
  };

  const rawJson = JSON.stringify(payload, null, 2);
  fs.writeFileSync(backupFilePath, rawJson, 'utf8');

  // Verify backup integrity
  const stat = fs.statSync(backupFilePath);
  if (stat.size < 1000) {
    throw new Error(`Backup file is suspiciously small: ${stat.size} bytes`);
  }

  const reRead = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
  if (!reRead.rootDoc || !reRead.rootDoc.settings || reRead.rootDoc.teachers.length !== (rootData.teachers || []).length) {
    throw new Error('Backup verification failed: re-read contents do not match source data!');
  }

  console.log(`\n✅ Backup successfully saved and verified!`);
  console.log(`   File: ${backupFilePath}`);
  console.log(`   Size: ${stat.size} bytes`);
  return backupFilePath;
}

runBackup()
  .then(file => {
    console.log(`Backup completed successfully: ${file}`);
    process.exit(0);
  })
  .catch(err => {
    console.error('FATAL BACKUP ERROR:', err);
    process.exit(1);
  });
