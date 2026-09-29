# Accessibility audit

axe-core via `scripts/audit.mjs`, 2026-08-18.

16 screens × 2 themes × 2 widths = **64 page audits**,
against WCAG 2.1 A and AA plus axe's best-practice rules, on a production build.

**No violations.**

What an automated pass can and can't tell you: axe catches contrast,
names, roles, landmarks and structure. It cannot tell you whether the
keyboard path makes sense, whether focus lands somewhere useful after a
dialog closes, or whether a screen reader's rendering of the advice card
is comprehensible. Those were checked by hand and are noted in
`CLAUDE.md` §8 where they are incomplete.
