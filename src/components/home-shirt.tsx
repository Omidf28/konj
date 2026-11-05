"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { BaseModel } from "@/lib/base-model";
const Viewer=dynamic(()=>import("./viewer"),{ssr:false,loading:()=> <p className="stage-loading" role="status">تیشرت در حال آماده‌شدن است…</p>});
const colors=[{name:"استخوانی",hex:"#dcd5c4"},{name:"زغالی",hex:"#424443"},{name:"شرابی",hex:"#773744"}];
export function HomeShirt({base}:{base?:BaseModel}){
 const [color,setColor]=useState(colors[0].hex),[spin,setSpin]=useState(true),[printed,setPrinted]=useState(true);
 const size=base?.sizeChart?.find(row=>row.size==="L"&&base.sizes.includes(row.size))?.size||base?.sizeChart?.find(row=>base.sizes.includes(row.size))?.size||"L";
 return <div className="home-shirt-presentation" aria-label="تیشرت سه‌بعدی کُنج">
  <div className="home-shirt-viewer"><Viewer ambient garmentOnly base={base} form="B" size={size} category="tshirt" motif="offline" color={color} showBody={false} showPrint={printed} imageUrl={color===colors[0].hex ? "/artwork/konj-bookplate-ink.svg" : "/artwork/konj-bookplate-bone.svg"} printWidthCm={21} printHeightCm={27.3} showSeams clothPhysics spin={spin} onInteract={()=>setSpin(false)}/></div>
  <div className="home-shirt-dock" data-liquid="dock"><div className="fit-swatches" role="group" aria-label="رنگ تیشرت نمایشی">{colors.map(c=><button key={c.hex} type="button" style={{background:c.hex}} aria-label={c.name} title={c.name} aria-pressed={color===c.hex} onClick={()=>setColor(c.hex)}/>)}</div><button className="home-spin" type="button" aria-pressed={printed} onClick={()=>setPrinted(value=>!value)}>طرح نمونه</button><button className="home-spin" type="button" aria-pressed={!spin} onClick={()=>setSpin(value=>!value)}>{spin?"توقف چرخش":"ادامه چرخش"}</button></div>
 </div>;
}
