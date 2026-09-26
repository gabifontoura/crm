import { generateMockEvents } from "../../shared/calendar/seed.js";
import { generateSeedContacts } from "../../shared/contacts.js";
import { seedDashboards } from "../../shared/dashboards.js";
import { seedBilling } from "../seed/billing.js";
import { seedContactHistory } from "../seed/billing-contacts.js";
import { soldUnitOf } from "../lib/sold-unit.js";
import { cadenceFrom, ymd } from "../../shared/billing.js";
import { seedReports } from "../../shared/reports.js";
import { generateSeedDevelopments, SEED_CLIENT_RECORDS } from "../../shared/developments.js";
import { ENGINEERING_STATUS, ENGINEERING_STEPS, generateSeedTickets, mergeLeakIntoWarranty, SEED_TICKET_TYPES, SEED_WORKFLOWS } from "../../shared/tickets.js";
import { SEED_USERS } from "../../shared/users.js";
import { OLD_SEED_RELEASE_TITLES, SEED_RELEASES } from "../seed/releases.js";
import { ensureVisitTicket } from "../handlers/visit-tickets.js";
import { seedCompletedReport, seedTicketVisits } from "../seed/service.js";
import { buildServiceStories } from "../seed/stories.js";
import { seedDevelopmentDetails } from "../seed/development-details.js";
import { seedTypePhotos } from "../seed/type-photos.js";
import { seedTypeGalleries } from "../seed/type-gallery.js";
import { createFileRepos } from "./file-repos.js";
import { createSupabaseRepos, supabaseConfig } from "./supabase-repos.js";
import type { Collection, Repos, StoredEvent } from "./types.js";

let repos: Repos | null = null;
let seeding: Promise<void> | null = null;

/** Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, local JSON files otherwise. */
export function getRepos(): Repos {
	if (!repos) {
		const config = supabaseConfig();
		repos = config ? createSupabaseRepos(config) : createFileRepos();
	}
	return repos;
}

/** Bump when a new module brings its own demo data (2 = tickets, 3 = field service, 4 = contacts, 5 = leaks are warranty claims, 6 = dashboards, 7 = reports, 8–9 = every visit has a ticket, 10 = engineering, 11 = billing, 12 = statuses that need a visit, 13 = steps done on the Tasks screen, 14 = one level of sub-tickets, 15 = the owner's approval is a field step, 16 = service demo told as consistent stories, 17 = engineering is a warranty step, 18 = development photos, stages and unit types, 19 = a photo per apartment type, 20 = homes' type photos fixed, 21 = a few photos per home type). */
const SEED_VERSION = 26;

/**
 * Fills an empty database with the fictional demo data once. The flag in
 * settings keeps it from re-adding rows someone deleted on purpose.
 */
export function ensureSeeded(r: Repos): Promise<void> {
	// Only the in-flight run is shared; each later request re-checks the flag
	// (one small read), so a wiped database gets seeded again.
	if (!seeding) {
		seeding = (async () => {
			if (((await r.settings.get<number>("seed_version")) ?? 0) >= SEED_VERSION) return;
			// One server at a time: several can wake up at once on Vercel (the rest wait for it).
			if (!(await takeSeedLock(r))) return waitForSeed(r);
			try {
				await seedUnderLock(r);
			} finally {
				await r.settings.remove(SEED_LOCK);
			}
		})().finally(() => {
			seeding = null;
		});
	}
	return seeding;
}

const SEED_LOCK = "seed_lock";
/**
 * A lock older than this was left by a run that died: it can be taken over.
 * Longer than a function may run on Vercel (maxDuration 300 s in vercel.json).
 */
const STALE_LOCK_MS = 6 * 60_000;
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function takeSeedLock(r: Repos): Promise<boolean> {
	if (await r.settings.claim(SEED_LOCK, Date.now())) return true;
	const held = await r.settings.get<number>(SEED_LOCK);
	if (!held || Date.now() - held > STALE_LOCK_MS) {
		await r.settings.set(SEED_LOCK, Date.now());
		return true;
	}
	return false;
}

async function waitForSeed(r: Repos) {
	for (let i = 0; i < 50; i++) {
		await sleep(1000);
		if (((await r.settings.get<number>("seed_version")) ?? 0) >= SEED_VERSION) return;
		if (!(await r.settings.get(SEED_LOCK))) return ensureSeeded(r);
	}
	throw new Error("The demo data is still being prepared. Try again in a moment.");
}

