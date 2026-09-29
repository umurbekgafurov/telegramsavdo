import { TelegramUpdate } from '../../src/types/telegram';
import { UpdateParser } from './updateParser';
import { BusinessResolver } from './businessResolver';
import { IdempotencyService } from './idempotency';
import { CustomerService } from '../../src/services/customerService';
import { ConversationService } from '../../src/services/conversationService';
import { MessageService } from '../../src/services/messageService';
import { TelegramClient } from './telegramClient';
import { AIParser } from './aiParser';
import { GroundingEngine } from './groundingEngine';
import { AIResponder } from './aiResponder';
import { AIParserIntent, AIParserResult, GroundedContext } from '../../src/types/crm';

export interface ProcessResult {
  success: boolean;
  status: string;
  updateId?: number;
  businessId?: string;
  customerId?: string;
  conversationId?: string;
  inboundMessageId?: string;
  outboundMessageId?: string;
  detectedIntent?: AIParserIntent;
  aiResponseText?: string;
  draftOrderId?: string;
  isDuplicate?: boolean;
}

export class UpdateProcessor {
  /**
   * Complete Telegram Sales Assistant Pipeline:
   *
   * Telegram
   *    ↓
   * Webhook
   *    ↓
   * Customer
   *    ↓
   * Conversation
   *    ↓
   * Message
   *    ↓
   * AI Parser
   *    ↓
   * Intent (product_query | stock_query | price_query | order_intent | greeting | unknown)
   *    ↓
   * Product / Warehouse / Order
   *    ↓
   * AI Response
   *    ↓
   * Telegram
   */
  static async processUpdate(update: TelegramUpdate): Promise<ProcessResult> {
    // 1. Parse update
    const parsed = UpdateParser.parse(update);
    if (!parsed) {
      return {
        success: true,
        status: 'ignored_unsupported_or_empty_update',
      };
    }

    // 2. Resolve business/tenant
    const businessId = await BusinessResolver.resolveBusiness(parsed.username);

    // 3. Idempotency guard (Telegram update_id)
    const isDuplicate = await IdempotencyService.checkAndRecordUpdate(parsed.updateId, businessId);
    if (isDuplicate) {
      return {
        success: true,
        status: 'duplicate_update_skipped',
        updateId: parsed.updateId,
        businessId,
        isDuplicate: true,
      };
    }

    try {
      // 4. Customer upsert
      const customer = await CustomerService.upsertTelegramCustomer({
        businessId,
        telegramUserId: parsed.telegramUserId,
        telegramChatId: parsed.telegramChatId,
        username: parsed.username,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        phone: parsed.phone,
      });

      // 5. Conversation upsert (registers inbound)
      const conversation = await ConversationService.upsertTelegramConversation({
        businessId,
        customerId: customer.id,
        telegramChatId: parsed.telegramChatId,
        lastMessagePreview: parsed.text,
        customerName: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Mijoz',
        customerUsername: customer.username,
      });

      // 6. Inbound Message storage
      const { message: inboundMsg, isDuplicate: isMsgDuplicate } = await MessageService.storeMessage({
        businessId,
        customerId: customer.id,
        conversationId: conversation.id,
        direction: 'inbound',
        channel: 'telegram',
        telegramMessageId: parsed.telegramMessageId,
        telegramChatId: parsed.telegramChatId,
        type: parsed.type,
        text: parsed.text,
        media: parsed.media,
        aiProcessed: false,
        aiIntent: null,
        createdAt: parsed.rawDate,
      });

      if (isMsgDuplicate) {
        return {
          success: true,
          status: 'duplicate_message_skipped',
          updateId: parsed.updateId,
          businessId,
          customerId: customer.id,
          conversationId: conversation.id,
          inboundMessageId: inboundMsg.id,
          isDuplicate: true,
        };
      }

      // 7. AI Parser: Classifies into one of the 6 exact intents
      // (product_query | stock_query | price_query | order_intent | greeting | unknown)
      const parsedIntent: AIParserResult = await AIParser.parseIntent(parsed.text);
      console.log(`[AI Pipeline] 🎯 Intent Detected: "${parsedIntent.intent}" (Confidence: ${parsedIntent.confidence}) for "${parsed.text}"`);

      // 8. Grounding Engine: Product / Warehouse / Order
      const groundedContext: GroundedContext = await GroundingEngine.ground({
        businessId,
        customerId: customer.id,
        conversationId: conversation.id,
        customerName: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
        customerPhone: customer.phone,
        parsedIntent,
        rawMessageText: parsed.text,
      });

      // 9. AI Response Generation
      const aiResponseText: string = await AIResponder.generateResponse({
        customerName: customer.firstName || 'Mijoz',
        rawMessageText: parsed.text,
        groundedContext,
      });

      // 10. Store AI Outbound Response in Conversation
      const outboundMessageId = Date.now();
      const { message: outboundMsg } = await MessageService.storeMessage({
        businessId,
        customerId: customer.id,
        conversationId: conversation.id,
        direction: 'outbound',
        channel: 'telegram',
        telegramMessageId: outboundMessageId,
        telegramChatId: parsed.telegramChatId,
        type: 'text',
        text: aiResponseText,
        aiProcessed: true,
        aiIntent: parsedIntent.intent,
        createdAt: Date.now(),
      });

      // Update conversation with latest AI response preview
      await ConversationService.upsertTelegramConversation({
        businessId,
        customerId: customer.id,
        telegramChatId: parsed.telegramChatId,
        lastMessagePreview: aiResponseText,
        customerName: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
        customerUsername: customer.username,
      });

      // 11. Send Response back to Telegram chat
      await TelegramClient.sendMessage(parsed.telegramChatId, aiResponseText);

      return {
        success: true,
        status: 'processed_and_replied_successfully',
        updateId: parsed.updateId,
        businessId,
        customerId: customer.id,
        conversationId: conversation.id,
        inboundMessageId: inboundMsg.id,
        outboundMessageId: outboundMsg.id,
        detectedIntent: parsedIntent.intent,
        aiResponseText,
        draftOrderId: groundedContext.draftOrder ? groundedContext.draftOrder.id : undefined,
      };
    } catch (err: any) {
      console.error('[UpdateProcessor] ❌ Error in AI pipeline:', err);
      return {
        success: false,
        status: `processing_error: ${err.message || 'unknown'}`,
        updateId: parsed.updateId,
        businessId,
      };
    }
  }
}
