/** Original marble figure illustration for the curtain-stage scenery. */
export function MarbleFigure() {
  return (
    <svg className="marble-figure" viewBox="0 0 140 380" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="konj-marble" x1="32" y1="0" x2="106" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#aaa397"/><stop offset=".32" stopColor="#f1eadb"/>
          <stop offset=".58" stopColor="#fff9e9"/><stop offset="1" stopColor="#b4ac9d"/>
        </linearGradient>
        <linearGradient id="konj-plinth" x1="30" y1="0" x2="105" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#bcb4a3"/><stop offset=".5" stopColor="#e8dfcd"/><stop offset="1" stopColor="#8a8175"/>
        </linearGradient>
      </defs>
      <ellipse cx="70" cy="366" rx="57" ry="9" fill="#160a10" opacity=".4"/>
      <path d="M42 306h56v44H42z" fill="url(#konj-plinth)"/>
      <path d="M34 300h72v9H34zM33 348h74v10H33zM26 358h88v8H26z" fill="#d5cbb8"/>
      <path d="M64 54c-8-4-12-12-10-22 1-13 9-21 20-20 12 1 18 9 16 21l-5 18-9 7 2 12 17 9 9 22-13 6-6-12-1 23c-1 15 4 26 9 39l-4 28-10 47 6 44 5 18c2 5-7 8-14 6l-7-7-8-44-5 42-5 9H33l3-7 12-7 3-55-2-43-4-28 8-35 3-24-7 12-13-5 9-24 20-10z" fill="url(#konj-marble)"/>
      <path d="M52 145c10 10 28 11 39 4l4 22-12 58 3 49-13 7-12-49-8 47-15 4 11-64-1-39-4-24z" fill="url(#konj-marble)"/>
      <g stroke="#8c857b" strokeWidth="1" strokeLinecap="round" opacity=".65">
        <path d="M55 30c8-3 19-3 30 0M61 22c5-6 14-8 20-3M59 39l8 1m8 0 6-1m-10 3-2 8 6-1m-8 5 9 1M65 69l8 7 5-6M59 89c5 4 9 4 13 1m3 0c4 2 8 2 11-1M70 98l-2 25m-3 8 5 1"/>
        <path d="M50 151c15 17 24 14 40 7M49 162c11 12 22 10 39 3M51 174l15 13 21-15M63 183l-9 45M77 183l-7 37 11 49M60 201l-6 44-5 30M67 229l7 43M46 310v34m48-34v34"/>
      </g>
      <path d="M61 17c-8 6-8 14-6 21l5-8 7-4 14 1 8 7c1-12-4-21-15-22z" fill="#c9c0af"/>
    </svg>
  );
}

export function RoomLamp() {
  return (
    <svg className="room-lamp" viewBox="0 0 160 400" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="konj-lamp-light">
          <stop stopColor="#ffca89" stopOpacity=".4"/>
          <stop offset="1" stopColor="#ffb56d" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="konj-lamp-shade" x1="35" y1="0" x2="120" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7e1826"/><stop offset=".5" stopColor="#d45b49"/><stop offset="1" stopColor="#651321"/>
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="116" rx="79" ry="113" fill="url(#konj-lamp-light)"/>
      <path d="M76 141h8v222h-8z" fill="#a17b49"/>
      <path d="M79 146h2v211h-2z" fill="#e6c78a"/>
      <ellipse cx="80" cy="369" rx="34" ry="8" fill="#6d5336"/>
      <ellipse cx="80" cy="365" rx="30" ry="6" fill="#b79661"/>
      <path d="M52 54h56l23 99H29Z" fill="url(#konj-lamp-shade)" stroke="#57202b" strokeWidth="2"/>
      <ellipse cx="80" cy="153" rx="51" ry="5" fill="#e0a066"/>
      <path d="M52 57h56M39 142h82" stroke="#ec9868" opacity=".4"/>
      <path d="M104 160v29" stroke="#d1b27b"/>
      <circle cx="104" cy="191" r="2.5" fill="#d1b27b"/>
    </svg>
  );
}
