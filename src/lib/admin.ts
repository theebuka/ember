/**
 * What an admin is allowed to do, and — more usefully — what it cannot.
 *
 * A leaf module like `lib/plan.ts`: it imports nothing, so the screen, the log
 * writer and a test all read the same vocabulary with no chance of a second copy
 * drifting from it.
 *
 * ── The honest scope of "admin" in an app that works without an account ────
 *
 * ember is local-first (ADR 0031). The ledger lives on the device, the engine
 * answers anonymously, and the methodology and track record are public by design
 * (decision 051). There is no server-side state whose removal would stop somebody
 * using the product, which means **there is no such thing as banning someone from
 * ember**, and a control that implied otherwise would be a lie in the one place
 * lies are least excusable — the screen where power is exercised.
 *
 * So `suspend` names its three real effects and the copy beside it names the
 * things it does not touch. The temptation is to call it Ban because Ban is the
 * word every other admin panel uses; the plan for this phase said so first, and it
 * is right.
 */

/**
 * Every write an admin can make, as it appears in `admin_log.action`.
 *
 * A verb and its object. The database column is free text rather than an enum on
 * purpose — a log that refuses to record an action it has not heard of has a gap
 * exactly where something unusual happened — but everything this app writes comes
 * from here, so the reader has a fixed set to render labels for.
 */
export type AdminAction =
  | "notice.publish"
  | "notice.withdraw"
  | "notice.pin"
  | "notice.unpin"
  | "account.suspend"
  | "account.restore";

export const ADMIN_ACTION_LABELS: Record<AdminAction, string> = {
  "notice.publish": "Published a broadcast",
  "notice.withdraw": "Withdrew a broadcast",
  "notice.pin": "Pinned a broadcast",
  "notice.unpin": "Unpinned a broadcast",
  "account.suspend": "Suspended sync and delivery",
  "account.restore": "Restored sync and delivery",
};

/**
 * What a suspension actually does, in the order a person would ask.
 *
 * Rendered on the admin screen beside the control and, in the second person, to
 * the suspended user themselves. Kept here rather than inline so the two cannot
 * describe different things — the failure mode is an admin who believes they did
 * more than they did.
 *
 * **Two lists of three words, not two lists of three sentences.** The first cut
 * wrote each item as a full clause and the result was six lines of prose in a
 * tinted box above the control — a wall, and the thing a wall does is stop being
 * read. The nouns carry it, and `SUSPENSION_CAVEAT` says the part that genuinely
 * needs a sentence.
 */
export const SUSPENSION_STOPS = ["Sync", "Email digest", "Push"] as const;

export const SUSPENSION_DOES_NOT_STOP = [
  "Using ember",
  "Their ledger",
  "Public pages",
] as const;

/**
 * The whole caveat in one sentence, because six bullets in a tinted well was a
 * wall nobody was going to read twice.
 */
export const SUSPENSION_CAVEAT =
  "ember works with no account, so this cannot stop anyone using it.";

/**
 * The broadcast composer's own limits, checked before the database checks them.
 *
 * The point is not validation — the column constraints are the real gate — it is
 * that a broadcast is written *once* and read by everybody, so the composer should
 * argue about length while there is still somebody at the keyboard to argue with.
 */
/**
 * The bar renders the title alone, on one line, at 375px. Past this it truncates
 * in front of every user, so the composer refuses instead — the same reasoning as
 * ADR 0023's rule against producing a word fragment to make something fit.
 */
export const BAR_TITLE_LIMIT = 64;

export const BROADCAST_LIMITS = {
  title: 70,
  /**
   * Long enough to say what changed and why it matters, short enough that it is
   * still a notice rather than a blog post. Every `RELEASE_NOTICES` entry fits.
   */
  body: 400,
} as const;

/**
 * Where a broadcast is allowed to point, and it is a list rather than a text box.
 *
 * **The first broadcast ever sent linked to `/announcements/first-ever`, which
 * does not exist.** The composer accepted it because the only check was that the
 * path started with a slash — a rule that catches an external URL and nothing
 * else. Every reader who followed that link got a 404 from the product telling
 * them something important had happened.
 *
 * A free-text path cannot be validated at the point it matters: nothing in the
 * browser can ask Next.js whether a route resolves, so any check would be a
 * regex agreeing with itself. A fixed list can be wrong only if the app's own
 * routes change, and then it is wrong in a file next to them rather than in a row
 * already sent to everybody.
 *
 * There is no "custom path" escape hatch on purpose. It would be used exactly
 * once, in a hurry, for the announcement that most needed to be right — and
 * adding a destination here is one line.
 */
