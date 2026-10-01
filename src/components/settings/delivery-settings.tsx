"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DeviceMobile, Envelope } from "@/components/common/icon";
import { SettingGroup, SettingRow } from "@/components/settings/setting-row";
import { Segmented } from "@/components/common/segmented";
import { Switch } from "@/components/ui/switch";
import { usePlan } from "@/hooks/use-plan";
import { useSession } from "@/hooks/use-session";
import { PlanCard, PlanChip } from "@/components/plan/upsell";
import { canUse, PLAN_RULES } from "@/lib/plan";
import {
  isPushBlocked,
  PushError,
  pushState,
  subscribeToPush,
  unsubscribeFromPush,
  type PushState,
} from "@/lib/notifications/push";
import { PUSH_CONFIGURED } from "@/lib/supabase/config";
import { supabaseBrowser } from "@/lib/supabase/client";

type Cadence = "daily" | "weekly";

interface EmailPrefs {
  digest_enabled: boolean;
  frequency: Cadence;
  min_findings: number;
}

const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

/**
 * Delivery — the two channels that reach you with ember closed.
 *
 * Everything above this in settings controls *what* ember decides to tell you.
 * This controls whether it can reach you at all when there is no tab open, which
 * until phase 26 it could not: the alert watcher ran in the page, so a window
 * that opened overnight was recorded in the inbox and never delivered.
 *
 * **The whole group is absent without an account.** Both channels need somewhere
 * to store a destination, and rendering a switch for a service that isn't
 * configured is the disabled-control problem decision 047 already ruled out —
 * "off" is a claim about a setting, and this one would be a claim about a
 * setting that does not exist. Same reasoning as every other account control.
 *
 * **The two channels are deliberately not symmetrical, and the copy says why.**
 * Push carries everything, including a warning about a position you hold. Email
 * cannot: loss prevention needs your holdings, and holdings never persist on the
 * server (ADR 0025 sends four derived numbers per request and stores none of
 * them). A digest is therefore scoped to your watchlist. That is a real
 * limitation and burying it would let someone trust an email to do the one thing
 * it structurally cannot.
 */
