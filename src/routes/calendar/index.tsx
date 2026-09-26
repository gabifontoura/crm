import {
	CaretLeftIcon,
	CaretRightIcon,
	FunnelIcon,
	GearIcon,
	LayoutIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageLayout } from "#/components/layout/page-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { apiClient } from "#/lib/api/client";
import { useSession } from "#/lib/auth/session";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import type { DevelopmentTree } from "../../../shared/developments";
import { APP_LOCALE } from "#/lib/format";
import { cn } from "#/lib/utils";
import { CalendarGrid } from "./-components/calendar-grid";
import { ClientDetailDialog } from "./-components/client-detail-dialog";
import { contrastColor, MEETING_MODES } from "./-components/constants";
import { EventDetailDialog } from "./-components/event-detail-dialog";
import { EventFormDialog } from "./-components/event-form-dialog";
import { FiltersDialog } from "./-components/filters-dialog";
import { MiniCalendar } from "./-components/mini-calendar";
import type { CalendarEvent, CalendarView } from "./-components/types";
import {
	countActiveFilters,
	EMPTY_FILTERS,
	filterEvents,
	useCalendarEvents,
	useFilterOptions,
} from "./-components/use-calendar-events";
import { useCalendarSettings, useCanCustomizeColors } from "./-components/use-calendar-settings";
import { ViewSwitcher } from "./-components/view-switcher";

export const Route = createFileRoute("/calendar/")({
	// ?event=<id> opens that appointment (links from tickets).
	validateSearch: (s: Record<string, unknown>): { event?: string } => (typeof s.event === "string" && s.event ? { event: s.event } : {}),
	component: CalendarPage,
});

