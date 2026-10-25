'use strict';

/**
 * Validation & Cryptographic Helpers for Onboarding (CommonJS)
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// C3: Hostname special cases and reserved keywords
const RESERVED_SUBDOMAINS = new Set([
  // Hostname special cases in js/app.js
  'shishu-vikash-mandir',
  'svm',
  'www',
  'localhost',
  'ctrlshifts',
  // Standard infrastructure & service names
  'admin',
  'api',
  'app',
  'apps',
  'assets',
  'auth',
  'billing',
  'cdn',
  'chat',
  'dashboard',
  'dev',
  'developer',
  'docs',
  'erp',
  'help',
  'login',
  'mail',
  'manage',
  'meta',
  'notification',
  'notifications',
  'onboarding',
  'payment',
  'payments',
  'portal',
  'privacy',
  'prod',
  'register',
  'registration',
  'root',
  'school',
  'schools',
  'secure',
  'security',
  'service',
  'services',
  'signin',
  'signup',
  'staging',
  'static',
  'status',
  'superadmin',
  'super-admin',
  'support',
  'terms',
  'test',
  'webhook',
  'webhooks'
]);

/**
 * D2: Suggests admin username from school name
 * E.g. "Greenwood Public School" -> "gpsadmin" (initials + "admin")
 * Fallback to first word + "admin" if initials < 2 letters.
 */
function suggestAdminUsername(schoolName) {
  if (!schoolName || typeof schoolName !== 'string') return 'admin';
  const clean = schoolName.trim().replace(/[^a-zA-Z0-9\s]/g, '');
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'admin';

  let initials = '';
  for (const w of words) {
    initials += w[0].toLowerCase();
  }

  let base = '';
  if (initials.length >= 2) {
    base = initials;
  } else {
    base = words[0].toLowerCase();
  }

  let username = (base + 'admin').toLowerCase().replace(/[^a-z0-9._]/g, '');
  if (username.length < 4) username = 'admin';
  if (username.length > 30) username = username.substring(0, 30);
  return username;
}

/**
 * D2: Validates admin username (4-30 chars, lowercase, digits, . and _)
 */
function validateAdminUsername(username) {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Admin username is required.' };
  }
  const trimmed = username.trim().toLowerCase();
  if (trimmed.length < 4 || trimmed.length > 30) {
    return { valid: false, error: 'Username must be between 4 and 30 characters.' };
  }
  if (!/^[a-z0-9._]+$/.test(trimmed)) {
    return { valid: false, error: 'Username can only contain lowercase letters, numbers, dots, and underscores.' };
  }
  return { valid: true, username: trimmed };
}

/**
 * C3: Validates subdomain
 * Rules:
 *  - 3–30 characters
 *  - Lowercase alphanumeric and hyphens
 *  - No leading or trailing hyphen
 *  - No '--' at positions 3–4 (punycode xn-- collision)
 *  - Not in reserved list
 *  - Not in existing subdomains
 */
function validateSubdomain(subdomain, existingSubdomains = new Set()) {
  if (!subdomain || typeof subdomain !== 'string') {
    return { valid: false, error: 'Subdomain is required.' };
  }
  const sub = subdomain.trim().toLowerCase();

  if (sub.length < 3 || sub.length > 30) {
    return { valid: false, error: 'Subdomain must be between 3 and 30 characters.' };
  }

  if (!/^[a-z0-9-]+$/.test(sub)) {
    return { valid: false, error: 'Subdomain can only contain lowercase letters, numbers, and hyphens.' };
  }

  if (sub.startsWith('-') || sub.endsWith('-')) {
    return { valid: false, error: 'Subdomain cannot start or end with a hyphen.' };
  }

  // Punycode reservation guard: -- at index 2 and 3
  if (sub.length >= 4 && sub[2] === '-' && sub[3] === '-') {
    return { valid: false, error: 'Subdomain cannot contain double hyphens at positions 3 and 4.' };
  }

  if (RESERVED_SUBDOMAINS.has(sub)) {
    return { valid: false, error: `The subdomain "${sub}" is reserved and cannot be used.` };
  }

  if (existingSubdomains && (existingSubdomains.has(sub) || (existingSubdomains instanceof Set ? existingSubdomains.has(sub) : existingSubdomains.includes(sub)))) {
    return { valid: false, error: `The subdomain "${sub}.ctrlshifts.in" is already taken. Please choose another.` };
  }

  return { valid: true, subdomain: sub };
}

/**
 * D5: Generates a 6-digit OTP using crypto RNG
 */
function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * D5: Hashes OTP for secure storage
 */
function hashOtp(otp, salt = 'paathshala_otp_salt_v1') {
  return crypto.createHmac('sha256', salt).update(String(otp)).digest('hex');
}

/**
 * C1: Bcrypt hash password for credentials
 */
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

/**
 * C6: Hashes client IP with salt (zero raw IP persistence)
 */
function hashIp(ip, salt = process.env.IP_HASH_SALT || 'paathshala_ip_salt_2026') {
  const cleanIp = (ip || '').replace(/^.*:/, '').trim();
  return crypto.createHmac('sha256', salt).update(cleanIp).digest('hex');
}

/**
 * Masks email for display (e.g. "a***k@gmail.com")
 */
function maskEmail(email) {
  if (!email || !email.includes('@')) return '***@***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Normalizes school name for comparison
 */
function normalizeSchoolName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  RESERVED_SUBDOMAINS,
  suggestAdminUsername,
  validateAdminUsername,
  validateSubdomain,
  generateOtp,
  hashOtp,
  hashPassword,
  hashIp,
  maskEmail,
  normalizeSchoolName
};
