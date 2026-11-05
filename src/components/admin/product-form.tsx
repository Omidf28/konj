"use client";
import Image from "next/image";
import type { Product } from "@/lib/catalog";
import type { BaseModel } from "@/lib/base-model";
import { formatPrice, formatNumber } from "@/lib/format";
import { NumericField, TextField } from "./fields";
import { MediaUpload } from "./media-upload";
interface Taxonomy {
  id: string;
  label: string;
}
export interface DesignRecord {
  id: string;
  title: string;
  motif: Product["motif"];
  imageUrl?: string;
  imageWidthPx?: number;
  imageHeightPx?: number;
  print?: {
    widthCm: number;
    heightCm: number;
    xCm: number;
    yCm: number;
    side?: "front" | "back";
  };
}
export interface EditorCatalog {
  media?: {
    imageUrl: string;
    width: number;
    height: number;
    originalUrl: string;
  }[];
  products: Product[];
  bases: BaseModel[];
  designs: DesignRecord[];
  categories: Taxonomy[];
  collections: Taxonomy[];
}
export function ProductForm({
  value,
  onChange,
  data,
  onUploadBusy,
}: {
  value: Product;
  onChange: (value: Product) => void;
  data: EditorCatalog;
  onUploadBusy?: (busy: boolean) => void;
}) {
  const base = data.bases.find((b) => b.id === value.baseId);
  const stored = data.products.find((p) => p.id === value.id);
  const gallery = [
    ...new Set(
      [value.imageUrl, ...(value.images || [])].filter(
        (url): url is string => !!url,
      ),
    ),
  ];
  const patch = (change: Partial<Product>) => onChange({ ...value, ...change });
  function variant(
    index: number,
    change: Partial<Product["variants"][number]>,
  ) {
    patch({
      variants: value.variants.map((v, i) =>
        i === index ? { ...v, ...change } : v,
      ),
    });
  }
  function generate() {
    if (!value.id) return;
    const variants = [...value.variants];
    const colors = value.colors.length
      ? value.colors
      : [{ name: "چاپ رنگی", hex: "#ffffff" }];
    const sizes = base?.sizes.length ? base.sizes : [null];
    for (const [c, color] of colors.entries())
      for (const [s, size] of sizes.entries())
        if (!variants.some((v) => v.color === color.name && v.size === size))
          variants.push({
            sku: value.id + "-" + c + "-" + s,
            color: color.name,
            size,
            stock: 0,
            enabled: true,
          });
    patch({ variants });
  }
  return (
    <>
      <label className="check-field">
        <input
          type="checkbox"
          checked={!!value.customOnly}
          disabled={value.revision !== undefined}
          onChange={(event) =>
            patch({
              customOnly: event.target.checked,
              ...(event.target.checked
                ? {
                    designId:
                      data.designs.find(
                        (design) => design.id === "customer-art",
                      )?.id || value.designId,
                  }
                : {}),
            })
          }
        />
        این عرضه مخصوص طرح مشتری است و موجودی مستقل از طرح آماده دارد
      </label>
      <div className="form-grid">
        <TextField
          label="شناسه انگلیسی ثابت"
          value={value.id}
          readOnly={value.revision !== undefined}
          required
          onChange={(id) => patch({ id })}
        />
        <TextField
          label="نام محصول"
          value={value.name}
          required
          maxLength={150}
          onChange={(name) => patch({ name })}
        />
        <label className="field">
          مدل پایه
          <select
            value={value.baseId}
            onChange={(event) => {
              const next = data.bases.find((b) => b.id === event.target.value)!;
              patch({ baseId: next.id, category: next.category });
            }}
          >
            {data.bases.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          طرح چاپ
          <select
            value={value.designId}
            onChange={(event) => {
              const next = data.designs.find(
                (d) => d.id === event.target.value,
              )!;
              patch({ designId: next.id, motif: next.motif });
            }}
          >
            {data.designs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          کالکشن
          <select
            value={value.collection}
            onChange={(event) => patch({ collection: event.target.value })}
          >
            {data.collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          وضعیت تأمین
          <select
            value={value.availability}
            onChange={(event) =>
              patch({
                availability: event.target.value as Product["availability"],
              })
            }
          >
            <option value="ready">موجود و آماده ارسال</option>
            <option value="made-to-order">تولید پس از سفارش</option>
            <option value="unavailable">ناموجود</option>
          </select>
        </label>
        <NumericField
          label="قیمت محصول (تومان)"
          value={value.priceToman}
          onChange={(priceToman) => patch({ priceToman })}
        />
        <NumericField
          label="آماده‌سازی نمونه (روز کاری)"
          value={value.preparationDays}
          max={90}
          onChange={(preparationDays) => patch({ preparationDays })}
        />
      </div>
      <TextField
        label="توضیحات محصول"
        multiline
        value={value.description}
        maxLength={3000}
        onChange={(description) => patch({ description })}
      />
      <fieldset>
        <legend>تصویر محصول</legend>
        <MediaUpload
          onBusyChange={onUploadBusy}
          disabled={gallery.length >= 8}
          library={data.media}
          onUploaded={(result) =>
            patch({
              imageUrl: value.imageUrl || result.imageUrl,
              images: [...new Set([...gallery, result.imageUrl])],
            })
          }
        />
        <p className="muted" role="status">
          {formatNumber(gallery.length)} از ۸ تصویر؛ تصویر اصلی در ابتدای گالری فروشگاه است.
          {gallery.length >= 8 &&
            " ظرفیت گالری پُر است؛ برای جایگزینی، یکی از تصاویر را از گالری بردارید."}
        </p>
        <div className="gallery-admin" aria-label="گالری تصاویر محصول">
          {gallery.map((url, index) => (
            <div key={url}>
              <Image
                src={url}
                width={100}
                height={100}
                unoptimized
                alt={"تصویر " + formatNumber(index + 1) + " محصول"}
              />
              <button
                type="button"
                className="text-link"
                disabled={value.imageUrl === url}
                aria-label={"اصلی کردن تصویر " + (index + 1)}
                onClick={() => patch({ imageUrl: url, images: gallery })}
              >
                {value.imageUrl === url ? "تصویر اصلی" : "اصلی کردن"}
              </button>
              <button
                type="button"
                className="text-link"
                aria-label={"برداشتن تصویر " + (index + 1) + " از گالری"}
                onClick={() => {
                  const remaining = gallery.filter((image) => image !== url);
                  patch({
                    imageUrl: value.imageUrl === url ? remaining[0] : value.imageUrl,
                    images: remaining,
                  });
                }}
              >
                برداشتن از گالری
              </button>
            </div>
          ))}
        </div>
        <p className="muted">
          تغییر گالری پس از ذخیره فرم اعمال می‌شود. برداشتن تصویر، فایل اصلی را
          پاک نمی‌کند؛ از کتابخانه تصاویر قبلی می‌توانید دوباره انتخابش کنید.
        </p>
      </fieldset>
      <fieldset>
        <legend>چیدمان چاپ این عرضه</legend>
        <label className="check-field">
          <input
            type="checkbox"
            checked={!!value.printPlacement}
            onChange={(event) => {
              if (!event.target.checked) {
                patch({ printPlacement: undefined });
                return;
              }
              const design = data.designs.find((d) => d.id === value.designId);
              const ratio =
                design?.imageWidthPx && design.imageHeightPx
                  ? design.imageWidthPx / design.imageHeightPx
                  : 1;
              const width = Math.min(
                20,
                base?.printArea?.widthCm || 20,
                (base?.printArea?.heightCm || 24) * ratio,
              );
              patch({
                printPlacement: {
                  widthCm: width,
                  heightCm: width / ratio,
                  xCm: 0,
                  yCm: 0,
                  side: "front",
                },
              });
            }}
          />
          چیدمان مختص همین محصول؛ به جای پیش‌فرض طرح
        </label>
        {value.printPlacement && (
          <div className="form-grid">
            {(["widthCm", "heightCm", "xCm", "yCm"] as const).map((key) => (
              <NumericField
                key={key}
                label={
                  {
                    widthCm: "عرض چاپ (cm)",
                    heightCm: "ارتفاع چاپ (cm)",
                    xCm: "فاصله از چپ (cm)",
                    yCm: "فاصله از بالا (cm)",
                  }[key]
                }
                min={["xCm", "yCm"].includes(key) ? 0 : 1}
                max={100}
                integer={false}
                value={value.printPlacement![key]}
                onChange={(next) => {
                  const design = data.designs.find(
                    (d) => d.id === value.designId,
                  );
                  const ratio =
                    design?.imageWidthPx && design.imageHeightPx
                      ? design.imageWidthPx / design.imageHeightPx
                      : null;
                  const print = { ...value.printPlacement!, [key]: next };
                  if (ratio && key === "widthCm") print.heightCm = next / ratio;
                  if (ratio && key === "heightCm") print.widthCm = next * ratio;
                  patch({ printPlacement: print });
                }}
              />
            ))}
          </div>
        )}
        <p className="muted">
          یک فایل طرح روی چند مدل استفاده می‌شود؛ ابعاد و محل چاپ هر عرضه
          می‌تواند مستقل باشد.
        </p>
      </fieldset>
      <fieldset>
        <legend>رنگ‌ها</legend>
        {value.colors.map((color, index) => (
          <div className="color-editor" key={index}>
            <TextField
              label="نام رنگ"
              value={color.name}
              onChange={(name) =>
                patch({
                  colors: value.colors.map((c, i) =>
                    i === index ? { ...c, name } : c,
                  ),
                })
              }
            />
            <label className="field">
              نمونه رنگ
              <input
                type="color"
                value={color.hex}
                onChange={(event) =>
                  patch({
                    colors: value.colors.map((c, i) =>
                      i === index ? { ...c, hex: event.target.value } : c,
                    ),
                  })
                }
              />
            </label>
          </div>
        ))}
        <button
          type="button"
          className="button outline"
          onClick={() =>
            patch({
              colors: [...value.colors, { name: "رنگ جدید", hex: "#555555" }],
            })
          }
        >
          افزودن رنگ
        </button>
        <p className="muted">
          برای توقف فروش ترکیب، آن گزینه را غیرفعال کنید. مشخصات SKUهای ثبت‌شده
          ثابت می‌مانند.
        </p>
      </fieldset>
      {value.category === "sticker" && (
        <fieldset>
          <legend>ابعاد واقعی استیکر با حاشیه برش</legend>
          <div className="form-grid">
            <NumericField
              label="عرض (سانتی‌متر)"
              integer={false}
              min={1}
              max={100}
              value={value.dimensionsCm?.width || 8}
              onChange={(width) =>
                patch({
                  dimensionsCm: {
                    width,
                    height: value.dimensionsCm?.height || 6,
                  },
                })
              }
            />
            <NumericField
              label="ارتفاع (سانتی‌متر)"
              integer={false}
              min={1}
              max={100}
              value={value.dimensionsCm?.height || 6}
              onChange={(height) =>
                patch({
                  dimensionsCm: {
                    height,
                    width: value.dimensionsCm?.width || 8,
                  },
                })
              }
            />
          </div>
          <p className="muted">
            پیکسل تصویر، اندازه فروش نیست. برای سایزهای مختلف، ابعاد هر SKU را
            در جدول گزینه‌ها وارد کنید.
          </p>
        </fieldset>
      )}
      <fieldset>
        <legend>گزینه‌های قابل خرید و موجودی قابل فروش</legend>
        <button
          type="button"
          className="button outline"
          disabled={!value.id}
          onClick={generate}
        >
          تولید ترکیب‌های رنگ و سایزِ جدید
        </button>
        <p className="notice">
          موجودی اینجا موجودی قابل فروش است؛ رزروهای سفارش جدا محافظت می‌شوند.
          اگر موجودی هم‌زمان تغییر کند، ذخیره فرم قدیمی رد می‌شود.
        </p>
        {!value.variants.length && (
          <p>ابتدا شناسه و رنگ‌ها را وارد و ترکیب‌ها را تولید کنید.</p>
        )}
        <div className="variant-editor-list">
          {value.variants.map((v, index) => {
            const existing = stored?.variants.some((row) => row.sku === v.sku);
            return (
              <details key={index} open={value.variants.length < 5}>
                <summary>
                  <bdi>{v.sku}</bdi> · {v.color} / {v.size || "بدون سایز"} ·{" "}
                  {formatPrice(value.priceToman + (v.priceDeltaToman || 0))}{" "}
                  {v.enabled === false ? "· غیرفعال" : ""}
                </summary>
                <div className="form-grid">
                  <TextField
                    label="SKU ثابت"
                    value={v.sku}
                    readOnly={existing}
                    onChange={(sku) => variant(index, { sku })}
                  />
                  <TextField
                    label="رنگ گزینه"
                    value={v.color}
                    readOnly={existing}
                    onChange={(color) => variant(index, { color })}
                  />
                  <TextField
                    label="سایز / مدل گزینه"
                    value={v.size || ""}
                    readOnly={existing}
                    onChange={(size) => variant(index, { size: size || null })}
                  />
                  <NumericField
                    label="موجودی قابل فروش"
                    value={v.stock}
                    max={100000}
                    onChange={(stock) => variant(index, { stock })}
                  />
                  <NumericField
                    label="تفاوت قیمت (تومان)"
                    value={v.priceDeltaToman || 0}
                    min={-1e8}
                    max={1e8}
                    onChange={(priceDeltaToman) =>
                      variant(index, { priceDeltaToman })
                    }
                  />
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={v.enabled !== false}
                      onChange={(event) =>
                        variant(index, { enabled: event.target.checked })
                      }
                    />
                    این گزینه فعال است
                  </label>
                  {value.category === "sticker" && (
                    <>
                      <NumericField
                        label="عرض این SKU (cm)"
                        integer={false}
                        min={1}
                        max={100}
                        value={
                          v.dimensionsCm?.width ||
                          value.dimensionsCm?.width ||
                          8
                        }
                        onChange={(width) =>
                          variant(index, {
                            dimensionsCm: {
                              width,
                              height:
                                v.dimensionsCm?.height ||
                                value.dimensionsCm?.height ||
                                6,
                            },
                          })
                        }
                      />
                      <NumericField
                        label="ارتفاع این SKU (cm)"
                        integer={false}
                        min={1}
                        max={100}
                        value={
                          v.dimensionsCm?.height ||
                          value.dimensionsCm?.height ||
                          6
                        }
                        onChange={(height) =>
                          variant(index, {
                            dimensionsCm: {
                              height,
                              width:
                                v.dimensionsCm?.width ||
                                value.dimensionsCm?.width ||
                                8,
                            },
                          })
                        }
                      />
                    </>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </fieldset>
      {value.category === "pack" && (
        <fieldset>
          <legend>محتویات پک ثابت</legend>
          {(value.packItems || []).map((entry, index) => (
            <div key={index} className="form-grid">
              <label className="field">
                استیکر
                <select
                  value={entry.productId}
                  onChange={(event) =>
                    patch({
                      packItems: value.packItems!.map((row, i) =>
                        i === index
                          ? { ...row, productId: event.target.value }
                          : row,
                      ),
                    })
                  }
                >
                  {data.products
                    .filter((p) => p.category === "sticker")
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <NumericField
                label="تعداد"
                value={entry.quantity}
                min={1}
                max={50}
                onChange={(quantity) =>
                  patch({
                    packItems: value.packItems!.map((row, i) =>
                      i === index ? { ...row, quantity } : row,
                    ),
                  })
                }
              />
            </div>
          ))}
          <button
            type="button"
            className="button outline"
            onClick={() =>
              patch({
                packItems: [
                  ...(value.packItems || []),
                  {
                    productId:
                      data.products.find((p) => p.category === "sticker")?.id ||
                      "",
                    quantity: 1,
                  },
                ],
              })
            }
          >
            افزودن جزء پک
          </button>
        </fieldset>
      )}
    </>
  );
}
