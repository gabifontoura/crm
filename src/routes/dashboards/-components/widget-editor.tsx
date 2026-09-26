import { ChartBarHorizontalIcon, ChartBarIcon, ChartDonutIcon, ChartLineIcon, HashIcon, TableIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { cn } from "#/lib/utils";
import { CHART_KINDS, type ChartKind, type DataSource, type DateRange, RANGES, SOURCES, type Widget } from "../../../../shared/dashboards";
import type { TicketType } from "../../../../shared/tickets";
import { computeWidget, type DataSet, DIMENSIONS, type Lookups, measureKey, measuresFor } from "./engine";
import { describe, WidgetBody } from "./widget-view";

const ANY = "__any__";
const CHART_ICON: Record<ChartKind, ReactNode> = {
	kpi: <HashIcon className="size-5" />,
	column: <ChartBarIcon className="size-5" />,
	bar: <ChartBarHorizontalIcon className="size-5" />,
	line: <ChartLineIcon className="size-5" />,
	donut: <ChartDonutIcon className="size-5" />,
	table: <TableIcon className="size-5" />,
};

/** Suggested title from the choices, used until the admin types their own. */
function autoTitle(w: Widget, types: TicketType[]) {
	const m = measuresFor(w.source, types).find((x) => x.key === measureKey(w))?.label ?? "Value";
	const dim = DIMENSIONS[w.source].find((d) => d.id === w.groupBy)?.label.split(" (")[0].toLowerCase();
	if (w.chart === "kpi") return m;
	if (w.chart === "line") return `${m} over time${dim ? ` by ${dim}` : ""}`;
	return dim ? `${m} by ${dim}` : m;
}

/**
 * Builds one widget: what to count (source + measure), how to split it
 * (group by), which slice of the data (range + filters) and how to show it,
 * with a live preview on the real data.
 */
export function WidgetEditor({
	initial,
	data,
	lk,
	types,
	dashboardRange,
	people,
	onClose,
	onSave,
}: {
	initial: Widget;
	data: DataSet;
	lk: Lookups;
	types: TicketType[];
	dashboardRange: Exclude<DateRange, "inherit">;
	people: { id: string; name: string }[];
	onClose: () => void;
	onSave: (w: Widget) => void;
}) {
	const [w, setW] = useState<Widget>(initial);
	const [titleTouched, setTitleTouched] = useState(initial.title !== autoTitle(initial, types) && initial.title !== "New widget");
	const set = (patch: Partial<Widget>) => setW((x) => ({ ...x, ...patch }));
	useEffect(() => {
		if (!titleTouched) setW((x) => ({ ...x, title: autoTitle(x, types) }));
	}, [w.source, w.chart, w.measure.op, w.measure.field, w.groupBy, titleTouched, types]);

	const measures = measuresFor(w.source, types);
	const dims = DIMENSIONS[w.source];
	const needsGroup = w.chart !== "kpi" && w.chart !== "line";
	const result = useMemo(() => computeWidget(w, dashboardRange, data, lk), [w, dashboardRange, data, lk]);
	const d = describe(w, lk, dashboardRange);
	const problem = needsGroup && !w.groupBy ? "Pick what to group by." : null;

	function pickSource(source: DataSource) {
		// Measures and groups differ per source: start from the plain count.
		set({ source, measure: { op: "count" }, groupBy: needsGroup ? DIMENSIONS[source][0].id : null, filters: { state: "all" } });
	}
	function pickChart(chart: ChartKind) {
		set({
			chart,
			groupBy: chart === "kpi" ? null : chart === "line" ? w.groupBy : (w.groupBy ?? dims[0].id),
			limit: chart === "donut" ? Math.min(w.limit, 6) : w.limit,
			size: chart === "kpi" ? 1 : w.size === 1 ? 2 : w.size,
		});
	}

	const row = (label: string, node: ReactNode, hint?: string) => (
		<div className="flex flex-col gap-1.5">
			<Label className="text-xs">{label}</Label>
			{node}
			{hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
		</div>
	);

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="!flex !max-h-[92vh] !max-w-[95vw] flex-col !gap-0 !p-0 lg:!max-w-5xl">
				<div className="border-b px-6 pt-6 pb-4">
					<DialogTitle>{initial.id.startsWith("new") ? "Add a widget" : "Edit widget"}</DialogTitle>
					<DialogDescription className="mt-1">Choose what to measure and how to show it. The preview uses your live data.</DialogDescription>
				</div>
				<div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:overflow-hidden">
					<div className="flex flex-col gap-4 p-6 lg:overflow-y-auto">
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">Show as</Label>
							<div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6" role="radiogroup" aria-label="Chart type">
								{CHART_KINDS.map((c) => (
									<button
										key={c.id}
										type="button"
										role="radio"
										aria-checked={w.chart === c.id}
										title={c.hint}
										onClick={() => pickChart(c.id)}
										className={cn(
											"flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-[11px]",
											w.chart === c.id ? "border-brand bg-brand/5 text-brand" : "border-border text-muted-foreground hover:bg-muted",
										)}
									>
										{CHART_ICON[c.id]}
										{c.label}
									</button>
								))}
							</div>
						</div>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							{row(
								"Data",
								<Select value={w.source} onValueChange={(v) => pickSource(v as DataSource)}>
									<SelectTrigger className="h-9">
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
							{row(
								"Measure",
								<Select
									value={measureKey(w)}
									onValueChange={(v) => {
										const [op, ...f] = v.split(":");
										set({ measure: { op: op as Widget["measure"]["op"], field: f.join(":") || undefined } });
									}}
								>
									<SelectTrigger className="h-9">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{measures.map((m) => (
											<SelectItem key={m.key} value={m.key}>
												{m.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>,
							)}
							{w.chart !== "kpi" &&
								row(
									w.chart === "line" ? "One line per" : "Group by",
									<Select value={w.groupBy ?? ANY} onValueChange={(v) => set({ groupBy: v === ANY ? null : v })}>
										<SelectTrigger className="h-9">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{w.chart === "line" && <SelectItem value={ANY}>A single line</SelectItem>}
											{dims.map((dm) => (
												<SelectItem key={dm.id} value={dm.id}>
													{dm.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>,
									w.chart === "line" ? "Up to four lines; the rest are added up as Other." : undefined,
								)}
							{needsGroup &&
								row(
									"Show at most",
									<Select value={String(w.limit)} onValueChange={(v) => set({ limit: Number(v) })}>
										<SelectTrigger className="h-9">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{[4, 6, 8, 10, 12, 20].map((n) => (
												<SelectItem key={n} value={String(n)}>
													{n} groups
												</SelectItem>
											))}
										</SelectContent>
									</Select>,
									"The smallest ones fold into Other.",
								)}
							{row(
								"Period",
								<Select value={w.range} onValueChange={(v) => set({ range: v as DateRange })}>
									<SelectTrigger className="h-9">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="inherit">Same as the dashboard</SelectItem>
										{RANGES.map((r) => (
											<SelectItem key={r.id} value={r.id}>
												{r.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>,
								w.source === "appointments" ? "Appointments by their date." : "By the date it was created.",
							)}
							{row(
								w.source === "appointments" ? "Which ones" : "Open or closed",
								<Select value={w.filters.state ?? "all"} onValueChange={(v) => set({ filters: { ...w.filters, state: v as "all" } })}>
									<SelectTrigger className="h-9">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All</SelectItem>
										<SelectItem value="open">{w.source === "appointments" ? "Not completed" : "Open only (right now)"}</SelectItem>
										<SelectItem value="closed">{w.source === "appointments" ? "Completed" : "Closed only"}</SelectItem>
									</SelectContent>
								</Select>,
								w.filters.state === "open" && w.chart !== "line" ? "Open work counts whenever it was created." : undefined,
							)}
							{w.source !== "contacts" &&
								row(
									w.source === "tickets" ? "Ticket type" : "Appointment type",
									<Select value={w.filters.typeId ?? ANY} onValueChange={(v) => set({ filters: { ...w.filters, typeId: v === ANY ? null : v } })}>
										<SelectTrigger className="h-9">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={ANY}>All types</SelectItem>
											{(w.source === "tickets"
												? types.map((t) => ({ id: t.id, label: t.name }))
												: [...new Set(data.events.map((e) => e.type))].map((id) => ({ id, label: lk.appointment(id).label }))
											).map((t) => (
												<SelectItem key={t.id} value={t.id}>
													{t.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>,
								)}
							{row(
								"Whose",
								<Select value={w.filters.ownerId ?? ANY} onValueChange={(v) => set({ filters: { ...w.filters, ownerId: v === ANY ? null : v } })}>
									<SelectTrigger className="h-9">
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
						</div>
						{row(
							"Title",
							<Input
								value={w.title}
								onChange={(e) => {
									setTitleTouched(true);
									set({ title: e.target.value });
								}}
							/>,
							titleTouched ? undefined : "Written for you from the choices above; type to change it.",
						)}
					</div>

					<div className="flex min-h-72 flex-col gap-2 border-t bg-muted/20 p-6 lg:border-t-0 lg:border-l">
						<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Preview</span>
						<div className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
							<div>
								<h3 className="truncate font-semibold text-sm">{w.title || "Untitled"}</h3>
								<p className="truncate text-muted-foreground text-xs">{d.line}</p>
							</div>
							{problem ? <p className="text-muted-foreground text-sm">{problem}</p> : <WidgetBody widget={w} result={result} rangeLabel={d.rangeLabel} asTable={false} />}
						</div>
						<p className="text-[11px] text-muted-foreground">
							Based on {result.n} {SOURCES.find((s) => s.id === w.source)?.noun}. Everyone sees this widget with the data they're allowed to see.
						</p>
					</div>
				</div>
				<div className="flex justify-end gap-2 border-t px-6 py-3">
					<Button variant="secondary" size="sm" onClick={onClose}>
						Cancel
					</Button>
					<Button size="sm" disabled={Boolean(problem) || !w.title.trim()} onClick={() => onSave({ ...w, title: w.title.trim() })}>
						{initial.id.startsWith("new") ? "Add to dashboard" : "Apply"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
