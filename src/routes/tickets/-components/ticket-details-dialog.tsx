import {
	ArrowElbowDownRightIcon,
	CalendarBlankIcon,
	ClockIcon,
	BriefcaseIcon,
	MapPinIcon,
	TreeStructureIcon,
	UserIcon,
	WarningIcon,
	PlayIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { PersonName } from "#/components/person/person-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Skeleton } from "#/components/ui/skeleton";
import { ApiError, apiClient, errorMessage } from "#/lib/api/client";
import { useSession } from "#/lib/auth/session";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import { cn } from "#/lib/utils";
import type { ServiceReport } from "../../../../shared/service";
import {
	isClosedCategory,
	PRIORITIES,
	statusOf,
	type Ticket,
	type TicketActivity,
	type TicketSummary,
	visibleFields,
	type Workflow,
} from "../../../../shared/tickets";
import { formatFieldValue } from "./custom-field-input";
import { useTicketConfig } from "./use-ticket-config";
import { myVisitToStart } from "./workspace/shared";

dayjs.extend(relativeTime);

/* ------------------------------ Shared badges ----------------------------- */

export function StatusBadge({ workflow, statusId }: { workflow?: Workflow; statusId: string }) {
	const s = statusOf(workflow, statusId);
	return (
		<span
			className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-xs"
			style={{ backgroundColor: `${s?.color ?? "#64748B"}1A`, color: s?.color ?? "#64748B" }}
		>
			<span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: s?.color ?? "#64748B" }} />
			{s?.name ?? statusId}
		</span>
	);
}

export function PriorityBadge({ priority }: { priority: Ticket["priority"] }) {
	const p = PRIORITIES.find((x) => x.id === priority);
	return (
		<span className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-xs" style={{ color: p?.color }}>
			<span className="size-1.5 rounded-full" style={{ backgroundColor: p?.color }} />
			{p?.label}
		</span>
	);
}

