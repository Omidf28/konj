"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import { performAdminMutation } from "@/lib/admin-mutation";
import { createLatestRead } from "@/lib/latest-read";
import { useAdminDrafts } from "./hooks/use-admin-drafts";
import type { adminData } from "@/server/admin";
import type { StoreSettings } from "@/server/db";
import type { Product } from "@/lib/catalog";
import type { BaseModel } from "@/lib/base-model";
import {
  orderDraftKey,
  discardMatchingOrderDraft,
  type OrderEditDraft,
} from "@/lib/order-draft";
import { orderStatusLabels } from "@/lib/order-status";
import { formatNumber, formatBytes } from "@/lib/format";
import {
  ProductForm,
  type EditorCatalog,
  type DesignRecord,
} from "./admin/product-form";
import { BaseForm, SettingsForm, DesignForm } from "./admin/resource-forms";
import { AdminAccount } from "./admin/account";
import { AdminActivity } from "./admin/activity";
import { AdminInventory } from "./admin/inventory";
import { AdminOrders } from "./admin/orders";
import { TextField } from "./admin/fields";
type Data = ReturnType<typeof adminData> & { draftScope: string };
type Resource =
  "products" | "bases" | "designs" | "categories" | "collections" | "settings";
type RecordValue =
  | OrderEditDraft
  | Product
  | BaseModel
  | DesignRecord
  | StoreSettings
  | { id: string; label: string; description?: string };
