'use strict';

/**
 * POST /api/send-whatsapp
 * Sends a WhatsApp fee receipt via Meta Cloud API.
 *
 * SECURITY (SEC-05 + SEC-14):
 *   - Requires a valid Firebase ID token in the Authorization header.
 *     Frontend must call: fetch('/api/send-whatsapp', { headers: { 'Authorization': 'Bearer ' + idToken } ... })
 *     Get idToken via: firebase.auth().currentUser.getIdToken()
 *   - CORS restricted to ALLOWED_ORIGIN env var (default: https://www.ctrlshifts.in).
 *     Set ALLOWED_ORIGIN in Vercel project settings.
 *   - Requires FIREBASE_SERVICE_ACCOUNT env var (JSON content of service-account-key.json).
 *     Set in Vercel: Settings → Environment Variables → FIREBASE_SERVICE_ACCOUNT
 *
 * Steps to get permanent System User token:
 * 1. business.facebook.com → Settings → System Users
 * 2. Create System User → Add Assets → WhatsApp account
 * 3. Generate Token → never expires
 * 4. Update WHATSAPP_ACCESS_TOKEN in Vercel env vars
 */

const admin = require('firebase-admin');

// Lazy singleton — reused across warm serverless invocations
function getAdminAuth() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set.');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return admin.auth();
}

// CORS helper — SEC-14: no wildcard; only configured production origin allowed
function applyCors(req, res) {
  const ALLOWED = [
    process.env.ALLOWED_ORIGIN || 'https://www.ctrlshifts.in',
    'https://ctrlshifts.in'
  ];
  const origin = req.headers.origin;
  if (origin && ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

// SEC-05: Verify Firebase ID token from Authorization: Bearer <token>
async function verifyFirebaseToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice(7);
  try {
    return await getAdminAuth().verifyIdToken(idToken);
  } catch (e) {
    return null;
  }
}

module.exports = async function(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // SEC-05: Reject unauthenticated requests
  const decoded = await verifyFirebaseToken(req);
  if (!decoded) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body) {
      return res.status(400).json({ success: false, error: 'Request body is empty' });
    }

    const { type, phone, studentName, schoolName, amount, receiptNo, paymentMode } = body;
    if (!phone || !studentName || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required parameters: phone, studentName, or amount.' });
    }

    // Clean and validate phone number
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid phone number format.' });
    }
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone; // Default to India country code
    }

    // Load environment variables
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneId) {
      console.error('WhatsApp API config missing in environment.');
      return res.status(500).json({ success: false, error: 'WhatsApp credentials missing on server.' });
    }

    // Construct Hindi/English bilingual message
    const messageText =
      `Namaste! 🙏\n` +
      `Aapke bacche ${studentName} ki school fee jama ho gayi hai.\n\n` +
      `Jama ki gayi rashi (Amount): ₹${amount} via ${paymentMode || 'Cash'} ✅\n` +
      `Receipt No: ${receiptNo || '—'}\n\n` +
      `English: Dear Parent, we have received ₹${amount} via ${paymentMode || 'Cash'} for ${studentName}'s fee. Receipt No: ${receiptNo || '—'}.\n\n` +
      `Dhanyawad!\n\n` +
      `${schoolName || 'School'} 🏫`;

    // Make request to Meta WhatsApp Cloud API
    const url = `https://graph.facebook.com/v17.0/${phoneId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'text',
        text: {
          body: messageText
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Meta API response error:', data);
      return res.status(response.status).json({
        success: false,
        error: data.error?.message || 'Meta API request failed.',
        code: data.error?.code
      });
    }

    return res.status(200).json({ success: true, messageId: data.messages?.[0]?.id });
  } catch (error) {
    console.error('WhatsApp dispatch error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
};
