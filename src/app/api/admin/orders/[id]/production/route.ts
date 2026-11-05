import { db } from "@/server/db";
import { apiError, requireAdmin, AppError } from "@/server/security";
import type { OrderSnapshot } from "@/server/orders";
import {
  workshopSheet,
  renderWorkshop,
  renderPacking,
  type FulfillmentOrder,
} from "@/lib/fulfillment";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireAdmin(request);
    const { id } = await params;
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new AppError("سفارش پیدا نشد.", 404);
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "full";
    const format = url.searchParams.get("format") || "json";
    if (
      !["full", "workshop", "packing"].includes(view) ||
      !["json", "html"].includes(format) ||
      (view === "full" && format !== "json") ||
      (view === "packing" && format !== "html")
    )
      throw new AppError("قالب برگه معتبر نیست.");
    const row = db()
      .prepare(
        "SELECT id,status,snapshot,created_at,shipping_code FROM orders WHERE id=?",
      )
      .get(id);
    if (!row) throw new AppError("سفارش پیدا نشد.", 404);
    const snapshot = JSON.parse(String(row.snapshot)) as OrderSnapshot;
    const order: FulfillmentOrder = {
      id,
      status: String(row.status),
      createdAt: Number(row.created_at),
      shippingCode: String(row.shipping_code),
      snapshot,
    };
    const headers = {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
    };
    if (format === "html")
      return new Response(
        view === "packing" ? renderPacking(order) : renderWorkshop(order),
        {
          headers: {
            ...headers,
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": `inline; filename="${view}-${id}.html"`,
            "Content-Security-Policy":
              "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          },
        },
      );
    return Response.json(
      view === "workshop"
        ? workshopSheet(order)
        : {
            version: 1,
            orderId: id,
            status: row.status,
            createdAt: row.created_at,
            shippingCode: row.shipping_code,
            snapshot,
            note: "Internal order export contains recipient information. Original files are available only through authenticated /api/uploads/{uploadId}?original=1; preview images are not print masters.",
          },
      {
        headers: {
          ...headers,
          "Content-Disposition": `attachment; filename="${view === "workshop" ? "workshop" : "order"}-${id}.json"`,
        },
      },
    );
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
