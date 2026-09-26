/** Framework-free request/response types shared by the Vercel function and the Vite dev server. */

export interface ApiRequest {
	method: string;
	/** Path without query string, e.g. "/api/users/2547". */
	path: string;
	query: Record<string, string>;
	headers: Record<string, string | undefined>;
	body: unknown;
}

export interface ApiResponse {
	status: number;
	body?: unknown;
}

export class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
		public details?: unknown,
	) {
		super(message);
	}
}

export const ok = (body: unknown): ApiResponse => ({ status: 200, body });
export const created = (body: unknown): ApiResponse => ({ status: 201, body });
export const noContent = (): ApiResponse => ({ status: 204 });

export function badRequest(message: string, details?: unknown): never {
	throw new HttpError(400, message, details);
}
export function notFound(what = "Resource"): never {
	throw new HttpError(404, `${what} not found.`);
}
export function forbidden(message = "You don't have permission to do this."): never {
	throw new HttpError(403, message);
}
export function conflict(message: string): never {
	throw new HttpError(409, message);
}

/** Body as a plain object, or a 400 if it isn't one. */
export function objectBody(req: ApiRequest): Record<string, unknown> {
	const body = typeof req.body === "string" && req.body ? safeJson(req.body) : req.body;
	if (!body || typeof body !== "object" || Array.isArray(body)) badRequest("Expected a JSON object body.");
	return body as Record<string, unknown>;
}

function safeJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return badRequest("Body is not valid JSON.");
	}
}

export const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
export const bool = (v: unknown, fallback = false): boolean => (typeof v === "boolean" ? v : fallback);
export const num = (v: unknown, fallback = 0): number =>
	typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : fallback;
