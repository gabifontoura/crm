import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiClient, errorMessage } from "#/lib/api/client";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import {
	type AppointmentTypeDef,
	DEFAULT_APPOINTMENT_TYPES,
	DEFAULT_CARD_FIELDS,
	DEFAULT_HOURS,
	DEFAULT_TAGS,
	darken,
	PASTEL_BORDERS,
	PASTEL_PALETTE,
	UNKNOWN_TYPE,
} from "./constants";
import type { AppointmentType, CardField, TagDef } from "./types";

export interface TypeColor {
	background: string;
	border: string;
}

export interface HoursConfig {
	startHour: number;
	endHour: number;
}

/** What the card shows: which fields and which tags. */
export interface CardConfig {
	fields: Record<CardField, boolean>;
	tags: TagDef[];
}

/** Everything an admin can customize; stored on the server as one document. */
interface StoredSettings {
	types: AppointmentTypeDef[];
	customSwatches: TypeColor[];
	fields: Record<CardField, boolean>;
	tags: TagDef[];
	hours: HoursConfig;
}

/** Settings from before the backend existed. */
const LEGACY_KEYS = [
	"calendar.appointmentTypes.v3",
	"calendar.customSwatches.v3",
	"calendar.cardFields.v3",
	"calendar.tags.v3",
	"calendar.hours.v2",
	"calendar.typeColors.v2",
	"calendar.visibleTags.v2",
];

const SAVE_DELAY_MS = 600;

/** Adds built-in types/tags shipped after the settings were first saved. */
function withBuiltIns(value: StoredSettings): StoredSettings {
	// "Technical question" is asked from a task action now, not booked.
	const types = value.types.filter((t) => t.id !== "technical_question");
	for (const t of DEFAULT_APPOINTMENT_TYPES) if (!types.some((x) => x.id === t.id)) types.push(t);
	// "Timecard info" was a built-in tag once; it no longer exists.
	const tags = value.tags.filter((t) => t.id !== "timecard_info");
	for (const t of DEFAULT_TAGS) if (!tags.some((x) => x.id === t.id)) tags.push(t);
	return {
		types,
		customSwatches: value.customSwatches ?? [],
		fields: { ...DEFAULT_CARD_FIELDS, ...value.fields },
		tags,
		hours: { ...DEFAULT_HOURS, ...value.hours },
	};
}

function slug(label: string): string {
	const base = label
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_|_$/g, "");
	return `${base || "item"}_${Date.now().toString(36)}`;
}

/** Only admins may change these settings; the API rejects saves from anyone else. */
export function useCanCustomizeColors() {
	const { can } = useCurrentUser();
	return { can: can("calendar.customizeColors") };
}

/**
 * Calendar colors, card fields, tags and hours, shared by the whole team via
 * `/api/settings/calendar`. Everyone reads them; changes are saved (debounced)
 * only when `canSave` is true. With `manual`, nothing is saved until `save()`
 * (the Settings page shows Save / Discard buttons).
 */
