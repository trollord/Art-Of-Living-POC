import { Injectable, NotFoundException } from '@nestjs/common';
import { PriceTier, Product } from './product.model.js';
import { PRODUCT_CATALOG } from './products.catalog.js';

@Injectable()
export class ProductsService {
  private readonly products = new Map<string, Product>(
    PRODUCT_CATALOG.map((p) => [p.id, p]),
  );

  findAll(): Product[] {
    return [...this.products.values()];
  }

  findOne(id: string): Product {
    const product = this.products.get(id);
    if (!product) {
      throw new NotFoundException(`Unknown product "${id}"`);
    }
    return product;
  }

  basePrice(product: Product): number {
    return product.tiers[0].unitPrice;
  }

  tierFor(product: Product, quantity: number): PriceTier {
    return [...product.tiers]
      .sort((a, b) => b.fromQty - a.fromQty)
      .find((t) => quantity >= t.fromQty) ?? product.tiers[0];
  }
}
