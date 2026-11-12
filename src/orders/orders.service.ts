import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { ProductsService } from '../products/products.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { PaymentMethod } from './dto/pay-order.dto.js';
import { OrderItemDto } from './dto/quote.dto.js';
import { Order, Quote, QuoteLine } from './order.model.js';

const DEMO_VPA = 'artofliving.demo@upi';
const PAYEE_NAME = 'Art of Living IP Supplies (Demo)';
const DEMO_ORDER_SECRET = 'aol-ip-supplies-demo-order-secret';

@Injectable()
export class OrdersService {
  private readonly orders = new Map<string, Order>();

  constructor(private readonly productsService: ProductsService) {}

  quote(items: OrderItemDto[]): Quote {
    const merged = new Map<string, number>();
    for (const item of items) {
      merged.set(
        item.productId,
        (merged.get(item.productId) ?? 0) + item.quantity,
      );
    }

    const lines: QuoteLine[] = [];
    for (const [productId, quantity] of merged) {
      const product = this.productsService.findOne(productId);
      if (quantity === 0) continue;
      if (quantity < product.minQty) {
        throw new BadRequestException(
          `${product.name} has a minimum order of ${product.minQty} pieces (you entered ${quantity}).`,
        );
      }
      if (quantity > product.maxQty) {
        throw new BadRequestException(
          `${product.name} can be ordered up to ${product.maxQty} pieces per order.`,
        );
      }
      const basePrice = this.productsService.basePrice(product);
      const tier = this.productsService.tierFor(product, quantity);
      const lineTotal = tier.unitPrice * quantity;
      lines.push({
        productId,
        name: product.name,
        quantity,
        basePrice,
        unitPrice: tier.unitPrice,
        tier: tier.label,
        lineTotal,
        savings: (basePrice - tier.unitPrice) * quantity,
      });
    }

    const sum = (pick: (l: QuoteLine) => number) =>
      lines.reduce((acc, l) => acc + pick(l), 0);

    return {
      currency: 'INR',
      lines,
      itemCount: sum((l) => l.quantity),
      subtotalAtBase: sum((l) => l.basePrice * l.quantity),
      totalSavings: sum((l) => l.savings),
      grandTotal: sum((l) => l.lineTotal),
    };
  }

  async create(dto: CreateOrderDto): Promise<Order & { token: string }> {
    const quote = this.quote(dto.items);
    if (quote.lines.length === 0) {
      throw new BadRequestException('Your cart is empty. Add at least one product.');
    }

    const id = this.nextId();
    const amount = quote.grandTotal;
    const link =
      `upi://pay?pa=${DEMO_VPA}` +
      `&pn=${encodeURIComponent(PAYEE_NAME)}` +
      `&am=${amount.toFixed(2)}` +
      `&cu=INR` +
      `&tn=${encodeURIComponent(id)}`;
    const qrDataUrl = await QRCode.toDataURL(link, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: 'M',
      color: { dark: '#333333', light: '#FFFFFF' },
    });

    const order: Order = {
      id,
      status: 'PENDING_PAYMENT',
      createdAt: new Date().toISOString(),
      teacher: {
        name: dto.teacher.name,
        phone: dto.teacher.phone,
        email: dto.teacher.email,
        ...(dto.teacher.teacherCode ? { teacherCode: dto.teacher.teacherCode } : {}),
      },
      address: {
        line1: dto.address.line1,
        ...(dto.address.line2 ? { line2: dto.address.line2 } : {}),
        city: dto.address.city,
        state: dto.address.state,
        pincode: dto.address.pincode,
      },
      quote,
      amount,
      currency: 'INR',
      upi: { vpa: DEMO_VPA, payeeName: PAYEE_NAME, link, qrDataUrl },
    };
    this.orders.set(id, order);
    return { ...order, token: this.sign(order) };
  }

  findOne(id: string): Order {
    const order = this.orders.get(id.toUpperCase());
    if (!order) {
      throw new NotFoundException(`Order ${id} was not found`);
    }
    return order;
  }

  pay(id: string, method: PaymentMethod, token?: string): Order {
    const order = this.orders.get(id.toUpperCase()) ?? this.restore(id, token);
    if (order.status === 'PAID') {
      throw new ConflictException(`Order ${order.id} is already paid`);
    }
    order.status = 'PAID';
    order.payment = {
      method,
      upiReference: this.upiReference(),
      paidAt: new Date().toISOString(),
    };
    return order;
  }

  private restore(id: string, token?: string): Order {
    if (!token) {
      throw new NotFoundException(`Order ${id} was not found`);
    }
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !this.verify(payload, signature)) {
      throw new BadRequestException(
        'Order token is invalid or has been tampered with.',
      );
    }
    let order: Order;
    try {
      order = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as Order;
    } catch {
      throw new BadRequestException(
        'Order token is invalid or has been tampered with.',
      );
    }
    if (order?.id !== id.toUpperCase()) {
      throw new BadRequestException(
        `Order token does not belong to order ${id}.`,
      );
    }
    this.orders.set(order.id, order);
    return order;
  }

  private sign(order: Order): string {
    const payload = Buffer.from(JSON.stringify(order)).toString('base64url');
    return `${payload}.${this.hmac(payload)}`;
  }

  private verify(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.hmac(payload));
    const actual = Buffer.from(signature);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private hmac(payload: string): string {
    return createHmac('sha256', process.env.ORDER_SECRET || DEMO_ORDER_SECRET)
      .update(payload)
      .digest('base64url');
  }

  private nextId(): string {
    const year = new Date().getFullYear();
    const time = Date.now().toString(36).slice(-3);
    const random = randomInt(0, 36 ** 3)
      .toString(36)
      .padStart(3, '0');
    return `AOL-IP-${year}-${(time + random).toUpperCase()}`;
  }

  private upiReference(): string {
    let ref = String(randomInt(1, 10));
    for (let i = 0; i < 11; i++) ref += String(randomInt(0, 10));
    return ref;
  }
}
