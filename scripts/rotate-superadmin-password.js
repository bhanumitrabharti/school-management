/**
 * ===================================================================
 *  SUPER-ADMIN PASSWORD ROTATION SCRIPT
 *  Paathshala School ERP (CTRL SHIFT SOLUTIONS)
 * ===================================================================
 *
 * This script allows Bhanu to securely rotate the Firebase Auth password
 * for the dedicated Super Admin account (superadmin@ctrlshifts.in).
 *
 * SAFETY & PRIVACY:
 *   - Uses local service-account-key.json (never committed to git).
 *   - Prompts for the new password with hidden input (no console echo).
 *   - Requires password confirmation.
 *   - Enforces a minimum length of 16 characters.
 *   - Calls admin.auth().updateUser('cq647u1GfCXISzf7XMw8pxH76I72', { password }).
 *   - NEVER prints, logs, or writes the password to disk.
 *
 * USAGE (Executed manually by Bhanu only):
 *   node scripts/rotate-superadmin-password.js
 * ===================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const admin = require('firebase-admin');

const SUPER_ADMIN_UID = 'cq647u1GfCXISzf7XMw8pxH76I72';
const KEY_PATH = path.join(__dirname, '..', 'service-account-key.json');

if (!fs.existsSync(KEY_PATH)) {
  console.error('\n❌ ERROR: service-account-key.json not found in project root.\n');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

function askHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const stdin = process.openStdin();
    const onData = (char) => {
      char = char + '';
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.removeListener('data', onData);
          break;
        default:
          process.stdout.write('\x1B[2K\x1B[200D' + query + '*'.repeat(rl.line.length));
          break;
      }
    };

    process.stdin.on('data', onData);

    rl.question(query, (value) => {
      rl.close();
      resolve(value);
    });
  });
}

async function main() {
  console.log('\n========================================================');
  console.log('  PAATHSHALA ERP — SUPER ADMIN PASSWORD ROTATION');
  console.log('  Target User: superadmin@ctrlshifts.in');
  console.log('  Target UID:  ' + SUPER_ADMIN_UID);
  console.log('========================================================\n');

  try {
    const user = await admin.auth().getUser(SUPER_ADMIN_UID);
    console.log('✅ Found verified user in Firebase Auth: ' + user.email + '\n');
  } catch (err) {
    console.error('❌ Could not locate super admin user with UID ' + SUPER_ADMIN_UID + ':', err.message);
    process.exit(1);
  }

  const pass1 = await askHidden('Enter new Super-Admin password (min 16 chars): ');
  console.log('');

  if (!pass1 || pass1.length < 16) {
    console.error('❌ Error: Password must be at least 16 characters in length.');
    process.exit(1);
  }

  const pass2 = await askHidden('Confirm new Super-Admin password: ');
  console.log('');

  if (pass1 !== pass2) {
    console.error('❌ Error: Passwords do not match. Rotation aborted.');
    process.exit(1);
  }

  console.log('Updating Firebase Auth password...');
  try {
    await admin.auth().updateUser(SUPER_ADMIN_UID, {
      password: pass1
    });

    console.log('\n✅ SUCCESS: Super Admin password has been updated in Firebase Auth.');
    console.log('   The new password is now active for superadmin@ctrlshifts.in.');
    console.log('   Remember to log into https://ctrlshifts.in/super-admin.html with your new credentials.\n');
  } catch (updateErr) {
    console.error('\n❌ Failed to update password in Firebase Auth:', updateErr.message);
    process.exit(1);
  }
}

main();
