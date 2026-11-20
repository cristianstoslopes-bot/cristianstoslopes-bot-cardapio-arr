import { notFound } from "next/navigation";
import { getPublicMenu, getPublicTable, getRestaurantBySlug } from "@/lib/public-data";
import { PublicMenu } from "@/components/public/public-menu";

/** Destino do QR Code da mesa: cardápio já vinculado à mesa (pedido "dine_in"). */
export default async function TableMenuPage({ params }: { params: Promise<{ slug: string; tableId: string }> }) {
  const { slug, tableId } = await params;
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant || !/^[0-9a-f-]{36}$/i.test(tableId)) notFound();

  const [table, { categories, products }] = await Promise.all([getPublicTable(restaurant.id, tableId), getPublicMenu(restaurant.id)]);
  if (!table) notFound();
  return <PublicMenu restaurant={restaurant} categories={categories} products={products} table={table} />;
}
