'use strict';

/**
 * scripts/reserve-subdomains.js
 * Reserves system subdomains ('parent', 'parents') in `subdomain_reservations`.
 *
 * Usage:
 *   node scripts/reserve-subdomains.js            (default: --dry-run)
 *   node scripts/reserve-subdomains.js --dry-run
 *   node scripts/reserve-subdomains.js --apply
 *
 * NOTE: Production constraints strictly require --dry-run unless explicitly directed by Bhanu.
 */

const { getDb } = require('../api/_lib/firebase-admin');

const TARGET_SUBDOMAINS = ['parent', 'parents'];
const PERMANENT_EXPIRY = '2099-12-31T23:59:59.999Z';

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = args.includes('--dry-run') || !isApply;

  console.log('='.repeat(70));
  console.log(`SUBDOMAIN SYSTEM RESERVATION SCRIPT`);
  console.log(`Mode: ${isApply ? 'APPLY (LIVE WRITES)' : 'DRY-RUN (READ-ONLY)'}`);
  console.log(`Target subdomains: ${TARGET_SUBDOMAINS.join(', ')}`);
  console.log('='.repeat(70));

  const db = getDb();
  const nowIso = new Date().toISOString();

  for (const sub of TARGET_SUBDOMAINS) {
    console.log(`\nChecking subdomain: "${sub}"`);
    const docRef = db.collection('subdomain_reservations').doc(sub);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const data = docSnap.data();
      console.log(`  Existing reservation found: status=${data.status}, expiresAt=${data.expiresAt}`);
      if (data.status === 'system_reserved') {
        console.log(`  [OK] Already system-reserved.`);
        continue;
      }
    } else {
      console.log(`  No existing reservation found.`);
    }

    const payload = {
      subdomain: sub,
      regId: 'system_reserved',
      status: 'system_reserved',
      reservedAt: nowIso,
      expiresAt: PERMANENT_EXPIRY,
      reason: 'System reserved subdomain for parent portal'
    };

    if (isDryRun) {
      console.log(`  [DRY-RUN] Would write to subdomain_reservations/${sub}:`);
      console.log(`  `, JSON.stringify(payload, null, 2).replace(/\n/g, '\n  '));
    } else {
      await docRef.set(payload, { merge: true });
      console.log(`  [APPLY] Successfully saved system reservation for "${sub}".`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Completed in ${isApply ? 'APPLY' : 'DRY-RUN'} mode. Zero production changes made if dry-run.`);
  console.log('='.repeat(70));
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { main };
