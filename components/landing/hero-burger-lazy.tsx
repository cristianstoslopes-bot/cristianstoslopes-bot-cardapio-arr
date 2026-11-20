"use client";
import dynamic from "next/dynamic";

// Lazy + sem SSR: Three.js não entra no bundle inicial da landing.
export const HeroBurgerLazy = dynamic(() => import("./hero-burger"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse rounded-full bg-brand-caramel/20" aria-hidden />,
});
