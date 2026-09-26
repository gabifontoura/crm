import {
	type Block,
	type Client,
	CONSTRUCTION_STAGES,
	typePhotos,
	type DevelopmentPhoto,
	PHOTO_KINDS,
	type UnitType,
	DEVELOPMENT_KINDS,
	DEVELOPMENT_STATUSES,
	type Development,
	type DevelopmentTree,
	UNIT_STATUSES,
	type Unit,
} from "../../shared/developments.js";
import {
	badRequest,
	created,
	noContent,
	notFound,
	num,
	objectBody,
	ok,
	str,
	type ApiRequest,
} from "../lib/http.js";
import { currentUser, requireAdmin } from "../lib/session.js";
import type { Repos } from "../repos/types.js";
import { demoCap } from "../lib/demo.js";

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function byNumber(a: Unit, b: Unit) {
	return a.floor - b.floor || a.number.localeCompare(b.number, "en", { numeric: true });
}

/** Developments with their client, blocks and units in one payload. */
async function loadTrees(repos: Repos): Promise<DevelopmentTree[]> {
	const [developments, clients, blocks, units] = await Promise.all([
		repos.developments.list(),
		repos.clients.list(),
		repos.blocks.list(),
		repos.units.list(),
	]);
	const clientById = new Map(clients.map((c) => [c.id, c]));
	return developments
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((d) => ({
			...d,
			client: clientById.has(d.clientId) ? { id: d.clientId, name: clientById.get(d.clientId)!.name } : null,
			blocks: blocks
				.filter((b) => b.developmentId === d.id)
				.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
				.map((b) => ({ ...b, units: units.filter((u) => u.blockId === b.id).sort(byNumber) })),
		}));
}

/* ------------------------------- Clients -------------------------------- */

export async function listClients(req: ApiRequest, repos: Repos) {
	await currentUser(req, repos);
	return ok((await repos.clients.list()).sort((a, b) => a.name.localeCompare(b.name)));
}

export async function createClient(req: ApiRequest, repos: Repos) {
	await demoCap(repos, "clients");
	requireAdmin(await currentUser(req, repos));
	const body = objectBody(req);
	const name = str(body.name).trim();
	if (!name) badRequest("Please fix the highlighted fields.", { name: "Client name is required." });
	const client: Client = {
		id: newId("C"),
		name,
		contactName: str(body.contactName).trim(),
		email: str(body.email).trim(),
		phone: str(body.phone).trim(),
	};
	return created(await repos.clients.insert(client));
}

/* ----------------------------- Developments ----------------------------- */

function readDevelopment(body: Record<string, unknown>, current?: Development): Omit<Development, "id" | "createdAt" | "updatedAt"> {
	const errors: Record<string, string> = {};
	const name = str(body.name, current?.name).trim();
	const kind = str(body.kind, current?.kind ?? "residential");
	const status = str(body.status, current?.status ?? "planning");
	const deliveryDate = str(body.deliveryDate, current?.deliveryDate).trim();
	if (!name) errors.name = "Name is required.";
	if (!DEVELOPMENT_KINDS.some((k) => k.id === kind)) errors.kind = "Unknown kind.";
	if (!DEVELOPMENT_STATUSES.some((s) => s.id === status)) errors.status = "Unknown status.";
	if (deliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) errors.deliveryDate = "Use the YYYY-MM-DD format.";
	const photos = "photos" in body ? readPhotos(body.photos, errors) : (current?.photos ?? []);
	const unitTypes = "unitTypes" in body ? readUnitTypes(body.unitTypes, errors) : (current?.unitTypes ?? []);
	// The stage of the works only means something while building.
	const building = status === "under_construction";
	const stage = building ? str(body.stage, current?.stage ?? "") : "";
	if (stage && !CONSTRUCTION_STAGES.some((s) => s.id === stage)) errors.stage = "Unknown stage.";
	const progress = building ? Math.round(num(body.progress, current?.progress ?? 0)) : null;
	if (progress !== null && (progress < 0 || progress > 100)) errors.progress = "Between 0 and 100.";
	if (Object.keys(errors).length) badRequest("Please fix the highlighted fields.", errors);
	return {
		stage: (stage || null) as Development["stage"],
		progress,
		photos,
		unitTypes,
		name,
		clientId: str(body.clientId, current?.clientId),
		kind: kind as Development["kind"],
		status: status as Development["status"],
		address: str(body.address, current?.address).trim(),
		city: str(body.city, current?.city).trim(),
		deliveryDate,
	};
}

