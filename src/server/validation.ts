import { AppError } from "./security.ts";
import { validateAddressFields, type Address } from "../lib/address.ts";
export type { Address };
export function validateAddress(input: unknown): Address {
  const result = validateAddressFields(input);
  if (!result.value)
    throw new AppError(
      Object.values(result.errors)[0] || "اطلاعات گیرنده معتبر نیست.",
    );
  return result.value;
}
