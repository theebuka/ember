"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CaretLeft, CaretRight, Cookie, RotateCw, Sparkles, Upload, Wallet } from "@/components/common/icon";
import { PLAN_RULES } from "@/lib/plan";
import { StepArt } from "@/components/onboarding/onboarding-art";
import { Splash } from "@/components/onboarding/splash";
import { RiskProfileSetting } from "@/components/settings/risk-profile-setting";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useHydrated } from "@/hooks/use-hydrated";
import { useSession } from "@/hooks/use-session";
import { MARKET_LABELS, type MarketKind } from "@/lib/api/types";
import { safeNext, writeOnboardedCookie } from "@/lib/onboarding";
import { sampleTransactions } from "@/lib/portfolio/sample";
import { cn } from "@/lib/utils";
import { usePortfolio } from "@/store/use-portfolio";
import { PREFERENCE_DEFAULTS, usePreferences } from "@/store/use-preferences";

/**
 * Three steps, and each one has to earn its place.
 *
 * The temptation with onboarding is to spend it on a product tour. ember's is
 * spent on the two things the app genuinely can't work out on its own — what
 * kind of investor is holding the phone, and which markets they care about —
 * plus one screen at the front that says what the thing is and, immediately,
 * what it isn't.
 *
 * The disclosure is on step one rather than buried at the end. An app that
 * issues buy and sell calls should say "this is not financial advice" before
 * it says anything else; putting it after the pitch would make it a formality
 * rather than a term.
 *
 * Everything here is skippable and everything is reversible in settings, which
 * is why there's no progress-gating and no required field. Onboarding that
 * holds you hostage for three screens is a conversion tactic, not a courtesy.
 *
 * ── The shape, rebuilt ───────────────────────────────────────────────────
 *
 * It shipped as one 512px column of prose: step one alone ran a headline, a
 * lede, three claims with full paragraphs under them, and a disclosure block
 * — over a thousand pixels tall on a phone, and on a 1440px display the exact
 * same column with 900px of empty ground either side. Every reference in this
 * category opens on a picture and about forty words.
 *
 * So: an **art panel** and a **content column**, stacked on a phone and side
 * by side from `lg`. The claims lost their paragraphs and became one line
 * each — every one of them is restated in full on the methodology page, which
 * is a click away and is where someone who wants the detail is going anyway.
 *
 * **There is no sticky footer any more, and that is a fix rather than a
 * consequence.** `position: sticky` on the control bar was the one structural
 * pattern this screen shared with the "buttons don't work on mobile" report,
 * and a sticky element that has been promoted to its own compositing layer is
 * a long-standing iOS Safari hit-test hazard — the layer paints where it
 * scrolled to while its tappable region stays put (decision 055 removed the
 * `backdrop-blur` that was promoting it, which was necessary and evidently not
 * sufficient). The column is now a flex layout that fills the viewport with
 * the controls in normal flow at the bottom of it, so on any screen tall
 * enough there is nothing to scroll and nothing to composite.
 */

const STEPS = ["What ember does", "How you invest", "What you follow"] as const;
const MARKETS = ["equity", "crypto", "fx"] as const;

/**
 * How long the splash stays mounted.
 *
 * It starts fading on the first client render — `leaving` is simply
 * `hydrated` — and stops taking pointer events at that moment, so this is not
 * a minimum display time and a fast user loses nothing. It only has to outlast
 * the 500ms fade in `Splash`; unmounting mid-transition would cut the dissolve
 * to a jump.
 */
const SPLASH_MS = 700;

