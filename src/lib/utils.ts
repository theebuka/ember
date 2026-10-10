import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `cn`, taught our type scale.
 *
 * tailwind-merge ships with Tailwind's default theme baked in, and it has no
 * way to see `globals.css`. Faced with an unfamiliar `text-*`, it falls back
 * to assuming a **colour** — so `text-micro` was being filed alongside
 * `text-stone`, and any component whose `cn()` set a size and then a colour
 * had the size silently deleted as a conflict:
 *
 *   cn("text-micro", active ? "text-brand-text" : "text-stone")
 *   → "text-brand-text"      // 16px, browser default
 *
 * Nothing warns. The class is emitted by Tailwind, the element renders, and
 * the only symptom is type at the wrong size — which is exactly the sort of
 * thing that reads as "slightly off" rather than "broken". Found by measuring
 * a table header that wouldn't fit its column and discovering it was 16px.
 *
 * Registering the scale puts these back in the `font-size` group, where they
 * belong and where they no longer collide with a colour. Any size added to
 * `@theme` in `globals.css` has to be added here too — the two lists are the
 * one place in the system that can't be derived from each other.
 *
 * `tap-target` is registered for the same reason, in the `position` group.
 * It sets `position: relative` so it can hang a 44px hit region off a
 * pseudo-element, which puts it in direct conflict with `absolute` — and the
 * close button on every dialog and sheet is an absolutely positioned button.
 * Filed here, the later class simply wins: a positioned button opts out of
 * the hit expansion, which is the right answer and is decided by the merge
 * rather than by whichever rule Tailwind happened to emit last.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "figure",
            "display",
            "hero",
            "title",
            "heading",
            "body",
            "caption",
            "micro",
          ],
        },
      ],
      position: ["tap-target"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
