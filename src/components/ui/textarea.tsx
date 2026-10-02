import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex w-full min-w-0 min-h-20 rounded-lg border-2 border-foreground/70 bg-transparent px-2.5 py-2 text-base transition-all outline-none placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:shadow-[3px_3px_0_0_#401f32] focus-visible:ring-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:shadow-[3px_3px_0_0_#401f32] md:text-sm dark:bg-input/30 dark:disabled:bg-input/80",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
