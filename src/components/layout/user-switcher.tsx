import { useNavigate } from "@tanstack/react-router"
import { CaretUpDownIcon, CheckIcon } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { useSession } from "@/lib/auth/session"
import { cn } from "@/lib/utils"
import { initialsOf, roleLabel, USER_ROLES } from "../../../shared/users"

/**
 * Demo sign-in: shows who is signed in and lets you switch to any active team
 * member, to see the app as an admin, a technician or a broker.
 */
export function UserSwitcher({ compact }: { compact: boolean }) {
  const { user, users, signInAs, loading, error } = useSession()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const active = users.filter((u) => u.active)

  return (
    <div ref={rootRef} className="relative mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={loading || !!error}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 p-2 text-left hover:bg-muted",
          compact && "justify-center border-0 bg-transparent p-1"
        )}
        title={compact && user ? `${user.name} · ${roleLabel(user.role)}` : undefined}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 font-semibold text-brand text-xs">
          {user ? initialsOf(user.name) : "?"}
        </div>
        {!compact && (
          <>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate font-medium text-sm">
                {user?.name ?? (error ? "API offline" : loading ? "Loading…" : "No team members")}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {user ? roleLabel(user.role) : (error ?? "Signing in")}
              </div>
            </div>
            <CaretUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute bottom-full z-50 mb-2 max-h-[70vh] w-72 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg",
            compact ? "left-0" : "left-0 right-0 w-auto"
          )}
        >
          <div className="px-2 pt-1.5 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            Sign in as (demo)
          </div>
          {USER_ROLES.map((role) => {
            const people = active.filter((u) => u.role === role.id)
            if (people.length === 0) return null
            return (
              <div key={role.id} className="py-1">
                <div className="px-2 py-1 text-[11px] text-muted-foreground">{role.label}s</div>
                {people.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={u.id === user?.id}
                    onClick={() => {
                      setOpen(false)
                      if (u.id === user?.id) return
                      signInAs(u.id)
                      toast.success(`Signed in as ${u.name}`)
                      // Start where their access begins (its default home page).
                      navigate({ to: "/" })
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 font-semibold text-[10px] text-brand">
                      {initialsOf(u.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{u.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{u.jobTitle}</span>
                    </span>
                    {u.id === user?.id && <CheckIcon className="size-4 shrink-0 text-brand" />}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
