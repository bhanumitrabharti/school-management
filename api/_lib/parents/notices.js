'use strict';

/**
 * api/_lib/parents/notices.js
 * 
 * Handles action: 'notices'
 * Returns published notices targeted to everyone or parents, capped at max 50, newest first.
 */

const { authenticateParentRequest } = require('./auth');
const { getDb } = require('../firebase-admin');

async function handleNotices(req, res) {
  const authRes = await authenticateParentRequest(req, res, 'notices');
  if (!authRes.authorized) return;

  const { student, schoolId } = authRes;
  const db = getDb();

  const studentClass = String(student.class || '').toLowerCase().trim();
  let rawNotices = [];

  // 1. Fetch from Subcollection: tenant_data/{schoolId}/notices
  try {
    const subcolRef = db.collection('tenant_data').doc(schoolId).collection('notices');
    const snap = await subcolRef.get();
    if (!snap.empty) {
      snap.forEach(doc => {
        rawNotices.push(doc.data());
      });
    }
  } catch (err) {
    console.warn('[api/parents/notices] Error fetching notices subcollection:', err.message);
  }



  // 2. Filter for Published Status and Parent Audience Target
  const visibleNotices = rawNotices.filter(notice => {
    if (!notice) return false;
    const st = String(notice.status || 'published').toLowerCase().trim();
    if (st === 'draft' || st === 'archived' || st !== 'published') return false;

    let aud = notice.audience || ['everyone'];
    if (!Array.isArray(aud)) aud = [aud];
    const audNorm = aud.map(a => String(a || '').toLowerCase().trim());

    // Allowed targets: everyone, parents, all
    if (audNorm.includes('everyone') || audNorm.includes('parents') || audNorm.includes('all')) {
      return true;
    }

    // Class-specific targeting if present
    if (studentClass && audNorm.includes(studentClass)) {
      return true;
    }

    return false;
  });

  // 4. Sort newest first (descending date)
  visibleNotices.sort((a, b) => {
    const da = a.date || a.createdAt || '';
    const dbDate = b.date || b.createdAt || '';
    return dbDate.localeCompare(da);
  });

  // 5. Cap at 50 notices and sanitize fields
  const capped = visibleNotices.slice(0, 50).map(n => ({
    id: n.id || '',
    title: n.title || 'Announcement',
    message: n.message || '',
    date: n.date || '',
    priority: n.priority || 'Normal',
    audience: Array.isArray(n.audience) ? n.audience : [n.audience || 'everyone']
  }));

  return res.status(200).json({
    success: true,
    count: capped.length,
    notices: capped
  });
}

module.exports = { handleNotices };
