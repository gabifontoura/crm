import { locationLabel } from "../../shared/developments.js";
import type { ChecklistItem, ServiceReport, Satisfaction } from "../../shared/service.js";
import { emptyReport } from "../../shared/service.js";
import {
	type EngineeringQuestion,
	type FieldValue,
	isClosedCategory,
	normalizeFieldValues,
	type Priority,
	type Ticket,
	type TicketActivity,
	type TicketType,
	type Workflow,
} from "../../shared/tickets.js";
import type { StoredEvent } from "../repos/types.js";
import { PHOTO_SVG, SIGNATURE_SVG } from "./service.js";

/**
 * Demo field service, told as stories: each ticket has the visits that
 * happened (with their reports) or are booked, and sub-tickets that are the
 * concrete work those visits do. Statuses always match what happened: a ticket
 * is only resolved once its sub-tickets are closed, "Visit scheduled" has a
 * visit on the calendar, a sign-off waits for the owner's signature, and so on.
 * Dates are relative to "now", so the calendar always has past, today's and
 * upcoming work.
 */

const EMILY = "2547"; // project manager (admin)
const JACK = "2548"; // site foreman
const OLIVIA = "2549"; // civil engineer
const RYAN = "2550"; // electrician
const ETHAN = "2552"; // safety technician
const MIA = "2553"; // plumber
const NOAH = "2554"; // maintenance technician
const AVA = "2555"; // site foreman
const LUCAS = "2556"; // electrician

type SubState = "open" | "done" | "deferred";

interface SubSeed {
	title: string;
	description?: string;
	state: SubState;
	/** Key of the visit it was an action of (answered there when done/deferred). */
	on?: string;
	note?: string;
	photo?: boolean;
	/** Question to engineering about it (asked by the technician, maybe answered). */
	engineering?: { question: string; askedBy: string; askedDay: number; answer?: string; answeredDay?: number };
	/** Done outside a visit (e.g. an order placed by the office): day it was closed. */
	closedDay?: number;
}

interface VisitSeed {
	key: string;
	type: "initial_inspection" | "maintenance";
	day: number;
	at: string;
	minutes: number;
	ownerId: string;
	state: "done" | "in_progress" | "booked";
	findings?: string;
	work?: string;
	parts?: { description: string; qty: number; unitCost: number }[];
	/** Who signed (customer present); none: the customer wasn't there. */
	signer?: string;
	satisfaction?: Satisfaction;
	/** Moved from another date: when it was first booked and why it moved. */
	movedFrom?: { day: number; at: string; reason: string; movedDay: number };
	notes?: string;
}

interface StorySeed {
	typeId: "tt-warranty" | "tt-maintenance";
	title: string;
	description: string;
	devId: string;
	blockId?: string;
	unit?: string;
	/** Defaults to the unit's occupant. */
	requester?: string;
	priority?: Priority;
	assigneeId: string | null;
	createdDay: number;
	createdAt?: string;
	/** Status steps after creation: [status, day, time, comment?, by?]. */
	steps: [string, number, string, string?, string?][];
	fields?: Record<string, FieldValue>;
	subs?: SubSeed[];
	visits?: VisitSeed[];
}

