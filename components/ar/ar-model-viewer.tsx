"use client";

/**
 * Caminho AR com <model-viewer> (Google). Um único elemento cobre:
 *   - WebXR immersive-ar (Chrome Android/ARCore) com hit-test e sombra no chão
 *   - Scene Viewer (Android sem WebXR)
 *   - AR Quick Look (iOS/ARKit) — USDZ próprio OU gerado em tempo real a partir do GLB
 * É GEOMETRIA 3D REAL ancorada no ambiente, não uma imagem 2D sobre a câmera.
 *
 * Escala real: scale = real_size_m / maior dimensão do GLB. Com ar-scale="fixed" o
 * cliente não consegue "esticar" o prato → o hambúrguer aparece do tamanho real na mesa.
 *
 * IMPORTANTE: a escala é aplicada na CRIAÇÃO do elemento. Alterar `scale` depois do
 * load dispara arRenderer.onUpdateScene() fora de uma sessão AR e lança erro dentro
 * do model-viewer. Por isso:
 *   - dimensões conhecidas (medidas no upload) → escala desde o início;
 *   - desconhecidas → 1º load invisível só para medir, depois o elemento é recriado
 *     (key muda) já com a escala; o GLB vem do cache HTTP.
 */
import { useEffect, useRef, useState } from "react";
import type { ModelViewerElement } from "@/types/model-viewer";
import { scaleFor } from "@/lib/model-dimensions";

interface Props {
  src: string;
  iosSrc?: string | null;
  poster?: string | null;
  alt: string;
  realSizeM: number;
  dimensions?: { x: number; y: number; z: number } | null;
  quickLookTitle?: string;
  quickLookPrice?: string;
  onLoad?: () => void;
  onARStart?: () => void;
  onQuickLookAction?: () => void;
  children?: React.ReactNode;
}

export default function ARModelViewer({
  src, iosSrc, poster, alt, realSizeM, dimensions, quickLookTitle, quickLookPrice, onLoad, onARStart, onQuickLookAction, children,
}: Props) {
  const ref = useRef<ModelViewerElement | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [measuredScale, setMeasuredScale] = useState<number | null>(null);
  const scale = scaleFor(dimensions, realSizeM) ?? measuredScale;
  const measuring = scale === null;

  // Import dinâmico: o bundle do model-viewer só baixa quando o usuário abre o 3D.
  useEffect(() => {
    let alive = true;
    import("@google/model-viewer").then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;

    const handleLoad = () => {
      if (measuring) {
        const d = el.getDimensions();
        const max = Math.max(d.x, d.y, d.z) || 1;
        setMeasuredScale(realSizeM / max); // recria o elemento com a escala correta
        return;
      }
      onLoad?.();
    };
    const handleProgress = (e: Event) => setProgress((e as CustomEvent<{ totalProgress: number }>).detail.totalProgress);
    const handleAR = (e: Event) => {
      if ((e as CustomEvent<{ status: string }>).detail.status === "session-started") onARStart?.();
    };
    const handleQuickLook = () => onQuickLookAction?.();

    el.addEventListener("load", handleLoad);
    el.addEventListener("progress", handleProgress);
    el.addEventListener("ar-status", handleAR);
    el.addEventListener("quick-look-button-tapped", handleQuickLook);
    return () => {
      el.removeEventListener("load", handleLoad);
      el.removeEventListener("progress", handleProgress);
      el.removeEventListener("ar-status", handleAR);
      el.removeEventListener("quick-look-button-tapped", handleQuickLook);
    };
  }, [ready, measuring, realSizeM, onLoad, onARStart, onQuickLookAction]);

  // Banner nativo do Quick Look (iOS) com botão "Adicionar" que dispara `quick-look-button-tapped`
  const iosUrl = iosSrc
    ? `${iosSrc}#${new URLSearchParams({
        callToAction: "Adicionar ao pedido",
        checkoutTitle: quickLookTitle ?? alt,
        ...(quickLookPrice ? { price: quickLookPrice } : {}),
      }).toString()}`
    : undefined;

  if (!ready) return <div className="size-full animate-pulse bg-muted" aria-busy="true" />;

  return (
    <model-viewer
      key={measuring ? "measure" : `scaled-${scale}`}
      ref={ref as React.Ref<HTMLElement>}
      src={src}
      ios-src={iosUrl}
      poster={poster ?? undefined}
      alt={alt}
      scale={measuring ? undefined : `${scale} ${scale} ${scale}`}
      style={measuring ? { opacity: 0 } : undefined}
      ar={!measuring}
      ar-modes="webxr scene-viewer quick-look"
      ar-scale="fixed"
      ar-placement="floor"
      camera-controls
      touch-action="pan-y"
      auto-rotate
      shadow-intensity="1"
      shadow-softness="0.8"
      exposure="1.05"
      loading="eager"
      interaction-prompt="auto"
    >
      {/* Sempre montado: o model-viewer guarda referência ao elemento do slot. */}
      <div
        slot="progress-bar"
        aria-hidden
        className={`absolute inset-x-0 top-0 h-1 bg-black/10 transition-opacity ${progress >= 1 ? "opacity-0" : "opacity-100"}`}
      >
        <div className="h-full bg-accent transition-[width]" style={{ width: `${progress * 100}%` }} />
      </div>
      {/* Botão AR customizado (slot oficial). Só aparece se canActivateAR = true. */}
      <button
        slot="ar-button"
        className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-lg active:scale-95"
      >
        📱 Ver na minha mesa
      </button>
      {/* Overlay de informações — permanece visível na sessão WebXR (DOM Overlay) */}
      {!measuring && children}
    </model-viewer>
  );
}
