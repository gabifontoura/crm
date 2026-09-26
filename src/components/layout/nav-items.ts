import {
  CalendarBlankIcon,
  ChartBarIcon,
  CheckSquareIcon,
  GearIcon,
  HandshakeIcon,
  HeadsetIcon,
  IdentificationBadgeIcon,
  type Icon,
  MegaphoneIcon,
  SquaresFourIcon,
  UsersThreeIcon,
  WrenchIcon,
  BuildingsIcon,
} from "@phosphor-icons/react"

export interface NavItem {
  label: string
  icon: Icon
  /** Route path. Leave empty for modules that are not built yet. */
  to?: "/calendar" | "/whats-new" | "/team" | "/developments" | "/tickets" | "/technician" | "/contacts" | "/settings" | "/dashboards" | "/reports" | "/deals"
  /** Shows a "Soon" tag and disables the item. */
  comingSoon?: boolean

}

export interface NavSection {
  title: string
  items: NavItem[]
}

/**
 * CRM menu. To ship a new module: create its route under `src/routes/`,
 * add `to` here and drop `comingSoon`.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { label: "Dashboards", icon: SquaresFourIcon, to: "/dashboards" },
      { label: "Calendar", icon: CalendarBlankIcon, to: "/calendar" },
      { label: "Tasks", icon: WrenchIcon, to: "/technician" },
    ],
  },
  {
    title: "Construction",
    items: [
      { label: "Developments", icon: BuildingsIcon, to: "/developments" },
      { label: "Team", icon: IdentificationBadgeIcon, to: "/team" },
    ],
  },
  {
    title: "Customers",
    items: [
      { label: "Contacts", icon: UsersThreeIcon, to: "/contacts" },
      { label: "Deals", icon: HandshakeIcon, to: "/deals" },
    ],
  },
  {
    title: "Service",
    items: [
      { label: "Tickets", icon: HeadsetIcon, to: "/tickets" },
      { label: "Reports", icon: ChartBarIcon, to: "/reports" },
    ],
  },
]

export const NAV_FOOTER: NavItem[] = [
  { label: "What's New", icon: MegaphoneIcon, to: "/whats-new" },
  { label: "Settings", icon: GearIcon, to: "/settings" },
]
