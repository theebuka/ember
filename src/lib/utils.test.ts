import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cn } from "./utils";

/**
 * The type scale has to survive being merged with a colour.
 *
 * tailwind-merge only knows Tailwind's default theme, so an unregistered
 * `text-*` is assumed to be a colour and gets dropped by the next colour on
 * the same element. Every one of these pairs occurs somewhere in the app.
 */
describe("cn", () => {
  it.each([
    ["text-micro", "text-stone"],
    ["text-caption", "text-brand-text"],
    ["text-body", "text-graphite"],
    ["text-heading", "text-ink"],
    ["text-title", "text-faint"],
    ["text-display", "text-down"],
    ["text-figure", "text-up"],
  ])("keeps %s when %s follows it", (size, colour) => {
    expect(cn(size, colour)).toBe(`${size} ${colour}`);
  });

  it("still lets one size replace another", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption");
  });

  it("still lets one colour replace another", () => {
    expect(cn("text-stone", "text-ink")).toBe("text-ink");
  });

  it("leaves alignment alone", () => {
    expect(cn("text-center", "text-micro")).toBe("text-center text-micro");
  });

  /**
   * `tap-target` sets `position: relative` to hang a 44px hit region off a
   * pseudo-element, so it genuinely conflicts with `absolute` — and the close
   * button on every dialog and sheet is an absolutely positioned button. If
   * the merge doesn't arbitrate, whichever rule Tailwind emitted last wins,
   * which is not a decision anyone made.
   */
  it("lets a positioned button opt out of the hit-region expansion", () => {
    expect(cn("tap-target", "absolute top-2 right-2")).toBe(
      "absolute top-2 right-2",
    );
  });

  it("keeps the hit region on a button that isn't positioned", () => {
    expect(cn("tap-target", "h-8 px-2.5")).toBe("tap-target h-8 px-2.5");
  });

  /**
   * The registration in `utils.ts` and the `@theme` block in `globals.css` are
   * two hand-maintained lists of the same thing. This is the guard that stops
   * a size added to one and not the other from silently not applying.
   */
  it("registers every size declared in globals.css", () => {
    const css = readFileSync(
      join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    const declared = [
      ...new Set(
        [...css.matchAll(/^\s*--text-([a-z0-9-]+):/gm)]
          .map((m) => m[1])
          // `--text-caption--line-height` and friends are companions to a size,
          // not sizes of their own.
          .filter((name) => !name.endsWith("--line-height")),
      ),
    ];

    expect(declared.length).toBeGreaterThan(0);

    for (const name of declared) {
      expect(
        cn(`text-${name}`, "text-stone"),
        `text-${name} is in globals.css but not registered in cn()`,
      ).toBe(`text-${name} text-stone`);
    }
  });
});
