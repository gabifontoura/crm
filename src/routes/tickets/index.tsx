import {
	FlowArrowIcon,
	KanbanIcon,
	ListBulletsIcon,
	MagnifyingGlassIcon,
	CalendarBlankIcon,
	MapPinIcon,
	PlayIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FilterChip } from "#/components/ui/filter-chip";
import { PageLayout } from "#/components/layout/page-layout";
import { Button } from "#/components/ui/button";
import { PersonName } from "#/components/person/person-dialog";
import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import { apiClient, errorMessage } from "#/lib/api/client";
import { useSession } from "#/lib/auth/session";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import { useColumns } from "#/lib/use-list-views";
import { LIST_BY_ID } from "../../../shared/list-views";
import { useMenuAccess } from "#/lib/auth/use-menu-access";
import { canOpen, menuAccessFrom } from "../../../shared/access";
import type { WireEvent } from "../technician/-components/task-utils";
import { myVisitToStart } from "./-components/workspace/shared";
import { cn } from "#/lib/utils";
import { toneOf } from "../../../shared/palette";
import type { DevelopmentTree } from "../../../shared/developments";
import {
	availableTransitions,
	isClosedCategory,
	isFilled,
	requiredForTransition,
	type StatusCategory,
	statusOf,
	type Ticket,
} from "../../../shared/tickets";
import { initialsOf } from "../../../shared/users";
import { DueLabel, PriorityBadge, StatusBadge, TicketDetailsDialog } from "./-components/ticket-details-dialog";
import { type NewTicketInput, TicketFormDialog } from "./-components/ticket-form-dialog";
import { useTicketConfig } from "./-components/use-ticket-config";
import { Pagination, ShowMore, useColumnLimit, usePagination } from "#/components/pagination";

dayjs.extend(relativeTime);

export const Route = createFileRoute("/tickets/")({
	// `?mine=1` opens the list with "Assigned to me" on (the technician's "All my tasks").
	validateSearch: (s: Record<string, unknown>): { mine?: boolean } => (s.mine === true || s.mine === 1 || s.mine === "1" || s.mine === "true" ? { mine: true } : {}),
	component: TicketsPage,
});

/** The signed-in person's next open visit per ticket number: the shortcut to start it. */
type MyVisit = { id: string; started: boolean };
/** A ticket's next open visit (the one on site first, then the soonest): its date on cards and rows. */
type NextVisit = { start: string; onSite: boolean; owner: string };
const MyVisitsContext = createContext<{ mine: Map<string, MyVisit>; next: Map<string, NextVisit> }>({ mine: new Map(), next: new Map() });

/** "Today · 9:00 AM", "Tomorrow · …", "Mon, Sep 28 · …", or "On site now". */
function visitWhen(v: NextVisit): string {
	if (v.onSite) return "On site now";
	const d = dayjs(v.start);
	const day = d.isSame(dayjs(), "day") ? "Today" : d.isSame(dayjs().add(1, "day"), "day") ? "Tomorrow" : d.format(d.isSame(dayjs(), "year") ? "ddd, MMM D" : "MMM D, YYYY");
	return `${day} · ${d.format("h:mm A")}`;
}

/** The ticket's next visit, with its date and who goes. */
function NextVisitLine({ t, className, wrap = false }: { t: Ticket; className?: string; wrap?: boolean }) {
	const v = useContext(MyVisitsContext).next.get(String(t.number));
	if (!v) return null;
	const late = !v.onSite && dayjs(v.start).isBefore(dayjs().startOf("day"));
	return (
		<span className={cn("flex items-center gap-1 text-[11px]", wrap ? "items-start" : "truncate", v.onSite ? "font-medium text-emerald-700" : late ? "text-amber-700" : "text-muted-foreground", className)} title={`Visit: ${dayjs(v.start).format("ddd, MMM D, YYYY h:mm A")} · ${v.owner}`}>
			<CalendarBlankIcon className={cn("size-3 shrink-0", wrap && "mt-0.5")} />
			<span className={wrap ? undefined : "truncate"}>{visitWhen(v)}</span>
		</span>
	);
}

