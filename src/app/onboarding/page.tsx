import { Suspense } from "react";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";
import { Splash } from "@/components/onboarding/splash";

export const metadata = {
  title: "Set up ember",
  description: "Set up ember in a minute.",
};

export default function OnboardingPage() {
  return (
    // `useSearchParams` opts a client component out of static rendering unless
    // it sits behind a boundary — so the HTML prerendered for this route *is*
    // this fallback, and it is what a first-time visitor looks at until
    // hydration finishes. It was a blank `bg-ground` rectangle. The splash
    // costs nothing to put here: it is not a delay, it is the frame that was
    // already being painted, finally saying something.
    <Suspense fallback={<Splash />}>
      <OnboardingScreen />
    </Suspense>
  );
}
