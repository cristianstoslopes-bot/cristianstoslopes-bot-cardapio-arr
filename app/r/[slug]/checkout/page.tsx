import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRestaurantBySlug } from "@/lib/public-data";
import { CheckoutForm } from "@/components/public/checkout-form";

export const metadata: Metadata = { title: "Finalizar pedido", robots: { index: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const restaurant = await getRestaurantBySlug((await params).slug);
  if (!restaurant) notFound();
  return <CheckoutForm restaurant={restaurant} />;
}