function CalendarPage() {
	const { user, can, seesTeam } = useCurrentUser();
	const { users } = useSession();
	const store = useCalendarEvents(user?.id);
	const events = store.events;
	const { properties, owners } = useFilterOptions(events);
	const { can: canCustomize } = useCanCustomizeColors();
	const settings = useCalendarSettings(canCustomize);
	const viewAll = can("calendar.viewAll");
	const mine = (e: CalendarEvent | null) => viewAll || (e ? e.owner.id === user?.id : false);
	const activeOwners = useMemo(
		() => users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name })),
		[users],
	);

	// Job sites for the location pickers in the appointment form.
	const [developments, setDevelopments] = useState<DevelopmentTree[]>([]);
	useEffect(() => {
		if (!user) return;
		apiClient
			.get<DevelopmentTree[]>("/api/developments")
			.then(setDevelopments)
			.catch(() => setDevelopments([]));
	}, [user]);

	const [view, setView] = useState<CalendarView>("month");
	const [isMobile, setIsMobile] = useState(false);
	const [refDate, setRefDate] = useState<Date>(new Date());
	const [filters, setFilters] = useState(EMPTY_FILTERS);
	const [showSidePanel, setShowSidePanel] = useState(true);

	useEffect(() => {
		const mq = window.matchMedia("(max-width: 767px)");
		setIsMobile(mq.matches);
		const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, []);

	const [filtersOpen, setFiltersOpen] = useState(false);
	const [detailId, setDetailId] = useState<string | null>(null);
	const [clientEvent, setClientEvent] = useState<CalendarEvent | null>(null);
	const [formOpen, setFormOpen] = useState(false);
	const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
	const [formIsCopy, setFormIsCopy] = useState(false);
	const [gridKey, setGridKey] = useState(0);

	// Opened from a link (?event=…): go to its day and show it, once it's loaded.
	const { event: focusId } = Route.useSearch();
	const goTo = Route.useNavigate();
	useEffect(() => {
		if (!focusId) return;
		const e = events.find((x) => x.id === focusId);
		if (!e) {
			if (!store.loading) {
				toast.error("That appointment isn't on your calendar.");
				goTo({ search: {}, replace: true });
			}
			return;
		}
		setRefDate(e.start);
		setDetailId(e.id);
		goTo({ search: {}, replace: true });
	}, [focusId, events, store.loading, goTo]);

	// Read the open event from the store so in-dialog changes show up live.
	const detailEvent = useMemo(
		() => (detailId ? (events.find((e) => e.id === detailId) ?? null) : null),
		[events, detailId],
	);

	const filteredEvents = useMemo(() => filterEvents(events, filters), [events, filters]);

	// How many appointments use each type and custom tag; used types/tags can't be deleted.
	const usage = useMemo(() => {
		const types: Record<string, number> = {};
		const tags: Record<string, number> = {};
		for (const e of events) {
			types[e.type] = (types[e.type] ?? 0) + 1;
			for (const t of e.tags ?? []) tags[t] = (tags[t] ?? 0) + 1;
		}
		return { types, tags };
	}, [events]);

	// Reset filters that no longer make sense after switching users.
	useEffect(() => {
		setFilters(EMPTY_FILTERS);
		setDetailId(null);
	}, [user?.id]);

	async function saveEvent(e: CalendarEvent) {
		const exists = store.events.some((x) => x.id === e.id);
		if (exists) await store.update(e);
		else await store.create(e);
		setEditingEvent(null);
		setFormIsCopy(false);
		setGridKey((k) => k + 1);
		toast.success(exists ? "Appointment updated" : "Appointment created");
	}

	function updateEvent(e: CalendarEvent) {
		store.update(e).catch(() => undefined);
	}

	async function deleteEvent(id: string) {
		await store.remove(id).catch(() => undefined);
		setDetailId(null);
		setGridKey((k) => k + 1);
		toast.success("Appointment deleted");
	}

	function copyEvent(e: CalendarEvent) {
		if (!can("calendar.create")) return;
		setEditingEvent({ ...e, id: `copy-${Date.now()}`, completed: false });
		setFormIsCopy(true);
		setFormOpen(true);
	}

	function newEvent() {
		setEditingEvent(null);
		setFormIsCopy(false);
		setFormOpen(true);
	}

	const textColorFor = (id: CalendarEvent["type"]) => contrastColor(settings.colorForType(id).background);

	const activeFilters = countActiveFilters(filters);

	function navigate(delta: number) {
		const unit = view === "month" ? "month" : view === "week" ? "week" : "day";
		setRefDate(dayjs(refDate).add(delta, unit).toDate());
	}

	function goToToday() {
		setRefDate(new Date());
		setView("day");
	}

	function goToYesterday() {
		setRefDate(dayjs().subtract(1, "day").toDate());
		setView("day");
	}

	function title(): string {
		if (view === "month")
			return refDate.toLocaleDateString(APP_LOCALE, { month: "long", year: "numeric" });
		if (view === "week") {
			const start = dayjs(refDate).startOf("week");
			const end = start.add(6, "day");
			return `${start.format("MMM D")} - ${end.format("MMM D, YYYY")}`;
		}
		return refDate.toLocaleDateString(APP_LOCALE, {
			weekday: "long",
			day: "2-digit",
			month: "long",
			year: "numeric",
		});
	}

	const modeLabel = MEETING_MODES.find((m) => m.id === filters.mode)?.label;

	return (
		<PageLayout
			title="Calendar"
			subtitle={
				user
					? seesTeam
						? "Team schedule: service technicians and brokers"
						: `Your schedule, ${user.name.split(" ")[0]}`
					: undefined
			}
			breadcrumbs={[{ label: "Workspace" }, { label: "Calendar" }]}
			actions={
				can("calendar.create") ? (
					// On phones the "+" sits in the calendar's own toolbar instead.
					<Button size="sm" onClick={newEvent} className="hidden md:inline-flex">
						<PlusIcon className="size-4" />
						New appointment
					</Button>
				) : null
			}
		>
			<div className={cn("flex w-full flex-col py-4 lg:flex-row-reverse", showSidePanel ? "gap-4" : "gap-0")}>
				<aside
					className={cn(
						"shrink-0 self-start overflow-hidden transition-all duration-300 ease-in-out lg:sticky lg:top-4",
						showSidePanel ? "w-full opacity-100 lg:w-64" : "hidden lg:block lg:w-0 lg:opacity-0",
					)}
				>
					<div className="w-full lg:w-64">
						{showSidePanel && (
							<MiniCalendar
								selected={refDate}
								onSelect={(d) => {
									setRefDate(d);
									setView("day");
								}}
								events={filteredEvents}
							/>
						)}

						<div className="mt-4 rounded-lg border border-border bg-card p-3 shadow-sm">
							<h3 className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Legend</h3>
							<ul className="flex flex-col gap-1.5">
								{settings.types.map((t) => {
									const color = settings.colorForType(t.id);
									return (
										<li key={t.id} className="flex items-center gap-2 text-sm">
											<span
												className="size-3.5 rounded border"
												style={{ backgroundColor: color.background, borderColor: color.border }}
											/>
											<span>{t.label}</span>
										</li>
									);
								})}
							</ul>
						</div>
					</div>
				</aside>
				<section className="flex min-w-0 flex-1 flex-col gap-3">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex w-full items-center gap-1.5 md:w-auto">
							<Tooltip>
								<TooltipTrigger>
									<Button
										variant="secondary"
										size="icon"
										className="hover:bg-transparent"
										onClick={() => navigate(-1)}
										aria-label="Previous"
									>
										<CaretLeftIcon className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom">Previous</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger>
									<Button
										variant="secondary"
										size="icon"
										className="hover:bg-transparent"
										onClick={() => navigate(1)}
										aria-label="Next"
									>
										<CaretRightIcon className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom">Next</TooltipContent>
							</Tooltip>
							<span className="mx-0.5 h-5 w-px bg-border" />
							<h2 className="ml-1 font-semibold text-sm capitalize sm:text-lg">{title()}</h2>
							{can("calendar.create") && (
								<Button size="icon" onClick={newEvent} className="ml-auto md:hidden" aria-label="New appointment">
									<PlusIcon className="size-4" />
								</Button>
							)}
						</div>
						{/* Phone: a 3-column grid, so the views and the row below line up
						    (Yesterday under Day, Today under Week, the tools under Month). */}
						<div
							className={cn(
								"grid w-full items-center gap-1.5 md:flex md:w-auto md:flex-wrap",
								// With filters on, the filter button shows its count: the tools column grows to fit.
								activeFilters > 0 ? "grid-cols-[1fr_1fr_auto]" : "grid-cols-3",
							)}
						>
							{/* Jumps next to the views: pick "when", then "how much". */}
							<Button variant="secondary" size="sm" className="w-full whitespace-normal px-2 sm:px-3 md:w-auto" onClick={goToYesterday}>
								Yesterday
							</Button>
							<Button variant="secondary" size="sm" className="w-full whitespace-normal px-2 sm:px-3 md:w-auto" onClick={goToToday}>
								Today
							</Button>
							<span className="mx-0.5 hidden h-5 w-px bg-border md:block" />
							<ViewSwitcher value={view} onChange={setView} className="order-first col-span-full grid grid-cols-3 gap-1.5 md:order-none md:inline-flex md:gap-1" />
							<span className="mx-0.5 hidden h-5 w-px bg-border md:block" />
							<div
								className={cn(
									"flex items-center gap-1.5",
									// Phone: three equal buttons under Month, until the filter needs more room.
									activeFilters === 0 && "max-md:[&>*]:w-auto max-md:[&>*]:flex-1 max-md:[&>*]:basis-0 max-md:[&>*]:px-1.5",
								)}
							>
							<Tooltip>
								<TooltipTrigger>
									<Button
										variant="secondary"
										size="sm"
										onClick={() => setFiltersOpen(true)}
										aria-label="Filters"
									>
										<FunnelIcon className="size-4" />
										{activeFilters > 0 && (
											<Badge className="ml-1 h-[18px] bg-brand px-1.5 text-[11px] text-white">
												{activeFilters}
											</Badge>
										)}
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom">Filters</TooltipContent>
							</Tooltip>
							{/* Only who can change the calendar (administrators) gets to its settings. */}
							{canCustomize && (
								<Tooltip>
									<TooltipTrigger>
										<Button variant="secondary" size="icon" className="hover:bg-transparent" aria-label="Customize calendar" asChild>
											<Link to="/settings" search={{ section: "calendar" }}>
												<GearIcon className="size-4" />
											</Link>
										</Button>
									</TooltipTrigger>
									<TooltipContent side="bottom">Customize calendar</TooltipContent>
								</Tooltip>
							)}
							<Tooltip>
								<TooltipTrigger>
									<Button
										variant="secondary"
										size="icon"
										className="hover:bg-transparent"
										onClick={() => setShowSidePanel((v) => !v)}
										aria-label={showSidePanel ? "Hide side panel" : "Show side panel"}
									>
										<LayoutIcon className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom">{showSidePanel ? "Hide side panel" : "Show side panel"}</TooltipContent>
							</Tooltip>
							</div>
						</div>
					</div>
					{store.error && (
						<div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
							<span>Couldn't load appointments: {store.error}</span>
							<Button variant="secondary" size="sm" onClick={() => store.reload()}>
								Retry
							</Button>
						</div>
					)}
					{activeFilters > 0 && (
						<div className="flex flex-wrap items-center gap-1.5">
							{filters.property && (
								<Badge variant="outline" className="px-2.5 py-1 text-sm">
									{filters.property}
								</Badge>
							)}
							{filters.owner && (
								<Badge variant="outline" className="px-2.5 py-1 text-sm">
									{owners.find((u) => u.id === filters.owner)?.name ?? filters.owner}
								</Badge>
							)}
							{filters.types.map((t) => (
								<Badge key={t} variant="outline" className="px-2.5 py-1 text-sm">
									{settings.typeDef(t).label}
								</Badge>
							))}
							{filters.mode !== "all" && (
								<Badge variant="outline" className="px-2.5 py-1 text-sm">
									{modeLabel}
								</Badge>
							)}
							{filters.pendingOnly && (
								<Badge variant="outline" className="px-2.5 py-1 text-sm">
									Pending only
								</Badge>
							)}
							{(filters.startDate || filters.endDate) && (
								<Badge variant="outline" className="px-2.5 py-1 text-sm">
									{filters.startDate ? dayjs(filters.startDate).format("MMM D") : "…"} -{" "}
									{filters.endDate ? dayjs(filters.endDate).format("MMM D") : "…"}
								</Badge>
							)}
							<button
								type="button"
								onClick={() => setFilters(EMPTY_FILTERS)}
								className="ml-1 font-medium text-brand text-sm hover:underline"
							>
								Clear
							</button>
						</div>
					)}
					<div className="w-full overflow-x-auto">
						<CalendarGrid
							key={gridKey}
							isMobile={isMobile}
							view={view}
							refDate={refDate}
							events={filteredEvents}
							colorForType={settings.colorForType}
							textColorFor={textColorFor}
							card={settings.card}
							onOpen={(e) => setDetailId(e.id)}
							onOpenClient={setClientEvent}
							onCopy={can("calendar.create") ? copyEvent : undefined}
							onViewDay={(d) => {
								setRefDate(d);
								setView("day");
							}}
							hours={settings.hours}
							gridKey={gridKey}
						/>
					</div>
				</section>
			</div>

			<FiltersDialog
				open={filtersOpen}
				onOpenChange={setFiltersOpen}
				filters={filters}
				onChange={setFilters}
				onClear={() => setFilters(EMPTY_FILTERS)}
				properties={properties}
				owners={viewAll ? owners : []}
				types={settings.types}
			/>

			<EventDetailDialog
				open={Boolean(detailEvent)}
				onOpenChange={(o) => !o && setDetailId(null)}
				event={detailEvent}
				color={detailEvent ? settings.colorForType(detailEvent.type) : null}
				textColor={detailEvent ? textColorFor(detailEvent.type) : "#1F2937"}
				tags={settings.card.tags}
				onOpenClient={(e) => {
					setDetailId(null);
					setClientEvent(e);
				}}
				onUpdate={can("calendar.edit") && mine(detailEvent) ? updateEvent : undefined}
				onEdit={
					can("calendar.edit") && mine(detailEvent)
						? (e) => {
								setDetailId(null);
								setEditingEvent(e);
								setFormIsCopy(false);
								setFormOpen(true);
							}
						: undefined
				}
				onDelete={can("calendar.delete") && mine(detailEvent) ? deleteEvent : undefined}
			/>

			<EventFormDialog
				open={formOpen}
				onOpenChange={(o) => {
					setFormOpen(o);
					if (!o) {
						setEditingEvent(null);
						setFormIsCopy(false);
					}
				}}
				initial={editingEvent}
				defaultDate={view === "day" ? refDate : undefined}
				isCopy={formIsCopy}
				onSave={saveEvent}
				owners={activeOwners}
				currentUser={user ? { id: user.id, name: user.name } : { id: "", name: "" }}
				canChooseOwner={viewAll}
				developments={developments}
				types={settings.types}
				tags={settings.card.tags}
			/>

			<ClientDetailDialog
				open={Boolean(clientEvent)}
				onOpenChange={(o) => !o && setClientEvent(null)}
				event={clientEvent}
			/>
		</PageLayout>
	);
}
