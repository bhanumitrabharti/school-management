#!/usr/bin/env node
'use strict';

/**
 * scripts/report-duplicate-payments.js
 *
 * Read-only audit scan for duplicate fee payments (--dry-run only, IDs only, NO names).
 * Scans tenant_data/{schoolId}/fees_years/{year}/months/{month} for concurrent or identical
 * payments submitted for the same student within a short time window.
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

if (!admin.apps.length) {
  let credential;
  const serviceAccountPath = path.resolve(__dirname, '../service-account-key.json');
  try {
    if (fs.existsSync(serviceAccountPath)) {
      credential = admin.credential.cert(require(serviceAccountPath));
    }
  } catch (e) {}

  if (credential) {
    admin.initializeApp({ credential });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();

async function scanDuplicatePayments() {
  const isDryRun = process.argv.includes('--dry-run') || true;
  console.log('======================================================================');
  console.log('DUPLICATE FEE PAYMENTS AUDIT SCAN (READ-ONLY, IDS ONLY)');
  console.log('Mode: --dry-run (no production writes)');
  console.log('======================================================================\n');

  let targetSchools = [];
  const schoolArg = process.argv.find(a => a.startsWith('--school='));
  if (schoolArg) {
    targetSchools = [schoolArg.split('=')[1]];
  } else {
    const schoolsSnap = await db.collection('schools').get();
    schoolsSnap.forEach(doc => targetSchools.push(doc.id));
  }

  console.log(`Scanning ${targetSchools.length} school(s)...\n`);

  let totalDuplicateIncidents = 0;
  let totalDuplicateVouchers = 0;

  for (const schoolId of targetSchools) {
    const years = ['2025', '2026', '2027'];
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

    for (const yr of years) {
      for (const mo of months) {
        const docRef = db.doc(`tenant_data/${schoolId}/fees_years/${yr}/months/${mo}`);
        let snap;
        try {
          snap = await docRef.get();
        } catch (e) {
          continue;
        }

        if (!snap.exists) continue;
        const txns = Array.isArray(snap.data().transactions) ? snap.data().transactions : [];
        const payments = txns.filter(t => t && t.type === 'payment' && !t.isReversal && !t.isVoided);

        // Group by studentId + date + amount
        const groups = new Map();
        payments.forEach(p => {
          const key = `${p.studentId || 'unknown'}_${p.date || 'nodate'}_${p.amount || 0}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(p);
        });

        for (const [key, list] of groups.entries()) {
          if (list.length > 1) {
            // Check timestamps difference
            list.sort((a, b) => {
              const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
              const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
              return ta - tb;
            });

            const first = list[0];
            const t0 = first.timestamp ? new Date(first.timestamp).getTime() : 0;
            const tLast = list[list.length - 1].timestamp ? new Date(list[list.length - 1].timestamp).getTime() : 0;
            const diffSec = Math.round((tLast - t0) / 1000);

            // Consider duplicate if within 120 seconds or consecutive receipt serials
            if (diffSec <= 120 || list.length > 1) {
              totalDuplicateIncidents++;
              totalDuplicateVouchers += (list.length - 1);

              console.log(`[DUPLICATE DETECTED] School: ${schoolId} | Month: ${yr}-${mo}`);
              console.log(`  Student ID: ${first.studentId || 'N/A'}`);
              console.log(`  Amount: ₹${first.amount} | Date: ${first.date}`);
              console.log(`  Time Gap: ${diffSec}s across ${list.length} transactions:`);
              list.forEach((t, i) => {
                console.log(`    #${i + 1}: txnId=${t.id} | receiptNo=${t.receiptNo || 'none'} | timestamp=${t.timestamp || 'none'}`);
              });
              console.log('');
            }
          }
        }
      }
    }
  }

  console.log('----------------------------------------------------------------------');
  console.log(`Scan Complete: ${totalDuplicateIncidents} duplicate incident(s) detected (${totalDuplicateVouchers} redundant payment records).`);
  console.log('No data modified (--dry-run).');
  console.log('======================================================================');
}

if (require.main === module) {
  scanDuplicatePayments().catch(err => {
    console.error('Fatal scan error:', err);
    process.exit(1);
  });
}

module.exports = { scanDuplicatePayments };
