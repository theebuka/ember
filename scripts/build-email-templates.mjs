/**
 * Writes the Supabase auth email templates from ember's email layout.
 *
 *   npm run emails
 *
 * Supabase sends these itself, so they live in the dashboard rather than in the
 * app: Authentication → Emails → Templates. This script writes one HTML file per
 * template into `supabase/templates/`, plus `subjects.json`; paste each into its
 * template and subject. Re-run it after changing `scripts/email/layout.mjs`.
 *
 * The `{{ … }}` placeholders are Supabase's (Go templates) and are left as they
 * are. Never add `{{ .Token }}` to a link email: ember signs in by link only, so a
 * code there would be one the app has nowhere to type.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  button,
  codeBlock,
  fallbackLink,
  footerLine,
  note,
  paragraph,
  renderEmail,
} from "./email/layout.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "supabase", "templates");

const URL = "{{ .ConfirmationURL }}";
const sentTo = footerLine("Sent to {{ .Email }} because this address was entered in ember.");

const TEMPLATES = {
  "magic-link": {
    template: "Magic link",
    subject: "Your ember sign-in link",
    html: renderEmail({
      title: "Sign in to ember",
      preheader: "Your sign-in link. It works once and expires in an hour.",
      body: [
        paragraph("Press the button to sign in. It works once and expires in an hour, and only the newest link you asked for works."),
        button("Sign in to ember", URL),
        fallbackLink(URL),
        note("Didn't ask to sign in? You can ignore this email. Nobody can get into your account without this link."),
      ].join("\n"),
      footer: sentTo,
    }),
  },

  // A new address signing in for the first time gets this one rather than the
  // magic link, so it has to read as a sign-in too — the reader didn't "sign up"
  // for anything, they asked to sign in.
  "confirm-signup": {
    template: "Confirm signup",
    subject: "Confirm your email for ember",
    html: renderEmail({
      title: "Confirm your email",
      preheader: "One step to finish creating your ember account.",
      body: [
        paragraph("Confirm this address to finish creating your ember account. You'll be signed in straight away."),
        button("Confirm and sign in", URL),
        fallbackLink(URL),
        note("Didn't try to create an account? You can ignore this email and no account will be made."),
      ].join("\n"),
      footer: sentTo,
    }),
  },

  "change-email": {
    template: "Change email address",
    subject: "Confirm your new email address",
    html: renderEmail({
      title: "Confirm your new email",
      preheader: "Confirm the change to your ember sign-in address.",
      body: [
        paragraph("You asked to change the address you sign in to ember with, from <strong style=\"font-weight:600;\">{{ .Email }}</strong> to <strong style=\"font-weight:600;\">{{ .NewEmail }}</strong>."),
        paragraph("Nothing changes until you confirm.", { top: 12 }),
        button("Confirm new address", URL),
        fallbackLink(URL),
        note("Didn't ask for this? Don't press the button, and sign in to ember to check your account. Your address stays as it is."),
      ].join("\n"),
      footer: footerLine("Sent because a change of address was requested for an ember account."),
    }),
  },

  reauthentication: {
    template: "Reauthentication",
    subject: "Your ember verification code",
    html: renderEmail({
      title: "Your verification code",
      preheader: "Enter this code in ember to confirm it's you.",
      body: [
        paragraph("Enter this code in ember to confirm it's you. It expires shortly."),
        codeBlock("{{ .Token }}"),
        note("Didn't ask for a code? Someone may be trying to change your account. Don't share this code with anyone; ember will never ask you for it."),
      ].join("\n"),
      footer: sentTo,
    }),
  },
};

mkdirSync(out, { recursive: true });
const subjects = {};
for (const [name, { template, subject, html }] of Object.entries(TEMPLATES)) {
  writeFileSync(join(out, `${name}.html`), html);
  subjects[template] = { file: `${name}.html`, subject };
}
writeFileSync(join(out, "subjects.json"), `${JSON.stringify(subjects, null, 2)}\n`);
console.log(`Wrote ${Object.keys(TEMPLATES).length} templates to supabase/templates/`);
