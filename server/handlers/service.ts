import {
	completionProblems,
	MAX_RESCHEDULE_PHOTOS,
	MAX_REPORT_BYTES,
	MAX_TOTAL_PHOTOS,
	partsTotal,
	type RescheduleEntry,
	reportSummary,
	sanitizePhotos,
	closeClock,
	keepDeferred,
	newChecklistItem,
	sanitizeReport,
	type ServiceReport,
	serviceMinutes,
	ticketFieldsFromReport,
	totalPhotos,
} from "../../shared/service.js";
import { isClosedCategory, pathTo, SIGNATURE_FIELD, statusOf, type Ticket } from "../../shared/tickets.js";
import { canViewAllTasks, initialsOf, type User } from "../../shared/users.js";
import { badRequest, conflict, notFound, objectBody, ok, str, type ApiRequest } from "../lib/http.js";
import { currentUser } from "../lib/session.js";
import type { Repos, StoredEvent } from "../repos/types.js";
import { requireAction } from "../lib/access.js";
import { askEngineering, withdrawEngineering } from "./engineering.js";
import { createTicketFrom, logTicketComment, prepareTransition, ticketContext } from "./tickets.js";

/**
 * Field service ("perform the appointment"): the technician checks in, fills
 * the checklist, photos and signature, then completes the job. Completing
 * logs hours and parts on the appointment and reports back to its ticket (OC),
 * optionally moving the ticket to its next workflow step.
 */

const canManage = (me: User, e: StoredEvent) => me.role === "admin" || e.ownerId === me.id;

/** The task, for its technician or an admin; `view` also lets engineering follow it (read only). */
async function loadJob(req: ApiRequest, repos: Repos, id: string, mode: "manage" | "view" = "manage") {
	const me = await currentUser(req, repos);
	const event = await repos.events.get(id);
	if (!event || !(canManage(me, event) || (mode === "view" && canViewAllTasks(me)))) notFound("Appointment");
	return { me, event };
}

/** The ticket (OC) an appointment was booked for, matched by ticket number. */
async function linkedTicket(repos: Repos, event: StoredEvent) {
	const n = Number(event.ticketNumber);
	if (!Number.isFinite(n)) return null;
	return (await repos.tickets.list()).find((t) => t.number === n) ?? null;
}

const errorMessageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const withoutKey = (o: Record<string, unknown>, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));
const pickKey = (o: Record<string, unknown>, key: string) => (key in o ? { [key]: o[key] } : {});

/** The sub-tickets of the ticket's family: a sub-ticket's actions are its siblings (one level only). */
const subTicketsOf = async (repos: Repos, ticket: Ticket) => {
	const rootId = ticket.parentId ?? ticket.id;
	return (await repos.tickets.list()).filter((t) => t.parentId === rootId && t.id !== ticket.id);
};

/**
 * On a task linked to a ticket, the actions are a checklist of that ticket's
 * sub-tickets. Brings the task up to date with them: every action gets its
 * sub-ticket (created from the checklist template when missing), sub-tickets
 * added elsewhere become actions, titles follow the ticket, and sub-tickets
 * closed on the ticket count as answered. Completed tasks are left as they are.
 */
const syncing = new Map<string, Promise<StoredEvent>>();

/** One sync per visit at a time: opening a task twice at once must not add its sub-tickets twice. */
async function syncActions(repos: Repos, me: User, event: StoredEvent, ticket: Ticket | null): Promise<StoredEvent> {
	const running = syncing.get(event.id);
	if (running) {
		await running.catch(() => undefined);
		return (await repos.events.get(event.id)) ?? event;
	}
	const job = syncActionsNow(repos, me, event, ticket).finally(() => syncing.delete(event.id));
	syncing.set(event.id, job);
	return job;
}

