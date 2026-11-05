import {
  openSync,
  fstatSync,
  createReadStream,
  closeSync,
  type ReadStream,
} from "node:fs";
import { Readable } from "node:stream";
import { AppError } from "./security.ts";
export function createFileStream(path: string): {
  body: ReadableStream<Uint8Array>;
  length: number;
} {
  let fd: number | undefined;
  let source: ReadStream | undefined;
  try {
    fd = openSync(path, "r");
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw Error("Not a regular file");
    source = createReadStream(path, {
      fd,
      autoClose: true,
      highWaterMark: 64 * 1024,
    });
    fd = undefined;
    const body = Readable.toWeb(source, {
      strategy: {
        highWaterMark: 128 * 1024,
        size: (chunk: Uint8Array) => chunk.byteLength,
      },
    }) as ReadableStream<Uint8Array>;
    return { body, length: stat.size };
  } catch {
    if (source) source.destroy();
    else if (fd !== undefined)
      try {
        closeSync(fd);
      } catch {}
    throw new AppError(
      "فایل موقتاً در دسترس نیست؛ با پشتیبانی سفارش پیگیری کنید.",
      503,
    );
  }
}
