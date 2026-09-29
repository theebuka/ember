import { cn } from "@/lib/utils";

/**
 * The content column.
 *
 * v1 capped this at `max-w-5xl` — 1024px, 960px of real content — and there
 * was not a single `lg:` or `xl:` class anywhere in the app. The layout fully
 * resolved at 768px and was byte-identical at 3440px. At 1920px that left
 * roughly 324px of empty ground on each side, about a third of the usable
 * area, with a narrow ribbon of cards down the middle. That is the "mobile
 * layout on a big screen" problem, and no amount of tuning the cap fixes it:
 * a single column simply cannot use 1600px well.
 *
 * So the cap rises to 1600px and the answer to the extra width is a second
 * column rather than a wider first one. Text never gets wider — a 1400px
 * paragraph is unreadable — the page gets *more*.
 */
export function PageBody({
  narrow = false,
  className,
  ...props
}: {
  /**
   * Cap at a reading width instead of the full column.
   *
   * For screens that are genuinely one column of prose or form — settings,
   * the methodology, the track record. "Use the width" is the fix for a
   * dashboard, not licence to set a paragraph 1,500px wide, and a settings
   * form with a switch 1,400px from its label is worse than a narrow one.
   */
  narrow?: boolean;
} & React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        // 16px below 360, 20px from there. The step exists because of the
        // header rather than the body: three action controls beside the
        // lockup pushed the document 7px wide at 320px, and the two have to
        // move together or the page title stops sitting over its content.
        "mx-auto w-full px-4 py-5 min-[360px]:px-5 md:px-8 md:py-7 xl:px-12",
        narrow ? "max-w-4xl" : "max-w-[100rem]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Main content beside a persistent companion column.
 *
 * This is what actually consumes desktop width, and it is derived from the
 * mobile references rather than bolted on: screens that are separate
 * destinations on a phone become companions on a desktop. On Home that is the
 * findings feed with your value and positions alongside; on an asset page the
 * chart with the read alongside.
 *
 * Below `lg` the aside simply falls under the main column in source order, so
 * the phone layout is the same stack it always was. There is no duplicated
 * markup and no `hidden lg:block` twin — the second column is the same
 * elements in a different place, which is the only version that stays true as
 * the content changes.
 */
export function PageColumns({
  aside,
  children,
  className,
  ...props
}: { aside: React.ReactNode } & React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:gap-x-14 2xl:grid-cols-[minmax(0,1fr)_24rem]",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">{children}</div>
      {/* `lg:sticky` keeps the companion in view while a long feed scrolls
          past it, which is the whole reason it earns a column rather than
          being a block at the bottom. */}
      <aside className="min-w-0 lg:sticky lg:top-[calc(6rem+var(--bar-h,0px))]">{aside}</aside>
    </div>
  );
}
