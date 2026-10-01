import type { Metadata } from "next";
import { Suspense } from "react";
import { PortfolioScreen } from "@/components/portfolio/portfolio-screen";

export const metadata: Metadata = {
  // The root layout appends " · ember" via its title template.
  title: "Portfolio",
  description: "Your holdings, watchlist and trades.",
};

export default function PortfolioPage() {
  return (
    // The screen reads its segment from `?view=`, and `useSearchParams` opts a
    // client component out of static rendering unless it sits behind a
    // boundary. The fallback reserves the header's height so the first paint
    // isn't a jump.
    <Suspense fallback={<div className="min-h-dvh" />}>
      <PortfolioScreen />
    </Suspense>
  );
}
