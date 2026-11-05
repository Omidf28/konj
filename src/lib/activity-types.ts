export const activityEntities = {
  order: "سفارش",
  account: "امنیت حساب مدیر",
  product: "محصول",
  settings: "تنظیمات",
  bases: "مدل پایه",
  designs: "طرح",
  categories: "دسته",
  collections: "کالکشن",
} as const;
export const activitySources: Record<string, string> = {
  checkout: "ثبت سفارش",
  admin: "مدیر",
  guest: "مشتری مهمان",
  expiry: "پایان مهلت پرداخت",
  "test-payment": "پرداخت آزمایشی",
};
export interface ActivityEvent {
  id: number;
  kind: "audit" | "lifecycle";
  actor: string;
  entity: string;
  entityId: string;
  action: string;
  at: number;
  details: {
    from?: string | null;
    to?: string;
    previousRevision?: number;
    newRevision?: number;
    shippingCodeChanged?: boolean;
    revokedSessions?: number;
  };
}
export interface ActivityPage {
  events: ActivityEvent[];
  page: number;
  pageCount: number;
  total: number;
}
