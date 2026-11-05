"use client";
import { useEffect, useState, useRef } from "react";
import { performAdminMutation } from "@/lib/admin-mutation";
import { createLatestRead } from "@/lib/latest-read";
import { formatNumber } from "@/lib/format";
interface Account {
  username: string;
  expiresAt: number;
  otherSessions: number;
}
export function AdminAccount({
  onSessionExpired,
  busy,
  onBusyChange,
}: {
  onSessionExpired: () => void;
  busy: boolean;
  onBusyChange: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [profile, setProfile] = useState<Account | null>(null);
  const [reader] = useState(() => createLatestRead());
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!open) return;
    void reader
      .run(
        async (signal) => {
          const response = await fetch("/api/admin/account", {
            signal,
            cache: "no-store",
          });
          if (response.status === 401 || response.status === 403) {
            return null;
          }
          const result = await response.json();
          if (!response.ok)
            throw Error(result.error || "خواندن حساب انجام نشد.");
          return result as Account;
        },
        (value) => {
          setProfile(value);
          if (!value) onSessionExpired();
        },
      )
      .catch((error) => {
        setMessage(
          error instanceof Error ? error.message : "خواندن حساب انجام نشد.",
        );
        setError(true);
      });
    return () => reader.cancel();
  }, [open, attempt, reader, onSessionExpired]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const action = fields.get("action");
    const body = {
      action,
      currentPassword: fields.get("currentPassword"),
      newPassword: fields.get("newPassword"),
      confirmation: fields.get("confirmation"),
    };
    if (
      action === "change_password" &&
      body.newPassword !== body.confirmation
    ) {
      setMessage("تکرار رمز تازه یکسان نیست.");
      setError(true);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    onBusyChange(true);
    setMessage("");
    setError(false);
    // Clear password controls immediately; secrets are never added to drafts or browser storage.
    form.reset();
    setShow(false);
    try {
      const result = await performAdminMutation("/api/admin/account", body);
      if (result.status === 401) onSessionExpired();
      if (result.outcome !== "confirmed") throw Error(result.error);
      setMessage(
        action === "change_password"
          ? "رمز تغییر کرد. این نشست باز می‌ماند؛ نشست‌های دیگر بسته شدند."
          : "نشست‌های دیگر بسته شدند؛ این نشست باز می‌ماند.",
      );
      setError(false);
      setProfile(null);
      setAttempt((value) => value + 1);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "نتیجه عملیات مشخص نشد؛ اطلاعات حساب را تازه کنید.",
      );
      setError(true);
    } finally {
      inFlight.current = false;
      setSaving(false);
      onBusyChange(false);
    }
  }
  return (
    <section className="admin-account">
      <button
        type="button"
        className="button outline"
        disabled={saving}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setShow(false);
        }}
      >
        {open ? "بستن امنیت حساب" : "امنیت حساب مدیر"}
      </button>
      {open && (
        <div className="account-content">
          <h2>رمز و نشست‌های ورود</h2>
          <p className="muted">
            عملیات فقط برای حساب واردشده است. تغییر رمز، نشست‌های دیگر همین حساب
            را می‌بندد. نشست فعلی و پیش‌نویس‌های این تب حفظ می‌شوند.
          </p>
          {profile ? (
            <p>
              حساب: <bdi>{profile.username}</bdi> ·{" "}
              {formatNumber(profile.otherSessions)} نشست فعال دیگر · پایان
              اعتبار این نشست:{" "}
              <time dateTime={new Date(profile.expiresAt).toISOString()}>
                {new Intl.DateTimeFormat("fa-IR", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "Asia/Tehran",
                }).format(profile.expiresAt)}
              </time>
            </p>
          ) : (
            <p role="status">اطلاعات حساب هنوز دریافت نشده است.</p>
          )}
          <button
            type="button"
            className="text-link"
            disabled={saving || busy}
            onClick={() => {
              setProfile(null);
              setAttempt((value) => value + 1);
            }}
          >
            تازه‌سازی اطلاعات حساب
          </button>
          {message && (
            <p
              role={error ? "alert" : "status"}
              className={"notice " + (error ? "danger" : "success")}
            >
              {message}
            </p>
          )}
          <form onSubmit={submit}>
            <input type="hidden" name="action" value="change_password" />
            <fieldset className="editor-fieldset" disabled={saving || busy}>
              <legend>تغییر رمز</legend>
              <label className="field">
                رمز فعلی
                <input
                  name="currentPassword"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  maxLength={512}
                />
              </label>
              <label className="field">
                رمز تازه؛ حداقل ۱۴ کاراکتر
                <input
                  name="newPassword"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={14}
                  maxLength={512}
                />
              </label>
              <label className="field">
                تکرار رمز تازه
                <input
                  name="confirmation"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={14}
                  maxLength={512}
                />
              </label>
              <label className="inventory-toggle">
                <input
                  type="checkbox"
                  checked={show}
                  onChange={(e) => setShow(e.target.checked)}
                />
                نمایش رمزهای همین فرم
              </label>
              <button type="submit" className="button primary">
                {saving ? "در حال ثبت…" : "تغییر رمز و خروج نشست‌های دیگر"}
              </button>
            </fieldset>
          </form>
          <form onSubmit={submit}>
            <input type="hidden" name="action" value="revoke_others" />
            <fieldset className="editor-fieldset" disabled={saving || busy}>
              <legend>خروج از نشست‌های دیگر</legend>
              <label className="field">
                برای تأیید، رمز فعلی را وارد کن
                <input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={512}
                />
              </label>
              <button type="submit" className="button outline">
                بستن نشست‌های دیگر همین حساب
              </button>
            </fieldset>
          </form>
          <p className="muted">
            رمزها در پیش‌نویس یا فضای ذخیره‌سازی برنامه ثبت نمی‌شوند. مهلت این
            نشست با این عملیات تمدید نمی‌شود.
          </p>
        </div>
      )}
    </section>
  );
}
