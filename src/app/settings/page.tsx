import { Suspense } from "react";
import { SettingsScreen } from "@/components/settings/settings-screen";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    // The section lives in `?tab=`, so this reads `useSearchParams` and needs
    // the boundary — same rule as `/onboarding` and `/auth`.
    <Suspense fallback={<div className="min-h-dvh bg-ground" />}>
      <SettingsScreen />
    </Suspense>
  );
}
