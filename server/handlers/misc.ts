import type { ReleaseRecord } from "../../shared/releases.js";
import { badRequest, notFound, objectBody, ok, str, type ApiRequest } from "../lib/http.js";
import { currentUser, requireAdmin } from "../lib/session.js";
import type { Repos } from "../repos/types.js";

/* ------------------------------- Health --------------------------------- */

export async function health(_req: ApiRequest, repos: Repos) {
	return ok({ ok: true, storage: repos.kind, persistent: repos.persistent, time: new Date().toISOString() });
}

/* ------------------------------ Settings -------------------------------- */

const SETTINGS_KEYS = ["calendar", "contactStages", "billingCadence", "menuAccess", "listViews"];
const MAX_SETTINGS_BYTES = 200_000;

/** Shared app settings, e.g. the calendar colors, card fields and tags. */
export async function getSettings(req: ApiRequest, repos: Repos, params: { key: string }) {
	await currentUser(req, repos);
	if (!SETTINGS_KEYS.includes(params.key)) notFound("Setting");
	return ok({ key: params.key, value: await repos.settings.get(`settings.${params.key}`) });
}

/** Only administrators change settings (colors, card content, tags). */
export async function putSettings(req: ApiRequest, repos: Repos, params: { key: string }) {
	requireAdmin(await currentUser(req, repos));
	if (!SETTINGS_KEYS.includes(params.key)) notFound("Setting");
	const body = objectBody(req);
	const value = body.value;
	if (!value || typeof value !== "object" || Array.isArray(value)) badRequest("Expected { value: object }.");
	if (JSON.stringify(value).length > MAX_SETTINGS_BYTES) badRequest("Settings are too large.");
	await repos.settings.set(`settings.${params.key}`, value);
	return ok({ key: params.key, value });
}

/* ------------------------------- Releases ------------------------------- */

/**
 * What's New release notes (`/api/releases`):
 *   GET  -> Release[], newest first
 *   POST -> create (no id) or update (with id); admins only
 */
export async function getReleases(_req: ApiRequest, repos: Repos) {
	const releases = await repos.releases.list();
	return ok(releases.map((r) => ({ ...r, imagens: r.imagens ?? [] })).sort((a, b) => b.id - a.id));
}

export async function saveRelease(req: ApiRequest, repos: Repos) {
	requireAdmin(await currentUser(req, repos));
	const body = objectBody(req);
	const errors: Record<string, string> = {};
	if (!str(body.titulo).trim()) errors.titulo = "Title is required.";
	if (!str(body.descricao).trim()) errors.descricao = "Description is required.";
	if (!["Novidade", "Melhoria", "Correção"].includes(str(body.tipo))) errors.tipo = "Unknown type.";
	if (Object.keys(errors).length) return { status: 400, body: { success: false, msg: Object.values(errors)[0], errors } };

	const fields: Omit<ReleaseRecord, "id"> = {
		titulo: str(body.titulo).trim(),
		descricao: str(body.descricao).trim(),
		oQueMuda: str(body.oQueMuda),
		passoAPasso: Array.isArray(body.passoAPasso) ? body.passoAPasso.map(String) : [],
		videoEad: str(body.videoEad) || undefined,
		imagens: Array.isArray(body.imagens) ? body.imagens.map(String) : [],
		data: str(body.data),
		hora: str(body.hora),
		usuario: str(body.usuario),
		tipo: str(body.tipo) as ReleaseRecord["tipo"],
		produto: str(body.produto).trim(),
	};

	if (typeof body.id === "number") {
		const existing = await repos.releases.get(body.id);
		if (!existing) return { status: 404, body: { success: false, msg: "Release note not found." } };
		await repos.releases.update(body.id, { ...existing, ...fields, id: body.id });
		return ok({ success: true, msg: "Release note updated!" });
	}
	const nextId = (await repos.releases.list()).reduce((max, r) => Math.max(max, r.id), 0) + 1;
	await repos.releases.insert({ id: nextId, ...fields });
	return ok({ success: true, id: nextId, msg: "Release note created!" });
}
