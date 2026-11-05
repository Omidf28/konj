"use client";
import { useState } from "react";
import { normalizeDigits } from "@/lib/format";
export function NumericField({
  label,
  value,
  onChange,
  min = 0,
  max = 1e9,
  integer = true,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const parsed = Number(
    normalizeDigits(text)
      .replace(/[,٬\s]/g, "")
      .replace(/٫/g, "."),
  );
  const invalid =
    focused &&
    (text.trim() === "" ||
      !Number.isFinite(parsed) ||
      parsed < min ||
      parsed > max ||
      (integer && !Number.isInteger(parsed)));
  return (
    <label className="field">
      {label}
      <input
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        value={focused ? text : String(value)}
        aria-invalid={invalid}
        onFocus={() => {
          setText(String(value));
          setFocused(true);
        }}
        onChange={(event) => {
          setText(event.target.value);
          const next = Number(
            normalizeDigits(event.target.value)
              .replace(/[,٬\s]/g, "")
              .replace(/٫/g, "."),
          );
          if (
            event.target.value.trim() &&
            Number.isFinite(next) &&
            next >= min &&
            next <= max &&
            (!integer || Number.isInteger(next))
          )
            onChange(next);
        }}
        onBlur={() => setFocused(false)}
      />
      {invalid && (
        <small className="field-error">
          عدد {integer ? "صحیح " : ""}بین {min} و {max} وارد کنید؛ مقدار نامعتبر
          ذخیره نمی‌شود.
        </small>
      )}
    </label>
  );
}
export function TextField({
  label,
  value,
  onChange,
  multiline = false,
  readOnly = false,
  maxLength = 200,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  readOnly?: boolean;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <label className="field">
      {label}
      {multiline ? (
        <textarea
          value={value}
          maxLength={maxLength}
          required={required}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          value={value}
          readOnly={readOnly}
          maxLength={maxLength}
          required={required}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}
