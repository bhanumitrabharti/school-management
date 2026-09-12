# Firestore Sub-Collection Restructuring — Implementation Brief for Antigravity 2.0

**Author:** Claude (Senior Software Architect / Technical Auditor, Ctrl Shift Solutions)
**Prepared for:** Antigravity 2.0 (implementation agent)
**Reviewed by:** Bhanu (Founder)
**Date:** 2026-09-11
**Codebase:** Paathshala / ShishuERP (`C:\Users\bhanu\.gemini\antigravity\scratch\school-management`)

---

## 0. Why you're getting this instead of Claude writing the code directly

Claude's cloud sandbox cannot reach `firestore.googleapis.com` (blocked by organization network policy — this is a deliberate safety guardrail, not a bug) and cannot currently execute shell commands on Bhanu's machine (a Sept 8 Windows update broke the local shell bridge for this session). That means Claude can read/write files but **cannot run or test anything that touches live Firestore data**. Given the standing constraint on this project — **zero risk to the 3 live schools' data** — Claude is not willing to hand over untested migration code for you to run blind. So: Claude designed and specified this migration in full; you implement, run, and verify it, because you have full local execution on Bhanu's machine.

Bhanu's instruction: do this without him needing to do extra manual work. So wherever a step below can be scripted/automated, script it — don't make Bhanu click through Firestore Console by hand except for the one-time Admin SDK key download (unavoidable, needs his Google login).

---

## 1. The problem (root cause, confirmed from code)

Every tenant's entire dataset lives in **one Firestore document**: `tenant_data/{schoolId}`. Firestore hard-caps a document at **1 MB**.

Three fields inside that document grow **unboundedly over time** and are the actual cause of schools hitting the limit:

| Field | Shape (confirmed in code) | Growth |
|---|---|---|
| `store.attendance` | flat array, one entry per student per day | +students×schooldays/year, forever |
| `store.fees` | flat array, one entry per payment transaction | +1 per fee payment, forever |
| `store.examMarks` | `{termId: {classId: {sectionId: {studentId: markEntry}}}}` | +1 exam-term's worth of nested entries per exam cycle |

Everything else in the document (`students`, `teachers`, `settings`, class/section config, fee-head config, timetable, etc.) is **bounded** — it scales with headcount, not with time — and is fine to leave where it is.

There's a second, related problem that's separate from the 1MB ceiling but explains the "ERP feels slow" complaint: **`SchoolApp.save()` in `app.js` (line 246) always `JSON.stringify`s and writes the ENTIRE tenant document**, even when only one attendance mark or one fee payment changed. A school with a 400KB document pays the cost of uploading 400KB on every single small edit. Splitting the three unbounded fields into their own documents fixes both problems at once: the main document stays small and fast to write, and attendance/fee/exam writes become small targeted writes to their own doc instead of full-document rewrites.

---

## 2. Target schema

Keep `tenant_data/{schoolId}` for everything bounded. Move the three unbounded fields into sub-collections under the same tenant document:

```
tenant_data/{schoolId}                              (existing doc — shrinks, keeps everything except the 3 fields below)
tenant_data/{schoolId}/attendance_months/{YYYY-MM}   → { records: [ ...that month's attendance entries... ] }
tenant_data/{schoolId}/fees_years/{YYYY}             → { transactions: [ ...that year's fee transactions... ] }
tenant_data/{schoolId}/exam_marks/{termId}           → { classId: { sectionId: { studentId: markEntry } } }   (i.e. exactly today's examMarks[termId] shape, just promoted to its own doc)
```

Why this split:
- **Attendance by month**: a school with 300 students × ~220 school days/year × ~12 years of history would blow 1MB in the flat array within 1-2 years. One doc per month keeps each doc to (students × 1 record), trivially small, and this matches how attendance is actually queried/displayed (by date/month).
- **Fees by year**: transactions accumulate per payment, forever. One doc per year keeps each doc bounded to a year's payment volume, and matches how fee reports/reconciliation are actually run (by financial year).
- **Exam marks by term**: already naturally bounded per exam cycle (classes × sections × students × subjects for one term is small even at 1000+ students), so it doesn't need further splitting — just promote each `examMarks[termId]` to its own document instead of nesting all terms in the main doc forever.

Do **not** touch `students`, `teachers`, `settings`, or any config field. Do not invent any other new sub-collections — scope is exactly these three.

---

## 3. Non-negotiable safety rules (from Bhanu — do not deviate)

