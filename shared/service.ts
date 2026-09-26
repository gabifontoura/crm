/**
 * Field service: what a technician records while performing a task (a
 * calendar appointment: inspection or repair) on site. Stored on the calendar
 * event and linked to its ticket by ticket number. Imports use ".js" for Node
 * ESM on Vercel.
 */
import { SIGNATURE_FIELD } from "./tickets.js";

export type ServiceStatus = "not_started" | "in_progress" | "completed";
/** ok = approved, issue = rejected, na = not applicable, null = pending. */
export type ChecklistResult = "ok" | "issue" | "na" | null;
export type ActionStatus = "pending" | "approved" | "rejected" | "na";

export interface ServicePhoto {
	id: string;
	name: string;
	/** Resized JPEG data URL. */
	dataUrl: string;
	caption: string;
}

/** One action of a task (a check on an inspection, a step on a repair). */
export interface ChecklistItem {
	id: string;
	label: string;
	/** What has to be checked or done. */
	description: string;
	result: ChecklistResult;
	note: string;
	/** Evidence photos for this action. */
	photos: ServicePhoto[];
	/** Forwarded to the engineering team for analysis. */
	engineering: boolean;
	/**
	 * The sub-ticket this action is (set by the server). On a task linked to a
	 * ticket, the actions are that ticket's sub-tickets: a checklist of them.
	 */
	ticketNumber?: number | null;
	/** Left for later: the (still open) sub-ticket's number. Counts as answered. */
	deferredTicket?: number | null;
}

export interface PartUsed {
	id: string;
	description: string;
	qty: number;
	unitCost: number;
}

export interface ServiceSignature {
	name: string;
	/** PNG data URL of the drawn signature. */
	dataUrl: string;
	signedAt: string;
}

export type Satisfaction = "very_dissatisfied" | "dissatisfied" | "neutral" | "satisfied" | "very_satisfied";

export const SATISFACTION_OPTIONS: { value: Satisfaction; label: string }[] = [
	{ value: "very_dissatisfied", label: "Very dissatisfied" },
	{ value: "dissatisfied", label: "Dissatisfied" },
	{ value: "neutral", label: "Neutral" },
	{ value: "satisfied", label: "Satisfied" },
	{ value: "very_satisfied", label: "Very satisfied" },
];

/** A reschedule of the task (e.g. customer absent). Written only by the server. */
export interface RescheduleEntry {
	id: string;
	at: string;
	byId: string;
	byName: string;
	fromStart: string;
	fromEnd: string;
	toStart: string;
	toEnd: string;
	reason: string;
	photos: ServicePhoto[];
}

/** One stretch of time on site: from arriving (or resuming) to pausing or finishing. */
export interface TimeSession {
	start: string;
	/** Null while the clock is running. */
	end: string | null;
}

export interface ServiceReport {
	status: ServiceStatus;
	/** First check-in. */
	checkInAt: string | null;
	/** Final check-out, set when the task is finished. */
	checkOutAt: string | null;
	/**
	 * Every stretch on site. The technician can pause the clock (leave, or
	 * fill in the report later) and resume; only these stretches count.
	 */
	sessions?: TimeSession[];
	/** The task's actions (approve / reject / not applicable). */
	checklist: ChecklistItem[];
	/** What was found on site (inspections) or the diagnosis (repairs). */
	findings: string;
	workPerformed: string;
	parts: PartUsed[];
	/** General photos of the visit (actions have their own). */
	photos: ServicePhoto[];
	customerPresent: boolean;
	satisfaction: Satisfaction | null;
	signature: ServiceSignature | null;
	/** Follow-up the technician recommends (e.g. "Needs supplier part"). */
	followUp: string;
	reschedules: RescheduleEntry[];
}

