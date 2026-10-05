#!/usr/bin/env node
/**
 * Reach people when the app is closed.
 *
 * Since phase 9 ember's alert watcher has run in a tab, which means a window
 * that opened overnight was recorded and never delivered — the honest limit §8
 * has carried ever since. This is what removes it.
 *
 * **Why a script and not a route.** Sending needs to read every recipient's
 * watchlist and preferences, which RLS correctly forbids to the anon key, so it
 * needs the service role — and that key must never appear under `src/`. It is the
 * same boundary `collect-ngx.mjs` uses, and it has a second benefit: the engine
 * stays exactly where it is. This script does not import `lib/signals`; it asks
 * the running app over HTTP, the same way any other reader does.
 *
 * **Compute once, deliver many.** One `/api/advice` request per *risk profile*,
 * shared by every recipient on that profile. The useful half of the caching
 * argument from the phase 14–16 review, without the WebSockets — at zero users
 * that infrastructure would be a costume.
 *
 * Usage:
 *   node scripts/send-digests.mjs --channel=push
 *   node scripts/send-digests.mjs --channel=email --cadence=daily
 *   node scripts/send-digests.mjs --channel=email --cadence=weekly --dry-run
 *
 * Idempotent by design rather than by luck: every send writes `digest_log`, and
 * the floor below is read from it — so a scheduler that fires twice stands down
 * the second time instead of sending twice.
 */

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

/* ── Arguments ───────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const flag = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;

const CHANNEL = flag("channel");
const CADENCE = flag("cadence", "weekly");

if (CHANNEL !== "email" && CHANNEL !== "push") {
  console.error("--channel=email or --channel=push is required");
  process.exit(1);
}
if (CHANNEL === "email" && CADENCE !== "daily" && CADENCE !== "weekly") {
  console.error("--cadence must be daily or weekly");
  process.exit(1);
}

/* ── Environment ─────────────────────────────────────────────────────────── */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = (process.env.EMBER_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

const RESEND_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMBER_EMAIL_FROM ?? "ember <alerts@example.com>";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? APP_URL;

/* ── Thresholds ──────────────────────────────────────────────────────────── */

const HOUR = 3_600_000;

/**
 * The floor on how often one person can be contacted, per channel.
 *
 * "A few opportunities have shown up" is the trigger, so the failure mode to
 * design against is not silence — it is an app that mails you twice on a busy
 * Tuesday. `lib/notifications/schedule.ts` already encodes "never twice about
 * the same thing" for in-app alerts; this is that discipline at a coarser grain.
 *
 * Slightly under the nominal period on purpose. A daily job that runs at 07:00
 * and demands a full 24 hours will skip every other day the moment the runner
 * starts a minute late, which is how a daily digest quietly becomes an
 * alternate-day one.
 */
const FLOOR = {
  email: { daily: 20 * HOUR, weekly: 6 * 24 * HOUR },
  push: 2 * HOUR,
};

/** A push must not repeat a symbol it has already mentioned this recently. */
const PUSH_REPEAT_WINDOW = 24 * HOUR;

/**
 * Push and email are both Pro (decision 288), so a free account is simply held.
 *
 * **The plan check has to happen here, not only in the UI.** A client-side gate is
 * cosmetic — the row can already say `digest_enabled` or hold a subscription
 * because the user was Pro and lapsed, and only the sender is in a position to
 * refuse.
 */

/**
 * `/api/advice` locks most calls for a request with no Pro session. The sender
 * sends only to Pro accounts, so it presents this token for Pro's answer; it
 * must match `EMBER_SENDER_TOKEN` on the app.
 */
const SENDER_TOKEN = process.env.EMBER_SENDER_TOKEN ?? "";

/* ── Clients ─────────────────────────────────────────────────────────────── */

if (!URL || !SERVICE_KEY) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are both required.\n" +
      "Run with --dry-run to see what would be sent (still needs read access).",
  );
  process.exit(1);
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