/** "Start visit" / "Resume visit": opens the visit on the technician's screen. */
function VisitShortcut({ t, className }: { t: Ticket; className?: string }) {
	const visit = useContext(MyVisitsContext).mine.get(String(t.number));
	if (!visit) return null;
	return (
		<Link
			to="/technician/$activityId"
			params={{ activityId: visit.id }}
			onClick={(e) => e.stopPropagation()}
			className={cn(
				"inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-brand px-3 font-semibold text-[12px] text-white transition-colors hover:bg-brand/90",
				className,
			)}
		>
			<PlayIcon weight="fill" className="size-3.5" />
			{visit.started ? "Resume visit" : "Start visit"}
		</Link>
	);
}

type View = "board" | "list";
const LS_VIEW = "tickets.view.v1";

function TicketsPage() {
	const { user, can } = useCurrentUser();
	const { users } = useSession();
	const isAdmin = can("calendar.viewAll");
	const config = useTicketConfig(user?.id);
	const [tickets, setTickets] = useState<Ticket[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [developments, setDevelopments] = useState<DevelopmentTree[]>([]);

	const [typeFilter, setTypeFilter] = useState<string>("all");
	const [query, setQuery] = useState("");
	const [showClosed, setShowClosed] = useState(false);
	const search = Route.useSearch();
	const [mineOnly, setMineOnly] = useState(Boolean(search.mine));
	// Who works on the Tasks screen gets a shortcut to start their visit from here.
	const access = useMenuAccess(user?.id) ?? menuAccessFrom(null);
	const doesVisits = Boolean(user && user.role !== "engineer" && canOpen(user, access, "/technician"));
	const [myVisits, setMyVisits] = useState<Map<string, MyVisit>>(new Map());
	const [nextVisits, setNextVisits] = useState<Map<string, NextVisit>>(new Map());
	useEffect(() => {
		if (!user) return;
		apiClient
			.get<WireEvent[]>("/api/calendar/events")
			.then((events) => {
				// Every ticket's next open visit, for the date on its card.
				const next = new Map<string, NextVisit>();
				const open = events
					.filter((e) => e.ticketNumber && !e.completed && e.service?.status !== "completed")
					.sort((a, b) => Number(b.service?.status === "in_progress") - Number(a.service?.status === "in_progress") || a.start.localeCompare(b.start));
				for (const e of open) if (!next.has(e.ticketNumber)) next.set(e.ticketNumber, { start: e.start, onSite: e.service?.status === "in_progress", owner: e.owner?.name ?? "" });
				setNextVisits(next);
				if (!doesVisits) {
					setMyVisits(new Map());
					return;
				}
				// Per ticket, the same rule as the details modal: on the visit day, or once on site.
				const byTicket = new Map<string, WireEvent[]>();
				for (const e of events) if (e.ticketNumber) byTicket.set(e.ticketNumber, [...(byTicket.get(e.ticketNumber) ?? []), e]);
				const map = new Map<string, MyVisit>();
				for (const [number, list] of byTicket) {
					const v = myVisitToStart(
						list.map((e) => ({ ...e, ownerId: e.owner?.id ?? "" })),
						user.id,
						{ todayOnly: true },
					);
					if (v) map.set(number, { id: v.id, started: v.service?.status === "in_progress" });
				}
				setMyVisits(map);
			})
			.catch(() => {
				setMyVisits(new Map());
				setNextVisits(new Map());
			});
	}, [user, doesVisits]);
	const [view, setView] = useState<View>(() => {
		try {
			return (localStorage.getItem(LS_VIEW) as View) || "board";
		} catch {
			return "board";
		}
	});
	const [formOpen, setFormOpen] = useState(false);
	/** Ticket number shown in the read-only details modal. */
	const [openNumber, setOpenNumber] = useState<number | null>(null);
	const [dragId, setDragId] = useState<string | null>(null);
	const navigate = useNavigate();
	const openById = useCallback(
		(id: string) => {
			const t = tickets.find((x) => x.id === id);
			if (t) setOpenNumber(t.number);
		},
		[tickets],
	);

	const load = useCallback(async () => {
		if (!user) return;
		try {
			setTickets(await apiClient.get<Ticket[]>("/api/tickets"));
			setError(null);
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setLoading(false);
		}
	}, [user]);

	useEffect(() => {
		setTickets([]);
		setLoading(true);
		setOpenNumber(null);
		load();
		if (user) apiClient.get<DevelopmentTree[]>("/api/developments").then(setDevelopments).catch(() => setDevelopments([]));
	}, [load, user]);

	useEffect(() => {
		try {
			localStorage.setItem(LS_VIEW, view);
		} catch {
			/* ignore */
		}
	}, [view]);

	const userName = useCallback(
		(id: string | null | undefined) => (id ? (users.find((u) => u.id === id)?.name ?? "Former member") : "Unassigned"),
		[users],
	);
	const assignees = useMemo(() => users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name })), [users]);

	const isClosed = useCallback(
		(t: Ticket) => {
			const s = statusOf(config.workflowOf(t.typeId), t.statusId);
			return s ? isClosedCategory(s.category) : false;
		},
		[config],
	);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return tickets.filter((t) => {
			if (typeFilter !== "all" && t.typeId !== typeFilter) return false;
			if (!showClosed && isClosed(t)) return false;
			if (mineOnly && t.assigneeId !== user?.id) return false;
			if (q && ![t.title, t.requester.name, t.property, t.location, String(t.number)].some((f) => f.toLowerCase().includes(q))) return false;
			return true;
		});
	}, [tickets, typeFilter, showClosed, mineOnly, query, isClosed, user?.id]);

	const counts = useMemo(() => {
		const out: Record<string, number> = { all: 0 };
		for (const t of tickets) {
			if (!showClosed && isClosed(t)) continue;
			out.all++;
			out[t.typeId] = (out[t.typeId] ?? 0) + 1;
		}
		return out;
	}, [tickets, showClosed, isClosed]);

	const overdue = filtered.filter((t) => t.dueAt && !isClosed(t) && new Date(t.dueAt).getTime() < Date.now()).length;

	async function create(input: NewTicketInput) {
		try {
			const t = await apiClient.post<Ticket>("/api/tickets", input);
			toast.success(`Ticket #${t.number} created`);
			await load();
			setOpenNumber(t.number);
		} catch (e) {
			toast.error(errorMessage(e));
			throw e;
		}
	}

	/** Board drop: use the workflow transition that leads to the target status, if any. */
	async function dropOnStatus(ticketId: string, statusId: string) {
		const t = tickets.find((x) => x.id === ticketId);
		if (!t || !user || t.statusId === statusId) return;
		const wf = config.workflowOf(t.typeId);
		const type = config.typeById.get(t.typeId);
		if (!wf || !type) return;
		const tr = availableTransitions(wf, t.statusId, user.role).find((x) => x.to === statusId && !x.onTasksScreen);
		if (availableTransitions(wf, t.statusId, user.role).some((x) => x.to === statusId && x.onTasksScreen) && !tr) {
			toast.info(`${statusOf(wf, statusId)?.name} is set by the technician on the Tasks screen, with the customer's signature.`);
			return;
		}
		if (!tr) {
			toast.error(`The "${wf.name}" workflow has no step from ${statusOf(wf, t.statusId)?.name} to ${statusOf(wf, statusId)?.name} for your role.`);
			return;
		}
		const missing = requiredForTransition(tr, type).filter((id) => !isFilled(type.fields.find((f) => f.id === id)!, t.fields[id]));
		if (tr.requireComment || missing.length) {
			toast.info(`"${tr.label}" needs more information. Fill it in on the Handle page.`);
			navigate({ to: "/tickets/$ticketNumber", params: { ticketNumber: String(t.number) } });
			return;
		}
		// Optimistic move, rolled back if the server refuses.
		setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, statusId } : x)));
		try {
			await apiClient.post(`/api/tickets/${encodeURIComponent(t.id)}/transition`, { transitionId: tr.id });
			toast.success(`${tr.label} · #${t.number}`);
			// Moved to in progress with a visit of theirs: straight to the visit on the Tasks screen.
			const visit = statusOf(wf, statusId)?.category === "in_progress" ? myVisits.get(String(t.number)) : undefined;
			if (visit) {
				navigate({ to: "/technician/$activityId", params: { activityId: visit.id } });
				return;
			}
			load();
		} catch (e) {
			setTickets((prev) => prev.map((x) => (x.id === t.id ? t : x)));
			toast.error(errorMessage(e));
		}
	}

	const selectedType = typeFilter === "all" ? undefined : config.typeById.get(typeFilter);
	const boardWorkflow = selectedType ? config.workflowById.get(selectedType.workflowId) : undefined;
	const activeTypes = config.types.filter((t) => t.active);

	return (
		<MyVisitsContext.Provider value={{ mine: myVisits, next: nextVisits }}>
		<PageLayout
			title="Tickets"
			subtitle={isAdmin ? "Every request from owners, residents and buyers" : user?.role === "engineer" ? "Every ticket, read only · you answer the ones with a question to engineering" : "Tickets assigned to you"}
			breadcrumbs={[{ label: "Service" }, { label: "Tickets" }]}
			actions={
				<>
					{isAdmin && (
						<Button variant="secondary" size="sm" asChild>
							<Link to="/settings" search={{ section: "workflows" }}>
								<FlowArrowIcon className="size-4" />
								<span className="hidden sm:inline">Workflows & fields</span>
							</Link>
						</Button>
					)}
					{can("tickets.create") && (
						<Button size="sm" onClick={() => setFormOpen(true)} disabled={activeTypes.length === 0}>
							<PlusIcon className="size-4" />
							<span className="hidden sm:inline">New ticket</span>
						</Button>
					)}
				</>
			}
		>
			<div className="flex flex-col gap-3 py-4">
				<div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Ticket type">
					<FilterChip label="All types" count={counts.all ?? 0} active={typeFilter === "all"} onClick={() => setTypeFilter("all")} />
					{config.types.map((t) => (
						<FilterChip
							key={t.id}
							label={t.name}
							color={t.color}
							count={counts[t.id] ?? 0}
							active={typeFilter === t.id}
							onClick={() => setTypeFilter(t.id)}
						/>
					))}
				</div>

				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex flex-wrap items-center gap-3">
						<div className="inline-flex items-center gap-1" role="group" aria-label="View">
							<Button size="sm" variant={view === "board" ? "default" : "secondary"} onClick={() => setView("board")} aria-pressed={view === "board"}>
								<KanbanIcon className="size-4" /> Board
							</Button>
							<Button size="sm" variant={view === "list" ? "default" : "secondary"} onClick={() => setView("list")} aria-pressed={view === "list"}>
								<ListBulletsIcon className="size-4" /> List
							</Button>
						</div>
						<label className="flex items-center gap-2 text-muted-foreground text-sm">
							<Switch checked={showClosed} onCheckedChange={(v) => setShowClosed(Boolean(v))} /> Show closed
						</label>
						{/* Everyone: technicians also see tickets they opened or visit, not only theirs. */}
						<label className="flex items-center gap-2 text-muted-foreground text-sm">
							<Switch checked={mineOnly} onCheckedChange={(v) => setMineOnly(Boolean(v))} /> Assigned to me
						</label>
						{overdue > 0 && <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive text-xs">{overdue} overdue</span>}
					</div>
					<div className="relative w-full sm:w-72">
						<MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							aria-label="Search tickets"
							className="h-9 pl-9"
							placeholder="Search number, title, requester, site"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					</div>
				</div>

				{(error || config.error) && (
					<div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
						{error ?? config.error}
					</div>
				)}
				{loading || config.loading ? (
					<p className="py-12 text-center text-muted-foreground text-sm">Loading tickets…</p>
				) : view === "list" ? (
					<TicketTable
						resetKey={[typeFilter, showClosed, mineOnly, query]}
						tickets={filtered}
						config={config}
						userName={userName}
						isClosed={isClosed}
						onOpen={openById}
					/>
				) : (
					<Board
						tickets={filtered}
						config={config}
						workflowId={boardWorkflow?.id}
						showClosed={showClosed}
						userName={userName}
						isClosed={isClosed}
						onOpen={openById}
						dragId={dragId}
						setDragId={setDragId}
						onDropStatus={dropOnStatus}
						onPickType={setTypeFilter}
					/>
				)}
			</div>

			<TicketFormDialog
				open={formOpen}
				onOpenChange={setFormOpen}
				types={activeTypes}
				developments={developments}
				assignees={assignees}
				canAssign={isAdmin}
				defaultTypeId={typeFilter === "all" ? undefined : typeFilter}
				onCreate={create}
			/>

			<TicketDetailsDialog ticketNumber={openNumber} onOpenChange={(o) => !o && setOpenNumber(null)} onChanged={load} />
		</PageLayout>
		</MyVisitsContext.Provider>
	);
}

