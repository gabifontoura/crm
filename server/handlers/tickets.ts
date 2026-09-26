import { locationLabel } from "../../shared/developments.js";
import {
	availableTransitions,
	type FieldCondition,
	type FieldDef,
	fieldErrors,
	FIELD_KINDS,
	isClosedCategory,
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
	normalizeFieldValues,
	PRIORITIES,
	SIGNATURE_FIELD,
	requiredForTransition,
	STATUS_CATEGORIES,
	type Ticket,
	type TicketActivity,
	type TicketAttachment,
	type TicketStatus,
	type TicketType,
	type Transition,
	validateTicketType,
	validateWorkflow,
	type Workflow,
	summarizeTicket,
} from "../../shared/tickets.js";
import { canSeeAllSchedules, canViewAllTasks, USER_ROLES, type User, type UserRole } from "../../shared/users.js";
import {
	badRequest,
	bool,
	conflict,
	created,
	forbidden,
	HttpError,
	noContent,
	notFound,
	num,
	objectBody,
	ok,
	str,
	type ApiRequest,
} from "../lib/http.js";
import { currentUser, requireAdmin } from "../lib/session.js";
import type { Repos, StoredEvent } from "../repos/types.js";
import { sanitizePhotos, type ServicePhoto } from "../../shared/service.js";
import { requireAction } from "../lib/access.js";
import { askEngineering } from "./engineering.js";
import { readEvent } from "./events.js";
import { statusEmailFrom } from "../../shared/status-email.js";
import { sendStatusEmail } from "../lib/status-email.js";

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function slug(text: string, fallback: string): string {
	const s = text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_|_$/g, "")
		.slice(0, 40);
	return s || fallback;
}

/** Makes ids unique inside one list (status ids, field ids...). */
function uniqueIds<T extends { id: string }>(items: T[], make: (item: T, i: number) => string): T[] {
	const seen = new Set<string>();
	return items.map((item, i) => {
		let id = item.id?.trim() || make(item, i);
		while (seen.has(id)) id = `${id}_${i}`;
		seen.add(id);
		return { ...item, id };
	});
}

const canSeeAll = (me: User) => me.role === "admin";
/**
 * Who is responsible for a ticket: its assignee and the owners of the visits
 * (calendar appointments) booked for it. They and admins can handle it.
 */
type Owners = Set<string> | undefined;
/** Engineering follows the whole field's work (read only), like the technicians' tasks. */
const canSee = (me: User, t: Ticket, owners?: Owners) =>
	canSeeAll(me) || me.role === "engineer" || Boolean(me.sees?.tickets) || t.assigneeId === me.id || t.reporterId === me.id || Boolean(owners?.has(me.id));
/**
 * Employees work on tickets assigned to them; admins on any; engineering on
 * the ones with a question sent to it (its workflow steps stay the field's).
 */
const canWork = (me: User, t: Ticket, owners?: Owners) =>
	canSeeAll(me) || t.assigneeId === me.id || Boolean(owners?.has(me.id)) || (me.role === "engineer" && Boolean(t.engineering));

/** Owner ids of the visits booked for each ticket number. */
async function visitOwnersByNumber(repos: Repos): Promise<Map<string, Set<string>>> {
	const map = new Map<string, Set<string>>();
	for (const e of await repos.events.list()) {
		if (!e.ticketNumber) continue;
		if (!map.has(e.ticketNumber)) map.set(e.ticketNumber, new Set());
		map.get(e.ticketNumber)!.add(e.ownerId);
	}
	return map;
}
/**
 * Owners of the visits booked for a ticket. A sub-ticket is an action of its
 * parent's visits, so the parent's technicians handle it too.
 */
function ownersOf(map: Map<string, Set<string>>, t: Ticket, parentNumber?: number): Set<string> {
	const own = new Set(map.get(String(t.number)) ?? []);
	if (parentNumber !== undefined) for (const id of map.get(String(parentNumber)) ?? []) own.add(id);
	return own;
}
async function visitOwners(repos: Repos, t: Ticket): Promise<Set<string>> {
	const parent = t.parentId ? await repos.tickets.get(t.parentId) : null;
	return ownersOf(await visitOwnersByNumber(repos), t, parent?.number);
}

async function loadConfig(repos: Repos) {
	const [workflows, types] = await Promise.all([repos.workflows.list(), repos.ticketTypes.list()]);
	return { workflows, types };
}

async function typeAndWorkflow(repos: Repos, typeId: string): Promise<{ type: TicketType; workflow: Workflow }> {
	const type = await repos.ticketTypes.get(typeId);
	if (!type) notFound("Ticket type");
	const workflow = await repos.workflows.get(type.workflowId);
	if (!workflow) notFound("Workflow");
	return { type, workflow };
}

let ticketQueue: Promise<unknown> = Promise.resolve();
/**
 * Runs one ticket creation at a time, so two requests at once can't pick the
 * same ticket number (the next number is read, then the ticket is written).
 */
export function oneTicketAtATime<T>(task: () => Promise<T>): Promise<T> {
	const next = ticketQueue.then(task, task);
	ticketQueue = next.catch(() => undefined);
	return next;
}

/** A value as it reads in the history ("—" for empty). */
function shown(v: unknown, def?: FieldDef): string {
	if (v === null || v === undefined || v === "") return "—";
	if (def?.kind === "checkbox" || typeof v === "boolean") return v === true ? "Yes" : "No";
	if (def?.kind === "currency" && typeof v === "number") return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
	const s = String(v).replace(/\s+/g, " ");
	return s.length > 60 ? `“${s.slice(0, 57)}…”` : def?.kind === "text" || def?.kind === "textarea" ? `“${s}”` : s;
}

/** What changed between two versions of a ticket, one line each ("Priority: Medium → High"). */
function describeChanges(before: Ticket, after: Ticket): string[] {
	const out: string[] = [];
	const pr = (id: string) => PRIORITIES.find((p) => p.id === id)?.label ?? id;
	if (before.title !== after.title) out.push(`Title: ${shown(before.title, { kind: "text" } as FieldDef)} → ${shown(after.title, { kind: "text" } as FieldDef)}`);
	if (before.description !== after.description) out.push("Description changed");
	if (before.priority !== after.priority) out.push(`Priority: ${pr(before.priority)} → ${pr(after.priority)}`);
	const req = (t: Ticket) => [t.requester.name, t.requester.email, t.requester.phone].join("|");
	if (req(before) !== req(after)) {
		out.push(before.requester.name !== after.requester.name ? `Requester: ${shown(before.requester.name)} → ${shown(after.requester.name)}` : "Requester contact changed");
	}
	const place = (t: Ticket) => [t.property, t.location].filter(Boolean).join(" · ");
	if (place(before) !== place(after)) out.push(`Location: ${shown(place(before))} → ${shown(place(after))}`);
	if ((before.dueAt ?? "") !== (after.dueAt ?? "")) out.push(`Due: ${before.dueAt ? before.dueAt.slice(0, 10) : "—"} → ${after.dueAt ? after.dueAt.slice(0, 10) : "—"}`);
	return out;
}

