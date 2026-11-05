import type { Metadata } from "next";
import localFont from "next/font/local";
import { Header, Footer } from "@/components/chrome";
import { settings } from "@/server/db";
import "./globals.css";
import "./storefront.css";
import "./liquid-glass.css";
import "./shop-refinement.css";
import "./metal-paper.css";
import "./red-room.css";
import { CartProvider } from "@/components/cart-provider";
const vazirmatn = localFont({
  src: "../../public/fonts/Vazirmatn.woff2",
  display: "swap",
  variable: "--font-fa",
  weight: "100 900",
});
export function generateMetadata(): Metadata {
  const name = settings().brandName;
  return {
    title: { default: `${name} | سلیقه‌ات رو بپوش`, template: `%s | ${name}` },
    robots: { index: false, follow: false, noarchive: true },
    description:
      "طرح‌های مستقل برای تیشرت، هودی، ماگ و استیکر؛ نسخه آزمایشی با داده نمونه.",
  };
}
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" data-scroll-behavior="smooth" className={vazirmatn.variable}>
      <body>
        <a className="skip-link" href="#main">
          رفتن به محتوا
        </a>
        <CartProvider>

          <Header />
          {children}
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}

export const dynamic = "force-dynamic";
