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
import { openSymbols, quantityHeldAt } from "@/lib/portfolio/derive";
import { PlanCard } from "@/components/plan/upsell";
import { usePlan } from "@/hooks/use-plan";
import { holdingLimit } from "@/lib/plan";
import { usePortfolio } from "@/store/use-portfolio";
import {
  toTransaction,
  todayForInput,
  transactionSchema,
  type TransactionFormValues,
} from "@/lib/portfolio/transaction-schema";

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
  const { plan } = usePlan();
  const isSample = usePortfolio((s) => s.isSample);
  // A sample book is exempt: it is a demonstration, and it already holds more
  // than free's limit. The limit applies from the reader's own first trade.
  const limit = isSample ? null : holdingLimit(plan);
  const schema = useMemo(
    () => transactionSchema({ existing, editingId: editing?.id, holdingLimit: limit }),
    [existing, editing?.id, limit],
  );
  const open = useMemo(
    () => openSymbols(existing.filter((t) => t.id !== editing?.id)),
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

  // Said as soon as the asset is picked, rather than on submit: the schema
  // refuses the same case, but nobody should fill in a whole trade first.
  const limitHit =
    limit !== null && side === "buy" && symbol !== "" && !open.has(symbol) && open.size >= limit;

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

  const quantity = Number(quantityText);
  const price = Number(priceText);
  const fees = feesText.trim() === "" ? 0 : Number(feesText);
  const subtotal =
    Number.isFinite(quantity) && Number.isFinite(price) && quantity > 0 && price > 0
      ? quantity * price
      : null;
  const money = (value: number | null) =>
    value !== null && instrument ? formatMoney(value, instrument.currency) : "—";
  const totalLabel = side === "buy" ? "Total cost" : "Net proceeds";
  const submitLabel = editing ? "Save changes" : "Log trade";

  return (
    <Form {...form}>
      {/* An order ticket, the shape brokerages use: the fields on the left, and
          on the right what they add up to beside the button that commits it.
          A phone keeps one column and puts the total above the buttons. */}
      {/* The two panes switch on by the form's own width, not the screen's:
          a modal narrower than the ticket gets the one-column form rather
          than crushed fields. */}
      <div className="@container flex min-h-0 flex-col">
      <form
        onSubmit={form.handleSubmit((v) => onSubmit(toTransaction(v)))}
        className="flex min-h-0 flex-col @2xl:grid @2xl:grid-cols-[minmax(0,1fr)_17rem]"
        noValidate
      >
        <div className="grid min-h-0 grid-cols-2 content-start gap-x-4 gap-y-5 overflow-y-auto px-5 py-5 @2xl:px-6 @2xl:py-6">
          {/* The instrument first, as in every tracker that has one: the price
              suggestion, the currency and the holding check all hang off it. */}
          <FormField
            control={form.control}
            name="symbol"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Asset</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
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
                {limitHit ? (
                  <PlanCard feature="more-holdings" className="mt-1" />
                ) : (
                  <FormMessage />
                )}
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="side"
            render={({ field }) => (
              <FormItem className="col-span-2">
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
            name="quantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    className="num"
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
                    className="num"
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
                      className="rounded-sm underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      Use today&apos;s price, {quote.price.toFixed(instrument?.precision ?? 2)}
                    </button>
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input {...field} type="date" max={todayForInput()} className="num" />
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
                    className="num"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="account"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Account</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete="off" placeholder="e.g. your broker or exchange" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Note</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} className="min-h-20" placeholder="Why you made this trade" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* ── Summary: desktop ─────────────────────────────────────────── */}
        <aside
          aria-label="Order summary"
          className="hidden flex-col border-l border-line bg-surface-2/60 p-6 @2xl:flex"
        >
          <p className="text-caption font-medium text-graphite">Summary</p>

          <div className="mt-4 min-h-[3.25rem]">
            {instrument ? (
              <>
                <p className="flex items-baseline justify-between gap-3">
                  <span className="mono-label text-caption text-ink">{instrument.symbol}</span>
                  {quote && (
                    <span className="num text-micro text-stone">
                      {quote.price.toFixed(instrument.precision)} today
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-caption text-stone">{instrument.name}</p>
              </>
            ) : (
              <p className="text-caption text-stone">No asset picked</p>
            )}
          </div>

          <dl className="mt-6 space-y-2.5 text-caption">
            <div className="flex justify-between gap-3">
              <dt className="text-stone">
                {subtotal !== null ? `${quantityText} × ${priceText}` : "Quantity × price"}
              </dt>
              <dd className="num text-ink">{money(subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-stone">Fees</dt>
              <dd className="num text-ink">
                {feesText.trim() === "" ? "—" : `${side === "buy" ? "+" : "−"}${money(fees)}`}
              </dd>
            </div>
          </dl>

          <div className="mt-4 border-t border-line pt-4">
            <p className="text-caption text-stone">{totalLabel}</p>
            <p
              className={
                total !== null && instrument
                  ? "num mt-1 text-title font-semibold tracking-title text-ink"
                  : "num mt-1 text-title text-stone"
              }
            >
              {money(total)}
            </p>
          </div>

          <div className="mt-auto space-y-2 pt-8">
            <Button type="submit" size="lg" className="w-full">
              {submitLabel}
            </Button>
            <Button type="button" variant="ghost" size="lg" className="w-full" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </aside>

        {/* ── Footer: phone ────────────────────────────────────────────── */}
        <div className="border-t border-line px-5 py-4 @2xl:hidden">
          <div className="mb-4 flex items-baseline justify-between">
            <span className="text-caption text-stone">{totalLabel}</span>
            <span
              className={
                total !== null && instrument
                  ? "num text-heading font-medium text-ink"
                  : "num text-heading text-stone"
              }
            >
              {money(total)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="lg" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" size="lg" className="flex-1">
              {submitLabel}
            </Button>
          </div>
        </div>
      </form>
      </div>
    </Form>
  );
}
