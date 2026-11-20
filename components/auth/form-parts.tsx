"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Field({
  name, label, type = "text", error, autoComplete, defaultValue,
}: { name: string; label: string; type?: string; error?: string; autoComplete?: string; defaultValue?: string }) {
  const errId = `${name}-error`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={!!error}
        aria-describedby={error ? errId : undefined}
        className="h-11"
        required
      />
      {error && (
        <p id={errId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

export function FormAlert({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={error ? "rounded-md bg-red-50 p-3 text-sm text-red-800" : "rounded-md bg-emerald-50 p-3 text-sm text-emerald-800"}
    >
      {error ?? message}
    </p>
  );
}
