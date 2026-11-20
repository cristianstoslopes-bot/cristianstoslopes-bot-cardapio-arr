"use client";

import { Plus, Trash2 } from "lucide-react";
import type { AddonGroup } from "@/lib/types";
import { formatCurrency, parseCurrencyToCents } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Editor de grupos de adicionais (ex.: "Ponto da carne" min 1/max 1, "Extras" min 0/max 5). */
export function AddonGroupsEditor({ value, onChange }: { value: AddonGroup[]; onChange: (v: AddonGroup[]) => void }) {
  const update = (gi: number, patch: Partial<AddonGroup>) => onChange(value.map((g, i) => (i === gi ? { ...g, ...patch } : g)));

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium">Adicionais e opções</legend>
      {value.map((group, gi) => (
        <div key={group.id} className="grid gap-3 rounded-lg border p-3">
          <div className="grid grid-cols-[1fr_70px_70px_auto] items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor={`g-${group.id}`} className="text-xs">Nome do grupo</Label>
              <Input id={`g-${group.id}`} value={group.name} placeholder="Ex.: Extras" onChange={(e) => update(gi, { name: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`gmin-${group.id}`} className="text-xs">Mín.</Label>
              <Input id={`gmin-${group.id}`} type="number" min={0} value={group.min} onChange={(e) => update(gi, { min: Math.max(0, Number(e.target.value)) })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`gmax-${group.id}`} className="text-xs">Máx.</Label>
              <Input id={`gmax-${group.id}`} type="number" min={1} value={group.max} onChange={(e) => update(gi, { max: Math.max(1, Number(e.target.value)) })} />
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remover grupo ${group.name}`} onClick={() => onChange(value.filter((_, i) => i !== gi))}>
              <Trash2 />
            </Button>
          </div>
          <ul className="grid gap-2">
            {group.options.map((opt, oi) => (
              <li key={opt.id} className="grid grid-cols-[1fr_110px_auto] gap-2">
                <Input
                  aria-label="Nome da opção"
                  value={opt.name}
                  placeholder="Ex.: Bacon extra"
                  onChange={(e) => update(gi, { options: group.options.map((o, j) => (j === oi ? { ...o, name: e.target.value } : o)) })}
                />
                <Input
                  aria-label="Preço adicional"
                  inputMode="decimal"
                  defaultValue={(opt.price_cents / 100).toFixed(2).replace(".", ",")}
                  onBlur={(e) => {
                    const cents = parseCurrencyToCents(e.target.value);
                    e.target.value = (cents / 100).toFixed(2).replace(".", ",");
                    update(gi, { options: group.options.map((o, j) => (j === oi ? { ...o, price_cents: cents } : o)) });
                  }}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remover opção ${opt.name}`} onClick={() => update(gi, { options: group.options.filter((_, j) => j !== oi) })}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" className="justify-self-start"
            onClick={() => update(gi, { options: [...group.options, { id: crypto.randomUUID().slice(0, 8), name: "", price_cents: 0 }] })}>
            <Plus /> Opção
          </Button>
          {group.options.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Cliente escolhe de {group.min} a {group.max}. Ex.: {group.options[0].name || "opção"} +{formatCurrency(group.options[0].price_cents)}
            </p>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" className="justify-self-start"
        onClick={() => onChange([...value, { id: crypto.randomUUID().slice(0, 8), name: "", min: 0, max: 3, options: [] }])}>
        <Plus /> Grupo de adicionais
      </Button>
    </fieldset>
  );
}