export function OnboardingScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const hydrated = useHydrated();
  const { user, available: authAvailable } = useSession();

  const [step, setStep] = useState(0);

  const storedRiskProfile = usePreferences((s) => s.riskProfile);
  const storedMarkets = usePreferences((s) => s.markets);
  const setRiskProfile = usePreferences((s) => s.setRiskProfile);
  const toggleMarket = usePreferences((s) => s.toggleMarket);
  const completeOnboarding = usePreferences((s) => s.completeOnboarding);
  const hasOnboarded = usePreferences((s) => s.hasOnboarded);
  const loadSample = usePortfolio((s) => s.loadSample);

  const riskProfile = hydrated ? storedRiskProfile : PREFERENCE_DEFAULTS.riskProfile;
  const markets = hydrated ? storedMarkets : PREFERENCE_DEFAULTS.markets;

  const destination = safeNext(params.get("next")) ?? "/";
  const replaying = params.get("replay") === "1";

  /**
   * The splash hands over to the screen.
   *
   * The server-rendered fallback for this route *is* the splash (see
   * `Splash`), so the dark frame is already on screen when this component
   * mounts. Rendering our own copy for one beat and fading it means the
   * handover is a dissolve rather than a cut from near-black to white.
   *
   * Not on a replay: someone who opened setup from settings is already inside
   * the app, and a launch screen there is a brand interruption in the middle
   * of a session.
   */
  const [splashGone, setSplashGone] = useState(replaying);
  useEffect(() => {
    if (replaying) return;
    const timer = setTimeout(() => setSplashGone(true), SPLASH_MS);
    return () => clearTimeout(timer);
  }, [replaying]);

  /**
   * A navigation is already under way, so the self-heal effect must stand down.
   *
   * `completeOnboarding()` flips `hasOnboarded` — a subscribed selector — which
   * changes the effect's deps and re-runs it in the same commit. Without this
   * guard it fired a second `router.replace(destination)` that superseded the
   * first: "Explore with sample data" asked for `/portfolio` and every user
   * landed on `/`. It read as the button doing nothing.
   *
   * A ref rather than state because it has to be true *before* the render that
   * schedules the effect. Updates inside an event handler are batched and
   * flushed after the handler returns, so `leave()` setting it synchronously
   * is enough — but a `setState` would not be.
   */
  const leavingRef = useRef(false);

  /** Where they were headed when the cookie turned out to be unwritable. */
  const [blockedDestination, setBlockedDestination] = useState<string | null>(null);

  /**
   * Leave onboarding — but only once the gate will actually let us through.
   *
   * `proxy.ts` decides from the real cookie jar. Navigating on the strength of
   * an unverified write means being bounced straight back here, and since the
   * store *did* persist, bounced again, forever. So a failed write stops and
   * says so rather than starting a loop.
   */
  const leave = useCallback(
    (to: string) => {
      if (!writeOnboardedCookie()) {
        setBlockedDestination(to);
        return;
      }
      leavingRef.current = true;
      setBlockedDestination(null);
      router.replace(to);
    },
    [router],
  );

  /**
   * Self-heal a missing cookie.
   *
   * Middleware sends anyone without the cookie here, including someone who
   * finished setup before the cookie existed or whose cookie expired. The
   * store knows better, so rewrite the cookie and get out of their way —
   * except when they asked to replay it from settings.
   */
  useEffect(() => {
    if (!hydrated || replaying || !hasOnboarded) return;
    if (leavingRef.current || blockedDestination !== null) return;
    leave(destination);
  }, [hydrated, replaying, hasOnboarded, destination, leave, blockedDestination]);

  const finish = (options: { withSample?: boolean; to?: string } = {}) => {
    const to = options.to ?? destination;
    if (options.withSample) loadSample(sampleTransactions());
    completeOnboarding();
    leave(to);
  };

  const enabledCount = MARKETS.filter((m) => markets[m]).length;
  const last = step === STEPS.length - 1;

  if (blockedDestination !== null) {
    return <CookiesBlocked onRetry={() => leave(blockedDestination)} />;
  }

  return (
    /**
     * `h-dvh` and `overflow-hidden`, not `min-h-dvh`.
     *
     * With a minimum height the column is free to grow past the viewport, so
     * `flex-1` on the scroll area resolves to its content and the *page*
     * scrolls instead — which puts the controls below the fold and is precisely
     * why they were made sticky. Pinning the shell to the dynamic viewport
     * makes the middle the only thing that can scroll, and the footer sits
     * where it looks like it sits.
     *
     * `dvh` rather than `vh` because iOS Safari's `100vh` is the *expanded* URL
     * bar's viewport: a footer at the bottom of it is under the browser chrome
     * until the user scrolls, and here nothing scrolls, so it would simply
     * never be reachable.
     */
    <div className="flex h-dvh flex-col overflow-hidden bg-ground lg:flex-row">
      {/* ── Art ─────────────────────────────────────────────────────────
          A third of a phone screen and half a desktop one. `40dvh` rather
          than `40vh` so it doesn't grow under iOS Safari's collapsing URL
          bar and push the controls off the bottom — the exact failure mode
          this rebuild is trying to close. */}
      <aside
        className={cn(
          "relative shrink-0 overflow-hidden",
          "h-[30dvh] min-h-[180px] max-h-[300px]",
          "lg:h-auto lg:max-h-none lg:w-[46%] lg:max-w-[760px]",
          // The panel is near-black in both themes, and dark ground is too, so
          // in dark a hairline marks where the panel ends (pitfall 16).
          "dark:border-line dark:max-lg:border-b dark:lg:border-r",
        )}
      >
        <StepArt step={step} riskProfile={riskProfile} markets={markets} />
      </aside>

      {/* ── Column ──────────────────────────────────────────────────────
          `min-h-0` so the scrollable middle can actually shrink inside the
          flex column; without it a long step pushes the footer off-screen
          instead of scrolling, which is how the controls became sticky in
          the first place. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <header
          className="mx-auto w-full max-w-xl shrink-0 px-5 pt-5 lg:px-10"
          style={{ paddingTop: "max(1.25rem, var(--safe-top))" }}
        >
          <div className="flex items-center justify-between gap-3">
            <Logo size={20} />
            {/* Always an exit. Hiding it on a replay would trap someone who
                opened this from settings out of curiosity three steps from
                the app they were already using. */}
            <Button variant="ghost" size="sm" onClick={() => finish()} className="text-stone">
              {replaying ? "Close" : "Skip setup"}
            </Button>
          </div>

          <ol className="mt-5 flex gap-1.5" aria-label="Setup progress">
            {STEPS.map((label, index) => (
              <li
                key={label}
                aria-current={index === step ? "step" : undefined}
                className="h-1 flex-1 overflow-hidden rounded-full bg-line"
              >
                <span
                  className={cn(
                    "block h-full rounded-full bg-brand transition-[width] duration-300 ease-out",
                    "motion-reduce:transition-none",
                    index <= step ? "w-full" : "w-0",
                  )}
                />
                <span className="sr-only">
                  {`Step ${index + 1} of ${STEPS.length}: ${label}`}
                </span>
              </li>
            ))}
          </ol>
        </header>

        {/* `id="main"` so the layout's skip link has a target here too —
            onboarding opts out of the shell, which is where that id normally
            lives. */}
        <main
          id="main"
          /**
           * Focusable, because it scrolls.
           *
           * axe's `scrollable-region-focusable`, and it is a real defect
           * rather than a technicality: a region with `overflow-y: auto` and
           * no focusable child cannot be scrolled by anyone using a keyboard
           * or a switch — the content is simply unreachable. On the welcome
           * step there is nothing tabbable inside it at all. A tab stop on
           * the region is the documented remedy and costs one press.
           */
          tabIndex={0}
          className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-5 py-6 lg:flex lg:flex-col lg:justify-center lg:px-10 lg:py-10"
        >
          {step === 0 && <WhatEmberDoes />}

          {step === 1 && (
            <section>
              <StepHeading
                title="How much conviction?"
                lede="This decides what ember recommends. You can change it anytime."
              />
              <RiskProfileSetting
                value={riskProfile}
                onChange={setRiskProfile}
                className="mt-7"
              />
            </section>
          )}

          {step === 2 && (
            <section>
              <StepHeading
                title="What should ember watch?"
                lede="Turn off any you don't trade."
              />

              <ul className="mt-7 divide-y divide-line border-y border-line">
                {MARKETS.map((market) => {
                  const on = markets[market];
                  const locked = on && enabledCount === 1;
                  return (
                    <li key={market} className="flex items-center gap-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-body font-medium text-ink">
                          {MARKET_LABELS[market]}
                        </p>
                        <p className="mt-0.5 text-caption text-stone">
                          {locked ? "Keep at least one on." : MARKET_BLURB[market]}
                        </p>
                      </div>
                      <Switch
                        checked={on}
                        disabled={locked}
                        onCheckedChange={() => toggleMarket(market)}
                        aria-label={`Follow ${MARKET_LABELS[market]}`}
                      />
                    </li>
                  );
                })}
              </ul>

              {/* Three actions, not three choices (pitfall 9). Each one leaves
                  setup and opens what it names; Open ember is the way out
                  without any of them. */}
              <h2 className="mt-8 text-body font-medium text-ink">Add what you own</h2>
              <p className="mt-1 text-caption text-stone">
                So ember can value it and warn you when a position turns.
              </p>

              <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
                <StartAction
                  icon={Wallet}
                  title="Log a trade"
                  detail="Takes about 20 seconds"
                  onClick={() => finish({ to: "/portfolio?start=log" })}
                />
                <StartAction
                  icon={Upload}
                  title="Import a CSV"
                  detail="From your broker's export"
                  onClick={() => finish({ to: "/portfolio?start=import" })}
                />
                <StartAction
                  icon={Sparkles}
                  title="Use sample data"
                  detail="Labelled as a sample. Clear it in one tap."
                  onClick={() => finish({ withSample: true, to: "/portfolio" })}
                />
              </ul>

              {/* Free's limits, said once before they bite (pitfall 15). */}
              <p className="mt-3 text-micro text-stone">
                Free tracks {PLAN_RULES.free.holdings} holdings and watches{" "}
                {PLAN_RULES.free.watchlist} instruments. Pro has no limits.
              </p>
            </section>
          )}
        </main>

        {/* ── Controls ──────────────────────────────────────────────────
            In normal flow, at the bottom of a column that is already the
            height of the viewport. Nothing sticky, nothing composited, and
            on any screen with room the buttons never move at all. */}
        <footer
          className="mx-auto w-full max-w-xl shrink-0 border-t border-line px-5 pt-4 lg:px-10"
          style={{ paddingBottom: "max(1.25rem, var(--safe-bottom))" }}
        >
          <div className="flex items-center gap-3">
            {step > 0 && (
              <Button
                variant="ghost"
                onClick={() => setStep((s) => s - 1)}
                className="text-stone"
              >
                <CaretLeft />
                Back
              </Button>
            )}

            <Button
              className="ml-auto"
              onClick={last ? () => finish() : () => setStep((s) => s + 1)}
            >
              {last ? "Open ember" : step === 0 ? "Get started" : "Continue"}
              <CaretRight />
            </Button>
          </div>

          {/* ── The account, offered rather than demanded ────────────────
              Every reference in this category puts sign-in on the *first*
              screen — Fuse's "Continue with Apple", Phantom's "I already have
              a wallet" — and there is a reason ember does not: those apps
              cannot do anything at all until you have an account, and ember
              can do all of it. Leading with a wall would be claiming a
              requirement that does not exist.

              So it sits under the controls on the welcome step, where a
              returning user finds it immediately and a new one is not stopped
              by it. It disappears once there is a session, and it renders at
              all only when there is an account service to reach
              (`lib/supabase/config.ts`). This is the shape that changes when
              plans land — noted in CLAUDE.md §9, not smuggled in early. */}
          {step === 0 && authAvailable && hydrated && user === null && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-line pt-4 text-caption">
              <span className="text-stone">Been here before?</span>
              <Link
                href="/auth?next=%2F"
                className="rounded-sm font-medium text-brand-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Sign in
              </Link>
              <span aria-hidden className="text-faint">·</span>
              <Link
                href="/auth?next=%2Fwelcome"
                className="rounded-sm font-medium text-brand-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Create an account
              </Link>
            </div>
          )}
        </footer>
      </div>

      {/* Last in the DOM so it covers everything without a stacking-context
          argument, and rendered only until it has faded — an empty fixed
          layer left behind is a permanent invisible lid on the page. */}
      {!splashGone && <Splash leaving={hydrated} />}
    </div>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────── */

