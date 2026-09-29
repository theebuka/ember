/**
 * The two lines at the top of the home screen — the greeting, and the quieter
 * question under it.
 *
 * Two constraints shape this more than the copy does.
 *
 * **It cannot render on the server.** The greeting depends on the viewer's
 * local hour, and the server has no idea what that is — the same problem ADR
 * 0017 solved for every other clock-dependent string in the app. Callers
 * render nothing until mounted and reserve the line's height.
 *
 * **It must not reshuffle.** A greeting that picks a new line on every render
 * flickers during hydration and changes while you are reading it. The choice
 * is therefore a pure function of a seed the caller holds still for the
 * session, not a `Math.random()` at render time.
 *
 * The register is warm but not cute. "Welcome, traveller" is the outer edge;
 * anything that would make a person holding a losing position feel patronised
 * is not in the pool. Nothing here mentions money, markets or performance,
 * because the greeting sits directly above a number that might be red.
 */

/** Time-of-day buckets, in the viewer's own timezone. */
export type Daypart = "night" | "morning" | "afternoon" | "evening";

export function daypartOf(date: Date): Daypart {
  const h = date.getHours();
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

/**
 * `{name}` is substituted when there is one, and the whole clause is dropped
 * when there isn't — which is why every line has to read correctly both ways.
 * "Good afternoon, Travis" and "Good afternoon" are both sentences; "Welcome
 * back, Travis" and "Welcome back" are too.
 */
const PLAIN: Record<Daypart, string[]> = {
  night: ["Still up{name}?", "Late one{name}", "Evening{name}"],
  morning: ["Good morning{name}", "Morning{name}", "Early start{name}"],
  afternoon: ["Good afternoon{name}", "Afternoon{name}", "Welcome back{name}"],
  evening: ["Good evening{name}", "Evening{name}", "Welcome back{name}"],
};

/**
 * The occasional odd one, drawn from any hour.
 *
 * Roughly one visit in four. Every one of these has to survive being read on a
 * bad day: they are about the arrival, never about the portfolio.
 */
const WRY = [
  "Welcome, traveller",
  "There you are{name}",
  "Look who it is{name}",
  "Back for more{name}",
  "At your service{name}",
];

/** Deterministic, uniform enough, and stable for a given seed. */
function pick<T>(items: readonly T[], seed: number): T {
  const h = Math.abs(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b)) >>> 0;
  return items[h % items.length];
}

/**
 * The line, split at the name.
 *
 * Returned in parts rather than as a sentence so the caller can give the name
 * its own treatment — which is what makes the line read as a greeting rather
 * than as one more heading in ink. Joining is `greetingText`, and it is the
 * only place the parts are reassembled, so the visible line and the one a
 * screen reader announces cannot drift.
 */
export interface GreetingParts {
  /** Everything before the name. "Good morning", "Still up". */
  lead: string;
  /** The name, or null when there isn't one or the line never takes one. */
  name: string | null;
  /** Whatever closes the line after the name — usually "", sometimes "?". */
  tail: string;
}

/**
 * @param seed  Held still for the session by the caller. Changing it picks a
 *              new line; leaving it alone keeps the same one across renders.
 */
export function greeting({
  now,
  name,
  seed,
}: {
  now: Date;
  name?: string | null;
  seed: number;
}): GreetingParts {
  const wry = Math.abs(Math.imul(seed ^ 0x27d4eb2f, 0x165667b1)) >>> 0;
  const pool = wry % 4 === 0 ? WRY : PLAIN[daypartOf(now)];
  const line = pick(pool, seed);

  const trimmed = name?.trim() || null;
  const [before, after = ""] = line.split("{name}");

  // No placeholder in this line ("Welcome, traveller"), or nobody to address.
  // Both collapse to a lead with no name, and the template's own tail has to
  // come back with it or "Still up?" loses its question mark.
  if (!line.includes("{name}") || trimmed === null) {
    return { lead: before + after, name: null, tail: "" };
  }

  return { lead: `${before}, `, name: trimmed, tail: after };
}

/** The whole line as one string — the accessible name, and what tests assert. */
export function greetingText(parts: GreetingParts): string {
  return parts.name === null
    ? parts.lead
    : `${parts.lead}${parts.name}${parts.tail}`;
}

/* ── The lead question ─────────────────────────────────────────────────────
   The quieter second line under the greeting.

   Same two constraints as above — clock-dependent, so it renders after mount,
   and seeded, so it holds still while it is being read. Two more of its own.

   **It inherits the money rule, and here it costs something.** The register
   this pool naturally reaches for is "fancy making some money?", and that is
   the one line it cannot have: it sits four rems above a balance that might be
   red, on the screen a person opens on the morning after a bad week. An app
   whose whole posture is calm analyst does not open by asking someone whether
   they fancy a win — that is the greeting a casino writes. `MONEY_WORDS` below
   turns the header comment's rule into something a test can fail on.

   **It must not repeat the greeting.** "Good morning" over "How are we feeling
   this morning?" is the kind of thing that reads fine in a spec and looks
   careless on a screen, so the daypart templates are filtered out whenever the
   line above already used the word. */

/**
 * `{daypart}` is the viewer's own part of the day. There is deliberately no
 * entry for `night`: "this night" is not English, and "this evening" at 2am is
 * a different lie. Templates that want the word are simply dropped then.
 */
const DAYPART_WORD: Record<Daypart, string | null> = {
  night: null,
  morning: "morning",
  afternoon: "afternoon",
  evening: "evening",
};

const PROMPTS = [
  "What are our goals today?",
  "How are we feeling this {daypart}?",
  "Where would you like to start?",
  "Anything you want to look at?",
  "Shall we see where things stand?",
  "What's on your mind?",
  "Anything you'd like to go over?",
] as const;

/**
 * Exported for the test that reads it. A pool this small is easy to keep
 * honest by eye and impossible to keep honest by eye six months from now.
 */
export const PROMPT_TEMPLATES: readonly string[] = PROMPTS;

/**
 * The words the greeting block does not say. Not a content filter — a record
 * of the one editorial rule this file has, in a form that fails a build.
 */
export const MONEY_WORDS =
  /\b(money|cash|profit|profits|gain|gains|rich|win|winning|wins|earn|earning|earnings|return|returns|market|markets|trade|trades|trading|buy|sell|portfolio|invest|investing)\b/i;

/**
 * The line under the greeting.
 *
 * @param lead  The greeting's lead, so the two lines can't say the same word
 *              twice. Pass `greeting().lead`.
 * @param seed  The session seed — the same one the greeting got. It is hashed
 *              differently here, so the pairing varies rather than the two
 *              lines moving in lockstep across visits.
 */
export function greetingPrompt({
  now,
  seed,
  lead,
}: {
  now: Date;
  seed: number;
  lead: string;
}): string {
  const word = DAYPART_WORD[daypartOf(now)];
  const usable =
    word === null || lead.toLowerCase().includes(word)
      ? PROMPTS.filter((p) => !p.includes("{daypart}"))
      : PROMPTS;

  const salt = Math.abs(Math.imul(seed ^ 0x5bf03635, 0x2545f491)) >>> 0;
  return pick(usable, salt).replace("{daypart}", word ?? "");
}
