import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { PageLoader } from "@/components/ui/page-loader";
import { OnboardingForm } from "./onboarding-form";

async function Gate() {
  const { user, restaurant } = await getCurrentTenant();
  if (!user) redirect("/login");
  if (restaurant) redirect("/dashboard"); // já tem restaurante: vai para o painel
  return <OnboardingForm />;
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Gate />
    </Suspense>
  );
}
