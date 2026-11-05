"use client";
import { useEffect, useState } from "react";
import {
  activityEntities,
  activitySources,
  type ActivityPage,
} from "@/lib/activity-types";
import { orderStatusLabels } from "@/lib/order-status";
import { formatNumber } from "@/lib/format";
export function AdminActivity({
  entity,
  entityId = "",
  revision = 0,
}: {
  entity?: keyof typeof activityEntities;
  entityId?: string;
  revision?: number;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: ActivityPage;
    error?: string;
  } | null>(null);
  const kind = entity || filter;
  const key = JSON.stringify([kind, entityId, page, attempt, revision]);
  const current = result?.key === key ? result : null;
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    let active = true;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, 15000);
    fetch(
      "/api/admin/activity?entity=" +
        encodeURIComponent(kind) +
        "&id=" +
        encodeURIComponent(entityId) +
        "&page=" +
        page,
      { signal: abort.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw Error(data.error || "خواندن تاریخچه انجام نشد.");
        if (active) setResult({ key, data });
      })
      .catch((error) => {
        if (active && (timedOut || !abort.signal.aborted))
          setResult({
            key,
            error: timedOut
              ? "دریافت تاریخچه طول کشید؛ دوباره تلاش کنید."
              : error instanceof Error && error.name !== "TypeError"
                ? error.message
                : "ارتباط با تاریخچه برقرار نشد.",
          });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [open, kind, entityId, page, key]);
  return (
    <section className="admin-activity">
      <button
        type="button"
        className="button outline"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open
          ? "بستن تاریخچه"
          : entity === "order"
            ? "نمایش تاریخچه این سفارش"
            : "نمایش تاریخچه عملیات مدیریت"}
      </button>
      {open && (
        <div>
          <p className="muted">
            فقط رخدادهای ثبت‌شده نمایش داده می‌شوند؛ برای اطلاعات قدیمی
            تاریخچه‌ای ساخته نشده است. رخداد تغییر وضعیت و ثبت عملیات مدیر دو
            سابقه جدا هستند.
          </p>
          <div className="activity-controls">
            {!entity && (
              <label className="field">
                نوع رکورد
                <select
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">همه</option>
                  {Object.entries(activityEntities).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className="button outline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              تازه‌سازی تاریخچه
            </button>
          </div>
          {!current && <p role="status">در حال خواندن تاریخچه…</p>}
          {current?.error && (
            <p role="alert" className="notice danger">
              {current.error}
            </p>
          )}
          {current?.data && (
            <>
              <p>{formatNumber(current.data.total)} رخداد ثبت‌شده</p>
              {!current.data.events.length ? (
                <p className="empty-compact">
                  هنوز رخدادی برای این فیلتر ثبت نشده است.
                </p>
              ) : (
                <ol className="activity-list">
                  {current.data.events.map((event) => (
                    <li key={event.kind + ":" + event.id}>
                      <div className="activity-heading">
                        <strong>
                          {event.kind === "lifecycle"
                            ? "تغییر وضعیت سفارش"
                            : event.action === "password_reset"
                              ? "بازیابی رمز توسط مالک سرور"
                              : event.action === "password_changed"
                                ? "تغییر رمز مدیر"
                                : event.action === "sessions_revoked"
                                  ? "خروج نشست‌های دیگر"
                                  : event.action === "create"
                                    ? "ایجاد رکورد"
                                    : "عملیات مدیر"}
                        </strong>
                        <time dateTime={new Date(event.at).toISOString()}>
                          {new Intl.DateTimeFormat("fa-IR", {
                            timeZone: "Asia/Tehran",
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(event.at)}
                        </time>
                      </div>
                      <p>
                        {event.kind === "lifecycle"
                          ? activitySources[event.actor] || "منبع ثبت‌شده"
                          : "مدیر: " + event.actor}{" "}
                        ·{" "}
                        {activityEntities[
                          event.entity as keyof typeof activityEntities
                        ] || event.entity}{" "}
                        · <bdi>{event.entityId}</bdi>
                      </p>
                      {event.details.revokedSessions !== undefined && (
                        <p>
                          نشست‌های فعال بسته‌شده:{" "}
                          {formatNumber(event.details.revokedSessions)}
                        </p>
                      )}
                      {event.details.to && (
                        <p>
                          {event.details.from
                            ? orderStatusLabels[event.details.from]
                            : "شروع سفارش"}{" "}
                          ← {orderStatusLabels[event.details.to]}
                        </p>
                      )}
                      {event.details.newRevision !== undefined && (
                        <p>
                          نسخه{" "}
                          {event.details.previousRevision !== undefined
                            ? formatNumber(event.details.previousRevision) +
                              " ← "
                            : ""}
                          {formatNumber(event.details.newRevision)}
                        </p>
                      )}
                      {event.details.shippingCodeChanged && (
                        <p>کد رهگیری ارسال تغییر کرد.</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              <div className="pagination">
                <button
                  type="button"
                  className="button outline"
                  disabled={current.data.page <= 1}
                  onClick={() => setPage(current.data!.page - 1)}
                >
                  صفحه قبل
                </button>
                <span>
                  {formatNumber(current.data.page)} از{" "}
                  {formatNumber(current.data.pageCount)}
                </span>
                <button
                  type="button"
                  className="button outline"
                  disabled={current.data.page >= current.data.pageCount}
                  onClick={() => setPage(current.data!.page + 1)}
                >
                  صفحه بعد
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
