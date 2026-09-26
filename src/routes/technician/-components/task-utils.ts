import type { CSSProperties } from "react";
import type { CalendarEvent } from "../../../../shared/calendar/types";
import type { ServiceReport, ServiceStatus } from "../../../../shared/service";
import type { Ticket, TicketType, Transition, Workflow } from "../../../../shared/tickets";

/** A calendar appointment as the API sends it (dates as ISO strings). */
export type WireEvent = Omit<CalendarEvent, "start" | "end"> & { start: string; end: string };

/** GET /api/calendar/events/:id */
export interface TaskJob {
	event: Omit<WireEvent, "service"> & { service: ServiceReport };
	ticket: {
		ticket: Ticket;
		type: TicketType;
		workflow: Workflow;
		canWork: boolean;
		transitions: Transition[];
		/** Every status reachable from here and the steps there (field steps like the customer's sign-off included). */
		paths?: { statusId: string; steps: Transition[] }[];
	} | null;
	/** False when following someone else's task (engineering): read only. */
	canManage?: boolean;
	/** Questions sent to engineering from this task's actions, by sub-ticket number. */
	engineering?: Record<number, EngineeringAnswer>;
}

export type EngineeringAnswer = NonNullable<Ticket["engineering"]> & { answeredByName?: string };

export type TaskKind = "inspection" | "service" | "other";
export type TaskPeriod = "today" | "tomorrow" | "all";

export const PERIOD_LABELS: Record<TaskPeriod, string> = {
	today: "Today",
	tomorrow: "Tomorrow",
	all: "All",
};

/** Inspections and repairs; any other appointment type is "other". */
export function taskKind(type: string): TaskKind {
	if (type === "initial_inspection") return "inspection";
	if (type === "maintenance") return "service";
	return "other";
}

export function serviceStatusOf(e: Pick<WireEvent, "service" | "completed">): ServiceStatus {
	if (e.completed) return "completed";
	return e.service?.status ?? "not_started";
}

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
	not_started: "Not started",
	in_progress: "In progress",
	completed: "Completed",
};

export const hasTicket = (ticketNumber: string) => /^\d+$/.test(ticketNumber);

/**
 * The original screens' accent colors, mapped to the app's palette. Set on the
 * page wrapper so their `var(--destaque)` / `var(--success)` classes resolve.
 */
export const TASK_THEME = {
	"--destaque": "var(--brand)",
	"--success": "#16a34a",
	"--font-quaternaria": "#cbd5e1",
} as CSSProperties;

export const pad2 = (n: number) => String(n).padStart(2, "0");
/** "HH:mm" in the device's time zone. */
export const localHm = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
/** "YYYY-MM-DD" in the device's time zone. */
export const localYmd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
