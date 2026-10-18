/**
 * scripts/deploy-rules-api.js
 * 
 * Deploys firestore.rules to Firebase Rules API using the service account key.
 */

const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

async function deployRules() {
  const keyPath = path.resolve(__dirname, '..', 'service-account-key.json');
  if (!fs.existsSync(keyPath)) {
    throw new Error('service-account-key.json not found!');
  }

  const auth = new GoogleAuth({
    keyFile: keyPath,
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/firebase'
    ]
  });

  const client = await auth.getClient();
  const rulesContent = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');

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

  return {
    rulesetName: releaseRes.data.rulesetName,
    updateTime: releaseRes.data.updateTime
  };
}

deployRules()
  .then(res => {
    console.log('\nFIRESTORE RULES DEPLOY COMPLETE:', JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('FATAL ERROR DEPLOYING RULES:', err.response ? err.response.data : err);
    process.exit(1);
  });
