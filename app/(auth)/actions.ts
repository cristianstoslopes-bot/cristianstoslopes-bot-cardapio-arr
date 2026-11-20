"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/supabase/env";

export type AuthState = { error?: string; message?: string; fieldErrors?: Record<string, string> } | undefined;

const email = z.string().trim().toLowerCase().email("E-mail inválido");
const password = z.string().min(8, "Mínimo de 8 caracteres");

function fieldErrors(err: z.ZodError) {
  return Object.fromEntries(err.issues.map((i) => [String(i.path[0]), i.message]));
}

/** Evita open-redirect: só aceita caminhos internos. */
function safeNext(next: FormDataEntryValue | null, fallback = "/dashboard") {
  const v = typeof next === "string" ? next : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: z.string().min(1, "Informe a senha") }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") return { error: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada." };
    return { error: "E-mail ou senha incorretos." };
  }
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({ full_name: z.string().trim().min(2, "Informe seu nome"), email, password })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name }, // → trigger handle_new_user cria o profile
      emailRedirectTo: `${SITE_URL}/auth/confirm?next=/onboarding`,
    },
  });
  if (error) return { error: error.message };
  return { message: "Conta criada! Enviamos um link de confirmação para o seu e-mail." };
}

export async function requestPasswordReset(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ email }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${SITE_URL}/auth/confirm?next=/reset-password`,
  });
  // Resposta idêntica exista ou não o e-mail (evita enumeração de usuários)
  return { message: "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha." };
}

export async function updatePassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((d) => d.password === d.confirm, { message: "As senhas não conferem", path: ["confirm"] })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Link expirado ou inválido. Solicite uma nova redefinição." };
  redirect("/dashboard?password=updated");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
