import type { Metadata } from "next";
import { Suspense } from "react";
import { MenuEditor } from "@/components/menu/menu-editor";

export const metadata: Metadata = { title: "Cardápio" };

export default function MenuPage() {
  return (
    <Suspense>
      <MenuEditor />
    </Suspense>
  );
}
