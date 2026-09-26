/**
 * Developments (job sites) with their blocks and units, plus the clients that
 * own them. Shared by frontend and backend; imports use ".js" for Node ESM.
 */

export interface Client {
	id: string;
	name: string;
	contactName: string;
	email: string;
	phone: string;
}

export type DevelopmentStatus = "planning" | "under_construction" | "delivered" | "warranty";
export type DevelopmentKind = "residential" | "commercial" | "mixed_use" | "institutional" | "industrial";

/** What a picture shows: the finished building, a render, a floor plan or the works. */
export type PhotoKind = "photo" | "render" | "floor_plan" | "construction";

export interface DevelopmentPhoto {
	id: string;
	/** An image link, e.g. from Unsplash (images.unsplash.com/…). */
	url: string;
	caption: string;
	kind: PhotoKind;
}

/** Stages of the works, in order (for developments under construction). */
export type ConstructionStage = "groundworks" | "foundations" | "structure" | "masonry_facade" | "mep" | "finishes" | "handover_prep";

/** An apartment (or suite, store…) type: its size, rooms and garage spots, and its floor plan. */
export interface UnitType {
	id: string;
	name: string;
	areaSqft: number;
	bedrooms: number;
	bathrooms: number;
	/** Garage spots. */
	parking: number;
	/** First picture of the apartment (kept in step with `photos`). */
	photoUrl?: string;
	/** Pictures of the apartment: rooms, renders, more plans. */
	photos?: DevelopmentPhoto[];
	/** Image of the floor plan, when there is one. */
	floorPlanUrl: string;
	description: string;
}

export interface Development {
	id: string;
	name: string;
	clientId: string;
	kind: DevelopmentKind;
	status: DevelopmentStatus;
	address: string;
	city: string;
	/** YYYY-MM-DD; planned or actual handover date. */
	deliveryDate: string;
	/** Where the works are (under construction only). */
	stage?: ConstructionStage | null;
	/** How far the works are, 0-100 (under construction only). */
	progress?: number | null;
	/** Pictures, the first one being the cover. */
	photos?: DevelopmentPhoto[];
	unitTypes?: UnitType[];
	createdAt: string;
	updatedAt: string;
}

export interface Block {
	id: string;
	developmentId: string;
	name: string;
	floors: number;
	/** Pictures of this tower or wing. */
	photos?: DevelopmentPhoto[];
}

export type UnitStatus = "available" | "sold" | "delivered" | "in_warranty";

export interface Unit {
	id: string;
	blockId: string;
	/** Unit number as shown on the door, e.g. "304" or "Suite 210". */
	number: string;
	floor: number;
	kind: string;
	/** Area in square feet. */
	areaSqft: number;
	status: UnitStatus;
	/** Buyer or tenant, when there is one. */
	occupant: string;
	/** The development's unit type it follows, if any. */
	typeId?: string | null;
	bedrooms?: number;
	bathrooms?: number;
	/** Garage spots. */
	parking?: number;
}

/** A development with its blocks and their units, as the API returns it. */
export interface DevelopmentTree extends Development {
	client: Pick<Client, "id" | "name"> | null;
	blocks: (Block & { units: Unit[] })[];
}

export type DevelopmentInput = Pick<
	Development,
	"name" | "clientId" | "kind" | "status" | "address" | "city" | "deliveryDate" | "stage" | "progress" | "photos" | "unitTypes"
>;
export type BlockInput = Pick<Block, "developmentId" | "name" | "floors" | "photos"> & {
	/** When set, creates units 101..N01 for every floor automatically. */
	unitsPerFloor?: number;
};
export type UnitInput = Pick<Unit, "blockId" | "number" | "floor" | "kind" | "areaSqft" | "status" | "occupant" | "typeId" | "bedrooms" | "bathrooms" | "parking">;

export const PHOTO_KINDS: { id: PhotoKind; label: string }[] = [
	{ id: "photo", label: "Photo" },
	{ id: "render", label: "Render" },
	{ id: "floor_plan", label: "Floor plan" },
	{ id: "construction", label: "Construction" },
];