/**
 * The one state onboarding can't finish from.
 *
 * ember decides whether you've been set up by reading a cookie at the edge, so
 * a browser that won't store one has no way to tell the server anything. There
 * is no clever fallback: a `?onboarded=1` escape hatch survives exactly one
 * navigation and then drops you back here, which is worse than saying so.
 *
 * What this must not be is a dead end, so it names the setting, names where it
 * usually comes from, and retries in place rather than asking for a reload.
 */
function CookiesBlocked({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ground px-6 text-center">
      <div className="w-full max-w-sm">
        <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-surface-2 text-stone">
          <Cookie className="size-5" />
        </span>

        <h1 className="mt-5 text-title font-semibold text-ink">
          ember needs a cookie to remember you
        </h1>
        <p className="mt-2 text-body text-stone">
          It only records that you&rsquo;ve finished setup. Your browser is blocking it, so ember would bring you back here every time.
        </p>
        <p className="mt-4 text-caption text-stone">
          Opened ember inside another app? Try Safari or Chrome. Otherwise, allow cookies for this site and try again.
        </p>

        <Button size="lg" className="mt-6 w-full" onClick={onRetry}>
          <RotateCw />
          Try again
        </Button>
      </div>
    </div>
  );
}

/**
 * What each market actually is, in one clause.
 *
 * These used to name counts — "six large-cap US names", "three major pairs" —
 * written when the universe was thirteen instruments. It went to 110, then to
 * 202, and a number in onboarding copy is a promise the universe file has to
 * keep. So they describe the *kind* of thing instead, which stays true as the
 * list grows — and it has now grown twice without this file needing an edit,
 * which is the argument for the rule.
 */
