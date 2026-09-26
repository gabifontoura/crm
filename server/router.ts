import * as billing from "./handlers/billing.js";
import * as contacts from "./handlers/contacts.js";
import * as dashboards from "./handlers/dashboards.js";
import * as engineering from "./handlers/engineering.js";
import * as history from "./handlers/history.js";
import * as reports from "./handlers/reports.js";
import * as developments from "./handlers/developments.js";
import * as events from "./handlers/events.js";
import * as misc from "./handlers/misc.js";
import * as service from "./handlers/service.js";
import * as tickets from "./handlers/tickets.js";
import * as users from "./handlers/users.js";
import { type ApiRequest, type ApiResponse, HttpError } from "./lib/http.js";
import { ensureSeeded, getRepos } from "./repos/index.js";
import type { Repos } from "./repos/types.js";

/**
 * Every API route. The Vercel function (`api/index.ts`) and the Vite dev
 * server (`server/dev-api-plugin.ts`) both call `handleRequest`, so local
 * development and production run the same code.
 */

// biome-ignore lint/suspicious/noExplicitAny: params differ per route
type Handler = (req: ApiRequest, repos: Repos, params: any) => Promise<ApiResponse>;

const ROUTES: [method: string, pattern: string, handler: Handler][] = [
	["GET", "/api/health", misc.health],

	["GET", "/api/me", users.getMe],
	["GET", "/api/users", users.listUsers],
	["POST", "/api/users", users.createUser],
	["PUT", "/api/users/:id", users.updateUser],
	["DELETE", "/api/users/:id", users.deleteUser],

	["GET", "/api/dashboards", dashboards.listDashboards],
	["POST", "/api/dashboards", dashboards.createDashboard],
	["PUT", "/api/dashboards/:id", dashboards.updateDashboard],
	["DELETE", "/api/dashboards/:id", dashboards.deleteDashboard],

	["POST", "/api/tickets/:id/engineering/answer", engineering.answerQuestion],
	["GET", "/api/history", history.personHistory],

	// Automatic cadence messages: on demand (admin) or daily from Vercel Cron (CRON_SECRET).
	["GET", "/api/billing/automations/run", billing.runAutomationsNow],
	["POST", "/api/billing/automations/run", billing.runAutomationsNow],
	["GET", "/api/billing", billing.listBilling],
	["POST", "/api/billing", billing.createPlan],
	["DELETE", "/api/billing/:id", billing.deletePlan],
	["POST", "/api/billing/:id/installments/:installmentId/:action", billing.installmentAction],

	["GET", "/api/reports", reports.listReports],
	["POST", "/api/reports", reports.createReport],
	["PUT", "/api/reports/:id", reports.updateReport],
	["DELETE", "/api/reports/:id", reports.deleteReport],

	["GET", "/api/contacts", contacts.listContacts],
	["POST", "/api/contacts", contacts.createContact],
	["POST", "/api/contacts/transfer", contacts.transferContacts],
	["POST", "/api/contacts/stage", contacts.bulkStage],
	["GET", "/api/contacts/:id", contacts.getContact],
	["PUT", "/api/contacts/:id", contacts.updateContact],
	["DELETE", "/api/contacts/:id", contacts.deleteContact],
	["POST", "/api/contacts/:id/interactions", contacts.logInteraction],

	["GET", "/api/clients", developments.listClients],
	["POST", "/api/clients", developments.createClient],

	["GET", "/api/developments", developments.listDevelopments],
	["POST", "/api/developments", developments.createDevelopment],
	["GET", "/api/developments/:id", developments.getDevelopment],
	["PUT", "/api/developments/:id", developments.updateDevelopment],
	["DELETE", "/api/developments/:id", developments.deleteDevelopment],
	["POST", "/api/blocks", developments.createBlock],
	["PUT", "/api/blocks/:id", developments.updateBlock],
	["DELETE", "/api/blocks/:id", developments.deleteBlock],
	["POST", "/api/units", developments.createUnit],
	["PUT", "/api/units/:id", developments.updateUnit],
	["DELETE", "/api/units/:id", developments.deleteUnit],

	["GET", "/api/calendar/events", events.listEvents],
	["POST", "/api/calendar/events", events.createEvent],
	["GET", "/api/calendar/events/:id", service.getServiceJob],
	["PUT", "/api/calendar/events/:id", events.updateEvent],
	["PUT", "/api/calendar/events/:id/service", service.saveServiceReport],
	["POST", "/api/calendar/events/:id/complete", service.completeService],
	["POST", "/api/calendar/events/:id/actions/:actionId/defer", service.deferAction],
	["POST", "/api/calendar/events/:id/actions/:actionId/engineering", service.engineeringAction],
	["POST", "/api/calendar/events/:id/actions", service.addAction],
	["POST", "/api/calendar/events/:id/reschedule", service.rescheduleService],
	["DELETE", "/api/calendar/events/:id", events.deleteEvent],

	["GET", "/api/ticket-config", tickets.getTicketConfig],
	["POST", "/api/workflows", tickets.createWorkflow],
	["PUT", "/api/workflows/:id", tickets.updateWorkflow],
	["DELETE", "/api/workflows/:id", tickets.deleteWorkflow],
	["POST", "/api/ticket-types", tickets.createTicketType],
	["PUT", "/api/ticket-types/:id", tickets.updateTicketType],
	["DELETE", "/api/ticket-types/:id", tickets.deleteTicketType],
	["GET", "/api/tickets", tickets.listTickets],
	["POST", "/api/tickets", tickets.createTicket],
	["GET", "/api/tickets/by-number/:number", tickets.getTicketByNumber],
	["GET", "/api/tickets/:id", tickets.getTicket],
	["PUT", "/api/tickets/:id", tickets.updateTicket],
	["DELETE", "/api/tickets/:id", tickets.deleteTicket],
	["POST", "/api/tickets/:id/transition", tickets.transitionTicket],
	["POST", "/api/tickets/:id/comments", tickets.commentTicket],
	["POST", "/api/tickets/:id/forward", tickets.forwardTicket],
	["POST", "/api/tickets/:id/attachments", tickets.addTicketAttachment],
	["DELETE", "/api/tickets/:id/attachments/:attachmentId", tickets.deleteTicketAttachment],

	["GET", "/api/settings/:key", misc.getSettings],
	["PUT", "/api/settings/:key", misc.putSettings],

	// What's New release notes.
	["GET", "/api/releases", misc.getReleases],
	["POST", "/api/releases", misc.saveRelease],
];

function match(pattern: string, path: string): Record<string, string> | null {
	const p = pattern.split("/");
	const a = path.replace(/\/+$/, "").split("/");
	if (p.length !== a.length) return null;
	const params: Record<string, string> = {};
	for (let i = 0; i < p.length; i++) {
		if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(a[i]);
		else if (p[i] !== a[i]) return null;
	}
	return params;
}

export async function handleRequest(req: ApiRequest): Promise<ApiResponse> {
	try {
		const candidates = ROUTES.map(([method, pattern, handler]) => ({ method, handler, params: match(pattern, req.path) })).filter(
			(r) => r.params,
		);
		if (candidates.length === 0) return { status: 404, body: { error: `No route for ${req.path}` } };
		const route = candidates.find((r) => r.method === req.method);
		if (!route) return { status: 405, body: { error: `${req.method} is not allowed on ${req.path}` } };

		const repos = getRepos();
		await ensureSeeded(repos);
		return await route.handler(req, repos, route.params);
	} catch (error) {
		if (error instanceof HttpError) return { status: error.status, body: { error: error.message, details: error.details } };
		console.error("[api]", req.method, req.path, error);
		return { status: 500, body: { error: "Something went wrong on the server." } };
	}
}
