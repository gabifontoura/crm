import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleRequest } from "../server/router.js";

/**
 * Single Vercel serverless function for the whole API (the Hobby plan allows
 * 12 functions; one router keeps us far from that). `vercel.json` rewrites
 * every `/api/*` path here and passes the original path in `__route`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
	const url = new URL(req.url ?? "/api", "http://localhost");
	const rewritten = url.searchParams.get("__route");
	url.searchParams.delete("__route");
	const path = rewritten ? `/api/${rewritten}` : url.pathname;

	const headers: Record<string, string | undefined> = {};
	for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;

	const result = await handleRequest({
		method: (req.method ?? "GET").toUpperCase(),
		path,
		query: Object.fromEntries(url.searchParams),
		headers,
		body: req.body,
	});

	res.setHeader("Cache-Control", "no-store");
	if (result.body === undefined) res.status(result.status).end();
	else res.status(result.status).json(result.body);
}
