import { type Contact, type ContactStage, daysSince, followUpDue, stageOf as contactStageOf, TEMPERATURES } from "../../../../shared/contacts";
import { periodBounds, type Report, type ReportSource } from "../../../../shared/reports";
import { SATISFACTION_OPTIONS, type ServiceReport } from "../../../../shared/service";
import { isClosedCategory, PRIORITIES, STATUS_CATEGORIES, statusOf, type Ticket, type TicketType, type Workflow } from "../../../../shared/tickets";

/**
 * Builds a report's rows: one record per row, with the chosen columns, for
 * the period and filters, grouped with subtotals and sorted. Also exports
 * the result as CSV (opens in Excel).
 */

export interface ReportEvent {
	id: string;
	title: string;
	type: string;
	start: string;
	end: string;
	completed: boolean;
	owner: { id: string; name: string };
	client: { name: string };
	property: string;
	developmentId?: string;
	location?: string;
	ticketNumber: string;
	hours: { total: string }[];
	expenses: { amount: number }[];
	service?: ServiceReport | null;
}

export interface ReportData {
	tickets: Ticket[];
	contacts: Contact[];
	events: ReportEvent[];
}

export interface ReportLookups {
	meId: string;
	userName: (id: string | null | undefined) => string;
	types: TicketType[];
	typeById: Map<string, TicketType>;
	workflowOf: (typeId: string) => Workflow | undefined;
	contactStages: ContactStage[];
	developmentName: (id: string | null | undefined) => string | null;
	appointment: (typeId: string) => { label: string; color: string };
}

export type ColumnKind = "text" | "number" | "money" | "days" | "hours" | "date" | "datetime" | "bool";

export interface ColumnDef {
	id: string;
	label: string;
	kind: ColumnKind;
	/** Can rows be grouped by it? */
	groupable?: boolean;
	/** Subtotal: sum (money, hours, counts) or average (days, ratings). */
	total?: "sum" | "avg";
}

/** A cell: the value to sort and add up, what to show, and an optional color dot. */
export interface Cell {
	v: string | number | boolean | null;
	text: string;
	color?: string;
}

export interface Row {
	id: string;
	/** Where the record opens. */
	href: { to: "/tickets/$ticketNumber"; params: { ticketNumber: string } } | { to: "/technician/$activityId"; params: { activityId: string } } | { to: "/contacts" } | null;
	date: Record<string, string | null>;
	open: boolean;
	ownerId: string | null;
	typeId: string | null;
	flags: Record<string, boolean>;
	cells: Record<string, Cell>;
}

/* ----------------------------- Catalog ------------------------------ */

