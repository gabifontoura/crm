/** Types shipped with the app. Admins can create more, so ids are strings. */
export type BuiltInAppointmentType =
	| "initial_inspection"
	| "technical_question"
	| "maintenance"
	| "awaiting_supplier"
	| "unit_showing"
	| "sales_meeting";

export type AppointmentType = BuiltInAppointmentType | (string & {});

export type MeetingMode = "on_site" | "remote" | "hybrid";

export interface ClientSummary {
	id: string;
	name: string;
	code?: string;
}

export interface UserSummary {
	id: string;
	name: string;
	initials?: string;
}

export interface TimeEntry {
	id: string;
	start: string;
	end: string;
	total: string;
	description?: string;
}

export interface Attachment {
	id: string;
	name: string;
	size: string;
}

export interface Expense {
	id: string;
	description: string;
	amount: number;
}

import type { ServiceReport } from "../service.js";

export interface CalendarEvent {
	id: string;
	title: string;
	type: AppointmentType;
	mode: MeetingMode;
	completed: boolean;
	start: Date;
	end: Date;
	project: string;
	client: ClientSummary;
	ticketNumber: string;
	owner: UserSummary;
	/** Development (job site) name, kept for display and filters. */
	property: string;
	developmentId?: string;
	blockId?: string;
	unitId?: string;
	/** "Block A · Unit 304", resolved from the block and unit. */
	location?: string;
	/** Main notes, already stripped of the ticket's boilerplate text. */
	notes: string;
	billable: boolean;
	groupActivity: boolean;
	hours: TimeEntry[];
	files: Attachment[];
	expenses: Expense[];
	/** Ids of the custom tags (see TagDef) applied to this appointment. */
	tags?: string[];
	/** On-site service record (check-in, checklist, photos, signature). */
	service?: ServiceReport | null;
	/** The sub-tickets done on this visit (its actions), from the server. */
	actions?: { number: number; title: string; done: boolean }[];
}

/** Built-in tags, derived from event flags instead of being picked by hand. */
export type BuiltInTag = "billable" | "group_activity";

/** A tag an admin manages in the calendar settings. */
export interface TagDef {
	id: string;
	label: string;
	/** Dot color shown on the chip. */
	color: string;
	/** Whether the chip is shown on cards and in the detail dialog. */
	visible: boolean;
	/** Set for the built-in tags; they can be renamed or hidden, not deleted. */
	builtIn?: BuiltInTag;
}

/** Optional lines on the appointment card. The title is always shown. */
export type CardField =
	| "time"
	| "client"
	| "ticket"
	| "property"
	| "location"
	| "owner"
	| "mode"
	| "project"
	| "notes"
	| "tags";

export type CalendarView = "day" | "week" | "month";

export interface CalendarFilters {
	property: string;
	owner: string;
	types: AppointmentType[];
	mode: MeetingMode | "all";
	pendingOnly: boolean;
	startDate: string;
	endDate: string;
}
