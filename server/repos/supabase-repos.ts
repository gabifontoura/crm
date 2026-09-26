import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BillingPlan } from "../../shared/billing.js";
import type { Contact } from "../../shared/contacts.js";
import type { Dashboard } from "../../shared/dashboards.js";
import type { Report } from "../../shared/reports.js";
import type { Block, Client, Development, Unit } from "../../shared/developments.js";
import type { ReleaseRecord } from "../../shared/releases.js";
import type { Ticket, TicketActivity, TicketType, Workflow } from "../../shared/tickets.js";
import type { User } from "../../shared/users.js";
import type { Collection, KeyValue, Repos, StoredEvent } from "./types.js";

/**
 * Supabase (Postgres) storage. Tables are created by
 * `supabase/migrations/0001_init.sql`. Uses the service role key, so it must
 * only ever run on the server.
 */

type Row = Record<string, unknown>;

interface Mapper<T> {
	table: string;
	orderBy: string;
	toRow(doc: T): Row;
	fromRow(row: Row): T;
}

function fail(table: string, action: string, error: { message: string; code?: string } | null): never {
	throw new Error(`Supabase ${action} on "${table}" failed: ${error?.message ?? "unknown error"}`);
}

function supabaseCollection<T extends { id: string | number }>(db: SupabaseClient, m: Mapper<T>): Collection<T> {
	return {
		async list() {
			// Pages through results; PostgREST returns at most 1000 rows per request.
			const out: T[] = [];
			for (let from = 0; ; from += 1000) {
				const { data, error } = await db.from(m.table).select("*").order(m.orderBy).range(from, from + 999);
				if (error) fail(m.table, "select", error);
				out.push(...(data ?? []).map((r) => m.fromRow(r)));
				if (!data || data.length < 1000) return out;
			}
		},
		async get(id) {
			const { data, error } = await db.from(m.table).select("*").eq("id", id).maybeSingle();
			if (error) fail(m.table, "select", error);
			return data ? m.fromRow(data) : null;
		},
		async insert(doc) {
			const { data, error } = await db.from(m.table).insert(m.toRow(doc)).select("*").single();
			if (error) fail(m.table, "insert", error);
			return m.fromRow(data);
		},
		async seed(docs) {
			for (let i = 0; i < docs.length; i += 500) {
				const rows = docs.slice(i, i + 500).map((d) => m.toRow(d));
				const { error } = await db.from(m.table).upsert(rows, { onConflict: "id", ignoreDuplicates: true });
				if (error) fail(m.table, "seed", error);
			}
		},
		async update(id, doc) {
			const { data, error } = await db.from(m.table).update(m.toRow(doc)).eq("id", id).select("*").maybeSingle();
			if (error) fail(m.table, "update", error);
			return data ? m.fromRow(data) : null;
		},
		async remove(id) {
			const { data, error } = await db.from(m.table).delete().eq("id", id).select("id");
			if (error) fail(m.table, "delete", error);
			return (data?.length ?? 0) > 0;
		},
		async clear() {
			// PostgREST needs a filter to delete: every row has an id.
			const { error } = await db.from(m.table).delete().not("id", "is", null);
			if (error) fail(m.table, "delete", error);
		},
	};
}

const s = (v: unknown) => (v == null ? "" : String(v));

const users: Mapper<User> = {
	table: "users",
	orderBy: "name",
	toRow: (u) => ({
		id: u.id, name: u.name, email: u.email, phone: u.phone, job_title: u.jobTitle, trade: u.trade,
		role: u.role, access_id: u.accessId ?? null, active: u.active, created_at: u.createdAt, updated_at: u.updatedAt,
	}),
	fromRow: (r) => ({
		id: s(r.id), name: s(r.name), email: s(r.email), phone: s(r.phone), jobTitle: s(r.job_title), trade: s(r.trade),
		role: r.role as User["role"], accessId: r.access_id ? s(r.access_id) : null, active: Boolean(r.active), createdAt: s(r.created_at), updatedAt: s(r.updated_at),
	}),
};

const clients: Mapper<Client> = {
	table: "clients",
	orderBy: "name",
	toRow: (c) => ({ id: c.id, name: c.name, contact_name: c.contactName, email: c.email, phone: c.phone }),
	fromRow: (r) => ({ id: s(r.id), name: s(r.name), contactName: s(r.contact_name), email: s(r.email), phone: s(r.phone) }),
};

