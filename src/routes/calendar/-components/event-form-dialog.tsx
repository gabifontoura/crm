import { BuildingsIcon, ClockIcon, MapPinIcon, NoteIcon, TagIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Separator } from "#/components/ui/separator";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { formatDuration } from "#/lib/format";
import { ApiError } from "#/lib/api/client";
import { type DevelopmentTree, locationLabel } from "../../../../shared/developments";
import { type AppointmentTypeDef, MEETING_MODES } from "./constants";
import type { AppointmentType, CalendarEvent, MeetingMode, TagDef } from "./types";

interface EventFormDialogProps {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	initial: CalendarEvent | null;
	/** Date pre-filled for a new appointment (e.g. the day being viewed). */
	defaultDate?: Date;
	isCopy?: boolean;
	/** Rejects with an ApiError when the server refuses the appointment. */
	onSave: (e: CalendarEvent) => Promise<unknown>;
	/** Active team members who can own appointments. */
	owners: { id: string; name: string }[];
	/** Signed-in user; owns the appointment when they can't choose someone else. */
	currentUser: { id: string; name: string };
	/** Admins can book for anyone; everyone else only for themselves. */
	canChooseOwner: boolean;
	/** Job sites with their blocks and units, for the location pickers. */
	developments: DevelopmentTree[];
	/** Appointment types managed in the calendar settings. */
	types: AppointmentTypeDef[];
	/** Tags managed in the calendar settings; custom ones can be picked here. */
	tags: TagDef[];
}

const DEFAULT_PROJECT = "MAINTENANCE CONTRACT";
/** Radix Select can't use "" as a value, so "none" maps to this. */
const NONE = "__none__";

/** Local YYYY-MM-DD (toISOString would shift the day in some time zones). */
function toDateInput(d: Date): string {
	return dayjs(d).format("YYYY-MM-DD");
}
function toTimeInput(d: Date): string {
	return dayjs(d).format("HH:mm");
}

