"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CaretRight,
  BellRinging,
  Check,
  CircleNotch,
  Crosshair,
  Envelope,
  Sparkle,
  type IconComponent,
} from "@/components/common/icon";
import { ProArt } from "@/components/onboarding/onboarding-art";
import { Logo } from "@/components/shell/logo";
import { Tag } from "@/components/signals/call-parts";
import { formatDate } from "@/lib/market/format";
import { usePriceLine } from "@/components/plan/subscription";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePlan } from "@/hooks/use-plan";
import { useSession } from "@/hooks/use-session";
import { PLAN_PREVIEW_ENABLED, usePlanPreview } from "@/lib/plan-preview";

/** How long to wait for the payment to land before saying it hasn't. */
const CONFIRM_FOR_MS = 30_000;
const POLL_EVERY_MS = 2_500;

const UNLOCKED: { icon: IconComponent; title: string; body: string; href: string }[] = [
  {
    icon: Crosshair,
    title: "Every call",
    body: "Buy or sell, when, how much and the stop, on every market.",
    href: "/signals",
  },
  {
    icon: Envelope,
    title: "The email digest",
    body: "Turn it on for the instruments you follow.",
    href: "/settings?tab=alerts",
  },
  {
    icon: BellRinging,
    title: "Push alerts",
    body: "Turn them on for each device, and hear about a window with ember closed.",
    href: "/settings?tab=alerts",
  },
];

/**
 * Where a checkout sends somebody back to.
 *
 * **The redirect is not the payment.** A merchant of record returns the browser
 * the moment the card is accepted and tells ember separately, by webhook, a few
 * seconds later. Saying "You're on Pro" on arrival would be true most of the time
 * and wrong exactly when it matters, so the screen reads the entitlement and
 * polls until it lands — and after half a minute says plainly that it hasn't,
 * rather than spinning forever.
 *
 * A bare route: a bottom nav under a confirmation invites leaving before the
 * one thing on the screen has finished.
 */
