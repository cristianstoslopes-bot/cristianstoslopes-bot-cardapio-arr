"use client";
import { Toaster as Sonner } from "sonner";

/** Toasts globais. Uso: `import { toast } from "sonner"; toast.success("Salvo!")` */
export function Toaster() {
  return <Sonner position="top-center" richColors closeButton toastOptions={{ duration: 4000 }} />;
}
