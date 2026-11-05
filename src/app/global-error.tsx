"use client";

export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <title>بازگشت به فروشگاه</title>
      </head>
      <body
        style={{
          margin: 0,
          background: "#191d19",
          color: "#eeeade",
          fontFamily: "Tahoma, sans-serif",
        }}
      >
        <main
          style={{
            maxWidth: 620,
            margin: "12vh auto",
            padding: 24,
            lineHeight: 2,
          }}
        >
          <p style={{ color: "#c8ef75" }}>کمی مکث، دوباره تلاش</p>
          <h1>فروشگاه موقتاً باز نشد.</h1>
          <p>
            ممکن است ارتباط یا سرویس موقتاً در دسترس نباشد. تلاش دوباره سبد
            ذخیره‌شده را پاک نمی‌کند.
          </p>
          <button
            onClick={retry}
            style={{
              font: "inherit",
              cursor: "pointer",
              border: 0,
              borderRadius: 12,
              padding: "10px 24px",
              background: "#c8ef75",
              color: "#191d19",
            }}
          >
            تلاش دوباره
          </button>
          <p>
            {/* A full document navigation recovers even when the root router failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ color: "#eeeade" }}>
              بازگشت به خانه
            </a>
          </p>
          <p>
            اگر پس از ثبت سفارش این صفحه را دیدی، قبل از سفارش دوباره نتیجه را
            از تسویه یا پیگیری بررسی کن.
          </p>
        </main>
      </body>
    </html>
  );
}
