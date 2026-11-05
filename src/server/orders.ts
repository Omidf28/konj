import { randomUUID } from "node:crypto";
import {
  db,
  transaction,
  settings,
  bumpProductRevision,
  addOrderEvent,
} from "./db.ts";
import { quoteCart } from "./pricing.ts";
import { AppError, hash } from "./security.ts";
import { validateAddress, type Address } from "./validation.ts";
import type { Quote } from "../lib/commerce-types.ts";
export interface OrderSnapshot extends Quote {
  version: 1;
  address: Address;
  requestHash: string;
  inventory: { sku: string; quantity: number }[];
  currency: "IRT";
  mode: "test";
}
export const statuses = [
  "awaiting_payment",
  "paid",
  "preparing",
  "ready",
  "shipped",
  "cancelled",
] as const;
export const statusLabels: Record<string, string> = {
  awaiting_payment: "در انتظار پرداخت",
  paid: "پرداخت‌شده (آزمایشی)",
  preparing: "در حال آماده‌سازی",
  ready: "آماده ارسال",
  shipped: "ارسال‌شده",
  cancelled: "لغوشده",
};
export function expireReservations() {
  return transaction(() => {
    const rows = db()
      .prepare(
        "SELECT id,snapshot FROM orders WHERE status='awaiting_payment' AND expires_at<?",
      )
      .all(Date.now());
    for (const row of rows) {
      const snapshot = JSON.parse(String(row.snapshot)) as OrderSnapshot;
      for (const entry of snapshot.inventory)
        db()
          .prepare("UPDATE variants SET stock=stock+? WHERE sku=?")
          .run(entry.quantity, entry.sku);
      for (const entry of snapshot.inventory) bumpProductRevision(entry.sku);
      db()
        .prepare(
          "UPDATE orders SET status='cancelled',revision=revision+1 WHERE id=?",
        )
        .run(String(row.id));
      addOrderEvent(String(row.id), "awaiting_payment", "cancelled", "expiry");
    }
    return rows.length;
  });
}
export function createOrder(
  owner: string,
  items: unknown,
  addressInput: unknown,
  key: unknown,
  expectedTotal?: number,
) {
  if (typeof key !== "string" || !/^[-a-zA-Z0-9]{20,80}$/.test(key))
    throw new AppError("کلید ثبت سفارش معتبر نیست.");
  const config = settings();
  if (!config.testMode || process.env.NODE_ENV === "production")
    throw new AppError(
      "ثبت سفارش آزمایشی در این محیط غیرفعال است. درگاه واقعی هنوز متصل نشده.",
      503,
    );
  const address = validateAddress(addressInput);
  const requestHash = hash(JSON.stringify({ items, address }));
  const tracking = hash(`${owner}:${key}:konj-track-v1`);
  expireReservations();
  return transaction(() => {
    const existing = db()
      .prepare(
        "SELECT id,snapshot FROM orders WHERE owner_hash=? AND idempotency_key=?",
      )
      .get(owner, key);
    if (existing) {
      if (JSON.parse(String(existing.snapshot)).requestHash !== requestHash)
        throw new AppError("این درخواست قبلاً با اطلاعات دیگری ثبت شده.", 409);
      return { id: String(existing.id), trackingToken: tracking };
    }
    if (
      db()
        .prepare(
          "SELECT 1 FROM closed_checkout_attempts WHERE owner_hash=? AND idempotency_key=?",
        )
        .get(owner, key)
    )
      throw new AppError(
        "این درخواست قبلاً بسته شده است؛ ثبت تازه به کلید تازه نیاز دارد.",
        409,
      );
    const quote = quoteCart(items, owner);
    if (expectedTotal !== undefined && expectedTotal !== quote.totalToman)
      throw new AppError(
        "قیمت تغییر کرده؛ سبد را دوباره بررسی و تأیید کنید.",
        409,
      );
    const inventory: { sku: string; quantity: number }[] = [];
    for (const item of quote.items) {
      const product = JSON.parse(
        String(
          db()
            .prepare("SELECT body FROM products WHERE id=?")
            .get(item.productId)?.body,
        ),
      );
      if (product.availability === "ready") {
        const result = db()
          .prepare("UPDATE variants SET stock=stock-? WHERE sku=? AND stock>=?")
          .run(item.quantity, item.sku, item.quantity);
        if (!result.changes)
          throw new AppError(
            "موجودی تغییر کرده؛ سبد را دوباره بررسی کنید.",
            409,
          );
        inventory.push({ sku: item.sku, quantity: item.quantity });
        bumpProductRevision(item.sku);
      }
    }
    const id = randomUUID();
    const snapshot: OrderSnapshot = {
      ...quote,
      version: 1,
      address,
      requestHash,
      inventory,
      currency: "IRT",
      mode: "test",
    };
    db()
      .prepare(
        "INSERT INTO orders(id,tracking_hash,owner_hash,idempotency_key,status,snapshot,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        hash(tracking),
        owner,
        key,
        "awaiting_payment",
        JSON.stringify(snapshot),
        Date.now(),
        Date.now() + 30 * 60e3,
      );
    addOrderEvent(id, null, "awaiting_payment", "checkout");
    for (const item of quote.items)
      if (item.custom)
        for (const print of [
          item.custom,
          ...(item.custom.additionalPrints || []),
        ])
          db()
            .prepare("INSERT OR IGNORE INTO order_uploads VALUES(?,?)")
            .run(id, print.uploadId);
    return { id, trackingToken: tracking };
  });
}
export function findOrder(tracking: string) {
  if (!/^[a-f0-9]{64}$/.test(tracking))
    throw new AppError("سفارش پیدا نشد.", 404);
  const row = db()
    .prepare("SELECT * FROM orders WHERE tracking_hash=?")
    .get(hash(tracking));
  if (!row) throw new AppError("سفارش پیدا نشد.", 404);
  return row;
}
export function getOrder(tracking: string) {
  expireReservations();
  const row = findOrder(tracking);
  const snapshot = JSON.parse(String(row.snapshot)) as OrderSnapshot;
  const events = db()
    .prepare(
      "SELECT from_status,to_status,source,created_at FROM order_events WHERE order_id=? ORDER BY id",
    )
    .all(String(row.id));
  // Only recorded expiry is authoritative; old timestamps alone do not explain cancellation.
  const cancellation = events.findLast((event) => event.to_status === "cancelled");
  return {
    id: String(row.id),
    status: String(row.status),
    statusLabel: statusLabels[String(row.status)],
    cancellationReason:
      row.status === "cancelled" && cancellation?.source === "expiry"
        ? "reservation_expired" as const
        : null,
    createdAt: Number(row.created_at),
    shippingCode: row.status === "shipped" ? String(row.shipping_code) : "",
    snapshot: {
      version: snapshot.version,
      items: snapshot.items,
      address: {
        name: snapshot.address.name,
        mobile: snapshot.address.mobile,
        province: snapshot.address.province,
        city: snapshot.address.city,
        address: snapshot.address.address,
        postalCode: snapshot.address.postalCode,
      },
      currency: snapshot.currency,
      mode: snapshot.mode,
      subtotalToman: snapshot.subtotalToman,
      shippingToman: snapshot.shippingToman,
      totalToman: snapshot.totalToman,
      testMode: snapshot.testMode,
    },
    testPaymentEnabled: process.env.NODE_ENV !== "production" && settings().testMode,
    expiresAt: Number(row.expires_at),
    revision: Number(row.revision),
    events: events.map((event) => ({
      from: event.from_status ? String(event.from_status) : null,
      status: String(event.to_status),
      at: Number(event.created_at),
    })),
  };
}
export interface PaymentProvider {
  readonly mode: "test" | "live";
  verify(
    orderId: string,
    amountToman: number,
  ): { reference: string; amountToman: number };
}
export class TestPaymentProvider implements PaymentProvider {
  readonly mode = "test" as const;
  verify(orderId: string, amountToman: number) {
    if (process.env.NODE_ENV === "production")
      throw new AppError("پرداخت آزمایشی در تولید ممنوع است.", 503);
    return { reference: `test-${orderId}`, amountToman };
  }
}
export function payTestOrder(tracking: string) {
  if (process.env.NODE_ENV === "production")
    throw new AppError("پرداخت آزمایشی در تولید ممنوع است.", 503);
  const config = settings();
  if (!config.testMode) throw new AppError("پرداخت آزمایشی غیرفعال است.", 503);
  expireReservations();
  return transaction(() => {
    const row = findOrder(tracking);
    const existing = db()
      .prepare("SELECT order_id FROM payments WHERE order_id=?")
      .get(String(row.id));
    if (existing) return { ok: true, duplicate: true };
    if (row.status !== "awaiting_payment")
      throw new AppError("این سفارش قابل پرداخت نیست.", 409);
    const snapshot = JSON.parse(String(row.snapshot)) as OrderSnapshot;
    const verified = new TestPaymentProvider().verify(
      String(row.id),
      snapshot.totalToman,
    );
    if (verified.amountToman !== snapshot.totalToman)
      throw new AppError("تأیید مبلغ ناموفق بود.", 409);
    db()
      .prepare("INSERT INTO payments VALUES(?,?,?,?)")
      .run(
        String(row.id),
        verified.reference,
        Date.now(),
        verified.amountToman,
      );
    db()
      .prepare(
        "UPDATE orders SET status='paid',revision=revision+1 WHERE id=? AND status='awaiting_payment'",
      )
      .run(String(row.id));
    addOrderEvent(String(row.id), "awaiting_payment", "paid", "test-payment");
    return { ok: true, duplicate: false };
  });
}

