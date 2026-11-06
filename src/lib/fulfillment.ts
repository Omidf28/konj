import type { OrderSnapshot } from "../server/orders.ts";
import { orderStatusLabels } from "./order-status.ts";
import { formatNumber } from "./format.ts";

type Value = Record<string, unknown>;
const object = (input: unknown): Value =>
  input && typeof input === "object" && !Array.isArray(input)
    ? (input as Value)
    : {};
const string = (input: unknown) => (typeof input === "string" ? input : "");
const number = (input: unknown) =>
  typeof input === "number" && Number.isFinite(input) ? input : undefined;
const dimensions = (input: unknown) => {
  const value = object(input);
  return number(value.width) !== undefined && number(value.height) !== undefined
    ? { width: number(value.width)!, height: number(value.height)! }
    : undefined;
};
export interface FulfillmentOrder {
  id: string;
  status: string;
  createdAt: number;
  shippingCode: string;
  snapshot: OrderSnapshot;
}
function localMedia(input: unknown): string | undefined {
  const url = string(input);
  return /^\/api\/media\/[a-f0-9-]{36}$/.test(url) ? url : undefined;
}
export function workshopSheet(order: FulfillmentOrder) {
  const warnings = [
    "این برگه از اطلاعات ثابت هنگام خرید ساخته شده است؛ اندازه‌ها به سانتی‌متر هستند.",
  ];
  if (order.snapshot.mode === "test")
    warnings.push("سفارش آزمایشی است؛ پرداخت واقعی انجام نشده است.");
  if (["awaiting_payment", "cancelled"].includes(order.status))
    warnings.push("وضعیت این سفارش مجوز شروع تولید ندارد.");
  const items = order.snapshot.items.map((item, index) => {
    const snapshot = object(item.productSnapshot);
    const base = object(snapshot.base);
    const design = object(snapshot.design);
    const area = object(base.printArea);
    const chart = Array.isArray(base.sizeChart)
      ? base.sizeChart.map(object).find((row) => row.size === item.size)
      : undefined;
    const image = localMedia(design.imageUrl);
    const size = dimensions(snapshot.dimensionsCm);
    const ready = object(snapshot.printPlacement);
    const readyPrint =
      number(ready.widthCm) !== undefined
        ? ready
        : size
          ? {
              widthCm: size.width,
              heightCm: size.height,
              xCm: 0,
              yCm: 0,
              side: "front",
            }
          : undefined;
    const sources = item.custom
      ? [item.custom, ...(item.custom.additionalPrints || [])]
      : readyPrint
        ? [readyPrint]
        : [];
    const prints = sources.map((input) => {
      const print = object(input);
      const uploadId = string(print.uploadId);
      const upload = /^[-a-zA-Z0-9]{10,80}$/.test(uploadId)
        ? "/api/uploads/" + encodeURIComponent(uploadId)
        : undefined;
      return {
        side: print.side === "back" ? "back" : "front",
        widthCm: number(print.widthCm),
        heightCm: number(print.heightCm),
        xCm: number(print.xCm),
        yCm: number(print.yCm),
        rotation: number(print.rotation) ?? 0,
        productWidthCm: number(print.productWidthCm),
        productHeightCm: number(print.productHeightCm),
        previewUrl: upload || image,
        originalUrl: upload
          ? upload + "?original=1"
          : image
            ? image + "?original=1"
            : undefined,
      };
    });
    const pack = Array.isArray(snapshot.packItems)
      ? snapshot.packItems.map((entry) => {
          const value = object(entry);
          return {
            productId: string(value.productId),
            quantityPerPack: number(value.quantity),
            totalQuantity: (number(value.quantity) || 0) * item.quantity,
          };
        })
      : [];
    if (!prints.length || prints.some((print) => !print.originalUrl))
      warnings.push(
        `قلم ${index + 1}: فایل اصلی چاپ در اطلاعات زمان خرید تعریف نشده است؛ پیش‌نمایش نمونه فایل تولید نیست.`,
      );
    if (pack.length)
      warnings.push(
        `قلم ${index + 1}: ترکیب پک با شناسه و تعداد زمان خرید آمده است؛ مشخصات تولید هر جزء باید جدا بررسی شود.`,
      );
    if (!base.id)
      warnings.push(
        `قلم ${index + 1}: مشخصات مدل پایه در این سفارش قدیمی موجود نیست.`,
      );
    return {
      index: index + 1,
      productId: item.productId,
      name: item.name,
      sku: item.sku,
      color: item.color,
      size: item.size,
      quantity: item.quantity,
      availability: string(snapshot.availability),
      preparationDays: number(snapshot.preparationDays),
      dimensionsCm: size,
      model: {
        id: string(base.id),
        name: string(base.name),
        category: string(base.category),
        material: string(base.material),
        cut: string(base.cut),
        printMethod: string(base.printMethod),
        capacityMl: number(base.capacityMl),
        widthCm: number(base.widthCm),
        heightCm: number(base.heightCm),
        printArea:
          number(area.widthCm)! > 0 && number(area.heightCm)! > 0
            ? { widthCm: base.category === "mug" && sources.length === 2 ? number(area.widthCm)! / 2 : number(area.widthCm), heightCm: number(area.heightCm) }
            : undefined,
        sizeMeasurements: chart
          ? {
              chest: number(chart.chest),
              length: number(chart.length),
              sleeve: number(chart.sleeve),
            }
          : undefined,
      },
      packContents: pack,
      prints,
    };
  });
  return {
    version: 1,
    kind: "workshop",
    orderId: order.id,
    status: order.status,
    statusLabel: orderStatusLabels[order.status] || order.status,
    createdAt: order.createdAt,
    mode: order.snapshot.mode,
    unit: "cm",
    totalUnits: items.reduce((sum, item) => sum + item.quantity, 0),
    warnings,
    items,
  };
}
export function escapeHtml(input: unknown): string {
  return String(input ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
const e = escapeHtml;
const cell = (label: string, value: unknown) =>
  `<div><dt>${e(label)}</dt><dd>${e(value === undefined || value === "" ? "ثبت نشده" : value)}</dd></div>`;
const measure = (value: unknown) =>
  typeof value === "number" ? formatNumber(value) : "—";
const side = (value: string) => (value === "back" ? "پشت" : "جلو");
function document(title: string, order: FulfillmentOrder, body: string) {
  const date = new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(order.createdAt);
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(title)} · ${e(order.id)}</title><style>
@font-face{font-family:Vazirmatn;src:url('/fonts/Vazirmatn.woff2') format('woff2');font-display:swap}
*{box-sizing:border-box}body{font-family:Vazirmatn,Tahoma,sans-serif;background:#eee;color:#171717;margin:0;line-height:1.9;overflow-wrap:anywhere}.sheet{max-width:960px;margin:24px auto;padding:30px;background:white}h1{font-size:24px;margin:0}h2{font-size:19px}h3{font-size:16px}p{margin:8px 0}bdi,.code{direction:ltr;unicode-bidi:isolate;overflow-wrap:anywhere}.code{font-family:monospace;font-size:12px}dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}dt{font-size:12px;color:#555}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.notice{border:1px solid #777;padding:12px}.item{border-top:2px solid #222;margin-top:24px;padding-top:12px}.print{border:1px solid #bbb;padding:12px;margin:12px 0;break-inside:avoid}img{max-width:180px;max-height:160px;object-fit:contain}a{color:#153e26;overflow-wrap:anywhere}.checks{display:flex;flex-wrap:wrap;gap:20px;padding:14px 0}.address{font-size:18px;white-space:pre-wrap}.hint{font-size:13px;color:#444}footer{margin-top:24px;border-top:1px solid #bbb;padding-top:12px;font-size:12px}
@page { size: A4; margin: 14mm; }
@media screen and (max-width: 600px) {
  .sheet { margin: 0; padding: 16px; }
  dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media print {
  body { background: white; orphans: 3; widows: 3; }
  .sheet { max-width: none; margin: 0; padding: 0; }
  .screen { display: none; }
  h1, h2, h3, .item > .code { break-after: avoid; }
  dl > div { break-inside: avoid; }
  a { color: black; text-decoration: none; }
  dl { gap: 8px; }
}
</style></head><body><main class="sheet"><h1>${e(title)}</h1><p class="code">${e(order.id)}</p><p>${e(date)} · ${e(orderStatusLabels[order.status] || order.status)}</p><p class="notice screen">برای چاپ یا ذخیره PDF از دستور چاپ مرورگر استفاده کنید (Ctrl+P). برگه محرمانه است؛ فایل‌های اصلی فقط با ورود مدیر باز می‌شوند.</p>${body}<footer>اطلاعات مربوط به زمان خرید است. این برگه تأیید پرداخت واقعی یا فایل آماده چاپ محسوب نمی‌شود.</footer></main></body></html>`;
}
export function renderWorkshop(order: FulfillmentOrder) {
  const sheet = workshopSheet(order);
  return document(
    "برگه تولید",
    order,
    `<aside class="notice">${sheet.warnings.map((w) => `<p>${e(w)}</p>`).join("")}</aside><p>جمع واحدهای سفارش: ${e(formatNumber(sheet.totalUnits))}${sheet.items.some((item) => item.packContents.length) ? " · هر پک یک واحد سفارش است؛ تعداد استیکرهای داخل آن در ترکیب پک آمده است." : " عدد"}</p>` +
      sheet.items
        .map(
          (item) =>
            `<section class="item"><h2>${e(formatNumber(item.index))}. ${e(item.name)}</h2><p class="code">SKU: ${e(item.sku)}</p><dl>${cell("تعداد", formatNumber(item.quantity))}${cell("رنگ", item.color)}${cell("سایز", item.size || "استاندارد")}${cell("مدل پایه", item.model.name)}${cell("شناسه مدل", item.model.id)}${cell("جنس", item.model.material)}${cell("برش", item.model.cut)}${cell("روش چاپ", item.model.printMethod)}${cell("زمان آماده‌سازی نمونه (روز)", item.preparationDays)}${item.dimensionsCm ? cell("ابعاد محصول (cm)", measure(item.dimensionsCm.width) + " × " + measure(item.dimensionsCm.height)) : ""}${item.model.widthCm && item.model.heightCm ? cell("عرض / ارتفاع مدل (cm)", measure(item.model.widthCm) + " / " + measure(item.model.heightCm)) : ""}${item.model.capacityMl ? cell("ظرفیت ماگ (ml)", measure(item.model.capacityMl)) : ""}${item.model.sizeMeasurements ? cell("عرض سینه / طول / آستین (cm)", [item.model.sizeMeasurements.chest, item.model.sizeMeasurements.length, item.model.sizeMeasurements.sleeve].map(measure).join(" / ")) : ""}${item.model.printArea ? cell("محدوده چاپ (cm)", measure(item.model.printArea.widthCm) + " × " + measure(item.model.printArea.heightCm)) : ""}</dl>${item.prints.map((print) => `<section class="print"><h3>چاپ ${side(print.side)}</h3><p>اندازه: ${e(measure(print.widthCm))} × ${e(measure(print.heightCm))} cm · موقعیت: ${e(measure(print.xCm))}، ${e(measure(print.yCm))} cm · زاویه: ${e(measure(print.rotation))} درجه</p><p class="hint">مبدأ: گوشه بالا-چپ محدوده چاپ، هنگام نگاه‌کردن مستقیم به همین سمت محصول؛ x به راست و y به پایین افزایش می‌یابد.</p>${print.previewUrl ? `<img src="${e(print.previewUrl)}" alt="پیش‌نمایش مرجع؛ فایل چاپ نیست" loading="eager">` : ""}${print.originalUrl ? `<p><a href="${e(print.originalUrl)}">دریافت اصل فایل چاپ</a></p>` : `<p class="notice">اصل فایل تولید تعریف نشده است.</p>`}</section>`).join("")}${item.packContents.length ? `<h3>ترکیب ثابت هر پک</h3><ul>${item.packContents.map((part) => `<li><bdi>${e(part.productId)}</bdi> · ${e(measure(part.quantityPerPack))} عدد در هر پک · جمع ${e(measure(part.totalQuantity))} عدد</li>`).join("")}</ul>` : ""}<div class="checks"><span>□ مشخصات بررسی شد</span><span>□ فایل اصلی دریافت شد</span><span>□ کنترل کیفیت</span></div></section>`,
        )
        .join(""),
  );
}
export function renderPacking(order: FulfillmentOrder) {
  const address = order.snapshot.address;
  return document(
    "برگه بسته‌بندی و ارسال",
    order,
    `<p class="notice">${order.snapshot.mode === "test" ? "سفارش آزمایشی؛ پرداخت واقعی انجام نشده است." : "وضعیت پرداخت را پیش از ارسال بررسی کنید."}${["awaiting_payment", "cancelled"].includes(order.status) ? " این سفارش مجوز ارسال ندارد." : ""}</p><section class="item"><h2>گیرنده</h2><p class="address">${e(address.name)}</p><p><bdi>${e(address.mobile)}</bdi></p><p class="address">${e(address.province)}، ${e(address.city)}، ${e(address.address)}</p><p>کد پستی: <bdi>${e(address.postalCode)}</bdi></p>${address.note ? `<p>یادداشت مشتری: ${e(address.note)}</p>` : ""}<p>کد رهگیری ارسال: <bdi>${e(order.shippingCode || "ثبت نشده")}</bdi></p></section><h2>کنترل اقلام داخل بسته</h2>${order.snapshot.items.map((item) => `<section class="print"><h3>□ ${e(item.name)}</h3><p>${e(item.color)} · ${e(item.size || "استاندارد")} · ${e(formatNumber(item.quantity))} عدد${item.custom ? " · طرح مشتری" : ""}</p><p class="code">SKU: ${e(item.sku)}</p></section>`).join("")}<div class="checks"><span>□ تعداد و گزینه‌ها تطبیق داده شد</span><span>□ کیفیت بررسی شد</span><span>□ نوت برند اضافه شد</span><span>□ نشانی تطبیق داده شد</span></div>`,
  );
}
