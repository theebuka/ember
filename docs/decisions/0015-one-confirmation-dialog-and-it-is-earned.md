# 0015 — One confirmation dialog in the product, and it has to earn it

**Status:** accepted · phase 8

## Context

The UX bar rules out confirmation dialogs where an undo will do (CLAUDE.md
§5). Every destructive action so far — deleting a trade, removing a watchlist
row, clearing the sample book — is a toast with a 10-second undo, and no "are
you sure?" anywhere.

Settings had to offer a way to get rid of your data, and that is the first
action where the rule might not hold. Once preferences are wiped there is
nothing left holding a memento to restore from, and the flag saying setup is
done goes with them.

Collapsing everything into one **Clear my data** button would have forced the
easier half — dropping the ledger — to carry the heavier ceremony.

## Decision

Two actions, split by whether an undo can actually reach them.

**Clear your transactions** — the ledger and nothing else. The rows are
captured before the wipe and put back by `replaceAll(previous, wasSample)`,
ids and sample flag intact. Toast, undo, no dialog, exactly like every other
reversible action.

**Reset everything** — ledger, watchlist, handled calls, every preference, and
the onboarding cookie, then back to setup. Nothing survives to restore from.
This one gets the dialog, and the dialog:

- itemises what goes, by count, rather than saying "all your data";
- offers **Export first** inline, so the answer to "wait, my trades" is one
  press away instead of a cancel and a hunt;
- says plainly that it is *"the only action in ember an undo can't cover"* —
  which is both true and the reason it looks different from everything else.

The confirm button is the **tinted** destructive variant, not a saturated clay
slab with white type. Direction colours in ember are low-chroma and appear as
fills behind their own text; a full-bleed red button is the alarm register the
palette exists to avoid, and this is a dialog the user opened deliberately
rather than a warning shouted at them.

## Alternatives considered

**Type the word DELETE.** Effective, and it treats a local-only app with no
account and no shared state like a production database console. It also
teaches people to type past friction.

**Make reset undoable too.** Possible — snapshot everything into memory and
offer a toast. But "undo" that restores your risk profile, your watchlist and
your ledger from a toast that expires in ten seconds is a promise the shape of
the affordance can't carry, and if the tab is closed in that window it was a
lie.

**No reset at all; tell people to clear site data.** Pushes an in-app job into
browser settings, and takes the export button with it.

## Consequences

- The no-confirmation-dialog rule stays defensible precisely because there is
  one exception and it is argued rather than assumed.
- Reset lands on `/onboarding` rather than the dashboard. Wiping the app
  should look like a fresh install, and the dialog says so before you press.
- Export exists because reset does. An app that can wipe your ledger and can't
  hand it back is asking for a trust it hasn't earned — so CSV round-trips
  through ember's own importer, and there is a test proving it.
