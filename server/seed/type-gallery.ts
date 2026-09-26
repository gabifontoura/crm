import { type Development, type DevelopmentPhoto, typePhotos } from "../../shared/developments.js";

const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`;
const ph = (id: string, caption: string, n: string): DevelopmentPhoto => ({ id: `ph-type-${n}`, url: U(id), caption, kind: "photo" });

/** Homes get a few rooms each (living, kitchen, bedroom) so their carousel has something to show. */
export function seedTypeGalleries(devs: Development[]): Development[] {
	return devs.map((d) => ({
		...d,
		unitTypes: (d.unitTypes ?? []).map((t) => {
			const current = typePhotos(t);
			if (current.length > 1 || !/bedroom|studio|penthouse|loft/i.test(t.name)) return { ...t, photos: current };
			const main = current[0] ? { ...current[0], caption: current[0].caption || "Living room" } : ph("1502672260266-1c1ef2d93688", "Living room", `${t.id}-1`);
			const extra = [
				ph("1484154218962-a197022b5858", "Kitchen", `${t.id}-2`),
				...(t.bedrooms > 0 ? [ph("1616594039964-ae9021a400a0", "Main bedroom", `${t.id}-3`)] : []),
				ph("1556912173-3bb406ef7e77", "Kitchen and dining", `${t.id}-4`),
			].filter((x) => x.url !== main.url);
			return { ...t, photos: [main, ...extra], photoUrl: main.url };
		}),
	}));
}
