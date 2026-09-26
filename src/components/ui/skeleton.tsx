import type * as React from "react"

import { cn } from "@/lib/utils"

/** Pulsing placeholder shown while content loads. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-muted", className)} {...props} />
}

export { Skeleton }
