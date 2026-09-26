/**
 * Reports: saved tables of records (tickets, appointments, leads) for a closed
 * period, with the columns, filters, grouping and sorting someone chose.
 * Rows are built in the browser from what the viewer may see, like dashboards.
 * Imports use ".js" so the file also runs as plain Node ESM on Vercel.
 */

export type ReportSource = "tickets" | "appointments" | "contacts";

/** A named period ("last month") or fixed dates. */
export type PeriodKind = "this_month" | "last_month" | "7d" | "30d" | "90d" | "this_year" | "all" | "custom";

export interface ReportPeriod {
	kind: PeriodKind;
	/** YYYY-MM-DD, for "custom". */
	from?: string | null;
	to?: string | null;
}

export interface ReportFilters {
	state: "all" | "open" | "closed";
	typeId?: string | null;
	/** A person, or "me" for whoever is viewing. */
	ownerId?: string | null;
	/** Only records with this flag: overdue, hot, due, completed. */
	flag?: string | null;
}

export interface Report {
	id: string;
	name: string;
	description: string;
	ownerId: string;
	shared: boolean;
	source: ReportSource;
	/** Column ids, in order. */
	columns: string[];
	/** Which date the period applies to (created, closed, due…). */
	dateField: string;
	period: ReportPeriod;
	filters: ReportFilters;
	/** A column to group rows by, with subtotals. */
	groupBy: string | null;
	sort: { column: string; dir: "asc" | "desc" };
	createdAt: string;
	updatedAt: string;
}

