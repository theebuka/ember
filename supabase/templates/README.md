# Auth email templates

Supabase sends sign-in and account emails itself, so these are pasted into the
dashboard rather than deployed. They are generated — edit
`scripts/build-email-templates.mjs` or `scripts/email/layout.mjs`, then run
`npm run emails`.

**Authentication → Emails → Templates.** For each one, paste the subject from
`subjects.json` and the whole HTML file into the message body:

| Template | File |
|---|---|
| Magic link | `magic-link.html` |
| Confirm signup | `confirm-signup.html` |
| Change email address | `change-email.html` |
| Reauthentication | `reauthentication.html` |

**Use your own SMTP before anyone real signs in.** Supabase's built-in sender is
for testing: a few emails an hour, sent from Supabase's address. Under
**Authentication → Emails → SMTP settings**, use Resend (the same account the
digest uses): host `smtp.resend.com`, port `465`, username `resend`, the API key
as the password, sender name `ember`, and a from address on your verified domain.
