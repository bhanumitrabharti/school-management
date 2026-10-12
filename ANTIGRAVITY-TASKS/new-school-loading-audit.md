# DIAGNOSIS & FIX PROPOSAL: New Schools Spinning on Load
**Date**: October 12, 2026  
**Status**: READ-ONLY DIAGNOSIS & FIX PROPOSAL (No implementation performed)  
**Affected Tenants**:
1. Ideal School of Learning (`idealschoolgomoh.ctrlshifts.in`)
2. Usha Academy Public School (`usha-academy-mango.ctrlshifts.in`)

---

## 1. REPRODUCE (Headless Chrome Diagnostics)

Both affected URLs and a healthy reference school (`kkgs.ctrlshifts.in`) were inspected in headless Chrome (`--headless=new`) with cache-busting parameters (`?_cb=<timestamp>`).

### (a) Empirical Comparison Matrix

| Property | Ideal School of Learning (`idealschoolgomoh`) | Usha Academy Public School (`usha-academy-mango`) | Kids Kinder Garten (`kkgs` - Healthy Reference) |
| :--- | :--- | :--- | :--- |
| **Resolved School ID** | `idealschoolgomoh_mv1xhpe5` | `usha_academy_mango_muzflr5z` | `kkgs_mttt4ufq` |
| **`#app-loading-overlay` State** | **`active` (Display: flex, Opacity: 1, zIndex: 999999)** | **`active` (Display: flex, Opacity: 1, zIndex: 999999)** | **Hidden (`opacity: 0`, inactive)** |
| **Login Button Status** | **Disabled (`Connecting...`)** | **Disabled (`Connecting...`)** | **Enabled (`Sign In`)** |
| **`tenantInitialized`** | **`false`** | **`false`** | **`true`** |
| **Firestore Snapshot Result** | **`docSnap.exists() === false`** | **`docSnap.exists() === false`** | **`docSnap.exists() === true`** |
| **Console Warning** | `[warning] Document not found on snapshot for idealschoolgomoh_mv1xhpe5 — waiting for next snapshot, NOT auto-initializing.` | `[warning] Document not found on snapshot for usha_academy_mango_muzflr5z — waiting for next snapshot, NOT auto-initializing.` | `[log] Detected school context from subdomain: kkgs -> kkgs_mttt4ufq` |

