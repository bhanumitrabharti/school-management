'use strict';

const admin = require('firebase-admin');
const crypto = require('crypto');
const path = require('path');

delete process.env.FIRESTORE_EMULATOR_HOST;

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(saPath))
  });
}
const db = admin.firestore();

function getByteSize(val) {
  if (val === undefined) return 0;
  return Buffer.byteLength(JSON.stringify(val), 'utf8');
}

function hashData(val) {
  return crypto.createHash('sha256').update(JSON.stringify(val || '')).digest('hex').slice(0, 12);
}

async function run() {
  const snaps = await db.collection('tenant_data').get();
  console.log('Total tenant_data docs: ' + snaps.size);

  const report = [];

  for (const doc of snaps.docs) {
    const schoolId = doc.id;
    const data = doc.data();
    const settings = data.settings || {};
    const storageVer = settings.storageVersion || 1;
    const restructured = !!(settings.restructured || data.restructured);
    const studentsMigrated = !!settings.studentsMigrated;

    const fullSize = getByteSize(data);

    // Calculate size of each field
    const fieldSizes = [];
    for (const key of Object.keys(data)) {
      const sz = getByteSize(data[key]);
      fieldSizes.push({ key, size: sz, count: Array.isArray(data[key]) ? data[key].length : (typeof data[key] === 'object' && data[key] !== null ? Object.keys(data[key]).length : 1) });
    }
    fieldSizes.sort((a, b) => b.size - a.size);
    const top10 = fieldSizes.slice(0, 10);

    // Check subcollection parity for storageVersion 2 / restructured / migrated fields
    const migratedFieldAnalysis = [];
    let reclaimableBytes = 0;

    // 1. Students
    if (studentsMigrated) {
      const subSnap = await doc.ref.collection('students').get();
      const rootList = Array.isArray(data.students) ? data.students : [];
      const rootSize = getByteSize(data.students);
      const subCount = subSnap.size;
      const rootCount = rootList.length;
      
      // Sample hash parity
      let sampleMatch = false;
      if (rootCount > 0 && subCount > 0) {
        const rootSample = rootList[0];
        const subDoc = await doc.ref.collection('students').doc(rootSample.id).get();
        if (subDoc.exists) {
          const sData = subDoc.data();
          sampleMatch = (rootSample.id === sData.id && rootSample.name === sData.name);
        }
      }
      migratedFieldAnalysis.push({
        field: 'students',
        rootCount,
        subCount,
        rootSize,
        sampleMatch,
        fullyMigrated: subCount >= rootCount && sampleMatch
      });
      if (subCount >= rootCount) {
        reclaimableBytes += rootSize;
      }
    }

    // 2. Notices
    if (storageVer >= 2) {
      const subSnap = await doc.ref.collection('notices').get();
      const rootList = Array.isArray(data.notices) ? data.notices : [];
      const rootSize = getByteSize(data.notices);
      const subCount = subSnap.size;
      const rootCount = rootList.length;

      let sampleMatch = true;
      if (rootCount > 0 && subCount > 0) {
        const rootSample = rootList[0];
        const subDoc = await doc.ref.collection('notices').doc(rootSample.id).get();
        sampleMatch = subDoc.exists && subDoc.data().title === rootSample.title;
      }
      migratedFieldAnalysis.push({
        field: 'notices',
        rootCount,
        subCount,
        rootSize,
        sampleMatch,
        fullyMigrated: subCount >= rootCount && sampleMatch
      });
      if (subCount >= rootCount && rootSize > 0) {
        reclaimableBytes += rootSize;
      }
    }

    // 3. Notifications
    if (storageVer >= 2) {
      const subSnap = await doc.ref.collection('notifications').get();
      const rootList = Array.isArray(data.notifications) ? data.notifications : [];
      const rootSize = getByteSize(data.notifications);
      const subCount = subSnap.size;
      const rootCount = rootList.length;

      let sampleMatch = true;
      if (rootCount > 0 && subCount > 0) {
        const rootSample = rootList[0];
        const subDoc = await doc.ref.collection('notifications').doc(rootSample.id).get();
        sampleMatch = subDoc.exists;
      }
      migratedFieldAnalysis.push({
        field: 'notifications',
        rootCount,
        subCount,
        rootSize,
        sampleMatch,
        fullyMigrated: subCount >= rootCount && sampleMatch
      });
      if (subCount >= rootCount && rootSize > 0) {
        reclaimableBytes += rootSize;
      }
    }

    // 4. Trash
    if (storageVer >= 2) {
      const subSnap = await doc.ref.collection('trash').get();
      const rootList = Array.isArray(data.trash) ? data.trash : [];
      const rootSize = getByteSize(data.trash);
      const subCount = subSnap.size;
      const rootCount = rootList.length;

      let sampleMatch = true;
      if (rootCount > 0 && subCount > 0) {
        const rootSample = rootList[0];
        const subDoc = await doc.ref.collection('trash').doc(rootSample.id).get();
        sampleMatch = subDoc.exists;
      }
      migratedFieldAnalysis.push({
        field: 'trash',
        rootCount,
        subCount,
        rootSize,
        sampleMatch,
        fullyMigrated: subCount >= rootCount && sampleMatch
      });
      if (subCount >= rootCount && rootSize > 0) {
        reclaimableBytes += rootSize;
      }
    }

    // 5. Fee Activity Logs
    if (storageVer >= 2 || settings.feeLogMigrated) {
      const subSnap = await doc.ref.collection('fee_activity_logs').get();
      const rootList = Array.isArray(data.feeActivityLog) ? data.feeActivityLog : [];
      const rootSize = getByteSize(data.feeActivityLog);
      const subCount = subSnap.size;
      const rootCount = rootList.length;

      let sampleMatch = true;
      if (rootCount > 0 && subCount > 0) {
        const rootSample = rootList[0];
        const subDoc = await doc.ref.collection('fee_activity_logs').doc(rootSample.id).get();
        sampleMatch = subDoc.exists;
      }
      migratedFieldAnalysis.push({
        field: 'feeActivityLog',
        rootCount,
        subCount,
        rootSize,
        sampleMatch,
        fullyMigrated: subCount >= rootCount && sampleMatch
      });
      if (subCount >= rootCount && rootSize > 0) {
        reclaimableBytes += rootSize;
      }
    }

    // 6. Fees
    if (restructured) {
      const rootList = Array.isArray(data.fees) ? data.fees : [];
      const rootSize = getByteSize(data.fees);
      const subYearsSnap = await doc.ref.collection('fees_years').get();
      let subTxnCount = 0;
      for (const yDoc of subYearsSnap.docs) {
        const monthsSnap = await yDoc.ref.collection('months').get();
        monthsSnap.docs.forEach(m => {
          subTxnCount += (m.data().transactions || []).length;
        });
      }
      migratedFieldAnalysis.push({
        field: 'fees',
        rootCount: rootList.length,
        subCount: subTxnCount,
        rootSize,
        sampleMatch: subTxnCount >= rootList.length,
        fullyMigrated: subTxnCount >= rootList.length
      });
      if (subTxnCount >= rootList.length && rootSize > 0) {
        reclaimableBytes += rootSize;
      }
    }

    // 7. Attendance
    if (restructured) {
      const rootList = Array.isArray(data.attendance) ? data.attendance : [];
      const rootSize = getByteSize(data.attendance);
      const subMonthsSnap = await doc.ref.collection('attendance_months').get();
      let subAttCount = 0;
      for (const mDoc of subMonthsSnap.docs) {
        const classesSnap = await mDoc.ref.collection('classes').get();
        classesSnap.docs.forEach(c => {
          subAttCount += (c.data().records || []).length;
        });
      }
      migratedFieldAnalysis.push({
        field: 'attendance',
        rootCount: rootList.length,
        subCount: subAttCount,
        rootSize,
        sampleMatch: subAttCount >= rootList.length,
        fullyMigrated: subAttCount >= rootList.length
      });
      if (subAttCount >= rootList.length && rootSize > 0) {
        reclaimableBytes += rootSize;
      }
    }

    report.push({
      schoolId,
      storageVer,
      restructured,
      studentsMigrated,
      fullSize,
      top10,
      migratedFieldAnalysis,
      reclaimableBytes,
      projectedRootSize: Math.max(0, fullSize - reclaimableBytes)
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
