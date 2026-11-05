"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./cart-provider";
import { formatNumber } from "@/lib/format";
export function CartLink() {
  const pathname=usePathname();
  const { state } = useCart();
  const count = state.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <Link href="/cart" className="cart-nav-link" aria-current={pathname === "/cart" ? "page" : undefined}>
      <svg
        className="bag-icon"
        viewBox="0 0 24 24"
        width="21"
        height="21"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d="M5 7h14l1 14H4L5 7Z" />
        <path d="M8 8V6a4 4 0 0 1 8 0v2" />
      </svg>
      <span className="cart-link-label">سبد خرید</span>
      {state.ready && count > 0 && (
        <span
          className="cart-count"
          aria-label={formatNumber(count) + " عدد در سبد"}
        >
          {formatNumber(count)}
        </span>
      )}
    </Link>
  );
}
export function Navigation({
  categories,
}: {
  categories: { id: string; label: string }[];
}) {
  const pathname = usePathname();
  const mobile = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (mobile.current) mobile.current.open = false;
  }, [pathname]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (mobile.current && !mobile.current.contains(event.target as Node))
        mobile.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mobile.current?.open) {
        mobile.current.open = false;
        mobile.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const isActive = (href: string) => pathname === href ||
    (href === "/products" && ["/products/", "/categories/", "/collections/"].some(prefix => pathname.startsWith(prefix)));
  const links = [
    { href: "/products", label: "محصولات" },
    { href: "/custom", label: "طرح خودت" },
    { href: "/sticker-studio", label: "استودیوی استیکر" },
  ];
  return (
    <>
      <nav className="desktop-navigation" aria-label="ناوبری اصلی">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive(link.href) ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
        <CartLink />
      </nav>
      <div className="mobile-cart">
        <CartLink />
      </div>
      <details ref={mobile} className="mobile-nav" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open=false;
      }}>
        <summary aria-label="باز و بسته‌کردن فهرست">☰</summary>
        <nav
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a") && mobile.current) {
              const restoreFocus = mobile.current.contains(document.activeElement);
              mobile.current.open = false;
              if (restoreFocus) mobile.current.querySelector("summary")?.focus({ preventScroll: true });
            }
          }}
          aria-label="ناوبری موبایل"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
          <CartLink />
          <Link href="/try-on" aria-current={pathname === "/try-on" ? "page" : undefined}>استودیوی لباس</Link>
          {categories.map((category) => (
            <Link key={category.id} href={"/categories/" + category.id} aria-current={pathname === "/categories/" + category.id ? "page" : undefined}>
              {category.label}
            </Link>
          ))}
        </nav>
      </details>
    </>
  );
}
