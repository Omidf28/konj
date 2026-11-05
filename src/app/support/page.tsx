import { settings } from "@/server/db";
export default function Support() {
  return (
    <main id="main" className="shell guide-page">
      <h1>پشتیبانی</h1>
      <p className="notice">{settings().support}</p>
      <p>
        اطلاعات تماس نهایی هنوز ثبت نشده است. برای پیگیری سفارش آزمایشی، نشانی
        محرمانه‌ای را که بعد از ثبت دریافت کردید باز کنید.
      </p>
    </main>
  );
}
