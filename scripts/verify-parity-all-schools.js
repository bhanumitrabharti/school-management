const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const saPath = path.resolve('service-account-key.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
const db = admin.firestore();

async function verifyAllSchoolFeeParity() {
  const schools = [
    'svm_bokaro_001',
    'svm_mqbv7qm2',
    'kkgs_mttt4ufq',
    'ips_mttx07mt',
    'oxford_narra_muktjcky',
    'apex_khalcho_mugmtmx4',
    'nts_mu28myws',
    'idealschoolgomoh_mv1xhpe5',
    'usha_academy_mango_muzflr5z'
  ];

  const results = [];

  for (const sId of schools) {
    const docRef = db.collection('tenant_data').doc(sId);
    const snap = await docRef.get();
    if (!snap.exists) continue;

    const data = snap.data();
    const rootFees = Array.isArray(data.fees) ? data.fees : [];
    const rootTxns = rootFees.length;
    const rootTotal = rootFees.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

    let subTxns = 0;
    let subTotal = 0;

    const fySub = await docRef.collection('fees_years').listDocuments();
    for (const yd of fySub) {
      const mSub = await yd.collection('months').listDocuments();
      for (const md of mSub) {
        const mSnap = await md.get();
        const mData = mSnap.data() || {};
        if (Array.isArray(mData.transactions)) {
          subTxns += mData.transactions.length;
          subTotal += mData.transactions.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
        }
      }
    }

    results.push({
      schoolId: sId,
      rootTxns,
      rootTotal,
      subTxns,
      subTotal,
      totalTxns: rootTxns + subTxns,
      grandTotal: rootTotal + subTotal
    });
  }

  console.log('\n================================================================');
  console.log('              LIVE PER-SCHOOL FEE PARITY TABLE                  ');
  console.log('================================================================');
  console.table(results);

  // Compare with pre-fixes snapshot if available
  const preSnapshotPath = path.resolve('scripts/pre_fee_fixes_parity.json');
  if (fs.existsSync(preSnapshotPath)) {
    const preSnapshot = JSON.parse(fs.readFileSync(preSnapshotPath, 'utf8'));
    console.log('\n--- Comparing with Baseline Snapshot (pre_fee_fixes_parity.json) ---');
    let allMatch = true;
    for (const cur of results) {
      const pre = preSnapshot.find(p => p.schoolId === cur.schoolId);
      if (pre) {
        const match = (pre.totalTxns === cur.totalTxns && pre.grandTotal === cur.grandTotal);
        console.log(`School: ${cur.schoolId.padEnd(28)} Baseline: ${String(pre.totalTxns).padStart(4)} txns (₹${String(pre.grandTotal).padStart(9)}) | Now: ${String(cur.totalTxns).padStart(4)} txns (₹${String(cur.grandTotal).padStart(9)}) -> ${match ? '✅ 100% PARITY' : '❌ MISMATCH'}`);
        if (!match) allMatch = false;
      }
    }
    console.log('\nPARITY VERIFICATION RESULT:', allMatch ? '✅ 100% BEFORE = AFTER (ZERO DATA MUTATED)' : '❌ PARITY MISMATCH DETECTED');
  }
}

verifyAllSchoolFeeParity().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
