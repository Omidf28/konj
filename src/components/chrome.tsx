import { GothicDivider } from "./gothic-divider";
import { BrandMark } from "./brand-mark";
import { Navigation } from "./navigation";
import { settings, getContent } from "@/server/db";
import Link from "next/link";
import { store } from "@/lib/catalog";
export function Header() {
  const name = settings().brandName;
  const categories = getContent<{ id: string; label: string }>("categories");
  return (
    <>
      <div className="announcement">{store.notice}</div>
      <header className="site-header shell" data-liquid="header">
        <Link href="/" className="brand" aria-label={`${name}، خانه`}>
          <BrandMark /><span className="brand-name">{name}<small dir="ltr">KONJ</small></span>
        </Link>
        <Navigation categories={categories} />
        <Link className="header-cta" href="/products">
          دیدن محصولات <span aria-hidden="true">↙</span>
        </Link>
      </header>
    </>
  );
}
export function Footer() {
  const name = settings().brandName;
  const categories = getContent<{ id: string; label: string }>("categories");
  return (
    <footer className="site-footer">
      <div className="shell footer-divider"><GothicDivider /></div>
      <div className="shell footer-grid">
        <div>
          <Link href="/" className="brand">
            <BrandMark /><span className="brand-name">{name}<small dir="ltr">KONJ</small></span>
          </Link>
          <p>پوشاک، اشیا و چاپ اختصاصی کُنج.</p>
          <p className="muted">
            فروشگاه در حال توسعه است؛ پرداخت بانکی فعال نیست.
          </p>
        </div>
        <div>
          <h2>بگرد و پیدا کن</h2>
          <div className="footer-links">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/products?category=${category.id}`}
              >
                {category.label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h2>راهنمای {name}</h2>
          <div className="footer-links">
            <Link href="/size-guide">راهنمای اندازه</Link>
            <Link href="/print-guide">راهنمای فایل چاپ</Link>
            <Link href="/shipping">ارسال و تعویض</Link>
            <Link href="/support">پشتیبانی</Link>
            <Link href="/track">پیگیری سفارش</Link>
            <Link href="/try-on">استودیوی سه‌بعدی لباس</Link>
            <Link href="/admin">مدیریت</Link>
          </div>
          <p>
            طرح‌ها و مشخصات فعلی نمونه‌اند. اطلاعات تأمین‌کننده، ارسال، تعویض و
            پشتیبانی پس از نهایی‌شدن اینجا قرار می‌گیرند.
          </p>
          <span className="dev-tag">نسخه آزمایشی / در حال توسعه</span>
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>کُنج / پوشاک و چاپ مستقل</span>
        <span dir="ltr">KONJ — INDEPENDENT GOODS</span>
      </div>
    </footer>
  );
}