/** General photos per report. */
export const MAX_PHOTOS = 8;
/** Evidence photos per action. */
export const MAX_ACTION_PHOTOS = 4;
/** All photos of a report together (general + actions). */
export const MAX_TOTAL_PHOTOS = 20;
/** Photos attached to a reschedule request. */
export const MAX_RESCHEDULE_PHOTOS = 3;
/** Keeps a report (with photos) under Vercel's 4.5 MB request limit. */
export const MAX_REPORT_BYTES = 3_500_000;

type Template = { label: string; description: string };

/** Default actions per appointment type; the technician can add more on site. */
export const CHECKLIST_TEMPLATES: Record<string, Template[]> = {
	initial_inspection: [
		{ label: "Electrical installation", description: "Outlets, switches, light fixtures, exhaust fan and intercom intact and working." },
		{ label: "Plumbing", description: "Traps and valves working, intact and watertight. Drains clean and flowing." },
		{ label: "Countertops and sinks", description: "Countertops and sinks intact and watertight." },
		{ label: "Floors and wall tiles", description: "Tiles, grout and leveling checked; no hollow or cracked tiles." },
		{ label: "Windows and glass", description: "Windows and doors open, close, lock and seal properly." },
		{ label: "Walls and ceilings", description: "No cracks, stains, damp or paint defects." },
		{ label: "Waterproofing", description: "Shower, balcony and drains tested for leaks; no damp on adjacent walls." },
	],
	maintenance: [
		{ label: "Area made safe", description: "Work area isolated; water or power shut off when needed." },
		{ label: "Root cause", description: "Cause of the fault identified and recorded." },
		{ label: "Repair", description: "Repair carried out as described in the ticket." },
		{ label: "Sealing and finishing", description: "Silicone, sealing and finishing applied where needed." },
		{ label: "Test after repair", description: "System tested after the repair (e.g. 15-minute leak test)." },
		{ label: "Cleaning", description: "Work area cleaned after the service." },
		{ label: "Customer informed", description: "Result explained to the customer or building manager." },
	],
	awaiting_supplier: [
		{ label: "Supplier contacted", description: "Supplier reached and order confirmed." },
		{ label: "Delivery date confirmed", description: "Delivery date agreed and recorded." },
		{ label: "Customer informed", description: "Customer told about the new date." },
	],
	unit_showing: [
		{ label: "Unit ready and clean", description: "Unit open, clean and lit before the visit." },
		{ label: "Floor plan and price list shown", description: "Visitor received the floor plan and prices." },
		{ label: "Visitor details collected", description: "Name, phone and email recorded." },
	],
	sales_meeting: [
		{ label: "Documents checked", description: "Buyer documents reviewed." },
		{ label: "Terms explained", description: "Payment terms and conditions explained." },
		{ label: "Next steps agreed", description: "Next meeting or signature date agreed." },
	],
};

const DEFAULT_CHECKLIST: Template[] = [
	{ label: "Arrived on site", description: "" },
	{ label: "Work completed", description: "" },
	{ label: "Customer informed", description: "" },
];

