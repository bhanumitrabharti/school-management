const fs = require('fs');
const path = require('path');

const norm = s => s.replace(/\r\n/g, '\n');

console.log('Updating js/app.js for Phase 1b (P3 & P4)...');
let appJs = norm(fs.readFileSync('js/app.js', 'utf8'));

// 1. STALE-CLIENT CREDENTIAL GUARD (Phase 1b) in prepareSavePayload
const oldGuardBlock = `    // STALE-CLIENT CREDENTIAL GUARD (Phase 1b):
    // When credentialsIsolated is true, client saves must NEVER clobber server-managed credentials.
    if (payload.settings && payload.settings.credentialsIsolated === true) {
      if (this._serverSettingsBaseline && this._serverSettingsBaseline.adminPassword) {
        payload.settings.adminPassword = this._serverSettingsBaseline.adminPassword;
      }
      if (Array.isArray(this._serverTeachersBaseline) && this._serverTeachersBaseline.length > 0) {
        // Collect all teacher IDs in trash (from local payload trash AND server trash baseline)
        var trashTeacherIds = new Set(
          (payload.trash || []).concat(this._serverTrashBaseline || [])
            .filter(function(item) { return item && item.type === 'teacher'; })
            .map(function(item) { return item.id; })
        );

        // If any teacher in payload.teachers is in trash, filter it out so stale tabs cannot resurrect
        if (trashTeacherIds.size > 0 && Array.isArray(payload.teachers)) {
          payload.teachers = payload.teachers.filter(function(t) {
            return !trashTeacherIds.has(t.id);
          });
        }

        var localTeachersMap = new Map((payload.teachers || []).map(function(t) { return [t.id, t]; }));
        // 1. Restore any teacher from server baseline that is missing locally UNLESS the teacher is in trash
        this._serverTeachersBaseline.forEach(function(serverT) {
          if (trashTeacherIds.has(serverT.id)) {
            return; // In trash: do NOT resurrect
          }
          if (!localTeachersMap.has(serverT.id)) {
            payload.teachers.push(JSON.parse(JSON.stringify(serverT)));
          } else {
            // 2. Preserve server password hash for existing teachers (prevent stale clobber from reverting reset passwords)
            var localT = localTeachersMap.get(serverT.id);
            if (serverT.password) {
              localT.password = serverT.password;
            }
          }
        });
      }
    }`;

const newGuardBlock = `    // STALE-CLIENT CREDENTIAL GUARD (Phase 1b):
    // When credentialsIsolated is true, client saves must NEVER write passwords to the root doc.
    // They are completely stripped from the root payload even if they exist in memory or baseline.
    if (payload.settings && payload.settings.credentialsIsolated === true) {
      // 1. Delete adminPassword from settings in payload (keep adminUsername intact)
      delete payload.settings.adminPassword;
      if (this.store && this.store.settings) {
        delete this.store.settings.adminPassword;
      }

      // 2. Trash handling: prevent stale tabs from resurrecting deleted teachers
      if (Array.isArray(this._serverTeachersBaseline) && this._serverTeachersBaseline.length > 0) {
        var trashTeacherIds = new Set(
          (payload.trash || []).concat(this._serverTrashBaseline || [])
            .filter(function(item) { return item && item.type === 'teacher'; })
            .map(function(item) { return item.id; })
        );

        // If any teacher in payload.teachers is in trash, filter it out so stale tabs cannot resurrect
        if (trashTeacherIds.size > 0 && Array.isArray(payload.teachers)) {
          payload.teachers = payload.teachers.filter(function(t) {
            return !trashTeacherIds.has(t.id);
          });
        }

        var localTeachersMap = new Map((payload.teachers || []).map(function(t) { return [t.id, t]; }));
        // Restore any teacher from server baseline that is missing locally UNLESS in trash
        this._serverTeachersBaseline.forEach(function(serverT) {
          if (trashTeacherIds.has(serverT.id)) {
            return;
          }
          if (!localTeachersMap.has(serverT.id)) {
            var restoredT = JSON.parse(JSON.stringify(serverT));
            delete restoredT.password;
            payload.teachers.push(restoredT);
          }
        });
      }

      // 3. Ensure NO teacher in payload.teachers contains a password field
      if (Array.isArray(payload.teachers)) {
        payload.teachers.forEach(function(t) {
          if (t && t.password !== undefined) {
            delete t.password;
          }
        });
      }

      // 4. Ensure NO item in payload.trash contains a password field
      if (Array.isArray(payload.trash)) {
        payload.trash.forEach(function(tr) {
          if (tr && tr.password !== undefined) {
            delete tr.password;
          }
        });
      }
    }`;

if (!appJs.includes(oldGuardBlock)) throw new Error('Could not find oldGuardBlock in js/app.js');
appJs = appJs.replace(oldGuardBlock, newGuardBlock);

// 2. Update saveMarks cache write (line ~1803)
const oldSaveMarksCache = `      try {
        const payload = JSON.parse(JSON.stringify(this.store));
        localStorage.setItem('cached_tenant_data_' + currentSchoolId, JSON.stringify(payload));
      } catch (err) {`;

