"use client";

import { useState } from "react";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Quotes are polled on their own interval; this keeps everything
            // else from refetching on every navigation.
            staleTime: 15_000,
            // Coming back to a market app should show current prices.
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider delayDuration={250}>
          {children}
          <Toaster position="bottom-center" offset={72} gap={8} />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
