import { menuAccessFrom } from "../../shared/access.js";
import { type User, type UserInput, USER_ROLES, validateUserInput } from "../../shared/users.js";
import { badRequest, bool, conflict, created, noContent, notFound, objectBody, ok, str, type ApiRequest } from "../lib/http.js";
import { currentUser, requireAdmin } from "../lib/session.js";
import type { Repos } from "../repos/types.js";
import { demoCap, protectDemoUser } from "../lib/demo.js";

function readInput(body: Record<string, unknown>, current?: User): UserInput {
	const role = str(body.role, current?.role ?? "technician");
	return {
		name: str(body.name, current?.name).trim(),
		email: str(body.email, current?.email).trim().toLowerCase(),
		phone: str(body.phone, current?.phone).trim(),
		jobTitle: str(body.jobTitle, current?.jobTitle).trim(),
		trade: str(body.trade, current?.trade).trim(),
		role: (USER_ROLES.some((r) => r.id === role) ? role : "__invalid__") as User["role"],
		active: bool(body.active, current?.active ?? true),
		accessId: "accessId" in body ? str(body.accessId) || null : (current?.accessId ?? null),
	};
}

/**
 * An access profile (Settings > Access) sets the person's role to the one it
 * works like; administrators have none. An unknown profile is an error.
 */
async function applyAccess(repos: Repos, input: UserInput): Promise<UserInput> {
	if (input.role === "admin" || !input.accessId) return { ...input, accessId: null };
	const access = menuAccessFrom(await repos.settings.get("settings.menuAccess"));
	const profile = access.profiles.find((p) => p.id === input.accessId);
	if (!profile) badRequest("Please fix the highlighted fields.", { role: "This access doesn't exist anymore. Pick another one." });
	// The built-in ones are the role itself: no need to point at them.
	return { ...input, role: profile.base, accessId: profile.builtIn ? null : profile.id };
}

async function assertUniqueEmail(repos: Repos, email: string, exceptId?: string) {
	const all = await repos.users.list();
	if (all.some((u) => u.email.toLowerCase() === email && u.id !== exceptId)) {
		conflict("Another team member already uses this email.");
	}
}

/** GET is open so the "Sign in as" picker can list people; changes need an admin. */
export async function listUsers(_req: ApiRequest, repos: Repos) {
	const users = await repos.users.list();
	return ok(users.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)));
}

export async function getMe(req: ApiRequest, repos: Repos) {
	return ok(await currentUser(req, repos));
}

export async function createUser(req: ApiRequest, repos: Repos) {
	await demoCap(repos, "users");
	requireAdmin(await currentUser(req, repos));
	const input = await applyAccess(repos, readInput(objectBody(req)));
	const errors = validateUserInput(input);
	if (Object.keys(errors).length) badRequest("Please fix the highlighted fields.", errors);
	await assertUniqueEmail(repos, input.email);
	const now = new Date().toISOString();
	const user: User = { id: `U-${Date.now().toString(36)}`, ...input, createdAt: now, updatedAt: now };
	return created(await repos.users.insert(user));
}

export async function updateUser(req: ApiRequest, repos: Repos, params: { id: string }) {
	const me = await currentUser(req, repos);
	requireAdmin(me);
	const existing = await repos.users.get(params.id);
	if (!existing) notFound("Team member");
	const input = await applyAccess(repos, readInput(objectBody(req), existing));
	// In the demo, the people you sign in as keep their access (so nobody locks the demo).
	if (existing.active && !input.active) protectDemoUser(existing.id, "deactivate");
	if (input.role !== existing.role || (input.accessId ?? null) !== (existing.accessId ?? null)) protectDemoUser(existing.id, "change access");
	const errors = validateUserInput(input);
	if (Object.keys(errors).length) badRequest("Please fix the highlighted fields.", errors);
	await assertUniqueEmail(repos, input.email, existing.id);
	// Keep at least one active admin, or nobody could manage the team anymore.
	if (existing.role === "admin" && (input.role !== "admin" || !input.active)) {
		const admins = (await repos.users.list()).filter((u) => u.role === "admin" && u.active && u.id !== existing.id);
		if (admins.length === 0) conflict("There must be at least one active administrator.");
	}
	const user: User = { ...existing, ...input, updatedAt: new Date().toISOString() };
	return ok(await repos.users.update(existing.id, user));
}

export async function deleteUser(req: ApiRequest, repos: Repos, params: { id: string }) {
	const me = await currentUser(req, repos);
	requireAdmin(me);
	if (me.id === params.id) conflict("You can't delete yourself.");
	protectDemoUser(params.id, "delete");
	const existing = await repos.users.get(params.id);
	if (!existing) notFound("Team member");
	const assigned = (await repos.events.list()).filter((e) => e.ownerId === existing.id).length;
	if (assigned > 0) {
		conflict(`${existing.name} owns ${assigned} appointment${assigned === 1 ? "" : "s"}. Deactivate instead, or reassign them first.`);
	}
	// Ticket history must keep pointing at real people.
	const inTickets =
		(await repos.tickets.list()).some((t) => t.assigneeId === existing.id || t.reporterId === existing.id) ||
		(await repos.ticketActivity.list()).some((a) => a.userId === existing.id);
	if (inTickets) conflict(`${existing.name} appears in ticket history. Deactivate instead.`);
	await repos.users.remove(existing.id);
	return noContent();
}
