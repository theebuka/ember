import { toast } from "sonner";

/**
 * A toast whose undo the user can actually reach.
 *
 * Sonner's default is four seconds. That's fine for "Saved", and far too short
 * for the only affordance standing between a mis-tap and a deleted trade —
 * four seconds is roughly how long it takes to notice the toast, read it, and
 * decide, at which point it's gone.
 *
 * Ten seconds is the number here because the alternative is a confirmation
 * dialog, and the UX bar rules those out where an undo will do (CLAUDE.md §5).
 * An undo that expires before it's read isn't an undo; it's a notification
 * with a button on it, and it makes the no-confirm-dialog choice indefensible.
 */
const UNDO_DURATION = 10_000;

export function undoableToast(
  message: string,
  {
    description,
    onUndo,
  }: {
    description?: string;
    onUndo: () => void;
  },
) {
  toast(message, {
    description,
    duration: UNDO_DURATION,
    action: { label: "Undo", onClick: onUndo },
  });
}
