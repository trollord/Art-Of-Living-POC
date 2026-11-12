import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import QRCode from 'qrcode';
import { ProductsService } from '../products/products.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { PaymentMethod } from './dto/pay-order.dto.js';
import { OrderItemDto } from './dto/quote.dto.js';
import { Order, Quote, QuoteLine } from './order.model.js';

const DEMO_VPA = 'artofliving.demo@upi';
const PAYEE_NAME = 'Art of Living IP Supplies (Demo)';

@Injectable()
export class OrdersService {
  private readonly orders = new Map<string, Order>();
  private sequence = 0;

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

  async create(dto: CreateOrderDto): Promise<Order> {
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
    return order;
  }

  findOne(id: string): Order {
    const order = this.orders.get(id.toUpperCase());
    if (!order) {
      throw new NotFoundException(`Order ${id} was not found`);
    }
    return order;
  }

  pay(id: string, method: PaymentMethod): Order {
    const order = this.findOne(id);
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

  private nextId(): string {
    this.sequence += 1;
    const year = new Date().getFullYear();
    return `AOL-IP-${year}-${String(this.sequence).padStart(4, '0')}`;
  }

  private upiReference(): string {
    let ref = String(randomInt(1, 10));
    for (let i = 0; i < 11; i++) ref += String(randomInt(0, 10));
    return ref;
  }
}