export const BROADCAST_LINKS: readonly { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/signals", label: "Signals feed" },
  { href: "/signals/track-record", label: "Track record" },
  { href: "/signals/methodology", label: "Methodology" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/portfolio?view=watching", label: "Portfolio — watching" },
  { href: "/news", label: "News" },
  { href: "/notifications", label: "Notifications" },
  { href: "/settings", label: "Settings" },
  { href: "/settings?tab=alerts", label: "Settings — alerts" },
  { href: "/settings?tab=data", label: "Settings — your data" },
  { href: "/settings?tab=about", label: "Settings — about" },
] as const;

const LINK_HREFS = new Set(BROADCAST_LINKS.map((link) => link.href));

export function isBroadcastLink(href: string): boolean {
  return LINK_HREFS.has(href);
}

/**
 * Where a broadcast shows up, and it is one choice rather than a switch.
 *
 * `pinned` started as a boolean and stopped being one the moment there were two
 * kinds of pin. A boolean plus a style column would let a row say "not pinned,
 * as a bar", which is not a state — three named placements cannot.
 *
 *   `inbox` — the notification centre and the bell. Where every broadcast goes.
 *   `card`  — *also* a card above the greeting on Home. One at a time.
 *   `bar`   — *also* a strip across the top of every screen. One at a time.
 *
 * Neither pin replaces the inbox copy; they are additional places to catch
 * somebody who has not opened the bell.
 *
 * **The bar is louder than the card and should be rarer.** It is on every
 * screen rather than one, it is above the app's own chrome, and it interrupts
 * somebody who came to do something specific. It is for the things a card is too
 * quiet for — an outage, a change to what ember stores — and the composer says so.
 */
export type BroadcastPlacement = "inbox" | "card" | "bar";

export const PLACEMENT_LABELS: Record<BroadcastPlacement, string> = {
  inbox: "Inbox only",
  card: "Card on Home",
  bar: "Bar on every screen",
};

export const PLACEMENT_HINTS: Record<BroadcastPlacement, string> = {
  inbox: "The notification centre.",
  card: "Also a card on Home.",
  bar: "Also one line on every screen. Keep it for outages.",
};

export interface BroadcastDraft {
  title: string;
  body: string;
  href: string;
  action: string;
  placement: BroadcastPlacement;
}

export const EMPTY_DRAFT: BroadcastDraft = {
  title: "",
  body: "",
  href: "",
  action: "",
  placement: "inbox",
};

/**
 * Why this draft cannot be published yet, or null.
 *
 * One message at a time, in the order a person fills the form in, because a list
 * of four complaints about a form somebody has barely started is noise.
 *
 * A link is optional; an *action label* without a link is not, because the label
 * is the text of a button that would go nowhere. The reverse is fine — a link with
 * no label renders as "View", the same default the notification centre uses.
 */
export function draftProblem(draft: BroadcastDraft): string | null {
  if (draft.title.trim().length === 0) return "A broadcast needs a title.";
  if (draft.title.length > BROADCAST_LIMITS.title) {
    return `Titles run to ${BROADCAST_LIMITS.title} characters.`;
  }
  if (draft.body.trim().length === 0) return "Say what changed, and why it matters.";
  if (draft.body.length > BROADCAST_LIMITS.body) {
    return `Keep it under ${BROADCAST_LIMITS.body} characters — this is a notice, not a post.`;
  }
  // Checked against the list rather than against a shape. The first broadcast
  // ever sent shipped a 404 to every reader past a `startsWith("/")` test.
  if (draft.href.length > 0 && !isBroadcastLink(draft.href)) {
    return "That link isn't a screen in ember. Pick one from the list.";
  }
  if (draft.action.length > 0 && draft.href.length === 0) {
    return "An action label needs somewhere to go.";
  }
  // The bar is one line on every screen in the app, so a title that cannot fit
  // one is a title that will be cut off in front of everybody.
  if (draft.placement === "bar" && draft.title.length > BAR_TITLE_LIMIT) {
    return `A bar shows one line. Keep the title under ${BAR_TITLE_LIMIT} characters.`;
  }
  return null;
}