const developments: Mapper<Development> = {
	table: "developments",
	orderBy: "name",
	toRow: (d) => ({
		id: d.id, name: d.name, client_id: d.clientId || null, kind: d.kind, status: d.status, address: d.address,
		city: d.city, delivery_date: d.deliveryDate || null, stage: d.stage ?? null, progress: d.progress ?? null,
		photos: d.photos ?? [], unit_types: d.unitTypes ?? [], created_at: d.createdAt, updated_at: d.updatedAt,
	}),
	fromRow: (r) => ({
		id: s(r.id), name: s(r.name), clientId: s(r.client_id), kind: r.kind as Development["kind"],
		status: r.status as Development["status"], address: s(r.address), city: s(r.city),
		deliveryDate: s(r.delivery_date), stage: (r.stage as Development["stage"]) ?? null, progress: r.progress == null ? null : Number(r.progress),
		photos: (r.photos as Development["photos"]) ?? [], unitTypes: (r.unit_types as Development["unitTypes"]) ?? [],
		createdAt: s(r.created_at), updatedAt: s(r.updated_at),
	}),
};

const blocks: Mapper<Block> = {
	table: "blocks",
	orderBy: "name",
	toRow: (b) => ({ id: b.id, development_id: b.developmentId, name: b.name, floors: b.floors, photos: b.photos ?? [] }),
	fromRow: (r) => ({ id: s(r.id), developmentId: s(r.development_id), name: s(r.name), floors: Number(r.floors ?? 0), photos: (r.photos as Block["photos"]) ?? [] }),
};

const units: Mapper<Unit> = {
	table: "units",
	orderBy: "number",
	toRow: (u) => ({
		id: u.id, block_id: u.blockId, number: u.number, floor: u.floor, kind: u.kind,
		area_sqft: u.areaSqft, status: u.status, occupant: u.occupant, type_id: u.typeId ?? null,
		bedrooms: u.bedrooms ?? 0, bathrooms: u.bathrooms ?? 0, parking: u.parking ?? 0,
	}),
	fromRow: (r) => ({
		id: s(r.id), blockId: s(r.block_id), number: s(r.number), floor: Number(r.floor ?? 0), kind: s(r.kind),
		areaSqft: Number(r.area_sqft ?? 0), status: r.status as Unit["status"], occupant: s(r.occupant),
		typeId: r.type_id ? s(r.type_id) : null, bedrooms: Number(r.bedrooms ?? 0), bathrooms: Number(r.bathrooms ?? 0), parking: Number(r.parking ?? 0),
	}),
};

const events: Mapper<StoredEvent> = {
	table: "calendar_events",
	orderBy: "start_at",
	toRow: (e) => ({
		id: e.id, title: e.title, type: e.type, mode: e.mode, completed: e.completed,
		start_at: e.start, end_at: e.end, project: e.project,
		client_id: e.client.id, client_name: e.client.name, ticket_number: e.ticketNumber,
		owner_id: e.ownerId, property: e.property,
		development_id: e.developmentId || null, block_id: e.blockId || null, unit_id: e.unitId || null,
		location: e.location ?? "", notes: e.notes, billable: e.billable, group_activity: e.groupActivity,
		tags: e.tags ?? [], hours: e.hours, files: e.files, expenses: e.expenses,
		service: e.service ?? null,
	}),
	fromRow: (r) => ({
		id: s(r.id), title: s(r.title), type: s(r.type), mode: r.mode as StoredEvent["mode"], completed: Boolean(r.completed),
		start: new Date(s(r.start_at)).toISOString(), end: new Date(s(r.end_at)).toISOString(), project: s(r.project),
		client: { id: s(r.client_id), name: s(r.client_name) }, ticketNumber: s(r.ticket_number),
		ownerId: s(r.owner_id), property: s(r.property),
		developmentId: r.development_id ? s(r.development_id) : undefined,
		blockId: r.block_id ? s(r.block_id) : undefined,
		unitId: r.unit_id ? s(r.unit_id) : undefined,
		location: s(r.location), notes: s(r.notes), billable: Boolean(r.billable), groupActivity: Boolean(r.group_activity),
		tags: (r.tags as string[]) ?? [],
		hours: (r.hours as StoredEvent["hours"]) ?? [], files: (r.files as StoredEvent["files"]) ?? [],
		expenses: (r.expenses as StoredEvent["expenses"]) ?? [],
		service: (r.service as StoredEvent["service"]) ?? null,
	}),
};

