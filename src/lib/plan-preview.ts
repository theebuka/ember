"use client";

import { useSyncExternalStore } from "react";
import type { Plan, Subscription } from "@/lib/plan";

/**
 * A development-only switch for seeing the subscriber screens.
 *
 * Nothing can make an account Pro until a checkout exists (§7), so without this
 * the success screen and a subscriber's plan page could only be seen by typing a
 * row into the Supabase dashboard. `NODE_ENV` is inlined at build time, so every
 * branch reading `PLAN_PREVIEW_ENABLED` is removed from a production bundle.
 */
export const PLAN_PREVIEW_ENABLED = process.env.NODE_ENV !== "production";

export const PLAN_PREVIEWS = [
  { value: "off", label: "Real" },
  { value: "pro-monthly", label: "Monthly" },
  { value: "pro-yearly", label: "Yearly" },
  { value: "pro-ending", label: "Ending" },
  { value: "pro-granted", label: "Granted" },
  { value: "lapsed", label: "Lapsed" },
] as const;

export type PlanPreview = (typeof PLAN_PREVIEWS)[number]["value"];

const KEY = "ember:plan-preview";
const listeners = new Set<() => void>();

function read(): PlanPreview {
  if (!PLAN_PREVIEW_ENABLED) return "off";
  try {
    const value = localStorage.getItem(KEY);
    return PLAN_PREVIEWS.some((p) => p.value === value) ? (value as PlanPreview) : "off";
  } catch {
    return "off";
  }
}

export function setPlanPreview(value: PlanPreview): void {
  try {
    if (value === "off") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch {
    // Storage blocked: the preview simply doesn't stick.
  }
  for (const listener of listeners) listener();
}

export function usePlanPreview(): PlanPreview {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    read,
    () => "off",
  );
}

const DAY = 86_400_000;

/** The plan and subscription a preview stands for. */
export function previewed(
  preview: Exclude<PlanPreview, "off">,
  now: number = Date.now(),
): { plan: Plan; subscription: Subscription } {
  switch (preview) {
    case "pro-monthly":
      return { plan: "pro", subscription: { status: "active", periodEnd: now + 31 * DAY, billing: "monthly", renews: true } };
    case "pro-yearly":
      return { plan: "pro", subscription: { status: "active", periodEnd: now + 340 * DAY, billing: "yearly", renews: true } };
    case "pro-ending":
      return { plan: "pro", subscription: { status: "active", periodEnd: now + 12 * DAY, billing: "monthly", renews: false } };
    case "pro-granted":
      return { plan: "pro", subscription: { status: "active", periodEnd: null, billing: null, renews: false } };
    case "lapsed":
      return { plan: "free", subscription: { status: "lapsed", endedAt: now - 3 * DAY } };
  }
}
