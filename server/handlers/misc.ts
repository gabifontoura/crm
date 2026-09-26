import type { ReleaseRecord } from "../../shared/releases.js";
import { badRequest, forbidden, notFound, objectBody, ok, str, type ApiRequest } from "../lib/http.js";
import { demoCap, isDemo, resetDemo } from "../lib/demo.js";
import { currentUser, requireAdmin } from "../lib/session.js";
import type { Repos } from "../repos/types.js";
import { ensureSeeded } from "../repos/index.js";

/* ------------------------------- Health --------------------------------- */

/**
 * Is the API up, and can it use its database? Each step reports its own
 * error (e.g. a missing table or a wrong key) — never the keys themselves.
 */
export async function health(_req: ApiRequest, repos: Repos) {
	const base = { storage: repos.kind, persistent: repos.persistent, demo: isDemo(), time: new Date().toISOString() };
	const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
	try {
		await repos.settings.get("seed_version");
	} catch (e) {
		return {
			status: 503,
			body: { ok: false, ...base, database: message(e), hint: "Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and that supabase/setup.sql was run in the SQL Editor." },
		};
	}
	try {
		await ensureSeeded(repos);
	} catch (e) {
		return { status: 503, body: { ok: false, ...base, database: "ok", seed: message(e), hint: "The tables are there but the demo data couldn't be written: run the latest supabase/setup.sql again." } };
	}
	return ok({ ok: true, ...base, database: "ok", seed: "ok" });
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
	await demoCap(repos, "releases");
	const nextId = (await repos.releases.list()).reduce((max, r) => Math.max(max, r.id), 0) + 1;
	await repos.releases.insert({ id: nextId, ...fields });
	return ok({ success: true, id: nextId, msg: "Release note created!" });
}

/* --------------------------------- Demo --------------------------------- */

/**
 * Back to the demo data (DEMO_MODE only): daily from Vercel Cron (with
 * CRON_SECRET) or by an administrator.
 */
export async function resetDemoNow(req: ApiRequest, repos: Repos) {
	if (!isDemo()) forbidden("The reset only exists in demo mode (DEMO_MODE=true).");
	const secret = process.env.CRON_SECRET;
	if (!(secret && String(req.headers.authorization ?? "") === `Bearer ${secret}`)) {
		const me = await currentUser(req, repos);
		if (me.role !== "admin") forbidden("Only administrators reset the demo.");
	}
	return ok(await resetDemo(repos));
}