const releases: Mapper<ReleaseRecord> = {
	table: "releases",
	orderBy: "id",
	toRow: (x) => ({
		id: x.id, title: x.titulo, description: x.descricao, what_changes: x.oQueMuda, steps: x.passoAPasso,
		training_video: x.videoEad ?? null, images: x.imagens ?? [], release_date: x.data, release_time: x.hora,
		author: x.usuario, type: x.tipo, product: x.produto,
	}),
	fromRow: (r) => ({
		id: Number(r.id), titulo: s(r.title), descricao: s(r.description), oQueMuda: s(r.what_changes),
		passoAPasso: (r.steps as string[]) ?? [], videoEad: r.training_video ? s(r.training_video) : undefined,
		imagens: (r.images as string[]) ?? [], data: s(r.release_date), hora: s(r.release_time),
		usuario: s(r.author), tipo: r.type as ReleaseRecord["tipo"], produto: s(r.product),
	}),
};

const workflows: Mapper<Workflow> = {
	table: "workflows",
	orderBy: "name",
	toRow: (w) => ({
		id: w.id, name: w.name, description: w.description, initial_status_id: w.initialStatusId,
		statuses: w.statuses, transitions: w.transitions, updated_at: w.updatedAt,
	}),
	fromRow: (r) => ({
		id: s(r.id), name: s(r.name), description: s(r.description), initialStatusId: s(r.initial_status_id),
		statuses: (r.statuses as Workflow["statuses"]) ?? [], transitions: (r.transitions as Workflow["transitions"]) ?? [],
		updatedAt: s(r.updated_at),
	}),
};

const ticketTypes: Mapper<TicketType> = {
	table: "ticket_types",
	orderBy: "name",
	toRow: (t) => ({
		id: t.id, name: t.name, description: t.description, color: t.color, workflow_id: t.workflowId,
		default_priority: t.defaultPriority, sla_hours: t.slaHours, active: t.active, fields: t.fields,
	}),
	fromRow: (r) => ({
		id: s(r.id), name: s(r.name), description: s(r.description), color: s(r.color), workflowId: s(r.workflow_id),
		defaultPriority: r.default_priority as TicketType["defaultPriority"],
		slaHours: r.sla_hours == null ? null : Number(r.sla_hours), active: Boolean(r.active),
		fields: (r.fields as TicketType["fields"]) ?? [],
	}),
};

const tickets: Mapper<Ticket> = {
	table: "tickets",
	orderBy: "number",
	toRow: (t) => ({
		id: t.id, number: t.number, title: t.title, description: t.description, type_id: t.typeId, status_id: t.statusId,
		priority: t.priority, assignee_id: t.assigneeId, reporter_id: t.reporterId,
		requester_name: t.requester.name, requester_email: t.requester.email, requester_phone: t.requester.phone,
		client_id: t.clientId, client_name: t.clientName,
		development_id: t.developmentId, block_id: t.blockId, unit_id: t.unitId, property: t.property, location: t.location,
		due_at: t.dueAt, fields: t.fields, parent_id: t.parentId ?? null, origin: t.origin ?? null, created_at: t.createdAt, updated_at: t.updatedAt, closed_at: t.closedAt,
		attachments: t.attachments ?? [], engineering: t.engineering ?? null,
	}),
	fromRow: (r) => ({
		id: s(r.id), number: Number(r.number), title: s(r.title), description: s(r.description), typeId: s(r.type_id),
		statusId: s(r.status_id), priority: r.priority as Ticket["priority"],
		assigneeId: r.assignee_id ? s(r.assignee_id) : null, reporterId: s(r.reporter_id),
		requester: { name: s(r.requester_name), email: s(r.requester_email), phone: s(r.requester_phone) },
		clientId: s(r.client_id), clientName: s(r.client_name),
		developmentId: r.development_id ? s(r.development_id) : null, blockId: r.block_id ? s(r.block_id) : null,
		unitId: r.unit_id ? s(r.unit_id) : null, property: s(r.property), location: s(r.location),
		dueAt: r.due_at ? new Date(s(r.due_at)).toISOString() : null, fields: (r.fields as Ticket["fields"]) ?? {},
		parentId: r.parent_id ? s(r.parent_id) : null, origin: (r.origin as Ticket["origin"]) ?? null,
		createdAt: new Date(s(r.created_at)).toISOString(), updatedAt: new Date(s(r.updated_at)).toISOString(),
		closedAt: r.closed_at ? new Date(s(r.closed_at)).toISOString() : null,
		attachments: (r.attachments as Ticket["attachments"]) ?? [], engineering: (r.engineering as Ticket["engineering"]) ?? null,
	}),
};

