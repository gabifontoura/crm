import { isClosedCategory, normalizeFieldValues, type Ticket, type TicketActivity, type TicketType, type Workflow } from "../../shared/tickets.js";
import type { Repos, StoredEvent } from "../repos/types.js";
import { oneTicketAtATime } from "./tickets.js";

/**
 * Every visit belongs to a ticket, and every action of a visit is a
 * sub-ticket of it. A visit booked without a (real) ticket gets one here:
 * a sales ticket for showings and sales meetings, a maintenance request for
 * everything else. Past, completed visits get their actions as sub-tickets
 * too, closed the way the technician answered them.
 */

const SALES_APPOINTMENTS = new Set(["unit_showing", "sales_meeting"]);
const HOUR = 3_600_000;
const newId = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function pickType(types: TicketType[], appointmentType: string): TicketType | undefined {
	const active = types.filter((t) => t.active);
	const wanted = SALES_APPOINTMENTS.has(appointmentType) ? "tt-sales" : "tt-maintenance";
	return active.find((t) => t.id === wanted) ?? active[0];
}

/** Required fields filled with a neutral choice ("Other" when there is one). */
function startingFields(type: TicketType) {
	const raw: Record<string, unknown> = {};
	for (const f of type.fields) if (f.required && f.kind === "select" && f.options.length) raw[f.id] = f.options.includes("Other") ? "Other" : f.options[0];
	return normalizeFieldValues(type.fields, raw);
}

const firstOf = (wf: Workflow, category: string) => wf.statuses.find((s) => s.category === category);

export function ensureVisitTicket(repos: Repos, event: StoredEvent, now = new Date()): Promise<StoredEvent> {
	// Numbers are handed out here too: one creation at a time.
	return oneTicketAtATime(() => linkVisit(repos, event, now));
}

async function linkVisit(repos: Repos, stored: StoredEvent, now: Date): Promise<StoredEvent> {
	// Re-read inside the queue: another request may have linked it meanwhile.
	const event = (await repos.events.get(stored.id)) ?? stored;
	const tickets = await repos.tickets.list();
	const n = Number(event.ticketNumber);
	const existing = Number.isInteger(n) ? tickets.find((t) => t.number === n) : undefined;
	const done = event.completed || event.service?.status === "completed";
	const unnumbered = (event.service?.checklist ?? []).some((c) => !c.ticketNumber && !c.deferredTicket);
	if (existing && !(done && unnumbered)) return event;

	const allTypes = await repos.ticketTypes.list();
	const type = existing ? allTypes.find((t) => t.id === existing.typeId) : pickType(allTypes, event.type);
	const workflow = type ? await repos.workflows.get(type.workflowId) : null;
	if (!type || !workflow) return event;

	const createdAt = new Date(Math.min(new Date(event.start).getTime(), now.getTime()) - HOUR);
	const closedStatus = firstOf(workflow, "done");
	const initial = workflow.statuses.find((s) => s.id === workflow.initialStatusId) ?? workflow.statuses[0];
	// A finished service visit resolves its ticket; a finished showing or sales meeting doesn't win the deal.
	const sale = SALES_APPOINTMENTS.has(event.type);
	const status = done ? (sale ? (firstOf(workflow, "in_progress") ?? initial) : (closedStatus ?? initial)) : initial;
	const closedAt = done && !sale ? (event.service?.checkOutAt ?? event.end) : null;
	let next = tickets.reduce((m, t) => Math.max(m, t.number), 1000) + 1;

	const base = {
		priority: type.defaultPriority,
		assigneeId: event.ownerId,
		reporterId: event.ownerId,
		requester: { name: event.client?.name ?? "", email: "", phone: "" },
		clientId: event.client?.id ?? "",
		clientName: event.client?.name ?? "",
		developmentId: event.developmentId || null,
		blockId: event.blockId || null,
		unitId: event.unitId || null,
		property: event.property && event.property !== "—" ? event.property : "",
		location: event.location ?? "",
		attachments: [],
	};
	const parent: Ticket = existing ?? {
		id: newId("tk"),
		number: next++,
		title: event.title,
		description: event.notes || `Opened for the visit of ${new Date(event.start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`,
		typeId: type.id,
		statusId: status.id,
		...base,
		dueAt: type.slaHours ? new Date(createdAt.getTime() + type.slaHours * HOUR).toISOString() : null,
		fields: startingFields(type),
		parentId: null,
		origin: null,
		createdAt: createdAt.toISOString(),
		updatedAt: (closedAt ?? createdAt.toISOString()),
		closedAt,
	};
	const log = (a: Omit<TicketActivity, "id">) => repos.ticketActivity.insert({ ...a, id: newId("act") });
	if (!existing) {
		await repos.tickets.insert(parent);
		await log({ ticketId: parent.id, at: parent.createdAt, userId: event.ownerId, kind: "created", toStatusId: workflow.initialStatusId });
	}
	if (!existing && parent.statusId !== workflow.initialStatusId && closedAt) {
		await log({ ticketId: parent.id, at: closedAt, userId: event.ownerId, kind: "status", fromStatusId: workflow.initialStatusId, toStatusId: parent.statusId, comment: "Closed with the visit's service report." });
	}

	let service = event.service ?? null;
	// A finished visit's actions become its closed (or still open) sub-tickets now;
	// open visits get theirs when the task is opened (see syncActions).
	if (done && service) {
		const cancelled = firstOf(workflow, "cancelled");
		const checklist = [];
		for (const c of service.checklist) {
			if (c.ticketNumber || c.deferredTicket) {
				checklist.push({ ...c, ticketNumber: c.ticketNumber ?? c.deferredTicket });
				continue;
			}
			const st = c.result === "ok" ? closedStatus : c.result === "na" ? (cancelled ?? closedStatus) : undefined;
			const target = st ?? workflow.statuses.find((s) => s.id === workflow.initialStatusId) ?? workflow.statuses[0];
			const child: Ticket = {
				...parent,
				...base,
				id: newId("tk"),
				createdAt: createdAt.toISOString(),
				updatedAt: closedAt ?? createdAt.toISOString(),
				number: next++,
				title: c.label,
				description: [c.description, c.note].filter(Boolean).join("\n\n"),
				statusId: target.id,
				// One level only: a sub-ticket's visit actions are its siblings.
				parentId: parent.parentId ?? parent.id,
				origin: { eventId: event.id, actionId: c.id, actionLabel: c.label },
				fields: startingFields(type),
				closedAt: isClosedCategory(target.category) ? closedAt : null,
			};
			await repos.tickets.insert(child);
			await log({ ticketId: child.id, at: child.createdAt, userId: event.ownerId, kind: "created", toStatusId: workflow.initialStatusId });
			checklist.push({ ...c, ticketNumber: child.number });
		}
		service = { ...service, checklist };
	}

	const updated: StoredEvent = { ...event, ticketNumber: String(parent.number), service };
	await repos.events.update(event.id, updated);
	return updated;
}
