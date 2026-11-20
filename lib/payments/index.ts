import "server-only";
import { mercadoPagoProvider } from "./mercadopago";
import { stripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

export function getPaymentProvider(): PaymentProvider {
  return process.env.PAYMENT_PROVIDER === "mercadopago" ? mercadoPagoProvider : stripeProvider;
}