function describeFieldChanges(defs: FieldDef[], before: Record<string, unknown>, after: Record<string, unknown>): string[] {
	return defs
		.filter((d) => JSON.stringify(before[d.id] ?? null) !== JSON.stringify(after[d.id] ?? null))
		.map((d) => `${d.label}: ${shown(before[d.id], d)} → ${shown(after[d.id], d)}`);
}

function log(repos: Repos, a: Omit<TicketActivity, "id" | "at">) {
	return repos.ticketActivity.insert({ ...a, id: newId("act"), at: new Date().toISOString() });
}

/* ------------------------------- Config --------------------------------- */

export async function getTicketConfig(req: ApiRequest, repos: Repos) {
	await currentUser(req, repos);
	return ok(await loadConfig(repos));
}

function readWorkflow(body: Record<string, unknown>, current?: Workflow): Omit<Workflow, "id" | "updatedAt"> {
	const rawStatuses = Array.isArray(body.statuses) ? (body.statuses as Record<string, unknown>[]) : (current?.statuses ?? []);
	const statuses: TicketStatus[] = uniqueIds(
		rawStatuses.map((s) => ({
			id: str(s.id),
			name: str(s.name).trim(),
			color: /^#[0-9a-f]{6}$/i.test(str(s.color)) ? str(s.color) : "#64748B",
			category: (STATUS_CATEGORIES.some((c) => c.id === s.category) ? s.category : "todo") as TicketStatus["category"],
			...(bool(s.needsVisit) ? { needsVisit: true } : {}),
			...(bool(s.engineering) ? { engineering: true } : {}),
			...(s.email ? { email: statusEmailFrom(s.email) } : {}),
		})),
		(s, i) => slug(s.name, `status_${i + 1}`),
	);
	const validRoles = USER_ROLES.map((r) => r.id);
	const rawTransitions = Array.isArray(body.transitions) ? (body.transitions as Record<string, unknown>[]) : (current?.transitions ?? []);
	const transitions: Transition[] = uniqueIds(
		rawTransitions.map((t) => ({
			id: str(t.id),
			from: str(t.from),
			to: str(t.to),
			label: str(t.label).trim(),
			roles: (Array.isArray(t.roles) ? t.roles : []).filter((r): r is UserRole => validRoles.includes(r as UserRole)),
			requireComment: bool(t.requireComment),
			requiredFields: (Array.isArray(t.requiredFields) ? t.requiredFields : []).map(String),
			...(bool(t.onTasksScreen) ? { onTasksScreen: true } : {}),
		})),
		(_t, i) => newId(`tr${i}`),
	);
	return {
		name: str(body.name, current?.name).trim(),
		description: str(body.description, current?.description).trim(),
		initialStatusId: str(body.initialStatusId, current?.initialStatusId ?? statuses[0]?.id),
		statuses,
		transitions,
	};
}

export async function createWorkflow(req: ApiRequest, repos: Repos) {
	requireAdmin(await currentUser(req, repos));
	const input = readWorkflow(objectBody(req));
	const problems = validateWorkflow(input);
	if (problems.length) badRequest(problems[0], { workflow: problems.join("\n") });
	const wf: Workflow = { id: newId("wf"), ...input, updatedAt: new Date().toISOString() };
	return created(await repos.workflows.insert(wf));
}

export async function updateWorkflow(req: ApiRequest, repos: Repos, params: { id: string }) {
	requireAdmin(await currentUser(req, repos));
	const existing = await repos.workflows.get(params.id);
	if (!existing) notFound("Workflow");
	const input = readWorkflow(objectBody(req), existing);
	const problems = validateWorkflow(input);
	if (problems.length) badRequest(problems[0], { workflow: problems.join("\n") });

	// Removing a status that tickets are still in would strand them.
	const typeIds = new Set((await repos.ticketTypes.list()).filter((t) => t.workflowId === existing.id).map((t) => t.id));
	const kept = new Set(input.statuses.map((s) => s.id));
	const stranded = (await repos.tickets.list()).filter((t) => typeIds.has(t.typeId) && !kept.has(t.statusId));
	if (stranded.length) {
		const names = [...new Set(stranded.map((t) => existing.statuses.find((s) => s.id === t.statusId)?.name ?? t.statusId))];
		conflict(`${stranded.length} ticket${stranded.length === 1 ? " is" : "s are"} still in "${names.join('", "')}". Move them before removing the status.`);
	}
	const wf: Workflow = { ...existing, ...input, updatedAt: new Date().toISOString() };
	return ok(await repos.workflows.update(existing.id, wf));
}

export async function deleteWorkflow(req: ApiRequest, repos: Repos, params: { id: string }) {
	requireAdmin(await currentUser(req, repos));
	const existing = await repos.workflows.get(params.id);
	if (!existing) notFound("Workflow");
	const users = (await repos.ticketTypes.list()).filter((t) => t.workflowId === existing.id);
	if (users.length) conflict(`Used by ${users.map((t) => `"${t.name}"`).join(", ")}. Switch those ticket types first.`);
	await repos.workflows.remove(existing.id);
	return noContent();
}

function readCondition(raw: unknown): FieldCondition | null {
	if (!raw || typeof raw !== "object") return null;
	const c = raw as Record<string, unknown>;
	const fieldId = str(c.fieldId).trim();
	if (!fieldId) return null;
	const equals = (Array.isArray(c.equals) ? c.equals : []).map((v) => String(v).trim()).filter(Boolean);
	return { fieldId, equals: [...new Set(equals)] };
}

