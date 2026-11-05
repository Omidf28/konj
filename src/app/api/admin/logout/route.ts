import { revokeSession } from "@/server/auth";
import { apiError, checkOrigin, cookieValue } from "@/server/security";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    revokeSession(cookieValue(request, "konj_session"));
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie":
            "konj_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