export function EventFormDialog({
	open,
	onOpenChange,
	initial,
	defaultDate,
	isCopy,
	onSave,
	types,
	tags,
	owners,
	currentUser,
	canChooseOwner,
	developments,
}: EventFormDialogProps) {
	const [project, setProject] = useState(DEFAULT_PROJECT);
	const [client, setClient] = useState("");
	const [clientId, setClientId] = useState("");
	const [ticket, setTicket] = useState("");
	const [developmentId, setDevelopmentId] = useState("");
	const [blockId, setBlockId] = useState("");
	const [unitId, setUnitId] = useState("");
	const [saving, setSaving] = useState(false);
	const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
	const [date, setDate] = useState(toDateInput(new Date()));
	const [startTime, setStartTime] = useState("09:00");
	const [endTime, setEndTime] = useState("10:00");
	const [type, setType] = useState<AppointmentType>("initial_inspection");
	const [mode, setMode] = useState<MeetingMode>("on_site");
	const [owner, setOwner] = useState(currentUser.id);
	const [notes, setNotes] = useState("");
	const [billable, setBillable] = useState(false);
	const [groupActivity, setGroupActivity] = useState(false);
	const [customTags, setCustomTags] = useState<string[]>([]);
	const [submitted, setSubmitted] = useState(false);

	useEffect(() => {
		if (!open) return;
		setSubmitted(false);
		setServerErrors({});
		if (initial) {
			setProject(initial.project);
			setClient(initial.client.name);
			setClientId(initial.client.id);
			setTicket(initial.ticketNumber === "—" ? "" : initial.ticketNumber);
			setDevelopmentId(initial.developmentId ?? "");
			setBlockId(initial.blockId ?? "");
			setUnitId(initial.unitId ?? "");
			setDate(toDateInput(initial.start));
			setStartTime(toTimeInput(initial.start));
			setEndTime(toTimeInput(initial.end));
			setType(initial.type);
			setMode(initial.mode);
			setOwner(initial.owner.id);
			setNotes(initial.notes);
			setBillable(initial.billable);
			setGroupActivity(initial.groupActivity);
			setCustomTags(initial.tags ?? []);
		} else {
			setProject(DEFAULT_PROJECT);
			setClient("");
			setClientId("");
			setTicket("");
			setDevelopmentId("");
			setBlockId("");
			setUnitId("");
			setDate(toDateInput(defaultDate ?? new Date()));
			setStartTime("09:00");
			setEndTime("10:00");
			setType(types[0]?.id ?? "initial_inspection");
			setMode("on_site");
			setOwner(currentUser.id);
			setNotes("");
			setBillable(false);
			setGroupActivity(false);
			setCustomTags([]);
		}
	}, [open, initial, defaultDate]);

	const start = new Date(`${date}T${startTime}:00`);
	const end = new Date(`${date}T${endTime}:00`);
	const durationMin = (end.getTime() - start.getTime()) / 60000;
	const errors = {
		project: project.trim() ? "" : "Project is required.",
		client: client.trim() ? "" : "Client is required.",
		time: durationMin > 0 ? "" : "End time must be after the start time.",
	};
	const isValid = !errors.project && !errors.client && !errors.time;

	const development = developments.find((d) => d.id === developmentId);
	const block = development?.blocks.find((b) => b.id === blockId);
	const unit = block?.units.find((u) => u.id === unitId);
	// Owners list plus the current owner, even if they were deactivated since.
	const ownerOptions =
		initial && !owners.some((o) => o.id === initial.owner.id) ? [...owners, initial.owner] : owners;

	function pickDevelopment(id: string) {
		setDevelopmentId(id);
		setBlockId("");
		setUnitId("");
		// Fill the client from the development when it's still empty.
		const dev = developments.find((d) => d.id === id);
		if (dev?.client && !client.trim()) {
			setClient(dev.client.name);
			setClientId(dev.client.id);
		}
	}

	async function save() {
		setSubmitted(true);
		if (!isValid || saving) return;
		const chosenOwner = canChooseOwner ? owner : currentUser.id;
		const user = ownerOptions.find((u) => u.id === chosenOwner) ?? currentUser;
		const id = isCopy ? `loc-${Date.now()}` : (initial?.id ?? `loc-${Date.now()}`);
		const event: CalendarEvent = {
			id,
			title: `${types.find((t) => t.id === type)?.label ?? "Appointment"} - ${development?.name ?? client.trim()}`,
			type,
			mode,
			completed: isCopy ? false : (initial?.completed ?? false),
			start,
			end,
			project: project.trim(),
			client: { id: clientId || `cli-${Date.now()}`, name: client.trim() },
			ticketNumber: ticket.trim() || "—",
			owner: { id: user.id, name: user.name },
			property: development?.name ?? "—",
			developmentId: development?.id,
			blockId: block?.id,
			unitId: unit?.id,
			location: locationLabel(block, unit),
			notes,
			billable,
			groupActivity,
			tags: customTags,
			hours:
				initial && !isCopy && initial.hours.length > 0
					? initial.hours
					: [
							{
								id: `h-${Date.now()}`,
								start: startTime,
								end: endTime,
								total: formatDuration(durationMin),
								description: project.trim(),
							},
						],
			files: initial?.files ?? [],
			expenses: initial?.expenses ?? [],
		};
		setSaving(true);
		try {
			await onSave(event);
			onOpenChange(false);
		} catch (e) {
			// Keep the form open and show what the server rejected.
			if (e instanceof ApiError) setServerErrors(e.fields);
		} finally {
			setSaving(false);
		}
	}

	const showError = (msg: string) =>
		submitted && msg ? <span className="text-destructive text-xs">{msg}</span> : null;
	const serverError = (field: string) =>
		serverErrors[field] ? <span className="text-destructive text-xs">{serverErrors[field]}</span> : null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="!flex !max-h-[85vh] w-full !max-w-[95vw] flex-col !gap-0 !overflow-hidden !bg-card !p-0 sm:!max-w-2xl lg:!max-w-[720px]">
				{/* Fixed header */}
				<div className="shrink-0 border-b bg-card px-4 py-4 sm:px-6 sm:pt-6 sm:pb-4">
					<DialogTitle className="text-left text-base leading-tight sm:text-lg">
						{initial && !isCopy ? "Edit appointment" : isCopy ? "Copy appointment" : "New appointment"}
					</DialogTitle>
					<DialogDescription className="mt-1.5 text-left text-xs sm:text-sm">
						Fill in the appointment details.
					</DialogDescription>
				</div>

				{/* Scrollable content, grouped in sections */}
				<form
					id="event-form"
					className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
					onSubmit={(e) => {
						e.preventDefault();
						save();
					}}
				>
					<div className="flex flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6">
						{/* Section 1: Client */}
						<section className="flex flex-col gap-3">
							<SectionTitle Icon={BuildingsIcon} title="Client details" />
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div className="flex flex-col gap-1.5 text-left">
									<Label htmlFor="f-project" className="text-left text-xs sm:text-sm">
										Project <span className="text-destructive">*</span>
									</Label>
									<Input
										id="f-project"
										className="h-9 text-left text-sm sm:h-10"
										placeholder="e.g. SUPPORT SERVICE"
										value={project}
										onChange={(e) => setProject(e.target.value)}
									/>
									{showError(errors.project)}
								</div>
								<div className="flex flex-col gap-1.5 text-left">
									<Label htmlFor="f-client" className="text-left text-xs sm:text-sm">
										Client <span className="text-destructive">*</span>
									</Label>
									<Input
										id="f-client"
										className="h-9 text-left text-sm sm:h-10"
										placeholder="Client name"
										value={client}
										onChange={(e) => setClient(e.target.value)}
									/>
									{showError(errors.client)}
								</div>
								<div className="flex flex-col gap-1.5 text-left">
									<Label htmlFor="f-ticket" className="text-left text-xs sm:text-sm">
										Ticket #
									</Label>
									<Input
										id="f-ticket"
										className="h-9 text-left text-sm sm:h-10"
										placeholder="e.g. 209370"
										inputMode="numeric"
										value={ticket}
										onChange={(e) => setTicket(e.target.value)}
									/>
								</div>
								<div className="flex flex-col gap-1.5 text-left">
									<Label htmlFor="f-owner" className="text-left text-xs sm:text-sm">
										Owner
									</Label>
									{canChooseOwner ? (
										<Select value={owner} onValueChange={setOwner}>
											<SelectTrigger id="f-owner" className="h-9 justify-start text-left text-sm sm:h-10">
												<SelectValue placeholder="Select" />
											</SelectTrigger>
											<SelectContent>
												{ownerOptions.map((u) => (
													<SelectItem key={u.id} value={u.id}>
														{u.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									) : (
										<Input id="f-owner" className="h-9 text-sm sm:h-10" value={currentUser.name} disabled />
									)}
									{serverError("owner")}
								</div>
							</div>
						</section>

						<Separator />

						{/* Section: Location */}
						<section className="flex flex-col gap-3">
							<SectionTitle Icon={MapPinIcon} title="Location" />
							<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<div className="flex flex-col gap-1.5 text-left">
									<Label htmlFor="f-dev" className="text-left text-xs sm:text-sm">
										Development
									</Label>
									<Select value={developmentId || NONE} onValueChange={(v) => pickDevelopment(v === NONE ? "" : v)}>
										<SelectTrigger id="f-dev" className="h-9 justify-start text-left text-sm sm:h-10">
											<SelectValue placeholder="Select" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NONE}>No development</SelectItem>
											{developments.map((d) => (
												<SelectItem key={d.id} value={d.id}>
													{d.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{serverError("developmentId")}
								</div>
								<div className="flex flex-col gap-1.5 text-left">
									<Label htmlFor="f-block" className="text-left text-xs sm:text-sm">
										Block
									</Label>
									<Select
										value={blockId || NONE}
										onValueChange={(v) => {
											setBlockId(v === NONE ? "" : v);
											setUnitId("");
										}}
										disabled={!development || development.blocks.length === 0}
									>
										<SelectTrigger id="f-block" className="h-9 justify-start text-left text-sm sm:h-10">
											<SelectValue placeholder="Select" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NONE}>Whole development</SelectItem>
											{development?.blocks.map((b) => (
												<SelectItem key={b.id} value={b.id}>
													{b.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{serverError("blockId")}
								</div>
								<div className="flex flex-col gap-1.5 text-left">
									<Label htmlFor="f-unit" className="text-left text-xs sm:text-sm">
										Unit
									</Label>
									<Select
										value={unitId || NONE}
										onValueChange={(v) => setUnitId(v === NONE ? "" : v)}
										disabled={!block || block.units.length === 0}
									>
										<SelectTrigger id="f-unit" className="h-9 justify-start text-left text-sm sm:h-10">
											<SelectValue placeholder="Select" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NONE}>Common areas</SelectItem>
											{block?.units.map((u) => (
												<SelectItem key={u.id} value={u.id}>
													{u.number} · {u.kind}
													{u.occupant ? ` · ${u.occupant}` : ""}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{serverError("unitId")}
								</div>
							</div>
						</section>

						<Separator />

						{/* Section 2: Schedule */}
						<section className="flex flex-col gap-3">
							<SectionTitle Icon={ClockIcon} title="Schedule" />
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div className="flex flex-col gap-1.5 text-left">
									<Label htmlFor="f-date" className="text-left text-xs sm:text-sm">
										Date
									</Label>
									<Input
										id="f-date"
										type="date"
										className="h-9 text-left text-sm sm:h-10"
										value={date}
										onChange={(e) => setDate(e.target.value)}
									/>
								</div>
								<div className="flex flex-col gap-1.5 text-left">
									<Label className="text-left text-xs sm:text-sm">Time</Label>
									<div className="flex items-center gap-2">
										<Input
											type="time"
											aria-label="Start time"
											className="h-9 flex-1 text-sm sm:h-10"
											value={startTime}
											onChange={(e) => setStartTime(e.target.value)}
										/>
										<span className="shrink-0 text-muted-foreground text-xs">to</span>
										<Input
											type="time"
											aria-label="End time"
											className="h-9 flex-1 text-sm sm:h-10"
											value={endTime}
											onChange={(e) => setEndTime(e.target.value)}
										/>
									</div>
									{showError(errors.time)}
								</div>
								<div className="flex flex-col gap-1.5 text-left">
									<Label htmlFor="f-type" className="text-left text-xs sm:text-sm">
										Appointment type
									</Label>
									<Select value={type} onValueChange={(v) => setType(v as AppointmentType)}>
										<SelectTrigger id="f-type" className="h-9 justify-start text-left text-sm sm:h-10">
											<SelectValue placeholder="Select" />
										</SelectTrigger>
										<SelectContent>
											{types.map((t) => (
												<SelectItem key={t.id} value={t.id}>
													{t.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="flex flex-col gap-1.5 text-left">
									<Label htmlFor="f-mode" className="text-left text-xs sm:text-sm">
										Meeting mode
									</Label>
									<Select value={mode} onValueChange={(v) => setMode(v as MeetingMode)}>
										<SelectTrigger id="f-mode" className="h-9 justify-start text-left text-sm sm:h-10">
											<SelectValue placeholder="Select" />
										</SelectTrigger>
										<SelectContent>
											{MEETING_MODES.map((t) => (
												<SelectItem key={t.id} value={t.id}>
													{t.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
						</section>

						<Separator />

						{/* Section 3: Details */}
						<section className="flex flex-col gap-3">
							<SectionTitle Icon={NoteIcon} title="Details" />
							<div className="flex flex-col gap-1.5 text-left">
								<Label htmlFor="f-notes" className="text-left text-xs sm:text-sm">
									Main notes
								</Label>
								<Textarea
									id="f-notes"
									rows={4}
									className="min-h-[96px] resize-none text-left text-sm"
									placeholder="Describe the visit, issues found and pending items..."
									value={notes}
									onChange={(e) => setNotes(e.target.value)}
								/>
								<span className="text-right text-[11px] text-muted-foreground">
									{notes.length} characters
								</span>
							</div>
						</section>

						{/* Section 4: Settings */}
						<section className="flex flex-col gap-3">
							<SectionTitle Icon={TagIcon} title="Settings" />
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								<label
									htmlFor="f-billable"
									className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/30 has-[[data-state=checked]]:border-brand/30 has-[[data-state=checked]]:bg-brand/5"
								>
									<div className="flex flex-col gap-0.5 text-left">
										<span className="font-medium text-sm">Billable</span>
										<span className="text-muted-foreground text-xs">Log as billable hours</span>
									</div>
									<Switch id="f-billable" checked={billable} onCheckedChange={(v) => setBillable(Boolean(v))} />
								</label>
								<label
									htmlFor="f-group"
									className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/30 has-[[data-state=checked]]:border-brand/30 has-[[data-state=checked]]:bg-brand/5"
								>
									<div className="flex flex-col gap-0.5 text-left">
										<span className="font-medium text-sm">Group activity</span>
										<span className="text-muted-foreground text-xs">Involves more than one technician</span>
									</div>
									<Switch id="f-group" checked={groupActivity} onCheckedChange={(v) => setGroupActivity(Boolean(v))} />
								</label>
							</div>
							{tags.some((t) => !t.builtIn) && (
								<div className="flex flex-col gap-1.5 text-left">
									<span className="text-left font-medium text-xs sm:text-sm">Tags</span>
									<div className="flex flex-wrap gap-1.5">
										{tags
											.filter((t) => !t.builtIn)
											.map((t) => {
												const on = customTags.includes(t.id);
												return (
													<button
														key={t.id}
														type="button"
														aria-pressed={on}
														onClick={() =>
															setCustomTags((prev) =>
																on ? prev.filter((x) => x !== t.id) : [...prev, t.id],
															)
														}
														className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium text-xs transition-colors ${
															on ? "border-brand bg-brand/10 text-brand" : "border-border bg-background text-muted-foreground hover:bg-muted"
														}`}
													>
														<span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
														{t.label}
													</button>
												);
											})}
									</div>
								</div>
							)}
						</section>
					</div>
				</form>

				{/* Fixed footer */}
				<div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/20 px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4">
					<Button variant="secondary" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
						Cancel
					</Button>
					<Button type="submit" form="event-form" className="w-full sm:w-auto" disabled={saving}>
						{saving ? "Saving…" : initial && !isCopy ? "Save changes" : "Create appointment"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function SectionTitle({ Icon, title }: { Icon: typeof ClockIcon; title: string }) {
	return (
		<div className="flex items-center gap-2">
			<div className="flex size-7 items-center justify-center rounded-md bg-brand/10 text-foreground">
				<Icon className="size-4" />
			</div>
			<h3 className="text-left font-semibold text-sm">{title}</h3>
		</div>
	);
}
