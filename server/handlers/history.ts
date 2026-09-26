import { serviceMinutes } from "../../shared/service.js";
import { canSeeAllSchedules } from "../../shared/users.js";
import { isClosedCategory, statusOf, type Ticket, type Workflow } from "../../shared/tickets.js";
import { badRequest, notFound, ok, type ApiRequest } from "../lib/http.js";
import { currentUser } from "../lib/session.js";
import type { Repos } from "../repos/types.js";
import { visibleTickets } from "./tickets.js";

/**
 * Everything that happened with one person, a team member or a customer, as
 * one timeline: tickets, what was done on them, visits, leads and contacts.
 * Only what the viewer may already see is included.
 *
 *   GET /api/history?user=<id>                 a team member
 *   GET /api/history?email=<e>&name=<n>        a customer (email first, else name)
 */

export type HistoryKind = "ticket" | "status" | "comment" | "forward" | "change" | "file" | "visit" | "lead" | "contact";

export interface HistoryItem {
	id: string;
	at: string;
	kind: HistoryKind;
	/** Who did it. */
	actorId: string | null;
	title: string;
	/** What was done, in a few words ("Moved Open → In progress"). */
	summary: string;
	detail?: string;
	/** The ticket's current status (for tickets and actions on them). */
	status?: string;
	ticketNumber?: number;
	ticketTypeId?: string;
	/** For tickets: still open. */
	open?: boolean;
	eventId?: string;
	contactId?: string;
}

const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b) && a!.trim().toLowerCase() === b!.trim().toLowerCase();

