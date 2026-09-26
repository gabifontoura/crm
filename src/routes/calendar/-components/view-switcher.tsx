import { CalendarIcon, ColumnsIcon, ListIcon } from "@phosphor-icons/react";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import type { CalendarView } from "./types";

const OPTIONS: { id: CalendarView; label: string; Icon: typeof ListIcon }[] = [
	{ id: "day", label: "Day", Icon: CalendarIcon },
	{ id: "week", label: "Week", Icon: ListIcon },
	{ id: "month", label: "Month", Icon: ColumnsIcon },
];

export function ViewSwitcher({
	value,
	onChange,
	className,
}: {
	value: CalendarView;
	onChange: (v: CalendarView) => void;
	className?: string;
}) {
	return (
		<div className={cn("inline-flex items-center gap-1 [&>button]:flex-1 md:[&>button]:flex-none", className)} role="group" aria-label="Calendar view">
			{OPTIONS.map((o) => (
				<Button
					key={o.id}
					variant={value === o.id ? "default" : "secondary"}
					size="sm"
					onClick={() => onChange(o.id)}
					aria-pressed={value === o.id}
					className="gap-1.5"
				>
					<o.Icon className="size-3.5" />
					{o.label}
				</Button>
			))}
		</div>
	);
}
