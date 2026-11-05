import { getContent } from "@/server/db";
import type { BaseModel } from "@/lib/base-model";
import { Fitting } from "@/components/fitting";
export default async function TryOn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const category = query.category === "hoodie" ? "hoodie" : query.category === "mug" ? "mug" : "tshirt";
  return (
    <main id="main" className="shell try-on-page">
      <header className="try-on-hero">
        <div>
          <span className="lab-eyebrow">KONJ / SOFT GARMENT STUDIO</span>
          <h1>
            از نزدیک‌تر،
            <br />
            <em>از همه طرف.</em>
          </h1>
          <p>
            پیش از انتخاب، با رنگ و اندازه بازی کن. لباس خودت را در نور خودت
            ببین.
          </p>
        </div>
        <div className="try-on-stamp" aria-hidden="true">
          <span>کُنج</span>
          <small>مطالعه لباس / ۰۱</small>
        </div>
      </header>
      <Fitting key={category} initialCategory={category}
        models={getContent<BaseModel>("bases").filter((model) =>
          ["tshirt", "hoodie", "mug"].includes(model.category),
        )}
      />
    </main>
  );
}
