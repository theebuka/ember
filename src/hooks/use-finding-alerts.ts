"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useHydrated } from "@/hooks/use-hydrated";
import { useFindings, useInstruments, useQuotes, useRates } from "@/hooks/use-market-data";
import { useNotificationPermission } from "@/hooks/use-notification-permission";
import type { Finding } from "@/lib/api/client";
import { ACTION_LABELS, type Instrument } from "@/lib/api/types";
import { formatPercent, formatQuotePrice, formatWindowTime } from "@/lib/market/format";
import { USD_PER_UNIT } from "@/lib/market/universe";
import { derivePortfolio, positionInputs } from "@/lib/portfolio/derive";
import { showAlert } from "@/lib/notifications/permission";
import {
  planAlerts,
  timerDelay,
  type PendingAlert,
} from "@/lib/notifications/schedule";
import { useAdviceActions } from "@/store/use-advice-actions";
import { useAlertLog } from "@/store/use-alert-log";
import { useNotifications } from "@/store/use-notifications";
import { usePreferences } from "@/store/use-preferences";
import { useWatchlist } from "@/store/use-watchlist";
import { useLedger } from "@/hooks/use-ledger";

/**
 * The only thing in ember that reaches out rather than waiting to be opened.
 *
 * Mounted once, in the app shell, so an alert fires whichever screen you're
 * on. It costs nothing when it's off: the findings query is `enabled` on the
 * same condition the watcher is, so a user with alerts switched off never pays
 * for the inbox on a screen that doesn't show it.
 *
 * **It watches two things now.** An opportunity is timed — it waits for the
 * execution window and says how long you have. A risk is not: a breached stop
 * is true the moment it is true, there is nothing to route into a liquidity
 * crest because the position is already on, and delaying the warning until the
 * market's deepest hour would be exactly backwards. `planAlerts` has a
 * separate path for each, and risk is delivered first when both are due.
 *
 * **One timer, re-armed** — not one per finding. A hundred instruments would
 * mean a hundred timers to cancel correctly on every refetch, every profile
 * change and every toggle, and the one that leaks is the one that fires after
 * the user turned alerts off. The single timer is capped at a couple of
 * minutes (`MAX_TIMER_MS`) and re-evaluates, which is also what makes it
 * survive a sleeping laptop and a throttled background tab.
 *
 * **A visible tab gets a toast, not a system notification.** Interrupting the
 * operating system to tell someone about a screen they are looking at is the
 * behaviour that makes people disable notifications for an app. The
 * information is identical; only the delivery changes.
 *
 * The honest limit, stated in settings and worth repeating here: **this only
 * runs while ember is open.** Push-while-closed needs a server holding VAPID
 * keys and a subscription per user, and lands with accounts. The handlers in
 * `public/sw.js` are already waiting for it.
 */
