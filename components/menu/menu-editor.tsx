"use client";

/**
 * Editor de Cardápio: categorias (esquerda) e produtos da categoria (direita),
 * ambos ordenáveis por drag-and-drop. A ordem é persistida em lote via RPCs
 * `reorder_categories` / `reorder_products` (SECURITY INVOKER → RLS se aplica).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Box, Copy, Eye, EyeOff, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useRestaurant } from "@/contexts/restaurant-context";
import { useSubscription } from "@/hooks/use-subscription";
import type { Category, Model3D, Product } from "@/lib/types";
import { cn, formatCurrency, friendlyDbError } from "@/lib/utils";
import { SortableList } from "./sortable-list";
import { ProductForm } from "./product-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const UNCATEGORIZED = "__none__";

export function MenuEditor() {
  const { restaurant } = useRestaurant();
  const { limit } = useSubscription();
  const supabase = createClient();
  const params = useSearchParams();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [models, setModels] = useState<Model3D[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState<string>(UNCATEGORIZED);
  const [newCatName, setNewCatName] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    const [c, p, m] = await Promise.all([
      supabase.from("categories").select("*").eq("restaurant_id", restaurant.id).order("position"),
      supabase.from("products").select("*, model_3d:models_3d(*)").eq("restaurant_id", restaurant.id).order("position"),
      supabase.from("models_3d").select("*").eq("restaurant_id", restaurant.id).order("created_at", { ascending: false }),
    ]);
    const err = c.error ?? p.error ?? m.error;
    if (err) toast.error(friendlyDbError(err.message));
    const cats = (c.data ?? []) as Category[];
    setCategories(cats);
    setProducts((p.data ?? []) as Product[]);
    setModels((m.data ?? []) as Model3D[]);
    setSelectedCat((prev) => (prev === UNCATEGORIZED && cats[0] ? cats[0].id : prev));
    setLoading(false);
  }, [supabase, restaurant.id]);

  useEffect(() => {
    // Fetch inicial do Supabase (sistema externo)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (params.get("welcome")) toast.success("Restaurante criado! Comece cadastrando suas categorias e produtos.");
  }, [params]);

  const visibleProducts = useMemo(
    () => products.filter((p) => (selectedCat === UNCATEGORIZED ? !p.category_id : p.category_id === selectedCat)),
    [products, selectedCat],
  );

  // ---------------- Categorias ----------------
  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from("categories")
      .insert({ restaurant_id: restaurant.id, name, position: categories.length + 1 })
      .select()
      .single();
    if (error) return toast.error(friendlyDbError(error.message));
    setCategories((c) => [...c, data as Category]);
    setSelectedCat((data as Category).id);
    setNewCatName("");
  };

  const renameCategory = async (cat: Category) => {
    const name = prompt("Novo nome da categoria", cat.name)?.trim();
    if (!name || name === cat.name) return;
    const { error } = await supabase.from("categories").update({ name }).eq("id", cat.id).eq("restaurant_id", restaurant.id);
    if (error) return toast.error(friendlyDbError(error.message));
    setCategories((cs) => cs.map((c) => (c.id === cat.id ? { ...c, name } : c)));
  };

  const toggleCategory = async (cat: Category) => {
    const { error } = await supabase.from("categories").update({ is_active: !cat.is_active }).eq("id", cat.id).eq("restaurant_id", restaurant.id);
    if (error) return toast.error(friendlyDbError(error.message));
    setCategories((cs) => cs.map((c) => (c.id === cat.id ? { ...c, is_active: !c.is_active } : c)));
  };

  const deleteCategory = async (cat: Category) => {
    if (!confirm(`Excluir "${cat.name}"? Os produtos ficarão sem categoria.`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", cat.id).eq("restaurant_id", restaurant.id);
    if (error) return toast.error(friendlyDbError(error.message));
    setCategories((cs) => cs.filter((c) => c.id !== cat.id));
    setProducts((ps) => ps.map((p) => (p.category_id === cat.id ? { ...p, category_id: null } : p)));
    setSelectedCat(UNCATEGORIZED);
    toast.success("Categoria excluída");
  };

  const reorderCategories = async (next: Category[]) => {
    const prev = categories;
    setCategories(next);
    const { error } = await supabase.rpc("reorder_categories", { p_restaurant_id: restaurant.id, p_ids: next.map((c) => c.id) });
    if (error) {
      setCategories(prev);
      toast.error(friendlyDbError(error.message));
    }
  };

  // ---------------- Produtos ----------------
  const reorderProducts = async (next: Product[]) => {
    const prev = products;
    const positions = new Map(next.map((p, i) => [p.id, i + 1]));
    setProducts((ps) => ps.map((p) => (positions.has(p.id) ? { ...p, position: positions.get(p.id)! } : p)).sort((a, b) => a.position - b.position));
    const { error } = await supabase.rpc("reorder_products", {
      p_restaurant_id: restaurant.id,
      p_category_id: selectedCat === UNCATEGORIZED ? null : selectedCat,
      p_ids: next.map((p) => p.id),
    });
    if (error) {
      setProducts(prev);
      toast.error(friendlyDbError(error.message));
    }
  };

  const patchProduct = async (product: Product, patch: Partial<Product>) => {
    setProducts((ps) => ps.map((p) => (p.id === product.id ? { ...p, ...patch } : p)));
    const { error } = await supabase.from("products").update(patch).eq("id", product.id).eq("restaurant_id", restaurant.id);
    if (error) {
      setProducts((ps) => ps.map((p) => (p.id === product.id ? product : p)));
      toast.error(friendlyDbError(error.message));
    }
  };

  const duplicateProduct = async (product: Product) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, model_3d, ...rest } = product;
    const { data, error } = await supabase
      .from("products")
      .insert({ ...rest, name: `${product.name} (cópia)`, position: products.length + 1 })
      .select("*, model_3d:models_3d(*)")
      .single();
    if (error) return toast.error(friendlyDbError(error.message));
    setProducts((ps) => [...ps, data as Product]);
    toast.success("Produto duplicado");
  };

  const deleteProduct = async (product: Product) => {
    if (!confirm(`Excluir "${product.name}"?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", product.id).eq("restaurant_id", restaurant.id);
    if (error) return toast.error(friendlyDbError(error.message));
    setProducts((ps) => ps.filter((p) => p.id !== product.id));
    toast.success("Produto excluído");
  };

  const openForm = (product: Product | null) => {
    setEditing(product);
    setFormKey((k) => k + 1); // remonta o formulário com estado limpo
    setFormOpen(true);
  };

  const maxProducts = limit("max_products");

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Cardápio</h1>
          <p className="text-sm text-muted-foreground">
            {products.length} produtos{maxProducts !== -1 && ` de ${maxProducts} do seu plano`} · arraste ⠿ para reordenar
          </p>
        </div>
        <Button onClick={() => openForm(null)}>
          <Plus /> Novo produto
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[320px_1fr]">
        {/* Categorias */}
        <Card>
          <CardHeader>
            <CardTitle>Categorias</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void addCategory();
              }}
            >
              <label htmlFor="new-cat" className="sr-only">Nova categoria</label>
              <Input id="new-cat" placeholder="Nova categoria" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
              <Button type="submit" size="icon" aria-label="Adicionar categoria"><Plus /></Button>
            </form>

            <SortableList
              label="Categorias"
              items={categories}
              onReorder={reorderCategories}
              renderItem={(cat) => (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCat(cat.id)}
                    aria-pressed={selectedCat === cat.id}
                    className={cn(
                      "min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selectedCat === cat.id && "bg-secondary font-semibold",
                      !cat.is_active && "text-muted-foreground line-through",
                    )}
                  >
                    {cat.name}
                    <span className="ml-1 text-xs text-muted-foreground">({products.filter((p) => p.category_id === cat.id).length})</span>
                  </button>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Renomear ${cat.name}`} onClick={() => renameCategory(cat)}><Pencil /></Button>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={cat.is_active ? `Ocultar ${cat.name}` : `Mostrar ${cat.name}`} onClick={() => toggleCategory(cat)}>
                    {cat.is_active ? <Eye /> : <EyeOff />}
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Excluir ${cat.name}`} onClick={() => deleteCategory(cat)}><Trash2 /></Button>
                </div>
              )}
            />
            <button
              type="button"
              onClick={() => setSelectedCat(UNCATEGORIZED)}
              aria-pressed={selectedCat === UNCATEGORIZED}
              className={cn("rounded px-3 py-2 text-left text-sm text-muted-foreground", selectedCat === UNCATEGORIZED && "bg-secondary font-semibold text-foreground")}
            >
              Sem categoria ({products.filter((p) => !p.category_id).length})
            </button>
          </CardContent>
        </Card>

        {/* Produtos */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{categories.find((c) => c.id === selectedCat)?.name ?? "Sem categoria"}</CardTitle>
          </CardHeader>
          <CardContent>
            {visibleProducts.length === 0 ? (
              <div className="grid justify-items-center gap-3 py-12 text-center text-sm text-muted-foreground">
                Nenhum produto nesta categoria.
                <Button variant="outline" onClick={() => openForm(null)}><Plus /> Adicionar produto</Button>
              </div>
            ) : (
              <SortableList
                label="Produtos"
                items={visibleProducts}
                onReorder={reorderProducts}
                renderItem={(p) => (
                  <div className="flex items-center gap-3">
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt="" loading="lazy" className="size-12 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="size-12 shrink-0 rounded-md bg-muted" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-sm font-medium", !p.is_available && "text-muted-foreground line-through")}>{p.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold">{formatCurrency(p.price_cents)}</span>
                        {p.model_3d_id && <Badge variant="accent"><Box className="size-3" /> 3D/AR</Badge>}
                        {p.is_featured && <Badge variant="secondary"><Star className="size-3" /> Destaque</Badge>}
                        {!p.is_available && <Badge variant="destructive">Esgotado</Badge>}
                      </div>
                    </div>
                    <div className="flex shrink-0">
                      <Button variant="ghost" size="icon" aria-label={p.is_available ? `Marcar ${p.name} como esgotado` : `Disponibilizar ${p.name}`} onClick={() => patchProduct(p, { is_available: !p.is_available })}>
                        {p.is_available ? <Eye /> : <EyeOff />}
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Editar ${p.name}`} onClick={() => openForm(p)}><Pencil /></Button>
                      <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label={`Duplicar ${p.name}`} onClick={() => duplicateProduct(p)}><Copy /></Button>
                      <Button variant="ghost" size="icon" aria-label={`Excluir ${p.name}`} onClick={() => deleteProduct(p)}><Trash2 /></Button>
                    </div>
                  </div>
                )}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {formOpen && (
        <ProductForm
          key={formKey}
          open={formOpen}
          onOpenChange={setFormOpen}
          restaurantId={restaurant.id}
          categories={categories}
          models={models}
          product={editing}
          defaultCategoryId={selectedCat === UNCATEGORIZED ? null : selectedCat}
          nextPosition={products.length + 1}
          onModelCreated={(m) => setModels((ms) => [m, ...ms])}
          onSaved={(saved) =>
            setProducts((ps) => (ps.some((p) => p.id === saved.id) ? ps.map((p) => (p.id === saved.id ? saved : p)) : [...ps, saved]))
          }
        />
      )}
      {loading && <Loader2 className="animate-spin" />}
    </div>
  );
}