type Config = ReturnType<typeof useTicketConfig>;

function TicketCard({
	t,
	config,
	userName,
	isClosed,
	onOpen,
	draggable,
	onDragStart,
	onDragEnd,
}: {
	t: Ticket;
	config: Config;
	userName: (id: string | null | undefined) => string;
	isClosed: (t: Ticket) => boolean;
	onOpen: (id: string) => void;
	draggable?: boolean;
	onDragStart?: () => void;
	onDragEnd?: () => void;
}) {
	const type = config.typeById.get(t.typeId);
	const show = useColumns("ticketCards", true);
	return (
		<div
			draggable={draggable}
			onDragStart={(e) => {
				e.dataTransfer.setData("text/plain", t.id);
				onDragStart?.();
			}}
			onDragEnd={onDragEnd}
			className="flex w-full flex-col gap-2 rounded-md border border-border border-l-4 bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md"
			// Same edge as the calendar cards of this tone.
			style={{ borderLeftColor: toneOf(type?.color)?.border ?? type?.color }}
		>
		<button type="button" onClick={() => onOpen(t.id)} className="flex w-full cursor-pointer flex-col gap-1.5 text-left">
			<div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
				<span className="font-mono">#{t.number}</span>
				{show.has("priority") && <PriorityBadge priority={t.priority} />}
			</div>
			<span className="line-clamp-2 font-semibold text-[13px] leading-snug">{t.title}</span>
			{/* The rest in the order set in Settings › Lists & columns. */}
			{show.ids.map((id) => {
				switch (id) {
					case "location":
						return (
							(t.property || t.location) && (
								<span key={id} className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
									<MapPinIcon className="size-3 shrink-0" />
									<span className="truncate">{[t.property, t.location].filter(Boolean).join(" · ")}</span>
								</span>
							)
						);
					case "nextVisit":
						return <NextVisitLine key={id} t={t} />;
					case "type":
						return (
							<span key={id} className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
								<span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: type?.color }} />
								{type?.name}
							</span>
						);
					case "requester":
						return (
							t.requester.name && (
								<span key={id} className="truncate text-[11px] text-muted-foreground">
									For {t.requester.name}
								</span>
							)
						);
					// Due and assignee share a row, where the first of them is.
					case "due":
					case "assignee": {
						const first = show.ids.find((x) => x === "due" || x === "assignee");
						if (id !== first) return null;
						return (
							<div key="due-assignee" className="flex items-center justify-between gap-2">
								{show.has("due") && <DueLabel ticket={t} closed={isClosed(t)} />}
								{show.has("assignee") && (
									<span
										className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 font-semibold text-[10px] text-brand"
										title={userName(t.assigneeId)}
									>
										{t.assigneeId ? initialsOf(userName(t.assigneeId)) : "–"}
									</span>
								)}
							</div>
						);
					}
					default:
						return null;
				}
			})}
		</button>
		{show.has("visitButton") && <VisitShortcut t={t} className="w-full" />}
		</div>
	);
}

