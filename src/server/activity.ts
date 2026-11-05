import { db } from "./db.ts";
import { AppError } from "./security.ts";
import {
  activityEntities,
  type ActivityPage,
  type ActivityEvent,
} from "../lib/activity-types.ts";
import { orderStatusLabels } from "../lib/order-status.ts";
function safeDetails(raw: unknown): ActivityEvent["details"] {
  let value;
  try {
    value = JSON.parse(String(raw));
  } catch {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: ActivityEvent["details"] = {};
  if (
    value.from === null ||
    (typeof value.from === "string" &&
      Object.hasOwn(orderStatusLabels, value.from))
  )
    result.from = value.from;
  if (
    typeof value.to === "string" &&
    Object.hasOwn(orderStatusLabels, value.to)
  )
    result.to = value.to;
  for (const key of ["previousRevision", "newRevision"] as const)
    if (Number.isSafeInteger(value[key]) && value[key] >= 0)
      result[key] = value[key];
  if (typeof value.shippingCodeChanged === "boolean")
    result.shippingCodeChanged = value.shippingCodeChanged;
  if (Number.isSafeInteger(value.revokedSessions) && value.revokedSessions >= 0)
    result.revokedSessions = value.revokedSessions;
  return result;
}
export function readActivity(
  entity = "",
  entityId = "",
  page = 1,
): ActivityPage {
  if (entity && !Object.hasOwn(activityEntities, entity))
    throw new AppError("نوع تاریخچه معتبر نیست.");
  if (
    (entityId && !entity) ||
    entityId.length > 200 ||
    !Number.isSafeInteger(page) ||
    page < 1
  )
    throw new AppError("فیلتر تاریخچه معتبر نیست.");
  if (
    entity === "order" &&
    entityId &&
    !db().prepare("SELECT 1 FROM orders WHERE id=?").get(entityId)
  )
    throw new AppError("سفارش پیدا نشد.", 404);
  const where = " WHERE (?='' OR a.entity=?) AND (?='' OR a.entity_id=?)";
  const args: (string | number)[] = [entity, entity, entityId, entityId];
  let query =
    "SELECT a.id,'audit' AS kind,COALESCE(ad.username,a.actor) AS actor,a.entity,a.entity_id,a.action,a.details,a.created_at FROM audit_events a LEFT JOIN admins ad ON ad.id=a.actor" +
    where;
  if (entity === "order" && entityId) {
    query +=
      " UNION ALL SELECT id,'lifecycle',source,'order',order_id,'status',json_object('from',from_status,'to',to_status),created_at FROM order_events WHERE order_id=?";
    args.push(entityId);
  }
  const total = Number(
    db()
      .prepare("SELECT count(*) AS n FROM (" + query + ")")
      .get(...args)?.n || 0,
  );
  const pageCount = Math.max(1, Math.ceil(total / 25));
  const current = Math.min(page, pageCount);
  const rows = db()
    .prepare(
      "SELECT * FROM (" +
        query +
        ") ORDER BY created_at DESC,kind ASC,id DESC LIMIT 25 OFFSET ?",
    )
    .all(...args, (current - 1) * 25);
  return {
    page: current,
    pageCount,
    total,
    events: rows.map((row) => ({
      id: Number(row.id),
      kind: row.kind === "lifecycle" ? "lifecycle" : "audit",
      actor: String(row.actor),
      entity: String(row.entity),
      entityId: String(row.entity_id),
      action: String(row.action),
      at: Number(row.created_at),
      details: safeDetails(row.details),
    })),
  };
}
