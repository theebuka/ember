"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle, Envelope } from "@/components/common/icon";
import { PageBody } from "@/components/common/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AUTH_CONFIGURED } from "@/lib/supabase/config";
import { safeNext } from "@/lib/onboarding";

type State =
  | { step: "email" }
  | { step: "sending" }
  | { step: "sent"; email: string }
  | { step: "error"; message: string };

/**
 * Signing in.
 *
 * **A one-time link, and no password anywhere.** Not a convenience choice.
 * A password field means ember is in the business of storing, resetting and
 * being breached for credentials, on a product where the only thing an account
 * buys you today is a ledger that survives clearing your browser. The link is
 * held by the user's mail provider, which already protects their identity
 * better than a fifth password they'd reuse.
 *
 * It also sidesteps the ugliest state in the flow. Password sign-up has to
 * distinguish "wrong password" from "no such account", and every honest answer
 * to that leaks whether an address is registered. A magic link says the same
 * sentence either way: check your email.
 *
 * **Everything here is optional.** With no Supabase project configured this
 * route is unreachable and nothing links to it, because an account is an
 * addition to a local-first app rather than the price of using it —
 * `lib/supabase/config.ts`.
 */
export function AuthScreen() {
  const params = useSearchParams();
  const next = safeNext(params.get("next")) ?? "/settings";

  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ step: "email" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = supabaseBrowser();
    if (!supabase) return;

    setState({ step: "sending" });

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Absolute, because Supabase redirects the browser here from its own
        // domain. It must also be on the project's allow-list, or the link
        // silently lands on the site root having consumed the code.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setState({ step: "error", message: error.message });
      return;
    }
    setState({ step: "sent", email: email.trim() });
  }

  if (!AUTH_CONFIGURED) {
    return (
      <>
        <PageHeader narrow title="Account" back="/settings" />
        <PageBody narrow className="pb-12">
          <p className="text-body text-stone">
            Accounts aren&apos;t available in this version of ember. Everything you enter stays on this device.
          </p>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader narrow title="Sign in" back="/settings" />

      <PageBody narrow className="pb-12">
        {state.step === "sent" ? (
          <div className="max-w-md">
            <span className="grid size-11 place-items-center rounded-xl bg-up-tint text-up">
              <CheckCircle className="size-5" />
            </span>
            <h2 className="mt-5 text-title font-semibold text-ink">Check your email</h2>
            <p className="mt-2 text-body text-stone">
              A sign-in link is on its way to{" "}
              <span className="font-medium text-ink">{state.email}</span>. Open it on this device to continue.
            </p>
            <Button
              variant="ghost"
              size="lg"
              className="mt-5 -ml-3 text-stone"
              onClick={() => setState({ step: "email" })}
            >
              <ArrowLeft />
              Use a different address
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="max-w-md">
            <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-stone">
              <Envelope className="size-5" />
            </span>

            <h2 className="mt-5 text-title font-semibold text-ink">
              Keep your data across devices
            </h2>
            <p className="mt-2 text-body text-stone">
              Back up your trades, watchlist and settings, and use them on any device.
            </p>

            <div className="mt-7">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2"
              />
            </div>

            {state.step === "error" && (
              <p className="mt-3 text-caption text-down">{state.message}</p>
            )}

            <Button
              type="submit"
              size="xl"
              className="mt-5 w-full"
              disabled={state.step === "sending" || email.trim().length === 0}
            >
              {state.step === "sending" ? "Sending…" : "Email me a link"}
            </Button>

            {/* The exact list, in the same register as ADR 0025's disclosure
                in settings. "We take privacy seriously" is what an app says
                when it would rather not enumerate. */}
            <p className="mt-5 text-micro text-stone">
              No password needed — ember emails you a link.
            </p>
          </form>
        )}
      </PageBody>
    </>
  );
}
