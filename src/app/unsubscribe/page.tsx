import { Suspense } from "react";
import { UnsubscribeScreen } from "@/components/settings/unsubscribe-screen";

export const metadata = {
  title: "Unsubscribe",
  description: "Turn off ember's email digests.",
  // Nothing here should be indexed: the URL carries a token, and a search engine
  // following one would unsubscribe a real person on a crawl.
  robots: { index: false, follow: false },
};

export default function UnsubscribePage() {
  return (
    // The screen reads `useSearchParams`, so the prerendered HTML *is* this
    // fallback — ADR 0030's lesson, applied where it costs nothing: an
    // unsubscribe page that flashes an empty rectangle is a page someone
    // reloads, and a reload here looks like a failure.
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
          <p className="text-body text-stone">One moment.</p>
        </main>
      }
    >
      <UnsubscribeScreen />
    </Suspense>
  );
}
