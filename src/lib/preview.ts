import {
  bodyPresets,
  normalizeBody,
  bodyRadii,
  type BodyMeasurements,
} from "./fit-profile.ts";
import type { BaseModel } from "./base-model.ts";
export const mannequinForms = {
  A: { label: "باریک", ...bodyRadii(bodyPresets.A.chest) },
  B: { label: "متوسط", ...bodyRadii(bodyPresets.B.chest) },
  C: { label: "درشت", ...bodyRadii(bodyPresets.C.chest) },
} as const;
export const garmentSizes = {
  S: { width: 48, length: 68, sleeve: 20 },
  M: { width: 51, length: 70, sleeve: 21 },
  L: { width: 54, length: 72, sleeve: 22 },
  XL: { width: 57, length: 74, sleeve: 23 },
  XXL: { width: 60, length: 76, sleeve: 24 },
} as const;
export type Form = keyof typeof mannequinForms;
export type Size = keyof typeof garmentSizes;
export function previewDimensions(
  form: Form,
  size: string,
  hoodie = false,
  base?: BaseModel,
  measurements?: BodyMeasurements,
) {
  const body = measurements
    ? { label: "سفارشی", ...bodyRadii(normalizeBody(measurements).chest) }
    : mannequinForms[form];
  const garment = garmentSizes[size as Size] || garmentSizes.L;
  const measurement = base?.sizeChart?.find((row) => row.size === size);
  const width = measurement?.chest ?? garment.width + (hoodie ? 6 : 0);
  const { halfWidthCm, halfDepthCm } = bodyRadii(width * 2, 0.55);
  const normalized = normalizeBody(measurements ?? bodyPresets[form]);
  const waist = bodyRadii(normalized.waist);
  const hips = bodyRadii(normalized.hips);
  const clearWidth = Math.max(
    body.halfWidthCm + 0.25,
    waist.halfWidthCm / 0.94,
    hips.halfWidthCm / 0.98,
  );
  const clearDepth = Math.max(
    body.halfDepthCm + 0.25,
    waist.halfDepthCm / 0.94,
    hips.halfDepthCm / 0.98,
  );
  const hasMeasurements = base
    ? base.sizes.includes(size) &&
      !!measurement &&
      [measurement.chest, measurement.length, measurement.sleeve].every(
        (n) => Number.isFinite(n) && n > 0,
      )
    : !!garmentSizes[size as Size];
  return {
    hasMeasurements,
    body,
    garment: {
      halfWidthCm,
      halfDepthCm,
      lengthCm: measurement?.length ?? garment.length + (hoodie ? 2 : 0),
      sleeveCm:
        measurement?.sleeve ?? (hoodie ? garment.sleeve + 41 : garment.sleeve),
    },
    valid:
      hasMeasurements && halfWidthCm > clearWidth && halfDepthCm > clearDepth,
  };
}

/** Product-only cut uses the flat chest width, independent of any body profile. */
export function garmentDisplayDimensions(size: string, hoodie = false, base?: BaseModel) {
  const measured = previewDimensions("B", size, hoodie, base);
  const row = base?.sizeChart?.find(row => row.size === size);
  const flatWidth = row?.chest ?? (garmentSizes[size as Size] || garmentSizes.L).width + (hoodie ? 6 : 0);
  return { hasMeasurements: measured.hasMeasurements, garment: {
    ...measured.garment, halfWidthCm: flatWidth / 2, halfDepthCm: flatWidth * (hoodie ? 0.155 : 0.12),
  } };
}
