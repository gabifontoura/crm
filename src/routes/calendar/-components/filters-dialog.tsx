import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Separator } from "#/components/ui/separator";
import { Switch } from "#/components/ui/switch";
import { type AppointmentTypeDef, MEETING_MODES } from "./constants";
import type { AppointmentType, CalendarFilters } from "./types";

/** Radix Select can't use "" as an item value, so "all" maps to this. */
const ALL = "__all__";

interface FiltersDialogProps {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	filters: CalendarFilters;
	onChange: (f: CalendarFilters) => void;
	onClear: () => void;
	properties: string[];
	owners: { id: string; name: string }[];
	types: AppointmentTypeDef[];
}

export function FiltersDialog({
	open,
	onOpenChange,
	filters,
	onChange,
	onClear,
	properties,
	owners,
	types,
}: FiltersDialogProps) {
	function set<K extends keyof CalendarFilters>(key: K, value: CalendarFilters[K]) {
		onChange({ ...filters, [key]: value });
	}

	function toggleType(id: AppointmentType, active: boolean) {
		const next = active ? [...filters.types, id] : filters.types.filter((t) => t !== id);
		set("types", next);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="!flex !max-h-[85vh] w-full !max-w-[95vw] flex-col !gap-0 !overflow-hidden !bg-card !p-0 text-left sm:!max-w-2xl lg:!max-w-[720px]">
				<div className="shrink-0 border-b px-6 pt-6 pb-4 text-left">
					<DialogTitle className="text-left">Calendar filters</DialogTitle>
					<DialogDescription className="mt-1.5 text-left">
						Narrow down the appointments shown on the calendar.
					</DialogDescription>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 text-left">
					<div className="flex flex-col gap-5 text-left">
						<div className="grid grid-cols-1 gap-4 text-left sm:grid-cols-2">
							<div className="flex flex-col gap-1.5 text-left">
								<label htmlFor="flt-property" className="text-left font-semibold text-muted-foreground text-xs">
									Development
								</label>
								<Select
									value={filters.property || ALL}
									onValueChange={(v) => set("property", v === ALL ? "" : v)}
								>
									<SelectTrigger id="flt-property" className="justify-start text-left">
										<SelectValue placeholder="All developments" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={ALL}>All developments</SelectItem>
										{properties.map((p) => (
											<SelectItem key={p} value={p}>
												{p}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* Only admins see other people's schedules, so only they filter by owner. */}
							{owners.length > 0 && (
							<div className="flex flex-col gap-1.5 text-left">
								<label htmlFor="flt-owner" className="text-left font-semibold text-muted-foreground text-xs">
									Owner
								</label>
								<Select
									value={filters.owner || ALL}
									onValueChange={(v) => set("owner", v === ALL ? "" : v)}
								>
									<SelectTrigger id="flt-owner" className="justify-start text-left">
										<SelectValue placeholder="All users" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={ALL}>All users</SelectItem>
										{owners.map((u) => (
											<SelectItem key={u.id} value={u.id}>
												{u.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							)}

							<div className="flex flex-col gap-1.5 text-left">
								<label htmlFor="flt-mode" className="text-left font-semibold text-muted-foreground text-xs">
									Meeting mode
								</label>
								<Select
									value={filters.mode}
									onValueChange={(v) => set("mode", v as CalendarFilters["mode"])}
								>
									<SelectTrigger id="flt-mode" className="justify-start text-left">
										<SelectValue placeholder="All" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All</SelectItem>
										{MEETING_MODES.map((t) => (
											<SelectItem key={t.id} value={t.id}>
												{t.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="flex flex-col gap-1.5 text-left">
								<span className="text-left font-semibold text-muted-foreground text-xs">Date range</span>
								<div className="flex items-center gap-2">
									<Input
										type="date"
										aria-label="From"
										className="h-10 flex-1 text-sm"
										value={filters.startDate}
										max={filters.endDate || undefined}
										onChange={(e) => set("startDate", e.target.value)}
									/>
									<span className="shrink-0 text-muted-foreground text-xs">to</span>
									<Input
										type="date"
										aria-label="To"
										className="h-10 flex-1 text-sm"
										value={filters.endDate}
										min={filters.startDate || undefined}
										onChange={(e) => set("endDate", e.target.value)}
									/>
								</div>
							</div>
						</div>

						<Separator />

						<div className="flex flex-col gap-2 text-left">
							<span className="text-left font-semibold text-muted-foreground text-xs">Appointment type</span>
							<div className="grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
								{types.map((t) => (
									<label
										key={t.id}
										htmlFor={`flt-type-${t.id}`}
										className="flex items-center justify-start gap-2 text-left text-sm"
									>
										<Checkbox
											id={`flt-type-${t.id}`}
											checked={filters.types.includes(t.id)}
											onCheckedChange={(v) => toggleType(t.id, Boolean(v))}
										/>
										<span className="text-left">{t.label}</span>
									</label>
								))}
							</div>
						</div>

						<Separator />

						<label
							htmlFor="flt-pending"
							className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2.5 text-left text-sm"
						>
							<span className="text-left font-medium">Only activities not yet completed</span>
							<Switch
								id="flt-pending"
								checked={filters.pendingOnly}
								onCheckedChange={(v) => set("pendingOnly", Boolean(v))}
							/>
						</label>
					</div>
				</div>

				<div className="flex shrink-0 justify-between border-t bg-muted/20 px-6 py-4">
					<Button variant="secondary" onClick={onClear}>
						Clear filters
					</Button>
					<Button onClick={() => onOpenChange(false)}>
						Apply
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
