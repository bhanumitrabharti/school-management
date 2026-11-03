'use strict';

const admin = require('firebase-admin');
const { getDb } = require('../firebase-admin');

/**
 * api/_lib/parents/restructured-helper.js
 * 
 * Shared helper for resolving whether a school tenant uses restructured storage (v2).
 * 
 * Behavior:
 * - If portalConfig and portalConfig.restructured is explicitly a boolean, returns that value immediately.
 * - If portalConfig.restructured === undefined (UNKNOWN, e.g. portal/config docs written by v78),
 *   resolves it using a field-masked projection read of the root doc
 *   ('settings.restructured', 'settings.storageVersion').
 * - Treats settings.storageVersion === 2 or settings.restructured === true as restructured.
 */
async function resolveIsRestructured(schoolId, portalConfig, dbOverride) {
  if (portalConfig && typeof portalConfig.restructured === 'boolean') {
    return portalConfig.restructured;
  }

  const db = dbOverride || getDb();
  try {
    const querySnap = await db.collection('tenant_data')
      .where(admin.firestore.FieldPath.documentId(), '==', schoolId)
      .select('settings.restructured', 'settings.storageVersion')
      .get();

    if (!querySnap.empty) {
      const data = querySnap.docs[0].data() || {};
      const s = data.settings || {};
      return s.restructured === true || s.storageVersion === 2;
    }

    const docSnap = await db.collection('tenant_data').doc(schoolId).get();
    if (docSnap.exists) {
      const s = docSnap.data()?.settings || {};
      return s.restructured === true || s.storageVersion === 2;
    }
  } catch (err) {
    console.warn('[resolveIsRestructured] Error resolving restructuring flag for', schoolId, err.message);
  }

  return false;
}

module.exports = {
  resolveIsRestructured
};
