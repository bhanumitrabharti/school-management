'use strict';

/**
 * scripts/cleanup-greenwood-v84.js
 *
 * Targeted Greenwood Demo Cleanup (svm_bokaro_001 ONLY)
 *
 * Rules:
 * - NO password/credential changes.
 * - NO deletion of any record (targeted field updates / void reversals only).
 * - Verifies backup existence and SHA-256 before making any write.
 * - Touches ONLY svm_bokaro_001.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');

delete process.env.FIRESTORE_EMULATOR_HOST;

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(saPath))
  });
}
const db = admin.firestore();

const SCHOOL_ID = 'svm_bokaro_001';
const EXPECTED_BACKUP_SHA256 = 'ba0657d5ac39769c9137712f6baf16fd1f7ecc56a772b04076d2ff4630f16033';
const BACKUP_PATH = path.resolve(__dirname, '..', 'scratch', 'backup_greenwood_2026-11-10T14-42-01-443Z.json');

const TARGET_DUPLICATE_TXN_IDS = [
  'id_mwab23gh_cj3lrz', // 2nd ₹1,000 for stu_gw_1_07
  'id_mwab250l_3lp857', // 3rd ₹1,000 for stu_gw_1_07
  'id_mwac9mtf_5vmvk2'  // 2nd ₹2,000 for stu_gw_1_08
];

async function verifyBackup() {
  if (!fs.existsSync(BACKUP_PATH)) {
    throw new Error(`Backup file not found at ${BACKUP_PATH}`);
  }
  const content = fs.readFileSync(BACKUP_PATH, 'utf8');
  const actualHash = crypto.createHash('sha256').update(content).digest('hex');
  if (actualHash !== EXPECTED_BACKUP_SHA256) {
    throw new Error(`Backup SHA-256 mismatch! Expected ${EXPECTED_BACKUP_SHA256}, got ${actualHash}`);
  }
  console.log(`[Backup Verified] SHA-256 matches: ${actualHash}`);
}

async function runCleanup() {
  console.log('======================================================================');
  console.log('GREENWOOD DEMO CLEANUP (svm_bokaro_001 ONLY)');
  console.log('======================================================================\n');

  await verifyBackup();

  const rootRef = db.collection('tenant_data').doc(SCHOOL_ID);
  const rootSnap = await rootRef.get();
  if (!rootSnap.exists) throw new Error('Tenant root document not found');
  const rootData = rootSnap.data();

  // -------------------------------------------------------------------------
  // 3.a Teacher "Test Teacher" -> Inactive
  // -------------------------------------------------------------------------
  console.log('\n--- 3.a Teacher Status Update ---');
  const teachers = Array.isArray(rootData.teachers) ? JSON.parse(JSON.stringify(rootData.teachers)) : [];
  const teacherIdx = teachers.findIndex(t => t.id === 'id_mvdtirsu_ctor5t' || (t.email && t.email.toLowerCase() === 'testteacher@gmail.com'));
  if (teacherIdx === -1) {
    throw new Error('Test Teacher (testteacher@gmail.com) not found in root.teachers!');
  }
  const beforeTeacherStatus = teachers[teacherIdx].status;
  teachers[teacherIdx].status = 'Inactive';
  console.log(`Teacher ${teachers[teacherIdx].id} (${teachers[teacherIdx].firstName} ${teachers[teacherIdx].lastName}): status changed from '${beforeTeacherStatus}' to 'Inactive'.`);

  // -------------------------------------------------------------------------
  // 3.b Notices Cleanup
  // -------------------------------------------------------------------------
  console.log('\n--- 3.b Notices Cleanup ---');
  // Root doc notice_mumo0tqq
  const rootNotices = Array.isArray(rootData.notices) ? JSON.parse(JSON.stringify(rootData.notices)) : [];
  const noticeMumoIdx = rootNotices.findIndex(n => n.id === 'notice_mumo0tqq');
  if (noticeMumoIdx === -1) {
    throw new Error('Notice notice_mumo0tqq not found in root.notices!');
  }
  const beforeNoticeMsg = rootNotices[noticeMumoIdx].message;
  rootNotices[noticeMumoIdx].message = beforeNoticeMsg.replace(/\[School Name\]/g, 'Greenwood Public School');
  console.log(`Notice notice_mumo0tqq: replaced '[School Name]' with 'Greenwood Public School'.`);

  // Subcollection notice_mw1fjq5t
  const subNoticeRef = rootRef.collection('notices').doc('notice_mw1fjq5t');
  const subNoticeSnap = await subNoticeRef.get();
  let beforeSubNoticeStatus = null;
  if (!subNoticeSnap.exists) {
    throw new Error('Subcollection notice notice_mw1fjq5t not found!');
  }
  beforeSubNoticeStatus = subNoticeSnap.data().status;
  console.log(`Subcollection notice notice_mw1fjq5t: status changing from '${beforeSubNoticeStatus}' to 'archived'.`);

  // -------------------------------------------------------------------------
  // 3.c Void duplicate payments in fees_years/2026/months/11
  // -------------------------------------------------------------------------
  console.log('\n--- 3.c Void Duplicate Payments ---');
  const month11Ref = rootRef.collection('fees_years').doc('2026').collection('months').doc('11');
  const month11Snap = await month11Ref.get();
  if (!month11Snap.exists) {
    throw new Error('Month document fees_years/2026/months/11 not found!');
  }
  const month11Data = month11Snap.data();
  const txns = Array.isArray(month11Data.transactions) ? JSON.parse(JSON.stringify(month11Data.transactions)) : [];

  const voidSummary = [];
  const reversalTxns = [];
  const nowIso = new Date().toISOString();
  const nowDate = nowIso.split('T')[0];

  for (const dupId of TARGET_DUPLICATE_TXN_IDS) {
    const txn = txns.find(t => t.id === dupId);
    if (!txn) {
      throw new Error(`Duplicate transaction ${dupId} not found in month 11!`);
    }
    if (txn.isVoided) {
      console.log(`Transaction ${dupId} is already marked voided.`);
      continue;
    }

    const revId = 'rev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const beforeTxnCopy = { ...txn };

    txn.isVoided = true;
    txn.voidedAt = nowIso;
    txn.voidedBy = 'Admin';
    txn.voidReason = 'Duplicate click — demo cleanup';
    txn.reversalTxnId = revId;

    const revAmt = -parseFloat(txn.amount || 0);
    const revDisc = txn.discount ? -parseFloat(txn.discount || 0) : 0;
    const origGross = parseFloat(txn.grossAmount || (parseFloat(txn.amount || 0) + parseFloat(txn.discount || 0)));
    const revGross = -origGross;

    const reversalTxn = {
      id: revId,
      studentId: txn.studentId,
      schoolId: SCHOOL_ID,
      type: txn.type || 'payment',
      subType: 'reversal',
      isReversal: true,
      originalTxnId: txn.id,
      feeHeadId: txn.feeHeadId || null,
      date: nowDate,
      timestamp: nowIso,
      amount: revAmt,
      discount: revDisc,
      discountType: txn.discountType || null,
      discountValue: txn.discountValue ? -parseFloat(txn.discountValue) : 0,
      grossAmount: revGross,
      mode: txn.mode || 'Cash',
      description: 'Reversal: ' + (txn.description || 'Payment') + ' (Voided)',
      remarks: 'Reason: Duplicate click — demo cleanup',
      voidedBy: 'Admin'
    };

    if (Array.isArray(txn.allocations) && txn.allocations.length > 0) {
      reversalTxn.allocations = txn.allocations.map(a => ({
        feeHeadId: a.feeHeadId,
        feeHeadName: a.feeHeadName,
        amount: -parseFloat(a.amount || 0)
      }));
    }

    reversalTxns.push(reversalTxn);
    voidSummary.push({
      originalId: txn.id,
      studentId: txn.studentId,
      amount: txn.amount,
      receiptNo: txn.receiptNo,
      reversalId: revId
    });
  }

  // Append reversals to txns array
  const updatedTxns = txns.concat(reversalTxns);

  // -------------------------------------------------------------------------
  // Execute Targeted Writes
  // -------------------------------------------------------------------------
  console.log('\n--- Executing Targeted Firestore Writes ---');

  // 1. Root doc update: teachers and notices only
  await rootRef.update({
    teachers: teachers,
    notices: rootNotices
  });
  console.log('✅ Updated root doc (teachers and notices fields).');

  // 2. Subcollection notice_mw1fjq5t
  await subNoticeRef.update({
    status: 'archived'
  });
  console.log('✅ Updated notice_mw1fjq5t doc (status: archived).');

  // 3. Month 11 doc update: transactions only
  await month11Ref.update({
    transactions: updatedTxns
  });
  console.log(`✅ Updated fees_years/2026/months/11 doc (${reversalTxns.length} transactions voided & reversed).`);

  // -------------------------------------------------------------------------
  // Accounts Sync Dry Run
  // -------------------------------------------------------------------------
  console.log('\n--- Running Accounts Sync Dry Run ---');
  const { computeFeeJournalLines } = require('../api/accounts.js');
  const settingsDoc = await rootRef.collection('accounts_settings').doc('main').get();
  const settings = settingsDoc.exists ? settingsDoc.data() : {};
  const chartSnaps = await rootRef.collection('accounts_chart').get();
  const chartMap = {};
  chartSnaps.forEach(d => { chartMap[d.id] = d.data(); });

  const journalsSnap = await rootRef.collection('accounts_journal').get();
  const existingVoucherIds = new Set();
  const existingSourceIds = new Set();
  journalsSnap.forEach(d => {
    existingVoucherIds.add(d.id);
    const data = d.data();
    if (data.sourceId) existingSourceIds.add(data.sourceId);
  });

  const wouldPost = [];
  const monthTargets = ['04', '05', '06', '07', '08', '09', '10', '11', '12', '01', '02', '03'];
  const startYr = '2026';
  const endYr = '2027';

  for (const mo of monthTargets) {
    const yr = (parseInt(mo, 10) >= 4) ? startYr : endYr;
    const mDoc = await rootRef.collection('fees_years').doc(yr).collection('months').doc(mo).get();
    if (!mDoc.exists) continue;
    const curTxns = mDoc.data().transactions || [];
    for (const t of curTxns) {
      const res = computeFeeJournalLines(t, settings, chartMap);
      if (!res || res.ignored || res.error) continue;
      if (res.voucherId) {
        const vId = res.voucherId;
        const sId = res.sourceId;
        const exists = existingVoucherIds.has(vId) ||
                       existingVoucherIds.has('vch_fee_' + sId) ||
                       existingVoucherIds.has('JV-FEE-' + sId) ||
                       existingSourceIds.has(sId);
        if (!exists) {
          wouldPost.push({
            txnId: t.id,
            voucherId: vId,
            studentId: t.studentId,
            amount: t.amount,
            isReversal: t.isReversal,
            lines: res.lines,
            narration: res.narration
          });
        }
      }
    }
  }

  console.log(`\nAccounts Sync Dry Run Result: ${wouldPost.length} voucher(s) would post.`);
  wouldPost.forEach((w, i) => {
    console.log(`  #${i + 1}: ${w.voucherId} | Txn: ${w.txnId} | Amt: ₹${w.amount} | Reversal: ${w.isReversal} | ${w.narration}`);
    console.log(`       Lines: ${JSON.stringify(w.lines)}`);
  });

  if (wouldPost.length === 3 && wouldPost.every(w => w.isReversal && w.txnId.startsWith('rev_'))) {
    console.log('\n✅ VERIFICATION PASSED: Exactly the 3 reversal vouchers would post exactly once!');
  } else {
    console.warn('\n⚠️ WARNING: Dry run would-post count or vouchers differ from expectation!');
  }

  console.log('\n======================================================================');
  console.log('CLEANUP SUMMARY');
  console.log('======================================================================');
  console.log(`Backup File: ${BACKUP_PATH}`);
  console.log(`Backup SHA-256: ${EXPECTED_BACKUP_SHA256}`);
  console.log(`3.a Teacher: id_mvdtirsu_ctor5t status '${beforeTeacherStatus}' -> 'Inactive'`);
  console.log(`3.b Notice 1: notice_mumo0tqq '[School Name]' replaced with 'Greenwood Public School'`);
  console.log(`3.b Notice 2: notice_mw1fjq5t status '${beforeSubNoticeStatus}' -> 'archived'`);
  console.log('3.c Voided Duplicate Payments:');
  voidSummary.forEach(v => {
    console.log(`  - Original: ${v.originalId} (₹${v.amount}, Student: ${v.studentId}, Receipt: ${v.receiptNo}) -> Reversal Txn: ${v.reversalId} -> Voucher: vch_fee_${v.reversalId}`);
  });
}

runCleanup().then(() => process.exit(0)).catch(err => {
  console.error('\n❌ Cleanup failed:', err);
  process.exit(1);
});
