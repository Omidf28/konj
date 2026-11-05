import { readActivity } from "@/server/activity";
import { requireAdmin, apiError, rateLimit } from "@/server/security";
export async function GET(request: Request) {
  try {
    const current = requireAdmin(request);
    rateLimit("activity:" + current.owner, 120, 60e3);
    const url = new URL(request.url);
    const result = readActivity(
      url.searchParams.get("entity") || "",
      url.searchParams.get("id") || "",
      Number(url.searchParams.get("page") || 1),
    );
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