const IMAGE_URL = /^(https:\/\/\S+|data:image\/[a-z+]+;base64,\S+)$/i;

/** Picture links (https), each with what it shows and a caption. */
function readPhotos(raw: unknown, errors: Record<string, string>): DevelopmentPhoto[] {
	const list = Array.isArray(raw) ? raw.slice(0, 40) : [];
	const out: DevelopmentPhoto[] = [];
	for (const [i, p] of list.entries()) {
		const v = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
		const url = str(v.url).trim();
		if (!IMAGE_URL.test(url)) {
			errors.photos = `Photo ${i + 1}: use an image link starting with https://.`;
			continue;
		}
		const kind = PHOTO_KINDS.some((k) => k.id === v.kind) ? (v.kind as DevelopmentPhoto["kind"]) : "photo";
		out.push({ id: str(v.id) || newId("ph"), url, caption: str(v.caption).trim().slice(0, 160), kind });
	}
	return out;
}

/** Apartment types: size, bedrooms, bathrooms, garage spots and the floor plan. */
function readUnitTypes(raw: unknown, errors: Record<string, string>): UnitType[] {
	const list = Array.isArray(raw) ? raw.slice(0, 30) : [];
	const out: UnitType[] = [];
	for (const [i, t] of list.entries()) {
		const v = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
		const name = str(v.name).trim().slice(0, 60);
		if (!name) {
			errors.unitTypes = `Type ${i + 1} needs a name.`;
			continue;
		}
		const floorPlanUrl = str(v.floorPlanUrl).trim();
		if (floorPlanUrl && !IMAGE_URL.test(floorPlanUrl)) errors.unitTypes = `${name}: the floor plan must be an https:// image link.`;
		const photoErrors: Record<string, string> = {};
		const photos = Array.isArray(v.photos) ? readPhotos(v.photos, photoErrors) : typePhotos({ photoUrl: str(v.photoUrl).trim() });
		if (photoErrors.photos) errors.unitTypes = `${name}: ${photoErrors.photos}`;
		const photoUrl = photos[0]?.url ?? "";
		const n = (x: unknown, max: number) => Math.max(0, Math.min(max, Math.round(num(x, 0))));
		out.push({
			id: str(v.id) || newId("ut"),
			name,
			areaSqft: n(v.areaSqft, 100_000),
			bedrooms: n(v.bedrooms, 20),
			bathrooms: n(v.bathrooms, 20),
			parking: n(v.parking, 20),
			floorPlanUrl,
			photoUrl,
			photos,
			description: str(v.description).trim().slice(0, 300),
		});
	}
	return out;
}

export async function listDevelopments(req: ApiRequest, repos: Repos) {
	await currentUser(req, repos);
	return ok(await loadTrees(repos));
}

export async function getDevelopment(req: ApiRequest, repos: Repos, params: { id: string }) {
	await currentUser(req, repos);
	const tree = (await loadTrees(repos)).find((d) => d.id === params.id);
	if (!tree) notFound("Development");
	return ok(tree);
}

export async function createDevelopment(req: ApiRequest, repos: Repos) {
	await demoCap(repos, "developments");
	requireAdmin(await currentUser(req, repos));
	const input = readDevelopment(objectBody(req));
	if (input.clientId && !(await repos.clients.get(input.clientId))) badRequest("Client not found.", { clientId: "Client not found." });
	const now = new Date().toISOString();
	const dev: Development = { id: newId("D"), ...input, createdAt: now, updatedAt: now };
	await repos.developments.insert(dev);
	return created({ ...dev, client: null, blocks: [] });
}

