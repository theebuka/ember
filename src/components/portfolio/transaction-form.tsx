"use client";

import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Segmented } from "@/components/common/segmented";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Instrument, Quote, Transaction } from "@/lib/api/types";
import { MARKET_LABELS } from "@/lib/api/types";
import { formatMoney, formatQuantity } from "@/lib/market/format";
import { quantityHeldAt } from "@/lib/portfolio/derive";
import {
  toTransaction,
  todayForInput,
  transactionSchema,
  type TransactionFormValues,
} from "@/lib/portfolio/transaction-schema";
import { cn } from "@/lib/utils";

/**
 * Add or edit a trade.
 *
 * The form is the ledger's only writer, so it is also where the ledger's
 * invariants get enforced — `derive.ts` clamps an impossible sell so a bad row
 * can't corrupt every figure downstream, but clamping silently is not an
 * acceptable answer to a user. This is where it gets said out loud.
 *
 * Two things are shown that most transaction forms don't bother with: the
 * quantity actually held on the chosen date, and the total the trade comes to.
 * Both exist to catch typos before they become a portfolio that disagrees with
 * a broker statement — a misplaced decimal is invisible in a `price` field and
 * obvious in a total.
 */
export function TransactionForm({
  instruments,
  quotes,
  existing,
  editing,
  defaults,
  onSubmit,
  onCancel,
}: {
  instruments: readonly Instrument[];
  quotes: readonly Quote[];
  /** The rest of the ledger, for the oversell check. */
  existing: readonly Transaction[];
  editing?: Transaction;
  /**
   * Pre-filled values for a new trade.
   *
   * The advice feed uses this when "Execute" is pressed, so the sizing the
   * engine recommended arrives in the form rather than being something the
   * user has to copy across by hand. Everything stays editable — a suggestion
   * that fills itself in and can't be changed is not a suggestion.
   */
  defaults?: Partial<TransactionFormValues>;
  onSubmit: (values: Omit<Transaction, "id">) => void;
  onCancel: () => void;
}) {
  const schema = useMemo(
    () => transactionSchema({ existing, editingId: editing?.id }),
    [existing, editing?.id],
  );

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? {
          symbol: editing.symbol,
          side: editing.side,
          quantity: String(editing.quantity),
          price: String(editing.price),
          fees: editing.fees === undefined ? "" : String(editing.fees),
          date: editing.date.slice(0, 10),
          account: editing.account ?? "",
          note: editing.note ?? "",
        }
      : {
          symbol: "",
          side: "buy",
          quantity: "",
          price: "",
          fees: "",
          date: todayForInput(),
          account: "",
          note: "",
          ...defaults,
        },
    // Validate as the user leaves each field, then live once it has failed
    // once. Validating on every keystroke from the start marks a field
    // invalid while it's still being typed into, which reads as nagging.
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  // `useWatch` rather than `form.watch()`. The latter returns a fresh function
  // each render, so the React Compiler bails out of memoising this whole
  // component — and it's the largest one on the screen.
  // `useWatch` reports a deep-partial, so each field is read with the same
  // fallback the form was initialised with.
  const watched = useWatch({ control: form.control });
  const side = watched.side ?? "buy";
  const symbol = watched.symbol ?? "";
  const quantityText = watched.quantity ?? "";
  const priceText = watched.price ?? "";
  const feesText = watched.fees ?? "";
  const dateText = watched.date ?? "";

  const instrument = instruments.find((i) => i.symbol === symbol);
  const quote = quotes.find((q) => q.symbol === symbol);

  const held = useMemo(() => {
    if (!symbol || !dateText) return null;
    return quantityHeldAt(existing, symbol, Date.parse(dateText), editing?.id);
  }, [existing, symbol, dateText, editing?.id]);

  const total = useMemo(() => {
    const quantity = Number(quantityText);
    const price = Number(priceText);
    const fees = feesText.trim() === "" ? 0 : Number(feesText);
    if (!Number.isFinite(quantity) || !Number.isFinite(price) || !Number.isFinite(fees)) {
      return null;
    }
    if (quantity <= 0 || price <= 0) return null;
    // A buy costs the fee; a sell nets it out of the proceeds.
    return side === "buy" ? quantity * price + fees : quantity * price - fees;
  }, [quantityText, priceText, feesText, side]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Instrument[]>();
    for (const i of instruments) {
      const list = groups.get(i.market) ?? [];
      list.push(i);
      groups.set(i.market, list);
    }
    return [...groups.entries()];
  }, [instruments]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => onSubmit(toTransaction(v)))}
        className="flex min-h-0 flex-col"
        noValidate
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
          <FormField
            control={form.control}
            name="side"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Side</FormLabel>
                <FormControl>
                  <Segmented
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { value: "buy", label: "Bought" },
                      { value: "sell", label: "Sold" },
                    ]}
                    aria-label="Side"
                    className="w-full [&>button]:flex-1"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="symbol"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Asset</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Pick an asset" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {grouped.map(([market, list]) => (
                      <SelectGroup key={market}>
                        <SelectLabel>
                          {MARKET_LABELS[market as keyof typeof MARKET_LABELS]}
                        </SelectLabel>
                        {list.map((i) => (
                          <SelectItem key={i.symbol} value={i.symbol}>
                            <span className="mono-label text-caption">{i.symbol}</span>
                            <span className="text-stone">{i.name}</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className="num h-9"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                    />
                  </FormControl>
                  {held !== null && held > 0 && (
                    <FormDescription>
                      You held {formatQuantity(held, instrument?.market ?? "equity")} then
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Price
                    {instrument && instrument.market !== "fx" && (
                      <span className="mono-label text-micro text-stone">
                        {instrument.currency}
                      </span>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className="num h-9"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                    />
                  </FormControl>
                  {quote && (
                    // Offered, not filled in. Silently prefilling a price the
                    // user didn't pay is how a ledger stops being a record.
                    <FormDescription>
                      <button
                        type="button"
                        onClick={() =>
                          form.setValue("price", String(quote.price), {
                            shouldValidate: true,
                          })
                        }
                        className="rounded-sm underline underline-offset-2 hover:text-stone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        Use today&apos;s {quote.price.toFixed(instrument?.precision ?? 2)}
                      </button>
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" max={todayForInput()} className="num h-9" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fees"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fees</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className="num h-9"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="account"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    className="h-9"
                    autoComplete="off"
                    placeholder="Brokerage, exchange, wherever it sits"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Note</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={2}
                    placeholder="Why you did it — useful when you look back."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="border-t border-line p-4 md:p-5">
          <div
            className={cn(
              "mb-3 flex items-baseline justify-between",
              !total && "opacity-0",
            )}
            // Kept in the layout when empty so the footer doesn't jump the
            // moment a price is typed.
            aria-hidden={!total}
          >
            <span className="text-caption text-stone">
              {side === "buy" ? "Total cost" : "Net proceeds"}
            </span>
            <span className="num text-heading font-medium text-ink">
              {total !== null && instrument
                ? formatMoney(total, instrument.currency)
                : "—"}
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button type="submit" size="lg" className="flex-1">
              {editing ? "Save changes" : "Log trade"}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