export const CONSTRUCTION_STAGES: { id: ConstructionStage; label: string; hint: string }[] = [
	{ id: "groundworks", label: "Groundworks", hint: "Site clearing and excavation" },
	{ id: "foundations", label: "Foundations", hint: "Piles, footings and the ground slab" },
	{ id: "structure", label: "Structure", hint: "Columns, beams and slabs going up" },
	{ id: "masonry_facade", label: "Masonry & facade", hint: "Walls, windows and the facade" },
	{ id: "mep", label: "MEP installations", hint: "Electrical, plumbing and HVAC" },
	{ id: "finishes", label: "Finishes", hint: "Floors, paint, kitchens and bathrooms" },
	{ id: "handover_prep", label: "Handover prep", hint: "Inspections, cleaning and landscaping" },
];

/** A type's pictures, oldest data included (a single photoUrl). */
export function typePhotos(t: Pick<UnitType, "photos" | "photoUrl">): DevelopmentPhoto[] {
	if (t.photos?.length) return t.photos;
	return t.photoUrl ? [{ id: "main", url: t.photoUrl, caption: "", kind: "photo" }] : [];
}

/** Bedrooms read from a kind like "2-bedroom" (studios and non-residential: 0). */
export function bedroomsOf(kind: string): number {
	const m = /^(\d+)-bedroom/i.exec(kind);
	if (m) return Number(m[1]);
	return /penthouse/i.test(kind) ? 3 : 0;
}

export const DEVELOPMENT_STATUSES: { id: DevelopmentStatus; label: string }[] = [
	{ id: "planning", label: "Planning" },
	{ id: "under_construction", label: "Under construction" },
	{ id: "delivered", label: "Delivered" },
	{ id: "warranty", label: "In warranty" },
];

export const DEVELOPMENT_KINDS: { id: DevelopmentKind; label: string }[] = [
	{ id: "residential", label: "Residential" },
	{ id: "commercial", label: "Commercial" },
	{ id: "mixed_use", label: "Mixed use" },
	{ id: "institutional", label: "Institutional" },
	{ id: "industrial", label: "Industrial" },
];

export const UNIT_STATUSES: { id: UnitStatus; label: string }[] = [
	{ id: "available", label: "Available" },
	{ id: "sold", label: "Sold" },
	{ id: "delivered", label: "Delivered" },
	{ id: "in_warranty", label: "In warranty" },
];

export const UNIT_KINDS = ["Studio", "1-bedroom", "2-bedroom", "3-bedroom", "Penthouse", "Retail", "Office suite", "Warehouse bay", "Classroom", "Clinic"];

export function labelOf<T extends string>(list: { id: T; label: string }[], id: T): string {
	return list.find((x) => x.id === id)?.label ?? id;
}

/** "Block A · Unit 304" style label for an appointment location. */
export function locationLabel(block?: Pick<Block, "name"> | null, unit?: Pick<Unit, "number"> | null): string {
	// Numbers like "Suite 210" already say what they are; plain "304" gets a "Unit" prefix.
	const unitText = unit ? (/^\d/.test(unit.number) ? `Unit ${unit.number}` : unit.number) : "";
	return [block?.name, unitText].filter(Boolean).join(" · ");
}

/* --------------------------------- Seed ---------------------------------- */

const SEED_DATE = "2026-01-05T09:00:00.000Z";

