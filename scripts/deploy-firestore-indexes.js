/**
 * scripts/deploy-firestore-indexes.js
 * 
 * Deploys composite indexes defined in firestore.indexes.json directly
 * via Cloud Firestore v1 REST API using service-account-key.json,
 * and waits until all indexes reach the READY state.
 */

const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

async function deployIndexes() {
  console.log('========================================================================');
  console.log('             DEPLOY FIRESTORE COMPOSITE INDEXES                         ');
  console.log('========================================================================\n');

  const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
  if (!fs.existsSync(saPath)) throw new Error('service-account-key.json not found!');

  const auth = new GoogleAuth({
    keyFile: saPath,
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/datastore'
    ]
  });
  const client = await auth.getClient();

  const indexesFile = path.resolve(__dirname, '..', 'firestore.indexes.json');
  const indexConfig = JSON.parse(fs.readFileSync(indexesFile, 'utf8'));
  const indexes = indexConfig.indexes || [];

  console.log(`Found ${indexes.length} composite indexes in firestore.indexes.json.\n`);

  // First, fetch existing indexes to avoid duplicates
  const existingRes = await client.request({
    url: 'https://firestore.googleapis.com/v1/projects/ctrl-shift-solutions/databases/(default)/collectionGroups/students/indexes',
    method: 'GET'
  });
  const existingIndexes = existingRes.data.indexes || [];
  console.log(`Existing indexes on students collectionGroup: ${existingIndexes.length}`);

  const activeOperations = [];

  for (const idx of indexes) {
    const colGroup = idx.collectionGroup;
    const fieldsStr = idx.fields.map(f => `${f.fieldPath} (${f.order})`).join(', ');

    // Check if index already exists
    const alreadyExists = existingIndexes.find(ei => {
      if (ei.queryScope !== idx.queryScope) return false;
      if (!ei.fields || ei.fields.length !== idx.fields.length) return false;
      return idx.fields.every((f, i) => ei.fields[i].fieldPath === f.fieldPath && ei.fields[i].order === f.order);
    });

    if (alreadyExists) {
      console.log(`Index already exists: [${fieldsStr}] (State: ${alreadyExists.state})`);
      if (alreadyExists.state !== 'READY') {
        activeOperations.push({ name: alreadyExists.name, fields: fieldsStr, checkIndex: true });
      }
      continue;
    }

    console.log(`Creating index for ${colGroup}: [${fieldsStr}]...`);
    try {
      const createRes = await client.request({
        url: `https://firestore.googleapis.com/v1/projects/ctrl-shift-solutions/databases/(default)/collectionGroups/${colGroup}/indexes`,
        method: 'POST',
        data: {
          queryScope: idx.queryScope,
          fields: idx.fields
        }
      });

      console.log(`  -> Operation started: ${createRes.data.name}`);
      activeOperations.push({ name: createRes.data.name, fields: fieldsStr, checkIndex: false });
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error && err.response.data.error.status === 'ALREADY_EXISTS') {
        console.log(`  -> Index already being built / exists: [${fieldsStr}]`);
      } else {
        throw err;
      }
    }
  }

  // Poll operations / indexes until READY
  console.log(`\nWaiting for indexes to become READY...`);
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max (5s interval)

  while (attempts < maxAttempts) {
    attempts++;
    const checkRes = await client.request({
      url: 'https://firestore.googleapis.com/v1/projects/ctrl-shift-solutions/databases/(default)/collectionGroups/students/indexes',
      method: 'GET'
    });

    const liveIndexes = checkRes.data.indexes || [];
    let allReady = true;

    for (const idx of indexes) {
      const match = liveIndexes.find(ei => {
        if (ei.queryScope !== idx.queryScope) return false;
        if (!ei.fields || ei.fields.length !== idx.fields.length) return false;
        return idx.fields.every((f, i) => ei.fields[i].fieldPath === f.fieldPath && ei.fields[i].order === f.order);
      });

      const fieldsStr = idx.fields.map(f => `${f.fieldPath} (${f.order})`).join(', ');
      if (!match || match.state !== 'READY') {
        allReady = false;
        console.log(`  [Poll #${attempts}] [${fieldsStr}] State: ${match ? match.state : 'BUILDING'}...`);
      }
    }

    if (allReady && liveIndexes.length >= indexes.length) {
      console.log(`\n✅ ALL ${indexes.length} COMPOSITE INDEXES ARE READY!`);
      liveIndexes.forEach(li => {
        const fStr = li.fields.map(f => `${f.fieldPath} (${f.order})`).join(', ');
        console.log(`  • ${li.name} -> [${fStr}] (State: ${li.state})`);
      });
      return;
    }

    await new Promise(r => setTimeout(r, 5000));
  }

  throw new Error('Timed out waiting for Firestore composite indexes to reach READY state.');
}

if (require.main === module) {
  deployIndexes().catch(err => {
    console.error('❌ Index deployment failed:', err);
    process.exit(1);
  });
}

module.exports = { deployIndexes };
