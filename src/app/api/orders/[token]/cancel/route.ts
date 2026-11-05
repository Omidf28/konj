import {
  apiError,
  checkOrigin,
  rateLimit,
  requestKey,
} from "@/server/security";
import { cancelUnpaidOrder } from "@/server/orders";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    checkOrigin(request);
    rateLimit("cancel:" + requestKey(request), 30, 60e3);
    return Response.json(cancelUnpaidOrder((await params).token));
  } catch (error) {
    return apiError(error);
  }
}