function Board({
	tickets,
	config,
	workflowId,
	showClosed,
	userName,
	isClosed,
	onOpen,
	dragId,
	setDragId,
	onDropStatus,
	onPickType,
}: {
	tickets: Ticket[];
	config: Config;
	workflowId?: string;
	showClosed: boolean;
	userName: (id: string | null | undefined) => string;
	isClosed: (t: Ticket) => boolean;
	onOpen: (id: string) => void;
	dragId: string | null;
	setDragId: (id: string | null) => void;
	onDropStatus: (ticketId: string, statusId: string) => void;
	onPickType: (id: string) => void;
}) {
	const [over, setOver] = useState<string | null>(null);
	const columnLimit = useColumnLimit();
	const workflow = workflowId ? config.workflowById.get(workflowId) : undefined;

	// One type selected: columns are its workflow's own statuses (drag to move).
	// All types: columns are the shared categories (read-only overview).
	const columns: { id: string; name: string; color: string; hint?: string; items: Ticket[]; droppable: boolean }[] = workflow
		? workflow.statuses
				.filter((s) => showClosed || !isClosedCategory(s.category))
				.map((s) => ({ id: s.id, name: s.name, color: s.color, items: tickets.filter((t) => t.statusId === s.id), droppable: true }))
		: config.stages.filter((c) => showClosed || !isClosedCategory(c.id)).map((c) => ({
				id: c.id,
				name: c.label,
				color: "#94A3B8",
				hint: c.hint,
				items: tickets.filter((t) => statusOf(config.workflowOf(t.typeId), t.statusId)?.category === (c.id as StatusCategory)),
				droppable: false,
			}));

	return (
		<div className="flex flex-col gap-2">
			{!workflow && (
				<p className="text-muted-foreground text-xs">
					Every type together, grouped by what their statuses mean. Pick a type above to see its own statuses and drag tickets between them.
				</p>
			)}
			<div className="flex gap-3 overflow-x-auto pb-2">
				{columns.map((col) => (
					<section
						key={col.id}
						aria-label={col.name}
						onDragOver={(e) => {
							if (!col.droppable || !dragId) return;
							e.preventDefault();
							setOver(col.id);
						}}
						onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
						onDrop={(e) => {
							e.preventDefault();
							setOver(null);
							const id = e.dataTransfer.getData("text/plain");
							if (col.droppable && id) onDropStatus(id, col.id);
						}}
						className={cn(
							"flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30",
							over === col.id && "border-brand bg-brand/5",
						)}
					>
						<header className="flex items-center justify-between gap-2 border-border border-b px-3 py-2" title={col.hint}>
							<span className="flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
								<span className="size-2 rounded-full" style={{ backgroundColor: col.color }} />
								{col.name}
							</span>
							<span className="rounded-full bg-card px-1.5 text-[11px] text-muted-foreground">{col.items.length}</span>
						</header>
						<div className="flex min-h-24 flex-col gap-2 p-2">
							{col.items.length === 0 && <p className="py-4 text-center text-[11px] text-muted-foreground">Nothing here</p>}
							{col.items.slice(0, columnLimit.limit(col.id)).map((t) => (
								<div key={t.id} className={cn(dragId === t.id && "opacity-50")}>
									{!workflow && (
										<button
											type="button"
											onClick={() => onPickType(t.typeId)}
											className="mb-1 text-[10px] text-muted-foreground hover:text-brand"
										>
											<StatusBadge workflow={config.workflowOf(t.typeId)} statusId={t.statusId} />
										</button>
									)}
									<TicketCard
										t={t}
										config={config}
										userName={userName}
										isClosed={isClosed}
										onOpen={onOpen}
										draggable={Boolean(workflow)}
										onDragStart={() => setDragId(t.id)}
										onDragEnd={() => setDragId(null)}
									/>
								</div>
							))}
							<ShowMore shown={columnLimit.limit(col.id)} total={col.items.length} step={columnLimit.step} onMore={() => columnLimit.more(col.id)} />
						</div>
					</section>
				))}
			</div>
		</div>
	);
}

