"use client";

import dynamic from "next/dynamic";
import { useIsDesktop } from "@/hooks/use-media-query";

const CommandMenu = dynamic(
  () => import("@/components/shell/command-menu").then((m) => m.CommandMenu),
  { ssr: false },
);

/**
 * The command menu, loaded after the page and only on a desktop.
 *
 * ⌘K is desktop-only (decision 052), yet cmdk and its dialog were in every
 * page's first load on every device. Now a phone never downloads it and a
 * desktop fetches it once the page is interactive.
 */
export function CommandMenuLoader() {
  return useIsDesktop() ? <CommandMenu /> : null;
}
