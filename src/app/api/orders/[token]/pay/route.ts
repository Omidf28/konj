import {
  apiError,
  checkOrigin,
  rateLimit,
  requestKey,
} from "@/server/security";
import { payTestOrder } from "@/server/orders";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    checkOrigin(request);
    rateLimit(`pay:${requestKey(request)}`, 30, 60e3);
    return Response.json(payTestOrder((await params).token));
  } catch (error) {
    return apiError(error);
  }
}