export const SEED_CLIENT_RECORDS: Client[] = [
	{ id: "C-1001", name: "Harborline Developments LLC", contactName: "Sarah Nguyen", email: "sarah@harborline.example", phone: "+1 (555) 201-1001" },
	{ id: "C-1002", name: "Aurora Residences HOA", contactName: "Daniel Brooks", email: "board@aurora-hoa.example", phone: "+1 (555) 201-1002" },
	{ id: "C-1003", name: "Bordeaux Building Management", contactName: "Laura Fischer", email: "laura@bordeaux-bm.example", phone: "+1 (555) 201-1003" },
	{ id: "C-1004", name: "Greenfield Retail Group", contactName: "Marcus Hill", email: "m.hill@greenfield.example", phone: "+1 (555) 201-1004" },
	{ id: "C-1005", name: "Millennium Tower Owners Association", contactName: "Priya Raman", email: "office@millennium-toa.example", phone: "+1 (555) 201-1005" },
	{ id: "C-1006", name: "Summit Health Partners", contactName: "Kevin O'Connor", email: "facilities@summithealth.example", phone: "+1 (555) 201-1006" },
	{ id: "C-1007", name: "Oakridge School District", contactName: "Angela Torres", email: "facilities@oakridge-sd.example", phone: "+1 (555) 201-1007" },
	{ id: "C-1008", name: "Northgate Logistics", contactName: "Tom Walsh", email: "t.walsh@northgate.example", phone: "+1 (555) 201-1008" },
];

interface DevSeed {
	id: string;
	name: string;
	clientId: string;
	kind: DevelopmentKind;
	status: DevelopmentStatus;
	address: string;
	city: string;
	deliveryDate: string;
	blocks: { name: string; floors: number; perFloor: number; unitKinds: string[]; baseArea: number; prefix?: string }[];
}

const DEV_SEEDS: DevSeed[] = [
	{
		id: "D-01", name: "Harbor View Residences", clientId: "C-1001", kind: "residential", status: "warranty",
		address: "1200 Bayfront Ave", city: "San Diego, CA", deliveryDate: "2025-11-15",
		blocks: [
			{ name: "Tower A", floors: 6, perFloor: 4, unitKinds: ["1-bedroom", "2-bedroom", "2-bedroom", "3-bedroom"], baseArea: 720 },
			{ name: "Tower B", floors: 6, perFloor: 4, unitKinds: ["Studio", "1-bedroom", "2-bedroom", "Penthouse"], baseArea: 540 },
		],
	},
	{
		id: "D-02", name: "Pier 9 Lofts", clientId: "C-1001", kind: "mixed_use", status: "under_construction",
		address: "9 Harbor Pier Rd", city: "San Diego, CA", deliveryDate: "2026-12-01",
		blocks: [
			{ name: "Main Building", floors: 4, perFloor: 3, unitKinds: ["Retail", "1-bedroom", "2-bedroom"], baseArea: 650 },
		],
	},
	{
		id: "D-03", name: "Aurora Residences", clientId: "C-1002", kind: "residential", status: "delivered",
		address: "455 Aurora Blvd", city: "Austin, TX", deliveryDate: "2024-06-30",
		blocks: [
			{ name: "Block A", floors: 5, perFloor: 4, unitKinds: ["2-bedroom", "2-bedroom", "3-bedroom", "1-bedroom"], baseArea: 880 },
			{ name: "Block B", floors: 5, perFloor: 4, unitKinds: ["1-bedroom", "2-bedroom", "2-bedroom", "3-bedroom"], baseArea: 860 },
			{ name: "Block C", floors: 3, perFloor: 2, unitKinds: ["3-bedroom", "Penthouse"], baseArea: 1250 },
		],
	},
	{
		id: "D-04", name: "Bordeaux Building", clientId: "C-1003", kind: "residential", status: "warranty",
		address: "78 Rue Bordeaux St", city: "New Orleans, LA", deliveryDate: "2025-08-20",
		blocks: [
			{ name: "Main Building", floors: 8, perFloor: 3, unitKinds: ["1-bedroom", "2-bedroom", "3-bedroom"], baseArea: 700 },
		],
	},
	{
		id: "D-05", name: "Greenfield Mall - Phase 2", clientId: "C-1004", kind: "commercial", status: "under_construction",
		address: "3000 Greenfield Pkwy", city: "Denver, CO", deliveryDate: "2027-03-15",
		blocks: [
			{ name: "North Wing", floors: 2, perFloor: 6, unitKinds: ["Retail"], baseArea: 1800, prefix: "Store " },
			{ name: "Food Court", floors: 1, perFloor: 8, unitKinds: ["Retail"], baseArea: 450, prefix: "Kiosk " },
		],
	},
	{
		id: "D-06", name: "Millennium Tower", clientId: "C-1005", kind: "mixed_use", status: "delivered",
		address: "1 Millennium Plaza", city: "Chicago, IL", deliveryDate: "2023-10-01",
		blocks: [
			{ name: "Office Floors", floors: 4, perFloor: 3, unitKinds: ["Office suite"], baseArea: 2200, prefix: "Suite " },
			{ name: "Residences", floors: 6, perFloor: 3, unitKinds: ["2-bedroom", "3-bedroom", "Penthouse"], baseArea: 1100 },
		],
	},
	{
		id: "D-07", name: "Summit Medical Center", clientId: "C-1006", kind: "institutional", status: "under_construction",
		address: "800 Summit Way", city: "Phoenix, AZ", deliveryDate: "2026-11-30",
		blocks: [
			{ name: "Clinic Building", floors: 3, perFloor: 5, unitKinds: ["Clinic"], baseArea: 950, prefix: "Room " },
		],
	},
	{
		id: "D-08", name: "Oakridge Elementary", clientId: "C-1007", kind: "institutional", status: "delivered",
		address: "22 Oakridge Ln", city: "Portland, OR", deliveryDate: "2025-01-10",
		blocks: [
			{ name: "Classroom Wing", floors: 2, perFloor: 6, unitKinds: ["Classroom"], baseArea: 900, prefix: "Room " },
		],
	},
	{
		id: "D-09", name: "Oakridge High Gym", clientId: "C-1007", kind: "institutional", status: "planning",
		address: "40 Oakridge Ln", city: "Portland, OR", deliveryDate: "2027-08-01",
		blocks: [],
	},
	{
		id: "D-10", name: "Northgate Distribution Hub", clientId: "C-1008", kind: "industrial", status: "warranty",
		address: "5500 Northgate Rd", city: "Columbus, OH", deliveryDate: "2025-09-05",
		blocks: [
			{ name: "Warehouse 1", floors: 1, perFloor: 6, unitKinds: ["Warehouse bay"], baseArea: 12000, prefix: "Bay " },
		],
	},
];

