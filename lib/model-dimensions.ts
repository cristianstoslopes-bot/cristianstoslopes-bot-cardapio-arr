"use client";

import { Box3, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/**
 * Mede o bounding box de um GLB no navegador (no momento do upload).
 * Resultado em unidades do arquivo; o viewer converte para metros com real_size_m.
 */
export async function measureGlb(file: File): Promise<{ x: number; y: number; z: number } | null> {
  try {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader().setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
    loader.setDRACOLoader(draco);
    const gltf = await loader.parseAsync(await file.arrayBuffer(), "");
    draco.dispose();
    const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
    if (!Number.isFinite(size.x) || Math.max(size.x, size.y, size.z) <= 0) return null;
    return { x: +size.x.toFixed(5), y: +size.y.toFixed(5), z: +size.z.toFixed(5) };
  } catch {
    return null; // GLB inválido/externo: o viewer mede no primeiro carregamento
  }
}

export function scaleFor(dimensions: { x: number; y: number; z: number } | null | undefined, realSizeM: number) {
  if (!dimensions) return null;
  const max = Math.max(dimensions.x, dimensions.y, dimensions.z);
  return max > 0 ? realSizeM / max : null;
}
