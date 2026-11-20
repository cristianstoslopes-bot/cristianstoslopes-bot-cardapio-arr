"use client";

import { useActionState } from "react";
import { updatePassword } from "../actions";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";

// Chega aqui pelo link de e-mail → /auth/confirm já criou a sessão de recuperação.
export default function ResetPasswordPage() {
  const [state, action] = useActionState(updatePassword, undefined);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <h1 className="font-display text-3xl font-bold">Nova senha</h1>
      <FormAlert error={state?.error} />
      <Field name="password" label="Nova senha" type="password" autoComplete="new-password" error={state?.fieldErrors?.password} />
      <Field name="confirm" label="Confirme a senha" type="password" autoComplete="new-password" error={state?.fieldErrors?.confirm} />
      <SubmitButton>Salvar senha</SubmitButton>
    </form>
  );
}
