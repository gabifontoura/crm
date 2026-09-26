import type { UserRole } from "./users.js";

/**
 * Which screens each access (role) has in the menu. Administrators always
 * have every screen, Settings included; the others get the screens an
 * administrator picks (stored in settings as "menuAccess").
 */

export const SCREENS = [
	{ id: "/dashboards", label: "Dashboards", group: "Workspace" },
	{ id: "/calendar", label: "Calendar", group: "Workspace" },
	{ id: "/technician", label: "Tasks", group: "Workspace" },
	{ id: "/developments", label: "Developments", group: "Construction" },
	{ id: "/team", label: "Team", group: "Construction" },
	{ id: "/contacts", label: "Contacts", group: "Customers" },
	{ id: "/deals", label: "Deals", group: "Customers" },
	{ id: "/tickets", label: "Tickets", group: "Service" },
	{ id: "/reports", label: "Reports", group: "Service" },
	{ id: "/whats-new", label: "What's New", group: "Other" },
] as const;

export type ScreenId = (typeof SCREENS)[number]["id"];
export type MenuRole = Exclude<UserRole, "admin">;

/** What can be done on each screen, switched on or off per access (the API checks them too). */
export const SCREEN_ACTIONS = {
	"/calendar": [
		{ id: "calendar.create", label: "Book appointments", hint: "Also booking a visit from a ticket's step.", icon: "plus" },
		{ id: "calendar.edit", label: "Edit appointments", hint: "Their own; administrators edit anyone's.", icon: "pencil" },
		{ id: "calendar.delete", label: "Delete appointments", hint: "Their own; administrators delete anyone's.", icon: "trash" },
	],
	"/technician": [{ id: "tasks.reschedule", label: "Reschedule a visit", hint: "“Customer absent”: move the visit to another day.", icon: "calendar" }],
	"/tickets": [
		{ id: "tickets.create", label: "Open new tickets", hint: "", icon: "plus" },
		{ id: "tickets.subtickets", label: "Add sub-tickets", hint: "Visit actions still become sub-tickets.", icon: "list" },
		{ id: "tickets.forward", label: "Forward tickets", hint: "Hand a ticket to someone else, with a note.", icon: "forward" },
	],
	"/contacts": [
		{ id: "contacts.create", label: "Add leads", hint: "", icon: "plus" },
		{ id: "contacts.delete", label: "Delete leads", hint: "", icon: "trash" },
	],
	"/deals": [
		{ id: "billing.plan", label: "Set up payment plans", hint: "For the deals they sold.", icon: "plus" },
		{ id: "billing.record", label: "Record payments and promises", hint: "Payments, promises to pay, renegotiations, cadence steps.", icon: "money" },
	],
	"/dashboards": [{ id: "dashboards.edit", label: "Create and edit dashboards", hint: "Everyone can view the ones shared with them.", icon: "pencil" }],
} as const satisfies Partial<Record<ScreenId, readonly { id: string; label: string; hint: string; icon: string }[]>>;

type Actions = typeof SCREEN_ACTIONS;
export type ActionId = Actions[keyof Actions][number]["id"];
export const ALL_ACTIONS = Object.values(SCREEN_ACTIONS).flatMap((list) => list.map((a) => a.id)) as ActionId[];
/** The screen an action belongs to. */
export const ACTION_SCREEN = Object.fromEntries(
	Object.entries(SCREEN_ACTIONS).flatMap(([screen, list]) => list.map((a) => [a.id, screen])),
) as Record<ActionId, ScreenId>;

/**
 * An access profile: what its people see (screens), may do (actions) and
 * where they land. Administrators set up as many as they need; each one works
 * like a base role (technician, engineer or broker) for everything else the
 * CRM does (visits, questions to engineering, sales, workflow steps).
 */
export interface AccessProfile {
	id: string;
	name: string;
	description: string;
	/** The role it works like. */
	base: MenuRole;
	screens: ScreenId[];
	actions: ActionId[];
	home?: ScreenId | null;
	/** Extra read-only views on top of what its way of working gives. */
	sees?: { team?: boolean; tickets?: boolean };
	/** One of the ones the CRM comes with (they can be edited, not deleted). */
	builtIn?: boolean;
}

export interface MenuAccess {
	profiles: AccessProfile[];
	/** Where administrators land (they have every screen). */
	adminHome?: ScreenId | null;
}

/** Who a check is about: their role and, when set, their access profile. */
export type Who = { role: UserRole; accessId?: string | null };

export const MENU_ROLES: MenuRole[] = ["technician", "engineer", "broker", "staff"];