function readTicketType(body: Record<string, unknown>, current?: TicketType): Omit<TicketType, "id"> {
	const rawFields = Array.isArray(body.fields) ? (body.fields as Record<string, unknown>[]) : (current?.fields ?? []);
	const fields: FieldDef[] = uniqueIds(
		rawFields.map((f) => ({
			id: str(f.id),
			label: str(f.label).trim(),
			kind: (FIELD_KINDS.some((k) => k.id === f.kind) ? f.kind : "text") as FieldDef["kind"],
			options: (Array.isArray(f.options) ? f.options : []).map((o) => String(o).trim()).filter(Boolean),
			required: bool(f.required),
			helpText: str(f.helpText).trim(),
			showWhen: readCondition(f.showWhen),
		})),
		(f, i) => slug(f.label, `field_${i + 1}`),
	);
	const sla = body.slaHours === null || body.slaHours === "" ? null : num(body.slaHours, current?.slaHours ?? 0) || null;
	const priority = str(body.defaultPriority, current?.defaultPriority ?? "medium");
	return {
		name: str(body.name, current?.name).trim(),
		description: str(body.description, current?.description).trim(),
		color: /^#[0-9a-f]{6}$/i.test(str(body.color)) ? str(body.color) : (current?.color ?? "#2B6CB0"),
		workflowId: str(body.workflowId, current?.workflowId),
		defaultPriority: (PRIORITIES.some((p) => p.id === priority) ? priority : "medium") as TicketType["defaultPriority"],
		slaHours: sla && sla > 0 ? Math.round(sla) : null,
		active: bool(body.active, current?.active ?? true),
		fields,
	};
}

export async function createTicketType(req: ApiRequest, repos: Repos) {
	requireAdmin(await currentUser(req, repos));
	const input = readTicketType(objectBody(req));
	const problems = validateTicketType(input, await repos.workflows.list());
	if (problems.length) badRequest(problems[0], { type: problems.join("\n") });
	return created(await repos.ticketTypes.insert({ id: newId("tt"), ...input }));
}

export async function updateTicketType(req: ApiRequest, repos: Repos, params: { id: string }) {
	requireAdmin(await currentUser(req, repos));
	const existing = await repos.ticketTypes.get(params.id);
	if (!existing) notFound("Ticket type");
	const input = readTicketType(objectBody(req), existing);
	const workflows = await repos.workflows.list();
	const problems = validateTicketType(input, workflows);
	if (problems.length) badRequest(problems[0], { type: problems.join("\n") });
	if (input.workflowId !== existing.workflowId) {
		// Every open ticket must land on a status that exists in the new workflow.
		const target = workflows.find((w) => w.id === input.workflowId)!;
		const ids = new Set(target.statuses.map((s) => s.id));
		const stuck = (await repos.tickets.list()).filter((t) => t.typeId === existing.id && !ids.has(t.statusId));
		if (stuck.length) {
			conflict(`${stuck.length} ticket${stuck.length === 1 ? "" : "s"} of this type use statuses that "${target.name}" doesn't have.`);
		}
	}
	return ok(await repos.ticketTypes.update(existing.id, { ...existing, ...input }));
}

export async function deleteTicketType(req: ApiRequest, repos: Repos, params: { id: string }) {
	requireAdmin(await currentUser(req, repos));
	const existing = await repos.ticketTypes.get(params.id);
	if (!existing) notFound("Ticket type");
	const count = (await repos.tickets.list()).filter((t) => t.typeId === existing.id).length;
	if (count) conflict(`${count} ticket${count === 1 ? " uses" : "s use"} this type. Deactivate it instead.`);
	await repos.ticketTypes.remove(existing.id);
	return noContent();
}

/* ------------------------------- Tickets -------------------------------- */

async function resolveLocation(repos: Repos, body: Record<string, unknown>, errors: Record<string, string>) {
	const developmentId = str(body.developmentId) || null;
	const blockId = developmentId ? str(body.blockId) || null : null;
	const unitId = blockId ? str(body.unitId) || null : null;
	let property = "";
	let clientId = "";
	let location = "";
	if (developmentId) {
		const dev = await repos.developments.get(developmentId);
		if (!dev) errors.developmentId = "Development not found.";
		else {
			property = dev.name;
			clientId = dev.clientId;
		}
		const block = blockId ? await repos.blocks.get(blockId) : null;
		if (blockId && (!block || block.developmentId !== developmentId)) errors.blockId = "Block doesn't belong to this development.";
		const unit = unitId ? await repos.units.get(unitId) : null;
		if (unitId && (!unit || unit.blockId !== blockId)) errors.unitId = "Unit doesn't belong to this block.";
		location = locationLabel(block, unit);
	}
	return { developmentId, blockId, unitId, property, location, clientId };
}

/** Every ticket the user may see (the same rule as the Tickets list). */
export async function visibleTickets(repos: Repos, me: User): Promise<Ticket[]> {
	const owners = await visitOwnersByNumber(repos);
	const all = await repos.tickets.list();
	const numberById = new Map(all.map((t) => [t.id, t.number]));
	return all.filter((t) => canSee(me, t, ownersOf(owners, t, t.parentId ? numberById.get(t.parentId) : undefined)));
}

export async function listTickets(req: ApiRequest, repos: Repos) {
	const me = await currentUser(req, repos);
	const q = (req.query.q ?? "").trim().toLowerCase();
	const owners = await visitOwnersByNumber(repos);
	const all = await repos.tickets.list();
	const numberById = new Map(all.map((t) => [t.id, t.number]));
	const tickets = all.filter((t) => {
		if (!canSee(me, t, ownersOf(owners, t, t.parentId ? numberById.get(t.parentId) : undefined))) return false;
		if (req.query.typeId && t.typeId !== req.query.typeId) return false;
		if (req.query.assigneeId && t.assigneeId !== req.query.assigneeId) return false;
		if (q && ![t.title, t.description, t.requester.name, t.property, String(t.number)].some((f) => f.toLowerCase().includes(q))) return false;
		return true;
	});
	// File contents stay out of the list (they can be large); the detail has them.
	const light = tickets.map((t) => (t.attachments?.length ? { ...t, attachments: t.attachments.map((a) => ({ ...a, dataUrl: "" })) } : t));
	return ok(light.sort((a, b) => b.number - a.number));
}

/**
 * Everything the ticket screens show: the ticket, its history, the
 * appointments booked for it (matched by ticket number, with their service
 * reports) and the workflow steps the user can take now.
 */
