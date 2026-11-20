import type { Metadata, Viewport } from "next";
import { Geist, Fraunces } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: { default: "Cardápio AR — Cardápio digital com Realidade Aumentada", template: "%s · Cardápio AR" },
  description: "Cardápio digital para hamburguerias e pizzarias com pratos em 3D e Realidade Aumentada, pedidos em tempo real e QR Code nas mesas.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#243B32",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${geist.variable} ${fraunces.variable}`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
