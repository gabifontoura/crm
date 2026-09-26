/**
 * Custom dashboards: a grid of widgets, each one a question asked of the CRM's
 * data ("tickets by type", "leads by stage", "visits per month"). The data is
 * computed in the browser from what the viewer is allowed to see, so a shared
 * dashboard shows each person their own slice. Imports use ".js" so the file
 * also runs as plain Node ESM on Vercel.
 */
import type { UserRole } from "./users.js";

export type DataSource = "tickets" | "contacts" | "appointments";
export type ChartKind = "kpi" | "column" | "bar" | "line" | "donut" | "table";
export type MeasureOp = "count" | "sum" | "avg";
export type DateRange = "inherit" | "7d" | "30d" | "90d" | "12m" | "all";
/** Grid columns out of 4 on wide screens. */
export type WidgetSize = 1 | 2 | 3 | 4;

export interface WidgetFilters {
	/** Ticket type, for ticket widgets. */
	typeId?: string | null;
	/** Open or closed tickets / leads; "all" keeps both. */
	state?: "all" | "open" | "closed";
	/** Only this person's tickets, leads or appointments ("me" = the viewer). */
	ownerId?: string | null;
}

export interface Widget {
	id: string;
	title: string;
	source: DataSource;
	chart: ChartKind;
	measure: { op: MeasureOp; field?: string };
	/** Dimension to group by (not used by KPI; for lines it splits the series). */
	groupBy?: string | null;
	range: DateRange;
	filters: WidgetFilters;
	size: WidgetSize;
	/** Most groups shown; the rest fold into "Other". */
	limit: number;
}

/** Who a dashboard is shared with, besides its owner (and administrators). */
export interface DashboardAudience {
	roles: UserRole[];
	users: string[];
}

export const NO_AUDIENCE: DashboardAudience = { roles: [], users: [] };

/** Whether this person sees the dashboard: its owner, an admin, everyone when shared, or someone it's shared with. */
export function sharedWith(d: Pick<Dashboard, "ownerId" | "shared" | "shareWith">, me: { id: string; role: UserRole }): boolean {
	return d.shared || d.ownerId === me.id || me.role === "admin" || Boolean(d.shareWith?.roles.includes(me.role) || d.shareWith?.users.includes(me.id));
}

export interface Dashboard {
	id: string;
	name: string;
	description: string;
	ownerId: string;
	/** Visible to everyone (each person sees their own data in it). */
	shared: boolean;
	/** Otherwise, the accesses and people it's shared with. */
	shareWith?: DashboardAudience;
	/** Date range applied to widgets set to "inherit". */
	range: Exclude<DateRange, "inherit">;
	widgets: Widget[];
	createdAt: string;
	updatedAt: string;
}

export const CHART_KINDS: { id: ChartKind; label: string; hint: string }[] = [
	{ id: "kpi", label: "Number", hint: "One headline figure" },
	{ id: "column", label: "Columns", hint: "Compare a few groups" },
	{ id: "bar", label: "Bars", hint: "Compare many groups or long names" },
	{ id: "line", label: "Line", hint: "Change over time" },
	{ id: "donut", label: "Donut", hint: "Share of a whole (few groups)" },
	{ id: "table", label: "Table", hint: "Exact values" },
];

export const RANGES: { id: Exclude<DateRange, "inherit">; label: string; days: number | null }[] = [
	{ id: "7d", label: "Last 7 days", days: 7 },
	{ id: "30d", label: "Last 30 days", days: 30 },
	{ id: "90d", label: "Last 90 days", days: 90 },
	{ id: "12m", label: "Last 12 months", days: 365 },
	{ id: "all", label: "All time", days: null },
];

export const SOURCES: { id: DataSource; label: string; noun: string }[] = [
	{ id: "tickets", label: "Tickets", noun: "tickets" },
	{ id: "contacts", label: "Leads (Contacts)", noun: "leads" },
	{ id: "appointments", label: "Appointments (Calendar)", noun: "appointments" },
];

const CHARTS = CHART_KINDS.map((c) => c.id);
const RANGE_IDS: DateRange[] = ["inherit", "7d", "30d", "90d", "12m", "all"];
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

