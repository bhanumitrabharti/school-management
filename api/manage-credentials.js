'use strict';

/**
 * POST /api/manage-credentials
 * Server-side credential management endpoint for schools with credentialsIsolated = true.
 *
 * SECURITY:
 *   - Strictly verifies caller's Firebase Auth session token.
 *   - Strictly verifies caller has role == 'admin' for the target school in school_access.
 *   - Bcrypt hashing performed entirely on the server (cost factor 10).
 *   - Dual-writes to both private/credentials and root document during probation period.
 *   - Zero passwords or password hashes returned in responses.
 */

const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

function getAdmin() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (raw) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(raw))
      });
    } else {
      const fs = require('fs');
      if (fs.existsSync('service-account-key.json')) {
        const sa = JSON.parse(fs.readFileSync('service-account-key.json', 'utf8'));
        admin.initializeApp({
          credential: admin.credential.cert(sa)
        });
      } else {
        throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not configured.');
      }
    }
  }
  return admin;
}

function applyCors(req, res) {
  const ALLOWED = [
    process.env.ALLOWED_ORIGIN || 'https://www.ctrlshifts.in',
    'https://ctrlshifts.in'
  ];
  const origin = req.headers.origin;
  if (origin && (ALLOWED.includes(origin) || origin.endsWith('.ctrlshifts.in') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function ensureResponseHelpers(res) {
  if (typeof res.status !== 'function') {
    res.status = function(code) {
      this.statusCode = code;
      return this;
    };
  }
  if (typeof res.json !== 'function') {
    res.json = function(data) {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(data));
      return this;
    };
  }
}

module.exports = async function handler(req, res) {
  ensureResponseHelpers(res);
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { idToken, schoolId, action } = body;

  if (!idToken || !schoolId || !action) {
    return res.status(400).json({ error: 'Missing required parameters (idToken, schoolId, action).' });
  }

  let firebaseAdmin;
  try {
    firebaseAdmin = getAdmin();
  } catch (initErr) {
    console.error('[manage-credentials] Firebase Admin Init Error:', initErr);
    return res.status(500).json({ error: 'Authentication service initialization error.' });
  }

  const db = firebaseAdmin.firestore();

  // 1. Verify Caller ID Token
  let decodedToken;
  try {
    decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
  } catch (tokenErr) {
    console.warn('[manage-credentials] Invalid ID Token:', tokenErr.message);
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }
  const uid = decodedToken.uid;

  // 2. Authorize Caller: Must be verified Super Admin UID ONLY or verified School Admin in school_access
  const isSuperAdmin = (uid === 'cq647u1GfCXISzf7XMw8pxH76I72');

  if (!isSuperAdmin) {
    const accessSnap = await db.collection('school_access').doc(uid).get();
    if (!accessSnap.exists) {
      return res.status(403).json({ error: 'Access denied: No verified school access record found.' });
    }
    const accessData = accessSnap.data();
    if (accessData.schoolId !== schoolId || accessData.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only a verified school admin can manage credentials.' });
    }
  }

  const schoolRef = db.collection('tenant_data').doc(schoolId);
  const privateCredRef = schoolRef.collection('private').doc('credentials');

  try {
    if (action === 'set-admin-password') {
      const { newPassword, adminUsername } = body;
      if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 4) {
        return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
      }

      const passwordHash = bcrypt.hashSync(newPassword.trim(), 10);

      // Execute Dual-Write Transaction
      await db.runTransaction(async (t) => {
        const rootSnap = await t.get(schoolRef);
        if (!rootSnap.exists) throw new Error('School document does not exist.');
        const rootData = rootSnap.data();
        const settings = Object.assign({}, rootData.settings || {});

        if (settings.credentialsIsolated === true) {
          delete settings.adminPassword;
        } else {
          settings.adminPassword = passwordHash;
        }
        if (adminUsername && typeof adminUsername === 'string') {
          settings.adminUsername = adminUsername.trim();
        }

        const credSnap = await t.get(privateCredRef);
        let credData = credSnap.exists ? credSnap.data() : { teachers: {} };
        credData.adminPassword = passwordHash;
        if (adminUsername && typeof adminUsername === 'string') {
          credData.adminUsername = adminUsername.trim();
        } else if (!credData.adminUsername) {
          credData.adminUsername = settings.adminUsername || 'admin';
        }

        t.update(schoolRef, { settings: settings });
        t.set(privateCredRef, credData, { merge: true });
      });

      return res.status(200).json({ success: true, message: 'Admin credentials updated successfully.' });

    } else if (action === 'set-teacher-password') {
      const { teacherId, newPassword } = body;
      if (!teacherId || typeof teacherId !== 'string') {
        return res.status(400).json({ error: 'teacherId is required.' });
      }
      if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
        return res.status(400).json({ error: 'Teacher password must be at least 6 characters long.' });
      }

      const passwordHash = bcrypt.hashSync(newPassword.trim(), 10);

      await db.runTransaction(async (t) => {
        const rootSnap = await t.get(schoolRef);
        if (!rootSnap.exists) throw new Error('School document does not exist.');
        const rootData = rootSnap.data();
        const teachers = Array.isArray(rootData.teachers) ? rootData.teachers.slice() : [];

        const teacherIdx = teachers.findIndex(tch => tch.id === teacherId);
        if (teacherIdx === -1) {
          throw new Error(`Teacher with id ${teacherId} not found.`);
        }

        const targetTeacher = Object.assign({}, teachers[teacherIdx]);
        if (rootData.settings && rootData.settings.credentialsIsolated === true) {
          delete targetTeacher.password;
        } else {
          targetTeacher.password = passwordHash;
        }
        teachers[teacherIdx] = targetTeacher;

        const credSnap = await t.get(privateCredRef);
        let credData = credSnap.exists ? credSnap.data() : { teachers: {} };
        if (!credData.teachers) credData.teachers = {};

        const usernameVal = (targetTeacher.email || targetTeacher.username || teacherId).trim().toLowerCase();
        credData.teachers[teacherId] = {
          username: usernameVal,
          email: (targetTeacher.email || '').trim().toLowerCase(),
          passwordHash: passwordHash
        };

        t.update(schoolRef, { teachers: teachers });
        t.set(privateCredRef, credData, { merge: true });
      });

      return res.status(200).json({ success: true, message: 'Teacher password updated successfully.' });

    } else if (action === 'add-teacher') {
      const { teacherData, rawPassword } = body;
      if (!teacherData || typeof teacherData !== 'object') {
        return res.status(400).json({ error: 'teacherData object is required.' });
      }
      if (!teacherData.email || typeof teacherData.email !== 'string') {
        return res.status(400).json({ error: 'Teacher email is required.' });
      }

      const initialPassword = (rawPassword && typeof rawPassword === 'string' && rawPassword.trim().length >= 6)
        ? rawPassword.trim()
        : 'teacher123';

      const passwordHash = bcrypt.hashSync(initialPassword, 10);

      let createdTeacherId = teacherData.id;

      await db.runTransaction(async (t) => {
        const rootSnap = await t.get(schoolRef);
        if (!rootSnap.exists) throw new Error('School document does not exist.');
        const rootData = rootSnap.data();
        const teachers = Array.isArray(rootData.teachers) ? rootData.teachers.slice() : [];

        if (!createdTeacherId) {
          createdTeacherId = 'tch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        }

        // Check duplicate email
        const normalizedEmail = teacherData.email.trim().toLowerCase();
        const existing = teachers.find(tch => (tch.email || '').trim().toLowerCase() === normalizedEmail);
        if (existing) {
          throw new Error('A teacher with this email already exists.');
        }

        const newTeacherRecord = Object.assign({}, teacherData, {
          id: createdTeacherId
        });
        if (rootData.settings && rootData.settings.credentialsIsolated === true) {
          delete newTeacherRecord.password;
        } else {
          newTeacherRecord.password = passwordHash;
        }
        teachers.push(newTeacherRecord);

        const credSnap = await t.get(privateCredRef);
        let credData = credSnap.exists ? credSnap.data() : { teachers: {} };
        if (!credData.teachers) credData.teachers = {};

        credData.teachers[createdTeacherId] = {
          username: normalizedEmail,
          email: normalizedEmail,
          passwordHash: passwordHash
        };

        t.update(schoolRef, { teachers: teachers });
        t.set(privateCredRef, credData, { merge: true });
      });

      return res.status(200).json({
        success: true,
        teacherId: createdTeacherId,
        message: 'Teacher created with credentials successfully.'
      });

    } else if (action === 'delete-teacher') {
      const { teacherId } = body;
      if (!teacherId || typeof teacherId !== 'string') {
        return res.status(400).json({ error: 'teacherId is required.' });
      }

      await db.runTransaction(async (t) => {
        const rootSnap = await t.get(schoolRef);
        if (!rootSnap.exists) throw new Error('School document does not exist.');
        const rootData = rootSnap.data();
        const teachers = Array.isArray(rootData.teachers) ? rootData.teachers.slice() : [];
        const trash = Array.isArray(rootData.trash) ? rootData.trash.slice() : [];

        const teacherIdx = teachers.findIndex(tch => tch.id === teacherId);
        if (teacherIdx === -1) {
          throw new Error(`Teacher with id ${teacherId} not found.`);
        }

        const targetTeacher = teachers[teacherIdx];
        teachers.splice(teacherIdx, 1);

        // Prepare clean teacher data for root trash: NO password or passwordHash
        const teacherForTrash = Object.assign({}, targetTeacher);
        delete teacherForTrash.password;
        delete teacherForTrash.passwordHash;

        const trashItem = {
          id: teacherId,
          type: 'teacher',
          name: ((targetTeacher.firstName || '') + ' ' + (targetTeacher.lastName || '')).trim() || targetTeacher.name || targetTeacher.email || teacherId,
          details: targetTeacher.subject || '',
          deletedAt: new Date().toISOString(),
          data: teacherForTrash
        };

        const existingTrashIdx = trash.findIndex(item => item.id === teacherId && item.type === 'teacher');
        if (existingTrashIdx !== -1) {
          trash[existingTrashIdx] = trashItem;
        } else {
          trash.push(trashItem);
        }

        // Manage private/credentials: move hash from credData.teachers to credData.deletedTeachers
        const credSnap = await t.get(privateCredRef);
        let credData = credSnap.exists ? credSnap.data() : { teachers: {} };
        if (!credData.teachers) credData.teachers = {};
        if (!credData.deletedTeachers) credData.deletedTeachers = {};

        if (credData.teachers[teacherId]) {
          credData.deletedTeachers[teacherId] = Object.assign({}, credData.teachers[teacherId]);
          delete credData.teachers[teacherId];
        } else if (targetTeacher.password) {
          credData.deletedTeachers[teacherId] = {
            username: (targetTeacher.email || targetTeacher.username || teacherId).trim().toLowerCase(),
            email: (targetTeacher.email || '').trim().toLowerCase(),
            passwordHash: targetTeacher.password
          };
        }

        t.update(schoolRef, { teachers: teachers, trash: trash });
        t.set(privateCredRef, credData, { merge: true });
      });

      return res.status(200).json({
        success: true,
        message: 'Teacher deleted and moved to trash.'
      });

    } else if (action === 'restore-teacher') {
      const { teacherId } = body;
      if (!teacherId || typeof teacherId !== 'string') {
        return res.status(400).json({ error: 'teacherId is required.' });
      }

      await db.runTransaction(async (t) => {
        const rootSnap = await t.get(schoolRef);
        if (!rootSnap.exists) throw new Error('School document does not exist.');
        const rootData = rootSnap.data();
        const teachers = Array.isArray(rootData.teachers) ? rootData.teachers.slice() : [];
        const trash = Array.isArray(rootData.trash) ? rootData.trash.slice() : [];

        // Check if teacher is in trash
        const trashIdx = trash.findIndex(item => item.id === teacherId && item.type === 'teacher');
        let restoredTeacherData = null;
        if (trashIdx !== -1) {
          restoredTeacherData = trash[trashIdx].data || {};
          trash.splice(trashIdx, 1);
        }

        // Manage private/credentials: restore from deletedTeachers
        const credSnap = await t.get(privateCredRef);
        let credData = credSnap.exists ? credSnap.data() : { teachers: {} };
        if (!credData.teachers) credData.teachers = {};
        if (!credData.deletedTeachers) credData.deletedTeachers = {};

        let passwordHash = null;
        if (credData.deletedTeachers[teacherId]) {
          credData.teachers[teacherId] = Object.assign({}, credData.deletedTeachers[teacherId]);
          passwordHash = credData.deletedTeachers[teacherId].passwordHash;
          delete credData.deletedTeachers[teacherId];
        }

        if (!restoredTeacherData) {
          const existingInTeachers = teachers.find(tch => tch.id === teacherId);
          if (existingInTeachers) {
            return;
          }
          restoredTeacherData = {
            id: teacherId,
            email: credData.teachers[teacherId] ? credData.teachers[teacherId].email : '',
            status: 'Active'
          };
        }

        // Phase 1b: If isolated, root teacher stays hash-free; otherwise dual-write for legacy
        const finalTeacherRecord = Object.assign({}, restoredTeacherData, {
          id: teacherId
        });
        if (rootData.settings && rootData.settings.credentialsIsolated === true) {
          delete finalTeacherRecord.password;
        } else {
          finalTeacherRecord.password = passwordHash || restoredTeacherData.password || 'PROTECTED';
        }

        const existingIdx = teachers.findIndex(tch => tch.id === teacherId);
        if (existingIdx !== -1) {
          teachers[existingIdx] = finalTeacherRecord;
        } else {
          teachers.push(finalTeacherRecord);
        }

        t.update(schoolRef, { teachers: teachers, trash: trash });
        t.set(privateCredRef, credData, { merge: true });
      });

      return res.status(200).json({
        success: true,
        message: 'Teacher restored successfully with original credentials.'
      });

    } else {
      return res.status(400).json({ error: `Unsupported action: ${action}` });
    }
  } catch (actionErr) {
    console.error(`[manage-credentials] Error executing action ${action}:`, actionErr);
    return res.status(500).json({ error: actionErr.message || 'Credential update failed.' });
  }
};