/** Due soon / overdue label for open tickets with an SLA. */
export function DueLabel({ ticket, closed }: { ticket: Pick<Ticket, "dueAt">; closed: boolean }) {
	if (!ticket.dueAt || closed) return null;
	const overdue = new Date(ticket.dueAt).getTime() < Date.now();
	return (
		<span className={cn("inline-flex items-center gap-1 text-xs", overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
			{overdue ? <WarningIcon className="size-3.5" /> : <ClockIcon className="size-3.5" />}
			{overdue ? `Overdue ${dayjs(ticket.dueAt).fromNow(true)}` : `Due ${dayjs(ticket.dueAt).fromNow()}`}
		</span>
	);
}

/* ------------------------------ Details modal ----------------------------- */

interface DetailsData {
	ticket: Ticket;
	activity: TicketActivity[];
	events: { id: string; title: string; type: string; start: string; end: string; ownerId: string; completed: boolean; canOpen?: boolean; service: ServiceReport | null }[];
	parent: TicketSummary | null;
	children: TicketSummary[];
	canWork: boolean;
}

/**
 * Read-only ticket details, loaded by ticket number, usable from any screen.
 * Parent and sub-tickets open in the same modal; "Work on ticket" (shown only
 * to people who can work on it) opens the ticket workspace page.
 */
export function TicketDetailsDialog({
	ticketNumber,
	onOpenChange,
	onChanged,
}: {
	ticketNumber: number | null;
	onOpenChange: (o: boolean) => void;
	/** Called when the user leaves to handle the ticket, so lists can refresh later. */
	onChanged?: () => void;
}) {
	const { user } = useCurrentUser();
	const { users } = useSession();
	const config = useTicketConfig(user?.id);
	const navigate = useNavigate();
	// Parent/sub-ticket links navigate inside the modal.
	const [current, setCurrent] = useState<number | null>(ticketNumber);
	const [data, setData] = useState<DetailsData | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => setCurrent(ticketNumber), [ticketNumber]);

	const load = useCallback(async () => {
		if (current === null || !user) return;
		setData(null);
		setError(null);
		try {
			setData(await apiClient.get<DetailsData>(`/api/tickets/by-number/${current}`));
		} catch (e) {
			setError(e instanceof ApiError && e.status === 403 ? "You don't have access to this ticket." : e instanceof ApiError && e.status === 404 ? `Ticket #${current} doesn't exist.` : errorMessage(e));
		}
	}, [current, user]);

	useEffect(() => {
		load();
	}, [load]);

	const userName = (id: string | null | undefined) => (id ? (users.find((u) => u.id === id)?.name ?? "Former member") : "Unassigned");
	const ticket = data?.ticket;
	const type = ticket ? config.typeById.get(ticket.typeId) : undefined;
	const workflow = ticket ? config.workflowOf(ticket.typeId) : undefined;
	const status = ticket ? statusOf(workflow, ticket.statusId) : undefined;
	const closed = status ? isClosedCategory(status.category) : false;
	// On the visit day (or once on site), the technician starts it from here.
	const visit = ticket && data && user && !closed ? myVisitToStart(data.events, user.id, { todayOnly: true }) : undefined;

	return (
		<Dialog open={ticketNumber !== null} onOpenChange={onOpenChange}>
			<DialogContent className="!flex !max-h-[90vh] w-full !max-w-[95vw] flex-col !gap-0 !overflow-hidden !bg-card !p-0 lg:!max-w-4xl">
				{!ticket ? (
					<div className="flex flex-col gap-3 p-6">
						<DialogTitle className="text-base">{current !== null ? `Ticket #${current}` : "Ticket"}</DialogTitle>
						<DialogDescription className="sr-only">Ticket details</DialogDescription>
						{error ? (
							<p className="text-muted-foreground text-sm">{error}</p>
						) : (
							<>
								<Skeleton className="h-6 w-2/3" />
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-5/6" />
							</>
						)}
					</div>
				) : (
					<>
						<div className="shrink-0 border-border border-b px-6 pt-5 pb-4">
							<div className="mr-8 flex flex-wrap items-center gap-2 text-xs">
								<span className="font-mono text-muted-foreground">#{ticket.number}</span>
								{type && (
									<span className="inline-flex items-center rounded-full border px-2 py-0.5 font-medium" style={{ borderColor: type.color, color: type.color }}>
										{type.name}
									</span>
								)}
								<StatusBadge workflow={workflow} statusId={ticket.statusId} />
								<PriorityBadge priority={ticket.priority} />
								<DueLabel ticket={ticket} closed={closed} />
							</div>
							<DialogTitle className="mt-2 text-left text-lg leading-snug">{ticket.title}</DialogTitle>
							<DialogDescription className="mt-1 text-left">
								Opened by <PersonName person={{ kind: "member", id: ticket.reporterId }}>{userName(ticket.reporterId)}</PersonName> {dayjs(ticket.createdAt).fromNow()}
								{ticket.closedAt ? ` · closed ${dayjs(ticket.closedAt).fromNow()}` : ""}
							</DialogDescription>
							{data.parent && (
								<button
									type="button"
									onClick={() => setCurrent(data.parent!.number)}
									className="mt-2 inline-flex items-center gap-1 text-brand text-xs hover:underline"
								>
									<TreeStructureIcon className="size-3.5" /> Sub-ticket of #{data.parent.number} · {data.parent.title}
								</button>
							)}
						</div>

						<div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_280px] lg:overflow-hidden">
							<div className="flex min-w-0 flex-col gap-5 px-6 py-5 lg:overflow-y-auto">
								{ticket.origin && (
									<p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
										Created from the task action <b>{ticket.origin.actionLabel}</b> left for later on a visit.
									</p>
								)}
								{ticket.description ? (
									<p className="whitespace-pre-wrap text-sm leading-relaxed">{ticket.description}</p>
								) : (
									<p className="text-muted-foreground text-sm">No description.</p>
								)}

								{type && type.fields.length > 0 && (
									<Block title={`${type.name} details`}>
										<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
											{visibleFields(type.fields, ticket.fields).map((f) => (
												<div key={f.id} className={cn("flex flex-col gap-0.5", f.kind === "textarea" && "sm:col-span-2")}>
													<span className="text-muted-foreground text-xs">{f.label}</span>
													<span className="whitespace-pre-wrap text-sm">{formatFieldValue(f, ticket.fields[f.id])}</span>
												</div>
											))}
										</div>
									</Block>
								)}

								{data.children.length > 0 && (
									<Block title={`Sub-tickets (${data.children.length})`}>
										<ul className="flex flex-col gap-1.5">
											{data.children.map((c) => (
												<li key={c.id}>
													<button
														type="button"
														onClick={() => setCurrent(c.number)}
														className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm hover:bg-muted/40"
													>
														<ArrowElbowDownRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
														<span className="font-mono text-muted-foreground text-xs">#{c.number}</span>
														<span className="min-w-0 flex-1 truncate">{c.title}</span>
														<StatusBadge workflow={config.workflowOf(c.typeId)} statusId={c.statusId} />
													</button>
												</li>
											))}
										</ul>
									</Block>
								)}

								<Block title="Activity">
									<ol className="relative flex flex-col gap-3 border-border border-l pl-4">
										{data.activity.map((a) => (
											<li key={a.id} className="relative">
												<span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-brand" />
												<div className="text-sm">
													<span className="font-medium">{userName(a.userId)}</span> <ActivityText a={a} workflow={workflow} userName={userName} />
													<span className="ml-1.5 text-muted-foreground text-xs" title={dayjs(a.at).format("MMM D, YYYY h:mm A")}>
														{dayjs(a.at).fromNow()}
													</span>
												</div>
												{a.comment && a.kind !== "attachment" && (
													<p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">{a.comment}</p>
												)}
											</li>
										))}
									</ol>
								</Block>
							</div>

							<aside className="flex flex-col gap-4 border-border border-t bg-muted/20 px-6 py-5 lg:overflow-y-auto lg:border-t-0 lg:border-l">
								<SideItem label="Assignee" icon={<UserIcon className="size-3.5" />}>
									<span className="text-sm">{ticket.assigneeId ? <PersonName person={{ kind: "member", id: ticket.assigneeId }}>{userName(ticket.assigneeId)}</PersonName> : userName(null)}</span>
								</SideItem>
								<SideItem label="Requester">
									<div className="text-sm">
										<div className="font-medium">
											{ticket.requester.name ? (
												<PersonName person={{ kind: "customer", name: ticket.requester.name, email: ticket.requester.email }}>{ticket.requester.name}</PersonName>
											) : (
												"—"
											)}
										</div>
										{ticket.requester.email && <div className="text-muted-foreground text-xs">{ticket.requester.email}</div>}
										{ticket.requester.phone && <div className="text-muted-foreground text-xs">{ticket.requester.phone}</div>}
										{ticket.clientName && <div className="mt-1 text-muted-foreground text-xs">Client: {ticket.clientName}</div>}
									</div>
								</SideItem>
								<SideItem label="Location" icon={<MapPinIcon className="size-3.5" />}>
									<div className="text-sm">
										{ticket.property || "—"}
										{ticket.location && <div className="text-muted-foreground text-xs">{ticket.location}</div>}
									</div>
								</SideItem>
								<SideItem label="Dates" icon={<ClockIcon className="size-3.5" />}>
									<div className="flex flex-col gap-0.5 text-xs">
										<span>Opened {dayjs(ticket.createdAt).format("MMM D, h:mm A")}</span>
										{ticket.dueAt && <span>Due {dayjs(ticket.dueAt).format("MMM D, h:mm A")}</span>}
										<span className="text-muted-foreground">Updated {dayjs(ticket.updatedAt).fromNow()}</span>
									</div>
								</SideItem>
								<SideItem label="Visits" icon={<CalendarBlankIcon className="size-3.5" />}>
									{data.events.length === 0 ? (
										<span className="text-muted-foreground text-xs">No visits booked yet.</span>
									) : (
										<ul className="flex flex-col gap-1.5">
											{data.events.map((e) => {
												const done = e.completed || e.service?.status === "completed";
												return (
													<li key={e.id} className="rounded-md border border-border bg-card px-2 py-1.5 text-xs">
														<div className="font-medium">{e.title}</div>
														<div className="text-muted-foreground">
															{dayjs(e.start).format("MMM D, h:mm A")} · {userName(e.ownerId)} ·{" "}
															{done ? "completed" : e.service?.status === "in_progress" ? "in progress" : "not started"}
														</div>
													</li>
												);
											})}
										</ul>
									)}
								</SideItem>
							</aside>
						</div>
					</>
				)}

				<div className="flex shrink-0 justify-end gap-2 border-border border-t px-6 py-3">
					<Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
						Close
					</Button>
					{visit && (
						<Button
							type="button"
							size="sm"
							onClick={() => {
								onOpenChange(false);
								onChanged?.();
								navigate({ to: "/technician/$activityId", params: { activityId: visit.id } });
							}}
						>
							<PlayIcon weight="fill" className="size-4" /> {visit.service?.status === "in_progress" ? "Resume visit" : "Start visit"}
						</Button>
					)}
					{ticket && data?.canWork && (
						<Button
							type="button"
							size="sm"
							variant={visit ? "secondary" : "default"}
							onClick={() => {
								onOpenChange(false);
								onChanged?.();
								navigate({ to: "/tickets/$ticketNumber", params: { ticketNumber: String(ticket.number) } });
							}}
						>
							<BriefcaseIcon className="size-4" /> Work on ticket
						</Button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

function Block({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-2">
			<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">{title}</h3>
			{children}
		</section>
	);
}

function SideItem({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="flex items-center gap-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
				{icon}
				{label}
			</span>
			{children}
		</div>
	);
}

function ActivityText({ a, workflow, userName }: { a: TicketActivity; workflow?: Workflow; userName: (id: string | null | undefined) => string }) {
	const name = (id?: string) => statusOf(workflow, id ?? "")?.name ?? id;
	switch (a.kind) {
		case "created":
			return <span>opened the ticket in <b>{name(a.toStatusId)}</b></span>;
		case "status":
			return (
				<span>
					{a.transitionLabel ? <>used <b>{a.transitionLabel}</b>: </> : "moved it: "}
					{name(a.fromStatusId)} → <b>{name(a.toStatusId)}</b>
				</span>
			);
		case "assigned":
			return <span>{a.assigneeId ? <>assigned it to <b>{userName(a.assigneeId)}</b></> : "unassigned it"}</span>;
		case "fields":
		case "edited":
			// Each change on its own line (older entries have none).
			return a.comment ? <span className="whitespace-pre-line">{a.comment.startsWith("Added sub-ticket") ? a.comment.replace(/^Added/, "added") : `changed: ${a.comment.split("\n").join(" · ")}`}</span> : <span>updated the details</span>;
		case "comment":
			return <span>commented</span>;
		case "attachment":
			return <span>{a.comment?.startsWith("Removed") ? "removed a file" : "attached a file"}</span>;
		case "email":
			return <span>emailed <b>{a.email?.to.map((r) => r.name || r.email).join(", ") || "no one"}</b>: {a.email?.subject}</span>;
		default:
			return <span>edited the ticket</span>;
	}
}
