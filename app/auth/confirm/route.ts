import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino dos links de e-mail (confirmação de cadastro, recuperação de senha, magic link).
 * Suporta os dois formatos do Supabase:
 *   - ?token_hash=...&type=signup|recovery|email  (templates SSR recomendados)
 *   - ?code=...                                    (PKCE)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next = /^\/(?![\/\\])/.test(nextParam) && !nextParam.includes("\\") ? nextParam : "/dashboard";

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (ok) return NextResponse.redirect(new URL(type === "recovery" ? "/reset-password" : next, origin));
  return NextResponse.redirect(new URL("/login?error=link_invalido", origin));
}
