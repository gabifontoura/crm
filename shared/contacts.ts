import type { User } from "./users.js";

/**
 * Contacts: the people the team sells to and serves. Each lead sits in one
 * person's portfolio (its owner); brokers see only their own portfolio,
 * administrators see and rebalance everyone's. Deals are sales tickets whose
 * requester has the contact's email. Imports use ".js" so the file also runs
 * as plain Node ESM on Vercel.
 */

export type Temperature = "hot" | "warm" | "cold";

export type InteractionKind = "call" | "email" | "meeting" | "message" | "note" | "transfer";

export interface Interaction {
	id: string;
	at: string;
	userId: string;
	kind: InteractionKind;
	note: string;
	/** For transfers: the new owner. */
	toOwnerId?: string | null;
}

/** A stage of the lead lifecycle; the admin names and colors them. */
export interface ContactStage {
	id: string;
	label: string;
	color: string;
	/** Won or lost: out of the active portfolio. */
	closed?: boolean;
}

export interface Contact {
	id: string;
	name: string;
	email: string;
	phone: string;
	company: string;
	/** Whose portfolio the lead is in; null while unassigned. */
	ownerId: string | null;
	stageId: string;
	temperature: Temperature;
	source: string;
	/** Development the lead is interested in, if any. */
	developmentId: string | null;
	budget: number | null;
	notes: string;
	/** Date (YYYY-MM-DD) of the next planned contact. */
	nextFollowUp: string | null;
	lastContactAt: string | null;
	interactions: Interaction[];
	createdBy: string;
	createdAt: string;
	updatedAt: string;
}

export const DEFAULT_CONTACT_STAGES: ContactStage[] = [
	{ id: "new", label: "New lead", color: "#64748B" },
	{ id: "contacted", label: "Contacted", color: "#0EA5E9" },
	{ id: "qualified", label: "Qualified", color: "#9333EA" },
	{ id: "negotiating", label: "Negotiating", color: "#EA580C" },
	{ id: "customer", label: "Customer", color: "#16A34A", closed: true },
	{ id: "lost", label: "Lost", color: "#DC2626", closed: true },
];

export const TEMPERATURES: { id: Temperature; label: string; color: string; hint: string }[] = [
	{ id: "hot", label: "Hot", color: "#DC2626", hint: "Ready to buy soon" },
	{ id: "warm", label: "Warm", color: "#EA580C", hint: "Interested, still deciding" },
	{ id: "cold", label: "Cold", color: "#0EA5E9", hint: "Early or quiet" },
];

export const LEAD_SOURCES = ["Website", "Referral", "Walk-in", "Listing portal", "Open house", "Social media", "Phone"];

export const INTERACTION_KINDS: { id: Exclude<InteractionKind, "transfer">; label: string }[] = [
	{ id: "call", label: "Call" },
	{ id: "email", label: "Email" },
	{ id: "meeting", label: "Meeting" },
	{ id: "message", label: "Message" },
	{ id: "note", label: "Note" },
];

/** Days without contact after which an open lead needs attention. */
export const STALE_DAYS = 14;

export const stageOf = (stages: ContactStage[], id: string) => stages.find((s) => s.id === id);