export function ProWelcome() {
  const hydrated = useHydrated();
  const { user, ready: sessionReady } = useSession();
  const { plan, ready, subscription, refresh } = usePlan();
  const preview = usePlanPreview();
  const previewing = PLAN_PREVIEW_ENABLED && preview !== "off";
  const pro = plan === "pro";

  // Each attempt polls for CONFIRM_FOR_MS; "Check again" starts another.
  const [attempt, setAttempt] = useState(0);
  const [timedOutAttempt, setTimedOutAttempt] = useState<number | null>(null);
  const timedOut = timedOutAttempt === attempt;

  // Poll while signed in and not yet Pro; stop on Pro or at the deadline.
  useEffect(() => {
    if (!user || pro || timedOut) return;
    const poll = setInterval(refresh, POLL_EVERY_MS);
    const stop = setTimeout(() => setTimedOutAttempt(attempt), CONFIRM_FOR_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [user, pro, timedOut, attempt, refresh]);

  const price = usePriceLine(subscription.status === "active" ? subscription.billing : null);

  const state = !hydrated || (!sessionReady && !previewing)
    ? "loading"
    : pro
      ? "done"
      : !user && !previewing
        ? "signed-out"
        : !ready || !timedOut
          ? "confirming"
          : "not-yet";

  const billingLine =
    subscription.status !== "active"
      ? null
      : subscription.billing
        ? `${subscription.billing === "yearly" ? "Yearly" : "Monthly"}${price ? `, ${price.replace(/ a (year|month)$/, "")}` : ""}`
        : "Added to this account";
  const nextLine =
    subscription.status !== "active" || subscription.periodEnd === null
      ? null
      : { label: subscription.renews ? "Renews" : "Ends", value: formatDate(subscription.periodEnd) };

  return (
    <main id="main" className="flex min-h-dvh flex-col bg-ground lg:h-dvh lg:flex-row lg:overflow-hidden">
      {/* Onboarding's frame: a third of a phone, about half a desktop. */}
      <aside className="relative h-[34dvh] min-h-[260px] max-h-[320px] shrink-0 overflow-hidden lg:h-auto lg:max-h-none lg:w-[46%] lg:max-w-[760px] dark:border-line dark:max-lg:border-b dark:lg:border-r">
        <ProArt confirmed={state === "done"} />
      </aside>

      <div className="flex min-h-0 flex-1 flex-col lg:overflow-y-auto">
        <header className="px-5 pt-5 lg:px-12" style={{ paddingTop: "max(1.25rem, var(--safe-top))" }}>
          <Logo size={20} />
        </header>

        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-10 lg:px-0">
          {state === "done" ? (
            <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
              <Tag tone="brand">
                <Check weight="bold" className="size-3" />
                Pro is on
              </Tag>
              <h1 className="mt-4 text-display font-semibold tracking-display text-ink">
                You&apos;re on Pro
              </h1>
              <p className="mt-2 text-body text-stone">
                Thanks for backing ember. Everything below is on now.
              </p>

              {/* The receipt, in the three facts a subscriber checks. */}
              <dl className="mt-8 divide-y divide-line rounded-xl border border-line text-caption">
                <div className="flex justify-between gap-4 px-4 py-3">
                  <dt className="text-stone">Plan</dt>
                  <dd className="flex items-center gap-1.5 font-medium text-ink">
                    <Sparkle weight="fill" className="size-3.5 text-brand" />
                    ember Pro
                  </dd>
                </div>
                {billingLine && (
                  <div className="flex justify-between gap-4 px-4 py-3">
                    <dt className="text-stone">Billing</dt>
                    <dd className="num font-medium text-ink">{billingLine}</dd>
                  </div>
                )}
                {nextLine && (
                  <div className="flex justify-between gap-4 px-4 py-3">
                    <dt className="text-stone">{nextLine.label}</dt>
                    <dd className="num font-medium text-ink">{nextLine.value}</dd>
                  </div>
                )}
              </dl>

              <h2 className="eyebrow mt-10">What&apos;s on now</h2>
              <ul className="mt-3 space-y-2">
                {UNLOCKED.map((item) => (
                  <li key={item.title}>
                    <Link
                      href={item.href}
                      className="group flex items-center gap-4 rounded-xl border border-line px-4 py-3.5 outline-none transition-colors hover:border-line-strong hover:bg-surface-2/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-text">
                        <item.icon className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-body font-medium text-ink">{item.title}</span>
                        <span className="block text-caption text-stone">{item.body}</span>
                      </span>
                      <CaretRight className="size-4 shrink-0 text-stone transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-10 flex flex-col gap-2 sm:flex-row">
                <Button asChild size="lg" className="sm:flex-1">
                  <Link href="/">Go to Home</Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="sm:flex-1">
                  <Link href="/settings?tab=plan">Manage plan</Link>
                </Button>
              </div>
            </div>
          ) : state === "signed-out" ? (
            <div>
              <h1 className="text-title font-semibold tracking-title text-ink">Sign in to finish</h1>
              <p className="mt-2 text-body text-stone">
                Pro belongs to the account you paid with. Sign in with it to turn Pro on here.
              </p>
              <Button asChild size="lg" className="mt-8 w-full sm:w-auto sm:min-w-48">
                <Link href="/auth?next=%2Fpro%2Fwelcome">Sign in</Link>
              </Button>
            </div>
          ) : state === "not-yet" ? (
            <div>
              <h1 className="text-title font-semibold tracking-title text-ink">
                Your payment hasn&apos;t come through yet
              </h1>
              <p className="mt-2 text-body text-stone">
                If you were charged, Pro turns on within a few minutes and your plan page updates on its own.
              </p>
              <div className="mt-8 flex flex-col gap-2 sm:flex-row">
                <Button
                  size="lg"
                  className="sm:flex-1"
                  onClick={() => {
                    setAttempt((n) => n + 1);
                    refresh();
                  }}
                >
                  Check again
                </Button>
                <Button asChild variant="outline" size="lg" className="sm:flex-1">
                  <Link href="/">Go to Home</Link>
                </Button>
              </div>
            </div>
          ) : (
            // Loading and confirming share one shape, so the first paint doesn't jump.
            <div aria-live="polite">
              <CircleNotch className="size-6 text-brand motion-safe:animate-spin" />
              <h1 className="mt-4 text-title font-semibold tracking-title text-ink">
                Confirming your payment
              </h1>
              <p className="mt-2 text-body text-stone">This usually takes a few seconds.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
