"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "../actions";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <div>
        <h1 className="font-display text-3xl font-bold">Recuperar senha</h1>
        <p className="mt-1 text-sm text-muted-foreground">Enviaremos um link para você criar uma nova senha.</p>
      </div>
      <FormAlert error={state?.error} message={state?.message} />
      <Field name="email" label="E-mail" type="email" autoComplete="email" error={state?.fieldErrors?.email} />
      <SubmitButton>Enviar link</SubmitButton>
      <Link href="/login" className="text-center text-sm text-primary hover:underline">
        Voltar ao login
      </Link>
    </form>
  );
}