export function recoverOrder(owner: string, key: string) {
  if (!/^[-a-zA-Z0-9]{20,80}$/.test(key))
    throw new AppError("کلید درخواست معتبر نیست.");
  const row = db()
    .prepare("SELECT id FROM orders WHERE owner_hash=? AND idempotency_key=?")
    .get(owner, key);
  if (!row)
    throw new AppError(
      "درخواست قبلی هنوز به سفارش ثبت‌شده تبدیل نشده است.",
      404,
    );
  return {
    id: String(row.id),
    trackingToken: hash(owner + ":" + key + ":konj-track-v1"),
  };
}

export function cancelUnpaidOrder(tracking: string) {
  expireReservations();
  return transaction(() => {
    const order = findOrder(tracking);
    if (order.status === "cancelled") return { ok: true, duplicate: true };
    if (order.status !== "awaiting_payment")
      throw new AppError(
        "لغو مستقیم فقط برای سفارش پرداخت‌نشده ممکن است.",
        409,
      );
    const snapshot = JSON.parse(String(order.snapshot)) as OrderSnapshot;
    for (const item of snapshot.inventory) {
      db()
        .prepare("UPDATE variants SET stock=stock+? WHERE sku=?")
        .run(item.quantity, item.sku);
      bumpProductRevision(item.sku);
    }
    db()
      .prepare(
        "UPDATE orders SET status='cancelled',revision=revision+1 WHERE id=?",
      )
      .run(String(order.id));
    addOrderEvent(String(order.id), "awaiting_payment", "cancelled", "guest");
    return { ok: true, duplicate: false };
  });
}

export function closeCheckoutAttempt(owner: string, key: string) {
  if (!/^[-a-zA-Z0-9]{20,80}$/.test(key))
    throw new AppError("کلید درخواست معتبر نیست.");
  return transaction(() => {
    const row = db()
      .prepare("SELECT id FROM orders WHERE owner_hash=? AND idempotency_key=?")
      .get(owner, key);
    if (row)
      return {
        closed: false,
        id: String(row.id),
        trackingToken: hash(owner + ":" + key + ":konj-track-v1"),
      };
    db()
      .prepare("INSERT OR IGNORE INTO closed_checkout_attempts VALUES(?,?,?)")
      .run(owner, key, Date.now());
    return { closed: true };
  });
}
