'use strict';

const admin = require('firebase-admin');
const path = require('path');

delete process.env.FIRESTORE_EMULATOR_HOST;

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(saPath))
  });
}
const db = admin.firestore();

async function survey() {
  const tenants = await db.collection('tenant_data').get();
  console.log(`Found ${tenants.size} tenant_data records.\n`);

  const noticesSummary = [];
  const notificationsSummary = [];

  for (const tenantDoc of tenants.docs) {
    const schoolId = tenantDoc.id;
    const rootData = tenantDoc.data();

    // 1. Survey notices subcollection
    const noticesSubSnap = await db.collection('tenant_data').doc(schoolId).collection('notices').get();
    let subNoticesTotal = noticesSubSnap.size;
    let subNoticesMissingDate = 0;
    let subNoticesMissingTimestamp = 0;
    let subNoticesSampleFields = null;

    noticesSubSnap.forEach(d => {
      const data = d.data();
      if (!subNoticesSampleFields) subNoticesSampleFields = Object.keys(data);
      if (data.date === undefined || data.date === null) subNoticesMissingDate++;
      if (data.timestamp === undefined || data.timestamp === null) subNoticesMissingTimestamp++;
    });

    // Also check root notices array
    let rootNoticesTotal = (rootData && Array.isArray(rootData.notices)) ? rootData.notices.length : 0;
    let rootNoticesMissingDate = 0;
    if (rootNoticesTotal > 0) {
      rootData.notices.forEach(n => {
        if (!n || n.date === undefined || n.date === null) rootNoticesMissingDate++;
      });
    }

    if (subNoticesTotal > 0 || rootNoticesTotal > 0) {
      noticesSummary.push({
        schoolId,
        subNoticesTotal,
        subNoticesMissingDate,
        subNoticesMissingTimestamp,
        subNoticesSampleFields,
        rootNoticesTotal,
        rootNoticesMissingDate
      });
    }

    // 2. Survey notifications subcollection
    const notifsSubSnap = await db.collection('tenant_data').doc(schoolId).collection('notifications').get();
    let notifsTotal = notifsSubSnap.size;
    let notifsMissingDate = 0;
    let notifsMissingTimestamp = 0;
    let notifsSampleFields = null;

    notifsSubSnap.forEach(d => {
      const data = d.data();
      if (!notifsSampleFields) notifsSampleFields = Object.keys(data);
      if (data.date === undefined || data.date === null) notifsMissingDate++;
      if (data.timestamp === undefined || data.timestamp === null) notifsMissingTimestamp++;
    });

    let rootNotifsTotal = (rootData && Array.isArray(rootData.notifications)) ? rootData.notifications.length : 0;

    if (notifsTotal > 0 || rootNotifsTotal > 0) {
      notificationsSummary.push({
        schoolId,
        notifsTotal,
        notifsMissingDate,
        notifsMissingTimestamp,
        notifsSampleFields,
        rootNotifsTotal
      });
    }
  }

  console.log('=== NOTICES SURVEY ===');
  console.table(noticesSummary);

  console.log('\n=== NOTIFICATIONS SURVEY ===');
  console.table(notificationsSummary);
}

survey().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