### (b) Code Location of Indefinite Loader Spin
The exact location where the loader waits forever is [`js/app.js:1541-1544`](file:///C:/Users/bhanu/.gemini/antigravity/scratch/school-management/js/app.js#L1541-L1544):
```javascript
self.tenantListenerUnsubscribe = window.firestore.onSnapshot(docRef, { includeMetadataChanges: true }, async (docSnap) => {
  self.updateConnectionIndicator(docSnap.metadata.fromCache);

  var parsed = null;
  var docExists = docSnap.exists();
  if (docExists) {
    parsed = docSnap.data();
  }

  // SAFEGUARD: Never auto-create or overwrite tenant document from a client onSnapshot event.
  // If the document is not found, simply wait for the next snapshot from server.
  if (!docExists) {
    console.warn('Document not found on snapshot for ' + activeSchoolId + ' — waiting for next snapshot, NOT auto-initializing.');
    return; // <-- Line 1543: EXITS IMMEDIATELY
  }
```
Because `docExists` is `false`, the callback returns on line 1543. Lines 1720–1723 (`self.hideLoader()` and `resolve(true)`) and line 1567 (`self.enableLoginButton()`) are never reached. There is no timeout or error state, so `#app-loading-overlay` stays visible indefinitely.

---

## 2. DATA STATE AUDIT (Read-Only via Firebase Admin SDK)

### (a) School 1: Ideal School of Learning
- **School ID**: `idealschoolgomoh_mv1xhpe5`
- **`schools/{id}`**: **EXISTS**
  - **Subdomain**: `idealschoolgomoh` (matches URL `idealschoolgomoh.ctrlshifts.in`).
  - **Top-level Fields**: `school_id`, `school_name`, `tagline`, `phone`, `email`, `address`, `subdomain`, `plan` ('Premium'), `status` ('Active'), `storage_used` ('0 MB'), `renewal_date` ('2027-03-01'), `last_login` ('Never'), `logo_url`, `allowed_features` (12 items), `restructured` (true), `settings` (map).
  - **`settings` keys**: `schoolInfo`, `schoolName`, `tagline`, `phone`, `email`, `address`, `affiliation`, `udiseCode`, `classes` (13 items), `sections` (13 items), `feeStructure` (map), `extraCharges` (array), `setupCompletedBySuperAdmin` (true), `clientCanEdit` (true), `theme` ('dark'), `attendanceTime` ('09:00'), `academicYear` ('2025-2026'), `restructured` (true).
- **`tenant_data/{id}`**: **DOES NOT EXIST** (`exists: false`).
- **Subcollections**: 0.
- **`school_access` Mappings**: 0.
- **Creation Timestamp**: `2026-10-10T05:03:02.093Z` (October 10, 2026, 10:33 IST — decoded from base-36 suffix `mv1xhpe5`).

### (b) School 2: Usha Academy Public School
- **School ID (Primary)**: `usha_academy_mango_muzflr5z`
- **`schools/{id}`**: **EXISTS**
  - **Subdomain**: `usha-academy-mango` (matches URL `usha-academy-mango.ctrlshifts.in`).
  - **Top-level Fields**: Same schema as Ideal School.
  - **`settings` keys**: Same schema as Ideal School (13 classes, 13 sections, feeStructure).
- **`tenant_data/{id}`**: **DOES NOT EXIST** (`exists: false`).
- **Subcollections**: 0.
- **`school_access` Mappings**: 0.
- **Creation Timestamp**: `2026-10-08T11:06:45.575Z` (October 8, 2026, 16:36 IST — decoded from base-36 suffix `muzflr5z`).

*Note on Duplicate Attempt*: A second document `schools/usha_academymango_muzfmvbh` exists with subdomain `usha-academymango`. It was created 52 seconds later at `2026-10-08T11:07:37.613Z` when Super Admin retried onboarding without hyphens. It also lacks a `tenant_data` document.

### (c) Comparison with Healthy School (`kkgs_mttt4ufq`)
| Resource | Healthy School (`kkgs_mttt4ufq`) | Ideal School (`idealschoolgomoh_mv1xhpe5`) | Usha Academy (`usha_academy_mango_muzflr5z`) |
| :--- | :--- | :--- | :--- |
| **`schools` doc** | Exists (15 fields) | Exists (16 fields) | Exists (16 fields) |
| **`tenant_data` doc** | **Exists (30 top-level fields)** | **MISSING** | **MISSING** |
| **`students`** | Array (161 records) | Missing | Missing |
| **`teachers`** | Array (12 records) | Missing | Missing |
| **`fees` / `feeHeads`** | Present | Missing | Missing |
| **`examMarks` / `exams`** | Present | Missing | Missing |
| **Subcollections** | `attendance_months`, `exam_marks`, `fees_years` | None | None |

---

## 3. ONBOARDING FLOW & ERROR TRACE

### (a) Flow Sequence in [`js/super-admin.js:3002-3139`](file:///C:/Users/bhanu/.gemini/antigravity/scratch/school-management/js/super-admin.js#L3002-L3139)
When Super Admin clicks "Onboard School":
1. Generates `newSchoolId = slug + '_' + Date.now().toString(36)`.
2. Assembles `newSchool` metadata payload.
3. **Step 1 (Write to `schools`)**:
   ```javascript
   await setDoc(doc(db, 'schools', newSchoolId), newSchool); // LINE 3060
   ```
4. Assembles full `tenantData` object with settings, empty rosters, and ledger defaults (lines 3082–3132).
5. **Step 2 (Write to `tenant_data`)**:
   ```javascript
   await setDoc(doc(db, 'tenant_data', newSchoolId), tenantData); // LINE 3133
   ```

### (b) Why Step 2 Failed
In live production [`firestore.rules`](file:///C:/Users/bhanu/.gemini/antigravity/scratch/school-management/firestore.rules):
```firestore-rules
match /schools/{schoolId} {
  allow read:  if true;
  allow write: if isSuperAdmin(); // Super Admin UID cq647... matches -> ALLOWED
}

match /tenant_data/{schoolId} {
  allow read:   if canReadTenant(schoolId);
  allow create: if canAccessSchool(schoolId) && // <-- REQUIRES school_access MAPPING!
                   notWipingRoster('students') &&
                   notWipingRoster('teachers') &&
                   notOversizedBlobs();
```
- Step 1 succeeded because `isSuperAdmin()` is true on `schools/{schoolId}`.
- Step 2 was **REJECTED** by Firestore with `FirebaseError: Missing or insufficient permissions` because `canAccessSchool(newSchoolId)` checks whether the authenticated user has a `school_access/{uid}` mapping for `newSchoolId`. The Super Admin user does not have a `school_access` document for this brand-new school ID.
- Line 3135 caught the rejection:
  ```javascript
  showToast('Failed to onboard school to Firestore: ' + (e.message || e), 'error');
  return;
  ```
- **Atomicity Failure**: Because Step 1 and Step 2 were executed as separate, unbatched operations, Step 1 remained committed while Step 2 failed, leaving half-created zombie schools.

---

## 4. LINK TO RECENT CHANGES

### (a) Deployment Timeline
- **Usha Academy Onboarded**: **October 8, 2026, 16:36 IST**
- **Ideal School Onboarded**: **October 10, 2026, 10:33 IST**
- **Stage 1 Security Deploy (commit `6273989`)**: **October 12, 2026, 06:09 IST**

**Conclusion**: The failure did **NOT** originate from the Stage 1 release, branding changes, or impersonation guards. Both schools were already half-created and broken on October 8 and October 10 due to the longstanding Firestore rules defect on `tenant_data` creation by Super Admin.

### (b) Pre-Sanitization Credential Preservation
During the Stage 1 metadata sanitization on October 12, `adminPassword`, `adminUsername`, and `adminEmail` were stripped from `schools/{id}`. Because `tenant_data/{id}` had failed to create during onboarding, those fields were only present in `schools/{id}`.
- **Safety Copy Verified**: The pre-sanitization snapshot at [`backups/schools_live_sanitization_pre/schools_backup_live.json`](file:///C:/Users/bhanu/.gemini/antigravity/scratch/school-management/backups/schools_live_sanitization_pre/schools_backup_live.json) contains the full onboarding payloads (including the original bcrypt-hashed `adminPassword`, `adminUsername`, and `adminEmail`) for both `idealschoolgomoh_mv1xhpe5` and `usha_academy_mango_muzflr5z`. No credentials have been lost.

### (c) Priority Schools Verification
All 6 priority schools were loaded in headless Chrome to confirm zero impact:
- ✅ **`svm.ctrlshifts.in`** (`svm_mqbv7qm2`): Loads cleanly to Login Card (`Sign In` active).
- ✅ **`kkgs.ctrlshifts.in`** (`kkgs_mttt4ufq`): Loads cleanly to Login Card (`Sign In` active).
- ✅ **`ips.ctrlshifts.in`** (`ips_mttx07mt`): Loads cleanly to Login Card (`Sign In` active).
- ✅ **`oxford-narra.ctrlshifts.in`** (`oxford_narra_muktjcky`): Loads cleanly to Login Card (`Sign In` active).
- ✅ **`apex-khalcho.ctrlshifts.in`** (`apex_khalcho_mugmtmx4`): Loads cleanly to Login Card (`Sign In` active).
- ✅ **`nts.ctrlshifts.in`** (`nts_mu28myws`): Loads cleanly to Login Card (`Sign In` active).

---

## 5. FIX PROPOSAL (No Implementation Performed)

### (a) Code Fix 1: Loader Timeout & Missing Tenant Error Handling ([`js/app.js`](file:///C:/Users/bhanu/.gemini/antigravity/scratch/school-management/js/app.js))
In `initData`:
1. If `!docExists` on snapshot for `activeSchoolId`:
   - Do not return silently while leaving the loader active.
   - Hide `#app-loading-overlay`.
   - Render a clear, user-facing error message on the login card:
     `"School portal data has not been initialized. Please contact the administrator at connect@ctrlshifts.in."`
   - Disable the login submit button with informative text `"School Unavailable"`.
2. Add a global 10-second initialization watchdog timer that forces `self.hideLoader()` and displays a timeout alert if Firestore listeners fail to initialize.

### (b) Code Fix 2: Atomic Onboarding & Stage 2 Rules
1. **Firestore Rules**:
   - As already verified in our Stage 2 emulator test suite, update `firestore.rules` so `tenant_data/{schoolId}` allows write if `canAccessSchool(schoolId) || isSuperAdmin()`.
2. **Atomic Batching in [`js/super-admin.js`](file:///C:/Users/bhanu/.gemini/antigravity/scratch/school-management/js/super-admin.js)**:
   - Use `const batch = writeBatch(db)` to bundle:
     * `batch.set(doc(db, 'schools', newSchoolId), newSchool);`
     * `batch.set(doc(db, 'tenant_data', newSchoolId), tenantData);`
   - Execute `await batch.commit();` so onboarding is strictly atomic (either both documents are written or neither is).

### (c) Data Fix: Reconstructing Missing `tenant_data` for the 2 Schools
Using a standalone Admin SDK script (bypassing client rule constraints, with pre-execution JSON backup):
1. **Source Data for `idealschoolgomoh_mv1xhpe5`**:
   - Branding, classes, sections, feeStructure, academicYear from `schools/idealschoolgomoh_mv1xhpe5`.
   - `adminUsername`, `adminEmail`, and `adminPassword` (bcrypt hash) restored from pre-sanitization backup [`backups/schools_live_sanitization_pre/schools_backup_live.json`](file:///C:/Users/bhanu/.gemini/antigravity/scratch/school-management/backups/schools_live_sanitization_pre/schools_backup_live.json).
   - Empty baseline schema: `students: []`, `teachers: []`, `fees: []`, `attendance: []`, `examMarks: {}`, `exams: []`, `marks: []`, `timetable: {}`, `notices: []`, standard `feeHeads`, `restructured: true`.
2. **Source Data for `usha_academy_mango_muzflr5z`**:
   - Identical reconstruction process using its pre-sanitization data.
3. **Duplicate Clean-up Decision**:
   - `usha_academymango_muzfmvbh` can be marked archived or retained as-is based on Bhanu's preference. No deletions will be performed without explicit instruction.

### (d) Test Plan on `dummy_test_school_isolated`
1. Replicate missing `tenant_data` scenario on dummy tenant to verify user-facing error message and loader dismissal.
2. Replicate batch onboarding on dummy tenant to verify atomicity.
3. Test reconstructed tenant documents for Ideal School and Usha Academy in headless Chrome to confirm both login cards render with active "Sign In" buttons.

---

## 6. APPROVAL CHECKPOINT FOR BHANU

Please confirm whether to proceed with:

1. [ ] **Approve Code Fix 1**: Add missing-tenant guard and 10s watchdog timeout in [`js/app.js`](file:///C:/Users/bhanu/.gemini/antigravity/scratch/school-management/js/app.js) so pages never spin indefinitely.
2. [ ] **Approve Code Fix 2**: Convert Super Admin onboarding in [`js/super-admin.js`](file:///C:/Users/bhanu/.gemini/antigravity/scratch/school-management/js/super-admin.js) to an atomic `writeBatch`.
3. [ ] **Approve Data Backfill**: Backfill `tenant_data/idealschoolgomoh_mv1xhpe5` and `tenant_data/usha_academy_mango_muzflr5z` using the Admin SDK from pre-sanitization backup data without modifying any existing live records.
4. [ ] **Duplicate Tenant Guidance**: Confirm whether to leave `usha_academymango_muzfmvbh` untouched or mark it archived.