const newSaveMarksCache = `      try {
        const payload = JSON.parse(JSON.stringify(this.store));
        if (payload.settings && payload.settings.credentialsIsolated === true) {
          delete payload.settings.adminPassword;
          if (Array.isArray(payload.teachers)) payload.teachers.forEach(function(t) { if (t) delete t.password; });
          if (Array.isArray(payload.trash)) payload.trash.forEach(function(tr) { if (tr) delete tr.password; });
        }
        localStorage.setItem('cached_tenant_data_' + currentSchoolId, JSON.stringify(payload));
      } catch (err) {`;

if (!appJs.includes(oldSaveMarksCache)) throw new Error('Could not find oldSaveMarksCache in js/app.js');
appJs = appJs.replace(oldSaveMarksCache, newSaveMarksCache);

// 3. P4: On load / initTenantStore, strip credential fields from localStorage cached_tenant_data_* for isolated schools
const oldInitBaselineAnchor = `          self._frozenRootStudents = (parsed.students || []).slice();
          self._serverStudentsBaseline = (parsed.students || []).slice();
          self._serverTeachersBaseline = (parsed.teachers || []).slice();
          self._serverTrashBaseline = (parsed.trash || []).slice();
          self._serverSettingsBaseline = Object.assign({}, parsed.settings || {});`;

const newInitBaselineAnchor = `          self._frozenRootStudents = (parsed.students || []).slice();
          self._serverStudentsBaseline = (parsed.students || []).slice();
          self._serverTeachersBaseline = (parsed.teachers || []).slice();
          self._serverTrashBaseline = (parsed.trash || []).slice();
          self._serverSettingsBaseline = Object.assign({}, parsed.settings || {});

          // P4 (Phase 1b): If credentialsIsolated is true, strip credentials from localStorage cache & in-memory store
          if (parsed.settings && parsed.settings.credentialsIsolated === true) {
            delete self.store.settings.adminPassword;
            if (Array.isArray(self.store.teachers)) {
              self.store.teachers.forEach(function(t) { if (t) delete t.password; });
            }
            if (Array.isArray(self.store.trash)) {
              self.store.trash.forEach(function(tr) { if (tr) delete tr.password; });
            }
            try {
              var cKey = 'cached_tenant_data_' + schoolId;
              var cachedRaw = localStorage.getItem(cKey);
              if (cachedRaw) {
                var cachedObj = JSON.parse(cachedRaw);
                var cModified = false;
                if (cachedObj.settings && cachedObj.settings.adminPassword) {
                  delete cachedObj.settings.adminPassword;
                  cModified = true;
                }
                if (Array.isArray(cachedObj.teachers)) {
                  cachedObj.teachers.forEach(function(t) {
                    if (t && t.password) { delete t.password; cModified = true; }
                  });
                }
                if (Array.isArray(cachedObj.trash)) {
                  cachedObj.trash.forEach(function(tr) {
                    if (tr && tr.password) { delete tr.password; cModified = true; }
                  });
                }
                if (cModified) {
                  localStorage.setItem(cKey, JSON.stringify(cachedObj));
                }
              }
            } catch (cErr) {
              console.warn('Failed to sanitize localStorage cached credentials:', cErr);
            }
          }`;

if (!appJs.includes(oldInitBaselineAnchor)) throw new Error('Could not find oldInitBaselineAnchor in js/app.js');
appJs = appJs.replace(oldInitBaselineAnchor, newInitBaselineAnchor);

fs.writeFileSync('js/app.js', appJs, 'utf8');
console.log('✅ js/app.js updated.');

// 4. Update js/teachers.js TeacherProfileService
console.log('Updating js/teachers.js...');
let teachersJs = norm(fs.readFileSync('js/teachers.js', 'utf8'));

const oldTeacherPrepAnchor = `      var prep = (typeof SchoolApp.prepareSavePayload === 'function') ? SchoolApp.prepareSavePayload() : null;
      var rootPayload = (prep && prep.success) ? prep.payload : { teachers: currentTeachers };`;

const newTeacherPrepAnchor = `      var prep = (typeof SchoolApp.prepareSavePayload === 'function') ? SchoolApp.prepareSavePayload() : null;
      var rootPayload = (prep && prep.success) ? prep.payload : { teachers: currentTeachers };
      if (SchoolApp.store.settings && SchoolApp.store.settings.credentialsIsolated === true) {
        if (Array.isArray(rootPayload.teachers)) {
          rootPayload.teachers.forEach(function(t) { if (t) delete t.password; });
        }
      }`;

if (!teachersJs.includes(oldTeacherPrepAnchor)) throw new Error('Could not find oldTeacherPrepAnchor in js/teachers.js');
teachersJs = teachersJs.replace(oldTeacherPrepAnchor, newTeacherPrepAnchor);

fs.writeFileSync('js/teachers.js', teachersJs, 'utf8');
console.log('✅ js/teachers.js updated.');