async function syncActionsNow(repos: Repos, me: User, event: StoredEvent, ticket: Ticket | null): Promise<StoredEvent> {
	if (!ticket || event.service?.status === "completed" || event.completed) return event;
	let children = await subTicketsOf(repos, ticket);
	const before = sanitizeReport(event.service ?? null, event.type);
	// A new visit on a ticket with open sub-tickets does them: they are its actions, not the
	// generic template (which only fills in when there's nothing specific to do).
	const fresh = !event.service && children.some((t) => !t.closedAt);
	const report: ServiceReport = { ...before, checklist: fresh ? [] : before.checklist.map((c) => ({ ...c })) };

	for (const c of report.checklist) {
		// Actions left for later before this model already point at their sub-ticket.
		if (!c.ticketNumber && c.deferredTicket) c.ticketNumber = c.deferredTicket;
		if (c.ticketNumber) continue;
		// Already created for this action (e.g. by an earlier request): link it instead.
		const made = children.find((t) => t.origin?.eventId === event.id && t.origin?.actionId === c.id);
		if (made) {
			c.ticketNumber = made.number;
			continue;
		}
		try {
			const child = await createTicketFrom(
				repos,
				me,
				{ parentId: ticket.id, title: c.label, description: c.description, priority: ticket.priority },
				{ eventId: event.id, actionId: c.id, actionLabel: c.label },
			);
			c.ticketNumber = child.number;
			children = [...children, child];
		} catch {
			/* no right to add sub-tickets: the action stays a plain checklist item */
		}
	}

	const workflows = new Map<string, Awaited<ReturnType<typeof ticketContext>>["workflow"]>();
	const workflowOf = async (t: Ticket) => {
		if (!workflows.has(t.typeId)) workflows.set(t.typeId, (await ticketContext(repos, me, t)).workflow);
		return workflows.get(t.typeId);
	};
	const listed = new Set(report.checklist.map((c) => c.ticketNumber));
	for (const child of children) {
		const status = statusOf(await workflowOf(child), child.statusId);
		if (listed.has(child.number) || (status && isClosedCategory(status.category))) continue;
		report.checklist.push({ ...newChecklistItem(child.title, child.description), id: `st-${child.id}`, ticketNumber: child.number });
	}
	const byNumber = new Map(children.map((t) => [t.number, t]));
	// A sub-ticket deleted on the ticket screen takes its (unanswered) action with it.
	report.checklist = report.checklist.filter((c) => !c.ticketNumber || byNumber.has(c.ticketNumber) || c.result !== null || Boolean(c.deferredTicket));
	for (const c of report.checklist) {
		const child = c.ticketNumber ? byNumber.get(c.ticketNumber) : undefined;
		if (!child) continue;
		c.label = child.title;
		const status = statusOf(await workflowOf(child), child.statusId);
		// Closed on the ticket screen meanwhile: nothing left to do on the visit.
		if (status && isClosedCategory(status.category) && c.result === null && !c.deferredTicket) {
			c.result = status.category === "done" ? "ok" : "na";
			c.note = c.note || `Closed on sub-ticket #${child.number} (${status.name}).`;
		}
	}

	if (JSON.stringify(report.checklist) === JSON.stringify(before.checklist)) return event;
	const updated = { ...event, service: report };
	await repos.events.update(event.id, updated);
	return updated;
}

/**
 * After the visit: approved actions close their sub-ticket (done), not
 * applicable ones close it as cancelled when the workflow allows, and the
 * others get the technician's note. Steps that need more information are
 * left open with a comment so someone finishes them on the ticket.
 */
