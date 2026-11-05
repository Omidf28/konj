export interface PaymentRequest {
  orderId: string;
  amountToman: number;
  callbackUrl: string;
}
export interface PaymentVerification {
  reference: string;
  amountToman: number;
  verified: boolean;
}
export interface LivePaymentAdapter {
  readonly mode: "live";
  request(
    input: PaymentRequest,
  ): Promise<{ redirectUrl: string; authority: string }>;
  verify(input: {
    authority: string;
    orderId: string;
    expectedAmountToman: number;
  }): Promise<PaymentVerification>;
}
// A real callback must verify authority, order, amount and provider response before transactional settlement.
export function realGatewayConfigured() {
  return false;
}
