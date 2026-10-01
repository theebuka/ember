import type { IconComponent } from "@/components/common/icon";
import { cn } from "@/lib/utils";

/**
 * An empty screen is an invitation to act, never a shrug.
 *
 * `action` is effectively required in practice: if there is nothing the user
 * can do from here, the screen is a dead end and the design is wrong.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
    >
      <div className="mb-4 grid size-11 place-items-center rounded-xl bg-surface-2 text-stone">
        <Icon className="size-5" />
      </div>
      <h2 className="text-heading font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 max-w-xs text-body text-stone">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
