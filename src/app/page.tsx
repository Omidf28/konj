import { GothicDivider } from "@/components/gothic-divider";
import { BotanicalSeal } from "@/components/botanical-seal";
import { HomeShirt } from "@/components/home-shirt";
import type { BaseModel } from "@/lib/base-model";
import { GothicFrame } from "@/components/gothic-frame";
import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { getProducts, getContent } from "@/server/db";
import { ProductArt } from "@/components/product-art";
import { ProductCard } from "@/components/product-card";
export default function Home() {
  const products = getProducts();
  const shirtBase=getContent<BaseModel>("bases").find(model=>model.category==="tshirt"&&model.sizes.some(size=>model.sizeChart?.some(row=>row.size===size)));
  const categories = getContent<{
    id: string;
    label: string;
    description: string;
  }>("categories");
  const collections = getContent<{ id: string; label: string }>("collections");
  return (
    <main id="main" className="shop-home">
      <section className="hero shell">
        <div className="hero-copy">
          <BotanicalSeal />
          <p className="eyebrow accent">
            کُنج / پوشاک و چاپ مستقل
          </p>
          <h1>
            برای سلیقه‌های
            <br />
            <span>سنگین.</span>
          </h1>
          <p className="hero-description">
            تیشرت، هودی، ماگ و استیکر با طرح انتخابی تو.
            <br />
            مدل را ببین، رنگ و اندازه را انتخاب کن و طرح را اضافه کن.
          </p>
          <div className="hero-actions">
            <Link href="/products" className="button primary">
              دیدن محصولات <span aria-hidden="true">↙</span>
            </Link>
            <Link href="/products?category=sticker" className="text-link">
              از استیکرها شروع کن ←
            </Link>
          </div>
          <nav className="hero-shortcuts" aria-label="شروع از دسته دلخواه">
            {categories.map((category) => (
              <Link key={category.id} href={"/categories/" + category.id}>
                {category.label}
                <span aria-hidden="true">↖</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="hero-stage home-shirt-stage">
          <GothicFrame />
          <HomeShirt base={shirtBase}/>
        </div>
      </section>
      <section className="section shell">
        <div className="section-heading">
          <GothicDivider />
          <div>
            <p className="eyebrow">ویترین کُنج</p>
            <h2>پوشاک و اشیای کُنج</h2>
          </div>
          <span className="section-index" dir="ltr">
            I / CATALOGUE
          </span>
        </div>
        <div className="category-grid">
          {categories.map((category, index) => (
            <Link
              key={category.id}
              href={`/categories/${category.id}`}
              className="category-card"
            >
              <span className="category-number">
                {formatNumber(index + 1).padStart(2, "۰")}
              </span>
              <ProductArt
                category={category.id}
                motif={index % 2 ? "cat" : "offline"}
              />
              <div>
                <h3>
                  {category.label}
                  <span aria-hidden="true">↖</span>
                </h3>
                <p>{category.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="section shell">
        <div className="section-heading">
          <GothicDivider />
          <div>
            <p className="eyebrow accent">از ویترین کُنج</p>
            <h2>از ویترین</h2>
          </div>
          <Link className="text-link" href="/products">
            همه محصولات ←
          </Link>
        </div>
        <div className="product-grid">
          {products.slice(0, 4).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
      <section
        className="section shell studio-invitation"
        aria-labelledby="studio-title"
      >
        <div className="studio-copy">
          <p className="eyebrow">چاپ اختصاصی</p>
          <h2 id="studio-title">
            طرحِ خودت،
            <br />
            <span>روی لباسِ خودت.</span>
          </h2>
          <p>
            طرح را بارگذاری کن، جای چاپ را تنظیم کن و نتیجه را روی محصول ببین.
          </p>
          <div className="studio-actions">
            <Link className="button primary" href="/custom">
              ساخت با طرح خودت <span aria-hidden="true">↙</span>
            </Link>
            <Link className="text-link" href="/sticker-studio">
              چیدن استیکرها ←
            </Link>
          </div>
          <p className="studio-fine-print">
            پیش‌نمایش تقریبی است؛ سفارش‌ها فعلاً آزمایشی‌اند.
          </p>
        </div>
        <div className="studio-art-plate" aria-hidden="true"><GothicFrame /><BotanicalSeal /><span>کُنج</span><small dir="ltr">ART / FABRIC / EVERYDAY</small></div>
      </section>
      <section className="section shell">
        <div className="section-heading">
          <GothicDivider />
          <div>
            <p className="eyebrow">چند طرح، یک حال‌وهوا</p>
            <h2>مجموعه‌ها</h2>
          </div>
          <span className="section-index" dir="ltr">
            II / COLLECTIONS
          </span>
        </div>
        <div className="collection-grid">
          {collections.map((collection, index) => (
            <Link
              className={`collection-card collection-${index % 3}`}
              key={collection.id}
              href={`/collections/${collection.id}`}
            >
              <span className="eyebrow">
                مجموعه نمونه / {formatNumber(index + 1).padStart(2, "۰")}
              </span>
              <BotanicalSeal className="collection-engraving" />
              <h3>
                {collection.label}
                <span aria-hidden="true">↖</span>
              </h3>
              <p>
                {
                  [
                    "تیشرت، هودی و اشیا با طرح‌های آفلاین.",
                    "طرح‌های موسیقی و نویز؛ روی پوشاک و وسایل روزمره.",
                    "طرح‌های تصویری و استیکرهای مجموعه.",
                  ][index % 3]
                }
              </p>
            </Link>
          ))}
        </div>
      </section>
      <section className="shell closing-note">
        <GothicDivider />
        <BotanicalSeal />
        <div>
          <p className="eyebrow">چاپ اختصاصی</p>
          <h2>از طرح تا محصول.</h2>
          <p>
            از محصولات آماده انتخاب کن یا فایل خودت را برای چاپ آماده کن.
          </p>
        </div>
        <Link className="button outline" href="/custom">
          ساختن طرح خودت ↙
        </Link>
      </section>
    </main>
  );
}