export const PERIODS: { id: PeriodKind; label: string }[] = [
	{ id: "this_month", label: "This month" },
	{ id: "last_month", label: "Last month" },
	{ id: "7d", label: "Last 7 days" },
	{ id: "30d", label: "Last 30 days" },
	{ id: "90d", label: "Last 90 days" },
	{ id: "this_year", label: "This year" },
	{ id: "all", label: "All time" },
	{ id: "custom", label: "Custom dates" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Start (inclusive) and end (exclusive) of a period, as local dates; null = no limit. */
export function periodBounds(p: ReportPeriod, now = new Date()): { from: Date | null; to: Date | null; label: string } {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const days = (n: number) => ({ from: new Date(today.getTime() - (n - 1) * 86_400_000), to: new Date(today.getTime() + 86_400_000) });
	const month = (y: number, m: number) => ({ from: new Date(y, m, 1), to: new Date(y, m + 1, 1) });
	const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
	switch (p.kind) {
		case "this_month": {
			const b = month(now.getFullYear(), now.getMonth());
			return { ...b, label: b.from.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
		}
		case "last_month": {
			const b = month(now.getFullYear(), now.getMonth() - 1);
			return { ...b, label: b.from.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
		}
		case "7d":
		case "30d":
		case "90d": {
			const b = days(Number(p.kind.replace("d", "")));
			return { ...b, label: `${fmt(b.from)} – ${fmt(today)}` };
		}
		case "this_year":
			return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1), label: String(now.getFullYear()) };
		case "custom": {
			const from = p.from ? new Date(`${p.from}T00:00:00`) : null;
			const to = p.to ? new Date(new Date(`${p.to}T00:00:00`).getTime() + 86_400_000) : null;
			return { from, to, label: `${from ? fmt(from) : "Start"} – ${p.to ? fmt(new Date(`${p.to}T00:00:00`)) : "today"}` };
		}
		default:
			return { from: null, to: null, label: "All time" };
	}
}

export { ymd as toYmd };

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

/** Keeps a report sent by the client to known shapes (column ids are checked in the browser). */
export function sanitizeReportBody(body: Record<string, unknown>, current?: Report) {
	const period = (body.period && typeof body.period === "object" ? body.period : (current?.period ?? {})) as Record<string, unknown>;
	const filters = (body.filters && typeof body.filters === "object" ? body.filters : (current?.filters ?? {})) as Record<string, unknown>;
	const sort = (body.sort && typeof body.sort === "object" ? body.sort : (current?.sort ?? {})) as Record<string, unknown>;
	const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
	return {
		name: str(body.name ?? current?.name, 100).trim(),
		description: str(body.description ?? current?.description, 300).trim(),
		shared: typeof body.shared === "boolean" ? body.shared : (current?.shared ?? false),
		source: (["tickets", "appointments", "contacts"] as const).includes(body.source as ReportSource) ? (body.source as ReportSource) : (current?.source ?? "tickets"),
		columns: Array.isArray(body.columns) ? body.columns.map((c) => str(c, 60)).filter(Boolean).slice(0, 40) : (current?.columns ?? []),
		dateField: str(body.dateField ?? current?.dateField, 40) || "created",
		period: {
			kind: PERIODS.some((x) => x.id === period.kind) ? (period.kind as PeriodKind) : "30d",
			from: date(period.from),
			to: date(period.to),
		},
		filters: {
			state: (["all", "open", "closed"] as const).includes(filters.state as "all") ? (filters.state as "all") : "all",
			typeId: str(filters.typeId, 60) || null,
			ownerId: str(filters.ownerId, 60) || null,
			flag: str(filters.flag, 40) || null,
		},
		groupBy: "groupBy" in body ? str(body.groupBy, 60) || null : (current?.groupBy ?? null),
		sort: { column: str(sort.column, 60) || "", dir: sort.dir === "asc" ? ("asc" as const) : ("desc" as const) },
	};
}

/* --------------------------------- Seed ---------------------------------- */

type SeedReport = Omit<Report, "ownerId" | "createdAt" | "updatedAt">;

const SEEDS: SeedReport[] = [
	{
		id: "rp-hours",
		name: "Technician hours & expenses",
		description: "Time on site and parts per team member: for payroll and billing.",
		shared: true,
		source: "appointments",
		columns: ["date", "owner", "title", "type", "ticket", "hours", "expenses", "state"],
		dateField: "date",
		period: { kind: "30d" },
		filters: { state: "all" },
		groupBy: "owner",
		sort: { column: "date", dir: "asc" },
	},
	{
		id: "rp-sla",
		name: "SLA compliance",
		description: "Closed tickets: solved within their deadline or late, and by how long.",
		shared: true,
		source: "tickets",
		columns: ["number", "title", "type", "assignee", "created", "due", "closed", "days_to_close", "on_time"],
		dateField: "closed",
		period: { kind: "90d" },
		filters: { state: "closed" },
		groupBy: "type",
		sort: { column: "closed", dir: "desc" },
	},
	{
		id: "rp-warranty",
		name: "Warranty by development",
		description: "Defects, cost and coverage per development, to hand to the builder.",
		shared: true,
		source: "tickets",
		columns: ["number", "title", "field:defect", "location", "status", "field:covered", "field:repair_cost", "created"],
		dateField: "created",
		period: { kind: "this_year" },
		filters: { state: "all", typeId: "tt-warranty" },
		groupBy: "development",
		sort: { column: "created", dir: "desc" },
	},
	{
		id: "rp-overdue",
		name: "Overdue tickets",
		description: "Open tickets past their deadline, oldest first.",
		shared: true,
		source: "tickets",
		columns: ["number", "title", "type", "priority", "assignee", "due", "days_overdue", "status"],
		dateField: "created",
		period: { kind: "all" },
		filters: { state: "open", flag: "overdue" },
		groupBy: null,
		sort: { column: "days_overdue", dir: "desc" },
	},
	{
		id: "rp-visits",
		name: "Visit service reports",
		description: "Completed visits: actions approved, rejected and left for later, satisfaction and signature.",
		shared: true,
		source: "appointments",
		columns: ["date", "owner", "ticket", "type", "approved", "rejected", "later", "hours", "satisfaction", "signed"],
		dateField: "date",
		period: { kind: "90d" },
		filters: { state: "closed" },
		groupBy: null,
		sort: { column: "date", dir: "desc" },
	},
	{
		id: "rp-pipeline",
		name: "Broker pipeline",
		description: "Every lead in each portfolio with its stage, budget and follow-ups.",
		shared: true,
		source: "contacts",
		columns: ["name", "stage", "temperature", "source", "budget", "last_contact", "next_follow_up"],
		dateField: "created",
		period: { kind: "all" },
		filters: { state: "open" },
		groupBy: "owner",
		sort: { column: "next_follow_up", dir: "asc" },
	},
];

export function seedReports(adminId: string, now: Date): Report[] {
	const at = now.toISOString();
	return SEEDS.map((r) => ({ ...r, ownerId: adminId, createdAt: at, updatedAt: at }));
}
