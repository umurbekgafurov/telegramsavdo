import {
  CustomerSegmentationInput,
  CustomerSegmentationResult,
  CustomerSegmentType,
  getSegmentationFallback,
  validateSegmentationInput
} from '../types/customerSegmentation';

export class CustomerSegmentationService {
  /**
   * Deterministically assigns a canonical customer segment based on CRM signals and insights.
   */
  public static segmentCustomer(input: CustomerSegmentationInput): CustomerSegmentationResult {
    const validation = validateSegmentationInput(input);
    if (!validation.isValid) {
      return getSegmentationFallback(input);
    }

    const { signals, insight, now = Date.now(), options = {} } = input;
    const inactiveThresholdMs = (options.inactiveThresholdDays ?? 30) * 24 * 60 * 60 * 1000;

    const completed = signals?.completedOrders ?? insight?.completedOrders ?? 0;
    const cancelled = signals?.cancelledOrders ?? insight?.cancelledOrders ?? 0;
    const spent = signals?.totalSpent ?? insight?.totalSpent ?? 0;
    const score = insight?.intentScore ?? 0;
    const hasActive = signals?.hasActiveOrder ?? false;

    const lastInteraction = signals?.lastInteractionAt ?? insight?.lastInteractionAt ?? null;
    const isInactive = lastInteraction !== null && (now - lastInteraction) > inactiveThresholdMs;

    let segment: CustomerSegmentType = 'new_customer';
    const reasons: string[] = [];

    // 1. Cancelled cohort check
    if (cancelled > 0 && completed === 0) {
      segment = 'cancelled_customer';
      reasons.push('Xarid bekor qilingan, yakunlangan buyurtmalar mavjud emas.');
    }
    // 2. Inactive cohort check
    else if (isInactive && completed > 0) {
      segment = 'inactive_customer';
      reasons.push(`So'nggi 30 kun ichida muloqot bo'lmagan (Mijoz nofaol). Yakunlangan xaridlar soni: ${completed}.`);
    }
    // 3. Repeat VIP customer check
    else if (completed >= 2 || spent >= 2000000) {
      segment = 'repeat_customer';
      reasons.push(`Doimiy xaridor: ${completed} ta buyurtma, umumiy xarid summasi: ${spent.toLocaleString()} so'm.`);
    }
    // 4. Single-time buyer check
    else if (completed === 1) {
      segment = 'active_buyer';
      reasons.push("Do'kondan bitta muvaffaqiyatli xaridni amalga oshirgan.");
    }
    // 5. High-intent hot lead check
    else if (score >= 70 || hasActive) {
      segment = 'high_intent';
      reasons.push(`Yuqori xarid niyati: Lead score ${score}/100, faol buyurtmasi mavjud.`);
    }
    // 6. Interested lead check
    else if (
      signals?.productInquiryDetected ||
      signals?.priceInquiryDetected ||
      signals?.stockInquiryDetected
    ) {
      segment = 'interested';
      reasons.push("Do'kon mahsulotlari, narxlari yoki qoldiqlari bo'yicha qiziqish bildirgan.");
    }
    // 7. New customer default
    else {
      segment = 'new_customer';
      reasons.push('Tizimdagi yangi mijoz, muloqot yoki sotuv tarixi hali shakllanmagan.');
    }

    // Determine matching action
    let recommendedAction: string = 'no_action';
    if (segment === 'interested' || segment === 'new_customer') recommendedAction = 'follow_up';
    else if (segment === 'high_intent') recommendedAction = 'product_recommendation';
    else if (segment === 'active_buyer') recommendedAction = 'repeat_purchase';
    else if (segment === 'inactive_customer') recommendedAction = 'follow_up';

    return {
      customerId: input.customerId,
      businessId: input.businessId,
      segment,
      score,
      confidence: 1.0, // Deterministic has absolute confidence
      reasons,
      signals: insight?.signals || [],
      recommendedAction,
      calculatedAt: now,
      metadata: {
        totalOrders: signals?.totalOrders ?? insight?.totalOrders ?? 0,
        totalSpent: spent,
        lastOrderAt: signals?.lastOrderAt ?? insight?.lastOrderAt ?? null,
        lastInteractionAt: lastInteraction,
      },
    };
  }
}