export function columnsFor(source: ReportSource, types: TicketType[]): ColumnDef[] {
	if (source === "tickets") {
		const custom = new Map<string, ColumnDef>();
		for (const t of types)
			for (const f of t.fields) {
				if (custom.has(f.id)) continue;
				const kind: ColumnKind = f.kind === "currency" ? "money" : f.kind === "number" ? "number" : f.kind === "checkbox" ? "bool" : f.kind === "date" ? "date" : "text";
				custom.set(f.id, { id: `field:${f.id}`, label: f.label, kind, groupable: f.kind === "select" || f.kind === "checkbox", total: kind === "money" || kind === "number" ? "sum" : undefined });
			}
		return [
			{ id: "number", label: "Ticket", kind: "text" },
			{ id: "title", label: "Title", kind: "text" },
			{ id: "type", label: "Type", kind: "text", groupable: true },
			{ id: "status", label: "Status", kind: "text", groupable: true },
			{ id: "stage", label: "Status meaning", kind: "text", groupable: true },
			{ id: "priority", label: "Priority", kind: "text", groupable: true },
			{ id: "assignee", label: "Assignee", kind: "text", groupable: true },
			{ id: "requester", label: "Requester", kind: "text" },
			{ id: "development", label: "Development", kind: "text", groupable: true },
			{ id: "location", label: "Location", kind: "text" },
			{ id: "created", label: "Opened", kind: "date" },
			{ id: "due", label: "Due", kind: "datetime" },
			{ id: "closed", label: "Closed", kind: "date" },
			{ id: "days_to_close", label: "Days to close", kind: "days", total: "avg" },
			{ id: "age", label: "Age (days)", kind: "days", total: "avg" },
			{ id: "days_overdue", label: "Days overdue", kind: "days", total: "avg" },
			{ id: "on_time", label: "Within deadline", kind: "bool", groupable: true },
			{ id: "parent", label: "Sub-ticket of", kind: "text" },
			...custom.values(),
		];
	}
	if (source === "appointments") {
		return [
			{ id: "date", label: "Date", kind: "datetime" },
			{ id: "title", label: "Title", kind: "text" },
			{ id: "type", label: "Type", kind: "text", groupable: true },
			{ id: "owner", label: "Team member", kind: "text", groupable: true },
			{ id: "client", label: "Client", kind: "text", groupable: true },
			{ id: "development", label: "Development", kind: "text", groupable: true },
			{ id: "location", label: "Location", kind: "text" },
			{ id: "ticket", label: "Ticket", kind: "text" },
			{ id: "state", label: "State", kind: "text", groupable: true },
			{ id: "hours", label: "Hours", kind: "hours", total: "sum" },
			{ id: "expenses", label: "Expenses", kind: "money", total: "sum" },
			{ id: "approved", label: "Actions approved", kind: "number", total: "sum" },
			{ id: "rejected", label: "Actions rejected", kind: "number", total: "sum" },
			{ id: "later", label: "Left for later", kind: "number", total: "sum" },
			{ id: "satisfaction", label: "Satisfaction", kind: "text", groupable: true },
			{ id: "signed", label: "Signed", kind: "bool", groupable: true },
		];
	}
	return [
		{ id: "name", label: "Name", kind: "text" },
		{ id: "company", label: "Company", kind: "text" },
		{ id: "email", label: "Email", kind: "text" },
		{ id: "phone", label: "Phone", kind: "text" },
		{ id: "stage", label: "Stage", kind: "text", groupable: true },
		{ id: "temperature", label: "Temperature", kind: "text", groupable: true },
		{ id: "source", label: "Source", kind: "text", groupable: true },
		{ id: "owner", label: "Portfolio", kind: "text", groupable: true },
		{ id: "development", label: "Interested in", kind: "text", groupable: true },
		{ id: "budget", label: "Budget", kind: "money", total: "sum" },
		{ id: "last_contact", label: "Last contact", kind: "date" },
		{ id: "days_since_contact", label: "Days since contact", kind: "days", total: "avg" },
		{ id: "next_follow_up", label: "Next follow-up", kind: "date" },
		{ id: "created", label: "Added", kind: "date" },
	];
}

export const DATE_FIELDS: Record<ReportSource, { id: string; label: string }[]> = {
	tickets: [
		{ id: "created", label: "Opened" },
		{ id: "closed", label: "Closed" },
		{ id: "due", label: "Due" },
	],
	appointments: [{ id: "date", label: "Appointment date" }],
	contacts: [
		{ id: "created", label: "Added" },
		{ id: "last_contact", label: "Last contact" },
		{ id: "next_follow_up", label: "Next follow-up" },
	],
};

export const FLAGS: Record<ReportSource, { id: string; label: string }[]> = {
	tickets: [{ id: "overdue", label: "Overdue" }],
	appointments: [{ id: "completed", label: "Completed" }],
	contacts: [
		{ id: "hot", label: "Hot" },
		{ id: "due", label: "Follow-up due" },
	],
};

/* ----------------------------- Format ------------------------------- */

