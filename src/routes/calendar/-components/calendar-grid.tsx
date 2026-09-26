import dayjs from "dayjs";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "#/components/ui/accordion";
import { eventsOnDay, tagsForEvent } from "./constants";
import { EventCard } from "./event-card";
import type { CalendarEvent, CalendarView } from "./types";
import type { CardConfig, HoursConfig, TypeColor } from "./use-calendar-settings";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BASE_HOUR_HEIGHT = 44;
/** Height of a one-hour card; shorter appointments still get this much room. */
const ONE_HOUR_CARD = 96;
/** Room left around a card's content so it never looks cramped. */
const CARD_BREATHING = 12;

/** On the time axis every appointment takes at least one hour of room. */
function layoutEnd(e: CalendarEvent): Date {
	const hour = new Date(e.start.getTime() + 60 * 60_000);
	return e.end > hour ? e.end : hour;
}

function estimateCardHeight(e: CalendarEvent, card: CardConfig): number {
	const f = card.fields;
	let h = 22; // title line + padding
	const titleLines = Math.min(3, Math.max(1, Math.ceil((e.title?.length ?? 20) / 30)));
	h += (titleLines - 1) * 15;
	if (f.time) h += 16;
	// One line each for the simple fields that are switched on.
	for (const k of ["client", "ticket", "property", "location", "owner", "mode", "project"] as const) {
		if (f[k]) h += 16;
	}
	if (f.notes) {
		const notesLines = Math.min(2, Math.max(1, Math.ceil((e.notes?.length ?? 0) / 42)));
		h += notesLines * 15 + 4;
	}
	if (f.tags && tagsForEvent(e, card.tags).length > 0) h += 26;
	if (e.completed) h += 16;
	return h;
}

interface CalendarGridProps {
	view: CalendarView;
	refDate: Date;
	events: CalendarEvent[];
	colorForType: (id: CalendarEvent["type"]) => TypeColor;
	textColorFor: (id: CalendarEvent["type"]) => string;
	card: CardConfig;
	onOpen: (e: CalendarEvent) => void;
	onOpenClient: (e: CalendarEvent) => void;
	onCopy?: (e: CalendarEvent) => void;
	onViewDay: (d: Date) => void;
	hours: HoursConfig;
	gridKey: number;
	isMobile?: boolean;
}

function minutesIntoDay(d: Date, startHour: number): number {
	return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 - startHour * 60;
}

function assignLanes(
	list: CalendarEvent[],
	endOf: (e: CalendarEvent) => Date = (e) => e.end,
): { event: CalendarEvent; lane: number; totalLanes: number }[] {
	const result: { event: CalendarEvent; lane: number }[] = [];
	const busyLanes: { end: Date; lane: number }[] = [];
	for (const e of list) {
		let lane = 0;
		while (busyLanes.some((f) => f.lane === lane && e.start < f.end)) {
			lane++;
		}
		result.push({ event: e, lane });
		busyLanes.push({ end: endOf(e), lane });
	}
	const maxLanes = result.length > 0 ? Math.max(...result.map((r) => r.lane)) + 1 : 1;
	return result.map((r) => ({ ...r, totalLanes: maxLanes }));
}

export function CalendarGrid(props: CalendarGridProps) {
	if (!props.isMobile && props.view === "month") return <MonthView {...props} />;
	if (!props.isMobile && props.view === "week") return <WeekListView {...props} />;
	return <TimeView {...props} days={props.view === "day" ? 1 : props.view === "month" ? 31 : 7} />;
}

