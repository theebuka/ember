"use client";

import { usePathname } from "next/navigation";
import { AnnouncementBar } from "@/components/shell/announcement-bar";
import { BottomNav } from "@/components/shell/bottom-nav";
import { CommandMenuLoader } from "@/components/shell/command-menu-loader";
import { SidePanel } from "@/components/shell/side-panel";
import { useFindingAlerts } from "@/hooks/use-finding-alerts";
import { useSync } from "@/hooks/use-sync";
import { usePlanRefresh } from "@/hooks/use-plan-refresh";
import { isBareRoute } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Application chrome: a bottom bar on mobile, a side panel on desktop.
 *
 * Onboarding opts out entirely — it owns the viewport, and offering navigation
 * before the user has set anything up would just be an invitation to get lost.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Mounted here so an alert fires whichever screen is open, and exactly once
  // — a second copy would mean a second timer and a second notification.
  // Called before the bare-route return because hooks can't be conditional;
  // it costs nothing during onboarding, where nobody has granted permission.
  useFindingAlerts();
  // Mounted once, here, for the same reason the alert watcher is: the ledger
  // can be edited from three screens and a modal, and a sync that lives on any
  // one of them stops the moment you navigate away from it. Inert — it returns
  // immediately — when there is no project configured or nobody signed in.
  useSync();
  usePlanRefresh();

  if (isBareRoute(pathname)) return <>{children}</>;

  return (
    <>
      {/* The announcement slot, above everything including the side panel.
          **`min-height`, not `height`.** `--bar-h` is a *reservation* that
          `AnnouncementBarScript` makes before paint when this device has seen a
          bar; the bar's own content is what actually sets the height. The first
          cut used `height` with `overflow-hidden` and the bar was invisible on
          the very first load — the frame where the hint does not exist yet is
          exactly the frame the bar needs to appear in, and clipping it to the
          reservation meant the reservation was the only thing that could ever
          show it. Found by rendering one.

          `0px` by default, which is almost every visit, and a `div` of zero
          height costs nothing.

          **Sticky, not in flow.** It used to scroll away, and the side panel —
          sticky at `top-0` with a height of `100dvh` minus the bar — then sat
          with a 40px empty strip beneath its footer for the rest of the page.
          The panel could be right at the top of the page or after scrolling,
          never both. A bar is reserved for outages and changes to what ember
          stores, and it is dismissible, so it staying put while it exists is
          the behaviour to want anyway; everything else sticky offsets by
          `--bar-h`, which is 0 on almost every visit. */}
      <div className="sticky top-0 z-40" style={{ minHeight: "var(--bar-h, 0px)" }}>
        <AnnouncementBar />
      </div>

      {/* The frame, from `md` up: the rail sits on `canvas` and the page is a
          white panel inset on it. Without it the rail, the header and the page
          were three things floating on one white field with no edge between
          chrome and content. `overflow-clip` rather than `hidden` so the panel
          rounds its corners without becoming a scroll container — sticky
          headers inside it still stick to the viewport. */}
      <div className="flex min-h-dvh md:bg-canvas">
        <SidePanel />

        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            "md:my-2 md:mr-2 md:min-h-[calc(100dvh-var(--bar-h,0px)-1rem)] md:overflow-clip",
            "md:rounded-2xl md:border md:border-line md:bg-ground",
          )}
        >
          <main
            id="main"
            className="flex-1 pb-[calc(var(--nav-height)+var(--safe-bottom)+0.5rem)] md:pb-16"
          >
            {children}
          </main>
        </div>

        <BottomNav />
        <CommandMenuLoader />
      </div>
    </>
  );
}
