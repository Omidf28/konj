import { storageUsage } from "./storage.ts";
import {
  db,
  transaction,
  settings,
  getProducts,
  getContent,
  bumpProductRevision,
  addOrderEvent,
} from "./db.ts";
import { AppError } from "./security.ts";
import { statuses, statusLabels, type OrderSnapshot } from "./orders.ts";
import { orderTransitions } from "../lib/order-status.ts";
import { normalizeText } from "../lib/format.ts";
import { stockAlerts } from "../lib/inventory.ts";
import type { Product } from "../lib/catalog.ts";
export function adminData(search = "", page = 1, status = "") {
  if (search.length > 200)
    throw new AppError("عبارت جست‌وجو حداکثر ۲۰۰ نویسه است.");
  if (!Number.isSafeInteger(page) || page < 1)
    throw new AppError("شماره صفحه معتبر نیست.");
  if (status && !statuses.includes(status as (typeof statuses)[number]))
    throw new AppError("فیلتر وضعیت معتبر نیست.");
  const pattern = normalizeText(search);
  const condition =
    " WHERE (instr(konj_normalize(id), ?) > 0 OR instr(konj_normalize(json_extract(snapshot,'$.address.name')), ?) > 0 OR instr(konj_normalize(json_extract(snapshot,'$.address.mobile')), ?) > 0) AND (?='' OR status=?)";
  const total = Number(
    db()
      .prepare("SELECT count(*) AS n FROM orders" + condition)
      .get(pattern, pattern, pattern, status, status)?.n,
  );
  const pageCount = Math.max(1, Math.ceil(total / 25));
  const currentPage = Math.max(1, Math.min(pageCount, Math.floor(page) || 1));
  const orders = db()
    .prepare(
      "SELECT id,status,snapshot,created_at,shipping_code,revision FROM orders" +
        condition +
        " ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET ?",
    )
    .all(pattern, pattern, pattern, status, status, (currentPage - 1) * 25)
    .map((row) => ({
      id: String(row.id),
      revision: Number(row.revision),
      status: String(row.status),
      statusLabel: statusLabels[String(row.status)],
      snapshot: JSON.parse(String(row.snapshot)) as OrderSnapshot,
      createdAt: Number(row.created_at),
      shippingCode: String(row.shipping_code),
    }));
  return {
    media: db()
      .prepare(
        "SELECT id,width,height FROM media ORDER BY created_at DESC LIMIT 60",
      )
      .all()
      .map((row) => ({
        imageUrl: "/api/media/" + row.id,
        originalUrl: "/api/media/" + row.id + "?original=1",
        width: Number(row.width),
        height: Number(row.height),
      })),
    storage: storageUsage(),
    products: getProducts({ includeCustom: true }),
    settings: settings(),
    bases: getContent("bases"),
    designs: getContent("designs"),
    categories: getContent("categories"),
    collections: getContent("collections"),
    orders,
    page: currentPage,
    pageCount,
    totalOrders: total,
    dashboard: {
      products: getProducts({ includeCustom: true }).length,
      lowStock: stockAlerts(getProducts({ includeCustom: true })).length,
      orders: Number(
        db().prepare("SELECT count(*) AS n FROM orders").get()?.n || 0,
      ),
      pending: Number(
        db()
          .prepare(
            "SELECT count(*) AS n FROM orders WHERE status='awaiting_payment'",
          )
          .get()?.n || 0,
      ),
    },
  };
}
function text(value: unknown, min = 1, max = 200) {
  if (typeof value !== "string" || value.length < min || value.length > max)
    throw new AppError("مقدار متن معتبر نیست.");
  return value;
}
function number(value: unknown, min = 0, max = 1e9) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new AppError("مقدار عددی معتبر نیست.");
  return value;
}
export function updateAdminData(
  kind: unknown,
  input: unknown,
  actor = "local-operator",
) {
  const value =
    input && typeof input === "object" && !Array.isArray(input)
      ? ({ ...input } as Record<string, unknown>)
      : null;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError("ساختار داده معتبر نیست.");
  const createOnly = value._createOnly === true;
  delete value._createOnly;
  if (kind === "order") {
    const id = text(value.id);
    const status = text(value.status);
    if (!statuses.includes(status as (typeof statuses)[number]))
      throw new AppError("وضعیت معتبر نیست.");
    return transaction(() => {
      const row = db()
        .prepare(
          "SELECT status,snapshot,revision,shipping_code FROM orders WHERE id=?",
        )
        .get(id);
      if (!row) throw new AppError("سفارش پیدا نشد.", 404);
      if (
        value.revision !== undefined &&
        value.revision !== Number(row.revision)
      )
        throw new AppError(
          "این سفارش هم‌زمان تغییر کرده؛ اطلاعات تازه را بارگذاری کنید.",
          409,
        );
      const transitions = orderTransitions;
      if (
        status !== row.status &&
        !transitions[String(row.status)]?.includes(status)
      )
        throw new AppError(
          "تغییر وضعیت مجاز نیست؛ پرداخت فقط پس از تأیید سرور ثبت می‌شود.",
          409,
        );
      const shippingCode = text(value.shippingCode ?? "", 0, 100).trim();
      if (/[\u0000-\u001f\u007f]/.test(shippingCode))
        throw new AppError(
          "کد رهگیری نباید نویسه کنترلی یا خط جدید داشته باشد.",
        );
      if (status === "shipped" && !shippingCode)
        throw new AppError("کد رهگیری ارسال لازم است.");
      if (status === row.status && shippingCode === String(row.shipping_code))
        return { ok: true, unchanged: true };
      if (status === "cancelled" && row.status !== "cancelled") {
        const snapshot = JSON.parse(String(row.snapshot)) as OrderSnapshot;
        for (const item of snapshot.inventory)
          db()
            .prepare("UPDATE variants SET stock=stock+? WHERE sku=?")
            .run(item.quantity, item.sku);
        for (const item of snapshot.inventory) bumpProductRevision(item.sku);
      }
      db()
        .prepare(
          "UPDATE orders SET status=?,shipping_code=?,revision=revision+1 WHERE id=?",
        )
        .run(status, shippingCode, id);
      if (status !== row.status)
        addOrderEvent(id, String(row.status), status, "admin");
      audit(actor, "order", id, "status", {
        from: row.status,
        to: status,
        previousRevision: Number(row.revision),
        newRevision: Number(row.revision) + 1,
        shippingCodeChanged: shippingCode !== String(row.shipping_code),
      });
      return { ok: true };
    });
  }
  if (kind === "settings") {
    const current = settings();
    if (value.revision !== current.revision)
      throw new AppError(
        "تنظیمات فروشگاه هم‌زمان تغییر کرده؛ نسخه تازه را دریافت و پیش‌نویس را مقایسه کنید.",
        409,
      );
    const next = { ...current };
    for (const key of [
      "brandName",
      "support",
      "shippingPolicy",
      "printGuide",
      "care",
    ] as const)
      if (key in value)
        next[key] = text(
          value[key],
          key === "brandName" ? 1 : 0,
          key === "brandName" ? 60 : 5000,
        );
    for (const key of [
      "shippingToman",
      "frontPrintToman",
      "backPrintToman",
      "largePrintToman",
      "stickerCm2Toman",
      "customStickerMinCm",
      "customStickerMaxCm",
      "maxUploadMb",
      "ownerStorageMb",
      "totalStorageMb",
      "orphanDays",
    ] as const)
      if (key in value)
        next[key] = number(
          value[key],
          key.includes("Toman") ? 0 : 1,
          key === "maxUploadMb" ? 20 : 1e8,
        );
    for (const [key, amount] of Object.entries(next)) {
      if (key.includes("Toman") && !Number.isInteger(amount))
        throw new AppError("مبلغ‌ها باید تومان صحیح باشند.");
    }
    if (
      next.orphanDays < 1 ||
      next.orphanDays > 365 ||
      next.totalStorageMb > 102400 ||
      next.ownerStorageMb > 1024
    )
      throw new AppError("محدوده نگهداری فایل معتبر نیست.");
    if (
      next.customStickerMinCm > next.customStickerMaxCm ||
      next.customStickerMaxCm > 50
    )
      throw new AppError("محدوده ابعاد استیکر معتبر نیست.");
    for (const key of ["testMode", "backPrintEnabled"] as const)
      if (key in value) {
        if (typeof value[key] !== "boolean")
          throw new AppError("مقدار فعال‌سازی معتبر نیست.");
        next[key] = value[key];
      }
    if (process.env.NODE_ENV === "production" && next.testMode)
      throw new AppError("پرداخت آزمایشی در تولید مجاز نیست.");
    const expectedRevision = current.revision;
    delete next.revision;
    return transaction(() => {
      const result = db()
        .prepare(
          "UPDATE content SET body=?,revision=revision+1 WHERE kind='settings' AND id='store' AND revision=?",
        )
        .run(JSON.stringify(next), expectedRevision!);
      if (!result.changes)
        throw new AppError(
          "تنظیمات هم‌زمان تغییر کرده؛ دوباره بررسی کنید.",
          409,
        );
      audit(actor, "settings", "store", "update", {
        previousRevision: expectedRevision,
        newRevision: Number(expectedRevision) + 1,
      });
      return { ok: true };
    });
  }
  if (kind === "products") {
    const p = value as unknown as Product;
    if (p.customOnly !== undefined && typeof p.customOnly !== "boolean")
      throw new AppError("نوع عرضه معتبر نیست.");
    const id = text(p.id);
    if (!/^[a-z0-9-]+$/.test(id))
      throw new AppError(
        "شناسه محصول فقط حروف انگلیسی کوچک، عدد و خط تیره است.",
      );
    text(p.name, 2, 150);
    text(p.description, 0, 3000);
    text(p.baseId);
    text(p.designId);
    text(p.collection);
    text(p.category);
    if (p.imageUrl) validateMediaUrl(p.imageUrl);
    if (p.images !== undefined) {
      if (!Array.isArray(p.images) || p.images.length > 8)
        throw new AppError("حداکثر هشت تصویر برای محصول مجاز است.");
      for (const image of p.images) validateMediaUrl(image);
    }
    number(p.priceToman);
    if (!Number.isInteger(p.priceToman))
      throw new AppError("قیمت باید تومان صحیح باشد.");
    number(p.preparationDays, 0, 90);
    if (
      !["ready", "made-to-order", "unavailable"].includes(p.availability) ||
      !["offline", "noise", "fine", "cat"].includes(p.motif)
    )
      throw new AppError("وضعیت یا طرح نمایشی معتبر نیست.");
    for (const [ref, kindName] of [
      [p.category, "categories"],
      [p.collection, "collections"],
      [p.baseId, "bases"],
      [p.designId, "designs"],
    ])
      if (
        !db()
          .prepare("SELECT id FROM content WHERE kind=? AND id=?")
          .get(kindName, ref)
      )
        throw new AppError(`مرجع ${kindName} موجود نیست.`);
    if (
      !Array.isArray(p.variants) ||
      !p.variants.length ||
      p.variants.length > 100 ||
      !Array.isArray(p.colors)
    )
      throw new AppError("گزینه‌ها معتبر نیستند.");
    const seen = new Set<string>();
    for (const v of p.variants) {
      text(v.sku);
      if (v.enabled !== undefined && typeof v.enabled !== "boolean")
        throw new AppError("فعال‌سازی گزینه معتبر نیست.");
      text(v.color);
      if (v.priceDeltaToman !== undefined) {
        number(v.priceDeltaToman, -1e8, 1e8);
        if (
          !Number.isInteger(v.priceDeltaToman) ||
          p.priceToman + v.priceDeltaToman < 0
        )
          throw new AppError("تفاوت قیمت گزینه معتبر نیست.");
      }
      if (v.dimensionsCm) {
        number(v.dimensionsCm.width, 1, 100);
        number(v.dimensionsCm.height, 1, 100);
      }
      if (v.size !== null) text(v.size);
      number(v.stock, 0, 100000);
      if (!Number.isInteger(v.stock) || seen.has(v.sku))
        throw new AppError("شناسه گزینه تکراری یا موجودی نامعتبر است.");
      seen.add(v.sku);
      const existing = db()
        .prepare("SELECT product_id FROM variants WHERE sku=?")
        .get(v.sku);
      if (existing && existing.product_id !== id)
        throw new AppError("این SKU متعلق به محصول دیگری است.");
    }
    for (const c of p.colors) {
      text(c.name);
      if (!/^#[0-9a-fA-F]{6}$/.test(c.hex))
        throw new AppError("رنگ معتبر نیست.");
    }
    const baseBody = JSON.parse(
      String(
        db()
          .prepare("SELECT body FROM content WHERE kind='bases' AND id=?")
          .get(p.baseId)?.body,
      ),
    );
    if (baseBody.category !== p.category)
      throw new AppError("دسته محصول باید با مدل پایه یکسان باشد.");
    if (p.printPlacement) {
      const print = p.printPlacement;
      const area = baseBody.printArea;
      number(print.widthCm, 1, 100);
      number(print.heightCm, 1, 100);
      number(print.xCm, 0, 100);
      number(print.yCm, 0, 100);
      if (
        !area ||
        print.xCm + print.widthCm > area.widthCm + 0.001 ||
        print.yCm + print.heightCm > area.heightCm + 0.001
      )
        throw new AppError("چیدمان طرح آماده از محدوده چاپ این مدل بیرون است.");
      const design = JSON.parse(
        String(
          db()
            .prepare("SELECT body FROM content WHERE kind='designs' AND id=?")
            .get(p.designId)?.body,
        ),
      );
      if (
        design.imageWidthPx &&
        Math.abs(
          print.widthCm / print.heightCm -
            design.imageWidthPx / design.imageHeightPx,
        ) >
          (0.025 * design.imageWidthPx) / design.imageHeightPx
      )
        throw new AppError("نسبت تصویر طرح آماده حفظ نشده است.");
    }
    for (const variant of p.variants) {
      if (
        p.colors.length &&
        !p.colors.some((color) => color.name === variant.color)
      )
        throw new AppError("رنگ گزینه در فهرست رنگ محصول نیست.");
      if (baseBody.sizes?.length && !baseBody.sizes.includes(variant.size))
        throw new AppError("سایز گزینه در مدل پایه تعریف نشده است.");
    }
    if (p.dimensionsCm) {
      number(p.dimensionsCm.width, 1, 100);
      number(p.dimensionsCm.height, 1, 100);
    }
    if (
      p.category === "pack" &&
      (!p.packItems?.length ||
        p.packItems.some(
          (item) =>
            !getProducts().some(
              (product) =>
                product.id === item.productId && product.category === "sticker",
            ) ||
            !Number.isInteger(item.quantity) ||
            item.quantity < 1,
        ))
    )
      throw new AppError(
        "محتوای پک ثابت باید استیکرهای موجود و تعداد مشخص داشته باشد.",
      );
    transaction(() => {
      const current = db()
        .prepare("SELECT revision FROM products WHERE id=?")
        .get(id);
      if (current && p.revision !== Number(current.revision))
        throw new AppError(
          "قیمت یا موجودی این محصول از زمان بازکردن فرم تغییر کرده؛ نسخه تازه را دریافت و دوباره بررسی کنید.",
          409,
        );
      if (!current && p.revision !== undefined)
        throw new AppError(
          "شناسه این محصول تغییر کرده؛ برای ساخت محصول جدید از فرم جدید استفاده کنید.",
          409,
        );
      const previous = getProducts({ includeCustom: true }).find(
        (product) => product.id === id,
      );
      if (previous && !!previous.customOnly !== !!p.customOnly)
        throw new AppError(
          "نوع عرضه ثبت‌شده ثابت است؛ عرضه آماده و طرح مشتری را جدا نگه دارید.",
        );
      const combos = new Set<string>();
      for (const variant of p.variants) {
        const old = previous?.variants.find((row) => row.sku === variant.sku);
        if (old && (old.color !== variant.color || old.size !== variant.size))
          throw new AppError(
            "رنگ و سایز SKU ثبت‌شده ثابت است؛ برای ترکیب جدید SKU تازه بسازید.",
          );
        if (variant.enabled !== false) {
          const combo = variant.color + "|" + (variant.size || "");
          if (combos.has(combo))
            throw new AppError(
              "هر ترکیب فعال رنگ و سایز باید یک SKU داشته باشد.",
            );
          combos.add(combo);
        }
      }
      const body = { ...p };
      delete body.revision;
      db()
        .prepare(
          "INSERT INTO products(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,revision=products.revision+1",
        )
        .run(id, JSON.stringify(body));
      for (const variant of p.variants)
        db()
          .prepare(
            "INSERT INTO variants(sku,product_id,stock) VALUES(?,?,?) ON CONFLICT(sku) DO UPDATE SET stock=excluded.stock",
          )
          .run(variant.sku, id, variant.stock);
      audit(actor, "product", id, current ? "update" : "create", {
        previousRevision: current?.revision,
        newRevision: current ? Number(current.revision) + 1 : 0,
      });
    });
    return { ok: true };
  }
  if (!["bases", "designs", "categories", "collections"].includes(String(kind)))
    throw new AppError("نوع داده ناشناخته است.");
  const id = text(value.id);
  if (
    createOnly &&
    db()
      .prepare("SELECT id FROM content WHERE kind=? AND id=?")
      .get(String(kind), id)
  )
    throw new AppError(
      "این شناسه قبلاً وجود دارد؛ برای ساخت مورد جدید شناسه دیگری انتخاب کنید.",
      409,
    );
  if (!/^[a-z0-9-]+$/.test(id)) throw new AppError("شناسه معتبر نیست.");
  if (kind === "categories" || kind === "collections") text(value.label);
  if (kind === "designs") {
    text(value.title);
    if (value.imageUrl) {
      validateMediaUrl(value.imageUrl);
      const media = db()
        .prepare("SELECT width,height FROM media WHERE id=?")
        .get(String(value.imageUrl).split("/").pop()!);
      value.imageWidthPx = Number(media!.width);
      value.imageHeightPx = Number(media!.height);
    }
    if (value.print) {
      const print = value.print as Record<string, unknown>;
      number(print.widthCm, 1, 100);
      number(print.heightCm, 1, 100);
      number(print.xCm, 0, 100);
      number(print.yCm, 0, 100);
      if (
        value.imageWidthPx &&
        Math.abs(
          Number(print.widthCm) / Number(print.heightCm) -
            Number(value.imageWidthPx) / Number(value.imageHeightPx),
        ) >
          (0.025 * Number(value.imageWidthPx)) / Number(value.imageHeightPx)
      )
        throw new AppError("نسبت تصویر چاپ باید حفظ شود.");
    }
    if (!["offline", "noise", "cat", "fine"].includes(String(value.motif)))
      throw new AppError("طرح نمایشی معتبر نیست.");
  }
  if (kind === "bases") {
    text(value.name);
    text(value.category);
    if (!db().prepare("SELECT id FROM content WHERE kind='categories' AND id=?").get(String(value.category)))
      throw new AppError("دسته مدل پایه موجود نیست.");
    if (db().prepare("SELECT id FROM products WHERE json_extract(body,'$.baseId')=? AND json_extract(body,'$.category')<>? LIMIT 1").get(id, String(value.category)))
      throw new AppError("دسته مدل با محصول‌های متصل یکسان نیست؛ برای دسته دیگر مدل مستقلی بسازید.");
    text(value.material);
    for (const flag of ["customEnabled", "backPrintEnabled"]) {
      if (value[flag] !== undefined && typeof value[flag] !== "boolean")
        throw new AppError("گزینه فعال‌سازی معتبر نیست.");
    }
    if (value.basePriceToman !== undefined) {
      number(value.basePriceToman);
      if (!Number.isInteger(value.basePriceToman))
        throw new AppError("قیمت پایه باید تومان صحیح باشد.");
    }
    if (
      Array.isArray(value.sizes) &&
      (value.sizes.some(
        (size) => typeof size !== "string" || !size.trim() || size.length > 30,
      ) ||
        new Set(value.sizes).size !== value.sizes.length)
    )
      throw new AppError("سایزها باید غیرخالی و بدون تکرار باشند.");
    if (!Array.isArray(value.sizes))
      throw new AppError("سایزها باید فهرست باشند.");
    if (value.sizeChart !== undefined) {
      if (!Array.isArray(value.sizeChart) || value.sizeChart.length > 20)
        throw new AppError("جدول اندازه معتبر نیست.");
      const chartSizes = new Set<string>();
      for (const row of value.sizeChart) {
        if (!row || typeof row !== "object" || Array.isArray(row))
          throw new AppError("ردیف جدول اندازه معتبر نیست.");
        const size = text(row.size);
        if (!value.sizes.includes(size) || chartSizes.has(size))
          throw new AppError("هر سایز جدول باید در فهرست سایزها باشد و فقط یک ردیف داشته باشد.");
        chartSizes.add(size);
        number(row.chest, 1, 200);
        number(row.length, 1, 200);
        number(row.sleeve, 1, 200);
      }
    }
    if (value.printArea) {
      const area = value.printArea as Record<string, unknown>;
      number(area.widthCm, 1, 100);
      number(area.heightCm, 1, 100);
    }
  }
  return transaction(() => {
    const current = db()
      .prepare("SELECT revision FROM content WHERE kind=? AND id=?")
      .get(String(kind), id);
    if (current && (createOnly || value.revision !== Number(current.revision)))
      throw new AppError(
        "این رکورد هم‌زمان تغییر کرده یا از قبل وجود دارد؛ نسخه تازه را دریافت و پیش‌نویس را مقایسه کنید.",
        409,
      );
    if (!current && value.revision !== undefined)
      throw new AppError("رکورد قبلی پیدا نشد؛ مورد تازه را جدا بسازید.", 409);
    const payload = { ...value };
    delete payload.revision;
    db()
      .prepare(
        "INSERT INTO content(kind,id,body) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body,revision=content.revision+1",
      )
      .run(String(kind), id, JSON.stringify(payload));
    audit(actor, String(kind), id, current ? "update" : "create", {
      previousRevision: current?.revision,
      newRevision: current ? Number(current.revision) + 1 : 0,
    });
    return { ok: true };
  });
}

function validateMediaUrl(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\/api\/media\/[a-f0-9-]{36}$/.test(value) ||
    !db()
      .prepare("SELECT id FROM media WHERE id=?")
      .get(value.split("/").pop()!)
  )
    throw new AppError("نشانی تصویر باید متعلق به فایل آپلودشده فروشگاه باشد.");
}

function audit(
  actor: string,
  entity: string,
  id: string,
  action: string,
  details: unknown,
) {
  db()
    .prepare(
      "INSERT INTO audit_events(actor,entity,entity_id,action,details,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(actor, entity, id, action, JSON.stringify(details), Date.now());
}
