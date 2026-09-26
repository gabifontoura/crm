import {
	type Contact,
	contactStagesFrom,
	type Interaction,
	INTERACTION_KINDS,
	isEmail,
	sameEmail,
	TEMPERATURES,
	type Temperature,
} from "../../shared/contacts.js";
import type { User } from "../../shared/users.js";
import { badRequest, conflict, created, forbidden, noContent, notFound, objectBody, ok, str, type ApiRequest } from "../lib/http.js";
import { currentUser } from "../lib/session.js";
import { requireAction } from "../lib/access.js";
import { logTicketComment, visibleTickets } from "./tickets.js";
import type { Repos } from "../repos/types.js";

/**
 * Lead portfolios. Everyone works their own portfolio (the contacts they
 * own); administrators see all of them, take unassigned leads and move
 * leads between people. Moving a lead is logged like a forwarded email.
 */

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isAdmin = (me: User) => me.role === "admin";
const canSee = (me: User, c: Contact) => isAdmin(me) || c.ownerId === me.id;

async function stages(repos: Repos) {
	return contactStagesFrom(await repos.settings.get("settings.contactStages"));
}

async function loadVisible(req: ApiRequest, repos: Repos, id: string) {
	const me = await currentUser(req, repos);
	const contact = await repos.contacts.get(id);
	if (!contact || !canSee(me, contact)) notFound("Contact");
	return { me, contact };
}

async function activeUser(repos: Repos, id: string | null): Promise<boolean> {
	if (!id) return true;
	const u = await repos.users.get(id);
	return Boolean(u?.active);
}

