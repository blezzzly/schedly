"use client";

import { cn } from "@/lib/utils";

export interface TextFieldAreaProps
  extends React.ComponentProps<"textarea"> {
  label: string;
  error?: boolean;
  helperText?: string;
}

export function TextFieldArea({
  label,
  className,
  error,
  helperText,
  ...props
}: TextFieldAreaProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={props.id}
        className={cn("text-sm font-medium", error ? "text-destructive" : "text-foreground")}
      >
        {label}
      </label>
      <textarea
        className={cn(
          "flex w-full min-h-[100px] resize-y rounded-lg border-2 border-foreground/70 bg-transparent px-3 py-2 text-base transition-all outline-none placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:shadow-[3px_3px_0_0_#401f32] focus-visible:ring-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:shadow-[3px_3px_0_0_#401f32] dark:bg-input/30 dark:disabled:bg-input/80"
        )}
        {...props}
      />
      {helperText && (
        <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>
          {helperText}
        </p>
      )}
    </div>
  );
}
