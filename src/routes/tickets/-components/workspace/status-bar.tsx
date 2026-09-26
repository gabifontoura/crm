import { CheckIcon, LockSimpleIcon, WrenchIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { isClosedCategory, officeWorkflow, pathTo, statusOf, type Transition } from "../../../../../shared/tickets";
import { type Workspace, stepIcon, stepKind } from "./shared";
import { openVisits } from "./visit-booking";

/**
 * Where the ticket is in its workflow and what can happen next. Every status
 * on the path is clickable: the ticket goes there through the workflow's own
 * steps (several at once when needed). The closing step is the main button;
 * cancelling is set apart. Field steps (the customer's sign-off…) aren't
 * here: the technician takes them on the Tasks screen.
 */
export function StatusBar({ ws, onStep }: { ws: Workspace; onStep: (steps: Transition[]) => void }) {
	const { workflow, ticket, detail, canWork, closed, me } = ws;
	if (!workflow) return null;
	const current = statusOf(workflow, ticket.statusId);
	// The happy path: every status except cancelled ones (shown only when current).
	const path = workflow.statuses.filter((s) => s.category !== "cancelled" || s.id === ticket.statusId);
	const currentIndex = path.findIndex((s) => s.id === ticket.statusId);

	// The back office never takes field steps, not even on the way to another status.
	const office = officeWorkflow(workflow);
	const steps = detail.transitions.filter((t) => !t.onTasksScreen);
	const fieldSteps = detail.transitions.filter((t) => t.onTasksScreen);
	const visit = openVisits([...detail.events, ...(detail.parentVisits ?? [])])
		.filter((e) => e.canOpen)
		.sort((a, b) => a.start.localeCompare(b.start))[0];
	const fieldNote = fieldSteps.length > 0 && (
		<p className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
			<WrenchIcon className="size-3.5 shrink-0" />
			{fieldSteps.map((t) => `“${t.label}”`).join(" and ")} {fieldSteps.length === 1 ? "is" : "are"} done by the technician on the Tasks screen, with the customer's signature.
			{visit && (
				<Link to="/technician/$activityId" params={{ activityId: visit.id }} className="text-brand hover:underline">
					Open the visit
				</Link>
			)}
		</p>
	);
	const close = steps.filter((t) => stepKind(workflow, t, ticket.statusId) === "close");
	const forward = steps.filter((t) => stepKind(workflow, t, ticket.statusId) === "forward");
	const back = steps.filter((t) => stepKind(workflow, t, ticket.statusId) === "back");
	const cancel = steps.filter((t) => stepKind(workflow, t, ticket.statusId) === "cancel");

	return (
		<section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
			{/* Workflow path: click a status to move the ticket there */}
			{/* Wraps on narrow screens (a vertical list on phones) instead of scrolling sideways. */}
			<ol className="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-y-2" aria-label={`Workflow ${workflow.name}`}>
				{path.map((s, i) => {
					const done = i < currentIndex;
					const isCurrent = s.id === ticket.statusId;
					// Engineering moves it on by answering, not by clicking a status.
					const answering = Boolean(current?.engineering) && me.role === "engineer";
					const route = canWork && !isCurrent && !answering ? pathTo(office, ticket.statusId, s.id, me.role) : null;
					const reachable = Boolean(route?.length);
					const onSite = canWork && !isCurrent && !reachable && Boolean(pathTo(workflow, ticket.statusId, s.id, me.role)?.length);
					const hint = isCurrent
						? "Current status"
						: reachable
							? `Move here: ${route!.map((t) => t.label).join(" → ")}`
							: onSite
								? "The technician gets it here on the Tasks screen, with the customer's signature"
								: canWork
									? `No step leads here from ${current?.name ?? "the current status"} for your role`
									: undefined;
					return (
						<li key={s.id} className="flex flex-col items-start gap-1 sm:flex-row sm:items-center">
							{i > 0 && <span aria-hidden className={cn("ml-4 h-2 w-px sm:ml-0 sm:h-px sm:w-6", i <= currentIndex ? "bg-brand" : "bg-border")} />}
							<button
								type="button"
								disabled={!reachable}
								onClick={() => route && onStep(route)}
								title={hint}
								aria-current={isCurrent ? "step" : undefined}
								className={cn(
									"inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-xs transition-colors",
									isCurrent
										? "border-transparent font-semibold text-white"
										: done
											? "border-brand/30 text-brand"
											: "border-border text-muted-foreground",
									reachable && "cursor-pointer hover:border-brand hover:bg-brand/5 hover:text-brand",
									!reachable && !isCurrent && "cursor-default",
								)}
								style={isCurrent ? { backgroundColor: s.color } : undefined}
							>
								{done && <CheckIcon className="size-3" weight="bold" />}
								{s.name}
							</button>
						</li>
					);
				})}
			</ol>

			{/* What's next */}
			{closed ? (
				<div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
					<span>
						Closed as <b>{current?.name}</b>
						{ticket.closedAt && ` on ${dayjs(ticket.closedAt).format("MMM D, YYYY")}`}.
					</span>
					{canWork &&
						[...back, ...forward].map((t) => {
							const Icon = stepIcon(workflow, t, ticket.statusId);
							return (
								<Button key={t.id} size="sm" variant="secondary" onClick={() => onStep([t])}>
									<Icon className="size-4" /> {t.label}
								</Button>
							);
						})}
				</div>
			) : !canWork ? (
				<p className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
					<LockSimpleIcon className="size-4 shrink-0" />
					You can follow this ticket. Only the assignee, the technician of one of its visits or an administrator can work on it.
				</p>
			) : current?.engineering && (me.role === "engineer" || steps.length === 0) ? (
				<p className="rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
					{me.role === "engineer"
						? "Waiting on your analysis: answer the question below and it moves on to the step you pick."
						: "Waiting on engineering's answer: it moves on as soon as they reply."}
				</p>
			) : steps.length === 0 ? (
				me.role === "engineer" ? (
					<p className="rounded-md bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
						Engineering's part is the question below: send your analysis back and the technician does the work.
					</p>
				) : fieldNote ? (
					<div className="rounded-md bg-muted/40 px-3 py-2">{fieldNote}</div>
				) : (
					<p className="rounded-md bg-muted/40 px-3 py-2 text-muted-foreground text-sm">No next step for your role from “{current?.name}”.</p>
				)
			) : (
				<div className="flex flex-col gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<span className="mr-1 text-muted-foreground text-xs">Next step:</span>
					{close.map((t) => {
						const Icon = stepIcon(workflow, t, ticket.statusId);
						return (
							<Button key={t.id} size="sm" className="bg-emerald-600 text-white hover:bg-emerald-600/90" onClick={() => onStep([t])}>
								<Icon className="size-4" weight="fill" /> {t.label}
							</Button>
						);
					})}
					{forward.map((t) => {
						const Icon = stepIcon(workflow, t, ticket.statusId);
						return (
							<Button key={t.id} size="sm" variant={close.length ? "secondary" : "default"} onClick={() => onStep([t])}>
								<Icon className="size-4" /> {t.label}
							</Button>
						);
					})}
					{back.map((t) => {
						const Icon = stepIcon(workflow, t, ticket.statusId);
						return (
							<Button key={t.id} size="sm" variant="ghost" onClick={() => onStep([t])}>
								<Icon className="size-4" /> {t.label}
							</Button>
						);
					})}
					{cancel.length > 0 && <span className="mx-1 h-5 w-px bg-border" />}
					{cancel.map((t) => {
						const Icon = stepIcon(workflow, t, ticket.statusId);
						return (
							<Button key={t.id} size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onStep([t])}>
								<Icon className="size-4" /> {t.label}
							</Button>
						);
					})}
					<span className="ml-auto hidden text-muted-foreground text-xs md:inline">or click any status above to go straight there</span>
				</div>
				{fieldNote}
				</div>
			)}
		</section>
	);
}