let counter = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}`;

export function emptyReport(appointmentType: string): ServiceReport {
	return {
		status: "not_started",
		checkInAt: null,
		checkOutAt: null,
		sessions: [],
		checklist: (CHECKLIST_TEMPLATES[appointmentType] ?? DEFAULT_CHECKLIST).map((t, i) => ({
			id: `c${i + 1}`,
			label: t.label,
			description: t.description,
			result: null,
			note: "",
			photos: [],
			engineering: false,
		})),
		findings: "",
		workPerformed: "",
		parts: [],
		photos: [],
		customerPresent: true,
		satisfaction: null,
		signature: null,
		followUp: "",
		reschedules: [],
	};
}

export const newChecklistItem = (label: string, description = ""): ChecklistItem => ({
	id: nid("c"),
	label,
	description,
	result: null,
	note: "",
	photos: [],
	engineering: false,
});
export const newPart = (): PartUsed => ({ id: nid("p"), description: "", qty: 1, unitCost: 0 });

export function actionStatus(item: Pick<ChecklistItem, "result">): ActionStatus {
	return item.result === "ok" ? "approved" : item.result === "issue" ? "rejected" : item.result === "na" ? "na" : "pending";
}

export function totalPhotos(r: Pick<ServiceReport, "photos" | "checklist">): number {
	return r.photos.length + r.checklist.reduce((s, c) => s + c.photos.length, 0);
}

export function partsTotal(parts: PartUsed[]): number {
	return Math.round(parts.reduce((s, p) => s + (p.qty || 0) * (p.unitCost || 0), 0) * 100) / 100;
}

/** Minutes between check-in and check-out (or now, while in progress). */
/** The stretches on site (older reports only have check-in and check-out). */
export function sessionsOf(r: Pick<ServiceReport, "checkInAt" | "checkOutAt" | "sessions">): TimeSession[] {
	if (r.sessions?.length) return r.sessions;
	return r.checkInAt ? [{ start: r.checkInAt, end: r.checkOutAt }] : [];
}

/** The clock is running: checked in and not paused. */
export function isClockRunning(r: Pick<ServiceReport, "status" | "checkInAt" | "checkOutAt" | "sessions">): boolean {
	const s = sessionsOf(r);
	return r.status !== "completed" && s.length > 0 && s[s.length - 1].end === null;
}

/** Minutes on site: the sum of every stretch (a running one counts until now). */
export function serviceMinutes(r: Pick<ServiceReport, "checkInAt" | "checkOutAt" | "sessions">, now = Date.now()): number {
	let ms = 0;
	for (const s of sessionsOf(r)) ms += Math.max(0, (s.end ? new Date(s.end).getTime() : r.checkOutAt ? new Date(r.checkOutAt).getTime() : now) - new Date(s.start).getTime());
	return Math.round(ms / 60000);
}

/** Stops the clock (fill in the rest later) or starts it again. */
export function toggleClock(r: ServiceReport, at = new Date().toISOString()): ServiceReport {
	const s = [...sessionsOf(r)];
	if (s.length && s[s.length - 1].end === null) s[s.length - 1] = { ...s[s.length - 1], end: at };
	else s.push({ start: at, end: null });
	return { ...r, sessions: s, checkInAt: r.checkInAt ?? at, status: "in_progress" };
}

/** Closes a running stretch at `at` (finishing): returns the final check-out time. */
export function closeClock(r: ServiceReport, at: string): { sessions: TimeSession[]; checkOutAt: string } {
	const s = [...sessionsOf(r)];
	if (s.length && s[s.length - 1].end === null) s[s.length - 1] = { ...s[s.length - 1], end: at };
	return { sessions: s, checkOutAt: s.length ? (s[s.length - 1].end ?? at) : at };
}

/** What still blocks completing the task. */
export function completionProblems(r: ServiceReport): string[] {
	const problems: string[] = [];
	if (!r.checkInAt) problems.push("Check in first.");
	// Actions left for later (turned into sub-tickets) count as answered.
	const open = r.checklist.filter((c) => c.result === null && !c.deferredTicket);
	if (open.length) problems.push(`Approve, reject or leave for later ${open.length} pending action${open.length === 1 ? "" : "s"}.`);
	if (r.checklist.some((c) => c.result === "issue" && !c.note.trim())) problems.push("Explain every rejected action.");
	if (r.checklist.some((c) => c.engineering && !c.note.trim())) problems.push("Describe every action forwarded to engineering.");
	if (!r.findings.trim() && !r.workPerformed.trim()) problems.push("Write the findings or the work performed.");
	if (r.customerPresent && !r.satisfaction) problems.push("Rate the customer's satisfaction.");
	if (r.customerPresent && !r.signature) problems.push("Get the customer's signature, or mark them as not present.");
	if (r.customerPresent && r.signature && !r.signature.name.trim()) problems.push("Enter the name of the person signing.");
	if (r.parts.some((p) => !p.description.trim())) problems.push("Describe every part or material.");
	return problems;
}

/**
 * `ticketNumber` and `deferredTicket` are set by the server only (they point
 * at sub-tickets); this copies them from the stored report onto one sent by
 * the client, which can't link an action to a ticket by itself.
 */
export function keepDeferred(incoming: ServiceReport, stored: ServiceReport | null | undefined): ServiceReport {
	const byId = new Map((stored?.checklist ?? []).map((c) => [c.id, c]));
	return {
		...incoming,
		checklist: incoming.checklist.map((c) => ({
			...c,
			ticketNumber: byId.get(c.id)?.ticketNumber ?? null,
			deferredTicket: byId.get(c.id)?.deferredTicket ?? null,
		})),
	};
}

/** Readable summary posted to the linked ticket's activity. */
export function reportSummary(r: ServiceReport, formatMoney: (n: number) => string): string {
	const rejected = r.checklist.filter((c) => c.result === "issue");
	const approved = r.checklist.filter((c) => c.result === "ok").length;
	const na = r.checklist.filter((c) => c.result === "na").length;
	const engineering = r.checklist.filter((c) => c.engineering);
	const photos = totalPhotos(r);
	const satisfaction = SATISFACTION_OPTIONS.find((o) => o.value === r.satisfaction)?.label;
	const lines = [
		`Service report · ${approved}/${r.checklist.length} actions approved${rejected.length ? `, ${rejected.length} rejected` : ""}${na ? `, ${na} not applicable` : ""}.`,
		...rejected.map((c) => `• Rejected: ${c.label}: ${c.note}`),
		...engineering.map((c) => `• Forwarded to engineering: ${c.label}: ${c.note}`),
		...r.checklist.filter((c) => c.deferredTicket).map((c) => `• Left for later: #${c.deferredTicket} ${c.label}`),
		r.findings && `Findings: ${r.findings}`,
		r.workPerformed && `Work performed: ${r.workPerformed}`,
		r.parts.length ? `Parts: ${r.parts.map((p) => `${p.qty}× ${p.description}`).join(", ")} (${formatMoney(partsTotal(r.parts))})` : "",
		photos ? `${photos} photo${photos === 1 ? "" : "s"} attached.` : "",
		r.customerPresent ? `Customer present${satisfaction ? ` · ${satisfaction}` : ""}.` : "Customer not present.",
		r.signature ? `Signed by ${r.signature.name}.` : "",
		r.followUp && `Follow-up: ${r.followUp}`,
	];
	return lines.filter(Boolean).join("\n");
}

