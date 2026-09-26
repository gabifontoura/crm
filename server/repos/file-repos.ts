import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Collection, KeyValue, Repos } from "./types.js";

/**
 * JSON-file storage for local development (and a non-persistent fallback on
 * Vercel). One file per collection, holding an { id: doc } map.
 */

function dataDir(): string {
	if (process.env.DATA_DIR) return process.env.DATA_DIR;
	// Vercel functions can only write to /tmp, which is wiped between cold starts.
	return process.env.VERCEL ? "/tmp/crm-data" : path.join(process.cwd(), ".data");
}

// Serializes writes per file so concurrent requests don't overwrite each other.
const queues = new Map<string, Promise<unknown>>();
function serialized<T>(file: string, task: () => Promise<T>): Promise<T> {
	const prev = queues.get(file) ?? Promise.resolve();
	const next = prev.then(task, task);
	queues.set(file, next.catch(() => undefined));
	return next;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const code = (e: unknown) => (e as NodeJS.ErrnoException)?.code;

/**
 * Windows (and folders synced by OneDrive or antivirus) briefly lock files
 * being replaced; retry those moments instead of failing the request.
 */
async function withRetry<T>(task: () => Promise<T>, retryable: (e: unknown) => boolean): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await task();
		} catch (e) {
			if (attempt >= 8 || !retryable(e)) throw e;
			await sleep(25 * (attempt + 1));
		}
	}
}

async function readMap<T>(file: string): Promise<Record<string, T>> {
	try {
		// A locked file or a half-read one (bad JSON) is retried; it must never read as empty,
		// or the next write would wipe the collection.
		return await withRetry(async () => JSON.parse(await readFile(file, "utf-8")) as Record<string, T>, (e) => code(e) !== "ENOENT");
	} catch (e) {
		if (code(e) === "ENOENT") return {};
		throw e;
	}
}

async function writeMap(file: string, map: Record<string, unknown>) {
	await mkdir(path.dirname(file), { recursive: true });
	const tmp = `${file}.tmp`;
	await writeFile(tmp, JSON.stringify(map, null, 2), "utf-8");
	await withRetry(() => rename(tmp, file), (e) => ["EPERM", "EBUSY", "EACCES"].includes(code(e) ?? ""));
}

function fileCollection<T extends { id: string | number }>(name: string): Collection<T> {
	const file = () => path.join(dataDir(), `${name}.json`);
	const mutate = <R>(fn: (map: Record<string, T>) => R) =>
		serialized(file(), async () => {
			const map = await readMap<T>(file());
			const result = fn(map);
			await writeMap(file(), map);
			return result;
		});

	return {
		async list() {
			return Object.values(await readMap<T>(file()));
		},
		async get(id) {
			return (await readMap<T>(file()))[String(id)] ?? null;
		},
		insert(doc) {
			return mutate((map) => {
				map[String(doc.id)] = doc;
				return doc;
			});
		},
		async seed(docs) {
			await mutate((map) => {
				for (const d of docs) if (!(String(d.id) in map)) map[String(d.id)] = d;
			});
		},
		update(id, doc) {
			return mutate((map) => {
				if (!(String(id) in map)) return null;
				map[String(id)] = doc;
				return doc;
			});
		},
		remove(id) {
			return mutate((map) => {
				const existed = String(id) in map;
				delete map[String(id)];
				return existed;
			});
		},
	};
}

function fileKeyValue(): KeyValue {
	const file = () => path.join(dataDir(), "settings.json");
	return {
		async get<T>(key: string) {
			return ((await readMap<unknown>(file()))[key] as T) ?? null;
		},
		async set(key, value) {
			await serialized(file(), async () => {
				const map = await readMap<unknown>(file());
				map[key] = value;
				await writeMap(file(), map);
			});
		},
	};
}

export function createFileRepos(): Repos {
	return {
		kind: "file",
		persistent: !process.env.VERCEL || Boolean(process.env.DATA_DIR),
		users: fileCollection("users"),
		clients: fileCollection("clients"),
		developments: fileCollection("developments"),
		blocks: fileCollection("blocks"),
		units: fileCollection("units"),
		events: fileCollection("calendar_events"),
		releases: fileCollection("releases"),
		workflows: fileCollection("workflows"),
		ticketTypes: fileCollection("ticket_types"),
		tickets: fileCollection("tickets"),
		ticketActivity: fileCollection("ticket_activity"),
		contacts: fileCollection("contacts"),
		dashboards: fileCollection("dashboards"),
		reports: fileCollection("reports"),
		billing: fileCollection("billing"),
		settings: fileKeyValue(),
	};
}
