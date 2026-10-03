/**
 * 7 Canonical Customer Segments defined in M7.1 Architecture
 */
export type CustomerSegmentType =
  | 'new_customer'
  | 'interested'
  | 'high_intent'
  | 'active_buyer'
  | 'repeat_customer'
  | 'inactive_customer'
  | 'cancelled_customer';

export const ALL_CUSTOMER_SEGMENT_TYPES: readonly CustomerSegmentType[] = [
  'new_customer',
  'interested',
  'high_intent',
  'active_buyer',
  'repeat_customer',
  'inactive_customer',
  'cancelled_customer',
] as const;

/**
 * Human-readable labels in Uzbek for UI and reporting
 */
export const CUSTOMER_SEGMENT_LABELS: Record<CustomerSegmentType, string> = {
  new_customer: 'Yangi mijoz',
  interested: 'Qiziqayotgan mijoz',
  high_intent: 'Yuqori xarid niyati',
  active_buyer: 'Faol xaridor',
  repeat_customer: 'Doimiy xaridor',
  inactive_customer: 'Nofaol mijoz',
  cancelled_customer: 'Bekor qilingan xarid',
};

/**
 * M7 Customer Segmentation Input Contract
 */
export interface CustomerSegmentationInput {
  customerId: string;
  businessId: string;
  signals?: {
    customerId: string;
    businessId: string;
    hasActiveOrder?: boolean;
    hasCompletedOrder?: boolean;
    hasCancelledOrder?: boolean;
    isRepeatCustomer?: boolean;
    totalOrders?: number;
    completedOrders?: number;
    cancelledOrders?: number;
    totalSpent?: number;
    lastOrderAt?: number | null;
    lastInteractionAt?: number | null;
    purchaseIntentDetected?: boolean;
    productInquiryDetected?: boolean;
    priceInquiryDetected?: boolean;
    stockInquiryDetected?: boolean;
  } | null;
  insight?: {
    customerId: string;
    businessId: string;
    intentScore?: number;
    completedOrders?: number;
    cancelledOrders?: number;
    totalSpent?: number;
    totalOrders?: number;
    lastOrderAt?: number | null;
    lastInteractionAt?: number | null;
    signals?: string[];
  } | null;
  now?: number;
  options?: {
    inactiveThresholdDays?: number; // Default 30 days
    repeatPurchaseCycleDays?: number; // Default 21 days
  };
}

/**
 * M7 Customer Segmentation Output Contract
 */
export interface CustomerSegmentationResult {
  customerId: string;
  businessId: string;
  segment: CustomerSegmentType;
  score: number; // 0 - 100
  confidence: number; // 0.0 - 1.0
  reasons: string[];
  signals: string[];
  recommendedAction: string;
  calculatedAt: number;
  metadata?: {
    totalOrders: number;
    totalSpent: number;
    lastOrderAt: number | null;
    lastInteractionAt: number | null;
  };
}

/**
 * Validation return structure
 */
export interface CustomerSegmentationValidationResult {
  isValid: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Validation function for CustomerSegmentationInput
 */
export function validateSegmentationInput(
  input: CustomerSegmentationInput
): CustomerSegmentationValidationResult {
  const errors: Record<string, string> = {};

  if (!input.customerId || typeof input.customerId !== 'string') {
    errors.customerId = 'customerId is required and must be a string';
  }
  if (!input.businessId || typeof input.businessId !== 'string') {
    errors.businessId = 'businessId is required and must be a string';
  }

  if (Object.keys(errors).length > 0) {
    return { isValid: false, error: 'Validation failed', fieldErrors: errors };
  }

  return { isValid: true };
}

/**
 * Fallback result if segmentation fails
 */
export const getSegmentationFallback = (
  input: CustomerSegmentationInput
): CustomerSegmentationResult => ({
  customerId: input.customerId,
  businessId: input.businessId,
  segment: 'new_customer', // Default fallback
  score: 0,
  confidence: 0,
  reasons: ['Segmentation failed - using fallback'],
  signals: [],
  recommendedAction: 'no_action',
  calculatedAt: Date.now(),
});
