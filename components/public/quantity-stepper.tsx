"use client";

import { Minus, Plus } from "lucide-react";

export function QuantityStepper({ value, onChange, min = 1, max = 99, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="flex items-center rounded-full border" role="group" aria-label={label}>
      <button type="button" className="grid size-11 place-items-center rounded-full disabled:opacity-40" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Diminuir">
        <Minus className="size-4" />
      </button>
      <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" className="grid size-11 place-items-center rounded-full disabled:opacity-40" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="Aumentar">
        <Plus className="size-4" />
      </button>
    </div>
  );
}
