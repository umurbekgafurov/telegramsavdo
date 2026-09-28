import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Parse JSON bodies
app.use(express.json());

// 1. & 2. Server-side environment variables verification
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');

console.log('==================================================');
console.log('[Telegram Bot Integration Diagnostic]');
console.log('1. TELEGRAM_BOT_TOKEN set on server:', Boolean(TELEGRAM_BOT_TOKEN));
console.log('2. TELEGRAM_WEBHOOK_SECRET set on server:', Boolean(TELEGRAM_WEBHOOK_SECRET));
console.log('3. APP_URL:', APP_URL || '(None - Localhost)');
console.log('4. Environment:', process.env.NODE_ENV || 'development');
console.log('==================================================');

/**
 * 3. Verify Telegram Bot API connection works
 */
async function verifyTelegramBotConnection() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('[Telegram API] ❌ TELEGRAM_BOT_TOKEN is missing on server.');
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
    const data = await res.json();
    if (data.ok) {
      console.log(`[Telegram API] ✅ Bot Connected! Name: "${data.result.first_name}", Username: @${data.result.username}, ID: ${data.result.id}`);
    } else {
      console.error('[Telegram API] ❌ getMe failed:', data);
    }
    return data;
  } catch (err: any) {
    console.error('[Telegram API] ❌ Connection error:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * 10. Send a test/live reply back to Telegram
 */
async function sendTelegramMessage(chatId: number | string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('[Telegram API] Cannot send message: token is missing.');
    return { ok: false, error: 'Token missing' };
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });
    const data = await res.json();
    console.log(`[Telegram API] 📤 Message sent to ${chatId}: ${data.ok ? 'SUCCESS' : JSON.stringify(data)}`);
    return data;
  } catch (err: any) {
    console.error(`[Telegram API] ❌ Failed to send message to ${chatId}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Central update processor for /start, text messages, and commands
 */
async function handleTelegramUpdate(update: any): Promise<{ handled: string }> {
  // 7. Log incoming Telegram updates on the server
  console.log('[Telegram Core] 📥 Received Update:', JSON.stringify(update, null, 2));

  const message = update?.message;
  if (!message) {
    return { handled: 'ignored_no_message' };
  }

  const chatId = message.chat?.id;
  const userText = (message.text || '').trim();
  const senderName = message.from?.first_name || message.from?.username || 'Foydalanuvchi';

  console.log(`[Telegram Core] Message from "${senderName}" (Chat: ${chatId}): "${userText}"`);

  if (!chatId) {
    return { handled: 'no_chat_id' };
  }

  // 8. Handle /start
  // Required response:
  // "Assalomu alaykum! 👋\nAI SavdoBot ishga tushdi."
  if (userText === '/start' || userText.startsWith('/start ')) {
    const startReply = `Assalomu alaykum! 👋\nAI SavdoBot ishga tushdi.`;
    console.log(`[Telegram Core] Replying to /start for chat ${chatId}`);
    await sendTelegramMessage(chatId, startReply);
    return { handled: '/start' };
  }

  // 9. Handle normal text messages
  if (userText) {
    const textReply = `Assalomu alaykum, ${senderName}! 👋\n\nXabaringiz qabul qilindi: "${userText}"\n\n🛍 AI SavdoBot sizga mahsulotlar katalogi, narxlar va buyurtma berishda yordam beradi. Tez orada do'kon ma'muri yoki AI agent sizga javob beradi.`;
    console.log(`[Telegram Core] Replying to text message for chat ${chatId}`);
    await sendTelegramMessage(chatId, textReply);
    return { handled: 'text_message' };
  }

  // Media / non-text messages
  if (message.photo || message.voice || message.document || message.sticker) {
    await sendTelegramMessage(
      chatId,
      `Xabaringiz qabul qilindi! Buyurtma yoki savollaringiz bo'lsa, iltimos matn shaklida yozib yuboring.`
    );
    return { handled: 'media' };
  }

  return { handled: 'other' };
}

/**
 * 4. Server-side Telegram webhook endpoint: POST /api/telegram/webhook
 * 6. Webhook secret verification for security
 */
