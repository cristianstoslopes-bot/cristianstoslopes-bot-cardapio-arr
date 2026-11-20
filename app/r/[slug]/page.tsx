import { notFound } from "next/navigation";
import { getPublicMenu, getRestaurantBySlug } from "@/lib/public-data";
import { PublicMenu } from "@/components/public/public-menu";

export default async function PublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const restaurant = await getRestaurantBySlug((await params).slug);
  if (!restaurant) notFound();
  const { categories, products } = await getPublicMenu(restaurant.id);
  return <PublicMenu restaurant={restaurant} categories={categories} products={products} />;
}
