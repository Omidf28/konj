import { normalizeDigits } from "./format.ts";
export interface Address {
  name: string;
  mobile: string;
  province: string;
  city: string;
  address: string;
  postalCode: string;
  note: string;
}
export type AddressField = keyof Address;
export function normalizeMobile(input: string) {
  const value = normalizeDigits(input).replace(/[\s()\-]/g, "");
  if (value.startsWith("+98")) return "0" + value.slice(3);
  if (value.startsWith("0098")) return "0" + value.slice(4);
  if (/^989\d{9}$/.test(value)) return "0" + value.slice(2);
  return value;
}
export function validateAddressFields(input: unknown): {
  value?: Address;
  errors: Partial<Record<AddressField, string>>;
} {
  const source =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const errors: Partial<Record<AddressField, string>> = {};
  const value = {} as Address;
  for (const [key, label, min, max] of [
    ["name", "نام گیرنده", 3, 100],
    ["province", "استان", 2, 60],
    ["city", "شهر", 2, 60],
    ["address", "آدرس کامل", 10, 700],
    ["note", "توضیحات", 0, 700],
  ] as const) {
    const text =
      typeof source[key] === "string"
        ? source[key]
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
            .trim()
        : "";
    value[key] = text;
    if (text.length < min) errors[key] = label + " را کامل وارد کنید.";
    else if (text.length > max) errors[key] = label + " بیش از حد طولانی است.";
  }
  value.mobile = normalizeMobile(
    typeof source.mobile === "string" ? source.mobile : "",
  );
  value.postalCode = normalizeDigits(
    typeof source.postalCode === "string" ? source.postalCode : "",
  ).replace(/[\s-]/g, "");
  if (!/^09\d{9}$/.test(value.mobile))
    errors.mobile = "شماره موبایل معتبر مانند ۰۹۱۲۱۲۳۴۵۶۷ وارد کنید.";
  if (!/^\d{10}$/.test(value.postalCode))
    errors.postalCode = "کد پستی باید دقیقاً ۱۰ رقم باشد.";
  return Object.keys(errors).length ? { errors } : { value, errors };
}
