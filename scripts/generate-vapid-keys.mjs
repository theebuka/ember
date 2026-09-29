#!/usr/bin/env node
/**
 * One VAPID keypair, printed in the shape `.env.local` wants.
 *
 * `npx web-push generate-vapid-keys` does the same arithmetic and then asks you
 * to work out which half is public, which variable each belongs to, and that one
 * of them has to be `NEXT_PUBLIC_` because the browser sends it to the push
 * service at subscribe time. Getting that backwards ships the private key to
 * every visitor, which is the one mistake here that cannot be undone by
 * generating a new pair — so the script that knows the answer prints it.
 *
 * ── What a VAPID pair actually is ─────────────────────────────────────────
 *
 * An ECDSA P-256 keypair, and nothing more. It is not an account, it is not
 * issued by anybody, and there is no service to register with: Apple, Google and
 * Mozilla's push endpoints accept a subscription signed by any key and then only
 * ever accept that same key for that subscription. It identifies *this
 * deployment* to the push service, which is why rotating it invalidates every
 * subscription already stored — the browser bound its endpoint to the old public
 * key. Generate once, keep it, and the same pair goes in `.env.local` and in the
 * repository secrets the scheduler reads.
 *
 * `VAPID_SUBJECT` is the contact a push service uses if your traffic looks
 * broken. A `mailto:` you actually read.
 */

import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

const subject = process.env.VAPID_SUBJECT ?? "mailto:you@example.com";

process.stdout.write(
  [
    "",
    "A new VAPID keypair. Paste these into .env.local:",
    "",
    `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`,
    `VAPID_PRIVATE_KEY=${privateKey}`,
    `VAPID_SUBJECT=${subject}`,
    "",
    "The public half is compiled into the browser bundle on purpose — it is what",
    "the push service checks a signature against. The private half never leaves",
    "the server, and never appears under src/.",
    "",
    "Generating a second pair does not add one: every subscription already in",
    "push_subscriptions is bound to the old public key and stops accepting sends.",
    "Keep this one.",
    "",
    "The same three values go in the repository's Actions secrets, which is what",
    ".github/workflows/scheduled.yml signs its digests with.",
    "",
  ].join("\n"),
);
