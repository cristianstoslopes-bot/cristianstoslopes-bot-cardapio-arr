import type { Metadata } from "next";
import { connection } from "next/server";
import { TablesManager } from "@/components/dashboard/tables-manager";

export const metadata: Metadata = { title: "Mesas e QR Codes" };

export default async function TablesPage() {
  await connection();
  return <TablesManager siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"} />;
}
