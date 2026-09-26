/**
 * Team members of the construction company. Shared by the frontend and the
 * backend, so imports use ".js" to also run as plain Node ESM on Vercel.
 */

/**
 * Admins see every schedule; technicians and brokers see only their own.
 * Engineers answer the technical questions the field sends them.
 */
export type UserRole = "admin" | "technician" | "broker" | "engineer" | "staff";

export interface User {
	id: string;
	name: string;
	email: string;
	phone: string;
	jobTitle: string;
	/** Main construction trade, e.g. Electrical or Plumbing. */
	trade: string;
	role: UserRole;
	/** Their access profile (Settings > Access); its base role is `role`. Empty: the built-in one of their role. */
	accessId?: string | null;
	/** Extra read-only views their access gives (set by the server when they sign in). */
	sees?: { team?: boolean; tickets?: boolean };
	/** Inactive users keep their history but can't be assigned new appointments. */
	active: boolean;
	createdAt: string;
	updatedAt: string;
}

/** Fields accepted when creating or editing a user. */
export type UserInput = Pick<User, "name" | "email" | "phone" | "jobTitle" | "trade" | "role" | "active" | "accessId">;

export const USER_ROLES: { id: UserRole; label: string; description: string }[] = [
	{ id: "admin", label: "Administrator", description: "Sees and manages every schedule, the team and the settings" },
	{ id: "technician", label: "Service technician", description: "Assistance and repairs; sees only their own schedule" },
	{ id: "broker", label: "Real estate broker", description: "Sales and showings; sees only their own schedule" },
	{ id: "engineer", label: "Engineer", description: "Answers technical questions from the field and follows every technician's tasks" },
	{ id: "staff", label: "Back office", description: "Office work (HR, finance, admin staff): no visits, sales or technical questions; only what its access gives" },
];

export const JOB_TITLES = [
	"Project manager",
	"Civil engineer",
	"Site foreman",
	"Architect",
	"Safety technician",
	"Electrician",
	"Plumber",
	"Maintenance technician",
	"Quantity surveyor",
	"Customer success",
	"Real estate broker",
	"Sales manager",
];

export const TRADES = [
	"General contracting",
	"Civil works",
	"Electrical",
	"Plumbing",
	"HVAC",
	"Finishing & painting",
	"Landscaping",
	"Safety",
	"Customer care",
	"Sales",
];

export function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	const first = parts[0][0] ?? "";
	const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
	return `${first}${last}`.toUpperCase();
}

/** Admins see (and manage) every schedule; everyone else sees only their own. */
export function canSeeAllSchedules(role: UserRole): boolean {
	return role === "admin";
}

/** Who follows every technician's work (read only): admins, engineers and accesses that see the team. */
export function canViewAllTasks(who: UserRole | Pick<User, "role" | "sees">): boolean {
	const role = typeof who === "string" ? who : who.role;
	return role === "admin" || role === "engineer" || (typeof who !== "string" && Boolean(who.sees?.team));
}

/** Who can go on visits (field work and showings): the rest works from the office. */
export const DOES_VISITS: UserRole[] = ["admin", "technician", "broker"];

export function roleLabel(role: UserRole): string {
	return USER_ROLES.find((r) => r.id === role)?.label ?? role;
}

const SEED_DATE = "2026-01-05T09:00:00.000Z";

