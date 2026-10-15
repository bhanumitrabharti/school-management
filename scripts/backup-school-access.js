const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!fs.existsSync(saPath)) {
  console.error('FATAL: service-account-key.json not found at', saPath);
  process.exit(1);
}

const serviceAccount = require(saPath);
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function runBackup() {
  console.log('=== STEP 1: BACKUP SCHOOL_ACCESS AND CURRENT LIVE RULES ===\n');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 1. Backup live firestore.rules
  const liveRulesPath = path.resolve(__dirname, '..', 'firestore.rules');
  const savedRulesPath = path.join(backupDir, `firestore.rules.pre-stage2.${timestamp}.rules`);
  if (fs.existsSync(liveRulesPath)) {
    const rulesContent = fs.readFileSync(liveRulesPath, 'utf8');
    fs.writeFileSync(savedRulesPath, rulesContent, 'utf8');
    console.log(`[RULES BACKUP] Live rules saved to:\n  ${savedRulesPath} (${rulesContent.length} bytes)\n`);
  } else {
    console.warn('[RULES BACKUP] Warning: firestore.rules not found at', liveRulesPath);
  }

  // 2. Fetch all school_access documents
  console.log('[SCHOOL_ACCESS] Fetching all documents from school_access collection...');
  const snapshot = await db.collection('school_access').get();
  console.log(`[SCHOOL_ACCESS] Total documents found: ${snapshot.size}`);

  const docs = [];
  const countsPerSchool = {};
  let totalWithVerifiedAt = 0;
  let totalWithoutVerifiedAt = 0;

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const id = docSnap.id;
    const schoolId = data.schoolId || 'UNKNOWN_SCHOOL';
    const role = data.role || 'UNKNOWN_ROLE';
    const hasVerifiedAt = !!data.verifiedAt;
    const hasTeacherId = !!data.teacherId;

    if (hasVerifiedAt) totalWithVerifiedAt++;
    else totalWithoutVerifiedAt++;

    if (!countsPerSchool[schoolId]) {
      countsPerSchool[schoolId] = {
        total: 0,
        withVerifiedAt: 0,
        withoutVerifiedAt: 0,
        roles: {}
      };
    }
    countsPerSchool[schoolId].total++;
    if (hasVerifiedAt) countsPerSchool[schoolId].withVerifiedAt++;
    else countsPerSchool[schoolId].withoutVerifiedAt++;

    countsPerSchool[schoolId].roles[role] = (countsPerSchool[schoolId].roles[role] || 0) + 1;

    docs.push({
      id,
      data,
      hasVerifiedAt,
      hasTeacherId
    });
  });

  const backupData = {
    metadata: {
      collection: 'school_access',
      totalCount: snapshot.size,
      totalWithVerifiedAt,
      totalWithoutVerifiedAt,
      exportedAt: new Date().toISOString(),
      countsPerSchool
    },
    documents: docs
  };

  const backupJsonPath = path.join(backupDir, `school_access_full_${timestamp}.json`);
  const rawJson = JSON.stringify(backupData, null, 2);
  fs.writeFileSync(backupJsonPath, rawJson, 'utf8');

  const sha256 = crypto.createHash('sha256').update(rawJson).digest('hex');

  console.log(`\n[SCHOOL_ACCESS BACKUP] Successfully saved:`);
  console.log(`  Path: ${backupJsonPath}`);
  console.log(`  Bytes: ${rawJson.length}`);
  console.log(`  SHA256: ${sha256}`);
  console.log(`  Total docs: ${snapshot.size}`);
  console.log(`  Docs WITH verifiedAt (active sessions): ${totalWithVerifiedAt}`);
  console.log(`  Docs WITHOUT verifiedAt (legacy candidates for Step 4): ${totalWithoutVerifiedAt}`);

  console.log('\n--- COUNTS PER SCHOOL ---');
  for (const [sch, c] of Object.entries(countsPerSchool)) {
    console.log(`  • ${sch.padEnd(35)} : Total = ${String(c.total).padStart(3)} | With verifiedAt = ${String(c.withVerifiedAt).padStart(3)} | Without verifiedAt = ${String(c.withoutVerifiedAt).padStart(3)} | Roles: ${JSON.stringify(c.roles)}`);
  }
  console.log('-------------------------\n');

  console.log('=== STEP 1 COMPLETE ===\n');
}

runBackup().catch(err => {
  console.error('Fatal backup error:', err);
  process.exit(1);
});
