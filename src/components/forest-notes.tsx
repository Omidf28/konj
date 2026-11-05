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
    <svg className="coffee-drawing" viewBox="0 0 240 180" fill="none" aria-hidden="true">
      <ellipse cx="113" cy="145" rx="91" ry="15" fill="currentColor" opacity=".08"/>
      <g stroke="currentColor" strokeWidth="1.5">
        <path d="M48 70c1 35 8 60 22 67 20 9 63 9 83-1 13-9 20-36 21-66"/>
        <ellipse cx="111" cy="70" rx="63" ry="17"/>
        <ellipse cx="111" cy="72" rx="53" ry="11" fill="currentColor" fillOpacity=".78"/>
        <path d="M174 80c47-18 53 49-10 43m9-32c30-9 32 22-5 23M33 141c23 28 136 31 163-1M65 90c2 16 4 29 9 35" />
        <g opacity=".5">
          <path d="M86 45c-17-19 17-22 1-40M112 43c-19-24 23-24 7-41M139 45c-10-16 13-20 5-33"/>
          <path d="m48 153 8 4m9-1 8 4m10-1 7 4m12-2 6 3m15-3 6 2"/>
        </g>
      </g>
      <g transform="translate(167 137) rotate(-14)">
        <ellipse rx="43" ry="27" fill="#b47b51" stroke="#674531" strokeWidth="1.5"/>
        <path d="M-41-3c4-23 73-27 82-3l-6 7-10-1-7 7-12-3-11 5-10-6-11 1z" fill="#d8afa0" stroke="#885a4c" strokeWidth="1"/>
        <ellipse cy="-3" rx="12" ry="8" fill="#79604c" stroke="#674531"/>
        <path d="m-28-9 5-2m7-8 3 3m26-1 5 2m9 8-3 3m-36 9 5 1m18-4 4 2" stroke="#f8e8d2" strokeWidth="2" strokeLinecap="round"/>
      </g>
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
        <LogDrawing />
        <span className="forest-object-text"><small>از دل جنگل</small><span>یادداشتی از جنگل</span></span>
      </div>
    </section>
  );
}
