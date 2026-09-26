import { createFileRoute, Navigate } from "@tanstack/react-router"
import { useSession } from "@/lib/auth/session"
import { useMenuAccess } from "@/lib/auth/use-menu-access"
import { homeFor } from "../../shared/access"

export const Route = createFileRoute("/")({
  component: Home,
})

/** Lands on the calendar, or on the first screen of the person's access. */
function Home() {
  const { user } = useSession()
  const access = useMenuAccess(user?.id)
  const home = user && access ? homeFor(user, access) : null
  if (!home) return null
  return <Navigate to={home} replace />
}
