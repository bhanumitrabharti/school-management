const admin = require('firebase-admin');
const path = require('path');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
const db = admin.firestore();

async function inspectSvm() {
  const snap = await db.collection('tenant_data').doc('svm_mqbv7qm2').get();
  const d = snap.data();
  console.log('Settings:');
  console.log('  schoolName:', d.settings?.schoolName);
  console.log('  adminUsername:', d.settings?.adminUsername);
  console.log('  adminPassword starts with $2:', (d.settings?.adminPassword || '').startsWith('$2'));
  console.log('  credentialsIsolated:', d.settings?.credentialsIsolated);
  console.log('Teachers count:', (d.teachers || []).length);
  (d.teachers || []).forEach((t, i) => {
    console.log(`  T${i}: id=${t.id}, name=${t.name || t.firstName}, email=${t.email}, isBcrypt=${(t.password || '').startsWith('$2')}`);
  });
  console.log('Trash count:', (d.trash || []).length);
  (d.trash || []).forEach((tr, i) => {
    const s = JSON.stringify(tr);
    const hashes = (s.match(/\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g) || []).length;
    console.log(`  Trash ${i}: type=${tr.type}, id=${tr.id}, name=${tr.name}, hashesInTrash=${hashes}`);
    if (hashes > 0) {
      console.log('    Full trash item with hash:', JSON.stringify(tr, null, 2));
    }
  });
}
inspectSvm().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