const STORIES: StorySeed[] = [
	{
		typeId: "tt-warranty",
		title: "Water dripping from the kitchen ceiling light",
		description: "Water comes through the kitchen light fixture every time the upstairs neighbor showers. The owner switched the light off.",
		devId: "D-01",
		blockId: "D-01-B1",
		unit: "204",
		priority: "urgent",
		assigneeId: MIA,
		createdDay: -4,
		createdAt: "08:10",
		steps: [
			["triage", -4, "08:40", "Urgent: the building manager isolated the kitchen lighting circuit.", EMILY],
			["visit", -4, "09:00"],
			["repair", -3, "11:00"],
		],
		fields: { defect: "Water leak", leak_source: "Unit above", water_off: true, noticed_on: -5, root_cause: "The shower drain seal in Unit 304 (above) failed; water runs along the slab to the light box.", covered: true },
		visits: [
			{ key: "v1", type: "initial_inspection", day: -3, at: "09:00", minutes: 90, ownerId: MIA, state: "done", findings: "Water comes from Unit 304's shower drain. The ceiling board around the light box is soaked.", signer: "Steven Clark", satisfaction: "satisfied" },
			{ key: "v2", type: "maintenance", day: 1, at: "09:00", minutes: 180, ownerId: MIA, state: "booked", notes: "Unit 304's owner lets us in at 9:00 for the drain seal; then the ceiling in 204." },
		],
		subs: [
			{ title: "Find the source of the leak", state: "done", on: "v1", note: "Dye test: the shower drain seal in Unit 304 failed.", photo: true },
			{ title: "Make the light fixture safe", state: "done", on: "v1", note: "Circuit isolated at the panel; fixture removed and capped." },
			{ title: "Replace the shower drain seal in Unit 304", description: "Remove the drain grate, replace the seal and flood-test the shower tray.", state: "open" },
			{ title: "Replace the water-damaged ceiling board", description: "Cut out the wet board around the light box and fit a new one.", state: "open" },
			{ title: "Repaint the kitchen ceiling", state: "open" },
			{ title: "Reinstall and test the light fixture", state: "open" },
		],
	},
	{
		typeId: "tt-warranty",
		title: "Cracked tiles in the kitchen floor",
		description: "Three floor tiles cracked near the dishwasher two months after move-in.",
		devId: "D-01",
		blockId: "D-01-B1",
		unit: "402",
		assigneeId: AVA,
		createdDay: -12,
		steps: [
			["triage", -12, "10:00", undefined, EMILY],
			["visit", -12, "10:30"],
			["repair", -10, "11:30"],
			["supplier", -9, "09:00", "Tiles from the original batch ordered; the supplier says 7 business days."],
		],
		fields: { defect: "Finishing", noticed_on: -20, root_cause: "Poor adhesive coverage under the tiles next to the dishwasher.", covered: true },
		visits: [{ key: "v1", type: "initial_inspection", day: -10, at: "10:00", minutes: 60, ownerId: AVA, state: "done", findings: "Three cracked tiles by the dishwasher and two more that sound hollow: poor adhesive coverage.", signer: "Michael Reed", satisfaction: "satisfied" }],
		subs: [
			{ title: "Check the floor for hollow tiles", state: "done", on: "v1", note: "Two more hollow tiles next to the cracked ones.", photo: true },
			{ title: "Order 5 tiles from the original batch", state: "done", closedDay: -9, note: "Ordered from Stone & Co., batch 24-118." },
			{ title: "Replace the cracked and hollow tiles", description: "5 tiles: lift, re-bed with full adhesive coverage.", state: "open" },
			{ title: "Regrout and seal the kitchen floor", state: "open" },
		],
	},
	{
		typeId: "tt-warranty",
		title: "Bedroom window won't close fully",
		description: "The sliding window in the main bedroom leaves a 1 cm gap; wind noise at night.",
		devId: "D-01",
		blockId: "D-01-B2",
		unit: "301",
		assigneeId: JACK,
		createdDay: -2,
		steps: [
			["triage", -2, "14:00", undefined, EMILY],
			["visit", -2, "14:20"],
		],
		fields: { defect: "Doors & windows", noticed_on: -3 },
		visits: [{ key: "v1", type: "initial_inspection", day: 0, at: "14:00", minutes: 60, ownerId: JACK, state: "booked", notes: "Owner works from home; call 10 minutes before." }],
		subs: [
			{ title: "Check the frame alignment", state: "open" },
			{ title: "Adjust or replace the rollers", state: "open" },
			{ title: "Replace the weather stripping", state: "open" },
		],
	},
	{
		typeId: "tt-warranty",
		title: "Paint peeling in the bathroom ceiling",
		description: "Moisture spots and peeling paint above the shower.",
		devId: "D-04",
		blockId: "D-04-B1",
		unit: "601",
		assigneeId: AVA,
		createdDay: -9,
		steps: [
			["triage", -9, "09:00", undefined, EMILY],
			["visit", -9, "09:20"],
			["repair", -7, "11:00"],
		],
		fields: { defect: "Finishing", noticed_on: -14, root_cause: "The exhaust fan duct was disconnected in the ceiling void; steam condensed on the ceiling.", covered: true },
		visits: [
			{ key: "v1", type: "initial_inspection", day: -7, at: "09:30", minutes: 60, ownerId: AVA, state: "done", findings: "The exhaust fan duct is disconnected in the ceiling void.", signer: "Jason Wright", satisfaction: "neutral" },
			{ key: "v2", type: "maintenance", day: -3, at: "13:00", minutes: 120, ownerId: AVA, state: "done", findings: "Mold spots on the ceiling around the shower.", work: "Duct reconnected and sealed; fan tested at full flow.", parts: [{ description: "Flexible duct and clamps", qty: 1, unitCost: 42 }], signer: "Jason Wright", satisfaction: "satisfied" },
			{ key: "v3", type: "maintenance", day: 3, at: "10:00", minutes: 90, ownerId: AVA, state: "booked" },
		],
		subs: [
			{ title: "Check the exhaust fan and duct", state: "done", on: "v1", note: "Duct loose from the fan outlet.", photo: true },
			{ title: "Reconnect and seal the exhaust duct", state: "done", on: "v2" },
			{ title: "Treat the mold and repaint the ceiling", description: "Anti-mold treatment, then two coats of bathroom paint.", state: "deferred", on: "v2", note: "The ceiling needs 48 h to dry before painting." },
		],
	},
	{
		typeId: "tt-warranty",
		title: "Front door lock sticks",
		description: "The key turns with difficulty; the owner is worried it will break.",
		devId: "D-03",
		blockId: "D-03-B1",
		unit: "203",
		assigneeId: JACK,
		createdDay: -8,
		steps: [
			["triage", -8, "10:00", undefined, EMILY],
			["visit", -8, "10:15"],
			["repair", -6, "12:00"],
			["signoff", -1, "11:00", "Owner not home; sign-off visit booked for Monday evening."],
		],
		fields: { defect: "Doors & windows", root_cause: "Worn cylinder and a strike plate misaligned by 3 mm.", covered: true, work_done: "Lock cylinder replaced and strike plate realigned.", repair_cost: 165 },
		visits: [
			{ key: "v1", type: "initial_inspection", day: -6, at: "11:00", minutes: 45, ownerId: JACK, state: "done", findings: "Worn cylinder; the strike plate is 3 mm off.", signer: "Megan Scott", satisfaction: "satisfied" },
			{ key: "v2", type: "maintenance", day: -1, at: "10:00", minutes: 60, ownerId: JACK, state: "done", work: "Cylinder replaced and strike plate realigned. Owner at work: sign-off pending.", parts: [{ description: "Lock cylinder (3 keys)", qty: 1, unitCost: 89 }] },
			{ key: "v3", type: "maintenance", day: 3, at: "18:00", minutes: 30, ownerId: JACK, state: "booked", notes: "Only the sign-off: owner checks the door and signs." },
		],
		subs: [
			{ title: "Replace the lock cylinder", state: "done", on: "v2" },
			{ title: "Realign the strike plate", state: "done", on: "v2" },
			{ title: "Owner checks the door and signs off", state: "open" },
		],
	},
	{
		typeId: "tt-warranty",
		title: "Grout gaps in the shower",
		description: "Grout washing out around the shower tray.",
		devId: "D-01",
		blockId: "D-01-B1",
		unit: "102",
		assigneeId: MIA,
		createdDay: -24,
		steps: [
			["triage", -24, "09:00", undefined, EMILY],
			["visit", -24, "09:30"],
			["repair", -22, "10:00"],
			["signoff", -21, "12:10"],
			["resolved", -21, "12:15"],
		],
		fields: { defect: "Waterproofing", root_cause: "Grout not suited for wet areas.", covered: true, work_done: "Old grout removed; epoxy grout applied and sealed; leak test passed.", repair_cost: 240, owner_signoff: "Chris Patel" },
		visits: [
			{ key: "v1", type: "initial_inspection", day: -22, at: "09:00", minutes: 45, ownerId: MIA, state: "done", findings: "Cement grout washing out; needs epoxy grout.", signer: "Chris Patel", satisfaction: "satisfied" },
			{ key: "v2", type: "maintenance", day: -21, at: "09:00", minutes: 180, ownerId: MIA, state: "done", work: "Old grout removed; epoxy grout applied and sealed.", parts: [{ description: "Epoxy grout kit", qty: 1, unitCost: 64 }], signer: "Chris Patel", satisfaction: "very_satisfied" },
		],
		subs: [
			{ title: "Remove the failed grout", state: "done", on: "v2" },
			{ title: "Regrout and seal the shower", state: "done", on: "v2" },
			{ title: "Leak test with the owner", state: "done", on: "v2", note: "No leaks after 15 minutes of running water." },
		],
	},
	{
		typeId: "tt-warranty",
		title: "Scratched quartz countertop",
		description: "The owner reports scratches on the kitchen countertop.",
		devId: "D-03",
		blockId: "D-03-B2",
		unit: "401",
		assigneeId: null,
		createdDay: -15,
		steps: [
			["triage", -15, "11:00", undefined, EMILY],
			["rejected", -14, "16:00", "Knife marks from use, not a manufacturing defect: not covered. Owner informed by email.", EMILY],
		],
		fields: { defect: "Finishing", root_cause: "Damage from use.", covered: false },
	},
	{
		typeId: "tt-warranty",
		title: "Balcony door draft",
		description: "Cold air comes through the balcony door seal.",
		devId: "D-06",
		blockId: "D-06-B2",
		unit: "503",
		assigneeId: null,
		createdDay: 0,
		createdAt: "08:05",
		steps: [],
		fields: { defect: "Doors & windows" },
	},
	{
		typeId: "tt-warranty",
		title: "Hairline crack in the living room wall",
		description: "Thin diagonal crack above the TV wall, getting longer.",
		devId: "D-04",
		blockId: "D-04-B1",
		unit: "302",
		priority: "high",
		assigneeId: AVA,
		createdDay: -6,
		steps: [["triage", -6, "10:00", "Waiting for engineering before deciding the repair.", EMILY]],
		fields: { defect: "Structure", noticed_on: -16 },
		visits: [{ key: "v1", type: "initial_inspection", day: -4, at: "14:00", minutes: 60, ownerId: AVA, state: "done", findings: "Diagonal crack 45 cm long and 0.3 mm wide; it grew about 4 cm in 10 days according to the owner's photos.", signer: "Chris Patel", satisfaction: "neutral" }],
		subs: [
			{ title: "Measure and photograph the crack", state: "done", on: "v1", note: "45 cm, 0.3 mm; gauge marks drawn at both ends.", photo: true },
			{
				title: "Structural assessment by engineering",
				state: "deferred",
				on: "v1",
				photo: true,
				engineering: { question: "Diagonal crack 0.3 mm wide over the TV wall, about 4 cm longer in 10 days. Structural or shrinkage? Photos with the gauge marks attached.", askedBy: AVA, askedDay: -4 },
			},
			{ title: "Fill and repaint the wall", description: "After engineering's answer.", state: "open" },
		],
	},
	{
		typeId: "tt-warranty",
		title: "Garage flooding after the storm",
		description: "Standing water in parking spots 12-18 after heavy rain.",
		devId: "D-06",
		blockId: "D-06-B1",
		requester: "Priya Raman (HOA)",
		priority: "urgent",
		assigneeId: JACK,
		createdDay: -3,
		steps: [
			["triage", -3, "08:30", undefined, EMILY],
			["visit", -3, "09:00"],
		],
		fields: { defect: "Water leak", leak_source: "Facade", water_off: false, noticed_on: -3 },
		visits: [{ key: "v1", type: "initial_inspection", day: 0, at: "08:00", minutes: 180, ownerId: JACK, state: "in_progress", findings: "Drains 2 and 3 blocked with leaves; water also enters at the ramp joint." }],
		subs: [
			{ title: "Clear the parking drains", state: "done", on: "v1", note: "Drains 2 and 3 unblocked." },
			{ title: "Inspect the facade joint above spots 12-18", state: "open", on: "v1" },
			{
				title: "Waterproofing solution for the ramp joint",
				state: "open",
				engineering: {
					question: "Water enters at the expansion joint at the foot of the ramp every time it rains hard. Which repair do we use?",
					askedBy: JACK,
					askedDay: -2,
					answer: "Polyurethane injection along the joint, then a channel drain at the foot of the ramp. Product: SikaFix HH+ or equivalent.",
					answeredDay: -1,
				},
			},
		],
	},
	{
		typeId: "tt-warranty",
		title: "Leak under the kitchen sink",
		description: "Drain joint leaking; the cabinet base is swollen.",
		devId: "D-03",
		blockId: "D-03-B3",
		unit: "201",
		priority: "urgent",
		assigneeId: MIA,
		createdDay: -19,
		steps: [
			["triage", -19, "08:00", undefined, EMILY],
			["visit", -19, "08:10"],
			["repair", -18, "10:30"],
			["signoff", -18, "10:40"],
			["resolved", -18, "10:45"],
		],
		fields: { defect: "Water leak", leak_source: "Plumbing riser", water_off: true, root_cause: "Loose slip joint on the sink drain.", covered: true, work_done: "Drain joint replaced; cabinet base dried and treated.", repair_cost: 120, owner_signoff: "Rachel Green" },
		visits: [{ key: "v1", type: "maintenance", day: -18, at: "09:00", minutes: 90, ownerId: MIA, state: "done", work: "Drain joint replaced; cabinet base dried and treated.", parts: [{ description: "Slip joint and washer", qty: 1, unitCost: 12.5 }], signer: "Rachel Green", satisfaction: "very_satisfied" }],
		subs: [
			{ title: "Replace the drain joint", state: "done", on: "v1" },
			{ title: "Dry and treat the cabinet base", state: "done", on: "v1" },
		],
	},
	{
		typeId: "tt-maintenance",
		title: "Elevator B stops between floors 3 and 4",
		description: "Tenants report the elevator stopping briefly between floors 3 and 4.",
		devId: "D-04",
		blockId: "D-04-B1",
		requester: "Laura Fischer (Mgmt)",
		priority: "high",
		assigneeId: NOAH,
		createdDay: -5,
		steps: [["progress", -3, "08:00"]],
		fields: { system: "Elevator", asset_tag: "ELV-B" },
		visits: [
			{ key: "v1", type: "maintenance", day: -3, at: "08:00", minutes: 120, ownerId: NOAH, state: "done", findings: "The floor-4 landing door sensor reads open now and then; the car stops as a safety measure.", signer: "Laura Fischer", satisfaction: "satisfied" },
			{ key: "v2", type: "maintenance", day: 4, at: "08:00", minutes: 180, ownerId: NOAH, state: "booked", notes: "Elevator company technician joins at 9:00 for the load test." },
		],
		subs: [
			{ title: "Inspect the landing door sensors (floors 3-4)", state: "done", on: "v1", note: "Floor-4 sensor faulty.", photo: true },
			{ title: "Replace the floor-4 door sensor", state: "open" },
			{ title: "Load test with the elevator company", state: "open" },
		],
	},
	{
		typeId: "tt-maintenance",
		title: "Lobby lights flickering",
		description: "Two ceiling panels in the lobby flicker at night.",
		devId: "D-03",
		blockId: "D-03-B1",
		requester: "Daniel Brooks (HOA)",
		assigneeId: LUCAS,
		createdDay: -1,
		createdAt: "17:30",
		steps: [],
		fields: { system: "Electrical" },
		visits: [{ key: "v1", type: "maintenance", day: 1, at: "08:00", minutes: 60, ownerId: LUCAS, state: "booked" }],
		subs: [
			{ title: "Replace the two flickering LED drivers", state: "open" },
			{ title: "Check the lobby lighting circuit", state: "open" },
		],
	},
	{
		typeId: "tt-maintenance",
		title: "Rooftop unit RTU-2 rattling",
		description: "RTU-2 has been rattling loudly since Monday.",
		devId: "D-06",
		blockId: "D-06-B1",
		requester: "Kevin O'Connor",
		assigneeId: NOAH,
		createdDay: -8,
		steps: [
			["progress", -6, "09:00"],
			["hold", -6, "11:00", "Fan bearing on order from the manufacturer; ETA next Friday."],
		],
		fields: { system: "HVAC", asset_tag: "RTU-2" },
		visits: [{ key: "v1", type: "maintenance", day: -6, at: "09:00", minutes: 90, ownerId: NOAH, state: "done", findings: "Fan bearing worn; two mounts loose.", signer: "Kevin O'Connor", satisfaction: "satisfied" }],
		subs: [
			{ title: "Tighten the fan mounts", state: "done", on: "v1" },
			{ title: "Replace the fan bearing", description: "Part on order from the manufacturer.", state: "open" },
		],
	},
	{
		typeId: "tt-maintenance",
		title: "Parking gate remote not working",
		description: "The parking gate doesn't respond to two residents' remotes.",
		devId: "D-03",
		blockId: "D-03-B2",
		requester: "Daniel Brooks (HOA)",
		assigneeId: RYAN,
		createdDay: -11,
		steps: [
			["progress", -10, "15:00"],
			["done", -10, "16:05"],
		],
		fields: { system: "Access control", work_done: "Remotes reprogrammed; receiver antenna replaced.", parts: "Receiver antenna", labor_hours: 1 },
		visits: [{ key: "v1", type: "maintenance", day: -10, at: "15:00", minutes: 60, ownerId: RYAN, state: "done", work: "Remotes reprogrammed; receiver antenna replaced.", parts: [{ description: "Receiver antenna", qty: 1, unitCost: 55 }], signer: "Daniel Brooks", satisfaction: "very_satisfied" }],
		subs: [
			{ title: "Reprogram the residents' remotes", state: "done", on: "v1" },
			{ title: "Replace the receiver antenna", state: "done", on: "v1" },
		],
	},
	{
		typeId: "tt-maintenance",
		title: "Playground fence damaged",
		description: "A section of the fence was hit by a delivery truck.",
		devId: "D-08",
		blockId: "D-08-B1",
		requester: "Angela Torres (school)",
		assigneeId: JACK,
		createdDay: -4,
		steps: [["progress", -3, "07:30"]],
		fields: { system: "Grounds" },
		visits: [
			{ key: "v1", type: "maintenance", day: -3, at: "07:30", minutes: 30, ownerId: ETHAN, state: "done", work: "Area fenced off with barriers before classes.", signer: "Angela Torres", satisfaction: "satisfied" },
			{ key: "v2", type: "maintenance", day: 0, at: "13:00", minutes: 150, ownerId: JACK, state: "booked", notes: "Kids at the playground until 12:30." },
		],
		subs: [
			{ title: "Make the area safe", state: "done", on: "v1", note: "Barriers and tape around the damaged section." },
			{ title: "Replace two fence panels", state: "open" },
			{ title: "Paint the new panels", state: "open" },
		],
	},
	{
		typeId: "tt-maintenance",
		title: "Replace burnt-out exit signs",
		description: "Four exit signs on floor 2 are not lit.",
		devId: "D-08",
		blockId: "D-08-B1",
		requester: "Angela Torres (school)",
		assigneeId: LUCAS,
		createdDay: -14,
		steps: [["cancelled", -13, "09:00", "Covered by the fire safety contractor's visit on Monday; closing this one.", EMILY]],
		fields: { system: "Electrical" },
	},
	{
		typeId: "tt-maintenance",
		title: "Dock door 3 won't open",
		description: "The roll-up door motor trips the breaker.",
		devId: "D-10",
		blockId: "D-10-B1",
		unit: "Bay 103",
		requester: "Tom Walsh (Northgate)",
		priority: "urgent",
		assigneeId: RYAN,
		createdDay: 0,
		createdAt: "07:40",
		steps: [],
		fields: { system: "Electrical", asset_tag: "DOCK-3" },
		visits: [{ key: "v1", type: "maintenance", day: 0, at: "16:00", minutes: 60, ownerId: RYAN, state: "booked" }],
		subs: [
			{ title: "Check the motor breaker and wiring", state: "open" },
			{ title: "Replace the motor contactor if faulty", state: "open" },
		],
	},
	{
		typeId: "tt-maintenance",
		title: "Quarterly HVAC service: office floors",
		description: "Quarterly service of the office floors' air handlers.",
		devId: "D-06",
		blockId: "D-06-B1",
		requester: "Kevin O'Connor",
		assigneeId: NOAH,
		createdDay: -10,
		steps: [
			["progress", -3, "12:30"],
			["rescheduled", -3, "12:40", "Tenant on floor 3 asked to move it: board meeting that afternoon."],
		],
		fields: { system: "HVAC", asset_tag: "AHU-1..4" },
		visits: [{ key: "v1", type: "maintenance", day: 5, at: "13:00", minutes: 240, ownerId: NOAH, state: "booked", movedFrom: { day: -3, at: "13:00", reason: "Tenant on floor 3 asked to move it: board meeting that afternoon.", movedDay: -3 } }],
		subs: [
			{ title: "Replace the filters (12 units)", state: "open" },
			{ title: "Check belts and refrigerant", state: "open" },
			{ title: "Clean the condensate drains", state: "open" },
		],
	},
	{
		typeId: "tt-maintenance",
		title: "Laundry room electrical panel upgrade",
		description: "Replace the main breaker and label the circuits in the shared laundry room panel.",
		devId: "D-01",
		blockId: "D-01-B2",
		requester: "Harborline Facilities",
		assigneeId: LUCAS,
		createdDay: -21,
		steps: [
			["progress", -19, "08:00"],
			["done", -19, "12:20"],
		],
		fields: { system: "Electrical", asset_tag: "PNL-L1", work_done: "Main breaker replaced; all 18 circuits labeled.", parts: "Main breaker 100 A, labels", labor_hours: 4 },
		visits: [{ key: "v1", type: "maintenance", day: -19, at: "08:00", minutes: 240, ownerId: LUCAS, state: "done", work: "Main breaker replaced; all 18 circuits labeled.", parts: [{ description: "Main breaker 100 A", qty: 1, unitCost: 310 }, { description: "Circuit labels", qty: 1, unitCost: 18 }], signer: "Building manager", satisfaction: "satisfied" }],
		subs: [
			{ title: "Replace the main breaker", state: "done", on: "v1" },
			{ title: "Label the circuits", state: "done", on: "v1" },
		],
	},
	{
		typeId: "tt-maintenance",
		title: "Weekly safety walk: North Wing",
		description: "Weekly safety walk with the subcontractors on site.",
		devId: "D-05",
		blockId: "D-05-B1",
		requester: "Greenfield site office",
		assigneeId: ETHAN,
		createdDay: -1,
		steps: [
			["progress", 0, "07:00"],
			["done", 0, "08:05"],
		],
		fields: { system: "Other", work_done: "Scaffolding tags checked; toolbox talk on working at heights (14 attendees).", labor_hours: 1 },
		visits: [{ key: "v1", type: "maintenance", day: 0, at: "07:00", minutes: 60, ownerId: ETHAN, state: "done", work: "Scaffolding tags checked; toolbox talk given.", signer: "Site supervisor", satisfaction: "satisfied" }],
		subs: [
			{ title: "Check the scaffolding tags", state: "done", on: "v1", note: "Two tags renewed on the east scaffold." },
			{ title: "Toolbox talk: working at heights", state: "done", on: "v1", note: "14 attendees." },
		],
	},
	{
		typeId: "tt-maintenance",
		title: "Facade touch-ups: east wall",
		description: "Touch up the facade paint on the east wall after the sealant replacement.",
		devId: "D-06",
		blockId: "D-06-B2",
		requester: "Millennium Tower Owners Association",
		assigneeId: AVA,
		createdDay: -2,
		steps: [],
		fields: { system: "Other" },
		visits: [{ key: "v1", type: "maintenance", day: 6, at: "08:00", minutes: 300, ownerId: AVA, state: "booked", notes: "Boom lift delivered at 7:30." }],
		subs: [
			{ title: "Book the boom lift", state: "done", closedDay: -1, note: "Booked with LiftRent for the whole day." },
			{ title: "Touch up the east wall paint (floors 1-3)", state: "open" },
			{ title: "Clean the windows below after painting", state: "open" },
		],
	},
	{
		typeId: "tt-maintenance",
		title: "Booster pump losing pressure",
		description: "Residents on the top floors report low water pressure in the mornings.",
		devId: "D-04",
		blockId: "D-04-B1",
		requester: "Laura Fischer (Mgmt)",
		priority: "high",
		assigneeId: MIA,
		createdDay: 0,
		createdAt: "09:15",
		steps: [],
		fields: { system: "Plumbing", asset_tag: "PUMP-2" },
	},
];

