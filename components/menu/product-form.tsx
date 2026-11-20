"use client";

import { useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BUCKETS, compressImage, publicUrl } from "@/lib/storage";
import { ALLERGENS, type AddonGroup, type Category, type Model3D, type Product } from "@/lib/types";
import { friendlyDbError, parseCurrencyToCents } from "@/lib/utils";
import { ProductViewer } from "@/components/ar/product-viewer";
import { AddonGroupsEditor } from "./addon-groups-editor";
import { ModelPicker } from "./model-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Draft = Omit<Product, "id" | "restaurant_id" | "position" | "model_3d"> & { id?: string };

const emptyDraft = (categoryId: string | null): Draft => ({
  category_id: categoryId, name: "", description: "", price_cents: 0, compare_at_price_cents: null,
  allergens: [], tags: [], addon_groups: [], model_3d_id: null, image_url: null,
  is_available: true, is_featured: false, prep_time_minutes: null, calories: null,
});

const toMoney = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));

export function ProductForm({
  open, onOpenChange, restaurantId, categories, models, product, defaultCategoryId, nextPosition, onSaved, onModelCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  restaurantId: string;
  categories: Category[];
  models: Model3D[];
  product: Product | null;
  defaultCategoryId: string | null;
  nextPosition: number;
  onSaved: (p: Product) => void;
  onModelCreated: (m: Model3D) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => (product ? { ...product } : emptyDraft(defaultCategoryId)));
  const [price, setPrice] = useState(toMoney(product?.price_cents ?? null));
  const [comparePrice, setComparePrice] = useState(toMoney(product?.compare_at_price_cents ?? null));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(product?.image_url ?? null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof Draft>(key: K, v: Draft[K]) => setDraft((d) => ({ ...d, [key]: v }));
  const selectedModel = models.find((m) => m.id === draft.model_3d_id) ?? null;

  const validate = () => {
    const e: Record<string, string> = {};
    if (draft.name.trim().length < 2) e.name = "Informe o nome do produto";
    if (parseCurrencyToCents(price) <= 0) e.price = "Informe um preço válido";
    for (const g of draft.addon_groups as AddonGroup[]) {
      if (!g.name.trim()) e.addons = "Todo grupo de adicionais precisa de nome";
      if (g.min > g.max) e.addons = `"${g.name}": mínimo maior que máximo`;
      if (g.options.some((o) => !o.name.trim())) e.addons = `"${g.name}": opção sem nome`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    const supabase = createClient();
    const payload = {
      restaurant_id: restaurantId,
      category_id: draft.category_id,
      name: draft.name.trim(),
      description: draft.description?.trim() || null,
      price_cents: parseCurrencyToCents(price),
      compare_at_price_cents: comparePrice ? parseCurrencyToCents(comparePrice) : null,
      allergens: draft.allergens,
      tags: draft.tags,
      addon_groups: draft.addon_groups,
      model_3d_id: draft.model_3d_id,
      is_available: draft.is_available,
      is_featured: draft.is_featured,
      prep_time_minutes: draft.prep_time_minutes,
      calories: draft.calories,
    };

    try {
      // 1) Salva o produto (insert ou update) — sempre escopado por restaurant_id
      const query = product
        ? supabase.from("products").update(payload).eq("id", product.id).eq("restaurant_id", restaurantId)
        : supabase.from("products").insert({ ...payload, position: nextPosition });
      const { data, error } = await query.select("*, model_3d:models_3d(*)").single();
      if (error) throw error;
      let saved = data as Product;

      // 2) Imagem: comprime no navegador (WebP ≤1400px), sobe no Storage, registra em product_images
      if (imageFile) {
        const blob = await compressImage(imageFile);
        const path = `${restaurantId}/products/${saved.id}/${crypto.randomUUID()}.webp`;
        const up = await supabase.storage.from(BUCKETS.assets).upload(path, blob, { contentType: "image/webp", cacheControl: "31536000" });
        if (up.error) throw up.error;
        const url = publicUrl(BUCKETS.assets, path)!;
        await supabase.from("product_images").insert({ restaurant_id: restaurantId, product_id: saved.id, storage_path: path, url, alt: saved.name });
        const upd = await supabase.from("products").update({ image_url: url }).eq("id", saved.id).select("*, model_3d:models_3d(*)").single();
        if (upd.error) throw upd.error;
        saved = upd.data as Product;
      }

      toast.success(product ? "Produto atualizado" : "Produto criado");
      onSaved(saved);
      onOpenChange(false);
    } catch (e) {
      toast.error(friendlyDbError((e as Error).message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{product ? "Editar produto" : "Novo produto"}</DialogTitle>
          <DialogDescription>Campos com * são obrigatórios.</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          noValidate
        >
          <div className="grid gap-4 md:grid-cols-[1fr_200px]">
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="p-name">Nome *</Label>
                <Input id="p-name" value={draft.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? "p-name-err" : undefined} />
                {errors.name && <p id="p-name-err" className="text-sm text-destructive">{errors.name}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-desc">Descrição</Label>
                <Textarea id="p-desc" rows={3} value={draft.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Pão brioche, blend 180g, cheddar inglês…" />
              </div>
            </div>

            {/* Upload de imagem */}
            <div className="grid gap-1.5">
              <span className="text-sm font-medium" id="p-img-label">Foto</span>
              <label
                htmlFor="p-img"
                className="relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-muted focus-within:ring-2 focus-within:ring-ring"
              >
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="Pré-visualização" className="size-full object-cover" />
                ) : (
                  <span className="grid justify-items-center gap-1 text-xs text-muted-foreground"><ImagePlus className="size-6" />Enviar foto</span>
                )}
                <input
                  id="p-img" type="file" accept="image/*" className="sr-only" aria-labelledby="p-img-label"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setImageFile(f);
                    setImagePreview(URL.createObjectURL(f));
                  }}
                />
              </label>
              <p className="text-xs text-muted-foreground">Comprimida automaticamente (WebP).</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="p-price">Preço (R$) *</Label>
              <Input id="p-price" inputMode="decimal" placeholder="0,00" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={!!errors.price} aria-describedby={errors.price ? "p-price-err" : undefined} />
              {errors.price && <p id="p-price-err" className="text-sm text-destructive">{errors.price}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-compare">Preço &quot;de&quot; (opcional)</Label>
              <Input id="p-compare" inputMode="decimal" placeholder="0,00" value={comparePrice} onChange={(e) => setComparePrice(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-cat">Categoria</Label>
              <NativeSelect id="p-cat" value={draft.category_id ?? ""} onChange={(e) => set("category_id", e.target.value || null)}>
                <option value="">Sem categoria</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-prep">Preparo (min)</Label>
              <Input id="p-prep" type="number" min={0} value={draft.prep_time_minutes ?? ""} onChange={(e) => set("prep_time_minutes", e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-cal">Calorias (kcal)</Label>
              <Input id="p-cal" type="number" min={0} value={draft.calories ?? ""} onChange={(e) => set("calories", e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-tags">Tags (vírgula)</Label>
              <Input id="p-tags" placeholder="vegano, picante" defaultValue={draft.tags.join(", ")}
                onBlur={(e) => set("tags", e.target.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))} />
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Alérgenos</legend>
            <div className="flex flex-wrap gap-2">
              {ALLERGENS.map((a) => {
                const checked = draft.allergens.includes(a);
                return (
                  <label key={a} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${checked ? "border-primary bg-primary text-primary-foreground" : ""}`}>
                    <input type="checkbox" className="sr-only" checked={checked}
                      onChange={() => set("allergens", checked ? draft.allergens.filter((x) => x !== a) : [...draft.allergens, a])} />
                    {a}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <AddonGroupsEditor value={draft.addon_groups} onChange={(v) => set("addon_groups", v)} />
          {errors.addons && <p className="-mt-3 text-sm text-destructive" role="alert">{errors.addons}</p>}

          <ModelPicker
            restaurantId={restaurantId}
            models={models}
            value={draft.model_3d_id}
            onChange={(id) => set("model_3d_id", id)}
            onModelCreated={onModelCreated}
          />
          {selectedModel && (
            <div className="mx-auto w-full max-w-xs">
              <ProductViewer
                model={selectedModel}
                product={{ id: product?.id ?? "preview", name: draft.name || "Pré-visualização", price_cents: parseCurrencyToCents(price), allergens: draft.allergens }}
                restaurantId={restaurantId}
                showOverlay={false}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm"><Switch checked={draft.is_available} onCheckedChange={(v) => set("is_available", v)} /> Disponível</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={draft.is_featured} onCheckedChange={(v) => set("is_featured", v)} /> Destaque</label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />}Salvar produto</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
