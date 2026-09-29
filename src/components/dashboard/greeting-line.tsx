"use client";

import { useState } from "react";
import { greeting, greetingPrompt } from "@/lib/greeting";
import { useNow } from "@/hooks/use-now";
import { greetingName } from "@/lib/profile";
import { useProfile } from "@/store/use-profile";

/**
 * The block at the top of Home — a greeting, and a quieter question under it.
 *
 * Two constraints, both structural rather than editorial.
 *
 * **It renders `null` until mounted.** The greeting depends on the viewer's
 * local hour and their stored name, and the server knows neither — the same
 * hydration problem ADR 0017 solved for every other clock-dependent string.
 * The wrapper keeps its height with a transparent glyph in the real type
 * class, so the page below it does not move when the text arrives (ADR 0019).
 *
 * **The seed is fixed on mount.** Picking at render time would flicker during
 * hydration and change the wording while someone is reading it. One draw per
 * visit; refreshing gets a new one, re-rendering does not.
 *
 * The clock ticks at a minute rather than 30s — nothing here needs to be
 * sharper than that, and it is the cheapest subscription that still crosses
 * midnight and the daypart boundaries correctly.
 */
export function GreetingLine({ className }: { className?: string }) {
  const now = useNow(60_000);
  const name = useProfile(greetingName);
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000));

  const at = now === null ? null : new Date(now);
  const parts = at === null ? null : greeting({ now: at, name, seed });
  const prompt =
    at === null || parts === null
      ? null
      : greetingPrompt({ now: at, seed, lead: parts.lead });

  return (
    /**
     * One `aria-live` region over both lines, not one each.
     *
     * They arrive in the same commit and they are one thought; two polite
     * regions would queue two announcements, and the second would interrupt a
     * screen-reader user mid-sentence for a pleasantry.
     */
    <div className={className} aria-live="polite">
      {/**
       * Not a heading, and it should not look like one.
       *
       * It sat at `text-title font-semibold text-ink` — byte-identical to
       * every page title in the app — directly above a 64px balance, which
       * left it reading as a stray `h2` that had lost its section. The
       * greeting is a *salutation*: it belongs in the register of the quieter
       * copy, with the one personal word in it carrying the colour.
       *
       * The name goes to `brand-text`, which is the token that exists for
       * exactly this (brand as type, 6.8:1 on ground). Size stays put rather
       * than growing — the number below is the hero, and two things competing
       * for that job is how a home screen stops having a focal point.
       *
       * No `aria-label` on either line, and that is not an omission:
       * `aria-label` is *prohibited* on a plain `<p>`, which has no role that
       * supports being named, and `scripts/audit.mjs` fails on it. It was also
       * pointless — splitting a line across nested inline spans changes
       * nothing about how it is announced, because inline content reads
       * continuously. The colour is the only thing the split buys, and colour
       * is not semantic.
       */}
      <p className="text-title font-medium tracking-title text-stone">
        {parts === null ? (
          <span className="invisible">Good afternoon</span>
        ) : (
          <>
            {parts.lead}
            {parts.name && (
              <span className="font-semibold text-brand-text">{parts.name}</span>
            )}
            {parts.tail}
          </>
        )}
      </p>

      {/**
       * The question, one step down.
       *
       * The step is *size*, not colour, and that is forced rather than chosen:
       * `stone` is the last muted level in the palette and `faint` is not a
       * text colour (ADR 0018), so below `stone` the only hierarchy left is
       * type scale. 28px medium over 17px regular is a clear enough break, and
       * it keeps both lines above the contrast floor instead of buying
       * separation with an illegible grey.
       *
       * Same invisible-glyph trick as above so the balance underneath does not
       * move when the text lands (ADR 0019). Two reserved lines now, which is
       * why this is a real element rather than something conditional.
       */}
      <p className="mt-1 text-body text-stone">
        {prompt === null ? (
          <span className="invisible">Where would you like to start?</span>
        ) : (
          prompt
        )}
      </p>
    </div>
  );
}
