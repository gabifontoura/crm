import dayjs from "dayjs";
import { generateSeedDevelopments, locationLabel, SEED_CLIENT_RECORDS } from "../developments.js";
import { SEED_USERS } from "../users.js";
import type { AppointmentType, CalendarEvent, MeetingMode } from "./types.js";

/**
 * Fictional demo data for a construction-services company, seeded by the
 * backend on its first run. Imports use ".js" so these files also run as
 * plain Node ESM on Vercel.
 */

const SEED = generateSeedDevelopments();

export const MOCK_PROPERTIES = SEED.developments.map((d) => d.name);

export const MOCK_USERS: { id: string; name: string; initials: string }[] = SEED_USERS.filter((u) => u.active).map((u) => ({
	id: u.id,
	name: u.name,
	initials: u.name
		.split(" ")
		.map((p) => p[0])
		.join("")
		.slice(0, 2)
		.toUpperCase(),
}));

interface Template {
	type: AppointmentType;
	mode: MeetingMode;
	title: string;
	notes: string;
	hours: number;
	project: string;
	billable?: boolean;
	groupActivity?: boolean;
	/** Only these owners (ids) take this kind of job. */
	owners: string[];
	expense?: { description: string; amount: number };
	files?: string[];
}

const PM = ["2547", "2551"];
const FOREMEN = ["2548", "2555"];
const ENGINEERS = ["2549", "2552"];
const BROKERS = ["2557", "2558", "2560", "2561"];

