'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from current directory
app.use(express.static(__dirname));

// Proxy endpoint for Gemini Chat
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
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
    res.json({ reply });
  } catch (error) {
    console.error('Chatbot proxy error:', error);
    res.status(500).json({ error: 'Failed to process support query' });
  }
});

app.listen(PORT, () => {
  console.log(`Shishu Vikash Mandir ERP server running at http://localhost:${PORT}`);
});
