"use client";
import dynamic from "next/dynamic";
import { GothicFrame } from "./gothic-frame";
import Link from "next/link";
import { useState } from "react";
import type { BaseModel } from "@/lib/base-model";
const Viewer = dynamic(() => import("./viewer"), { ssr: false,
    loading: () => <p className="showcase-loading" role="status">پیش‌نمایش در حال آماده‌شدن است…</p> });
const finishes = [{ name: "وانیل", hex: "#e7e1d2" }, { name: "آبی مه‌آلود", hex: "#829aaa" }, { name: "یاسی", hex: "#afa0c7" }];
export function ShirtShowcase({ base, category = "tshirt" }: {
    category?: "tshirt" | "hoodie" | "mug" | "sticker";
    base?: BaseModel;
}) {
    const hoodie = category === "hoodie";
    const label = {tshirt:"تیشرت",hoodie:"هودی",mug:"ماگ",sticker:"استیکر"}[category];
    const garment=category==="tshirt"||hoodie;
    const [color, setColor] = useState(hoodie ? "#8d9b88" : finishes[0].hex);
    const [spin, setSpin] = useState(true);
    return <section className={"shirt-showcase " + (hoodie ? "hoodie-showcase" : "tee-showcase")} data-garment={category} aria-labelledby="shirt-showcase-title">
    <GothicFrame />
    <div className="showcase-model">
      <Viewer ambient garmentOnly base={base} form="B" size={base?.sizeChart?.find(row => row.size === "L" && base.sizes.includes(row.size))?.size || base?.sizeChart?.find(row => base.sizes.includes(row.size))?.size || "L"} color={color} motif="offline" category={category} showBody={false} showPrint={!garment} showSeams onInteract={() => setSpin(false)} spin={spin} clothPhysics={garment}/>
    </div>
    <div className="showcase-copy glass-panel" data-liquid="panel">
      <h2 id="shirt-showcase-title">{label}</h2>
      <p>{hoodie ? "کلاه خوابیده، جیب کانگورویی و مچ کش‌باف." : category === "tshirt" ? "یقه گرد با برش آزاد؛ رنگ و طرح را خودت انتخاب کن." : category === "mug" ? "نمای داخل، دسته و طرح روی بدنه را بچرخان و ببین." : "طرح را از نزدیک ببین؛ برای ساخت مجموعه، وارد استودیوی استیکر شو."}</p>
      <Link className="button primary" href={category === "sticker" ? "/sticker-studio" : "/try-on?category=" + category}>{category === "sticker" ? "ساخت مجموعه استیکر" : "انتخاب رنگ و طرح"}</Link>
      <p className="showcase-note">{garment ? "بچرخان؛ یا «گرفتن پارچه» را بزن و لباس را بکش و رها کن." : "با کشیدن ماوس یا انگشت، محصول را بچرخان."}</p>
    </div>
    <div className="showcase-dock glass-panel" data-liquid="dock">
      <div className="fit-swatches" role="group" aria-label={"رنگ " + label + " نمایشی"}>{(hoodie ? [{ name: "سیج", hex: "#8d9b88" }, { name: "جوهر", hex: "#424a55" }, { name: "وانیل", hex: "#d5cabc" }] : category === "mug" ? [...finishes, { name: "مشکی", hex: "#232426" }] : finishes).map(c => <button type="button" key={c.hex} style={{ background: c.hex }} aria-label={c.name} title={c.name} aria-pressed={color === c.hex} onClick={() => setColor(c.hex)}/>)}</div>
      <span className="showcase-dock-label">{label} / پیش‌نمایش</span>
      <button type="button" className="showcase-pause" aria-pressed={!spin} onClick={() => setSpin(v => !v)}>{spin ? "توقف چرخش" : "ادامه چرخش"}</button>
    </div>
  </section>;
}
