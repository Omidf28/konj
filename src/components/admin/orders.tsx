"use client";
import { AdminActivity } from "./activity";
import Image from "next/image";
import { formatPrice, formatNumber } from "@/lib/format";
import { AdminOrderEditor, type AdminOrderSave } from "./order-editor";
import { orderDraftKey, type OrderEditDraft } from "@/lib/order-draft";
import type { adminData } from "@/server/admin";
export type AdminOrder = ReturnType<typeof adminData>["orders"][number];
export function AdminOrders({
  orders,
  busy,
  onSave,
  onRefresh,
  drafts,
  onDraftChange,
  onDraftDiscard,
}: {
  orders: AdminOrder[];
  busy: boolean;
  drafts: Record<string, object>;
  onDraftChange: (id: string, value: OrderEditDraft | null) => void;
  onDraftDiscard: (id: string, expected: unknown) => void;
  onSave: AdminOrderSave;
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="admin-orders">
      {orders.length === 0 && (
        <p className="empty-compact">سفارشی با این فیلتر پیدا نشد.</p>
      )}
      {orders.map((order) => (
        <details className="admin-order" key={order.id}>
          <summary>
            <span>
              {order.snapshot.address.name}
              {drafts[orderDraftKey(order.id)] && (
                <small className="order-draft-badge"> · پیش‌نویس</small>
              )}
            </span>
            <span className="order-status-badge">{order.statusLabel}</span>
            <strong>{formatPrice(order.snapshot.totalToman)}</strong>
          </summary>
          <div className="order-meta">
            <span>سفارش آزمایشی</span>
            <time dateTime={new Date(order.createdAt).toISOString()}>
              {new Intl.DateTimeFormat("fa-IR", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Tehran",
              }).format(order.createdAt)}
            </time>
            <bdi>{order.id}</bdi>
          </div>
          <a
            className="button outline"
            href={`/api/admin/orders/${order.id}/production`}
          >
            مشخصات کامل سفارش (JSON)
          </a>
          <div className="checks admin-sheet-links">
            <a
              className="button outline"
              target="_blank"
              rel="noopener noreferrer"
              href={`/api/admin/orders/${order.id}/production?view=workshop&format=html`}
            >
              برگه چاپ تولید
            </a>
            <a
              className="button outline"
              target="_blank"
              rel="noopener noreferrer"
              href={`/api/admin/orders/${order.id}/production?view=packing&format=html`}
            >
              برگه بسته‌بندی و ارسال
            </a>
            <a
              className="text-link"
              href={`/api/admin/orders/${order.id}/production?view=workshop`}
            >
              مشخصات تولید بدون اطلاعات گیرنده (JSON)
            </a>
          </div>
          <dl className="recipient-details">
            <dt>گیرنده</dt>
            <dd>{order.snapshot.address.name}</dd>
            <dt>موبایل</dt>
            <dd>
              <bdi>{order.snapshot.address.mobile}</bdi>
            </dd>
            <dt>نشانی</dt>
            <dd>
              {order.snapshot.address.province}، {order.snapshot.address.city}،{" "}
              {order.snapshot.address.address}
            </dd>
            <dt>کد پستی</dt>
            <dd>
              <bdi>{order.snapshot.address.postalCode}</bdi>
            </dd>
            {order.snapshot.address.note && (
              <>
                <dt>توضیحات</dt>
                <dd>{order.snapshot.address.note}</dd>
              </>
            )}
          </dl>
          {order.snapshot.items.map((item) => (
            <article className="production-item" key={item.key}>
              <h3>{item.name}</h3>
              <p>
                {item.color} · {item.size || "استاندارد"} ·{" "}
                {formatNumber(item.quantity)} عدد ·{" "}
                {formatPrice(item.lineTotalToman)}
              </p>
              <small>
                SKU: <bdi>{item.sku}</bdi>
              </small>
              {item.custom && (
                <div className="production-prints">
                  {[item.custom, ...(item.custom.additionalPrints || [])].map(
                    (print) => (
                      <section key={print.side}>
                        <Image
                          src={"/api/uploads/" + print.uploadId}
                          width={150}
                          height={150}
                          unoptimized
                          alt={
                            "پیش‌نمایش تأییدشده " +
                            (print.side === "front" ? "جلو" : "پشت")
                          }
                        />
                        <h4>چاپ {print.side === "front" ? "جلو" : "پشت"}</h4>
                        <p>
                          {print.widthCm.toFixed(1)} ×{" "}
                          {print.heightCm.toFixed(1)} cm · موقعیت{" "}
                          {print.xCm.toFixed(1)}، {print.yCm.toFixed(1)} cm
                        </p>
                        <a
                          className="text-link"
                          href={
                            "/api/uploads/" + print.uploadId + "?original=1"
                          }
                        >
                          دریافت فایل اصلی چاپ ↓
                        </a>
                      </section>
                    ),
                  )}
                </div>
              )}
            </article>
          ))}
          <AdminActivity
            entity="order"
            entityId={order.id}
            revision={order.revision}
          />
          <div className="order-costs">
            <p>جمع اقلام: {formatPrice(order.snapshot.subtotalToman)}</p>
            <p>ارسال: {formatPrice(order.snapshot.shippingToman)}</p>
          </div>
          <AdminOrderEditor
            order={order}
            value={drafts[orderDraftKey(order.id)]}
            busy={busy}
            onSave={onSave}
            onRefresh={onRefresh}
            onChange={(value) => onDraftChange(order.id, value)}
            onDiscard={(expected) => onDraftDiscard(order.id, expected)}
          />
          <p className="muted">
            تأیید پرداخت از این فرم امکان‌پذیر نیست. لغو، موجودی رزروشده را فقط
            یک بار برمی‌گرداند.
          </p>
        </details>
      ))}
    </div>
  );
}
