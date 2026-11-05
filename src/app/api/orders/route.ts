import {
  apiError,
  checkOrigin,
  readJson,
  requireSession,
  rateLimit,
  requestKey,
  AppError,
} from "@/server/security";
import { createOrder } from "@/server/orders";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const current = requireSession(request);
    rateLimit(`order:${current.owner}:${requestKey(request)}`, 15, 3600e3);
    const body = await readJson(request);
    if (typeof body.expectedTotalToman !== "number")
      throw new AppError("ابتدا مبلغ نهایی را بررسی کنید.");
    return Response.json(
      createOrder(
        current.owner,
        body.items,
        body.address,
        body.idempotencyKey,
        body.expectedTotalToman,
      ),
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
