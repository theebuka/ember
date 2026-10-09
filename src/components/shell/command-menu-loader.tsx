"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useCommandMenuOpen } from "@/components/shell/command-menu-state";

const CommandMenu = dynamic(
  () => import("@/components/shell/command-menu").then((m) => m.CommandMenu),
  { ssr: false },
);

/**
 * The menu, loaded only where it can be used.
 *
 * On desktop it mounts up front so ⌘K works on the first press. On a phone it
 * loads the first time the header's search button opens it, so cmdk never
 * ships to somebody who doesn't search.
 */
export function CommandMenuLoader() {
  const isDesktop = useIsDesktop();
  const open = useCommandMenuOpen();
  const [wanted, setWanted] = useState(false);
  // Set during render, React's pattern for state derived from a change.
  if (open && !wanted) setWanted(true);
  return isDesktop || wanted ? <CommandMenu /> : null;
}
