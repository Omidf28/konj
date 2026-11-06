import { DatabaseSync } from "node:sqlite";
import { normalizeText } from "../lib/format.ts";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import {
  products,
  bases,
  designs,
  categories,
  collections,
} from "../lib/catalog.ts";
import type { Product } from "../lib/catalog.ts";
let instance: DatabaseSync | undefined;
export function db(): DatabaseSync {
  if (instance) return instance;
  const location = resolve(
    /* turbopackIgnore: true */ process.env.DATABASE_PATH ||
      "storage/konj.sqlite",
  );
  mkdirSync(dirname(location), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(location);
  database.function("konj_normalize", { deterministic: true }, (value) =>
    normalizeText(typeof value === "string" ? value : ""),
  );
  database.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
  );
  database.exec(`
 CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, body TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS variants(sku TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), stock INTEGER NOT NULL CHECK(stock>=0));
 CREATE TABLE IF NOT EXISTS content(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id));
 CREATE TABLE IF NOT EXISTS admins(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,admin_id TEXT REFERENCES admins(id),expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,owner_hash TEXT NOT NULL,original_path TEXT NOT NULL,preview_path TEXT NOT NULL,mime TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,bytes INTEGER NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,tracking_hash TEXT UNIQUE NOT NULL,owner_hash TEXT NOT NULL,idempotency_key TEXT NOT NULL,status TEXT NOT NULL,snapshot TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,shipping_code TEXT NOT NULL DEFAULT '',UNIQUE(owner_hash,idempotency_key));
 CREATE TABLE IF NOT EXISTS order_uploads(order_id TEXT NOT NULL REFERENCES orders(id),upload_id TEXT NOT NULL REFERENCES uploads(id),PRIMARY KEY(order_id,upload_id));
 CREATE TABLE IF NOT EXISTS payments(order_id TEXT PRIMARY KEY REFERENCES orders(id),provider_ref TEXT UNIQUE NOT NULL,verified_at INTEGER NOT NULL,amount_toman INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS upload_owner ON uploads(owner_hash);
 CREATE INDEX IF NOT EXISTS orders_time ON orders(created_at);
 `);
  if (
    !database
      .prepare("SELECT version FROM schema_migrations WHERE version=1")
      .get()
  ) {
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const product of products) {
        database
          .prepare("INSERT OR IGNORE INTO products(id,body) VALUES(?,?)")
          .run(product.id, JSON.stringify(product));
        for (const variant of product.variants)
          database
            .prepare(
              "INSERT OR IGNORE INTO variants(sku,product_id,stock) VALUES(?,?,?)",
            )
            .run(variant.sku, product.id, variant.stock);
      }
      for (const [kind, items] of Object.entries({
        bases,
        designs,
        categories,
        collections,
      })) {
        for (const item of items)
          database
            .prepare(
              "INSERT OR IGNORE INTO content(kind,id,body) VALUES(?,?,?)",
            )
            .run(kind, item.id, JSON.stringify(item));
      }
      const settings = {
        brandName: "کُنج",
        shippingToman: 65000,
        testMode: true,
        frontPrintToman: 50000,
        backPrintToman: 60000,
        largePrintToman: 25000,
        stickerCm2Toman: 1200,
        customStickerMinCm: 2,
        customStickerMaxCm: 20,
        maxUploadMb: 10,
        ownerStorageMb: 100,
        totalStorageMb: 1024,
        orphanDays: 7,
        backPrintEnabled: true,
        support: "اطلاعات پشتیبانی هنوز نهایی نشده است.",
        shippingPolicy:
          "شرایط ارسال و تعویض هنوز نهایی نشده؛ فروش واقعی فعال نیست.",
        printGuide:
          "PNG، JPEG یا WebP؛ اندازه چاپ مستقل از پیکسل تصویر است. کیفیت پیشنهادی ۳۰۰ پیکسل در اینچ، زیر ۱۵۰ نیازمند بررسی است.",
        care: "جنس و دستور مراقبت پس از انتخاب تأمین‌کننده نهایی می‌شود.",
      };
      database
        .prepare(
          "INSERT OR IGNORE INTO content(kind,id,body) VALUES('settings','store',?)",
        )
        .run(JSON.stringify(settings));
      database
        .prepare("INSERT INTO schema_migrations VALUES(1,?)")
        .run(Date.now());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  if (
    !database
      .prepare("SELECT version FROM schema_migrations WHERE version=2")
      .get()
  ) {
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const row of database
        .prepare("SELECT id,body FROM content WHERE kind='bases'")
        .all()) {
        const base = JSON.parse(String(row.body));
        const hoodie = base.category === "hoodie";
        const clothing = hoodie || base.category === "tshirt";
        const updated = {
          ...base,
          customEnabled: base.category !== "pack",
          backPrintEnabled: clothing,
          basePriceToman: hoodie
            ? 1190000
            : base.category === "tshirt"
              ? 540000
              : base.category === "mug"
                ? 270000
                : 0,
          printMethod: "روش چاپ هنوز نهایی نشده",
          care: "دستور مراقبت پس از تأیید تأمین‌کننده",
          cut: "برش نمونه، نیازمند تأیید تولیدکننده",
          model: { kind: "procedural-v1" },
          ...(clothing
            ? {
                sizeChart: ["S", "M", "L", "XL", "XXL"].map((size, i) => ({
                  size,
                  chest: 48 + i * 3 + (hoodie ? 6 : 0),
                  length: 68 + i * 2 + (hoodie ? 2 : 0),
                  sleeve: 20 + i + (hoodie ? 41 : 0),
                })),
              }
            : {}),
          ...(base.category === "mug"
            ? { capacityMl: 330, widthCm: 8, heightCm: 9.5 }
            : {}),
        };
        database
          .prepare("UPDATE content SET body=? WHERE kind='bases' AND id=?")
          .run(JSON.stringify(updated), String(row.id));
      }
      database.exec(
        "CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,path TEXT NOT NULL,mime TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,created_at INTEGER NOT NULL)",
      );
      database
        .prepare("INSERT INTO schema_migrations VALUES(2,?)")
        .run(Date.now());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  if (
    !database
      .prepare("SELECT version FROM schema_migrations WHERE version=3")
      .get()
  ) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(
        "ALTER TABLE media ADD COLUMN original_path TEXT NOT NULL DEFAULT ''; ALTER TABLE media ADD COLUMN original_mime TEXT NOT NULL DEFAULT '';",
      );
      database
        .prepare("INSERT INTO schema_migrations VALUES(3,?)")
        .run(Date.now());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    if (
      !database
        .prepare("SELECT version FROM schema_migrations WHERE version=4")
        .get()
    ) {
      database.exec(
        "ALTER TABLE products ADD COLUMN revision INTEGER NOT NULL DEFAULT 0; ALTER TABLE orders ADD COLUMN revision INTEGER NOT NULL DEFAULT 0; CREATE TABLE order_events(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT NOT NULL REFERENCES orders(id),from_status TEXT,to_status TEXT NOT NULL,source TEXT NOT NULL,created_at INTEGER NOT NULL); CREATE INDEX order_events_order ON order_events(order_id,id); CREATE TABLE audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,entity TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL,created_at INTEGER NOT NULL);",
      );
      database
        .prepare("INSERT INTO schema_migrations VALUES(4,?)")
        .run(Date.now());
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    if (
      !database
        .prepare("SELECT version FROM schema_migrations WHERE version=5")
        .get()
    ) {
      database
        .prepare(
          "INSERT OR IGNORE INTO content(kind,id,body) VALUES('designs','customer-art',?)",
        )
        .run(
          JSON.stringify({
            id: "customer-art",
            title: "طرح مشتری",
            motif: "offline",
          }),
        );
      for (const row of database
        .prepare("SELECT body FROM content WHERE kind='bases'")
        .all()) {
        const base = JSON.parse(String(row.body));
        if (!base.customEnabled || base.category === "pack") continue;
        const all = database
          .prepare("SELECT id,body FROM products WHERE active=1")
          .all()
          .map((record) => JSON.parse(String(record.body)) as Product);
        if (
          all.some(
            (product) => product.customOnly && product.baseId === base.id,
          )
        )
          continue;
        const template = all.find(
          (product) => product.baseId === base.id && !product.customOnly,
        );
        if (!template) continue;
        let id = "custom-" + base.id;
        while (database.prepare("SELECT id FROM products WHERE id=?").get(id))
          id += "-base";
        const product: Product = {
          id,
          name: base.name + " با طرح خودت",
          category: base.category,
          baseId: base.id,
          designId: "customer-art",
          collection: template.collection,
          description:
            "عرضه مخصوص چاپ طرح مشتری؛ تأمین و موجودی مستقل از محصول آماده چاپ‌شده است. مشخصات فعلی نمونه‌اند.",
          priceToman: base.basePriceToman || 0,
          availability: "made-to-order",
          preparationDays: 7,
          motif: "offline",
          customOnly: true,
          colors: template.colors,
          variants: template.variants.map((variant, index) => ({
            ...variant,
            sku: id + "-" + index,
            stock: 0,
            enabled: true,
          })),
        };
        database
          .prepare("INSERT INTO products(id,body) VALUES(?,?)")
          .run(id, JSON.stringify(product));
        for (const variant of product.variants)
          database
            .prepare("INSERT INTO variants(sku,product_id,stock) VALUES(?,?,?)")
            .run(variant.sku, id, 0);
      }
      database
        .prepare("INSERT INTO schema_migrations VALUES(5,?)")
        .run(Date.now());
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    if (
      !database
        .prepare("SELECT version FROM schema_migrations WHERE version=6")
        .get()
    ) {
      database.exec(
        "ALTER TABLE content ADD COLUMN revision INTEGER NOT NULL DEFAULT 0; ALTER TABLE media ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0;",
      );
      const uploadLocation = resolve(
        /* turbopackIgnore: true */ process.env.UPLOAD_DIR || "storage/uploads",
      );
      for (const row of database
        .prepare("SELECT id,path,original_path FROM media")
        .all()) {
        let bytes = 0;
        for (const name of [row.path, row.original_path]) {
          const filename = String(name);
          if (
            !filename ||
            filename.includes("/") ||
            filename.includes("\\") ||
            filename.includes("..")
          )
            continue;
          try {
            bytes += statSync(
              join(/* turbopackIgnore: true */ uploadLocation, filename),
            ).size;
          } catch {}
        }
        database
          .prepare("UPDATE media SET bytes=? WHERE id=?")
          .run(bytes, String(row.id));
      }
      database
        .prepare("INSERT INTO schema_migrations VALUES(6,?)")
        .run(Date.now());
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    if (
      !database
        .prepare("SELECT version FROM schema_migrations WHERE version=7")
        .get()
    ) {
      database.exec(
        "CREATE TABLE closed_checkout_attempts(owner_hash TEXT NOT NULL,idempotency_key TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(owner_hash,idempotency_key));",
      );
      database
        .prepare("INSERT INTO schema_migrations VALUES(7,?)")
        .run(Date.now());
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    if (
      !database
        .prepare("SELECT version FROM schema_migrations WHERE version=8")
        .get()
    ) {
      database.exec(
        "CREATE INDEX audit_events_filter ON audit_events(entity,entity_id,created_at DESC,id DESC); CREATE INDEX audit_events_created ON audit_events(created_at DESC,id DESC);",
      );
      database
        .prepare("INSERT INTO schema_migrations VALUES(8,?)")
        .run(Date.now());
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    if (!database.prepare("SELECT version FROM schema_migrations WHERE version=9").get()) {
      database.prepare("UPDATE content SET body=json_set(body,'$.backPrintEnabled',json('true')),revision=revision+1 WHERE kind='bases' AND id='mug-01' AND json_extract(body,'$.category')='mug'").run();
      for (const row of database.prepare("SELECT body FROM products WHERE json_extract(body,'$.baseId')='mug-01'").all()) {
        const product = JSON.parse(String(row.body)) as Product;
        if (product.category !== "mug" || product.variants.some(v => v.color === "مشکی")) continue;
        const sku = product.id + "-black";
        if (database.prepare("SELECT sku FROM variants WHERE sku=?").get(sku)) continue;
        if (!product.colors.some(c => c.name === "مشکی")) product.colors.push({ name: "مشکی", hex: "#232426" });
        product.variants.push({ sku, color: "مشکی", size: null, stock: 0 });
        database.prepare("INSERT INTO variants(sku,product_id,stock) VALUES(?,?,0)").run(sku, product.id);
        database.prepare("UPDATE products SET body=?,revision=revision+1 WHERE id=?").run(JSON.stringify(product), product.id);
      }
      database.prepare("INSERT INTO schema_migrations VALUES(9,?)").run(Date.now());
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  instance = database;
  return database;
}
export function transaction<T>(fn: () => T): T {
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
export function getProducts(
  options: { includeCustom?: boolean } = {},
): Product[] {
  const stock = new Map(
    db()
      .prepare("SELECT sku,stock FROM variants")
      .all()
      .map((row) => [String(row.sku), Number(row.stock)]),
  );
  return db()
    .prepare(
      "SELECT body,revision FROM products WHERE active=1 AND (?=1 OR coalesce(json_extract(body,'$.customOnly'),0)=0) ORDER BY rowid",
    )
    .all(options.includeCustom ? 1 : 0)
    .map((row) => {
      const product = JSON.parse(String(row.body)) as Product;
      return {
        ...product,
        revision: Number(row.revision),
        variants: product.variants.map((variant) => ({
          ...variant,
          stock: stock.get(variant.sku) || 0,
        })),
      };
    });
}
export function getProduct(id: string): Product | undefined {
  const row = db()
    .prepare("SELECT body,revision FROM products WHERE active=1 AND id=?")
    .get(id);
  if (!row) return undefined;
  const product = JSON.parse(String(row.body)) as Product;
  const stock = new Map(
    db()
      .prepare("SELECT sku,stock FROM variants WHERE product_id=?")
      .all(id)
      .map((row) => [String(row.sku), Number(row.stock)]),
  );
  return {
    ...product,
    revision: Number(row.revision),
    variants: product.variants.map((variant) => ({
      ...variant,
      stock: stock.get(variant.sku) || 0,
    })),
  };
}
export interface StoreSettings {
  revision?: number;
  brandName: string;
  shippingToman: number;
  testMode: boolean;
  frontPrintToman: number;
  backPrintToman: number;
  largePrintToman: number;
  stickerCm2Toman: number;
  customStickerMinCm: number;
  customStickerMaxCm: number;
  maxUploadMb: number;
  ownerStorageMb: number;
  totalStorageMb: number;
  orphanDays: number;
  backPrintEnabled: boolean;
  support: string;
  shippingPolicy: string;
  printGuide: string;
  care: string;
}
export function settings(): StoreSettings {
  const row = db()
    .prepare(
      "SELECT body,revision FROM content WHERE kind='settings' AND id='store'",
    )
    .get();
  if (!row) throw Error("Store settings missing");
  return { ...JSON.parse(String(row.body)), revision: Number(row.revision) };
}
export function getContent<T>(kind: string): T[] {
  return db()
    .prepare("SELECT body,revision FROM content WHERE kind=? ORDER BY rowid")
    .all(kind)
    .map(
      (row) =>
        ({
          ...JSON.parse(String(row.body)),
          revision: Number(row.revision),
        }) as T,
    );
}

export function getBase(id: string) {
  return getContent<import("../lib/base-model.ts").BaseModel>("bases").find(
    (base) => base.id === id,
  );
}

export function bumpProductRevision(sku: string) {
  db()
    .prepare(
      "UPDATE products SET revision=revision+1 WHERE id=(SELECT product_id FROM variants WHERE sku=?)",
    )
    .run(sku);
}
export function addOrderEvent(
  orderId: string,
  from: string | null,
  to: string,
  source: string,
) {
  db()
    .prepare(
      "INSERT INTO order_events(order_id,from_status,to_status,source,created_at) VALUES(?,?,?,?,?)",
    )
    .run(orderId, from, to, source, Date.now());
}