const BASE_INFO: Record<MenuRole, { name: string; description: string }> = {
	technician: { name: "Service technician", description: "Assistance and repairs; sees only their own schedule" },
	engineer: { name: "Engineer", description: "Answers technical questions from the field and follows every technician's tasks" },
	broker: { name: "Real estate broker", description: "Sales and showings; sees only their own schedule" },
	staff: { name: "Back office", description: "Office work: HR, finance, admin staff" },
};

/** What each way of working means in the CRM, for the access editor. */
export const BASE_HOW: Record<MenuRole, { label: string; does: string[] }> = {
	technician: { label: "Field technician", does: ["Goes on visits: owns tasks, checks in, fills the report and collects signatures", "Works on the tickets assigned to them and to their visits"] },
	engineer: { label: "Engineering", does: ["Answers the questions the field sends, and moves those tickets on", "Follows every ticket and every technician's task, read only"] },
	broker: { label: "Sales", does: ["Has a lead portfolio and books showings", "Works on the sales tickets and deals they own"] },
	staff: { label: "Back office", does: ["Works from the office: no visits, sales or technical questions", "Only the screens and actions switched on here (and the tickets they open)"] },
};

const DEFAULT_SCREENS: Record<MenuRole, ScreenId[]> = {
	technician: ["/dashboards", "/calendar", "/technician", "/developments", "/tickets", "/whats-new"],
	engineer: ["/dashboards", "/calendar", "/technician", "/developments", "/tickets", "/reports", "/whats-new"],
	broker: ["/dashboards", "/calendar", "/developments", "/contacts", "/deals", "/tickets", "/whats-new"],
	staff: ["/dashboards", "/calendar", "/tickets", "/whats-new"],
};

/** A new profile working like a base role, starting from that role's screens and every action. */
export function profileFrom(base: MenuRole, patch: Partial<AccessProfile> = {}): AccessProfile {
	return { id: base, ...BASE_INFO[base], base, screens: [...DEFAULT_SCREENS[base]], actions: [...ALL_ACTIONS], home: null, ...patch };
}

/** What each access sees until an administrator changes it. */
export const DEFAULT_MENU_ACCESS: MenuAccess = {
	profiles: MENU_ROLES.map((r) => profileFrom(r, { builtIn: true })),
	adminHome: null,
};

const IDS = new Set<string>(SCREENS.map((s) => s.id));
const screensIn = (v: unknown): ScreenId[] => (Array.isArray(v) ? v.filter((x): x is ScreenId => typeof x === "string" && IDS.has(x)) : []);
const actionsIn = (v: unknown): ActionId[] => {
	const known = new Set<string>(ALL_ACTIONS);
	return Array.isArray(v) ? v.filter((x): x is ActionId => typeof x === "string" && known.has(x)) : [...ALL_ACTIONS];
};

/**
 * The stored value, kept well-formed. Reads the current shape ({ profiles })
 * and the first one (screens per role, actions and home by role); the three
 * built-in profiles are always there.
 */
export function menuAccessFrom(raw: unknown): MenuAccess {
	const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
	const profiles: AccessProfile[] = [];
	if (Array.isArray(v.profiles)) {
		for (const p of v.profiles as Record<string, unknown>[]) {
			const base = MENU_ROLES.find((r) => r === p?.base);
			const name = typeof p?.name === "string" ? p.name.trim().slice(0, 60) : "";
			if (!base || !name || typeof p.id !== "string" || profiles.some((x) => x.id === p.id)) continue;
			const screens = screensIn(p.screens);
			const home = typeof p.home === "string" && screens.includes(p.home as ScreenId) ? (p.home as ScreenId) : null;
			profiles.push({
				id: p.id,
				name,
				description: typeof p.description === "string" ? p.description.slice(0, 200) : "",
				base,
				screens,
				actions: actionsIn(p.actions),
				home,
				sees: { team: Boolean((p.sees as Record<string, unknown> | undefined)?.team), tickets: Boolean((p.sees as Record<string, unknown> | undefined)?.tickets) },
				builtIn: MENU_ROLES.includes(p.id as MenuRole),
			});
		}
	} else {
		// First shape: { technician: [...screens], actions: { technician: [...] }, home: { technician, admin } }.
		const actions = (v.actions && typeof v.actions === "object" ? v.actions : {}) as Record<string, unknown>;
		const home = (v.home && typeof v.home === "object" ? v.home : {}) as Record<string, unknown>;
		for (const r of MENU_ROLES) {
			if (!Array.isArray(v[r])) continue;
			const screens = screensIn(v[r]);
			profiles.push(
				profileFrom(r, { screens, actions: actionsIn(actions[r]), home: typeof home[r] === "string" && screens.includes(home[r] as ScreenId) ? (home[r] as ScreenId) : null, builtIn: true }),
			);
		}
		if (typeof home.admin === "string" && IDS.has(home.admin)) v.adminHome = home.admin;
	}
	for (const r of MENU_ROLES) if (!profiles.some((p) => p.id === r)) profiles.splice(MENU_ROLES.indexOf(r), 0, profileFrom(r, { builtIn: true }));
	return { profiles, adminHome: typeof v.adminHome === "string" && IDS.has(v.adminHome) ? (v.adminHome as ScreenId) : null };
}

