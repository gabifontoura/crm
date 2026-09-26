import {
	ArrowDownIcon,
	ListBulletsIcon,
	ArrowUpIcon,
	ChartBarIcon,
	CopyIcon,
	DotsSixVerticalIcon,
	PencilSimpleIcon,
	TableIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { cn } from "#/lib/utils";
import { type DateRange, RANGES, type Widget, type WidgetSize } from "../../../../shared/dashboards";
import type { Report } from "../../../../shared/reports";
import { BarView, ColumnView, DonutView, KpiView, LineView, TableView } from "./charts";
import { computeWidget, type DataSet, effectiveRange, type Lookups, measureDef, type Result } from "./engine";

export const SIZE_CLASS: Record<WidgetSize, string> = {
	1: "col-span-1",
	2: "col-span-1 md:col-span-2",
	3: "col-span-1 md:col-span-2 xl:col-span-3",
	4: "col-span-1 md:col-span-2 xl:col-span-4",
};

/** The chart for a computed result (also used by the editor's preview). */
export function WidgetBody({ widget, result, rangeLabel, asTable }: { widget: Widget; result: Result; rangeLabel: string; asTable: boolean }) {
	if (asTable || widget.chart === "table") return <TableView result={result} />;
	if (result.kind === "kpi") return <KpiView result={result} rangeLabel={rangeLabel} />;
	if (result.kind === "series") return <LineView result={result} />;
	if (widget.chart === "bar") return <BarView slices={result.slices} unit={result.unit} />;
	if (widget.chart === "donut") return <DonutView slices={result.slices} unit={result.unit} total={result.total} />;
	return <ColumnView slices={result.slices} unit={result.unit} />;
}

export function describe(widget: Widget, lk: Lookups, dashboardRange: Exclude<DateRange, "inherit">) {
	const range = effectiveRange(widget, dashboardRange);
	const measure = measureDef(widget, [...lk.typeById.values()]).label;
	const snapshot = widget.filters.state === "open" && widget.chart !== "line";
	return { range, rangeLabel: RANGES.find((r) => r.id === range)?.label ?? "", line: `${measure} · ${snapshot ? "open now" : (RANGES.find((r) => r.id === range)?.label ?? "")}` };
}

const REPORT_COLUMNS: Record<Widget["source"], string[]> = {
	tickets: ["number", "title", "type", "status", "priority", "assignee", "created", "due"],
	appointments: ["date", "title", "type", "owner", "state", "hours", "expenses"],
	contacts: ["name", "stage", "temperature", "source", "owner", "budget", "next_follow_up"],
};
/** Dashboard groups that have a matching report column. */
const GROUP_COLUMN: Record<string, string> = { due: "on_time" };

/** The rows behind a widget, as an unsaved report. */
export function toReportDraft(w: Widget, dashboardRange: Exclude<DateRange, "inherit">): Partial<Report> {
	const range = effectiveRange(w, dashboardRange);
	const snapshot = w.filters.state === "open" && w.chart !== "line";
	const flag = w.measure.op === "count" && w.measure.field ? w.measure.field : null;
	const since = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
	const period: Report["period"] = snapshot || range === "all" ? { kind: "all" } : range === "12m" ? { kind: "custom", from: since, to: null } : { kind: range };
	const columns = REPORT_COLUMNS[w.source];
	const extra = w.measure.field?.startsWith("field:") ? [w.measure.field] : w.measure.field === "days_to_close" ? ["closed", "days_to_close"] : [];
	return {
		name: `Rows behind “${w.title}”`,
		description: "Opened from a dashboard. Save it to keep it.",
		source: w.source,
		columns: [...columns, ...extra.filter((c) => !columns.includes(c))],
		dateField: w.source === "appointments" ? "date" : "created",
		period,
		filters: { state: w.filters.state ?? "all", typeId: w.filters.typeId ?? null, ownerId: w.filters.ownerId ?? null, flag },
		groupBy: w.groupBy ? (GROUP_COLUMN[w.groupBy] ?? w.groupBy) : null,
		sort: { column: columns[columns.length - 1] === "due" ? "created" : columns[0], dir: "desc" },
	};
}

/** One tile of the dashboard: title, chart, a table toggle and (while editing) its tools. */
export function WidgetCard({
	widget,
	data,
	lk,
	dashboardRange,
	editing,
	isFirst,
	isLast,
	dragging,
	onEdit,
	onDuplicate,
	onDelete,
	onMove,
	onResize,
	dragProps,
}: {
	widget: Widget;
	data: DataSet;
	lk: Lookups;
	dashboardRange: Exclude<DateRange, "inherit">;
	editing: boolean;
	isFirst: boolean;
	isLast: boolean;
	dragging: boolean;
	onEdit: () => void;
	onDuplicate: () => void;
	onDelete: () => void;
	onMove: (delta: number) => void;
	onResize: (size: WidgetSize) => void;
	dragProps: React.HTMLAttributes<HTMLElement> & { draggable?: boolean };
}) {
	const [asTable, setAsTable] = useState(false);
	const result = useMemo(() => computeWidget(widget, dashboardRange, data, lk), [widget, dashboardRange, data, lk]);
	const d = describe(widget, lk, dashboardRange);
	const canTable = widget.chart !== "table";
	const navigate = useNavigate();

	return (
		<section
			aria-label={widget.title}
			{...(editing ? dragProps : {})}
			className={cn(
				"flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm",
				SIZE_CLASS[widget.size],
				editing && "border-dashed",
				dragging && "opacity-50",
			)}
		>
			<header className="flex items-start justify-between gap-2">
				<div className="flex min-w-0 items-start gap-1.5">
					{editing && <DotsSixVerticalIcon className="mt-0.5 size-4 shrink-0 cursor-grab text-muted-foreground" aria-label="Drag to reorder" />}
					<div className="min-w-0">
						<h3 className="truncate font-semibold text-sm">{widget.title}</h3>
						<p className="truncate text-muted-foreground text-xs">{d.line}</p>
					</div>
				</div>
				<div className="flex shrink-0 items-center">
					{!editing && (
						<IconButton
							label="See the rows (report)"
							onClick={() => navigate({ to: "/reports", search: { draft: JSON.stringify(toReportDraft(widget, dashboardRange)) } })}
						>
							<ListBulletsIcon className="size-4" />
						</IconButton>
					)}
					{canTable && (
						<IconButton label={asTable ? "Show chart" : "Show as table"} onClick={() => setAsTable((v) => !v)}>
							{asTable ? <ChartBarIcon className="size-4" /> : <TableIcon className="size-4" />}
						</IconButton>
					)}
				</div>
			</header>
			{editing && (
				// Tools get their own row so narrow widgets keep their title.
				<div className="flex flex-wrap items-center justify-between gap-1 border-border border-y border-dashed py-1 text-xs">
					<div className="flex items-center gap-1" role="radiogroup" aria-label="Width">
						<span className="mr-0.5 text-muted-foreground">Width</span>
						{([1, 2, 3, 4] as WidgetSize[]).map((s) => (
							<button
								key={s}
								type="button"
								role="radio"
								aria-checked={widget.size === s}
								onClick={() => onResize(s)}
								className={cn("rounded border px-1.5 py-0.5", widget.size === s ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground hover:bg-muted")}
							>
								{s}/4
							</button>
						))}
					</div>
					<div className="flex items-center">
							<IconButton label="Edit widget" onClick={onEdit}>
								<PencilSimpleIcon className="size-4" />
							</IconButton>
							<IconButton label="Duplicate widget" onClick={onDuplicate}>
								<CopyIcon className="size-4" />
							</IconButton>
							<IconButton label="Move earlier" onClick={() => onMove(-1)} disabled={isFirst}>
								<ArrowUpIcon className="size-4" />
							</IconButton>
							<IconButton label="Move later" onClick={() => onMove(1)} disabled={isLast}>
								<ArrowDownIcon className="size-4" />
							</IconButton>
							<IconButton label="Remove widget" onClick={onDelete} danger>
								<TrashIcon className="size-4" />
							</IconButton>
					</div>
				</div>
			)}
			<div className="min-h-0 flex-1">
				<WidgetBody widget={widget} result={result} rangeLabel={d.rangeLabel} asTable={asTable} />
			</div>
		</section>
	);
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30",
				danger && "hover:text-destructive",
			)}
		>
			{children}
		</button>
	);
}