const TEMPLATES: Template[] = [
	{
		type: "initial_inspection",
		mode: "on_site",
		title: "Pre-handover inspection",
		notes: "Walk the units with the client's representative and log finishing issues (paint, grout, door alignment) in the punch list.",
		hours: 2,
		project: "WARRANTY & HANDOVER",
		billable: true,
		owners: [...ENGINEERS, ...FOREMEN],
		files: ["punch_list.pdf", "site_photos.zip"],
	},
	{
		type: "initial_inspection",
		mode: "on_site",
		title: "Structural crack assessment",
		notes: "Measure and photograph the reported cracks in the parking level. Decide whether a structural engineer's report is needed.",
		hours: 2,
		project: "WARRANTY & HANDOVER",
		billable: true,
		owners: ENGINEERS,
		files: ["crack_map.pdf"],
	},
	{
		type: "initial_inspection",
		mode: "on_site",
		title: "Roof and waterproofing survey",
		notes: "Check the roof membrane, drains and flashing after the storm. Customer reported water stains on the top floor ceiling.",
		hours: 3,
		project: "MAINTENANCE CONTRACT",
		billable: true,
		owners: [...FOREMEN, ...ENGINEERS],
		files: ["roof_report.pdf"],
	},
	{
		type: "technical_question",
		mode: "remote",
		title: "Change order review",
		notes: "Go through change order #14 with the client: extra outlets in the lobby and relocated sprinkler heads. Confirm scope and cost.",
		hours: 1,
		project: "TENANT FIT-OUT",
		owners: PM,
	},
	{
		type: "technical_question",
		mode: "hybrid",
		title: "Coordination meeting - MEP clashes",
		notes: "Resolve clashes between HVAC ducts and the cable trays on level 3 found in the BIM model.",
		hours: 1.5,
		project: "NEW CONSTRUCTION",
		groupActivity: true,
		owners: [...ENGINEERS, ...PM],
	},
	{
		type: "technical_question",
		mode: "remote",
		title: "Warranty claim follow-up",
		notes: "Call the resident about the warranty claim for the kitchen countertop. Explain next steps and book a visit.",
		hours: 0.5,
		project: "CUSTOMER CARE",
		owners: [...ENGINEERS, "2548"],
	},
	{
		type: "unit_showing",
		mode: "on_site",
		title: "Unit showing",
		notes: "Show the unit to a prospective buyer. Bring the floor plan, finishes brochure and the updated price list.",
		hours: 1,
		project: "SALES",
		owners: BROKERS,
		files: ["floor_plan.pdf", "price_list.pdf"],
	},
	{
		type: "unit_showing",
		mode: "on_site",
		title: "Model unit open house",
		notes: "Open house at the model unit. Collect visitor details and schedule follow-up calls for interested families.",
		hours: 3,
		project: "SALES",
		groupActivity: true,
		owners: BROKERS,
	},
	{
		type: "sales_meeting",
		mode: "hybrid",
		title: "Purchase agreement signing",
		notes: "Review the purchase agreement with the buyer and their lawyer. Confirm the payment schedule and handover date.",
		hours: 1.5,
		project: "SALES",
		billable: true,
		owners: BROKERS,
		files: ["purchase_agreement_draft.pdf"],
	},
	{
		type: "sales_meeting",
		mode: "remote",
		title: "Buyer follow-up call",
		notes: "Follow up with a buyer who visited last week. Answer questions about parking spaces and HOA fees.",
		hours: 0.5,
		project: "SALES",
		owners: BROKERS,
	},
	{
		type: "maintenance",
		mode: "on_site",
		title: "Electrical panel upgrade",
		notes: "Replace the main breaker and label circuits in the shared laundry room panel. Power will be off for about 2 hours.",
		hours: 4,
		project: "MAINTENANCE CONTRACT",
		billable: true,
		owners: ["2550", "2556"],
		expense: { description: "Breakers and labels", amount: 386.4 },
		files: ["work_order.pdf"],
	},
	{
		type: "maintenance",
		mode: "on_site",
		title: "Plumbing leak repair",
		notes: "Replace the gate valve in unit 304 and pressure-test the riser. Coordinate water shut-off with the building manager.",
		hours: 3,
		project: "MAINTENANCE CONTRACT",
		billable: true,
		groupActivity: true,
		owners: ["2553", "2554"],
		expense: { description: "Valves and fittings", amount: 184.9 },
		files: ["work_order.pdf"],
	},
	{
		type: "maintenance",
		mode: "on_site",
		title: "HVAC preventive maintenance",
		notes: "Quarterly service of the rooftop units: filters, belts, refrigerant check and condensate drains.",
		hours: 4,
		project: "MAINTENANCE CONTRACT",
		billable: true,
		owners: ["2554", "2556"],
		expense: { description: "Filters (12 units)", amount: 240 },
	},
	{
		type: "maintenance",
		mode: "on_site",
		title: "Facade painting touch-ups",
		notes: "Touch up the facade paint on the east wall after the sealant replacement. Use the approved color from the spec sheet.",
		hours: 5,
		project: "WARRANTY & HANDOVER",
		billable: true,
		groupActivity: true,
		owners: FOREMEN,
		expense: { description: "Paint and boom lift rental", amount: 612.75 },
	},
	{
		type: "maintenance",
		mode: "on_site",
		title: "Safety walk and toolbox talk",
		notes: "Weekly safety walk with subcontractors. Toolbox talk topic: working at heights and ladder inspection.",
		hours: 1.5,
		project: "NEW CONSTRUCTION",
		groupActivity: true,
		owners: ["2552", "2555"],
	},
	{
		type: "awaiting_supplier",
		mode: "remote",
		title: "Awaiting tempered glass delivery",
		notes: "Supplier confirmed 12 business days to manufacture the balcony glass panels. Follow up on the shipping date.",
		hours: 0.5,
		project: "TENANT FIT-OUT",
		owners: PM,
	},
	{
		type: "awaiting_supplier",
		mode: "remote",
		title: "Pump motor on back order",
		notes: "The booster pump motor is on back order. Ask the distributor for an ETA and quote a temporary rental pump.",
		hours: 0.5,
		project: "MAINTENANCE CONTRACT",
		owners: [...PM, ...FOREMEN],
	},
	{
		type: "awaiting_supplier",
		mode: "hybrid",
		title: "Access control hardware delay",
		notes: "Waiting for firmware from the turnstile vendor that supports the new badge readers. Test on site once it arrives.",
		hours: 1,
		project: "TENANT FIT-OUT",
		owners: ["2550", ...PM],
	},
];

