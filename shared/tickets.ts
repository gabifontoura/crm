import { SOLID_COLORS } from "./palette.js";
import type { UserRole } from "./users.js";
import type { StatusEmail } from "./status-email.js";

/**
 * Tickets with admin-defined workflows. Shared by frontend and backend;
 * imports use ".js" so the file also runs as plain Node ESM on Vercel.
 *
 * - A Workflow owns its statuses and the transitions allowed between them.
 * - A TicketType (Warranty claim, Sales inquiry...) uses one workflow.
 * - A Ticket moves through its type's workflow; every move is logged.
 */

/** Groups custom statuses for filters, boards and metrics. */
export type StatusCategory = "todo" | "in_progress" | "waiting" | "done" | "cancelled";

export interface TicketStatus {
	id: string;
	name: string;
	color: string;
	category: StatusCategory;
	/**
	 * A ticket only gets here with a visit on the calendar: moving to this
	 * status books one (date, time, place and client) unless one is booked.
	 */
	needsVisit?: boolean;
	/**
	 * Waiting on engineering: the ticket gets here with a question to
	 * engineering (and photos), and leaves when engineering answers.
	 */
	engineering?: boolean;
	/** An email sent when a ticket gets here (to the customer, the team or both). */
	email?: StatusEmail;
}

/** Moves a ticket from one status to another. `from: "*"` means from any status. */
export interface Transition {
	id: string;
	from: string;
	to: string;
	/** Button label, e.g. "Start repair". */
	label: string;
	/** Roles that may use it. Non-admins must also be the assignee. */
	roles: UserRole[];
	requireComment: boolean;
	/** Custom fields (ids) that must be filled before this transition can be used. */
	requiredFields: string[];
	/**
	 * Field work: taken on the Tasks screen when the visit is finished (with the
	 * report, photos and the customer's signature), not from the ticket page.
	 */
	onTasksScreen?: boolean;
}

export interface Workflow {
	id: string;
	name: string;
	description: string;
	initialStatusId: string;
	statuses: TicketStatus[];
	transitions: Transition[];
	updatedAt: string;
}

export type Priority = "low" | "medium" | "high" | "urgent";

export type FieldKind = "text" | "textarea" | "number" | "currency" | "date" | "select" | "checkbox";

/** A custom field filled while handling a ticket of a given type. */
export interface FieldDef {
	id: string;
	label: string;
	kind: FieldKind;
	/** Choices for "select". */
	options: string[];
	/** Must be filled when the ticket is opened. */
	required: boolean;
	helpText: string;
	/**
	 * Only shown (and only required) while another field has one of these
	 * values, e.g. "Supplier" only when "Cause" is "Supplier defect". The
	 * controlling field must be a dropdown or a checkbox ("true"/"false").
	 */
	showWhen?: FieldCondition | null;
}

export interface FieldCondition {
	fieldId: string;
	equals: string[];
}

export type FieldValue = string | number | boolean | null;

export interface TicketType {
	id: string;
	name: string;
	description: string;
	color: string;
	workflowId: string;
	defaultPriority: Priority;
	/** Hours until the ticket is due; null for no SLA. */
	slaHours: number | null;
	active: boolean;
	/** Extra fields for this type, in display order. */
	fields: FieldDef[];
}

export interface Ticket {
	id: string;
	/** Human number shown as #1042. */
	number: number;
	title: string;
	description: string;
	typeId: string;
	statusId: string;
	priority: Priority;
	assigneeId: string | null;
	reporterId: string;
	requester: { name: string; email: string; phone: string };
	clientId: string;
	clientName: string;
	developmentId: string | null;
	blockId: string | null;
	unitId: string | null;
	/** Development name and "Block · Unit", resolved when saved. */
	property: string;
	location: string;
	dueAt: string | null;
	/** Values of the type's custom fields, by field id. */
	fields: Record<string, FieldValue>;
	/** Parent ticket id when this is a sub-ticket (a follow-up split from another ticket). */
	parentId?: string | null;
	/** The task action it came from, when a technician left an action for later. */
	origin?: { eventId: string; actionId: string; actionLabel: string } | null;
	createdAt: string;
	updatedAt: string;
	closedAt: string | null;
	/** Files added while handling the ticket (photos, PDFs...). */
	attachments?: TicketAttachment[];
	/** The question sent to engineering about it, if any. */
	engineering?: EngineeringQuestion | null;
}

/**
 * A technician's question to engineering about a sub-ticket ("Forward to
 * engineering"): engineering analyzes it and sends the answer back, and the
 * technician then does the work.
 */
export interface EngineeringQuestion {
	status: "open" | "answered";
	question: string;
	askedBy: string;
	askedAt: string;
	/** The visit and action it was asked from. */
	eventId?: string | null;
	actionLabel?: string | null;
	/** The photos sent with it, as attachments of the ticket (ids). */
	attachmentIds?: string[];
	answer?: string | null;
	answeredBy?: string | null;
	answeredAt?: string | null;
}

export interface TicketAttachment {
	id: string;
	name: string;
	/** MIME type, e.g. "image/jpeg" or "application/pdf". */
	type: string;
	/** Size of the original file in bytes. */
	size: number;
	/**
	 * File contents as a data URL. Empty in list responses (GET /api/tickets);
	 * the ticket detail returns it.
	 */
	dataUrl: string;
	uploadedBy: string;
	uploadedAt: string;
}

/** Per file; keeps an upload under Vercel's 4.5 MB request limit. */
export const MAX_ATTACHMENT_BYTES = 2_500_000;
export const MAX_ATTACHMENTS = 12;

export type ActivityKind = "created" | "status" | "comment" | "assigned" | "edited" | "fields" | "attachment" | "email";

