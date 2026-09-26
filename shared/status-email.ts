/**
 * Emails sent when a ticket arrives at a status (Settings › Workflows): who
 * gets them — people on the customer's side or on the team — and what they
 * say, with {variables} filled from the ticket.
 */

export type RecipientKind =
	/** The person who asked (the ticket's requester). */
	| "requester"
	/** The client company's contact (e.g. the HOA manager). */
	| "client"
	/** Whoever is working on the ticket. */
	| "assignee"
	/** Whoever opened it. */
	| "reporter"
	/** Everyone with an access (Administrator, Engineer, a custom profile…); `value` is its id. */
	| "access"
	/** One team member; `value` is the user id. */
	| "user"
	/** Any address; `value` is the email. */
	| "email";

export interface EmailRecipient {
	kind: RecipientKind;
	value?: string;
}

export interface StatusEmail {
	enabled: boolean;
	to: EmailRecipient[];
	subject: string;
	body: string;
}

/** The {variables} a status email can use, with a sample for the preview. */
export const EMAIL_VARIABLES: { id: string; label: string; sample: string }[] = [
	{ id: "number", label: "Ticket number", sample: "1042" },
	{ id: "title", label: "Title", sample: "Front door lock sticks" },
	{ id: "status", label: "New status", sample: "Visit scheduled" },
	{ id: "previous", label: "Previous status", sample: "Triage" },
	{ id: "type", label: "Ticket type", sample: "Warranty claim" },
	{ id: "requester", label: "Requester's name", sample: "Megan Scott" },
	{ id: "client", label: "Client", sample: "Aurora Residences HOA" },
	{ id: "assignee", label: "Assignee", sample: "Jack Thompson" },
	{ id: "location", label: "Location", sample: "Aurora Residences · Block A · Unit 203" },
	{ id: "comment", label: "Step comment", sample: "Technician booked for Tuesday morning." },
	{ id: "by", label: "Who moved it", sample: "Emily Carter" },
	{ id: "link", label: "Link to the ticket", sample: "https://crm.example.com/tickets/1042" },
];

export const SAMPLE_VARIABLES: Record<string, string> = Object.fromEntries(EMAIL_VARIABLES.map((v) => [v.id, v.sample]));

export function renderEmail(template: string, vars: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

/** A new email for a status: to the requester, telling them where it stands. */
export function defaultStatusEmail(statusName: string): StatusEmail {
	return {
		enabled: true,
		to: [{ kind: "requester" }],
		subject: `Ticket #{number} is now ${statusName}`,
		body: "Hi {requester},\n\nYour request \"{title}\" (#{number}) moved from {previous} to {status}.\n{comment}\n\nYou can follow it here: {link}\n\nBest regards,\nThe service team",
	};
}

const KINDS: RecipientKind[] = ["requester", "client", "assignee", "reporter", "access", "user", "email"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reads a stored or submitted status email, dropping what isn't valid. */
export function statusEmailFrom(raw: unknown): StatusEmail | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const r = raw as Record<string, unknown>;
	const to: EmailRecipient[] = [];
	const seen = new Set<string>();
	for (const x of Array.isArray(r.to) ? r.to : []) {
		if (!x || typeof x !== "object") continue;
		const kind = String((x as Record<string, unknown>).kind) as RecipientKind;
		const value = String((x as Record<string, unknown>).value ?? "").trim();
		if (!KINDS.includes(kind)) continue;
		if (["access", "user", "email"].includes(kind) && !value) continue;
		if (kind === "email" && !EMAIL_RE.test(value)) continue;
		const key = `${kind}:${value.toLowerCase()}`;
		if (seen.has(key)) continue;
		seen.add(key);
		to.push(value ? { kind, value } : { kind });
	}
	return {
		enabled: Boolean(r.enabled),
		to,
		subject: String(r.subject ?? "").slice(0, 200),
		body: String(r.body ?? "").slice(0, 5000),
	};
}

/** Problems that keep a status email from being saved (shown in the editor). */
export function statusEmailProblems(e: StatusEmail | undefined, statusName: string): string[] {
	if (!e?.enabled) return [];
	const out: string[] = [];
	if (!e.to.length) out.push(`The email on "${statusName}" needs at least one recipient.`);
	if (!e.subject.trim()) out.push(`The email on "${statusName}" needs a subject.`);
	if (!e.body.trim()) out.push(`The email on "${statusName}" needs a message.`);
	return out;
}
