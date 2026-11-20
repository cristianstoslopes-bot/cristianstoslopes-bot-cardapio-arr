import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-forest p-10 text-brand-cream lg:flex">
        <Link href="/" className="font-display text-2xl font-bold">
          Cardápio<span className="text-brand-caramel">AR</span>
        </Link>
        <blockquote className="max-w-md font-display text-3xl leading-snug">
          “Quando o cliente vê o hambúrguer em tamanho real na mesa, ele pede o combo.”
        </blockquote>
        <p className="text-sm opacity-70">Cardápio digital com Realidade Aumentada</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </main>
  );
}
