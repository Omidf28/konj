export interface PrintPlacement {
  version: 1;
  uploadId: string;
  previewId?: string;
  side: "front" | "back";
  widthCm: number;
  heightCm: number;
  xCm: number;
  yCm: number;
  rotation: number;
  productWidthCm?: number;
  productHeightCm?: number;
}
export interface CustomDesign extends PrintPlacement {
  additionalPrints?: PrintPlacement[];
}
export interface CartItem {
  key: string;
  productId: string;
  sku: string;
  quantity: number;
  custom?: CustomDesign;
}
export interface QuoteItem extends CartItem {
  name: string;
  color: string;
  size: string | null;
  productSnapshot?: Record<string, unknown>;
  unitPriceToman: number;
  lineTotalToman: number;
}
export interface Quote {
  items: QuoteItem[];
  subtotalToman: number;
  shippingToman: number;
  totalToman: number;
  testMode: boolean;
}
