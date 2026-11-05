"use client";
import { useState } from "react";
import type { Product } from "@/lib/catalog";
import {
  stockAlerts,
  filterStockAlerts,
  LOW_STOCK_THRESHOLD,
} from "@/lib/inventory";
import { formatNumber } from "@/lib/format";
export function AdminInventory({
  products,
  busy,
  onSelect,
  onRefresh,
}: {
  products: Product[];
  busy: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [emptyOnly, setEmptyOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const alerts = stockAlerts(products);
  const filtered = filterStockAlerts(alerts, query, emptyOnly);
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const current = Math.min(page, pages);
  return (
    <details className="inventory-panel">
      <summary>
        رسیدگی به موجودی · {formatNumber(alerts.length)} گزینه کم‌موجود یا
        تمام‌شده
      </summary>
      <p className="muted">
        گزینه‌های فعال کالای آماده ارسال با موجودی حداکثر{" "}
        {formatNumber(LOW_STOCK_THRESHOLD)} عدد. مقدارها پس از کسر رزرو سفارش‌ها
        هستند؛ تولید پس از سفارش در این فهرست نیست.
      </p>
      <div className="inventory-controls">
        <label className="field">
          جست‌وجوی محصول، SKU، رنگ یا سایز
          <input
            maxLength={200}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="inventory-toggle">
          <input
            type="checkbox"
            checked={emptyOnly}
            onChange={(e) => {
              setEmptyOnly(e.target.checked);
              setPage(1);
            }}
          />
          فقط موجودی صفر
        </label>
        <button
          type="button"
          className="button outline"
          disabled={busy || refreshing}
          onClick={async () => {
            setRefreshing(true);
            setMessage("");
            try {
              if (await onRefresh()) setMessage("موجودی از سرور تازه شد.");
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "دریافت موجودی انجام نشد.",
              );
            } finally {
              setRefreshing(false);
            }
          }}
        >
          {refreshing ? "در حال دریافت…" : "تازه‌سازی موجودی"}
        </button>
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <p role="status">
        {formatNumber(filtered.length)} گزینه · اطلاعات ذخیره‌شده سرور؛
        پیش‌نویس‌ها در این فهرست محاسبه نمی‌شوند.
      </p>
      {filtered.length ? (
        <>
          <div
            className="inventory-scroll"
            tabIndex={0}
            role="region"
            aria-label="جدول کمبود موجودی"
          >
            <table className="inventory-table">
              <caption className="muted">
                برای تغییر موجودی، محصول را باز کن و فرم آن را ذخیره کن.
              </caption>
              <thead>
                <tr>
                  <th scope="col">محصول / SKU</th>
                  <th scope="col">رنگ / سایز</th>
                  <th scope="col">موجودی</th>
                  <th scope="col">رسیدگی</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice((current - 1) * 20, current * 20).map((row) => (
                  <tr key={row.sku}>
                    <th scope="row">
                      {row.name}
                      {row.customOnly && <small> · عرضه طرح مشتری</small>}
                      <br />
                      <bdi className="muted">{row.sku}</bdi>
                    </th>
                    <td>
                      {row.color} · {row.size || "استاندارد"}
                    </td>
                    <td>
                      {row.stock === 0
                        ? "تمام‌شده"
                        : formatNumber(row.stock) + " عدد"}
                    </td>
                    <td>
                      <button
                        className="button outline"
                        type="button"
                        disabled={busy || refreshing}
                        aria-label={
                          "ویرایش " +
                          row.name +
                          "، " +
                          row.color +
                          "، " +
                          (row.size || "استاندارد")
                        }
                        onClick={() => onSelect(row.productId)}
                      >
                        باز کردن محصول
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="pagination" aria-label="صفحه‌بندی کمبود موجودی">
            <button
              type="button"
              className="button outline"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              قبلی
            </button>
            <span>
              {formatNumber(current)} از {formatNumber(pages)}
            </span>
            <button
              type="button"
              className="button outline"
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
            >
              بعدی
            </button>
          </nav>
        </>
      ) : (
        <p className="empty-compact">
          گزینه‌ای با این فیلتر نیاز به رسیدگی ندارد.
        </p>
      )}
    </details>
  );
}