export function useCalendarSettings(canSave: boolean, { manual = false }: { manual?: boolean } = {}) {
	const [types, setTypes] = useState<AppointmentTypeDef[]>(DEFAULT_APPOINTMENT_TYPES);
	const [customSwatches, setCustomSwatches] = useState<TypeColor[]>([]);
	const [fields, setFields] = useState<Record<CardField, boolean>>(DEFAULT_CARD_FIELDS);
	const [tags, setTags] = useState<TagDef[]>(DEFAULT_TAGS);
	const [hours, setHours] = useState<HoursConfig>(DEFAULT_HOURS);
	const [loaded, setLoaded] = useState(false);
	// JSON of what the server has, so loading from it doesn't trigger a save.
	const synced = useRef<string>("");
	const [savedJson, setSavedJson] = useState("");
	const [saving, setSaving] = useState(false);
	const apply = useCallback((v: StoredSettings) => {
		setTypes(v.types);
		setCustomSwatches(v.customSwatches);
		setFields(v.fields);
		setTags(v.tags);
		setHours(v.hours);
	}, []);

	useEffect(() => {
		try {
			for (const k of LEGACY_KEYS) localStorage.removeItem(k);
		} catch {
			/* ignore */
		}
		let cancelled = false;
		apiClient
			.get<{ value: StoredSettings | null }>("/api/settings/calendar")
			.then(({ value }) => {
				if (cancelled) return;
				const v = withBuiltIns(
					value ?? { types: DEFAULT_APPOINTMENT_TYPES, customSwatches: [], fields: DEFAULT_CARD_FIELDS, tags: DEFAULT_TAGS, hours: DEFAULT_HOURS },
				);
				synced.current = JSON.stringify(v);
				setSavedJson(synced.current);
				apply(v);
			})
			.catch(() => {
				/* keep the defaults; the calendar still works */
			})
			.finally(() => !cancelled && setLoaded(true));
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!loaded || !canSave || manual) return;
		const value: StoredSettings = { types, customSwatches, fields, tags, hours };
		const json = JSON.stringify(value);
		if (json === synced.current) return;
		const timer = setTimeout(() => {
			apiClient
				.put("/api/settings/calendar", { value })
				.then(() => {
					synced.current = json;
					setSavedJson(json);
				})
				.catch((e) => toast.error(`Settings not saved: ${errorMessage(e)}`));
		}, SAVE_DELAY_MS);
		return () => clearTimeout(timer);
	}, [loaded, canSave, manual, types, customSwatches, fields, tags, hours]);

	const current: StoredSettings = { types, customSwatches, fields, tags, hours };
	const dirty = loaded && savedJson !== "" && JSON.stringify(current) !== savedJson;
	const save = useCallback(async () => {
		const value: StoredSettings = { types, customSwatches, fields, tags, hours };
		setSaving(true);
		try {
			await apiClient.put("/api/settings/calendar", { value });
			synced.current = JSON.stringify(value);
			setSavedJson(synced.current);
			toast.success("Calendar settings saved.");
		} catch (e) {
			toast.error(`Settings not saved: ${errorMessage(e)}`);
		} finally {
			setSaving(false);
		}
	}, [types, customSwatches, fields, tags, hours]);
	const discard = useCallback(() => {
		if (savedJson) apply(JSON.parse(savedJson) as StoredSettings);
	}, [savedJson, apply]);

	// Appointment types (card colors)
	const typeDef = useCallback(
		(id: AppointmentType) => types.find((t) => t.id === id) ?? UNKNOWN_TYPE,
		[types],
	);
	const colorForType = useCallback(
		(id: AppointmentType): TypeColor => {
			const t = typeDef(id);
			return { background: t.background, border: t.border };
		},
		[typeDef],
	);
	const setTypeColor = useCallback((id: AppointmentType, color: TypeColor) => {
		setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, ...color } : t)));
	}, []);
	const renameType = useCallback((id: AppointmentType, label: string) => {
		setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, label } : t)));
	}, []);
	const addType = useCallback((label: string, color: TypeColor) => {
		setTypes((prev) => [...prev, { id: slug(label), label, ...color }]);
	}, []);
	const removeType = useCallback((id: AppointmentType) => {
		setTypes((prev) => prev.filter((t) => t.id !== id || t.builtIn));
	}, []);
	const resetColors = useCallback(() => {
		// Keeps custom types, restores the shipped colors and names.
		setTypes((prev) => [
			...DEFAULT_APPOINTMENT_TYPES,
			...prev.filter((t) => !t.builtIn),
		]);
	}, []);

	// Custom palette colors
	const addSwatch = useCallback((background: string) => {
		const color = { background: background.toUpperCase(), border: darken(background) };
		setCustomSwatches((prev) =>
			prev.some((s) => s.background === color.background) ? prev : [...prev, color],
		);
		return color;
	}, []);
	const removeSwatch = useCallback((background: string) => {
		setCustomSwatches((prev) => prev.filter((s) => s.background !== background));
	}, []);

	// Card fields
	const toggleField = useCallback((id: CardField, value: boolean) => {
		setFields((prev) => ({ ...prev, [id]: value }));
	}, []);
	const resetFields = useCallback(() => setFields(DEFAULT_CARD_FIELDS), []);

	// Tags
	const updateTag = useCallback((id: string, patch: Partial<Omit<TagDef, "id" | "builtIn">>) => {
		setTags((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
	}, []);
	const addTag = useCallback((label: string, color: string) => {
		setTags((prev) => [...prev, { id: slug(label), label, color, visible: true }]);
	}, []);
	const removeTag = useCallback((id: string) => {
		setTags((prev) => prev.filter((t) => t.id !== id || t.builtIn));
	}, []);
	const moveTag = useCallback((id: string, delta: -1 | 1) => {
		setTags((prev) => {
			const i = prev.findIndex((t) => t.id === id);
			const j = i + delta;
			if (i < 0 || j < 0 || j >= prev.length) return prev;
			const next = [...prev];
			[next[i], next[j]] = [next[j], next[i]];
			return next;
		});
	}, []);
	const reorderTags = useCallback((from: number, to: number) => {
		setTags((prev) => {
			const next = [...prev];
			const [item] = next.splice(from, 1);
			next.splice(to, 0, item);
			return next;
		});
	}, []);
	const resetTags = useCallback(() => {
		setTags((prev) => [...DEFAULT_TAGS, ...prev.filter((t) => !t.builtIn)]);
	}, []);

	const setHoursConfig = useCallback((h: HoursConfig) => setHours(h), []);

	const palette: TypeColor[] = [
		...PASTEL_PALETTE.map((background, i) => ({ background, border: PASTEL_BORDERS[i] })),
		...customSwatches,
	];

	return {
		types,
		typeDef,
		colorForType,
		setTypeColor,
		renameType,
		addType,
		removeType,
		resetColors,
		palette,
		customSwatches,
		addSwatch,
		removeSwatch,
		card: { fields, tags } satisfies CardConfig,
		toggleField,
		resetFields,
		updateTag,
		addTag,
		removeTag,
		moveTag,
		reorderTags,
		resetTags,
		hours,
		setHoursConfig,
		dirty,
		saving,
		save,
		discard,
	};
}

export type CalendarSettings = ReturnType<typeof useCalendarSettings>;
