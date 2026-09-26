import { SOLID_COLORS, TONES } from "../../../../shared/palette";
import type {
	AppointmentType,
	CalendarEvent,
	CardField,
	MeetingMode,
	TagDef,
	BuiltInTag,
} from "./types";

/** An appointment type and the colors of its cards. Admins can add more. */
export interface AppointmentTypeDef {
	id: AppointmentType;
	label: string;
	background: string;
	border: string;
	/** Shipped types can be renamed and recolored, but not deleted. */
	builtIn?: boolean;
}

export const DEFAULT_HOURS: { startHour: number; endHour: number } = {
	startHour: 6,
	endHour: 23,
};

export const DEFAULT_APPOINTMENT_TYPES: AppointmentTypeDef[] = [
	{ id: "initial_inspection", label: "Initial inspection", background: "#E9D5FF", border: "#C084FC", builtIn: true },
	{ id: "maintenance", label: "Maintenance", background: "#BFDBFE", border: "#60A5FA", builtIn: true },
	{ id: "awaiting_supplier", label: "Awaiting supplier", background: "#FECACA", border: "#F87171", builtIn: true },
	{ id: "unit_showing", label: "Unit showing", background: "#BBF7D0", border: "#4ADE80", builtIn: true },
	{ id: "sales_meeting", label: "Sales meeting", background: "#FED7AA", border: "#FB923C", builtIn: true },
];

/** Used for events whose type was deleted. */
export const UNKNOWN_TYPE: AppointmentTypeDef = {
	id: "__unknown__",
	label: "Other",
	background: "#E2E8F0",
	border: "#94A3B8",
};

/** Darker shade of a color, used as the card border for custom colors. */
export function darken(hex: string, amount = 0.3): string {
	const c = hex.replace("#", "");
	const channel = (i: number) =>
		Math.round(Number.parseInt(c.slice(i, i + 2), 16) * (1 - amount))
			.toString(16)
			.padStart(2, "0");
	return `#${channel(0)}${channel(2)}${channel(4)}`.toUpperCase();
}

/** Card swatches: the soft background and border of every shared tone (see palette.ts). */
export const PASTEL_PALETTE: string[] = TONES.map((t) => t.soft);

export const PASTEL_BORDERS: string[] = TONES.map((t) => t.border);

export const MEETING_MODES: { id: MeetingMode; label: string }[] = [
	{ id: "on_site", label: "On-site" },
	{ id: "remote", label: "Remote" },
	{ id: "hybrid", label: "Hybrid" },
];

/** Colors offered for tag dots: the solid shades of the shared tones. */
export const TAG_COLORS: string[] = SOLID_COLORS;

export const DEFAULT_TAGS: TagDef[] = [
	{ id: "billable", label: "Billable", color: "#16A34A", visible: true, builtIn: "billable" },
	{ id: "group_activity", label: "Group activity", color: "#9333EA", visible: true, builtIn: "group_activity" },
];

function hasBuiltInTag(e: CalendarEvent, t: BuiltInTag): boolean {
	if (t === "billable") return e.billable;
	if (t === "group_activity") return e.groupActivity;
	return false;
}

export function hasTag(e: CalendarEvent, tag: TagDef): boolean {
	if (tag.builtIn) return hasBuiltInTag(e, tag.builtIn);
	return e.tags?.includes(tag.id) ?? false;
}

/** Visible tags that apply to the event, in the order the admin set. */
export function tagsForEvent(e: CalendarEvent, tags: TagDef[]): TagDef[] {
	return tags.filter((t) => t.visible && hasTag(e, t));
}

export const CARD_FIELDS: { id: CardField; label: string; hint: string }[] = [
	{ id: "time", label: "Time", hint: "Start and end time" },
	{ id: "client", label: "Client", hint: "Opens the client details" },
	{ id: "ticket", label: "Ticket", hint: "Ticket number" },
	{ id: "property", label: "Development", hint: "Job site of the visit" },
	{ id: "location", label: "Block / unit", hint: "e.g. Tower A · Unit 304" },
	{ id: "owner", label: "Owner", hint: "Person responsible" },
	{ id: "mode", label: "Meeting mode", hint: "On-site, remote or hybrid" },
	{ id: "project", label: "Project", hint: "Project the hours go to" },
	{ id: "notes", label: "Notes", hint: "First lines, with Read more" },
	{ id: "tags", label: "Tags", hint: "Chips configured below" },
];

export const DEFAULT_CARD_FIELDS: Record<CardField, boolean> = {
	time: true,
	client: true,
	ticket: true,
	property: true,
	location: true,
	owner: false,
	mode: false,
	project: false,
	notes: true,
	tags: true,
};

export function contrastColor(hex: string): string {
	const c = hex.replace("#", "");
	const r = Number.parseInt(c.slice(0, 2), 16);
	const g = Number.parseInt(c.slice(2, 4), 16);
	const b = Number.parseInt(c.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.75 ? "#3F3F46" : "#1F2937";
}

export function eventsOnDay(
	events: CalendarEvent[],
	day: Date,
): CalendarEvent[] {
	const d = new Date(day);
	d.setHours(0, 0, 0, 0);
	return events
		.filter((e) => {
			const start = new Date(e.start);
			start.setHours(0, 0, 0, 0);
			return start.getTime() === d.getTime();
		})
		.sort((a, b) => a.start.getTime() - b.start.getTime());
}
