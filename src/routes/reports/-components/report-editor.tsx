import { ArrowDownIcon, ArrowUpIcon, XIcon } from "@phosphor-icons/react";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import type { Report, ReportSource } from "../../../../shared/reports";
import type { TicketType } from "../../../../shared/tickets";
import { columnsFor, DATE_FIELDS, FLAGS } from "./engine";

const ANY = "__any__";

export const DEFAULT_COLUMNS: Record<ReportSource, string[]> = {
	tickets: ["number", "title", "type", "status", "assignee", "created"],
	appointments: ["date", "title", "type", "owner", "state", "hours"],
	contacts: ["name", "stage", "temperature", "owner", "budget", "next_follow_up"],
};

const SOURCES: { id: ReportSource; label: string }[] = [
	{ id: "tickets", label: "Tickets" },
	{ id: "appointments", label: "Appointments (Calendar)" },
	{ id: "contacts", label: "Leads (Contacts)" },
];

/** What the report lists and how: source, columns, filters, sorting, sharing. */
export function ReportEditor({
	report,
	types,
	appointmentTypes,
	people,
	onChange,
}: {
	report: Report;
	types: TicketType[];
	appointmentTypes: { id: string; label: string }[];
	people: { id: string; name: string }[];
	onChange: (patch: Partial<Report>) => void;
}) {
	const all = columnsFor(report.source, types);
	const chosen = report.columns.filter((id) => all.some((c) => c.id === id));
	const available = all.filter((c) => !chosen.includes(c.id));
	const label = (id: string) => all.find((c) => c.id === id)?.label ?? id;
	const move = (i: number, d: number) => {
		const next = [...chosen];
		const j = i + d;
		if (j < 0 || j >= next.length) return;
		[next[i], next[j]] = [next[j], next[i]];
		onChange({ columns: next });
	};
	const pick = (key: string, node: React.ReactNode) => (
		<div className="flex flex-col gap-1.5">
			<Label className="text-xs">{key}</Label>
			{node}
		</div>
	);

	return (
		<div className="grid grid-cols-1 gap-5 rounded-lg border border-brand/30 bg-brand/5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] print:hidden">
			<div className="flex flex-col gap-3">
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{pick("Name", <Input className="h-9 bg-card" value={report.name} onChange={(e) => onChange({ name: e.target.value })} />)}
					{pick(
						"Lists",
						<Select
							value={report.source}
							onValueChange={(v) => {
								const source = v as ReportSource;
								onChange({ source, columns: DEFAULT_COLUMNS[source], dateField: DATE_FIELDS[source][0].id, groupBy: null, sort: { column: DEFAULT_COLUMNS[source][0], dir: "desc" }, filters: { state: "all" } });
							}}
						>
							<SelectTrigger className="h-9 bg-card">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{SOURCES.map((s) => (
									<SelectItem key={s.id} value={s.id}>
										{s.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>,
					)}
				</div>
				{pick("Description", <Input className="h-9 bg-card" value={report.description} placeholder="What it's for, who reads it" onChange={(e) => onChange({ description: e.target.value })} />)}
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{pick(
						"Period applies to",
						<Select value={report.dateField} onValueChange={(v) => onChange({ dateField: v })}>
							<SelectTrigger className="h-9 bg-card">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{DATE_FIELDS[report.source].map((d) => (
									<SelectItem key={d.id} value={d.id}>
										{d.label} date
									</SelectItem>
								))}
							</SelectContent>
						</Select>,
					)}
					{pick(
						report.source === "appointments" ? "Which ones" : "Open or closed",
						<Select value={report.filters.state} onValueChange={(v) => onChange({ filters: { ...report.filters, state: v as "all" } })}>
							<SelectTrigger className="h-9 bg-card">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All</SelectItem>
								<SelectItem value="open">{report.source === "appointments" ? "Not completed" : "Open"}</SelectItem>
								<SelectItem value="closed">{report.source === "appointments" ? "Completed" : "Closed"}</SelectItem>
							</SelectContent>
						</Select>,
					)}
					{report.source !== "contacts" &&
						pick(
							"Type",
							<Select value={report.filters.typeId ?? ANY} onValueChange={(v) => onChange({ filters: { ...report.filters, typeId: v === ANY ? null : v } })}>
								<SelectTrigger className="h-9 bg-card">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ANY}>All types</SelectItem>
									{(report.source === "tickets" ? types.map((t) => ({ id: t.id, label: t.name })) : appointmentTypes).map((t) => (
										<SelectItem key={t.id} value={t.id}>
											{t.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>,
						)}
					{pick(
						"Whose",
						<Select value={report.filters.ownerId ?? ANY} onValueChange={(v) => onChange({ filters: { ...report.filters, ownerId: v === ANY ? null : v } })}>
							<SelectTrigger className="h-9 bg-card">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ANY}>Everyone I can see</SelectItem>
								<SelectItem value="me">Whoever is viewing (“mine”)</SelectItem>
								{people.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>,
					)}
					{pick(
						"Only",
						<Select value={report.filters.flag ?? ANY} onValueChange={(v) => onChange({ filters: { ...report.filters, flag: v === ANY ? null : v } })}>
							<SelectTrigger className="h-9 bg-card">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ANY}>No extra condition</SelectItem>
								{FLAGS[report.source].map((f) => (
									<SelectItem key={f.id} value={f.id}>
										{f.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>,
					)}
				</div>
				<label className="flex items-center gap-2 text-sm">
					<Switch checked={report.shared} onCheckedChange={(v) => onChange({ shared: Boolean(v) })} /> Share with the team (each person sees their own data)
				</label>
			</div>

			<div className="flex flex-col gap-2">
				<Label className="text-xs">Columns, in order</Label>
				<ul className="flex flex-col gap-1">
					{chosen.map((id, i) => (
						<li key={id} className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-sm">
							<span className="min-w-0 flex-1 truncate">{label(id)}</span>
							<button type="button" aria-label={`Move ${label(id)} left`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
								<ArrowUpIcon className="size-3.5" />
							</button>
							<button type="button" aria-label={`Move ${label(id)} right`} disabled={i === chosen.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
								<ArrowDownIcon className="size-3.5" />
							</button>
							<button
								type="button"
								aria-label={`Remove ${label(id)}`}
								disabled={chosen.length === 1}
								onClick={() => onChange({ columns: chosen.filter((c) => c !== id), groupBy: report.groupBy === id ? null : report.groupBy })}
								className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30"
							>
								<XIcon className="size-3.5" />
							</button>
						</li>
					))}
				</ul>
				{available.length > 0 && (
					<Select value="" onValueChange={(v) => onChange({ columns: [...chosen, v] })}>
						<SelectTrigger className="h-9 bg-card">
							<SelectValue placeholder="+ Add a column" />
						</SelectTrigger>
						<SelectContent>
							{available.map((c) => (
								<SelectItem key={c.id} value={c.id}>
									{c.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>
		</div>
	);
}
