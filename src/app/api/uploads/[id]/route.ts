import { streamUpload } from "@/server/uploads";
import { apiError, session, rateLimit, requestKey } from "@/server/security";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    rateLimit(`file:${requestKey(request)}`, 200, 60e3);
    const url = new URL(request.url);
    const original = url.searchParams.get("original") === "1";
    const result = streamUpload(
      (await params).id,
      session(request),
      original,
      url.searchParams.get("tracking") || "",
    );
    return new Response(result.body, {
      headers: {
        "Content-Type": result.mime,
        "Content-Length": String(result.length),
        "Content-Disposition": `${original ? "attachment" : "inline"}; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
