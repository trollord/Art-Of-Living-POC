import { PaymentMethod } from './dto/pay-order.dto.js';

export interface QuoteLine {
  productId: string;
  name: string;
  quantity: number;
  basePrice: number;
  unitPrice: number;
  tier: string;
  lineTotal: number;
  savings: number;
}

export interface Quote {
  currency: 'INR';
  lines: QuoteLine[];
  itemCount: number;
  subtotalAtBase: number;
  totalSavings: number;
  grandTotal: number;
}

export type OrderStatus = 'PENDING_PAYMENT' | 'PAID';

export interface Order {
  id: string;
  status: OrderStatus;
  createdAt: string;
  teacher: {
    name: string;
    phone: string;
    email: string;
    teacherCode?: string;
  };
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
  };
  quote: Quote;
  amount: number;
  currency: 'INR';
  upi: {
    vpa: string;
    payeeName: string;
    link: string;
    qrDataUrl: string;
  };
  payment?: {
    method: PaymentMethod;
    upiReference: string;
    paidAt: string;
  };
}
