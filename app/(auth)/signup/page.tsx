"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "../actions";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";

export default function SignupPage() {
  const [state, action] = useActionState(signUp, undefined);
  if (state?.message) {
    return (
      <div className="grid gap-4 text-center">
        <h1 className="font-display text-3xl font-bold">Verifique seu e-mail</h1>
        <FormAlert message={state.message} />
        <p className="text-sm text-muted-foreground">Após confirmar, você vai configurar seu restaurante.</p>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-5" noValidate>
      <div>
        <h1 className="font-display text-3xl font-bold">Criar conta</h1>
        <p className="mt-1 text-sm text-muted-foreground">14 dias grátis do plano Pro, com AR incluso. Sem cartão.</p>
      </div>
      <FormAlert error={state?.error} />
      <Field name="full_name" label="Seu nome" autoComplete="name" error={state?.fieldErrors?.full_name} />
      <Field name="email" label="E-mail" type="email" autoComplete="email" error={state?.fieldErrors?.email} />
      <Field name="password" label="Senha (mín. 8 caracteres)" type="password" autoComplete="new-password" error={state?.fieldErrors?.password} />
      <SubmitButton>Criar conta</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
