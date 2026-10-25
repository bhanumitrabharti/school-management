'use strict';

/**
 * GET / POST /api/subdomain-check (CommonJS)
 * Checks if a requested subdomain is available for registration,
 * OR generates up to 4 smart available subdomain suggestions when ?suggest=<schoolName> is provided.
 */
const { validateSubdomain, generateSubdomainCandidates } = require('./_lib/validation');
const { getDb } = require('./_lib/firebase-admin');

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

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Mode E: Smart Subdomain Suggestions
  const suggestSchoolName = req.method === 'GET'
    ? req.query.suggest
    : (req.body && req.body.suggest);
  const cityParam = req.method === 'GET'
    ? req.query.city
    : (req.body && req.body.city);

  if (suggestSchoolName) {
    const rawCandidates = generateSubdomainCandidates(String(suggestSchoolName), String(cityParam || ''));
    if (rawCandidates.length === 0) {
      return res.status(200).json({ success: true, suggestions: [] });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const availableSuggestions = [];

    for (const cand of rawCandidates) {
      if (availableSuggestions.length >= 4) break;
      try {
        // 1. Check existing schools in Firestore
        const schoolSnap = await db.collection('schools')
          .where('subdomain', '==', cand)
          .limit(1)
          .get();
        if (!schoolSnap.empty) continue;

        // 2. Check active reservations in subdomain_reservations
        const resDoc = await db.collection('subdomain_reservations').doc(cand).get();
        if (resDoc.exists) {
          const rData = resDoc.data();
          const isExpired = rData.expiresAt && rData.expiresAt < now;
          if (!isExpired && rData.status !== 'released') {
            continue;
          }
        }

        availableSuggestions.push(cand);
      } catch (err) {
        console.warn(`[subdomain-check] Candidate "${cand}" availability check error:`, err.message);
      }
    }

    return res.status(200).json({
      success: true,
      suggestions: availableSuggestions
    });
  }

  // Standard Mode: Single Subdomain Availability Check
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
};
