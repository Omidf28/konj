"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import type { Product } from "@/lib/catalog";
import { formatNumber, formatPrice } from "@/lib/format";
import {
  layoutToCart,
  fitLayoutToSurface,
  type StickerLayout,
  type Placement,
} from "@/lib/sticker-layout";
import { createLatestRead } from "@/lib/latest-read";
import { parseStickerLayout, readStickerLayout, serializeStickerLayout } from "@/lib/sticker-layout-file";
import { useCart } from "./cart-provider";
import { StickerArtwork } from "./sticker-artwork";
import Link from "next/link";
import { NumericField } from "./admin/fields";
const initial: StickerLayout = {
  version: 1,
  surface: "laptop",
  widthCm: 32,
  heightCm: 22,
  color: "#737879",
  items: [],
};
function reducer(
  state: StickerLayout,
  action: { type: "load" | "surface" | "update" | "items"; value: unknown },
): StickerLayout {
  if (action.type === "load") return action.value as StickerLayout;
  if (action.type === "surface")
    return { ...state, ...(action.value as object), items: [] };
  if (action.type === "update")
    return { ...state, ...(action.value as object) };
  return { ...state, items: action.value as Placement[] };
}
export function StickerStudio({ products }: { products: Product[] }) {
  const [layout, dispatch] = useReducer(reducer, initial);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importReader] = useState(() => createLatestRead(10000,
    "خواندن چیدمان طول کشید؛ پیش‌نویس قبلی حفظ شده است. دوباره فایل را انتخاب کنید."));
  useEffect(() => () => importReader.cancel(), [importReader]);
  function cancelImport() {
    importReader.cancel();
    setImporting(false);
  }
  const surfaceRef = useRef<HTMLDivElement>(null);
  const placementButtons = useRef(new Map<string, HTMLButtonElement>());
  const undoButton = useRef<HTMLButtonElement>(null);
  const removalFocus = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const target = removalFocus.current;
    if (target === undefined) return;
    removalFocus.current = undefined;
    const button = target === null ? undoButton.current : placementButtons.current.get(target);
    button?.focus({ preventScroll: true });
  }, [layout.items]);
  function removePlacement(id: string) {
    const index = layout.items.findIndex((row) => row.id === id);
    if (index < 0) return;
    const remaining = layout.items.filter((row) => row.id !== id);
    const next = remaining[index]?.id ?? remaining[index - 1]?.id ?? null;
    removalFocus.current = next;
    setSelected(next ?? "");
    items(remaining);
  }
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const cart = useCart();
  const [historyCounts, syncHistory] = useReducer(
    (
      _state: { past: number; future: number },
      next: { past: number; future: number },
    ) => next,
    { past: 0, future: 0 },
  );
  const history = useRef<{ past: StickerLayout[]; future: StickerLayout[] }>({
    past: [],
    future: [],
  });
  function commit(action: Parameters<typeof reducer>[1], record = true) {
    cancelImport();
    setMessage("");
    if (record) {
      history.current.past = [...history.current.past, layout].slice(-50);
      history.current.future = [];
    }
    syncHistory({
      past: history.current.past.length,
      future: history.current.future.length,
    });
    dispatch({ type: "load", value: fitLayoutToSurface(reducer(layout, action), products) });
  }
  function undo() {
    cancelImport();
    setMessage("");
    const previous = history.current.past.pop();
    if (previous) {
      history.current.future.push(layout);
      dispatch({ type: "load", value: previous });
      syncHistory({
        past: history.current.past.length,
        future: history.current.future.length,
      });
      setSelected("");
    }
  }
  function redo() {
    cancelImport();
    setMessage("");
    const next = history.current.future.pop();
    if (next) {
      history.current.past.push(layout);
      dispatch({ type: "load", value: next });
      syncHistory({
        past: history.current.past.length,
        future: history.current.future.length,
      });
      setSelected("");
    }
  }
  function exportLayout() {
    try {
      const url = URL.createObjectURL(new Blob([serializeStickerLayout(layout)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "konj-sticker-layout.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "دریافت چیدمان انجام نشد؛ پیش‌نویس حفظ شده است.");
    }
  }
  async function importLayout(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setMessage("");
    try {
      const applied = await importReader.run(
        (signal) => readStickerLayout(file, products, signal),
        (parsed) => {
          commit({ type: "load", value: parsed });
          setSelected("");
          setMessage("چیدمان بارگذاری شد؛ اندازه‌ها و گزینه‌های خرید ثابت ماندند.");
        },
      );
      if (applied) setImporting(false);
    } catch (error) {
      setImporting(false);
      setMessage(error instanceof Error ? error.message : "فایل چیدمان معتبر نیست؛ پیش‌نویس حفظ شده است.");
    }
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem("konj-sticker-layout-v1");
      if (saved) {
        const parsed = parseStickerLayout(saved, products);
        dispatch({ type: "load", value: fitLayoutToSurface(parsed, products) });
      }
    } catch {
      try {
        const saved = localStorage.getItem("konj-sticker-layout-v1");
        if (saved)
          localStorage.setItem("konj-sticker-layout-recovery-v1", saved);
      } catch {}
      Promise.resolve().then(() =>
        setMessage(
          "پیش‌نویس قدیمی سازگار نیست؛ نسخه قبلی با کلید بازیابی در مرورگر حفظ شد.",
        ),
      );
    }
    Promise.resolve().then(() => setReady(true));
  }, [products]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem("konj-sticker-layout-v1", serializeStickerLayout(layout));
      } catch {
        /* Cart remains available when local draft storage is full. */
      }
  }, [layout, ready]);
  function items(value: Placement[]) {
    commit({ type: "items", value }, !drag.current);
  }
  function add(product: Product, sku = product.variants[0].sku) {
    if (layout.items.length >= 60) {
      setMessage("حداکثر ۶۰ استیکر در یک چیدمان.");
      return;
    }
    const id = crypto.randomUUID();
    const dimensions =
      product.variants.find((v) => v.sku === sku)?.dimensionsCm ||
      product.dimensionsCm;
    const item = {
      id,
      productId: product.id,
      sku,
      xCm: Math.max(0, (layout.widthCm - (dimensions?.width || 8)) / 2),
      yCm: Math.max(0, (layout.heightCm - (dimensions?.height || 6)) / 2),
      angle: 0,
      z: layout.items.length,
      quantity: 1,
    };
    items([...layout.items, item]);
    setSelected(id);
    setMessage("");
  }
  function update(id: string, patch: Partial<Placement>) {
    items(
      layout.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    );
  }
  const item = layout.items.find((item) => item.id === selected);
  const totalUnits = layout.items.reduce((sum, item) => sum + item.quantity, 0);
  const total = layout.items.reduce(
    (sum, item) =>
      sum +
      ((products.find((product) => product.id === item.productId)?.priceToman ||
        0) +
        (products
          .find((product) => product.id === item.productId)
          ?.variants.find((v) => v.sku === item.sku)?.priceDeltaToman || 0)) *
        item.quantity,
    0,
  );
  return (
    <>
      <p className="notice">
        اندازه استیکرها ثابت و فیزیکی است؛ نسبت به ابعاد سطح نمایش داده می‌شود.
        تصاویر مفهومی‌اند. تغییر سطح چیدمان جاری را از نو شروع می‌کند. عکس
        دستگاه دریافت نمی‌شود.
      </p>
      <div className="studio-toolbar">
        <button
          className="button outline"
          ref={undoButton}
          disabled={!historyCounts.past}
          onClick={undo}
        >
          واگرد ↶
        </button>
        <button
          className="button outline"
          disabled={!historyCounts.future}
          onClick={redo}
        >
          انجام دوباره ↷
        </button>
        <button className="button outline" onClick={exportLayout}>
          دریافت چیدمان JSON ↓
        </button>
        <label className="button outline">
          بازکردن چیدمان
          <input
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void importLayout(file);
            }}
          />
        </label>
      </div>
      {importing && (
        <p role="status" className="notice">
          در حال خواندن چیدمان… ویرایش تازه، ورود فایل در حال خواندن را لغو می‌کند.
        </p>
      )}
      <div className="studio-layout">
        <aside>
          <h2>سطح تو</h2>
          <label>
            نوع سطح
            <select
              value={layout.surface}
              onChange={(event) => {
                commit({
                  type: "surface",
                  value:
                    event.target.value === "phone"
                      ? { surface: "phone", widthCm: 7.5, heightCm: 15.5 }
                      : { surface: "laptop", widthCm: 32, heightCm: 22 },
                });
                setSelected("");
              }}
            >
              <option value="laptop">درِ لپ‌تاپ</option>
              <option value="phone">پشت موبایل / قاب</option>
            </select>
          </label>
          <div className="form-grid">
            {(["widthCm", "heightCm"] as const).map((key) => (
              <NumericField
                key={key}
                label={(key === "widthCm" ? "عرض" : "ارتفاع") + " سطح (cm)"}
                value={layout[key]}
                min={5}
                max={80}
                integer={false}
                onChange={(value) =>
                  commit({ type: "update", value: { [key]: value } })
                }
              />
            ))}
          </div>
          <label>
            رنگ سطح
            <input
              type="color"
              value={layout.color}
              onChange={(event) =>
                commit({
                  type: "update",
                  value: { color: event.target.value },
                })
              }
            />
          </label>
          <h3>استیکرهای نمونه</h3>
          {products.flatMap((product) =>
            product.variants.map((variant) => (
              <button
                key={variant.sku}
                className="sticker-picker"
                disabled={
                  variant.enabled === false ||
                  product.availability === "unavailable" ||
                  (product.availability === "ready" && variant.stock < 1)
                }
                onClick={() => add(product, variant.sku)}
              >
                <span>
                  <StickerArtwork motif={product.motif} />
                </span>
                <span>
                  {product.name}
                  <small>
                    {(variant.dimensionsCm || product.dimensionsCm)?.width} ×{" "}
                    {(variant.dimensionsCm || product.dimensionsCm)?.height} cm
                    ·{" "}
                    {formatPrice(
                      product.priceToman + (variant.priceDeltaToman || 0),
                    )}
                  </small>
                </span>
                <b>＋</b>
              </button>
            )),
          )}
        </aside>
        <section className="studio-work">
          <div className="studio-surface-wrap">
            <div
              ref={surfaceRef}
              className={`studio-surface ${layout.surface}`}
              style={{
                background: layout.color,
                aspectRatio: `${layout.widthCm}/${layout.heightCm}`,
                maxWidth: layout.surface === "phone" ? 300 : 800,
              }}
            >
              {layout.surface === "phone" && (
                <div className="phone-camera" aria-hidden="true" />
              )}
              {layout.items.map((placement) => {
                const product = products.find(
                  (p) => p.id === placement.productId,
                );
                if (!product) return null;
                const dimensions =
                  product.variants.find((v) => v.sku === placement.sku)
                    ?.dimensionsCm || product.dimensionsCm;
                const width = dimensions?.width || 8;
                const height = dimensions?.height || 6;
                return (
                  <button
                    key={placement.id}
                    ref={(button) => {
                      if (button) placementButtons.current.set(placement.id, button);
                      else placementButtons.current.delete(placement.id);
                    }}
                    aria-label={`جابه‌جایی ${product.name}${placement.quantity > 1 ? " · " + formatNumber(placement.quantity) + " نسخه" : ""}`}
                    className={`placed-sticker ${selected === placement.id ? "selected" : ""}`}
                    style={{
                      width: `${(width / layout.widthCm) * 100}%`,
                      height: `${(height / layout.heightCm) * 100}%`,
                      left: `${(placement.xCm / layout.widthCm) * 100}%`,
                      top: `${(placement.yCm / layout.heightCm) * 100}%`,
                      transform: `rotate(${placement.angle}deg)`,
                      zIndex: placement.z + 1,
                    }}
                    onFocus={() => setSelected(placement.id)}
                    onKeyDown={(event) => {
                      const step = event.shiftKey ? 1 : 0.25;
                      const delta: Record<string, [number, number]> = {
                        ArrowLeft: [-step, 0],
                        ArrowRight: [step, 0],
                        ArrowUp: [0, -step],
                        ArrowDown: [0, step],
                      };
                      if (delta[event.key]) {
                        event.preventDefault();
                        update(placement.id, {
                          xCm: Math.min(
                            Math.max(0, placement.xCm + delta[event.key][0]),
                            Math.max(0, layout.widthCm - width),
                          ),
                          yCm: Math.min(
                            Math.max(0, placement.yCm + delta[event.key][1]),
                            Math.max(0, layout.heightCm - height),
                          ),
                        });
                      } else if (event.key === "Delete") {
                        event.preventDefault();
                        removePlacement(placement.id);
                      }
                    }}
                    onPointerDown={(event) => {
                      cancelImport();
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      event.currentTarget.focus({ preventScroll: true });
                      history.current.past = [
                        ...history.current.past,
                        layout,
                      ].slice(-50);
                      history.current.future = [];
                      syncHistory({
                        past: history.current.past.length,
                        future: 0,
                      });
                      setSelected(placement.id);
                      drag.current = {
                        id: placement.id,
                        startX: event.clientX,
                        startY: event.clientY,
                        x: placement.xCm,
                        y: placement.yCm,
                      };
                    }}
                    onPointerMove={(event) => {
                      if (
                        !drag.current ||
                        drag.current.id !== placement.id ||
                        !surfaceRef.current
                      )
                        return;
                      const rect = surfaceRef.current.getBoundingClientRect();
                      const x =
                        drag.current.x +
                        ((event.clientX - drag.current.startX) / rect.width) *
                          layout.widthCm;
                      const y =
                        drag.current.y +
                        ((event.clientY - drag.current.startY) / rect.height) *
                          layout.heightCm;
                      update(placement.id, {
                        xCm: Math.min(
                          Math.max(x, 0),
                          Math.max(0, layout.widthCm - width),
                        ),
                        yCm: Math.min(
                          Math.max(y, 0),
                          Math.max(0, layout.heightCm - height),
                        ),
                      });
                    }}
                    onPointerUp={() => {
                      drag.current = null;
                    }}
                    onPointerCancel={() => {
                      drag.current = null;
                    }}
                    onLostPointerCapture={() => {
                      drag.current = null;
                    }}
                  >
                    <StickerArtwork motif={product.motif} />
                    {placement.quantity > 1 && (
                      <span className="sticker-copy-count">×{formatNumber(placement.quantity)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="muted">
            سطح {formatNumber(layout.widthCm)} × {formatNumber(layout.heightCm)}{" "}
            سانتی‌متر · با لمس، ماوس یا کلیدهای جهت جابه‌جا کن؛ Shift حرکت یک
            سانتی‌متری می‌دهد. اندازه استیکر با تغییر سطح کوچک نمی‌شود؛ اگر از
            سطح بزرگ‌تر باشد یا بچرخد، بخشی از آن بیرون قاب می‌ماند.
          </p>
          {item && (
            <div className="studio-tools">
              <label>
                چرخش {formatNumber(item.angle)}°
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={item.angle}
                  onChange={(event) =>
                    update(item.id, { angle: Number(event.target.value) })
                  }
                />
              </label>
              <div className="viewer-views">
                <button
                  className="button outline"
                  onClick={() => {
                    const id = crypto.randomUUID();
                    if (layout.items.length < 60) {
                      items([
                        ...layout.items,
                        {
                          ...item,
                          id,
                          xCm: Math.min(item.xCm + 1, layout.widthCm),
                          yCm: Math.min(item.yCm + 1, layout.heightCm),
                          z: layout.items.length,
                        },
                      ]);
                      setSelected(id);
                    }
                  }}
                >
                  تکثیر
                </button>
                <button
                  className="button outline"
                  onClick={() =>
                    update(item.id, {
                      z: Math.max(...layout.items.map((p) => p.z)) + 1,
                    })
                  }
                >
                  بالاترین لایه
                </button>
                <button
                  className="button outline"
                  onClick={() => {
                    const ordered = [...layout.items]
                      .sort((a, b) => a.z - b.z)
                      .filter((p) => p.id !== item.id);
                    items([
                      { ...item, z: 0 },
                      ...ordered.map((p, index) => ({ ...p, z: index + 1 })),
                    ]);
                  }}
                >
                  پایین‌ترین لایه
                </button>
                <button
                  className="button outline"
                  onClick={() => removePlacement(item.id)}
                >
                  حذف
                </button>
              </div>
            </div>
          )}
          <div className="totals">
            <p>
              تعداد خرید <strong>{formatNumber(totalUnits)}</strong>
            </p>
            <p>
              قیمت نمونه اقلام <strong>{formatPrice(total)}</strong>
            </p>
            <button
              className="button primary"
              disabled={!layout.items.length || !cart.state.ready}
              onClick={async () => {
                try {
                  const list = layoutToCart(layout, products);
                  if (!(await cart.dispatch({ type: "add", items: list })))
                    throw Error(
                      "افزودن ترکیب انجام نشد؛ پیام سبد را بررسی کنید.",
                    );
                  setMessage(
                    "همه اقلام با تعداد دقیق اضافه شدند. افزودن دوباره، همین تعداد را مجدداً به سبد اضافه می‌کند.",
                  );
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "چیدمان معتبر نیست.",
                  );
                }
              }}
            >
              افزودن همین ترکیب به سبد
            </button>
            <Link className="text-link" href="/cart">
              مشاهده سبد ←
            </Link>
          </div>
          {totalUnits !== layout.items.length && (
            <p className="muted">
              هر نشان × تعداد نسخه‌های همان استیکر را مشخص می‌کند؛ در هر جایگاه
              یک نمونه از آن نمایش داده می‌شود.
            </p>
          )}
          {cart.state.error && (
            <p role="alert" className="notice danger">
              {cart.state.error}
            </p>
          )}
          {message && !cart.state.error && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          <details>
            <summary>داده چیدمان (ذخیره محلی خودکار)</summary>
            <pre dir="ltr">{JSON.stringify(layout, null, 2)}</pre>
          </details>
        </section>
      </div>
    </>
  );
}
