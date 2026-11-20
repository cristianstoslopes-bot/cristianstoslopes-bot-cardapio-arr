import type { Metadata } from "next";
import { KitchenBoard } from "@/components/dashboard/kitchen-board";

export const metadata: Metadata = { title: "Pedidos" };

export default function OrdersPage() {
  return <KitchenBoard />;
}