async function reportToSubTickets(repos: Repos, me: User, report: ServiceReport, minutes: number, when: string) {
	const numbers = new Set(report.checklist.map((c) => c.ticketNumber).filter(Boolean));
	if (!numbers.size) return;
	const tickets = (await repos.tickets.list()).filter((t) => numbers.has(t.number));
	for (const c of report.checklist) {
		const child = tickets.find((t) => t.number === c.ticketNumber);
		if (!child) continue;
		const ctx = await ticketContext(repos, me, child);
		const status = statusOf(ctx.workflow, child.statusId);
		if (!ctx.canWork || (status && isClosedCategory(status.category))) continue;
		const note = c.note.trim();
		if (c.deferredTicket) {
			await logTicketComment(repos, me.id, child, `Left for later on the visit of ${when}.${note ? `\n${note}` : ""}`);
			continue;
		}
		if (c.result === "ok" || c.result === "na") {
			const comment = note || (c.result === "ok" ? `Approved on the visit of ${when}.` : `Not applicable on the visit of ${when}.`);
			// Shortest chain of steps to a Done status (Cancelled first for N/A), e.g. Open → In progress → Done.
			const wanted = c.result === "ok" ? ["done"] : ["cancelled", "done"];
			const path = wanted
				.map((cat) =>
					ctx.workflow.statuses
						.filter((st) => st.category === cat)
						.map((st) => pathTo(ctx.workflow, child.statusId, st.id, "admin"))
						.filter((p): p is NonNullable<typeof p> => Boolean(p?.length))
						.sort((a, b) => a.length - b.length)[0],
				)
				.find(Boolean);
			// Fields the steps may need, filled from the visit and this action.
			const fields = { ...ticketFieldsFromReport(report, minutes), work_done: note || c.label };
			try {
				if (!path) throw new Error("no closing step");
				let current = child;
				for (const step of path) current = await (await prepareTransition(repos, me, current, { transitionId: step.id, comment, fields, onVisit: true, byVisitReport: true }))();
			} catch {
				await logTicketComment(repos, me.id, child, `${comment}\nNot closed automatically: finish it on the ticket.`);
			}
		} else if (c.result === "issue") {
			await logTicketComment(repos, me.id, child, `Rejected on the visit of ${when}.${note ? `\n${note}` : ""}`);
		}
	}
}

/**
 * The technician just checked in: the ticket follows on its own, along the
 * shortest path of steps they may use to an in-progress status (e.g. Open →
 * "Start work" → In progress). Tickets already moving, closed or waiting on
 * engineering stay put; a step that needs more information is left for the
 * ticket page, with a note.
 */
async function startTicketOnCheckIn(repos: Repos, me: User, event: StoredEvent) {
	const ticket = await linkedTicket(repos, event);
	if (!ticket) return;
	const ctx = await ticketContext(repos, me, ticket);
	const status = statusOf(ctx.workflow, ticket.statusId);
	if (!ctx.canWork || !status || status.engineering || !["todo", "waiting"].includes(status.category)) return;
	const path = ctx.workflow.statuses
		.filter((st) => st.category === "in_progress")
		.map((st) => pathTo(ctx.workflow, ticket.statusId, st.id, me.role))
		.filter((p): p is NonNullable<typeof p> => Boolean(p?.length))
		.sort((a, b) => a.length - b.length)[0];
	if (!path || path.length > 2) return;
	try {
		let current = ticket;
		for (const step of path) current = await (await prepareTransition(repos, me, current, { transitionId: step.id, comment: "Checked in on site.", onVisit: true, byVisitReport: true }))();
	} catch {
		await logTicketComment(repos, me.id, ticket, "Checked in on site. Move the ticket on from here: its next step needs more information.");
	}
}

export async function getServiceJob(req: ApiRequest, repos: Repos, params: { id: string }) {
	const { me, event: stored } = await loadJob(req, repos, params.id, "view");
	const owner = await repos.users.get(stored.ownerId);
	const ticket = await linkedTicket(repos, stored);
	const manages = canManage(me, stored);
	// Only whoever does the task brings its actions up to date; a viewer sees it as it is.
	const event = manages ? await syncActions(repos, me, stored, ticket) : stored;
	// Questions sent to engineering from this visit's actions, with their answers.
	const numbers = new Set((event.service?.checklist ?? []).map((c) => c.ticketNumber).filter(Boolean));
	const engineering: Record<number, NonNullable<Ticket["engineering"]> & { answeredByName?: string }> = {};
	if (numbers.size) {
		for (const t of (await repos.tickets.list()).filter((x) => numbers.has(x.number) && x.engineering)) {
			const by = t.engineering!.answeredBy ? await repos.users.get(t.engineering!.answeredBy) : null;
			engineering[t.number] = { ...t.engineering!, answeredByName: by?.name };
		}
	}
	const { ownerId, ...rest } = event;
	return ok({
		event: {
			...rest,
			owner: { id: ownerId, name: owner?.name ?? "Former member", initials: owner ? initialsOf(owner.name) : "?" },
			// Sanitized so reports saved before a shape change still load complete.
			service: sanitizeReport(event.service ?? null, event.type),
		},
		ticket: ticket ? await ticketContext(repos, me, ticket) : null,
		engineering,
		/** False for engineering following someone else's task: read only. */
		canManage: manages,
	});
}

