export function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) =>
    String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632)),
  );
}
export function normalizeText(value: string): string {
  return normalizeDigits(value)
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fa");
}
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("fa-IR").format(value);
}
export function formatPrice(toman: number): string {
  return `${formatNumber(toman)} تومان`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return formatNumber(bytes) + " بایت";
  if (bytes < 1024 ** 2)
    return (
      new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(
        bytes / 1024,
      ) + " کیلوبایت"
    );
  return (
    new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(
      bytes / 1024 ** 2,
    ) + " مگابایت"
  );
}
