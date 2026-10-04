/**
 * POST /api/notify-lead
 * Sends a new lead notification via Telegram Bot.
 * Public endpoint — no auth required (called from the landing page contact form).
 *
 * SECURITY (SEC-14):
 *   - CORS restricted to ALLOWED_ORIGIN env var (default: https://www.ctrlshifts.in).
 *     Wildcard removed to prevent cross-origin abuse.
 */

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  console.log("Token exists:", !!TOKEN);
  console.log("Chat ID:", CHAT_ID);

  if (!TOKEN || !CHAT_ID) {
    console.error("Missing Telegram env vars");
    return res.status(500).json({ error: "Telegram not configured" });
  }

  // Parse body safely
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!body) {
    return res.status(400).json({ error: 'Request body is empty' });
  }

  const message = `🔔 *NEW LEAD — Paathshala*

🏫 School: ${body.schoolName || 'N/A'}
👤 Name: ${body.ownerName || 'N/A'}
📞 Phone: ${body.phone || 'N/A'}
🏙️ City: ${body.city || 'N/A'}
📋 Board: ${body.board || 'N/A'}
👥 Students: ${body.studentCount || 'N/A'}
🕐 Best Time: ${body.bestTimeToCall || 'N/A'}
📱 Current: ${body.currentMethod || 'N/A'}
💬 Message: ${body.message || 'None'}

⚡ Respond within 2 hours!`;

  try {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "Markdown"
      })
    });

    const responseText = await response.text();
    console.log("Telegram API response raw:", responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`Invalid JSON response from Telegram: ${responseText}`);
    }

    console.log("Telegram response:", JSON.stringify(data));

    if (!data.ok) {
      console.error("Telegram API error:", data.description);
      return res.status(400).json({
        error: data.description
      });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Telegram fetch error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
