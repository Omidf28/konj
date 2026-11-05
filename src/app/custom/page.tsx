import { CustomEditor } from "@/components/custom-editor";
import { getProduct, getProducts, getContent, settings } from "@/server/db";
import type { BaseModel } from "@/lib/base-model";
export default async function CustomPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; edit?: string }>;
}) {
  const query = await searchParams;
  const requested =
    typeof query.product === "string"
      ? getProduct(query.product.slice(0, 100))
      : undefined;
  const bases = getContent<BaseModel>("bases");
  return (
    <main id="main" className="shell guide-page">
      <h1>طرح خودت، محصول خودت</h1>
      <CustomEditor
        key={JSON.stringify([
          typeof query.product === "string" ? query.product.slice(0, 100) : "",
          typeof query.edit === "string" ? query.edit.slice(0, 256) : "",
        ])}
        products={getProducts({ includeCustom: true })
          .filter(
            (p) =>
              p.customOnly &&
              bases.find((b) => b.id === p.baseId)?.customEnabled,
          )
          .map((product) => ({
            ...product,
            variants: product.variants.filter(
              (variant) => variant.enabled !== false,
            ),
          }))
          .filter((product) => product.variants.length > 0)
          .sort(
            (a, b) =>
              Number(
                b.id === query.product ||
                  (!!requested &&
                    !requested.customOnly &&
                    b.baseId === requested.baseId),
              ) -
              Number(
                a.id === query.product ||
                  (!!requested &&
                    !requested.customOnly &&
                    a.baseId === requested.baseId),
              ),
          )}
        bases={bases}
        config={settings()}
      />
    </main>
  );
}
