"use client";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function FloatingLabelTextarea({
  label,
  className,
  inputClassName,
  ...props
}: React.ComponentProps<"textarea"> & { label: string; inputClassName?: string }) {
  const invalid = props["aria-invalid"];
  return (
    <div
      className={cn(
        "relative rounded-lg border-2 bg-background transition-all duration-150 focus-within:border-foreground focus-within:shadow-[3px_3px_0_0_#401f32]",
        invalid ? "border-destructive" : "border-foreground/70",
        className
      )}
    >
      <Textarea
        placeholder=" "
        className={cn(
          "peer w-full rounded-none border-none bg-transparent px-3 pb-2 pt-5 text-base shadow-none outline-none ring-0 placeholder-transparent focus-visible:border-none focus-visible:ring-0 dark:bg-transparent",
          inputClassName
        )}
        {...props}
      />
      <label className="pointer-events-none absolute left-2.5 top-[8px] z-[1] -translate-y-1/2 origin-left scale-75 bg-background px-1 text-base leading-none text-muted-foreground transition-colors duration-200 ease-out peer-focus:text-primary">
        {label}
      </label>
    </div>
  );
}
