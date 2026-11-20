import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

async function LoginContent({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return <LoginForm next={next} linkError={error === "link_invalido"} />;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  return (
    <Suspense fallback={<LoginForm />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
