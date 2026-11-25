import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeHorizon, describeSpan } from "@/lib/market/format";

/**
 * The window's horizon is per-market and derived (§5), and prose about it has to
 * be too.
 *
 * Five places stated it as a literal — "the next three days", "a 72-hour
 * window" — and went on stating it for a phase after crypto's horizon became 36
 * hours. `describeSpan` existed the whole time, private to `window.ts`, where no
 * component could reach it. This is decision 086's move: a rule that lives only
 * in a comment is a rule until somebody reaches past it.
 */

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

/**
 * The phrasings the literals took. Matched on any line that is not a comment —
 * JSX text has no quotes around it, and that is where two of the five were.
 */
const LITERAL = /\b(next three days|inside three days|across three days|72-hour)\b/;

/**
 * A count of bars interpolated into copy: `{n} bars`. The engine counts in bars;
 * a reader counts in trading days (decision 302). The track record said "filled
 * 1.0 bars after it was made" for a phase after that decision.
 */
const BARS = /\}\s*bars?\b/;

function offenders(dirs: string[], pattern: RegExp): string[] {
  return dirs
    .flatMap(sources)
    .flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ file, line: i + 1, text: line.trim() }))
        .filter(
          ({ text }) =>
            !text.startsWith("//") && !text.startsWith("*") && !text.startsWith("{/*"),
        )
        .filter(({ text }) => pattern.test(text)),
    )
    .map(({ file, line }) => `${file}:${line}`);
}

describe("horizon copy", () => {
  it("is never written as a literal in a component or the engine", () => {
    expect(offenders(["src/components", "src/lib/signals"], LITERAL)).toEqual([]);
  });

  it("never counts in bars in a component", () => {
    expect(offenders(["src/components"], BARS)).toEqual([]);
  });

  it("describes each market's span in words", () => {
    expect(describeSpan(72)).toBe("three days");
    expect(describeSpan(36)).toBe("day and a half");
    expect(describeHorizon({ from: 0, to: 36 * 3_600_000 })).toBe("day and a half");
  });
});
