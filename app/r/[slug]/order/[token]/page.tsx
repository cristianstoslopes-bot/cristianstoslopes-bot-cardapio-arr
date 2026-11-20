import type { Metadata } from "next";
import { OrderTracker } from "@/components/public/order-tracker";

export const metadata: Metadata = { title: "Acompanhe seu pedido", robots: { index: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ payment?: string }> };

// Renderizado dentro do <Suspense> do layout /r/[slug]
export default async function OrderPage({ params, searchParams }: Props) {
  const [{ token }, { payment }] = await Promise.all([params, searchParams]);
  return <OrderTracker token={token} paymentReturn={payment} />;
}
