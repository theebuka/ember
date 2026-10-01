"use client";

import { useId, useState } from "react";
import { ChevronDown } from "@/components/common/icon";
import type { Assessment, Contribution, Stance } from "@/lib/api/client";
import { formatPercent } from "@/lib/market/format";
import { cn } from "@/lib/utils";

/**
 * Who said what, and who disagreed.
 *
 * This component is the product's argument. Anything can print a BUY badge;
 * what makes this defensible is that a user can open it and read every rule
 * that voted, in its own words, with the citation it came from and the weight
 * it carried — and see the ones that dissented sitting right next to the
 * ones that didn't.
 *
 * **Dissent is never averaged away** (CLAUDE.md §5). The card's headline
 * sentence already names the objectors, so the disagreement is visible whether
 * or not this section is opened; opening it says *why* they object.
 *
 * Stance is about agreement with the call, not about market direction, so it
 * is set in type and never in `up`/`down`. Dissent used to carry the loss red,
 * which made "4 against" read as money lost; it is set in weight instead, so a
 * reader skimming for the catch still finds it without the palette lying.
 */

const STANCE_LABEL: Record<Stance, string> = {
  agrees: "agrees",
  dissents: "disagrees",
  neutral: "no view",
};

const STANCE_CLASS: Record<Stance, string> = {
  agrees: "text-stone",
  dissents: "font-semibold text-graphite",
  neutral: "text-stone",
};

export function StrategyBreakdown({
  assessment,
  className,
}: {
  assessment: Assessment;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const { contributions, agreement } = assessment;
  const total = contributions.length + agreement.silent;

  return (
    <div className={cn("border-t border-line pt-3.5", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "group flex w-full items-center gap-2 rounded-sm text-left",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span className="eyebrow">Why ember says this</span>

        <span className="num text-micro text-stone">
          {agreement.agrees} {agreement.agrees === 1 ? "rule agrees" : "rules agree"}
          {agreement.dissents > 0 && (
            <span className="font-semibold text-graphite">
              {" "}· {agreement.dissents} {agreement.dissents === 1 ? "disagrees" : "disagree"}
            </span>
          )}
          {agreement.silent > 0 && ` · ${agreement.silent} of ${total} had no view`}
        </span>

        <ChevronDown
          className={cn(
            "ml-auto size-3.5 shrink-0 text-stone transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div id={panelId} className="mt-3">
          <ul className="space-y-3">
            {contributions.map((contribution) => (
              <li key={contribution.strategyId}>
                <StrategyRow contribution={contribution} />
              </li>
            ))}
          </ul>

          {agreement.silent > 0 && (
            <p className="mt-3 border-t border-line pt-3 text-micro text-stone">
              {agreement.silent} more {agreement.silent === 1 ? "rule" : "rules"} had no view.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StrategyRow({ contribution }: { contribution: Contribution }) {
  const { name, score, weight, rationale, stance, citation } = contribution;

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-caption font-medium text-ink">{name}</span>
        <span className={cn("text-micro", STANCE_CLASS[stance])}>
          {STANCE_LABEL[stance]}
        </span>
        <span className="num ml-auto shrink-0 text-micro text-stone">
          {formatPercent(weight, { decimals: 0 })} of the blend
        </span>
      </div>

      {/* The weight, drawn. A row claiming 4% and a row claiming 30% read
          identically as text, and the difference is the whole point of an
          ensemble. */}
      <div className="mt-1 h-px w-full bg-line" aria-hidden>
        <div
          className={cn("h-px", stance === "dissents" ? "bg-faint" : "bg-graphite")}
          style={{ width: `${Math.max(weight * 100, 1)}%` }}
        />
      </div>

      <p className="mt-1.5 text-caption text-stone">{rationale}</p>

      <p className="mt-1 text-micro text-stone">
        {citation.authors} ({citation.year}), <span className="italic">{citation.title}</span>
        {citation.where && ` · ${citation.where}`}
        {/* Separated in the text, not just by margin — otherwise the citation
            and the score run together into one token for a screen reader, and
            copy-pasting the line yields "…104(2)+0.12". */}
        {" · "}
        <span className="num">
          scored {score >= 0 ? "+" : "−"}
          {Math.abs(score).toFixed(2)}
        </span>
      </p>
    </div>
  );
}
