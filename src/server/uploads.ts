import { ownedFileBatch } from "./owned-files.ts";
import {
  MAX_IMAGE_SIDE,
  MAX_ORIGINAL_IMAGE_PIXELS,
} from "../lib/image-limits.ts";
import { createFileStream } from "./file-stream.ts";
import { assertUploadCapacity } from "./storage.ts";
export { assertUploadCapacity } from "./storage.ts";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync, readFileSync, lstatSync } from "node:fs";
import { resolve, join } from "node:path";
import { db, settings, transaction } from "./db.ts";
import { AppError, hash } from "./security.ts";
export function uploadRoot() {
  return resolve(
    /* turbopackIgnore: true */ process.env.UPLOAD_DIR || "storage/uploads",
  );
}
export async function inspectImage(
  buffer: Buffer,
  maxMb = 10,
  maxPixels = MAX_ORIGINAL_IMAGE_PIXELS,
) {
  if (buffer.length > maxMb * 1024 * 1024 || buffer.length < 20)
    throw new AppError("حجم فایل خارج از محدوده است.");
  const expected = buffer
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "png"
    : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
      ? "jpeg"
      : buffer.toString("ascii", 0, 4) === "RIFF" &&
          buffer.toString("ascii", 8, 12) === "WEBP"
        ? "webp"
        : null;
  if (!expected)
    throw new AppError("نوع واقعی فایل باید PNG، JPEG یا WebP باشد.");
  let metadata;
  try {
    metadata = await sharp(buffer, {
      limitInputPixels: maxPixels,
      animated: false,
    }).metadata();
  } catch {
    throw new AppError("فایل تصویر سالم نیست.");
  }
  if (
    metadata.format !== expected ||
    !metadata.width ||
    !metadata.height ||
    metadata.width > MAX_IMAGE_SIDE ||
    metadata.height > MAX_IMAGE_SIDE ||
    (metadata.pages || 1) > 1
  )
    throw new AppError(
      "فقط تصویر PNG، JPEG یا WebP تک‌فریم تا " +
        Math.round(maxPixels / 1e6) +
        " میلیون پیکسل پذیرفته می‌شود.",
    );
  try {
    await sharp(buffer, { limitInputPixels: maxPixels }).stats();
  } catch {
    throw new AppError("فایل تصویر ناقص یا خراب است.");
  }
  return {
    width:
      metadata.orientation && metadata.orientation >= 5
        ? metadata.height
        : metadata.width,
    height:
      metadata.orientation && metadata.orientation >= 5
        ? metadata.width
        : metadata.height,
    format: metadata.format,
    mime: `image/${metadata.format}`,
  };
}
export async function saveUpload(
  owner: string,
  original: Buffer,
  preview: Buffer,
) {
  const config = settings();
  assertUploadCapacity(owner, original.length);
  const image = await inspectImage(original, config.maxUploadMb);
  await inspectImage(preview, 2, 4e6);
  const light = await sharp(preview, { limitInputPixels: 4e6 })
    .rotate()
    .resize({
      width: 1000,
      height: 1000,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
  const id = randomUUID();
  const ext = image.format === "jpeg" ? "jpg" : image.format;
  const originalName = `${id}.${ext}`;
  const previewName = `${id}.preview.webp`;
  const root = uploadRoot();
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const files = ownedFileBatch(root);
  try {
    return transaction(() => {
      const bytes = original.length + light.length;
      assertUploadCapacity(owner, bytes);
      files.write(originalName, original);
      files.write(previewName, light);
      db()
        .prepare("INSERT INTO uploads VALUES(?,?,?,?,?,?,?,?,?)")
        .run(
          id,
          owner,
          originalName,
          previewName,
          image.mime,
          image.width,
          image.height,
          bytes,
          Date.now(),
        );
      return {
        id,
        width: image.width,
        height: image.height,
        previewUrl: `/api/uploads/${id}`,
      };
    });
  } catch (error) {
    files.rollback();
    throw error;
  }
}
function safeUploadFilename(name: string) {
  return (
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) &&
    !name.includes("..") &&
    !name.endsWith(".") &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  );
}
function resolveUploadFile(
  id: string,
  current: { owner: string; adminId: string | null } | null,
  original = false,
  tracking = "",
) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new AppError("فایل پیدا نشد.", 404);
  const row = db().prepare("SELECT * FROM uploads WHERE id=?").get(id);
  if (!row) throw new AppError("فایل پیدا نشد.", 404);
  const viaOrder =
    /^[a-f0-9]{64}$/.test(tracking) &&
    db()
      .prepare(
        "SELECT o.id FROM orders o JOIN order_uploads u ON u.order_id=o.id WHERE o.tracking_hash=? AND u.upload_id=?",
      )
      .get(hash(tracking), id);
  if (!current?.adminId && current?.owner !== row.owner_hash && !viaOrder)
    throw new AppError("دسترسی به فایل مجاز نیست.", 403);
  const filename = String(original ? row.original_path : row.preview_path);
  if (!safeUploadFilename(filename))
    throw new AppError("مسیر فایل نامعتبر است.", 500);
  return {
    path: join(/* turbopackIgnore: true */ uploadRoot(), filename),
    mime: original ? String(row.mime) : "image/webp",
    filename,
  };
}
/** Validate the complete batch before unlinking anything; never follow file links. */
export function cleanupOrphans(dryRun = true) {
  return transaction(() => {
    const threshold = Date.now() - settings().orphanDays * 86400e3;
    const database = db();
    const rows = database
      .prepare(
        "SELECT * FROM uploads WHERE created_at<? AND NOT EXISTS(SELECT 1 FROM order_uploads WHERE upload_id=uploads.id)",
      )
      .all(threshold);
    const paths = new Set<string>();
    for (const row of rows) {
      for (const value of [row.original_path, row.preview_path]) {
        const name = String(value);
        if (!safeUploadFilename(name))
          throw new AppError("پاک‌سازی متوقف شد: نام فایل ناامن است.", 500);
        if (
          database
            .prepare(
              "SELECT id FROM uploads WHERE id<>? AND (original_path=? COLLATE NOCASE OR preview_path=? COLLATE NOCASE) LIMIT 1",
            )
            .get(String(row.id), name, name) ||
          database
            .prepare(
              "SELECT id FROM media WHERE path=? COLLATE NOCASE OR original_path=? COLLATE NOCASE LIMIT 1",
            )
            .get(name, name)
        )
          throw new AppError("پاک‌سازی متوقف شد: فایل ارجاع مشترک دارد.", 500);
        const path = join(/* turbopackIgnore: true */ uploadRoot(), name);
        try {
          const stat = lstatSync(path);
          if (!stat.isFile() || stat.isSymbolicLink())
            throw new AppError("پاک‌سازی متوقف شد: فایل عادی نیست.", 500);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        paths.add(path);
      }
    }
    if (dryRun) return rows.length;
    // BEGIN IMMEDIATE prevents a concurrent order from acquiring these uploads.
    // Filesystem deletion cannot be rolled back if a later unlink/commit fails.
    for (const path of paths) {
      try {
        unlinkSync(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    let removed = 0;
    for (const row of rows)
      removed += Number(
        database.prepare("DELETE FROM uploads WHERE id=?").run(String(row.id))
          .changes,
      );
    return removed;
  });
}

export function readUpload(
  id: string,
  current: { owner: string; adminId: string | null } | null,
  original = false,
  tracking = "",
) {
  const file = resolveUploadFile(id, current, original, tracking);
  return {
    buffer: readFileSync(file.path),
    mime: file.mime,
    filename: file.filename,
  };
}
export function streamUpload(
  id: string,
  current: { owner: string; adminId: string | null } | null,
  original = false,
  tracking = "",
) {
  const file = resolveUploadFile(id, current, original, tracking);
  return {
    mime: file.mime,
    filename: file.filename,
    ...createFileStream(file.path),
  };
}
