/**
 * scripts/backup-full-project.js
 * 
 * STRICTLY READ-ONLY full project backup script using Firebase Admin SDK.
 * Reads every top-level collection and recursively extracts all subcollections
 * without hardcoding collection names.
 * 
 * ZERO WRITE OPERATIONS: No set, update, delete, add, batch, transaction, recursiveDelete.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. Initialize Firebase Admin SDK
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

// Retry helper for intermittent network errors (ECONNRESET, UNAVAILABLE)
async function withRetry(fn, maxAttempts = 5, delayMs = 1500) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxAttempts) throw err;
      const isNetworkErr = err.code === 4 || err.code === 14 || (err.message && (err.message.includes('ECONNRESET') || err.message.includes('UNAVAILABLE') || err.message.includes('timeout')));
      if (!isNetworkErr) throw err;
      console.warn(`[Network Retry] Attempt ${attempt}/${maxAttempts} failed: ${err.message}. Retrying in ${delayMs * attempt}ms...`);
      await new Promise(res => setTimeout(res, delayMs * attempt));
    }
  }
}

// 2. Pure Read-Only Recursive Subcollection Crawler
async function crawlSubcollections(docRef) {
  const subColls = await withRetry(() => docRef.listCollections());
  if (!subColls || subColls.length === 0) {
    return null;
  }

  const result = {};
  for (const subColl of subColls) {
    const subCollId = subColl.id;
    result[subCollId] = [];
    const docRefs = await withRetry(() => subColl.listDocuments());
    for (const subDocRef of docRefs) {
      const snap = await withRetry(() => subDocRef.get());
      const childSubs = await crawlSubcollections(subDocRef);
      result[subCollId].push({
        id: subDocRef.id,
        path: subDocRef.path,
        data: snap.exists ? snap.data() : null,
        subcollections: childSubs
      });
    }
  }
  return result;
}

// Helper to calculate SHA-256 hash of a file
function getFileSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

// 3. Main Backup Process
async function runFullBackup() {
  const startTime = Date.now();
  const timestampISO = new Date().toISOString();
  const fileTimestamp = timestampISO.replace(/:/g, '-');

  const fullBackupDir = path.resolve(__dirname, '..', 'backups', 'full');
  if (!fs.existsSync(fullBackupDir)) {
    fs.mkdirSync(fullBackupDir, { recursive: true });
  }

  console.log('=== STARTING COMPLETE PROJECT BACKUP (STRICTLY READ-ONLY) ===');
  console.log('Timestamp:', timestampISO);
  console.log('Output Directory:', fullBackupDir);

  // 3.1 Discover all top-level collections
  const topCollections = await withRetry(() => db.listCollections());
  const topCollNames = topCollections.map(c => c.id);
  console.log('\nTop-level collections found (' + topCollNames.length + '):', topCollNames.join(', '));

  // 3.2 Back up non-tenant top-level collections into _project_<timestamp>.json
  const nonTenantCollections = {};
  for (const collRef of topCollections) {
    if (collRef.id === 'tenant_data') continue;
    console.log(`Reading top-level collection: ${collRef.id}...`);
    nonTenantCollections[collRef.id] = [];
    const docRefs = await withRetry(() => collRef.listDocuments());
    for (const docRef of docRefs) {
      const snap = await withRetry(() => docRef.get());
      const subs = await crawlSubcollections(docRef);
      nonTenantCollections[collRef.id].push({
        id: docRef.id,
        path: docRef.path,
        data: snap.exists ? snap.data() : null,
        subcollections: subs
      });
    }
  }

  const projectBackupFile = path.join(fullBackupDir, `_project_${fileTimestamp}.json`);
  fs.writeFileSync(projectBackupFile, JSON.stringify({
    metadata: {
      type: 'non_tenant_collections',
      timestamp: timestampISO,
      collections: Object.keys(nonTenantCollections)
    },
    collections: nonTenantCollections
  }, null, 2), 'utf8');

  console.log(`Saved project-level collections to: ${projectBackupFile} (${fs.statSync(projectBackupFile).size} bytes)`);

  // 3.3 Back up every tenant in tenant_data individually
  const tenantColl = topCollections.find(c => c.id === 'tenant_data');
  const tenantDocRefs = tenantColl ? await withRetry(() => tenantColl.listDocuments()) : [];
  console.log(`\nFound ${tenantDocRefs.length} tenants in 'tenant_data'. Crawling tenants and all subcollections recursively...\n`);

  const summary = [];

  for (const tDocRef of tenantDocRefs) {
    const schoolId = tDocRef.id;
    console.log(`--> Processing tenant: ${schoolId}...`);
    const rootSnap = await withRetry(() => tDocRef.get());
    const rootData = rootSnap.exists ? rootSnap.data() : null;

    // Recursively read all subcollections (attendance_months, fees_years, exam_marks, etc.)
    const subcollections = await crawlSubcollections(tDocRef);

    const tenantPayload = {
      metadata: {
        schoolId: schoolId,
        timestamp: timestampISO,
        path: tDocRef.path
      },
      rootDoc: rootData,
      subcollections: subcollections || {}
    };

    const tenantFile = path.join(fullBackupDir, `${schoolId}_full_${fileTimestamp}.json`);
    fs.writeFileSync(tenantFile, JSON.stringify(tenantPayload, null, 2), 'utf8');

    const fileStat = fs.statSync(tenantFile);
    const sha256 = getFileSha256(tenantFile);

    // Compute detailed counts for verification
    const studentsCount = (rootData && Array.isArray(rootData.students)) ? rootData.students.length : 0;
    const teachersCount = (rootData && Array.isArray(rootData.teachers)) ? rootData.teachers.length : 0;

    // Aggregate subcollections
    const subCollsFound = subcollections ? Object.keys(subcollections) : [];

    // Attendance aggregation
    let attendanceDocCount = 0;
    let attendanceRecordCount = 0;
    if (subcollections && subcollections.attendance_months) {
      for (const mDoc of subcollections.attendance_months) {
        if (mDoc.subcollections && mDoc.subcollections.classes) {
          for (const cDoc of mDoc.subcollections.classes) {
            attendanceDocCount++;
            if (cDoc.data && Array.isArray(cDoc.data.records)) {
              attendanceRecordCount += cDoc.data.records.length;
            }
          }
        }
      }
    }
    // Also check root attendance array if un-migrated/legacy
    if (rootData && Array.isArray(rootData.attendance) && rootData.attendance.length > 0) {
      attendanceRecordCount += rootData.attendance.length;
    }

    // Fee aggregation
    let feeTxnCount = 0;
    let feeTotalAmount = 0;
    if (subcollections && subcollections.fees_years) {
      for (const yDoc of subcollections.fees_years) {
        if (yDoc.subcollections && yDoc.subcollections.months) {
          for (const mDoc of yDoc.subcollections.months) {
            if (mDoc.data && Array.isArray(mDoc.data.transactions)) {
              feeTxnCount += mDoc.data.transactions.length;
              for (const t of mDoc.data.transactions) {
                const amt = Number(t.amount || t.paidAmount || 0);
                if (!isNaN(amt)) feeTotalAmount += amt;
              }
            }
          }
        }
      }
    }
    // Also check root fees array if legacy
    if (rootData && Array.isArray(rootData.fees) && rootData.fees.length > 0) {
      feeTxnCount += rootData.fees.length;
      for (const t of rootData.fees) {
        const amt = Number(t.amount || t.paidAmount || 0);
        if (!isNaN(amt)) feeTotalAmount += amt;
      }
    }

    // Exam marks aggregation
    let examMarkEntries = 0;
    if (subcollections && subcollections.exam_marks) {
      for (const eDoc of subcollections.exam_marks) {
        if (eDoc.data) {
          examMarkEntries += Object.keys(eDoc.data).length;
        }
      }
    }
    if (rootData && rootData.examMarks) {
      examMarkEntries += Object.keys(rootData.examMarks).length;
    }

    summary.push({
      schoolId,
      file: path.basename(tenantFile),
      fileBytes: fileStat.size,
      sha256,
      studentsCount,
      teachersCount,
      subCollsFound,
      attendanceDocCount,
      attendanceRecordCount,
      feeTxnCount,
      feeTotalAmount,
      examMarkEntries
    });
  }

  console.log('\n=== BACKUP COMPLETE ===');
  console.log(`Elapsed time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
  console.log('SUMMARY_JSON_START');
  console.log(JSON.stringify(summary, null, 2));
  console.log('SUMMARY_JSON_END');
}

runFullBackup().catch(err => {
  console.error('BACKUP FAILED:', err);
  process.exit(1);
});
