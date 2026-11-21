import type { Metadata } from "next";
import { connection } from "next/server";
import { MenuEditor } from "@/components/menu/menu-editor";

export const metadata: Metadata = { title: "Cardápio" };

export default async function Page() {
  // Painel é sempre por requisição (sessão + relógio); evita pré-render estático.
  await connection();
  return <MenuEditor />;
}
