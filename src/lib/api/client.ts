/**
 * JSON client for the CRM API (`/api/*`). Sends the signed-in user's id in
 * `x-user-id` (demo sign-in, see `lib/auth/session.tsx`). Uses
 * `window.__API_BASE__` as the base URL when set, otherwise the current host.
 */

const LS_SESSION = "crm.sessionUserId.v1";

export function sessionUserId(): string | null {
	try {
		return localStorage.getItem(LS_SESSION);
	} catch {
		return null;
	}
}

export function setSessionUserId(id: string | null) {
	try {
		if (id) localStorage.setItem(LS_SESSION, id);
		else localStorage.removeItem(LS_SESSION);
	} catch {
		/* storage unavailable: session lasts until reload */
	}
}

/** Headers every API call should send (also used by the What's New page). */
export function authHeaders(): Record<string, string> {
	const id = sessionUserId();
	return id ? { "x-user-id": id } : {};
}

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
		/** Field -> message, when the server rejected the input. */
		public fields: Record<string, string> = {},
	) {
		super(message);
	}
}

function baseUrl(): string {
	return window.__API_BASE__ ?? "";
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
	let response: Response;
	try {
		response = await fetch(`${baseUrl()}${path}`, {
			method,
			headers: {
				...authHeaders(),
				...(body === undefined ? {} : { "Content-Type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	} catch {
		throw new ApiError(0, "Can't reach the server. Check your connection.");
	}
	if (response.status === 204) return undefined as T;
	const data = await response.json().catch(() => null);
	if (!response.ok) {
		const fields = data?.details && typeof data.details === "object" ? (data.details as Record<string, string>) : {};
		throw new ApiError(response.status, data?.error ?? `Request failed (${response.status}).`, fields);
	}
	return data as T;
}

export const apiClient = {
	get: <T>(path: string) => request<T>("GET", path),
	post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
	put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
	delete: (path: string) => request<void>("DELETE", path),
};

/** Human message for any thrown value (for toasts). */
export function errorMessage(error: unknown): string {
	if (error instanceof ApiError) {
		const first = Object.values(error.fields)[0];
		return first ? `${error.message} ${first}` : error.message;
	}
	return error instanceof Error ? error.message : "Something went wrong.";
}
