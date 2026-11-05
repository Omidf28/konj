import { StickerStudio } from "@/components/sticker-studio";
import { getProducts } from "@/server/db";
export default function StudioPage() {
  return (
    <main id="main" className="shell guide-page">
      <h1>استودیوی استیکر</h1>
      <StickerStudio
        products={getProducts().filter(
          (product) => product.category === "sticker",
        )}
      />
    </main>
  );
}
