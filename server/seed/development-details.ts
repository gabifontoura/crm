import { bedroomsOf, type Block, type Development, type DevelopmentPhoto, type Unit, type UnitType } from "../../shared/developments.js";

/**
 * Demo pictures (Unsplash links), stages of the works and apartment types for
 * the seeded developments; units get their type, bedrooms, bathrooms and
 * garage spots from it.
 */

const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`;
const p = (id: string, kind: DevelopmentPhoto["kind"], caption: string, n: number): DevelopmentPhoto => ({ id: `ph-seed-${n}`, url: U(id), kind, caption });

let n = 0;
const PHOTOS: Record<string, [string, DevelopmentPhoto["kind"], string][]> = {
	"D-01": [
		["1545324418-cc1a3fa10c00", "photo", "Tower A from the street"],
		["1460317442991-0ec209397118", "photo", "Balconies on the south side"],
		["1560448204-e02f11c3d0e2", "photo", "Model unit: living room"],
		["1484154218962-a197022b5858", "photo", "Model unit: kitchen"],
		["1503387762-592deb58ef4e", "floor_plan", "Typical floor plans, Towers A and B"],
	],
	"D-02": [
		["1600566753190-17f0baa2a6c3", "render", "Render: the lofts when finished"],
		["1604014237800-1c9102c219da", "render", "Render: loft interior"],
		["1429497419816-9ca5cfb4571a", "construction", "Structure topped out"],
		["1565008447742-97f6f38c985c", "construction", "Facade panels going up"],
		["1503387762-592deb58ef4e", "floor_plan", "Loft floor plans"],
	],
	"D-03": [
		["1515263487990-61b07816b324", "photo", "Block A entrance"],
		["1574362848149-11496d93a7c7", "photo", "Blocks B and C"],
		["1502672260266-1c1ef2d93688", "photo", "Living room, 2-bedroom"],
		["1522708323590-d24dbb6b0267", "photo", "Living room, 3-bedroom"],
	],
	"D-04": [
		["1574362848149-11496d93a7c7", "photo", "Main building"],
		["1616594039964-ae9021a400a0", "photo", "Bedroom, 2-bedroom unit"],
		["1556912173-3bb406ef7e77", "photo", "Kitchen, 1-bedroom unit"],
	],
	"D-05": [
		["1519567241046-7f570eee3ce6", "render", "Render: the food court"],
		["1541888946425-d81bb19240f5", "construction", "North Wing slab pour"],
		["1504307651254-35680f356dfd", "construction", "Steel frame, North Wing"],
	],
	"D-06": [
		["1582407947304-fd86f028f716", "photo", "Millennium Tower"],
		["1497366216548-37526070297c", "photo", "Office floors"],
		["1497366811353-6870744d04b2", "photo", "Meeting rooms"],
		["1600607687939-ce8a6c25118c", "photo", "Residences: living room"],
	],
	"D-07": [
		["1519494026892-80bbd2d6fd0d", "render", "Render: clinic reception"],
		["1429497419816-9ca5cfb4571a", "construction", "Clinic Building, installations stage"],
		["1504307651254-35680f356dfd", "construction", "MEP crews on level 2"],
	],
	"D-08": [["1580582932707-520aed937b7b", "photo", "Classroom Wing"]],
	"D-09": [
		["1487958449943-2429e8be8625", "render", "Concept render"],
		["1503387762-592deb58ef4e", "floor_plan", "Gym layout, first draft"],
	],
	"D-10": [["1586528116311-ad8dd3c8310d", "photo", "Warehouse 1 inside"]],
};

const BLOCK_PHOTOS: Record<string, [string, string][]> = {
	"D-01-B1": [["1545324418-cc1a3fa10c00", "Tower A"]],
	"D-01-B2": [["1460317442991-0ec209397118", "Tower B"]],
	"D-02-B1": [["1429497419816-9ca5cfb4571a", "Main Building under construction"]],
	"D-03-B1": [["1515263487990-61b07816b324", "Block A"]],
	"D-03-B2": [["1574362848149-11496d93a7c7", "Block B"]],
	"D-06-B1": [["1497366216548-37526070297c", "Office Floors"]],
	"D-06-B2": [["1600607687939-ce8a6c25118c", "Residences"]],
};

const STAGES: Record<string, { stage: Development["stage"]; progress: number }> = {
	"D-02": { stage: "masonry_facade", progress: 55 },
	"D-05": { stage: "structure", progress: 35 },
	"D-07": { stage: "mep", progress: 70 },
};

/** Bathrooms and garage spots by what the unit is. */
function roomsOf(kind: string) {
	const bedrooms = bedroomsOf(kind);
	const home = /bedroom|studio|penthouse/i.test(kind);
	return {
		bedrooms,
		bathrooms: home ? (/penthouse/i.test(kind) ? 3 : bedrooms >= 2 ? 2 : 1) : 1,
		parking: home ? (bedrooms >= 3 ? 2 : bedrooms >= 1 ? 1 : 0) : /office/i.test(kind) ? 2 : /warehouse|bay/i.test(kind) ? 4 : 0,
	};
}

export function seedDevelopmentDetails(developments: Development[], blocks: Block[], units: Unit[]) {
	const devs: Development[] = [];
	const unitUpdates: Unit[] = [];
	const blockUpdates: Block[] = [];
	for (const d of developments) {
		const own = blocks.filter((b) => b.developmentId === d.id);
		const mine = units.filter((u) => own.some((b) => b.id === u.blockId));
		const kinds = [...new Set(mine.map((u) => u.kind))];
		const types: UnitType[] = kinds.map((kind, i) => {
			const same = mine.filter((u) => u.kind === kind);
			const area = Math.round(same.reduce((s, u) => s + u.areaSqft, 0) / Math.max(1, same.length) / 5) * 5;
			return { id: `ut-${d.id}-${i + 1}`, name: kind, areaSqft: area, ...roomsOf(kind), floorPlanUrl: "", description: "" };
		});
		devs.push({
			...d,
			photos: d.photos?.length ? d.photos : (PHOTOS[d.id] ?? []).map(([id, kind, caption]) => p(id, kind, caption, ++n)),
			unitTypes: d.unitTypes?.length ? d.unitTypes : types,
			...(d.status === "under_construction" && !d.stage ? (STAGES[d.id] ?? { stage: "structure", progress: 30 }) : {}),
		});
		for (const u of mine) {
			if (u.typeId) continue;
			const t = types.find((x) => x.name === u.kind);
			if (t) unitUpdates.push({ ...u, typeId: t.id, bedrooms: t.bedrooms, bathrooms: t.bathrooms, parking: t.parking });
		}
		for (const b of own) {
			if (b.photos?.length || !BLOCK_PHOTOS[b.id]) continue;
			blockUpdates.push({ ...b, photos: BLOCK_PHOTOS[b.id].map(([id, caption]) => p(id, "photo", caption, ++n)) });
		}
	}
	return { devs, unitUpdates, blockUpdates };
}
