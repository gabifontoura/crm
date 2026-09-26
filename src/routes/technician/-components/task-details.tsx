import { CalendarPlusIcon, ClockIcon, EnvelopeIcon, EyeIcon, ListChecksIcon, MapPinIcon, PauseIcon, PhoneIcon, PlayIcon, SignatureIcon, SignInIcon, TicketIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { PersonName } from "#/components/person/person-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { formatDuration, formatTime } from "#/lib/format";
import { cn } from "#/lib/utils";
import { isClockRunning, type ServicePhoto, type ServiceReport, sessionsOf, toggleClock, totalPhotos } from "../../../../shared/service";
import { TicketDetailsDialog } from "../../tickets/-components/ticket-details-dialog";
import { ActionsAccordion, type DeferInput } from "./actions-accordion";
import { Closing } from "./closing";
import { RescheduleDialog } from "./reschedule";
import { hasTicket, SERVICE_STATUS_LABELS, type TaskJob, taskKind } from "./task-utils";

interface TaskDetailsProps {
	job: TaskJob;
	report: ServiceReport;
	update: (fn: (r: ServiceReport) => ServiceReport) => void;
	typeLabel: string;
	minutes: number;
	saveState: "saved" | "saving" | "error";
	onReload: () => void;
	/** Leaves an action for later as a sub-ticket; resolves with its number. */
	onDefer: (actionId: string, input: DeferInput) => Promise<number>;
	/** Adds an action as a sub-ticket of the linked ticket; resolves with its number. */
	onAddAction: (label: string, description: string) => Promise<number>;
	/** Sends an action's question to engineering, or takes it back. */
	onEngineering: (actionId: string, input: { question: string; photos: ServicePhoto[] } | { withdraw: true }) => Promise<void>;
	/** Following someone else's task (engineering): everything is shown, nothing changes. */
	readOnly?: boolean;
	/** "Customer absent": the access may move the visit (Settings > Menu by access). */
	canReschedule?: boolean;
}

export function TaskDetails({ job, report, update, typeLabel, minutes, saveState, onReload, onDefer, onAddAction, onEngineering, readOnly = false, canReschedule = true }: TaskDetailsProps) {
	const e = job.event;
	const completed = report.status === "completed";
	const checkedIn = Boolean(report.checkInAt);
	const editable = !readOnly && checkedIn && !completed;
	const [rescheduling, setRescheduling] = useState(false);
	const [openTicket, setOpenTicket] = useState<number | null>(null);
	const ticket = job.ticket?.ticket;
	const kind = taskKind(e.type);
	const place = [e.property !== "—" ? e.property : "", e.location].filter(Boolean).join(" - ");
	const answered = report.checklist.filter((c) => c.result !== null || Boolean(c.deferredTicket)).length;
	const lastReschedule = report.reschedules[report.reschedules.length - 1];
	const running = isClockRunning(report);
	const sessions = sessionsOf(report);
	const pausedAt = !running && !completed ? sessions[sessions.length - 1]?.end : null;

	return (
		<Card className="overflow-hidden">
			<CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0 flex-1">
					<CardTitle className="whitespace-normal break-words">
						{typeLabel}
						{place && ` - ${place}`}
					</CardTitle>
					<p className="mt-1 font-medium text-xs text-muted-foreground uppercase">
						{hasTicket(e.ticketNumber) ? `Ticket #${e.ticketNumber}` : "No ticket"} | {SERVICE_STATUS_LABELS[report.status]} |{" "}
						{kind === "inspection" ? "Inspection" : kind === "service" ? "Service" : typeLabel} | Technician: {e.owner.name}
					</p>
					<p className="mt-2 text-[15px]">{e.title}</p>
					<div className="mt-2 flex flex-col gap-1 text-muted-foreground text-[13px] sm:flex-row sm:flex-wrap sm:gap-x-4">
						<span className="flex items-center gap-1">
							<ClockIcon className="h-3.5 w-3.5" />
							{dayjs(e.start).format("ddd, MMM D")} · {formatTime(new Date(e.start))} – {formatTime(new Date(e.end))}
						</span>
						{place && (
							<span className="flex items-center gap-1">
								<MapPinIcon className="h-3.5 w-3.5" /> {place}
							</span>
						)}
						<span>Client: {e.client.name}</span>
						{ticket?.requester.name && (
							<span>
								Contact: <PersonName person={{ kind: "customer", name: ticket.requester.name, email: ticket.requester.email }}>{ticket.requester.name}</PersonName>
							</span>
						)}
						{ticket?.requester.phone && (
							<a className="flex items-center gap-1 text-[var(--destaque)] hover:underline" href={`tel:${ticket.requester.phone}`}>
								<PhoneIcon className="h-3.5 w-3.5" /> {ticket.requester.phone}
							</a>
						)}
						{ticket?.requester.email && (
							<a className="flex items-center gap-1 text-[var(--destaque)] hover:underline" href={`mailto:${ticket.requester.email}`}>
								<EnvelopeIcon className="h-3.5 w-3.5" /> {ticket.requester.email}
							</a>
						)}
					</div>
					{e.notes && <p className="mt-2 whitespace-pre-wrap rounded border bg-muted/40 p-2 text-[13px]">{e.notes}</p>}
					{lastReschedule && (
						<p className="mt-2 text-[13px] text-muted-foreground">
							Rescheduled {report.reschedules.length}× · last from {dayjs(lastReschedule.fromStart).format("MMM D, h:mm A")} by {lastReschedule.byName}: {lastReschedule.reason}
						</p>
					)}
				</div>
				<div className="flex shrink-0 flex-wrap gap-2">
					{hasTicket(e.ticketNumber) && (
						<Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setOpenTicket(Number(e.ticketNumber))} data-testid="btn_open_ticket">
							<TicketIcon className="h-4 w-4" /> Ticket #{e.ticketNumber}
						</Button>
					)}
					{!completed && !readOnly && canReschedule && (
						<Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setRescheduling(true)} data-testid="btn_reschedule_task">
							<CalendarPlusIcon className="h-4 w-4" /> Customer absent
						</Button>
					)}
				</div>
			</CardHeader>

			<CardContent className="p-4">
				{readOnly && (
					<p className="mb-3 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[15px] text-violet-900">
						<EyeIcon className="h-4 w-4 shrink-0" /> Following {e.owner.name}'s task: you see everything as it happens; only {e.owner.name.split(" ")[0]} fills it in.
					</p>
				)}
				{/* CHECK-IN */}
				<div
					className={cn(
						"mb-4 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
						!checkedIn ? "border-border bg-muted/40" : running || completed ? "border-[var(--success)]/30 bg-[var(--success)]/10" : "border-amber-300 bg-amber-50",
					)}
				>
					{checkedIn ? (
						<>
							<div className="flex min-w-0 flex-col gap-0.5 text-[15px]">
								<span>
									{completed ? (
										<>
											Checked in at <b>{formatTime(new Date(report.checkInAt!))}</b>
											{report.checkOutAt && (
												<>
													{" "}
													· out at <b>{formatTime(new Date(report.checkOutAt))}</b>
												</>
											)}
										</>
									) : running ? (
										<>
											On site since <b>{formatTime(new Date(sessions[sessions.length - 1].start))}</b> · the clock is running
										</>
									) : (
										<>
											<b>Clock paused</b> at {pausedAt ? formatTime(new Date(pausedAt)) : "—"} · keep filling in the report and finish it later
										</>
									)}
								</span>
								{sessions.length > 1 && (
									<span className="text-muted-foreground text-[13px]">
										{sessions.map((x) => `${formatTime(new Date(x.start))}–${x.end ? formatTime(new Date(x.end)) : "now"}`).join(" · ")}
									</span>
								)}
							</div>
							<div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
								<span className="rounded-full bg-white px-2.5 py-1 font-mono text-[15px]">{formatDuration(minutes)} on site</span>
								{!completed &&
									!readOnly &&
									(running ? (
										<Button
											variant="secondary"
											size="sm"
											className="gap-1.5 bg-white"
											title="Stop counting time: leave the site or fill in the report later"
											onClick={() => {
												update((r) => toggleClock(r));
												toast("Clock paused", { description: "Time stops here. Finish the report whenever you're ready, or resume if you go back." });
											}}
											data-testid="btn_pause_clock"
										>
											<PauseIcon className="h-4 w-4" weight="fill" /> Pause clock
										</Button>
									) : (
										<Button
											size="sm"
											className="gap-1.5"
											onClick={() => {
												update((r) => toggleClock(r));
												toast.success("Back on site", { description: "The clock is running again." });
											}}
											data-testid="btn_resume_clock"
										>
											<PlayIcon className="h-4 w-4" weight="fill" /> Back on site: resume
										</Button>
									))}
							</div>
						</>
					) : (
						<>
							<span className="text-muted-foreground text-[15px]">{readOnly ? `${e.owner.name.split(" ")[0]} hasn't checked in yet.` : "Check in when you arrive to start working on this task."}</span>
							{!readOnly && (
							<Button
								size="lg"
								className="gap-2"
								onClick={() => {
									update((r) => toggleClock(r));
									toast.success("Checked in", { description: "The task is now in progress." });
								}}
								data-testid="btn_check_in"
							>
								<SignInIcon className="h-4 w-4" /> I'm on site: check in
							</Button>
							)}
						</>
					)}
				</div>

				<Tabs defaultValue="actions" className="flex flex-col">
					<TabsList>
						<TabsTrigger value="actions">
							<span className="flex items-center gap-2">
								<ListChecksIcon className="h-4 w-4 shrink-0" />
								Actions to do
								<span className="rounded-full bg-muted px-1.5 text-xs">
									{answered}/{report.checklist.length}
								</span>
							</span>
						</TabsTrigger>
						<TabsTrigger value="closing">
							<span className="flex items-center gap-2">
								<SignatureIcon className="h-4 w-4 shrink-0" />
								Validation
							</span>
						</TabsTrigger>
					</TabsList>
					<TabsContent value="actions" className="rounded-b-md border-border border-x border-b bg-card p-4">
						<div className="p-2">
							<ActionsAccordion
								items={report.checklist}
								editable={editable}
								reportPhotos={totalPhotos(report)}
								onUpdate={(fn) => update((r) => ({ ...r, checklist: fn(r.checklist) }))}
								defer={ticket ? { ticketNumber: ticket.number, priority: ticket.priority, onDefer: completed || readOnly ? undefined : onDefer, onAdd: completed || readOnly ? undefined : onAddAction, onEngineering: completed || readOnly ? undefined : onEngineering } : null}
								onOpenTicket={setOpenTicket}
								engineering={job.engineering}
							/>
						</div>
					</TabsContent>
					<TabsContent value="closing" className="rounded-b-md border-border border-x border-b bg-card p-4">
						<Closing job={job} report={report} update={update} editable={editable} minutes={minutes} saveState={saveState} onCompleted={onReload} />
					</TabsContent>
				</Tabs>
			</CardContent>

			<TicketDetailsDialog ticketNumber={openTicket} onOpenChange={(o) => !o && setOpenTicket(null)} onChanged={onReload} />

			<RescheduleDialog
				task={rescheduling ? e : null}
				onClose={() => setRescheduling(false)}
				onDone={() => {
					setRescheduling(false);
					onReload();
				}}
			/>
		</Card>
	);
}
