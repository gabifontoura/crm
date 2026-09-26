import { type Contact, type ContactStage, followUpDue, stageOf as contactStageOf, TEMPERATURES } from "../../../../shared/contacts";
import { type DataSource, type DateRange, RANGES, type Widget } from "../../../../shared/dashboards";
import { toneOf } from "../../../../shared/palette";
import { isClosedCategory, PRIORITIES, STATUS_CATEGORIES, statusOf, type Ticket, type TicketType, type Workflow } from "../../../../shared/tickets";

/**
 * Turns tickets, leads and appointments into one shape (a date, a few
 * dimensions to group by, a few numbers to add up) and answers a widget's
 * question from it. Everything runs on what the viewer is allowed to see.
 */

/** Calendar event as the API sends it (only what dashboards read). */
export interface WireEvent {
	id: string;
	type: string;
	start: string;
	completed: boolean;
	owner: { id: string; name: string };
	property: string;
	developmentId?: string;
	hours: { total: string }[];
	expenses: { amount: number }[];
	ticketNumber: string;
}

export interface DataSet {
	tickets: Ticket[];
	contacts: Contact[];
	events: WireEvent[];
}

export interface Lookups {
	meId: string;
	userName: (id: string | null | undefined) => string;
	typeById: Map<string, TicketType>;
	workflowOf: (typeId: string) => Workflow | undefined;
	contactStages: ContactStage[];
	developmentName: (id: string | null | undefined) => string | null;
	appointment: (typeId: string) => { label: string; color: string };
}

interface Group {
	key: string;
	label: string;
	/** The entity's own color (a ticket type, a stage…); none for people or sources. */
	color?: string;
	/** Natural order (stages, priorities); otherwise groups sort by value. */
	order?: number;
}

interface Row {
	date: string;
	open: boolean;
	ownerId: string | null;
	typeId: string | null;
	dims: Record<string, Group>;
	nums: Record<string, number | null>;
	flags: Record<string, boolean>;
}

export type Unit = "count" | "money" | "days" | "hours" | "number";

export interface MeasureDef {
	/** `op:field`, e.g. "count:", "sum:budget". */
	key: string;
	label: string;
	unit: Unit;
}

/* ------------------------------ Catalog ------------------------------ */

export const DIMENSIONS: Record<DataSource, { id: string; label: string }[]> = {
	tickets: [
		{ id: "type", label: "Ticket type" },
		{ id: "stage", label: "Status meaning (Not started, Waiting…)" },
		{ id: "status", label: "Status" },
		{ id: "priority", label: "Priority" },
		{ id: "assignee", label: "Assignee" },
		{ id: "development", label: "Development" },
		{ id: "due", label: "Deadline (on time / overdue)" },
	],
	contacts: [
		{ id: "stage", label: "Lead stage" },
		{ id: "temperature", label: "Temperature" },
		{ id: "source", label: "Lead source" },
		{ id: "owner", label: "Portfolio (owner)" },
		{ id: "development", label: "Development of interest" },
	],
	appointments: [
		{ id: "type", label: "Appointment type" },
		{ id: "owner", label: "Team member" },
		{ id: "development", label: "Development" },
		{ id: "state", label: "Completed or not" },
	],
};

export function measuresFor(source: DataSource, types: TicketType[]): MeasureDef[] {
	if (source === "contacts") {
		return [
			{ key: "count:", label: "Number of leads", unit: "count" },
			{ key: "count:hot", label: "Hot leads", unit: "count" },
			{ key: "count:due", label: "Follow-ups due", unit: "count" },
			{ key: "sum:budget", label: "Total budget", unit: "money" },
			{ key: "avg:budget", label: "Average budget", unit: "money" },
		];
	}
	if (source === "appointments") {
		return [
			{ key: "count:", label: "Number of appointments", unit: "count" },
			{ key: "count:completed", label: "Completed appointments", unit: "count" },
			{ key: "sum:hours", label: "Hours logged", unit: "hours" },
			{ key: "sum:expenses", label: "Expenses", unit: "money" },
		];
	}
	// Numeric custom fields of every ticket type (repair cost, labor hours, budget…).
	const numeric = new Map<string, { label: string; money: boolean }>();
	for (const t of types) for (const f of t.fields) if (f.kind === "number" || f.kind === "currency") numeric.set(f.id, { label: f.label, money: f.kind === "currency" });
	return [
		{ key: "count:", label: "Number of tickets", unit: "count" },
		{ key: "count:overdue", label: "Overdue tickets", unit: "count" },
		{ key: "avg:days_to_close", label: "Average days to close", unit: "days" },
		...[...numeric.entries()].flatMap(([id, f]) => [
			{ key: `sum:field:${id}`, label: `Total ${f.label.toLowerCase()}`, unit: (f.money ? "money" : "number") as Unit },
			{ key: `avg:field:${id}`, label: `Average ${f.label.toLowerCase()}`, unit: (f.money ? "money" : "number") as Unit },
		]),
	];
}

