import type { BaseModel } from "./base-model.ts";
export interface BodyMeasurements {
  height: number;
  chest: number;
  waist: number;
  hips: number;
}
export const bodyPresets = {
  A: { height: 168, chest: 84, waist: 70, hips: 90 },
  B: { height: 176, chest: 96, waist: 82, hips: 100 },
  C: { height: 184, chest: 112, waist: 102, hips: 116 },
} satisfies Record<string, BodyMeasurements>;
export const bodyLimits = {
  height: [145, 205],
  chest: [70, 140],
  waist: [55, 140],
  hips: [75, 145],
} as const;
export type FitPreference = "close" | "regular" | "relaxed";
export const fitPreferences = {
  close: { label: "نزدیک به بدن", ease: 4 },
  regular: { label: "معمولی", ease: 10 },
  relaxed: { label: "آزاد", ease: 18 },
} as const;
export function normalizeBody(input: BodyMeasurements): BodyMeasurements {
  return Object.fromEntries(
    Object.entries(bodyLimits).map(([key, [min, max]]) => {
      const value = input[key as keyof BodyMeasurements];
      return [
        key,
        Number.isFinite(value)
          ? Math.max(min, Math.min(max, value))
          : bodyPresets.B[key as keyof BodyMeasurements],
      ];
    }),
  ) as unknown as BodyMeasurements;
}
/** Ellipse with a fixed depth/width ratio; this is a display model, not a body scan. */
export function bodyRadii(circumference: number, ratio = 0.56) {
  const factor =
    Math.PI * (3 * (1 + ratio) - Math.sqrt((3 + ratio) * (1 + 3 * ratio)));
  const halfWidthCm = circumference / factor;
  return { halfWidthCm, halfDepthCm: halfWidthCm * ratio };
}
export function fitRows(base: BaseModel | undefined, body: BodyMeasurements) {
  const measured = normalizeBody(body);
  return (base?.sizeChart ?? [])
    .filter(
      (row) =>
        base?.sizes.includes(row.size) &&
        [row.chest, row.length, row.sleeve].every(
          (n) => Number.isFinite(n) && n > 0,
        ),
    )
    .map((row) => {
      const ease = Math.round((row.chest * 2 - measured.chest) * 10) / 10;
      return {
        ...row,
        ease,
        label:
          ease <= 0
            ? "تنگ‌تر از دور سینه"
            : ease < 6
              ? "نزدیک به بدن"
              : ease < 16
                ? "معمولی"
                : "آزاد",
      };
    });
}
export function recommendSize(
  base: BaseModel | undefined,
  body: BodyMeasurements,
  preference: FitPreference,
) {
  const target = fitPreferences[preference].ease;
  return (
    fitRows(base, body)
      .filter((row) => row.ease >= target)
      .sort((a, b) => a.ease - b.ease || a.length - b.length)[0]?.size ?? null
  );
}
