import { emptyReport, type ServiceReport } from "../../shared/service.js";
import type { Ticket } from "../../shared/tickets.js";
import type { User } from "../../shared/users.js";
import type { StoredEvent } from "../repos/types.js";

/**
 * Demo data for field service (seed v3):
 * - appointments today/tomorrow linked to open tickets (OCs) of technicians,
 *   so the technician "Tasks" screen can report back to a real ticket;
 * - finished reports on past, completed inspections and repairs.
 */

// A hand-drawn-looking signature, as an SVG data URL.
export const SIGNATURE_SVG =
	"data:image/svg+xml;base64," +
	Buffer.from(
		'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><path d="M10 70 C 40 10, 60 90, 90 50 S 140 20, 160 60 S 210 80, 230 40 L 290 55" stroke="#1A2433" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
	).toString("base64");

// A placeholder "photo" for seeded evidence.
export const PHOTO_SVG =
	"data:image/svg+xml;base64," +
	Buffer.from(
		'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#CBD5E1"/><path d="M40 200 L120 110 L180 170 L220 130 L290 200 Z" fill="#94A3B8"/><circle cx="240" cy="70" r="24" fill="#E2E8F0"/></svg>',
	).toString("base64");

/** Ticket statuses where an on-site visit makes sense, and the kind of visit. */
const VISIT_STATUSES: Record<string, "initial_inspection" | "maintenance"> = {
	visit: "initial_inspection",
	triage: "initial_inspection",
	repair: "maintenance",
	progress: "maintenance",
	open: "maintenance",
};

export function seedTicketVisits(tickets: Ticket[], users: User[], now: Date): StoredEvent[] {
	const technicians = new Set(users.filter((u) => u.role === "technician").map((u) => u.id));
	const out: StoredEvent[] = [];
	let i = 0;
	for (const t of tickets) {
		const kind = VISIT_STATUSES[t.statusId];
		if (!kind || !t.assigneeId || !technicians.has(t.assigneeId) || t.closedAt) continue;
		const day = new Date(now);
		day.setDate(day.getDate() + (i % 3 === 2 ? 1 : 0)); // mostly today, some tomorrow
		const startHour = 8 + ((i * 2) % 8);
		const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), startHour, 0);
		const end = new Date(start.getTime() + (kind === "maintenance" ? 2 : 1) * 3_600_000);
		out.push({
			id: `svc-visit-${t.number}`,
			title: `${kind === "maintenance" ? "Repair" : "Inspection"} · Ticket #${t.number} - ${t.title}`,
			type: kind,
			mode: "on_site",
			completed: false,
			start: start.toISOString(),
			end: end.toISOString(),
			project: kind === "maintenance" ? "WARRANTY & HANDOVER" : "WARRANTY INSPECTION",
			client: { id: t.clientId, name: t.clientName || t.requester.name },
			ticketNumber: String(t.number),
			ownerId: t.assigneeId,
			property: t.property || "—",
			developmentId: t.developmentId ?? undefined,
			blockId: t.blockId ?? undefined,
			unitId: t.unitId ?? undefined,
			location: t.location,
			notes: `${t.description} Requester: ${t.requester.name}${t.requester.phone ? `, ${t.requester.phone}` : ""}.`,
			billable: false,
			groupActivity: false,
			tags: [],
			hours: [],
			files: [],
			expenses: [],
			service: null,
		});
		i++;
	}
	return out;
}

/** A finished report for a past, completed inspection or repair. */
export function seedCompletedReport(e: StoredEvent, i: number): ServiceReport | null {
	if (!e.completed || (e.type !== "initial_inspection" && e.type !== "maintenance")) return null;
	const r = emptyReport(e.type);
	const start = new Date(e.start);
	const end = new Date(e.end);
	r.status = "completed";
	r.checkInAt = new Date(start.getTime() + 10 * 60_000).toISOString();
	r.checkOutAt = new Date(end.getTime() - 5 * 60_000).toISOString();
	const issueNote =
		e.type === "initial_inspection"
			? "Slow drain under the kitchen sink; trap needs cleaning and resealing."
			: "Old sealant was cracked around the fitting; removed before the repair.";
	r.checklist = r.checklist.map((c, k) => {
		const issue = k === 1 && i % 2 === 0;
		return {
			...c,
			result: issue ? "issue" : k === r.checklist.length - 1 && i % 3 === 0 ? "na" : "ok",
			note: issue ? issueNote : "",
			photos: issue ? [{ id: `seed-${e.id}-c${k}`, name: "evidence.svg", dataUrl: PHOTO_SVG, caption: "Evidence" }] : [],
		};
	});
	r.satisfaction = i % 4 === 0 ? "neutral" : i % 2 === 0 ? "very_satisfied" : "satisfied";
	if (e.type === "initial_inspection") {
		r.findings = "Unit in good condition overall. One finishing issue logged for the warranty team.";
	} else {
		r.findings = "Worn seal caused the fault.";
		r.workPerformed = "Replaced the seal, tested for 15 minutes with no leaks, cleaned the area.";
		r.parts = [{ id: "p1", description: "Replacement seal kit", qty: 1, unitCost: 38.5 }];
	}
	r.customerPresent = true;
	r.signature = { name: e.client.name.split(" ")[0] === "Water" ? "Building manager" : "Unit owner", dataUrl: SIGNATURE_SVG, signedAt: r.checkOutAt };
	return r;
}
