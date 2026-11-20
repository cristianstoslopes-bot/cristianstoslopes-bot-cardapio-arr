import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRestaurantBySlug } from "@/lib/public-data";
import { CartProvider } from "@/contexts/cart-context";
import { RestaurantThemeStyle } from "@/components/public/restaurant-theme";
import { PageLoader } from "@/components/ui/page-loader";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const r = await getRestaurantBySlug((await params).slug);
  if (!r) return { title: "Cardápio não encontrado" };
  return {
    title: { absolute: `${r.name} — Cardápio` },
    description: r.description ?? `Peça online no ${r.name}. Veja os pratos em 3D e Realidade Aumentada.`,
    openGraph: { images: r.cover_url ? [r.cover_url] : undefined },
  };
}

async function RestaurantShell({ params, children }: { params: Params; children: React.ReactNode }) {
  const restaurant = await getRestaurantBySlug((await params).slug);
  if (!restaurant) notFound();
  return (
    <CartProvider restaurantId={restaurant.id}>
      <RestaurantThemeStyle theme={restaurant.theme} />
      <div className="min-h-dvh bg-background pb-28 text-foreground">{children}</div>
    </CartProvider>
  );
}

export default function PublicRestaurantLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  return (
    <Suspense fallback={<PageLoader label="Carregando cardápio…" />}>
      <RestaurantShell params={params}>{children}</RestaurantShell>
    </Suspense>
  );
}
