"use client";

import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/**
 * One modal, two shapes: a bottom sheet on mobile, a centred dialog on desktop.
 *
 * Both are Radix `Dialog` underneath, so focus is trapped and restored, Escape
 * closes, and the page behind is inert — the difference is only where the
 * surface sits and how it arrives. A centred box on a phone puts the primary
 * action under the thumb's reach and above the keyboard; a full-height sheet
 * on a 1400px monitor is a lot of travel to fill in four fields.
 *
 * `title` is required rather than optional. Radix warns loudly without one and
 * it's right to: a dialog with no accessible name is announced as "dialog" and
 * nothing else.
 */
export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const isDesktop = useIsDesktop();

  /**
   * Focus restoration, done explicitly.
   *
   * Radix restores focus to whatever was focused when the layer mounted, and
   * measured in the browser it wasn't landing — closing either modal dropped
   * focus on `<body>`, which puts a keyboard user back at the top of the
   * document with the whole page to traverse again. Rather than fight the
   * interaction between the exit animation, the scroll lock and the
   * `aria-hidden` teardown, the trigger is captured before focus moves in and
   * restored by hand after the layer is gone.
   *
   * `onOpenAutoFocus` fires *before* Radix moves focus, so `activeElement` is
   * still the element the user activated. The `rAF` on the way out waits for
   * the layer to be removed — focusing an element while it is still inside an
   * `aria-hidden` subtree silently does nothing.
   */
  const trigger = useRef<HTMLElement | null>(null);

  const captureTrigger = () => {
    const active = document.activeElement;
    trigger.current = active instanceof HTMLElement && active !== document.body
      ? active
      : null;
  };

  const restoreTrigger = (event: Event) => {
    if (!trigger.current) return;
    event.preventDefault();
    const target = trigger.current;
    trigger.current = null;
    requestAnimationFrame(() => target.focus());
  };

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn("gap-0 p-0 sm:max-w-md", className)}
          onOpenAutoFocus={captureTrigger}
          onCloseAutoFocus={restoreTrigger}
        >
          <DialogHeader className="gap-0.5 border-b border-line p-5">
            <DialogTitle className="text-heading font-semibold text-ink">
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription className="text-caption text-stone">
                {description}
              </DialogDescription>
            ) : (
              <DialogDescription className="sr-only">{title}</DialogDescription>
            )}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          // Capped below the viewport so the sheet reads as a layer over the
          // page rather than as a new screen, and rounded only at the top
          // because the bottom edge is off-screen.
          "max-h-[92svh] gap-0 rounded-t-2xl p-0",
          className,
        )}
        style={{ paddingBottom: "var(--safe-bottom)" }}
        onOpenAutoFocus={captureTrigger}
        onCloseAutoFocus={restoreTrigger}
      >
        <SheetHeader className="gap-0.5 border-b border-line p-4">
          <SheetTitle className="text-heading font-semibold text-ink">
            {title}
          </SheetTitle>
          {description ? (
            <SheetDescription className="text-caption text-stone">
              {description}
            </SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{title}</SheetDescription>
          )}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