async function ticketDetail(repos: Repos, me: User, ticket: Ticket) {
	const { workflow } = await typeAndWorkflow(repos, ticket.typeId);
	const all = await repos.tickets.list();
	const parent = ticket.parentId ? all.find((t) => t.id === ticket.parentId) : undefined;
	const children = all.filter((t) => t.parentId === ticket.id).sort((a, b) => a.number - b.number);
	const work = canWork(me, ticket, await visitOwners(repos, ticket));
	const activity = (await repos.ticketActivity.list())
		.filter((a) => a.ticketId === ticket.id)
		.sort((a, b) => a.at.localeCompare(b.at));
	const allEvents = await repos.events.list();
	const visitsOf = (n: number) =>
		allEvents
			.filter((e) => e.ticketNumber === String(n))
			.sort((a, b) => a.start.localeCompare(b.start))
			.map(linkedEvent);
	const linkedEvent = (e: (typeof allEvents)[number]) => ({
			id: e.id,
			title: e.title,
			type: e.type,
			ticketNumber: e.ticketNumber,
			start: e.start,
			end: e.end,
			ownerId: e.ownerId,
			completed: e.completed,
			property: e.property,
			location: e.location ?? "",
			notes: e.notes,
			/** Whether the user may open it in the technician screen. */
			canOpen: canViewAllTasks(me) || e.ownerId === me.id,
			service: e.service ?? null,
		});
	const events = visitsOf(ticket.number);

	// A sub-ticket is done on its parent's visits; other open sub-tickets at
	// the same place can be handled on the same trip.
	let nearby: { id: string; number: number; title: string; typeId: string; statusId: string; parentNumber: number | null; sameVisit: boolean }[] = [];
	if (parent) {
		const place = (t: Ticket) => (t.developmentId ? `${t.developmentId}|${t.blockId ?? ""}|${t.unitId ?? ""}` : `${t.property}|${t.location}`.trim());
		const here = place(ticket);
		const owners = await visitOwnersByNumber(repos);
		const byId = new Map(all.map((t) => [t.id, t]));
		if (here !== "|") {
			nearby = all
				.filter((t) => t.id !== ticket.id && t.parentId && !t.closedAt && place(t) === here)
				.filter((t) => canSee(me, t, ownersOf(owners, t, byId.get(t.parentId!)?.number)))
				.sort((a, b) => Number(b.parentId === parent.id) - Number(a.parentId === parent.id) || a.number - b.number)
				.slice(0, 12)
				.map((t) => ({ id: t.id, number: t.number, title: t.title, typeId: t.typeId, statusId: t.statusId, parentNumber: byId.get(t.parentId!)?.number ?? null, sameVisit: t.parentId === parent.id }));
		}
	}
	return {
		ticket: { ...ticket, attachments: ticket.attachments ?? [] },
		activity,
		events,
		parentVisits: parent ? visitsOf(parent.number) : [],
		/** Open sub-tickets that were rescheduled: they keep the ticket from being resolved. */
		rescheduledChildren: (await rescheduledChildren(repos, ticket)).map((t) => t.id),
		nearby,
		parent: parent ? summarizeTicket(parent) : null,
		children: children.map(summarizeTicket),
		canWork: work,
		transitions: work ? availableTransitions(workflow, ticket.statusId, me.role) : [],
	};
}

export async function getTicket(req: ApiRequest, repos: Repos, params: { id: string }) {
	const me = await currentUser(req, repos);
	const ticket = await repos.tickets.get(params.id);
	if (!ticket || !canSee(me, ticket, await visitOwners(repos, ticket))) notFound("Ticket");
	return ok(await ticketDetail(repos, me, ticket));
}

/** Same as GET /api/tickets/:id, by the human number (#1009). */
export async function getTicketByNumber(req: ApiRequest, repos: Repos, params: { number: string }) {
	const me = await currentUser(req, repos);
	const n = Number(params.number);
	const ticket = Number.isInteger(n) ? (await repos.tickets.list()).find((t) => t.number === n) : undefined;
	if (!ticket) notFound("Ticket");
	if (!canSee(me, ticket, await visitOwners(repos, ticket))) forbidden("This ticket isn't assigned to you or opened by you.");
	return ok(await ticketDetail(repos, me, ticket));
}

export async function createTicket(req: ApiRequest, repos: Repos) {
	const me = await currentUser(req, repos);
	const body = objectBody(req);
	await requireAction(repos, me, body.parentId ? "tickets.subtickets" : "tickets.create");
	return created(await createTicketFrom(repos, me, body));
}

/**
 * Creates a ticket (or a sub-ticket when `body.parentId` is set). Also used
 * when a technician leaves a task action for later (`origin`).
 */
