import { normalizeDigits } from "@/lib/format";
import { adminData, updateAdminData } from "@/server/admin";
import {
  AppError,
  apiError,
  checkOrigin,
  readJson,
  requireAdmin,
  rateLimit,
} from "@/server/security";
export async function GET(request: Request) {
  try {
    const current = requireAdmin(request);
    rateLimit(`admin-read:${current.owner}`, 120, 60e3);
    const params = new URL(request.url).searchParams;
    const page = normalizeDigits(params.get("page") ?? "1");
    if (!/^[1-9][0-9]{0,14}$/.test(page))
      throw new AppError("شماره صفحه معتبر نیست.");
    return Response.json(
      {
        ...adminData(
          params.get("q") || "",
          Number(page),
          params.get("status") || "",
        ),
        draftScope: current.adminId!,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const current = requireAdmin(request);
    rateLimit(`admin:${current.owner}`, 100, 60e3);
    const body = await readJson(request, 200000);
    if (
      body.kind === "order" &&
      (!body.value ||
        typeof body.value !== "object" ||
        !Number.isInteger((body.value as { revision?: number }).revision))
    )
      throw new AppError("نسخه سفارش برای ثبت تغییر لازم است.");
    return Response.json(
      updateAdminData(body.kind, body.value, current.adminId!),
    );
  } catch (error) {
    return apiError(error);
  }
}
