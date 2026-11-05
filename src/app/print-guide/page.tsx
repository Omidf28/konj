import { settings } from "@/server/db";
export default function PrintGuide() {
  return (
    <main id="main" className="shell guide-page">
      <h1>راهنمای فایل چاپ</h1>
      <p className="notice">{settings().printGuide}</p>
      <p>
        فایل اصلی نگه داشته می‌شود؛ اندازه فیزیکی چاپ بر حسب سانتی‌متر جدا از
        پیکسل ذخیره می‌شود. پیش‌نمایش سبک فقط برای تأیید چیدمان است. تصویر شفاف
        با حاشیه اضافی، طرح را کوچک‌تر نشان می‌دهد؛ فایل را پیش از آپلود تا دور
        طرح برش دهید. تولید فایل برش دور طرح هنوز فعال نیست.
      </p>
    </main>
  );
}