const ticketActivity: Mapper<TicketActivity> = {
	table: "ticket_activity",
	orderBy: "at",
	toRow: (a) => ({
		id: a.id, ticket_id: a.ticketId, at: a.at, user_id: a.userId, kind: a.kind,
		from_status_id: a.fromStatusId ?? null, to_status_id: a.toStatusId ?? null,
		transition_label: a.transitionLabel ?? null, comment: a.comment ?? null,
		assignee_id: a.assigneeId === undefined ? null : a.assigneeId,
		email: a.email ?? null,
	}),
	fromRow: (r) => ({
		id: s(r.id), ticketId: s(r.ticket_id), at: new Date(s(r.at)).toISOString(), userId: s(r.user_id),
		kind: r.kind as TicketActivity["kind"],
		fromStatusId: r.from_status_id ? s(r.from_status_id) : undefined, toStatusId: r.to_status_id ? s(r.to_status_id) : undefined,
		transitionLabel: r.transition_label ? s(r.transition_label) : undefined, comment: r.comment ? s(r.comment) : undefined,
		assigneeId: r.assignee_id ? s(r.assignee_id) : undefined,
		email: (r.email as TicketActivity["email"]) ?? undefined,
	}),
};

const contacts: Mapper<Contact> = {
	table: "contacts",
	orderBy: "name",
	toRow: (c) => ({
		id: c.id, name: c.name, email: c.email, phone: c.phone, company: c.company, owner_id: c.ownerId, stage_id: c.stageId,
		temperature: c.temperature, source: c.source, development_id: c.developmentId, budget: c.budget, notes: c.notes,
		next_follow_up: c.nextFollowUp, last_contact_at: c.lastContactAt, interactions: c.interactions, created_by: c.createdBy,
		created_at: c.createdAt, updated_at: c.updatedAt,
	}),
	fromRow: (r) => ({
		id: s(r.id), name: s(r.name), email: s(r.email), phone: s(r.phone), company: s(r.company),
		ownerId: r.owner_id ? s(r.owner_id) : null, stageId: s(r.stage_id), temperature: r.temperature as Contact["temperature"],
		source: s(r.source), developmentId: r.development_id ? s(r.development_id) : null,
		budget: r.budget === null || r.budget === undefined ? null : Number(r.budget), notes: s(r.notes),
		nextFollowUp: r.next_follow_up ? s(r.next_follow_up).slice(0, 10) : null,
		lastContactAt: r.last_contact_at ? new Date(s(r.last_contact_at)).toISOString() : null,
		interactions: (r.interactions as Contact["interactions"]) ?? [], createdBy: s(r.created_by),
		createdAt: new Date(s(r.created_at)).toISOString(), updatedAt: new Date(s(r.updated_at)).toISOString(),
	}),
};

const dashboards: Mapper<Dashboard> = {
	table: "dashboards",
	orderBy: "name",
	toRow: (d) => ({
		id: d.id, name: d.name, description: d.description, owner_id: d.ownerId, shared: d.shared, range: d.range,
		share_with: d.shareWith ?? { roles: [], users: [] }, widgets: d.widgets, created_at: d.createdAt, updated_at: d.updatedAt,
	}),
	fromRow: (r) => ({
		id: s(r.id), name: s(r.name), description: s(r.description), ownerId: s(r.owner_id), shared: r.shared === true,
		shareWith: (r.share_with as Dashboard["shareWith"]) ?? { roles: [], users: [] },
		range: s(r.range) as Dashboard["range"], widgets: (r.widgets as Dashboard["widgets"]) ?? [],
		createdAt: new Date(s(r.created_at)).toISOString(), updatedAt: new Date(s(r.updated_at)).toISOString(),
	}),
};

