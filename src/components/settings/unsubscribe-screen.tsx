"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, AlertTriangle } from "@/components/common/icon";
import { EmberPoint } from "@/components/common/ember-point";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AUTH_CONFIGURED } from "@/lib/supabase/config";

type State = "working" | "done" | "unknown" | "unavailable";

/**
 * Unsubscribe, signed out, in one click.
 *
 * Three things make this screen what it is rather than a form.
 *
 * **No sign-in.** A person clicking unsubscribe may have no session and no
 * intention of getting one; asking them to authenticate first is an unsubscribe
 * link that does not unsubscribe. It works because the privilege lives in a
 * `security definer` function in Postgres (`unsubscribe_digest`) rather than in a
 * service-role key in an API route — that key must never appear under `src/`, and
 * this is the narrow version of the same power: flip one boolean on one row,
 * chosen by a token the caller must already hold.
 *
 * **No confirm button.** The link is the consent. A screen that says "are you
 * sure you want to stop receiving email" is optimising for the sender, and
 * RFC 8058 one-click unsubscribe — which the digest sets a header for — requires
 * that a POST from the mail client alone be sufficient. A page that then asked
 * again would contradict the header.
 *
 * **The same answer either way.** A token that does not exist reports the same
 * outcome as one that does, because the alternative is an endpoint that tells
 * anybody whether a given token is real. Same reasoning as the magic link
 * refusing to say whether an address is registered (decision 101).
 */
export function UnsubscribeScreen() {
  const token = useSearchParams().get("token");
  const [result, setResult] = useState<"working" | "done" | "unavailable">("working");

  /**
   * Derived, not stored.
   *
   * A missing token and a deployment with no backend are both knowable at render
   * time, so writing them into state would be storing a value already in hand —
   * and it would mean this screen's first paint says "one moment" about a request
   * it is never going to make.
   */
  const state: State = !token
    ? "unknown"
    : !AUTH_CONFIGURED
      ? "unavailable"
      : result;

  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase || !token) return;

    let cancelled = false;
    void (async () => {
      const { error } = await supabase.rpc("unsubscribe_digest", { token });
      if (cancelled) return;
      // An error here is a transport or migration problem, not a wrong token —
      // the function answers `false` for an unknown one rather than throwing.
      setResult(error ? "unavailable" : "done");
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main
      /**
       * `id="main"` because the root layout's skip link targets it, and on a bare
       * route this `<main>` is the only one there is.
       *
       * Found by the audit rather than by review, and it was two defects wearing
       * one violation: the skip link pointed at an element that did not exist, and
       * axe's `region` rule only exempts a skip link whose target resolves — so
       * with the target missing it reported the link itself as content outside a
       * landmark. Both other bare routes already do this; this screen shipped in
       * phase 26 without it because no route list visited it.
       */
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10"
    >
      <EmberPoint className="size-9 text-brand" />

      {state === "working" && (
        <>
          <h1 className="mt-6 text-title font-semibold text-ink">One moment</h1>
          <p className="mt-2 text-body text-stone">Turning your digest off.</p>
        </>
      )}

      {state === "done" && (
        <>
          <h1 className="mt-6 flex items-center gap-2 text-title font-semibold text-ink">
            <Check weight="fill" className="size-5 text-up" />
            Unsubscribed
          </h1>
          <p className="mt-2 text-body text-stone">
            ember won&apos;t email you digests any more. Nothing else changed —
            your ledger, your watchlist and your in-app alerts are untouched, and
            you can turn digests back on in settings whenever you like.
          </p>
        </>
      )}

      {state === "unknown" && (
        <>
          <h1 className="mt-6 text-title font-semibold text-ink">
            This link is incomplete
          </h1>
          <p className="mt-2 text-body text-stone">
            It&apos;s missing the part that says which digest to stop. Mail clients
            sometimes trim long links — opening the original email and clicking
            again usually fixes it, and the switch in settings always works.
          </p>
        </>
      )}

      {state === "unavailable" && (
        <>
          <h1 className="mt-6 flex items-center gap-2 text-title font-semibold text-ink">
            <AlertTriangle className="size-5 text-stone" />
            Couldn&apos;t reach ember
          </h1>
          <p className="mt-2 text-body text-stone">
            Something between here and the server didn&apos;t answer, so nothing has
            changed yet. Try the link again in a minute, or turn digests off in
            settings — that route doesn&apos;t depend on this one.
          </p>
        </>
      )}

      <Link
        href="/settings?tab=alerts"
        className="mt-7 text-caption font-medium text-brand-text underline-offset-4 hover:underline"
      >
        Alert settings
      </Link>
    </main>
  );
}
