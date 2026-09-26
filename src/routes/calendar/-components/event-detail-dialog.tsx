import {
	BuildingIcon,
	CheckCircleIcon,
	ClockIcon,
	CurrencyCircleDollarIcon,
	PaperclipIcon,
	TagIcon,
	TicketIcon,
	TrashIcon,
	UserIcon,
	WrenchIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useRef, useState } from "react";
import { CardTabs } from "#/components/card-tabs";
import { TicketDetailsDialog } from "../../tickets/-components/ticket-details-dialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { PersonName } from "#/components/person/person-dialog";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Separator } from "#/components/ui/separator";
import { APP_LOCALE, formatCurrency, formatTime } from "#/lib/format";
import { MEETING_MODES, tagsForEvent } from "./constants";
import type { CalendarEvent, TagDef } from "./types";
import type { TypeColor } from "./use-calendar-settings";

interface EventDetailDialogProps {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	event: CalendarEvent | null;
	color: TypeColor | null;
	textColor: string;
	/** Tag definitions managed in the calendar settings. */
	tags: TagDef[];
	onOpenClient: (e: CalendarEvent) => void;
	/** Saves changes made inside the dialog (files, expenses, status). */
	onUpdate?: (e: CalendarEvent) => void;
	onEdit?: (e: CalendarEvent) => void;
	onDelete?: (id: string) => void;
}

