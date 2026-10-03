import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { collection, query, limit, getDocs } from 'firebase/firestore';
import { db } from './src/lib/firebase';
import { WebhookSecurity } from './server/telegram/webhookSecurity';
import { UpdateProcessor } from './server/telegram/updateProcessor';
import { TelegramClient } from './server/telegram/telegramClient';
import { initWorkerAuth } from './server/initWorkerAuth';
import { AIParser } from './server/telegram/aiParser';
import { GroundingEngine } from './server/telegram/groundingEngine';
import { AIResponder } from './server/telegram/aiResponder';

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
console.log('[Startup Diagnostic]');
console.log('1. GEMINI_API_KEY check:', {
  exists: !!process.env.GEMINI_API_KEY,
  length: process.env.GEMINI_API_KEY?.length
});
console.log('2. NODE_ENV:', process.env.NODE_ENV);
console.log('3. TELEGRAM_BOT_TOKEN set:', Boolean(TELEGRAM_BOT_TOKEN));
console.log('==================================================');

/**
 * 3. Verify Telegram Bot API connection works
 */
async function verifyTelegramBotConnection() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('[Telegram API] ℹ️ TELEGRAM_BOT_TOKEN is not configured on server. CRM starting in standalone mode.');
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
  }

  const result = await TelegramClient.getMe();
  if (result.ok && result.result) {
    console.log(`[Telegram API] ✅ Bot Connected! Name: "${result.result.first_name}", Username: @${result.result.username}, ID: ${result.result.id}`);
  } else {
    console.warn('[Telegram API] ⚠️ getMe failed or bot token invalid:', result.error || result);
  }
  return result;
}

/**
 * 4. Server-side Telegram webhook endpoint: POST /api/telegram/webhook
 * 5. Webhook secret verification for security
 */
app.post('/api/telegram/webhook', async (req: Request, res: Response) => {
  // Validate secret token header
  const security = WebhookSecurity.validateRequest(req);
  if (!security.valid) {
    console.warn('[Telegram Webhook] ⚠️ Rejected update:', security.reason);
    return res.status(403).json({ error: 'Unauthorized: invalid webhook secret' });
  }

  try {
    const processResult = await UpdateProcessor.processUpdate(req.body);
    return res.status(200).json({ ok: true, result: processResult });
  } catch (err: any) {
    console.error('[Telegram Webhook] Error processing update:', err);
    return res.status(200).json({ ok: false, error: err.message });
  }
});

/**
 * Webhook Management Utilities
 */
app.post('/api/telegram/set-webhook', async (req: Request, res: Response) => {
  const customUrl = req.body?.url || `${APP_URL}/api/telegram/webhook`;
  const secret = req.body?.secret || TELEGRAM_WEBHOOK_SECRET;
  const result = await TelegramClient.setTelegramWebhook(customUrl, secret);
  res.json(result);
});

app.post('/api/telegram/delete-webhook', async (_req: Request, res: Response) => {
  const result = await TelegramClient.deleteTelegramWebhook();
  res.json(result);
});

app.get('/api/telegram/webhook-info', async (_req: Request, res: Response) => {
  const result = await TelegramClient.getTelegramWebhookInfo();
  res.json(result);
});

/**
 * Backward compatibility endpoints for UI
 */
app.post('/api/telegram/register-webhook', async (req: Request, res: Response) => {
  const customUrl = req.body?.url || `${APP_URL}/api/telegram/webhook`;
  stopPollingWorker();
  const result = await TelegramClient.setTelegramWebhook(customUrl, TELEGRAM_WEBHOOK_SECRET);
  res.json({ ok: result.ok, webhookUrl: customUrl, data: result });
});

/**
 * Polling Worker (Development & Fallback Engine)
 */
let isPollingActive = false;
let pollingOffset = 0;