export function DeliverySettings() {
  const { user } = useSession();
  const { plan } = usePlan();
  const mayEmail = canUse("email-digest", plan);
  // `null` while the browser is being asked. It started as `"unavailable"`, so
  // every visit opened on "This browser doesn't support push" for the length of
  // an async check, on browsers that support it perfectly well.
  const [push, setPush] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  const [email, setEmail] = useState<EmailPrefs | null>(null);

  useEffect(() => {
    void pushState().then(setPush);
  }, []);

  useEffect(() => {
    const supabase = supabaseBrowser();
    // No reset in the else branch: `null` already means "not loaded", and the
    // component returns null without a user anyway — clearing it here would be
    // writing a value the render path never reads.
    if (!supabase || !user) return;

    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("email_prefs")
        .select("digest_enabled, frequency, min_findings")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      // No row yet is not an error — it is "never asked for a digest", which is
      // the default an account starts in. The row is written on first change.
      setEmail(
        (data as EmailPrefs | null) ?? {
          digest_enabled: false,
          frequency: "weekly",
          min_findings: 3,
        },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const saveEmail = useCallback(
    async (patch: Partial<EmailPrefs>) => {
      const supabase = supabaseBrowser();
      if (!supabase || !user || !email) return;

      const next = { ...email, ...patch };
      // Optimistic, with the same discipline as everywhere else in the app: the
      // control moves now and the toast reports the failure if there is one.
      setEmail(next);

      const { error } = await supabase.from("email_prefs").upsert(
        { user_id: user.id, ...next, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
      if (error) {
        setEmail(email);
        toast.error("That didn't save", { description: error.message });
      }
    },
    [email, user],
  );

  const togglePush = useCallback(async () => {
    setPushBusy(true);
    try {
      const next = push === "on" ? await unsubscribeFromPush() : await subscribeToPush();
      setPush(next);
      if (next === "blocked") {
        toast.error("Your browser is blocking notifications", {
          description:
            "Allow them in this site's settings, then try again.",
        });
      }
    } catch (error) {
      /**
       * There was no `catch` here, and the call is fired with `void`, so a
       * rejection went nowhere: `pushManager.subscribe` refusing (a push
       * service error, or a key that changed since this browser last
       * subscribed) left the switch where it was and said nothing at all.
       */
      toast.error(push === "on" ? "Push didn't switch off" : "Push didn't switch on", {
        description:
          error instanceof PushError
            ? error.message
            : "The browser's push service refused. Try again in a moment.",
      });
    } finally {
      setPushBusy(false);
    }
  }, [push]);

  // Nothing to show: no account, or no VAPID key on this deployment.
  if (!user || !PUSH_CONFIGURED) return null;

  return (
    <SettingGroup>
      <SettingRow
        label={
          <span className="flex items-center gap-2">
            <DeviceMobile className="size-4 text-stone" />
            Push to this device
          </span>
        }
        description={
          push === null ? "Checking…" : pushDescription(push, canUse("unlimited-alerts", plan))
        }
        control={
          <Switch
            checked={push === "on"}
            // **Every state that cannot act disables the control**, not just
            // `blocked`. Left enabled, `insecure` and `no-worker` gave a switch
            // that accepted a tap, moved nothing and said nothing — and in the
            // `no-worker` case hung on a promise that never settles, leaving the
            // control disabled forever with a not-allowed cursor. A switch that
            // silently refuses is worse than one that is visibly off (decision
            // 047); the reason is in the description beside it.
            disabled={pushBusy || push === null || isPushBlocked(push)}
            onCheckedChange={() => void togglePush()}
            aria-label="Push notifications to this device"
          />
        }
      />

      {/* The in-app test lives with the alert switches above; it exercises the
          same display code. A real send needs the VAPID key — `npm run push:test`. */}

      <SettingRow
        label={
          <span className="flex items-center gap-2">
            <Envelope className="size-4 text-stone" />
            Email digest
            {!mayEmail && <PlanChip />}
          </span>
        }
        description="A summary email when instruments on your watchlist match your risk profile."
        control={
          <Switch
            checked={mayEmail && email?.digest_enabled === true}
            disabled={!email || !mayEmail}
            onCheckedChange={(digest_enabled) => void saveEmail({ digest_enabled })}
            aria-label="Email digest"
          />
        }
      >
        {/* The pitch sits under the row it belongs to, and only when the gate is
            what is stopping you — not beside a switch you could already use. */}
        {!mayEmail && <PlanCard feature="email-digest" className="mt-3.5" />}

        {mayEmail && email?.digest_enabled && (
          <div className="mt-3.5 space-y-3.5">
            <Segmented
              aria-label="Digest frequency"
              value={email.frequency}
              onChange={(frequency) => void saveEmail({ frequency })}
              options={CADENCE_OPTIONS}
              className="flex w-full [&>button]:flex-1"
            />
            <p className="text-caption text-stone">
              {email.frequency === "daily"
                ? "At most once a day"
                : "At most once a week"}
              , when at least {email.min_findings}{" "}
              {email.min_findings === 1 ? "call matches" : "calls match"}.
            </p>
            <p className="rounded-xl bg-surface-2 p-3 text-caption text-stone">
              <strong className="font-medium text-graphite">
                Digests cover your watchlist.
              </strong>{" "}
              Warnings about what you hold come in the app and by push.
            </p>
          </div>
        )}
      </SettingRow>
    </SettingGroup>
  );
}

/**
 * What the push row says, and every branch names something the reader can act on.
 *
 * Decision 046 established that `denied` is a state with its own copy rather than
 * a switch left off. These are the states nobody wrote that copy for — and they
 * are the ones a person developing this app hits every single time, which is how
 * they went unnoticed: the state that needs the clearest sentence is the one the
 * author never sees in production.
 */
const DEV = process.env.NODE_ENV !== "production";

function pushDescription(state: PushState, uncapped: boolean): string {
  switch (state) {
    case "blocked":
      return "Blocked by this browser. Allow notifications in this site's settings.";
    // The fix a developer needs is not a sentence a customer should read. These
    // named `npm run dev:https` and an environment variable to anybody whose
    // worker failed to register — which in production is a real reader in, say,
    // a private window, being told to edit a config file.
    case "insecure":
      // Names the fix rather than the rule. "Requires a secure context" is true
      // and tells a reader on a phone nothing they can do about it.
      return DEV
        ? "Not on HTTPS, so the browser won't allow push. A LAN address never qualifies; use a tunnel with a real certificate."
        : "Push needs a secure connection. Open ember over https://.";
    case "no-worker":
      return DEV
        ? "No service worker registered. Set NEXT_PUBLIC_EMBER_SW_IN_DEV=1 and restart."
        : "Push couldn't start in this browser. Reload, or leave private browsing.";
    case "unavailable":
      return "This browser doesn't support push. On iPhone, add ember to your home screen first.";
    default:
      return uncapped
        ? "Alerts when ember is closed. Turn on for each device."
        : `Alerts when ember is closed. Turn on for each device. Up to ${PLAN_RULES.free.alertsPerDay} a day on Free.`;
  }
}
