import { Loader2 } from "lucide-react";

export function PageLoader({ label = "Carregando…" }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-[50dvh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}
