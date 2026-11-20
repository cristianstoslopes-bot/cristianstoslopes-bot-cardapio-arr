"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, ExternalLink, LayoutDashboard, LogOut, Menu, QrCode, Receipt, Settings, UtensilsCrossed, Users,
} from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { useRestaurant } from "@/contexts/restaurant-context";
import { useSubscription } from "@/hooks/use-subscription";
import { OrdersRealtimeProvider, useOrdersRealtime } from "@/hooks/use-realtime-orders";
import type { MemberRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const NAV: { href: string; label: string; icon: React.ElementType; roles?: MemberRole[] }[] = [
  { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard, roles: ["owner", "manager", "staff"] },
  { href: "/dashboard/menu", label: "Cardápio", icon: UtensilsCrossed, roles: ["owner", "manager"] },
  { href: "/dashboard/orders", label: "Pedidos", icon: Receipt },
  { href: "/dashboard/tables", label: "Mesas", icon: QrCode, roles: ["owner", "manager"] },
  { href: "/dashboard/customers", label: "Clientes", icon: Users, roles: ["owner", "manager", "staff"] },
  { href: "/dashboard/reports", label: "Relatórios", icon: BarChart3, roles: ["owner", "manager"] },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings, roles: ["owner", "manager"] },
];

function NavLinks({ onNavigate, pendingCount }: { onNavigate?: () => void; pendingCount: number }) {
  const pathname = usePathname();
  const { role } = useRestaurant();
  return (
    <nav aria-label="Menu do painel" className="grid gap-1">
      {NAV.filter((i) => !i.roles || i.roles.includes(role)).map(({ href, label, icon: Icon }) => {
        const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-brand-cream text-brand-forest" : "text-brand-cream/80 hover:bg-white/10 hover:text-brand-cream",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            {href === "/dashboard/orders" && pendingCount > 0 && (
              <span className="ml-auto rounded-full bg-brand-caramel px-2 text-xs font-bold text-brand-charcoal" aria-label={`${pendingCount} pedidos novos`}>
                {pendingCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ userEmail, onNavigate, pendingCount }: { userEmail: string; onNavigate?: () => void; pendingCount: number }) {
  const { restaurant, plan } = useRestaurant();
  const { trialDaysLeft } = useSubscription();
  return (
    <div className="flex h-full flex-col gap-6 bg-brand-forest p-4 text-brand-cream">
      <div className="px-2 pt-2">
        <p className="font-display text-xl font-bold">
          Cardápio<span className="text-brand-caramel">AR</span>
        </p>
        <p className="mt-3 truncate text-sm font-semibold">{restaurant.name}</p>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="accent">{plan?.name ?? "Sem plano"}</Badge>
          {trialDaysLeft !== null && <span className="text-xs opacity-80">trial: {trialDaysLeft}d</span>}
        </div>
      </div>
      <NavLinks onNavigate={onNavigate} pendingCount={pendingCount} />
      <div className="mt-auto grid gap-2 border-t border-white/10 pt-4">
        <a
          href={`/r/${restaurant.slug}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-cream/80 hover:bg-white/10"
        >
          <ExternalLink className="size-4" aria-hidden /> Ver cardápio público
        </a>
        <p className="truncate px-3 text-xs opacity-60">{userEmail}</p>
        <form action={signOut}>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-cream/80 hover:bg-white/10">
            <LogOut className="size-4" aria-hidden /> Sair
          </button>
        </form>
      </div>
    </div>
  );
}

export function DashboardShell({ userEmail, children }: { userEmail: string; children: React.ReactNode }) {
  const { restaurant } = useRestaurant();
  // Assinatura Realtime global do painel: toca som + toast em QUALQUER página quando chega pedido.
  return (
    <OrdersRealtimeProvider restaurantId={restaurant.id}>
      <ShellLayout userEmail={userEmail}>{children}</ShellLayout>
    </OrdersRealtimeProvider>
  );
}

function ShellLayout({ userEmail, children }: { userEmail: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { restaurant } = useRestaurant();
  const { pendingCount } = useOrdersRealtime();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-background focus:p-2">
        Pular para o conteúdo
      </a>
      <aside className="sticky top-0 hidden h-dvh lg:block">
        <SidebarBody userEmail={userEmail} pendingCount={pendingCount} />
      </aside>

      <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SidebarBody userEmail={userEmail} onNavigate={() => setOpen(false)} pendingCount={pendingCount} />
          </SheetContent>
        </Sheet>
        <span className="truncate font-semibold">{restaurant.name}</span>
        {pendingCount > 0 && <Badge variant="accent" className="ml-auto">{pendingCount} novos</Badge>}
      </header>

      <main id="main" className="min-w-0 p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
