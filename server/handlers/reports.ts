import { type Report, sanitizeReportBody } from "../../shared/reports.js";
import type { User } from "../../shared/users.js";
import { badRequest, created, forbidden, noContent, notFound, objectBody, ok, type ApiRequest } from "../lib/http.js";
import { currentUser } from "../lib/session.js";
import type { Repos } from "../repos/types.js";

/**
 * Saved reports: everyone builds their own; shared ones are visible to the
 * team. Only the owner (or an admin) changes or deletes one. Rows are built
 * in the browser from each viewer's own data.
 */

const newId = () => `rp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const canSee = (me: User, r: Report) => r.shared || r.ownerId === me.id || me.role === "admin";
const canEdit = (me: User, r: Report) => r.ownerId === me.id || me.role === "admin";

function read(body: Record<string, unknown>, current?: Report) {
	const input = sanitizeReportBody(body, current);
	if (!input.name) badRequest("Give the report a name.", { name: "Give the report a name." });
	if (!input.columns.length) badRequest("Pick at least one column.", { columns: "Pick at least one column." });
	return input;
}

export async function listReports(req: ApiRequest, repos: Repos) {
	const me = await currentUser(req, repos);
	const list = (await repos.reports.list()).filter((r) => canSee(me, r));
	return ok(list.sort((a, b) => Number(b.ownerId === me.id) - Number(a.ownerId === me.id) || a.name.localeCompare(b.name)));
}

export async function createReport(req: ApiRequest, repos: Repos) {
	const me = await currentUser(req, repos);
	const now = new Date().toISOString();
	const r: Report = { id: newId(), ownerId: me.id, ...read(objectBody(req)), createdAt: now, updatedAt: now };
	return created(await repos.reports.insert(r));
}

export async function updateReport(req: ApiRequest, repos: Repos, params: { id: string }) {
	const me = await currentUser(req, repos);
	const existing = await repos.reports.get(params.id);
	if (!existing || !canSee(me, existing)) notFound("Report");
	if (!canEdit(me, existing)) forbidden("Only its owner or an administrator can change this report. Save a copy to make your own.");
	const r: Report = { ...existing, ...read(objectBody(req), existing), updatedAt: new Date().toISOString() };
	return ok(await repos.reports.update(existing.id, r));
}

export async function deleteReport(req: ApiRequest, repos: Repos, params: { id: string }) {
	const me = await currentUser(req, repos);
	const existing = await repos.reports.get(params.id);
	if (!existing || !canSee(me, existing)) notFound("Report");
	if (!canEdit(me, existing)) forbidden("Only its owner or an administrator can delete this report.");
	await repos.reports.remove(existing.id);
	return noContent();
}
