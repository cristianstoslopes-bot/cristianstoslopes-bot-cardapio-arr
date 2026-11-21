"use client";

/**
 * <ProductViewer /> — orquestra a experiência 3D/AR do produto.
 *
 * Fluxo:
 *  1. Lazy: nada de Three.js/model-viewer é baixado até este componente montar
 *     (ele só monta quando o cliente toca "Ver em 3D").
 *  2. useARSupport() detecta WebXR / Quick Look / Scene Viewer.
 *  3. Com AR → <model-viewer> (3D inline + botão "Ver na minha mesa").
 *     Sem AR → <Canvas> R3F com OrbitControls (girar/zoom) — mesmo GLB, mesma escala.
 *  4. Overlay com nome, preço, alérgenos e CTA "Adicionar".
 *  5. Telemetria: model_view_3d e ar_session_start (funil 3D → pedido no dashboard).
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef } from "react";
import { Box, Smartphone } from "lucide-react";
import { useARSupport } from "@/hooks/use-ar-support";
import { track } from "@/lib/analytics";
import { BUCKETS, publicUrl } from "@/lib/storage";
import { formatCurrency } from "@/lib/utils";
import type { Model3D } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ARModelViewer = dynamic(() => import("./ar-model-viewer"), { ssr: false });
const ModelCanvas = dynamic(() => import("./model-canvas"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-muted" aria-busy="true" />,
});

interface ProductViewerProps {
  model: Model3D;
  product: { id: string; name: string; price_cents: number; description?: string | null; allergens?: string[] };
  restaurantId: string;
  tableId?: string | null;
  currency?: string;
  onAddToCart?: () => void;
  showOverlay?: boolean;
  /** Botão "Adicionar" sobre o 3D (útil na sessão AR). Desligue quando a tela já tem um. */
  showAddButton?: boolean;
  className?: string;
}

export function ProductViewer({
  model, product, restaurantId, tableId, currency = "BRL", onAddToCart, showOverlay = true, showAddButton = true, className,
}: ProductViewerProps) {
  const support = useARSupport();
  const tracked = useRef(false);

  const glbUrl = publicUrl(BUCKETS.models, model.glb_path)!;
  const usdzUrl = publicUrl(BUCKETS.models, model.usdz_path);
  const posterUrl = publicUrl(BUCKETS.models, model.poster_path);
  const realSize = Number(model.real_size_m) || 0.15;
  const price = formatCurrency(product.price_cents, currency);

  const handleLoad = useCallback(() => {
    if (tracked.current) return;
    tracked.current = true;
    track("model_view_3d", { restaurantId, productId: product.id, tableId, metadata: { mode: support } });
  }, [restaurantId, product.id, tableId, support]);

  const handleARStart = useCallback(() => {
    track("ar_session_start", { restaurantId, productId: product.id, tableId, metadata: { mode: support } });
  }, [restaurantId, product.id, tableId, support]);

  const overlay = showOverlay && (
    <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
      <div className="pointer-events-auto max-w-[70%] rounded-xl bg-background/85 px-3 py-2 shadow backdrop-blur">
        <p className="text-sm font-semibold leading-tight">{product.name}</p>
        <p className="text-sm font-bold text-accent">{price}</p>
        {!!product.allergens?.length && (
          <p className="mt-1 text-[11px] text-muted-foreground">Contém: {product.allergens.join(", ")}</p>
        )}
      </div>
      {onAddToCart && showAddButton && (
        <Button size="sm" className="pointer-events-auto shadow" onClick={onAddToCart}>
          Adicionar
        </Button>
      )}
    </div>
  );

  const hasAR = support === "webxr" || support === "quick-look" || support === "scene-viewer";

  return (
    <div className={className}>
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-b from-secondary to-background">
        {support === "checking" ? (
          <div className="size-full animate-pulse bg-muted" aria-busy="true" />
        ) : hasAR ? (
          <ARModelViewer
            src={glbUrl}
            iosSrc={usdzUrl}
            poster={posterUrl}
            alt={`Modelo 3D de ${product.name}`}
            realSizeM={realSize}
            dimensions={model.dimensions}
            quickLookTitle={product.name}
            quickLookPrice={price}
            onLoad={handleLoad}
            onARStart={handleARStart}
            onQuickLookAction={onAddToCart}
          >
            {overlay}
          </ARModelViewer>
        ) : (
          <>
            <ModelCanvas url={glbUrl} realSizeM={realSize} />
            {overlay}
            <ModelLoadTracker onReady={handleLoad} />
          </>
        )}
      </div>

      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        {hasAR ? (
          <Badge variant="accent">
            <Smartphone className="size-3" /> AR disponível — toque em &quot;Ver na minha mesa&quot;
          </Badge>
        ) : support !== "checking" ? (
          <span className="inline-flex items-center gap-1">
            <Box className="size-3.5" /> Arraste para girar · pinça/scroll para zoom
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** No fallback R3F, conta a visualização quando o canvas monta. */
function ModelLoadTracker({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}
