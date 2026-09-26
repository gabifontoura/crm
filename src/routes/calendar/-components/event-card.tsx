import { CheckCircleIcon, ClockIcon, CopySimpleIcon, WrenchIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { formatTime } from "#/lib/format";
import { cn } from "#/lib/utils";
import { MEETING_MODES, tagsForEvent } from "./constants";
import type { CalendarEvent } from "./types";
import type { CardConfig, TypeColor } from "./use-calendar-settings";

interface EventCardProps {
	event: CalendarEvent;
	color: TypeColor;
	textColor: string;
	/** Which fields and tags the admin chose to show. */
	card: CardConfig;
	onOpen: (e: CalendarEvent) => void;
	onOpenClient: (e: CalendarEvent) => void;
	onCopy?: (e: CalendarEvent) => void;
	/** "chip": one line (time + title) for the narrow cells of the month grid. */
	variant?: "month" | "block" | "chip";
	isMobile?: boolean;
	wideText?: boolean;
	className?: string;
}

/** Appointment card shown in every calendar view: square, like a post-it. */
export function EventCard({
	event,
	color,
	textColor,
	card,
	onOpen,
	onOpenClient,
	onCopy,
	variant = "month",
	isMobile,
	wideText,
	className,
}: EventCardProps) {
	const wide = variant === "block" || wideText;
	const show = card.fields;
	const [expanded, setExpanded] = useState(false);
	const notesRef = useRef<HTMLParagraphElement>(null);
	const [hasMore, setHasMore] = useState(false);

	useEffect(() => {
		// Only measure while clamped; once expanded the text never overflows,
		// which would otherwise hide the "Read less" button.
		const el = notesRef.current;
		if (el && !expanded) setHasMore(el.scrollHeight > el.clientHeight);
	}, [expanded, event.notes, show.notes]);

	const activeTags = show.tags ? tagsForEvent(event, card.tags) : [];
	const lineText = wide ? "text-[13px]" : "text-[11px]";
	const modeLabel = MEETING_MODES.find((m) => m.id === event.mode)?.label ?? event.mode;

	if (variant === "chip") {
		return (
			<button
				type="button"
				onClick={() => onOpen(event)}
				onContextMenu={(e) => {
					e.preventDefault();
					onCopy?.(event);
				}}
				title={`${formatTime(event.start)} - ${formatTime(event.end)} · ${event.title}${event.property && event.property !== "—" ? ` · ${event.property}` : ""}`}
				className={cn(
					"flex w-full min-w-0 items-center gap-1 rounded-none border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
					className,
				)}
				style={{ backgroundColor: color.background, borderColor: color.border, color: textColor }}
			>
				<span className="shrink-0 font-semibold tabular-nums">{shortTime(event.start)}</span>
				<span className="min-w-0 flex-1 truncate">{event.title}</span>
				{event.completed && <CheckCircleIcon weight="fill" className="size-3 shrink-0" aria-label="Completed" />}
				{!event.completed && event.service?.status === "in_progress" && <WrenchIcon weight="fill" className="size-3 shrink-0" aria-label="Service in progress" />}
			</button>
		);
	}

	return (
		// biome-ignore lint/a11y/useSemanticElements: card with nested buttons (client / read more)
		<div
			role="button"
			tabIndex={0}
			onClick={() => onOpen(event)}
			onKeyDown={(e) => e.key === "Enter" && onOpen(event)}
			onContextMenu={(e) => {
				e.preventDefault();
				onCopy?.(event);
			}}
			className={cn(
				"group flex w-full cursor-pointer flex-col rounded-none border-l-4 shadow-sm px-1.5 py-1 text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:px-2 sm:py-1.5",
				variant === "block" ? "h-full overflow-x-hidden overflow-y-auto" : "",
				className,
			)}
			style={{
				backgroundColor: color.background,
				borderColor: color.border,
				color: textColor,
			}}
		>
			<div className="flex items-start justify-between gap-1">
				<span
					className={cn(
						"min-w-0 flex-1 font-semibold leading-tight",
						wide ? "text-[13px] sm:text-sm" : "text-[12px] sm:text-[13px]",
						variant === "block"
							? "line-clamp-3 whitespace-normal break-words"
							: "whitespace-normal break-words",
					)}
				>
					{event.title}
				</span>
				<div className="flex items-center gap-1">
					{!event.completed && event.service?.status === "in_progress" && (
						// Technician checked in on site and hasn't finished yet.
						<WrenchIcon weight="fill" className="size-3.5 shrink-0" aria-label="Service in progress" />
					)}
					{event.completed &&
						(wide ? (
							<span className="shrink-0 rounded bg-white/60 px-1 font-medium text-[11px]">Completed</span>
						) : (
							// Month cells are narrow: an icon leaves room for the title.
							<CheckCircleIcon weight="fill" className="size-3.5 shrink-0" aria-label="Completed" />
						))}
					{onCopy && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onCopy(event);
							}}
							className="shrink-0 rounded bg-white/50 p-0 hover:bg-white/70 sm:p-0.5"
							title="Copy appointment"
							aria-label="Copy appointment"
						>
							<CopySimpleIcon className="size-3" />
						</button>
					)}
				</div>
			</div>

			{show.time && (
				<div
					className={cn(
						"mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 opacity-90",
						wide ? "text-[11px] sm:text-[13px]" : "text-[10px] sm:text-[11px]",
						isMobile ? "font-medium text-sm opacity-100" : "",
					)}
				>
					<span className="inline-flex items-center gap-0.5">
						<ClockIcon className={isMobile ? "size-4" : "size-3"} />
						{formatTime(event.start)} - {formatTime(event.end)}
					</span>
				</div>
			)}

			{show.client && (
				<Line className={lineText} label="Client">
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onOpenClient(event);
						}}
						className="break-words text-left font-semibold underline-offset-2 hover:underline"
					>
						{event.client.name}
					</button>
				</Line>
			)}
			{show.ticket && <Line className={lineText} label="Ticket">{event.ticketNumber}</Line>}
			{show.property && event.property && event.property !== "—" && (
				<Line className={lineText} label="Site">
					{event.property}
				</Line>
			)}
			{show.location && event.location && <Line className={lineText} label="Where">{event.location}</Line>}
			{/* Quick tasks done together on this visit: its sub-tickets */}
			{(event.actions?.length ?? 0) > 0 &&
				(wide ? (
					<ul className={cn("mt-1 flex flex-col gap-0.5 rounded bg-white/45 px-1.5 py-1 leading-tight", lineText)} aria-label="Sub-tickets on this visit">
						{event.actions!.slice(0, 4).map((a) => (
							<li key={a.number} className={cn("flex items-baseline gap-1", a.done && "opacity-60")}>
								{a.done ? <CheckCircleIcon weight="fill" className="size-3 shrink-0 self-center" /> : <span className="size-3 shrink-0 self-center rounded-full border border-current" />}
								<span className="font-mono text-[10px] opacity-80">#{a.number}</span>
								<span className={cn("min-w-0 truncate", a.done && "line-through")}>{a.title}</span>
							</li>
						))}
						{event.actions!.length > 4 && <li className="text-[10px] opacity-80">+{event.actions!.length - 4} more</li>}
					</ul>
				) : (
					<span className="mt-1 self-start rounded bg-white/55 px-1 font-medium text-[10px]">
						{event.actions!.filter((a) => a.done).length}/{event.actions!.length} sub-tickets
					</span>
				))}
			{show.owner && <Line className={lineText} label="Owner">{event.owner.name}</Line>}
			{show.mode && <Line className={lineText} label="Mode">{modeLabel}</Line>}
			{show.project && <Line className={lineText} label="Project">{event.project}</Line>}

			{show.notes && (
				<>
					<p
						ref={notesRef}
						className={cn("mt-1 whitespace-pre-wrap break-words leading-snug", lineText, !expanded && "line-clamp-2")}
					>
						<span className="font-bold">Notes:</span> {event.notes}
					</p>
					{(hasMore || expanded) && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setExpanded((v) => !v);
							}}
							className={cn("mt-0.5 self-start font-semibold hover:underline", lineText)}
						>
							{expanded ? "Read less" : "Read more"}
						</button>
					)}
				</>
			)}

			{activeTags.length > 0 && (
				<div className="mt-1 flex flex-wrap gap-1">
					{activeTags.map((t) => (
						<TagChip key={t.id} label={t.label} color={t.color} small={!wide} />
					))}
				</div>
			)}
		</div>
	);
}

/** "9am", "2:30pm": short enough for a month cell. */
function shortTime(d: Date): string {
	const h = d.getHours();
	const m = d.getMinutes();
	return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

function Line({ label, children, className }: { label: string; children: ReactNode; className: string }) {
	return (
		<div className={cn("mt-1 break-words leading-tight", className)}>
			<span className="font-bold">{label}:</span> {children}
		</div>
	);
}

/** Tag pill with a colored dot. Shared by the card, dialog and settings. */
export function TagChip({ label, color, small }: { label: string; color: string; small?: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full bg-white/70 px-1.5 py-0.5 font-medium",
				small ? "text-[10px]" : "text-[11px]",
			)}
		>
			<span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
			{label}
		</span>
	);
}
