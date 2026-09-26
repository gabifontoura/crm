import { menuAccessFrom, profileOf } from "../../shared/access.js";
import { renderEmail, type StatusEmail } from "../../shared/status-email.js";
import type { SentEmail, Ticket, TicketStatus, TicketType } from "../../shared/tickets.js";
import type { User } from "../../shared/users.js";
import type { Repos } from "../repos/types.js";
import { sendEmail } from "./mailer.js";

/** Who a status email goes to, resolved to names and addresses (no duplicates, active people only). */
export async function resolveRecipients(repos: Repos, email: StatusEmail, ticket: Ticket): Promise<{ name: string; email: string }[]> {
	const users = (await repos.users.list()).filter((u) => u.active);
	const access = menuAccessFrom(await repos.settings.get("settings.menuAccess"));
	const out = new Map<string, { name: string; email: string }>();
	const add = (name: string, address: string | undefined | null) => {
		const e = (address ?? "").trim();
		if (e && !out.has(e.toLowerCase())) out.set(e.toLowerCase(), { name: name.trim(), email: e });
	};
	const person = (u: User | undefined) => u && add(u.name, u.email);
	for (const r of email.to) {
		switch (r.kind) {
			case "requester":
				add(ticket.requester.name, ticket.requester.email);
				break;
			case "client": {
				const client = ticket.clientId ? await repos.clients.get(ticket.clientId) : null;
				if (client) add(client.contactName || client.name, client.email);
				break;
			}
			case "assignee":
				person(users.find((u) => u.id === ticket.assigneeId));
				break;
			case "reporter":
				person(users.find((u) => u.id === ticket.reporterId));
				break;
			case "access":
				for (const u of users) if (r.value === "admin" ? u.role === "admin" : profileOf(u, access)?.id === r.value) person(u);
				break;
			case "user":
				person(users.find((u) => u.id === r.value));
				break;
			case "email":
				add("", r.value);
				break;
		}
	}
	return [...out.values()];
}

/**
 * The ticket just arrived at `target`: send the status's email, if it has one,
 * and put it on the ticket's history (who got it, what it said).
 */
export async function sendStatusEmail(
	repos: Repos,
	opts: { me: User; ticket: Ticket; type: TicketType; from?: TicketStatus; target: TicketStatus; comment?: string },
): Promise<SentEmail | null> {
	const email = opts.target.email;
	if (!email?.enabled) return null;
	const { ticket } = opts;
	const to = await resolveRecipients(repos, email, ticket);
	const users = await repos.users.list();
	const client = ticket.clientId ? await repos.clients.get(ticket.clientId) : null;
	const vars: Record<string, string> = {
		number: String(ticket.number),
		title: ticket.title,
		status: opts.target.name,
		previous: opts.from?.name ?? "",
		type: opts.type.name,
		requester: ticket.requester.name || "there",
		client: client?.name ?? ticket.clientName ?? "",
		assignee: users.find((u) => u.id === ticket.assigneeId)?.name ?? "Unassigned",
		location: [ticket.property, ticket.location].filter(Boolean).join(" · "),
		comment: opts.comment ?? "",
		by: opts.me.name,
		link: `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/tickets/${ticket.number}`,
	};
	const subject = renderEmail(email.subject, vars).trim();
	// Empty lines left by an empty {comment} are dropped.
	const body = renderEmail(email.body, vars).replace(/\n{3,}/g, "\n\n").trim();
	if (!to.length) return { to: [], subject, body, delivery: "failed", error: "No one to send it to (no address on the chosen recipients)." };
	const result = await sendEmail({ to, subject, text: body });
	return { to, subject, body, ...result };
}
