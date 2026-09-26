import { CalendarDotsIcon, CalendarPlusIcon, CaretRightIcon, MagnifyingGlassIcon, TicketIcon, WrenchIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { Pagination, usePagination } from "#/components/pagination";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { formatTime } from "#/lib/format";
import { cn } from "#/lib/utils";
import type { DevelopmentTree } from "../../../../shared/developments";
import { TicketDetailsDialog } from "../../tickets/-components/ticket-details-dialog";
import { RescheduleDialog } from "./reschedule";
import { hasTicket, localYmd, PERIOD_LABELS, SERVICE_STATUS_LABELS, serviceStatusOf, type TaskKind, type TaskPeriod, taskKind, type WireEvent } from "./task-utils";

export const ALL = "__all__";

export interface TaskFilters {
	kind: TaskKind | "all";
	period: TaskPeriod;
	technician: string;
	development: string;
	block: string;
	unit: string;
	date: string;
}

interface TaskListProps {
	tasks: WireEvent[];
	developments: DevelopmentTree[];
	/** Admins filter by technician; others only see their own tasks. */
	technicians: { id: string; name: string }[] | null;
	loading: boolean;
	filters: TaskFilters;
	onFiltersChange: (f: Partial<TaskFilters>) => void;
	typeLabel: (type: string) => string;
	onSelect: (task: WireEvent) => void;
	onRescheduled: () => void;
	/** Whether the viewer may change the task (its technician or an admin); engineering only follows. */
	canManage?: (task: WireEvent) => boolean;
}

const TAB_CLASS =
	"group gap-2 rounded-lg border-none text-[13px] font-semibold text-slate-500 transition-all data-[state=active]:bg-white data-[state=active]:text-[var(--destaque)] data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-slate-200";
const COUNT_CLASS =
	"flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 px-1 text-[11px] font-semibold transition-colors group-data-[state=active]:bg-[var(--destaque)] group-data-[state=active]:text-white";

function periodOf(start: string): TaskPeriod | "other" {
	const d = dayjs(start);
	const today = dayjs().startOf("day");
	if (d.isSame(today, "day")) return "today";
	if (d.isSame(today.add(1, "day"), "day")) return "tomorrow";
	return "other";
}

/** The technician's tasks with the original filters: type, period, development / block / unit and date. */
export function TaskList({ tasks, developments, technicians, loading, filters, onFiltersChange, typeLabel, onSelect, onRescheduled, canManage = () => true }: TaskListProps) {
	const [rescheduling, setRescheduling] = useState<WireEvent | null>(null);
	const [openTicket, setOpenTicket] = useState<number | null>(null);

	// A date picked in the Date field wins over Today / Tomorrow (clicking those clears it).
	const matches = (item: WireEvent, extra: { kind?: TaskFilters["kind"]; period?: TaskPeriod } = {}) => {
		const kind = extra.kind ?? filters.kind;
		const period = extra.period ?? filters.period;
		const date = extra.period ? "" : filters.date;
		return (
			(kind === "all" || taskKind(item.type) === kind) &&
			(Boolean(date) || period === "all" || periodOf(item.start) === period) &&
			(filters.technician === ALL || item.owner.id === filters.technician) &&
			(filters.development === ALL || item.developmentId === filters.development) &&
			(filters.block === ALL || item.blockId === filters.block) &&
			(filters.unit === ALL || item.unitId === filters.unit) &&
			(!date || localYmd(new Date(item.start)) === date)
		);
	};

	// "All" lists what is still open first (by date), then finished tasks (latest first).
	const filtered = useMemo(() => {
		const list = tasks.filter((t) => matches(t));
		const open = list.filter((t) => serviceStatusOf(t) !== "completed").sort((a, b) => a.start.localeCompare(b.start));
		const done = list.filter((t) => serviceStatusOf(t) === "completed").sort((a, b) => b.start.localeCompare(a.start));
		return [...open, ...done];
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tasks, filters]);
	const paged = usePagination(filtered, { key: "tasks", resetKey: filters, initialSize: 10 });

	const countKind = (kind: TaskFilters["kind"]) => tasks.filter((t) => matches(t, { kind })).length;
	const countPeriod = (period: TaskPeriod) => tasks.filter((t) => matches(t, { period })).length;

	const devOptions = developments.filter((d) => tasks.some((t) => t.developmentId === d.id));
	const selectedDev = developments.find((d) => d.id === filters.development);
	const selectedBlock = selectedDev?.blocks.find((b) => b.id === filters.block);

	return (
		<>
			<RescheduleDialog
				task={rescheduling}
				onClose={() => setRescheduling(null)}
				onDone={() => {
					setRescheduling(null);
					onRescheduled();
				}}
			/>

			<TicketDetailsDialog ticketNumber={openTicket} onOpenChange={(o) => !o && setOpenTicket(null)} onChanged={onRescheduled} />

			<Card className="h-fit overflow-hidden rounded-lg shadow-md">
				<CardHeader className="px-6 py-4 text-center">
					<CardTitle className="font-bold text-slate-700 text-[15px] uppercase tracking-tight">Technician tasks</CardTitle>
				</CardHeader>

				<CardContent className="p-0">
					{/* FILTERS */}
					<div className="space-y-4 p-5">
						{technicians && (
							<div className="space-y-1.5">
								<Label htmlFor="filter-technician" className="font-medium text-slate-600 text-[15px]">
									Technician
								</Label>
								<Select value={filters.technician} onValueChange={(technician) => onFiltersChange({ technician })}>
									<SelectTrigger id="filter-technician" className="h-10 border-input bg-white text-[15px]" data-testid="filter_technician">
										<SelectValue placeholder="Everyone" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={ALL}>Everyone</SelectItem>
										{technicians.map((u) => (
											<SelectItem key={u.id} value={u.id}>
												{u.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}

						{/* Development */}
						<div className="space-y-1.5">
							<Label htmlFor="filter-development" className="font-medium text-slate-600 text-[15px]">
								Development
							</Label>
							<Select value={filters.development} onValueChange={(development) => onFiltersChange({ development, block: ALL, unit: ALL })}>
								<SelectTrigger id="filter-development" className="h-10 border-input bg-white text-[15px]" data-testid="filter_development">
									<SelectValue placeholder="All" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ALL}>All</SelectItem>
									{devOptions.map((d) => (
										<SelectItem key={d.id} value={d.id}>
											{d.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Block / Unit / Date */}
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
							<div className="space-y-1.5">
								<Label htmlFor="filter-block" className="font-medium text-slate-600 text-[15px]">
									Block
								</Label>
								<Select value={filters.block} onValueChange={(block) => onFiltersChange({ block, unit: ALL })} disabled={!selectedDev}>
									<SelectTrigger id="filter-block" className="h-10 border-input bg-white text-[15px]" data-testid="filter_block">
										<SelectValue placeholder="All" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={ALL}>All</SelectItem>
										{selectedDev?.blocks.map((b) => (
											<SelectItem key={b.id} value={b.id}>
												{b.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="filter-unit" className="font-medium text-slate-600 text-[15px]">
									Unit
								</Label>
								<Select value={filters.unit} onValueChange={(unit) => onFiltersChange({ unit })} disabled={!selectedBlock}>
									<SelectTrigger id="filter-unit" className="h-10 border-input bg-white text-[15px]" data-testid="filter_unit">
										<SelectValue placeholder="All" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={ALL}>All</SelectItem>
										{selectedBlock?.units.map((u) => (
											<SelectItem key={u.id} value={u.id}>
												Unit {u.number}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="filter-date" className="font-medium text-slate-600 text-[15px]">
									Date
								</Label>
								<Input
									id="filter-date"
									type="date"
									value={filters.date}
									onChange={(e) => onFiltersChange({ date: e.target.value })}
									data-testid="filter_date"
									className="h-10 rounded-lg border-input bg-white text-[15px]"
								/>
							</div>
						</div>

						{/* TYPE */}
						<Tabs value={filters.kind} onValueChange={(v) => onFiltersChange({ kind: v as TaskFilters["kind"] })} className="w-full">
							<TabsList className="grid h-11 grid-cols-3 gap-1 rounded-lg border-none bg-slate-100/80 p-1 shadow-inner">
								<TabsTrigger value="inspection" className={TAB_CLASS} data-testid="filter_inspection">
									<span className="flex items-center justify-center gap-2">
										<MagnifyingGlassIcon className="h-3.5 w-3.5 shrink-0" />
										<span>Inspection</span>
										<span className={COUNT_CLASS}>{countKind("inspection")}</span>
									</span>
								</TabsTrigger>
								<TabsTrigger value="service" className={TAB_CLASS} data-testid="filter_service">
									<span className="flex items-center justify-center gap-2">
										<WrenchIcon className="h-3.5 w-3.5 shrink-0" />
										<span>Service</span>
										<span className={COUNT_CLASS}>{countKind("service")}</span>
									</span>
								</TabsTrigger>
								<TabsTrigger value="all" className={TAB_CLASS} data-testid="filter_all_types">
									<span className="flex items-center justify-center gap-2">
										<span>All</span>
										<span className={COUNT_CLASS}>{countKind("all")}</span>
									</span>
								</TabsTrigger>
							</TabsList>
						</Tabs>

						{/* PERIOD */}
						<div className="grid h-11 w-full grid-cols-3 gap-1 rounded-lg bg-slate-100/80 p-1 shadow-inner">
							<Tabs value={filters.date ? "" : filters.period} onValueChange={(v) => onFiltersChange({ period: v as TaskPeriod, date: "" })} className="col-span-2">
								<TabsList className="grid h-full w-full grid-cols-2 gap-1 border-none bg-transparent p-0 shadow-none">
									{(["today", "tomorrow"] as TaskPeriod[]).map((period) => (
										<TabsTrigger key={period} value={period} className={TAB_CLASS} data-testid={`period_${period}`}>
											<span className="flex items-center justify-center gap-2">
												{PERIOD_LABELS[period]}
												<span className={cn(COUNT_CLASS, "px-1.5 py-0.5 font-bold text-xs text-slate-600")}>{countPeriod(period)}</span>
											</span>
										</TabsTrigger>
									))}
								</TabsList>
							</Tabs>
							{/* Everything else: all of their tickets, filtered to them. */}
							<Link
								to="/tickets"
								search={{ mine: true }}
								data-testid="period_mine"
								className="flex items-center justify-center gap-1.5 rounded-lg font-semibold text-[13px] text-slate-500 transition-all hover:bg-white/70 hover:text-[var(--destaque)]"
							>
								<TicketIcon className="size-4" />
								All my tasks
							</Link>
						</div>
					</div>

					{/* LIST */}
					<div className="max-h-[600px] space-y-4 overflow-auto px-5 pb-6">
						{loading ? (
							<div className="rounded-xl border border-border/60 border-dashed bg-slate-50/50 p-8 text-center text-slate-400 text-[15px]">Loading tasks…</div>
						) : filtered.length === 0 ? (
							<div className="rounded-xl border border-border/60 border-dashed bg-slate-50/50 p-8 text-center text-slate-400 text-[15px]">No tasks found for this filter.</div>
						) : (
							paged.items.map((item) => {
								const status = serviceStatusOf(item);
								const done = status === "completed";
								const overdue = !done && dayjs(item.start).isBefore(dayjs().startOf("day"));
								const rescheduled = (item.service?.reschedules?.length ?? 0) > 0;
								const place = [item.property !== "—" ? item.property : "", item.location].filter(Boolean).join(" - ");
								return (
									<div
										data-testid="task_card"
										key={item.id}
										role="button"
										tabIndex={0}
										onClick={() => onSelect(item)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												onSelect(item);
											}
										}}
										className={cn(
											"group relative w-full cursor-pointer rounded-lg border p-4 text-left transition-all duration-200",
											"hover:border-[var(--destaque)]/30 hover:shadow-lg",
											"border-border/50 bg-white shadow-sm",
										)}
									>
										{/* Header */}
										<div className="mb-2 flex items-center justify-between gap-2">
											<span className="font-bold text-xs text-slate-400 uppercase tracking-wider">
												{hasTicket(item.ticketNumber) ? (
													<button
														type="button"
														className="font-bold uppercase tracking-wider hover:text-[var(--destaque)] hover:underline"
														onClick={(e) => {
															e.stopPropagation();
															setOpenTicket(Number(item.ticketNumber));
														}}
														onKeyDown={(e) => e.stopPropagation()}
														data-testid="btn_ticket_details"
													>
														Ticket #{item.ticketNumber}
													</button>
												) : (
													"No ticket"
												)}
												<span
													className={cn(
														"ml-2 rounded-full px-1.5 py-0.5 font-semibold normal-case tracking-normal",
														status === "completed" && "bg-emerald-100 text-emerald-800",
														status === "in_progress" && "bg-amber-100 text-amber-800",
														status === "not_started" && (overdue ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"),
													)}
												>
													{overdue ? "Overdue" : SERVICE_STATUS_LABELS[status]}
												</span>
											</span>
											<div className="flex items-center gap-2">
												<span className="flex items-center gap-1 font-bold text-xs text-slate-400">
													<CalendarDotsIcon className="h-3 w-3" />
													{dayjs(item.start).format("MM/DD")}
												</span>
												<span className="font-bold text-[var(--destaque)] text-[13px]">{formatTime(new Date(item.start))}</span>
											</div>
										</div>

										{/* Data */}
										<div className="space-y-1">
											<h4 className="font-bold text-[var(--destaque)] text-[15px] uppercase leading-tight">{typeLabel(item.type)}</h4>
											<p className="font-bold text-slate-800 text-[13px]">{place || "No location"}</p>
											<p className="font-medium text-xs text-slate-500 italic">Client: {item.client.name}</p>
											<p className="font-medium text-xs text-slate-500">Technician: {item.owner.name}</p>
										</div>

										{/* Description */}
										<div className="mt-3 line-clamp-2 font-medium text-slate-600 text-[13px] leading-relaxed">{item.title}</div>

										{/* Actions */}
										<div className="mt-3 flex items-center gap-3 border-slate-100 border-t pt-3">
											{!done && canManage(item) && (
												<Button
													type="button"
													variant={rescheduled ? "default" : "secondary"}
													size="sm"
													onClick={(e) => {
														e.stopPropagation();
														setRescheduling(item);
													}}
													className="h-8 gap-1.5 text-xs"
													data-testid={`reschedule-${item.id}`}
												>
													<CalendarPlusIcon className="h-3 w-3" />
													{rescheduled ? "Rescheduled · reschedule again" : "Customer absent"}
												</Button>
											)}
											<CaretRightIcon className="ml-auto h-3.5 w-3.5 text-slate-300 transition-colors group-hover:text-[var(--destaque)]" />
										</div>
									</div>
								);
							})
						)}
					</div>
					{!loading && <Pagination state={paged} noun="tasks" className="border-border border-t px-5" />}
				</CardContent>
			</Card>
		</>
	);
}
