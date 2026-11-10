/**
 * scripts/deploy-rules-api.js
 * 
 * Deploys firestore.rules to Firebase Rules API using the service account key.
 * 
 * Safety guards:
 * 1. Requires --expect-commit <hash> and verifies git rev-parse HEAD matches.
 * 2. Computes and logs line count and SHA-256 checksum of the file before uploading.
 * 3. Fetches the live release and ruleset back from Firebase Rules API after deployment
 *    and verifies byte-for-byte parity with the local source.
 */

const { GoogleAuth } = require('google-auth-library');
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function parseArgs() {
  let expectedCommit = null;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--expect-commit') {
      expectedCommit = process.argv[i + 1];
      i++;
    } else if (arg.startsWith('--expect-commit=')) {
      expectedCommit = arg.slice('--expect-commit='.length);
    }
  }
  return { expectedCommit };
}

function verifyGitCommit(repoRoot, expectedCommit) {
  if (!expectedCommit || typeof expectedCommit !== 'string' || !expectedCommit.trim()) {
    console.error('❌ Error: Missing required --expect-commit <commit-hash> argument.');
    console.error('Usage: node scripts/deploy-rules-api.js --expect-commit <git-commit-hash>');
    process.exit(1);
  }

  const trimmedExpected = expectedCommit.trim();
  let currentHead = '';
  try {
    currentHead = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch (err) {
    console.error('❌ Failed to determine git HEAD in repo:', err.message);
    process.exit(1);
  }

  let expectedResolved = '';
  try {
    expectedResolved = execSync(`git rev-parse ${trimmedExpected}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
  } catch (err) {
    // If git rev-parse fails on expected, use raw string for prefix matching
    expectedResolved = trimmedExpected;
  }

  const matches = (currentHead.toLowerCase() === expectedResolved.toLowerCase()) ||
                  (currentHead.toLowerCase().startsWith(trimmedExpected.toLowerCase()));

  if (!matches) {
    console.error(`❌ Commit mismatch! Current HEAD (${currentHead}) does not match --expect-commit (${trimmedExpected}).`);
    console.error('Aborting rules deployment.');
    process.exit(1);
  }

  console.log(`✅ Commit guard passed: current HEAD is ${currentHead} (matched --expect-commit ${trimmedExpected})`);
  return currentHead;
}

async function deployRules() {
  const repoRoot = path.resolve(__dirname, '..');
  const { expectedCommit } = parseArgs();

  // Guard 1: Enforce expected git commit
  const commitHash = verifyGitCommit(repoRoot, expectedCommit);

  const keyPath = path.resolve(repoRoot, 'service-account-key.json');
  if (!fs.existsSync(keyPath)) {
    throw new Error('service-account-key.json not found!');
  }

  const rulesPath = path.resolve(repoRoot, 'firestore.rules');
  if (!fs.existsSync(rulesPath)) {
    throw new Error(`Rules file not found at: ${rulesPath}`);
  }

  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  // Guard 2: Compute and log SHA-256, line count, byte length
  const lineCount = rulesContent.split(/\r?\n/).length;
  const rawSha256 = crypto.createHash('sha256').update(rulesContent, 'utf8').digest('hex');
  const byteSize = Buffer.byteLength(rulesContent, 'utf8');

  console.log('\n--- Rules File Inspection ---');
  console.log(`Repository Root: ${repoRoot}`);
  console.log(`Rules File:      ${rulesPath}`);
  console.log(`Git Commit:      ${commitHash}`);
  console.log(`Line Count:      ${lineCount}`);
  console.log(`Byte Size:       ${byteSize} bytes`);
  console.log(`SHA-256:         ${rawSha256}`);
  console.log('-----------------------------\n');

  const auth = new GoogleAuth({
    keyFile: keyPath,
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/firebase'
    ]
  });

  const client = await auth.getClient();

  console.log('1. Creating new ruleset on Firebase Rules API...');
  const createRes = await client.request({
    url: 'https://firebaserules.googleapis.com/v1/projects/ctrl-shift-solutions/rulesets',
    method: 'POST',
    data: {
      source: {
        files: [
          {
            name: 'firestore.rules',
            content: rulesContent
          }
        ]
      }
    }
  });

  const newRulesetName = createRes.data.name;
  console.log('✅ Ruleset created successfully:', newRulesetName);

  console.log('2. Releasing new ruleset to projects/ctrl-shift-solutions/releases/cloud.firestore...');
  const releaseRes = await client.request({
    url: 'https://firebaserules.googleapis.com/v1/projects/ctrl-shift-solutions/releases/cloud.firestore',
    method: 'PATCH',
    data: {
      release: {
        name: 'projects/ctrl-shift-solutions/releases/cloud.firestore',
        rulesetName: newRulesetName
      }
    }
  });

  console.log('✅ Release updated successfully!');
  console.log('NEW_RULESET_NAME:', releaseRes.data.rulesetName);
  console.log('UPDATE_TIME:', releaseRes.data.updateTime);

  // Guard 3: Fetch live release and source back from Rules API and verify byte-for-byte parity
  console.log('\n3. Fetching live release from Rules API for verification...');
  const liveReleaseRes = await client.request({
    url: 'https://firebaserules.googleapis.com/v1/projects/ctrl-shift-solutions/releases/cloud.firestore',
    method: 'GET'
  });

  const activeRulesetName = liveReleaseRes.data.rulesetName;
  if (activeRulesetName !== newRulesetName) {
    throw new Error(`CRITICAL: Live release ruleset (${activeRulesetName}) does not match newly created ruleset (${newRulesetName})!`);
  }

  console.log('4. Fetching live ruleset content from Rules API...');
  const liveRulesetRes = await client.request({
    url: `https://firebaserules.googleapis.com/v1/${activeRulesetName}`,
    method: 'GET'
  });

  const liveFiles = (liveRulesetRes.data.source && liveRulesetRes.data.source.files) || [];
  const liveRulesFile = liveFiles.find(f => f.name === 'firestore.rules');
  if (!liveRulesFile) {
    throw new Error(`CRITICAL: 'firestore.rules' not found in live ruleset ${activeRulesetName}!`);
  }

  const liveContent = liveRulesFile.content;
  const liveSha256 = crypto.createHash('sha256').update(liveContent, 'utf8').digest('hex');
  const liveLineCount = liveContent.split(/\r?\n/).length;
  const liveByteSize = Buffer.byteLength(liveContent, 'utf8');

  console.log('\n--- Live Rules Verification ---');
  console.log(`Live Ruleset:    ${activeRulesetName}`);
  console.log(`Live Line Count: ${liveLineCount}`);
  console.log(`Live Byte Size:  ${liveByteSize} bytes`);
  console.log(`Live SHA-256:    ${liveSha256}`);

  const matchesByteForByte = (liveContent === rulesContent);
  if (!matchesByteForByte) {
    console.error('❌ CRITICAL ERROR: Live ruleset source does not byte-for-byte match the uploaded firestore.rules!');
    console.error(`Expected SHA-256: ${rawSha256}`);
    console.error(`Live SHA-256:     ${liveSha256}`);
    console.error(`Expected Size:    ${byteSize} bytes`);
    console.error(`Live Size:        ${liveByteSize} bytes`);
    throw new Error('Live source verification failed: uploaded rules and live Rules API source differ byte-for-byte.');
  }

  console.log('✅ Byte-for-byte verification PASSED: Live ruleset strictly matches local file.\n');

  return {
    rulesetName: releaseRes.data.rulesetName,
    updateTime: releaseRes.data.updateTime,
    commit: commitHash,
    lineCount,
    sha256: rawSha256,
    byteSize
  };
}

deployRules()
  .then(res => {
    console.log('FIRESTORE RULES DEPLOY COMPLETE:', JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('FATAL ERROR DEPLOYING RULES:', err.response ? err.response.data : err.message || err);
    process.exit(1);
  });
