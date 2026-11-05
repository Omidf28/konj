import { settings } from "@/server/db";
export default function Shipping() {
  return (
    <main id="main" className="shell guide-page">
      <h1>ارسال و تعویض</h1>
      <p className="notice">{settings().shippingPolicy}</p>
      <p>
        هزینه و زمان نمایش‌داده‌شده در این نسخه نمونه است. سیاست قطعی تجاری تا
        زمان تأیید مالک فروشگاه اعلام نمی‌شود.
      </p>
    </main>
  );
}
