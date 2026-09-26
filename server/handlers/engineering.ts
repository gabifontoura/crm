import type { ServicePhoto } from "../../shared/service.js";
import { availableTransitions, type EngineeringQuestion, MAX_ATTACHMENTS, type Ticket, type TicketAttachment, type Workflow } from "../../shared/tickets.js";
import type { User } from "../../shared/users.js";
import { badRequest, conflict, forbidden, notFound, objectBody, ok, str, type ApiRequest } from "../lib/http.js";
import { currentUser } from "../lib/session.js";
import type { Repos } from "../repos/types.js";
import { prepareTransition } from "./tickets.js";

/**
 * Technical questions the field sends to engineering about a sub-ticket.
 * Engineers see those sub-tickets in Tickets and answer on the sub-ticket's
 * own page; the technician then does the work. All of it is on its history.
 */

const newId = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const isEngineering = (me: User) => me.role === "engineer" || me.role === "admin";

async function note(repos: Repos, ticket: Ticket, userId: string, comment: string) {
	const at = new Date().toISOString();
	await repos.ticketActivity.insert({ id: newId("act"), ticketId: ticket.id, at, userId, kind: "comment", comment });
	return at;
}

/**
 * Sends (or re-sends) a question to engineering about a ticket. Its photos
 * become the ticket's attachments, so engineering analyzes them on the
 * ticket's own page (and they stay in its history).
 */
export async function askEngineering(
	repos: Repos,
	me: User,
	ticket: Ticket,
	question: string,
	from: { eventId?: string; actionLabel?: string },
	photos: ServicePhoto[],
	/** move: false when the caller is already taking the ticket to the engineering status. */
	opts: { move?: boolean } = {},
) {
	const now = new Date().toISOString();
	const current = ticket.attachments ?? [];
	const known = new Set(current.map((a) => a.dataUrl));
	const added: TicketAttachment[] = photos
		.filter((p) => !known.has(p.dataUrl))
		.slice(0, Math.max(0, MAX_ATTACHMENTS - current.length))
		.map((p, i) => ({
			id: newId(`att${i}`),
			name: p.caption || p.name || `${from.actionLabel ?? "photo"} ${i + 1}.jpg`,
			type: /^data:([^;]+);/.exec(p.dataUrl)?.[1] ?? "image/jpeg",
			size: Math.round((p.dataUrl.length * 3) / 4),
			dataUrl: p.dataUrl,
			uploadedBy: me.id,
			uploadedAt: now,
		}));
	const sameAgain = photos.filter((p) => known.has(p.dataUrl)).map((p) => current.find((a) => a.dataUrl === p.dataUrl)!.id);
	const q: EngineeringQuestion = {
		attachmentIds: [...sameAgain, ...added.map((a) => a.id)],
		status: "open",
		question,
		askedBy: me.id,
		askedAt: new Date().toISOString(),
		eventId: from.eventId ?? null,
		actionLabel: from.actionLabel ?? null,
		answer: null,
		answeredBy: null,
		answeredAt: null,
	};
	const at = await note(repos, ticket, me.id, `Sent to engineering: ${question}`);
	await repos.tickets.update(ticket.id, { ...ticket, attachments: [...current, ...added], engineering: q, updatedAt: at });
	if (opts.move !== false) await toEngineering(repos, me, { ...ticket, attachments: [...current, ...added], engineering: q, updatedAt: at });
	return q;
}

async function workflowOf(repos: Repos, ticket: Ticket): Promise<Workflow | null> {
	const type = await repos.ticketTypes.get(ticket.typeId);
	return type ? await repos.workflows.get(type.workflowId) : null;
}

/**
 * A question asked elsewhere (the technician's task) takes the ticket to its
 * workflow's "With engineering" status, through the step that leads there.
 */
async function toEngineering(repos: Repos, me: User, ticket: Ticket) {
	const wf = await workflowOf(repos, ticket);
	const target = wf?.statuses.find((s) => s.engineering);
	if (!wf || !target || ticket.statusId === target.id) return;
	const step = wf.transitions.find((t) => (t.from === ticket.statusId || t.from === "*") && t.to === target.id);
	if (!step) return;
	const at = new Date().toISOString();
	await repos.tickets.update(ticket.id, { ...ticket, statusId: target.id, updatedAt: at });
	await repos.ticketActivity.insert({ id: newId("act"), ticketId: ticket.id, at, userId: me.id, kind: "status", fromStatusId: ticket.statusId, toStatusId: target.id, transitionLabel: step.label });
}

/** Takes a question back before engineering answers it. */
export async function withdrawEngineering(repos: Repos, me: User, ticket: Ticket) {
	if (!ticket.engineering || ticket.engineering.status !== "open") return;
	const at = await note(repos, ticket, me.id, "Question to engineering withdrawn.");
	// Back to where it was before it went to engineering.
	const wf = await workflowOf(repos, ticket);
	const here = wf?.statuses.find((s) => s.id === ticket.statusId);
	let statusId = ticket.statusId;
	if (here?.engineering) {
		const came = (await repos.ticketActivity.list())
			.filter((a) => a.ticketId === ticket.id && a.kind === "status" && a.toStatusId === here.id)
			.sort((a, b) => b.at.localeCompare(a.at))[0];
		if (came?.fromStatusId) {
			statusId = came.fromStatusId;
			await repos.ticketActivity.insert({ id: newId("act"), ticketId: ticket.id, at, userId: me.id, kind: "status", fromStatusId: here.id, toStatusId: statusId, transitionLabel: "Question withdrawn" });
		}
	}
	await repos.tickets.update(ticket.id, { ...ticket, engineering: null, statusId, updatedAt: at });
}

export async function answerQuestion(req: ApiRequest, repos: Repos, params: { id: string }) {
	const me = await currentUser(req, repos);
	if (!isEngineering(me)) forbidden("Only engineering answers technical questions.");
	const ticket = await repos.tickets.get(params.id);
	if (!ticket?.engineering) notFound("Question");
	if (ticket.engineering.status === "answered") conflict("This question was already answered.");
	const body = objectBody(req);
	const answer = str(body.answer).trim().slice(0, 4000);
	if (!answer) badRequest("Write the answer for the technician.", { answer: "Write the answer for the technician." });
	const at = new Date().toISOString();
	const engineering: EngineeringQuestion = { ...ticket.engineering, status: "answered", answer, answeredBy: me.id, answeredAt: at };
	const answered: Ticket = { ...ticket, engineering, updatedAt: at };

	// Waiting on engineering in its workflow: the answer is the step out (e.g. "Repair as advised").
	const wf = await workflowOf(repos, ticket);
	if (wf?.statuses.find((s) => s.id === ticket.statusId)?.engineering) {
		const steps = availableTransitions(wf, ticket.statusId, me.role);
		const step = steps.find((t) => t.id === str(body.transitionId)) ?? steps[0];
		if (step) {
			const commit = await prepareTransition(repos, me, answered, { transitionId: step.id, comment: `Engineering answered: ${answer}` });
			await repos.tickets.update(ticket.id, answered);
			await commit();
			return ok(engineering);
		}
	}
	await note(repos, ticket, me.id, `Engineering answered: ${answer}`);
	await repos.tickets.update(ticket.id, answered);
	return ok(engineering);
}
