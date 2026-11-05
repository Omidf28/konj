import test from "node:test";
import assert from "node:assert/strict";
import { products, type Product } from "../src/lib/catalog.ts";
import {
  filterProducts,
  catalogVariantSelection,
  type Filters,
} from "../src/lib/filter.ts";
import {
  initialProductVariant,
  startingPrice,
} from "../src/lib/product-price.ts";
const sample: Product = {
  ...products[0],
  priceToman: 500000,
  availability: "ready",
  variants: [
    {
      sku: "small-black",
      color: "مشکی",
      size: "S",
      stock: 4,
      priceDeltaToman: 0,
    },
    {
      sku: "large-cream",
      color: "شیری",
      size: "L",
      stock: 3,
      priceDeltaToman: 200000,
    },
    {
      sku: "disabled-cheap",
      color: "شیری",
      size: "L",
      stock: 2,
      enabled: false,
      priceDeltaToman: -100000,
    },
    {
      sku: "sold-out",
      color: "مشکی",
      size: "M",
      stock: 0,
      priceDeltaToman: -200000,
    },
  ],
};
const filters: Filters = {
  q: "",
  category: "",
  collection: "",
  status: "",
  sort: "price-asc",
  min: "۶۵۰٬۰۰۰",
  max: "۷۵۰٬۰۰۰",
  color: "شیری",
  size: "L",
};
test("filtered card and product selection use the same matching SKU rather than an unrelated cheaper variant", () => {
  assert.equal(startingPrice(sample), 500000);
  assert.equal(filterProducts([sample], filters).length, 1);
  const selected = catalogVariantSelection(sample, filters)!;
  assert.deepEqual(selected, {
    sku: "large-cream",
    color: "شیری",
    size: "L",
    priceToman: 700000,
  });
  assert.equal(initialProductVariant(sample, selected.sku)?.sku, "large-cream");
  assert.equal(
    catalogVariantSelection(sample, { ...filters, max: "۶۰۰۰۰۰" }),
    undefined,
  );
});
test("catalog sorting agrees with displayed matching prices when global starting prices have another order", () => {
  const other = {
    ...sample,
    id: "other",
    priceToman: 600000,
    variants: [{ sku: "other-L", color: "شیری", size: "L", stock: 2 }],
  };
  const result = filterProducts([sample, other], {
    ...filters,
    min: "",
    max: "",
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["other", sample.id],
  );
  assert.deepEqual(
    result.map(
      (p) =>
        catalogVariantSelection(p, { ...filters, min: "", max: "" })
          ?.priceToman,
    ),
    [600000, 700000],
  );
});
test("default selection uses cheapest sellable option; explicit sold-out choices stay visible and disabled/foreign choices fall back", () => {
  assert.equal(initialProductVariant(sample)?.sku, "small-black");
  assert.equal(initialProductVariant(sample, "sold-out")?.sku, "sold-out");
  assert.equal(
    initialProductVariant(sample, "disabled-cheap")?.sku,
    "small-black",
  );
  assert.equal(initialProductVariant(sample, "foreign")?.sku, "small-black");
  assert.equal(
    initialProductVariant({
      ...sample,
      variants: sample.variants.map((v) => ({ ...v, enabled: false })),
    }),
    undefined,
  );
  assert.equal(
    initialProductVariant({ ...sample, availability: "made-to-order" })?.sku,
    "sold-out",
  );
});
test("variant matching never mutates product data and malformed price filters produce no selection", () => {
  const before = JSON.stringify(sample);
  catalogVariantSelection(sample, filters);
  initialProductVariant(sample);
  assert.equal(JSON.stringify(sample), before);
  for (const min of ["-1", "NaN", "9e5"]) {
    assert.equal(
      catalogVariantSelection(sample, { ...filters, min }),
      undefined,
    );
  }
});