const LABEL: Record<string, string> = { initial_inspection: "Initial inspection", maintenance: "Maintenance" };
const PROJECT: Record<string, string> = { "tt-warranty": "WARRANTY & HANDOVER", "tt-maintenance": "MAINTENANCE CONTRACT" };
/** How a sub-ticket (an action) gets closed, per workflow. */
const CLOSE_PATH: Record<string, { from: string; steps: [string, string][] }> = {
	"wf-warranty": { from: "new", steps: [["resolved", "Close ticket"]] },
	"wf-maintenance": { from: "open", steps: [["progress", "Start work"], ["done", "Mark as done"]] },
};

export interface StoryContext {
	now: Date;
	developments: { id: string; name: string; clientId: string }[];
	blocks: { id: string; developmentId: string; name: string }[];
	units: { id: string; blockId: string; number: string; occupant?: string | null }[];
	clients: { id: string; name: string }[];
	types: TicketType[];
	workflows: Workflow[];
	userName: (id: string) => string;
	/** Hands out the next free ticket number. */
	nextNumber: () => number;
}

export function buildServiceStories(ctx: StoryContext): { tickets: Ticket[]; activity: TicketActivity[]; events: StoredEvent[] } {
	const tickets: Ticket[] = [];
	const activity: TicketActivity[] = [];
	const events: StoredEvent[] = [];
	const today = new Date(ctx.now.getFullYear(), ctx.now.getMonth(), ctx.now.getDate());
	// A day relative to today at a local time; Sundays move to Monday.
	const at = (day: number, hm = "09:00") => {
		const d = new Date(today);
		d.setDate(d.getDate() + day);
		if (d.getDay() === 0) d.setDate(d.getDate() + (day < 0 ? -1 : 1));
		d.setHours(Number(hm.slice(0, 2)), Number(hm.slice(3, 5)), 0, 0);
		return d;
	};
	const iso = (d: Date) => d.toISOString();
	const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
	const dateLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
	const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
	let seq = 0;
	const log = (a: Omit<TicketActivity, "id">) => activity.push({ ...a, id: `sva-${++seq}` });

	// Oldest first, so ticket numbers follow the order they were opened.
	for (const s of [...STORIES].sort((a, b) => a.createdDay - b.createdDay)) {
		const type = ctx.types.find((t) => t.id === s.typeId);
		const wf = type ? ctx.workflows.find((w) => w.id === type.workflowId) : undefined;
		if (!type || !wf) continue;
		const dev = ctx.developments.find((d) => d.id === s.devId);
		const block = ctx.blocks.find((b) => b.id === s.blockId);
		const unit = s.unit ? ctx.units.find((u) => u.blockId === s.blockId && u.number === s.unit) : undefined;
		const client = ctx.clients.find((c) => c.id === dev?.clientId);
		const requesterName = s.requester ?? unit?.occupant ?? client?.name ?? "Building manager";
		const email = `${requesterName.split(" (")[0].toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@example.com`;
		const number = ctx.nextNumber();
		const id = `tk-sv-${number}`;
		const created = at(s.createdDay, s.createdAt ?? "08:30");
		const base = {
			priority: s.priority ?? type.defaultPriority,
			reporterId: EMILY,
			requester: { name: requesterName, email, phone: `+1 (555) 410-${String(number).slice(-4)}` },
			clientId: client?.id ?? "",
			clientName: client?.name ?? "",
			developmentId: dev?.id ?? null,
			blockId: block?.id ?? null,
			unitId: unit?.id ?? null,
			property: dev?.name ?? "",
			location: locationLabel(block, unit),
		};
		// Field values: "noticed_on" given as a day offset.
		const raw: Record<string, unknown> = { ...(s.fields ?? {}) };
		if (typeof raw.noticed_on === "number") raw.noticed_on = iso(at(raw.noticed_on as number)).slice(0, 10);
		const fields = normalizeFieldValues(type.fields, raw);

		// Visits first (their times drive the sub-tickets' history).
		const visitEvents = new Map<string, { event: StoredEvent; start: Date; end: Date; seed: VisitSeed }>();
		for (const v of s.visits ?? []) {
			const start = at(v.day, v.at);
			const end = addMin(start, v.minutes);
			const event: StoredEvent = {
				id: `sv-${number}-${v.key}`,
				title: `${LABEL[v.type]} · Ticket #${number} - ${s.title}`,
				type: v.type,
				mode: "on_site",
				completed: v.state === "done",
				start: iso(start),
				end: iso(end),
				project: PROJECT[s.typeId],
				client: { id: client?.id ?? "", name: client?.name ?? requesterName },
				ticketNumber: String(number),
				ownerId: v.ownerId,
				property: dev?.name ?? "—",
				developmentId: dev?.id,
				blockId: block?.id,
				unitId: unit?.id,
				location: base.location,
				notes: v.notes ?? s.description,
				billable: s.typeId === "tt-maintenance",
				groupActivity: false,
				tags: [],
				hours: v.state === "done" ? [{ id: `h-${number}-${v.key}`, start: hm(start), end: hm(end), total: `${Math.floor(v.minutes / 60)}h ${v.minutes % 60}m`.replace(" 0m", ""), description: PROJECT[s.typeId] }] : [],
				files: [],
				expenses: [],
				service: null,
			};
			visitEvents.set(v.key, { event, start, end, seed: v });
			events.push(event);
		}

		// The ticket and its history.
		const parent: Ticket = {
			id,
			number,
			title: s.title,
			description: s.description,
			typeId: type.id,
			statusId: wf.initialStatusId,
			assigneeId: s.assigneeId,
			...base,
			dueAt: type.slaHours ? iso(new Date(created.getTime() + type.slaHours * 3_600_000)) : null,
			fields,
			parentId: null,
			origin: null,
			createdAt: iso(created),
			updatedAt: iso(created),
			closedAt: null,
			attachments: [],
		};
		log({ ticketId: id, at: iso(created), userId: EMILY, kind: "created", toStatusId: wf.initialStatusId });
		if (s.assigneeId) log({ ticketId: id, at: iso(addMin(created, 5)), userId: EMILY, kind: "assigned", assigneeId: s.assigneeId });
		let status = wf.initialStatusId;
		for (const [to, day, time, comment, by] of s.steps) {
			const when = at(day, time);
			const tr = wf.transitions.find((t) => (t.from === status || t.from === "*") && t.to === to);
			log({ ticketId: id, at: iso(when), userId: by ?? s.assigneeId ?? EMILY, kind: "status", fromStatusId: status, toStatusId: to, transitionLabel: tr?.label, comment });
			status = to;
			parent.updatedAt = iso(when);
			const st = wf.statuses.find((x) => x.id === to);
			parent.closedAt = st && isClosedCategory(st.category) ? iso(when) : null;
		}
		parent.statusId = status;
		tickets.push(parent);

		// Sub-tickets: the concrete work, answered on the visits.
		const close = CLOSE_PATH[wf.id];
		const doneStatus = close.steps[close.steps.length - 1][0];
		const reports = new Map<string, ChecklistItem[]>();
		for (const [k, sub] of (s.subs ?? []).entries()) {
			const visit = sub.on ? visitEvents.get(sub.on) : undefined;
			const subNumber = ctx.nextNumber();
			const subId = `tk-sv-${subNumber}`;
			// Actions of a visit exist from its start; other work was found on the last visit (or planned when opened).
			const lastDone = [...visitEvents.values()].filter((v) => v.seed.state === "done").sort((a, b) => a.end.getTime() - b.end.getTime()).pop();
			const madeAt = visit ? addMin(visit.start, 5) : lastDone ? addMin(lastDone.end, -3 + k) : addMin(created, 30 + k);
			const closedAt = sub.state === "done" ? (visit && visit.seed.state === "done" ? addMin(visit.end, -5) : sub.closedDay !== undefined ? at(sub.closedDay, "16:00") : null) : null;
			const photo = sub.photo && visit ? [{ id: `ph-${subNumber}`, name: "evidence.svg", dataUrl: PHOTO_SVG, caption: sub.title }] : [];
			const attachments = sub.engineering && sub.photo ? [{ id: `att-${subNumber}`, name: "crack-photos.svg", type: "image/svg+xml", size: 2048, dataUrl: PHOTO_SVG, uploadedBy: sub.engineering.askedBy, uploadedAt: iso(at(sub.engineering.askedDay, "15:10")) }] : [];
			const engineering: EngineeringQuestion | null = sub.engineering
				? {
						status: sub.engineering.answer ? "answered" : "open",
						question: sub.engineering.question,
						askedBy: sub.engineering.askedBy,
						askedAt: iso(at(sub.engineering.askedDay, "15:10")),
						eventId: visit?.event.id ?? null,
						actionLabel: sub.title,
						attachmentIds: attachments.map((a) => a.id),
						answer: sub.engineering.answer ?? null,
						answeredBy: sub.engineering.answer ? OLIVIA : null,
						answeredAt: sub.engineering.answer && sub.engineering.answeredDay !== undefined ? iso(at(sub.engineering.answeredDay, "11:00")) : null,
					}
				: null;
			const child: Ticket = {
				...parent,
				id: subId,
				number: subNumber,
				title: sub.title,
				description: sub.description ?? "",
				statusId: closedAt ? doneStatus : close.from,
				parentId: id,
				origin: visit ? { eventId: visit.event.id, actionId: `a${k + 1}`, actionLabel: sub.title } : null,
				fields: normalizeFieldValues(type.fields, { ...fields, owner_signoff: null, ...(closedAt ? { work_done: sub.note ?? sub.title, labor_hours: 1 } : {}) }),
				createdAt: iso(madeAt),
				updatedAt: iso(closedAt ?? madeAt),
				closedAt: closedAt ? iso(closedAt) : null,
				attachments,
				engineering,
			};
			tickets.push(child);
			log({ ticketId: subId, at: iso(madeAt), userId: visit?.seed.ownerId ?? EMILY, kind: "created", toStatusId: close.from });
			if (engineering) {
				log({ ticketId: subId, at: engineering.askedAt, userId: engineering.askedBy, kind: "comment", comment: `Forwarded to engineering: ${engineering.question}` });
				if (engineering.answeredAt) log({ ticketId: subId, at: engineering.answeredAt, userId: OLIVIA, kind: "comment", comment: `Engineering answered: ${engineering.answer}` });
			}
			if (closedAt) {
				let from = close.from;
				for (const [to, label] of close.steps) {
					log({ ticketId: subId, at: iso(closedAt), userId: visit?.seed.ownerId ?? EMILY, kind: "status", fromStatusId: from, toStatusId: to, transitionLabel: label, comment: to === doneStatus ? (sub.note ?? (visit ? `Approved on the visit of ${dateLabel(visit.start)}.` : undefined)) : undefined });
					from = to;
				}
			}
			if (sub.state === "deferred" && visit) log({ ticketId: subId, at: iso(addMin(visit.end, -5)), userId: visit.seed.ownerId, kind: "comment", comment: `Left for later on the visit of ${dateLabel(visit.start)}.${sub.note ? `\n${sub.note}` : ""}` });

			// Its action on the visit it was done on; open ones are on the next booked visit.
			const item = (answered: boolean): ChecklistItem => ({
				id: `st-${subId}`,
				label: sub.title,
				description: sub.description ?? "",
				result: answered && sub.state === "done" ? "ok" : null,
				// On the visit it was answered on: the note (or the question to engineering), photos, left for later.
				note: answered ? (sub.engineering?.question ?? sub.note ?? "") : "",
				photos: answered ? photo : [],
				engineering: answered && Boolean(sub.engineering),
				ticketNumber: subNumber,
				deferredTicket: answered && sub.state === "deferred" ? subNumber : null,
			});
			if (visit && visit.seed.state !== "booked") reports.set(sub.on!, [...(reports.get(sub.on!) ?? []), item(true)]);
			if (sub.state !== "done") {
				// Still to do: an action of the next visit (the one under way, or the next booked).
				const next = [...visitEvents.values()].find((v) => v.seed.state === "in_progress" || v.seed.state === "booked");
				if (next && next.seed.key !== sub.on) reports.set(next.seed.key, [...(reports.get(next.seed.key) ?? []), item(false)]);
			}
		}

		// The visits' reports.
		for (const { event, start, end, seed } of visitEvents.values()) {
			const r: ServiceReport = { ...emptyReport(seed.type), checklist: reports.get(seed.key) ?? [] };
			if (seed.state === "done") {
				r.status = "completed";
				r.checkInAt = iso(addMin(start, 5));
				r.checkOutAt = iso(addMin(end, -5));
				r.sessions = [{ start: r.checkInAt, end: r.checkOutAt }];
				r.findings = seed.findings ?? "";
				r.workPerformed = seed.work ?? "";
				r.parts = (seed.parts ?? []).map((p, i) => ({ id: `p${i + 1}`, ...p }));
				r.customerPresent = Boolean(seed.signer);
				r.satisfaction = seed.signer ? (seed.satisfaction ?? "satisfied") : null;
				r.signature = seed.signer ? { name: seed.signer, dataUrl: SIGNATURE_SVG, signedAt: r.checkOutAt } : null;
				const answered = r.checklist.filter((c) => c.result === "ok").length;
				log({
					ticketId: id,
					at: r.checkOutAt,
					userId: seed.ownerId,
					kind: "comment",
					comment: [
						`Service report (${ctx.userName(seed.ownerId)}, ${dateLabel(start)}) · ${answered}/${r.checklist.length} actions approved.`,
						...r.checklist.filter((c) => c.deferredTicket).map((c) => `• Left for later: #${c.deferredTicket} ${c.label}`),
						seed.findings && `Findings: ${seed.findings}`,
						seed.work && `Work performed: ${seed.work}`,
						seed.signer ? `Signed by ${seed.signer}.` : "Customer not present: no signature.",
					]
						.filter(Boolean)
						.join("\n"),
				});
			} else if (seed.state === "in_progress") {
				r.status = "in_progress";
				r.checkInAt = iso(addMin(start, 10));
				r.sessions = [{ start: r.checkInAt, end: null }];
				r.findings = seed.findings ?? "";
			}
			if (seed.movedFrom) {
				const from = at(seed.movedFrom.day, seed.movedFrom.at);
				r.reschedules = [
					{
						id: `rs-${event.id}`,
						at: iso(at(seed.movedFrom.movedDay, "12:40")),
						byId: seed.ownerId,
						byName: ctx.userName(seed.ownerId),
						fromStart: iso(from),
						fromEnd: iso(addMin(from, seed.minutes)),
						toStart: event.start,
						toEnd: event.end,
						reason: seed.movedFrom.reason,
						photos: [],
					},
				];
			}
			event.service = r;
		}
	}
	return { tickets, activity, events };
}
