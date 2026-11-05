export interface SmsAdapter {
  sendOrderStatus(input: {
    mobile: string;
    orderId: string;
    templateId: string;
    parameters: Record<string, string>;
  }): Promise<{ messageId: string }>;
}
export const smsConfigured = false;
