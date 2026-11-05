"use client";
import { useRef, useState, useId } from "react";
import Image from "next/image";
import { formatNumber } from "@/lib/format";
import { ProductArt } from "./product-art";
import type { Product } from "@/lib/catalog";
export function ProductGallery({ product }: { product: Product }) {
  const images = [
    ...new Set(
      [product.imageUrl, ...(product.images || [])].filter(
        (url): url is string => !!url,
      ),
    ),
  ];
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const found = images.indexOf(selectedUrl || "");
  const selected = found >= 0 ? found : 0;
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const dialogId = useId();
  const counter = images.length
    ? formatNumber(selected + 1) + " از " + formatNumber(images.length)
    : "تصویر مفهومی";
  function move(delta: number) {
    setSelectedUrl((current) => {
      const index = images.indexOf(current || "");
      return (
        images[
          Math.max(
            0,
            Math.min(images.length - 1, (index >= 0 ? index : 0) + delta),
          )
        ] || null
      );
    });
  }
  const image = images[selected] || images[0];
  return (
    <div className="product-gallery">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-controls={dialogId}
        className={"gallery-main art-panel motif-" + product.motif}
        onClick={() => {
          if (!dialog.current?.open) dialog.current?.showModal();
        }}
        aria-label={"بزرگ‌نمایی تصویر " + product.name}
      >
        {image ? (
          <Image
            className="product-photo"
            src={image}
            width={850}
            height={1000}
            unoptimized
            alt={product.name}
            loading="eager"
          />
        ) : (
          <ProductArt category={product.category} motif={product.motif} />
        )}
        <span className="gallery-zoom">بزرگ‌نمایی ＋</span>
        {!image && (
          <span className="sample-label">
            تصویر مفهومی نمونه؛ عکس تولید نیست
          </span>
        )}
      </button>
      {images.length > 1 && (
        <div className="gallery-thumbs" aria-label="تصاویر محصول">
          {images.map((url, index) => (
            <button
              type="button"
              key={url}
              aria-pressed={selected === index}
              aria-label={
                "نمای " +
                formatNumber(index + 1) +
                " از " +
                formatNumber(images.length) +
                "، " +
                product.name
              }
              onClick={() => setSelectedUrl(url)}
            >
              <Image src={url} width={90} height={100} unoptimized alt="" />
            </button>
          ))}
        </div>
      )}
      <dialog
        ref={dialog}
        id={dialogId}
        onClose={() => trigger.current?.focus()}
        onKeyDown={(event) => {
          if (
            images.length < 2 ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey
          )
            return;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            move(-1);
          }
          if (event.key === "Home") {
            event.preventDefault();
            setSelectedUrl(images[0]);
          }
          if (event.key === "End") {
            event.preventDefault();
            setSelectedUrl(images.at(-1) || null);
          }
        }}
        className="image-dialog"
        aria-labelledby={title}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="image-dialog-content">
          <div className="dialog-toolbar">
            <h2 id={title}>{product.name}</h2>
            <button
              type="button"
              className="button outline"
              onClick={() => dialog.current?.close()}
              aria-label="بستن تصویر"
            >
              بستن ×
            </button>
          </div>
          {images.length > 1 && (
            <div className="gallery-controls">
              <button
                type="button"
                className="button outline"
                disabled={selected === 0}
                onClick={() => move(-1)}
                aria-label="تصویر قبلی"
              >
                → قبلی
              </button>
              <p role="status" aria-live="polite" aria-atomic="true">
                {counter}
              </p>
              <button
                type="button"
                className="button outline"
                disabled={selected === images.length - 1}
                onClick={() => move(1)}
                aria-label="تصویر بعدی"
              >
                بعدی ←
              </button>
            </div>
          )}
          {image ? (
            <Image
              src={image}
              width={1200}
              height={1400}
              unoptimized
              alt={product.name}
            />
          ) : (
            <ProductArt category={product.category} motif={product.motif} />
          )}
          {images.length > 1 && (
            <p className="muted">
              کلید چپ: تصویر بعدی · راست: قبلی · Home و End: ابتدا و انتها ·
              Escape: بستن
            </p>
          )}
          <p className="muted">
            {image
              ? "رنگ صفحه‌نمایش ممکن است با محصول واقعی تفاوت داشته باشد."
              : "این تصویر نمونه مفهومی است و جای عکس تولید نهایی را نمی‌گیرد."}
          </p>
        </div>
      </dialog>
    </div>
  );
}