const OCCUPANTS = [
	"Michael Reed", "Jessica Lane", "Chris Patel", "Amanda Cole", "David Kim", "Rachel Green", "Brian Foster",
	"Nicole Adams", "Steven Clark", "Hannah Lee", "Jason Wright", "Megan Scott", "Andrew Young", "Lauren King",
];

export function generateSeedDevelopments(): { developments: Development[]; blocks: Block[]; units: Unit[] } {
	const developments: Development[] = [];
	const blocks: Block[] = [];
	const units: Unit[] = [];
	let n = 0;

	for (const d of DEV_SEEDS) {
		developments.push({
			id: d.id, name: d.name, clientId: d.clientId, kind: d.kind, status: d.status,
			address: d.address, city: d.city, deliveryDate: d.deliveryDate, createdAt: SEED_DATE, updatedAt: SEED_DATE,
		});
		d.blocks.forEach((b, bi) => {
			const blockId = `${d.id}-B${bi + 1}`;
			blocks.push({ id: blockId, developmentId: d.id, name: b.name, floors: b.floors });
			for (let floor = 1; floor <= b.floors; floor++) {
				for (let i = 1; i <= b.perFloor; i++) {
					n++;
					const number = `${b.prefix ?? ""}${floor}${String(i).padStart(2, "0")}`;
					const kind = b.unitKinds[(i - 1) % b.unitKinds.length];
					const status: UnitStatus =
						d.status === "planning" || d.status === "under_construction"
							? n % 3 === 0 ? "available" : "sold"
							: d.status === "warranty"
								? "in_warranty"
								: "delivered";
					units.push({
						id: `${blockId}-U${number.replace(/\D/g, "")}`,
						blockId,
						number,
						floor,
						kind,
						areaSqft: b.baseArea + ((n * 37) % 120),
						status,
						occupant: status === "available" ? "" : OCCUPANTS[n % OCCUPANTS.length],
					});
				}
			}
		});
	}
	return { developments, blocks, units };
}