const MARKET_BLURB: Record<MarketKind, string> = {
  equity: "Large caps across the US, Europe, Asia and Africa.",
  crypto: "Bitcoin, Ethereum and other major coins.",
  fx: "Major currency pairs.",
};

function StepHeading({ title, lede }: { title: string; lede: string }) {
  return (
    <>
      <h1 className="text-display font-semibold tracking-display text-ink text-balance">
        {title}
      </h1>
      <p className="mt-3 text-body text-stone text-pretty">{lede}</p>
    </>
  );
}

/**
 * Step one: what this is, and immediately what it isn't.
 *
 * Three claims, each one something the app can be held to later — the window,
 * the citations, the published record. No feature list, no screenshots of
 * itself, and nothing that couldn't be checked from inside the product an hour
 * from now.
 *
 * Each was a full paragraph until phase 18. They are one line now, because the
 * paragraphs were re-explaining on a welcome screen what the methodology page
 * says properly with citations attached — and a person who wants that detail
 * before they have seen a single price is not the person this screen is for.
 */
function WhatEmberDoes() {
  const points = [
    // No numbers. Both of these used to carry one — "72-hour" and "Ten" — and
    // both went stale: crypto's horizon became 36 hours and the ensemble grew
    // to sixteen rules, while the welcome screen went on saying otherwise.
    // Decision 099's rule, which this list had quietly escaped.
    "A window to act in on every call, with a size and a stop",
    "Cited strategies from the published literature",
    "A computed track record, losses included",
  ];

  return (
    <section>
      <h1 className="text-display font-semibold tracking-display text-ink text-balance">
        Know what to do, and when.
      </h1>
      <p className="mt-3 text-body text-stone text-pretty">
        Stocks, forex and crypto: what&apos;s worth doing, and when to do it.
      </p>

      <ul className="mt-6 space-y-2.5">
        {points.map((point) => (
          <li key={point} className="flex items-baseline gap-3">
            <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
            <span className="text-caption text-graphite">{point}</span>
          </li>
        ))}
      </ul>

      {/* Above the fold on a 375×812 phone, and that is a requirement rather
          than a nicety: the argument for putting the disclosure on step one at
          all is that it is said *before* the pitch lands, and a disclosure you
          have to scroll for is one you were meant to miss. */}
      <p className="mt-6 text-micro text-stone text-pretty">
        ember gives information, not financial advice. It can be wrong, and it
        doesn&apos;t know your circumstances.
      </p>
    </section>
  );
}

function StartAction({
  icon: Icon,
  title,
  detail,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left",
          "transition-colors outline-none hover:bg-surface-2",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-stone">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-caption font-medium text-ink">{title}</span>
          <span className="mt-0.5 block text-micro text-stone">{detail}</span>
        </span>
        <CaretRight className="size-4 shrink-0 text-stone" />
      </button>
    </li>
  );
}
