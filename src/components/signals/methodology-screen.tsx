"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/common/error-state";
import { PageBody } from "@/components/common/page-body";
import { SectionHeader } from "@/components/common/section-header";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useStrategies } from "@/hooks/use-market-data";
import { ApiError, type StrategiesResponse } from "@/lib/api/client";
import { describeSpan } from "@/lib/market/format";
import {
  MARKET_LABELS,
  RISK_PROFILES,
  STRATEGY_FAMILY_LABELS,
  type MarketKind,
  type StrategySummary,
} from "@/lib/api/types";
import { usePreferences } from "@/store/use-preferences";
import { useSynthetic } from "@/components/market/data-source";
import { cn } from "@/lib/utils";

/**
 * How ember decides, stated so it can be checked.
 *
 * **Every number on this page is read out of the engine, not transcribed.**
 * The strategy list is the registry; the regime table is produced by calling
 * the real `regimeWeight()` against concrete regimes; the profile multipliers
 * are `PROFILE_WEIGHTS`. A methodology page maintained by hand is a document
 * that was true once, and on a product whose whole claim is "you can check
 * this", a stale table is worse than no table.
 *
 * The prose here is the short version. `docs/methodology.md` is the long one,
 * and the two must not disagree.
 */

const RULED_OUT: { rejected: string; why: string }[] = [
  {
    rejected: "Stock-to-flow",
    why: "Broke badly out of sample. Keeping it would undermine everything beside it.",
  },
  {
    rejected: "Chart patterns",
    why: "Head-and-shoulders, flags and the rest are widely believed, poorly evidenced, and unfalsifiable as usually stated.",
  },
  {
    rejected: "Sentiment scraping",
    // Restated in phase 16, when News shipped. The rejection had to survive
    // the arrival of a headline feed, and the version that only said
    // "sentiment scraping" would have read as an argument about *scrapers*
    // rather than about news — leaving a reader to reasonably assume the tab
    // full of headlines feeds the engine. It doesn't. ADR 0027.
    why: "Not reproducible, not citable, and trivially gamed. The News tab is unaffected by this and does not affect it: headlines are context you can read, never an input ember scores. Nothing on that page reaches the engine.",
  },
  {
    rejected: "An opaque model score",
    why: "The point is that you can read why. A number you can't interrogate is the gimmick with extra steps.",
  },
];