export function useFindingAlerts(): void {
  const router = useRouter();
  const hydrated = useHydrated();

  const opportunities = usePreferences((s) => s.notifications.windowOpen);
  const risks = usePreferences((s) => s.notifications.riskAlerts);
  const riskProfile = usePreferences((s) => s.riskProfile);
  const base = usePreferences((s) => s.baseCurrency);
  const permission = useNotificationPermission();

  // Granted permission is required even for the in-app toast. Someone who
  // hasn't opted in shouldn't get ember's opinion pushed at them at all, and
  // the switch is what records that they did.
  const active = hydrated && (opportunities || risks) && permission === "granted";

  // What the plan shows (decision 289).
  const { transactions } = useLedger();
  const watching = useWatchlist((s) => s.symbols);

  const instrumentsQuery = useInstruments();
  const quotesQuery = useQuotes();
  const ratesQuery = useRates();

  /**
   * The book, derived here rather than passed in.
   *
   * The watcher is mounted in the shell and has no screen to take it from, and
   * `derivePortfolio` is pure — running it a second time costs a walk of the
   * ledger and cannot disagree with the copy on whichever screen is open.
   */
  const positions = useMemo(() => {
    if (!active) return [];
    return positionInputs(
      derivePortfolio({
        transactions,
        quotes: quotesQuery.data?.quotes ?? [],
        instruments: instrumentsQuery.data?.instruments ?? [],
        rates: ratesQuery.data?.rates ?? USD_PER_UNIT,
        base,
      }).positions,
    );
  }, [active, transactions, quotesQuery.data, instrumentsQuery.data, ratesQuery.data, base]);

  const findingsQuery = useFindings(riskProfile, positions, watching, {
    enabled: active,
  });

  const handled = useAdviceActions((s) => s.handled);
  const notified = useAlertLog((s) => s.notified);
  const record = useAlertLog((s) => s.record);
  /**
   * The inbox copy, written at the moment of delivery.
   *
   * Deliberately here rather than derived on the notifications screen: the
   * watcher only runs while ember is open, so a screen that re-derived "what
   * would be due now" would list interruptions that were never actually made.
   * The history has to be a record of what was sent.
   */
  const remember = useNotifications((s) => s.add);

  /**
   * A belt-and-braces guard against firing twice for the same finding.
   *
   * The persisted log is the real defence, but effects re-run under Strict
   * Mode and a duplicate system notification is the most annoying possible
   * bug to ship. Keys are cheap and the set dies with the tab.
   */
  const fired = useRef(new Set<string>());

  // Bumped by the timer to force a re-evaluation. The plan is derived from
  // `Date.now()`, which React has no way to depend on.
  const [tick, setTick] = useState(0);

  const deliver = useCallback(
    (alert: PendingAlert, finding: Finding, instrument?: Instrument) => {
      const title =
        finding.kind === "risk"
          ? `${finding.symbol} · ${severityWord(finding)}`
          : `${finding.symbol} · ${ACTION_LABELS[finding.assessment.action]}`;

      const body =
        finding.kind === "risk"
          ? [finding.headline, finding.risk?.action.label].filter(Boolean).join(" · ")
          : opportunityBody(alert, finding, instrument);

      remember({
        // The finding id plus the window it was fired for. `finding.id` alone
        // is `kind:symbol`, which repeats every time a call comes back round —
        // and the store dedupes by id, so a re-alert months later would be
        // silently dropped from the history it belongs in.
        id: `${finding.id}:${alert.until}`,
        tone: finding.risk?.severity === "critical" ? "critical" : "neutral",
        title,
        body,
        at: Date.now(),
        href: "/",
      });

      // A tab the user is looking at gets the in-app version.
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        toast(title, {
          description: body,
          duration: 12_000,
          action: { label: "View", onClick: () => router.push("/") },
        });
        return;
      }

      void showAlert({
        title,
        body,
        // Tagged per finding, not per symbol, so a stop breach and a buy
        // signal on the same instrument don't replace one another in the
        // OS tray — the same reason `kind` is in the log's key.
        tag: `ember-${finding.id}`,
        url: "/",
      });
    },
    [router, remember],
  );

  useEffect(() => {
    if (!active) return;

    const findings = findingsQuery.data?.findings;
    if (!findings) return;

    const now = Date.now();
    const plan = planAlerts({
      findings,
      handled,
      notified,
      now,
      opportunities,
      risks,
    });

    const byId = new Map(findings.map((f) => [f.id, f]));
    const instruments = new Map(
      (instrumentsQuery.data?.instruments ?? []).map((i) => [i.symbol, i]),
    );

    for (const alert of plan.due) {
      const key = `${alert.id}:${alert.signature}:${alert.until}`;
      if (fired.current.has(key)) continue;
      fired.current.add(key);

      const finding = byId.get(alert.id);
      if (finding) deliver(alert, finding, instruments.get(alert.symbol));
    }

    // Stale windows are recorded alongside the ones we fired, so they don't
    // come back round as "due" if the plan is recomputed a second later.
    if (plan.due.length > 0 || plan.stale.length > 0) {
      record([...plan.due, ...plan.stale], now);
    }

    const delay = timerDelay(plan, now);
    if (delay === null) return;

    const timer = setTimeout(() => setTick((n) => n + 1), delay);
    return () => clearTimeout(timer);
  }, [
    active,
    opportunities,
    risks,
    findingsQuery.data,
    instrumentsQuery.data,
    handled,
    notified,
    record,
    deliver,
    tick,
  ]);
}

/**
 * The one word a risk notification leads with.
 *
 * Reads the severity rather than the trigger, because a notification title has
 * room for a register and not for a taxonomy — "Stop breached" and "Position
 * warning" tell the user how much of their attention this wants, which is the
 * only decision they make from a lock screen.
 */
function severityWord(finding: Finding): string {
  switch (finding.risk?.severity) {
    case "critical":
      return "Action needed";
    case "warning":
      return "Position warning";
    default:
      return "Worth a look";
  }
}

function opportunityBody(
  alert: PendingAlert,
  finding: Finding,
  instrument?: Instrument,
): string {
  const { sizing } = finding.assessment;
  const parts = [`Window open until ${formatWindowTime(alert.until)}`];

  if (sizing) {
    parts.push(`${formatPercent(sizing.weight, { decimals: 1 })} of book`);
    parts.push(
      instrument
        ? `stop ${formatQuotePrice(instrument, sizing.stopPrice)}`
        : `stop ${sizing.stopPrice}`,
    );
  }

  return parts.join(" · ");
}
