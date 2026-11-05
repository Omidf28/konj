import { streamMedia } from "@/server/media";
import { apiError, requireAdmin } from "@/server/security";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const original = new URL(request.url).searchParams.get("original") === "1";
    if (original) requireAdmin(request);
    const result = streamMedia((await params).id, original);
    return new Response(result.body, {
      headers: {
        "Content-Type": result.mime,
        "Content-Length": String(result.length),
        "Cache-Control": original
          ? "private, no-store"
          : "public, max-age=86400, immutable",
        "Content-Disposition": `${original ? "attachment" : "inline"}; filename="${result.filename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