export async function createTicketFrom(
	repos: Repos,
	me: User,
	body: Record<string, unknown>,
	origin: Ticket["origin"] = null,
): Promise<Ticket> {
	// A sub-ticket inherits the parent's type, location and requester unless given.
	let parent = str(body.parentId) ? await repos.tickets.get(str(body.parentId)) : null;
	if (str(body.parentId) && (!parent || !canWork(me, parent, await visitOwners(repos, parent)))) {
		forbidden("You can only add sub-tickets to tickets you handle.");
	}
	// One level only: a sub-ticket has no sub-tickets of its own.
	if (parent?.parentId) {
		const top = await repos.tickets.get(parent.parentId);
		// Actions of a visit booked on a sub-ticket become its siblings.
		if (origin && top) parent = top;
		else badRequest(`#${parent.number} is a sub-ticket and can't have sub-tickets.${top ? ` Add it to #${top.number} instead.` : ""}`);
	}
	if (parent) {
		for (const k of ["developmentId", "blockId", "unitId"] as const) if (!(k in body)) body[k] = parent[k];
		if (!body.requester) body.requester = parent.requester;
	}
	const { type, workflow } = await typeAndWorkflow(repos, str(body.typeId) || parent?.typeId || "");
	if (!type.active) badRequest("This ticket type is inactive.");
	const errors: Record<string, string> = {};
	const title = str(body.title).trim();
	if (!title) errors.title = "Title is required.";
	const priority = str(body.priority, type.defaultPriority);
	if (!PRIORITIES.some((p) => p.id === priority)) errors.priority = "Unknown priority.";

	// Employees open tickets for themselves; admins can assign anyone (or nobody).
	let assigneeId: string | null = canSeeAll(me) ? str(body.assigneeId) || null : me.id;
	// Leaving a task action for later keeps it with the technician who found it.
	if (parent && canSeeAll(me) && !("assigneeId" in body)) assigneeId = parent.assigneeId;
	if (assigneeId) {
		const a = await repos.users.get(assigneeId);
		if (!a || !a.active) errors.assigneeId = "Pick an active team member.";
	}
	const loc = await resolveLocation(repos, body, errors);
	// Sub-tickets of the same type start from the parent's field values.
	const fields = normalizeFieldValues(type.fields, {
		...(parent?.typeId === type.id ? parent.fields : {}),
		...withoutSignature(body.fields),
	});
	Object.assign(errors, fieldErrors(type.fields, fields, type.fields.filter((f) => f.required).map((f) => f.id)));
	if (Object.keys(errors).length) badRequest("Please fix the highlighted fields.", errors);

	const requester = (body.requester ?? {}) as Record<string, unknown>;
	const client = loc.clientId ? await repos.clients.get(loc.clientId) : null;
	const now = new Date();
	const ticket = await oneTicketAtATime(async () => {
	const number = (await repos.tickets.list()).reduce((max, t) => Math.max(max, t.number), 1000) + 1;
	const draft: Ticket = {
		id: newId("tk"),
		number,
		title,
		description: str(body.description).trim(),
		typeId: type.id,
		statusId: workflow.initialStatusId,
		priority: priority as Ticket["priority"],
		assigneeId,
		reporterId: me.id,
		requester: { name: str(requester.name).trim(), email: str(requester.email).trim(), phone: str(requester.phone).trim() },
		clientId: client?.id ?? "",
		clientName: client?.name ?? "",
		developmentId: loc.developmentId,
		blockId: loc.blockId,
		unitId: loc.unitId,
		property: loc.property,
		location: loc.location,
		dueAt: type.slaHours ? new Date(now.getTime() + type.slaHours * 3_600_000).toISOString() : null,
		fields,
		createdAt: now.toISOString(),
		updatedAt: now.toISOString(),
		closedAt: null,
		parentId: parent?.id ?? null,
		origin,
	};
	await repos.tickets.insert(draft);
	return draft;
	});
	await log(repos, { ticketId: ticket.id, userId: me.id, kind: "created", toStatusId: ticket.statusId });
	// The parent's history shows its new sub-ticket too.
	if (parent) {
		await log(repos, {
			ticketId: parent.id,
			userId: me.id,
			kind: "edited",
			comment: `Added sub-ticket #${ticket.number} ${shown(ticket.title, { kind: "text" } as FieldDef)}${origin ? ` (task action “${origin.actionLabel}”)` : ""}`,
		});
	}
	return ticket;
}

export async function updateTicket(req: ApiRequest, repos: Repos, params: { id: string }) {
	const me = await currentUser(req, repos);
	const existing = await repos.tickets.get(params.id);
	if (!existing || !canSee(me, existing, await visitOwners(repos, existing))) notFound("Ticket");
	if (!canWork(me, existing, await visitOwners(repos, existing))) forbidden("Only the assignee or an administrator can edit this ticket.");
	const body = objectBody(req);
	const type = await repos.ticketTypes.get(existing.typeId);
	const errors: Record<string, string> = {};

	const title = str(body.title, existing.title).trim();
	if (!title) errors.title = "Title is required.";
	const priority = str(body.priority, existing.priority);
	if (!PRIORITIES.some((p) => p.id === priority)) errors.priority = "Unknown priority.";

	let assigneeId = existing.assigneeId;
	if ("assigneeId" in body) {
		const requested = str(body.assigneeId) || null;
		if (requested !== existing.assigneeId) {
			if (!canSeeAll(me)) forbidden("Only administrators can reassign tickets.");
			if (requested) {
				const a = await repos.users.get(requested);
				if (!a || !a.active) errors.assigneeId = "Pick an active team member.";
			}
			assigneeId = requested;
		}
	}
	const locationChanged = "developmentId" in body;
	const loc = locationChanged ? await resolveLocation(repos, body, errors) : null;
	// The signature name only comes from the Tasks screen.
	const fields = "fields" in body ? normalizeFieldValues(type?.fields ?? [], { ...existing.fields, ...withoutSignature(body.fields) }) : existing.fields;
	if (type) {
		// Fields already required at opening stay required.
		Object.assign(errors, fieldErrors(type.fields, fields, type.fields.filter((f) => f.required).map((f) => f.id)));
	}
	if (Object.keys(errors).length) badRequest("Please fix the highlighted fields.", errors);

	const requester = (body.requester ?? existing.requester) as Record<string, unknown>;
	const client = loc?.clientId ? await repos.clients.get(loc.clientId) : null;
	const ticket: Ticket = {
		...existing,
		title,
		description: str(body.description, existing.description).trim(),
		priority: priority as Ticket["priority"],
		assigneeId,
		requester: { name: str(requester.name).trim(), email: str(requester.email).trim(), phone: str(requester.phone).trim() },
		...(loc
			? {
					developmentId: loc.developmentId,
					blockId: loc.blockId,
					unitId: loc.unitId,
					property: loc.property,
					location: loc.location,
					clientId: client?.id ?? existing.clientId,
					clientName: client?.name ?? existing.clientName,
				}
			: {}),
		fields,
		updatedAt: new Date().toISOString(),
	};
	await repos.tickets.update(existing.id, ticket);
	if (assigneeId !== existing.assigneeId) await log(repos, { ticketId: ticket.id, userId: me.id, kind: "assigned", assigneeId });
	// Every change is on the history, with who made it and what it was before.
	const changes = describeChanges(existing, ticket);
	if (changes.length) await log(repos, { ticketId: ticket.id, userId: me.id, kind: "edited", comment: changes.join("\n") });
	const fieldChanges = describeFieldChanges(type?.fields ?? [], existing.fields, fields);
	if (fieldChanges.length) await log(repos, { ticketId: ticket.id, userId: me.id, kind: "fields", comment: fieldChanges.join("\n") });
	return ok(ticket);
}

/**
 * Validates a transition and returns the commit step, without saving yet, so
 * callers (like completing a field service) can check everything first.
 */
export async function prepareTransition(
	repos: Repos,
	me: User,
	existing: Ticket,
	input: {
		transitionId: string;
		comment?: string;
		fields?: Record<string, unknown>;
		/** The visit to book when the step leads to a status that needs one. */
		visit?: unknown;
		/** Moved from a visit that is taking place (field service): it counts as the visit. */
		onVisit?: boolean;
		/** Sub-tickets closed in the same go (by the visit's report): they don't hold the ticket open. */
		closingChildren?: Set<string>;
		/**
		 * An action approved (or found not applicable) on the visit closes its sub-ticket:
		 * the report decides, whatever roles the workflow gives each manual step.
		 */
		byVisitReport?: boolean;
		/** The question (and photos) for a step into a status that waits on engineering. */
		engineering?: unknown;
	},
): Promise<() => Promise<Ticket>> {
	if (!canWork(me, existing, await visitOwners(repos, existing))) forbidden("Only the assignee or an administrator can move this ticket.");
	const { type, workflow } = await typeAndWorkflow(repos, existing.typeId);
	const tr = workflow.transitions.find((t) => t.id === input.transitionId);
	if (!tr) badRequest("Unknown transition.");
	if (!availableTransitions(workflow, existing.statusId, input.byVisitReport ? "admin" : me.role).some((t) => t.id === tr.id)) {
		forbidden(`"${tr.label}" isn't available from the current status for your role.`);
	}
	if (tr.onTasksScreen && !input.onVisit) {
		badRequest(`"${tr.label}" is done on the Tasks screen: open the visit and pick it as the next step when finishing.`);
	}
	const comment = (input.comment ?? "").trim();
	const errors: Record<string, string> = {};
	if (tr.requireComment && !comment) errors.comment = "Add a comment to explain this step.";
	const fields = normalizeFieldValues(type.fields, { ...existing.fields, ...(input.onVisit ? (input.fields ?? {}) : withoutSignature(input.fields)) });
	Object.assign(errors, fieldErrors(type.fields, fields, requiredForTransition(tr, type)));
	const target = workflow.statuses.find((s) => s.id === tr.to)!;
	// Resolved means all the work is done: every sub-ticket closed first.
	if (target.category === "done") {
		const pending = (await repos.tickets.list())
			.filter((t) => t.parentId === existing.id && !t.closedAt && !input.closingChildren?.has(t.id))
			.sort((a, b) => a.number - b.number);
		if (pending.length) {
			const list = pending.map((t) => `#${t.number}`).join(", ");
			badRequest(`#${existing.number} can't be ${target.name.toLowerCase()} yet: sub-ticket${pending.length === 1 ? "" : "s"} ${list} ${pending.length === 1 ? "is" : "are"} still open.`, {
				children: `Finish or cancel ${list} first.`,
			});
		}
	}
	// "Visit scheduled" means a visit is on the calendar: with a time, a place and a client.
	let booking: StoredEvent | null = null;
	let bookedWhen = "";
	if (target.needsVisit && !input.onVisit) {
		if (input.visit && typeof input.visit === "object") {
			try {
				booking = await readVisit(repos, me, existing, input.visit as Record<string, unknown>);
				// Shown in the user's own time zone (the server runs in UTC).
				const label = str((input.visit as Record<string, unknown>).when).trim();
				bookedWhen = label && label.length <= 80 ? label : `${booking.start.slice(0, 16).replace("T", " ")} UTC`;
			} catch (e) {
				const fieldsOf = (e instanceof HttpError && e.details && typeof e.details === "object" ? e.details : {}) as Record<string, string>;
				for (const [k, v] of Object.entries(fieldsOf)) errors[`visit.${k}`] = v;
				if (!Object.keys(fieldsOf).length) throw e;
			}
		} else if (!(await openVisitsOf(repos, existing)).length) {
			errors.visit = `"${target.name}" needs a visit on the calendar: pick the date, time, place and client.`;
		}
	}
	// "With engineering" means engineering has a question to answer, with photos to analyze.
	let question: { text: string; photos: ServicePhoto[] } | null = null;
	if (target.engineering && existing.engineering?.status !== "open") {
		const raw = (input.engineering && typeof input.engineering === "object" ? input.engineering : {}) as Record<string, unknown>;
		const text = str(raw.question).trim().slice(0, 2000);
		const photos = sanitizePhotos(raw.photos, 6, `eng${Date.now().toString(36)}`);
		if (!text) errors.question = "Write the question for engineering.";
		if (!photos.length) errors.photos = "Add at least one photo for engineering to analyze.";
		question = { text, photos };
	}
	if (Object.keys(errors).length) badRequest("Complete the required information for this step.", errors);

	return async () => {
		const now = new Date().toISOString();
		let ticket: Ticket = { ...existing, statusId: target.id, fields, updatedAt: now, closedAt: isClosedCategory(target.category) ? now : null };
		if (booking) {
			await repos.events.insert(booking);
			// The ticket learns the place and the client when it didn't have them.
			if (!ticket.developmentId && booking.developmentId) {
				ticket = { ...ticket, developmentId: booking.developmentId, blockId: booking.blockId ?? null, unitId: booking.unitId ?? null, property: booking.property, location: booking.location ?? "" };
			}
			if (!ticket.requester.name && !ticket.clientName) ticket = { ...ticket, requester: { ...ticket.requester, name: booking.client.name }, clientName: booking.client.name };
		}
		await repos.tickets.update(existing.id, ticket);
		await log(repos, {
			ticketId: ticket.id,
			userId: me.id,
			kind: "status",
			fromStatusId: existing.statusId,
			toStatusId: target.id,
			transitionLabel: tr.label,
			comment: comment || undefined,
		});
		// Fields filled in for the step are on the history too.
		const fieldChanges = describeFieldChanges(type.fields, existing.fields, fields);
		if (fieldChanges.length) await log(repos, { ticketId: ticket.id, userId: me.id, kind: "fields", comment: fieldChanges.join("\n") });
		if (question) {
			const asked = await askEngineering(repos, me, ticket, question.text, {}, question.photos, { move: false });
			ticket = { ...ticket, engineering: asked };
			ticket = (await repos.tickets.get(ticket.id)) ?? ticket;
		}
		if (booking) {
			const owner = await repos.users.get(booking.ownerId);
			await log(repos, { ticketId: ticket.id, userId: me.id, kind: "comment", comment: `Visit booked: ${visitSummary(booking, bookedWhen, owner?.name)}` });
		}
		// The status's email (Settings › Workflows), on the history with who got it.
		const sent = await sendStatusEmail(repos, { me, ticket, type, from: workflow.statuses.find((s) => s.id === existing.statusId), target, comment: comment || undefined });
		if (sent) await log(repos, { ticketId: ticket.id, userId: me.id, kind: "email", comment: sent.subject, email: sent });
		return ticket;
	};
}

/**
 * Open sub-tickets that were rescheduled: left for later on a visit, moved to
 * a "Rescheduled" status, or whose own visit was moved to another day. The
 * parent can't be resolved while any is pending.
 */
export async function rescheduledChildren(repos: Repos, parent: Ticket): Promise<Ticket[]> {
	const open = (await repos.tickets.list()).filter((t) => t.parentId === parent.id && !t.closedAt);
	if (!open.length) return [];
	const events = await repos.events.list();
	const deferred = new Set<number>();
	const moved = new Set<string>();
	for (const e of events) {
		for (const c of e.service?.checklist ?? []) if (c.deferredTicket) deferred.add(c.deferredTicket);
		if (e.service?.reschedules?.length && !e.completed && e.service.status !== "completed") moved.add(e.ticketNumber);
	}
	const workflows = new Map((await repos.workflows.list()).map((w) => [w.id, w]));
	const types = new Map((await repos.ticketTypes.list()).map((t) => [t.id, t]));
	return open
		.filter((t) => {
			const st = workflows.get(types.get(t.typeId)?.workflowId ?? "")?.statuses.find((s) => s.id === t.statusId);
			return deferred.has(t.number) || moved.has(String(t.number)) || /reschedul/i.test(`${st?.id ?? ""} ${st?.name ?? ""}`);
		})
		.sort((a, b) => a.number - b.number);
}

/** Field values sent by the back office: the signature name is left out (it comes from the Tasks screen). */
function withoutSignature(raw: unknown): Record<string, unknown> {
	if (!raw || typeof raw !== "object") return {};
	const { [SIGNATURE_FIELD]: _signature, ...rest } = raw as Record<string, unknown>;
	return rest;
}

/** Visits of the ticket still to happen (not completed); a sub-ticket's include its parent's. */
export async function openVisitsOf(repos: Repos, ticket: Ticket): Promise<StoredEvent[]> {
	const parent = ticket.parentId ? await repos.tickets.get(ticket.parentId) : null;
	const numbers = new Set([String(ticket.number), ...(parent ? [String(parent.number)] : [])]);
	return (await repos.events.list()).filter((e) => numbers.has(e.ticketNumber) && !e.completed && e.service?.status !== "completed");
}

/** "Warranty visit on Mon, Sep 28 · 9:00 AM–10:00 AM, at Harbor View · Block A · Unit 304, with Ana Ruiz, by Leo Park." */
function visitSummary(e: StoredEvent, when: string, ownerName?: string) {
	const where = [e.property !== "—" ? e.property : "", e.location].filter(Boolean).join(" · ");
	return `${e.title} on ${when}, at ${where || "the site"}, with ${e.client.name}${ownerName ? `, by ${ownerName}` : ""}.`;
}

/**
 * The visit booked with a step: it goes on the calendar of whoever does it
 * (technicians and brokers book for themselves; admins for anyone), linked to
 * the ticket, at the ticket's place and with its client unless changed.
 */
async function readVisit(repos: Repos, me: User, ticket: Ticket, v: Record<string, unknown>): Promise<StoredEvent> {
	const errors: Record<string, string> = {};
	// One level: a sub-ticket is done on its parent's visit, so the visit goes on the parent.
	const parent = ticket.parentId ? await repos.tickets.get(ticket.parentId) : null;
	const host = parent ?? ticket;
	await requireAction(repos, me, "calendar.create");
	const ownerId = canSeeAllSchedules(me.role) ? str(v.ownerId) || ticket.assigneeId || me.id : me.id;
	const developmentId = str(v.developmentId, ticket.developmentId ?? "");
	const clientName = str(v.clientName, ticket.requester.name || ticket.clientName).trim();
	if (!str(v.start)) errors.start = "Pick when the visit happens.";
	if (!developmentId) errors.developmentId = "Pick where the visit happens.";
	if (!clientName) errors.client = "Who is the visit with?";
	if (Object.keys(errors).length) badRequest("Complete the visit.", errors);
	return readEvent(
		repos,
		{
			title: parent ? `${str(v.title).split(" · Ticket #")[0] || "Visit"} · Ticket #${host.number} - ${host.title}` : str(v.title).trim() || ticket.title,
			type: str(v.type, "initial_inspection"),
			mode: "on_site",
			start: str(v.start),
			end: str(v.end),
			client: { id: ticket.clientId || undefined, name: clientName },
			ticketNumber: String(host.number),
			developmentId,
			blockId: str(v.blockId, developmentId === ticket.developmentId ? (ticket.blockId ?? "") : ""),
			unitId: str(v.unitId, developmentId === ticket.developmentId ? (ticket.unitId ?? "") : ""),
			notes: str(v.notes).trim(),
			billable: false,
		},
		newId("evt"),
		ownerId,
		true,
	);
}

/** Adds a comment to a ticket's activity (used by field service reports). */
export async function logTicketComment(repos: Repos, userId: string, ticket: Ticket, comment: string) {
	const entry = await log(repos, { ticketId: ticket.id, userId, kind: "comment", comment });
	await repos.tickets.update(ticket.id, { ...ticket, updatedAt: entry.at });
}

/** Details another screen needs to offer a ticket's next steps. */
export async function ticketContext(repos: Repos, me: User, ticket: Ticket) {
	const { type, workflow } = await typeAndWorkflow(repos, ticket.typeId);
	return {
		ticket,
		type,
		workflow,
		canWork: canWork(me, ticket, await visitOwners(repos, ticket)),
		transitions: canWork(me, ticket, await visitOwners(repos, ticket)) ? availableTransitions(workflow, ticket.statusId, me.role) : [],
		/** What finishing a visit can do: each next step, and the field steps that can follow it on the spot. */
		paths: canWork(me, ticket, await visitOwners(repos, ticket)) ? visitPaths(workflow, ticket.statusId, me.role) : [],
	};
}

/**
 * Next steps offered when a visit is finished: every step available now,
 * then chained with the field steps that can follow it right there (e.g.
 * Ask owner to sign off → Owner approved, with the signature just collected).
 */
function visitPaths(workflow: Workflow, from: string, role: UserRole): { statusId: string; steps: Transition[] }[] {
	const out: { statusId: string; steps: Transition[] }[] = [];
	const walk = (steps: Transition[], seen: Set<string>) => {
		const last = steps[steps.length - 1];
		out.push({ statusId: last.to, steps });
		if (steps.length >= 5) return;
		for (const next of availableTransitions(workflow, last.to, role)) {
			if (next.onTasksScreen && !seen.has(next.to)) walk([...steps, next], new Set([...seen, next.to]));
		}
	};
	for (const first of availableTransitions(workflow, from, role)) walk([first], new Set([from, first.to]));
	return out;
}

/** Moves the ticket along its workflow, filling any fields the transition needs. */
export async function transitionTicket(req: ApiRequest, repos: Repos, params: { id: string }) {
	const me = await currentUser(req, repos);
	const existing = await repos.tickets.get(params.id);
	if (!existing || !canSee(me, existing, await visitOwners(repos, existing))) notFound("Ticket");
	const body = objectBody(req);
	const commit = await prepareTransition(repos, me, existing, {
		transitionId: str(body.transitionId),
		comment: str(body.comment),
		fields: (body.fields as Record<string, unknown>) ?? {},
		visit: body.visit,
		engineering: body.engineering,
	});
	return ok(await commit());
}

/**
 * Hands the ticket to someone else, like forwarding an email: the new
 * assignee gets it with a note. The assignee (or an admin) can forward.
 */
export async function forwardTicket(req: ApiRequest, repos: Repos, params: { id: string }) {
	const me = await currentUser(req, repos);
	const existing = await repos.tickets.get(params.id);
	if (!existing || !canSee(me, existing, await visitOwners(repos, existing))) notFound("Ticket");
	if (!canWork(me, existing, await visitOwners(repos, existing))) forbidden("Only the assignee or an administrator can forward this ticket.");
	await requireAction(repos, me, "tickets.forward");
	const body = objectBody(req);
	const to = str(body.to);
	const message = str(body.message).trim();
	if (!to) badRequest("Pick who to forward it to.", { to: "Pick who to forward it to." });
	if (to === existing.assigneeId) badRequest("It's already with this person.", { to: "It's already with this person." });
	const target = await repos.users.get(to);
	if (!target || !target.active) badRequest("Pick an active team member.", { to: "Pick an active team member." });
	if (message.length > 4000) badRequest("Message is too long.", { message: "Keep it under 4,000 characters." });
	const now = new Date().toISOString();
	const ticket: Ticket = { ...existing, assigneeId: to, updatedAt: now };
	await repos.tickets.update(existing.id, ticket);
	await log(repos, { ticketId: ticket.id, userId: me.id, kind: "assigned", assigneeId: to, comment: message || undefined });
	return ok({ ticket, stillVisible: canSee(me, ticket, await visitOwners(repos, ticket)) });
}

export async function commentTicket(req: ApiRequest, repos: Repos, params: { id: string }) {
	const me = await currentUser(req, repos);
	const ticket = await repos.tickets.get(params.id);
	if (!ticket || !canSee(me, ticket, await visitOwners(repos, ticket))) notFound("Ticket");
	const comment = str(objectBody(req).comment).trim();
	if (!comment) badRequest("Write a comment first.", { comment: "Write a comment first." });
	if (comment.length > 4000) badRequest("Comment is too long.", { comment: "Keep it under 4,000 characters." });
	const entry = await log(repos, { ticketId: ticket.id, userId: me.id, kind: "comment", comment });
	await repos.tickets.update(ticket.id, { ...ticket, updatedAt: entry.at });
	return created(entry);
}

export async function deleteTicket(req: ApiRequest, repos: Repos, params: { id: string }) {
	requireAdmin(await currentUser(req, repos));
	const ticket = await repos.tickets.get(params.id);
	if (!ticket) notFound("Ticket");
	for (const a of (await repos.ticketActivity.list()).filter((x) => x.ticketId === ticket.id)) await repos.ticketActivity.remove(a.id);
	await repos.tickets.remove(ticket.id);
	return noContent();
}

/* ----------------------------- Attachments ------------------------------ */

const ATTACHMENT_TYPES = /^data:(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain);base64,/;

/** Adds a file to the ticket. Anyone who can see the ticket may attach, like comments. */
export async function addTicketAttachment(req: ApiRequest, repos: Repos, params: { id: string }) {
	const me = await currentUser(req, repos);
	const ticket = await repos.tickets.get(params.id);
	if (!ticket || !canSee(me, ticket, await visitOwners(repos, ticket))) notFound("Ticket");
	const body = objectBody(req);
	const name = str(body.name).trim().slice(0, 160);
	const dataUrl = str(body.dataUrl);
	if (!name) badRequest("The file needs a name.");
	if (!ATTACHMENT_TYPES.test(dataUrl)) badRequest("Only images (PNG, JPEG, GIF, WebP), PDF and text files can be attached.");
	// Base64 is ~4/3 of the file size.
	const size = Math.round(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
	if (size > MAX_ATTACHMENT_BYTES) badRequest(`"${name}" is too large. Files can be up to ${Math.round(MAX_ATTACHMENT_BYTES / 1_000_000)} MB.`);
	const current = ticket.attachments ?? [];
	if (current.length >= MAX_ATTACHMENTS) conflict(`A ticket can have up to ${MAX_ATTACHMENTS} files. Remove one first.`);
	const attachment: TicketAttachment = {
		id: newId("att"),
		name,
		type: dataUrl.slice(5, dataUrl.indexOf(";")),
		size,
		dataUrl,
		uploadedBy: me.id,
		uploadedAt: new Date().toISOString(),
	};
	await repos.tickets.update(ticket.id, { ...ticket, attachments: [...current, attachment], updatedAt: attachment.uploadedAt });
	await log(repos, { ticketId: ticket.id, userId: me.id, kind: "attachment", comment: `Attached ${name}` });
	return created(attachment);
}

/** Removes a file: its uploader, the assignee or an administrator. */
export async function deleteTicketAttachment(req: ApiRequest, repos: Repos, params: { id: string; attachmentId: string }) {
	const me = await currentUser(req, repos);
	const ticket = await repos.tickets.get(params.id);
	if (!ticket || !canSee(me, ticket, await visitOwners(repos, ticket))) notFound("Ticket");
	const att = (ticket.attachments ?? []).find((a) => a.id === params.attachmentId);
	if (!att) notFound("Attachment");
	if (att.uploadedBy !== me.id && !canWork(me, ticket, await visitOwners(repos, ticket))) forbidden("Only the uploader, the assignee or an administrator can remove this file.");
	const now = new Date().toISOString();
	await repos.tickets.update(ticket.id, { ...ticket, attachments: (ticket.attachments ?? []).filter((a) => a.id !== att.id), updatedAt: now });
	await log(repos, { ticketId: ticket.id, userId: me.id, kind: "attachment", comment: `Removed ${att.name}` });
	return noContent();
}
