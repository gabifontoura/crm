/**
 * The one set of color tones used across the CRM, taken from the calendar
 * cards: every tone has a soft background and a border (how appointment cards
 * look) and a solid shade (dots, badges, text). Ticket types, statuses, lead
 * stages, tags and appointment types all pick from it, so a "blue" is the
 * same blue everywhere. Colors are stored as hex; the solid one identifies
 * the tone for everything but calendar cards, which store soft + border.
 */
export interface Tone {
	id: string;
	label: string;
	/** Card background. */
	soft: string;
	/** Card border. */
	border: string;
	/** Dots, badge text, chart lines. */
	solid: string;
}

export const TONES: Tone[] = [
	{ id: "red", label: "Red", soft: "#FECACA", border: "#F87171", solid: "#DC2626" },
	{ id: "orange", label: "Orange", soft: "#FED7AA", border: "#FB923C", solid: "#EA580C" },
	{ id: "yellow", label: "Yellow", soft: "#FEF9C3", border: "#FACC15", solid: "#CA8A04" },
	{ id: "lime", label: "Lime", soft: "#D9F99D", border: "#84CC16", solid: "#65A30D" },
	{ id: "green", label: "Green", soft: "#BBF7D0", border: "#4ADE80", solid: "#16A34A" },
	{ id: "teal", label: "Teal", soft: "#A7F3D0", border: "#34D399", solid: "#0D9488" },
	{ id: "sky", label: "Sky", soft: "#BAE6FD", border: "#38BDF8", solid: "#0EA5E9" },
	{ id: "blue", label: "Blue", soft: "#BFDBFE", border: "#60A5FA", solid: "#2B6CB0" },
	{ id: "indigo", label: "Indigo", soft: "#C7D2FE", border: "#818CF8", solid: "#4F46E5" },
	{ id: "violet", label: "Violet", soft: "#DDD6FE", border: "#A78BFA", solid: "#7C3AED" },
	{ id: "purple", label: "Purple", soft: "#E9D5FF", border: "#C084FC", solid: "#9333EA" },
	{ id: "pink", label: "Pink", soft: "#FBCFE8", border: "#F472B6", solid: "#DB2777" },
	{ id: "fuchsia", label: "Fuchsia", soft: "#F5D0FE", border: "#E879F9", solid: "#C026D3" },
	{ id: "slate", label: "Slate", soft: "#E2E8F0", border: "#94A3B8", solid: "#64748B" },
	{ id: "gray", label: "Light gray", soft: "#F1F5F9", border: "#CBD5E1", solid: "#94A3B8" },
];

/** Solid shades, for statuses, ticket types, stages and tags. */
export const SOLID_COLORS = TONES.map((t) => t.solid);

/** The tone a stored color belongs to (by its solid, soft or border hex). */
export function toneOf(hex: string | undefined): Tone | undefined {
	if (!hex) return undefined;
	const h = hex.toUpperCase();
	return TONES.find((t) => t.solid === h || t.soft === h || t.border === h);
}