/** Dependents first, so Postgres' foreign keys allow each delete. */
export const WIPE_ORDER: (keyof Repos)[] = [
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

/** Deletes every row of every table (not the settings). */
export async function wipeTables(r: Repos) {
	for (const table of WIPE_ORDER) await (r[table] as Collection<{ id: string | number }>).clear();
}

async function seedUnderLock(r: Repos) {
	const version = (await r.settings.get<number>("seed_version")) ?? 0;
	if (version >= SEED_VERSION) return;
	// A first seed that died halfway left some rows: start it over from empty.
	if (version === 0 && (await r.users.list()).length > 0) await wipeTables(r);
	const { developments, blocks, units } = generateSeedDevelopments();
	// Order matters for the foreign keys in Postgres.
	if (version < 1) {
		await r.users.seed(SEED_USERS);
		await r.clients.seed(SEED_CLIENT_RECORDS);
		await r.developments.seed(developments);
		await r.blocks.seed(blocks);
		await r.units.seed(units);
		await r.events.seed(generateMockEvents().map(toStoredEvent));
		await r.releases.seed(SEED_RELEASES);
	}
	if (version < 2) {
		await r.workflows.seed(SEED_WORKFLOWS);
		await r.ticketTypes.seed(SEED_TICKET_TYPES);
		const { tickets, activity } = generateSeedTickets(new Date(), units, developments, SEED_CLIENT_RECORDS, blocks);
		await r.tickets.seed(tickets);
		await r.ticketActivity.seed(activity);
	}
	if (version < 3) {
		// Visits linked to open tickets, and reports on past completed jobs.
		await r.events.seed(seedTicketVisits(await r.tickets.list(), await r.users.list(), new Date()));
		let i = 0;
		for (const e of await r.events.list()) {
			if (e.service) continue;
			const report = seedCompletedReport(e, i++);
			if (report) await r.events.update(e.id, { ...e, service: report });
		}
	}
	if (version < 4) {
		// Lead portfolios: the sales tickets' requesters plus extra leads per broker.
		const types = new Set((await r.ticketTypes.list()).filter((t) => t.workflowId === "wf-sales").map((t) => t.id));
		const sales = (await r.tickets.list())
			.filter((t) => types.has(t.typeId))
			.map((t) => ({ ...t.requester, ownerId: t.assigneeId, developmentId: t.developmentId, createdAt: t.createdAt }));
		const devIds = (await r.developments.list()).map((d) => d.id);
		await r.contacts.seed(generateSeedContacts(new Date(), await r.users.list(), sales, devIds));
	}
	if (version >= 2 && version < 5) {
		// "Water leak" is no longer a ticket type: its tickets become warranty claims.
		const leak = await r.ticketTypes.get("tt-leak");
		const warranty = await r.ticketTypes.get("tt-warranty");
		if (leak && warranty) {
			const { type, tickets } = mergeLeakIntoWarranty(warranty, (await r.tickets.list()).filter((t) => t.typeId === leak.id));
			await r.ticketTypes.update(type.id, type);
			for (const t of tickets) await r.tickets.update(t.id, t);
			await r.ticketTypes.remove(leak.id);
		}
	}
	if (version < 6) {
		const admin = (await r.users.list()).find((u) => u.role === "admin" && u.active);
		if (admin) await r.dashboards.seed(seedDashboards(admin.id, new Date()));
	}
	if (version < 7) {
		const admin = (await r.users.list()).find((u) => u.role === "admin" && u.active);
		if (admin) await r.reports.seed(seedReports(admin.id, new Date()));
	}
	if (version < 9) {
		// Visits pointing at tickets that don't exist get a real one (and their actions sub-tickets).
		for (const e of await r.events.list()) await ensureVisitTicket(r, e);
	}
	if (version < 10) await moveTechnicalQuestionsToEngineering(r);
	if (version < 11) await seedBilling(r, new Date());
	if (version >= 2 && version < 12) {
		// "Visit scheduled" and "Showing booked" now require a visit on the calendar.
		const wanted: Record<string, string> = { "wf-warranty": "visit", "wf-sales": "showing" };
		for (const w of await r.workflows.list()) {
			const id = wanted[w.id];
			if (!id || !w.statuses.some((s) => s.id === id && !s.needsVisit)) continue;
			await r.workflows.update(w.id, { ...w, statuses: w.statuses.map((s) => (s.id === id ? { ...s, needsVisit: true } : s)) });
		}
	}
	if (version >= 2 && version < 13) {
		// The owner's sign-off is collected on site, on the Tasks screen.
		const w = await r.workflows.get("wf-warranty");
		if (w?.transitions.some((t) => t.id === "w7" && !t.onTasksScreen)) {
			await r.workflows.update(w.id, { ...w, transitions: w.transitions.map((t) => (t.id === "w7" ? { ...t, onTasksScreen: true } : t)) });
		}
	}
	if (version >= 2 && version < 14) {
		// Sub-tickets have no sub-tickets: nested ones move up to the top ticket.
		const all = await r.tickets.list();
		const byId = new Map(all.map((t) => [t.id, t]));
		const rootOf = (t: (typeof all)[number]) => {
			let cur = t;
			for (let i = 0; i < 10 && cur.parentId && byId.get(cur.parentId); i++) cur = byId.get(cur.parentId)!;
			return cur;
		};
		for (const t of all) {
			const parent = t.parentId ? byId.get(t.parentId) : undefined;
			if (parent?.parentId) await r.tickets.update(t.id, { ...t, parentId: rootOf(parent).id });
		}
	}
	if (version >= 2 && version < 15) {
		// "Owner approved" needs the customer's signature, which only the technician collects.
		const w = await r.workflows.get("wf-warranty");
		if (w?.transitions.some((t) => t.id === "w8" && !t.onTasksScreen)) {
			await r.workflows.update(w.id, { ...w, transitions: w.transitions.map((t) => (t.id === "w8" ? { ...t, onTasksScreen: true } : t)) });
		}
	}
	if (version < 16) await rebuildServiceDemo(r, new Date());
	if (version < 17) await engineeringInWarranty(r);
	if (version < 18) {
		const { devs, unitUpdates, blockUpdates } = seedDevelopmentDetails(await r.developments.list(), await r.blocks.list(), await r.units.list());
		for (const d of devs) await r.developments.update(d.id, d);
		for (const b of blockUpdates) await r.blocks.update(b.id, b);
		for (const u of unitUpdates) await r.units.update(u.id, u);
	}
	if (version < 20) for (const d of seedTypePhotos(await r.developments.list(), true)) await r.developments.update(d.id, d);
	if (version < 21) for (const d of seedTypeGalleries(await r.developments.list())) await r.developments.update(d.id, d);
	if (version >= 1 && version < 22) {
		// New demo release notes (with screen clips); notes people wrote stay.
		const current = await r.releases.list();
		for (const n of current) if (OLD_SEED_RELEASE_TITLES.includes(n.titulo)) await r.releases.remove(n.id);
		const taken = new Set((await r.releases.list()).map((n) => n.id));
		let next = Math.max(0, ...taken) + 1;
		for (const n of SEED_RELEASES) await r.releases.insert(taken.has(n.id) ? { ...n, id: next++ } : n);
	}
	if (version >= 1 && version < 25) {
		// New release notes added after the first seed: insert the ones missing.
		const current = await r.releases.list();
		const titles = new Set(current.map((n) => n.titulo));
		let next = Math.max(0, ...current.map((n) => n.id)) + 1;
		const ids = new Set(current.map((n) => n.id));
		for (const n of SEED_RELEASES) if (!titles.has(n.titulo)) await r.releases.insert(ids.has(n.id) ? { ...n, id: next++ } : n);
	}
	if (version < 24) {
		// Collection contacts so far (email, SMS, WhatsApp, calls…), for the Deals timeline.
		const cadence = cadenceFrom(await r.settings.get("settings.billingCadence"));
		for (const plan of seedContactHistory(await r.billing.list(), cadence, ymd(new Date()))) await r.billing.update(plan.id, plan);
	}
	if (version < 26) {
		// Plans record what was sold (development, block, unit) and the purchase date. Demo deals
		// sold without a unit get an available one in their development, now sold to the buyer.
		const units = await r.units.list();
		const blocks = await r.blocks.list();
		for (const plan of await r.billing.list()) {
			let ticket = await r.tickets.get(plan.ticketId);
			if (!ticket) continue;
			if (!ticket.unitId && ticket.developmentId) {
				const devBlocks = new Set(blocks.filter((b) => b.developmentId === ticket!.developmentId).map((b) => b.id));
				// An available unit, else one nobody lives in, else any: the demo sale needs a unit.
				const inDev = units.filter((u) => devBlocks.has(u.blockId));
				const free = inDev.find((u) => u.status === "available") ?? inDev.find((u) => !u.occupant && u.status !== "sold") ?? inDev.find((u) => u.status !== "sold") ?? inDev[0];
				if (free) {
					const block = blocks.find((b) => b.id === free.blockId)!;
					await r.units.update(free.id, { ...free, status: "sold", occupant: plan.customer.name.split(" (")[0] });
					free.status = "sold";
					ticket = { ...ticket, blockId: block.id, unitId: free.id, location: `${block.name} · Unit ${free.number}` };
					await r.tickets.update(ticket.id, ticket);
				}
			}
			const firstDue = [...plan.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.dueDate;
			// Bought on the earlier of the win and the first payment (usually the signing).
			const bought = [ticket.closedAt?.slice(0, 10), firstDue].filter((d): d is string => Boolean(d)).sort()[0] ?? plan.createdAt.slice(0, 10);
			await r.billing.update(plan.id, {
				...plan,
				property: [ticket.property, ticket.location].filter(Boolean).join(" · "),
				sold: await soldUnitOf(r, ticket),
				purchasedOn: bought,
			});
		}
	}
	await r.settings.set("seed_version", SEED_VERSION);
}

export function toStoredEvent(e: ReturnType<typeof generateMockEvents>[number]): StoredEvent {
	const { owner, start, end, ...rest } = e;
	return { ...rest, ownerId: owner.id, start: start.toISOString(), end: end.toISOString() };
}

/**
 * "Technical question" used to be a kind of visit; it's now a question the
 * field sends to engineering about a ticket. Each such visit becomes that
 * question on its ticket (answered if the visit took place), the visit and
 * its template actions go away, and civil engineers get the Engineer role.
 */
async function moveTechnicalQuestionsToEngineering(r: Repos) {
	for (const u of await r.users.list()) {
		if (u.role === "technician" && /engineer/i.test(u.jobTitle)) await r.users.update(u.id, { ...u, role: "engineer", updatedAt: new Date().toISOString() });
	}
	const engineer = (await r.users.list()).find((u) => u.role === "engineer" && u.active);
	const tickets = await r.tickets.list();
	for (const e of (await r.events.list()).filter((x) => x.type === "technical_question")) {
		const n = Number(e.ticketNumber);
		const ticket = Number.isInteger(n) ? tickets.find((t) => t.number === n) : undefined;
		if (ticket) {
			const done = e.completed || e.service?.status === "completed";
			const question = [e.title, e.notes].filter(Boolean).join(" — ");
			await r.tickets.update(ticket.id, {
				...ticket,
				engineering: {
					status: done ? "answered" : "open",
					question,
					askedBy: e.ownerId,
					askedAt: e.start,
					eventId: null,
					actionLabel: null,
					answer: done ? "Reviewed with the team; proceed as discussed and log the result on the ticket." : null,
					answeredBy: done ? (engineer?.id ?? e.ownerId) : null,
					answeredAt: done ? e.end : null,
				},
			});
			// The visit's template actions ("Question understood"...) were never real work.
			for (const t of tickets.filter((x) => x.parentId === ticket.id && x.origin?.eventId === e.id)) {
				for (const a of (await r.ticketActivity.list()).filter((x) => x.ticketId === t.id)) await r.ticketActivity.remove(a.id);
				await r.tickets.remove(t.id);
			}
		}
		await r.events.remove(e.id);
	}
}

/**
 * The first service demo came from generic calendar templates: every visit got
 * the same seven actions as sub-tickets, whatever the ticket was about, and
 * statuses didn't match what happened. Warranty and maintenance tickets, their
 * visits and history are replaced by consistent stories (see seed/stories);
 * sales, leads and billing stay. Sales tickets waiting on a showing get one.
 */
async function rebuildServiceDemo(r: Repos, now: Date) {
	const SERVICE_TYPES = new Set(["tt-warranty", "tt-maintenance"]);
	const SERVICE_VISITS = new Set(["initial_inspection", "maintenance", "awaiting_supplier", "technical_question"]);
	const all = await r.tickets.list();
	const gone = all.filter((t) => SERVICE_TYPES.has(t.typeId));
	const goneIds = new Set(gone.map((t) => t.id));
	const goneNumbers = new Set(gone.map((t) => String(t.number)));
	const kept = all.filter((t) => !goneIds.has(t.id));
	const keptNumbers = new Set(kept.map((t) => String(t.number)));

	for (const a of await r.ticketActivity.list()) if (goneIds.has(a.ticketId)) await r.ticketActivity.remove(a.id);
	// Sub-tickets before their parents.
	for (const t of [...gone].sort((a, b) => Number(Boolean(b.parentId)) - Number(Boolean(a.parentId)))) await r.tickets.remove(t.id);
	for (const e of await r.events.list()) {
		if (goneNumbers.has(e.ticketNumber) || (SERVICE_VISITS.has(e.type) && !keptNumbers.has(e.ticketNumber))) await r.events.remove(e.id);
	}

	const [developments, blocks, units, clients, types, workflows, users] = await Promise.all([
		r.developments.list(),
		r.blocks.list(),
		r.units.list(),
		r.clients.list(),
		r.ticketTypes.list(),
		r.workflows.list(),
		r.users.list(),
	]);
	const used = new Set(kept.map((t) => t.number));
	let n = 1000;
	const nextNumber = () => {
		do n++;
		while (used.has(n));
		used.add(n);
		return n;
	};
	const story = buildServiceStories({
		now,
		developments,
		blocks,
		units,
		clients,
		types,
		workflows,
		userName: (id) => users.find((u) => u.id === id)?.name ?? "Former member",
		nextNumber,
	});
	for (const t of story.tickets) await r.tickets.insert(t);
	for (const a of story.activity) await r.ticketActivity.insert(a);
	for (const e of story.events) await r.events.insert(e);

	// Sales tickets in a status that needs a visit ("Showing booked") get their showing.
	const salesFlow = workflows.find((w) => w.id === "wf-sales");
	const events = await r.events.list();
	const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (now.getDay() === 6 ? 2 : 1), 11, 0);
	for (const t of kept) {
		const st = salesFlow?.statuses.find((s) => s.id === t.statusId);
		if (!st?.needsVisit || t.closedAt) continue;
		if (events.some((e) => e.ticketNumber === String(t.number) && !e.completed && e.service?.status !== "completed")) continue;
		const ownerId = t.assigneeId ?? "2551";
		await r.events.insert({
			id: `sv-showing-${t.number}`,
			title: `Unit showing · Ticket #${t.number} - ${t.title}`,
			type: "unit_showing",
			mode: "on_site",
			completed: false,
			start: tomorrow.toISOString(),
			end: new Date(tomorrow.getTime() + 3_600_000).toISOString(),
			project: "SALES",
			client: { id: t.clientId, name: t.requester.name || t.clientName },
			ticketNumber: String(t.number),
			ownerId,
			property: t.property || "—",
			developmentId: t.developmentId ?? undefined,
			blockId: t.blockId ?? undefined,
			unitId: t.unitId ?? undefined,
			location: t.location,
			notes: t.description,
			billable: false,
			groupActivity: false,
			tags: [],
			hours: [],
			files: [],
			expenses: [],
			service: null,
		});
	}
}

/**
 * "With engineering" becomes a step of the warranty workflow: asking sends
 * the ticket there, the answer moves it on. Tickets with a question already
 * get the history they would have had.
 */
async function engineeringInWarranty(r: Repos) {
	const w = await r.workflows.get("wf-warranty");
	if (!w) return;
	if (!w.statuses.some((s) => s.engineering)) {
		const statuses = [...w.statuses];
		const at = statuses.findIndex((s) => s.id === "visit");
		statuses.splice(at + 1, 0, ENGINEERING_STATUS);
		const transitions = [...w.transitions, ...ENGINEERING_STEPS.filter((t) => !w.transitions.some((x) => x.id === t.id))];
		await r.workflows.update(w.id, { ...w, statuses, transitions, updatedAt: new Date().toISOString() });
	}
	const types = new Set((await r.ticketTypes.list()).filter((t) => t.workflowId === w.id).map((t) => t.id));
	const ask = (from: string) => ENGINEERING_STEPS.find((t) => t.from === from && t.to === ENGINEERING_STATUS.id);
	for (const t of await r.tickets.list()) {
		const q = t.engineering;
		if (!q || !types.has(t.typeId) || t.closedAt || t.statusId === ENGINEERING_STATUS.id) continue;
		const into = ask(t.statusId);
		if (!into) continue;
		await r.ticketActivity.insert({ id: `act-eng-${t.id}-in`, ticketId: t.id, at: q.askedAt, userId: q.askedBy, kind: "status", fromStatusId: t.statusId, toStatusId: ENGINEERING_STATUS.id, transitionLabel: into.label });
		if (q.status === "open") {
			await r.tickets.update(t.id, { ...t, statusId: ENGINEERING_STATUS.id });
		} else {
			// Answered: it went on to the repair with engineering's advice.
			const out = ENGINEERING_STEPS.find((x) => x.from === ENGINEERING_STATUS.id && x.to === "repair")!;
			await r.ticketActivity.insert({ id: `act-eng-${t.id}-out`, ticketId: t.id, at: q.answeredAt ?? q.askedAt, userId: q.answeredBy ?? q.askedBy, kind: "status", fromStatusId: ENGINEERING_STATUS.id, toStatusId: out.to, transitionLabel: out.label });
			await r.tickets.update(t.id, { ...t, statusId: out.to });
		}
	}
}
