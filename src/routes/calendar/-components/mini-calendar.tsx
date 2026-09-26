import { Calendar } from "#/components/ui/calendar";
import { APP_LOCALE } from "#/lib/format";
import { cn } from "#/lib/utils";
import type { CalendarEvent } from "./types";

interface MiniCalendarProps {
	selected: Date;
	onSelect: (d: Date) => void;
	events: CalendarEvent[];
}

function uniqueDaysWithEvents(events: CalendarEvent[]): Date[] {
	const map = new Map<string, Date>();
	for (const e of events) {
		const d = new Date(e.start);
		d.setHours(0, 0, 0, 0);
		map.set(d.toISOString(), d);
	}
	return [...map.values()];
}

export function MiniCalendar({ selected, onSelect, events }: MiniCalendarProps) {
	const days = uniqueDaysWithEvents(events);

	return (
		<div className="w-full rounded-lg border border-border bg-card p-2 shadow-sm">
			<Calendar
				mode="single"
				selected={selected}
				onSelect={(d) => d && onSelect(d)}
				defaultMonth={selected}
				className="w-full"
				classNames={{
					root: "w-full",
					month_grid: "w-full",
				}}
				formatters={{
					formatCaption: (date: Date) =>
						date.toLocaleDateString(APP_LOCALE, {
							month: "long",
							year: "numeric",
						}),
				}}
				modifiers={{ hasEvent: days }}
				modifiersClassNames={{
					hasEvent:
						"[&>button]:after:absolute [&>button]:after:bottom-0.5 [&>button]:after:left-1/2 [&>button]:after:-translate-x-1/2 [&>button]:after:size-1 [&>button]:after:rounded-full [&>button]:after:bg-brand [&>button]:after:content-['']",
				}}
			/>
			<div
				className={cn(
					"mt-1 flex items-center justify-between border-border border-t px-1 pt-2 text-muted-foreground text-xs",
				)}
			>
				<span>
					{days.length} {days.length === 1 ? "day" : "days"} with appointments
				</span>
			</div>
		</div>
	);
}