export interface TicketActivity {
	id: string;
	ticketId: string;
	at: string;
	userId: string;
	kind: ActivityKind;
	fromStatusId?: string;
	toStatusId?: string;
	transitionLabel?: string;
	comment?: string;
	assigneeId?: string | null;
	/** kind "email": what went out on a status change, and whether it was delivered. */
	email?: SentEmail;
}

export interface SentEmail {
	to: { name: string; email: string }[];
	subject: string;
	body: string;
	/** "simulated": no email service is set up (it's only recorded here). */
	delivery: "sent" | "simulated" | "failed";
	error?: string;
}

/** Short view of a related ticket (parent or sub-ticket). */
export interface TicketSummary {
	id: string;
	number: number;
	title: string;
	typeId: string;
	statusId: string;
	priority: Priority;
	assigneeId: string | null;
	createdAt: string;
	closedAt: string | null;
	origin?: Ticket["origin"];
}

export function summarizeTicket(t: Ticket): TicketSummary {
	return {
		id: t.id,
		number: t.number,
		title: t.title,
		typeId: t.typeId,
		statusId: t.statusId,
		priority: t.priority,
		assigneeId: t.assigneeId,
		createdAt: t.createdAt,
		closedAt: t.closedAt,
		origin: t.origin ?? null,
	};
}

/** What `GET /api/ticket-config` returns. */
export interface TicketConfig {
	workflows: Workflow[];
	types: TicketType[];
}

/**
 * What a status means to the system, whatever the admin calls it. Statuses
 * are free; this only tells the CRM whether a ticket in it is closed, and
 * lets the "All types" board line up different workflows.
 */
export interface Stage {
	id: StatusCategory;
	/** Short name, e.g. a board column. */
	label: string;
	/** Picked for each status in the workflow editor. */
	meaning: string;
	hint: string;
}

export const STATUS_CATEGORIES: Stage[] = [
	{ id: "todo", label: "Not started", meaning: "Not started", hint: "Waiting for someone to pick it up" },
	{ id: "in_progress", label: "In progress", meaning: "Being worked on", hint: "Someone is working on it" },
	{ id: "waiting", label: "Waiting", meaning: "Waiting", hint: "On the client, a supplier or a visit" },
	{ id: "done", label: "Resolved", meaning: "Closes the ticket: resolved", hint: "Solved; the ticket is closed" },
	{ id: "cancelled", label: "Cancelled", meaning: "Closes the ticket: cancelled", hint: "Closed without a fix (rejected, lost, duplicate…)" },
];

export const PRIORITIES: { id: Priority; label: string; color: string }[] = [
	{ id: "low", label: "Low", color: "#94A3B8" },
	{ id: "medium", label: "Medium", color: "#2B6CB0" },
	{ id: "high", label: "High", color: "#EA580C" },
	{ id: "urgent", label: "Urgent", color: "#DC2626" },
];

/** Colors for statuses and ticket types: the solid shades of the shared tones (see palette.ts). */
export const STATUS_COLORS = SOLID_COLORS;

export const isClosedCategory = (c: StatusCategory) => c === "done" || c === "cancelled";

export function statusOf(workflow: Workflow | undefined, statusId: string): TicketStatus | undefined {
	return workflow?.statuses.find((s) => s.id === statusId);
}

/** Transitions the role can use from the ticket's current status. */
export function availableTransitions(workflow: Workflow, statusId: string, role: UserRole): Transition[] {
	return workflow.transitions.filter(
		(t) => (t.from === statusId || (t.from === "*" && t.to !== statusId)) && t.roles.includes(role),
	);
}

/**
 * Shortest chain of steps the role can take from one status to another
 * (e.g. Cancelled → "Reopen" → Open → "Start work" → In progress).
 * Empty when already there; null when no chain exists.
 */
/**
 * "Signed off by": filled only from the customer's signature, which the
 * technician collects on the Tasks screen. The back office can't type it.
 */
export const SIGNATURE_FIELD = "owner_signoff";

/** A copy of the workflow without its field steps (done on the Tasks screen), as the back office sees it. */
export function officeWorkflow(workflow: Workflow): Workflow {
	return { ...workflow, transitions: workflow.transitions.filter((t) => !t.onTasksScreen) };
}

export function pathTo(workflow: Workflow, fromStatusId: string, toStatusId: string, role: UserRole): Transition[] | null {
	if (fromStatusId === toStatusId) return [];
	// Breadth-first: each status remembers the step (and the status) it was reached from.
	const cameFrom = new Map<string, { step: Transition; at: string }>();
	const queue = [fromStatusId];
	const seen = new Set(queue);
	while (queue.length) {
		const at = queue.shift()!;
		for (const step of availableTransitions(workflow, at, role)) {
			if (seen.has(step.to)) continue;
			seen.add(step.to);
			cameFrom.set(step.to, { step, at });
			if (step.to === toStatusId) {
				const path: Transition[] = [];
				for (let cur = toStatusId; cur !== fromStatusId; ) {
					const link = cameFrom.get(cur)!;
					path.unshift(link.step);
					cur = link.at;
				}
				return path;
			}
			queue.push(step.to);
		}
	}
	return null;
}

export const FIELD_KINDS: { id: FieldKind; label: string }[] = [
	{ id: "text", label: "Short text" },
	{ id: "textarea", label: "Long text" },
	{ id: "number", label: "Number" },
	{ id: "currency", label: "Amount ($)" },
	{ id: "date", label: "Date" },
	{ id: "select", label: "Dropdown" },
	{ id: "checkbox", label: "Checkbox" },
];

export function isFilled(def: FieldDef, value: FieldValue | undefined): boolean {
	if (value === null || value === undefined) return false;
	if (def.kind === "checkbox") return value === true;
	if (typeof value === "string") return value.trim().length > 0;
	return typeof value === "number" && Number.isFinite(value);
}

