import {
	ArrowCounterClockwiseIcon,
	CheckCircleIcon,
	CircleDashedIcon,
	HourglassMediumIcon,
	PlayCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { ServiceReport } from "../../../../../shared/service";
import {
	availableTransitions,
	isClosedCategory,
	type StatusCategory,
	statusOf,
	type Ticket,
	type TicketActivity,
	type TicketSummary,
	type TicketType,
	type Transition,
	type Workflow,
} from "../../../../../shared/tickets";
import type { UserRole } from "../../../../../shared/users";
import type { BookingContext } from "./visit-booking";

/** An appointment booked for the ticket, as the ticket detail returns it. */
export interface LinkedEvent {
	id: string;
	title: string;
	type: string;
	ticketNumber: string;
	start: string;
	end: string;
	ownerId: string;
	completed: boolean;
	property: string;
	location: string;
	notes: string;
	/** The user may open it in the Tasks screen. */
	canOpen: boolean;
	service: ServiceReport | null;
}

type VisitLike = Pick<LinkedEvent, "id" | "start" | "ownerId" | "completed"> & { canOpen?: boolean; service?: { status: string } | null };

/**
 * The visit the signed-in person should start on this ticket: the one they're
 * already on site for, else their soonest open one. With `todayOnly`, a visit
 * not started yet counts only on its day ("Start visit" on the visit day).
 */
export function myVisitToStart<T extends VisitLike>(events: T[], meId: string, { todayOnly = false } = {}): T | undefined {
	const today = new Date().toDateString();
	return events
		.filter((e) => e.ownerId === meId && e.canOpen !== false && !e.completed && e.service?.status !== "completed")
		.filter((e) => !todayOnly || e.service?.status === "in_progress" || new Date(e.start).toDateString() === today)
		.sort((a, b) => Number(b.service?.status === "in_progress") - Number(a.service?.status === "in_progress") || a.start.localeCompare(b.start))[0];
}

/** GET /api/tickets/by-number/:number */
export interface TicketDetail {
	ticket: Ticket;
	activity: TicketActivity[];
	events: LinkedEvent[];
	/** A sub-ticket's parent visits: it is done on them. */
	parentVisits?: LinkedEvent[];
	/** Ids of open sub-tickets that were rescheduled: the ticket can't be resolved while any is pending. */
	rescheduledChildren?: string[];
	/** Other open sub-tickets at the same place (sameVisit: same parent, same visit). */
	nearby?: { id: string; number: number; title: string; typeId: string; statusId: string; parentNumber: number | null; sameVisit: boolean }[];
	parent: TicketSummary | null;
	children: TicketSummary[];
	/** Admin, assignee or owner of a visit: may work on the ticket. */
	canWork: boolean;
	transitions: Transition[];
}

/** Everything the workspace parts need, passed down from the page. */
export interface Workspace {
	detail: TicketDetail;
	ticket: Ticket;
	type?: TicketType;
	workflow?: Workflow;
	me: { id: string; role: UserRole };
	isAdmin: boolean;
	canWork: boolean;
	closed: boolean;
	userName: (id: string | null | undefined) => string;
	assignees: { id: string; name: string; role?: UserRole; jobTitle?: string }[];
	workflowOf: (typeId: string) => Workflow | undefined;
	typeOf: (typeId: string) => TicketType | undefined;
	appointmentLabel: (typeId: string) => string;
	/** Calendar appointment types, inspection and repair first. */
	appointmentTypes: { id: string; label: string }[];
	/** What a step needs to book a visit (the ticket, its visits, sites, people, kinds of visit). */
	booking: BookingContext;
	/** Opens the read-only details modal of a ticket. */
	openDetails: (n: number) => void;
	reload: () => Promise<void>;
}

/** One icon per status category, used on steps, buttons and badges. */
export const CATEGORY_ICON: Record<StatusCategory, typeof CheckCircleIcon> = {
	todo: CircleDashedIcon,
	in_progress: PlayCircleIcon,
	waiting: HourglassMediumIcon,
	done: CheckCircleIcon,
	cancelled: XCircleIcon,
};

/**
 * How a workflow step is presented: closing steps are the main call to
 * action, cancelling is set apart, and steps that go back are secondary.
 */
export function stepKind(wf: Workflow, t: Transition, fromStatusId: string): "close" | "cancel" | "back" | "forward" {
	const to = statusOf(wf, t.to);
	if (to?.category === "done") return "close";
	if (to?.category === "cancelled") return "cancel";
	const order = wf.statuses.map((s) => s.id);
	return order.indexOf(t.to) < order.indexOf(fromStatusId) ? "back" : "forward";
}

export function stepIcon(wf: Workflow, t: Transition, fromStatusId: string) {
	const kind = stepKind(wf, t, fromStatusId);
	if (kind === "back") return ArrowCounterClockwiseIcon;
	const to = statusOf(wf, t.to);
	return to ? CATEGORY_ICON[to.category] : PlayCircleIcon;
}

export function isOpenTicket(t: Pick<TicketSummary, "statusId" | "typeId">, wf: Workflow | undefined): boolean {
	const s = statusOf(wf, t.statusId);
	return s ? !isClosedCategory(s.category) : true;
}

/** Step that closes a ticket from its current status: Done first, then Cancelled. */
export function closingStep(wf: Workflow | undefined, statusId: string, role: UserRole): Transition | undefined {
	if (!wf) return undefined;
	const steps = availableTransitions(wf, statusId, role);
	return (
		steps.find((t) => statusOf(wf, t.to)?.category === "done") ?? steps.find((t) => statusOf(wf, t.to)?.category === "cancelled")
	);
}

/** Step that brings a closed ticket back to an open status (e.g. "Reopen"). */
export function reopenStep(wf: Workflow | undefined, statusId: string, role: UserRole): Transition | undefined {
	if (!wf) return undefined;
	return availableTransitions(wf, statusId, role).find((t) => {
		const to = statusOf(wf, t.to);
		return to ? !isClosedCategory(to.category) : false;
	});
}

/** Card used by every block of the workspace. */
export function Panel({
	title,
	icon,
	aside,
	children,
	className = "",
	bodyClassName = "p-4",
}: {
	title: string;
	icon?: ReactNode;
	aside?: ReactNode;
	children: ReactNode;
	className?: string;
	bodyClassName?: string;
}) {
	return (
		<section className={`rounded-lg border border-border bg-card shadow-sm ${className}`}>
			<header className="flex min-h-11 items-center justify-between gap-2 border-border border-b px-4 py-2">
				<h2 className="flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
					{icon}
					{title}
				</h2>
				{aside}
			</header>
			<div className={bodyClassName}>{children}</div>
		</section>
	);
}
