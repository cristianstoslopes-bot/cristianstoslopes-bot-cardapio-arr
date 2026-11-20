import { SUPABASE_URL } from "@/lib/supabase/env";

export const BUCKETS = { assets: "restaurant-assets", models: "models-3d" } as const;

/** URL pública (CDN do Supabase Storage). Buckets são públicos só para leitura. */
export function publicUrl(bucket: string, path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Compressão de imagem no cliente antes do upload: redimensiona e converte para WebP.
 * Reduz ~70-90% o peso de fotos de celular → cardápio carrega rápido em 4G.
 */
export async function compressImage(file: File, maxSize = 1400, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/webp", quality });
}
