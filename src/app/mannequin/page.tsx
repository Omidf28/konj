"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
const Viewer = dynamic(() => import("@/components/viewer"), { ssr: false, loading: () => <p role="status">در حال بارگذاری بدن کامل…</p> });
export default function CompleteMannequinPage() {
    return <main id="main" className="shell try-on-page">
    <header className="try-on-hero"><div>
      <span className="lab-eyebrow">KONJ / COMPLETE HUMAN</span>
      <h1>بدن کامل مانکن</h1>
      <p>مدل مرجع بزرگسال با قد ۱۷۶ سانتی‌متر؛ از جلو، پشت و کنار بررسی کن.</p>
      <div className="viewer-views">
        <Link className="button outline" href="/try-on">نمایش با لباس</Link>
        <a className="button outline" href="/models/human-adult.glb" download>دریافت مدل کامل GLB</a>
      </div>
    </div></header>
    <Viewer form="B" size="L" color="#e7e1d2" motif="offline" category="tshirt" showBody showGarment={false} showPrint={false} clothPhysics={false}/>
  </main>;
}