export async function updateDevelopment(req: ApiRequest, repos: Repos, params: { id: string }) {
	requireAdmin(await currentUser(req, repos));
	const existing = await repos.developments.get(params.id);
	if (!existing) notFound("Development");
	const input = readDevelopment(objectBody(req), existing);
	if (input.clientId && !(await repos.clients.get(input.clientId))) badRequest("Client not found.", { clientId: "Client not found." });
	const dev: Development = { ...existing, ...input, updatedAt: new Date().toISOString() };
	await repos.developments.update(existing.id, dev);
	// Keep the development name on its appointments in sync.
	if (dev.name !== existing.name) {
		for (const e of await repos.events.list()) {
			if (e.developmentId === dev.id) await repos.events.update(e.id, { ...e, property: dev.name });
		}
	}
	return ok(dev);
}

/** Deletes the development with its blocks and units; appointments keep their text but lose the link. */
export async function deleteDevelopment(req: ApiRequest, repos: Repos, params: { id: string }) {
	requireAdmin(await currentUser(req, repos));
	const existing = await repos.developments.get(params.id);
	if (!existing) notFound("Development");
	const blocks = (await repos.blocks.list()).filter((b) => b.developmentId === existing.id);
	await unlinkEvents(repos, (e) => e.developmentId === existing.id, "development");
	const units = await repos.units.list();
	for (const b of blocks) {
		for (const u of units.filter((x) => x.blockId === b.id)) await repos.units.remove(u.id);
		await repos.blocks.remove(b.id);
	}
	await repos.developments.remove(existing.id);
	return noContent();
}

async function unlinkEvents(
	repos: Repos,
	match: (e: Awaited<ReturnType<Repos["events"]["list"]>>[number]) => boolean,
	level: "development" | "block" | "unit",
) {
	for (const e of await repos.events.list()) {
		if (!match(e)) continue;
		const next = { ...e, unitId: undefined, location: "" } as typeof e;
		if (level !== "unit") next.blockId = undefined;
		if (level === "development") next.developmentId = undefined;
		await repos.events.update(e.id, next);
	}
}

/* -------------------------------- Blocks -------------------------------- */

export async function createBlock(req: ApiRequest, repos: Repos) {
	await demoCap(repos, "blocks");
	requireAdmin(await currentUser(req, repos));
	const body = objectBody(req);
	const developmentId = str(body.developmentId);
	const name = str(body.name).trim();
	const floors = Math.round(num(body.floors, 1));
	const unitsPerFloor = Math.round(num(body.unitsPerFloor, 0));
	const errors: Record<string, string> = {};
	if (!(await repos.developments.get(developmentId))) errors.developmentId = "Development not found.";
	if (!name) errors.name = "Name is required.";
	if (floors < 1 || floors > 200) errors.floors = "Floors must be between 1 and 200.";
	if (unitsPerFloor < 0 || unitsPerFloor > 50) errors.unitsPerFloor = "Units per floor must be between 0 and 50.";
	if (Object.keys(errors).length) badRequest("Please fix the highlighted fields.", errors);

	const photos = readPhotos(body.photos, errors);
	if (Object.keys(errors).length) badRequest("Please fix the highlighted fields.", errors);
	const block: Block = { id: newId("B"), developmentId, name, floors, photos };
	await repos.blocks.insert(block);
	// Units can follow one of the development's apartment types.
	const type = (await repos.developments.get(developmentId))?.unitTypes?.find((t) => t.id === str(body.typeId));
	const units: Unit[] = [];
	for (let floor = 1; floor <= floors && unitsPerFloor > 0; floor++) {
		for (let i = 1; i <= unitsPerFloor; i++) {
			units.push({
				id: `${block.id}-U${floor}${String(i).padStart(2, "0")}`,
				blockId: block.id,
				number: `${floor}${String(i).padStart(2, "0")}`,
				floor,
				kind: type?.name ?? str(body.unitKind, "2-bedroom"),
				areaSqft: type?.areaSqft ?? Math.round(num(body.areaSqft, 750)),
				status: "available",
				occupant: "",
				typeId: type?.id ?? null,
				bedrooms: type?.bedrooms ?? 0,
				bathrooms: type?.bathrooms ?? 0,
				parking: type?.parking ?? 0,
			});
		}
	}
	if (units.length) await repos.units.seed(units);
	return created({ ...block, units });
}

