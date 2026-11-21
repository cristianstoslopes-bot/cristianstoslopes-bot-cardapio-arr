"use client";

import { useActionState, useState } from "react";
import { createRestaurant } from "./actions";
import { FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/utils";

export function OnboardingForm() {
  const [state, action] = useActionState(createRestaurant, undefined);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-secondary p-6">
      <form action={action} className="grid w-full max-w-md gap-5 rounded-2xl bg-background p-8 shadow-sm">
        <div>
          <p className="text-sm font-medium text-accent">Passo 1 de 1</p>
          <h1 className="font-display text-3xl font-bold">Vamos criar seu cardápio</h1>
        </div>
        <FormAlert error={state?.error} />
        <div className="grid gap-1.5">
          <Label htmlFor="name">Nome do restaurante</Label>
          <Input
            id="name" name="name" required className="h-11" value={name} placeholder="Ex.: Brasa Burger"
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="slug">Endereço do cardápio</Label>
          <div className="flex items-center rounded-md border border-input focus-within:ring-2 focus-within:ring-ring">
            <span className="pl-3 text-sm text-muted-foreground">/r/</span>
            <input
              id="slug" name="slug" required value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              className="h-11 flex-1 bg-transparent px-1 text-base outline-none md:text-sm"
              aria-describedby="slug-help"
            />
          </div>
          <p id="slug-help" className="text-xs text-muted-foreground">É o link que vai no QR Code. Pode ser alterado depois.</p>
        </div>
        <SubmitButton>Criar restaurante</SubmitButton>
      </form>
    </main>
  );
}
