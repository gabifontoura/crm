import { CaretRightIcon } from "@phosphor-icons/react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface Breadcrumb {
  label: string
}

interface PageLayoutProps {
  title: string
  subtitle?: string
  breadcrumbs?: Breadcrumb[]
  /** Buttons shown on the right side of the page header. */
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** Standard page frame for CRM modules: breadcrumbs, title and content. */
export function PageLayout({ title, subtitle, breadcrumbs, actions, children, className }: PageLayoutProps) {
  return (
    <div className="flex min-h-full flex-col">
      <title>{title} · CRM</title>
      <header className="shrink-0 border-border border-b bg-card px-4 py-3 sm:px-6">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <ol className="mb-0.5 flex items-center gap-1 text-muted-foreground text-xs">
            {breadcrumbs.map((b, i) => (
              <li key={b.label} className="flex items-center gap-1">
                {i > 0 && <CaretRightIcon className="size-3" />}
                <span className={i === breadcrumbs.length - 1 ? "text-foreground" : ""}>{b.label}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate font-semibold text-lg sm:text-xl">{title}</h1>
            {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </header>
      <div className={cn("w-full flex-1 px-4 sm:px-6", className)}>{children}</div>
    </div>
  )
}
