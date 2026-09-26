import { PushPinIcon, SidebarSimpleIcon, XIcon } from "@phosphor-icons/react"
import { Link } from "@tanstack/react-router"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UserSwitcher } from "./user-switcher"
import { cn } from "@/lib/utils"
import { NAV_FOOTER, NAV_SECTIONS, type NavItem } from "./nav-items"
import { useSession } from "@/lib/auth/session"
import { useMenuAccess } from "@/lib/auth/use-menu-access"
import { canOpen } from "../../../shared/access"

interface AppSidebarProps {
  collapsed: boolean
  onToggleCollapsed: () => void
  /** Mobile drawer mode: always expanded, with a close button. */
  mobile?: boolean
  onNavigate?: () => void
  /** Drawer on desktop: keep the full menu docked instead. */
  onPin?: () => void
}

/**
 * Left menu. Uses the calendar's visual language: white card surface,
 * uppercase section labels like the calendar legend, and a colored left
 * border on the active item like the appointment cards.
 */
export function AppSidebar({ collapsed, onToggleCollapsed, mobile, onNavigate, onPin }: AppSidebarProps) {
  const compact = collapsed && !mobile
  // Each access sees the screens an administrator picked (Settings > Menu by access).
  const { user } = useSession()
  const access = useMenuAccess(user?.id)
  const shows = (item: NavItem) => Boolean(user && access && (!item.to || canOpen(user, access, item.to)))
  const sections = NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter(shows) })).filter((s) => s.items.length > 0)

  return (
    <nav
      aria-label="Main menu"
      className={cn(
        "flex h-full flex-col border-border border-r bg-card transition-[width] duration-300 ease-in-out",
        compact ? "w-16" : "w-64"
      )}
    >
      <div className={cn("flex h-14 shrink-0 items-center gap-2 border-border border-b", compact ? "justify-center px-2" : "px-4")}>
        {compact ? (
        	<button
        		type="button"
        		onClick={onToggleCollapsed}
        		className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        		aria-label="Expand menu"
        		title="Expand menu (Ctrl+B)"
        	>
        		<SidebarSimpleIcon className="size-4" />
        	</button>
        ) : (
          <Link to="/" onClick={onNavigate} aria-label="Home" title="Home" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand font-bold text-sm text-white">
            C
          </Link>
        )}
        {!compact && (
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-semibold text-sm">CRM</div>
            <div className="truncate text-[11px] text-muted-foreground">Construction & property</div>
          </div>
        )}
        {!compact && !mobile && (
        	<button
        		type="button"
        		onClick={onToggleCollapsed}
        		className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        		aria-label="Collapse menu"
        		title="Collapse menu (Ctrl+B)"
        	>
        		<SidebarSimpleIcon className="size-4" />
        	</button>
        )}
        {mobile && (
          <button
            type="button"
            onClick={onNavigate}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Close menu"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3">
        {sections.map((section) => (
          <div key={section.title} className="mb-4 px-2">
            {compact ? (
              <div className="mx-auto mb-2 h-px w-6 bg-border" />
            ) : (
              <h3 className="mb-1.5 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                {section.title}
              </h3>
            )}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <li key={item.label}>
                  <SidebarItem item={item} compact={compact} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-border border-t px-2 py-2">
        <ul className="flex flex-col gap-0.5">
          {NAV_FOOTER.filter(shows).map((item) => (
            <li key={item.label}>
              <SidebarItem item={item} compact={compact} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>

        <UserSwitcher compact={compact} />

        {mobile && onPin && (
          // Only on desktop: the drawer can be docked as the full menu again.
          <button
            type="button"
            onClick={onPin}
            className="mt-2 hidden w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground text-xs hover:bg-muted md:flex"
          >
            <PushPinIcon className="size-4" />
            <span>Keep menu open</span>
          </button>
        )}

      </div>
    </nav>
  )
}

function SidebarItem({
  item,
  compact,
  onNavigate,
}: {
  item: NavItem
  compact: boolean
  onNavigate?: () => void
}) {
  const base = cn(
    "group flex h-9 w-full items-center gap-2.5 rounded-lg text-sm transition-colors",
    compact ? "justify-center px-0" : "px-2.5"
  )
  const content = (
    <>
      <item.icon className="size-[18px] shrink-0" />
      {!compact && <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>}
      {!compact && item.comingSoon && (
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
          Soon
        </span>
      )}
    </>
  )

  const element =
    item.to && !item.comingSoon ? (
      <Link
        to={item.to}
        onClick={onNavigate}
        className={cn(base, "text-foreground/80 hover:bg-muted hover:text-foreground")}
        activeProps={{ className: "bg-brand/10 !text-brand font-medium hover:!bg-brand/15" }}
      >
        {content}
      </Link>
    ) : (
      <button
        type="button"
        disabled
        className={cn(base, "cursor-not-allowed text-muted-foreground/70")}
        aria-label={`${item.label} (coming soon)`}
      >
        {content}
      </button>
    )

  if (!compact) return element
  return (
    <Tooltip>
      <TooltipTrigger>
        <span className="block">{element}</span>
      </TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {item.comingSoon ? " · Soon" : ""}
      </TooltipContent>
    </Tooltip>
  )
}
