import { login } from "@/server/auth";
import {
  apiError,
  checkOrigin,
  readJson,
  requestKey,
  sessionCookie,
} from "@/server/security";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = await readJson(request, 4096);
    const raw = login(body.username, body.password, requestKey(request));
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": sessionCookie(raw),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
