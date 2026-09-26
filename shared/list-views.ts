/**
 * Which columns (lists) and which pieces of information (board cards) each
 * screen shows, and in what order. Set by an administrator in Settings ›
 * Lists & columns; everyone sees the same. Stored as `settings.listViews`.
 */

export type ListId = "tickets" | "ticketCards" | "leads" | "leadCards" | "team";

export interface ColumnDef {
	id: string;
	label: string;
	/** What it shows, for the editor. */
	hint: string;
	/**
	 * Always shown ("Fixed"). When it's among the list's first columns (the
	 * ticket number and title, the lead's or person's name) it also stays on top.
	 */
	locked?: boolean;
	/** On before anyone changes it. */
	defaultOn: boolean;
	/** Shown only to administrators on the screen (e.g. whose portfolio a lead is in). */
	adminOnly?: boolean;
	/**
	 * Whether every record has it: "required" in the form, "auto" filled by the
	 * CRM (number, dates, status). Empty: optional, so some rows show "—".
	 */
	filled?: "required" | "auto";
}

export interface ListDef {
	id: ListId;
	/** The screen it belongs to (and its route). */
	screen: "Tickets" | "Leads" | "Team";
	route: "/tickets" | "/contacts" | "/team";
	label: string;
	hint: string;
	/** A table's columns, or what a board card shows. */
	kind: "table" | "card";
	columns: ColumnDef[];
}

export const LISTS: ListDef[] = [
	{
		id: "tickets",
		screen: "Tickets",
		route: "/tickets",
		label: "Tickets list",
		hint: "The columns of the List view",
		kind: "table",
		columns: [
			{ id: "number", label: "#", hint: "The ticket number", locked: true, defaultOn: true, filled: "auto" },
			{ id: "title", label: "Ticket", hint: "Title, with its type and requester underneath", locked: true, defaultOn: true, filled: "required" },
			{ id: "status", label: "Status", hint: "Where it is in its workflow", locked: true, defaultOn: true, filled: "auto" },
			{ id: "priority", label: "Priority", hint: "Low, medium, high or urgent", defaultOn: true, filled: "required" },
			{ id: "assignee", label: "Assignee", hint: "Who is working on it", defaultOn: true },
			{ id: "location", label: "Location", hint: "Development, block and unit", defaultOn: true },
			{ id: "due", label: "Due", hint: "Deadline, in red when overdue", defaultOn: true },
			{ id: "nextVisit", label: "Next visit", hint: "Date of the next appointment, or On site now", defaultOn: true },
			{ id: "updated", label: "Updated", hint: "Last change, e.g. 3 hours ago", defaultOn: true, filled: "auto" },
			{ id: "type", label: "Type", hint: "Warranty claim, maintenance, sales inquiry…", defaultOn: false, filled: "required" },
			{ id: "requester", label: "Requester", hint: "Owner or resident who asked, with phone", defaultOn: false },
			{ id: "client", label: "Client", hint: "The client company (HOA, building manager…)", defaultOn: false },
			{ id: "reporter", label: "Opened by", hint: "Who registered the ticket", defaultOn: false, filled: "auto" },
			{ id: "created", label: "Created", hint: "When it was opened", defaultOn: false, filled: "auto" },
		],
	},
	{
		id: "ticketCards",
		screen: "Tickets",
		route: "/tickets",
		label: "Ticket cards",
		hint: "What each card shows on the Board view",
		kind: "card",
		columns: [
			{ id: "number", label: "Number", hint: "#1042, at the top", locked: true, defaultOn: true, filled: "auto" },
			{ id: "title", label: "Title", hint: "What it's about", locked: true, defaultOn: true, filled: "required" },
			{ id: "priority", label: "Priority", hint: "Next to the number", defaultOn: true, filled: "required" },
			{ id: "location", label: "Location", hint: "Development, block and unit", defaultOn: true },
			{ id: "nextVisit", label: "Next visit", hint: "Date of the next appointment", defaultOn: true },
			{ id: "due", label: "Due", hint: "Deadline, in red when overdue", defaultOn: true },
			{ id: "assignee", label: "Assignee", hint: "Initials of who is working on it", defaultOn: true },
			{ id: "visitButton", label: "Start visit button", hint: "For the technician, on the day of their visit", defaultOn: true },
			{ id: "type", label: "Type", hint: "Warranty claim, maintenance…", defaultOn: false, filled: "required" },
			{ id: "requester", label: "Requester", hint: "Owner or resident who asked", defaultOn: false },
		],
	},
	{
		id: "leads",
		screen: "Leads",
		route: "/contacts",
		label: "Leads list",
		hint: "The columns of the List view in Contacts",
		kind: "table",
		columns: [
			{ id: "lead", label: "Lead", hint: "Name, with company and email or phone underneath", locked: true, defaultOn: true, filled: "required" },
			{ id: "stage", label: "Stage", hint: "Step of the sales funnel", locked: true, defaultOn: true, filled: "required" },
			{ id: "development", label: "Interested in", hint: "The development they want", defaultOn: true },
			{ id: "budget", label: "Budget", hint: "How much they can spend", defaultOn: true },
			{ id: "followUp", label: "Next follow-up", hint: "Next planned contact, in red when late", defaultOn: true },
			{ id: "lastContact", label: "Last contact", hint: "When someone last talked to them", defaultOn: true },
			{ id: "deals", label: "Deals", hint: "How many deals they have", defaultOn: true },
			{ id: "owner", label: "Portfolio", hint: "Whose portfolio they're in (administrators only)", defaultOn: true, adminOnly: true },
			{ id: "temperature", label: "Temperature", hint: "Hot, warm or cold", defaultOn: false, filled: "required" },
			{ id: "source", label: "Source", hint: "Website, referral, open house…", defaultOn: false },
			{ id: "company", label: "Company", hint: "Where they work", defaultOn: false },
			{ id: "email", label: "Email", hint: "Their email address", defaultOn: false },
			{ id: "phone", label: "Phone", hint: "Their phone number", defaultOn: false },
			{ id: "created", label: "Created", hint: "When the lead was added", defaultOn: false, filled: "auto" },
		],
	},
	{
		id: "leadCards",
		screen: "Leads",
		route: "/contacts",
		label: "Lead cards",
		hint: "What each card shows on the Board view in Contacts",
		kind: "card",
		columns: [
			{ id: "name", label: "Name", hint: "The lead's name", locked: true, defaultOn: true, filled: "required" },
			{ id: "temperature", label: "Temperature", hint: "A colored dot: hot, warm or cold", defaultOn: true, filled: "required" },
			{ id: "development", label: "Interested in", hint: "The development (or their company)", defaultOn: true },
			{ id: "followUp", label: "Next follow-up", hint: "Next planned contact", defaultOn: true },
			{ id: "owner", label: "Portfolio", hint: "Whose portfolio (administrators only)", defaultOn: true, adminOnly: true },
			{ id: "budget", label: "Budget", hint: "How much they can spend", defaultOn: true },
			{ id: "phone", label: "Phone", hint: "Their phone number", defaultOn: false },
			{ id: "source", label: "Source", hint: "Where they came from", defaultOn: false },
		],
	},
	{
		id: "team",
		screen: "Team",
		route: "/team",
		label: "Team list",
		hint: "The columns of the Team screen",
		kind: "table",
		columns: [
			{ id: "name", label: "Name", hint: "Photo initials, name and email", locked: true, defaultOn: true, filled: "required" },
			{ id: "jobTitle", label: "Job title", hint: "Job title, with the trade underneath", defaultOn: true },
			{ id: "access", label: "Access", hint: "Their access profile", locked: true, defaultOn: true, filled: "required" },
			{ id: "contact", label: "Contact", hint: "Email and phone, clickable", defaultOn: true, filled: "required" },
			{ id: "upcoming", label: "Upcoming", hint: "Open appointments", defaultOn: true },
			{ id: "trade", label: "Trade", hint: "Electrical, plumbing…", defaultOn: false },
			{ id: "phone", label: "Phone", hint: "Phone only", defaultOn: false },
			{ id: "status", label: "Status", hint: "Active or inactive", defaultOn: false, filled: "auto" },
			{ id: "since", label: "Member since", hint: "When they joined the CRM", defaultOn: false, filled: "auto" },
		],
	},
];

