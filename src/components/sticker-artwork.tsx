import type { Motif } from "@/lib/catalog";
export function StickerArtwork({ motif }: { motif: Motif }) {
  return (
    <svg
      viewBox="0 0 160 120"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="156"
        height="116"
        rx="9"
        fill="#eeeadd"
        stroke="#fff"
        strokeWidth="3"
      />
      <rect x="7" y="7" width="146" height="106" rx="6" fill="#23282a" />
      <text
        x="80"
        y="65"
        fill="#c8fa65"
        fontFamily="Arial"
        fontSize={motif === "cat" ? 32 : 45}
        fontWeight="bold"
        textAnchor="middle"
      >
        {motif === "cat"
          ? "=^.^="
          : motif === "noise"
            ? "≋≋"
            : motif === "fine"
              ? ":)"
              : "×"}
      </text>
      <text
        x="80"
        y="96"
        fill="#eeeadd"
        fontFamily="Arial"
        fontSize="12"
        letterSpacing="2"
        textAnchor="middle"
      >
        {motif.toUpperCase()}
      </text>
    </svg>
  );
}
