import { withImageSlot } from "@/server/image-gate";
import { saveUpload, assertUploadCapacity } from "@/server/uploads";
import { settings } from "@/server/db";
import {
  apiError,
  checkOrigin,
  requireSession,
  rateLimit,
  readBody,
  AppError,
  requestKey,
} from "@/server/security";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    rateLimit("upload-ip:" + requestKey(request), 40, 3600e3);
    const current = requireSession(request);
    rateLimit("upload:" + current.owner, 12, 3600e3);
    const contentType = request.headers.get("content-type") || "";
    if (
      !/^multipart\/form-data\b/i.test(contentType) ||
      !contentType.includes("boundary=")
    )
      throw new AppError("فایل باید به‌صورت فرم آپلود ارسال شود.", 415);
    return await withImageSlot(async () => {
      const config = settings();
      const raw = await readBody(request, (config.maxUploadMb + 3) * 1024 ** 2);
      let form: FormData;
      try {
        form = await new Request(request.url, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: raw,
        }).formData();
      } catch {
        throw new AppError("فرم آپلود ناقص یا نامعتبر است.");
      }
      if (
        form.getAll("original").length !== 1 ||
        form.getAll("preview").length !== 1 ||
        [...form.keys()].some((key) => !["original", "preview"].includes(key))
      )
        throw new AppError("یک فایل اصلی و یک پیش‌نمایش لازم است.");
      const file = form.get("original"),
        preview = form.get("preview");
      if (!(file instanceof File) || !(preview instanceof File))
        throw new AppError("فایل اصلی و پیش‌نمایش تأییدشده لازم‌اند.");
      if (
        file.size > config.maxUploadMb * 1024 ** 2 ||
        preview.size > 2 * 1024 ** 2
      )
        throw new AppError(
          "حجم فایل اصلی یا پیش‌نمایش بیش از حد مجاز است.",
          413,
        );
      assertUploadCapacity(current.owner, file.size);
      return Response.json(
        await saveUpload(
          current.owner,
          Buffer.from(await file.arrayBuffer()),
          Buffer.from(await preview.arrayBuffer()),
        ),
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    });
  } catch (error) {
    return apiError(error);
  }
}