1. **3 live schools, zero risk**: `kkgs.ctrlshifts.in` (KKGS — already lost data once), `svm.ctrlshifts.in` (Shishu Vikash Mandir, the real live one), `ips.ctrlshifts.in` (Indian Public School). No experimentation against these until the process below has been proven safe.
2. **`svm-bokaro.ctrlshifts.in` (`school_id: svm_bokaro_001`) is the demo/test tenant** — confirmed by Bhanu directly: "Shishu Vikash Mandir (Bokaro) demo hai... mera jo school hai live working hai wo Shishu Vikash Mandir svm.ctrlshifts.in hai." Do ALL development and testing against `svm_bokaro_001` first. It is safe to break/reset.
3. **Before touching any live school's data, take a fresh manual export** (Google Cloud Console → Firestore → Import/Export, or `gcloud firestore export`) even though scheduled PITR + daily/weekly backups are already enabled — an extra manual export immediately before a risky operation costs nothing and gives an exact restore point.
4. **Never delete the old flat fields (`attendance`, `fees`, `examMarks`) from a tenant doc as part of the migration itself.** Migrate = copy data into the new sub-collections, verify counts match, deploy the app code that reads/writes the new location, run in production for a period, and only THEN (as a separate, later, explicitly-approved step) strip the old fields out. Until that cleanup step, the old fields sitting unused in the doc cost nothing except a bit of the size budget they were already using.
5. **One school at a time**, in this order: `svm_bokaro_001` (demo) → then whichever live school Bhanu names first (pilot) → then the remaining two, each with its own fresh backup immediately before.
6. If anything about a live school's data looks off after migration (counts don't match, app shows wrong data), **stop immediately, do not proceed to the next school**, and restore from the fresh backup taken in step 3.

---

## 4. Migration script

A ready-to-run Node.js script is provided separately: `migrate-tenant-to-subcollections.js`. It uses the Firebase Admin SDK (server-side, bypasses security rules, needs a service account key — see setup below). Design:

```
for schoolId in [target school]:
  1. Read tenant_data/{schoolId} once.
  2. Group store.attendance[] by the record's date → YYYY-MM. Write each group as
     tenant_data/{schoolId}/attendance_months/{YYYY-MM} = { records: [...] }
  3. Group store.fees[] by the transaction's date → YYYY. Write each group as
     tenant_data/{schoolId}/fees_years/{YYYY} = { transactions: [...] }
  4. For each termId in store.examMarks, write
     tenant_data/{schoolId}/exam_marks/{termId} = store.examMarks[termId]
  5. Verify: re-read every sub-collection doc just written, sum up record/transaction counts,
     compare against the original array lengths. Abort loudly on any mismatch — do NOT proceed
     to step 6 if counts don't match exactly.
  6. Do NOT delete or modify the original tenant_data/{schoolId} document in this script at all.
     This script is purely additive/copy — it only ever writes to the new sub-collection paths.
     That means it is safe to re-run (it will just overwrite the sub-collection docs with the
     same data) and safe to abort halfway (the source document is never touched).
```

This additive-only design is deliberate: the riskiest possible migration script is one that reads, transforms, and writes back over the original document. This script never does that. The old document is left completely untouched by the script; only the app code (next section) is what changes which location gets read/written going forward, and that's a separate, reviewable, revertible deploy.

**Setup needed before running it:**
1. Firebase Console → Project Settings (gear icon) → Service Accounts tab → "Generate new private key" → downloads a JSON file. This requires Bhanu's Google login (same account/IAM access used for the Firestore export — if that was Manisha's account, use hers again). This is the one step that can't be automated.
2. `npm install firebase-admin` in wherever you run the script from.
3. Put the downloaded key path into the script's `SERVICE_ACCOUNT_KEY_PATH` constant (see script header).
4. Run against `svm_bokaro_001` first: `node migrate-tenant-to-subcollections.js svm_bokaro_001`

---

## 5. App code changes needed (read/write compatibility layer)

This is the bulk of the implementation work and the part that needs real execution + testing, which is why it's yours rather than a blind hand-off from Claude. Files and current touchpoint counts (from Claude's audit grep):

| File | `store.attendance` / `store.fees` / `store.examMarks` touchpoints |
|---|---|
| `js/attendance.js` | 19 |
| `js/exams.js` | 14 |
| `js/fees.js` | 23 |
| `js/teachers.js` | 3 (teacher attendance, same pattern) |
| `js/app.js` | 5 (the `store.attendance = []` resets, plus `save()`/`saveMarks()` core paths) |

**Design principle — dual-read, single-write:**