/** Keeps only known fields and coerces each value to its kind. */
export function normalizeFieldValues(defs: FieldDef[], raw: Record<string, unknown> | undefined): Record<string, FieldValue> {
	const out: Record<string, FieldValue> = {};
	for (const d of defs) {
		const v = raw?.[d.id];
		if (v === undefined || v === null || v === "") {
			out[d.id] = d.kind === "checkbox" ? false : null;
		} else if (d.kind === "number" || d.kind === "currency") {
			const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
			out[d.id] = Number.isFinite(n) ? n : null;
		} else if (d.kind === "checkbox") {
			out[d.id] = v === true || v === "true";
		} else {
			out[d.id] = String(v);
		}
	}
	return out;
}

/** Value of a controlling field as compared by `showWhen` ("true"/"false" for checkboxes). */
function conditionValue(def: FieldDef | undefined, value: FieldValue | undefined): string {
	if (def?.kind === "checkbox") return value === true ? "true" : "false";
	return value === null || value === undefined ? "" : String(value);
}

/**
 * Whether a field applies given the current values: its `showWhen` condition
 * holds and the controlling field is itself visible (conditions can chain).
 */
export function isFieldVisible(def: FieldDef, defs: FieldDef[], values: Record<string, FieldValue | undefined>, seen: Set<string> = new Set()): boolean {
	const cond = def.showWhen;
	if (!cond || !cond.fieldId) return true;
	if (seen.has(def.id)) return false; // circular conditions never show
	const parent = defs.find((f) => f.id === cond.fieldId);
	if (!parent) return true; // controlling field was deleted: show it
	if (!cond.equals.includes(conditionValue(parent, values[parent.id]))) return false;
	return isFieldVisible(parent, defs, values, new Set([...seen, def.id]));
}

export function visibleFields(defs: FieldDef[], values: Record<string, FieldValue | undefined>): FieldDef[] {
	return defs.filter((d) => isFieldVisible(d, defs, values));
}

/**
 * Problems with the field values: wrong types, unknown options, and missing
 * values among `mustFill` (field ids). Hidden fields (see `showWhen`) are
 * never required. Returns field id -> message.
 */
export function fieldErrors(defs: FieldDef[], values: Record<string, FieldValue>, mustFill: string[]): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const d of defs) {
		const v = values[d.id];
		if (mustFill.includes(d.id) && !isFilled(d, v) && isFieldVisible(d, defs, values)) {
			errors[d.id] = d.kind === "checkbox" ? `"${d.label}" must be checked.` : `"${d.label}" is required.`;
			continue;
		}
		if (v === null || v === undefined || v === "") continue;
		if (d.kind === "select" && d.options.length > 0 && !d.options.includes(String(v))) errors[d.id] = `Pick one of the options for "${d.label}".`;
		if (d.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) errors[d.id] = `"${d.label}" must be a date.`;
		if ((d.kind === "number" || d.kind === "currency") && typeof v !== "number") errors[d.id] = `"${d.label}" must be a number.`;
	}
	return errors;
}

/** Field ids a transition needs, limited to the fields this ticket type has. */
export function requiredForTransition(tr: Transition, type: TicketType): string[] {
	return tr.requiredFields.filter((id) => type.fields.some((f) => f.id === id));
}

export function validateTicketType(tt: Pick<TicketType, "name" | "workflowId" | "fields">, workflows: Workflow[]): string[] {
	const problems: string[] = [];
	if (!tt.name.trim()) problems.push("Give the ticket type a name.");
	if (!workflows.some((w) => w.id === tt.workflowId)) problems.push("Pick a workflow.");
	const labels = new Set<string>();
	for (const f of tt.fields) {
		if (!f.label.trim()) problems.push("Every field needs a label.");
		const key = f.label.trim().toLowerCase();
		if (labels.has(key)) problems.push(`Two fields are called "${f.label}".`);
		labels.add(key);
		if (f.kind === "select" && f.options.filter((o) => o.trim()).length < 2) problems.push(`"${f.label}" needs at least two options.`);
		if (f.showWhen?.fieldId) {
			const parent = tt.fields.find((p) => p.id === f.showWhen!.fieldId);
			if (!parent || parent.id === f.id) problems.push(`"${f.label}" depends on a field that doesn't exist.`);
			else if (parent.kind !== "select" && parent.kind !== "checkbox") problems.push(`"${f.label}" can only depend on a dropdown or a checkbox.`);
			else if (f.showWhen.equals.length === 0) problems.push(`Pick when "${f.label}" is shown.`);
			else if (parent.kind === "select" && f.showWhen.equals.some((v) => !parent.options.map((o) => o.trim()).includes(v))) {
				problems.push(`"${f.label}" depends on an option "${parent.label}" no longer has.`);
			}
		}
	}
	// Circular conditions (A shows when B, B shows when A) would hide both forever.
	for (const f of tt.fields) {
		const seen = new Set<string>();
		let cur: FieldDef | undefined = f;
		while (cur?.showWhen?.fieldId) {
			if (seen.has(cur.id)) {
				problems.push(`"${f.label}" has circular show conditions.`);
				break;
			}
			seen.add(cur.id);
			const next: string = cur.showWhen.fieldId;
			cur = tt.fields.find((p) => p.id === next);
		}
	}
	return [...new Set(problems)];
}

export function ticketCode(n: number): string {
	return `#${n}`;
}

/**
 * Checks a workflow the admin built. Returns readable problems; empty when
 * the workflow can be saved.
 */