function readReport(req: ApiRequest, event: StoredEvent): ServiceReport {
	const body = objectBody(req);
	if (JSON.stringify(body.report ?? {}).length > MAX_REPORT_BYTES) {
		badRequest("The report is too large. Remove some photos.");
	}
	// Sub-ticket links on actions are set by the server only; keep the stored ones.
	const report = keepDeferred(sanitizeReport(body.report, event.type), event.service);
	if (totalPhotos(report) > MAX_TOTAL_PHOTOS) badRequest(`Up to ${MAX_TOTAL_PHOTOS} photos per task.`);
	// The reschedule history is written only by /reschedule, never by the client.
	report.reschedules = sanitizeReport(event.service ?? null, event.type).reschedules;
	return report;
}

/** Saves the report while the job is in progress (autosave from the app). */
export async function saveServiceReport(req: ApiRequest, repos: Repos, params: { id: string }) {
	const { me, event } = await loadJob(req, repos, params.id);
	if (event.service?.status === "completed" && me.role !== "admin") {
		conflict("This service is already completed. Ask an administrator to change it.");
	}
	const report = readReport(req, event);
	// Status only moves forward here; completing goes through /complete.
	report.status = report.checkInAt ? "in_progress" : "not_started";
	if (event.service?.status === "completed") report.status = "completed";
	report.checkOutAt = report.status === "completed" ? report.checkOutAt : null;
	const checkedInNow = report.status === "in_progress" && !event.service?.checkInAt;
	await repos.events.update(event.id, { ...event, service: report });
	if (checkedInNow) await startTicketOnCheckIn(repos, me, event);
	// Renaming an action renames its sub-ticket.
	const linked = report.checklist.filter((c) => c.ticketNumber && c.label.trim());
	if (linked.length) {
		for (const t of (await repos.tickets.list()).filter((x) => linked.some((c) => c.ticketNumber === x.number))) {
			const c = linked.find((x) => x.ticketNumber === t.number)!;
			if (c.label.trim() !== t.title && (await ticketContext(repos, me, t)).canWork) {
				await repos.tickets.update(t.id, { ...t, title: c.label.trim(), updatedAt: new Date().toISOString() });
			}
		}
	}
	return ok(report);
}

/**
 * Finishes the job: validates everything first (report and, if chosen, the
 * ticket transition) and only then saves, so nothing is half-applied.
 */
