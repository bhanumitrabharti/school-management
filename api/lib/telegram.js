/**
 * Internal Telegram Notification Helper (C8)
 * Sends notification directly to configured Telegram bot chat without self-HTTP calls.
 */

export async function sendTelegramAlert(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('[Telegram Alert] Env vars missing, skipping Telegram alert.');
    return { skipped: true };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });
    const result = await resp.json();
    return { success: resp.ok, result };
  } catch (err) {
    console.warn('[Telegram Alert] Error sending alert:', err.message);
    return { success: false, error: err.message };
  }
}
