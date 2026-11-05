import { notFound } from "next/navigation";
import { OrderTracking } from "@/components/order-tracking";
export const metadata = {
  title: "پیگیری سفارش",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function OrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  return (
    <main id="main" className="shell guide-page">
      <h1>پیگیری سفارش</h1>
      <OrderTracking key={token} token={token} />
    </main>
  );
}