export async function completeService(req: ApiRequest, repos: Repos, params: { id: string }) {
	const { me, event } = await loadJob(req, repos, params.id);
	if (event.service?.status === "completed") conflict("This service is already completed.");
	const body = objectBody(req);
	const report = readReport(req, event);
	const problems = completionProblems(report);
	if (problems.length) badRequest(problems[0], { report: problems.join("\n") });

	const now = new Date().toISOString();
	// A running clock stops now; a paused one keeps the time it was paused at.
	Object.assign(report, closeClock(report, now));
	report.status = "completed";
	const minutes = serviceMinutes(report);

	// Ticket follow-up, prepared (validated) before anything is saved.
	const ticket = await linkedTicket(repos, event);
	// One step, or the chain to the status picked (e.g. Ask owner to sign off → Owner approved).
	const stepIds = (Array.isArray(body.transitionIds) ? body.transitionIds.map(String) : [str(body.transitionId)]).filter(Boolean).slice(0, 10);
	let commitTransition: (() => Promise<unknown>) | null = null;
	if (stepIds.length) {
		if (!ticket) badRequest("This appointment isn't linked to a ticket.");
		const suggested = ticketFieldsFromReport(report, minutes);
		// Actions approved or not applicable close their sub-tickets with the report.
		const closing = new Set(
			(await repos.tickets.list())
				.filter((t) => t.parentId === ticket.id && report.checklist.some((c) => c.ticketNumber === t.number && !c.deferredTicket && (c.result === "ok" || c.result === "na")))
				.map((t) => t.id),
		);
		const input = (transitionId: string, closingChildren?: Set<string>) => ({
			transitionId,
			closingChildren,
			comment: str(body.comment) || undefined,
			// What the technician typed wins, except the signer's name: only the signature gives it.
			fields: { ...suggested, ...withoutKey((body.ticketFields as Record<string, unknown>) ?? {}, SIGNATURE_FIELD), ...pickKey(suggested, SIGNATURE_FIELD) },
			onVisit: true,
		});
		// Checked step by step before anything is saved…
		let preview: Ticket = ticket;
		const { workflow } = await ticketContext(repos, me, ticket);
		for (const id of stepIds) {
			await prepareTransition(repos, me, preview, input(id, closing));
			const to = workflow.transitions.find((t) => t.id === id)?.to ?? preview.statusId;
			preview = { ...preview, statusId: to };
		}
		// …then taken in order.
		commitTransition = async () => {
			let current: Ticket = ticket;
			for (const id of stepIds) current = await (await prepareTransition(repos, me, current, input(id)))();
		};
	}

	const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
	// Times shown in the technician's local time; the app sends them (the server runs in UTC).
	const localStart = /^\d{2}:\d{2}$/.test(str(body.localStart)) ? str(body.localStart) : new Date(report.checkInAt!).toISOString().slice(11, 16);
	const localEnd = /^\d{2}:\d{2}$/.test(str(body.localEnd)) ? str(body.localEnd) : report.checkOutAt!.slice(11, 16);
	const serviceExpenses = report.parts.map((p) => ({
		id: `svc-${p.id}`,
		description: `${p.qty}× ${p.description}`,
		amount: Math.round(p.qty * p.unitCost * 100) / 100,
	}));
	const updated: StoredEvent = {
		...event,
		completed: true,
		service: report,
		// Hours actually worked on site, replacing an earlier service entry.
		hours: [
			...event.hours.filter((h) => !h.id.startsWith("svc-")),
			{
				id: `svc-${event.id}`,
				start: localStart,
				end: localEnd,
				total: minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`,
				description: "On-site service",
			},
		],
		expenses: [...event.expenses.filter((x) => !x.id.startsWith("svc-")), ...serviceExpenses],
		files: [
			...event.files.filter((f) => !f.id.startsWith("svc-")),
			...[...report.photos, ...report.checklist.flatMap((c) => c.photos)].map((p) => ({ id: `svc-${p.id}`, name: p.name || "photo.jpg", size: `${Math.round((p.dataUrl.length * 0.75) / 1024)} KB` })),
		],
	};
	await repos.events.update(event.id, updated);

	if (ticket && (me.role === "admin" || ticket.assigneeId === me.id)) {
		await logTicketComment(repos, me.id, ticket, reportSummary(report, money));
	}
	// Sub-tickets first: the ticket is only resolved once they're closed.
	await reportToSubTickets(repos, me, report, minutes, str(body.localDate).slice(0, 40) || now.slice(0, 10));
	let ticketMoved = false;
	if (commitTransition && ticket) {
		try {
			await commitTransition();
			ticketMoved = true;
		} catch (e) {
			// A sub-ticket couldn't be closed automatically: the report is saved, the ticket stays where it is.
			const fresh = (await repos.tickets.get(ticket.id)) ?? ticket;
			await logTicketComment(repos, me.id, fresh, `Not moved after the visit: ${errorMessageOf(e)}`);
		}
	}

	return ok({ report, minutes, partsTotal: partsTotal(report.parts), ticketMoved });
}

/**
 * Moves the task to a new date and time (e.g. the customer was absent). Updates
 * the calendar appointment itself, keeps a history on the report, resets the
 * check-in and notes the change on the linked ticket.
 */
export async function rescheduleService(req: ApiRequest, repos: Repos, params: { id: string }) {
	const { me, event } = await loadJob(req, repos, params.id);
	await requireAction(repos, me, "tasks.reschedule");
	if (event.completed || event.service?.status === "completed") conflict("This task is already completed.");
	const body = objectBody(req);
	const start = Date.parse(str(body.start));
	const end = Date.parse(str(body.end));
	const reason = str(body.reason).trim().slice(0, 1000);
	const errors: Record<string, string> = {};
	if (Number.isNaN(start)) errors.start = "Pick the new date and time.";
	if (Number.isNaN(end)) errors.end = "Pick the new end time.";
	else if (!Number.isNaN(start) && end <= start) errors.end = "The end must be after the start.";
	if (!reason) errors.reason = "Explain why the task is being rescheduled.";
	if (Object.keys(errors).length) badRequest(Object.values(errors)[0], errors);
	if (JSON.stringify(body.photos ?? []).length > MAX_REPORT_BYTES) badRequest("The photos are too large.");

	const report = sanitizeReport(event.service ?? null, event.type);
	const entry: RescheduleEntry = {
		id: `rs_${Date.now().toString(36)}`,
		at: new Date().toISOString(),
		byId: me.id,
		byName: me.name,
		fromStart: event.start,
		fromEnd: event.end,
		toStart: new Date(start).toISOString(),
		toEnd: new Date(end).toISOString(),
		reason,
		photos: sanitizePhotos(body.photos, MAX_RESCHEDULE_PHOTOS, "rsph"),
	};
	report.reschedules = [...report.reschedules, entry];
	// A new visit: the technician checks in again on the new date.
	report.checkInAt = null;
	report.checkOutAt = null;
	report.sessions = [];
	report.status = "not_started";
	const updated: StoredEvent = { ...event, start: entry.toStart, end: entry.toEnd, completed: false, service: report };
	await repos.events.update(event.id, updated);

	const ticket = await linkedTicket(repos, event);
	if (ticket && (me.role === "admin" || ticket.assigneeId === me.id)) {
		// Labels come from the app in the technician's local time (the server runs in UTC).
		const fromLabel = str(body.fromLabel).slice(0, 80) || entry.fromStart;
		const toLabel = str(body.toLabel).slice(0, 80) || entry.toStart;
		await logTicketComment(repos, me.id, ticket, `Visit rescheduled from ${fromLabel} to ${toLabel}.
Reason: ${reason}`);
	}
	return ok({ start: entry.toStart, end: entry.toEnd, report });
}

/**
 * "Leave for later": turns one action of the task into a sub-ticket of the
 * linked ticket (e.g. a defect that needs another visit or a supplier), and
 * marks the action with the new ticket's number so the task can be closed.
 */
export async function deferAction(req: ApiRequest, repos: Repos, params: { id: string; actionId: string }) {
	const { me, event } = await loadJob(req, repos, params.id);
	if (event.service?.status === "completed") conflict("This task is already completed.");
	const ticket = await linkedTicket(repos, event);
	if (!ticket) badRequest("This task isn't linked to a ticket, so there is nothing to attach a sub-ticket to.");
	const report = sanitizeReport(event.service ?? null, event.type);
	const action = report.checklist.find((c) => c.id === params.actionId);
	if (!action) notFound("Action");
	if (action.deferredTicket) conflict(`This action was already left for later as sub-ticket #${action.deferredTicket}.`);

	const body = objectBody(req);
	const note = str(body.note).trim();
	// The action already is a sub-ticket: it just stays open for another day.
	if (action.ticketNumber) {
		const own = (await repos.tickets.list()).find((t) => t.number === action.ticketNumber) ?? null;
		const kept = {
			...report,
			checklist: report.checklist.map((c) => (c.id === action.id ? { ...c, deferredTicket: action.ticketNumber, note: c.note || note } : c)),
		};
		await repos.events.update(event.id, { ...event, service: kept });
		if (own) await logTicketComment(repos, me.id, own, `Left for later on the visit.${note ? `\n${note}` : ""}`);
		return ok({ ticket: own, report: kept });
	}
	const child = await createTicketFrom(
		repos,
		me,
		{
			parentId: ticket.id,
			typeId: str(body.typeId) || ticket.typeId,
			title: str(body.title).trim() || `${action.label} · follow-up of #${ticket.number}`,
			description: [action.description, note].filter(Boolean).join("\n\n"),
			priority: str(body.priority) || ticket.priority,
		},
		{ eventId: event.id, actionId: action.id, actionLabel: action.label },
	);
	const updated = {
		...report,
		checklist: report.checklist.map((c) => (c.id === action.id ? { ...c, ticketNumber: child.number, deferredTicket: child.number, note: c.note || note } : c)),
	};
	await repos.events.update(event.id, { ...event, service: updated });
	await logTicketComment(repos, me.id, ticket, `Left "${action.label}" for later → sub-ticket #${child.number}.${note ? `\n${note}` : ""}`);
	return ok({ ticket: child, report: updated });
}

/**
 * Adds an action to a task linked to a ticket: it is created as a sub-ticket
 * of that ticket, so it shows on the ticket screen too.
 */
export async function addAction(req: ApiRequest, repos: Repos, params: { id: string }) {
	const { me, event } = await loadJob(req, repos, params.id);
	if (event.service?.status === "completed") conflict("This task is already completed.");
	const ticket = await linkedTicket(repos, event);
	if (!ticket) badRequest("This task isn't linked to a ticket.");
	const body = objectBody(req);
	const label = str(body.label).trim().slice(0, 200);
	if (!label) badRequest("Give the action a name.", { label: "Give the action a name." });
	const report = sanitizeReport(event.service ?? null, event.type);
	if (report.checklist.some((c) => c.label.trim().toLowerCase() === label.toLowerCase())) conflict(`"${label}" is already on the list.`);
	const item = newChecklistItem(label, str(body.description).trim().slice(0, 500));
	const child = await createTicketFrom(
		repos,
		me,
		{ parentId: ticket.id, title: label, description: item.description, priority: ticket.priority },
		{ eventId: event.id, actionId: item.id, actionLabel: label },
	);
	const updated = { ...report, checklist: [...report.checklist, { ...item, ticketNumber: child.number }] };
	await repos.events.update(event.id, { ...event, service: updated });
	return ok({ ticket: child, report: updated });
}

/**
 * "Forward to engineering": sends the action's question (and photos) to
 * engineering about its sub-ticket, or takes it back before it's answered.
 */
export async function engineeringAction(req: ApiRequest, repos: Repos, params: { id: string; actionId: string }) {
	const { me, event } = await loadJob(req, repos, params.id);
	if (event.service?.status === "completed") conflict("This task is already completed.");
	const report = sanitizeReport(event.service ?? null, event.type);
	const action = report.checklist.find((c) => c.id === params.actionId);
	if (!action) notFound("Action");
	const ticket = action.ticketNumber ? (await repos.tickets.list()).find((t) => t.number === action.ticketNumber) : undefined;
	if (!ticket) badRequest("This action has no sub-ticket to ask about.");
	const body = objectBody(req);
	if (body.withdraw === true) {
		await withdrawEngineering(repos, me, ticket);
		const updated = { ...report, checklist: report.checklist.map((c) => (c.id === action.id ? { ...c, engineering: false } : c)) };
		await repos.events.update(event.id, { ...event, service: updated });
		return ok({ report: updated, engineering: null });
	}
	const question = str(body.question).trim().slice(0, 2000);
	if (!question) badRequest("Write the question for engineering.", { question: "Write the question for engineering." });
	const photos = sanitizePhotos(body.photos, MAX_TOTAL_PHOTOS, `eng${Date.now().toString(36)}`);
	// Engineering analyzes the images: at least one goes with the question (new or already on the action).
	const evidence = [...action.photos, ...photos];
	if (!evidence.length) badRequest("Add at least one photo for engineering to analyze.", { photos: "Add at least one photo." });
	const updated = {
		...report,
		checklist: report.checklist.map((c) => (c.id === action.id ? { ...c, engineering: true, note: question, photos: [...c.photos, ...photos].slice(0, 6) } : c)),
	};
	if (totalPhotos(updated) > MAX_TOTAL_PHOTOS) badRequest(`Up to ${MAX_TOTAL_PHOTOS} photos per task.`);
	const q = await askEngineering(repos, me, ticket, question, { eventId: event.id, actionLabel: action.label }, evidence);
	await repos.events.update(event.id, { ...event, service: updated });
	return ok({ report: updated, engineering: q });
}
