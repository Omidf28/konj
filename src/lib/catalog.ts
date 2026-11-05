export const store = {
  name: "کُنج",
  tagline: "برای سلیقه‌هایی که توی قفسه جا نمی‌شن.",
  notice:
    "نسخه در حال ساخت · تمام محصولات، قیمت‌ها و زمان‌ها نمونه‌اند؛ سفارش فقط آزمایشی است.",
  currency: "IRT" as const,
};
export const categories = [
  { id: "tshirt", label: "تیشرت", description: "یه حرف، بدون حرف زدن" },
  { id: "hoodie", label: "هودی", description: "پناهگاه شخصی تو" },
  { id: "mug", label: "ماگ", description: "رفیق شیفت شب" },
  { id: "sticker", label: "استیکر تکی", description: "کوچیک، ولی پر سر و صدا" },
  { id: "pack", label: "پک استیکر", description: "چند تکه از دنیای تو" },
] as const;
export type Category = string;
export type Availability = "ready" | "made-to-order" | "unavailable";
export const availabilityLabels: Record<Availability, string> = {
  ready: "آماده ارسال",
  "made-to-order": "تولید پس از سفارش",
  unavailable: "ناموجود",
};
export const collections = [
  { id: "offline", label: "آفلاین کلاب" },
  { id: "noise", label: "نویزِ شخصی" },
  { id: "internet", label: "از ته اینترنت" },
] as const;
export const bases = [
  {
    id: "tee-01",
    category: "tshirt",
    name: "تیشرت پایه ۰۱",
    material: "پنبه؛ مشخصات نمونه",
    sizes: ["S", "M", "L", "XL", "XXL"],
    printArea: { widthCm: 28, heightCm: 35 },
  },
  {
    id: "hood-01",
    category: "hoodie",
    name: "هودی پایه ۰۱",
    material: "دورس؛ مشخصات نمونه",
    sizes: ["S", "M", "L", "XL", "XXL"],
    printArea: { widthCm: 28, heightCm: 35 },
  },
  {
    id: "mug-01",
    category: "mug",
    name: "ماگ پایه ۰۱",
    material: "سرامیک؛ ظرفیت نمونه ۳۳۰ میلی‌لیتر",
    sizes: [],
    printArea: { widthCm: 20, heightCm: 9 },
  },
  {
    id: "sticker-01",
    category: "sticker",
    name: "استیکر پایه ۰۱",
    material: "وینیل؛ مشخصات نمونه",
    sizes: [],
    printArea: null,
  },
  {
    id: "pack-01",
    category: "pack",
    name: "پک ثابت پایه ۰۱",
    material: "وینیل؛ مشخصات نمونه",
    sizes: [],
    printArea: null,
  },
] as const;
export const designs = [
  { id: "offline", title: "آفلاین", motif: "offline" },
  { id: "noise", title: "نویز", motif: "noise" },
  { id: "fine", title: "همه‌چی عادیه", motif: "fine" },
  { id: "cat", title: "گربه شب‌زنده‌دار", motif: "cat" },
] as const;
export type Motif = (typeof designs)[number]["motif"];
export interface Product {
  revision?: number;
  customOnly?: boolean;
  id: string;
  name: string;
  category: Category;
  baseId: string;
  designId: string;
  collection: string;
  description: string;
  priceToman: number;
  availability: Availability;
  preparationDays: number;
  motif: Motif;
  colors: { name: string; hex: string }[];
  variants: {
    sku: string;
    color: string;
    size: string | null;
    stock: number;
    enabled?: boolean;
    priceDeltaToman?: number;
    dimensionsCm?: { width: number; height: number };
  }[];
  printPlacement?: {
    widthCm: number;
    heightCm: number;
    xCm: number;
    yCm: number;
    side?: "front" | "back";
  };
  images?: string[];
  imageUrl?: string;
  dimensionsCm?: { width: number; height: number };
  packItems?: { productId: string; quantity: number }[];
}
const black = { name: "مشکی", hex: "#232426" };
const cream = { name: "شیری", hex: "#e7e1d2" };
const green = { name: "سبز زیتونی", hex: "#737b59" };
function apparel(
  id: string,
  name: string,
  category: "tshirt" | "hoodie",
  motif: Motif,
  collection: string,
  priceToman: number,
  availability: Availability,
): Product {
  const colors = [black, cream, green];
  return {
    id,
    name,
    category,
    baseId: category === "tshirt" ? "tee-01" : "hood-01",
    designId: motif,
    collection,
    description:
      "طرح مستقل نمونه؛ جنس، برش و روش چاپ پس از انتخاب تأمین‌کننده نهایی می‌شوند.",
    priceToman,
    availability,
    preparationDays: availability === "ready" ? 2 : 7,
    motif,
    colors,
    variants: colors.flatMap((color, c) =>
      ["S", "M", "L", "XL", "XXL"].map((size, s) => ({
        sku: `${id}-${c}-${s}`,
        color: color.name,
        size,
        stock: availability === "ready" ? 4 : 0,
      })),
    ),
  };
}
export const products: Product[] = [
  apparel(
    "tee-offline",
    "تیشرت «فعلاً آفلاینم»",
    "tshirt",
    "offline",
    "offline",
    590000,
    "ready",
  ),
  apparel(
    "tee-noise",
    "تیشرت «نویزِ شخصی»",
    "tshirt",
    "noise",
    "noise",
    620000,
    "made-to-order",
  ),
  apparel(
    "hood-cat",
    "هودی «شیفت شب»",
    "hoodie",
    "cat",
    "offline",
    1290000,
    "made-to-order",
  ),
  {
    id: "mug-fine",
    name: "ماگ «همه‌چی عادیه»",
    category: "mug",
    baseId: "mug-01",
    designId: "fine",
    collection: "internet",
    description: "ظرفیت نمونه ۳۳۰ میلی‌لیتر؛ مشخصات نهایی قابل تغییر است.",
    priceToman: 320000,
    availability: "ready",
    preparationDays: 2,
    motif: "fine",
    colors: [cream],
    variants: [{ sku: "mug-fine-cream", color: "شیری", size: null, stock: 8 }],
  },
  {
    id: "sticker-cat",
    name: "استیکر «گربه اینترنت»",
    category: "sticker",
    baseId: "sticker-01",
    designId: "cat",
    collection: "internet",
    description:
      "ابعاد فیزیکی نمونه شامل حاشیه نهایی؛ مستقل از تعداد پیکسل تصویر.",
    priceToman: 45000,
    availability: "ready",
    preparationDays: 2,
    motif: "cat",
    colors: [],
    variants: [
      {
        sku: "sticker-cat-8x6",
        color: "چاپ رنگی",
        size: "۸ × ۶ سانتی‌متر",
        stock: 20,
      },
    ],
    dimensionsCm: { width: 8, height: 6 },
  },
  {
    id: "sticker-offline",
    name: "استیکر «بعداً جواب می‌دم»",
    category: "sticker",
    baseId: "sticker-01",
    designId: "offline",
    collection: "offline",
    description: "ابعاد فیزیکی نمونه؛ مشخصات جنس و برش نهایی نشده است.",
    priceToman: 39000,
    availability: "ready",
    preparationDays: 2,
    motif: "offline",
    colors: [],
    variants: [
      {
        sku: "sticker-offline-7x5",
        color: "چاپ رنگی",
        size: "۷ × ۵ سانتی‌متر",
        stock: 15,
      },
    ],
    dimensionsCm: { width: 7, height: 5 },
  },
  {
    id: "pack-internet",
    name: "پک «از ته اینترنت»",
    category: "pack",
    baseId: "pack-01",
    designId: "cat",
    collection: "internet",
    description:
      "پک ثابت نمونه: دو استیکر گربه اینترنت و یک استیکر بعداً جواب می‌دم.",
    priceToman: 119000,
    availability: "made-to-order",
    preparationDays: 5,
    motif: "cat",
    colors: [],
    variants: [
      { sku: "pack-internet-3", color: "چاپ رنگی", size: "۳ عدد", stock: 0 },
    ],
    packItems: [
      { productId: "sticker-cat", quantity: 2 },
      { productId: "sticker-offline", quantity: 1 },
    ],
  },
  apparel(
    "hood-noise",
    "هودی «حجم صدا رو ببر بالا»",
    "hoodie",
    "noise",
    "noise",
    1390000,
    "unavailable",
  ),
];
