import { CalendarBlankIcon, CalendarPlusIcon, MapPinIcon, UserIcon, WarningIcon, WrenchIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { apiClient } from "#/lib/api/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { cn } from "#/lib/utils";
import type { DevelopmentTree } from "../../../../../shared/developments";
import type { Ticket, Workflow } from "../../../../../shared/tickets";
import { LocationPicker } from "../location-picker";
import { StatusBadge } from "../ticket-details-dialog";
import { type LinkedEvent, Panel, type Workspace } from "./shared";

/** What the workspace gives the step dialog so it can book a visit. */
export interface BookingContext {
	ticket: Ticket;
	events: LinkedEvent[];
	developments: DevelopmentTree[];
	/** Who can go; `detail` is their job title. */
	people: { id: string; name: string; detail?: string }[];
	/** Admins book for anyone; everyone else books for themselves. */
	canPickOwner: boolean;
	meId: string;
	appointmentTypes: { id: string; label: string }[];
	appointmentLabel: (id: string) => string;
	/** "unit_showing" for a sales ticket, an inspection otherwise. */
	defaultType: string;
}

export interface VisitDraft {
	/** Use a visit already on the calendar instead of booking one. */
	useExisting: boolean;
	type: string;
	date: string;
	start: string;
	end: string;
	ownerId: string;
	clientName: string;
	developmentId: string;
	blockId: string;
	unitId: string;
	notes: string;
}

export const openVisits = (events: LinkedEvent[]) => events.filter((e) => !e.completed && e.service?.status !== "completed");

export function initialVisit(ctx: BookingContext): VisitDraft {
	const t = ctx.ticket;
	return {
		useExisting: openVisits(ctx.events).length > 0,
		type: ctx.appointmentTypes.some((a) => a.id === ctx.defaultType) ? ctx.defaultType : (ctx.appointmentTypes[0]?.id ?? "initial_inspection"),
		date: dayjs().add(1, "day").format("YYYY-MM-DD"),
		start: "09:00",
		end: "10:00",
		// The assignee when they do visits (not an engineer, say); else whoever books it.
		ownerId: !ctx.canPickOwner
			? ctx.meId
			: ([t.assigneeId, ctx.meId].find((id) => id && ctx.people.some((p) => p.id === id)) ?? ctx.people[0]?.id ?? ctx.meId),
		clientName: t.requester.name || t.clientName,
		developmentId: t.developmentId ?? "",
		blockId: t.blockId ?? "",
		unitId: t.unitId ?? "",
		notes: "",
	};
}

/** Problems to fix before booking, keyed like the server's (start, end, client, developmentId…). */
export function visitErrors(v: VisitDraft): Record<string, string> {
	if (v.useExisting) return {};
	const e: Record<string, string> = {};
	if (!v.date) e.start = "Pick the day.";
	if (!v.start) e.start = "Pick the start time.";
	if (!v.end || v.end <= v.start) e.end = "End after the start.";
	if (!v.clientName.trim()) e.client = "Who is the visit with?";
	if (!v.developmentId) e.developmentId = "Pick where the visit happens.";
	return e;
}

/** The request body's `visit` (times in the user's own time zone). */
export function visitPayload(v: VisitDraft, ctx: BookingContext) {
	const start = dayjs(`${v.date}T${v.start}`);
	const end = dayjs(`${v.date}T${v.end}`);
	return {
		// Named like the visits booked from the calendar or the Visits panel.
		title: `${ctx.appointmentLabel(v.type)} · Ticket #${ctx.ticket.number} - ${ctx.ticket.title}`,
		type: v.type,
		start: start.toISOString(),
		end: end.toISOString(),
		ownerId: v.ownerId,
		clientName: v.clientName.trim(),
		developmentId: v.developmentId,
		blockId: v.blockId,
		unitId: v.unitId,
		notes: v.notes.trim(),
		when: `${start.format("ddd, MMM D")} · ${start.format("h:mm A")}–${end.format("h:mm A")}`,
	};
}

/** Owner's appointments on a day, to see whether the slot is free. */
type Busy = { id: string; title: string; start: string; end: string };

const SLOTS = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];
const LENGTHS = [30, 60, 120, 180, 240];
const minutesOf = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const hmOf = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const lengthLabel = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);

/** The next working days (no Sundays), starting tomorrow. */
function nextDays(n: number) {
	const out: dayjs.Dayjs[] = [];
	for (let d = dayjs().add(1, "day"); out.length < n; d = d.add(1, "day")) if (d.day() !== 0) out.push(d);
	return out;
}

