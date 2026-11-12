import { format, formatDistanceToNowStrict } from "date-fns";
import { lastActiveStatus } from "@/lib/activity/constants";
import { cn } from "@/lib/utils";

/**
 * "Last active" cell for user tables. Works in server and client components.
 * Relative text depends on the render time, so hydration differences are
 * expected and suppressed.
 */
export function LastActive({
  at,
  className,
}: {
  at: Date | string | null | undefined;
  className?: string;
}) {
  const status = lastActiveStatus(at);

  if (status.kind === "never") {
    return (
      <span className={cn("text-caption italic", className)} title="No activity recorded yet">
        Never
      </span>
    );
  }

  const exact = format(status.at, "MMM d, yyyy 'at' h:mm a");

  if (status.kind === "now") {
    return (
      <span
        className={cn("inline-flex items-center gap-1.5 text-caption font-medium text-success-foreground", className)}
        title={`Last seen ${exact}`}
        suppressHydrationWarning
      >
        <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
        Active now
      </span>
    );
  }

  return (
    <span className={cn("text-caption tabular-nums", className)} title={exact} suppressHydrationWarning>
      {formatDistanceToNowStrict(status.at, { addSuffix: true })}
    </span>
  );
}
