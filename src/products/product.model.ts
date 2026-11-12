export interface PriceTier {
  fromQty: number;
  unitPrice: number;
  label: string;
}

export interface Product {
  id: string;
  name: string;
  tagline: string;
  description: string;
  illustration: string;
  currency: 'INR';
  minQty: number;
  maxQty: number;
  step: number;
  tiers: PriceTier[];
  pricingRule: string;
}
