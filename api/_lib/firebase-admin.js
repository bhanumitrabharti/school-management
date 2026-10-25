'use strict';

/**
 * Firebase Admin Initialization Helper (CommonJS)
 */
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

function getFirebaseAdmin() {
  if (!admin.apps.length) {
    let credential = null;
    let projectId = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        credential = admin.credential.cert(sa);
        projectId = sa.project_id;
      } catch (e) {
        console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e.message);
      }
    }

    if (!credential) {
      const candidates = [
        path.resolve(__dirname, '../../service-account-key.json'),
        path.resolve(process.cwd(), 'service-account-key.json'),
        'C:/Users/bhanu/.gemini/antigravity/scratch/school-management-onboarding/service-account-key.json',
        'C:/Users/bhanu/.gemini/antigravity/scratch/school-management/service-account-key.json'
      ];

      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          try {
            const sa = JSON.parse(fs.readFileSync(cand, 'utf8'));
            credential = admin.credential.cert(sa);
            projectId = sa.project_id;
            break;
          } catch (err) {
            console.warn(`Error reading service account from ${cand}:`, err.message);
          }
        }
      }
    }

    if (credential) {
      admin.initializeApp({
        credential,
        projectId: projectId || 'ctrl-shift-solutions'
      });
    } else {
      admin.initializeApp();
    }
  }
  return admin;
}

function getDb() {
  const adm = getFirebaseAdmin();
  return adm.firestore();
}

module.exports = {
  getFirebaseAdmin,
  getDb
};