/** Small seeded PRNG so the demo data is the same on every run. */
function rng(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

function pick<T>(list: T[], r: () => number): T {
	return list[Math.floor(r() * list.length)];
}

function formatDuration(hours: number): string {
	const h = Math.floor(hours);
	const m = Math.round((hours - h) * 60);
	if (h === 0) return `${m}m`;
	return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * About 90 appointments from two weeks ago to three weeks ahead, on weekdays,
 * spread across the team, clients and job sites.
 */
export function generateMockEvents(today: Date = new Date()): CalendarEvent[] {
	const r = rng(20260924);
	const base = dayjs(today).startOf("day");
	const events: CalendarEvent[] = [];
	const slots = [7, 8, 9, 10, 11, 13, 14, 15, 16];
	let ticket = 209280;

	for (let offset = -14; offset <= 21; offset++) {
		const day = base.add(offset, "day");
		const weekday = day.day();
		if (weekday === 0) continue; // no Sunday work
		const count = weekday === 6 ? (r() < 0.6 ? 1 : 0) : 2 + Math.floor(r() * 3);
		const usedSlots = new Set<number>();

		for (let i = 0; i < count; i++) {
			const t = pick(TEMPLATES, r);
			// Planned sites have no blocks yet, so only schedule work where there are units.
			const dev = pick(
				SEED.developments.filter((d) => SEED.blocks.some((b) => b.developmentId === d.id)),
				r,
			);
			const client = SEED_CLIENT_RECORDS.find((c) => c.id === dev.clientId) ?? SEED_CLIENT_RECORDS[0];
			const block = pick(SEED.blocks.filter((b) => b.developmentId === dev.id), r);
			// Remote calls and common-area work don't need a unit.
			const unit =
				t.mode === "remote" || r() < 0.3 ? null : pick(SEED.units.filter((u) => u.blockId === block.id), r);
			const site = dev.name;
			const ownerId = pick(t.owners, r);
			const owner = MOCK_USERS.find((u) => u.id === ownerId) ?? MOCK_USERS[0];
			let hour = pick(slots, r);
			while (usedSlots.has(hour)) hour = hour >= 16 ? 7 : hour + 1;
			usedSlots.add(hour);

			const start = day.hour(hour).minute(r() < 0.3 ? 30 : 0);
			const end = start.add(t.hours * 60, "minute");
			const id = `evt-${events.length + 1}`;
			ticket += 3 + Math.floor(r() * 9);

			events.push({
				id,
				title: `${t.title} - ${site}`,
				type: t.type,
				mode: t.mode,
				completed: offset < 0 && r() < 0.85,
				start: start.toDate(),
				end: end.toDate(),
				project: t.project,
				client: { id: client.id, name: client.name },
				ticketNumber: String(ticket),
				owner: { id: owner.id, name: owner.name, initials: owner.initials },
				property: site,
				developmentId: dev.id,
				blockId: block.id,
				unitId: unit?.id,
				location: locationLabel(block, unit),
				notes: t.notes,
				billable: t.billable ?? false,
				groupActivity: t.groupActivity ?? false,
				hours: [
					{
						id: `h-${id}`,
						start: start.format("HH:mm"),
						end: end.format("HH:mm"),
						total: formatDuration(t.hours),
						description: t.project,
					},
				],
				files: (t.files ?? []).map((name, fi) => ({
					id: `f-${id}-${fi}`,
					name,
					size: `${(0.4 + r() * 3.6).toFixed(1)} MB`,
				})),
				expenses: t.expense ? [{ id: `x-${id}`, ...t.expense }] : [],
				tags: [],
			});
		}
	}
	return events;
}