export const LIST_BY_ID = Object.fromEntries(LISTS.map((l) => [l.id, l])) as Record<ListId, ListDef>;

/** The fixed columns that open a list (e.g. # and Ticket): they stay on top, in this order. */
export function pinnedColumns(list: ListId): string[] {
	const out: string[] = [];
	for (const c of LIST_BY_ID[list].columns) {
		if (!c.locked) break;
		out.push(c.id);
	}
	return out;
}

/** Per list, the columns in their order and whether each is shown. */
export type ListViews = Record<ListId, { id: string; visible: boolean }[]>;

function defaultsOf(list: ListDef) {
	return list.columns.map((c) => ({ id: c.id, visible: c.defaultOn || Boolean(c.locked) }));
}

export const DEFAULT_LIST_VIEWS: ListViews = Object.fromEntries(LISTS.map((l) => [l.id, defaultsOf(l)])) as ListViews;

/**
 * Reads what was saved, keeping its order and adding columns shipped later
 * (with their default). Fixed columns always show; the ones opening the list stay first.
 */
export function listViewsFrom(stored: unknown): ListViews {
	const src = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
	const out = {} as ListViews;
	for (const list of LISTS) {
		const known = new Map(list.columns.map((c) => [c.id, c]));
		const saved = Array.isArray(src[list.id]) ? (src[list.id] as unknown[]) : [];
		const seen = new Set<string>();
		const cols: { id: string; visible: boolean }[] = [];
		for (const raw of saved) {
			const id = raw && typeof raw === "object" ? String((raw as Record<string, unknown>).id ?? "") : "";
			if (!known.has(id) || seen.has(id)) continue;
			seen.add(id);
			cols.push({ id, visible: known.get(id)!.locked ? true : Boolean((raw as Record<string, unknown>).visible) });
		}
		for (const c of list.columns) if (!seen.has(c.id)) cols.push({ id: c.id, visible: c.defaultOn || Boolean(c.locked) });
		const pinned = pinnedColumns(list.id);
		out[list.id] = [...pinned.map((id) => cols.find((c) => c.id === id)!), ...cols.filter((c) => !pinned.includes(c.id))];
	}
	return out;
}

/** The shown columns of a list, in order; admin-only ones need an administrator. */
export function shownColumns(views: ListViews, list: ListId, isAdmin: boolean): string[] {
	const defs = new Map(LIST_BY_ID[list].columns.map((c) => [c.id, c]));
	return views[list].filter((c) => c.visible && (isAdmin || !defs.get(c.id)?.adminOnly)).map((c) => c.id);
}
