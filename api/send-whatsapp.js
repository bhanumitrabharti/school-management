'use strict';

/**
 * Steps to get permanent System User token:
 * 1. business.facebook.com → Settings → System Users
 * 2. Create System User → Add Assets → WhatsApp account
 * 3. Generate Token → never expires
 * 4. Update WHATSAPP_ACCESS_TOKEN in Vercel env vars
 */

module.exports = async function(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
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
