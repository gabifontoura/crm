import { createRootRoute, Outlet } from "@tanstack/react-router"
import { Toaster } from "sonner"

import { AppShell } from "@/components/layout/app-shell"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SessionProvider } from "@/lib/auth/session"

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <SessionProvider>
      <TooltipProvider delayDuration={300}>
        <AppShell>
          <Outlet />
        </AppShell>
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </SessionProvider>
  )
}
