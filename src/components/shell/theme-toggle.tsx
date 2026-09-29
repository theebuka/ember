"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "@/components/common/icon";
import { Segmented } from "@/components/common/segmented";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: <Sun className="size-3.5" />, ariaLabel: "Light" },
  { value: "dark", label: <Moon className="size-3.5" />, ariaLabel: "Dark" },
  {
    value: "system",
    label: <Monitor className="size-3.5" />,
    ariaLabel: "Match system",
  },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  // The resolved theme isn't knowable on the server. Reserve the exact
  // footprint so nothing shifts when the real selection arrives.
  if (!hydrated) {
    return (
      <div
        aria-hidden
        className={cn("h-7 w-[6.5rem] rounded-xl bg-surface-2", className)}
      />
    );
  }

  return (
    <Segmented
      aria-label="Theme"
      size="sm"
      value={(theme ?? "system") as (typeof OPTIONS)[number]["value"]}
      onChange={setTheme}
      options={[...OPTIONS]}
      className={className}
    />
  );
}
