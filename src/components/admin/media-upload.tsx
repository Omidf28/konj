"use client";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import Image from "next/image";
import { createLatestRead } from "@/lib/latest-read";
import {
  requestAdminMedia,
  type AdminMediaResult,
} from "@/lib/admin-media-request";
type Result = AdminMediaResult;
export function MediaUpload({
  onUploaded,
  library = [],
  onBusyChange,
  disabled = false,
}: {
  onUploaded: (result: Result) => void;
  library?: Result[];
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const latest = useRef(onUploaded);
  const notifyBusy = useRef(onBusyChange);
  const pending = useRef(false),
    mounted = useRef(false);
  const [reader] = useState(() =>
    createLatestRead(
      60000,
      "بارگذاری طول کشید و نتیجه مشخص نیست؛ قبل از تکرار، اطلاعات مدیریت و تصاویر قبلی را تازه کنید. تصویر قبلی فرم حفظ شده است.",
    ),
  );
  useLayoutEffect(() => {
    latest.current = onUploaded;
    notifyBusy.current = onBusyChange;
  }, [onUploaded, onBusyChange]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      reader.cancel();
      notifyBusy.current?.(false);
    };
  }, [reader]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  async function upload() {
    if (!file || pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    notifyBusy.current?.(true);
    setError("");
    try {
      await reader.run(
        (signal) => requestAdminMedia(file, signal),
        (data) => {
          setResult(data);
          latest.current(data);
        },
      );
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error ? error.message : "بارگذاری انجام نشد.",
        );
    } finally {
      pending.current = false;
      if (mounted.current) {
        setBusy(false);
        notifyBusy.current?.(false);
      }
    }
  }
  return (
    <div className="media-upload">
      <label className="field">
        تصویر فروشگاه (PNG، JPEG یا WebP)
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy || disabled}
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            setError("");
            setResult(null);
          }}
        />
      </label>
      <button
        type="button"
        className="button outline"
        disabled={!file || busy || disabled}
        onClick={() => void upload()}
      >
        {busy ? "در حال پردازش تصویر…" : "بارگذاری و استفاده از تصویر"}
      </button>
      {result && (
        <div className="media-result">
          <Image
            src={result.imageUrl}
            width={110}
            height={110}
            alt="تصویر بارگذاری‌شده"
            unoptimized
          />
          <p>
            {result.width} × {result.height} پیکسل مؤثر؛ حاشیه شفاف حذف شد. اصل
            تصویر محفوظ است.
          </p>
          <a className="text-link" href={result.originalUrl}>
            دریافت فایل اصلی
          </a>
        </div>
      )}
      {library.length > 0 && (
        <details className="media-library">
          <summary>انتخاب از تصاویر قبلی فروشگاه</summary>
          <div>
            {library.map((image) => (
              <button
                type="button"
                key={image.imageUrl}
                disabled={busy || disabled}
                onClick={() => {
                  if (pending.current || disabled) return;
                  setResult(image);
                  latest.current(image);
                }}
              >
                <Image
                  src={image.imageUrl}
                  width={80}
                  height={80}
                  unoptimized
                  alt="تصویر ذخیره‌شده فروشگاه"
                />
                <small>
                  {image.width} × {image.height} px
                </small>
              </button>
            ))}
          </div>
        </details>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
