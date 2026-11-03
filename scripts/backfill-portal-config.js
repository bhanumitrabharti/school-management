'use strict';

/**
 * scripts/backfill-portal-config.js
 * 
 * Backfills lightweight parent portal configuration documents:
 *   Path: tenant_data/{schoolId}/portal/config
 * Document shape:
 *   {
 *     enabled: boolean,
 *     modules: {
 *       profile: boolean,
 *       attendance: boolean,
 *       timetable: boolean,
 *       exams: boolean,
 *       reportCards: boolean,
 *       notices: boolean,
 *       fees: boolean,
 *       feePayment: boolean
 *     },
 *     schoolName: string,
 *     logoUrl: string,
 *     updatedAt: string (ISO)
 *   }
 * 
 * Performance purpose:
 *   Parent API reads this tiny (<1 KB) document on every request instead of
 *   fetching the full root doc (~513 KB for large schools like KKGS).
 * 
 * USAGE:
 *   node scripts/backfill-portal-config.js               # Dry-run by default
 *   node scripts/backfill-portal-config.js --dry-run     # Explicit dry-run
 *   node scripts/backfill-portal-config.js --apply       # Live apply
 *   node scripts/backfill-portal-config.js --school <id> # Single school
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: 'ctrl-shift-solutions' });
  } else if (fs.existsSync(saPath)) {
    admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
  } else {
    admin.initializeApp();
  }
}
const db = admin.firestore();

async function runBackfill({ apply = false, targetSchoolId = null } = {}) {
  const mode = apply ? 'LIVE APPLY' : 'DRY-RUN (NO WRITES)';
  console.log('================================================================');
  console.log(` PARENT PORTAL CONFIG BACKFILL — ${mode}`);
  console.log('================================================================\n');

  const tenantSnap = await db.collection('tenant_data').get();
  const schoolIds = targetSchoolId 
    ? [targetSchoolId] 
    : tenantSnap.docs.map(d => d.id);

  console.log(`Found ${schoolIds.length} candidate tenant(s).\n`);

  let processedCount = 0;
  let updatedCount = 0;

  for (const schoolId of schoolIds) {
    const tenantDocRef = db.collection('tenant_data').doc(schoolId);
    const tenantSnapDoc = await tenantDocRef.get();
    if (!tenantSnapDoc.exists) continue;

    const tenantData = tenantSnapDoc.data() || {};
    const settings = tenantData.settings || {};
    const isMigrated = settings.studentsMigrated === true;
    const pp = settings.parentPortal || {};
    const isPPEnabled = isMigrated && pp.enabled === true;

    const schoolName = settings.schoolName || 
                       (settings.schoolInfo && settings.schoolInfo.name) || 
                       tenantData.school_name || 
                       schoolId;
    const logoUrl = settings.logoStorageUrl || 
                    settings.logoUrl || 
                    settings.schoolLogo || 
                    (settings.schoolInfo && settings.schoolInfo.logoStorageUrl) || 
                    (settings.schoolInfo && settings.schoolInfo.logoUrl) || 
                    (settings.schoolInfo && settings.schoolInfo.schoolLogo) || 
                    '';

    const lightConfig = {
      enabled: isPPEnabled,
      studentsMigrated: isMigrated,
      modules: {
        profile: pp.profile !== undefined ? pp.profile : (pp.allowProfile !== undefined ? pp.allowProfile : true),
        attendance: pp.attendance !== undefined ? pp.attendance : (pp.allowAttendance !== undefined ? pp.allowAttendance : true),
        timetable: pp.timetable !== undefined ? pp.timetable : (pp.allowTimetable !== undefined ? pp.allowTimetable : true),
        exams: pp.exams !== undefined ? pp.exams : (pp.allowExams !== undefined ? pp.allowExams : false),
        reportCards: pp.reportCards !== undefined ? pp.reportCards : (pp.allowReportCards !== undefined ? pp.allowReportCards : false),
        notices: pp.notices !== undefined ? pp.notices : (pp.allowNotices !== undefined ? pp.allowNotices : true),
        fees: pp.fees !== undefined ? pp.fees : (pp.allowFees !== undefined ? pp.allowFees : true),
        feePayment: pp.feePayment !== undefined ? pp.feePayment : (pp.allowUpiPayment !== undefined ? pp.allowUpiPayment : true)
      },
      schoolName: schoolName,
      logoUrl: logoUrl,
      updatedAt: pp.updatedAt || new Date().toISOString()
    };

    processedCount++;

    const configRef = db.collection('tenant_data').doc(schoolId).collection('portal').doc('config');
    const existingSnap = await configRef.get();

    console.log(`[${schoolId}] Enabled: ${isPPEnabled} | Migrated: ${isMigrated} | Existing: ${existingSnap.exists}`);
    console.log(`  Modules: Profile=${lightConfig.modules.profile}, Att=${lightConfig.modules.attendance}, TT=${lightConfig.modules.timetable}, Exams=${lightConfig.modules.exams}, Notices=${lightConfig.modules.notices}`);

    if (apply) {
      await configRef.set(lightConfig, { merge: true });
      console.log(`  ✔ Written to tenant_data/${schoolId}/portal/config`);
      updatedCount++;
    } else {
      console.log(`  [DRY-RUN] Would write lightConfig to tenant_data/${schoolId}/portal/config`);
    }
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: Processed: ${processedCount} | ${apply ? `Updated: ${updatedCount}` : 'No writes made (dry-run)'}`);
  console.log('================================================================');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const schoolIdx = args.indexOf('--school');
  const targetSchoolId = schoolIdx !== -1 && args[schoolIdx + 1] ? args[schoolIdx + 1] : null;

  runBackfill({ apply, targetSchoolId })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Backfill error:', err);
      process.exit(1);
    });
}

module.exports = { runBackfill };
