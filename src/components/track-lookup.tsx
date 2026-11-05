"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function TrackLookup() {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = value.trim();
    const token = /^[a-f0-9]{64}$/.test(text)
      ? text
      : text.match(/\/orders\/([a-f0-9]{64})(?:[/?#]|$)/)?.[1];
    if (!token) {
      setError(
        text
          ? "نشانی کامل پیگیری یا توکن ۶۴ حرفی معتبر را وارد کنید. شناسه معمولی سفارش کافی نیست."
          : "نشانی محرمانه پیگیری یا توکن سفارش را وارد کنید.",
      );
      input.current?.focus();
      return;
    }
    router.push("/orders/" + token);
  }
  return (
    <form className="tracking-lookup" onSubmit={submit} noValidate>
      <label className="field">
        نشانی محرمانه پیگیری یا توکن
        <input
          ref={input}
          required
          autoCapitalize="none"
          autoCorrect="off"
          aria-describedby={id + "-hint" + (error ? " " + id + "-error" : "")}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          maxLength={500}
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          aria-invalid={!!error}
        />
      </label>
      <p id={id + "-hint"} className="muted">
        پس از ثبت سفارش، نشانی پیگیری در صفحه نتیجه داده می‌شود. شماره موبایل یا
        شناسه ترتیبی به‌تنهایی دسترسی ایجاد نمی‌کند.
      </p>
      {error && (
        <p id={id + "-error"} role="alert" className="notice danger">
          {error}
        </p>
      )}
      <button className="button primary">بازکردن سفارش</button>
    </form>
  );
}
