import {
  apiError,
  checkOrigin,
  createSession,
  session,
  sessionCookie,
  rateLimit,
  requestKey,
} from "@/server/security";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    rateLimit(`session:${requestKey(request)}`, 40, 3600e3);
    if (session(request)) return Response.json({ ok: true });
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": sessionCookie(createSession()),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
