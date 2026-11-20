"use client";

import { useEffect, useState } from "react";

/**
 * Detecta qual caminho de AR o dispositivo suporta:
 *  - "webxr":        Chrome Android com ARCore → WebXR `immersive-ar` (hit-test no chão)
 *  - "quick-look":   iOS/iPadOS Safari → AR Quick Look (ARKit) com USDZ
 *  - "scene-viewer": Android sem WebXR → Google Scene Viewer (ARCore) via intent
 *  - "none":         desktop/sem suporte → visualizador 3D com OrbitControls
 */
export type ARSupport = "checking" | "webxr" | "quick-look" | "scene-viewer" | "none";

export function detectQuickLook(): boolean {
  const a = document.createElement("a");
  return a.relList?.supports?.("ar") ?? false;
}

export function useARSupport(): ARSupport {
  const [support, setSupport] = useState<ARSupport>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let result: ARSupport = "none";
      try {
        const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
        if (xr && (await xr.isSessionSupported("immersive-ar"))) result = "webxr";
        else if (detectQuickLook()) result = "quick-look";
        else if (/android/i.test(navigator.userAgent)) result = "scene-viewer";
      } catch {
        result = detectQuickLook() ? "quick-look" : "none";
      }
      if (!cancelled) setSupport(result);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return support;
}
