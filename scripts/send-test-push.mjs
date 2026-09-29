#!/usr/bin/env node
/**
 * Send one real push, now, to prove the server can reach a device.
 *
 * **This is the half the in-app "Send a test" button cannot do.** That button
 * draws a notification locally, which proves the browser, the service worker and
 * the OS. It never touches the network. This script signs a payload with the
 * VAPID private key and posts it to the push service, which is the part that
 * involves a stored subscription, a key pair and an endpoint that can expire —
 * in other words, every piece that actually goes wrong.
 *
 * A script rather than a route, for the reason every privileged job here is a
 * script: it needs the service-role key to read subscriptions that are not its
 * own, and that key must never appear under `src/` (ADR 0037).
 *
 *   node scripts/send-test-push.mjs                 every subscription
 *   node scripts/send-test-push.mjs --user=<uuid>   one account's devices
 *
 * Needs, in the environment or `.env.local`:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 *
 * It ignores the delivery floor and the plan caps on purpose. Those are correct
 * for a digest and wrong for a diagnostic — a test that silently stands down
 * because you ran it twice is a test that teaches you nothing.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

for (const line of readEnvFile()) {
  const at = line.indexOf("=");
  if (at < 1 || line.trimStart().startsWith("#")) continue;
  const key = line.slice(0, at).trim();
  if (!process.env[key]) process.env[key] = line.slice(at + 1).trim();
}

function readEnvFile() {
  try {
    return readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n");
  } catch {
    return [];
  }
}

const {
  NEXT_PUBLIC_SUPABASE_URL: URL_,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: VAPID_PUBLIC,
  VAPID_PRIVATE_KEY: VAPID_PRIVATE,
  VAPID_SUBJECT = "mailto:hello@ember.app",
} = process.env;

const missing = Object.entries({ URL_, SERVICE_KEY, VAPID_PUBLIC, VAPID_PRIVATE })
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  // Named rather than "configuration error", because the whole point of running
  // this is to find out which piece is not set up yet.
  console.error(`Missing: ${missing.join(", ")}`);
  process.exit(1);
}

const only = process.argv.find((a) => a.startsWith("--user="))?.slice(7);

const supabase = createClient(URL_, SERVICE_KEY, {
  auth: { persistSession: false },
});
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

let query = supabase.from("push_subscriptions").select("user_id, endpoint, p256dh, auth_secret");
if (only) query = query.eq("user_id", only);

const { data, error } = await query;
if (error) {
  console.error(error.message);
  process.exit(1);
}

if (!data || data.length === 0) {
  console.log(
    only
      ? "No subscriptions for that account. Turn push on in Settings → Alerts on the device you want to reach."
      : "No subscriptions at all. Turn push on in Settings → Alerts first.",
  );
  process.exit(0);
}

console.log(`${data.length} subscription${data.length === 1 ? "" : "s"}`);

let sent = 0;
for (const row of data) {
  try {
    await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_secret } },
      JSON.stringify({
        title: "ember reached this device",
        body: "Sent from the server. Push is working end to end.",
        url: "/notifications",
      }),
    );
    sent++;
    console.log(`  sent  ${row.endpoint.slice(0, 56)}…`);
  } catch (cause) {
    // 404 and 410 mean the browser threw the subscription away — a reinstall, a
    // cleared profile, a revoked permission. Dropping the row here is the same
    // cleanup `send-digests.mjs` does, and it is why running this twice can
    // legitimately reach fewer devices the second time.
    const status = cause?.statusCode;
    if (status === 404 || status === 410) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
      console.log(`  gone  ${row.endpoint.slice(0, 56)}… (removed)`);
    } else {
      console.log(`  failed ${status ?? ""} ${cause?.body ?? cause?.message ?? cause}`);
    }
  }
}

console.log(`${sent} delivered`);
