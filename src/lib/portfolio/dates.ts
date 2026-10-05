/**
 * Date helpers the trade form's callers need without the form.
 *
 * `todayForInput` lived in `transaction-schema.ts`, which imports zod — so the
 * Signals feed and Home, which only prefill a date, shipped the validator on
 * every load.
 */

/** `YYYY-MM-DD` for a date input, in the user's own timezone. */
export function todayForInput(now: number = Date.now()): string {
  const d = new Date(now);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}