/** Reads and checks the editable fields; `current` fills what the body leaves out. */
async function readContact(repos: Repos, me: User, body: Record<string, unknown>, current?: Contact) {
	const errors: Record<string, string> = {};
	const pick = <K extends keyof Contact>(k: K, fallback: Contact[K]) => (k in body ? body[k] : (current?.[k] ?? fallback));
	const name = str(pick("name", "")).trim().slice(0, 120);
	const email = str(pick("email", "")).trim().toLowerCase().slice(0, 160);
	const phone = str(pick("phone", "")).trim().slice(0, 40);
	if (!name) errors.name = "Name is required.";
	if (!email && !phone) errors.email = "Add an email or a phone number.";
	if (email && !isEmail(email)) errors.email = "Enter a valid email.";

	const list = await stages(repos);
	const stageId = str(pick("stageId", list[0].id));
	if (!list.some((s) => s.id === stageId)) errors.stageId = "Pick a stage.";
	const temperature = str(pick("temperature", "warm")) as Temperature;
	if (!TEMPERATURES.some((t) => t.id === temperature)) errors.temperature = "Pick hot, warm or cold.";

	// Only administrators choose whose portfolio a lead goes to; others keep their own.
	let ownerId: string | null = current ? current.ownerId : me.id;
	if (isAdmin(me) && "ownerId" in body) ownerId = str(body.ownerId) || null;
	if (!(await activeUser(repos, ownerId))) errors.ownerId = "Pick an active team member.";

	const developmentId = str(pick("developmentId", null)) || null;
	if (developmentId && !(await repos.developments.get(developmentId))) errors.developmentId = "Unknown development.";
	const rawBudget = pick("budget", null);
	const budget = rawBudget === null || rawBudget === "" ? null : Number(rawBudget);
	if (budget !== null && (!Number.isFinite(budget) || budget < 0)) errors.budget = "Budget must be a positive number.";
	const nextFollowUp = str(pick("nextFollowUp", null)) || null;
	if (nextFollowUp && !/^\d{4}-\d{2}-\d{2}$/.test(nextFollowUp)) errors.nextFollowUp = "Pick a date.";

	if (email) {
		const twin = (await repos.contacts.list()).find((c) => c.id !== current?.id && sameEmail(c.email, email));
		if (twin) {
			const owner = twin.ownerId ? (await repos.users.get(twin.ownerId))?.name : null;
			errors.email = `${twin.name} already has this email${owner ? ` (in ${owner}'s portfolio)` : " (unassigned)"}.`;
		}
	}
	if (Object.keys(errors).length) badRequest(Object.values(errors)[0], errors);

	return {
		name,
		email,
		phone,
		company: str(pick("company", "")).trim().slice(0, 120),
		ownerId,
		stageId,
		temperature,
		source: str(pick("source", "")).trim().slice(0, 60),
		developmentId,
		budget: budget === null ? null : Math.round(budget),
		notes: str(pick("notes", "")).trim().slice(0, 4000),
		nextFollowUp,
	};
}

export async function listContacts(req: ApiRequest, repos: Repos) {
	const me = await currentUser(req, repos);
	const list = (await repos.contacts.list()).filter((c) => canSee(me, c));
	return ok(list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}

export async function getContact(req: ApiRequest, repos: Repos, params: { id: string }) {
	const { contact } = await loadVisible(req, repos, params.id);
	return ok(contact);
}

export async function createContact(req: ApiRequest, repos: Repos) {
	const me = await currentUser(req, repos);
	await requireAction(repos, me, "contacts.create");
	const input = await readContact(repos, me, objectBody(req));
	const now = new Date().toISOString();
	const contact: Contact = { id: newId("ct"), ...input, lastContactAt: null, interactions: [], createdBy: me.id, createdAt: now, updatedAt: now };
	return created(await repos.contacts.insert(contact));
}

export async function updateContact(req: ApiRequest, repos: Repos, params: { id: string }) {
	const { me, contact } = await loadVisible(req, repos, params.id);
	const input = await readContact(repos, me, objectBody(req), contact);
	const updated: Contact = { ...contact, ...input, updatedAt: new Date().toISOString() };
	if (input.ownerId !== contact.ownerId) {
		updated.interactions = [...contact.interactions, transferEntry(me, input.ownerId, "")];
	}
	return ok(await repos.contacts.update(contact.id, updated));
}

export async function deleteContact(req: ApiRequest, repos: Repos, params: { id: string }) {
	const { me, contact } = await loadVisible(req, repos, params.id);
	if (!isAdmin(me) && contact.createdBy !== me.id) forbidden("Only administrators or whoever added the lead can delete it.");
	await requireAction(repos, me, "contacts.delete");
	await repos.contacts.remove(contact.id);
	return noContent();
}

/** Logs a call, email, meeting... and optionally plans the next follow-up. */
export async function logInteraction(req: ApiRequest, repos: Repos, params: { id: string }) {
	const { me, contact } = await loadVisible(req, repos, params.id);
	const body = objectBody(req);
	const kind = str(body.kind) as Interaction["kind"];
	if (!INTERACTION_KINDS.some((k) => k.id === kind)) badRequest("Pick what kind of contact it was.");
	const note = str(body.note).trim().slice(0, 4000);
	if (!note) badRequest("Write what was talked about.", { note: "Write what was talked about." });
	const next = "nextFollowUp" in body ? str(body.nextFollowUp) || null : contact.nextFollowUp;
	if (next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) badRequest("Pick a date.", { nextFollowUp: "Pick a date." });
	const now = new Date().toISOString();
	const entry: Interaction = { id: newId("in"), at: now, userId: me.id, kind, note };
	// Anything but a plain note counts as having talked to the lead.
	const updated: Contact = {
		...contact,
		interactions: [...contact.interactions, entry],
		lastContactAt: kind === "note" ? contact.lastContactAt : now,
		nextFollowUp: next,
		stageId: str(body.stageId) && (await stages(repos)).some((s) => s.id === str(body.stageId)) ? str(body.stageId) : contact.stageId,
		updatedAt: now,
	};
	const saved = await repos.contacts.update(contact.id, updated);
	// Logged from a deal's ticket: the ticket's history shows it too.
	const ticketId = str(body.ticketId);
	if (ticketId) {
		const ticket = (await visibleTickets(repos, me)).find((t) => t.id === ticketId);
		if (ticket) {
			const list = await stages(repos);
			const moved = updated.stageId !== contact.stageId ? ` · lead moved to ${list.find((x) => x.id === updated.stageId)?.label ?? updated.stageId}` : "";
			const label = INTERACTION_KINDS.find((k) => k.id === kind)?.label ?? kind;
			await logTicketComment(repos, me.id, ticket, `${kind === "note" ? "Note on the lead" : `${label} with ${contact.name}`}${moved}: ${note}`);
		}
	}
	return created(saved);
}

function transferEntry(me: User, to: string | null, message: string): Interaction {
	return { id: newId("in"), at: new Date().toISOString(), userId: me.id, kind: "transfer", note: message, toOwnerId: to };
}

/**
 * Moves leads to another person's portfolio, with a note for them (like
 * forwarding an email). Owners can pass on their own leads; admins any.
 */
export async function transferContacts(req: ApiRequest, repos: Repos) {
	const me = await currentUser(req, repos);
	const body = objectBody(req);
	const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 500) : [];
	if (!ids.length) badRequest("Pick at least one lead.");
	const to = str(body.to) || null;
	if (!to && !isAdmin(me)) badRequest("Pick who takes the leads.", { to: "Pick who takes the leads." });
	if (!(await activeUser(repos, to))) badRequest("Pick an active team member.", { to: "Pick an active team member." });
	const message = str(body.message).trim().slice(0, 2000);
	const moved: Contact[] = [];
	for (const id of ids) {
		const c = await repos.contacts.get(id);
		if (!c || !canSee(me, c)) continue;
		if (c.ownerId === to) continue;
		const updated: Contact = { ...c, ownerId: to, interactions: [...c.interactions, transferEntry(me, to, message)], updatedAt: new Date().toISOString() };
		await repos.contacts.update(c.id, updated);
		moved.push(updated);
	}
	if (!moved.length) conflict("Those leads are already in that portfolio.");
	return ok({ moved: moved.length });
}

/** Changes the stage of several leads at once. */
export async function bulkStage(req: ApiRequest, repos: Repos) {
	const me = await currentUser(req, repos);
	const body = objectBody(req);
	const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 500) : [];
	const stageId = str(body.stageId);
	if (!(await stages(repos)).some((s) => s.id === stageId)) badRequest("Pick a stage.");
	let changed = 0;
	for (const id of ids) {
		const c = await repos.contacts.get(id);
		if (!c || !canSee(me, c) || c.stageId === stageId) continue;
		await repos.contacts.update(c.id, { ...c, stageId, updatedAt: new Date().toISOString() });
		changed++;
	}
	return ok({ changed });
}
