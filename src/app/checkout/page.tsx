import Link from "next/link";
import { Checkout } from "@/components/checkout";
import { settings } from "@/server/db";

export default function CheckoutPage() {
  const acceptingOrders = process.env.NODE_ENV !== "production" && settings().testMode;
  return (
    <main id="main" className="shell guide-page">
      <h1>ثبت سفارش آزمایشی</h1>
      {!acceptingOrders && (
        <p className="notice">
          ثبت سفارش فعلاً غیرفعال است. <Link href="/track">پیگیری سفارش قبلی</Link>
        </p>
      )}
      <Checkout acceptingOrders={acceptingOrders} />
    </main>
  );
}
