import type { Plan } from "@/lib/types";

/**
 * Contrato comum de provedores de pagamento. Trocar Stripe ↔ Mercado Pago
 * é só mudar PAYMENT_PROVIDER — rotas e UI não mudam.
 */
export interface PaymentProvider {
  readonly name: "stripe" | "mercadopago";

  /** Assinatura SaaS do restaurante (plano Starter/Pro/Premium). */
  createSubscriptionCheckout(input: {
    restaurantId: string;
    plan: Plan;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;

  /** Pagamento online de um pedido do cliente final (valor já calculado no banco). */
  createOrderCheckout(input: {
    order: { id: string; number: number; total_cents: number; restaurant_name: string; customer_email?: string | null };
    successUrl: string;
    cancelUrl: string;
    notificationUrl: string;
  }): Promise<{ url: string; externalId: string }>;
}