function formatDate(d: Date): string {
	return d.toLocaleDateString(APP_LOCALE, {
		weekday: "short",
		day: "2-digit",
		month: "long",
		year: "numeric",
	});
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EventDetailDialog(props: EventDetailDialogProps) {
	if (!props.event) return null;
	// Keyed by id so the inner forms reset when another event is opened.
	return <EventDetailContent key={props.event.id} {...props} event={props.event} />;
}

function EventDetailContent({
	open,
	onOpenChange,
	event,
	color,
	textColor,
	tags,
	onOpenClient,
	onUpdate,
	onEdit,
	onDelete,
}: EventDetailDialogProps & { event: CalendarEvent }) {
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [ticketOpen, setTicketOpen] = useState<number | null>(null);
	const mode = MEETING_MODES.find((t) => t.id === event.mode);
	const activeTags = tagsForEvent(event, tags);
	const totalExpenses = event.expenses.reduce((s, d) => s + d.amount, 0);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="!flex !max-h-[85vh] w-full !max-w-[95vw] flex-col !gap-0 !overflow-hidden !border-0 !bg-card !p-0 sm:!max-w-3xl lg:!max-w-[640px]">
				{/* Header with the type color – fixed and responsive */}
				<div className="shrink-0 border-b bg-card px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
					<div
						className="mr-6 flex flex-col gap-3 rounded-lg border-l-4 p-3 text-left sm:flex-row sm:items-start sm:p-4"
						style={{
							backgroundColor: color?.background ?? "#f4f4f5",
							borderColor: color?.border ?? "#d4d4d8",
							color: textColor,
						}}
					>
						<div className="min-w-0 flex-1 text-left">
							<DialogTitle className="break-words text-left text-sm leading-snug sm:text-base">
								{event.title}
							</DialogTitle>
							<DialogDescription
								style={{ color: textColor }}
								className="mt-1 break-words text-left text-xs opacity-80 sm:text-sm"
							>
								{event.project}
							</DialogDescription>
						</div>
						<div className="flex shrink-0 flex-col items-start gap-1.5 self-start">
							<Badge variant="brand" className="bg-white/70 px-2.5 py-1 text-xs">
								Ticket #{event.ticketNumber}
							</Badge>
							<Badge variant={event.completed ? "action" : "outline"} className="w-fit text-xs">
								{event.completed ? "Completed" : "Open"}
							</Badge>
						</div>
					</div>
				</div>

				{/* Scrollable content */}
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
					<div className="flex flex-col gap-5 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6">
						<div className="grid grid-cols-2 gap-x-4 gap-y-3 text-left">
							<InfoRow
								Icon={ClockIcon}
								label="When"
								value={`${formatDate(event.start)} · ${formatTime(event.start)} - ${formatTime(event.end)}`}
							/>
							<InfoRow Icon={UserIcon} label="Owner" value={<PersonName person={{ kind: "member", id: event.owner.id }}>{event.owner.name}</PersonName>} />
							<InfoRow
								Icon={BuildingIcon}
								label="Development"
								value={event.location ? `${event.property} · ${event.location}` : event.property}
							/>
							<InfoRow Icon={TagIcon} label="Meeting mode" value={mode?.label ?? "-"} />
							<div className="col-span-2">
								<InfoRow
									Icon={UserIcon}
									label="Client"
									value={
										<button
											type="button"
											onClick={() => onOpenClient(event)}
											className="break-all text-left font-semibold underline-offset-2 hover:underline"
										>
											{event.client.name}
										</button>
									}
								/>
							</div>
						</div>

						{activeTags.length > 0 && (
							<div className="flex flex-wrap gap-1.5">
								{activeTags.map((t) => (
									<Badge key={t.id} variant="brand" className="gap-1.5 px-2.5 py-1 text-xs">
										<span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
										{t.label}
									</Badge>
								))}
							</div>
						)}

						<div
							className="rounded-lg border border-l-4 bg-muted/30 p-3 text-left sm:p-4"
							style={{ borderLeftColor: color?.border ?? "#d4d4d8" }}
						>
							<h4 className="mb-1.5 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wide">
								Notes
							</h4>
							<p className="whitespace-pre-wrap break-words text-left text-sm leading-relaxed sm:text-[15px]">
								{event.notes || <span className="text-muted-foreground">No notes recorded.</span>}
							</p>
						</div>

						{/* The quick tasks done together on this visit */}
						{(event.actions?.length ?? 0) > 0 && (
							<div className="rounded-lg border p-3 text-left sm:p-4">
								<h4 className="mb-2 flex items-center justify-between font-semibold text-muted-foreground text-xs uppercase tracking-wide">
									Sub-tickets on this visit
									<span className="font-normal normal-case tracking-normal">
										{event.actions!.filter((a) => a.done).length} of {event.actions!.length} done
									</span>
								</h4>
								<ul className="flex flex-col divide-y divide-border">
									{event.actions!.map((a) => (
										<li key={a.number}>
											<Link to="/tickets/$ticketNumber" params={{ ticketNumber: String(a.number) }} className="flex items-center gap-2 py-1.5 text-sm hover:text-brand">
												{a.done ? <CheckCircleIcon weight="fill" className="size-4 shrink-0 text-emerald-600" /> : <span className="size-4 shrink-0 rounded-full border-2 border-muted-foreground/40" />}
												<span className="font-mono text-muted-foreground text-xs">#{a.number}</span>
												<span className={a.done ? "text-muted-foreground line-through" : ""}>{a.title}</span>
											</Link>
										</li>
									))}
								</ul>
							</div>
						)}

						<Separator />

						<CardTabs
							className="flex h-auto min-h-0 flex-col"
							tabs={[
								{
									label: "Files",
									content: <FilesTab event={event} onUpdate={onUpdate} />,
								},
								{
									label: "New expense",
									content: <NewExpenseTab event={event} onUpdate={onUpdate} />,
								},
								{
									label: event.expenses.length > 0 ? `Expenses (${event.expenses.length})` : "Expenses",
									content: (
										<div className="space-y-3 text-left">
											{event.expenses.length === 0 ? (
												<div className="rounded-lg border border-dashed p-6 text-center">
													<p className="text-muted-foreground text-sm">No expenses added.</p>
												</div>
											) : (
												<>
													<div className="flex flex-col gap-2">
														{event.expenses.map((d) => (
															<div
																key={d.id}
																className="flex flex-col gap-1 rounded-lg border bg-muted/30 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2.5"
															>
																<span className="break-words pr-2 text-left text-sm">{d.description}</span>
																<span className="shrink-0 text-left font-semibold text-sm sm:text-right">
																	{formatCurrency(d.amount)}
																</span>
															</div>
														))}
													</div>
													{totalExpenses > 0 && (
														<div className="flex items-center justify-between rounded-lg bg-brand/10 px-3 py-2.5 sm:px-4">
															<span className="font-medium text-sm">Total</span>
															<span className="font-bold text-sm">{formatCurrency(totalExpenses)}</span>
														</div>
													)}
												</>
											)}
										</div>
									),
								},
							]}
						/>
					</div>
				</div>

				{/* Fixed footer - column on mobile, row on desktop */}
				<div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/20 px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4">
					{onDelete && (
						<Button variant="destructive" onClick={() => setConfirmDelete(true)} className="w-full sm:mr-auto sm:w-auto">
							Delete
						</Button>
					)}
					{onUpdate && (
						<Button
							variant="secondary"
							onClick={() => onUpdate({ ...event, completed: !event.completed })}
							className="w-full sm:w-auto"
						>
							<CheckCircleIcon className="size-4" />
							{event.completed ? "Reopen" : "Mark as completed"}
						</Button>
					)}
					{/^\d+$/.test(event.ticketNumber) && (
						// Opens the read-only ticket details; "Work on ticket" there is for whoever may work on it.
						<Button variant="secondary" className="w-full sm:w-auto" onClick={() => setTicketOpen(Number(event.ticketNumber))}>
							<TicketIcon className="size-4" />
							Ticket #{event.ticketNumber}
						</Button>
					)}
					{/* On-site work (check-in, actions, photos, signature) happens on the task screen. */}
					<Button asChild variant="secondary" className="w-full sm:w-auto">
						<Link to="/technician/$activityId" params={{ activityId: event.id }}>
							<WrenchIcon className="size-4" />
							{event.completed ? "View task" : "Open task"}
						</Link>
					</Button>
					{onEdit && (
						<Button onClick={() => onEdit(event)} className="w-full sm:w-auto">
							Edit
						</Button>
					)}
				</div>
			</DialogContent>
			<TicketDetailsDialog ticketNumber={ticketOpen} onOpenChange={(o) => !o && setTicketOpen(null)} />
			<AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
				<AlertDialogContent className="bg-popover shadow-[0_0_50px_rgba(0,0,0,0.4)] sm:!max-w-sm">
					<AlertDialogHeader>
						<AlertDialogMedia className="bg-destructive/10 text-destructive">
							<TrashIcon className="size-5" />
						</AlertDialogMedia>
						<AlertDialogTitle>Confirm deletion</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete{" "}
							<span className="font-semibold text-foreground">“{event.title}”</span>? This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel variant="secondary">Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								onDelete?.(event.id);
								setConfirmDelete(false);
							}}
						>
							<TrashIcon className="size-4" />
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Dialog>
	);
}