if (CHANNEL === "push") {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.error(
      "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required to send push.\n" +
        "Generate a pair with: npx web-push generate-vapid-keys",
    );
    process.exit(1);
  }
  // web-push requires the subject to be a mailto: address or an https URL; it is
  // what a push service contacts if ember's sending misbehaves.
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

/* ── The engine, over HTTP ───────────────────────────────────────────────── */

const adviceCache = new Map();

/**
 * One request per risk profile, cached for the run.
 *
 * This is the "compute once" half. `/api/advice` is memoised server-side for a
 * minute anyway, so even a cache miss here is cheap — but the point is that a
 * hundred recipients on the balanced profile cause one assessment cycle, not a
 * hundred.
 */
async function adviceFor(profile) {
  const hit = adviceCache.get(profile);
  if (hit) return hit;

  const response = await fetch(`${APP_URL}/api/advice?profile=${profile}`, {
    headers: {
      accept: "application/json",
      ...(SENDER_TOKEN ? { "x-ember-sender": SENDER_TOKEN } : {}),
    },
  });
  if (!response.ok) throw new Error(`/api/advice?profile=${profile} → ${response.status}`);

  const body = await response.json();
  const actionable = new Set(body.actionable ?? []);
  const value = {
    bySymbol: new Map(
      (body.assessments ?? []).map((a) => [a.symbol, a]),
    ),
    actionable,
  };
  adviceCache.set(profile, value);
  return value;
}

/* ── Recipients ──────────────────────────────────────────────────────────── */

/**
 * What ember is allowed to say to this person, and about what.
 *
 * Returns null — meaning send nothing — in three cases, and each of them is a
 * decision rather than an omission:
 *
 *   - **the watchlist is still the "everything" sentinel.** `symbols` is null
 *     when the user has never curated a list (decision 023), and resolving that
 *     to all 214 instruments would mail somebody every call ember has. It is
 *     decision 084's rule one layer out: a preference expressed about everything
 *     is a preference expressed about nothing.
 *   - **nothing on the list clears their bar today.** The commonest case, and
 *     the whole reason this is a digest.
 *   - **they were contacted too recently.** See `FLOOR`.
 */
async function candidateFor(userId, { channel, cadence, recentSymbols }) {
  const [{ data: watchlist }, { data: prefs }] = await Promise.all([
    supabase.from("watchlist").select("symbols").eq("user_id", userId).maybeSingle(),
    supabase.from("preferences").select("data").eq("user_id", userId).maybeSingle(),
  ]);

  const followed = watchlist?.symbols ?? null;
  if (!followed || followed.length === 0) return null;

  const profile = prefs?.data?.riskProfile ?? "balanced";
  const markets = prefs?.data?.markets ?? null;

  const { bySymbol, actionable } = await adviceFor(profile);

  const picks = [];
  for (const symbol of followed) {
    if (!actionable.has(symbol)) continue;
    const assessment = bySymbol.get(symbol);
    if (!assessment) continue;
    // A market the user switched off in settings is not a market to email them
    // about. The in-app feed honours this; a digest that ignored it would be the
    // one place ember overrode a setting.
    if (markets && markets[assessment.market] === false) continue;
    // Push only: a symbol already pushed inside the repeat window is old news.
    if (channel === "push" && recentSymbols.has(symbol)) continue;
    picks.push(assessment);
  }

  if (picks.length === 0) return null;

  // Strongest first, the same ordering the feed uses, so the email agrees with
  // the app a reader opens straight afterwards.
  picks.sort(
    (a, b) => Math.abs(b.score) * b.confidence - Math.abs(a.score) * a.confidence,
  );

  return { userId, profile, picks, cadence };
}

/**
 * Which plan this user is on, right now.
 *
 * `period_end` is read as a grace boundary rather than a kill switch, matching
 * `planFrom` in `src/lib/plan.ts`: a lapsed subscription reads as free and nothing
 * is deleted or hidden. Absent row, absent plan and expired period all mean free,
 * which is the right answer to every uncertainty here.
 */
