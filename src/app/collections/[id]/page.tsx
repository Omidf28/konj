import { notFound } from "next/navigation";
import CatalogPage from "../../products/page";
import { getContent } from "@/server/db";
type PageParams = { params: Promise<{ id: string }> };

function findCollection(id: string) {
  return getContent<{ id: string; label: string; description?: string }>(
    "collections",
  ).find((item) => item.id === id);
}

export async function generateMetadata({ params }: PageParams) {
  const entry = findCollection((await params).id);
  if (!entry) notFound();
  return {
    title: entry.label,
    description: entry.description?.trim() || `محصولات مجموعه ${entry.label} در ویترین کُنج.`,
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const collection = findCollection(id);
  if (!collection) notFound();
  return (
    <CatalogPage
      searchParams={Promise.resolve({
        ...(await searchParams),
        collection: id,
      })}
      heading={collection.label}
    />
  );
}
