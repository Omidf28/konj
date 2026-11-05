import { apiError, rateLimit, requestKey } from "@/server/security";
import { getOrder } from "@/server/orders";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    rateLimit(`track:${requestKey(request)}`, 100, 60e3);
    return Response.json(getOrder((await params).token), {
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