/** Keeps a widget sent by the client to known values. */
export function sanitizeWidget(raw: unknown, i: number): Widget {
	const w = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
	const m = (w.measure && typeof w.measure === "object" ? w.measure : {}) as Record<string, unknown>;
	const f = (w.filters && typeof w.filters === "object" ? w.filters : {}) as Record<string, unknown>;
	const size = Number(w.size);
	return {
		id: str(w.id, 40) || `w${i + 1}`,
		title: str(w.title, 120) || "Untitled",
		source: (["tickets", "contacts", "appointments"] as const).includes(w.source as DataSource) ? (w.source as DataSource) : "tickets",
		chart: CHARTS.includes(w.chart as ChartKind) ? (w.chart as ChartKind) : "column",
		measure: { op: (["count", "sum", "avg"] as const).includes(m.op as MeasureOp) ? (m.op as MeasureOp) : "count", field: str(m.field, 60) || undefined },
		groupBy: str(w.groupBy, 60) || null,
		range: RANGE_IDS.includes(w.range as DateRange) ? (w.range as DateRange) : "inherit",
		filters: {
			typeId: str(f.typeId, 60) || null,
			state: (["all", "open", "closed"] as const).includes(f.state as "all") ? (f.state as "all") : "all",
			ownerId: str(f.ownerId, 60) || null,
		},
		size: ([1, 2, 3, 4] as const).includes(size as WidgetSize) ? (size as WidgetSize) : 2,
		limit: Math.min(20, Math.max(2, Math.round(Number(w.limit) || 8))),
	};
}

/* --------------------------------- Seed ---------------------------------- */

const w = (id: string, title: string, rest: Partial<Widget>): Widget => ({
	id,
	title,
	source: "tickets",
	chart: "column",
	measure: { op: "count" },
	groupBy: null,
	range: "inherit",
	filters: { state: "all" },
	size: 2,
	limit: 8,
	...rest,
});

/** Two ready-made dashboards so the module isn't empty on day one. */
export function seedDashboards(adminId: string, now: Date): Dashboard[] {
	const at = now.toISOString();
	return [
		{
			id: "db-service",
			name: "Service overview",
			description: "Open work, deadlines and how fast tickets get solved.",
			ownerId: adminId,
			shared: true,
			range: "90d",
			createdAt: at,
			updatedAt: at,
			widgets: [
				w("s1", "Open tickets", { chart: "kpi", filters: { state: "open" }, size: 1 }),
				w("s2", "Overdue", { chart: "kpi", groupBy: null, measure: { op: "count", field: "overdue" }, filters: { state: "open" }, size: 1 }),
				w("s3", "Average days to close", { chart: "kpi", measure: { op: "avg", field: "days_to_close" }, filters: { state: "closed" }, size: 1 }),
				w("s4", "Repair cost", { chart: "kpi", measure: { op: "sum", field: "field:repair_cost" }, size: 1 }),
				w("s5", "Tickets opened over time", { chart: "line", groupBy: "type", size: 2 }),
				w("s6", "Where open tickets are", { chart: "column", groupBy: "stage", filters: { state: "open" }, size: 2 }),
				w("s7", "Open tickets by assignee", { chart: "bar", groupBy: "assignee", filters: { state: "open" }, size: 2 }),
				w("s8", "Tickets by priority", { chart: "donut", groupBy: "priority", size: 2 }),
			],
		},
		{
			id: "db-sales",
			name: "Sales & leads",
			description: "The lead portfolio and the sales calendar.",
			ownerId: adminId,
			shared: true,
			range: "12m",
			createdAt: at,
			updatedAt: at,
			widgets: [
				w("l1", "Open leads", { source: "contacts", chart: "kpi", filters: { state: "open" }, size: 1 }),
				w("l2", "Pipeline budget", { source: "contacts", chart: "kpi", measure: { op: "sum", field: "budget" }, filters: { state: "open" }, size: 1 }),
				w("l3", "Hot leads", { source: "contacts", chart: "kpi", measure: { op: "count", field: "hot" }, filters: { state: "open" }, size: 1 }),
				w("l4", "Unit showings", { source: "appointments", chart: "kpi", filters: { state: "all", typeId: "unit_showing" }, size: 1 }),
				w("l5", "Leads by stage", { source: "contacts", chart: "column", groupBy: "stage", size: 2 }),
				w("l6", "Leads by source", { source: "contacts", chart: "donut", groupBy: "source", size: 2 }),
				w("l7", "Portfolio by broker", { source: "contacts", chart: "bar", groupBy: "owner", filters: { state: "open" }, size: 2 }),
				w("l8", "Appointments per month", { source: "appointments", chart: "line", groupBy: "type", size: 2 }),
			],
		},
	];
}