export function validateWorkflow(w: Pick<Workflow, "name" | "initialStatusId" | "statuses" | "transitions">): string[] {
	const problems: string[] = [];
	if (!w.name.trim()) problems.push("Give the workflow a name.");
	if (w.statuses.length === 0) problems.push("Add at least one status.");
	const ids = new Set(w.statuses.map((s) => s.id));
	const names = new Set<string>();
	for (const s of w.statuses) {
		if (!s.name.trim()) problems.push("Every status needs a name.");
		const key = s.name.trim().toLowerCase();
		if (names.has(key)) problems.push(`Two statuses are called "${s.name}".`);
		names.add(key);
	}
	if (!ids.has(w.initialStatusId)) problems.push("Pick the status new tickets start in.");
	for (const t of w.transitions) {
		if (t.from !== "*" && !ids.has(t.from)) problems.push(`Transition "${t.label}" starts from a deleted status.`);
		if (!ids.has(t.to)) problems.push(`Transition "${t.label}" goes to a deleted status.`);
		if (!t.label.trim()) problems.push("Every transition needs a button label.");
		if (t.roles.length === 0) problems.push(`Nobody can use "${t.label || "a transition"}". Pick at least one role.`);
		if (t.from === t.to) problems.push(`"${t.label}" goes nowhere: pick a different target status.`);
	}
	if (w.statuses.length > 0 && !w.statuses.some((s) => isClosedCategory(s.category))) {
		problems.push("Add a Done or Cancelled status so tickets can be closed.");
	}
	// Statuses nobody can reach from the initial one.
	const reachable = new Set([w.initialStatusId]);
	let grew = true;
	while (grew) {
		grew = false;
		for (const t of w.transitions) {
			if ((t.from === "*" || reachable.has(t.from)) && !reachable.has(t.to)) {
				reachable.add(t.to);
				grew = true;
			}
		}
	}
	for (const s of w.statuses) {
		if (!reachable.has(s.id)) problems.push(`"${s.name}" can't be reached from the initial status.`);
	}
	return [...new Set(problems)];
}

/* --------------------------------- Seed ---------------------------------- */

const SEED_DATE = "2026-01-05T09:00:00.000Z";
const ALL: UserRole[] = ["admin", "technician", "broker"];
const ADMIN: UserRole[] = ["admin"];
const TECH: UserRole[] = ["admin", "technician"];
const SALES: UserRole[] = ["admin", "broker"];
const ENG: UserRole[] = ["admin", "engineer"];

const t = (
	id: string,
	from: string,
	to: string,
	label: string,
	roles: UserRole[],
	requireComment = false,
	requiredFields: string[] = [],
): Transition => ({ id, from, to, label, roles, requireComment, requiredFields });

const f = (id: string, label: string, kind: FieldKind, extra: Partial<FieldDef> = {}): FieldDef => ({
	id,
	label,
	kind,
	options: [],
	required: false,
	helpText: "",
	...extra,
});

/** The warranty workflow's engineering steps (also added to installs from before them). */
export const ENGINEERING_STATUS: TicketStatus = { id: "engineering", name: "With engineering", color: "#7C3AED", category: "waiting", engineering: true };
export const ENGINEERING_STEPS: Transition[] = [
	t("w13", "new", "engineering", "Ask engineering", TECH),
	t("w14", "triage", "engineering", "Ask engineering", TECH),
	t("w15", "visit", "engineering", "Ask engineering", TECH),
	t("w16", "repair", "engineering", "Ask engineering", TECH),
	t("w17", "engineering", "repair", "Repair as advised", ENG),
	t("w18", "engineering", "triage", "Back to triage", ENG),
];

