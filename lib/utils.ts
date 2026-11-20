import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Valores monetários trafegam SEMPRE em centavos (integer). */
export function formatCurrency(cents: number, currency = "BRL", locale = "pt-BR") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format((cents ?? 0) / 100);
}

/** "12,50" | "12.50" → 1250 */
export function parseCurrencyToCents(value: string): number {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function formatPhone(digits: string) {
  const d = digits.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{0,4})(\d{0,4})/, (_, a, b, c) => [a && `(${a}`, a && ") ", b, c && `-${c}`].filter(Boolean).join(""));
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

/** Converte mensagens do Postgres (RAISE) em texto amigável. */
export function friendlyDbError(message?: string | null): string {
  if (!message) return "Algo deu errado. Tente novamente.";
  if (message.startsWith("PLAN_FEATURE_REQUIRED")) return "Este recurso exige um plano superior. Faça upgrade em Configurações → Assinatura.";
  if (message.startsWith("PLAN_LIMIT_REACHED")) return "Você atingiu o limite do seu plano. Faça upgrade para continuar.";
  if (message.includes("row-level security")) return "Você não tem permissão para esta ação.";
  if (message.includes("duplicate key") && message.includes("slug")) return "Este endereço (slug) já está em uso.";
  if (message.includes("duplicate key")) return "Já existe um registro com estes dados.";
  return message;
}
