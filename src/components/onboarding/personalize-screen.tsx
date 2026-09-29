"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "@/components/common/icon";
import { StepArt } from "@/components/onboarding/onboarding-art";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHydrated } from "@/hooks/use-hydrated";
import { useSession } from "@/hooks/use-session";
import { BASE_CURRENCIES, CURRENCY_META, type BaseCurrency } from "@/lib/api/types";
import { countries, detectTimezone, suggestedCurrency } from "@/lib/profile";
import { writeOnboardedCookie } from "@/lib/onboarding";
import { usePreferences } from "@/store/use-preferences";
import { useProfile } from "@/store/use-profile";
import { cn } from "@/lib/utils";

/**
 * The short flow after signing in for the first time.
 *
 * **One question per screen**, which is the pattern every reference in the
 * folder converges on — Chime asks for a phone number, then a code, then a
 * password, each on its own screen with a headline the size of the question.
 * It is not decoration: a form with six fields is a form you skim and abandon,
 * and each of these is answerable in about three seconds.
 *
 * **Two questions, and the second is optional.** ember needs a name for the
 * greeting and a country to suggest a currency, and it needs nothing else —
 * see `lib/profile.ts` for what was deliberately left out. A flow that asks
 * for a date of birth on a product that holds no money and executes no trade
 * is collecting data because the screen had room.
 *
 * **Skippable from the first frame.** The account already exists by the time
 * anyone reaches this, so nothing here is load-bearing; a personalisation flow
 * that traps you is a data-collection funnel with a friendly headline.
 *
 * It reuses the onboarding art panel and column, because it *is* onboarding —
 * a different three minutes of it. A second layout for the same moment would
 * be two things to keep in step.
 */

type Step = 0 | 1 | 2;