export const SEED_WORKFLOWS: Workflow[] = [
	{
		id: "wf-warranty",
		name: "Warranty repair",
		description: "Claims under the builder's warranty: triage, site visit, repair and sign-off by the owner.",
		initialStatusId: "new",
		statuses: [
			{ id: "new", name: "New", color: "#64748B", category: "todo" },
			{ id: "triage", name: "Triage", color: "#9333EA", category: "todo" },
			{ id: "visit", name: "Visit scheduled", color: "#0EA5E9", category: "waiting", needsVisit: true },
			{ id: "engineering", name: "With engineering", color: "#7C3AED", category: "waiting", engineering: true },
			{ id: "repair", name: "In repair", color: "#2B6CB0", category: "in_progress" },
			{ id: "supplier", name: "Waiting on supplier", color: "#CA8A04", category: "waiting" },
			{ id: "signoff", name: "Owner sign-off", color: "#0D9488", category: "waiting" },
			{ id: "resolved", name: "Resolved", color: "#16A34A", category: "done" },
			{ id: "rejected", name: "Not covered", color: "#DC2626", category: "cancelled" },
		],
		transitions: [
			t("w1", "new", "triage", "Start triage", ADMIN),
			t("w2", "triage", "visit", "Schedule visit", TECH),
			t("w3", "triage", "rejected", "Reject: not covered", ADMIN, true, ["root_cause"]),
			t("w4", "visit", "repair", "Start repair", TECH, false, ["root_cause"]),
			t("w5", "repair", "supplier", "Wait for parts", TECH, true),
			t("w6", "supplier", "repair", "Parts arrived", TECH),
			{ ...t("w7", "repair", "signoff", "Ask owner to sign off", TECH, false, ["work_done", "repair_cost"]), onTasksScreen: true },
			{ ...t("w8", "signoff", "resolved", "Owner approved", TECH, false, ["owner_signoff"]), onTasksScreen: true },
			t("w9", "signoff", "repair", "Owner found issues", TECH, true),
			t("w10", "resolved", "triage", "Reopen", ADMIN, true),
			// Lets an administrator close any pending ticket (e.g. from batch edit).
			t("w11", "*", "resolved", "Close ticket", ADMIN, true),
			t("w12", "rejected", "triage", "Reopen", ADMIN, true),
			// A technical question: engineering analyzes it (with photos) and sends it back.
			...ENGINEERING_STEPS,
		],
		updatedAt: SEED_DATE,
	},
	{
		id: "wf-maintenance",
		name: "Maintenance request",
		description: "Quick fixes for common areas and building systems.",
		initialStatusId: "open",
		statuses: [
			{ id: "open", name: "Open", color: "#64748B", category: "todo" },
			{ id: "progress", name: "In progress", color: "#2B6CB0", category: "in_progress" },
			{ id: "hold", name: "On hold", color: "#CA8A04", category: "waiting" },
			{ id: "rescheduled", name: "Rescheduled", color: "#0EA5E9", category: "waiting" },
			{ id: "done", name: "Done", color: "#16A34A", category: "done" },
			{ id: "cancelled", name: "Cancelled", color: "#DC2626", category: "cancelled" },
		],
		transitions: [
			t("m1", "open", "progress", "Start work", TECH),
			t("m2", "progress", "hold", "Put on hold", TECH, true),
			t("m3", "hold", "progress", "Resume", TECH),
			t("m4", "progress", "done", "Mark as done", TECH, false, ["work_done", "labor_hours"]),
			t("m5", "*", "cancelled", "Cancel", ADMIN, true),
			t("m6", "done", "open", "Reopen", ADMIN, true),
			t("m7", "cancelled", "open", "Reopen", ADMIN, true),
			// The visit moved to another day: it waits, then is finished or resumed.
			t("m8", "progress", "rescheduled", "Reschedule", TECH, true),
			t("m9", "rescheduled", "done", "Mark as done", TECH, false, ["work_done", "labor_hours"]),
			t("m10", "rescheduled", "progress", "Resume work", TECH),
		],
		updatedAt: SEED_DATE,
	},
	{
		id: "wf-sales",
		name: "Sales pipeline",
		description: "From a new lead to a signed purchase agreement.",
		initialStatusId: "lead",
		statuses: [
			{ id: "lead", name: "New lead", color: "#64748B", category: "todo" },
			{ id: "contacted", name: "Contacted", color: "#0EA5E9", category: "in_progress" },
			{ id: "showing", name: "Showing booked", color: "#9333EA", category: "waiting", needsVisit: true },
			{ id: "proposal", name: "Proposal sent", color: "#EA580C", category: "waiting" },
			{ id: "won", name: "Won", color: "#16A34A", category: "done" },
			{ id: "lost", name: "Lost", color: "#DC2626", category: "cancelled" },
		],
		transitions: [
			t("s1", "lead", "contacted", "Log first contact", SALES),
			t("s2", "contacted", "showing", "Book a showing", SALES, false, ["budget"]),
			t("s3", "showing", "proposal", "Send proposal", SALES),
			t("s4", "proposal", "won", "Agreement signed", SALES, false, ["agreed_price", "financing"]),
			t("s5", "proposal", "contacted", "Negotiate", SALES, true),
			t("s6", "*", "lost", "Mark as lost", SALES, true),
			t("s7", "lost", "contacted", "Reopen", SALES, true),
			t("s8", "won", "proposal", "Reopen", ADMIN, true),
		],
		updatedAt: SEED_DATE,
	},
];

const LEAK_SOURCES = ["Unit above", "Roof", "Facade", "Plumbing riser", "Unknown"];
const LEAK_ONLY: FieldCondition = { fieldId: "defect", equals: ["Water leak"] };

export const SEED_TICKET_TYPES: TicketType[] = [
	{
		id: "tt-warranty", name: "Warranty claim", description: "Defects reported by unit owners after handover.", color: "#9333EA",
		workflowId: "wf-warranty", defaultPriority: "medium", slaHours: 72, active: true,
		fields: [
		f("defect", "Defect category", "select", { options: ["Finishing", "Plumbing", "Water leak", "Electrical", "Doors & windows", "Waterproofing", "Structure"], required: true }),
		// Leaks only: where the water comes from, and whether the supply is closed.
		f("leak_source", "Suspected source", "select", { options: LEAK_SOURCES, required: true, showWhen: LEAK_ONLY }),
		f("water_off", "Water shut off", "checkbox", { helpText: "Check once the supply to the affected line is closed.", showWhen: LEAK_ONLY }),
		f("noticed_on", "Noticed on", "date", { helpText: "When the owner first noticed the problem." }),
		f("root_cause", "Root cause", "textarea", { helpText: "Filled after the site visit; needed to start the repair." }),
		f("covered", "Covered by warranty", "checkbox"),
		f("work_done", "Work performed", "textarea"),
		f("repair_cost", "Repair cost", "currency"),
		f("owner_signoff", "Signed off by", "text", { helpText: "Name of the owner who approved the repair." }),
	],
	},
	{
		id: "tt-maintenance", name: "Maintenance request", description: "Common areas, elevators, HVAC and electrical.", color: "#2B6CB0",
		workflowId: "wf-maintenance", defaultPriority: "medium", slaHours: 48, active: true,
		fields: [
			f("system", "System", "select", { options: ["Elevator", "HVAC", "Electrical", "Plumbing", "Access control", "Grounds", "Other"], required: true }),
			f("asset_tag", "Asset tag", "text", { helpText: "Label on the equipment, e.g. RTU-2." }),
			f("work_done", "Work performed", "textarea"),
			f("parts", "Parts used", "text"),
			f("labor_hours", "Labor hours", "number"),
		],
	},
	{
		id: "tt-sales", name: "Sales inquiry", description: "Prospective buyers asking about available units.", color: "#16A34A",
		workflowId: "wf-sales", defaultPriority: "low", slaHours: null, active: true,
		fields: [
			f("lead_source", "Lead source", "select", { options: ["Website", "Referral", "Walk-in", "Listing portal", "Open house"], required: true }),
			f("budget", "Budget", "currency"),
			f("bedrooms", "Bedrooms wanted", "select", { options: ["Studio", "1", "2", "3", "4+", "Commercial"] }),
			f("financing", "Financing", "select", { options: ["Cash", "Pre-approved mortgage", "Needs financing"] }),
			f("agreed_price", "Agreed price", "currency"),
		],
	},
];

