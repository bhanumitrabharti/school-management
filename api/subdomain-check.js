/**
 * GET / POST /api/subdomain-check
 * Checks if a requested subdomain is available for registration.
 */
import { validateSubdomain } from './lib/validation.js';
import { getDb } from './lib/firebase-admin.js';

function applyCors(req, res) {
  const allowed = [
    'https://www.ctrlshifts.in',
    'https://ctrlshifts.in',
    'http://localhost:3000',
    'http://localhost:3106'
  ];
  const origin = req.headers.origin;
  if (origin && (allowed.includes(origin) || origin.endsWith('.ctrlshifts.in') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const querySubdomain = req.method === 'GET' 
    ? req.query.subdomain 
    : (req.body && (req.body.subdomain || req.body));
  const currentRegId = req.method === 'GET' ? req.query.regId : (req.body && req.body.regId);

  if (!querySubdomain) {
    return res.status(400).json({ available: false, error: 'Subdomain parameter is required.' });
  }

  // 1. Format and Reserved Words Validation (C3)
  const validation = validateSubdomain(String(querySubdomain));
  if (!validation.valid) {
    return res.status(200).json({
      available: false,
      reason: validation.error,
      normalizedSubdomain: querySubdomain.toLowerCase().trim()
    });
  }

  const sub = validation.subdomain;
  const db = getDb();

  try {
    // 2. Check existing schools in Firestore
    const schoolSnap = await db.collection('schools')
      .where('subdomain', '==', sub)
      .limit(1)
      .get();

    if (!schoolSnap.empty) {
      return res.status(200).json({
        available: false,
        reason: `The subdomain "${sub}.ctrlshifts.in" is already taken.`,
        normalizedSubdomain: sub
      });
    }

    // 3. Check active reservations in subdomain_reservations
    const resDoc = await db.collection('subdomain_reservations').doc(sub).get();
    if (resDoc.exists) {
      const data = resDoc.data();
      const now = new Date().toISOString();
      const isExpired = data.expiresAt && data.expiresAt < now;
      const isSameReg = currentRegId && data.regId === currentRegId;

      if (!isExpired && !isSameReg && data.status !== 'released') {
        return res.status(200).json({
          available: false,
          reason: `The subdomain "${sub}.ctrlshifts.in" is currently reserved by another registration.`,
          normalizedSubdomain: sub
        });
      }
    }

    return res.status(200).json({
      available: true,
      subdomain: sub,
      fullUrl: `https://${sub}.ctrlshifts.in`
    });

  } catch (err) {
    console.error('[subdomain-check] Firestore query error:', err);
    return res.status(500).json({
      available: false,
      error: 'Failed to verify subdomain availability. Please try again.'
    });
  }
}
