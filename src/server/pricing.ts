import { formatNumber } from "../lib/format.ts";
import { resolveReadyPrint, type PrintAsset } from "../lib/print-placement.ts";
import {
  db,
  getProduct,
  getProducts,
  getBase,
  getContent,
  settings,
} from "./db.ts";
import { AppError } from "./security.ts";
import type { CartItem, CustomDesign, Quote } from "../lib/commerce-types.ts";
function finite(value: unknown, min: number, max: number) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}
function validateSingle(
  input: unknown,
  productId: string,
  owner: string,
): CustomDesign {
  const custom = input as CustomDesign;
  const product = getProduct(productId);
  const config = settings();
  if (
    !custom ||
    custom.version !== 1 ||
    !product ||
    !["front", "back"].includes(custom.side) ||
    !/^[-a-zA-Z0-9]{10,80}$/.test(custom.uploadId)
  )
    throw new AppError("مشخصات طرح شخصی معتبر نیست.");
  if (
    custom.side === "back" &&
    (!config.backPrintEnabled ||
      !["tshirt", "hoodie", "mug"].includes(product.category))
  )
    throw new AppError("چاپ پشت برای این محصول فعال نیست.");
  const upload = db()
    .prepare("SELECT * FROM uploads WHERE id=? AND owner_hash=?")
    .get(custom.uploadId, owner);
  if (!upload) throw new AppError("فایل تأییدشده این طرح در دسترس نیست.");
  const base = getBase(product.baseId);
  if (!base?.customEnabled)
    throw new AppError("شخصی‌سازی این مدل غیرفعال است.");
  if (custom.side === "back" && !base.backPrintEnabled)
    throw new AppError("چاپ پشت این مدل غیرفعال است.");
  const isSticker = product.category === "sticker";
  const maxWidth = isSticker
    ? config.customStickerMaxCm
    : base.printArea?.widthCm || 0;
  const maxHeight = isSticker
    ? config.customStickerMaxCm
    : base.printArea?.heightCm || 0;
  if (
    !finite(
      custom.widthCm,
      isSticker ? config.customStickerMinCm : 1,
      maxWidth,
    ) ||
    !finite(
      custom.heightCm,
      isSticker ? config.customStickerMinCm : 1,
      maxHeight,
    ) ||
    !finite(custom.xCm, 0, maxWidth - custom.widthCm + 0.001) ||
    !finite(custom.yCm, 0, maxHeight - custom.heightCm + 0.001) ||
    custom.rotation !== 0
  )
    throw new AppError("اندازه یا موقعیت چاپ خارج از محدوده مجاز است.");
  const aspect = Number(upload.width) / Number(upload.height);
  if (Math.abs(custom.widthCm / custom.heightCm - aspect) > aspect * 0.025)
    throw new AppError("نسبت تصویر چاپ حفظ نشده است.");
  if (product.category === "pack")
    throw new AppError("سفارشی‌سازی پک پشتیبانی نمی‌شود.");
  return {
    version: 1,
    uploadId: custom.uploadId,
    side: custom.side,
    widthCm: custom.widthCm,
    heightCm: custom.heightCm,
    xCm: custom.xCm,
    yCm: custom.yCm,
    rotation: 0,
    ...(custom.productWidthCm
      ? { productWidthCm: custom.widthCm, productHeightCm: custom.heightCm }
      : {}),
  };
}
export function validateCustom(
  input: unknown,
  productId: string,
  owner: string,
): CustomDesign {
  const main = validateSingle(input, productId, owner);
  const extra = (input as CustomDesign).additionalPrints;
  if (main.side === "back" && getProduct(productId)?.category === "mug")
    throw new AppError("برای چاپ دوطرفه ماگ، ابتدا طرح سمت جلو را انتخاب کنید.");
  if (extra !== undefined) {
    if (!Array.isArray(extra) || extra.length > 1)
      throw new AppError("حداکثر دو سمت چاپ پذیرفته می‌شود.");
    const additionalPrints = extra.map((print) =>
      validateSingle(print, productId, owner),
    );
    if (additionalPrints.some((print) => print.side === main.side))
      throw new AppError("سمت چاپ تکراری است.");
    const product = getProduct(productId);
    if (additionalPrints.length && product?.category === "mug") {
      const area = getBase(product.baseId)?.printArea;
      const second = additionalPrints[0];
      if (!area || main.side !== "front" || second.uploadId !== main.uploadId ||
          second.widthCm !== main.widthCm || second.heightCm !== main.heightCm ||
          second.xCm !== main.xCm || second.yCm !== main.yCm ||
          main.xCm + main.widthCm > area.widthCm / 2 + 0.001)
        throw new AppError("طرح دو طرف ماگ باید یکسان و داخل محدوده هر سمت باشد.");
    }
    return { ...main, additionalPrints };
  }
  return main;
}
export function quoteCart(input: unknown, owner = ""): Quote {
  if (!Array.isArray(input) || !input.length || input.length > 50)
    throw new AppError("سبد باید بین ۱ تا ۵۰ قلم داشته باشد.");
  const config = settings();
  const seen = new Set<string>();
  const requestedStock = new Map<string, number>();
  const items = input.map((raw) => {
    try {
      const item = raw as CartItem;
      if (
        !item ||
        typeof item.key !== "string" ||
        item.key.length > 200 ||
        seen.has(item.key) ||
        typeof item.productId !== "string" ||
        typeof item.sku !== "string" ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 50
      )
        throw new AppError("قلم یا تعداد سبد معتبر نیست.");
      seen.add(item.key);
      let product = getProduct(item.productId);
      let variant = product?.variants.find((v) => v.sku === item.sku);
      if (item.custom && product && !product.customOnly && variant) {
        const color = variant.color,
          size = variant.size;
        const offer = getProducts({ includeCustom: true }).find(
          (candidate) =>
            candidate.customOnly &&
            candidate.baseId === product!.baseId &&
            candidate.variants.some(
              (option) => option.color === color && option.size === size,
            ),
        );
        if (!offer)
          throw new AppError(
            "عرضه مخصوص طرح شخصی برای این مدل تنظیم نشده است.",
            409,
          );
        product = offer;
        variant = offer.variants.find(
          (option) => option.color === color && option.size === size,
        );
      }
      if (product?.customOnly && !item.custom)
        throw new AppError(
          "این عرضه فقط همراه با فایل طرح مشتری قابل سفارش است.",
          409,
        );
      if (
        !product ||
        !variant ||
        variant.enabled === false ||
        product.availability === "unavailable"
      )
        throw new AppError(
          "یکی از محصولات یا گزینه‌های سبد دیگر قابل سفارش نیست.",
          409,
        );
      const readyPrint = resolveReadyPrint(
        product,
        getBase(product.baseId),
        getContent<PrintAsset & { id: string }>("designs").find(
          (design) => design.id === product.designId,
        ),
      );
      if (!item.custom && !readyPrint.valid)
        throw new AppError(product.name + ": " + readyPrint.error, 409);
      requestedStock.set(
        variant.sku,
        (requestedStock.get(variant.sku) || 0) + item.quantity,
      );
      if (
        product.availability === "ready" &&
        requestedStock.get(variant.sku)! > variant.stock
      )
        throw new AppError(
          `موجودی ${product.name} کافی نیست؛ موجودی فعلی این گزینه ${formatNumber(variant.stock)} عدد و مجموع درخواست‌شده در سبد ${formatNumber(requestedStock.get(variant.sku)!)} عدد است.`,
          409,
        );
      const delta = variant.priceDeltaToman || 0;
      if (!Number.isSafeInteger(delta))
        throw new AppError("قیمت گزینه نیازمند اصلاح است.", 409);
      let price = product.priceToman + delta;
      const custom = item.custom
        ? validateCustom(item.custom, product.id, owner)
        : undefined;
      if (custom) {
        price =
          (getBase(product.baseId)?.basePriceToman ?? product.priceToman) +
          delta;
        for (const print of [custom, ...(custom.additionalPrints || [])]) {
          price +=
            print.side === "front"
              ? config.frontPrintToman
              : config.backPrintToman;
          if (print.widthCm * print.heightCm > 400)
            price += config.largePrintToman;
        }
        if (product.category === "sticker")
          price =
            Math.ceil(
              custom.widthCm * custom.heightCm * config.stickerCm2Toman,
            ) + delta;
      }
      if (!Number.isSafeInteger(price) || price < 0)
        throw new AppError("قیمت محصول نیازمند اصلاح مدیر است.", 409);
      return {
        key: item.key,
        productId: product.id,
        sku: variant.sku,
        quantity: item.quantity,
        ...(custom ? { custom } : {}),
        name: product.name,
        productSnapshot: {
          printPlacement: readyPrint.placement,
          base: getBase(product.baseId),
          designId: product.designId,
          design: getContent<{ id: string }>("designs").find(
            (design) => design.id === product.designId,
          ),
          variant: { ...variant },
          availability: product.availability,
          dimensionsCm: custom && product.category === "sticker"
            ? { width: custom.widthCm, height: custom.heightCm }
            : variant.dimensionsCm || product.dimensionsCm,
          packItems: product.packItems,
          preparationDays: product.preparationDays,
        },
        color: variant.color,
        size: custom && product.category === "sticker"
          ? formatNumber(custom.widthCm) + " × " + formatNumber(custom.heightCm) + " سانتی‌متر"
          : variant.size,
        unitPriceToman: price,
        lineTotalToman: price * item.quantity,
      };
    } catch (error) {
      if (
        error instanceof AppError &&
        raw &&
        typeof raw.key === "string" &&
        raw.key.length <= 200
      )
        error.details = { itemKey: raw.key };
      throw error;
    }
  });
  const subtotalToman = items.reduce(
    (sum, item) => sum + item.lineTotalToman,
    0,
  );
  const totalToman = subtotalToman + config.shippingToman;
  if (!Number.isSafeInteger(totalToman) || totalToman > 1e10)
    throw new AppError("مبلغ سفارش خارج از محدوده است.");
  return {
    items,
    subtotalToman,
    shippingToman: config.shippingToman,
    totalToman,
    testMode: config.testMode,
  };
}
export function tomanToRial(toman: number) {
  if (
    !Number.isSafeInteger(toman) ||
    toman < 0 ||
    !Number.isSafeInteger(toman * 10)
  )
    throw new AppError("مبلغ معتبر نیست.");
  return toman * 10;
}
