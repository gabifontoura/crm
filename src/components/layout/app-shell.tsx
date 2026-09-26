import { ListIcon } from "@phosphor-icons/react"
import { useRouterState } from "@tanstack/react-router"
import { type ReactNode, useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import { PersonProvider } from "@/components/person/person-dialog"
import { AppSidebar } from "./app-sidebar"
import { Link } from "@tanstack/react-router"
import { LockSimpleIcon } from "@phosphor-icons/react"
import { useSession } from "@/lib/auth/session"
import { useMenuAccess } from "@/lib/auth/use-menu-access"
import { canOpen, homeFor } from "../../../shared/access"
import { DemoBanner } from "./demo-banner"

const LS_COLLAPSED = "crm.sidebarCollapsed.v1"

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1"
  } catch {
    return false
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0")
  } catch {
    /* storage unavailable: keep the in-memory value */
  }
}

/** App frame: menu on the left, scrolling page content on the right. */
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => readFlag(LS_COLLAPSED))
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { user } = useSession()
  const access = useMenuAccess(user?.id)
  const blocked = Boolean(user && access && !canOpen(user, access, pathname))
  const home = user && access ? homeFor(user, access) : null

  useEffect(() => writeFlag(LS_COLLAPSED, collapsed), [collapsed])

  // Ctrl+B (Cmd+B on Mac) collapses or expands the menu (on phones: opens the drawer), except while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "b" || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      e.preventDefault()
      if (window.matchMedia("(min-width: 768px)").matches) setCollapsed((v) => !v)
      else setMobileOpen((v) => !v)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  // Escape closes the drawer.
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [mobileOpen])

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background print:block print:h-auto print:overflow-visible print:bg-white">
      {/* Desktop: the menu collapses to icons (top button or Ctrl+B); only phones hide it, behind the drawer. */}
      <aside className="hidden h-full shrink-0 md:block print:hidden">
        <AppSidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((v) => !v)} />
      </aside>

      <div
        className={cn(
          // Same drawer on phones (hamburger) and on desktop when the rail is collapsed.
          "fixed inset-0 z-40 bg-black/40 transition-opacity",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 shadow-xl transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <AppSidebar
          mobile
          collapsed={false}
          onToggleCollapsed={() => undefined}
          onNavigate={() => setMobileOpen(false)}
          onPin={() => {
            setCollapsed(false)
            setMobileOpen(false)
          }}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: phones only (the menu is in the drawer). */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-border border-b bg-card px-3 md:hidden print:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 hover:bg-muted md:hidden"
            aria-label="Open menu"
          >
            <ListIcon className="size-5" />
          </button>
          <div className="flex size-6 items-center justify-center rounded bg-brand font-bold text-[11px] text-white">C</div>
          <span className="font-semibold text-sm">CRM</span>
        </div>
        <DemoBanner />
        <main className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
          <PersonProvider>
            {blocked ? (
              <div className="mx-auto my-16 flex max-w-md flex-col items-center gap-3 rounded-lg border border-border border-dashed p-10 text-center text-muted-foreground">
                <LockSimpleIcon className="size-8" />
                <p className="text-sm">This screen isn't in the menu of your access. An administrator can turn it on in Settings.</p>
                {home && (
                  <Link to={home} className="text-brand text-sm hover:underline">
                    Go to your first screen
                  </Link>
                )}
              </div>
            ) : (
              children
            )}
          </PersonProvider>
        </main>
      </div>
    </div>
  )
}
