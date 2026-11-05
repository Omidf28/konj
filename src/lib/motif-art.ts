import type { Motif } from "./catalog.ts";
/** Trusted, local artwork shared by catalog SVG and the actual 3D print texture. */
const artwork: Record<string, string> = {
  noise: `<g stroke="#c8fa65" fill="none" stroke-width="6">
<path d="M116 158 v85"/>
<path d="M127 170 v61"/>
<path d="M138 182 v37"/>
<path d="M149 158 v85"/>
<path d="M160 170 v61"/>
<path d="M171 182 v37"/>
<path d="M182 158 v85"/>
<path d="M193 170 v61"/>
<path d="M204 182 v37"/>
<text x="160" y="266" fill="#eee" font-family="Arial,sans-serif" text-anchor="middle" stroke="none" font-size="11" letter-spacing="5">NOISE CLUB</text>
</g>`,
  cat: `<path d="M117 203 L113 154 L140 170 Q160 160 180 170 L207 154 L203 203 Q198 238 160 241 Q122 237 117 203" fill="#c8fa65"/>
<path d="M132 197 l15 5 M173 202 l15 -5" stroke="#17191a" stroke-width="5"/>
<path d="m154 215 6 5 6-5" fill="none" stroke="#17191a" stroke-width="3"/>
<text x="160" y="264" fill="#eee" font-family="Arial,sans-serif" text-anchor="middle" font-size="11" letter-spacing="3">NIGHT SHIFT</text>`,
  fine: `<circle cx="160" cy="201" r="43" fill="#c8fa65"/>
<circle cx="146" cy="190" r="4" fill="#17191a"/>
<circle cx="174" cy="190" r="4" fill="#17191a"/>
<path d="M138 215 Q160 231 182 215" fill="none" stroke="#17191a" stroke-width="4"/>
<text x="160" y="263" fill="#eee" font-family="Arial,sans-serif" text-anchor="middle" font-size="11" letter-spacing="2">EVERYTHING IS FINE</text>`,
  offline: `<rect x="110" y="158" width="100" height="79" rx="2" fill="#c8fa65"/>
<path d="m125 177 69 42 M194 177 l-69 42" stroke="#17191a" stroke-width="4"/>
<text x="160" y="257" fill="#eee" font-family="Arial,sans-serif" text-anchor="middle" font-size="17" font-weight="800" letter-spacing="4">OFFLINE</text>
<text x="160" y="276" fill="#aaa" font-family="Arial,sans-serif" text-anchor="middle" font-size="8" letter-spacing="3">PLEASE TRY LATER</text>`
};
export function motifMarkup(motif: Motif) {
  return Object.hasOwn(artwork, motif) ? artwork[motif] : artwork.offline;
}
export function motifSvg(motif: Motif) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="70 140 180 145" width="720" height="580">'
    + motifMarkup(motif) + '</svg>';
}
export function motifTextureUrl(motif: Motif) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(motifSvg(motif));
}
