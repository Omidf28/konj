import { expireReservations } from "@/server/orders";
import { quoteCart } from "@/server/pricing";
import {
  apiError,
  checkOrigin,
  readJson,
  rateLimit,
  requestKey,
  session,
} from "@/server/security";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    rateLimit(`quote:${requestKey(request)}`, 120, 60e3);
    const body = await readJson(request);
    expireReservations();
    return Response.json(quoteCart(body.items, session(request)?.owner), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