interface TicketSeed {
	title: string;
	description: string;
	typeId: string;
	/** Path of statuses walked from the initial one; the last is the current status. */
	path: string[];
	priority?: Priority;
	assigneeId: string | null;
	requester: string;
	developmentId: string;
	blockId?: string;
	unitNumber?: string;
	daysAgo: number;
	/** Field values that must be set (e.g. the defect category). */
	fields?: Record<string, FieldValue>;
}

const SEEDS: TicketSeed[] = [
	{ title: "Cracked tiles in kitchen floor", description: "Three floor tiles cracked near the dishwasher two months after move-in.", typeId: "tt-warranty", path: ["new", "triage", "visit", "repair"], assigneeId: "2549", requester: "Michael Reed", developmentId: "D-01", blockId: "D-01-B1", unitNumber: "304", daysAgo: 9 },
	{ title: "Bedroom window won't close fully", description: "The sliding window in the master bedroom leaves a 1 cm gap; wind noise at night.", typeId: "tt-warranty", path: ["new", "triage", "visit"], assigneeId: "2548", requester: "Jessica Lane", developmentId: "D-01", blockId: "D-01-B2", unitNumber: "502", daysAgo: 4 },
	{ title: "Paint peeling in bathroom ceiling", description: "Moisture spots and peeling paint above the shower.", typeId: "tt-warranty", path: ["new", "triage", "visit", "repair", "supplier"], assigneeId: "2555", requester: "Chris Patel", developmentId: "D-04", blockId: "D-04-B1", unitNumber: "601", daysAgo: 15 },
	{ title: "Front door lock sticks", description: "Key turns with difficulty; owner worried it will break.", typeId: "tt-warranty", path: ["new", "triage", "visit", "repair", "signoff"], assigneeId: "2550", requester: "Amanda Cole", developmentId: "D-03", blockId: "D-03-B1", unitNumber: "203", daysAgo: 12 },
	{ title: "Grout gaps in shower", description: "Grout washing out around the shower tray.", typeId: "tt-warranty", path: ["new", "triage", "visit", "repair", "signoff", "resolved"], assigneeId: "2553", requester: "David Kim", developmentId: "D-01", blockId: "D-01-B1", unitNumber: "102", daysAgo: 25 },
	{ title: "Scratched countertop", description: "Owner reports scratches on the quartz countertop.", typeId: "tt-warranty", path: ["new", "triage", "rejected"], assigneeId: null, requester: "Rachel Green", developmentId: "D-03", blockId: "D-03-B2", unitNumber: "401", daysAgo: 20 },
	{ title: "Balcony door draft", description: "Cold air coming through the balcony door seal.", typeId: "tt-warranty", path: ["new"], assigneeId: null, requester: "Brian Foster", developmentId: "D-06", blockId: "D-06-B2", unitNumber: "503", daysAgo: 1 },
	{ title: "Hairline crack in living room wall", description: "Thin diagonal crack above the TV wall, getting longer.", typeId: "tt-warranty", path: ["new", "triage"], priority: "high", assigneeId: null, requester: "Nicole Adams", developmentId: "D-04", blockId: "D-04-B1", unitNumber: "302", daysAgo: 2 },
	{ title: "Water dripping from ceiling light", description: "Water coming through the kitchen light fixture after the upstairs neighbor showers.", typeId: "tt-warranty", path: ["new", "triage", "visit", "repair"], priority: "urgent", fields: { defect: "Water leak", leak_source: "Unit above", water_off: true }, assigneeId: "2553", requester: "Steven Clark", developmentId: "D-01", blockId: "D-01-B2", unitNumber: "401", daysAgo: 2 },
	{ title: "Garage infiltration after storm", description: "Standing water in parking spots 12-18 after heavy rain.", typeId: "tt-warranty", path: ["new", "triage", "visit"], priority: "urgent", fields: { defect: "Water leak", leak_source: "Facade", water_off: false }, assigneeId: "2549", requester: "Priya Raman (HOA)", developmentId: "D-06", blockId: "D-06-B1", daysAgo: 1 },
	{ title: "Leak under kitchen sink", description: "Drain joint leaking; cabinet base swollen.", typeId: "tt-warranty", path: ["new", "triage", "visit", "repair", "signoff", "resolved"], priority: "urgent", fields: { defect: "Water leak", leak_source: "Plumbing riser", water_off: true }, assigneeId: "2553", requester: "Hannah Lee", developmentId: "D-03", blockId: "D-03-B3", unitNumber: "201", daysAgo: 18 },
	{ title: "Elevator B stops between floors", description: "Tenants report the elevator stopping briefly between floors 3 and 4.", typeId: "tt-maintenance", path: ["open", "progress"], priority: "high", assigneeId: "2554", requester: "Laura Fischer (Mgmt)", developmentId: "D-04", blockId: "D-04-B1", daysAgo: 3 },
	{ title: "Lobby lights flickering", description: "Two ceiling panels in the lobby flicker at night.", typeId: "tt-maintenance", path: ["open"], assigneeId: "2556", requester: "Daniel Brooks (HOA)", developmentId: "D-03", blockId: "D-03-B1", daysAgo: 1 },
	{ title: "Rooftop unit making noise", description: "RTU-2 rattling loudly since Monday.", typeId: "tt-maintenance", path: ["open", "progress", "hold"], assigneeId: "2554", requester: "Kevin O'Connor", developmentId: "D-07", blockId: "D-07-B1", daysAgo: 6 },
	{ title: "Gate remote not working", description: "Parking gate doesn't respond to two resident remotes.", typeId: "tt-maintenance", path: ["open", "progress", "done"], assigneeId: "2550", requester: "Daniel Brooks (HOA)", developmentId: "D-03", blockId: "D-03-B2", daysAgo: 10 },
	{ title: "Playground fence damaged", description: "A section of the fence was hit by a delivery truck.", typeId: "tt-maintenance", path: ["open", "progress"], assigneeId: "2548", requester: "Angela Torres", developmentId: "D-08", blockId: "D-08-B1", daysAgo: 5 },
	{ title: "Replace burnt-out exit signs", description: "Four exit signs on floor 2 are not lit.", typeId: "tt-maintenance", path: ["open", "cancelled"], assigneeId: "2556", requester: "Angela Torres", developmentId: "D-08", blockId: "D-08-B1", daysAgo: 14 },
	{ title: "Dock door 3 won't open", description: "Roll-up door motor trips the breaker.", typeId: "tt-maintenance", path: ["open"], priority: "urgent", assigneeId: "2556", requester: "Tom Walsh", developmentId: "D-10", blockId: "D-10-B1", daysAgo: 0 },
	{ title: "Family looking for a 3-bedroom", description: "Couple with two kids wants a 3-bedroom with parking, budget up to $820k.", typeId: "tt-sales", path: ["lead", "contacted", "showing"], assigneeId: "2557", requester: "Jason Wright", developmentId: "D-01", blockId: "D-01-B1", unitNumber: "504", daysAgo: 6 },
	{ title: "Investor asking about studios", description: "Wants 2 studios for rental, asked for payment terms.", typeId: "tt-sales", path: ["lead", "contacted", "showing", "proposal"], assigneeId: "2558", requester: "Megan Scott", developmentId: "D-01", blockId: "D-01-B2", unitNumber: "201", daysAgo: 11 },
	{ title: "Penthouse inquiry from website", description: "Filled the website form for the Tower B penthouse.", typeId: "tt-sales", path: ["lead"], assigneeId: "2560", requester: "Andrew Young", developmentId: "D-01", blockId: "D-01-B2", unitNumber: "604", daysAgo: 0 },
	{ title: "Retail space for a bakery", description: "Looking for a ground-floor retail unit with extraction.", typeId: "tt-sales", path: ["lead", "contacted"], assigneeId: "2561", requester: "Lauren King", developmentId: "D-02", blockId: "D-02-B1", unitNumber: "101", daysAgo: 3 },
	{ title: "Downsizing couple", description: "Retired couple, wants 2-bedroom on a high floor.", typeId: "tt-sales", path: ["lead", "contacted", "showing", "proposal", "won"], assigneeId: "2557", requester: "Michael Reed", developmentId: "D-06", blockId: "D-06-B2", unitNumber: "602", daysAgo: 21 },
	{ title: "Price shopper, no follow-up", description: "Asked for prices by phone, stopped answering.", typeId: "tt-sales", path: ["lead", "contacted", "lost"], assigneeId: "2561", requester: "Chris Patel", developmentId: "D-02", blockId: "D-02-B1", daysAgo: 16 },
	{ title: "Office suite for a law firm", description: "Needs 2,000+ sq ft on an upper floor, move in next quarter.", typeId: "tt-sales", path: ["lead", "contacted", "showing"], priority: "medium", assigneeId: "2560", requester: "Jessica Lane", developmentId: "D-06", blockId: "D-06-B1", unitNumber: "Suite 302", daysAgo: 4 },
];

