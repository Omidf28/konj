import {
  readAdminAccount,
  changeAdminPassword,
  revokeOtherAdminSessions,
} from "@/server/admin-account";
import {
  AppError,
  apiError,
  checkOrigin,
  readJson,
  requireAdmin,
  rateLimit,
} from "@/server/security";
export async function GET(request: Request) {
  try {
    const current = requireAdmin(request);
    rateLimit("account-read:" + current.owner, 60, 60000);
    return Response.json(readAdminAccount(current), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const current = requireAdmin(request);
    rateLimit("account-change:" + current.adminId, 5, 15 * 60000);
    const body = await readJson(request, 8192);
    const result =
      body.action === "change_password"
        ? changeAdminPassword(
            current,
            body.currentPassword,
            body.newPassword,
            body.confirmation,
          )
        : body.action === "revoke_others"
          ? revokeOtherAdminSessions(current, body.currentPassword)
          : (() => {
              throw new AppError("عملیات حساب معتبر نیست.");
            })();
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
