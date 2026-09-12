/**
 * ===================================================================
 *  ONE-TIME MIGRATION SCRIPT — flat unbounded fields -> sub-collections
 * ===================================================================
 *
 * What this does (see FIRESTORE-RESTRUCTURE-BRIEF-FOR-ANTIGRAVITY.md for
 * the full design rationale):
 *
 *   tenant_data/{schoolId}.attendance[]        -> tenant_data/{schoolId}/attendance_months/{YYYY-MM}.records[]
 *   tenant_data/{schoolId}.fees[]               -> tenant_data/{schoolId}/fees_years/{YYYY}.transactions[]
 *   tenant_data/{schoolId}.examMarks[termId]    -> tenant_data/{schoolId}/exam_marks/{termId}  (whole sub-object)
 *
 * SAFETY DESIGN — READ THIS BEFORE RUNNING:
 *   - This script is ADDITIVE ONLY. It reads tenant_data/{schoolId} once and
 *     WRITES ONLY to the new sub-collection paths. It never writes to, merges
 *     into, or deletes anything on the tenant_data/{schoolId} document itself.
 *   - That means it is safe to re-run (idempotent — it will just overwrite the
 *     sub-collection docs with freshly recomputed groupings of the same source
 *     data) and safe to Ctrl+C halfway through (the source document is never
 *     touched, so there is nothing to roll back on the source side).
 *   - It does NOT delete store.attendance / store.fees / store.examMarks from
 *     the source document. That is a deliberate, separate, later step — do
 *     not add deletion logic here without explicit sign-off.
 *   - It VERIFIES after writing: re-reads every sub-collection doc it just
 *     wrote and checks the record/transaction counts against the original
 *     array lengths. If any count doesn't match exactly, it prints a loud
 *     FAILURE and exits non-zero — do not proceed with app rollout if that
 *     happens; investigate before touching anything else.
 *
 * REQUIRED SETUP:
 *   1. npm install firebase-admin
 *   2. Firebase Console -> Project Settings -> Service Accounts ->
 *      "Generate new private key" -> save the JSON somewhere local.
 *   3. Set SERVICE_ACCOUNT_KEY_PATH below to that file's path.
 *
 * USAGE:
 *   node migrate-tenant-to-subcollections.js <schoolId>
 *
 *   Always run against svm_bokaro_001 (the demo tenant) first. Do not run
 *   against a live school (kkgs_*, svm_* [non-bokaro], ips_*) without a
 *   fresh manual Firestore export taken immediately beforehand, and without
 *   explicit go-ahead from Bhanu for that specific school.
 * ===================================================================
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// ---- CONFIG ---------------------------------------------------------
const SERVICE_ACCOUNT_KEY_PATH = './service-account-key.json'; // <-- set this
// ----------------------------------------------------------------------

const resolvedKeyPath = fs.existsSync(path.resolve(process.cwd(), SERVICE_ACCOUNT_KEY_PATH))
  ? path.resolve(process.cwd(), SERVICE_ACCOUNT_KEY_PATH)
  : path.resolve(__dirname, '..', 'service-account-key.json');

const schoolId = process.argv[2];
if (!schoolId) {
  console.error('Usage: node migrate-tenant-to-subcollections.js <schoolId>');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(resolvedKeyPath)),
});
const db = admin.firestore();

function ym(dateStr) {
  // Expects an ISO-ish date string (YYYY-MM-DD...); falls back to 'unknown'
  // bucket rather than crashing on a malformed date so one bad record
  // doesn't abort the whole migration.
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 7) return 'unknown';
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function y(dateStr) {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 4) return 'unknown';
  return dateStr.slice(0, 4); // "YYYY"
}

async function main() {
  console.log('=== Migrating school: ' + schoolId + ' ===');
  console.log('This is ADDITIVE ONLY — the source tenant_data/' + schoolId + ' document will not be modified.\n');

  const tenantRef = db.collection('tenant_data').doc(schoolId);
  const snap = await tenantRef.get();
  if (!snap.exists) {
    console.error('FAILURE: tenant_data/' + schoolId + ' does not exist. Aborting.');
    process.exit(1);
  }
  const data = snap.data();

  // ---------- 1. ATTENDANCE -> attendance_months/{YYYY-MM}/classes/{classId} ----------
  let attendance = Array.isArray(data.attendance) ? [...data.attendance] : [];
  console.log('attendance: ' + attendance.length + ' total records in source array.');

  // Fold in cold-storage attendanceArchive if configured on this tenant
  if (data.settings && data.settings.attendanceArchive && data.settings.attendanceArchive.documentId) {
    const archiveDocId = data.settings.attendanceArchive.documentId;
    console.log('Detected settings.attendanceArchive pointer: ' + archiveDocId);
    try {
      const archiveSnap = await db.collection('tenant_data').doc(archiveDocId).get();
      if (archiveSnap.exists) {
        const archData = archiveSnap.data() || {};
        const archAttendance = Array.isArray(archData.attendance) ? archData.attendance : [];
        console.log('  -> Folding ' + archAttendance.length + ' archived attendance records from ' + archiveDocId + ' into migration.');
        attendance = attendance.concat(archAttendance);
      } else {
        console.warn('  -> Archive doc ' + archiveDocId + ' not found in Firestore.');
      }
    } catch (archErr) {
      console.error('  -> Failed to read archive document ' + archiveDocId + ':', archErr);
    }
  }

  // Group by Month -> Class: byMonthClass[YYYY-MM][classId] = [ ... records ... ]
  const byMonthClass = {};
  for (const rec of attendance) {
    const mKey = ym(rec && rec.date);
    const cKey = String((rec && rec.class) || 'unknown');
    if (!byMonthClass[mKey]) byMonthClass[mKey] = {};
    if (!byMonthClass[mKey][cKey]) byMonthClass[mKey][cKey] = [];
    byMonthClass[mKey][cKey].push(rec);
  }
  const monthKeys = Object.keys(byMonthClass);
  console.log('  -> grouping into ' + monthKeys.length + ' month(s): ' + monthKeys.join(', '));
  for (const monthKey of monthKeys) {
    const classKeys = Object.keys(byMonthClass[monthKey]);
    console.log('     Month ' + monthKey + ' -> ' + classKeys.length + ' class document(s): ' + classKeys.join(', '));
    for (const classKey of classKeys) {
      await tenantRef
        .collection('attendance_months')
        .doc(monthKey)
        .collection('classes')
        .doc(classKey)
        .set({
          records: byMonthClass[monthKey][classKey],
        });
    }
  }

  // ---------- 2. FEES -> fees_years/{YYYY}/months/{MM} ----------
  const fees = Array.isArray(data.fees) ? data.fees : [];
  console.log('fees: ' + fees.length + ' total transactions in source array.');
  const byYearMonth = {};
  for (const txn of fees) {
    const yKey = y(txn && txn.date);
    let mKey = 'unknown';
    if (txn && typeof txn.date === 'string' && txn.date.length >= 7) {
      mKey = txn.date.slice(5, 7);
    }
    if (!byYearMonth[yKey]) byYearMonth[yKey] = {};
    if (!byYearMonth[yKey][mKey]) byYearMonth[yKey][mKey] = [];
    byYearMonth[yKey][mKey].push(txn);
  }
  const yearKeys = Object.keys(byYearMonth);
  console.log('  -> grouping into ' + yearKeys.length + ' year(s): ' + yearKeys.join(', '));
  for (const yearKey of yearKeys) {
    const monthKeys = Object.keys(byYearMonth[yearKey]);
    console.log('     Year ' + yearKey + ' -> ' + monthKeys.length + ' month document(s): ' + monthKeys.join(', '));
    for (const monthKey of monthKeys) {
      await tenantRef
        .collection('fees_years')
        .doc(yearKey)
        .collection('months')
        .doc(monthKey)
        .set({
          transactions: byYearMonth[yearKey][monthKey],
        });
    }
  }

  // ---------- 3. EXAM MARKS -> exam_marks/{termId} ----------
  const examMarks = (data.examMarks && typeof data.examMarks === 'object') ? data.examMarks : {};
  const termIds = Object.keys(examMarks);
  console.log('examMarks: ' + termIds.length + ' term(s) in source object: ' + termIds.join(', '));
  for (const termId of termIds) {
    await tenantRef.collection('exam_marks').doc(termId).set(examMarks[termId] || {});
  }

  // ---------- 4. VERIFY ----------
  console.log('\n=== Verifying ===');
  let ok = true;

  let writtenAttendanceCount = 0;
  for (const monthKey of monthKeys) {
    const classesSnap = await tenantRef.collection('attendance_months').doc(monthKey).collection('classes').get();
    classesSnap.forEach(doc => {
      const records = (doc.exists && Array.isArray(doc.data().records)) ? doc.data().records : [];
      writtenAttendanceCount += records.length;
    });
  }
  if (writtenAttendanceCount !== attendance.length) {
    console.error('FAILURE: attendance count mismatch. Source=' + attendance.length + ' Written=' + writtenAttendanceCount);
    ok = false;
  } else {
    console.log('OK: attendance count matches (' + attendance.length + ').');
  }

  let writtenFeesCount = 0;
  for (const yearKey of yearKeys) {
    const monthsSnap = await tenantRef.collection('fees_years').doc(yearKey).collection('months').get();
    monthsSnap.forEach(doc => {
      const txns = (doc.exists && Array.isArray(doc.data().transactions)) ? doc.data().transactions : [];
      writtenFeesCount += txns.length;
    });
  }
  if (writtenFeesCount !== fees.length) {
    console.error('FAILURE: fees count mismatch. Source=' + fees.length + ' Written=' + writtenFeesCount);
    ok = false;
  } else {
    console.log('OK: fees count matches (' + fees.length + ').');
  }

  let writtenTermCount = 0;
  for (const termId of termIds) {
    const doc = await tenantRef.collection('exam_marks').doc(termId).get();
    if (doc.exists) writtenTermCount++;
  }
  if (writtenTermCount !== termIds.length) {
    console.error('FAILURE: exam_marks term count mismatch. Source=' + termIds.length + ' Written=' + writtenTermCount);
    ok = false;
  } else {
    console.log('OK: exam_marks term count matches (' + termIds.length + ').');
  }

  console.log('\n=== ' + (ok ? 'MIGRATION VERIFIED OK' : 'MIGRATION FAILED VERIFICATION — DO NOT PROCEED') + ' for ' + schoolId + ' ===');
  console.log('Reminder: the source tenant_data/' + schoolId + ' document was NOT modified. Old attendance/fees/examMarks fields are still there untouched — that is intentional (see brief, section 3).');

  process.exit(ok ? 0 : 1);
}

main().catch(function(err) {
  console.error('FAILURE: unexpected error, migration aborted. Source document was not touched.');
  console.error(err);
  process.exit(1);
});
