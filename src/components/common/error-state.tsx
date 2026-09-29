"use client";

import { RotateCw } from "@/components/common/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Something didn't load, and here is what to do about it.
 *
 * Never "Something went wrong". The message comes from `ApiError`, which
 * distinguishes an offline device from an unknown symbol, and there is always
 * a retry — an error with no way forward is the same dead end as an empty
 * state with no action.
 */
export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg bg-surface-2 px-4 py-3.5",
        className,
      )}
    >
      <p className="text-caption text-graphite">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw />
          Try again
        </Button>
      )}
    </div>
  );
}