/** Minimum widths in the Tickets list: Status fits "In progress" on one line. */
const COLUMN_WIDTH: Record<string, string> = { status: "min-w-32" };

function TicketTable({
	tickets,
	config,
	userName,
	isClosed,
	onOpen,
	resetKey,
}: {
	tickets: Ticket[];
	config: Config;
	userName: (id: string | null | undefined) => string;
	isClosed: (t: Ticket) => boolean;
	onOpen: (id: string) => void;
	/** The filters: when they change, back to page 1. */
	resetKey: unknown;
}) {
	const paged = usePagination(tickets, { key: "tickets", resetKey });
	// Which columns, and their order: Settings › Lists & columns.
	const columns = useColumns("tickets", true);
	if (tickets.length === 0) {
		return <p className="rounded-lg border border-border bg-card py-12 text-center text-muted-foreground text-sm">No tickets match these filters.</p>;
	}
	const cell = (t: Ticket, id: string) => {
		const type = config.typeById.get(t.typeId);
		const requester = t.requester.name ? <PersonName person={{ kind: "customer", name: t.requester.name, email: t.requester.email }}>{t.requester.name}</PersonName> : "—";
		switch (id) {
			case "number":
				return <td key={id} className="whitespace-nowrap px-3 py-2.5 font-mono text-muted-foreground text-xs">{t.number}</td>;
			case "title":
				return (
					<td key={id} className="px-3 py-2.5">
						<div className="flex items-center gap-2">
							<span className="font-medium">{t.title}</span>
							<VisitShortcut t={t} className="h-7 shrink-0 px-2.5" />
						</div>
						<div className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground text-xs">
							<span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: type?.color }} />
							{type?.name} · {requester}
						</div>
					</td>
				);
			case "status":
				// Wide enough for "In progress" on one line; longer names wrap.
				return <td key={id} className="min-w-32 px-3 py-2.5 [overflow-wrap:normal]!"><StatusBadge workflow={config.workflowOf(t.typeId)} statusId={t.statusId} /></td>;
			case "priority":
				return <td key={id} className="px-3 py-2.5"><PriorityBadge priority={t.priority} /></td>;
			case "assignee":
				return <td key={id} className="px-3 py-2.5 text-sm">{t.assigneeId ? <PersonName person={{ kind: "member", id: t.assigneeId }}>{userName(t.assigneeId)}</PersonName> : userName(null)}</td>;
			case "location":
				return (
					<td key={id} className="px-3 py-2.5 text-muted-foreground text-xs">
						{t.property || "—"}
						{t.location && <div>{t.location}</div>}
					</td>
				);
			case "due":
				return <td key={id} className="px-3 py-2.5"><DueLabel ticket={t} closed={isClosed(t)} /></td>;
			case "nextVisit":
				return <td key={id} className="px-3 py-2.5"><NextVisitLine t={t} className="text-xs" wrap /></td>;
			case "updated":
				return <td key={id} className="px-3 py-2.5 text-muted-foreground text-xs">{dayjs(t.updatedAt).fromNow()}</td>;
			case "type":
				return (
					<td key={id} className="px-3 py-2.5 text-xs">
						<span className="inline-flex items-center gap-1.5">
							<span className="size-2 rounded-full" style={{ backgroundColor: type?.color }} />
							{type?.name ?? "—"}
						</span>
					</td>
				);
			case "requester":
				return (
					<td key={id} className="px-3 py-2.5 text-xs">
						{requester}
						{t.requester.phone && <div className="text-muted-foreground">{t.requester.phone}</div>}
					</td>
				);
			case "client":
				return <td key={id} className="px-3 py-2.5 text-xs">{t.clientName || <span className="text-muted-foreground">—</span>}</td>;
			case "reporter":
				return <td key={id} className="px-3 py-2.5 text-sm"><PersonName person={{ kind: "member", id: t.reporterId }}>{userName(t.reporterId)}</PersonName></td>;
			case "created":
				return <td key={id} className="px-3 py-2.5 text-muted-foreground text-xs" title={dayjs(t.createdAt).format("MMM D, YYYY h:mm A")}>{dayjs(t.createdAt).format("MMM D")}</td>;
			default:
				return <td key={id} />;
		}
	};
	const label = (id: string) => LIST_BY_ID.tickets.columns.find((c) => c.id === id)?.label ?? id;
	return (
		<div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
			{/* No sideways scroll: the table fits the page and text wraps between words. */}
			<table className="w-full text-left text-sm">
				<thead className="border-border border-b bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
					<tr>
						{columns.ids.map((id) => (
							<th key={id} className={cn("px-3 py-2.5 font-semibold max-xl:[overflow-wrap:anywhere]", COLUMN_WIDTH[id])}>
								{label(id)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{paged.items.map((t) => (
						<tr key={t.id} onClick={() => onOpen(t.id)} className="cursor-pointer border-border border-b align-top last:border-b-0 hover:bg-muted/40 [&>td]:break-words max-xl:[&>td]:[overflow-wrap:anywhere]">
							{columns.ids.map((id) => cell(t, id))}
						</tr>
					))}
				</tbody>
			</table>
			<Pagination state={paged} noun="tickets" className="border-border border-t px-3" />
		</div>
	);
}