/** The profile a person uses: the one given to them, else the built-in one of their role (none for admins). */
export function profileOf(who: Who, access: MenuAccess): AccessProfile | null {
	if (who.role === "admin") return null;
	return access.profiles.find((p) => p.id === who.accessId && p.base === who.role) ?? access.profiles.find((p) => p.id === who.role) ?? null;
}

/** The screen a path belongs to ("/tickets/1042" → "/tickets"), if it's one of the menu's. */
export function screenOf(pathname: string): ScreenId | "/settings" | null {
	const top = `/${pathname.split("/").filter(Boolean)[0] ?? ""}`;
	if (top === "/settings") return "/settings";
	return IDS.has(top) ? (top as ScreenId) : null;
}

/** Whether this person may open the path (pages outside the menu stay open). */
export function canOpen(who: Who, access: MenuAccess, pathname: string): boolean {
	if (who.role === "admin") return true;
	const screen = screenOf(pathname);
	if (screen === "/settings") return false;
	return screen === null || Boolean(profileOf(who, access)?.screens.includes(screen));
}

/** Whether this person may do the action: its screen is on and the action too. Administrators may do everything. */
export function mayDo(who: Who, access: MenuAccess, action: ActionId): boolean {
	if (who.role === "admin") return true;
	const p = profileOf(who, access);
	return Boolean(p && p.screens.includes(ACTION_SCREEN[action]) && p.actions.includes(action));
}

/** Where a person lands: their profile's home page, else the calendar, else their first screen. */
export function homeFor(who: Who, access: MenuAccess): ScreenId | null {
	if (who.role === "admin") return access.adminHome ?? "/calendar";
	const p = profileOf(who, access);
	if (!p) return null;
	if (p.home && p.screens.includes(p.home)) return p.home;
	return p.screens.includes("/calendar") ? "/calendar" : (SCREENS.find((s) => p.screens.includes(s.id))?.id ?? null);
}

/** What each screen is, for the access editor. */
export const SCREEN_INFO: Record<ScreenId, string> = {
	"/dashboards": "Custom dashboards with charts built from tickets, leads and visits.",
	"/calendar": "Appointments: inspections, repairs, showings and meetings.",
	"/technician": "The field's visits: check-in, actions, photos, signature and the report.",
	"/developments": "Developments, blocks and units, with who lives in each.",
	"/team": "People, their access and job titles.",
	"/contacts": "Leads and their portfolio: stage, follow-ups and contacts made.",
	"/deals": "Sales and their billing: installments, promises and the collection cadence.",
	"/tickets": "Every request, worked on through its workflow.",
	"/reports": "Tables and exports of tickets, visits and leads.",
	"/whats-new": "What changed in the CRM.",
};

/** What each access does on a screen it has (the rules the CRM already applies). */
export const ACCESS_RULES: Partial<Record<UserRole, Partial<Record<ScreenId, string>>>> = {
	admin: {},
	technician: {
		"/calendar": "Their own schedule; they book their own visits.",
		"/technician": "Their own visits: check in, fill in the report, collect the signature.",
		"/tickets": "Tickets assigned to them and the ones of their visits.",
		"/dashboards": "Charts over what they can see.",
		"/developments": "Looks up sites, blocks and units.",
	},
	engineer: {
		"/calendar": "The team's schedule, read only; changes only their own appointments.",
		"/technician": "Follows every technician's visits, read only.",
		"/tickets": "Tickets with a question to engineering: answers them and moves them on.",
		"/reports": "Reports over what they can see.",
		"/dashboards": "Charts over what they can see.",
		"/developments": "Looks up sites, blocks and units.",
	},
	broker: {
		"/calendar": "Their own schedule: showings and meetings.",
		"/contacts": "Their own lead portfolio.",
		"/deals": "Their deals and the billing of the ones they sold.",
		"/tickets": "Sales tickets assigned to them.",
		"/dashboards": "Charts over what they can see.",
		"/developments": "Looks up units and who lives there.",
	},
};
