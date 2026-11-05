"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { garmentSizes, garmentDisplayDimensions } from "@/lib/preview";
import { bodyPresets, fitRows, recommendSize, type FitPreference } from "@/lib/fit-profile";
import { formatNumber } from "@/lib/format";
import type { BaseModel } from "@/lib/base-model";
import type { Motif } from "@/lib/catalog";
const Viewer = dynamic(() => import("./viewer"), { ssr: false,
    loading: () => <p role="status" className="loading-state">در حال آماده‌سازی لباس سه‌بعدی…</p> });
const colors = [
    { name: "جوهر", value: "#24272b" }, { name: "وانیل", value: "#e7e1d2" },
    { name: "زیتون", value: "#737b59" }, { name: "یاسی", value: "#afa0c7" },
    { name: "آبی مه‌آلود", value: "#829aaa" }, { name: "آجری", value: "#9b5144" },
];
export function Fitting({ initialCategory = "tshirt", imageUrl, initialMotif = "offline", sizeValue, colorValue, print, base, models }: {
    base?: BaseModel;
    models?: BaseModel[];
    initialCategory?: "tshirt" | "hoodie" | "mug";
    imageUrl?: string;
    initialMotif?: Motif;
    sizeValue?: string;
    colorValue?: string;
    print?: {
        widthCm: number;
        heightCm: number;
        xCm: number;
        yCm: number;
        side?: "front" | "back";
    };
}) {
    const lab = !!models && !base;
    const [category, setCategory] = useState(initialCategory);
    const [modelId, setModelId] = useState(base?.id || models?.find(m => m.category === initialCategory)?.id || "");
    const [localSize, setSize] = useState("L");
    const [localColor, setColor] = useState("#e7e1d2");
    const [motif, setMotif] = useState<Motif>(initialMotif);
    const [lighting, setLighting] = useState<"studio" | "warm" | "night">("studio");
    const [showSeams, setShowSeams] = useState(true);
    const [showGuides, setShowGuides] = useState(false);
    const [clothPhysics, setClothPhysics] = useState(true);
    const [spin, setSpin] = useState(true);
    const [showPrint, setShowPrint] = useState(true);
    const [side, setSide] = useState<"front" | "back">("front");
    const [printScale, setPrintScale] = useState(100);
    const [chest, setChest] = useState(96);
    const [preference, setPreference] = useState<FitPreference>("regular");
    const activeBase = base || models?.find(m => m.id === modelId && m.category === category) || models?.find(m => m.category === category);
    const sizes = activeBase?.sizes ?? Object.keys(garmentSizes);
    const size = sizeValue ?? (sizes.includes(localSize) ? localSize : sizes[0] || "L");
    const color = colorValue || localColor;
    const isGarment = category !== "mug";
    const hasMeasurements = !isGarment || garmentDisplayDimensions(size, category === "hoodie", activeBase).hasMeasurements;
    const body = { ...bodyPresets.B, chest };
    const rows = fitRows(activeBase, body);
    const chosen = rows.find(row => row.size === size);
    const recommended = recommendSize(activeBase, body, preference);
    const activeSide = print?.side ?? (side === "back" && activeBase?.backPrintEnabled ? "back" : "front");
    const maxPrintWidth=Math.min(20,activeBase?.printArea?.widthCm ?? 20);
    const maxPrintHeight=Math.min(isGarment ? 24 : 9,activeBase?.printArea?.heightCm ?? (isGarment ? 24 : 9));
    // Bundled motif SVGs share a 180:145 canvas. Do not stretch them to fill the print area.
    const defaultPrintWidth=!imageUrl ? Math.min(maxPrintWidth,maxPrintHeight*180/145) : maxPrintWidth;
    const defaultPrintHeight=!imageUrl ? Math.min(maxPrintHeight,maxPrintWidth*145/180) : maxPrintHeight;
    function reset() {
        setSize("L");
        setColor("#e7e1d2");
        setMotif(initialMotif);
        setLighting("studio");
        setShowSeams(true);
        setShowGuides(false);
        setClothPhysics(true);
        setSpin(true);
        setShowPrint(true);
        setSide("front");
        setPrintScale(100);
        setChest(96);
        setPreference("regular");
    }
    return <section className={"fitting garment-studio " + (lab ? "fitting-lab" : "product-studio")}>
    <div className="fitting-intro">
      <div><span className="lab-eyebrow">KONJ / MATERIAL STUDY</span>
        <h2>خودِ لباس. از همه طرف.</h2><p>رنگش کن، بچرخان، بافت و دوختش را از نزدیک ببین.</p></div>
      <button type="button" className="text-link" onClick={reset}>بازنشانی</button>
    </div>
    <div className="fit-workspace">
      <aside className="fit-controls glass-panel" data-liquid="panel" aria-label="تنظیمات لباس سه‌بعدی">
        <section className="fit-control-section">
          <span className="lab-step">۰۱ / انتخاب تو</span>
          {lab && <label className="field">مدل لباس<select value={activeBase?.id || ""} onChange={e => {
                const model = models?.find(m => m.id === e.target.value);
                if (model) {
                    setModelId(model.id);
                    setCategory(model.category as typeof category);
                }
            }}>{models?.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
          {!base && !models && <label className="field">محصول<select value={category} disabled={!!sizeValue || !!colorValue} onChange={e => setCategory(e.target.value as typeof category)}><option value="tshirt">تیشرت</option><option value="hoodie">هودی</option><option value="mug">ماگ</option></select></label>}
          {isGarment && <div><p className="fit-field-label">سایز لباس</p><div className="fit-size-options" role="group" aria-label="سایز لباس">
            {sizes.map(s => <button type="button" key={s} aria-pressed={size === s} disabled={!!sizeValue} onClick={() => setSize(s)}>{s}</button>)}</div></div>}
          <div><p className="fit-field-label">رنگ <span dir="ltr">{color}</span></p>
            <div className="fit-swatches" role="group" aria-label="رنگ لباس">{colors.map(c => <button type="button" key={c.value} disabled={!!colorValue} style={{ background: c.value }} aria-label={c.name} title={c.name} aria-pressed={color === c.value} onClick={() => setColor(c.value)}/>)}</div></div>
          {(sizeValue || colorValue) && <p className="fit-help">رنگ و سایز با گزینه خرید هماهنگ‌اند؛ از گزینه‌های محصول تغییرشان بده.</p>}
          {!imageUrl && <label className="field">طرح<select disabled={!lab && (!!sizeValue || !!colorValue)} value={motif} onChange={e => setMotif(e.target.value as Motif)}>
            <option value="offline">آفلاین</option><option value="noise">نویز</option><option value="cat">شیفت شب</option><option value="fine">همه‌چی عادیه</option></select></label>}
          <label className="fit-check"><input type="checkbox" checked={showPrint} onChange={e => setShowPrint(e.target.checked)}/>نمایش طرح</label>
          {lab && <><label className="field">سمت چاپ<select value={activeSide} onChange={e => setSide(e.target.value as typeof side)}>
            <option value="front">جلو</option><option value="back" disabled={!activeBase?.backPrintEnabled}>پشت{!activeBase?.backPrintEnabled ? " · غیرفعال برای این مدل" : ""}</option></select></label>
            <label className="fit-range">اندازه طرح<output>{formatNumber(printScale)}٪</output><input type="range" min={40} max={100} step={5} value={printScale} onChange={e => setPrintScale(Number(e.target.value))}/></label>
            <p className="fit-help">طرح این استودیو برای آزمایش است؛ گزینه خرید را تغییر نمی‌دهد.</p></>}
        </section>
        <section className="fit-control-section">
          <span className="lab-step">۰۲ / نور و حرکت</span>
          <label className="field">نور<select value={lighting} onChange={e => setLighting(e.target.value as typeof lighting)}>
            <option value="studio">استودیو</option><option value="warm">گرم عصر</option><option value="night">نیمه‌شب</option></select></label>
          <div className="fit-toggle-grid">
            <label className="fit-check"><input type="checkbox" checked={spin} onChange={e => setSpin(e.target.checked)}/>چرخش آرام</label>
            {isGarment && <><label className="fit-check"><input type="checkbox" checked={clothPhysics} onChange={e => setClothPhysics(e.target.checked)}/>واکنش نرم پارچه</label>
              {category !== "hoodie" && <label className="fit-check"><input type="checkbox" checked={showSeams} onChange={e => setShowSeams(e.target.checked)}/>دوخت و جزئیات</label>}
              <label className="fit-check"><input type="checkbox" checked={showGuides} onChange={e => setShowGuides(e.target.checked)}/>خطوط اندازه</label></>}
          </div><p className="fit-help">چرخش در حالت کاهش حرکت دستگاه و تب پنهان متوقف می‌شود.</p>
        </section>
      </aside>
      <div className="fit-main">
        {hasMeasurements ? <Viewer base={activeBase} form="B" size={size} color={color} motif={motif} category={category} imageUrl={imageUrl} garmentOnly showBody={false} showGarment lighting={lighting} showSeams={showSeams} showGuides={showGuides} clothPhysics={clothPhysics} onInteract={() => setSpin(false)} spin={spin} showPrint={showPrint} printWidthCm={print?.widthCm ?? defaultPrintWidth * printScale / 100} printHeightCm={print?.heightCm ?? defaultPrintHeight * printScale / 100} printXCm={print?.xCm} printYCm={print?.yCm} side={activeSide}/> : <p role="status" className="notice">جدول اندازه معتبر این سایز در دسترس نیست؛ مدل لباس با اندازه حدسی نمایش داده نمی‌شود.</p>}
        <div className="fit-measure-strip">
          {isGarment ? <><div><small>عرض سینه تخت</small><strong>{chosen ? formatNumber(chosen.chest) : "—"}<span> سانتی‌متر</span></strong></div>
            <div><small>طول لباس</small><strong>{chosen ? formatNumber(chosen.length) : "—"}<span> سانتی‌متر</span></strong></div>
            <div><small>طول آستین</small><strong>{chosen ? formatNumber(chosen.sleeve) : "—"}<span> سانتی‌متر</span></strong></div></> :
            <><div><small>قطر</small><strong>{formatNumber(activeBase?.widthCm ?? 8)} سانتی‌متر</strong></div><div><small>ارتفاع</small><strong>{formatNumber(activeBase?.heightCm ?? 9.5)} سانتی‌متر</strong></div><div><small>ظرفیت</small><strong>{formatNumber(activeBase?.capacityMl ?? 330)} میلی‌لیتر</strong></div></>}
        </div>
        {isGarment && <details className="fit-analysis glass-panel" data-liquid="panel"><summary>اندازه دقیق‌تر / جدول سایز {size}</summary>
          <label className="fit-range">دور سینه برای پیشنهاد سایز<output>{formatNumber(chest)} سانتی‌متر</output><input type="range" min={70} max={140} value={chest} onChange={e => setChest(Number(e.target.value))}/></label>
          <label className="field">آزادی دلخواه<select value={preference} onChange={e => setPreference(e.target.value as FitPreference)}><option value="close">جذب</option><option value="regular">معمولی</option><option value="relaxed">آزاد</option></select></label>
          <p>{recommended ? <>پیشنهاد بر پایه دور سینه: <bdi>{recommended}</bdi> {!sizeValue && <button type="button" className="text-link" onClick={() => setSize(recommended)}>انتخاب</button>}</> : "سایز مناسب در جدول این مدل پیدا نشد."}</p>
          <div className="table-scroll"><table><caption>ابعاد تخت همین مدل · سانتی‌متر</caption><thead><tr><th>سایز</th><th>عرض سینه</th><th>طول</th><th>آستین</th><th>آزادی سینه</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.size} className={row.size === size ? "fit-selected-row" : ""}><th>{sizeValue ? row.size : <button type="button" aria-pressed={row.size === size} onClick={() => setSize(row.size)}>{row.size}</button>}</th><td>{formatNumber(row.chest)}</td><td>{formatNumber(row.length)}</td><td>{formatNumber(row.sleeve)}</td><td>{formatNumber(row.ease)}</td></tr>)}</tbody></table></div>
          <p className="fit-help">پیشنهاد فقط از دور سینه و آزادی لباس محاسبه می‌شود؛ اندازه شخصی ذخیره نمی‌شود. مدل شناور، تن‌خور بدن را شبیه‌سازی نمی‌کند.</p>
        </details>}
        <p className="fit-disclaimer">مدل و حرکت پارچه نمایشی‌اند؛ اندازه‌ها و جنس نمونه‌اند و باید با مشخصات تولیدکننده تطبیق داده شوند.</p>
      </div>
    </div>
  </section>;
}
