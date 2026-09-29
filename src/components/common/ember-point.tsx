import { cn } from "@/lib/utils";

/**
 * The ember point — a glowing coal: a solid core inside a soft radial falloff.
 *
 * This is the app's single most-reused shape, and deliberately so. It is the
 * brand mark in the logo, and it is the peak marker on the window band, where
 * it flags the one best moment to act. Brand mark and core product primitive
 * are the same object.
 *
 * Built from CSS rather than an SVG gradient so it themes with a variable and
 * can be rendered many times on a page without duplicate gradient IDs.
 */
export function EmberPoint({
  size = 16,
  glow = true,
  className,
  style,
  ...props
}: {
  /** Overall diameter in px, including the falloff. */
  size?: number;
  /** Falloff can be dropped where the point sits on a busy surface. */
  glow?: boolean;
} & React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      // Merged rather than spread over: callers position the point absolutely
      // on the window band, and a bare `{...props}` would let their `style`
      // replace the diameter and collapse the mark to nothing.
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      {glow && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--brand) 60%, transparent) 0%, color-mix(in oklab, var(--brand) 22%, transparent) 42%, transparent 70%)",
          }}
        />
      )}
      <span
        className="relative rounded-full bg-brand"
        style={{ width: size * 0.34, height: size * 0.34 }}
      />
    </span>
  );
}
