import { notFound } from "next/navigation";
import CatalogPage from "../../products/page";
import { getContent } from "@/server/db";
type PageParams = { params: Promise<{ id: string }> };

function findCategory(id: string) {
  return getContent<{ id: string; label: string; description?: string }>("categories").find(
    (item) => item.id === id,
  );
}

export async function generateMetadata({ params }: PageParams) {
  const entry = findCategory((await params).id);
  if (!entry) notFound();
  return {
    title: entry.label,
    description: entry.description?.trim() || `محصولات دسته ${entry.label} در ویترین کُنج.`,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const category = findCategory(id);
  if (!category) notFound();
  return (
    <CatalogPage
      searchParams={Promise.resolve({ ...(await searchParams), category: id })}
      heading={category.label}
    />
  );
}
