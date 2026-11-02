'use strict';

/**
 * /api/registration
 * Consolidated action router for self-service school onboarding endpoints:
 * - action=start -> api/_lib/registration/start.js
 * - action=verify-otp -> api/_lib/registration/verifyOtp.js
 * - action=subdomain -> api/_lib/registration/subdomain.js
 *
 * Keeps legacy URLs (/api/registration-start, /api/registration-verify-otp, /api/subdomain-check)
 * working with zero changes via vercel.json rewrites.
 */

const startHandler = require('./_lib/registration/start');
const verifyOtpHandler = require('./_lib/registration/verifyOtp');
const subdomainHandler = require('./_lib/registration/subdomain');

function applyCors(req, res) {
  const allowed = [
    'https://www.ctrlshifts.in',
    'https://ctrlshifts.in',
    'http://localhost:3000',
    'http://localhost:3106'
  ];
  const origin = req.headers && req.headers.origin;
  if (origin && (allowed.includes(origin) || origin.endsWith('.ctrlshifts.in') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function parseQuery(req) {
  if (req.query && typeof req.query === 'object' && Object.keys(req.query).length > 0) {
    return req.query;
  }
  const url = req.url || '';
  if (url.includes('?')) {
    const qs = url.split('?')[1];
    const params = new URLSearchParams(qs);
    const result = {};
    for (const [key, value] of params.entries()) {
      result[key] = value;
    }
    return result;
  }
  return {};
}

module.exports = async function handler(req, res) {
  // Ensure req.query is populated if not provided by runtime
  if (!req.query) {
    req.query = parseQuery(req);
  } else {
    // If req.query exists but might be missing query params from req.url
    const fromUrl = parseQuery(req);
    req.query = Object.assign({}, fromUrl, req.query);
  }

  // Parse body if it's a string
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch (_) {}
  }

  const url = req.url || '';
  let action = (req.query && req.query.action) || (req.body && req.body.action) || '';

  // URL fallback detection if action not explicitly passed
  if (!action) {
    if (url.includes('registration-start') || url.includes('action=start')) action = 'start';
    else if (url.includes('registration-verify-otp') || url.includes('action=verify-otp')) action = 'verify-otp';
    else if (url.includes('subdomain-check') || url.includes('action=subdomain')) action = 'subdomain';
  }

  action = String(action).toLowerCase().trim();

  if (action === 'start') {
    return startHandler(req, res);
  }
  if (action === 'verify-otp' || action === 'verifyotp' || action === 'verify') {
    return verifyOtpHandler(req, res);
  }
  if (action === 'subdomain' || action === 'subdomain-check') {
    return subdomainHandler(req, res);
  }

  // Handle OPTIONS for unknown action
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    return res.status ? res.status(200).end() : (res.statusCode = 200, res.end());
  }

  const errPayload = {
    error: 'Invalid or missing action. Valid actions: start, verify-otp, subdomain.'
  };

  if (typeof res.status === 'function') {
    return res.status(400).json(errPayload);
  }
  res.statusCode = 400;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(errPayload));
};