async function planFor(userId) {
  const { data } = await supabase
    .from("entitlements")
    .select("plan, period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data || data.plan !== "pro") return "free";
  if (!data.period_end) return "pro";
  return Date.parse(data.period_end) > Date.now() ? "pro" : "free";
}

/** The last time this user was contacted on this channel, and about what. */
async function historyFor(userId, channel) {
  const { data } = await supabase
    .from("digest_log")
    .select("sent_at, symbols")
    .eq("user_id", userId)
    .eq("channel", channel)
    .order("sent_at", { ascending: false })
    .limit(20);

  const rows = data ?? [];
  const lastAt = rows[0] ? Date.parse(rows[0].sent_at) : 0;

  const recentSymbols = new Set();
  const cutoff = Date.now() - PUSH_REPEAT_WINDOW;
  for (const row of rows) {
    if (Date.parse(row.sent_at) < cutoff) break;
    for (const symbol of row.symbols ?? []) recentSymbols.add(symbol);
  }

  return { lastAt, recentSymbols };
}

/* ── Composing ───────────────────────────────────────────────────────────── */

function actionLabel(action) {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function whenPhrase(assessment, now) {
  const { hasWindow, opensAt, closesAt } = assessment.window ?? {};
  if (!hasWindow) return "no tradeable window in the next few days";
  if (now >= opensAt && now <= closesAt) return "the window is open now";
  const hours = Math.max(1, Math.round((opensAt - now) / HOUR));
  return hours < 24
    ? `the window opens in about ${hours} ${hours === 1 ? "hour" : "hours"}`
    : `the window opens in about ${Math.round(hours / 24)} days`;
}

/**
 * The email.
 *
 * Plain HTML and a plain-text twin, no images, no tracking pixel — a mail that
 * phones home about whether you opened it is not the register this product is
 * written in, and the one thing an ad-free finance app has is that it isn't
 * watching you.
 *
 * The footer carries the limitation rather than burying it: **a digest cannot
 * warn you about a position.** Loss prevention needs holdings, holdings never
 * reach the server (ADR 0025 sends them per request and stores nothing), and a
 * user who assumed otherwise would be trusting an email to do the one thing it
 * structurally cannot.
 */
function composeEmail({ picks, cadence, unsubscribeToken }) {
  const now = Date.now();
  const count = picks.length;
  const subject =
    count === 1
      ? `${picks[0].symbol} — one call on your watchlist`
      : `${count} calls on your watchlist`;

  const lines = picks.slice(0, 12).map((a) => ({
    symbol: a.symbol,
    action: actionLabel(a.action),
    confidence: `${a.confidenceLabel} · ${a.confidence}`,
    when: whenPhrase(a, now),
    detail: a.summary ?? "",
  }));

  const unsubscribeUrl = `${APP_URL}/unsubscribe?token=${unsubscribeToken}`;

  const text = [
    `${count === 1 ? "One instrument" : `${count} instruments`} you follow ${count === 1 ? "clears" : "clear"} your bar.`,
    "",
    ...lines.map(
      (l) => `${l.action} ${l.symbol} — ${l.confidence}. ${l.when}.\n  ${l.detail}`,
    ),
    "",
    `Open ember: ${APP_URL}/signals`,
    "",
    "This digest covers the instruments on your watchlist. It cannot warn you about",
    "a position you hold — that needs your holdings, and ember does not keep them on",
    "the server. Those warnings stay in the app and in push notifications.",
    "",
    "ember gives information, not financial advice.",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");

  const rows = lines
    .map(
      (l) => `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #ECEDF1;">
          <div style="font-size:15px;color:#0B0C0F;">
            <strong style="font-weight:600;">${l.action} ${l.symbol}</strong>
            <span style="color:#62656F;"> · ${l.confidence}</span>
          </div>
          <div style="font-size:13px;color:#62656F;margin-top:3px;">${l.when}</div>
          <div style="font-size:13px;color:#2E3038;margin-top:5px;">${l.detail}</div>
        </td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#F5F6F8;">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#62656F;">ember</div>
    <h1 style="font-size:22px;line-height:1.3;color:#0B0C0F;margin:10px 0 4px;font-weight:600;">
      ${count === 1 ? "One instrument you follow" : `${count} instruments you follow`}
    </h1>
    <p style="font-size:15px;color:#62656F;margin:0 0 18px;">
      ${count === 1 ? "clears" : "clear"} your ${cadence === "daily" ? "bar today" : "bar this week"}.
    </p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <p style="margin:22px 0 0;">
      <a href="${APP_URL}/signals" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:11px 18px;border-radius:999px;">Open ember</a>
    </p>
    <p style="font-size:13px;color:#62656F;line-height:1.55;margin:24px 0 0;">
      This digest covers the instruments on your watchlist. <strong style="font-weight:600;">It cannot
      warn you about a position you hold</strong> — that needs your holdings, and ember does not keep
      them on the server. Those warnings stay in the app and in push notifications.
    </p>
    <p style="font-size:13px;color:#62656F;margin:14px 0 0;">
      ember gives information, not financial advice.
    </p>
    <p style="font-size:12px;color:#9A9CA6;margin:14px 0 0;">
      <a href="${unsubscribeUrl}" style="color:#9A9CA6;">Unsubscribe from digests</a>
    </p>
  </div>
</body></html>`;

  return { subject, html, text, unsubscribeUrl };
}

/** The push payload. `public/sw.js` has been waiting for this shape since phase 9. */
function composePush({ picks }) {
  const now = Date.now();
  const lead = picks[0];
  const rest = picks.length - 1;

  return {
    title:
      picks.length === 1
        ? `${actionLabel(lead.action)} ${lead.symbol}`
        : `${actionLabel(lead.action)} ${lead.symbol} and ${rest} more`,
    body: `${lead.confidenceLabel} · ${lead.confidence} — ${whenPhrase(lead, now)}.`,
    url: "/signals",
    tag: `digest:${picks.map((p) => p.symbol).join(",")}`,
  };
}

/* ── Sending ─────────────────────────────────────────────────────────────── */

async function sendEmail(userId, composed) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) {
    console.log(`  ${userId} — no address on the account, skipped`);
    return false;
  }
  if (!RESEND_KEY) {
    console.log(`  ${userId} — RESEND_API_KEY unset, not sent`);
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${RESEND_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: data.user.email,
      subject: composed.subject,
      html: composed.html,
      text: composed.text,
      // RFC 8058. Lets a mail client offer its own one-tap unsubscribe, which is
      // both better for the reader and what the large providers now expect from
      // anything sending bulk mail.
      headers: {
        "List-Unsubscribe": `<${composed.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  if (!response.ok) {
    console.log(`  ${userId} — Resend answered ${response.status}`);
    return false;
  }
  return true;
}

async function sendPush(userId, payload) {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_secret")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return false;

  let delivered = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        // `auth_secret` in the column, `auth` in the spec — see the migration for
        // why the two differ.
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } },
        JSON.stringify(payload),
      );
      delivered++;
      await supabase
        .from("push_subscriptions")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("endpoint", sub.endpoint);
    } catch (error) {
      const status = error?.statusCode;
      // 404 and 410 mean the browser threw the subscription away — the app was
      // uninstalled, or the permission revoked. Keeping the row would have this
      // script fail against a dead endpoint forever.
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        console.log(`  ${userId} — endpoint gone, subscription removed`);
      } else {
        console.log(`  ${userId} — push failed (${status ?? error.message})`);
      }
    }
  }
  return delivered > 0;
}

/* ── Main ────────────────────────────────────────────────────────────────── */

async function main() {
  const now = Date.now();

  let recipients;
  if (CHANNEL === "email") {
    const { data, error } = await supabase
      .from("email_prefs")
      .select("user_id, min_findings, unsubscribe_token")
      .eq("digest_enabled", true)
      .eq("frequency", CADENCE);
    if (error) throw new Error(error.message);
    recipients = data ?? [];
  } else {
    // Push has no preference row of its own: subscribing *is* the preference,
    // and a second switch that could disagree with the browser's own permission
    // is a setting that lies half the time.
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("user_id");
    if (error) throw new Error(error.message);
    recipients = [...new Set((data ?? []).map((r) => r.user_id))].map((user_id) => ({
      user_id,
      min_findings: 1,
      unsubscribe_token: null,
    }));
  }

  /**
   * Suspended accounts, dropped before anything else runs.
   *
   * A suspension stops sync through RLS, which the client cannot get around — but
   * this script authenticates with the service role and RLS does not apply to it.
   * So the one place delivery is actually decided has to check, or "suspend sync
   * and delivery" would be a control that suspends half of what it names.
   *
   * Read once as a set rather than per recipient: it is a small table and the
   * per-recipient version is another round trip inside a loop that already makes
   * four.
   */
  const { data: suspended } = await supabase.from("suspensions").select("user_id");
  const blocked = new Set((suspended ?? []).map((r) => r.user_id));
  const before = recipients.length;
  recipients = recipients.filter((r) => !blocked.has(r.user_id));

  console.log(
    `${CHANNEL}${CHANNEL === "email" ? ` (${CADENCE})` : ""}: ${recipients.length} ${recipients.length === 1 ? "recipient" : "recipients"} configured` +
      (before > recipients.length ? ` (${before - recipients.length} suspended)` : ""),
  );
  if (recipients.length === 0) return;

  let sent = 0;
  let held = 0;

  for (const row of recipients) {
    const { lastAt, recentSymbols } = await historyFor(row.user_id, CHANNEL);
    const floor = CHANNEL === "email" ? FLOOR.email[CADENCE] : FLOOR.push;
    if (now - lastAt < floor) {
      held++;
      continue;
    }

    // The plan gate, enforced where it can actually be enforced.
    const plan = await planFor(row.user_id);
    if (plan !== "pro") {
      // The switch may well be on: they were Pro and lapsed. Nothing is deleted
      // and nothing is hidden — delivery simply stops, and turning it back on is
      // a plan change rather than a setting change.
      held++;
      continue;
    }

    const candidate = await candidateFor(row.user_id, {
      channel: CHANNEL,
      cadence: CADENCE,
      recentSymbols,
    });
    if (!candidate) {
      held++;
      continue;
    }
    if (candidate.picks.length < row.min_findings) {
      held++;
      continue;
    }

    const symbols = candidate.picks.map((p) => p.symbol);

    if (DRY_RUN) {
      const composed =
        CHANNEL === "email"
          ? composeEmail({ ...candidate, unsubscribeToken: row.unsubscribe_token })
          : composePush(candidate);
      console.log(
        `  would send to ${row.user_id}: ${"subject" in composed ? composed.subject : composed.title}`,
      );
      console.log(`    ${symbols.join(", ")}`);
      sent++;
      continue;
    }

    const ok =
      CHANNEL === "email"
        ? await sendEmail(
            row.user_id,
            composeEmail({ ...candidate, unsubscribeToken: row.unsubscribe_token }),
          )
        : await sendPush(row.user_id, composePush(candidate));

    if (!ok) continue;

    // Logged only after a successful send. The log is a record of what was
    // delivered, never of what was due — same rule as the in-app inbox.
    await supabase.from("digest_log").insert({
      user_id: row.user_id,
      channel: CHANNEL,
      symbols,
      finding_count: symbols.length,
    });
    sent++;
  }

  console.log(
    `${DRY_RUN ? "would send" : "sent"} ${sent} · held back ${held}` +
      (held > 0 ? " (too soon, nothing on the list, or below the threshold)" : ""),
  );
}

main().catch((error) => {
  console.error(`\nsend-digests failed: ${error.message}`);
  process.exitCode = 1;
});
