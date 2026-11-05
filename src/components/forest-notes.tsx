import Link from "next/link";

/** Original linework for the storefront: coffee, end-grain and conifer branches. */
export function PineEmblem() {
  return (
    <svg className="pine-emblem" viewBox="0 0 180 100" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M90 87V10M90 13 69 39l15-6-25 23 25-9-31 26 33-10M90 13l21 26-15-6 25 23-25-9 31 26-33-10" strokeWidth="1.4"/>
        <path d="M49 83V33m0 3L35 55l11-4-21 22 21-7m3-30 14 19-11-4 21 22-21-7M134 83V37m0 3-13 18 10-4-19 21 19-7m3-28 13 18-10-4 19 21-19-7" opacity=".7"/>
        <path d="M20 87h140M40 92h100M16 87l-5-5m153 5 5-5M80 8l10-6 10 6" opacity=".45"/>
      </g>
    </svg>
  );
}

function CoffeeDrawing() {
  return (
    <svg className="coffee-drawing" viewBox="0 0 240 240" fill="none" aria-hidden="true">
      <circle cx="120" cy="120" r="113" fill="#b44843" stroke="#261f20" strokeWidth="5"/>
      <path d="M20 156h200a112 112 0 0 1-200 0Z" fill="#d9cfaa"/>
      <g stroke="#f2e9ce" strokeWidth="4" strokeLinejoin="round">
        <path d="m73 22 20 15-21 17 26 15-19 17 23 15"/>
        <path d="m111 10 24 20-21 20 25 17-20 17 12 17"/>
        <path d="m153 20 18 17-20 18 17 14-19 20"/>
      </g>
      <ellipse cx="114" cy="186" rx="75" ry="10" fill="#f0e7cd" stroke="#261f20" strokeWidth="3"/>
      <path d="M63 110h95l-8 58c-3 20-72 20-77 0Z" fill="#211e20" stroke="#211e20" strokeWidth="3"/>
      <path d="M158 120c40-9 42 40-4 39m3-27c22-5 21 17-2 17" stroke="#211e20" strokeWidth="8"/>
      <ellipse cx="110" cy="110" rx="47" ry="10" fill="#eee5ce" stroke="#211e20" strokeWidth="3"/>
      <ellipse cx="110" cy="112" rx="37" ry="5" fill="#49302b"/>
      <path d="m88 149 11-12 13 15 12-15 13 12" stroke="#d2ab7e" strokeWidth="3"/>
      <g transform="translate(170 180) rotate(-14)" stroke="#352326" strokeWidth="2">
        <ellipse rx="34" ry="23" fill="#bb8954"/>
        <path d="M-33-4c4-19 61-23 66 0l-8 6-9-2-8 7-11-4-9 3-10-7Z" fill="#a74048"/>
        <ellipse cy="-3" rx="9" ry="6" fill="#6d4c36"/>
        <path d="m-23-6 4-2m4-8 3 2m17-1 4 2m7 7-2 3m-24 6 3 1" stroke="#f1dfb7"/>
      </g>
      <circle cx="120" cy="120" r="106" stroke="#e7cc9d" strokeWidth="1" opacity=".6"/>
    </svg>
  );
}

function LogDrawing() {
  return (
    <svg className="log-drawing" viewBox="0 0 260 180" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.4">
        <path d="m72 58 111-23c34-7 66 66 32 83L101 151" fill="currentColor" fillOpacity=".06"/>
        <ellipse cx="82" cy="106" rx="36" ry="48" transform="rotate(-20 82 106)" fill="#e1d6c0"/>
        <ellipse cx="82" cy="106" rx="28" ry="39" transform="rotate(-20 82 106)"/>
        <ellipse cx="82" cy="106" rx="20" ry="30" transform="rotate(-20 82 106)"/>
        <ellipse cx="82" cy="106" rx="12" ry="19" transform="rotate(-20 82 106)"/>
        <path d="m80 103 5 6-2 7m-3-11-7-7m37 31 100-25M111 91l108-28M99 70l95-23m-76 61 33-9 9 2 48-14m-94 43 48-15 9 1 38-13M137 53l-3 17m55-19-2 11m-24 62-2 7"/>
        <path d="m123 84 13-4m42-6 22-6m-71 50 21-6m29-18 18-5" opacity=".5"/>
      </g>
    </svg>
  );
}

export function ForestNotes() {
  return (
    <section className="forest-notes shell" aria-labelledby="forest-notes-title">
      <div className="forest-notes-heading">
        <span className="forest-note-index" dir="ltr">FIELD NOTES / 01</span>
        <PineEmblem />
        <h2 id="forest-notes-title">قهوه و یک توقف کوتاه.</h2>
        <p>میان کاج‌ها و پرده‌های سرخ.</p>
      </div>
      <Link className="forest-object coffee-note" href="/categories/mug">
        <CoffeeDrawing />
        <span className="forest-object-text"><small>قهوه و دونات</small><strong>ماگ‌های کُنج <span aria-hidden="true">↖</span></strong></span>
      </Link>
      <div className="forest-object log-note">
        <div className="log-medallion"><LogDrawing /></div>
        <span className="forest-object-text"><small>از دل جنگل</small><span>یادداشتی از جنگل</span></span>
      </div>
    </section>
  );
}
