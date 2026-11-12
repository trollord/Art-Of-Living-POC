import { Product } from './product.model.js';

export const PRODUCT_CATALOG: Product[] = [
  {
    id: 'batman-blindfold',
    name: 'Batman Blindfold',
    tagline: 'Bat-motif blindfold the children love',
    description:
      'Soft, light-blocking blindfold with a playful bat silhouette. Sized for children aged 5 to 13 and comfortable for long practice sessions.',
    illustration: 'batman',
    currency: 'INR',
    minQty: 25,
    maxQty: 5000,
    step: 1,
    tiers: [{ fromQty: 1, unitPrice: 80, label: 'Flat rate' }],
    pricingRule: 'Min. order 25 pieces',
  },
  {
    id: 'demo-blindfold',
    name: 'Demo Blindfold',
    tagline: 'Premium teacher demonstration piece',
    description:
      'Padded, contoured blindfold used by teachers to demonstrate the practice. Fully light-blocking with an adjustable strap.',
    illustration: 'demo',
    currency: 'INR',
    minQty: 1,
    maxQty: 1000,
    step: 1,
    tiers: [
      { fromQty: 1, unitPrice: 800, label: 'Standard rate' },
      { fromQty: 11, unitPrice: 730, label: 'Bulk rate (11+)' },
    ],
    pricingRule: '₹730 each for 11 or more',
  },
];
