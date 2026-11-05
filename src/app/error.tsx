"use client";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main id="main" className="shell empty-state">
      <h1>این بار صفحه باز نشد.</h1>
      <p>
        دوباره امتحان کن؛ اگر مشکل باقی ماند کمی بعد برگرد. سبد ذخیره‌شده را پاک
        نکن.
      </p>
      <button className="button primary" onClick={retry}>
        تلاش دوباره
      </button>
    </main>
  );
}
