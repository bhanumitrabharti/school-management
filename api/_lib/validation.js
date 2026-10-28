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

// Generic school keywords dropped during candidate subdomain & username generation
const GENERIC_SCHOOL_WORDS = new Set([
  'the', 'a', 'an', 'and', 'of', 'for', 'in', 'at',
  'public', 'private', 'pvt',
  'school', 'schools',
  'academy', 'academies',
  'vidyalaya', 'vidyalayas',
  'vidya', 'mandir', 'mandirs',
  'high', 'higher',
  'senior', 'secondary', 'sr', 'sec',
  'english', 'hindi', 'medium',
  'convent',
  'international', 'intl',
  'global',
  'model',
  'residential',
  'co-ed', 'coed', 'boys', 'girls',
  'inter', 'college', 'colleges',
  'institution', 'institute', 'institutes',
  'grammar', 'prep', 'preparatory', 'matriculation',
  'national', 'central'
]);

// 36 Valid Indian States and Union Territories
const VALID_INDIAN_STATES = new Set([
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal'
]);

// Safe text pattern: letters (including Hindi & Unicode), numbers, spaces, and . , & ' ( ) - /
const SAFE_TEXT_PATTERN = /^[\p{L}\p{M}\p{N}\s.,&'()/-]+$/u;
// Explicitly prohibited dangerous injection characters: <, >, ", `, backslash, and control characters
const PROHIBITED_CHARS_PATTERN = /[<>"\\`\x00-\x1F\x7F]/;

/**
 * Validates school name (2-100 characters, letters, digits, spaces, . , & ' ( ) - /)
 */
function validateSchoolName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'School name is required.' };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 100) {
    return { valid: false, error: 'School name must be between 2 and 100 characters.' };
  }
  if (PROHIBITED_CHARS_PATTERN.test(trimmed) || !SAFE_TEXT_PATTERN.test(trimmed)) {
    return { valid: false, error: 'School name contains invalid characters. Only letters, numbers, spaces, and . , & \' ( ) - / are allowed.' };
  }
  return { valid: true, name: trimmed };
}

/**
 * Validates administrator full name (2-80 characters, safe text)
 */
function validatePersonName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Administrator full name is required.' };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) {
    return { valid: false, error: 'Administrator name must be between 2 and 80 characters.' };
  }
  if (PROHIBITED_CHARS_PATTERN.test(trimmed) || !SAFE_TEXT_PATTERN.test(trimmed)) {
    return { valid: false, error: 'Administrator name contains invalid characters. Only letters, spaces, and standard punctuation are allowed.' };
  }
  return { valid: true, name: trimmed };
}

/**
 * Validates city / town (2-50 characters, safe text)
 */
function validateCity(city) {
  if (!city || typeof city !== 'string') {
    return { valid: false, error: 'City is required.' };
  }
  const trimmed = city.trim();
  if (trimmed.length < 2 || trimmed.length > 50) {
    return { valid: false, error: 'City must be between 2 and 50 characters.' };
  }
  if (PROHIBITED_CHARS_PATTERN.test(trimmed) || !SAFE_TEXT_PATTERN.test(trimmed)) {
    return { valid: false, error: 'City contains invalid characters.' };
  }
  return { valid: true, city: trimmed };
}

/**
 * Validates state against the 36 valid Indian States / UTs
 */
function validateState(state) {
  if (!state || typeof state !== 'string') {
    return { valid: false, error: 'State is required.' };
  }
  const trimmed = state.trim();
  if (!trimmed) {
    return { valid: false, error: 'State is required.' };
  }
  if (!VALID_INDIAN_STATES.has(trimmed)) {
    return { valid: false, error: 'Please select a valid Indian State or Union Territory.' };
  }
  return { valid: true, state: trimmed };
}

/**
 * Validates admin email (strict format, no injection chars, 5-100 chars)
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'A valid admin email is required.' };
  }
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length < 5 || trimmed.length > 100) {
    return { valid: false, error: 'A valid admin email is required.' };
  }
  if (PROHIBITED_CHARS_PATTERN.test(trimmed) || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
    return { valid: false, error: 'A valid admin email is required.' };
  }
  return { valid: true, email: trimmed };
}

/**
 * Validates admin mobile phone (strict 10-digit format)
 */
function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'A valid 10-digit mobile number is required.' };
  }
  const digits = phone.replace(/\D/g, '').trim();
  if (!/^[0-9]{10}$/.test(digits)) {
    return { valid: false, error: 'A valid 10-digit mobile number is required.' };
  }
  return { valid: true, phone: digits };
}

/**
 * Generates smart subdomain candidates from school name and city
 * Returns an ordered array of valid candidate slugs.
 */
