import { EmberPoint } from "@/components/common/ember-point";
import { cn } from "@/lib/utils";

/**
 * The launch screen.
 *
 * **It is the page's real first paint, not a delay dressed as one.**
 * `/onboarding` reads `useSearchParams`, which opts a client component out of
 * static rendering unless it sits behind a `Suspense` boundary — so the
 * prerendered HTML for this route is the *fallback*, and until now that
 * fallback was an empty `bg-ground` rectangle. A blank white page is what a
 * first-time user saw for the length of one hydration. Putting the splash
 * there costs nothing and fills the one moment that was already dead.
 *
 * That is the whole argument for it. A splash that holds a ready app back so
 * the brand can have a moment is an interstitial ad for yourself, and this app
 * measures its own load times in public.
 *
 * **The ground is `#0B0C0F`, not the brand blue.** It is `ink`, and it is
 * exactly what the installed icon is drawn on (`public/icons/icon.svg`), so
 * the OS launch screen, the home-screen icon and this frame are one object
 * seen three times. A saturated blue field would be louder and would match
 * nothing. Both are hard-coded rather than tokenised for the same reason
 * `offline.html` is: this has to be right before the theme is known, and it is
 * the same in either theme regardless.
 */
export function Splash({
  /**
   * `leaving` fades it out over whatever has rendered underneath. The server
   * copy never uses it — it is replaced wholesale when React takes the route.
   */
  leaving = false,
  className,
}: {
  leaving?: boolean;
  className?: string;
}) {
  return (
    <div
      // Not `aria-hidden`: on the server copy this is the only thing on the
      // page, and hiding the entire document from a screen reader for the
      // duration of hydration is worse than announcing a wordmark once.
      className={cn(
        "fixed inset-0 z-50 grid place-items-center",
        "transition-opacity duration-500 ease-out motion-reduce:transition-none",
        leaving && "pointer-events-none opacity-0",
        className,
      )}
      style={{ background: "#0B0C0F" }}
    >
      <div className="flex flex-col items-center gap-5">
        <EmberPoint size={112} />
        <span className="text-title font-bold tracking-[-0.03em] text-[#F4F5F7]">
          ember
        </span>
      </div>
    </div>
  );
}
