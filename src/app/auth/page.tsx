import { Suspense } from "react";
import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata = {
  title: "Sign in",
  description: "Sign in to ember. With Pro, your trades, settings and watchlist sync across devices.",
};

export default function AuthPage() {
  return (
    // `useSearchParams` again — same boundary rule as `/onboarding`. The
    // fallback is the page's own frame so the first paint isn't a jump.
    <Suspense fallback={<div className="min-h-dvh bg-ground" />}>
      <AuthScreen />
    </Suspense>
  );
}