/** Team created on the first run. Ids match the demo appointments. */
export const SEED_USERS: User[] = [
	{
		id: "2547",
		name: "Emily Carter",
		email: "emily.carter@example.com",
		phone: "+1 (555) 010-2547",
		jobTitle: "Project manager",
		trade: "General contracting",
		role: "admin",
		active: true,
		createdAt: SEED_DATE,
		updatedAt: SEED_DATE,
	},
	{
		id: "2548",
		name: "Jack Thompson",
		email: "jack.thompson@example.com",
		phone: "+1 (555) 010-2548",
		jobTitle: "Site foreman",
		trade: "Civil works",
		role: "technician",
		active: true,
		createdAt: SEED_DATE,
		updatedAt: SEED_DATE,
	},
	{
		id: "2549",
		name: "Olivia Bennett",
		email: "olivia.bennett@example.com",
		phone: "+1 (555) 010-2549",
		jobTitle: "Civil engineer",
		trade: "Civil works",
		role: "engineer",
		active: true,
		createdAt: SEED_DATE,
		updatedAt: SEED_DATE,
	},
	{
		id: "2550",
		name: "Ryan Mitchell",
		email: "ryan.mitchell@example.com",
		phone: "+1 (555) 010-2550",
		jobTitle: "Electrician",
		trade: "Electrical",
		role: "technician",
		active: true,
		createdAt: SEED_DATE,
		updatedAt: SEED_DATE,
	},
	{
		id: "2551",
		name: "Sophia Martinez",
		email: "sophia.martinez@example.com",
		phone: "+1 (555) 010-2551",
		jobTitle: "Sales manager",
		trade: "Sales",
		role: "admin",
		active: true,
		createdAt: SEED_DATE,
		updatedAt: SEED_DATE,
	},
	{
		id: "2552",
		name: "Ethan Walker",
		email: "ethan.walker@example.com",
		phone: "+1 (555) 010-2552",
		jobTitle: "Safety technician",
		trade: "Safety",
		role: "technician",
		active: true,
		createdAt: SEED_DATE,
		updatedAt: SEED_DATE,
	},
	{
		id: "2553",
		name: "Mia Robinson",
		email: "mia.robinson@example.com",
		phone: "+1 (555) 010-2553",
		jobTitle: "Plumber",
		trade: "Plumbing",
		role: "technician",
		active: true,
		createdAt: SEED_DATE,
		updatedAt: SEED_DATE,
	},
	{
		id: "2554",
		name: "Noah Harris",
		email: "noah.harris@example.com",
		phone: "+1 (555) 010-2554",
		jobTitle: "Maintenance technician",
		trade: "HVAC",
		role: "technician",
		active: true,
		createdAt: SEED_DATE,
		updatedAt: SEED_DATE,
	},
	{
		id: "2555",
		name: "Ava Collins",
		email: "ava.collins@example.com",
		phone: "+1 (555) 010-2555",
		jobTitle: "Site foreman",
		trade: "Finishing & painting",
		role: "technician",
		active: true,
		createdAt: SEED_DATE,
		updatedAt: SEED_DATE,
	},
	{
		id: "2556",
		name: "Lucas Turner",
		email: "lucas.turner@example.com",
		phone: "+1 (555) 010-2556",
		jobTitle: "Electrician",
		trade: "Electrical",
		role: "technician",
		active: true,
		createdAt: SEED_DATE,
		updatedAt: SEED_DATE,
	},
	{
		id: "2557",
		name: "Chloe Parker",
		email: "chloe.parker@example.com",
		phone: "+1 (555) 010-2557",
		jobTitle: "Real estate broker",
		trade: "Sales",
		role: "broker",
		active: true,
		createdAt: SEED_DATE,
		updatedAt: SEED_DATE,
	},
	{
		id: "2558",
		name: "Liam Foster",
		email: "liam.foster@example.com",
		phone: "+1 (555) 010-2558",
		jobTitle: "Real estate broker",
		trade: "Sales",
		role: "broker",
		active: true,
		createdAt: SEED_DATE,
		updatedAt: SEED_DATE,
	},
	{
		id: "2560",
		name: "Isabella Reyes",
		email: "isabella.reyes@example.com",
		phone: "+1 (555) 010-2560",
		jobTitle: "Real estate broker",
		trade: "Sales",
		role: "broker",
		active: true,
		createdAt: SEED_DATE,
		updatedAt: SEED_DATE,
	},
	{
		id: "2561",
		name: "Mason Hughes",
		email: "mason.hughes@example.com",
		phone: "+1 (555) 010-2561",
		jobTitle: "Real estate broker",
		trade: "Sales",
		role: "broker",
		active: true,
		createdAt: SEED_DATE,
		updatedAt: SEED_DATE,
	},
	{
		id: "2559",
		name: "Grace Morgan",
		email: "grace.morgan@example.com",
		phone: "+1 (555) 010-2559",
		jobTitle: "Architect",
		trade: "General contracting",
		role: "technician",
		active: false,
		createdAt: SEED_DATE,
		updatedAt: SEED_DATE,
	},
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns field -> message for invalid input; empty object when valid. */
export function validateUserInput(input: Partial<UserInput>): Partial<Record<keyof UserInput, string>> {
	const errors: Partial<Record<keyof UserInput, string>> = {};
	if (!input.name?.trim()) errors.name = "Name is required.";
	else if (input.name.trim().length > 120) errors.name = "Name is too long.";
	if (!input.email?.trim()) errors.email = "Email is required.";
	else if (!EMAIL_RE.test(input.email.trim())) errors.email = "Enter a valid email.";
	if (input.role && !USER_ROLES.some((r) => r.id === input.role)) errors.role = "Unknown role.";
	if (input.phone && input.phone.length > 40) errors.phone = "Phone is too long.";
	return errors;
}
