const fs = require('fs');

const norm = s => s.replace(/\r\n/g, '\n');

console.log('Updating api/manage-credentials.js for Phase 1b...');
let code = norm(fs.readFileSync('api/manage-credentials.js', 'utf8'));

// 1. set-admin-password
const oldAdminPass = `        settings.adminPassword = passwordHash;
        if (adminUsername && typeof adminUsername === 'string') {
          settings.adminUsername = adminUsername.trim();
        }`;

const newAdminPass = `        if (settings.credentialsIsolated === true) {
          delete settings.adminPassword;
        } else {
          settings.adminPassword = passwordHash;
        }
        if (adminUsername && typeof adminUsername === 'string') {
          settings.adminUsername = adminUsername.trim();
        }`;

if (!code.includes(oldAdminPass)) throw new Error('Could not find oldAdminPass in api/manage-credentials.js');
code = code.replace(oldAdminPass, newAdminPass);

// 2. set-teacher-password
const oldTchPass = `        const targetTeacher = Object.assign({}, teachers[teacherIdx]);
        targetTeacher.password = passwordHash;
        teachers[teacherIdx] = targetTeacher;`;

const newTchPass = `        const targetTeacher = Object.assign({}, teachers[teacherIdx]);
        if (rootData.settings && rootData.settings.credentialsIsolated === true) {
          delete targetTeacher.password;
        } else {
          targetTeacher.password = passwordHash;
        }
        teachers[teacherIdx] = targetTeacher;`;

if (!code.includes(oldTchPass)) throw new Error('Could not find oldTchPass in api/manage-credentials.js');
code = code.replace(oldTchPass, newTchPass);

// 3. add-teacher
const oldAddTch = `        const newTeacherRecord = Object.assign({}, teacherData, {
          id: createdTeacherId,
          password: passwordHash
        });
        teachers.push(newTeacherRecord);`;

const newAddTch = `        const newTeacherRecord = Object.assign({}, teacherData, {
          id: createdTeacherId
        });
        if (rootData.settings && rootData.settings.credentialsIsolated === true) {
          delete newTeacherRecord.password;
        } else {
          newTeacherRecord.password = passwordHash;
        }
        teachers.push(newTeacherRecord);`;

if (!code.includes(oldAddTch)) throw new Error('Could not find oldAddTch in api/manage-credentials.js');
code = code.replace(oldAddTch, newAddTch);

// 4. restore-teacher
const oldRestoreTch = `        // Dual-write during probation: root teacher gets passwordHash so old fallback works byte-identical
        const finalTeacherRecord = Object.assign({}, restoredTeacherData, {
          id: teacherId,
          password: passwordHash || restoredTeacherData.password || 'PROTECTED'
        });`;

const newRestoreTch = `        // Phase 1b: If isolated, root teacher stays hash-free; otherwise dual-write for legacy
        const finalTeacherRecord = Object.assign({}, restoredTeacherData, {
          id: teacherId
        });
        if (rootData.settings && rootData.settings.credentialsIsolated === true) {
          delete finalTeacherRecord.password;
        } else {
          finalTeacherRecord.password = passwordHash || restoredTeacherData.password || 'PROTECTED';
        }`;

if (!code.includes(oldRestoreTch)) throw new Error('Could not find oldRestoreTch in api/manage-credentials.js');
code = code.replace(oldRestoreTch, newRestoreTch);

fs.writeFileSync('api/manage-credentials.js', code, 'utf8');
console.log('✅ api/manage-credentials.js updated successfully.');
