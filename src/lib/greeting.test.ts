import { describe, expect, it } from "vitest";
import {
  MONEY_WORDS,
  PROMPT_TEMPLATES,
  daypartOf,
  greeting,
  greetingPrompt,
  greetingText,
} from "./greeting";

/**
 * `greeting()` returns parts so the name can be styled on its own; every
 * assertion here is about the *sentence*, so it goes through the same joiner
 * the component uses for the accessible name.
 */
const line = (args: Parameters<typeof greeting>[0]) => greetingText(greeting(args));

const at = (hour: number) => new Date(2026, 0, 15, hour, 30);

describe("daypartOf", () => {
  it.each([
    [0, "night"],
    [4, "night"],
    [5, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [17, "afternoon"],
    [18, "evening"],
    [23, "evening"],
  ] as const)("%i:30 is %s", (hour, part) => {
    expect(daypartOf(at(hour))).toBe(part);
  });
});

describe("greeting", () => {
  it("is stable for a given seed", () => {
    const args = { now: at(14), name: "Travis", seed: 12345 };
    expect(line(args)).toEqual(line(args));
  });

  /**
   * The whole point of the `{name}` placeholder is that the line has to read
   * as a sentence with the clause and without it. A stray comma or a dangling
   * "back for more," is the failure this catches.
   */
  it("reads correctly with no name — no dangling punctuation", () => {
    for (let seed = 0; seed < 400; seed++) {
      for (const hour of [2, 8, 14, 20]) {
        const text = line({ now: at(hour), name: null, seed });
        expect(text, `seed ${seed} @ ${hour}h`).not.toMatch(/[,\s]$/);
        expect(text).not.toContain("{name}");
        expect(text).not.toContain(", ?");
      }
    }
  });

  it("inserts the name when there is one", () => {
    const withName = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      withName.add(line({ now: at(14), name: "Travis", seed }));
    }
    // Every line either addresses them by name or is the one deliberately
    // name-free entry in the wry pool.
    for (const text of withName) {
      expect(text === "Welcome, traveller" || text.includes("Travis")).toBe(true);
    }
  });

  it("treats whitespace as no name", () => {
    expect(line({ now: at(14), name: "   ", seed: 7 })).toBe(
      line({ now: at(14), name: null, seed: 7 }),
    );
  });

  it("reaches more than one line across seeds", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      seen.add(line({ now: at(9), name: null, seed }));
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it("draws from the day's own pool most of the time", () => {
    let morning = 0;
    for (let seed = 0; seed < 200; seed++) {
      const text = line({ now: at(9), name: null, seed });
      if (/morning|Early start/i.test(text)) morning++;
    }
    // The wry pool is roughly one in four, so the daypart pool should
    // dominate without being the only thing that ever appears.
    expect(morning).toBeGreaterThan(100);
    expect(morning).toBeLessThan(200);
  });
});

/** Every prompt a real visit could see, at every hour that changes the pool. */
const everyPrompt = () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 400; seed++) {
    for (const hour of [2, 8, 14, 20]) {
      const now = at(hour);
      for (const name of ["Travis", null]) {
        const lead = greeting({ now, name, seed }).lead;
        seen.add(greetingPrompt({ now, seed, lead }));
      }
    }
  }
  return seen;
};

describe("greetingPrompt", () => {
  it("is stable for a given seed", () => {
    const args = { now: at(14), seed: 12345, lead: "Good afternoon, " };
    expect(greetingPrompt(args)).toBe(greetingPrompt(args));
  });

  it("never leaves a placeholder or an empty daypart behind", () => {
    for (const text of everyPrompt()) {
      expect(text).not.toContain("{daypart}");
      expect(text).not.toMatch(/this \?$/);
      expect(text).not.toMatch(/\s{2}/);
    }
  });

  /**
   * "Good morning" above "How are we feeling this morning?" reads fine in a
   * spec and looks careless on a screen. The filter is the only reason the
   * daypart template can exist at all.
   */
  it("never repeats a daypart word the greeting already used", () => {
    for (let seed = 0; seed < 400; seed++) {
      for (const hour of [8, 14, 20]) {
        const now = at(hour);
        const lead = greeting({ now, name: "Travis", seed }).lead;
        const prompt = greetingPrompt({ now, seed, lead });
        for (const word of ["morning", "afternoon", "evening"]) {
          if (lead.toLowerCase().includes(word)) {
            expect(prompt.toLowerCase(), `seed ${seed} @ ${hour}h`).not.toContain(
              word,
            );
          }
        }
      }
    }
  });

  /** "this night" is not English, and "this evening" at 2am is a lie. */
  it("says nothing about the time of day at night", () => {
    for (let seed = 0; seed < 200; seed++) {
      const now = at(2);
      const lead = greeting({ now, name: null, seed }).lead;
      expect(greetingPrompt({ now, seed, lead })).not.toContain("this ");
    }
  });

  it("reaches more than one line across seeds", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      seen.add(greetingPrompt({ now: at(9), seed, lead: "Welcome back, " }));
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  /**
   * The rule in `greeting.ts`'s header, as something that can fail.
   *
   * The greeting block sits directly above a balance that might be red, on the
   * screen someone opens on the morning after a bad week. "Fancy making some
   * money?" is the line this pool naturally reaches for and the one it cannot
   * have — an app whose posture is calm analyst does not open by asking
   * whether you fancy a win.
   */
  it("says nothing about money, markets or performance", () => {
    for (const template of PROMPT_TEMPLATES) {
      expect(template, template).not.toMatch(MONEY_WORDS);
    }
    for (const text of everyPrompt()) {
      expect(text, text).not.toMatch(MONEY_WORDS);
    }
  });

  it("asks rather than tells", () => {
    for (const template of PROMPT_TEMPLATES) {
      expect(template.endsWith("?"), template).toBe(true);
    }
  });
});