const COMMENTS: Record<string, string> = {
	supplier: "Replacement part ordered, supplier says 5 business days.",
	rejected: "Damage caused by use, not covered by the warranty. Owner informed by email.",
	hold: "Waiting for the manufacturer's technician to confirm the part number.",
	cancelled: "Duplicate of another request; closing this one.",
	lost: "Buyer chose another development closer to their work.",
	proposal: "Proposal sent with the 10/90 payment plan.",
};

/** Plausible custom-field values: always the required ones, plus what past transitions needed. */
function seedFieldValues(type: TicketType, wf: Workflow, path: string[], i: number): Record<string, FieldValue> {
	const pickOpt = (id: string) => type.fields.find((x) => x.id === id)?.options[i % (type.fields.find((x) => x.id === id)?.options.length ?? 1)] ?? null;
	const v: Record<string, FieldValue> = {};
	for (const d of type.fields) v[d.id] = d.kind === "checkbox" ? false : null;
	for (const d of type.fields) if (d.required && d.kind === "select") v[d.id] = pickOpt(d.id);
	const reached = new Set(path);
	const sample: Record<string, FieldValue> = {
		noticed_on: "2026-09-01",
		root_cause: "Installation defect found during the visit; the subcontractor will cover the materials.",
		covered: true,
		work_done: "Replaced the damaged parts and tested on site with the owner present.",
		repair_cost: 180 + (i % 5) * 95,
		owner_signoff: "Unit owner",
		water_off: true,
		asset_tag: `EQ-${100 + i}`,
		parts: "Contactor, 2 fuses",
		labor_hours: 2 + (i % 4),
		budget: 420000 + (i % 6) * 65000,
		bedrooms: pickOpt("bedrooms"),
		financing: pickOpt("financing"),
		agreed_price: 598000,
	};
	for (let k = 1; k < path.length; k++) {
		const tr = wf.transitions.find((x) => (x.from === path[k - 1] || x.from === "*") && x.to === path[k]);
		for (const id of tr ? requiredForTransition(tr, type) : []) v[id] = sample[id] ?? v[id];
	}
	// A few extra details so open tickets aren't empty.
	if (reached.size > 1) for (const id of ["noticed_on", "asset_tag", "budget", "bedrooms", "water_off"]) if (id in v && sample[id] !== undefined) v[id] = sample[id];
	return v;
}

