import type { CalendarEvent } from "../../shared/calendar/types.js";
import type { Ticket } from "../../shared/tickets.js";
import { locationLabel } from "../../shared/developments.js";
import { canSeeAllSchedules, canViewAllTasks, initialsOf, type User } from "../../shared/users.js";
import {
	badRequest,
	bool,
	created,
	forbidden,
	noContent,
	notFound,
	objectBody,
	ok,
	str,
	type ApiRequest,
} from "../lib/http.js";
import { currentUser } from "../lib/session.js";
import type { Repos, StoredEvent } from "../repos/types.js";
import { requireAction } from "../lib/access.js";
import { ensureVisitTicket } from "./visit-tickets.js";
import { demoCap } from "../lib/demo.js";

const MODES = ["on_site", "remote", "hybrid"];

type Action = NonNullable<CalendarEvent["actions"]>[number];

/**
 * The visit's actions, i.e. its ticket's sub-tickets: the checklist once the
 * task was opened, else the ticket's open sub-tickets (done on this visit).
 */
function actionsOf(e: StoredEvent, tickets: Ticket[]): Action[] {
	const byNumber = new Map(tickets.map((t) => [t.number, t]));
	const listed = (e.service?.checklist ?? []).filter((c) => c.ticketNumber);
	if (listed.length) {
		return listed.map((c) => {
			const t = byNumber.get(c.ticketNumber!);
			return { number: c.ticketNumber!, title: t?.title ?? c.label, done: Boolean(t?.closedAt) || (c.result !== null && !c.deferredTicket) };
		});
	}
	const parent = byNumber.get(Number(e.ticketNumber));
	if (!parent || e.completed) return [];
	return tickets
		.filter((t) => t.parentId === parent.id && !t.closedAt)
		.sort((a, b) => a.number - b.number)
		.map((t) => ({ number: t.number, title: t.title, done: false }));
}

/** Stored event -> API shape, with the owner's name resolved from the users table. */
function present(e: StoredEvent, users: Map<string, User>, tickets: Ticket[] = []): Omit<CalendarEvent, "start" | "end"> & { start: string; end: string } {
	const { ownerId, ...rest } = e;
	const owner = users.get(ownerId);
	return {
		...rest,
		owner: { id: ownerId, name: owner?.name ?? "Former member", initials: owner ? initialsOf(owner.name) : "?" },
		actions: actionsOf(e, tickets),
	};
}

async function usersById(repos: Repos) {
	return new Map((await repos.users.list()).map((u) => [u.id, u]));
}

function arrayOf<T>(v: unknown): T[] {
	return Array.isArray(v) ? (v as T[]) : [];
}

/**
 * Validates the body and resolves the development / block / unit links, so
 * the stored names always match the referenced rows.
 */
export async function readEvent(
	repos: Repos,
	body: Record<string, unknown>,
	id: string,
	ownerId: string,
	/** Inactive owners keep existing appointments but can't get new ones. */
	newAssignment: boolean,
): Promise<StoredEvent> {
	const errors: Record<string, string> = {};
	const title = str(body.title).trim();
	const type = str(body.type).trim();
	const mode = str(body.mode, "on_site");
	const start = new Date(str(body.start));
	const end = new Date(str(body.end));
	const client = (body.client ?? {}) as Record<string, unknown>;

	if (!title) errors.title = "Title is required.";
	if (!type) errors.type = "Appointment type is required.";
	if (!MODES.includes(mode)) errors.mode = "Unknown meeting mode.";
	if (Number.isNaN(start.getTime())) errors.start = "Start date is invalid.";
	if (Number.isNaN(end.getTime())) errors.end = "End date is invalid.";
	else if (end <= start) errors.end = "End time must be after the start time.";
	if (!str(client.name).trim()) errors.client = "Client is required.";

	const owner = await repos.users.get(ownerId);
	if (!owner) errors.owner = "Owner not found.";
	else if (newAssignment && !owner.active) errors.owner = `${owner.name} is inactive and can't take new appointments.`;

	let property = str(body.property).trim();
	let location = "";
	const developmentId = str(body.developmentId) || undefined;
	const blockId = str(body.blockId) || undefined;
	const unitId = str(body.unitId) || undefined;
	if (developmentId) {
		const dev = await repos.developments.get(developmentId);
		if (!dev) errors.developmentId = "Development not found.";
		else property = dev.name;
		const block = blockId ? await repos.blocks.get(blockId) : null;
		if (blockId && (!block || block.developmentId !== developmentId)) errors.blockId = "Block doesn't belong to this development.";
		const unit = unitId ? await repos.units.get(unitId) : null;
		if (unitId && (!unit || unit.blockId !== blockId)) errors.unitId = "Unit doesn't belong to this block.";
		location = locationLabel(block, unit);
	}
	if (Object.keys(errors).length) badRequest("Please fix the highlighted fields.", errors);

	return {
		id,
		title,
		type,
		mode: mode as StoredEvent["mode"],
		completed: bool(body.completed),
		start: start.toISOString(),
		end: end.toISOString(),
		project: str(body.project).trim(),
		client: { id: str(client.id) || `cli-${Date.now()}`, name: str(client.name).trim() },
		ticketNumber: str(body.ticketNumber, "—").trim() || "—",
		ownerId,
		property: property || "—",
		developmentId,
		blockId: developmentId ? blockId : undefined,
		unitId: developmentId && blockId ? unitId : undefined,
		location,
		notes: str(body.notes),
		billable: bool(body.billable),
		groupActivity: bool(body.groupActivity),
		tags: arrayOf<string>(body.tags).filter((t) => typeof t === "string"),
		hours: arrayOf(body.hours),
		files: arrayOf(body.files),
		expenses: arrayOf(body.expenses),
	};
}