const labels: Record<Resource, string> = {
  products: "محصول و موجودی",
  bases: "مدل پایه و سایزبندی",
  designs: "طرح چاپ",
  categories: "دسته‌ها",
  collections: "کالکشن‌ها",
  settings: "تنظیمات فروشگاه",
};
async function readAdminData(
  url: string,
  signal: AbortSignal,
): Promise<Data | null> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (response.status === 401 || response.status === 403) return null;
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error("پاسخ مدیریت قابل خواندن نبود؛ دوباره تلاش کنید.");
  }
  if (!response.ok)
    throw Error(
      typeof result.error === "string"
        ? result.error
        : "دریافت اطلاعات مدیریت انجام نشد.",
    );
  return result as Data;
}
export function Admin() {
  const [reader] = useState(() => createLatestRead());
  const [data, setData] = useState<Data | null>(null);
  const handleSessionExpired = useCallback(() => {
    reader.cancel();
    setData(null);
  }, [reader]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const mutation = useRef<AbortController | null>(null);
  const [reviewRequired, setReviewRequired] = useState(false);
  useEffect(() => () => mutation.current?.abort(), []);
  const [accountBusy, setAccountBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [resource, setResource] = useState<Resource>("products");
  const [selected, setSelected] = useState("");
  const {
    values: drafts,
    setValues: setDrafts,
    warning: draftWarning,
    clear: clearDrafts,
  } = useAdminDrafts<RecordValue>(data?.draftScope);
  const [query, setQuery] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    query: "",
    status: "",
  });
  const dirty = Object.keys(drafts).length;
  useEffect(() => {
    void reader
      .run((signal) => readAdminData("/api/admin/data", signal), setData)
      .then((applied) => {
        if (applied) setLoading(false);
      })
      .catch(() => {
        setMessage(
          "ارتباط با مدیریت برقرار نشد؛ صفحه را تازه کنید یا دوباره وارد شوید.",
        );
        setIsError(true);
        setLoading(false);
      });
    return () => reader.cancel();
  }, [reader]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  async function refresh(
    search = appliedFilters.query,
    page = data?.page || 1,
    status = appliedFilters.status,
  ) {
    return reader.run(
      (signal) =>
        readAdminData(
          "/api/admin/data?q=" +
            encodeURIComponent(search) +
            "&page=" +
            page +
            "&status=" +
            encodeURIComponent(status),
          signal,
        ),
      (result) => {
        setData(result);
        if (result) {
          setAppliedFilters({ query: search, status });
          setReviewRequired(false);
          setMessage("");
          setIsError(false);
        }
        if (!result)
          throw Error(
            "نشست مدیر تمام شده؛ دوباره وارد شوید. پیش‌نویس‌های این تب برای همین حساب حفظ شده‌اند.",
          );
      },
    );
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.current || accountBusy) return;
    const fields = new FormData(event.currentTarget);
    const passwordInput = event.currentTarget.elements.namedItem("password");
    if (passwordInput instanceof HTMLInputElement) passwordInput.value = "";
    const controller = new AbortController();
    mutation.current = controller;
    setBusy(true);
    reader.cancel();
    try {
      const result = await performAdminMutation(
        "/api/admin/login",
        Object.fromEntries(fields),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (result.outcome !== "confirmed") throw Error(result.error);
      if (!(await refresh("", 1, ""))) return;
      setQuery("");
      setOrderStatus("");
      setMessage("ورود موفق بود.");
      setIsError(false);
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessage(error instanceof Error ? error.message : "ورود ناموفق بود.");
        setIsError(true);
      }
    } finally {
      if (mutation.current === controller) mutation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function save(kind: string, value: unknown, report?: (message: string, isError: boolean) => void): Promise<boolean> {
    if (mutation.current || accountBusy || uploadBusy || reviewRequired)
      return false;
    const notify = (message: string, isError: boolean) => {
      setMessage(message);
      setIsError(isError);
      report?.(message, isError);
    };
    const controller = new AbortController();
    mutation.current = controller;
    setBusy(true);
    reader.cancel();
    let saveState: "unknown" | "confirmed" | "rejected" = "unknown";
    try {
      const result = await performAdminMutation(
        "/api/admin/data",
        { kind, value },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return false;
      saveState = result.outcome;
      if (result.status === 401) setData(null);
      if (result.outcome !== "confirmed") {
        if (result.outcome === "unknown") setReviewRequired(true);
        throw Error(result.error);
      }
      if (!(await refresh())) {
        notify("ذخیره انجام شد؛ دریافت اطلاعات تازه با درخواست دیگری جایگزین شد. پیش‌نویس تا بررسی نسخه تازه حفظ شده است.", true);
        return false;
      }
      notify("تغییرات با موفقیت ذخیره شد.", false);
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      const detail =
        error instanceof Error ? error.message : "ارتباط با مدیریت برقرار نشد.";
      notify(
        saveState === "confirmed"
          ? "تغییرات در سرور ذخیره شد، اما اطلاعات تازه دریافت نشد. پیش از ذخیره مجدد، اطلاعات را تازه کنید. " +
              detail
          : saveState === "unknown"
            ? "نتیجه ذخیره مشخص نشد. پیش از تکرار، اطلاعات تازه سرور را بررسی کنید؛ پیش‌نویس حفظ شده است. " +
              detail
            : detail,
        true,
      );
      return false;
    } finally {
      if (mutation.current === controller) mutation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  if (loading)
    return (
      <p role="status" className="loading-state">
        در حال بررسی نشست مدیریت…
      </p>
    );
  if (!data)
    return (
      <>
        <p className="notice">
          ورود امن مدیر؛ رمز پیش‌فرض وجود ندارد. حساب اولیه با دستور محلی
          مستندشده ساخته می‌شود.
        </p>
        <form onSubmit={login} className="admin-login">
          <label className="field">
            نام کاربری
            <input
              name="username"
              autoComplete="username"
              required
              maxLength={50}
            />
          </label>
          <label className="field">
            رمز عبور
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={512}
            />
          </label>
          <button className="button primary" disabled={busy || accountBusy}>
            {busy ? "در حال ورود…" : "ورود مدیر"}
          </button>
        </form>
        <button
          type="button"
          className="button outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void refresh("", 1, "")
              .then(() => {
                setMessage("نشست مدیریت تأیید شد.");
                setIsError(false);
              })
              .catch((error) => {
                setMessage(error.message);
                setIsError(true);
              })
              .finally(() => setBusy(false));
          }}
        >
          بررسی دوباره نشست
        </button>
        {message && (
          <p role="alert" className="notice danger">
            {message}
          </p>
        )}
      </>
    );
  const catalog: EditorCatalog = {
    media: data.media,
    products: data.products,
    bases: data.bases as BaseModel[],
    designs: data.designs as DesignRecord[],
    categories: data.categories as EditorCatalog["categories"],
    collections: data.collections as EditorCatalog["collections"],
  };
  const records =
    resource === "settings"
      ? []
      : (data[resource] as {
          id: string;
          name?: string;
          label?: string;
          title?: string;
        }[]);
  const id = selected || records[0]?.id || "new";
  const draftKey = resource + ":" + id;
  const current = (drafts[draftKey] ||
    (resource === "settings"
      ? data.settings
      : records.find((record) => record.id === id))) as RecordValue | undefined;
  const savedCurrent = (
    resource === "settings"
      ? data.settings
      : records.find((record) => record.id === id)
  ) as (RecordValue & { revision?: number }) | undefined;
  const draftRevision = (drafts[draftKey] as { revision?: number } | undefined)
    ?.revision;
  const conflict =
    !!drafts[draftKey] &&
    draftRevision !== undefined &&
    savedCurrent?.revision !== draftRevision;
  const change = (value: RecordValue) =>
    setDrafts((existing) => ({ ...existing, [draftKey]: value }));
  function create() {
    const base = catalog.bases[0];
    let value: RecordValue;
    if (resource === "products")
      value = {
        id: "",
        name: "",
        category: base?.category || "tshirt",
        baseId: base?.id || "",
        designId: catalog.designs[0]?.id || "",
        collection: catalog.collections[0]?.id || "",
        description: "",
        priceToman: 0,
        availability: "unavailable",
        preparationDays: 7,
        motif: catalog.designs[0]?.motif || "offline",
        colors: [{ name: "مشکی", hex: "#24272b" }],
        variants: [],
      };
    else if (resource === "bases")
      value = {
        id: "",
        name: "",
        category: catalog.categories[0]?.id || "tshirt",
        material: "",
        sizes: [],
        printArea: { widthCm: 28, heightCm: 35 },
        basePriceToman: 0,
        customEnabled: false,
        backPrintEnabled: false,
      };
    else if (resource === "designs")
      value = { id: "", title: "", motif: "offline" };
    else value = { id: "", label: "", description: "" };
    setSelected("new");
    setDrafts((existing) => ({ ...existing, [resource + ":new"]: value }));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!current || conflict) return;
    const key = draftKey;
    if (
      await save(resource, {
        ...current,
        _createOnly: id === "new" && resource !== "settings",
      })
    ) {
      setDrafts((existing) => {
        const remaining = { ...existing };
        if (remaining[key] !== current) return existing;
        delete remaining[key];
        return remaining;
      });
      if ("id" in current) setSelected(current.id);
    }
  }
  return (
    <>
      <div className="admin-topbar">
        <p>پنل مدیریت · تمام سفارش‌های فعلی آزمایشی‌اند.</p>
        <button
          className="button outline"
          disabled={busy || accountBusy}
          onClick={async () => {
            if (mutation.current || accountBusy) return;
            const controller = new AbortController();
            mutation.current = controller;
            setBusy(true);
            reader.cancel();
            try {
              const result = await performAdminMutation(
                "/api/admin/logout",
                undefined,
                { signal: controller.signal },
              );
              if (controller.signal.aborted) return;
              if (result.outcome !== "confirmed") throw Error(result.error);
              reader.cancel();
              clearDrafts();
              setData(null);
              setMessage("خروج انجام شد.");
              setIsError(false);
            } catch (error) {
              if (!controller.signal.aborted) {
                setMessage(error instanceof Error ? error.message : "خطا");
                setIsError(true);
              }
            } finally {
              if (mutation.current === controller) mutation.current = null;
              if (!controller.signal.aborted) setBusy(false);
            }
          }}
        >
          خروج امن
        </button>
      </div>
      <div className="admin-dashboard">
        {[
          [data.dashboard.products, "محصول"],
          [data.dashboard.orders, "سفارش آزمایشی"],
          [data.dashboard.pending, "در انتظار پرداخت"],
          [data.dashboard.lowStock, "گزینه با موجودی کم"],
        ].map(([value, label]) => (
          <div key={String(label)}>
            <strong>{formatNumber(Number(value))}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <AdminInventory
        products={data.products}
        busy={busy || accountBusy || uploadBusy}
        onRefresh={() => refresh()}
        onSelect={(productId) => {
          setResource("products");
          setSelected(productId);
          requestAnimationFrame(() =>
            document.getElementById("admin-editor-title")?.focus(),
          );
        }}
      />
      <AdminAccount
        onSessionExpired={handleSessionExpired}
        busy={busy || uploadBusy}
        onBusyChange={setAccountBusy}
      />
      <AdminActivity />
      <section className="storage-panel">
        <div>
          <h2>فضای فایل‌های فروشگاه</h2>
          <p>
            {formatBytes(data.storage.totalBytes)} از{" "}
            {formatBytes(data.storage.limitBytes)}
          </p>
        </div>
        <progress
          max={data.storage.limitBytes}
          value={data.storage.totalBytes}
          aria-label="فضای مصرف‌شده فایل‌ها"
        />
        <p className="muted">
          فایل مشتری: {formatBytes(data.storage.uploadsBytes)} · تصاویر و اصل
          طرح‌های فروشگاه: {formatBytes(data.storage.mediaBytes)}
        </p>
        {data.storage.unmeasuredMedia > 0 && (
          <p className="field-error">
            اندازه {formatNumber(data.storage.unmeasuredMedia)} تصویر قدیمی قابل
            خواندن نبود؛ مسیر فایل‌ها و بکاپ را بررسی کنید.
          </p>
        )}
      </section>
      {reviewRequired && (
        <p role="alert" className="notice danger">
          نتیجه ذخیره قبلی مشخص نیست؛ پیش از ذخیره دوباره، «دریافت اطلاعات تازه»
          را بزنید. پیش‌نویس حفظ شده است.
        </p>
      )}
      {message && (
        <p
          role={isError ? "alert" : "status"}
          className={"notice " + (isError ? "danger" : "success")}
        >
          {message}
        </p>
      )}
      {draftWarning && (
        <p role="alert" className="notice danger">
          {draftWarning}
        </p>
      )}
      {dirty > 0 && (
        <p className="draft-notice">
          {formatNumber(dirty)} پیش‌نویس ذخیره‌نشده دارید. در همین تب مرورگر با
          تازه‌سازی صفحه یا بازگشت به مدیریت بازیابی می‌شوند؛ خروج امن نسخه این
          تب را پاک می‌کند.
        </p>
      )}
      <div className="admin-workspace">
        <nav className="admin-resource-nav" aria-label="بخش‌های مدیریت">
          {(Object.keys(labels) as Resource[]).map((kind) => (
            <button
              className={
                "button " + (resource === kind ? "primary" : "outline")
              }
              aria-pressed={resource === kind}
              key={kind}
              disabled={busy || accountBusy}
              onClick={() => {
                setResource(kind);
                setSelected("");
              }}
            >
              {labels[kind]}
            </button>
          ))}
        </nav>
        <div className="admin-editor-layout">
          <aside className="admin-records">
            {resource !== "settings" && (
              <button
                className="button primary"
                type="button"
                disabled={busy || accountBusy}
                onClick={create}
              >
                ＋ ساخت مورد جدید
              </button>
            )}
            {records.map((record) => (
              <button
                type="button"
                key={record.id}
                className={
                  "record-select " + (record.id === id ? "active" : "")
                }
                onClick={() => setSelected(record.id)}
              >
                <span>
                  {record.name || record.label || record.title || record.id}
                </span>
                <small dir="ltr">
                  {record.id}
                  {drafts[resource + ":" + record.id] ? " *" : ""}
                </small>
              </button>
            ))}
          </aside>
          <section className="admin-form-panel">
            <h2 id="admin-editor-title" tabIndex={-1}>
              {labels[resource]}
            </h2>
            {conflict && (
              <div
                id="admin-resource-conflict"
                role="alert"
                className="notice danger"
              >
                <p>
                  نسخه ذخیره‌شده تغییر کرده است؛ پیش‌نویس شما حفظ شده و ثبت آن
                  بسته است. پیش از ادامه، دو نسخه را مقایسه کنید.
                </p>
                <div className="conflict-comparison">
                  <details>
                    <summary>نسخه تازه ذخیره‌شده</summary>
                    <pre dir="ltr">{JSON.stringify(savedCurrent, null, 2)}</pre>
                  </details>
                  <details>
                    <summary>پیش‌نویس فعلی شما</summary>
                    <pre dir="ltr">{JSON.stringify(current, null, 2)}</pre>
                  </details>
                </div>
                <p>
                  با «برگشت به اطلاعات ذخیره‌شده» می‌توانید نسخه تازه را مبنا
                  قرار دهید؛ مقادیر موجودی قدیمی را بدون بررسی کپی نکنید.
                </p>
              </div>
            )}
            {uploadBusy && (
              <p role="status" className="notice">
                در حال تکمیل تصویر؛ پس از پایان می‌توانید فرم را ذخیره کنید.
              </p>
            )}
            {current ? (
              <form onSubmit={submit}>
                <fieldset
                  key={draftKey}
                  disabled={busy || accountBusy || uploadBusy}
                  className="editor-fieldset"
                >
                  {resource === "products" ? (
                    <ProductForm
                      value={current as Product}
                      onChange={change}
                      data={catalog}
                      onUploadBusy={setUploadBusy}
                    />
                  ) : resource === "bases" ? (
                    <BaseForm
                      value={current as BaseModel}
                      onChange={change}
                      data={catalog}
                      existing={id !== "new"}
                    />
                  ) : resource === "designs" ? (
                    <DesignForm
                      value={current as DesignRecord}
                      onUploadBusy={setUploadBusy}
                      onChange={change}
                      existing={id !== "new"}
                    />
                  ) : resource === "settings" ? (
                    <SettingsForm
                      value={current as StoreSettings}
                      onChange={change}
                    />
                  ) : (
                    <>
                      <TextField
                        label="شناسه ثابت انگلیسی"
                        value={(current as { id: string }).id}
                        readOnly={id !== "new"}
                        required
                        onChange={(id) =>
                          change({ ...current, id } as RecordValue)
                        }
                      />
                      <TextField
                        label="نام نمایشی"
                        value={(current as { label: string }).label}
                        required
                        onChange={(label) =>
                          change({ ...current, label } as RecordValue)
                        }
                      />
                      <TextField
                        label="توضیح کوتاه"
                        value={
                          (current as { description?: string }).description ||
                          ""
                        }
                        multiline
                        onChange={(description) =>
                          change({ ...current, description } as RecordValue)
                        }
                      />
                    </>
                  )}
                </fieldset>
                <div className="admin-savebar">
                  <button
                    className="button primary"
                    aria-describedby={
                      conflict ? "admin-resource-conflict" : undefined
                    }
                    disabled={
                      busy ||
                      accountBusy ||
                      uploadBusy ||
                      conflict ||
                      reviewRequired ||
                      !drafts[draftKey]
                    }
                  >
                    {busy ? "در حال ذخیره…" : "ذخیره تغییرات"}
                  </button>
                  <button
                    className="button outline"
                    type="button"
                    disabled={
                      busy || accountBusy || uploadBusy || !drafts[draftKey]
                    }
                    onClick={() =>
                      setDrafts((existing) => {
                        const remaining = { ...existing };
                        delete remaining[draftKey];
                        return remaining;
                      })
                    }
                  >
                    برگشت به اطلاعات ذخیره‌شده
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    disabled={busy || accountBusy}
                    onClick={() =>
                      void refresh().catch((error) => {
                        setMessage(error.message);
                        setIsError(true);
                      })
                    }
                  >
                    دریافت اطلاعات تازه
                  </button>
                </div>
                <details className="raw-data">
                  <summary>مشاهده داده خام (فقط خواندنی)</summary>
                  <pre dir="ltr">{JSON.stringify(current, null, 2)}</pre>
                </details>
              </form>
            ) : (
              <p className="empty-compact">
                یک مورد بسازید یا از فهرست انتخاب کنید.
              </p>
            )}
          </section>
        </div>
      </div>
      <section className="section">
        <div className="section-heading">
          <h2>سفارش‌ها و تولید</h2>
          <span className="muted">{formatNumber(data.totalOrders)} نتیجه</span>
        </div>
        <form
          className="admin-order-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void refresh(query, 1, orderStatus).catch((error) => {
              setMessage(error.message);
              setIsError(true);
            });
          }}
        >
          <label className="field">
            جست‌وجوی نام، موبایل یا شناسه
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={200}
            />
          </label>
          <label className="field">
            وضعیت
            <select
              value={orderStatus}
              onChange={(event) => setOrderStatus(event.target.value)}
            >
              <option value="">همه وضعیت‌ها</option>
              {Object.entries(orderStatusLabels).map(([status, label]) => (
                <option key={status} value={status}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="button primary" disabled={busy || accountBusy}>
            اعمال جست‌وجو
          </button>
          <button
            className="button outline"
            type="button"
            disabled={busy || accountBusy}
            onClick={() => {
              setQuery("");
              setOrderStatus("");
              void refresh("", 1, "").catch((error) => {
                setMessage(error.message);
                setIsError(true);
              });
            }}
          >
            پاک‌کردن فیلترها
          </button>
        </form>
        <p className="muted">
          نتایج فعلی:{" "}
          {appliedFilters.query
            ? "«" + appliedFilters.query + "»"
            : "همه نام‌ها و شناسه‌ها"}{" "}
          ·{" "}
          {appliedFilters.status
            ? orderStatusLabels[appliedFilters.status]
            : "همه وضعیت‌ها"}
        </p>
        {(query !== appliedFilters.query ||
          orderStatus !== appliedFilters.status) && (
          <p role="status" className="notice">
            فیلترهای فرم هنوز اعمال نشده‌اند؛ فهرست و صفحه‌بندی بر اساس آخرین
            جست‌وجوی موفق هستند.
          </p>
        )}
        <details className="order-draft-shelf">
          <summary>
            پیش‌نویس‌های سفارش:{" "}
            {formatNumber(
              Object.keys(drafts).filter((key) => key.startsWith("orders:"))
                .length,
            )}
          </summary>
          <p className="muted">
            ویرایش‌ها مستقل از فیلتر و صفحه حفظ می‌شوند. باز کردن، سفارش را با
            شناسه جست‌وجو می‌کند.
          </p>
          <div className="order-draft-links">
            {Object.keys(drafts)
              .filter((key) => key.startsWith("orders:"))
              .map((key) => {
                const orderId = key.slice("orders:".length);
                return (
                  <div key={key}>
                    <button
                      type="button"
                      className="button outline"
                      disabled={busy || accountBusy}
                      onClick={() => {
                        setQuery(orderId);
                        setOrderStatus("");
                        void refresh(orderId, 1, "").catch((error) => {
                          setMessage(error.message);
                          setIsError(true);
                        });
                      }}
                    >
                      باز کردن سفارش <bdi>{orderId}</bdi>
                    </button>
                    <button
                      type="button"
                      className="text-link"
                      disabled={busy || accountBusy}
                      onClick={() =>
                        setDrafts((existing) =>
                          discardMatchingOrderDraft(
                            existing,
                            orderId,
                            drafts[key],
                          ),
                        )
                      }
                    >
                      کنار گذاشتن این پیش‌نویس
                    </button>
                  </div>
                );
              })}
          </div>
        </details>
        <AdminOrders
          orders={data.orders}
          drafts={drafts}
          onDraftChange={(id, value) =>
            setDrafts((existing) => {
              const next = { ...existing };
              if (value) next[orderDraftKey(id)] = value;
              else delete next[orderDraftKey(id)];
              return next;
            })
          }
          onDraftDiscard={(id, expected) =>
            setDrafts((existing) =>
              discardMatchingOrderDraft(existing, id, expected),
            )
          }
          busy={busy || accountBusy || reviewRequired}
          onSave={(value, report) => save("order", value, report)}
          onRefresh={async () => {
            if (mutation.current || accountBusy) throw Error("ابتدا منتظر پایان درخواست جاری بمانید.");
            if (!(await refresh())) throw Error("دریافت نسخه تازه کامل نشد؛ دوباره بررسی کنید.");
          }}
        />
        <div className="pagination">
          <button
            className="button outline"
            disabled={busy || accountBusy || data.page <= 1}
            onClick={() =>
              void refresh(
                appliedFilters.query,
                data.page - 1,
                appliedFilters.status,
              ).catch((error) => setMessage(error.message))
            }
          >
            صفحه قبل
          </button>
          <span>
            {formatNumber(data.page)} از {formatNumber(data.pageCount)}
          </span>
          <button
            className="button outline"
            disabled={busy || accountBusy || data.page >= data.pageCount}
            onClick={() =>
              void refresh(
                appliedFilters.query,
                data.page + 1,
                appliedFilters.status,
              ).catch((error) => setMessage(error.message))
            }
          >
            صفحه بعد
          </button>
        </div>
      </section>
    </>
  );
}
