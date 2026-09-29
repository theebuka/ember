# 0021 — The 44px floor is a hit region, and it only grows vertically

**Status:** accepted · phase 11

## Context

`ui/button.tsx` carries this comment, written in phase 0:

> shadcn tops out at 36px, below the 44px minimum touch target. `xl` is the
> size for any primary action reachable with a thumb.

And then almost nothing used `xl`. Measured across the app: `sm` (28px) on 32
call sites, `lg` (36px) on 16, `xl` (44px) on 5 — onboarding and one destructive
confirm. Every sheet footer, every empty-state CTA, every row action and the
header back button shipped under the platform minimum on both iOS and Android.
Segmented controls run 24px at `sm`; the switch's hit region measured 34px.

A missed tap is indistinguishable from a dead button, which is part of what was
reported.

## Decision

**Correct the hit region now; correct the sizes with the redesign.** The visible
control ramp is a design decision and it is being replaced wholesale in the next
phase (56 / 48 / 40 / 32). Sweeping ~50 call sites from `lg` to `xl` in the
meantime is work that the new ramp would immediately undo — and it would not fix
the switch or the segmented control, which are not `Button` at all. So the fix
is a `tap-target` utility that guarantees 44px of tappable area without changing
anything you can see.

**Coarse pointers only.** A mouse gets a precise, honest target; only touch pays
for the expansion.

**Vertical only, and this is the part worth writing down.** The obvious version
expands both axes, and it is actively harmful. The edit and delete buttons on a
transaction row are 28px wide and 4px apart. Two 44px-wide regions centred 32px
apart overlap by 10px, and the element later in the DOM — delete — owns the
overlap outright. That converts "sometimes misses" into "reliably fires the
destructive action", which is not an improvement.

Controls in this app are laid out in rows with padding above and below, so
vertical is simultaneously where the deficit is and where the slack is. It
collides with nothing.

**`tap-target` is registered with tailwind-merge, in the `position` group.** It
sets `position: relative` in order to hang the pseudo-element, which genuinely
conflicts with `absolute` — and the close button on every dialog and sheet is an
absolutely positioned `Button`. Filed in the position group, the later class
wins and a positioned button cleanly opts out. Without that, the winner is
decided by whichever rule Tailwind happened to emit last, which is nobody's
decision. Same mechanism, and same reasoning, as ADR 0016.

## Alternatives considered

**Bump the size definitions instead.** Fixes buttons, in one place, immediately
— and changes the visual density of every screen in the app as a side effect of
a bug fix. That is the redesign, and it should arrive as the redesign.

**Sweep the call sites `lg` → `xl`.** Doesn't cover the switch or the segmented
control, and every one of those edits is thrown away by the new ramp.

**Expand in both axes.** Rejected above. It is the version most codebases ship.

**Leave it until phase 12.** The new ramp bottoms out at 32px, so a floor is
still needed for icon buttons and segmented items. This utility survives the
redesign rather than being superseded by it.

## Consequences

- Measured in the browser under touch emulation: a 36px button, a 32px segmented
  item and an 18×32 switch all now report a 44px-tall hit region, with their
  visible geometry unchanged.
- The segmented control's sliding pill relies on `position: relative` for its
  `absolute inset-0` layer; `tap-target` supplies it, so the class replaced
  `relative` rather than joining it.
- Anything interactive that is not a `Button`, `Switch` or `Segmented` still has
  no floor — bare `<a>` elements in body copy, chart affordances. Recorded in
  CLAUDE.md's known gaps rather than fixed speculatively.
- `scripts/audit.mjs` does not check target size; axe's `target-size` rule is
  WCAG 2.2 AA and the audit is configured for 2.1. Worth turning on when the
  ramp changes.
