import type { Icon } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

type FilterChipProps = {
  label: string
  active: boolean
  onClick: () => void
  count?: number
  /** A colored dot before the label (e.g. the ticket type's color). */
  color?: string
  icon?: Icon
  className?: string
}

/** A toggle pill for filtering a list (ticket types, release note types…). */
export function FilterChip({ label, active, onClick, count, color, icon: I, className }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
        active ? "border-brand bg-brand/10 font-medium text-brand" : "border-border bg-card text-muted-foreground hover:bg-muted",
        className,
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ backgroundColor: color }} />}
      {I && <I className="size-3.5" />}
      {label}
      {count !== undefined && (
        <span className={cn("rounded-full px-1.5 text-[11px]", active ? "bg-brand/15" : "bg-muted")}>{count}</span>
      )}
    </button>
  )
}
