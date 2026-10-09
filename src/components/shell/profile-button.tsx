"use client";

import Link from "next/link";
import { UserCircle } from "@/components/common/icon";
import { useHydrated } from "@/hooks/use-hydrated";
import { greetingName, initials } from "@/lib/profile";
import { useProfile } from "@/store/use-profile";
import { cn } from "@/lib/utils";

/**
 * Where settings went.
 *
 * A gear sitting in the tab bar as a peer of Home and Portfolio claims that
 * configuration is one of the app's main surfaces. It isn't, and no product in
 * this category treats it as one — Cash App and Chime both put it behind a
 * portrait in a corner, which is also where people have learned to look for it.
 *
 * It is a link, not a menu. A menu here would hold one item, and the settings
 * screen already has the theme control, the disclosure and everything else it
 * would have contained.
 *
 * The initial appears once there's a name to take it from; before that it is a
 * glyph rather than a placeholder letter, because a circle containing "?" or
 * "U" reads as a broken avatar rather than an empty one.
 */
export function ProfileButton({
  className,
  size = "default",
}: {
  className?: string;
  /** `sm` for the mobile header, where it sits beside a 28px page title. */
  size?: "default" | "sm";
}) {
  const hydrated = useHydrated();
  const storedName = useProfile(greetingName);
  const storedInitials = useProfile(initials);

  // The name is in localStorage, so the server can't know it. Render the glyph
  // until mounted; both states are the same size, so nothing moves.
  const name = hydrated ? storedName : null;
  // Two letters once there is a first and last name, one otherwise. Never an
  // invented letter — no name means the glyph, because a circle containing "U"
  // reads as a broken avatar rather than an empty one.
  const initial = hydrated ? storedInitials : null;

  return (
    <Link
      href="/settings"
      aria-label={name ? `Settings, signed in as ${name}` : "Settings"}
      className={cn(
        "tap-target inline-flex shrink-0 items-center justify-center rounded-full",
        "border border-line bg-surface-2 text-stone outline-none transition-colors",
        "hover:border-line-strong hover:text-graphite",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        size === "sm" ? "size-10" : "size-11",
        className,
      )}
    >
      {initial ? (
        <span
          aria-hidden
          className={cn(
            "font-semibold text-graphite",
            size === "sm" ? "text-caption" : "text-body",
          )}
        >
          {initial}
        </span>
      ) : (
        <UserCircle size={size === "sm" ? 22 : 24} />
      )}
    </Link>
  );
}