const DAY = 86_400_000;
// The year only when it isn't this one, to keep columns narrow (the period label says the year).
const yearOpt = (d: Date) => (d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" as const });
const d1 = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", ...yearOpt(new Date(iso)) }) : "");
const dt = (iso: string | null | undefined) =>
	iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", ...yearOpt(new Date(iso)), hour: "numeric", minute: "2-digit" }) : "";

export function formatNumber(v: number | null, kind: ColumnKind): string {
	if (v === null || !Number.isFinite(v)) return "";
	if (kind === "money") return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
	if (kind === "days") return v.toFixed(1);
	if (kind === "hours") return v.toFixed(1);
	return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

const num = (v: number | null, kind: ColumnKind): Cell => ({ v, text: formatNumber(v, kind) });
const txt = (v: string | null | undefined, color?: string): Cell => ({ v: v || null, text: v || "", color });
const bool = (v: boolean | null): Cell => ({ v, text: v === null ? "" : v ? "Yes" : "No" });
const date = (iso: string | null | undefined, withTime = false): Cell => ({ v: iso ?? null, text: withTime ? dt(iso) : d1(iso) });

function minutesOf(total: string): number {
	const h = /(\d+)\s*h/.exec(total);
	const m = /(\d+)\s*m/.exec(total);
	return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

/* ----------------------------- Rows --------------------------------- */

function buildRows(source: ReportSource, data: ReportData, lk: ReportLookups, now: number): Row[] {
	if (source === "tickets") {
		const byId = new Map(data.tickets.map((t) => [t.id, t]));
		return data.tickets.map((t) => {
			const type = lk.typeById.get(t.typeId);
			const wf = lk.workflowOf(t.typeId);
			const st = statusOf(wf, t.statusId);
			const cat = STATUS_CATEGORIES.find((c) => c.id === st?.category);
			const closed = st ? isClosedCategory(st.category) : false;
			const due = t.dueAt ? new Date(t.dueAt).getTime() : null;
			const overdue = !closed && due !== null && due < now;
			const pr = PRIORITIES.find((p) => p.id === t.priority);
			const parent = t.parentId ? byId.get(t.parentId) : undefined;
			const cells: Record<string, Cell> = {
				number: { v: t.number, text: `#${t.number}` },
				title: txt(t.title),
				type: txt(type?.name, type?.color),
				status: txt(st?.name, st?.color),
				stage: txt(cat?.label),
				priority: txt(pr?.label, pr?.color),
				assignee: txt(lk.userName(t.assigneeId)),
				requester: txt(t.requester.name),
				development: txt(lk.developmentName(t.developmentId) ?? t.property),
				location: txt(t.location),
				created: date(t.createdAt),
				due: date(t.dueAt, true),
				closed: date(t.closedAt),
				days_to_close: num(t.closedAt ? (new Date(t.closedAt).getTime() - new Date(t.createdAt).getTime()) / DAY : null, "days"),
				age: num(((t.closedAt ? new Date(t.closedAt).getTime() : now) - new Date(t.createdAt).getTime()) / DAY, "days"),
				days_overdue: num(overdue ? (now - due!) / DAY : null, "days"),
				on_time: bool(due === null ? null : closed ? (t.closedAt ? new Date(t.closedAt).getTime() <= due : null) : !overdue),
				parent: txt(parent ? `#${parent.number} ${parent.title}` : ""),
			};
			for (const f of type?.fields ?? []) {
				const v = t.fields?.[f.id];
				cells[`field:${f.id}`] =
					typeof v === "number"
						? num(v, f.kind === "currency" ? "money" : "number")
						: typeof v === "boolean"
							? bool(v)
							: f.kind === "date"
								? date(v ? `${v}T12:00:00` : null)
								: txt(v === null || v === undefined ? "" : String(v));
			}
			return {
				id: t.id,
				href: { to: "/tickets/$ticketNumber", params: { ticketNumber: String(t.number) } },
				date: { created: t.createdAt, closed: t.closedAt, due: t.dueAt },
				open: !closed,
				ownerId: t.assigneeId,
				typeId: t.typeId,
				flags: { overdue },
				cells,
			};
		});
	}

	if (source === "appointments") {
		return data.events.map((e) => {
			const a = lk.appointment(e.type);
			const r = e.service ?? null;
			const list = r?.checklist ?? [];
			const past = new Date(e.start).getTime() < now;
			const state = e.completed ? { t: "Completed", c: "#16A34A" } : past ? { t: "Past, not completed", c: "#DC2626" } : { t: "Upcoming", c: "#64748B" };
			const sat = SATISFACTION_OPTIONS.find((o) => o.value === r?.satisfaction)?.label;
			return {
				id: e.id,
				href: { to: "/technician/$activityId", params: { activityId: e.id } },
				date: { date: e.start },
				open: !e.completed,
				ownerId: e.owner.id,
				typeId: e.type,
				flags: { completed: e.completed },
				cells: {
					date: date(e.start, true),
					title: txt(e.title),
					type: txt(a.label, a.color),
					owner: txt(e.owner.name),
					client: txt(e.client?.name),
					development: txt(lk.developmentName(e.developmentId) ?? e.property),
					location: txt(e.location),
					ticket: txt(e.ticketNumber ? `#${e.ticketNumber}` : ""),
					state: txt(state.t, state.c),
					hours: num(e.hours.reduce((m, h) => m + minutesOf(h.total), 0) / 60, "hours"),
					expenses: num(e.expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0), "money"),
					approved: num(r ? list.filter((c) => c.result === "ok").length : null, "number"),
					rejected: num(r ? list.filter((c) => c.result === "issue").length : null, "number"),
					later: num(r ? list.filter((c) => c.deferredTicket).length : null, "number"),
					satisfaction: txt(sat ?? (r?.status === "completed" && !r.customerPresent ? "Customer not present" : "")),
					signed: bool(r?.status === "completed" ? Boolean(r.signature) : null),
				},
			};
		});
	}

	return data.contacts.map((c) => {
		const st = contactStageOf(lk.contactStages, c.stageId);
		const tp = TEMPERATURES.find((x) => x.id === c.temperature);
		return {
			id: c.id,
			href: { to: "/contacts" },
			date: { created: c.createdAt, last_contact: c.lastContactAt, next_follow_up: c.nextFollowUp ? `${c.nextFollowUp}T12:00:00` : null },
			open: !st?.closed,
			ownerId: c.ownerId,
			typeId: null,
			flags: { hot: c.temperature === "hot", due: followUpDue(c) },
			cells: {
				name: txt(c.name),
				company: txt(c.company),
				email: txt(c.email),
				phone: txt(c.phone),
				stage: txt(st?.label, st?.color),
				temperature: txt(tp?.label, tp?.color),
				source: txt(c.source),
				owner: txt(lk.userName(c.ownerId)),
				development: txt(lk.developmentName(c.developmentId)),
				budget: num(c.budget, "money"),
				last_contact: date(c.lastContactAt),
				days_since_contact: num(daysSince(c.lastContactAt), "days"),
				next_follow_up: date(c.nextFollowUp ? `${c.nextFollowUp}T12:00:00` : null),
				created: date(c.createdAt),
			},
		};
	});
}

/* ----------------------------- Run ---------------------------------- */

export interface Section {
	key: string;
	label: string;
	color?: string;
	rows: Row[];
	totals: Record<string, Cell>;
}

export interface RunResult {
	columns: ColumnDef[];
	sections: Section[];
	totals: Record<string, Cell>;
	count: number;
	periodLabel: string;
}

function totalsOf(rows: Row[], columns: ColumnDef[]): Record<string, Cell> {
	const out: Record<string, Cell> = {};
	for (const c of columns) {
		if (!c.total) continue;
		const vals = rows.map((r) => r.cells[c.id]?.v).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
		if (!vals.length) continue;
		const sum = vals.reduce((a, b) => a + b, 0);
		const v = c.total === "avg" ? sum / vals.length : sum;
		out[c.id] = { v, text: `${c.total === "avg" ? "avg " : ""}${formatNumber(v, c.kind)}` };
	}
	return out;
}

function compare(a: Cell | undefined, b: Cell | undefined): number {
	const x = a?.v ?? null;
	const y = b?.v ?? null;
	if (x === null && y === null) return 0;
	if (x === null) return 1; // empty cells last
	if (y === null) return -1;
	if (typeof x === "number" && typeof y === "number") return x - y;
	if (typeof x === "boolean" && typeof y === "boolean") return Number(x) - Number(y);
	return String(x).localeCompare(String(y), "en", { numeric: true });
}

export function runReport(report: Report, data: ReportData, lk: ReportLookups, now = new Date()): RunResult {
	const all = columnsFor(report.source, lk.types);
	const columns = report.columns.map((id) => all.find((c) => c.id === id)).filter((c): c is ColumnDef => Boolean(c));
	const bounds = periodBounds(report.period, now);
	const owner = report.filters.ownerId === "me" ? lk.meId : report.filters.ownerId;
	const rows = buildRows(report.source, data, lk, now.getTime()).filter((r) => {
		if (report.filters.state === "open" && !r.open) return false;
		if (report.filters.state === "closed" && r.open) return false;
		if (report.filters.typeId && r.typeId !== report.filters.typeId) return false;
		if (owner && r.ownerId !== owner) return false;
		if (report.filters.flag && !r.flags[report.filters.flag]) return false;
		if (bounds.from || bounds.to) {
			const iso = r.date[report.dateField];
			if (!iso) return false;
			const t = new Date(iso).getTime();
			if (bounds.from && t < bounds.from.getTime()) return false;
			if (bounds.to && t >= bounds.to.getTime()) return false;
		}
		return true;
	});
	const sortCol = report.sort.column || columns[0]?.id;
	const dir = report.sort.dir === "asc" ? 1 : -1;
	rows.sort((a, b) => dir * compare(a.cells[sortCol], b.cells[sortCol]));

	let sections: Section[];
	if (report.groupBy) {
		const map = new Map<string, Section>();
		for (const r of rows) {
			const c = r.cells[report.groupBy] ?? { v: null, text: "" };
			const key = c.text || "__none__";
			if (!map.has(key)) map.set(key, { key, label: c.text || "(empty)", color: c.color, rows: [], totals: {} });
			map.get(key)!.rows.push(r);
		}
		sections = [...map.values()].sort((a, b) => (a.key === "__none__" ? 1 : b.key === "__none__" ? -1 : a.label.localeCompare(b.label, "en", { numeric: true })));
		for (const s of sections) s.totals = totalsOf(s.rows, columns);
	} else {
		sections = [{ key: "all", label: "", rows, totals: {} }];
	}
	return { columns, sections, totals: totalsOf(rows, columns), count: rows.length, periodLabel: bounds.label };
}

/* ----------------------------- Export ------------------------------- */

/** CSV with a BOM so Excel reads accents right; numbers stay numbers. */
export function toCsv(result: RunResult, groupLabel: string | null): string {
	const esc = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
	const raw = (c: Cell | undefined, kind: ColumnKind) =>
		c?.v === null || c?.v === undefined ? "" : typeof c.v === "number" && kind !== "text" ? String(Math.round(c.v * 100) / 100) : c.text;
	const head = [...(groupLabel ? [groupLabel] : []), ...result.columns.map((c) => c.label)];
	const lines = [head.map(esc).join(",")];
	for (const s of result.sections) for (const r of s.rows) lines.push([...(groupLabel ? [s.label] : []), ...result.columns.map((c) => raw(r.cells[c.id], c.kind))].map(esc).join(","));
	return `﻿${lines.join("\r\n")}`;
}