export function PersonalizeScreen() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { user, ready, available } = useSession();

  const [step, setStep] = useState<Step>(0);

  const profile = useProfile();
  const setProfile = useProfile((s) => s.set);
  const baseCurrency = usePreferences((s) => s.baseCurrency);
  const setBaseCurrency = usePreferences((s) => s.setBaseCurrency);
  const markets = usePreferences((s) => s.markets);
  const completeOnboarding = usePreferences((s) => s.completeOnboarding);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const countryOptions = useMemo(() => countries(), []);

  /**
   * Nobody signed in has no business here.
   *
   * Reachable directly by URL, and someone who arrives that way is either
   * mid-sign-in or lost. Waiting for `ready` first, so a signed-in user is
   * never bounced by a session that simply hadn't resolved yet.
   */
  useEffect(() => {
    if (!ready) return;
    if (!available || user === null) router.replace("/settings?tab=account");
  }, [ready, available, user, router]);

  /** Detected, never asked — the same rule as the settings form. */
  useEffect(() => {
    if (!hydrated || profile.timezone) return;
    const detected = detectTimezone();
    if (detected) setProfile({ timezone: detected });
  }, [hydrated, profile.timezone, setProfile]);

  // Seeded once from whatever the profile already holds, so someone stepping
  // back through the flow does not find their own answer wiped.
  const seeded = useRef(false);
  useEffect(() => {
    if (!hydrated || seeded.current) return;
    seeded.current = true;
    setFirstName(profile.firstName ?? profile.preferredName ?? "");
    setLastName(profile.lastName ?? "");
  }, [hydrated, profile.firstName, profile.preferredName, profile.lastName]);

  const commitName = () => {
    setProfile({
      firstName,
      lastName,
      // Preferred name defaults to the first name rather than asking a third
      // question. Settings has the field for anyone whose answer differs.
      preferredName: profile.preferredName ?? firstName,
    });
  };

  const chooseCountry = (country: string) => {
    setProfile({ country });
    /**
     * The currency is *suggested*, once, and only while it is untouched.
     *
     * Setting it every time the country changes would silently re-denominate a
     * book someone has been reading in dollars for a year, which is a much
     * bigger change than the one they made. Here it is safe: this screen runs
     * once, on an account minutes old, before there is a book to re-denominate.
     */
    const suggestion = suggestedCurrency(country);
    if (suggestion && BASE_CURRENCIES.includes(suggestion as BaseCurrency)) {
      setBaseCurrency(suggestion as BaseCurrency);
    }
  };

  /**
   * Leaving here counts as having been set up.
   *
   * Someone arriving from "Create an account" on the welcome screen never
   * finished the three-step introduction, so they hold no `ember_onboarded`
   * cookie — and `proxy.ts` would bounce them straight back into onboarding
   * the moment they landed on Home. Creating an account is a stronger signal
   * of intent than tapping through three screens, so this writes both halves
   * of the gate (ADR 0014: the cookie *and* the store, or they disagree).
   */
  const done = () => {
    completeOnboarding();
    writeOnboardedCookie();
    router.replace("/");
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ground lg:flex-row">
      <aside className="relative h-[30dvh] max-h-[300px] min-h-[180px] shrink-0 overflow-hidden lg:h-auto lg:max-h-none lg:w-[46%] lg:max-w-[760px]">
        <StepArt step={step === 2 ? 2 : 0} riskProfile="balanced" markets={markets} />
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <header
          className="mx-auto w-full max-w-xl shrink-0 px-5 pt-5 lg:px-10"
          style={{ paddingTop: "max(1.25rem, var(--safe-top))" }}
        >
          <div className="flex items-center justify-between gap-3">
            <Logo size={20} />
            <Button variant="ghost" size="sm" onClick={done} className="text-stone">
              Skip
            </Button>
          </div>
        </header>

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
          {step === 0 && (
            <section>
              <Heading
                title="What should we call you?"
                lede="Just for the greeting. Both are optional and both are editable later."
              />

              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="first-name">First name</Label>
                  <Input
                    id="first-name"
                    className="mt-2"
                    autoComplete="given-name"
                    autoFocus
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="last-name">Last name</Label>
                  <Input
                    id="last-name"
                    className="mt-2"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                  />
                </div>
              </div>

              <p className="mt-4 text-micro text-stone">
                Signed in as{" "}
                <span className="font-medium text-graphite">{user?.email}</span>.
              </p>
            </section>
          )}

          {step === 1 && (
            <section>
              <Heading
                title="Where are you?"
                lede="It sets a sensible base currency and tells ember which market hours are yours."
              />

              <div className="mt-7 max-w-sm">
                <Label htmlFor="country">Country</Label>
                <Select value={profile.country ?? ""} onValueChange={chooseCountry}>
                  <SelectTrigger id="country" className="mt-2 w-full">
                    <SelectValue placeholder="Choose a country" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {countryOptions.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <p className="mt-3 text-caption text-stone">
                  Figures will be shown in{" "}
                  <span className="font-medium text-ink">
                    {CURRENCY_META[baseCurrency].label}
                  </span>
                  . Instruments stay quoted in their own currency, and you can
                  change this in settings.
                </p>
              </div>
            </section>
          )}

          {step === 2 && (
            <section>
              <span className="grid size-11 place-items-center rounded-2xl bg-up-tint text-up">
                <Check className="size-5" />
              </span>
              <h1 className="mt-5 text-display font-semibold tracking-[-0.025em] text-ink text-balance">
                {profile.preferredName
                  ? `You're set, ${profile.preferredName}.`
                  : "You're set."}
              </h1>
              <p className="mt-3 text-body text-stone text-pretty">
                Your ledger, watchlist, settings and profile now follow you to
                any device you sign in on. Everything else ember shows is worked out
                fresh each time.
              </p>

              <ul className="mt-6 space-y-2.5">
                {[
                  "Log what you own, and ember values it live",
                  "It comes to you when a window opens or a position turns",
                  "Every call carries a size, a stop and a citation",
                ].map((line) => (
                  <li key={line} className="flex items-baseline gap-3">
                    <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                    <span className="text-caption text-graphite">{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>

        <footer
          className="mx-auto w-full max-w-xl shrink-0 border-t border-line px-5 pt-4 lg:px-10"
          style={{ paddingBottom: "max(1.25rem, var(--safe-bottom))" }}
        >
          <div className="flex items-center gap-3">
            {step > 0 && (
              <Button
                variant="ghost"
                size="xl"
                className="text-stone"
                onClick={() => setStep((s) => (s - 1) as Step)}
              >
                <ArrowLeft />
                Back
              </Button>
            )}

            <Button
              size="xl"
              className="ml-auto"
              onClick={() => {
                if (step === 0) commitName();
                if (step === 2) return done();
                setStep((s) => (s + 1) as Step);
              }}
            >
              {step === 2 ? "Open ember" : "Continue"}
              <ArrowRight />
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Heading({ title, lede }: { title: string; lede: string }) {
  return (
    <>
      <h1
        className={cn(
          "text-display font-semibold tracking-[-0.025em] text-ink text-balance",
        )}
      >
        {title}
      </h1>
      <p className="mt-3 text-body text-stone text-pretty">{lede}</p>
    </>
  );
}