export function MethodologyScreen() {
  const riskProfile = usePreferences((s) => s.riskProfile);
  const query = useStrategies(riskProfile);
  /**
   * Where the numbers came from, read rather than written.
   *
   * This paragraph asserted "prices in this build are generated" as a literal
   * string for five phases, which was true for all of them and became a lie
   * the moment a feed was connected — on the one page in the app whose entire
   * job is to be checkable. Same rule as decision 030: derived from what is
   * actually running, never transcribed.
   */
  const synthetic = useSynthetic();

  const strategies = query.data?.strategies;

  const byFamily = useMemo(() => {
    const groups = new Map<string, StrategySummary[]>();
    for (const strategy of strategies ?? []) {
      const list = groups.get(strategy.family) ?? [];
      list.push(strategy);
      groups.set(strategy.family, list);
    }
    return [...groups.entries()];
  }, [strategies]);

  return (
    <>
      <PageHeader title="Methodology" back="/signals" />

      <PageBody narrow className="space-y-8 pb-12">
        {query.error ? (
          <ErrorState
            message={
              query.error instanceof ApiError
                ? query.error.message
                : "The methodology didn't load."
            }
            onRetry={() => query.refetch()}
          />
        ) : query.isPending || !query.data ? (
          <MethodologySkeleton />
        ) : (
          <>
            {/* ── The rule ─────────────────────────────────────────────── */}
            <h2 className="text-heading font-semibold text-ink">
              Every signal traces to published work
            </h2>
            <p className="mt-1.5 text-body text-graphite">
              No invented heuristics, no unpublished rule sets, no opaque model
              score. If a rule can&apos;t be cited, it doesn&apos;t ship. All{" "}
              {query.data.strategies.length} of them are below, with the paper or
              book each comes from.
            </p>
            {synthetic ? (
              <p className="mt-3 text-caption text-stone">
                Prices in this build are generated, so the numbers those rules
                are currently reading are simulated. The rules themselves are
                the real ones.{" "}
                <Link
                  href="/signals/track-record"
                  className="underline underline-offset-2 hover:text-graphite"
                >
                  What that means for the track record
                </Link>
                .
              </p>
            ) : (
              <p className="mt-3 text-caption text-stone">
                Prices are live. Equities and their filed accounts come from
                Yahoo and Finnhub, crypto from CoinGecko, and exchange rates
                are the European Central Bank&rsquo;s daily reference set.
                Three things are still modelled and say so where they appear:
                central-bank policy rates, the macro release calendar, and a
                coin&rsquo;s realised capitalisation.{" "}
                <Link
                  href="/signals/track-record"
                  className="underline underline-offset-2 hover:text-graphite"
                >
                  What the record is measured over
                </Link>
                .
              </p>
            )}

            {/* ── Pipeline ─────────────────────────────────────────────── */}
            <section>
              <SectionHeader title="How a recommendation is assembled" />
              <ol className="space-y-3">
                <Step
                  name="Indicators"
                  body="Pure functions over daily OHLCV bars — moving averages, RSI, ATR, Donchian channels, regression slope. Each returns a value per bar with nulls through its warm-up, so nothing downstream can read an indicator before it has enough history."
                />
                <Step
                  name="Strategies"
                  body={`Each of the ${query.data.strategies.length} published rules reads that history and returns a score from −1 to +1, its own confidence, a holding horizon, and a sentence of plain-English reasoning. A rule with no view says so rather than guessing.`}
                />
                <Step
                  name="Ensemble"
                  body="Scores are blended by weight — each rule's own confidence, times how much this regime trusts its family, times your risk profile's multiplier. Disagreement between rules lowers the blended confidence rather than cancelling out silently."
                />
                <Step
                  name="Regime filter"
                  body="Volatility is judged as a percentile of the instrument's own history, not against a fixed threshold — 60% annualised is a crisis in EURUSD and an ordinary Tuesday in SOL. The filter can only ever reduce confidence; a favourable regime is not evidence."
                />
                <Step
                  name="Sizing"
                  body="Volatility targeting to your profile's annualised target, scaled by conviction and cut by a fixed quarter. A wild instrument gets a smaller position than a placid one at identical conviction, which is what makes a signal on SOL and a signal on EURUSD comparable."
                />
                <Step
                  name="Window"
                  // The span is read from the engine, not written here. This
                  // said "across three days" for a phase after crypto's
                  // horizon became 36 hours.
                  body={`Market liquidity times scheduled-event avoidance times the signal's own decay, hour by hour across ${horizonSentence(query.data.horizonHours)} — long enough to reach the next liquid session and no longer. The band on each card is that product drawn directly.`}
                />
              </ol>
            </section>

            {/* ── The strategies ───────────────────────────────────────── */}
            <section>
              <SectionHeader
                title="The rules"
                hint={`${query.data.strategies.length} in the ensemble`}
              />
              <div className="space-y-8">
                {byFamily.map(([family, strategies]) => (
                  <section key={family}>
                  <h3 className="eyebrow mb-3">
                    {STRATEGY_FAMILY_LABELS[family] ?? family}
                  </h3>
                  <ul className="space-y-4">
                    {strategies.map((strategy) => (
                      <li key={strategy.id}>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="text-caption font-medium text-ink">
                            {strategy.name}
                          </span>
                          <span className="flex gap-1">
                            {strategy.appliesTo.map((market) => (
                              <span
                                key={market}
                                className="rounded-md bg-surface-2 px-1.5 py-0.5 text-micro text-stone"
                              >
                                {MARKET_LABELS[market as MarketKind]}
                              </span>
                            ))}
                          </span>
                          <span className="num ml-auto text-micro text-stone">
                            needs {strategy.minBars} bars
                          </span>
                        </div>
                        <p className="mt-1.5 text-caption text-stone">
                          {strategy.citation.claim}
                        </p>
                        <p className="mt-1 text-micro text-stone">
                          {strategy.citation.authors} ({strategy.citation.year}),{" "}
                          <span className="italic">{strategy.citation.title}</span>
                          {strategy.citation.where && ` · ${strategy.citation.where}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                  </section>
                ))}
              </div>
            </section>

            {/* ── Regime table ─────────────────────────────────────────── */}
            <section>
              <SectionHeader
                title="What each regime does to each family"
                hint="computed by calling the engine"
              />
              <p className="mb-4 text-caption text-stone">
                Every rule is <em>conditionally</em> good. Breakouts work in trends
                and bleed in ranges; mean reversion works in ranges and is ruinous
                in a downtrend; carry earns steadily until it doesn&apos;t.
                Weighting them identically in all conditions would average a good
                rule and an actively harmful one into mush.
              </p>

              <WeightTable
                families={query.data.families}
                regimes={query.data.regimes}
              />

              <p className="mt-3 border-t border-line pt-3 text-micro text-stone">
                These multipliers are <strong>reasoned judgement calls, not fitted
                parameters</strong>. They are stated here, and in the source, so
                they can be argued with. The figures above are produced by calling
                the engine&apos;s own function, so this table cannot drift from the
                code.
              </p>
            </section>

            {/* ── Profile weights ──────────────────────────────────────── */}
            <section>
              <SectionHeader
                title="Your risk profile"
                hint={RISK_PROFILES[riskProfile].label.toLowerCase()}
              />
              <p className="text-caption text-stone">
                {RISK_PROFILES[riskProfile].consequence}
              </p>

              <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-line pt-3.5 sm:grid-cols-4">
                <ProfileStat
                  label="Volatility target"
                  value={`${(RISK_PROFILES[riskProfile].volTarget * 100).toFixed(0)}%`}
                  hint="annualised"
                />
                <ProfileStat
                  label="Single-position cap"
                  value={`${(RISK_PROFILES[riskProfile].maxWeight * 100).toFixed(0)}%`}
                  hint="of the book"
                />
                {/* Both halves of the bar, because both move with the
                    profile and the second one is usually the binding
                    constraint — confidence rarely exceeds 55. ADR 0013. */}
                <ProfileStat
                  label="Conviction floor"
                  value={RISK_PROFILES[riskProfile].actionThreshold.toFixed(2)}
                  hint="blended score, 0–1"
                />
                <ProfileStat
                  label="Evidence floor"
                  value={String(RISK_PROFILES[riskProfile].confidenceFloor)}
                  hint="confidence, 0–100"
                />
              </dl>

              <h3 className="eyebrow mt-5 mb-2">Family multipliers</h3>
              {Object.keys(query.data.profileWeights).length === 0 && (
                // Balanced defines no overrides, so every row reads ×1.00.
                // A table of identical numbers looks broken unless it says
                // why — and "this profile is the baseline" is the finding.
                <p className="mb-2 text-micro text-stone">
                  Balanced is the neutral baseline: no family is favoured. The
                  conservative and aggressive profiles lean away from this.
                </p>
              )}
              <ul className="grid grid-cols-2 gap-x-5 gap-y-1.5 sm:grid-cols-3">
                {query.data.families.map((family) => {
                  const weight = query.data.profileWeights[family] ?? 1;
                  return (
                    <li
                      key={family}
                      className="flex items-baseline justify-between gap-2 text-caption"
                    >
                      <span className="truncate text-stone">
                        {STRATEGY_FAMILY_LABELS[family] ?? family}
                      </span>
                      <span
                        className={cn(
                          "num shrink-0",
                          weight > 1
                            ? "text-ink"
                            : weight < 1
                              ? "text-stone"
                              : "text-stone",
                        )}
                      >
                        ×{weight.toFixed(2)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* ── Ruled out ────────────────────────────────────────────── */}
            <section>
              <SectionHeader
                title="Ruled out"
                hint="and why — so it isn't relitigated"
              />
              <ul className="divide-y divide-line">
                {RULED_OUT.map((entry) => (
                  <li key={entry.rejected} className="py-2.5">
                    <p className="text-caption font-medium text-ink">
                      {entry.rejected}
                    </p>
                    <p className="mt-0.5 text-caption text-stone">{entry.why}</p>
                  </li>
                ))}
              </ul>
            </section>

            <p className="px-1 text-micro text-stone">
              ember gives information, not financial advice. None of this accounts for
              your circumstances.
            </p>
          </>
        )}
      </PageBody>
    </>
  );
}

/**
 * The regime table.
 *
 * A grid on desktop, stacked per regime on mobile. Multipliers below 1 are set
 * in mist and above 1 in ink, so the shape of the filter — mostly damping,
 * occasionally leaning in — is legible before any number is read.
 */
function WeightTable({
  families,
  regimes,
}: {
  families: readonly string[];
  regimes: readonly { key: string; label: string; description: string; weights: Record<string, number> }[];
}) {
  return (
    <>
      <div className="space-y-4 md:hidden">
        {regimes.map((regime) => (
          <div key={regime.key}>
            <p className="text-caption font-medium text-ink">{regime.label}</p>
            <p className="mt-0.5 text-micro text-stone">{regime.description}</p>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {families.map((family) => (
                <li
                  key={family}
                  className="flex items-baseline justify-between gap-2 text-caption"
                >
                  <span className="truncate text-stone">
                    {STRATEGY_FAMILY_LABELS[family] ?? family}
                  </span>
                  <Multiplier value={regime.weights[family] ?? 1} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full">
          <thead>
            <tr>
              <th className="pb-2 text-left text-micro font-normal text-stone">
                Family
              </th>
              {regimes.map((regime) => (
                <th
                  key={regime.key}
                  scope="col"
                  className="pb-2 text-right text-micro font-normal text-stone"
                  title={regime.description}
                >
                  {regime.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {families.map((family) => (
              <tr key={family} className="border-t border-line">
                <th
                  scope="row"
                  className="py-1.5 text-left text-caption font-normal text-graphite"
                >
                  {STRATEGY_FAMILY_LABELS[family] ?? family}
                </th>
                {regimes.map((regime) => (
                  <td key={regime.key} className="py-1.5 text-right">
                    <Multiplier value={regime.weights[family] ?? 1} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Multiplier({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "num text-caption",
        value > 1 ? "font-medium text-ink" : value < 1 ? "text-stone" : "text-stone",
      )}
    >
      ×{value.toFixed(2)}
    </span>
  );
}

function Step({ name, body }: { name: string; body: string }) {
  return (
    <li className="border-l-2 border-line pl-3">
      <p className="text-caption font-medium text-ink">{name}</p>
      <p className="mt-0.5 text-caption text-stone">{body}</p>
    </li>
  );
}

function ProfileStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-micro text-stone">{label}</dt>
      <dd className="num text-body font-medium text-ink">{value}</dd>
      {/* The hint lives inside the <dd>, not beside it. A <div> child of a
          <dl> may only contain <dt> and <dd> — a stray <p> there is invalid
          markup and axe flags the whole list as unparseable. */}
      <dd className="text-micro text-stone">{hint}</dd>
    </div>
  );
}

function MethodologySkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="space-y-2.5">
          <Skeleton className="w-64">
            <span className="block text-heading text-transparent">0</span>
          </Skeleton>
          <Skeleton className="w-full">
            <span className="block text-body text-transparent">0</span>
          </Skeleton>
          <Skeleton className="w-5/6">
            <span className="block text-body text-transparent">0</span>
          </Skeleton>
          <Skeleton className="w-3/4">
            <span className="block text-body text-transparent">0</span>
          </Skeleton>
        </div>
      ))}
    </div>
  );
}

/**
 * "three days for equities and FX, and a day and a half for crypto".
 *
 * Grouped by span rather than listed per market, so two markets that share a
 * horizon read as one clause — and if they ever stop sharing one, the sentence
 * splits on its own instead of going on asserting the old grouping.
 */
function horizonSentence(hours: StrategiesResponse["horizonHours"]): string {
  const NAMES = { equity: "equities", fx: "FX", crypto: "crypto" } as const;
  const bySpan = new Map<number, string[]>();
  for (const market of ["equity", "fx", "crypto"] as const) {
    const span = hours[market];
    bySpan.set(span, [...(bySpan.get(span) ?? []), NAMES[market]]);
  }
  const clauses = [...bySpan.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([span, names]) => {
      const words = describeSpan(span);
      const article = words.startsWith("day") ? "a " : "";
      return `${article}${words} for ${names.join(" and ")}`;
    });
  return clauses.length > 1
    ? `${clauses.slice(0, -1).join(", ")}, and ${clauses.at(-1)}`
    : clauses[0];
}
