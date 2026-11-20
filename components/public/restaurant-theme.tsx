import type { RestaurantTheme } from "@/lib/types";

/** Escolhe texto claro/escuro com base na luminância relativa (WCAG) da cor de fundo. */
export function readableOn(hex: string) {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "#ffffff";
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.4 ? "#1c1c1a" : "#ffffff";
}

const HEX = /^#[0-9a-f]{6}$/i;
const safe = (v: string | undefined, fallback: string) => (v && HEX.test(v) ? v : fallback);

/**
 * Injeta o tema do restaurante como CSS variables, sobrescrevendo a paleta padrão.
 * Todos os componentes (Tailwind: bg-primary, text-accent...) passam a usar as cores do tenant.
 * Cores são validadas (#RRGGBB) para evitar injeção de CSS.
 */
export function RestaurantThemeStyle({ theme }: { theme: Partial<RestaurantTheme> }) {
  const primary = safe(theme.primary, "#243B32");
  const accent = safe(theme.accent, "#D88B48");
  const secondary = safe(theme.secondary, "#F4EBDD");
  const background = safe(theme.background, "#FFFDF9");
  const foreground = safe(theme.foreground, "#1C1C1A");
  const css = `:root{
--primary:${primary};--primary-foreground:${readableOn(primary)};
--accent:${accent};--accent-foreground:${readableOn(accent)};
--secondary:${secondary};--secondary-foreground:${readableOn(secondary)};
--background:${background};--foreground:${foreground};
--card:color-mix(in oklab, ${background} 92%, white);--card-foreground:${foreground};
--muted:color-mix(in oklab, ${foreground} 6%, ${background});
--muted-foreground:color-mix(in oklab, ${foreground} 68%, ${background});
--border:color-mix(in oklab, ${foreground} 13%, ${background});
--input:color-mix(in oklab, ${foreground} 20%, ${background});
--ring:${accent};}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