function MonthView({
	refDate,
	events,
	colorForType,
	textColorFor,
	card,
	onOpen,
	onOpenClient,
	onCopy,
	onViewDay,
	gridKey,
	isMobile,
}: CalendarGridProps) {
	const today = dayjs().startOf("day");
	const monthStart = dayjs(refDate).startOf("month");
	const gridStart = monthStart.startOf("week");
	const gridDays = Array.from({ length: 42 }, (_, i) => gridStart.add(i, "day"));

	const eventsByDay = new Map<string, CalendarEvent[]>();
	for (const d of gridDays) {
		eventsByDay.set(d.toISOString(), eventsOnDay(events, d.toDate()));
	}

	return (
		<div className="w-full overflow-hidden rounded-lg border border-border bg-card" key={`month-${gridKey}`}>
			<div className="grid grid-cols-7 border-border border-b bg-muted/40">
				{WEEKDAYS.map((s) => (
					<div
						key={s}
						className="py-2 text-center font-semibold text-muted-foreground text-xs uppercase tracking-wide"
					>
						{s}
					</div>
				))}
			</div>
			<div className="grid grid-cols-7">
				{gridDays.map((d) => {
					const outside = d.month() !== monthStart.month();
					const isToday = d.isSame(today, "day");
					const list = eventsByDay.get(d.toISOString()) ?? [];
					const visible = list.slice(0, 4);
					const rest = list.length - visible.length;
					return (
						<div
							key={d.toISOString()}
							className={`min-h-28 border-border border-r border-b p-1 ${
								outside ? "bg-muted/20" : ""
							}`}
						>
							<button
								type="button"
								onClick={() => onViewDay(d.toDate())}
								className={`mb-1 flex size-6 items-center justify-center rounded-full font-medium text-xs ${
									isToday
										? "bg-brand text-white"
										: "text-muted-foreground hover:bg-muted"
								}`}
							>
								{d.date()}
							</button>
							<div className="flex flex-col gap-1">
								{visible.map((e) => (
									<EventCard
										key={e.id}
										event={e}
										color={colorForType(e.type)}
										textColor={textColorFor(e.type)}
										card={card}
										onOpen={onOpen}
										onOpenClient={onOpenClient}
										onCopy={onCopy}
										variant="chip"
										isMobile={isMobile}
									/>
								))}
								{rest > 0 && (
									<button
										type="button"
										onClick={() => onViewDay(d.toDate())}
										className="rounded bg-muted px-1.5 py-0.5 text-left font-medium text-[11px] text-muted-foreground hover:bg-muted/70"
									>
										+{rest} more
									</button>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function WeekListView({
	refDate,
	events,
	colorForType,
	textColorFor,
	card,
	onOpen,
	onOpenClient,
	onCopy,
	gridKey,
	isMobile,
}: CalendarGridProps) {
	const today = dayjs().startOf("day");
	const weekStart = dayjs(refDate).startOf("week");
	const columns = Array.from({ length: 7 }, (_, i) => weekStart.add(i, "day"));
	const weekIds = columns.map((c) => c.toISOString());
	const weekKey = weekIds[0] ?? "week";
	const [openWeek, setOpenWeek] = useState(weekKey);
	const [openDays, setOpenDays] = useState<string[]>(weekIds);
	if (openWeek !== weekKey) {
		setOpenWeek(weekKey);
		setOpenDays(weekIds);
	}
	const allOpen = openDays.length === weekIds.length;

	return (
		<div className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card" key={`week-${gridKey}`}>
			<div className="flex items-center justify-between border-border border-b bg-muted/30 px-3 py-2">
				<div className="text-xs text-muted-foreground">
					{columns[0].format("MMM D")} - {columns[6].format("MMM D")}
				</div>
				<button
					type="button"
					onClick={() => setOpenDays(allOpen ? [] : weekIds)}
					className="font-medium text-xs text-foreground hover:underline"
				>
					{allOpen ? "Collapse all" : "Expand all"}
				</button>
			</div>
			<Accordion
				type="multiple"
				value={openDays}
				onValueChange={setOpenDays}
				className="flex-1 overflow-y-auto"
			>
				{columns.map((c) => {
					const list = eventsOnDay(events, c.toDate());
					const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime());
					const isToday = c.isSame(today, "day");
					return (
						<AccordionItem key={c.toISOString()} value={c.toISOString()} className={`border-b border-border/50 last:border-b-0 ${isToday ? "bg-muted/5" : ""}`}>
							<AccordionTrigger className="px-3 py-1.5 hover:no-underline">
								<span className="flex flex-1 items-center justify-between gap-2 pr-1">
									<span>
										<span className="font-semibold text-xs uppercase">{c.format("dddd")}</span>
										<span className="text-xs text-muted-foreground ml-1">{c.format("MMM D")}</span>
									</span>
									<span className="text-[10px] text-muted-foreground">{list.length} appointment{list.length !== 1 ? "s" : ""}</span>
								</span>
							</AccordionTrigger>
							<AccordionContent className="pb-1">
								{sorted.length === 0 ? (
									<p className="px-3 py-2 text-xs text-muted-foreground">No appointments on this day</p>
								) : (
									<div className="flex flex-col divide-y divide-border/30">
										{sorted.map((e) => (
											<EventCard
												key={e.id}
												event={e}
												color={colorForType(e.type)}
												textColor={textColorFor(e.type)}
												card={card}
											onOpen={onOpen}
											onOpenClient={onOpenClient}
											onCopy={onCopy}
											variant="month"
											wideText
										/>
									))}
								</div>
							)}
						</AccordionContent>
					</AccordionItem>
				);
			})}
		</Accordion>
	</div>
	);
}

function TimeView({
	days,
	refDate,
	events,
	colorForType,
	textColorFor,
	card,
	onOpen,
	onOpenClient,
	onCopy,
	hours,
	gridKey,
	isMobile,
}: CalendarGridProps & { days: number }) {
	const today = dayjs().startOf("day");
	const firstDay = days === 1 ? dayjs(refDate).startOf("day") : dayjs(refDate).startOf("week");
	const columns = Array.from({ length: days }, (_, i) => firstDay.add(i, "day"));
	const columnIds = columns.map((c) => c.toISOString());
	const columnsKey = columnIds[0] ?? "columns";
	const [openColumns, setOpenColumns] = useState(columnsKey);
	const [openMobile, setOpenMobile] = useState<string[]>(columnIds);
	if (openColumns !== columnsKey) {
		setOpenColumns(columnsKey);
		setOpenMobile(columnIds);
	}
	const allOpenMobile = openMobile.length === columnIds.length;
	// Real content height of each card, measured after it renders (text wraps
	// more in narrow side-by-side columns than any estimate can tell).
	const [measured, setMeasured] = useState<Record<string, number>>({});
	const cardRefs = useRef(new Map<string, HTMLElement>());
	// A narrower window wraps the text again: measure once more.
	const [, setWidthTick] = useState(0);
	useEffect(() => {
		const onResize = () => setWidthTick((n) => n + 1);
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);
	useLayoutEffect(() => {
		const next: Record<string, number> = {};
		let changed = false;
		for (const [id, el] of cardRefs.current) {
			const content = el.firstElementChild as HTMLElement | null;
			if (!content || content.children.length === 0) continue;
			// Where its last line ends, not the box height (the box stretches to its slot).
			const box = content.getBoundingClientRect();
			const bottom = Math.max(...[...content.children].map((c) => c.getBoundingClientRect().bottom));
			const padBottom = Number.parseFloat(getComputedStyle(content).paddingBottom) || 0;
			next[id] = Math.ceil(bottom - box.top + content.scrollTop + padBottom);
			if (Math.abs((measured[id] ?? 0) - next[id]) > 2) changed = true;
		}
		if (changed) setMeasured(next);
	});
	const HOUR_START = hours.startHour;
	const HOUR_END = hours.endHour;
	const hourRows = Array.from(
		{ length: HOUR_END - HOUR_START },
		(_, i) => HOUR_START + i,
	);
	// Flexible height per hour slot: empty hours stay compact (BASE_HOUR_HEIGHT);
	// the hours a card covers stretch until the card fits, at least one hour's
	// card tall even for a 30-minute appointment.
	const hourHeights = hourRows.map(() => BASE_HOUR_HEIGHT);
	{
		const totalMin = hourRows.length * 60;
		const all = columns.flatMap((c) => eventsOnDay(events, c.toDate()));
		all.sort((a, b) => a.start.getTime() - b.start.getTime());
		for (const e of all) {
			if (hourRows.length === 0) break;
			const startMin = Math.min(totalMin, Math.max(0, minutesIntoDay(e.start, HOUR_START)));
			const endMin = Math.min(totalMin, Math.max(startMin + 15, minutesIntoDay(layoutEnd(e), HOUR_START)));
			// How much of each hour row the card covers (0..1).
			const covered: { i: number; frac: number }[] = [];
			for (let i = Math.floor(startMin / 60); i < hourRows.length && i * 60 < endMin; i++) {
				const frac = (Math.min(endMin, (i + 1) * 60) - Math.max(startMin, i * 60)) / 60;
				if (frac > 0) covered.push({ i, frac });
			}
			if (covered.length === 0) continue;
			const span = covered.reduce((sum, c) => sum + c.frac * hourHeights[c.i], 0);
			const need = Math.max(ONE_HOUR_CARD, (measured[e.id] ?? estimateCardHeight(e, card)) + CARD_BREATHING);
			if (span < need) {
				// Grow the covered rows so the card's share adds up to what it needs.
				const extra = (need - span) / covered.reduce((sum, c) => sum + c.frac, 0);
				for (const c of covered) hourHeights[c.i] += extra;
			}
		}
	}
	const hourTops: number[] = [];
	{
		let acc = 0;
		for (const a of hourHeights) {
			hourTops.push(acc);
			acc += a;
		}
	}
	const totalHeight = hourTops.length > 0 ? hourTops[hourTops.length - 1] + hourHeights[hourHeights.length - 1] : 0;
	function posY(minDesdeInicio: number): number {
		if (hourRows.length === 0) return 0;
		const totalMin = hourRows.length * 60;
		const m = Math.min(totalMin, Math.max(0, minDesdeInicio));
		const idx = Math.min(hourRows.length - 1, Math.floor(m / 60));
		return hourTops[idx] + ((m - idx * 60) / 60) * hourHeights[idx];
	}
	const gridCols = days === 7 ? "grid-cols-7" : "grid-cols-1";

	if (isMobile && days === 1) {
		const list = eventsOnDay(events, columns[0].toDate());
		const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime());

		return (
			<div className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card" key={`day-${gridKey}`}>
				<div className="flex items-center justify-between border-border border-b bg-muted/30 px-3 py-2">
					<div>
						<div className="font-semibold text-sm text-foreground">{columns[0].format("dddd")}</div>
						<div className="text-xs text-muted-foreground">{columns[0].format("MMM D, YYYY")}</div>
					</div>
				</div>
				<div className="flex-1 overflow-y-auto">
					{sorted.length === 0 ? (
						<div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
							No appointments for this day
						</div>
					) : (
						<div className="flex flex-col divide-y divide-border/50">
							{sorted.map((e) => (
								<EventCard
									key={e.id}
									event={e}
									color={colorForType(e.type)}
									textColor={textColorFor(e.type)}
									card={card}
									onOpen={onOpen}
									onOpenClient={onOpenClient}
									onCopy={onCopy}
									variant="month"
									isMobile
								/>
							))}
						</div>
					)}
				</div>
			</div>
		);
	}

	if (isMobile && days === 31) {
		const monthStart = dayjs(refDate).startOf("month");
		const monthDays = Array.from({ length: monthStart.daysInMonth() }, (_, i) => monthStart.add(i, "day"));
		return (
			<div className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card" key={`month-${gridKey}`}>
				<div className="border-border border-b bg-muted/30 px-3 py-2">
					<div className="text-xs text-muted-foreground capitalize">
						{monthStart.format("MMMM YYYY")}
					</div>
				</div>
				<div className="flex-1 overflow-y-auto">
					{monthDays.map((c) => {
						const list = eventsOnDay(events, c.toDate());
						const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime());
						const isToday = c.isSame(today, "day");
						return (
							<div key={c.toISOString()} className={`border-b border-border/50 last:border-b-0 ${isToday ? "bg-muted/5" : ""}`}>
								<div className="sticky top-0 z-10 bg-card px-3 py-1.5">
									<div className="flex items-center justify-between">
										<div>
											<span className="font-semibold text-xs uppercase">{c.format("dddd")}</span>
											<span className="text-xs text-muted-foreground ml-1">{c.format("MMM D")}</span>
										</div>
										<span className="text-[10px] text-muted-foreground">{list.length} appointment{list.length !== 1 ? "s" : ""}</span>
									</div>
								</div>
								{sorted.length === 0 ? null : (
									<div className="flex flex-col divide-y divide-border/30">
										{sorted.map((e) => (
											<EventCard
												key={e.id}
												event={e}
												color={colorForType(e.type)}
												textColor={textColorFor(e.type)}
												card={card}
												onOpen={onOpen}
												onOpenClient={onOpenClient}
												onCopy={onCopy}
												variant="month"
												isMobile
											/>
										))}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>
		);
	}

	if (isMobile) {
		return (
			<div className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card" key={`week-${gridKey}`}>
				<div className="flex items-center justify-between border-border border-b bg-muted/30 px-3 py-2">
					<div className="text-xs text-muted-foreground">
						{columns[0].format("MMM D")} - {columns[6].format("MMM D")}
					</div>
					<button
						type="button"
						onClick={() => setOpenMobile(allOpenMobile ? [] : columnIds)}
						className="font-medium text-xs text-foreground hover:underline"
					>
						{allOpenMobile ? "Collapse all" : "Expand all"}
					</button>
				</div>
			<div className="flex-1 overflow-y-auto">
				<Accordion
					type="multiple"
					value={openMobile}
					onValueChange={setOpenMobile}
				>
					{columns.map((c) => {
						const list = eventsOnDay(events, c.toDate());
						const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime());
						const isToday = c.isSame(today, "day");
						return (
							<AccordionItem key={c.toISOString()} value={c.toISOString()} className={`border-b border-border/50 last:border-b-0 ${isToday ? "bg-muted/5" : ""}`}>
								<AccordionTrigger className="px-3 py-1.5 hover:no-underline">
									<span className="flex flex-1 items-center justify-between gap-2 pr-1">
										<span>
											<span className="font-semibold text-xs uppercase">{c.format("dddd")}</span>
											<span className="text-xs text-muted-foreground ml-1">{c.format("MMM D")}</span>
										</span>
										<span className="text-[10px] text-muted-foreground">{list.length} appointment{list.length !== 1 ? "s" : ""}</span>
									</span>
								</AccordionTrigger>
								<AccordionContent className="pb-1">
									{sorted.length === 0 ? (
										<p className="px-3 py-2 text-xs text-muted-foreground">No appointments on this day</p>
									) : (
										<div className="flex flex-col divide-y divide-border/30">
											{sorted.map((e) => (
												<EventCard
													key={e.id}
													event={e}
													color={colorForType(e.type)}
													textColor={textColorFor(e.type)}
													card={card}
													onOpen={onOpen}
													onOpenClient={onOpenClient}
													onCopy={onCopy}
													variant="month"
													isMobile
												/>
											))}
										</div>
									)}
								</AccordionContent>
							</AccordionItem>
						);
					})}
				</Accordion>
			</div>
			</div>
		);
	}

	return (
		<div className="flex w-full overflow-hidden rounded-lg border border-border bg-card" key={`day-${gridKey}`}>
			<div className="w-14 shrink-0 border-border border-r bg-muted/30">
				<div className="h-10" />
				<div className="relative" style={{ height: totalHeight }}>
					{hourRows.map((h, i) => (
						<div
							key={h}
							className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
							style={{ top: hourTops[i] }}
						>
							{String(h).padStart(2, "0")}:00
						</div>
					))}
				</div>
			</div>

			<div className="flex-1">
				<div className={`grid ${gridCols} border-border border-b`}>
					{columns.map((c) => (
						<div
							key={`head-${c.toISOString()}`}
							className={`border-border border-r text-center ${
								c.isSame(today, "day") ? "bg-brand/10" : ""
							}`}
						>
							<div className="font-medium text-[11px] text-muted-foreground uppercase">
								{c.format("ddd")}
							</div>
							<div
								className={`font-semibold text-sm ${
									c.isSame(today, "day") ? "text-foreground" : ""
								}`}
							>
								{c.date()}
							</div>
						</div>
					))}
				</div>

				<div className="relative" style={{ height: totalHeight }}>
					{hourRows.map((h, i) => (
						i === 0 ? null : (
						<div
							key={`line-${h}`}
							className="pointer-events-none absolute right-0 left-0 border-border/60 border-b border-dashed"
							style={{ top: hourTops[i] }}
						/>
						)
					))}

					<div className={`absolute inset-0 grid ${gridCols}`} style={{ overflowX: 'visible' }}>
						{columns.map((c) => {
							const list = eventsOnDay(events, c.toDate());
							const assignments = assignLanes(list, layoutEnd);
							const totalLanes = assignments.length > 0 ? Math.max(...assignments.map((a) => a.totalLanes)) : 1;
							return (
								<div key={`col-${c.toISOString()}`} className={`relative border-border border-r ${totalLanes > 5 ? 'overflow-x-auto' : ''}`}>
									{assignments.map(({ event: e, lane }) => {
										const top = posY(minutesIntoDay(e.start, HOUR_START));
										const height = posY(minutesIntoDay(layoutEnd(e), HOUR_START)) - top;
										const widthPct = totalLanes > 1 ? `${100 / totalLanes}%` : '100%';
										const offsetPct = totalLanes > 1 ? `${lane * (100 / totalLanes)}%` : '0%';
										const isWide = totalLanes > 5;
										return (
											<div
												key={e.id}
												ref={(el) => {
													if (el) cardRefs.current.set(e.id, el);
													else cardRefs.current.delete(e.id);
												}}
												className={`absolute z-10 ${isWide ? '' : 'min-w-[120px]'}`} style={{ top: top + 3, height: Math.max(24, height - 6), left: isWide ? `${lane * 140 + 3}px` : `calc(${offsetPct} + 1rem + 3px)`, width: isWide ? '134px' : `calc(${widthPct} - 2rem - 6px)`, minWidth: isWide ? undefined : 120 }}>
												<EventCard
													event={e}
													color={colorForType(e.type)}
													textColor={textColorFor(e.type)}
													card={card}
													onOpen={onOpen}
													onOpenClient={onOpenClient}
													onCopy={onCopy}
													variant="block"
												/>
											</div>
										);
									})}
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}