/** Seed tickets with a consistent history that walks their workflow. */
export function generateSeedTickets(
	now: Date,
	units: { id: string; blockId: string; number: string }[],
	developments: { id: string; name: string; clientId: string }[],
	clients: { id: string; name: string }[],
	blocks: { id: string; name: string }[],
): { tickets: Ticket[]; activity: TicketActivity[] } {
	const tickets: Ticket[] = [];
	const activity: TicketActivity[] = [];
	const hour = 3_600_000;

	SEEDS.forEach((s, i) => {
		const type = SEED_TICKET_TYPES.find((x) => x.id === s.typeId)!;
		const wf = SEED_WORKFLOWS.find((w) => w.id === type.workflowId)!;
		const dev = developments.find((d) => d.id === s.developmentId);
		const client = clients.find((c) => c.id === dev?.clientId);
		const block = blocks.find((b) => b.id === s.blockId);
		const unit = s.unitNumber ? units.find((u) => u.blockId === s.blockId && u.number === s.unitNumber) : undefined;
		const created = new Date(now.getTime() - s.daysAgo * 24 * hour - (i % 7) * hour);
		const id = `tk-${1001 + i}`;
		const reporterId = s.typeId === "tt-sales" ? (s.assigneeId ?? "2551") : "2547";
		const last = s.path[s.path.length - 1];
		const lastStatus = wf.statuses.find((x) => x.id === last)!;

		activity.push({ id: `${id}-a0`, ticketId: id, at: created.toISOString(), userId: reporterId, kind: "created", toStatusId: s.path[0] });
		// One step every few hours after creation, but never in the future.
		const stepMs = Math.max(hour, Math.min(20 * hour, (now.getTime() - created.getTime()) / (s.path.length + 1)));
		let at = created.getTime();
		for (let k = 1; k < s.path.length; k++) {
			at += stepMs;
			const tr = wf.transitions.find((x) => (x.from === s.path[k - 1] || x.from === "*") && x.to === s.path[k]);
			activity.push({
				id: `${id}-a${k}`,
				ticketId: id,
				at: new Date(at).toISOString(),
				userId: tr?.roles.includes("admin") && !tr.roles.includes("technician") && !tr.roles.includes("broker") ? "2547" : (s.assigneeId ?? "2547"),
				kind: "status",
				fromStatusId: s.path[k - 1],
				toStatusId: s.path[k],
				transitionLabel: tr?.label,
				comment: COMMENTS[s.path[k]] ?? (tr?.requireComment ? "Checked with the client." : undefined),
			});
		}

		tickets.push({
			id,
			number: 1001 + i,
			title: s.title,
			description: s.description,
			typeId: s.typeId,
			statusId: last,
			priority: s.priority ?? type.defaultPriority,
			assigneeId: s.assigneeId,
			reporterId,
			requester: {
				name: s.requester,
				email: `${s.requester.split(" (")[0].toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
				phone: `+1 (555) 300-${String(1001 + i).slice(-4)}`,
			},
			clientId: client?.id ?? "",
			clientName: client?.name ?? "",
			developmentId: dev?.id ?? null,
			blockId: block?.id ?? null,
			unitId: unit?.id ?? null,
			property: dev?.name ?? "",
			location: [block?.name, unit ? (/^\d/.test(unit.number) ? `Unit ${unit.number}` : unit.number) : ""].filter(Boolean).join(" · "),
			dueAt: type.slaHours ? new Date(created.getTime() + type.slaHours * hour).toISOString() : null,
			fields: { ...seedFieldValues(type, wf, s.path, i), ...s.fields },
			createdAt: created.toISOString(),
			updatedAt: new Date(at).toISOString(),
			closedAt: isClosedCategory(lastStatus.category) ? new Date(at).toISOString() : null,
		});
	});
	return { tickets, activity };
}

export { ALL as ALL_ROLES };

/**
 * "Water leak" used to be its own ticket type; a leak is a warranty defect.
 * Moves its tickets to Warranty claim (defect "Water leak", leak fields kept)
 * and returns what changed, for installs seeded before the merge.
 */
export function mergeLeakIntoWarranty(warranty: TicketType, tickets: Ticket[]): { type: TicketType; tickets: Ticket[] } {
	const fields = [...warranty.fields];
	const defect = fields.find((x) => x.id === "defect");
	if (defect && !defect.options.includes("Water leak")) {
		const at = defect.options.indexOf("Plumbing");
		defect.options = [...defect.options.slice(0, at + 1), "Water leak", ...defect.options.slice(at + 1)];
	}
	const after = fields.findIndex((x) => x.id === "defect") + 1;
	const extra = [
		f("leak_source", "Suspected source", "select", { options: LEAK_SOURCES, required: true, showWhen: LEAK_ONLY }),
		f("water_off", "Water shut off", "checkbox", { helpText: "Check once the supply to the affected line is closed.", showWhen: LEAK_ONLY }),
	].filter((x) => !fields.some((y) => y.id === x.id));
	fields.splice(after, 0, ...extra);
	const type = { ...warranty, fields };
	return {
		type,
		tickets: tickets.map((t) => ({ ...t, typeId: warranty.id, fields: normalizeFieldValues(fields, { ...t.fields, defect: "Water leak" }) })),
	};
}
