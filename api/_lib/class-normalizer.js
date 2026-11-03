'use strict';

/**
 * api/_lib/class-normalizer.js
 * 
 * Shared helper for normalizing class and section identifiers across
 * serverless endpoints, matching the logic in js/attendance.js:52-65.
 */

function normalizeClassName(cls) {
  if (!cls) return '';
  return cls.toString()
    .replace(/^class\s+/i, '')
    .trim()
    .toLowerCase();
}

function normalizeSectionName(sec) {
  if (!sec) return '';
  return sec.toString()
    .trim()
    .toLowerCase();
}

module.exports = {
  normalizeClassName,
  normalizeSectionName
};
