import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // ember: `tap-target` puts a 44px floor under the hit region on coarse
  // pointers without changing the visible size. Most of this ramp is 28–36px,
  // which is under the platform minimum on both iOS and Android.
  // ember: `tap-target` puts a 44px floor under the hit region on coarse
  // pointers, which the 32px `sm` and `icon-sm` sizes still need.
  // `rounded-full` and `font-semibold` are the house voice — see the size note.
  "tap-target group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.125rem]",
  {
    variants: {
      variant: {
        // Primary is the brand. Hover swaps to an explicit token rather than
        // an opacity step, because on dark the fill has to get *lighter* and
        // `/80` cannot express that — see the note in globals.css.
        default: "bg-primary text-primary-foreground hover:bg-brand-hover",
        outline:
          "border-line bg-transparent hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/15 dark:hover:bg-destructive/25 dark:focus-visible:ring-destructive/40",
        link: "text-brand-text underline-offset-4 hover:underline",
      },
      /**
       * 56 / 48 / 40 / 32.
       *
       * v1 ran 24 / 28 / 32 / 36 / 44 and shipped 28 and 36 almost everywhere,
       * which is what made the app read as small and cramped. Every size moved
       * up one full step, so the existing call sites get the new scale without
       * being touched: `sm` 28→32, `lg` 36→48, `xl` 44→56.
       *
       * Fully rounded, at every size. Pills are the shared vocabulary of this
       * whole category — Cash App, Chime, Phantom — and a pill reads as a
       * discrete object you press, where a 10px-radius rectangle reads as a
       * region of a form.
       */
      size: {
        default:
          "h-10 gap-2 px-4 text-caption has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        sm: "h-8 gap-1.5 px-3 text-caption has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-12 gap-2 px-5 text-body has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4 [&_svg:not([class*='size-'])]:size-[1.125rem]",
        xl: "h-14 gap-2.5 px-6 text-body has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5 [&_svg:not([class*='size-'])]:size-5",
        icon: "size-10",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-12 [&_svg:not([class*='size-'])]:size-[1.125rem]",
        "icon-xl": "size-14 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
