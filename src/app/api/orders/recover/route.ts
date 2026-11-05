import {
  apiError,
  checkOrigin,
  requireSession,
  readJson,
  rateLimit,
  AppError,
} from "@/server/security";
import { recoverOrder, closeCheckoutAttempt } from "@/server/orders";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const current = requireSession(request);
    rateLimit("recover:" + current.owner, 30, 60e3);
    const body = await readJson(request, 4096);
    if (typeof body.idempotencyKey !== "string")
      throw new AppError("کلید درخواست معتبر نیست.");
    if (body.action !== undefined && body.action !== "close")
      throw new AppError("عملیات بازیابی معتبر نیست.");
    const result =
      body.action === "close"
        ? closeCheckoutAttempt(current.owner, body.idempotencyKey)
        : recoverOrder(current.owner, body.idempotencyKey);
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
