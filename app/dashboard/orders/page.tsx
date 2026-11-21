import type { Metadata } from "next";
import { connection } from "next/server";
import { KitchenBoard } from "@/components/dashboard/kitchen-board";

export const metadata: Metadata = { title: "Pedidos" };

export default async function Page() {
  // Painel é sempre por requisição (sessão + relógio); evita pré-render estático.
  await connection();
  return <KitchenBoard />;
}
