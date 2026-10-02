import * as React from "react";

import { cn } from "@/lib/utils";

// Asymmetric responsive bento container. The layout itself lives in CSS
// (.bento-grid in globals.css) so tiles can be rearranged without touching
// markup: on wide screens a dominant tile spans two rows next to stacked side
// tiles, on narrow phones it degrades to a full-width hero tile over two
// half-width tiles — always a bento, never a plain vertical list.
function BentoGrid({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("bento-grid", className)} {...props} />;
}

export { BentoGrid };