/**
 * The visit a step books: when, who goes, with whom and where. Filled from
 * the ticket; it goes on the calendar of the person doing it, whose day is
 * shown so the slot can be checked at a glance.
 */
export function VisitBooking({
	ctx,
	value,
	onChange,
	errors,
	statusName,
	allowExisting = true,
}: {
	ctx: BookingContext;
	value: VisitDraft;
	onChange: (v: VisitDraft) => void;
	errors: Record<string, string | undefined>;
	/** Why a visit is needed ("Visit scheduled"); none when booking straight from the Visits panel. */
	statusName?: string;
	allowExisting?: boolean;
}) {
	const set = (patch: Partial<VisitDraft>) => onChange({ ...value, ...patch });
	const booked = allowExisting ? openVisits(ctx.events) : [];
	const days = useMemo(() => nextDays(6), []);
	const length = Math.max(15, minutesOf(value.end) - minutesOf(value.start));
	const [placeOpen, setPlaceOpen] = useState(!value.clientName || !value.developmentId);
	const showPlace = placeOpen || Boolean(errors.client || errors.developmentId);
	const owner = ctx.people.find((p) => p.id === value.ownerId);

	// The owner's other appointments that day.
	const [busy, setBusy] = useState<Busy[] | null>(null);
	useEffect(() => {
		if (value.useExisting || !value.date || !value.ownerId) return;
		let live = true;
		setBusy(null);
		apiClient
			.get<Busy[]>(`/api/calendar/events?start=${value.date}&end=${value.date}&owner=${encodeURIComponent(value.ownerId)}`)
			.then((list) => live && setBusy(list.sort((a, b) => a.start.localeCompare(b.start))))
			.catch(() => live && setBusy([]));
		return () => {
			live = false;
		};
	}, [value.useExisting, value.date, value.ownerId]);
	const from = dayjs(`${value.date}T${value.start}`);
	const to = dayjs(`${value.date}T${value.end}`);
	const clash = (busy ?? []).find((b) => dayjs(b.start).isBefore(to) && dayjs(b.end).isAfter(from));

	const pickStart = (start: string) => set({ start, end: hmOf(Math.min(minutesOf(start) + length, 23 * 60 + 59)) });
	const where = locationText(ctx.developments, value);

	return (
		<section className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
			<header className="flex items-center gap-2 border-border border-b bg-muted/30 px-3 py-2">
				<span className="flex size-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
					<CalendarPlusIcon className="size-4" />
				</span>
				<div className="min-w-0">
					<p className="font-medium text-sm">Visit</p>
					<p className="text-muted-foreground text-xs">
						{statusName ? `“${statusName}” needs a visit on the calendar.` : "Goes on the calendar of whoever goes."}
					</p>
				</div>
			</header>

			<div className="flex flex-col gap-4 p-3">
				{booked.length > 0 && (
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Which visit">
						{booked.map((e) => (
							<ChoiceCard key={e.id} checked={value.useExisting} onSelect={() => set({ useExisting: true })} title="Use the visit booked">
								{dayjs(e.start).format("ddd, MMM D · h:mm A")} · {ctx.appointmentLabel(e.type)}
								{e.property ? ` · ${[e.property, e.location].filter(Boolean).join(" · ")}` : ""}
							</ChoiceCard>
						))}
						<ChoiceCard checked={!value.useExisting} onSelect={() => set({ useExisting: false })} title="Book a new visit">
							Pick the day, time and who goes.
						</ChoiceCard>
					</div>
				)}

				{!value.useExisting && (
					<>
						{/* When */}
						<div className="flex flex-col gap-2">
							<SectionLabel>Day</SectionLabel>
							<div className="flex flex-wrap gap-1.5">
								{days.map((d, i) => (
									<Chip key={d.format("YYYY-MM-DD")} on={value.date === d.format("YYYY-MM-DD")} onClick={() => set({ date: d.format("YYYY-MM-DD") })}>
										<span className="font-medium">{i === 0 ? "Tomorrow" : d.format("ddd")}</span>
										<span className="text-[11px] opacity-75">{d.format("MMM D")}</span>
									</Chip>
								))}
								<label className="flex items-center gap-1.5 rounded-md border border-border px-2 text-muted-foreground text-xs">
									Other
									<Input type="date" aria-label="Other day" className="h-7 w-[8.5rem] border-0 px-1 text-xs shadow-none" value={value.date} onChange={(e) => set({ date: e.target.value })} />
								</label>
							</div>
						</div>

						<div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
							<div className="flex flex-col gap-2">
								<SectionLabel>Time</SectionLabel>
								<div className="flex flex-wrap gap-1.5">
									{SLOTS.map((s) => (
										<Chip key={s} on={value.start === s} onClick={() => pickStart(s)} compact>
											{dayjs(`2000-01-01T${s}`).format("h:mm A")}
										</Chip>
									))}
									<Input type="time" aria-label="Other time" className="h-8 w-[6.5rem] text-xs" value={value.start} onChange={(e) => e.target.value && pickStart(e.target.value)} />
								</div>
							</div>
							<div className="flex flex-col gap-2">
								<SectionLabel>Length</SectionLabel>
								<div className="flex flex-wrap gap-1.5">
									{LENGTHS.map((m) => (
										<Chip key={m} on={length === m} onClick={() => set({ end: hmOf(Math.min(minutesOf(value.start) + m, 23 * 60 + 59)) })} compact>
											{lengthLabel(m)}
										</Chip>
									))}
								</div>
							</div>
						</div>
						{(errors.start || errors.end) && <span className="-mt-2 text-destructive text-xs">{errors.start ?? errors.end}</span>}

						{/* Who and what kind */}
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<div className="flex flex-col gap-1.5">
								<SectionLabel htmlFor="visit-owner">Who goes</SectionLabel>
								{ctx.canPickOwner ? (
									<Select value={value.ownerId} onValueChange={(ownerId) => set({ ownerId })}>
										<SelectTrigger id="visit-owner" className="h-9">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{ctx.people.map((p) => (
												<SelectItem key={p.id} value={p.id}>
													{p.name}
													{p.detail && <span className="text-muted-foreground text-xs"> · {p.detail}</span>}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								) : (
									<p id="visit-owner" className="flex h-9 items-center text-sm">
										You ({owner?.name ?? "me"})
									</p>
								)}
							</div>
							<div className="flex flex-col gap-1.5">
								<SectionLabel htmlFor="visit-type">Kind of visit</SectionLabel>
								<Select value={value.type} onValueChange={(type) => set({ type })}>
									<SelectTrigger id="visit-type" className="h-9">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{ctx.appointmentTypes.map((a) => (
											<SelectItem key={a.id} value={a.id}>
												{a.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						{/* Their day */}
						<div className={cn("flex flex-col gap-1 rounded-md px-3 py-2 text-xs", clash ? "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" : "bg-muted/40 text-muted-foreground")}>
							<span className="flex items-center gap-1.5 font-medium">
								{clash ? <WarningIcon className="size-3.5" /> : <CalendarBlankIcon className="size-3.5" />}
								{busy === null
									? `Checking ${owner?.name.split(" ")[0] ?? "their"}'s day…`
									: clash
										? `${owner?.name.split(" ")[0] ?? "They"} already has “${clash.title.split(" · ")[0]}” at ${dayjs(clash.start).format("h:mm A")}`
										: busy.length
											? `${owner?.name.split(" ")[0] ?? "They"} is free then · ${busy.length} other appointment${busy.length === 1 ? "" : "s"} that day`
											: `${owner?.name.split(" ")[0] ?? "They"} has nothing else that day`}
							</span>
							{busy && busy.length > 0 && (
								<span className="flex flex-wrap gap-1">
									{busy.map((b) => (
										<span key={b.id} className={cn("rounded border px-1.5 py-0.5", b.id === clash?.id ? "border-amber-400" : "border-border bg-card")}>
											{dayjs(b.start).format("h:mm")}–{dayjs(b.end).format("h:mm A")}
										</span>
									))}
								</span>
							)}
						</div>

						{/* With whom and where */}
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<SectionLabel>With and where</SectionLabel>
								{!showPlace && (
									<button type="button" className="text-brand text-xs hover:underline" onClick={() => setPlaceOpen(true)}>
										Change
									</button>
								)}
							</div>
							{showPlace ? (
								<div className="flex flex-col gap-3">
									<div className="flex flex-col gap-1.5">
										<Input id="visit-client" aria-label="With" className="h-9" placeholder="Customer name" value={value.clientName} onChange={(e) => set({ clientName: e.target.value })} />
										{errors.client && <span className="text-destructive text-xs">{errors.client}</span>}
									</div>
									<LocationPicker
										developments={ctx.developments}
										value={{ developmentId: value.developmentId, blockId: value.blockId, unitId: value.unitId }}
										onChange={(l) => set(l)}
										errors={errors}
										idPrefix="visit"
									/>
								</div>
							) : (
								<div className="flex flex-col gap-0.5 rounded-md border border-border px-3 py-2 text-sm">
									<span className="flex items-center gap-1.5">
										<UserIcon className="size-3.5 text-muted-foreground" /> {value.clientName}
									</span>
									<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
										<MapPinIcon className="size-3.5" /> {where}
									</span>
								</div>
							)}
						</div>

						<Input id="visit-notes" aria-label="Notes for the visit" className="h-9" placeholder="Notes for the visit (optional): access, keys, what to bring…" value={value.notes} onChange={(e) => set({ notes: e.target.value })} />

						{/* What gets booked */}
						<p className="flex flex-wrap items-center gap-x-1.5 rounded-md bg-sky-50 px-3 py-2 text-grey-900 text-xs dark:bg-sky-950/30 dark:text-grey-200">
							<CalendarBlankIcon className="size-3.5" />
							<b>{from.isValid() ? from.format("ddd, MMM D") : "—"}</b> · {from.isValid() ? from.format("h:mm A") : ""}–{to.isValid() ? to.format("h:mm A") : ""} ·{" "}
							{ctx.appointmentLabel(value.type)} · {owner?.name ?? "—"}
						</p>
					</>
				)}
			</div>
		</section>
	);
}

/** "Harbor View Residences · Tower A · Unit 304" from the picked ids. */
function locationText(developments: DevelopmentTree[], v: Pick<VisitDraft, "developmentId" | "blockId" | "unitId">) {
	const dev = developments.find((d) => d.id === v.developmentId);
	const block = dev?.blocks.find((b) => b.id === v.blockId);
	const unit = block?.units.find((u) => u.id === v.unitId);
	return [dev?.name, block?.name, unit ? (/^\d/.test(unit.number) ? `Unit ${unit.number}` : unit.number) : ""].filter(Boolean).join(" · ") || "No place yet";
}

function SectionLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
	return (
		<Label htmlFor={htmlFor} className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
			{children}
		</Label>
	);
}

function Chip({ on, onClick, children, compact }: { on: boolean; onClick: () => void; children: React.ReactNode; compact?: boolean }) {
	return (
		<button
			type="button"
			aria-pressed={on}
			onClick={onClick}
			className={cn(
				"flex items-center rounded-md border text-xs transition-colors",
				compact ? "h-8 px-2.5" : "flex-col px-2.5 py-1 leading-tight",
				on ? "border-brand bg-brand text-white" : "border-border bg-card hover:border-brand/60 hover:bg-brand/5",
			)}
		>
			{children}
		</button>
	);
}

function ChoiceCard({ checked, onSelect, title, children }: { checked: boolean; onSelect: () => void; title: string; children: React.ReactNode }) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={checked}
			onClick={onSelect}
			className={cn("flex items-start gap-2 rounded-md border p-2.5 text-left text-sm transition-colors", checked ? "border-brand bg-brand/5" : "border-border hover:bg-muted/40")}
		>
			<span className={cn("mt-0.5 size-4 shrink-0 rounded-full border-2", checked ? "border-[5px] border-brand" : "border-muted-foreground/50")} />
			<span className="flex min-w-0 flex-col">
				<span className="font-medium">{title}</span>
				<span className="text-muted-foreground text-xs">{children}</span>
			</span>
		</button>
	);
}

type Nearby = NonNullable<Workspace["detail"]["nearby"]>[number];
const SHOWN = 4;

/**
 * The next visit of the ticket (a sub-ticket's is its parent's), with the
 * ways to it: the calendar and the Tasks screen where the work is done.
 * Other open sub-tickets at the same place are listed, to handle them on the
 * same trip.
 */
export function NextVisit({ ws }: { ws: Workspace }) {
	const { detail, ticket, userName, appointmentLabel, workflow, workflowOf, openDetails } = ws;
	const [showAll, setShowAll] = useState(false);
	const own = openVisits(detail.events);
	const next = [...own, ...openVisits(detail.parentVisits ?? [])].sort((a, b) => a.start.localeCompare(b.start))[0];
	const nearby = detail.nearby ?? [];
	if (!next && nearby.length === 0) return null;
	const started = next?.service?.status === "in_progress";
	const sale = workflow?.id === "wf-sales";
	const fromParent = next && !own.includes(next);
	const where = next ? [next.property !== "—" ? next.property : "", next.location].filter(Boolean).join(" · ") : [ticket.property, ticket.location].filter(Boolean).join(" · ");
	const late = next && dayjs(next.end).isBefore(dayjs()) && !started;
	const shown = showAll ? nearby : nearby.slice(0, SHOWN);
	const parentNo = detail.parent?.number;

	return (
		<Panel
			title={!next ? "Same place" : started ? "Visit in progress" : "Next visit"}
			icon={!next ? <MapPinIcon className="size-4" /> : <CalendarBlankIcon className="size-4" />}
			bodyClassName=""
		>
			{next && (
				<div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex min-w-0 items-start gap-3">
						{/* Date tile */}
						<div className="flex w-12 shrink-0 flex-col items-center rounded-md border border-border bg-muted/30 py-1 leading-tight">
							<span className="font-semibold text-[10px] text-muted-foreground uppercase">{dayjs(next.start).format("MMM")}</span>
							<span className="font-semibold text-lg">{dayjs(next.start).format("D")}</span>
						</div>
						<div className="flex min-w-0 flex-col gap-0.5 text-sm">
							<span className="flex flex-wrap items-center gap-2 font-medium">
								{dayjs(next.start).format("ddd · h:mm A")}–{dayjs(next.end).format("h:mm A")}
								{late && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-[11px] text-amber-800">Past its time</span>}
							</span>
							<span className="text-muted-foreground text-xs">
								{appointmentLabel(next.type)} · {userName(next.ownerId)} · with {ticket.requester.name || ticket.clientName || "the customer"}
							</span>
							{where && (
								<span className="flex items-center gap-1 text-muted-foreground text-xs">
									<MapPinIcon className="size-3.5 shrink-0" /> {where}
								</span>
							)}
							{fromParent && <span className="text-muted-foreground text-xs">Visit of #{next.ticketNumber}: this sub-ticket is one of its actions.</span>}
						</div>
					</div>
					{next.canOpen && (
						<div className="flex shrink-0 flex-wrap gap-2">
							<Button asChild size="sm" variant="secondary">
								<Link to="/calendar" search={{ event: next.id }}>
									<CalendarBlankIcon className="size-4" /> See in calendar
								</Link>
							</Button>
							<Button asChild size="sm">
								<Link to="/technician/$activityId" params={{ activityId: next.id }}>
									<WrenchIcon className="size-4" />
									{started ? "Continue on the Tasks screen" : sale ? "Start the showing" : "Start the repair"}
								</Link>
							</Button>
						</div>
					)}
				</div>
			)}

			{nearby.length > 0 && (
				<div className={cn(next && "border-border border-t")}>
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-muted/30 px-4 py-2 text-xs">
						<span className="rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand">{nearby.length} more here</span>
						<span className="text-muted-foreground">
							Open sub-tickets at {where || "this place"}
							{next ? ": handle them on the same trip." : "."}
						</span>
					</div>
					<ul className="divide-y divide-border">
						{shown.map((n) => (
							<NearbyRow key={n.id} n={n} parentNo={parentNo} onOpen={() => openDetails(n.number)} workflow={workflowOf(n.typeId)} sameTrip={Boolean(next)} />
						))}
					</ul>
					{nearby.length > SHOWN && (
						<button type="button" onClick={() => setShowAll((v) => !v)} className="w-full border-border border-t px-4 py-2 text-left text-brand text-xs hover:bg-muted/30">
							{showAll ? "Show less" : `Show all ${nearby.length}`}
						</button>
					)}
				</div>
			)}
		</Panel>
	);
}

function NearbyRow({ n, parentNo, onOpen, workflow, sameTrip }: { n: Nearby; parentNo?: number; onOpen: () => void; workflow?: Workflow; sameTrip: boolean }) {
	return (
		<li>
			<button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/30">
				<span className="w-12 shrink-0 font-mono text-muted-foreground text-xs">#{n.number}</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate font-medium text-sm">{n.title}</span>
					<span className="block text-[11px] text-muted-foreground">
						{n.sameVisit ? (sameTrip ? `On this visit · #${parentNo}` : `Also under #${parentNo}`) : `Another ticket · under #${n.parentNumber}`}
					</span>
				</span>
				<StatusBadge workflow={workflow} statusId={n.statusId} />
			</button>
		</li>
	);
}