export async function personHistory(req: ApiRequest, repos: Repos) {
	const me = await currentUser(req, repos);
	const userId = req.query.user ?? "";
	const email = (req.query.email ?? "").trim();
	const name = (req.query.name ?? "").trim();
	if (!userId && !email && !name) badRequest("Say whose history you want.");

	const member = userId ? await repos.users.get(userId) : null;
	if (userId && !member) notFound("Team member");

	const [tickets, activity, events, contacts, workflows, types] = await Promise.all([
		visibleTickets(repos, me),
		repos.ticketActivity.list(),
		repos.events.list(),
		repos.contacts.list(),
		repos.workflows.list(),
		repos.ticketTypes.list(),
	]);
	const wfOf = (typeId: string): Workflow | undefined => workflows.find((w) => w.id === types.find((t) => t.id === typeId)?.workflowId);
	const isOpen = (t: Ticket) => {
		const st = statusOf(wfOf(t.typeId), t.statusId);
		return st ? !isClosedCategory(st.category) : true;
	};
	const byId = new Map(tickets.map((t) => [t.id, t]));
	const statusName = (t: Ticket) => statusOf(wfOf(t.typeId), t.statusId)?.name ?? "";
	/**
	 * Sub-tickets are part of their parent's story: they're shown under the
	 * main ticket ("on sub-ticket #1035 …") instead of as occurrences of their own.
	 */
	const anchor = (t: Ticket) => {
		const parent = t.parentId ? byId.get(t.parentId) : undefined;
		const main = parent ?? t;
		return { main, ref: `#${main.number} ${main.title}`, on: parent ? `on sub-ticket #${t.number} “${t.title}”` : "" };
	};
	const withOn = (summary: string, on: string) => (on ? `${summary} ${on}` : summary);
	const short = (s: string | undefined, n = 140) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);
	const visibleEvents = events.filter((e) => canSeeAllSchedules(me.role) || e.ownerId === me.id);
	const visibleContacts = contacts.filter((c) => me.role === "admin" || c.ownerId === me.id);

	// Whose tickets: a member's (assigned or opened), or a customer's (the requester).
	const theirTickets = member
		? tickets.filter((t) => t.assigneeId === member.id || t.reporterId === member.id)
		: tickets.filter((t) => (email ? same(t.requester.email, email) : same(t.requester.name, name) || same(t.clientName, name)));
	// Theirs includes the sub-tickets of their tickets (for what was done), but those aren't separate occurrences.
	const mainIds = new Set(theirTickets.filter((t) => !t.parentId || !byId.has(t.parentId)).map((t) => t.id));
	const theirTicketIds = new Set(theirTickets.map((t) => t.id));
	const items: HistoryItem[] = [];

	for (const t of theirTickets) {
		const a = anchor(t);
		// A customer's sub-tickets are just steps of their ticket (their actions still show).
		if (!member && !mainIds.has(t.id)) continue;
		items.push({
			id: `t-${t.id}`,
			at: t.createdAt,
			kind: "ticket",
			actorId: t.reporterId,
			title: a.ref,
			summary: a.on
				? member
					? withOn(t.reporterId === member.id ? "Added a sub-ticket:" : "Got a sub-ticket:", `#${t.number} “${t.title}”`)
					: `Sub-ticket #${t.number} “${t.title}”`
				: member
					? t.reporterId === member.id
						? "Opened the ticket"
						: "Got the ticket"
					: "Asked for it (requester)",
			detail: a.on ? undefined : t.property || undefined,
			status: statusName(a.main),
			ticketNumber: a.main.number,
			ticketTypeId: a.main.typeId,
			open: isOpen(a.main),
		});
	}

	// What was done: by the member on any ticket they can see, or on the customer's tickets by anyone.
	for (const a of activity) {
		const t = byId.get(a.ticketId);
		if (!t || a.kind === "created") continue;
		if (member ? a.userId !== member.id : !theirTicketIds.has(t.id)) continue;
		const wf = wfOf(t.typeId);
		const at = anchor(t);
		const base = { id: `a-${a.id}`, at: a.at, actorId: a.userId, ticketNumber: at.main.number, ticketTypeId: at.main.typeId, open: isOpen(at.main), status: statusName(at.main) };
		const ref = at.ref;
		const on = at.on;
		if (a.kind === "status") {
			const move = `${statusOf(wf, a.fromStatusId ?? "")?.name ?? "?"} → ${statusOf(wf, a.toStatusId ?? "")?.name ?? "?"}`;
			items.push({ ...base, kind: "status", title: ref, summary: withOn(`${a.transitionLabel ?? "Moved"}: ${move}`, on), detail: short(a.comment) });
		} else if (a.kind === "comment") {
			items.push({ ...base, kind: "comment", title: ref, summary: withOn("Posted an update", on), detail: short(a.comment) });
		} else if (a.kind === "assigned") {
			const to = a.assigneeId ? (await repos.users.get(a.assigneeId))?.name : null;
			items.push({ ...base, kind: "forward", title: ref, summary: withOn(to ? `Forwarded it to ${to}` : "Unassigned it", on), detail: short(a.comment) });
		} else if (a.kind === "attachment") {
			items.push({ ...base, kind: "file", title: ref, summary: withOn(a.comment?.startsWith("Removed") ? "Removed a file" : "Attached a file", on), detail: a.comment?.replace(/^(Attached|Removed) /, "") });
		} else {
			const lines = a.comment?.split("\n").filter(Boolean) ?? [];
			items.push({
				...base,
				kind: "change",
				title: ref,
				summary: withOn(lines.length === 1 && lines[0].startsWith("Added sub-ticket") ? lines[0] : lines.length ? `Changed ${lines.length === 1 ? lines[0] : `${lines.length} things`}` : "Changed the details", on),
				detail: lines.length > 1 ? lines.join(" · ") : undefined,
			});
		}
	}

	// Visits: the member's own, or the customer's (by client or by one of their tickets).
	const theirNumbers = new Set(theirTickets.map((t) => String(t.number)));
	for (const e of visibleEvents) {
		const mine = member ? e.ownerId === member.id : same(e.client?.name, name) || theirNumbers.has(e.ticketNumber);
		if (!mine) continue;
		const done = e.completed || e.service?.status === "completed";
		const r = e.service;
		const list = r?.checklist ?? [];
		const mins = r ? serviceMinutes(r) : 0;
		// What the visit came to: the technician's answers, time on site, sign-off.
		const summary = done
			? [
					"Completed the visit",
					list.length ? `${list.filter((c) => c.result === "ok").length} approved` : "",
					list.some((c) => c.result === "issue") ? `${list.filter((c) => c.result === "issue").length} rejected` : "",
					list.some((c) => c.deferredTicket) ? `${list.filter((c) => c.deferredTicket).length} left for later` : "",
					mins ? `${Math.floor(mins / 60)}h ${mins % 60}m on site` : "",
					r?.signature ? `signed by ${r.signature.name}` : "",
				]
					.filter(Boolean)
					.join(" · ")
			: new Date(e.start).getTime() < Date.now()
				? r?.checkInAt
					? "Visit started, not finished"
					: "Visit not done"
				: "Visit booked";
		items.push({
			id: `e-${e.id}`,
			at: e.start,
			kind: "visit",
			actorId: e.ownerId,
			title: e.title,
			summary,
			detail: short([r?.workPerformed || r?.findings, /^\d+$/.test(e.ticketNumber) ? `Ticket #${e.ticketNumber}` : ""].filter(Boolean).join(" · ")),
			ticketNumber: /^\d+$/.test(e.ticketNumber) ? Number(e.ticketNumber) : undefined,
			eventId: e.id,
			open: !done,
		});
	}

	// Leads: the member's portfolio and their contacts with leads, or the customer as a lead.
	for (const c of visibleContacts) {
		const isThem = member ? c.ownerId === member.id || c.createdBy === member.id : email ? same(c.email, email) : same(c.name, name);
		if (isThem)
			items.push({
				id: `c-${c.id}`,
				at: c.createdAt,
				kind: "lead",
				actorId: c.createdBy,
				title: `Lead ${c.name}`,
				summary: member ? (c.createdBy === member.id ? "Added the lead" : "Has the lead in their portfolio") : "Became a lead",
				detail: [c.company, c.source].filter(Boolean).join(" · ") || undefined,
				contactId: c.id,
			});
		for (const i of c.interactions) {
			const counts = member ? i.userId === member.id : isThem;
			if (!counts) continue;
			const what = i.kind === "transfer" ? "Moved the lead to another portfolio" : i.kind === "note" ? "Added a note" : `Logged a ${i.kind}`;
			items.push({ id: `i-${i.id}`, at: i.at, kind: "contact", actorId: i.userId, title: `Lead ${c.name}`, summary: what, detail: short(i.note) || undefined, contactId: c.id });
		}
	}

	items.sort((a, b) => b.at.localeCompare(a.at));

	// Who this is, with what the viewer may know about them.
	const lead = !member ? visibleContacts.find((c) => (email ? same(c.email, email) : same(c.name, name))) : undefined;
	const sample = !member ? theirTickets[0] : undefined;
	const person = member
		? { kind: "member" as const, name: member.name, email: member.email, phone: member.phone, role: member.role, jobTitle: member.jobTitle, active: member.active }
		: {
				kind: "customer" as const,
				name: name || lead?.name || sample?.requester.name || email,
				email: email || lead?.email || sample?.requester.email || "",
				phone: lead?.phone || sample?.requester.phone || "",
				company: lead?.company || sample?.clientName || "",
			};
	return ok({ person, items });
}