/**
 * Suggested ticket field values from the report, keyed by the field ids the
 * seed workflows use (root_cause, work_done, repair_cost, owner_signoff...).
 * Only fields the ticket type has are used.
 */
export function ticketFieldsFromReport(r: ServiceReport, minutes: number): Record<string, string | number | boolean> {
	const out: Record<string, string | number | boolean> = {};
	if (r.findings.trim()) out.root_cause = r.findings.trim();
	if (r.workPerformed.trim()) out.work_done = r.workPerformed.trim();
	if (r.parts.length) {
		out.repair_cost = partsTotal(r.parts);
		out.parts = r.parts.map((p) => `${p.qty}× ${p.description}`).join(", ");
	}
	if (r.signature) out[SIGNATURE_FIELD] = r.signature.name;
	if (minutes > 0) out.labor_hours = Math.round((minutes / 60) * 10) / 10;
	return out;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/** Keeps a list of photos well-formed (data URLs only). */
export function sanitizePhotos(raw: unknown, max: number, prefix = "ph"): ServicePhoto[] {
	if (!Array.isArray(raw)) return [];
	return (raw as Record<string, unknown>[])
		.filter((p) => p && typeof p === "object" && str(p.dataUrl).startsWith("data:image/"))
		.slice(0, max)
		.map((p, i) => ({ id: str(p.id) || `${prefix}${i + 1}`, name: str(p.name).slice(0, 120), dataUrl: str(p.dataUrl), caption: str(p.caption).slice(0, 300) }));
}

/** Keeps a report received from the client (or an older stored one) well-formed. */
export function sanitizeReport(raw: unknown, appointmentType: string): ServiceReport {
	const base = emptyReport(appointmentType);
	if (!raw || typeof raw !== "object") return base;
	const r = raw as Record<string, unknown>;
	const results: ChecklistResult[] = ["ok", "issue", "na", null];
	const satisfactions = SATISFACTION_OPTIONS.map((o) => o.value);
	const sig = r.signature && typeof r.signature === "object" ? (r.signature as Record<string, unknown>) : null;
	return {
		status: (["not_started", "in_progress", "completed"] as const).includes(r.status as ServiceStatus) ? (r.status as ServiceStatus) : base.status,
		checkInAt: iso(r.checkInAt),
		checkOutAt: iso(r.checkOutAt),
		sessions: Array.isArray(r.sessions)
			? (r.sessions as Record<string, unknown>[])
					.slice(0, 50)
					.map((x) => ({ start: iso(x?.start), end: iso(x?.end) }))
					.filter((x): x is TimeSession => Boolean(x.start))
			: [],
		checklist: Array.isArray(r.checklist)
			? (r.checklist as Record<string, unknown>[]).slice(0, 60).map((c, i) => ({
					id: str(c.id) || `c${i + 1}`,
					label: str(c.label).slice(0, 200) || `Action ${i + 1}`,
					description: str(c.description).slice(0, 500),
					result: results.includes(c.result as ChecklistResult) ? (c.result as ChecklistResult) : null,
					note: str(c.note).slice(0, 1000),
					photos: sanitizePhotos(c.photos, MAX_ACTION_PHOTOS, `c${i + 1}ph`),
					engineering: c.engineering === true,
					ticketNumber: typeof c.ticketNumber === "number" && Number.isInteger(c.ticketNumber) ? c.ticketNumber : null,
					deferredTicket: typeof c.deferredTicket === "number" && Number.isInteger(c.deferredTicket) ? c.deferredTicket : null,
				}))
			: base.checklist,
		findings: str(r.findings).slice(0, 5000),
		workPerformed: str(r.workPerformed).slice(0, 5000),
		parts: Array.isArray(r.parts)
			? (r.parts as Record<string, unknown>[]).slice(0, 50).map((p, i) => ({
					id: str(p.id) || `p${i + 1}`,
					description: str(p.description).slice(0, 200),
					qty: Math.max(0, Number(p.qty) || 0),
					unitCost: Math.max(0, Number(p.unitCost) || 0),
				}))
			: [],
		photos: sanitizePhotos(r.photos, MAX_PHOTOS),
		customerPresent: typeof r.customerPresent === "boolean" ? r.customerPresent : true,
		satisfaction: satisfactions.includes(r.satisfaction as Satisfaction) ? (r.satisfaction as Satisfaction) : null,
		signature:
			sig && str(sig.dataUrl).startsWith("data:image/")
				? { name: str(sig.name).slice(0, 120), dataUrl: str(sig.dataUrl), signedAt: iso(sig.signedAt) ?? new Date().toISOString() }
				: null,
		followUp: str(r.followUp).slice(0, 1000),
		reschedules: Array.isArray(r.reschedules)
			? (r.reschedules as Record<string, unknown>[])
					.filter((x) => x && typeof x === "object" && iso(x.toStart) && iso(x.toEnd))
					.slice(-50)
					.map((x, i) => ({
						id: str(x.id) || `rs${i + 1}`,
						at: iso(x.at) ?? new Date().toISOString(),
						byId: str(x.byId),
						byName: str(x.byName).slice(0, 120),
						fromStart: iso(x.fromStart) ?? iso(x.toStart)!,
						fromEnd: iso(x.fromEnd) ?? iso(x.toEnd)!,
						toStart: iso(x.toStart)!,
						toEnd: iso(x.toEnd)!,
						reason: str(x.reason).slice(0, 1000),
						photos: sanitizePhotos(x.photos, MAX_RESCHEDULE_PHOTOS, `rs${i + 1}ph`),
					}))
			: [],
	};
}