export const measureKey = (w: Pick<Widget, "measure">) => `${w.measure.op}:${w.measure.field ?? ""}`;

export function measureDef(w: Pick<Widget, "measure" | "source">, types: TicketType[]): MeasureDef {
	return measuresFor(w.source, types).find((m) => m.key === measureKey(w)) ?? { key: measureKey(w), label: "Value", unit: "number" };
}

/* ----------------------------- Rows --------------------------------- */

const CATEGORY_COLOR: Record<string, string> = { todo: "#64748B", in_progress: "#2B6CB0", waiting: "#CA8A04", done: "#16A34A", cancelled: "#DC2626" };
const NONE: Group = { key: "__none__", label: "None" };

function minutesOf(total: string): number {
	const h = /(\d+)\s*h/.exec(total);
	const m = /(\d+)\s*m/.exec(total);
	return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

function rowsFor(source: DataSource, data: DataSet, lk: Lookups, now: number): Row[] {
	const person = (id: string | null | undefined): Group => (id ? { key: id, label: lk.userName(id) } : { key: "__none__", label: "Unassigned" });
	const dev = (id: string | null | undefined, fallback = ""): Group => {
		const name = lk.developmentName(id) ?? fallback;
		return name ? { key: id || name, label: name } : { key: "__none__", label: "No development" };
	};

	if (source === "tickets") {
		return data.tickets.map((t) => {
			const type = lk.typeById.get(t.typeId);
			const wf = lk.workflowOf(t.typeId);
			const st = statusOf(wf, t.statusId);
			const cat = STATUS_CATEGORIES.find((c) => c.id === st?.category);
			const closed = st ? isClosedCategory(st.category) : false;
			const overdue = !closed && Boolean(t.dueAt) && new Date(t.dueAt!).getTime() < now;
			const pr = PRIORITIES.findIndex((p) => p.id === t.priority);
			const nums: Record<string, number | null> = {
				days_to_close: t.closedAt ? (new Date(t.closedAt).getTime() - new Date(t.createdAt).getTime()) / 86_400_000 : null,
			};
			for (const [k, v] of Object.entries(t.fields ?? {})) if (typeof v === "number") nums[`field:${k}`] = v;
			return {
				date: t.createdAt,
				open: !closed,
				ownerId: t.assigneeId,
				typeId: t.typeId,
				dims: {
					type: { key: t.typeId, label: type?.name ?? "Unknown type", color: type?.color },
					stage: cat ? { key: cat.id, label: cat.label, color: CATEGORY_COLOR[cat.id], order: STATUS_CATEGORIES.indexOf(cat) } : NONE,
					// Statuses of different workflows with the same name count together.
					status: st ? { key: st.name.toLowerCase(), label: st.name, color: st.color, order: wf?.statuses.indexOf(st) } : NONE,
					priority: { key: t.priority, label: PRIORITIES[pr]?.label ?? t.priority, color: PRIORITIES[pr]?.color, order: -pr },
					assignee: person(t.assigneeId),
					development: dev(t.developmentId, t.property),
					due: !t.dueAt ? { key: "none", label: "No deadline", order: 2 } : overdue ? { key: "late", label: "Overdue", color: "#DC2626", order: 0 } : { key: "ok", label: "On time", color: "#16A34A", order: 1 },
				},
				nums,
				flags: { overdue },
			};
		});
	}

	if (source === "contacts") {
		return data.contacts.map((c) => {
			const st = contactStageOf(lk.contactStages, c.stageId);
			const tp = TEMPERATURES.findIndex((x) => x.id === c.temperature);
			return {
				date: c.createdAt,
				open: !st?.closed,
				ownerId: c.ownerId,
				typeId: null,
				dims: {
					stage: st ? { key: st.id, label: st.label, color: st.color, order: lk.contactStages.indexOf(st) } : NONE,
					temperature: { key: c.temperature, label: TEMPERATURES[tp]?.label ?? c.temperature, color: TEMPERATURES[tp]?.color, order: tp },
					source: c.source ? { key: c.source, label: c.source } : { key: "__none__", label: "Not set" },
					owner: person(c.ownerId),
					development: dev(c.developmentId),
				},
				nums: { budget: c.budget },
				flags: { hot: c.temperature === "hot", due: followUpDue(c) },
			};
		});
	}

	return data.events.map((e) => {
		const a = lk.appointment(e.type);
		const done = e.completed;
		const past = new Date(e.start).getTime() < now;
		return {
			date: e.start,
			open: !done,
			ownerId: e.owner.id,
			typeId: e.type,
			dims: {
				type: { key: e.type, label: a.label, color: a.color },
				owner: person(e.owner.id),
				development: dev(e.developmentId, e.property),
				state: done ? { key: "done", label: "Completed", color: "#16A34A", order: 0 } : past ? { key: "missed", label: "Past, not completed", color: "#DC2626", order: 1 } : { key: "upcoming", label: "Upcoming", color: "#64748B", order: 2 },
			},
			nums: {
				hours: e.hours.reduce((m, h) => m + minutesOf(h.total), 0) / 60,
				expenses: e.expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0),
			},
			flags: { completed: done },
		};
	});
}

