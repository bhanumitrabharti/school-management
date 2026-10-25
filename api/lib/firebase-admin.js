/**
 * Firebase Admin Initialization Helper
 */
import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getFirebaseAdmin() {
  if (!admin.apps.length) {
    let credential = null;
    let projectId = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        credential = admin.credential.cert(sa);
        projectId = sa.project_id;
      } catch (e) {
        console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e);
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

export function getDb() {
  const adm = getFirebaseAdmin();
  return adm.firestore();
}