/** Stages saved by the admin, falling back to the defaults. */
export function contactStagesFrom(value: unknown): ContactStage[] {
	const list = (value as { stages?: unknown } | null)?.stages;
	if (!Array.isArray(list) || list.length === 0) return DEFAULT_CONTACT_STAGES;
	const out = list
		.filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
		.map((s) => ({
			id: String(s.id ?? "").trim(),
			label: String(s.label ?? "").trim(),
			color: /^#[0-9a-f]{6}$/i.test(String(s.color)) ? String(s.color) : "#64748B",
			closed: s.closed === true,
		}))
		.filter((s) => s.id && s.label);
	return out.length ? out : DEFAULT_CONTACT_STAGES;
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** Same person: compared by email (case-insensitive). */
export const sameEmail = (a: string, b: string) => Boolean(a.trim()) && a.trim().toLowerCase() === b.trim().toLowerCase();

export function daysSince(iso: string | null, now = Date.now()): number | null {
	if (!iso) return null;
	return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

/** Follow-up date is today or earlier. */
export function followUpDue(c: Pick<Contact, "nextFollowUp">, today = new Date()): boolean {
	if (!c.nextFollowUp) return false;
	const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
	return c.nextFollowUp <= t;
}

/* --------------------------------- Seed ---------------------------------- */

const FIRST = ["Olivia", "Liam", "Emma", "Noah", "Ava", "Elijah", "Sophia", "James", "Isabella", "Lucas", "Mia", "Mason", "Amelia", "Ethan", "Harper", "Logan", "Evelyn", "Aiden", "Abigail", "Carter", "Ella", "Wyatt", "Scarlett", "Owen", "Grace", "Caleb", "Chloe", "Henry", "Zoe", "Leo"];
const LAST = ["Bennett", "Hughes", "Price", "Sanders", "Myers", "Long", "Ross", "Foster", "Powell", "Jenkins", "Perry", "Russell", "Sullivan", "Bell", "Coleman", "Butler", "Henderson", "Barnes", "Gonzales", "Fisher", "Vasquez", "Simmons", "Romero", "Jordan", "Patterson", "Alexander", "Hamilton", "Graham", "Reynolds", "Griffin"];
const COMPANIES = ["", "", "", "Northwind Legal", "Bright Bakery Co.", "Summit Dental", "", "Keller Family Office", "", "Harbor Logistics", ""];
const NOTES = [
	"Looking for a 2-bedroom with a balcony, moving in the spring.",
	"Investor; wants rental yield figures for studios.",
	"First-time buyer, needs help with financing options.",
	"Asked about pet policy and parking spots.",
	"Wants a ground-floor unit for accessibility.",
	"Relocating for work; prefers virtual tours.",
	"Comparing with two other developments nearby.",
	"Needs a retail space with extraction for a café.",
];

/**
 * Fictional lead portfolios for the brokers: every sales ticket's requester
 * becomes a contact (so deals line up), plus extra leads at every stage.
 */
export function generateSeedContacts(
	now: Date,
	users: User[],
	salesRequesters: { name: string; email: string; phone: string; ownerId: string | null; developmentId: string | null; createdAt: string }[],
	developmentIds: string[],
): Contact[] {
	const brokers = users.filter((u) => u.role === "broker" && u.active).map((u) => u.id);
	const day = 86_400_000;
	const iso = (d: number) => new Date(now.getTime() - d * day).toISOString();
	const date = (d: number) => new Date(now.getTime() + d * day).toISOString().slice(0, 10);
	const contacts: Contact[] = [];
	const seen = new Set<string>();

	// Leads never share a name with someone on the team.
	const teamNames = new Set(users.map((u) => u.name.toLowerCase()));
	const push = (c: Omit<Contact, "id" | "interactions" | "createdBy" | "updatedAt"> & { interactions?: Interaction[] }) => {
		const key = c.email.toLowerCase();
		if (seen.has(key) || teamNames.has(c.name.toLowerCase())) return;
		seen.add(key);
		const id = `ct-${1001 + contacts.length}`;
		contacts.push({
			...c,
			id,
			createdBy: c.ownerId ?? "2547",
			updatedAt: c.lastContactAt ?? c.createdAt,
			interactions: (c.interactions ?? []).map((x, k) => ({ ...x, id: `${id}-i${k}` })),
		});
	};

	salesRequesters.forEach((r, i) => {
		const days = 2 + (i % 9);
		push({
			name: r.name,
			email: r.email,
			phone: r.phone,
			company: "",
			ownerId: r.ownerId,
			stageId: ["qualified", "negotiating", "contacted"][i % 3],
			temperature: (["hot", "warm", "warm", "cold"] as const)[i % 4],
			source: LEAD_SOURCES[i % LEAD_SOURCES.length],
			developmentId: r.developmentId,
			budget: 380000 + (i % 7) * 70000,
			notes: NOTES[i % NOTES.length],
			nextFollowUp: date((i % 5) - 1),
			lastContactAt: iso(days),
			createdAt: r.createdAt,
			interactions: [
				{ id: "", at: iso(days + 3), userId: r.ownerId ?? "2547", kind: "call", note: "First call: explained payment plans and sent the brochure." },
				{ id: "", at: iso(days), userId: r.ownerId ?? "2547", kind: "email", note: "Sent floor plans and the price list." },
			],
		});
	});

	const stages = ["new", "new", "contacted", "contacted", "qualified", "negotiating", "customer", "lost"];
	for (let i = 0; i < 30; i++) {
		const first = FIRST[i % FIRST.length];
		const last = LAST[(i * 7) % LAST.length];
		const owner = i % 9 === 8 ? null : (brokers[i % Math.max(brokers.length, 1)] ?? null);
		const stageId = stages[i % stages.length];
		const quiet = stageId === "new" ? null : 1 + ((i * 5) % 30);
		push({
			name: `${first} ${last}`,
			email: `${first}.${last}${i}@example.com`.toLowerCase(),
			phone: `+1 (555) 410-${String(2000 + i * 37).slice(-4)}`,
			company: COMPANIES[i % COMPANIES.length],
			ownerId: owner,
			stageId,
			temperature: (["warm", "cold", "hot", "warm", "cold"] as const)[i % 5],
			source: LEAD_SOURCES[(i * 3) % LEAD_SOURCES.length],
			developmentId: i % 4 === 3 ? null : (developmentIds[i % Math.max(developmentIds.length, 1)] ?? null),
			budget: i % 5 === 4 ? null : 250000 + ((i * 13) % 12) * 45000,
			notes: NOTES[(i * 3) % NOTES.length],
			nextFollowUp: stageId === "customer" || stageId === "lost" ? null : date((i % 7) - 2),
			lastContactAt: quiet === null ? null : iso(quiet),
			createdAt: iso(20 + (i % 40)),
			interactions:
				quiet === null
					? []
					: [{ id: "", at: iso(quiet), userId: owner ?? "2547", kind: (["call", "message", "meeting", "email"] as const)[i % 4], note: "Talked about availability and next steps." }],
		});
	}
	return contacts;
}
