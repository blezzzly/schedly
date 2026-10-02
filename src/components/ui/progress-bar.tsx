import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  indeterminate = false,
  className,
  barClassName,
}: {
  value?: number;
  indeterminate?: boolean;
  className?: string;
  barClassName?: string;
}) {
  const pct = typeof value === "number" ? Math.min(100, Math.max(0, value)) : 0;

  return (
    <div
      className={cn(
        "relative w-full h-4 border-2 border-foreground/60 bg-muted overflow-hidden rounded-full shadow-[2px_2px_0_0_#401f32]",
        className
      )}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {indeterminate ? (
        <div
          className={cn(
            "absolute inset-y-0 w-1/3 bg-primary rounded-full",
            "animate-[indeterminate-bar_1.4s_ease-in-out_infinite]"
          )}
        />
      ) : (
        <div
          className={cn(
            "h-full bg-primary rounded-full transition-all duration-300 ease-out",
            barClassName
          )}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}
