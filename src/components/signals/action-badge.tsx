import { ACTION_DIRECTION, ACTION_LABELS, type AdviceAction } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * What ember is recommending.
 *
 * Sentence case and a low-chroma tint, never `🔥 STRONG BUY`. The register is
 * a restrained analyst: the badge states a position, and the card beside it
 * gives the reasoning, the size and the stop. A badge shouting on its own is
 * the tell of an app with nothing behind it.
 */

const TONES: Record<"up" | "down" | "flat", string> = {
  up: "bg-up-tint text-up",
  down: "bg-down-tint text-down",
  flat: "bg-surface-2 text-stone",
};

export function ActionBadge({
  action,
  size = "default",
  /**
   * Drops the direction tint while keeping the word.
   *
   * For a read that doesn't clear the user's risk profile — the advice feed
   * won't surface it, and a tinted `Buy` beside `Low · 29` would have the
   * watchlist contradicting the feed on the same screen. The user asked about
   * this instrument, so the honest read is still shown; it just doesn't get
   * the colour reserved for calls ember is actually making.
   */
  muted = false,
  title,
  className,
}: {
  action: AdviceAction;
  size?: "sm" | "default";
  muted?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md font-semibold",
        size === "sm" ? "px-1.5 py-0.5 text-micro" : "px-2 py-0.5 text-caption",
        muted ? "bg-surface-2 text-stone" : TONES[ACTION_DIRECTION[action]],
        className,
      )}
    >
      {ACTION_LABELS[action]}
    </span>
  );
}