- **Read path**: for a given month/year/term, first try reading from the new sub-collection doc (`attendance_months/{YYYY-MM}`, `fees_years/{YYYY}`, `exam_marks/{termId}`). If it doesn't exist yet (tenant not migrated, or that period predates migration and was never split out), fall back to filtering the legacy flat array (`store.attendance`, `store.fees`, `store.examMarks[termId]`) that's still sitting in the main doc for now. This means the app keeps working correctly for a tenant whether or not it's been migrated yet, and works correctly for both old and new data on an already-migrated tenant.
- **Write path**: once a tenant is migrated (a flag you set on the tenant doc, e.g. `settings.restructured = true`, is the simplest signal), all NEW attendance/fee/exam writes go directly to the relevant sub-collection document (targeted `updateDoc`/`setDoc` on just that one small doc — e.g. append this month's attendance record to `attendance_months/{currentYYYYMM}`), not to the flat array in the main doc, and not through the full-document `SchoolApp.save()` path at all for these three data types. This is also what fixes the slowness complaint — a single attendance mark becomes a small write to one small doc instead of re-uploading the whole tenant document.
- Keep `SchoolApp.save()` exactly as-is for everything else (students, teachers, settings) — do not change that path.

**Suggested implementation order** (test each against `svm_bokaro_001` before moving to the next):
1. Attendance (`attendance.js`, the `attendance` reset points in `app.js`) — highest volume, most user-visible if broken (daily use).
2. Fees (`fees.js`) — second highest volume.
3. Exam marks (`exams.js`) — lowest frequency of use, least urgent, but same pattern.
4. Teacher attendance (`teachers.js`) — smallest, do last.

For each: implement the dual-read/single-write helpers, wire them into the existing UI code paths (replace direct `SchoolApp.store.attendance.push(...)` etc. with a call to the new helper), then manually test in the browser against `svm_bokaro_001`: mark attendance for today, reload the page, confirm it shows; check a past month still shows correctly; do a fee payment, reload, confirm; check exam marks entry and display still work.

---

## 6. Rollout sequence (do not skip steps)

1. Implement + test everything above against `svm_bokaro_001` only. Confirm attendance/fees/exams all read and write correctly, old historical data (still in the flat fields) still displays correctly via the fallback path, and the app doesn't feel or behave differently to a user.
2. Run `migrate-tenant-to-subcollections.js svm_bokaro_001` (if not already run during dev), verify counts.
3. Report back to Bhanu with what was tested and how. Wait for explicit go-ahead before touching any of the 3 live schools.
4. Take a fresh manual Firestore export (whole database, same as the one done 2026-09-11) immediately before touching the first live school.
5. Run the migration script for that one school, verify counts match exactly against the export just taken.
6. Confirm in the live app (as an actual user of that school, not impersonation) that attendance/fees/exams all still work correctly — today's data and historical data both.
7. Watch for a day before moving to the next school. Repeat steps 4-6 for each remaining live school, one at a time.
8. Only after all 3 live schools are confirmed stable for at least a few days does the (separate, future, explicitly-approved) step of stripping the old flat fields out of `tenant_data` get scheduled — that is NOT part of this task.

---

## 7. What NOT to do

- Do not run the migration script against `kkgs.ctrlshifts.in`, `svm.ctrlshifts.in`, or `ips.ctrlshifts.in` without Bhanu's explicit go-ahead per school, each preceded by a fresh manual backup.
- Do not modify or delete the legacy `attendance`/`fees`/`examMarks` fields on any tenant document as part of this work.
- Do not touch `students`, `teachers`, `settings`, class/section config, or fee-head config — out of scope for this restructuring.
- Do not change the hardcoded Super Admin credentials, the frontend-only access control, or any of the other items from Claude's original audit — separate, not part of this task.
- If you hit something you're not confident about mid-way (a data shape that doesn't match what's documented here, an edge case), stop and flag it rather than guessing — the standing rule on this project is zero risk to live school data.

---

## 8. Reference: current save/data patterns confirmed in code

- `SchoolApp.save()` — `js/app.js` line 246 — full-document `setDoc(docRef, payload, {merge:true})`.
- `SchoolApp.saveMarks()` — `js/app.js` line 342 — already does targeted `updateDoc` on a dot-path (`examMarks.{termId}.{classId}.{sectionId}.{studentId}`) with `setDoc merge` fallback — this is the correct pattern to imitate for the new sub-collection writes.
- Attendance push: `js/app.js` line 2317 (`self.store.attendance.push({...})`) and multiple sites in `js/attendance.js`.
- Fee transaction push: `js/fees.js` line 2013-2024 (`SchoolApp.store.fees.push(newTxn)` — object has `id`, `studentId`, `schoolId`, `type`, `amount`, `date`, `mode`, `remarks`, `timestamp`).
- Exam marks: `js/exams.js` line 239 onward — `SchoolApp.store.examMarks[termId][classId][sectionId][studentId] = {...}`.

All of this is already fixed/working as of Claude's earlier pass this session — this restructuring is additive on top of it, not a rewrite of it.
