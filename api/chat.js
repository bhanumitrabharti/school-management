'use strict';

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
    // Safe Body Parsing
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body) {
      return res.status(400).json({ error: 'Request body is empty' });
    }

    const { message, history } = body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const systemPrompt = "You are a friendly, highly empathetic human-like support assistant for the Shishu Vikash Mandir ERP. Always reply in the user's natural language (Hindi, English, or Hinglish). Use emojis to make the user feel positive. Keep answers concise and helpful.";

    let contents = [];
    if (history && Array.isArray(history)) {
      history.forEach((msg, index) => {
        let text = msg.content;
        if (index === history.length - 1 && msg.role === 'user') {
          text = `${systemPrompt}\n\n${text}`;
        }
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: text }]
        });
      });
    } else {
      contents.push({
        role: 'user',
        parts: [{ text: `${systemPrompt}\n\n${message}` }]
      });
    }

    // API Key Validation
    if (!process.env.GEMINI_API_KEY) {
      console.error("MISSING API KEY");
      return res.status(500).json({ error: "API Key is missing in Vercel environment." });
    }

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ contents })
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      throw new Error('Unexpected Gemini API response format');
    }

    const reply = data.candidates[0].content.parts[0].text;
    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Gemini Fetch Error:", error.message, error.stack);
    return res.status(500).json({ error: error.message || "Internal Server Error", stack: error.stack });
  }
};
