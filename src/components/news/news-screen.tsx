"use client";

import { useMemo, useState } from "react";
import { Newspaper } from "@/components/common/icon";
import { ErrorState } from "@/components/common/error-state";
import { SponsorRow } from "@/components/plan/sponsor-row";
import { PageBody } from "@/components/common/page-body";
import { NoStorySelected, StoryDetail } from "@/components/news/story-detail";
import { Section } from "@/components/common/section";
import { Segmented } from "@/components/common/segmented";
import { DataSourceChip } from "@/components/market/data-source-chip";
import { NotificationsButton } from "@/components/notifications/notifications-button";
import { SearchButton } from "@/components/shell/search-button";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydrated } from "@/hooks/use-hydrated";
import { useNow } from "@/hooks/use-now";
import { useInstruments, useNews, useQuotes, useRates } from "@/hooks/use-market-data";
import { ApiError } from "@/lib/api/client";
import type { Instrument, NewsItem, Quote, TrendingTopic } from "@/lib/api/types";
import { formatRelative } from "@/lib/market/format";
import { newsForSymbols } from "@/lib/market/news";
import { USD_PER_UNIT } from "@/lib/market/universe";
import { derivePortfolio } from "@/lib/portfolio/derive";
import { resolveWatchlist } from "@/store/use-watchlist";
import { usePreferences } from "@/store/use-preferences";
import { useWatchlist } from "@/store/use-watchlist";
import { cn } from "@/lib/utils";
import { useLedger } from "@/hooks/use-ledger";

/**
 * News.
 *
 * **This screen has no opinion, and that is the design.** ADR 0005 rules out
 * sentiment as a signal input; ADR 0027 extends it — news is context and never
 * evidence. So there are no tinted headlines, no "bullish"/"bearish" tags, no
 * relevance scores and nothing that ranks a story by what it might do to a
 * price. A finance app that colours its headlines is telling you what to
 * think about them, which is exactly the claim ember has spent fifteen phases
 * refusing to make without a citation behind it.
 *
 * What it does instead: says what is being written about (counted, not
 * chosen), and lets you narrow to the things you actually hold.
 */

type View = "all" | "yours";

/**
 * Headlines drawn per page.
 *
 * Twenty is about two screens on a phone and one on a desktop column, which is
 * the point at which someone decides whether to keep going.
 */
const NEWS_PAGE = 20;

