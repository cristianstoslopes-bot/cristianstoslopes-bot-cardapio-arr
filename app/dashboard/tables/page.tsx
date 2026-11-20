import type { Metadata } from "next";
import { TablesManager } from "@/components/dashboard/tables-manager";

export const metadata: Metadata = { title: "Mesas e QR Codes" };

export default function TablesPage() {
  return <TablesManager siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"} />;
}
