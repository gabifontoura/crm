import type { BillingPlan } from "../../shared/billing.js";
import type { CalendarEvent } from "../../shared/calendar/types.js";
import type { Contact } from "../../shared/contacts.js";
import type { Dashboard } from "../../shared/dashboards.js";
import type { Report } from "../../shared/reports.js";
import type { Block, Client, Development, Unit } from "../../shared/developments.js";
import type { ReleaseRecord } from "../../shared/releases.js";
import type { Ticket, TicketActivity, TicketType, Workflow } from "../../shared/tickets.js";
import type { User } from "../../shared/users.js";

/** Calendar event as stored: dates as ISO strings, owner by id. */
export type StoredEvent = Omit<CalendarEvent, "start" | "end" | "owner"> & {
	start: string;
	end: string;
	ownerId: string;
};

type Id = string | number;

/** Minimal table/collection API both backends implement. */
export interface Collection<T extends { id: Id }> {
	list(): Promise<T[]>;
	get(id: T["id"]): Promise<T | null>;
	insert(doc: T): Promise<T>;
	/** Inserts rows that don't exist yet (used for seeding; ignores duplicates). */
	seed(docs: T[]): Promise<void>;
	update(id: T["id"], doc: T): Promise<T | null>;
	remove(id: T["id"]): Promise<boolean>;
	/** Deletes every row (the demo's daily reset). */
	clear(): Promise<void>;
}

export interface KeyValue {
	get<T>(key: string): Promise<T | null>;
	set(key: string, value: unknown): Promise<void>;
	/** Deletes every setting (the demo's daily reset). */
	clear(): Promise<void>;
}

export interface Repos {
	kind: "supabase" | "file";
	/** False when data is lost on restart (file storage on Vercel's /tmp). */
	persistent: boolean;
	users: Collection<User>;
	clients: Collection<Client>;
	developments: Collection<Development>;
	blocks: Collection<Block>;
	units: Collection<Unit>;
	events: Collection<StoredEvent>;
	releases: Collection<ReleaseRecord>;
	workflows: Collection<Workflow>;
	ticketTypes: Collection<TicketType>;
	tickets: Collection<Ticket>;
	ticketActivity: Collection<TicketActivity>;
	contacts: Collection<Contact>;
	dashboards: Collection<Dashboard>;
	reports: Collection<Report>;
	billing: Collection<BillingPlan>;
	settings: KeyValue;
}
