import { ownedFileBatch } from "./owned-files.ts";
import { createFileStream } from "./file-stream.ts";
import { assertMediaCapacity } from "./storage.ts";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { db, transaction } from "./db.ts";
import { inspectImage, uploadRoot } from "./uploads.ts";
import { AppError } from "./security.ts";
export async function saveMedia(buffer: Buffer) {
  assertMediaCapacity(buffer.length);
  const metadata = await inspectImage(buffer, 10);
  const image = sharp(buffer, { limitInputPixels: 40e6 }).rotate();
  const raw = await image
    .clone()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = raw.info.width,
    top = raw.info.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < raw.info.height; y++)
    for (let x = 0; x < raw.info.width; x++) {
      if (raw.data[(y * raw.info.width + x) * 4 + 3] > 10) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  if (right < left || bottom < top)
    throw new AppError("تصویر کاملاً شفاف است.");
  const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const optimized = await image
    .extract(crop)
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();
  const id = randomUUID();
  const filename = `media-${id}.webp`;
  const original = `media-${id}.${metadata.format}`;
  const root = uploadRoot();
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const files = ownedFileBatch(root);
  try {
    return transaction(() => {
      assertMediaCapacity(buffer.length + optimized.length);
      files.write(filename, optimized);
      files.write(original, buffer);
      db()
        .prepare(
          "INSERT INTO media(id,path,mime,width,height,created_at,original_path,original_mime,bytes) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          filename,
          "image/webp",
          crop.width,
          crop.height,
          Date.now(),
          original,
          metadata.mime,
          buffer.length + optimized.length,
        );
      return {
        id,
        imageUrl: `/api/media/${id}`,
        width: crop.width,
        height: crop.height,
        originalUrl: `/api/media/${id}?original=1`,
        note: "ابعاد پیکسلی ناحیه غیرشفاف؛ ابعاد فروش سانتی‌متری را جدا ثبت کنید.",
      };
    });
  } catch (error) {
    files.rollback();
    throw error;
  }
}
function resolveMediaFile(id: string, original = false) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new AppError("تصویر پیدا نشد.", 404);
  const row = db().prepare("SELECT * FROM media WHERE id=?").get(id);
  if (!row) throw new AppError("تصویر پیدا نشد.", 404);
  const filename = String(original ? row.original_path : row.path);
  if (
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("..")
  )
    throw new AppError("مسیر فایل معتبر نیست.", 500);
  return {
    path: join(/* turbopackIgnore: true */ uploadRoot(), filename),
    mime: String(original ? row.original_mime : row.mime),
    filename,
  };
}

export function readMedia(id: string, original = false) {
  const file = resolveMediaFile(id, original);
  return {
    buffer: readFileSync(file.path),
    mime: file.mime,
    filename: file.filename,
  };
}
export function streamMedia(id: string, original = false) {
  const file = resolveMediaFile(id, original);
  return {
    mime: file.mime,
    filename: file.filename,
    ...createFileStream(file.path),
  };
}
