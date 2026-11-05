"use client";
import { useEffect, useRef } from "react";
import type { BaseModel } from "@/lib/base-model";
import type { StoreSettings } from "@/server/db";
import type { Product } from "@/lib/catalog";
import { TextField, NumericField } from "./fields";
import { MediaUpload } from "./media-upload";
import type { DesignRecord, EditorCatalog } from "./product-form";
export function BaseForm({
  value,
  onChange,
  data,
  existing,
}: {
  value: BaseModel;
  onChange: (value: BaseModel) => void;
  data: EditorCatalog;
  existing: boolean;
}) {
  const patch = (change: Partial<BaseModel>) =>
    onChange({ ...value, ...change });
  const chart = useRef<HTMLFieldSetElement>(null);
  const addChartRow = useRef<HTMLButtonElement>(null);
  const pendingRowFocus = useRef<number | null>(null);
  useEffect(() => {
    const requested = pendingRowFocus.current;
    if (requested === null) return;
    pendingRowFocus.current = null;
    const rows = chart.current?.querySelectorAll<HTMLFieldSetElement>(".size-editor-entry");
    const row = rows?.[Math.min(requested, rows.length - 1)];
    if (row) row.querySelector<HTMLInputElement>("input")?.focus();
    else if (addChartRow.current && !addChartRow.current.disabled) addChartRow.current.focus();
    else chart.current?.focus();
  }, [value.sizeChart]);
  const nextChartSize = value.sizes.find(
    (size) => size.trim() && !value.sizeChart?.some((row) => row.size === size),
  );
  return (
    <>
      <div className="form-grid">
        <TextField
          label="شناسه مدل پایه"
          value={value.id}
          readOnly={existing}
          onChange={(id) => patch({ id })}
          required
        />
        <TextField
          label="نام مدل پایه"
          value={value.name}
          onChange={(name) => patch({ name })}
          required
        />
        <label className="field">
          نوع محصول
          <select
            value={value.category}
            onChange={(event) => patch({ category: event.target.value })}
          >
            {data.categories.map((c) => (
              <option value={c.id} key={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <TextField
          label="جنس"
          value={value.material}
          onChange={(material) => patch({ material })}
        />
        <TextField
          label="برش"
          value={value.cut || ""}
          onChange={(cut) => patch({ cut })}
        />
        <TextField
          label="روش چاپ"
          value={value.printMethod || ""}
          onChange={(printMethod) => patch({ printMethod })}
        />
        <NumericField
          label="قیمت پایه بدون چاپ (تومان)"
          value={value.basePriceToman || 0}
          onChange={(basePriceToman) => patch({ basePriceToman })}
        />
        <TextField
          label="سایزها، جداشده با ویرگول"
          value={value.sizes.join(",")}
          onChange={(sizes) =>
            patch({
              sizes: sizes
                .replace(/،/g, ",")
                .split(",")
                .map((s) => s.trim()),
            })
          }
        />
        <label className="check-field">
          <input
            type="checkbox"
            checked={!!value.customEnabled}
            onChange={(event) => patch({ customEnabled: event.target.checked })}
          />
          شخصی‌سازی فعال
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={!!value.backPrintEnabled}
            onChange={(event) =>
              patch({ backPrintEnabled: event.target.checked })
            }
          />
          چاپ پشت فعال
        </label>
      </div>
      <TextField
        label="دستور مراقبت"
        multiline
        value={value.care || ""}
        maxLength={3000}
        onChange={(care) => patch({ care })}
      />
      {value.category !== "sticker" && value.category !== "pack" && (
        <fieldset>
          <legend>محدوده مجاز چاپ (سانتی‌متر)</legend>
          <div className="form-grid">
            <NumericField
              label="عرض چاپ"
              integer={false}
              min={1}
              max={100}
              value={value.printArea?.widthCm || 28}
              onChange={(widthCm) =>
                patch({
                  printArea: {
                    widthCm,
                    heightCm: value.printArea?.heightCm || 35,
                  },
                })
              }
            />
            <NumericField
              label="ارتفاع چاپ"
              integer={false}
              min={1}
              max={100}
              value={value.printArea?.heightCm || 35}
              onChange={(heightCm) =>
                patch({
                  printArea: {
                    heightCm,
                    widthCm: value.printArea?.widthCm || 28,
                  },
                })
              }
            />
          </div>
        </fieldset>
      )}
      {["tshirt", "hoodie"].includes(value.category) && (
        <fieldset ref={chart} tabIndex={-1}>
          <legend>اندازه لباس در حالت تخت (cm)</legend>
          <p className="muted">
            این اعداد برای هر مدل مستقل‌اند؛ برچسب سایز ابعاد ثابت جهانی ندارد.
          </p>
          {(value.sizeChart || []).map((row, index) => (
            <fieldset className="size-editor-entry" key={index}>
              <legend>اندازه‌های سایز {row.size || "بدون نام"}</legend>
              <div className="size-editor-row">
                <TextField
                  label="سایز"
                  value={row.size}
                  onChange={(size) =>
                    patch({
                      sizeChart: value.sizeChart!.map((r, i) =>
                        i === index ? { ...r, size } : r,
                      ),
                    })
                  }
                />
                {(["chest", "length", "sleeve"] as const).map((key) => (
                  <NumericField
                    key={key}
                    label={
                      {
                        chest: "عرض سینه تخت",
                        length: "طول لباس",
                        sleeve: "آستین",
                      }[key]
                    }
                    min={1}
                    max={200}
                    integer={false}
                    value={row[key]}
                    onChange={(next) =>
                      patch({
                        sizeChart: value.sizeChart!.map((r, i) =>
                          i === index ? { ...r, [key]: next } : r,
                        ),
                      })
                    }
                  />
                ))}
              </div>
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  pendingRowFocus.current = index;
                  patch({ sizeChart: value.sizeChart!.filter((_, i) => i !== index) });
                }}
              >
                حذف اندازه‌های سایز {row.size || "بدون نام"}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="button outline"
            ref={addChartRow}
            disabled={!nextChartSize}
            onClick={() => {
              if (!nextChartSize) return;
              pendingRowFocus.current = value.sizeChart?.length || 0;
              patch({
                sizeChart: [
                  ...(value.sizeChart || []),
                  {
                    size: nextChartSize,
                    chest: 50,
                    length: 70,
                    sleeve: value.category === "hoodie" ? 62 : 22,
                  },
                ],
              });
            }}
          >
            افزودن ردیف اندازه
          </button>
          {!nextChartSize && (
            <p className="muted">برای همه سایزهای تعریف‌شده ردیف دارید؛ برای سایز تازه ابتدا فهرست سایزها را ویرایش کنید.</p>
          )}
        </fieldset>
      )}
      {value.category === "mug" && (
        <div className="form-grid">
          <NumericField
            label="ظرفیت ماگ (ml)"
            min={50}
            max={2000}
            value={value.capacityMl || 330}
            onChange={(capacityMl) => patch({ capacityMl })}
          />
          <NumericField
            label="قطر ماگ (cm)"
            min={2}
            max={25}
            integer={false}
            value={value.widthCm || 8}
            onChange={(widthCm) => patch({ widthCm })}
          />
          <NumericField
            label="ارتفاع ماگ (cm)"
            min={2}
            max={30}
            integer={false}
            value={value.heightCm || 9.5}
            onChange={(heightCm) => patch({ heightCm })}
          />
        </div>
      )}
    </>
  );
}
export function SettingsForm({
  value,
  onChange,
}: {
  value: StoreSettings;
  onChange: (value: StoreSettings) => void;
}) {
  const patch = (change: Partial<StoreSettings>) =>
    onChange({ ...value, ...change });
  const numbers: [keyof StoreSettings, string, number, number, boolean][] = [
    ["shippingToman", "هزینه ارسال نمونه (تومان)", 0, 1e8, true],
    ["frontPrintToman", "چاپ جلو (تومان)", 0, 1e8, true],
    ["backPrintToman", "چاپ پشت (تومان)", 0, 1e8, true],
    ["largePrintToman", "افزایش چاپ بزرگ (تومان)", 0, 1e8, true],
    ["stickerCm2Toman", "هر سانتی‌متر مربع استیکر (تومان)", 0, 1e8, true],
    ["customStickerMinCm", "کمترین ضلع استیکر سفارشی (cm)", 1, 50, false],
    ["customStickerMaxCm", "بیشترین ضلع استیکر سفارشی (cm)", 1, 50, false],
    ["maxUploadMb", "حد فایل مشتری (MB)", 1, 20, true],
    ["ownerStorageMb", "سهمیه هر نشست مشتری (MB)", 1, 1024, true],
    ["totalStorageMb", "سهمیه کل فایل‌ها (MB)", 1, 102400, true],
    ["orphanDays", "نگهداری فایل بدون سفارش (روز)", 1, 365, true],
  ];
  return (
    <>
      <TextField
        label="نام برند"
        value={value.brandName}
        onChange={(brandName) => patch({ brandName })}
        maxLength={60}
        required
      />
      <div className="form-grid">
        {numbers.map(([key, label, min, max, integer]) => (
          <NumericField
            key={key}
            label={label}
            min={min}
            max={max}
            integer={integer}
            value={Number(value[key])}
            onChange={(number) => patch({ [key]: number })}
          />
        ))}
      </div>
      <label className="check-field">
        <input
          type="checkbox"
          checked={value.testMode}
          onChange={(event) => patch({ testMode: event.target.checked })}
        />
        حالت آزمایشی محلی؛ در محیط تولید همیشه مسدود است
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={value.backPrintEnabled}
          onChange={(event) =>
            patch({ backPrintEnabled: event.target.checked })
          }
        />
        اجازه چاپ پشت برای مدل‌های پشتیبانی‌شده
      </label>
      {(
        [
          ["support", "اطلاعات پشتیبانی"],
          ["shippingPolicy", "شرایط ارسال و تعویض"],
          ["printGuide", "راهنمای فایل چاپ"],
          ["care", "راهنمای مراقبت عمومی"],
        ] as const
      ).map(([key, label]) => (
        <TextField
          key={key}
          label={label}
          multiline
          maxLength={5000}
          value={value[key]}
          onChange={(text) => patch({ [key]: text })}
        />
      ))}
      <p className="notice">
        متن تجاری نهایی را پس از تصمیم واقعی ثبت کنید. تغییر حالت آزمایشی به
        معنی اتصال درگاه واقعی نیست.
      </p>
    </>
  );
}
export function DesignForm({
  value,
  onChange,
  existing,
  onUploadBusy,
}: {
  value: DesignRecord;
  onChange: (value: DesignRecord) => void;
  existing: boolean;
  onUploadBusy?: (busy: boolean) => void;
}) {
  const patch = (change: Partial<DesignRecord>) =>
    onChange({ ...value, ...change });
  const print = value.print || {
    widthCm: 20,
    heightCm: 24,
    xCm: 4,
    yCm: 5,
    side: "front" as const,
  };
  return (
    <>
      <div className="form-grid">
        <TextField
          label="شناسه طرح"
          readOnly={existing}
          value={value.id}
          onChange={(id) => patch({ id })}
          required
        />
        <TextField
          label="نام طرح"
          value={value.title}
          onChange={(title) => patch({ title })}
          required
        />
        <label className="field">
          طرح جایگزین مفهومی
          <select
            value={value.motif}
            onChange={(event) =>
              patch({ motif: event.target.value as Product["motif"] })
            }
          >
            {Object.entries({
              offline: "آفلاین",
              noise: "نویز",
              cat: "گربه",
              fine: "لبخند",
            }).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <MediaUpload
        onBusyChange={onUploadBusy}
        onUploaded={(result) =>
          patch({
            imageUrl: result.imageUrl,
            imageWidthPx: result.width,
            imageHeightPx: result.height,
            print: {
              ...print,
              heightCm: (print.widthCm * result.height) / result.width,
            },
          })
        }
      />
      <fieldset>
        <legend>جای چاپ طرح آماده (cm)</legend>
        <div className="form-grid">
          {(["widthCm", "heightCm", "xCm", "yCm"] as const).map((key) => (
            <NumericField
              key={key}
              label={
                {
                  widthCm: "عرض چاپ",
                  heightCm: "ارتفاع چاپ",
                  xCm: "فاصله از چپ محدوده",
                  yCm: "فاصله از بالای محدوده",
                }[key]
              }
              min={key.endsWith("Cm") && ["xCm", "yCm"].includes(key) ? 0 : 1}
              max={100}
              integer={false}
              value={print[key]}
              onChange={(number) => {
                const ratio =
                  value.imageWidthPx && value.imageHeightPx
                    ? value.imageWidthPx / value.imageHeightPx
                    : null;
                patch({
                  print: {
                    ...print,
                    [key]: number,
                    ...(ratio && key === "widthCm"
                      ? { heightCm: number / ratio }
                      : {}),
                    ...(ratio && key === "heightCm"
                      ? { widthCm: number * ratio }
                      : {}),
                  },
                });
              }}
            />
          ))}
          <label className="field">
            سمت
            <select
              value={print.side || "front"}
              onChange={(event) =>
                patch({
                  print: {
                    ...print,
                    side: event.target.value as "front" | "back",
                  },
                })
              }
            >
              <option value="front">جلو</option>
              <option value="back">پشت</option>
            </select>
          </label>
        </div>
        <p className="muted">
          طرح می‌تواند روی چند محصول عرضه شود؛ محدوده هر مدل پایه باید جای چاپ
          را پشتیبانی کند.
        </p>
      </fieldset>
    </>
  );
}