export function NewsScreen() {
  const hydrated = useHydrated();
  const now = useNow(60_000);
  const [view, setView] = useState<View>("all");
  const [topic, setTopic] = useState<string | null>(null);
  /**
   * The open story, by id.
   *
   * Local state rather than a route or a query parameter, and that is a
   * departure from how the settings tab is handled two files over — for a
   * reason. A section of settings is a *destination*: it gets linked to from a
   * notification and from other screens, so it belongs in the URL. A story is
   * a selection within a list whose filters are already local; putting it in
   * the URL would mean the filters have to go there too or the link resolves
   * to a story that isn't in the list it opens.
   *
   * Mobile treats a selection as a push and desktop treats it as a pane. The
   * back control is rendered by `StoryDetail`, and the browser's own Back is
   * unaffected because nothing was pushed onto the history stack.
   */
  const [openId, setOpenId] = useState<string | null>(null);

  const base = usePreferences((s) => s.baseCurrency);
  // What the plan shows (decision 289).
  const { transactions } = useLedger();
  const watching = useWatchlist((s) => s.symbols);

  const newsQuery = useNews();
  const instrumentsQuery = useInstruments();
  const quotesQuery = useQuotes();
  const ratesQuery = useRates();

  const instruments = useMemo(
    () => instrumentsQuery.data?.instruments ?? [],
    [instrumentsQuery.data],
  );

  const nameBy = useMemo(
    () => new Map(instruments.map((i) => [i.symbol, i.name])),
    [instruments],
  );

  const instrumentBy = useMemo(
    () => new Map<string, Instrument>(instruments.map((i) => [i.symbol, i])),
    [instruments],
  );

  const quoteBy = useMemo(
    () =>
      new Map<string, Quote>(
        (quotesQuery.data?.quotes ?? []).map((q) => [q.symbol, q]),
      ),
    [quotesQuery.data],
  );

  /**
   * "Yours" means held, plus watched — but only if the watchlist is real.
   *
   * The watchlist defaults to a `null` sentinel meaning "following everything"
   * (decision 023), and resolving that gives all 110 symbols. Taken literally,
   * "Yours" then selects the entire feed and the filter silently does nothing:
   * measured on a five-position book it showed 43 of 43.
   *
   * Same rule as the urgency nudge in `findings.ts` — while the sentinel is in
   * place, a preference expressed about everything is a preference expressed
   * about nothing. So an uncurated watchlist falls back to holdings, which is
   * the only thing the user has actually told us they care about.
   */
  const yours = useMemo(() => {
    if (!hydrated) return [];
    const held = derivePortfolio({
      transactions,
      quotes: quotesQuery.data?.quotes ?? [],
      instruments,
      rates: ratesQuery.data?.rates ?? USD_PER_UNIT,
      base,
    }).positions.map((p) => p.symbol);

    const followed =
      watching === null
        ? []
        : resolveWatchlist(
            watching,
            instruments.map((i) => i.symbol),
          );

    return [...new Set([...held, ...followed])];
  }, [hydrated, transactions, quotesQuery.data, instruments, ratesQuery.data, base, watching]);

  // Memoised so the empty-array fallback isn't a fresh identity every render,
  // which would make `shown` recompute on every keystroke elsewhere in the
  // tree for no reason.
  const items = useMemo(() => newsQuery.data?.items ?? [], [newsQuery.data]);
  const trending = newsQuery.data?.trending ?? [];

  const shown = useMemo(() => {
    let filtered = view === "yours" ? newsForSymbols(items, yours) : items;
    if (topic !== null) filtered = filtered.filter((i) => i.topics.includes(topic));
    return filtered;
  }, [items, view, yours, topic]);

  /**
   * Paged in the browser, and the server is not asked for a page.
   *
   * The obvious version — `/api/news?page=` — quietly breaks the two filters
   * above. "Yours" and the trending strip are applied *client-side against the
   * whole feed*, deliberately: filtering them on the server would mean sending
   * the symbols a user holds and follows to a route with no business knowing
   * them, and phase 15 spent the only exception to that rule this app gets
   * (ADR 0025). Paginate server-side and "Yours" can only find your holdings
   * among whichever page happened to load.
   *
   * So the *payload* stays whole — it is bounded by the provider's pool limit,
   * not by the size of the news cycle — and the *rendering* is paged. That is
   * what the complaint was actually about: the list was drawing every headline
   * into a 14,800px page.
   */
  const [page, setPage] = useState(1);

  // Any change to the filters puts you back at the top of a different list.
  // Derived from a key rather than reset in each handler, so there is one rule
  // instead of one per control — the same reasoning as `open` above.
  const filterKey = `${view}:${topic ?? ""}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }

  const paged = useMemo(() => shown.slice(0, page * NEWS_PAGE), [shown, page]);
  const remaining = shown.length - paged.length;

  /**
   * The open story, but only if the filters still show it.
   *
   * Selecting a story and then narrowing to a topic it isn't in would
   * otherwise leave a detail pane describing something the list beside it no
   * longer contains. Derived rather than cleared in the filter handlers, so
   * there is one rule instead of one per control.
   */
  const open = useMemo(
    () => shown.find((item) => item.id === openId) ?? null,
    [shown, openId],
  );

  /**
   * What the desktop pane shows: the selection, or the top headline.
   *
   * An empty "Pick a headline" pane took 55% of the page while the list was
   * squeezed into the rest. Only the pane defaults — `open` stays null, so a
   * phone still opens on the list rather than pushed into a story.
   */
  const paneStory = open ?? paged[0] ?? null;

  const loading = newsQuery.isPending;
  const error = newsQuery.error;

  return (
    <>
      <PageHeader
        title="News"
        actions={
          <>
            <DataSourceChip />
            <SearchButton />
            <NotificationsButton />
          </>
        }
      />

      {/* Full width, like Home and Portfolio.
          It was `narrow`, which caps at 896px — and this is the one screen in
          the app that is genuinely two columns of *content* rather than a
          column and a companion, so the cap was squeezing a master–detail
          layout into two thirds of the page and leaving the rest empty. The
          headline list and the open story each get a real column now. */}
      <PageBody className="space-y-8 pb-12">
        {error ? (
          <ErrorState
            message={error instanceof ApiError ? error.message : "News didn't load."}
            onRetry={() => newsQuery.refetch()}
          />
        ) : (
          <>
            <Section
              title="Trending"
              
            >
              {loading ? (
                <TrendingSkeleton />
              ) : trending.length === 0 ? (
                <p className="text-caption text-stone">
                  Nothing is trending right now.
                </p>
              ) : (
                <TrendingStrip
                  topics={trending}
                  selected={topic}
                  onSelect={(next) => setTopic(next === topic ? null : next)}
                />
              )}
            </Section>

            {/* ── Master–detail ─────────────────────────────────────────
                Two columns from `lg`, one below it. On a phone the list *is*
                the screen and a selection replaces it, which is the pushed
                view every mobile mail and news app uses; on desktop both are
                on screen and the right pane sticks while the left scrolls.

                `lg:hidden` on the list when something is open rather than
                unmounting it: the filters, the scroll position and the
                trending selection all live in this component, and remounting
                the list on every back would reset the lot. */}
            <div
              className={cn(
                open !== null && "max-lg:hidden",
                "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start lg:gap-10",
              )}
            >
            <Section
              title="Headlines"
              hint={
                loading
                  ? undefined
                  : shown.length === items.length ? "last two days" : `${shown.length} of ${items.length}`
              }
              action={
                <Segmented
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "all", label: "Everything" },
                    { value: "yours", label: "Yours" },
                  ]}
                  size="sm"
                  aria-label="Which headlines to show"
                />
              }
            >
              {loading ? (
                <div className="-mx-3 divide-y divide-line border-t border-line">
                  {Array.from({ length: 5 }, (_, i) => (
                    <HeadlineSkeleton key={i} />
                  ))}
                </div>
              ) : shown.length === 0 ? (
                <Quiet
                  view={view}
                  topic={topic}
                  onClear={() => {
                    setTopic(null);
                    setView("all");
                  }}
                />
              ) : (
                <>
                  {/* The list bleeds, not the row. The row carried `-mx-3` at
                      `w-full`, so it moved 12px left without growing and every
                      divider stopped 12px short on the right. */}
                  <div className="-mx-3 divide-y divide-line border-t border-line">
                    {paged.map((item) => (
                      <Headline
                        key={item.id}
                        item={item}
                        now={now}
                        nameBy={nameBy}
                        selected={item.id === paneStory?.id}
                        onOpen={() => setOpenId(item.id)}
                      />
                    ))}
                  </div>

                  {/* A button, not infinite scroll. This is a master–detail
                      list: a reader opens a story, reads it, and comes back
                      expecting the list where they left it. Auto-loading on
                      scroll moves the ground under that, and it removes the
                      one thing a long list needs — an end. */}
                  {remaining > 0 && (
                    <Button
                      variant="outline"
                      size="lg"
                      className="mt-5 w-full"
                      onClick={() => setPage((p) => p + 1)}
                    >
                      {remaining} more {remaining === 1 ? "headline" : "headlines"}
                    </Button>
                  )}
                </>
              )}
            </Section>

              {/* Sticky, and only tall enough to need it on desktop. The
                  offset clears the page header, which is itself sticky. */}
              <div className="hidden lg:sticky lg:top-[calc(7rem+var(--bar-h,0px))] lg:block">
                {paneStory ? (
                  <StoryDetail
                    story={paneStory}
                    instruments={instrumentBy}
                    quotes={quoteBy}
                  />
                ) : (
                  <NoStorySelected />
                )}
              </div>
            </div>

            {/* Mobile: the selection replaces the list. */}
            {open && (
              <div className="lg:hidden">
                <StoryDetail
                  story={open}
                  instruments={instrumentBy}
                  quotes={quoteBy}
                  onBack={() => setOpenId(null)}
                />
              </div>
            )}

            {/* The boundary, said on the screen it applies to. It is not
                small print — it is the difference between ember and every app
                that quietly feeds a sentiment score into its model and calls
                the result a signal. */}
            <p className="max-w-3xl text-micro text-stone">
              News doesn&apos;t affect ember&apos;s signals.
            </p>

            {/* The one sponsor slot on this screen, and it is at the bottom.
                Above the headlines it would be borrowing the feed's authority
                before a reader had read anything; under the note about what is
                and isn't a signal, it is plainly a different kind of thing. */}
            <SponsorRow slot="news" className="mt-6" />
          </>
        )}
      </PageBody>
    </>
  );
}

/**
 * The strip.
 *
 * Chips rather than a bar chart or a heat map: the number behind each one is a
 * count of stories, which is a weak enough measurement that drawing it to
 * scale would overstate it. The count is shown so the reader can see how weak.
 */
function TrendingStrip({
  topics,
  selected,
  onSelect,
}: {
  topics: readonly TrendingTopic[];
  selected: string | null;
  onSelect: (topic: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {topics.map((topic) => {
        const on = selected === topic.topic;
        return (
          <button
            key={topic.topic}
            type="button"
            onClick={() => onSelect(topic.topic)}
            aria-pressed={on}
            className={cn(
              "tap-target inline-flex items-baseline gap-1.5 rounded-full px-3.5 py-2",
              "text-caption font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              on
                ? "bg-brand-tint text-brand-text"
                : "bg-surface-2 text-graphite hover:text-ink",
            )}
          >
            <span className="first-letter:uppercase">{topic.topic}</span>
            <span className="num text-micro text-stone">{topic.mentions}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * One headline in the list.
 *
 * The whole row opens the story, so it is a `<button>` rather than an
 * `<article>` with a link somewhere inside it — a row where only the title is
 * tappable is a row people tap and nothing happens.
 *
 * The symbol chips lost their links in the process, and that is a real
 * trade: they used to jump straight to the asset page. Nested interactive
 * elements inside a button are invalid markup and axe flags them, and the
 * detail pane this opens carries the same instruments as links, priced. One
 * more tap, and a screen that explains why you would take it.
 */
function Headline({
  item,
  now,
  nameBy,
  selected,
  onOpen,
}: {
  item: NewsItem;
  now: number | null;
  nameBy: ReadonlyMap<string, string>;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "block w-full px-3 py-4 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        // The selected state only means anything beside a detail pane, so it
        // is drawn only where one exists. On a phone the selection *is* the
        // next screen and marking the row you just left is noise.
        selected ? "lg:bg-brand-tint/50" : "hover:bg-surface-2/50",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-micro text-stone">
        <span className="font-medium text-graphite">{item.source}</span>
        {/* `useNow` is null until mounted — a relative time is the canonical
            hydration mismatch (ADR 0017), and the dot goes with it so the
            line doesn't render a dangling separator for one frame. */}
        {now !== null && (
          <>
            <span aria-hidden>·</span>
            <time dateTime={new Date(item.at).toISOString()}>
              {formatRelative(item.at, now)}
            </time>
          </>
        )}
      </div>

      <h3 className="mt-1.5 text-body font-medium text-ink text-pretty">
        {item.headline}
      </h3>
      <p className="mt-1 line-clamp-2 text-caption text-stone">{item.summary}</p>

      {item.symbols.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {item.symbols.map((symbol) => (
            <span
              key={symbol}
              className="mono-label text-micro text-stone"
              title={nameBy.get(symbol) ?? symbol}
            >
              {symbol}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function Quiet({
  view,
  topic,
  onClear,
}: {
  view: View;
  topic: string | null;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-start border-t border-line py-8">
      <div className="mb-4 grid size-11 place-items-center rounded-xl bg-surface-2 text-stone">
        <Newspaper className="size-5" />
      </div>
      <h3 className="text-heading font-semibold text-ink">No stories</h3>
      <p className="mt-1.5 max-w-md text-body text-stone">
        {topic !== null
          ? `No stories about ${topic}${view === "yours" ? " that you hold" : ""} in the last two days.`
          : "No news about your instruments in the last two days."}
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-5 rounded-sm text-caption font-medium text-brand-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Show everything
      </button>
    </div>
  );
}

/* ── Skeletons ─────────────────────────────────────────────────────────────
   Sized by type metrics, not by guessed heights — a flat `h-4` where
   `text-body` lands is seven pixels a row, which is where the asset page's
   0.635 CLS came from (ADR 0019). */

/**
 * The strip, before it knows what is trending.
 *
 * The first version was five pills at a flat `h-10` and widths nobody had
 * measured. At 375px that wrapped to two rows where the real strip wraps to
 * three, so the whole Headlines section jumped 43px when the payload landed —
 * 0.051 CLS, over the gate, and the largest single shift left in the app.
 *
 * The height is now derived the ADR 0019 way: the same padding and the same
 * type class as a real chip, around a transparent glyph, so the pill is the
 * height a pill is rather than a number that was true against an older scale.
 *
 * The widths are **approximated, and that part cannot be derived.** How many
 * topics clear the two-mention floor and how long their labels are is not
 * knowable before the response arrives. These six are the median case and they
 * wrap to three rows at 375px like the real thing; a quieter day produces
 * fewer chips, the strip collapses upward, and that is a shift this cannot
 * prevent — only a fixed-height strip could, and reserving three rows of
 * whitespace on a slow news day is a worse screen than a small settle.
 */
function TrendingSkeleton() {
  return (
    <div className="flex flex-wrap gap-2" aria-hidden>
      {[116, 112, 136, 100, 116, 88].map((width, i) => (
        <Skeleton
          key={i}
          className="rounded-full px-3.5 py-2"
          style={{ width }}
        >
          <span className="block text-caption text-transparent">t</span>
        </Skeleton>
      ))}
    </div>
  );
}

function HeadlineSkeleton() {
  return (
    <div className="px-3 py-4" aria-hidden>
      <Skeleton className="h-[1lh] w-32 text-micro" />
      <Skeleton className="mt-1.5 h-[1lh] w-3/4 text-body" />
      <Skeleton className="mt-1 h-[1lh] w-full text-caption" />
      <Skeleton className="mt-2 h-[1lh] w-40 text-micro" />
    </div>
  );
}
