"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function FloatingLabelInput({
  label,
  className,
  inputClassName,
  ...props
}: React.ComponentProps<"input"> & { label: string; inputClassName?: string }) {
  const invalid = props["aria-invalid"];
  return (
    <div
      className={cn(
        "relative rounded-lg border-2 bg-background transition-all duration-150 focus-within:border-foreground focus-within:shadow-[3px_3px_0_0_#401f32]",
        invalid ? "border-destructive" : "border-foreground/70",
        className
      )}
    >
      <Input
        placeholder=" "
        className={cn(
          "peer h-11 w-full rounded-none border-none bg-transparent px-3 pt-4 pb-1 text-base shadow-none outline-none ring-0 placeholder-transparent focus-visible:border-none focus-visible:ring-0 dark:bg-transparent",
          inputClassName
        )}
        {...props}
      />
      <label className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 origin-left px-1 text-base leading-none text-muted-foreground transition-all duration-200 ease-out peer-focus:top-[8px] peer-focus:scale-75 peer-focus:text-primary peer-focus:bg-background peer-[:not(:placeholder-shown)]:top-[8px] peer-[:not(:placeholder-shown)]:scale-75 peer-[:not(:placeholder-shown)]:bg-background">
        {label}
      </label>
    </div>
  );
}
