import { saveMedia } from "@/server/media";
import { withImageSlot } from "@/server/image-gate";
import {
  apiError,
  checkOrigin,
  requireAdmin,
  rateLimit,
  readBody,
} from "@/server/security";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const current = requireAdmin(request);
    rateLimit("media:" + current.owner, 30, 3600e3);
    return await withImageSlot(async () =>
      Response.json(await saveMedia(await readBody(request, 10 * 1024 ** 2)), {
        status: 201,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
