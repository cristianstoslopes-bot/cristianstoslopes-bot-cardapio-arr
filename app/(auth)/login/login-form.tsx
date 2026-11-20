"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "../actions";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, action] = useActionState(signIn, undefined);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <div>
        <h1 className="font-display text-3xl font-bold">Entrar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Acesse o painel do seu restaurante.</p>
      </div>
      <FormAlert error={state?.error ?? (linkError ? "Link inválido ou expirado." : undefined)} />
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <Field name="email" label="E-mail" type="email" autoComplete="email" error={state?.fieldErrors?.email} />
      <Field name="password" label="Senha" type="password" autoComplete="current-password" error={state?.fieldErrors?.password} />
      <div className="-mt-2 text-right">
        <Link href="/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">
          Esqueci minha senha
        </Link>
      </div>
      <SubmitButton>Entrar</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        Não tem conta?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Teste grátis por 14 dias
        </Link>
      </p>
    </form>
  );
}
