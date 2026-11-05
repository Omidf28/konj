import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="shell empty-state">
      <span aria-hidden="true">۴۰۴</span>
      <h1>این کُنج رو پیدا نکردیم.</h1>
      <p>ممکنه نشانی عوض شده باشه.</p>
      <Link href="/products" className="button primary">
        برگشتن به محصولات
      </Link>
    </main>
  );
}