app.post('/api/telegram/webhook', async (req: Request, res: Response) => {
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'];

  // Validate secret if configured
  if (TELEGRAM_WEBHOOK_SECRET && secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
    console.warn('[Telegram Webhook] ⚠️ Rejected update: secret token mismatch.');
    return res.status(403).json({ error: 'Unauthorized: invalid webhook secret' });
  }

  try {
    const result = await handleTelegramUpdate(req.body);
    return res.status(200).json({ ok: true, result });
  } catch (err: any) {
    console.error('[Telegram Webhook] Error processing update:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 5. Register the webhook with Telegram using the configured bot token & secret
 */
async function registerTelegramWebhook(customUrl?: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' };
  }

  const baseUrl = (customUrl || APP_URL).replace(/\/$/, '');
  if (!baseUrl || baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    const msg = 'Telegram Webhooks require a public HTTPS URL. Localhost is not reachable by Telegram.';
    console.warn(`[Telegram Webhook] ⚠️ ${msg}`);
    return { ok: false, error: msg, isLocalhost: true };
  }

  const webhookUrl = `${baseUrl}/api/telegram/webhook`;
  console.log(`[Telegram Webhook] 🌐 Registering webhook: ${webhookUrl}`);

  try {
    const payload: Record<string, any> = {
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    };
    if (TELEGRAM_WEBHOOK_SECRET) {
      payload.secret_token = TELEGRAM_WEBHOOK_SECRET;
    }

    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log('[Telegram Webhook] setWebhook response:', data);
    return { ok: data.ok, webhookUrl, data };
  } catch (err: any) {
    console.error('[Telegram Webhook] setWebhook error:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * Polling Worker (Development & Fallback Engine)
 * Automatically ensures the bot works when webhooks are blocked by dev authentication proxies (302 redirects)
 * or when developing on localhost.
 */
let isPollingActive = false;
let pollingOffset = 0;

async function startPollingWorker() {
  if (!TELEGRAM_BOT_TOKEN || isPollingActive) return;
  isPollingActive = true;

  console.log('[Telegram Polling Worker] 🚀 Starting polling listener for instant development messaging...');

  // Delete webhook so Telegram delivers updates to getUpdates
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`);
    console.log('[Telegram Polling Worker] Webhook deleted for active polling session.');
  } catch (e) {
    console.warn('[Telegram Polling Worker] Notice deleting webhook:', e);
  }

  // Polling loop
  (async () => {
    while (isPollingActive) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${pollingOffset}&timeout=20`
        );
        if (!response.ok) {
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }

        const data = await response.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            pollingOffset = update.update_id + 1;
            await handleTelegramUpdate(update);
          }
        }
      } catch (err: any) {
        // Transient network delay
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  })();
}

function stopPollingWorker() {
  isPollingActive = false;
}

// API to check Telegram integration status
app.get('/api/telegram/status', async (_req: Request, res: Response) => {
  let botInfo: any = null;
  let webhookInfo: any = null;
  let error: string | null = null;

  if (TELEGRAM_BOT_TOKEN) {
    try {
      const [meRes, whRes] = await Promise.all([
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`).then((r) => r.json()),
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`).then((r) => r.json()),
      ]);
      botInfo = meRes;
      webhookInfo = whRes;
    } catch (e: any) {
      error = e.message;
    }
  }

  res.json({
    tokenConfigured: Boolean(TELEGRAM_BOT_TOKEN),
    secretConfigured: Boolean(TELEGRAM_WEBHOOK_SECRET),
    appUrl: APP_URL || null,
    isHttps: APP_URL.startsWith('https://'),
    isPollingActive,
    botInfo,
    webhookInfo,
    error,
  });
});

// API to register webhook on demand
app.post('/api/telegram/register-webhook', async (req: Request, res: Response) => {
  const customUrl = req.body?.url;
  stopPollingWorker();
  const regResult = await registerTelegramWebhook(customUrl);
  res.json(regResult);
});

// API to switch to polling mode (for local / dev)
app.post('/api/telegram/enable-polling', async (_req: Request, res: Response) => {
  startPollingWorker();
  res.json({ ok: true, isPollingActive: true });
});

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'AI SavdoBot',
    environment: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  });
});

// Server Initialization
async function startServer() {
  if (!isProd) {
    // Mount Vite dev server middleware (Full-Stack Express + Vite)
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, async () => {
    console.log(`🚀 Express server running on port ${PORT}`);

    // Verify Bot connection
    await verifyTelegramBotConnection();

    // Start polling in development or if webhook is unreachable (e.g. 302 on dev domain or localhost)
    if (!isProd || !APP_URL || APP_URL.includes('localhost') || APP_URL.includes('ais-dev-')) {
      console.log('[Telegram Bot] Starting polling worker for reliable development response.');
      await startPollingWorker();
    } else {
      console.log('[Telegram Bot] Registering production webhook...');
      await registerTelegramWebhook();
    }
  });
}

startServer();
