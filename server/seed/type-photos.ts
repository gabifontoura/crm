import type { Development, UnitType } from "../../shared/developments.js";

const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`;

/** A picture for each apartment type, by what it is (interiors for homes). */
function photoFor(t: UnitType, i: number): string {
	const n = t.name.toLowerCase();
	if (/penthouse/.test(n)) return U("1600607687939-ce8a6c25118c");
	if (/studio|loft/.test(n)) return U("1522708323590-d24dbb6b0267");
	if (/retail|store|kiosk/.test(n)) return U("1519567241046-7f570eee3ce6");
	if (/office|suite/.test(n)) return U("1497366811353-6870744d04b2");
	if (/classroom/.test(n)) return U("1580582932707-520aed937b7b");
	if (/clinic|^room/.test(n)) return U("1519494026892-80bbd2d6fd0d");
	if (/warehouse|bay/.test(n)) return U("1586528116311-ad8dd3c8310d");
	const homes = ["1502672260266-1c1ef2d93688", "1560448204-e02f11c3d0e2", "1616594039964-ae9021a400a0", "1604014237800-1c9102c219da"];
	return U(t.bedrooms >= 3 ? homes[3] : t.bedrooms === 2 ? homes[i % 2 ? 1 : 0] : homes[2]);
}

const CLINIC = U("1519494026892-80bbd2d6fd0d");

/** Types without a photo get one; `fix` also redoes homes that wrongly got the clinic picture. */
export function seedTypePhotos(devs: Development[], fix = false): Development[] {
	return devs.map((d) => ({
		...d,
		unitTypes: (d.unitTypes ?? []).map((t, i) => (t.photoUrl && !(fix && t.photoUrl === CLINIC && t.bedrooms > 0) ? t : { ...t, photoUrl: photoFor(t, i) })),
	}));
}
