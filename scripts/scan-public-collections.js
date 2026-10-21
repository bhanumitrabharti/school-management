const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
const db = admin.firestore();

function scanForPasswordsAndHashes(obj, currentPath = '', found = []) {
  if (!obj) return found;
  if (typeof obj === 'string') {
    if (obj.startsWith('$2a$') || obj.startsWith('$2b$') || obj.startsWith('$2y$')) {
      found.push({ path: currentPath, type: 'bcrypt_hash', valPrefix: obj.substring(0, 10) + '...' });
    }
    return found;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      scanForPasswordsAndHashes(item, currentPath + '[' + idx + ']', found);
    });
  } else if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const p = currentPath ? currentPath + '.' + key : key;
      if (key.toLowerCase().includes('password')) {
        found.push({ path: p, type: 'password_field', isString: typeof obj[key] === 'string' });
      }
      scanForPasswordsAndHashes(obj[key], p, found);
    }
  }
  return found;
}

async function runStep1Check() {
  console.log('================================================================');
  console.log('       STEP 1 — PUBLIC COLLECTIONS EXPOSURE AUDIT               ');
  console.log('================================================================\n');

  // 1. List all collections in Firestore root
  const rootCollections = await db.listCollections();
  console.log('Root Firestore collections:', rootCollections.map(c => c.id));

  // 2. Scan `schools` collection (which is publicly readable: allow read: if true)
  console.log('\n--- Scanning /schools collection (Publicly Readable) ---');
  const schoolsSnap = await db.collection('schools').get();
  console.log(`Total documents in /schools: ${schoolsSnap.size}`);

  const exposedInSchools = [];

  for (const doc of schoolsSnap.docs) {
    const data = doc.data();
    const findings = scanForPasswordsAndHashes(data);
    if (findings.length > 0) {
      exposedInSchools.push({
        docId: doc.id,
        schoolName: data.school_name || data.name || '',
        findingsCount: findings.length,
        fieldPaths: findings.map(f => f.path)
      });
      console.log(`[EXPOSED] doc id: "${doc.id}" (${data.school_name || ''}) -> ${findings.length} findings:`);
      findings.forEach(f => console.log(`   - ${f.path} (${f.type})`));
    } else {
      console.log(`[SAFE] doc id: "${doc.id}" (${data.school_name || ''}) -> clean`);
    }
  }

  // 3. Scan demo_requests
  console.log('\n--- Scanning /demo_requests collection ---');
  const demoSnap = await db.collection('demo_requests').get();
  console.log(`Total documents in /demo_requests: ${demoSnap.size}`);
  let demoExposed = 0;
  for (const doc of demoSnap.docs) {
    const findings = scanForPasswordsAndHashes(doc.data());
    if (findings.length > 0) {
      demoExposed += findings.length;
      console.log(`[EXPOSED] demo_requests/${doc.id}:`, findings);
    }
  }
  if (demoExposed === 0) console.log('✅ /demo_requests is clean (0 hashes or password fields).');

  // 4. Specifically investigate: Dugda, Cambridge, Rajdeo Prasad, Nanhe Taare
  console.log('\n================================================================');
  console.log('  STATUS OF: Dugda, Cambridge, Rajdeo Prasad, Nanhe Taare        ');
  console.log('================================================================');
  const queryNames = [
    { key: 'dugda', query: 'dugda' },
    { key: 'cambridge', query: 'cambridge' },
    { key: 'rajdeo', query: 'rajdeo' },
    { key: 'nanhetaare', query: 'nanhe' }
  ];

  for (const q of queryNames) {
    console.log(`\nChecking: "${q.key}" (query: "${q.query}")...`);
    // Search in schools
    const matchedSchools = schoolsSnap.docs.filter(d => {
      const s = JSON.stringify(d.data()).toLowerCase();
      return s.includes(q.query) || d.id.toLowerCase().includes(q.query);
    });
    console.log(`- Matched in /schools: ${matchedSchools.length} docs:`);
    for (const m of matchedSchools) {
      const md = m.data();
      console.log(`  * docId: "${m.id}", status: "${md.status}", school_name: "${md.school_name}", last_login: "${md.last_login}"`);
    }

    // Search in tenant_data
    const tenantDocs = await db.collection('tenant_data').listDocuments();
    const matchedTenants = [];
    for (const td of tenantDocs) {
      if (td.id.toLowerCase().includes(q.query)) {
        const snap = await td.get();
        const tData = snap.data();
        matchedTenants.push({
          id: td.id,
          name: tData.settings?.schoolName,
          studentsCount: (tData.students || []).length,
          teachersCount: (tData.teachers || []).length
        });
      }
    }
    console.log(`- Matched in /tenant_data: ${matchedTenants.length} docs:`);
    matchedTenants.forEach(t => console.log(`  * id: "${t.id}", name: "${t.name}", students: ${t.studentsCount}, teachers: ${t.teachersCount}`));
  }

  console.log('\n--- Summary Table for STEP 1 Exposure ---');
  console.table(exposedInSchools);

  return { exposedInSchools };
}

runStep1Check().then(() => process.exit(0)).catch(err => {
  console.error('Audit error:', err);
  process.exit(1);
});