const reports: Mapper<Report> = {
	table: "reports",
	orderBy: "name",
	toRow: (r) => ({
		id: r.id, name: r.name, description: r.description, owner_id: r.ownerId, shared: r.shared, source: r.source, columns: r.columns,
		date_field: r.dateField, period: r.period, filters: r.filters, group_by: r.groupBy, sort: r.sort, created_at: r.createdAt, updated_at: r.updatedAt,
	}),
	fromRow: (r) => ({
		id: s(r.id), name: s(r.name), description: s(r.description), ownerId: s(r.owner_id), shared: r.shared === true,
		source: s(r.source) as Report["source"], columns: (r.columns as string[]) ?? [], dateField: s(r.date_field) || "created",
		period: (r.period as Report["period"]) ?? { kind: "30d" }, filters: (r.filters as Report["filters"]) ?? { state: "all" },
		groupBy: r.group_by ? s(r.group_by) : null, sort: (r.sort as Report["sort"]) ?? { column: "", dir: "desc" },
		createdAt: new Date(s(r.created_at)).toISOString(), updatedAt: new Date(s(r.updated_at)).toISOString(),
	}),
};

const billing: Mapper<BillingPlan> = {
	table: "billing",
	orderBy: "created_at",
	toRow: (b) => ({
		id: b.id, ticket_id: b.ticketId, ticket_number: b.ticketNumber, customer: b.customer, property: b.property, total_price: b.totalPrice,
		sold: b.sold ?? null, purchased_on: b.purchasedOn ?? null,
		installments: b.installments, created_by: b.createdBy, created_at: b.createdAt, updated_at: b.updatedAt,
	}),
	fromRow: (r) => ({
		id: s(r.id), ticketId: s(r.ticket_id), ticketNumber: Number(r.ticket_number), customer: (r.customer as BillingPlan["customer"]) ?? { name: "", email: "", phone: "" },
		property: s(r.property), totalPrice: Number(r.total_price), installments: (r.installments as BillingPlan["installments"]) ?? [],
		sold: (r.sold as BillingPlan["sold"]) ?? undefined, purchasedOn: r.purchased_on ? s(r.purchased_on).slice(0, 10) : undefined,
		createdBy: s(r.created_by), createdAt: new Date(s(r.created_at)).toISOString(), updatedAt: new Date(s(r.updated_at)).toISOString(),
	}),
};

function supabaseKeyValue(db: SupabaseClient): KeyValue {
	return {
		async get<T>(key: string) {
			const { data, error } = await db.from("app_settings").select("value").eq("key", key).maybeSingle();
			if (error) fail("app_settings", "select", error);
			return (data?.value as T) ?? null;
		},
		async set(key, value) {
			const { error } = await db.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
			if (error) fail("app_settings", "upsert", error);
		},
		async clear() {
			const { error } = await db.from("app_settings").delete().not("key", "is", null);
			if (error) fail("app_settings", "delete", error);
		},
		async claim(key, value) {
			const { error } = await db.from("app_settings").insert({ key, value, updated_at: new Date().toISOString() });
			// 23505: the key exists (someone else holds it).
			if (error?.code === "23505") return false;
			if (error) fail("app_settings", "insert", error);
			return true;
		},
		async remove(key) {
			const { error } = await db.from("app_settings").delete().eq("key", key);
			if (error) fail("app_settings", "delete", error);
		},
	};
}

export function supabaseConfig(): { url: string; key: string } | null {
	const raw = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	// Just the project's address: pasted with "/rest/v1", a slash or spaces, the client would ask for a wrong path.
	const url = raw
		?.trim()
		.replace(/\/+$/, "")
		.replace(/\/(rest|auth|storage)\/v1$/, "")
		.replace(/\/+$/, "");
	return url && key ? { url, key } : null;
}

export function createSupabaseRepos(config: { url: string; key: string }): Repos {
	const db = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
	return {
		kind: "supabase",
		persistent: true,
		users: supabaseCollection(db, users),
		clients: supabaseCollection(db, clients),
		developments: supabaseCollection(db, developments),
		blocks: supabaseCollection(db, blocks),
		units: supabaseCollection(db, units),
		events: supabaseCollection(db, events),
		releases: supabaseCollection(db, releases),
		workflows: supabaseCollection(db, workflows),
		ticketTypes: supabaseCollection(db, ticketTypes),
		tickets: supabaseCollection(db, tickets),
		ticketActivity: supabaseCollection(db, ticketActivity),
		contacts: supabaseCollection(db, contacts),
		dashboards: supabaseCollection(db, dashboards),
		reports: supabaseCollection(db, reports),
		billing: supabaseCollection(db, billing),
		settings: supabaseKeyValue(db),
	};
}
