import { ArrowRightIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { ApiError, apiClient, errorMessage } from "#/lib/api/client";
import {
	type FieldValue,
	fieldErrors,
	normalizeFieldValues,
	requiredForTransition,
	statusOf,
	type Ticket,
	type TicketSummary,
	type TicketType,
	type Transition,
	type Workflow,
} from "../../../../../shared/tickets";
import type { UserRole } from "../../../../../shared/users";
import { CustomFieldInput } from "../custom-field-input";
import { closingStep } from "./shared";
import { type BookingContext, initialVisit, VisitBooking, visitErrors, visitPayload } from "./visit-booking";
import { type EngineeringDraft, EngineeringAsk } from "./engineering-panel";

/**
 * Confirms a move along the workflow: one step, or the chain of steps that
 * leads to the status picked on the path (e.g. Open → Start work → Mark as
 * done). Asks once for the comment and every field those steps need, and when
 * the move closes a ticket that still has open sub-tickets, offers to close
 * them in the same go.
 */
export function StepDialog({
	ticket,
	type,
	workflow,
	steps,
	openChildren,
	workflowOf,
	role,
	booking,
	rescheduled = [],
	onClose,
	onDone,
}: {
	ticket: Pick<Ticket, "id" | "number" | "fields"> & Partial<Pick<Ticket, "attachments" | "engineering">>;
	type?: TicketType;
	workflow: Workflow;
	/** Steps to take, in order (one for a plain step). */
	steps: Transition[];
	/** Open sub-tickets; offered to be closed together when the move closes the ticket. */
	openChildren: TicketSummary[];
	workflowOf: (typeId: string) => Workflow | undefined;
	role: UserRole;
	/** Lets a step book the visit its status needs (e.g. "Visit scheduled"). */
	booking?: BookingContext;
	/** Open sub-tickets that were rescheduled: the ticket can't be resolved while they're pending. */
	rescheduled?: string[];
	onClose: () => void;
	onDone: () => void;
}) {
	const last = steps[steps.length - 1];
	const target = statusOf(workflow, last.to);
	const closes = target?.category === "done" || target?.category === "cancelled";
	const needed = useMemo(() => (type ? [...new Set(steps.flatMap((s) => requiredForTransition(s, type)))] : []), [steps, type]);
	const defs = type?.fields.filter((f) => needed.includes(f.id)) ?? [];
	const needsComment = steps.some((s) => s.requireComment);
	const [values, setValues] = useState<Record<string, FieldValue>>(ticket.fields);
	const [comment, setComment] = useState("");
	// A step into "With engineering" sends the question (unless one is already open).
	const engineeringStep = ticket.engineering?.status === "open" ? undefined : steps.find((s) => statusOf(workflow, s.to)?.engineering);
	const [question, setQuestion] = useState<EngineeringDraft>({ question: "", photos: [] });
	const questionErrors = engineeringStep
		? { ...(question.question.trim() ? {} : { question: "Write the question for engineering." }), ...(question.photos.length ? {} : { photos: "Add at least one photo." }) }
		: {};
	const [closeOthers, setCloseOthers] = useState(true);
	const [submitted, setSubmitted] = useState(false);
	const [saving, setSaving] = useState(false);
	const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
	// The first step landing on a status that needs a visit books it.
	const visitStep = steps.find((s) => statusOf(workflow, s.to)?.needsVisit);
	const visitStatus = visitStep ? statusOf(workflow, visitStep.to) : undefined;
	const [visit, setVisit] = useState(() => (booking ? initialVisit(booking) : null));
	const visitProblems = visitStep && visit ? visitErrors(visit) : {};
	const serverVisitErrors = Object.fromEntries(Object.entries(serverErrors).filter(([k]) => k.startsWith("visit.")).map(([k, v]) => [k.slice(6), v]));
	const cannotBook = Boolean(visitStep && !booking);

	// Resolved means every sub-ticket is closed: the open ones are closed in the same go.
	// Rescheduled ones still have work to do, and ones you can't close stay open: both block it.
	const resolves = target?.category === "done";
	const childSteps = useMemo(
		() => openChildren.filter((c) => !rescheduled.includes(c.id)).map((c) => ({ child: c, step: closingStep(workflowOf(c.typeId), c.statusId, role) })),
		[openChildren, workflowOf, role, rescheduled],
	);
	const closable = childSteps.filter((x) => x.step);
	const blocking = resolves ? [...openChildren.filter((c) => rescheduled.includes(c.id)), ...childSteps.filter((x) => !x.step).map((x) => x.child)] : [];
	const closeChildren = resolves || closeOthers;

	const errors = { ...(type ? fieldErrors(type.fields, normalizeFieldValues(type.fields, values), needed) : {}), ...serverErrors };
	const childNeedsComment = closes && closeChildren && closable.some((x) => x.step!.requireComment);
	const commentMissing = (needsComment || childNeedsComment) && !comment.trim();
	const title = steps.length === 1 ? last.label : `Move to ${target?.name}`;

	async function confirm() {
		setSubmitted(true);
		if (Object.keys(errors).length || commentMissing || saving || cannotBook || blocking.length || Object.keys(visitProblems).length || Object.keys(questionErrors).length) return;
		setSaving(true);
		let done = 0;
		try {
			let closedKids = 0;
			if (closes && closeChildren) {
				for (const { child, step: s } of closable) {
					await apiClient.post(`/api/tickets/${encodeURIComponent(child.id)}/transition`, {
						transitionId: s!.id,
						comment: comment.trim() || `Closed with parent ticket #${ticket.number}.`,
					});
					closedKids++;
				}
			}
			const fields = type ? normalizeFieldValues(type.fields, values) : undefined;
			for (const s of steps) {
				const withVisit = s === visitStep && visit && !visit.useExisting ? { visit: visitPayload(visit, booking!) } : {};
				const withQuestion = s === engineeringStep ? { engineering: { question: question.question.trim(), photos: question.photos.map((p, i) => ({ id: `q${i}`, name: p.name, dataUrl: p.dataUrl, caption: p.name })) } } : {};
				await apiClient.post(`/api/tickets/${encodeURIComponent(ticket.id)}/transition`, { transitionId: s.id, comment: comment.trim() || undefined, fields, ...withVisit, ...withQuestion });
				done++;
			}
			toast.success(`#${ticket.number} is now ${target?.name}${closedKids ? `, with ${closedKids} sub-ticket${closedKids === 1 ? "" : "s"} closed` : ""}`, {
				description: visitStep && visit && !visit.useExisting ? "The visit is on the calendar." : undefined,
			});
			onDone();
		} catch (e) {
			if (e instanceof ApiError) setServerErrors(e.fields);
			toast.error(errorMessage(e));
			// Part of the chain went through: show where the ticket is now.
			if (done > 0) onDone();
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className={`!max-w-[95vw] max-h-[92vh] overflow-y-auto ${visitStep && booking ? "sm:!max-w-2xl" : "sm:!max-w-lg"}`}>
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>
					Moves ticket #{ticket.number} to <b>{target?.name}</b>
					{defs.length > 0 ? ". Fill in what the steps need." : "."}
				</DialogDescription>
				{steps.length > 1 && (
					<ol className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted/40 px-3 py-2 text-xs" aria-label="Steps taken">
						{steps.map((s, i) => (
							<li key={s.id} className="flex items-center gap-1.5">
								{i > 0 && <ArrowRightIcon className="size-3 text-muted-foreground" />}
								<span className="rounded-full border border-border bg-card px-2 py-0.5">{s.label}</span>
							</li>
						))}
					</ol>
				)}
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						confirm();
					}}
				>
					{defs.length > 0 && (
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							{defs.map((f) => (
								<CustomFieldInput
									key={f.id}
									def={f}
									value={values[f.id]}
									onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))}
									required
									error={submitted ? errors[f.id] : undefined}
									idPrefix="step"
								/>
							))}
						</div>
					)}

					{engineeringStep && (
						<EngineeringAsk value={question} onChange={setQuestion} attachments={ticket.attachments ?? []} errors={submitted ? { ...questionErrors, ...serverErrors } : serverErrors} />
					)}
					{visitStep && visitStatus && visit && booking && (
						<VisitBooking ctx={booking} value={visit} onChange={setVisit} errors={{ ...(submitted ? visitProblems : {}), ...serverVisitErrors }} statusName={visitStatus.name} />
					)}
					{cannotBook && (
						<p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
							“{visitStatus?.name}” needs a visit on the calendar. Open ticket #{ticket.number} to book it with this step.
						</p>
					)}
					{serverErrors.visit && <p className="text-destructive text-xs">{serverErrors.visit}</p>}

					{blocking.length > 0 && (
						<div className="flex flex-col gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
							<p className="font-medium text-destructive">
								Can't be {target?.name.toLowerCase()} yet: {blocking.length === 1 ? "a sub-ticket is" : `${blocking.length} sub-tickets are`} still pending.
							</p>
							<ul className="flex flex-col gap-0.5 text-xs">
								{blocking.map((c) => (
									<li key={c.id}>
										<b>#{c.number}</b> {c.title}
										<span className="text-muted-foreground">{rescheduled.includes(c.id) ? " · rescheduled" : " · you can't close it"}</span>
									</li>
								))}
							</ul>
							<p className="text-muted-foreground text-xs">Finish or cancel {blocking.length === 1 ? "it" : "them"} first.</p>
						</div>
					)}

					{resolves && closable.length > 0 && blocking.length === 0 && (
						<div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
							{closable.length} open sub-ticket{closable.length === 1 ? " is" : "s are"} closed too: {closable.map((x) => `#${x.child.number}`).join(", ")}.
						</div>
					)}
					{closes && !resolves && childSteps.length > 0 && (
						<div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
							<p>
								{childSteps.length} sub-ticket{childSteps.length === 1 ? " is" : "s are"} still open.
							</p>
							{closable.length > 0 ? (
								<label className="flex items-center gap-2">
									<Checkbox checked={closeOthers} onCheckedChange={(v) => setCloseOthers(v === true)} />
									Also close {closable.length === childSteps.length ? "them" : `${closable.length} of them`}
								</label>
							) : (
								<p className="text-xs">You can't close them from here; they stay open.</p>
							)}
						</div>
					)}

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="step-comment">
							Comment {needsComment || childNeedsComment ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}
						</Label>
						<Textarea id="step-comment" rows={3} className="resize-none" value={comment} onChange={(e) => setComment(e.target.value)} autoFocus={defs.length === 0} />
						{submitted && commentMissing && <span className="text-destructive text-xs">This step needs a comment.</span>}
					</div>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="secondary" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" variant={target?.category === "cancelled" ? "destructive" : "default"} disabled={saving || cannotBook || blocking.length > 0}>
							{saving ? "Saving…" : steps.length === 1 ? last.label : `Move to ${target?.name}`}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
