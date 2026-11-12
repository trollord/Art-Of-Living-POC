import { IsIn } from 'class-validator';

export const PAYMENT_METHODS = ['gpay', 'upi_qr'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export class PayOrderDto {
  @IsIn(PAYMENT_METHODS, { message: 'method must be "gpay" or "upi_qr"' })
  method: PaymentMethod;
}
