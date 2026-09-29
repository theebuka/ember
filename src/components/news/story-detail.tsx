"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Newspaper } from "@/components/common/icon";
import { ChangeChip } from "@/components/market/change-chip";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import type { Instrument, NewsItem, Quote } from "@/lib/api/types";
import { NEWS_CATEGORY_LABELS } from "@/lib/api/types";
import { formatPercent, formatQuotePrice, formatRelative } from "@/lib/market/format";
import { cn } from "@/lib/utils";

/**
 * A story, opened.
 *
 * ── What a "story" is here, and why it stops where it does ─────────────────
 *
 * **ember serves a headline and a summary, and links out. It will never serve
 * the article.** That is not a gap waiting to be filled by the live feed — it
 * is the answer. The text of a news article belongs to whoever wrote it;
 * reproducing it inside another product is not a technical problem to solve.
 * Finnhub, the planned provider, supplies exactly what is here — headline,
 * summary, source, timestamp, URL — for the same reason.
 *
 * So the question "what makes this worth opening" has to be answered with
 * something other than more of the publisher's words, and the answer is the
 * one thing ember has that a news app doesn't: **the instruments the story
 * touches, priced, with a way through to what the engine currently reads on
 * them.**
 *
 * That is a boundary, not a hole in one. The engine's read is shown *beside*
 * the story and is not derived from it — the story had no part in producing
 * it, and would produce the same number if this headline had never been
 * written (ADR 0027). A related-instruments panel is where an app in this
 * category would normally start letting the two bleed together, so it is worth
 * saying plainly on the screen it happens on.
 */
export function StoryDetail({
  story,
  instruments,
  quotes,
  onBack,
  className,
}: {
  story: NewsItem;
  instruments: ReadonlyMap<string, Instrument>;
  quotes: ReadonlyMap<string, Quote>;
  /** Mobile only — desktop keeps the list beside this and needs no back. */
  onBack?: () => void;
  className?: string;
}) {
  const now = useNow(60_000);
  const linkable = story.url !== "" && story.url !== "#";

  return (
    <article className={cn("min-w-0", className)}>
      {onBack && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="-ml-2.5 mb-4 text-stone lg:hidden"
        >
          <ArrowLeft />
          All headlines
        </Button>
      )}

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-micro text-stone">
        <span className="font-medium text-graphite">{story.source}</span>
        <span aria-hidden>·</span>
        <span>{NEWS_CATEGORY_LABELS[story.category]}</span>
        {now !== null && (
          <>
            <span aria-hidden>·</span>
            <time dateTime={new Date(story.at).toISOString()}>
              {formatRelative(story.at, now)}
            </time>
          </>
        )}
      </div>

      <h2 className="mt-2 text-title font-semibold tracking-[-0.02em] text-ink text-balance">
        {story.headline}
      </h2>

      <p className="mt-3 text-body text-stone text-pretty">{story.summary}</p>

      {/* The link, or the honest absence of one.
          The mock's outlets are invented (ADR 0027 / decision 080), so there
          is nowhere to send anyone — and a dead link that looks live is worse
          than a sentence saying why there isn't one. */}
      {linkable ? (
        <a
          href={story.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 rounded-sm text-caption font-medium text-brand-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Read it at {story.source}
          <ArrowUpRight className="size-3.5" />
        </a>
      ) : (
        <p className="mt-5 rounded-xl bg-surface-2 p-3.5 text-micro text-stone text-pretty">
          ember shows the headline and the summary and links to the publisher —
          the article itself is theirs, not ours to reprint. This one is
          generated, and its outlet does not exist, so there is nowhere to send
          you.
        </p>
      )}

      {story.symbols.length > 0 && (
        <section className="mt-8">
          <h3 className="eyebrow">In this story</h3>
          <div className="mt-3 divide-y divide-line border-y border-line">
            {story.symbols.map((symbol) => {
              const instrument = instruments.get(symbol);
              const quote = quotes.get(symbol);
              return (
                <Link
                  key={symbol}
                  href={`/asset/${encodeURIComponent(symbol)}`}
                  className="flex items-center gap-3 py-3 transition-colors hover:bg-surface-2/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="mono-label w-16 shrink-0 text-caption text-ink">
                    {symbol}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-caption text-stone">
                    {instrument?.name ?? "—"}
                  </span>
                  {quote && instrument && (
                    <>
                      <span className="num shrink-0 text-caption text-graphite">
                        {formatQuotePrice(instrument, quote.price)}
                      </span>
                      <ChangeChip value={quote.changePct}>
                        {formatPercent(quote.changePct, { signed: true })}
                      </ChangeChip>
                    </>
                  )}
                </Link>
              );
            })}
          </div>
          <p className="mt-2.5 text-micro text-stone text-pretty">
            Prices and ember&apos;s read on these instruments come from the
            engine, not from this story. Nothing written here moved them.
          </p>
        </section>
      )}

      {story.topics.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-1.5">
          {story.topics.map((topic) => (
            <span
              key={topic}
              className="rounded-full bg-surface-2 px-2.5 py-1 text-micro text-stone first-letter:uppercase"
            >
              {topic}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

/** Desktop only — the right-hand pane before anything is selected. */
export function NoStorySelected() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
      <div className="grid size-11 place-items-center rounded-2xl bg-surface-2 text-stone">
        <Newspaper className="size-5" />
      </div>
      <p className="mt-4 max-w-xs text-caption text-stone text-pretty">
        Pick a headline to see the summary, the instruments it touches and where
        to read it.
      </p>
    </div>
  );
}
