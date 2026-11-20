"use client";

/**
 * Seleção/upload de modelo 3D (GLB/GLTF + USDZ opcional) para o Supabase Storage.
 * Bloqueado no plano Starter (UI) — e também no banco (policy + trigger), por segurança.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { Box, Loader2, Lock, Upload } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BUCKETS } from "@/lib/storage";
import { useSubscription } from "@/hooks/use-subscription";
import { measureGlb } from "@/lib/model-dimensions";
import type { Model3D } from "@/lib/types";
import { friendlyDbError } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const MAX_MB = 25;

export function ModelPicker({
  restaurantId, models, value, onChange, onModelCreated,
}: {
  restaurantId: string;
  models: Model3D[];
  value: string | null;
  onChange: (id: string | null) => void;
  onModelCreated: (m: Model3D) => void;
}) {
  const { can, withinLimit, limit } = useSubscription();
  const [uploading, setUploading] = useState(false);
  const [realSizeCm, setRealSizeCm] = useState(12);
  const glbRef = useRef<HTMLInputElement>(null);
  const usdzRef = useRef<HTMLInputElement>(null);

  if (!can("ar")) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm">
        <Lock className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <p>
          Modelos 3D e Realidade Aumentada estão disponíveis no plano <strong>Pro</strong>.{" "}
          <Link href="/dashboard/settings?tab=billing" className="font-medium text-primary underline">Fazer upgrade</Link>
        </p>
      </div>
    );
  }

  const upload = async (glb: File, usdz?: File | null) => {
    if (!/\.(glb|gltf)$/i.test(glb.name)) return toast.error("Envie um arquivo .glb ou .gltf");
    if (glb.size > MAX_MB * 1024 * 1024) return toast.error(`Arquivo acima de ${MAX_MB} MB. Comprima com gltf-transform (Draco/Meshopt).`);
    if (!withinLimit("max_models", models.length)) return toast.error(`Limite de ${limit("max_models")} modelos do plano atingido.`);

    setUploading(true);
    const supabase = createClient();
    const id = crypto.randomUUID();
    const glbPath = `${restaurantId}/${id}.glb`;
    const usdzPath = usdz ? `${restaurantId}/${id}.usdz` : null;

    try {
      const dimensions = glb.name.toLowerCase().endsWith(".glb") ? await measureGlb(glb) : null;
      const up = await supabase.storage.from(BUCKETS.models).upload(glbPath, glb, { contentType: "model/gltf-binary", cacheControl: "31536000", upsert: false });
      if (up.error) throw up.error;
      if (usdz && usdzPath) {
        const u2 = await supabase.storage.from(BUCKETS.models).upload(usdzPath, usdz, { contentType: "model/vnd.usdz+zip", cacheControl: "31536000" });
        if (u2.error) throw u2.error;
      }
      const { data, error } = await supabase
        .from("models_3d")
        .insert({
          restaurant_id: restaurantId,
          name: glb.name.replace(/\.(glb|gltf)$/i, ""),
          glb_path: glbPath,
          usdz_path: usdzPath,
          file_size_bytes: glb.size,
          real_size_m: realSizeCm / 100,
          dimensions,
        })
        .select()
        .single();
      if (error) {
        await supabase.storage.from(BUCKETS.models).remove([glbPath, ...(usdzPath ? [usdzPath] : [])]); // rollback
        throw error;
      }
      onModelCreated(data as Model3D);
      onChange((data as Model3D).id);
      toast.success("Modelo 3D enviado!");
    } catch (e) {
      toast.error(friendlyDbError((e as Error).message));
    } finally {
      setUploading(false);
    }
  };

  return (
    <fieldset className="grid gap-3 rounded-lg border p-3">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-medium"><Box className="size-4" aria-hidden /> Modelo 3D / AR</legend>
      <div className="grid gap-1.5">
        <Label htmlFor="model-select">Modelo vinculado</Label>
        <NativeSelect id="model-select" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Sem modelo 3D</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({Math.round(Number(m.real_size_m) * 100)} cm{m.file_size_bytes ? ` · ${(m.file_size_bytes / 1048576).toFixed(1)} MB` : ""})
            </option>
          ))}
        </NativeSelect>
      </div>

      {/* div (não <form>): este componente vive dentro do formulário do produto */}
      <div className="grid gap-2 border-t pt-3">
        <p className="text-sm font-medium">Enviar novo modelo</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="glb" className="text-xs">Arquivo GLB/GLTF (obrigatório)</Label>
            <Input id="glb" ref={glbRef} type="file" accept=".glb,.gltf,model/gltf-binary" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="usdz" className="text-xs">USDZ para iPhone (opcional)</Label>
            <Input id="usdz" ref={usdzRef} type="file" accept=".usdz,model/vnd.usdz+zip" />
          </div>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="real-size" className="text-xs">Tamanho real do prato (maior lado, em cm)</Label>
          <Input id="real-size" type="number" min={2} max={200} value={realSizeCm} onChange={(e) => setRealSizeCm(Number(e.target.value))} className="w-32" />
          <p className="text-xs text-muted-foreground">Hambúrguer ≈ 12 cm · Pizza grande ≈ 35 cm. Garante a escala correta em AR.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          className="justify-self-start"
          onClick={() => {
            const glb = glbRef.current?.files?.[0];
            if (!glb) return toast.error("Selecione o arquivo GLB/GLTF");
            void upload(glb, usdzRef.current?.files?.[0] ?? null);
          }}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />} Enviar modelo
        </Button>
      </div>
    </fieldset>
  );
}