/* ----------------------------- Compute ------------------------------ */

export interface Slice {
	key: string;
	label: string;
	value: number;
	color?: string;
}

export type Result =
	| { kind: "kpi"; value: number; previous: number | null; unit: Unit; n: number }
	| { kind: "groups"; slices: Slice[]; total: number; unit: Unit; n: number }
	| { kind: "series"; buckets: { key: string; label: string }[]; series: { key: string; label: string; color?: string; values: number[] }[]; unit: Unit; n: number };

const DAY = 86_400_000;

export function effectiveRange(w: Widget, dashboardRange: Exclude<DateRange, "inherit">) {
	return w.range === "inherit" ? dashboardRange : w.range;
}

function timeWindow(range: Exclude<DateRange, "inherit">, now: number, shift = 0): [number, number] | null {
	const days = RANGES.find((r) => r.id === range)?.days;
	if (!days) return null;
	const end = now - shift * days * DAY;
	return [end - days * DAY, end];
}

function aggregate(rows: Row[], key: string): number {
	const [op, ...rest] = key.split(":");
	const field = rest.join(":");
	if (op === "count") return field ? rows.filter((r) => r.flags[field]).length : rows.length;
	const vals = rows.map((r) => r.nums[field]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
	const sum = vals.reduce((a, b) => a + b, 0);
	return op === "avg" ? (vals.length ? sum / vals.length : 0) : sum;
}

export function computeWidget(w: Widget, dashboardRange: Exclude<DateRange, "inherit">, data: DataSet, lk: Lookups, now = Date.now()): Result {
	const unit = measureDef(w, [...lk.typeById.values()]).unit;
	const key = measureKey(w);
	const range = effectiveRange(w, dashboardRange);
	const owner = w.filters.ownerId === "me" ? lk.meId : w.filters.ownerId;
	const base = rowsFor(w.source, data, lk, now).filter((r) => {
		if (w.filters.state === "open" && !r.open) return false;
		if (w.filters.state === "closed" && r.open) return false;
		if (w.filters.typeId && r.typeId !== w.filters.typeId) return false;
		if (owner && r.ownerId !== owner) return false;
		return true;
	});
	const inWindow = (rows: Row[], win: [number, number] | null) =>
		win ? rows.filter((r) => {
				const t = new Date(r.date).getTime();
				return t >= win[0] && t < win[1];
			})
		: rows;
	// Open work is a snapshot: "open tickets" means open now, whenever they were created.
	const snapshot = w.filters.state === "open" && w.chart !== "line";
	const rows = snapshot ? base : inWindow(base, timeWindow(range, now));

	if (w.chart === "kpi") {
		const prevWin = snapshot ? null : timeWindow(range, now, 1);
		return { kind: "kpi", value: aggregate(rows, key), previous: prevWin ? aggregate(inWindow(base, prevWin), key) : null, unit, n: rows.length };
	}

	if (w.chart === "line") {
		const days = RANGES.find((r) => r.id === range)?.days ?? null;
		const first = rows.reduce((m, r) => Math.min(m, new Date(r.date).getTime()), now);
		const span = days ?? Math.max(30, (now - first) / DAY);
		const step: "day" | "week" | "month" = span <= 31 ? "day" : span <= 120 ? "week" : "month";
		const bucketOf = (t: number) => {
			const d = new Date(t);
			if (step === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
			if (step === "week") {
				const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
				return monday.toISOString().slice(0, 10);
			}
			return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
		};
		const buckets: { key: string; label: string }[] = [];
		const start = days ? now - days * DAY : first;
		const seen = new Set<string>();
		for (let t = start; t <= now; t += step === "month" ? 28 * DAY : step === "week" ? 7 * DAY : DAY) {
			const k = bucketOf(t);
			if (seen.has(k)) continue;
			seen.add(k);
			const d = new Date(`${k.length === 7 ? `${k}-01` : k}T12:00:00`);
			buckets.push({ key: k, label: d.toLocaleDateString("en-US", step === "month" ? { month: "short", year: "2-digit" } : { month: "short", day: "numeric" }) });
		}
		const nowKey = bucketOf(now);
		if (!seen.has(nowKey)) {
			const d = new Date(`${nowKey.length === 7 ? `${nowKey}-01` : nowKey}T12:00:00`);
			buckets.push({ key: nowKey, label: d.toLocaleDateString("en-US", step === "month" ? { month: "short", year: "2-digit" } : { month: "short", day: "numeric" }) });
		}
		const valuesFor = (subset: Row[]) =>
			buckets.map((b) => aggregate(subset.filter((r) => bucketOf(new Date(r.date).getTime()) === b.key), key));
		if (!w.groupBy) return { kind: "series", buckets, series: [{ key: "all", label: measureDef(w, [...lk.typeById.values()]).label, values: valuesFor(rows) }], unit, n: rows.length };
		// At most four lines by total, the rest folded into "Other".
		const groups = groupRows(rows, w.groupBy);
		const ranked = [...groups.values()].sort((a, b) => aggregate(b.rows, key) - aggregate(a.rows, key));
		const top = ranked.slice(0, 4);
		const other = ranked.slice(4).flatMap((g) => g.rows);
		const series = top.map((g) => ({ key: g.group.key, label: g.group.label, color: g.group.color, values: valuesFor(g.rows) }));
		if (other.length) series.push({ key: "__other__", label: "Other", color: "#94A3B8", values: valuesFor(other) });
		return { kind: "series", buckets, series, unit, n: rows.length };
	}

	// Grouped charts (columns, bars, donut, table).
	const groups = groupRows(rows, w.groupBy || "__all__");
	let slices: (Slice & { order?: number })[] = [...groups.values()].map((g) => ({ key: g.group.key, label: g.group.label, color: g.group.color, order: g.group.order, value: aggregate(g.rows, key) }));
	const natural = slices.some((s) => s.order !== undefined);
	slices.sort((a, b) => (natural ? (a.order ?? 99) - (b.order ?? 99) : b.value - a.value) || a.label.localeCompare(b.label));
	if (slices.length > w.limit) {
		const byValue = [...slices].sort((a, b) => b.value - a.value);
		const keep = new Set(byValue.slice(0, w.limit - 1).map((s) => s.key));
		const rest = slices.filter((s) => !keep.has(s.key));
		const restRows = rest.flatMap((s) => groups.get(s.key)?.rows ?? []);
		slices = [...slices.filter((s) => keep.has(s.key)), { key: "__other__", label: `Other (${rest.length})`, color: "#94A3B8", value: aggregate(restRows, key) }];
	}
	const total = key.startsWith("avg") ? aggregate(rows, key) : slices.reduce((s, x) => s + x.value, 0);
	return { kind: "groups", slices, total, unit, n: rows.length };
}

function groupRows(rows: Row[], dim: string) {
	const map = new Map<string, { group: Group; rows: Row[] }>();
	for (const r of rows) {
		const g = dim === "__all__" ? { key: "all", label: "All" } : (r.dims[dim] ?? NONE);
		if (!map.has(g.key)) map.set(g.key, { group: g, rows: [] });
		map.get(g.key)!.rows.push(r);
	}
	return map;
}

/* ----------------------------- Colors & format ---------------------- */

/** Validated categorical order (colorblind-safe adjacent pairs on white). */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

/**
 * An entity keeps its own color (a type, a stage); anything else gets the
 * categorical slot of its position in a stable (alphabetical) order, so a
 * filter never repaints the survivors.
 */
export function colorsFor(items: { key: string; label: string; color?: string }[]): Map<string, string> {
	const out = new Map<string, string>();
	const plain = items.filter((i) => !i.color && i.key !== "__other__").sort((a, b) => a.label.localeCompare(b.label));
	plain.forEach((i, k) => out.set(i.key, SERIES_COLORS[k % SERIES_COLORS.length]));
	for (const i of items) if (i.color) out.set(i.key, toneOf(i.color)?.solid ?? i.color);
	return out;
}

export function formatValue(v: number, unit: Unit, compact = false): string {
	if (!Number.isFinite(v)) return "—";
	if (unit === "money") return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0, notation: compact && Math.abs(v) >= 10_000 ? "compact" : "standard" });
	if (unit === "days") return `${v.toFixed(v < 10 ? 1 : 0)} d`;
	if (unit === "hours") return `${v.toFixed(v < 10 ? 1 : 0)} h`;
	if (unit === "count") return Math.round(v).toLocaleString("en-US");
	return v.toLocaleString("en-US", { maximumFractionDigits: 1, notation: compact && Math.abs(v) >= 10_000 ? "compact" : "standard" });
}
