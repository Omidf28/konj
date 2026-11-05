import { httpFixtureFingerprint } from "@/server/http-fixture";
import { settings } from "@/server/db";
import { apiError } from "@/server/security";
export async function GET() {
  try {
    const { testMode } = settings();
    return Response.json(
      {
        status: "ok",
        testInstance: httpFixtureFingerprint(),
        database: "sqlite",
        checkout:
          process.env.NODE_ENV === "production"
            ? "blocked-until-real-gateway"
            : testMode
              ? "test-only"
              : "disabled",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
