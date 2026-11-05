export interface ShippingAdapter {
  quote(input: {
    province: string;
    city: string;
    weightGrams: number;
  }): Promise<{ priceToman: number; service: string }>;
  createShipment(input: { orderId: string }): Promise<{ trackingCode: string }>;
}
export const shippingProviderConfigured = false;
