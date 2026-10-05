"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { ResponsiveModal } from "@/components/common/responsive-modal";

const loadForm = () => import("@/components/portfolio/transaction-form");

/**
 * The trade form, loaded when it is needed rather than with every page.
 *
 * It brings react-hook-form and zod — ~110 KB of script — and it only ever
 * appears inside a modal somebody opens. Statically imported by four screens,
 * that weight was on Home, Signals, Portfolio and every asset page's first
 * load. The space it takes is reserved while it arrives, so the modal does not
 * grow under the reader.
 */
export const TransactionForm = dynamic(() => loadForm().then((m) => m.TransactionForm), {
  ssr: false,
  loading: () => <div aria-busy className="h-[min(38rem,70dvh)]" />,
});

/**
 * The modal the trade form lives in, with the width the form is laid out for.
 *
 * The width was a class each of the four callers passed, so the two-pane layout
 * and the 768px it needs lived in different files — and when only one updated,
 * the ticket rendered in the 448px default with its fields crushed. One
 * component owns both (decision 282).
 *
 * Fetches the form once the page is idle, so opening the modal is instant
 * without the form being part of the page's first load.
 */
export function TradeModal(
  props: Omit<React.ComponentProps<typeof ResponsiveModal>, "className">,
) {
  useEffect(() => {
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(() => void loadForm())
        : window.setTimeout(() => void loadForm(), 2000);
    return () => {
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, []);

  return <ResponsiveModal {...props} className="sm:max-w-3xl" />;
}