interface TabProps {
	event: CalendarEvent;
	onUpdate?: (e: CalendarEvent) => void;
}

function FilesTab({ event, onUpdate }: TabProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	function attach(list: FileList | null) {
		if (!onUpdate || !list || list.length === 0) return;
		const added = Array.from(list).map((f, i) => ({
			id: `f-${Date.now()}-${i}`,
			name: f.name,
			size: formatFileSize(f.size),
		}));
		onUpdate({ ...event, files: [...event.files, ...added] });
	}

	return (
		<div className="space-y-3 text-left">
			{event.files.length === 0 ? (
				<div
					className="rounded-lg border border-dashed p-6 text-center"
					onDragOver={(e) => e.preventDefault()}
					onDrop={(e) => {
						e.preventDefault();
						attach(e.dataTransfer.files);
					}}
				>
					<PaperclipIcon className="mx-auto mb-2 size-6 text-muted-foreground/50" />
					<p className="text-muted-foreground text-sm">No files attached.</p>
					<p className="mt-1 text-muted-foreground text-xs">Drag files here or pick them to attach.</p>
				</div>
			) : (
				<div className="flex flex-col gap-2">
					{event.files.map((a) => (
						<div
							key={a.id}
							className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
						>
							<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background">
								<PaperclipIcon className="size-4 text-muted-foreground" />
							</div>
							<span className="min-w-0 flex-1 truncate text-left text-sm">{a.name}</span>
							<span className="shrink-0 text-muted-foreground text-xs">{a.size}</span>
						</div>
					))}
				</div>
			)}
			{onUpdate && (
				<>
					<input
						ref={inputRef}
						type="file"
						multiple
						className="hidden"
						onChange={(e) => {
							attach(e.target.files);
							e.target.value = "";
						}}
					/>
					<Button variant="secondary" size="sm" className="w-full sm:w-auto" onClick={() => inputRef.current?.click()}>
						Attach file
					</Button>
				</>
			)}
		</div>
	);
}

function NewExpenseTab({ event, onUpdate }: TabProps) {
	const [description, setDescription] = useState("");
	const [amount, setAmount] = useState("");
	const value = Number(amount.replace(",", "."));
	const valid = description.trim().length > 0 && Number.isFinite(value) && value > 0;

	function save() {
		if (!onUpdate || !valid) return;
		onUpdate({
			...event,
			expenses: [...event.expenses, { id: `d-${Date.now()}`, description: description.trim(), amount: value }],
		});
		setDescription("");
		setAmount("");
	}

	return (
		<div className="space-y-3 text-left">
			<div className="rounded-lg border border-dashed bg-muted/20 p-4 text-center sm:p-6">
				<CurrencyCircleDollarIcon className="mx-auto mb-2 size-8 text-muted-foreground/50" />
				<p className="font-medium text-sm">Log a new expense</p>
				<p className="mx-auto mt-1 max-w-[320px] text-muted-foreground text-xs leading-relaxed">
					Use this form to log travel, meal or material expenses for this appointment.
				</p>
			</div>
			{onUpdate && (
				<div className="flex flex-col gap-2 sm:flex-row">
					<Input
						className="h-9 flex-1"
						placeholder="Description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
					<Input
						className="h-9 sm:w-32"
						placeholder="Amount"
						inputMode="decimal"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
					/>
					<Button variant="secondary" size="sm" className="h-9 gap-2" disabled={!valid} onClick={save}>
						<CurrencyCircleDollarIcon className="size-4" />
						Log expense
					</Button>
				</div>
			)}
		</div>
	);
}

function InfoRow({
	Icon,
	label,
	value,
}: {
	Icon: typeof ClockIcon;
	label: string;
	value: ReactNode;
}) {
	return (
		<div className="min-w-0 text-left text-sm">
			<p className="flex items-center gap-1 text-left font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
				<Icon className="size-3 shrink-0" />
				{label}
			</p>
			<div className="mt-0.5 break-words text-left font-medium text-[13px] leading-snug">{value}</div>
		</div>
	);
}
