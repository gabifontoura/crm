import { type Dashboard, type DashboardAudience, RANGES, sanitizeWidget, sharedWith } from "../../shared/dashboards.js";
import { USER_ROLES, type User, type UserRole } from "../../shared/users.js";
import { badRequest, created, forbidden, noContent, notFound, objectBody, ok, str, type ApiRequest } from "../lib/http.js";
import { currentUser } from "../lib/session.js";
import { requireAction } from "../lib/access.js";
import type { Repos } from "../repos/types.js";

/**
 * Dashboards: everyone builds their own; shared ones are visible to the whole
 * team. Only the owner (or an admin) changes or deletes one. The numbers are
 * computed in the browser from each viewer's own data.
 */

const newId = () => `db-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const canSee = (me: User, d: Dashboard) => sharedWith(d, me);

/** The accesses and people it's shared with: known roles and existing people only. */
async function readAudience(repos: Repos, raw: unknown, current?: DashboardAudience): Promise<DashboardAudience> {
	if (!raw || typeof raw !== "object") return current ?? { roles: [], users: [] };
	const v = raw as Record<string, unknown>;
	const roles = (Array.isArray(v.roles) ? v.roles : []).filter((r): r is UserRole => USER_ROLES.some((x) => x.id === r && x.id !== "admin"));
	const ids = new Set((await repos.users.list()).map((u) => u.id));
	const users = (Array.isArray(v.users) ? v.users : []).map(String).filter((id) => ids.has(id));
	return { roles: [...new Set(roles)], users: [...new Set(users)].slice(0, 100) };
}
const canEdit = (me: User, d: Dashboard) => d.ownerId === me.id || me.role === "admin";

function read(body: Record<string, unknown>, current?: Dashboard) {
	const name = str(body.name, current?.name).trim().slice(0, 80);
	if (!name) badRequest("Give the dashboard a name.", { name: "Give the dashboard a name." });
	const widgets = Array.isArray(body.widgets) ? body.widgets.slice(0, 40).map(sanitizeWidget) : (current?.widgets ?? []);
	const range = RANGES.some((r) => r.id === body.range) ? (body.range as Dashboard["range"]) : (current?.range ?? "90d");
	return {
		name,
		description: str(body.description, current?.description).trim().slice(0, 300),
		shared: typeof body.shared === "boolean" ? body.shared : (current?.shared ?? false),
		range,
		widgets,
	};
}

export async function listDashboards(req: ApiRequest, repos: Repos) {
	const me = await currentUser(req, repos);
	const list = (await repos.dashboards.list()).filter((d) => canSee(me, d));
	return ok(list.sort((a, b) => Number(b.ownerId === me.id) - Number(a.ownerId === me.id) || a.name.localeCompare(b.name)));
}

export async function createDashboard(req: ApiRequest, repos: Repos) {
	const me = await currentUser(req, repos);
	await requireAction(repos, me, "dashboards.edit");
	const now = new Date().toISOString();
	const body = objectBody(req);
	const d: Dashboard = { id: newId(), ownerId: me.id, ...read(body), shareWith: await readAudience(repos, body.shareWith), createdAt: now, updatedAt: now };
	return created(await repos.dashboards.insert(d));
}

export async function updateDashboard(req: ApiRequest, repos: Repos, params: { id: string }) {
	const me = await currentUser(req, repos);
	const existing = await repos.dashboards.get(params.id);
	if (!existing || !canSee(me, existing)) notFound("Dashboard");
	if (!canEdit(me, existing)) forbidden("Only its owner or an administrator can change this dashboard. Duplicate it to make your own.");
	await requireAction(repos, me, "dashboards.edit");
	const body = objectBody(req);
	const d: Dashboard = { ...existing, ...read(body, existing), shareWith: await readAudience(repos, body.shareWith, existing.shareWith), updatedAt: new Date().toISOString() };
	return ok(await repos.dashboards.update(existing.id, d));
}

export async function deleteDashboard(req: ApiRequest, repos: Repos, params: { id: string }) {
	const me = await currentUser(req, repos);
	const existing = await repos.dashboards.get(params.id);
	if (!existing || !canSee(me, existing)) notFound("Dashboard");
	if (!canEdit(me, existing)) forbidden("Only its owner or an administrator can delete this dashboard.");
	await requireAction(repos, me, "dashboards.edit");
	await repos.dashboards.remove(existing.id);
	return noContent();
}