async function startPollingWorker() {
  if (!TELEGRAM_BOT_TOKEN || isPollingActive) return;
  isPollingActive = true;

  console.log('[Telegram Polling Worker] 🚀 Starting polling listener for instant development messaging...');

  // Delete webhook so Telegram delivers updates to getUpdates
  await TelegramClient.deleteTelegramWebhook();

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
            await UpdateProcessor.processUpdate(update);
          }
        }
      } catch {
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
        TelegramClient.getMe(),
        TelegramClient.getTelegramWebhookInfo(),
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

app.post('/api/telegram/enable-polling', async (_req: Request, res: Response) => {
  startPollingWorker();
  res.json({ ok: true, isPollingActive: true });
});

// Telegram Mini App Admin Access Control Verification endpoint
app.post('/api/telegram/validate-admin', async (req: Request, res: Response) => {
  const { initData, businessId } = req.body;
  if (!initData || !businessId) {
    return res.status(400).json({ ok: false, error: 'initData and businessId are required' });
  }

  // 1. Parse query parameters
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  let user: any = null;
  const userStr = params.get('user');
  if (userStr) {
    try {
      user = JSON.parse(userStr);
    } catch {}
  }

  if (!hash || !user) {
    return res.status(401).json({ ok: false, error: 'Invalid or empty Telegram credentials' });
  }

  // HMAC SHA256 Verification if bot token is present
  if (TELEGRAM_BOT_TOKEN) {
    try {
      const keys = Array.from(params.keys())
        .filter((k) => k !== 'hash')
        .sort();
      const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join('\n');
      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TELEGRAM_BOT_TOKEN).digest();
      const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
      if (calculatedHash !== hash) {
        return res.status(403).json({ ok: false, error: 'Telegram authenticity hash verification failed.' });
      }
    } catch (err: any) {
      console.error('[validate-admin] Signature verification error:', err);
      return res.status(500).json({ ok: false, error: 'Internal signature verification failure' });
    }
  }

  const userId = user.id;

  // 2. Resolve connected Telegram group chat ID for the requested business
  let chatId: number | string | null = null;
  try {
    const qConv = query(collection(db, 'businesses', businessId, 'conversations'), limit(15));
    const snap = await getDocs(qConv);
    for (const d of snap.docs) {
      const data = d.data();
      if (typeof data.telegramChatId === 'number' && data.telegramChatId < 0) {
        chatId = data.telegramChatId;
        break;
      }
    }
  } catch (err) {
    console.warn('[validate-admin] Error resolving group chat ID:', err);
  }

  // 3. Check membership and administrator role via Telegram Bot API getChatMember
  let isAdminOfGroup = true; // Default to true if no group chat has registered yet
  let chatStatus = 'unknown';

  if (chatId && TELEGRAM_BOT_TOKEN) {
    try {
      const tgRes = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChatMember?chat_id=${chatId}&user_id=${userId}`
      );
      if (tgRes.ok) {
        const body = await tgRes.json();
        if (body.ok && body.result) {
          chatStatus = body.result.status;
          isAdminOfGroup = ['creator', 'administrator'].includes(chatStatus);
        } else {
          isAdminOfGroup = false;
        }
      } else {
        isAdminOfGroup = false;
      }
    } catch (err) {
      console.error('[validate-admin] getChatMember request failure:', err);
      isAdminOfGroup = false;
    }
  }

  // 4. Fallback: if there is no group linked yet, verify if the username matches the admin usernames list
  if (!chatId) {
    const ADMIN_USERNAMES = ['umurbekgafurov', 'umurbek_gafurov', 'gafurovv', 'umurbek', 'admin', 'savdobot_admin'];
    const isOwner = user.username && ADMIN_USERNAMES.includes(user.username.toLowerCase());
    if (!isOwner) {
      return res.status(403).json({
        ok: false,
        error: 'Access Denied: You are not a registered administrator of this business store.',
      });
    }
  } else if (!isAdminOfGroup) {
    return res.status(403).json({
      ok: false,
      error: `Access Denied: Your status in the group is "${chatStatus}". Only group creators or administrators are permitted.`,
    });
  }

  // Success: user is verified as an administrator
  return res.json({
    ok: true,
    user: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
    },
    businessId,
    status: chatStatus,
  });
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

app.post('/api/telegram/send-message', async (req: Request, res: Response) => {
  const { chatId, text } = req.body;
  if (!chatId || !text) {
    return res.status(400).json({ ok: false, error: 'chatId and text required' });
  }
  const result = await TelegramClient.sendMessage(chatId, text);
  res.json(result);
});

/**
 * AI Pipeline Testing Endpoint
 * Allows testing the complete AI Parser -> Intent -> Grounding -> AI Response flow
 */
app.post('/api/telegram/test-ai-pipeline', async (req: Request, res: Response) => {
  const { text, businessId = 'biz-default', customerName = 'Sinovchi' } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ ok: false, error: 'Text query is required' });
  }

  try {
    // 1. AI Parser
    const parsedIntent = await AIParser.parseIntent(text);

    // 2. Grounding Engine (Product / Warehouse / Order)
    const groundedContext = await GroundingEngine.ground({
      businessId,
      customerId: 'test_cust_sim',
      conversationId: 'test_conv_sim',
      customerName,
      parsedIntent,
      rawMessageText: text,
    });

    // 3. AI Response Generator
    const aiResponseText = await AIResponder.generateResponse({
      customerName,
      rawMessageText: text,
      groundedContext,
    });

    res.json({
      ok: true,
      query: text,
      parsedIntent,
      groundedContext: {
        intent: groundedContext.intent,
        matchedProductsCount: groundedContext.matchedProducts.length,
        topProduct: groundedContext.matchedProducts[0]?.name || null,
        topProductPrice: groundedContext.matchedProducts[0]?.price || null,
        warehouseStock: groundedContext.warehouseStock,
        draftOrderId: groundedContext.draftOrder?.id || null,
        draftOrderTotal: groundedContext.draftOrder?.total || null,
      },
      aiResponseText,
    });
  } catch (err: any) {
    console.error('[API test-ai-pipeline error]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Server Initialization
async function startServer() {
  // Initialize worker authentication for Firestore persistence
  await initWorkerAuth();

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
      if (TELEGRAM_BOT_TOKEN) {
        console.log('[Telegram Bot] Starting polling worker for reliable development response.');
        await startPollingWorker();
      }
    } else if (TELEGRAM_BOT_TOKEN) {
      console.log('[Telegram Bot] Registering production webhook...');
      await TelegramClient.setTelegramWebhook(`${APP_URL}/api/telegram/webhook`, TELEGRAM_WEBHOOK_SECRET);
    }
  });
}

startServer();

