/** Keep both physical sides within the printer's limits without changing aspect ratio. */
export function customPrintBounds(
  draft: { pixelWidth: number; pixelHeight: number; width: number; x: number; y: number },
  limits: { minCm: number; maxWidth: number; maxHeight: number; sticker: boolean },
) {
  const ratio = draft.pixelWidth / draft.pixelHeight;
  const { minCm, maxWidth, maxHeight, sticker } = limits;
  const minWidth = Math.max(minCm, minCm * ratio);
  const maxAllowedWidth = Math.min(maxWidth, maxHeight * ratio);
  const valid = Number.isFinite(ratio) && ratio > 0 && minCm > 0 &&
    Number.isFinite(maxAllowedWidth) && minWidth <= maxAllowedWidth;
  // Invalid ratios still get a bounded preview, but cannot be confirmed or uploaded.
  const width = Math.max(0.1, Math.min(Math.max(draft.width, valid ? minWidth : 0.1), maxAllowedWidth));
  const height = valid ? Math.max(minCm, Math.min(maxHeight, width / ratio)) : width / ratio;
  return {
    width, height,
    x: sticker ? 0 : Math.max(0, Math.min(draft.x, maxWidth - width)),
    y: sticker ? 0 : Math.max(0, Math.min(draft.y, maxHeight - height)),
    areaWidth: sticker ? width : maxWidth,
    areaHeight: sticker ? height : maxHeight,
    minWidth, maxWidth: maxAllowedWidth, valid,
  };
}
