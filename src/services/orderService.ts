import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Order, OrderIntentResult, OrderItem } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';

export class OrderService {
  /**
   * Deterministic foundation for detecting potential order intent from a message.
   * Does NOT auto-confirm orders, but identifies buying intent and potential items/quantities.
   */
  static detectOrderIntent(messageText: string): OrderIntentResult {
    if (!messageText || typeof messageText !== 'string') {
      return { hasOrderIntent: false, confidence: 0 };
    }

    const text = messageText.toLowerCase().trim();
    let score = 0;
    const reasons: string[] = [];

    // 1. Direct purchase intent keywords (Uzbek & Russian)
    const directKeywords = [
      'olaman',
      'olmoqchiman',
      'buyurtma',
      'zakaz',
      'sotib olmoqchiman',
      'buyurtma beraman',
      'bermoqchiman',
      'yetkazib bering',
      'dostavka qiling',
      'jo\'nating',
      'jo\'natinglar',
      'yuboring',
      'zakaz qilmoqchiman',
      'kupit',
      'zakazat',
    ];

    for (const kw of directKeywords) {
      if (text.includes(kw)) {
        score += 0.45;
        reasons.push(`Topilgan kalit so'z: "${kw}"`);
        break;
      }
    }

    // 2. Quantity indicators (e.g. 2 dona, 1 ta, 3 shtuk)
    const qtyRegex = /(\d+)\s*(ta|dona|shtuk|sht|d|x)\b/i;
    const qtyMatch = text.match(qtyRegex);
    let detectedQty = 1;
    if (qtyMatch) {
      score += 0.25;
      detectedQty = parseInt(qtyMatch[1], 10) || 1;
      reasons.push(`Topilgan miqdor: ${detectedQty} dona`);
    }

    // 3. Contact or delivery info indicators
    const phoneRegex = /(?:\+?998|8)?[\s-]?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/;
    if (phoneRegex.test(text)) {
      score += 0.2;
      reasons.push('Telefon raqami aniqlandi');
    }

    const addressKeywords = ['manzil', 'adres', 'toshkent', 'viloyat', 'ko\'cha', 'dom', 'kvartira'];
    for (const akw of addressKeywords) {
      if (text.includes(akw)) {
        score += 0.1;
        reasons.push(`Manzil belgisi: "${akw}"`);
        break;
      }
    }

    const confidence = Math.min(Number(score.toFixed(2)), 0.95);
    const hasOrderIntent = confidence >= 0.45;

    return {
      hasOrderIntent,
      confidence,
      reason: reasons.join('; '),
      detectedItems: hasOrderIntent
        ? [
            {
              query: text.slice(0, 80),
              quantity: detectedQty,
            },
          ]
        : undefined,
    };
  }

  /**
   * Creates a draft order in the orders collection.
   * Strictly keeps status as 'draft' in M3.1.
   */
  static async createDraftOrder(params: {
    businessId: string;
    customerId: string;
    conversationId?: string | null;
    items?: OrderItem[];
    subtotal?: number;
    deliveryPrice?: number;
    total?: number;
    currency?: string;
    customerNote?: string | null;
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
  }): Promise<Order> {
    const {
      businessId,
      customerId,
      conversationId = null,
      items = [],
      subtotal = 0,
      deliveryPrice = 0,
      total = subtotal + deliveryPrice,
      currency = 'UZS',
      customerNote = null,
      customerName = '',
      customerPhone = '',
      deliveryAddress = '',
    } = params;

    const orderId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const orderRef = doc(db, 'orders', orderId);
    const now = Date.now();

    const order: Order = {
      id: orderId,
      businessId,
      customerId,
      conversationId,
      source: 'telegram',
      status: 'draft',
      items,
      subtotal,
      deliveryPrice,
      total,
      currency,
      customerNote,
      customerName,
      customerPhone,
      deliveryAddress,
      paymentStatus: 'Kutilmoqda',
      orderStatus: 'Yangi',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(orderRef, order);
      return order;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `orders/${orderId}`);
    }
  }

  /**
   * Fetch orders for a business
   */
  static async getOrdersByBusiness(businessId: string): Promise<Order[]> {
    try {
      const q = query(collection(db, 'orders'), where('businessId', '==', businessId));
      const snap = await getDocs(q);
      const list: Order[] = [];
      snap.forEach((d) => list.push(d.data() as Order));
      return list.sort((a, b) => b.createdAt - a.createdAt);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'orders');
    }
  }

  /**
   * Realtime subscription for orders
   */
  static subscribeOrders(
    businessId: string,
    onData: (orders: Order[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    const q = query(collection(db, 'orders'), where('businessId', '==', businessId));
    return onSnapshot(
      q,
      (snap) => {
        const list: Order[] = [];
        snap.forEach((d) => list.push(d.data() as Order));
        list.sort((a, b) => b.createdAt - a.createdAt);
        onData(list);
      },
      (err) => {
        console.error('[OrderService realtime error]', err);
        if (onError) onError(err);
      }
    );
  }
}
