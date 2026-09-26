import { ArrowBendDownRightIcon, ArrowCounterClockwiseIcon, CheckCircleIcon, PencilSimpleIcon, PlusIcon, TreeStructureIcon, XCircleIcon, XIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { apiClient, errorMessage } from "#/lib/api/client";
import { cn } from "#/lib/utils";
import { statusOf, type Ticket, type TicketSummary, type Transition, type Workflow } from "../../../../../shared/tickets";
import { initialsOf } from "../../../../../shared/users";
import { PriorityBadge, StatusBadge } from "../ticket-details-dialog";
import { BatchEditDialog } from "./batch-edit-dialog";
import { Panel, type Workspace, closingStep, isOpenTicket, reopenStep } from "./shared";
import { StepDialog } from "./step-dialog";
import { useCurrentUser } from "#/lib/auth/use-current-user";

/**
 * The single place to manage sub-tickets (follow-ups split from this ticket,
 * e.g. task actions a technician left for later): add, close one, close all
 * open, or select several and edit them together.
 */
export function SubTicketsPanel({ ws }: { ws: Workspace }) {
	const { detail, ticket, canWork, isAdmin, me, closed, workflowOf, userName, assignees, openDetails, reload } = ws;
	const { can } = useCurrentUser();
	const children = detail.children;
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [batch, setBatch] = useState<TicketSummary[] | null>(null);
	const [title, setTitle] = useState("");
	const [adding, setAdding] = useState(false);
	const [step, setStep] = useState<{ child: Ticket; step: Transition; workflow: Workflow } | null>(null);
	const [closingAll, setClosingAll] = useState(false);

	const open = useMemo(() => children.filter((c) => isOpenTicket(c, workflowOf(c.typeId))), [children, workflowOf]);
	const doneCount = children.length - open.length;
	const canTouch = (c: TicketSummary) => canWork && (isAdmin || c.assigneeId === me.id || ticket.assigneeId === me.id);

	async function add() {
		const t = title.trim();
		if (!t || adding) return;
		setAdding(true);
		try {
			const created = await apiClient.post<Ticket>("/api/tickets", { parentId: ticket.id, title: t, priority: ticket.priority });
			setTitle("");
			toast.success(`Sub-ticket #${created.number} added`);
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setAdding(false);
		}
	}

	/** Opens the closing (or reopening) step of one sub-ticket, loaded for its field values. */
	async function runStep(c: TicketSummary, reopen = false) {
		const wf = workflowOf(c.typeId);
		const s = reopen ? reopenStep(wf, c.statusId, me.role) : closingStep(wf, c.statusId, me.role);
		if (!wf || !s) {
			toast.error(`#${c.number} has no ${reopen ? "reopen" : "closing"} step from its current status for your role.`);
			return;
		}
		try {
			const d = await apiClient.get<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(c.id)}`);
			setStep({ child: d.ticket, step: s, workflow: wf });
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	async function closeAll() {
		const list = open.filter(canTouch);
		const plan = list.map((c) => ({ c, s: closingStep(workflowOf(c.typeId), c.statusId, me.role) }));
		setClosingAll(true);
		let ok = 0;
		const skipped: number[] = [];
		for (const { c, s } of plan) {
			if (!s) {
				skipped.push(c.number);
				continue;
			}
			try {
				await apiClient.post(`/api/tickets/${encodeURIComponent(c.id)}/transition`, {
					transitionId: s.id,
					comment: `Closed from parent ticket #${ticket.number}.`,
				});
				ok++;
			} catch {
				skipped.push(c.number);
			}
		}
		setClosingAll(false);
		if (ok) toast.success(`${ok} sub-ticket${ok === 1 ? "" : "s"} closed`);
		if (skipped.length) toast.info(`Not closed (needs more information or no closing step): #${skipped.join(", #")}. Open them to finish.`);
		await reload();
	}

	const toggle = (id: string, on: boolean) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (on) next.add(id);
			else next.delete(id);
			return next;
		});

	return (
		<Panel
			title={`Sub-tickets${children.length ? ` · ${doneCount}/${children.length} closed` : ""}`}
			icon={<TreeStructureIcon className="size-4" />}
			bodyClassName=""
			aside={
				canWork && open.length > 1 ? (
					<Button size="sm" variant="secondary" onClick={closeAll} disabled={closingAll}>
						<CheckCircleIcon className="size-4" />
						{closingAll ? "Closing…" : `Close all ${open.length} open`}
					</Button>
				) : null
			}
		>
			{children.length > 0 && (
				<div className="h-1 w-full bg-muted" aria-hidden>
					<div className="h-1 bg-emerald-500 transition-all" style={{ width: `${(doneCount / children.length) * 100}%` }} />
				</div>
			)}

			{selected.size > 0 && (
				<div className="flex items-center justify-between gap-2 border-border border-b bg-brand/5 px-4 py-2 text-sm">
					<span>{selected.size} selected</span>
					<div className="flex gap-1.5">
						<Button size="sm" onClick={() => setBatch(children.filter((c) => selected.has(c.id)))}>
							<PencilSimpleIcon className="size-4" /> Edit selected
						</Button>
						<Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} aria-label="Clear selection">
							<XIcon className="size-4" />
						</Button>
					</div>
				</div>
			)}

			{children.length === 0 ? (
				<p className="px-4 py-5 text-muted-foreground text-sm">
					No sub-tickets. Split a follow-up here, or leave a task action for later on the Tasks screen.
				</p>
			) : (
				<ul className="divide-y divide-border">
					{children.map((c) => {
						const wf = workflowOf(c.typeId);
						const isOpen = isOpenTicket(c, wf);
						const quick = isOpen && canTouch(c) ? closingStep(wf, c.statusId, me.role) : undefined;
						const reopen = !isOpen && canTouch(c) ? reopenStep(wf, c.statusId, me.role) : undefined;
						return (
							<li key={c.id} className={cn("flex items-center gap-3 px-4 py-2.5", !isOpen && "bg-muted/20")}>
								{canWork && (
									<Checkbox aria-label={`Select #${c.number}`} checked={selected.has(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} />
								)}
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
										<button type="button" className="font-mono text-muted-foreground text-xs hover:text-brand hover:underline" onClick={() => openDetails(c.number)}>
											#{c.number}
										</button>
										<button
											type="button"
											className={cn("truncate text-left font-medium text-sm hover:underline", !isOpen && "text-muted-foreground line-through")}
											onClick={() => openDetails(c.number)}
										>
											{c.title}
										</button>
									</div>
									<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
										{c.origin ? (
											<Link to="/technician/$activityId" params={{ activityId: c.origin.eventId }} className="inline-flex items-center gap-1 hover:text-brand">
												<ArrowBendDownRightIcon className="size-3" /> From task action “{c.origin.actionLabel}”
											</Link>
										) : (
											<span>Added {dayjs(c.createdAt).format("MMM D")}</span>
										)}
										<PriorityBadge priority={c.priority} />
									</div>
								</div>
								<span
									className="hidden size-7 shrink-0 items-center justify-center rounded-full bg-brand/10 font-semibold text-[10px] text-brand sm:flex"
									title={userName(c.assigneeId)}
								>
									{c.assigneeId ? initialsOf(userName(c.assigneeId)) : "–"}
								</span>
								{detail.rescheduledChildren?.includes(c.id) && (
									<span className="hidden shrink-0 rounded-full bg-sky-100 px-2 py-0.5 font-medium text-[11px] text-sky-800 sm:inline" title="Rescheduled: the ticket can't be resolved until it's done">
										Rescheduled
									</span>
								)}
								<StatusBadge workflow={wf} statusId={c.statusId} />
								{quick ? (
									// Finishing is green; when the only way out is cancelling, it looks like it.
									statusOf(wf, quick.to)?.category === "done" ? (
										<Button size="sm" variant="ghost" className="shrink-0 text-emerald-700 hover:text-emerald-700" onClick={() => runStep(c)} title={quick.label}>
											<CheckCircleIcon className="size-4" /> <span className="hidden md:inline">{quick.label}</span>
										</Button>
									) : (
										<Button size="sm" variant="ghost" className="shrink-0 text-muted-foreground" onClick={() => runStep(c)} title={quick.label}>
											<XCircleIcon className="size-4" /> <span className="hidden md:inline">{quick.label}</span>
										</Button>
									)
								) : reopen ? (
									<Button size="sm" variant="ghost" className="shrink-0 text-muted-foreground" onClick={() => runStep(c, true)} title={reopen.label}>
										<ArrowCounterClockwiseIcon className="size-4" /> <span className="hidden md:inline">{reopen.label}</span>
									</Button>
								) : (
									<span className="w-8 shrink-0" />
								)}
							</li>
						);
					})}
				</ul>
			)}

			{canWork && !closed && can("tickets.subtickets") && (
				<form
					className="flex items-center gap-2 border-border border-t px-4 py-2.5"
					onSubmit={(e) => {
						e.preventDefault();
						add();
					}}
				>
					<PlusIcon className="size-4 shrink-0 text-muted-foreground" />
					<Input
						aria-label="New sub-ticket title"
						className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
						placeholder="Add a sub-ticket and press Enter"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
					/>
					{title.trim() && (
						<Button type="submit" size="sm" disabled={adding}>
							{adding ? "Adding…" : "Add"}
						</Button>
					)}
				</form>
			)}

			{batch && (
				<BatchEditDialog
					open
					onOpenChange={(o) => !o && setBatch(null)}
					tickets={batch}
					workflowOf={workflowOf}
					userName={userName}
					assignees={assignees}
					role={me.role}
					canAssign={isAdmin}
					booking={ws.booking}
					onDone={() => {
						setBatch(null);
						setSelected(new Set());
						reload();
					}}
				/>
			)}

			{step && (
				<StepDialog
					ticket={step.child}
					type={ws.typeOf(step.child.typeId)}
					workflow={step.workflow}
					steps={[step.step]}
					openChildren={[]}
					workflowOf={workflowOf}
					role={me.role}
					booking={ws.booking}
					onClose={() => setStep(null)}
					onDone={() => {
						setStep(null);
						reload();
					}}
				/>
			)}
		</Panel>
	);
}
