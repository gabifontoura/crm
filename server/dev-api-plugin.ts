import type { IncomingMessage } from "node:http";
import { loadEnv, type Plugin } from "vite";

/**
 * Serves the API inside `npm run dev`, running the same router as the Vercel
 * function. The router is loaded through Vite on every request, so edits to
 * files in /server and /shared apply without restarting.
 */

const MAX_BODY_BYTES = 8 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
			if (body.length > MAX_BODY_BYTES) {
				reject(new Error("Body too large"));
				req.destroy();
			}
		});
		req.on("end", () => resolve(body));
		req.on("error", reject);
	});
}

export function devApiPlugin(): Plugin {
	return {
		name: "crm-dev-api",
		configureServer(server) {
			// Expose .env / .env.local values (SUPABASE_URL, ...) to the server code.
			Object.assign(process.env, loadEnv(server.config.mode, server.config.root, ""));

			server.middlewares.use(async (req, res, next) => {
				if (!req.url?.startsWith("/api/")) return next();
				try {
					const url = new URL(req.url, "http://localhost");
					const raw = req.method === "GET" || req.method === "HEAD" ? "" : await readBody(req);
					const { handleRequest } = (await server.ssrLoadModule("/server/router.ts")) as typeof import("./router");
					const headers: Record<string, string | undefined> = {};
					for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
					let body: unknown = raw;
					if (raw) {
						try {
							body = JSON.parse(raw);
						} catch {
							/* the router answers 400 for non-JSON bodies */
						}
					}
					const result = await handleRequest({
						method: (req.method ?? "GET").toUpperCase(),
						path: url.pathname,
						query: Object.fromEntries(url.searchParams),
						headers,
						body,
					});
					res.statusCode = result.status;
					res.setHeader("Cache-Control", "no-store");
					if (result.body === undefined) return res.end();
					res.setHeader("Content-Type", "application/json; charset=utf-8");
					res.end(JSON.stringify(result.body));
				} catch (error) {
					server.config.logger.error(`[api] ${String(error)}`);
					res.statusCode = 500;
					res.end(JSON.stringify({ error: "Dev API crashed. See the terminal." }));
				}
			});
		},
	};
}
