import { motifMarkup } from "@/lib/motif-art";
import type { Category, Motif } from "@/lib/catalog";
function Print({ motif }: { motif: Motif }) {
  // Only static, bundled artwork; no customer or administrator markup is accepted.
  return <g dangerouslySetInnerHTML={{ __html: motifMarkup(motif) }} />;
}
export function ProductArt({
  category,
  motif,
  className = "",
}: {
  category: Category;
  motif: Motif;
  className?: string;
}) {
  return (
    <svg
      className={`product-art ${className}`}
      viewBox="0 0 320 390"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="160" cy="351" rx="98" ry="12" fill="#000" opacity=".24" />
      {(category === "tshirt" || category === "hoodie") && (
        <>
          {category === "hoodie" && (
            <path
              d="M111 89 Q111 32 160 32 Q209 32 209 89 L193 110 H127Z"
              fill="#323638"
              stroke="#555b5d"
            />
          )}
          <path
            d="m108 89-58 29-34 74 52 25 22-40-5 161q75 16 150 0l-5-161 22 40 52-25-34-74-58-29q-52 28-104 0Z"
            fill="#292c2f"
            stroke="#575c60"
            strokeWidth="1.5"
          />
          <path
            d="M128 96q32 40 64 0M91 176l8-47M229 176l-8-47M89 327q71 12 142 0"
            stroke="#474c4f"
            strokeWidth="2"
          />
          {category === "hoodie" && (
            <>
              <path
                d="m116 286-13 37h114l-13-37Z"
                fill="#232629"
                stroke="#42474a"
              />
              <path d="M143 109v34m34-34v34" stroke="#ccc" strokeWidth="2" />
            </>
          )}
          <Print motif={motif} />
        </>
      )}
      {category === "mug" && (
        <>
          <path
            d="M232 134h17q55 0 42 76-7 44-59 40"
            stroke="#c4c2b6"
            strokeWidth="24"
          />
          <path
            d="M77 127h159v156q0 34-80 34t-79-34Z"
            fill="#e1ded1"
            stroke="#aaa89d"
          />
          <ellipse cx="156" cy="127" rx="79" ry="18" fill="#fbf6e8" />
          <ellipse cx="156" cy="127" rx="65" ry="11" fill="#9c998b" />
          <g transform="translate(31 39) scale(.78)">
            <Print motif={motif} />
          </g>
        </>
      )}
      {(category === "sticker" || category === "pack") && (
        <>
          {category === "pack" && (
            <>
              <rect
                x="49"
                y="102"
                width="175"
                height="200"
                rx="15"
                transform="rotate(-17 136 202)"
                fill="#ac9ce0"
              />
              <rect
                x="90"
                y="111"
                width="175"
                height="200"
                rx="15"
                transform="rotate(13 176 211)"
                fill="#e5b56d"
              />
            </>
          )}
          <rect
            x="62"
            y="96"
            width="196"
            height="216"
            rx="22"
            fill="#eeeadd"
            stroke="#fff"
            strokeWidth="8"
          />
          <rect
            x="71"
            y="105"
            width="178"
            height="198"
            rx="14"
            fill="#25292b"
          />
          <Print motif={motif} />
        </>
      )}
    </svg>
  );
}
