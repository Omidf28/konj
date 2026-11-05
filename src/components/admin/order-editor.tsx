"use client";
import { useEffect, useRef, useState } from "react";
import { orderTransitions, orderStatusLabels } from "@/lib/order-status";
import {
  inspectOrderDraft,
  orderDraftChanged,
  type OrderEditDraft,
} from "@/lib/order-draft";
import type { AdminOrder } from "./orders";
export type AdminOrderSave = (value: unknown, report: (message: string, isError: boolean) => void) => Promise<boolean>;
export function AdminOrderEditor({
  order,
  value,
  busy,
  onChange,
  onDiscard,
  onSave,
  onRefresh,
}: {
  order: AdminOrder;
  value: unknown;
  busy: boolean;
  onChange: (value: OrderEditDraft | null) => void;
  onDiscard: (expected: unknown) => void;
  onSave: AdminOrderSave;
  onRefresh: () => Promise<void>;
}) {
  const inFlight = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const pendingRefreshFocus = useRef(false);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState<{ message: string; isError: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!pendingRefreshFocus.current || notice) return;
    pendingRefreshFocus.current = false;
    if (document.activeElement !== document.body && !panel.current?.contains(document.activeElement)) return;
    const target = panel.current?.querySelector<HTMLElement>("[data-order-conflict], select:not(:disabled)") || panel.current;
    target?.focus();
  }, [notice]);
  const { draft, state } = inspectOrderDraft(order, value);
  const blocked = state === "conflict" || state === "invalid";
  function change(
    patch: Partial<Pick<OrderEditDraft, "status" | "shippingCode">>,
  ) {
    if (blocked) return;
    setNotice(null);
    const next = { ...draft, ...patch };
    onChange(orderDraftChanged(next) ? next : null);
  }
  return (
    <div className="order-edit-panel" ref={panel} tabIndex={-1}>
      {state === "dirty" && (
        <p role="status" className="draft-notice">
          ویرایش این سفارش هنوز ثبت نشده و در همین تب حفظ می‌شود.
        </p>
      )}
      {state === "invalid" && (
        <p role="alert" className="notice danger">
          پیش‌نویس این سفارش قابل خواندن نیست؛ بازنویسی خودکار متوقف شد. برای
          استفاده از نسخه سرور، بازگشت به اطلاعات ذخیره‌شده را بزن.
        </p>
      )}
      {state === "conflict" && (
        <div role="alert" className="notice danger" data-order-conflict tabIndex={-1}>
          <p>
            سفارش پس از شروع ویرایش تغییر کرده است. پیش‌نویس قدیمی حفظ شده؛ برای
            جلوگیری از بازنویسی، ثبت آن بسته است.
          </p>
          <p>
            نسخه سرور: {orderStatusLabels[order.status]} · کد ارسال:{" "}
            <bdi>{order.shippingCode || "ثبت نشده"}</bdi>
          </p>
          <p>
            پیش‌نویس تو: {orderStatusLabels[draft.status]} · کد ارسال:{" "}
            <bdi>{draft.shippingCode || "ثبت نشده"}</bdi>
          </p>
        </div>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (inFlight.current || busy || blocked || state !== "dirty") return;
          inFlight.current = true;
          setNotice(null);
          try {
            if (
              await onSave({
                id: order.id,
                status: draft.status,
                shippingCode: draft.shippingCode,
                revision: draft.revision,
              }, (message, isError) => setNotice({ message, isError }))
            )
              onDiscard(value);
          } finally {
            inFlight.current = false;
          }
        }}
      >
        <fieldset
          disabled={busy || blocked}
          className="form-grid editor-fieldset"
        >
          <legend>وضعیت و کد ارسال</legend>
          <label className="field">
            وضعیت مجاز بعدی
            <select
              value={blocked ? order.status : draft.status}
              onChange={(event) => change({ status: event.target.value })}
            >
              {[order.status, ...(orderTransitions[order.status] || [])].map(
                (status) => (
                  <option key={status} value={status}>
                    {orderStatusLabels[status]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="field">
            کد رهگیری ارسال
            <input
              maxLength={100}
              value={draft.shippingCode}
              required={draft.status === "shipped"}
              onChange={(event) => change({ shippingCode: event.target.value })}
            />
          </label>
          <button
            className="button primary"
            disabled={busy || blocked || state !== "dirty"}
          >
            ثبت وضعیت و کد
          </button>
        </fieldset>
      </form>
      {notice && (
        <div role={notice.isError ? "alert" : "status"} className={"notice" + (notice.isError ? " danger" : "")}>
          <p>{notice.message}</p>
          {notice.isError && (
            <button
              type="button"
              className="button outline"
              ref={refreshButton}
              disabled={refreshing}
              onClick={async () => {
                if (refreshing) return;
                setRefreshing(true);
                pendingRefreshFocus.current = false;
                try {
                  await onRefresh();
                  pendingRefreshFocus.current = document.activeElement === refreshButton.current || document.activeElement === document.body;
                  setNotice(null);
                } catch (error) {
                  pendingRefreshFocus.current = false;
                  setNotice({ message: error instanceof Error ? error.message : "دریافت اطلاعات تازه انجام نشد؛ پیش‌نویس حفظ شده است.", isError: true });
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              {refreshing ? "در حال دریافت نسخه تازه…" : "دریافت نسخه تازه همین سفارش"}
            </button>
          )}
        </div>
      )}
      {value !== undefined && (
        <button
          type="button"
          className="text-link"
          disabled={busy}
          onClick={() => onDiscard(value)}
        >
          برگشت به اطلاعات ذخیره‌شده این سفارش
        </button>
      )}
    </div>
  );
}
