"use client";
import {
  prepareCustomCartItem,
  customPrintsForEditing,
  readDesignOriginal,
  type CustomPrintInput,
} from "@/lib/custom-design-request";
import { createLatestRead } from "@/lib/latest-read";
import { customPrintBounds } from "@/lib/custom-print-bounds";
import { inspectDesignImage } from "@/lib/design-image";
import { sellableVariants } from "@/lib/product-price";

import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { garmentDisplayDimensions } from "@/lib/preview";
import type { Product } from "@/lib/catalog";
import type { BaseModel } from "@/lib/base-model";
import type { StoreSettings } from "@/server/db";
import type { CartItem } from "@/lib/commerce-types";
import { formatPrice } from "@/lib/format";
import { useCart } from "./cart-provider";
const Viewer = dynamic(() => import("./viewer"), { ssr: false });
type Side = "front" | "back";
interface Draft {
  file: File;
  url: string;
  pixelWidth: number;
  pixelHeight: number;
  width: number;
  x: number;
  y: number;
}
interface Bounds {
  width: number;
  height: number;
  x: number;
  y: number;
  areaWidth: number;
  areaHeight: number;
  minWidth: number;
  maxWidth: number;
  valid: boolean;
}
function bounds(
  draft: Draft,
  product: Product,
  base: BaseModel,
  config: StoreSettings,
  repeatOnMug: boolean,
): Bounds {
  const sticker = product.category === "sticker";
  return customPrintBounds(draft, {
    sticker,
    minCm: sticker ? config.customStickerMinCm : 1,
    maxWidth: sticker ? config.customStickerMaxCm : (base.printArea?.widthCm || 0) / (repeatOnMug ? 2 : 1),
    maxHeight: sticker ? config.customStickerMaxCm : base.printArea?.heightCm || 0,
  });
}
async function renderPreview(draft: Draft, placement: Bounds) {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 800;
  const context = canvas.getContext("2d");
  if (!context) throw Error("ساخت پیش‌نمایش در این مرورگر ممکن نیست.");
  const image = await createImageBitmap(draft.file, {
    imageOrientation: "from-image",
  });
  try {
    context.fillStyle = "#e8e4da";
    context.fillRect(0, 0, 800, 800);
    const scale = Math.min(
      740 / placement.areaWidth,
      740 / placement.areaHeight,
    );
    const ox = (800 - placement.areaWidth * scale) / 2,
      oy = (800 - placement.areaHeight * scale) / 2;
    context.strokeStyle = "#63802e";
    context.setLineDash([8, 5]);
    context.strokeRect(
      ox,
      oy,
      placement.areaWidth * scale,
      placement.areaHeight * scale,
    );
    context.setLineDash([]);
    context.drawImage(
      image,
      ox + placement.x * scale,
      oy + placement.y * scale,
      placement.width * scale,
      placement.height * scale,
    );
    return canvas;
  } finally {
    image.close();
  }
}
export function CustomEditor({
  products,
  bases,
  config,
}: {
  products: Product[];
  bases: BaseModel[];
  config: StoreSettings;
}) {
  const [productId, setProductId] = useState(products[0]?.id || "");
  const product = products.find((p) => p.id === productId)!;
  const base = bases.find((b) => b.id === product?.baseId)!;
  const [sku, setSku] = useState(
    (product
      ? (sellableVariants(product)[0] || product.variants[0])?.sku
      : undefined) || "",
  );
  const [drafts, setDrafts] = useState<Partial<Record<Side, Draft>>>({});
  const [side, setSide] = useState<Side>("front");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const imagePending = useRef(false);
  const confirming = useRef(false);
  const [imageReader] = useState(() =>
    createLatestRead(
      15000,
      "خواندن تصویر طول کشید؛ دوباره فایل را انتخاب کنید.",
    ),
  );
  const [restoreReader] = useState(() =>
    createLatestRead(
      45000,
      "بازیابی طرح طول کشید؛ قلم قبلی سبد حفظ شده است. دوباره بازیابی کنید.",
    ),
  );
  const [confirmReader] = useState(() =>
    createLatestRead(
      90000,
      "تأیید طرح طول کشید؛ سبد قبلی حفظ شده است. ممکن است بخشی از فایل‌ها در سرور ذخیره شده باشند؛ درخواست خودکار تکرار نمی‌شود.",
    ),
  );
  const [show3d, setShow3d] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const cart = useCart();
  const [editing, setEditing] = useState<CartItem | null>(null);
  const loadedEdit = useRef(false);
  const [editFailed, setEditFailed] = useState(false);
  const urls = useRef(new Set<string>());
  const [repeatChecked, setRepeatChecked] = useState(false);
  const canRepeat = product?.category === "mug" && base?.backPrintEnabled && config.backPrintEnabled;
  const repeatOnMug = Boolean(canRepeat && repeatChecked && drafts.front);
  const draft = drafts[side];
  const placement = useMemo(
    () => (draft && base ? bounds(draft, product, base, config, repeatOnMug) : null),
    [draft, product, base, config, repeatOnMug],
  );
  const hasBack =
    config.backPrintEnabled &&
    base?.backPrintEnabled &&
    ["tshirt", "hoodie"].includes(product?.category);
  const active = (Object.entries(drafts) as [Side, Draft][]).filter(
    ([printSide, print]) => Boolean(print) && (printSide === "front" || hasBack),
  );
  const invalidPrint = active.some(([, print]) => !bounds(print, product, base, config, repeatOnMug).valid);
  const sticker = product?.category === "sticker";
  const price = active.reduce(
    (sum, [printSide, print]) => {
      const p = bounds(print, product, base, config, repeatOnMug);
      return (
        sum +
        (sticker
          ? Math.ceil(p.width * p.height * config.stickerCm2Toman)
          : (printSide === "front"
              ? config.frontPrintToman
              : config.backPrintToman) +
            (p.width * p.height > 400 ? config.largePrintToman : 0))
      );
    },
    (repeatOnMug ? config.backPrintToman + (placement && placement.width * placement.height > 400 ? config.largePrintToman : 0) : 0) + (sticker ? 0 : (base?.basePriceToman ?? product?.priceToman ?? 0)) +
      (product?.variants.find((v) => v.sku === sku)?.priceDeltaToman || 0),
  );
  useEffect(() => {
    let cancelled = false;
    if (draft && placement) {
      renderPreview(draft, placement)
        .then((canvas) => {
          if (!cancelled && preview.current) {
            const context = preview.current.getContext("2d")!;
            context.clearRect(0, 0, 800, 800);
            context.drawImage(canvas, 0, 0);
          }
        })
        .catch(() => {
          if (!cancelled) setMessage("پیش‌نمایش فایل ساخته نشد.");
        });
    } else if (preview.current)
      preview.current.getContext("2d")?.clearRect(0, 0, 800, 800);
    return () => {
      cancelled = true;
    };
  }, [draft, placement]);
  useEffect(
    () => () => {
      imageReader.cancel();
      restoreReader.cancel();
      confirmReader.cancel();
      for (const url of urls.current) URL.revokeObjectURL(url);
    },
    [imageReader, restoreReader, confirmReader],
  );
  useEffect(() => {
    const used = new Set(
      Object.values(drafts)
        .map((value) => value?.url)
        .filter(Boolean),
    );
    for (const url of urls.current)
      if (!used.has(url)) {
        URL.revokeObjectURL(url);
        urls.current.delete(url);
      }
  }, [drafts]);
  useEffect(() => {
    if (!cart.state.ready || loadedEdit.current) return;
    const key = new URLSearchParams(window.location.search).get("edit");
    if (!key) return;
    const item = cart.state.items.find((entry) => entry.key === key);
    const selected = products.find((entry) => entry.id === item?.productId);
    const selectedBase = bases.find((entry) => entry.id === selected?.baseId);
    async function restore() {
      setBusy(true);
      try {
        const applied = await restoreReader.run(
          async (signal) => {
            if (!item?.custom || !selected || !selectedBase)
              throw Error(
                "قلم سفارشی قابل ویرایش پیدا نشد؛ سبد قبلی حفظ شده است.",
              );
            if (
              item.custom.rotation ||
              item.custom.additionalPrints?.some((print) => print.rotation)
            )
              throw Error(
                "چرخش این طرح در ویرایشگر فعلی پشتیبانی نمی‌شود؛ قلم قبلی حفظ شده است.",
              );
            const prints = [
              item.custom,
              ...(item.custom.additionalPrints || []),
            ];
            if (
              prints.some((print) => print.side === "back") &&
              !(
                config.backPrintEnabled &&
                selectedBase.backPrintEnabled &&
                ["tshirt", "hoodie", "mug"].includes(selected.category)
              )
            )
              throw Error(
                "چاپ پشت این مدل اکنون غیرفعال است؛ قلم قبلی حفظ شده است.",
              );
            const restored: Partial<Record<Side, Omit<Draft, "url">>> = {};
            const { prints: editablePrints, repeat } = customPrintsForEditing(selected.category, item.custom);
            for (const print of editablePrints) {
              const file = await readDesignOriginal(
                print.uploadId,
                config.maxUploadMb * 1024 ** 2,
                signal,
              );
              const metrics = await inspectDesignImage(file, signal);
              restored[print.side] = {
                file,
                pixelWidth: metrics.width,
                pixelHeight: metrics.height,
                width: print.widthCm,
                x: print.xCm,
                y: print.yCm,
              };
            }
            return { item, selected, restored, repeat };
          },
          ({ item, selected, restored, repeat }) => {
            setRepeatChecked(repeat);
            const complete: Partial<Record<Side, Draft>> = {};
            for (const [side, value] of Object.entries(restored) as [
              Side,
              Omit<Draft, "url">,
            ][]) {
              const url = URL.createObjectURL(value.file);
              urls.current.add(url);
              complete[side] = { ...value, url };
            }
            loadedEdit.current = true;
            setEditing(item);
            setProductId(selected.id);
            setSku(item.sku);
            setDrafts(complete);
            setSide(item.custom!.side);
            setMessage(
              "در حال ویرایش قلم سبد هستید؛ ذخیره فقط همین قلم را جایگزین می‌کند و تعداد آن حفظ می‌شود.",
            );
          },
        );
        if (applied) setBusy(false);
      } catch (error) {
        loadedEdit.current = true;
        setEditFailed(true);
        setBusy(false);
        setMessage(
          error instanceof Error && error.name !== "TypeError"
            ? error.message
            : "بازیابی طرح انجام نشد؛ اتصال را بررسی کنید. قلم قبلی حفظ شده است.",
        );
      }
    }
    void restore();
    return () => restoreReader.cancel();
  }, [
    cart.state.ready,
    cart.state.items,
    products,
    bases,
    config,
    restoreReader,
  ]);
  function patch(update: Partial<Draft>) {
    setMessage("");
    setDrafts((current) => ({
      ...current,
      [side]: current[side] ? { ...current[side]!, ...update } : undefined,
    }));
  }
  function cancelImageRead() {
    imageReader.cancel();
    imagePending.current = false;
    setReading(false);
  }
  async function choose(file: File | undefined) {
    if (!file || confirming.current) return;
    imageReader.cancel();
    imagePending.current = false;
    setReading(false);
    setMessage("");
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > config.maxUploadMb * 1024 ** 2
    ) {
      setMessage(
        "PNG، JPEG یا WebP تا " + config.maxUploadMb + " مگابایت انتخاب کنید.",
      );
      return;
    }
    imagePending.current = true;
    setReading(true);
    try {
      const applied = await imageReader.run(
        (signal) => inspectDesignImage(file, signal),
        (metrics) => {
          const url = URL.createObjectURL(file);
          urls.current.add(url);
          setDrafts((current) => ({
            ...current,
            [side]: {
              file,
              url,
              pixelWidth: metrics.width,
              pixelHeight: metrics.height,
              width: product.category === "mug" ? 7 : sticker ? 8 : 18,
              x: product.category === "mug" ? Math.max(0, ((base.printArea?.widthCm || 0) / (repeatOnMug ? 2 : 1) - Math.min(7, (base.printArea?.heightCm || 0) * metrics.width / metrics.height)) / 2) : 0,
              y: product.category === "mug" ? Math.max(0, ((base.printArea?.heightCm || 0) - 7 * metrics.height / metrics.width) / 2) : 0,
            },
          }));
        },
      );
      if (applied) {
        imagePending.current = false;
        setReading(false);
      }
    } catch (error) {
      imagePending.current = false;
      setReading(false);
      setMessage(error instanceof Error ? error.message : "فایل خوانده نشد.");
    }
  }
  async function add() {
    if (
      busy ||
      confirming.current ||
      imagePending.current ||
      !active.length ||
      invalidPrint ||
      !product ||
      !base
    )
      return;
    confirming.current = true;
    setBusy(true);
    setMessage("");
    try {
      const prepared: { item?: CartItem } = {};
      const applied = await confirmReader.run(
        async (signal) => {
          const prints: CustomPrintInput[] = active.map(
            ([printSide, print]) => {
              const p = bounds(print, product, base, config, repeatOnMug);
              if (
                sticker &&
                (p.width < config.customStickerMinCm ||
                  p.height < config.customStickerMinCm)
              )
                throw Error("عرض و ارتفاع استیکر باید داخل محدوده مجاز باشند.");
              return {
                file: print.file,
                placement: {
                  version: 1,
                  side: printSide,
                  widthCm: p.width,
                  heightCm: p.height,
                  xCm: p.x,
                  yCm: p.y,
                  rotation: 0,
                  ...(sticker
                    ? { productWidthCm: p.width, productHeightCm: p.height }
                    : {}),
                },
                preview: async () => {
                  const canvas = await renderPreview(print, p);
                  return await new Promise<Blob>((resolve, reject) =>
                    canvas.toBlob(
                      (value) =>
                        value
                          ? resolve(value)
                          : reject(Error("پیش‌نمایش ساخته نشد.")),
                      "image/png",
                    ),
                  );
                },
              };
            },
          );
          return await prepareCustomCartItem(
            {
              key: editing?.key || crypto.randomUUID(),
              productId: product.id,
              sku,
              quantity: editing?.quantity || 1,
              prints,
              repeatOnMug,
            },
            signal,
          );
        },
        (item) => {
          prepared.item = item;
        },
      );
      const item = prepared.item;
      if (!applied || !item) return;
      if (
        !(await cart.dispatch(
          editing
            ? { type: "replace", expected: editing, item }
            : { type: "add", items: [item] },
        ))
      )
        throw Error("افزودن به سبد انجام نشد؛ پیام سبد را بررسی کنید.");
      if (editing) setEditing(item);
      setMessage(
        editing
          ? "طرح و گزینه‌های همین قلم به‌روز شد؛ تعداد حفظ شد."
          : "فایل‌های اصلی، پیش‌نمایش و تنظیمات هر سمت به یک قلم مستقل سبد اضافه شدند.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "افزودن ناموفق بود.");
    } finally {
      confirming.current = false;
      setBusy(false);
    }
  }
  if (!product || !base) return <p>مدل قابل شخصی‌سازی موجود نیست.</p>;
  const dpi =
    draft && placement ? draft.pixelWidth / (placement.width / 2.54) : 0;
  return (
    <>
      <p className="notice">
        تصویر طرح چاپ می‌خواهیم، نه عکس بدن یا دستگاه. ویرایش در مرورگر انجام
        می‌شود؛ فایل اصلی هر سمت فقط پس از تأیید ارسال می‌شود. برش استیکر
        مستطیلی و نسبت تصویر ثابت است. چرخش برای فرایند اولیه چاپ فعال نیست.
      </p>
      <div className="editor-grid">
        <section>
          <label>
            محصول پایه
            <select
              value={productId}
              disabled={busy}
              onChange={(event) => {
                cancelImageRead();
                const next = products.find((p) => p.id === event.target.value)!;
                setMessage("");
                setRepeatChecked(false);
                setProductId(next.id);
                setSku((sellableVariants(next)[0] || next.variants[0]).sku);
                setSide("front");
              }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            رنگ / سایز
            <select
              value={sku}
              disabled={busy}
              onChange={(event) => {
                setMessage("");
                setSku(event.target.value);
              }}
            >
              {product.variants.map((variant) => (
                <option
                  key={variant.sku}
                  value={variant.sku}
                  disabled={
                    variant.enabled === false ||
                    product.availability === "unavailable" ||
                    (product.availability === "ready" && variant.stock < 1)
                  }
                >
                  {variant.color} / {sticker ? "اندازه دلخواه" : variant.size || "استاندارد"}
                </option>
              ))}
            </select>
          </label>
          {hasBack && (
            <label>
              سمت در حال ویرایش
              <select
                value={side}
                disabled={busy}
                onChange={(event) => {
                  cancelImageRead();
                  setMessage("");
                  setSide(event.target.value as Side);
                }}
              >
                <option value="front">
                  جلو{drafts.front ? " · طرح دارد" : ""}
                </option>
                <option value="back">
                  پشت{drafts.back ? " · طرح دارد" : ""}
                </option>
              </select>
            </label>
          )}
          <label>
            تصویر چاپ {side === "front" ? "جلو" : "پشت"} (حداکثر{" "}
            {config.maxUploadMb} MB)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void choose(file);
              }}
            />
          </label>
          {canRepeat && draft && (
            <label>
              <input type="checkbox" checked={repeatChecked} disabled={busy}
                onChange={event => {
                  const checked = event.target.checked;
                  const areaWidth = base.printArea?.widthCm || 0;
                  patch({ x: (placement?.x || 0) + areaWidth / 4 * (checked ? -1 : 1) });
                  setRepeatChecked(checked);
                }} />
              چاپ همین طرح روی سمت دیگر ماگ (+{formatPrice(config.backPrintToman)})
            </label>
          )}
          {reading && (
            <p role="status">
              در حال خواندن تصویر انتخاب‌شده… تأیید تا پایان خواندن بسته است.
            </p>
          )}
          {draft && placement && (
            <>
              <p className="muted">
                {draft.file.name} · {draft.pixelWidth} × {draft.pixelHeight} px
              </p>
              <label>
                عرض کادر چاپ: {placement.width.toFixed(1)} cm
                <input
                  type="range"
                  min={Math.min(placement.minWidth, placement.maxWidth)}
                  max={placement.maxWidth}
                  step="0.1"
                  disabled={busy || !placement.valid}
                  value={placement.width}
                  onChange={(event) =>
                    patch({ width: Number(event.target.value) })
                  }
                />
              </label>
              <p>ارتفاع کادر متناسب: {placement.height.toFixed(1)} cm</p>
              <p className="muted">
                اندازه‌ها مربوط به کل کادر فایل، همراه حاشیه شفاف‌اند. حاشیه
                خودکار بریده نمی‌شود؛ برای اندازه‌گیری خود طرح، فایل را پیش از
                انتخاب بدون حاشیه اضافی آماده کنید.
                {sticker
                  ? " اندازه و هزینه استیکر مستطیلی بر اساس همین کادر است."
                  : " رده هزینه چاپ بر اساس همین عرض و ارتفاع محاسبه می‌شود."}
              </p>
              {!sticker && (
                <>
                  {(["x", "y"] as const).map((axis) => (
                    <label key={axis}>
                      {axis === "x"
                        ? "فاصله از چپ محدوده چاپ"
                        : "فاصله از بالای محدوده چاپ"}
                      : {placement[axis].toFixed(1)} cm
                      <input
                        type="range"
                        min="0"
                        max={
                          axis === "x"
                            ? placement.areaWidth - placement.width
                            : placement.areaHeight - placement.height
                        }
                        step="0.1"
                        disabled={busy}
                        value={placement[axis]}
                        onChange={(event) =>
                          patch({ [axis]: Number(event.target.value) })
                        }
                      />
                    </label>
                  ))}
                </>
              )}
              <div className="viewer-views">
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() => patch({ width: sticker ? 8 : 18, x: 0, y: 0 })}
                >
                  بازنشانی
                </button>
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() => {
                    setMessage("");
                    setDrafts((current) => ({ ...current, [side]: undefined }));
                  }}
                >
                  حذف طرح این سمت
                </button>
              </div>
              <p className={`notice ${dpi < 150 ? "danger" : ""}`}>
                وضوح واقعی تقریبی: {Math.round(dpi)} پیکسل در اینچ.{" "}
                {dpi < 150
                  ? "کیفیت پایین؛ فایل بزرگ‌تر یا چاپ کوچک‌تر انتخاب کنید."
                  : dpi < 300
                    ? "کیفیت متوسط؛ فایل بزرگ‌تر پیشنهاد می‌شود."
                    : "وضوح پیشنهادی مناسب است."}
              </p>
            </>
          )}
          <p>
            سمت‌های دارای طرح:{" "}
            {repeatOnMug ? "دو طرف ماگ · طرح یکسان" :
              active.map(([s]) => (s === "front" ? "جلو" : "پشت")).join("، ") ||
              "هنوز هیچ‌کدام"}
          </p>
          {invalidPrint && (
            <p role="alert" className="notice danger">
              نسبت یکی از طرح‌ها با حداقل و حداکثر اندازه چاپ سازگار نیست.
              تصویر کم‌کشیده‌تری انتخاب کنید؛ تا اصلاح طرح، بارگذاری انجام نمی‌شود.
            </p>
          )}
          <p className="price">قیمت نمونه: {formatPrice(price)}</p>
          <button
            className="button primary"
            disabled={
              editFailed ||
              reading ||
              !active.length ||
              invalidPrint ||
              busy ||
              !cart.state.ready ||
              !sellableVariants(product).some((variant) => variant.sku === sku)
            }
            onClick={() => void add()}
          >
            {busy
              ? "در حال تأیید و بارگذاری…"
              : editing
                ? "ذخیره تغییرات همین قلم"
                : "تأیید تمام سمت‌ها و افزودن به سبد"}
          </button>
          {editFailed && (
            <button
              className="button outline"
              disabled={busy}
              onClick={() => window.location.reload()}
            >
              تازه‌سازی و بازیابی دوباره قلم
            </button>
          )}
          {cart.state.error && (
            <p role="alert" className="notice danger">
              {cart.state.error}
            </p>
          )}
          {message && !cart.state.error && (
            <p role="status" className="notice">
              {message}{" "}
              <Link href="/cart" className="text-link">
                سبد خرید ←
              </Link>
            </p>
          )}
        </section>
        <section>
          <div className="custom-preview">
            <p>
              محدوده چاپ {repeatOnMug ? "هر سمت ماگ" : side === "front" ? "جلو" : "پشت"} ·{" "}
              {placement?.areaWidth.toFixed(1) || base.printArea?.widthCm} ×{" "}
              {placement?.areaHeight.toFixed(1) || base.printArea?.heightCm} cm
            </p>
            <canvas
              ref={preview}
              width="800"
              height="800"
              aria-label="پیش‌نمایش تأیید چیدمان چاپ"
            />
            {!draft && (
              <p className="preview-placeholder">تصویر این سمت رو انتخاب کن.</p>
            )}
          </div>
          {draft &&
            placement &&
            ["tshirt", "hoodie", "mug"].includes(product.category) && (
              <>
                <button
                  className="button outline"
                  aria-expanded={show3d}
                  aria-controls="custom-3d-preview"
                  onClick={() => setShow3d(!show3d)}
                >
                  {show3d ? "بستن سه‌بعدی" : "پیش‌نمایش سه‌بعدی روی محصول"}
                </button>
                {show3d && (
                  <div id="custom-3d-preview">
                    {product.category !== "mug" &&
                      !garmentDisplayDimensions(
                        product.variants.find((v) => v.sku === sku)?.size || "L",
                        product.category === "hoodie",
                        base,
                      ).hasMeasurements && (
                        <p className="notice danger">
                          جدول اندازه معتبر این سایز در دسترس نیست؛ پیش‌نمایش با اندازه حدسی نمایش داده نمی‌شود.
                        </p>
                      )}
                    <Viewer
                      base={base}
                      form="B"
                      garmentOnly
                      showBody={false}
                      showGarment
                      showSeams
                      clothPhysics
                      size={
                        (product.variants.find((variant) => variant.sku === sku)
                          ?.size || "L") as "S" | "M" | "L" | "XL" | "XXL"
                      }
                      color={
                        product.colors.find(
                          (c) =>
                            c.name ===
                            product.variants.find((v) => v.sku === sku)?.color,
                        )?.hex || "#e7e1d2"
                      }
                      motif={product.motif}
                      category={product.category as "tshirt" | "hoodie" | "mug"}
                      imageUrl={draft.url}
                      printWidthCm={placement.width}
                      printHeightCm={placement.height}
                      printXCm={placement.x}
                      printYCm={placement.y}
                      repeatOnMug={repeatOnMug}
                      side={side}
                    />
                  </div>
                )}
              </>
            )}
          <p className="notice">
            داده هر سمت نسخه‌دار ذخیره می‌شود. پیش‌نمایش جایگزین فایل چاپ نیست.
            نمایش سه‌بعدی از همان مدل‌های ویترین استفاده می‌کند؛ جنس و ابعاد نهایی به تأیید تولیدکننده نیاز دارند.
          </p>
        </section>
      </div>
    </>
  );
}