/** Non-admins may only touch their own appointments. */
function assertCanManage(me: User, ownerId: string) {
	if (!canSeeAllSchedules(me.role) && ownerId !== me.id) forbidden("You can only manage your own appointments.");
}

export async function listEvents(req: ApiRequest, repos: Repos) {
	const me = await currentUser(req, repos);
	const from = req.query.start ? new Date(`${req.query.start}T00:00:00`) : null;
	const to = req.query.end ? new Date(`${req.query.end}T23:59:59`) : null;
	const ownerFilter = req.query.owner;
	const all = await repos.events.list();
	const visible = all.filter((e) => {
		if (!canViewAllTasks(me) && e.ownerId !== me.id) return false;
		if (ownerFilter && e.ownerId !== ownerFilter) return false;
		const start = new Date(e.start);
		if (from && start < from) return false;
		if (to && start > to) return false;
		return true;
	});
	const users = await usersById(repos);
	const tickets = await repos.tickets.list();
	return ok(visible.map((e) => present(e, users, tickets)));
}

export async function createEvent(req: ApiRequest, repos: Repos) {
	await demoCap(repos, "events");
	const me = await currentUser(req, repos);
	await requireAction(repos, me, "calendar.create");
	const body = objectBody(req);
	// Employees always book for themselves; admins can book for anyone.
	const ownerId = canSeeAllSchedules(me.role) ? str((body.owner as { id?: unknown })?.id, me.id) : me.id;
	const id = str(body.id) && !(await repos.events.get(str(body.id))) ? str(body.id) : `evt-${Date.now().toString(36)}`;
	const event = await readEvent(repos, body, id, ownerId, true);
	await repos.events.insert(event);
	// Every visit belongs to a ticket: one is opened when none was given.
	const linked = await ensureVisitTicket(repos, event);
	return created(present(linked, await usersById(repos), await repos.tickets.list()));
}

export async function updateEvent(req: ApiRequest, repos: Repos, params: { id: string }) {
	const me = await currentUser(req, repos);
	const existing = await repos.events.get(params.id);
	if (!existing) notFound("Appointment");
	assertCanManage(me, existing.ownerId);
	await requireAction(repos, me, "calendar.edit");
	const body = objectBody(req);
	const requestedOwner = str((body.owner as { id?: unknown })?.id, existing.ownerId);
	if (!canSeeAllSchedules(me.role) && requestedOwner !== me.id) forbidden("Only administrators can reassign appointments.");
	const event = await readEvent(repos, body, existing.id, requestedOwner, requestedOwner !== existing.ownerId);
	// The service report is only changed through the field service endpoints.
	event.service = existing.service ?? null;
	await repos.events.update(existing.id, event);
	return ok(present(event, await usersById(repos), await repos.tickets.list()));
}

export async function deleteEvent(req: ApiRequest, repos: Repos, params: { id: string }) {
	const me = await currentUser(req, repos);
	const existing = await repos.events.get(params.id);
	if (!existing) notFound("Appointment");
	assertCanManage(me, existing.ownerId);
	await requireAction(repos, me, "calendar.delete");
	await repos.events.remove(existing.id);
	return noContent();
}
