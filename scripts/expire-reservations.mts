import "./project-env.mts";
import { expireReservations } from "../src/server/orders.ts";
console.log(
  `Expired ${expireReservations()} unpaid reservation(s). Inventory released transactionally.`,
);