function generateSubdomainCandidates(schoolName, city = '') {
  if (!schoolName || typeof schoolName !== 'string') return [];

  // 1. Normalise the name: lowercase, convert apostrophe-s and punctuation to spaces
  const cleanName = schoolName
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const allWords = cleanName.split(/[\s-]+/).filter(Boolean);
  if (allWords.length === 0) return [];

  // Clean city
  const cleanCity = (city || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)[0] || '';

  // 2. Drop generic words to isolate distinctive words
  const distinctiveWords = allWords.filter(w => !GENERIC_SCHOOL_WORDS.has(w));
  const primaryWords = distinctiveWords.length > 0 ? distinctiveWords : allWords;

  const mainDistinctiveWord = primaryWords[0];
  const combinedDistinctiveWord = primaryWords.slice(0, 2).join('');
  const hyphenatedDistinctiveWord = primaryWords.slice(0, 2).join('-');

  // Initials of all words in the school name
  let allInitials = '';
  for (const w of allWords) {
    if (w.length > 0) allInitials += w[0];
  }

  // Initials of words after the main distinctive word
  let remainingInitials = '';
  const remainingWords = allWords.filter(w => w !== mainDistinctiveWord);
  for (const w of remainingWords) {
    if (w.length > 0) remainingInitials += w[0];
  }

  const rawCandidates = [];

  // Candidate A: Distinctive word (e.g. "greenwood")
  if (mainDistinctiveWord.length >= 3) {
    rawCandidates.push(mainDistinctiveWord);
  }
  // If multiple distinctive words (e.g. "shishu vikash", "st xavier"), offer joined & hyphenated
  if (primaryWords.length >= 2) {
    rawCandidates.push(hyphenatedDistinctiveWord);
    rawCandidates.push(combinedDistinctiveWord);
  }

  // Candidate B: Distinctive word + initials of remaining words (e.g. "greenwoodps")
  if (mainDistinctiveWord.length >= 2 && remainingInitials.length >= 1) {
    rawCandidates.push(`${mainDistinctiveWord}${remainingInitials}`);
  }

  // Candidate C: First two words joined with a hyphen (e.g. "greenwood-public")
  if (allWords.length >= 2) {
    rawCandidates.push(`${allWords[0]}-${allWords[1]}`);
  }

  // Candidate D: Initials if 3+ letters (e.g. "gps")
  if (allInitials.length >= 3) {
    rawCandidates.push(allInitials);
  }

  // Candidate E: Distinctive word + city (e.g. "greenwood-bokaro")
  if (cleanCity && mainDistinctiveWord.length >= 2) {
    rawCandidates.push(`${mainDistinctiveWord}-${cleanCity}`);
    if (primaryWords.length >= 2) {
      rawCandidates.push(`${hyphenatedDistinctiveWord}-${cleanCity}`);
    }
  }

  // Candidate F: Initials + city (e.g. "gps-bokaro")
  if (cleanCity && allInitials.length >= 2) {
    rawCandidates.push(`${allInitials}-${cleanCity}`);
  }

  // 3. Deduplicate and validate against syntax rules
  const validated = [];
  const seen = new Set();

  for (const cand of rawCandidates) {
    const slug = cand
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);

    if (slug.length >= 3 && !seen.has(slug)) {
      seen.add(slug);
      const val = validateSubdomain(slug);
      if (val.valid) {
        validated.push(slug);
      }
    }
  }

  return validated;
}

/**
 * F: Suggests admin username candidates from school name
 * Base: distinctive word + "admin" (e.g. greenwoodadmin)
 * Alternatives: greenwoodps, greenwoodoffice, etc.
 */
function suggestAdminUsernameCandidates(schoolName) {
  if (!schoolName || typeof schoolName !== 'string') {
    return ['admin', 'schooladmin', 'officeadmin'];
  }

  const clean = schoolName
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['admin', 'schooladmin', 'officeadmin'];

  const distinctive = words.filter(w => !GENERIC_SCHOOL_WORDS.has(w));
  const primaryWords = distinctive.length > 0 ? distinctive : words;
  const base = primaryWords[0].replace(/[^a-z0-9]/g, '');

  let remainingInitials = '';
  const remaining = words.filter(w => w !== primaryWords[0]);
  for (const w of remaining) {
    if (w.length > 0) remainingInitials += w[0];
  }

  let allInitials = '';
  for (const w of words) {
    if (w.length > 0) allInitials += w[0];
  }

  const candidates = [];

  // 1. Base: distinctive + "admin" (e.g. greenwoodadmin)
  if (base.length >= 2) {
    candidates.push((base + 'admin').substring(0, 30));
  }

  // 2. Distinctive + initials of remaining words (e.g. greenwoodps)
  if (base.length >= 2 && remainingInitials.length >= 1) {
    candidates.push((base + remainingInitials).substring(0, 30));
  }

  // 3. Distinctive + "office" (e.g. greenwoodoffice)
  if (base.length >= 2) {
    candidates.push((base + 'office').substring(0, 30));
  }

  // 4. Initials + "admin" (e.g. gpsadmin, svmadmin)
  if (allInitials.length >= 2) {
    candidates.push((allInitials + 'admin').substring(0, 30));
  }

  const valid = [];
  const seen = new Set();
  for (const c of candidates) {
    const val = validateAdminUsername(c);
    if (val.valid && !seen.has(val.username)) {
      seen.add(val.username);
      valid.push(val.username);
    }
  }

  if (valid.length === 0) {
    valid.push('admin');
  }

  return valid;
}

/**
 * D2: Suggests primary admin username from school name
 */
function suggestAdminUsername(schoolName) {
  const candidates = suggestAdminUsernameCandidates(schoolName);
  return candidates[0] || 'admin';
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
  GENERIC_SCHOOL_WORDS,
  VALID_INDIAN_STATES,
  generateSubdomainCandidates,
  suggestAdminUsernameCandidates,
  suggestAdminUsername,
  validateAdminUsername,
  validateSubdomain,
  validateSchoolName,
  validatePersonName,
  validateCity,
  validateState,
  validateEmail,
  validatePhone,
  generateOtp,
  hashOtp,
  hashPassword,
  hashIp,
  maskEmail,
  normalizeSchoolName
};
