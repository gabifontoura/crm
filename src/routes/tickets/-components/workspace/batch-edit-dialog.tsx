import { MapPinIcon, UserIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { apiClient, errorMessage } from "#/lib/api/client";
import { officeWorkflow, pathTo, PRIORITIES, statusOf, type TicketSummary, type Transition, type Workflow } from "../../../../../shared/tickets";
import { type BookingContext, initialVisit, VisitBooking, visitErrors, visitPayload } from "./visit-booking";

/** Anything with the summary fields (full tickets or sub-ticket summaries). */
type BatchTicket = TicketSummary & { property?: string };
import type { UserRole } from "../../../../../shared/users";
import { PriorityBadge, StatusBadge } from "../ticket-details-dialog";

const KEEP = "__keep__";
const NONE = "__none__";

/**
 * Admin batch edit over the tickets picked in the list: priority, assignee
 * and (when they share a workflow) a status change with a comment. Each
 * ticket goes through the normal API, so workflow rules still apply.
 */
export function BatchEditDialog({
	open,
	onOpenChange,
	tickets,
	workflowOf,
	userName,
	assignees,
	role,
	canAssign,
	booking,
	onDone,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	tickets: BatchTicket[];
	workflowOf: (typeId: string) => Workflow | undefined;
	userName: (id: string | null | undefined) => string;
	assignees: { id: string; name: string }[];
	/** Role of the current user: decides which workflow steps apply. */
	role: UserRole;
	/** Only administrators can reassign. */
	canAssign: boolean;
	/** The parent ticket's visits: moving to a status that needs one books it (or uses the one booked) for all. */
	booking?: BookingContext;
	onDone: () => void;
}) {
	const [priority, setPriority] = useState(KEEP);
	const [assignee, setAssignee] = useState(KEEP);
	const [statusId, setStatusId] = useState(KEEP);
	const [comment, setComment] = useState("");
	const [saving, setSaving] = useState(false);
	const [visit, setVisit] = useState(() => (booking ? initialVisit(booking) : null));
	const [submitted, setSubmitted] = useState(false);

	useEffect(() => {
		if (open) {
			setPriority(KEEP);
			setAssignee(KEEP);
			setStatusId(KEEP);
			setComment("");
			setSubmitted(false);
			if (booking) setVisit(initialVisit(booking));
		}
		// Reset only when the dialog opens.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	const workflowIds = useMemo(() => new Set(tickets.map((t) => workflowOf(t.typeId)?.id)), [tickets, workflowOf]);
	const shared = workflowIds.size === 1 && tickets[0] ? workflowOf(tickets[0].typeId) : undefined;
	// Field steps (customer's sign-off…) are the technician's, on the Tasks screen.
	const sharedWorkflow = useMemo(() => (shared ? officeWorkflow(shared) : undefined), [shared]);

	/** Steps each ticket takes to reach the chosen status (null: no way there for your role). */
	const plans = useMemo(() => {
		const map = new Map<string, Transition[] | null>();
		if (statusId === KEEP || !sharedWorkflow) return map;
		for (const t of tickets) map.set(t.id, pathTo(sharedWorkflow, t.statusId, statusId, role));
		return map;
	}, [tickets, statusId, sharedWorkflow, role]);
	const unreachable = tickets.filter((t) => plans.get(t.id) === null);
	const needsComment = [...plans.values()].some((p) => p?.some((s) => s.requireComment));
	// A step landing on a status like "Visit scheduled" needs a visit: one for them all, on the parent.
	const visitStatus = [...plans.values()].flatMap((p) => p ?? []).map((s) => statusOf(shared, s.to)).find((st) => st?.needsVisit);
	const visitProblems = visitStatus && visit ? visitErrors(visit) : {};
	const cannotBook = Boolean(visitStatus && !booking);
	/** How many selected tickets can reach each status (to grey out the rest). */
	const reachCount = useMemo(() => {
		const m = new Map<string, number>();
		if (!sharedWorkflow) return m;
		for (const s of sharedWorkflow.statuses) m.set(s.id, tickets.filter((t) => pathTo(sharedWorkflow, t.statusId, s.id, role) !== null).length);
		return m;
	}, [tickets, sharedWorkflow, role]);

	async function apply() {
		setSubmitted(true);
		if (cannotBook || Object.keys(visitProblems).length) return;
		setSaving(true);
		let updated = 0;
		const problems: string[] = [];
		// Booked with the first step that needs it; the others then use that visit.
		let toBook = visitStatus && visit && !visit.useExisting && booking ? visitPayload(visit, booking) : null;
		const booked = Boolean(toBook);
		for (const t of tickets) {
			const id = encodeURIComponent(t.id);
			try {
				const body: Record<string, unknown> = {};
				if (priority !== KEEP) body.priority = priority;
				if (assignee !== KEEP) body.assigneeId = assignee === NONE ? null : assignee;
				if (Object.keys(body).length) await apiClient.put(`/api/tickets/${id}`, body);
				const steps = plans.get(t.id);
				if (statusId !== KEEP && sharedWorkflow && t.statusId !== statusId) {
					if (!steps) throw new Error("your role has no workflow steps that lead there");
					// One step at a time; the comment goes with each so every move is explained.
					for (const step of steps) {
						const books = toBook && statusOf(shared, step.to)?.needsVisit;
						await apiClient.post(`/api/tickets/${id}/transition`, { transitionId: step.id, comment: comment.trim() || undefined, ...(books ? { visit: toBook } : {}) });
						if (books) toBook = null;
					}
				} else if (comment.trim()) {
					await apiClient.post(`/api/tickets/${id}/comments`, { comment: comment.trim() });
				}
				updated++;
			} catch (e) {
				problems.push(`#${t.number}: ${errorMessage(e)}`);
			}
		}
		setSaving(false);
		if (updated) toast.success(`${updated} ticket${updated === 1 ? "" : "s"} updated`, { description: booked && !toBook ? "The visit is on the calendar." : undefined });
		if (problems.length) toast.error(`${problems.length} not updated. ${problems.slice(0, 3).join(" · ")}`);
		onDone();
		if (!problems.length) onOpenChange(false);
	}

	const nothing = priority === KEEP && assignee === KEEP && statusId === KEEP && !comment.trim();
	const missingComment = needsComment && !comment.trim();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="!flex !max-h-[90vh] !max-w-[95vw] flex-col !gap-0 !overflow-hidden !p-0 lg:!max-w-4xl">
				<div className="border-border border-b px-5 py-4">
					<DialogTitle>Edit {tickets.length} sub-ticket{tickets.length === 1 ? "" : "s"}</DialogTitle>
					<DialogDescription>Changes are applied to every selected sub-ticket. Leave a field on “Keep” to leave it as is.</DialogDescription>
				</div>
				<div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[300px_1fr] md:overflow-hidden">
					<ul className="flex flex-col gap-2 border-border border-b bg-muted/20 p-4 md:overflow-y-auto md:border-r md:border-b-0">
						{tickets.map((t) => (
							<li key={t.id} className="flex flex-col gap-1 rounded-lg border border-border bg-card p-2.5 text-xs shadow-sm">
								<div className="flex items-center justify-between gap-2">
									<span className="font-mono text-muted-foreground">#{t.number}</span>
									<PriorityBadge priority={t.priority} />
								</div>
								<span className="line-clamp-2 font-medium text-sm">{t.title}</span>
								<span className="flex items-center gap-1 text-muted-foreground">
									<UserIcon className="size-3" /> {userName(t.assigneeId)}
								</span>
								{t.property && (
									<span className="flex items-center gap-1 truncate text-muted-foreground">
										<MapPinIcon className="size-3" /> {t.property}
									</span>
								)}
								<StatusBadge workflow={workflowOf(t.typeId)} statusId={t.statusId} />
								{plans.has(t.id) &&
									(plans.get(t.id) === null ? (
										<span className="text-destructive">No way to that status from here</span>
									) : (plans.get(t.id)?.length ?? 0) > 0 ? (
										<span className="text-brand">→ {plans.get(t.id)!.map((s) => s.label).join(" → ")}</span>
									) : (
										<span className="text-muted-foreground">Already there</span>
									))}
							</li>
						))}
					</ul>
					<div className="flex flex-col gap-4 p-5 md:overflow-y-auto">
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="batch-priority">Priority</Label>
								<Select value={priority} onValueChange={setPriority}>
									<SelectTrigger id="batch-priority" className="h-9 text-sm">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={KEEP}>Keep</SelectItem>
										{PRIORITIES.map((p) => (
											<SelectItem key={p.id} value={p.id}>
												{p.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							{canAssign && (
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="batch-assignee">Assignee</Label>
								<Select value={assignee} onValueChange={setAssignee}>
									<SelectTrigger id="batch-assignee" className="h-9 text-sm">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={KEEP}>Keep</SelectItem>
										<SelectItem value={NONE}>Unassigned</SelectItem>
										{assignees.map((u) => (
											<SelectItem key={u.id} value={u.id}>
												{u.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							)}
							<div className="flex flex-col gap-1.5 sm:col-span-2">
								<Label htmlFor="batch-status">Move to status</Label>
								{sharedWorkflow ? (
									<Select value={statusId} onValueChange={setStatusId}>
										<SelectTrigger id="batch-status" className="h-9 text-sm">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={KEEP}>Keep</SelectItem>
											{sharedWorkflow.statuses.map((s) => {
												const n = reachCount.get(s.id) ?? 0;
												return (
													<SelectItem key={s.id} value={s.id} disabled={n === 0}>
														{s.name}
														{n < tickets.length && (
															<span className="text-muted-foreground text-xs"> · {n === 0 ? "not reachable" : `${n} of ${tickets.length}`}</span>
														)}
													</SelectItem>
												);
											})}
										</SelectContent>
									</Select>
								) : (
									<p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
										The selected tickets use different workflows, so their status can't be changed together.
									</p>
								)}
								{sharedWorkflow && statusId !== KEEP && (
									<span className="text-muted-foreground text-xs">
										Each ticket takes the “{sharedWorkflow.name}” steps shown on the left, in order.
										{unreachable.length > 0 && ` #${unreachable.map((t) => t.number).join(", #")} can't get there and will be left as is.`} A step that needs
										fields filled in stops there; finish that ticket on its own.
									</span>
								)}
							</div>
							{visitStatus && visit && booking && (
								<div className="flex flex-col gap-1.5 sm:col-span-2">
									<VisitBooking ctx={booking} value={visit} onChange={setVisit} errors={submitted ? visitProblems : {}} statusName={visitStatus.name} />
									<p className="text-muted-foreground text-xs">One visit for all of them: the sub-tickets are its actions.</p>
								</div>
							)}
							{cannotBook && (
								<p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm sm:col-span-2">
									“{visitStatus?.name}” needs a visit on the calendar. Book it on the ticket first.
								</p>
							)}
							<div className="flex flex-col gap-1.5 sm:col-span-2">
								<Label htmlFor="batch-comment">{needsComment ? "Comment (required by these steps)" : "Comment (optional)"}</Label>
								<Textarea
									id="batch-comment"
									rows={3}
									className="resize-none text-sm"
									placeholder={needsComment ? "Why the change, e.g. why these are being reopened" : undefined}
									value={comment}
									onChange={(e) => setComment(e.target.value)}
								/>
							</div>
						</div>
					</div>
				</div>
				<div className="flex justify-end gap-2 border-border border-t px-5 py-3">
					<Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
						Cancel
					</Button>
					<Button type="button" onClick={apply} disabled={saving || nothing || missingComment || cannotBook}>
						{saving ? "Saving…" : "Apply changes"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