export async function updateBlock(req: ApiRequest, repos: Repos, params: { id: string }) {
	requireAdmin(await currentUser(req, repos));
	const existing = await repos.blocks.get(params.id);
	if (!existing) notFound("Block");
	const body = objectBody(req);
	const name = str(body.name, existing.name).trim();
	const floors = Math.round(num(body.floors, existing.floors));
	if (!name) badRequest("Please fix the highlighted fields.", { name: "Name is required." });
	if (floors < 1 || floors > 200) badRequest("Please fix the highlighted fields.", { floors: "Floors must be between 1 and 200." });
	const photoErrors: Record<string, string> = {};
	const photos = "photos" in body ? readPhotos(body.photos, photoErrors) : (existing.photos ?? []);
	if (Object.keys(photoErrors).length) badRequest("Please fix the highlighted fields.", photoErrors);
	const block: Block = { ...existing, name, floors, photos };
	await repos.blocks.update(existing.id, block);
	return ok(block);
}

export async function deleteBlock(req: ApiRequest, repos: Repos, params: { id: string }) {
	requireAdmin(await currentUser(req, repos));
	const existing = await repos.blocks.get(params.id);
	if (!existing) notFound("Block");
	await unlinkEvents(repos, (e) => e.blockId === existing.id, "block");
	for (const u of (await repos.units.list()).filter((x) => x.blockId === existing.id)) await repos.units.remove(u.id);
	await repos.blocks.remove(existing.id);
	return noContent();
}

/* --------------------------------- Units -------------------------------- */

function readUnit(body: Record<string, unknown>, current?: Unit): Omit<Unit, "id" | "blockId"> {
	const errors: Record<string, string> = {};
	const number = str(body.number, current?.number).trim();
	const status = str(body.status, current?.status ?? "available");
	const areaSqft = Math.round(num(body.areaSqft, current?.areaSqft ?? 0));
	if (!number) errors.number = "Unit number is required.";
	if (!UNIT_STATUSES.some((s) => s.id === status)) errors.status = "Unknown status.";
	if (areaSqft < 0) errors.areaSqft = "Area can't be negative.";
	if (Object.keys(errors).length) badRequest("Please fix the highlighted fields.", errors);
	return {
		number,
		floor: Math.round(num(body.floor, current?.floor ?? 1)),
		kind: str(body.kind, current?.kind).trim(),
		areaSqft,
		status: status as Unit["status"],
		occupant: str(body.occupant, current?.occupant).trim(),
		typeId: str(body.typeId, current?.typeId ?? "") || null,
		bedrooms: Math.max(0, Math.round(num(body.bedrooms, current?.bedrooms ?? 0))),
		bathrooms: Math.max(0, Math.round(num(body.bathrooms, current?.bathrooms ?? 0))),
		parking: Math.max(0, Math.round(num(body.parking, current?.parking ?? 0))),
	};
}

export async function createUnit(req: ApiRequest, repos: Repos) {
	await demoCap(repos, "units");
	requireAdmin(await currentUser(req, repos));
	const body = objectBody(req);
	const blockId = str(body.blockId);
	if (!(await repos.blocks.get(blockId))) badRequest("Block not found.", { blockId: "Block not found." });
	const input = readUnit(body);
	const clash = (await repos.units.list()).some((u) => u.blockId === blockId && u.number === input.number);
	if (clash) badRequest("Please fix the highlighted fields.", { number: "This block already has a unit with this number." });
	const unit: Unit = { id: newId("U"), blockId, ...input };
	return created(await repos.units.insert(unit));
}

export async function updateUnit(req: ApiRequest, repos: Repos, params: { id: string }) {
	requireAdmin(await currentUser(req, repos));
	const existing = await repos.units.get(params.id);
	if (!existing) notFound("Unit");
	const unit: Unit = { ...existing, ...readUnit(objectBody(req), existing) };
	await repos.units.update(existing.id, unit);
	return ok(unit);
}

export async function deleteUnit(req: ApiRequest, repos: Repos, params: { id: string }) {
	requireAdmin(await currentUser(req, repos));
	const existing = await repos.units.get(params.id);
	if (!existing) notFound("Unit");
	await unlinkEvents(repos, (e) => e.unitId === existing.id, "unit");
	await repos.units.remove(existing.id);
	return noContent();
}
