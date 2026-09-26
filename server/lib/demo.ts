import { SEED_USERS } from "../../shared/users.js";
import { ensureSeeded } from "../repos/index.js";
import type { Collection, Repos } from "../repos/types.js";
import { HttpError, type ApiRequest } from "./http.js";

/**
 * Demo mode (DEMO_MODE=true on the public demo): a notice on every screen, a
 * few limits so nobody fills the database, and a daily reset back to the
 * demo data — dated around the day it runs, so the agenda, tasks and
 * collections always look current.
 */
export const isDemo = () => ["1", "true", "yes"].includes(String(process.env.DEMO_MODE ?? "").toLowerCase());

/** Biggest request body in the demo (a few photos at a time). */
export const DEMO_MAX_BODY = 3 * 1024 * 1024;

/** How many rows each table may reach in the demo (the demo data plus room to play). */
const CAPS: Partial<Record<keyof Repos, { max: number; noun: string }>> = {
	tickets: { max: 400, noun: "tickets" },
	events: { max: 250, noun: "appointments" },
	contacts: { max: 200, noun: "leads" },
	users: { max: 40, noun: "team members" },
	clients: { max: 40, noun: "clients" },
	developments: { max: 25, noun: "developments" },
	blocks: { max: 80, noun: "blocks" },
	units: { max: 900, noun: "units" },
	dashboards: { max: 30, noun: "dashboards" },
	reports: { max: 30, noun: "reports" },
	releases: { max: 40, noun: "release notes" },
	workflows: { max: 15, noun: "workflows" },
	ticketTypes: { max: 20, noun: "ticket types" },
	billing: { max: 25, noun: "payment plans" },
};

class DemoLimit extends HttpError {
	constructor(message: string) {
		super(429, message);
	}
}

/** Before creating a row: in the demo, refuse once the table is full. */
export async function demoCap(repos: Repos, table: keyof Repos) {
	const cap = CAPS[table];
	if (!isDemo() || !cap) return;
	const rows = await (repos[table] as Collection<{ id: string | number }>).list();
	if (rows.length >= cap.max) throw new DemoLimit(`This demo holds up to ${cap.max} ${cap.noun}. It resets every night, so try again tomorrow, or edit the ones there.`);
}

/** In the demo, the sample team stays: they are the people you sign in as. */
export function protectDemoUser(userId: string, what: "delete" | "deactivate" | "change access") {
	if (!isDemo() || !SEED_USERS.some((u) => u.id === userId)) return;
	const verb = what === "delete" ? "deleted" : what === "deactivate" ? "deactivated" : "given another access";
	throw new HttpError(403, `In the demo, the sample team can't be ${verb}: you sign in as them. Add a new member to try it.`);
}

/** Rejects bodies over the demo's size limit (big photo uploads). */
export function checkDemoBody(req: ApiRequest) {
	if (!isDemo() || req.method === "GET" || req.body === undefined) return;
	const size = typeof req.body === "string" ? req.body.length : JSON.stringify(req.body ?? null).length;
	if (size > DEMO_MAX_BODY) throw new HttpError(413, "In the demo, uploads are limited to about 3 MB at a time. Try a smaller photo.");
}

/** Dependents first, so Postgres' foreign keys allow each delete. */
const WIPE_ORDER: (keyof Repos)[] = [
	"billing",
	"ticketActivity",
	"events",
	"tickets",
	"contacts",
	"dashboards",
	"reports",
	"ticketTypes",
	"workflows",
	"units",
	"blocks",
	"developments",
	"clients",
	"releases",
	"users",
];

/** Everything back to the demo data, dated around today. */
export async function resetDemo(repos: Repos) {
	const started = Date.now();
	for (const table of WIPE_ORDER) await (repos[table] as Collection<{ id: string | number }>).clear();
	await repos.settings.clear();
	await ensureSeeded(repos);
	return { ok: true, seconds: Math.round((Date.now() - started) / 100) / 10 };
}
