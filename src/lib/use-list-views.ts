import { useEffect, useMemo, useState } from "react";
import { apiClient } from "#/lib/api/client";
import { DEFAULT_LIST_VIEWS, type ListId, type ListViews, listViewsFrom, shownColumns } from "../../shared/list-views";

/**
 * The columns each list shows (Settings › Lists & columns). Loaded once and
 * shared; saving in Settings refreshes every screen.
 */
let cached: ListViews | null = null;
let pending: Promise<ListViews> | null = null;
const listeners = new Set<(v: ListViews) => void>();

function load(): Promise<ListViews> {
	if (!pending) {
		pending = apiClient
			.get<{ value: unknown }>("/api/settings/listViews")
			.then((r) => listViewsFrom(r.value))
			.catch(() => DEFAULT_LIST_VIEWS)
			.then((v) => {
				cached = v;
				for (const l of listeners) l(v);
				return v;
			});
	}
	return pending;
}

/** After saving in Settings: every list picks the new columns up. */
export function publishListViews(v: ListViews) {
	cached = v;
	pending = Promise.resolve(v);
	for (const l of listeners) l(v);
}

/** Every list's columns (the defaults until loaded). */
export function useListViews(): ListViews {
	const [views, setViews] = useState<ListViews>(cached ?? DEFAULT_LIST_VIEWS);
	useEffect(() => {
		listeners.add(setViews);
		load().then(setViews);
		return () => {
			listeners.delete(setViews);
		};
	}, []);
	return views;
}

/** One list's shown columns, in order, with a quick `has(id)`. */
export function useColumns(list: ListId, isAdmin: boolean) {
	const views = useListViews();
	return useMemo(() => {
		const ids = shownColumns(views, list, isAdmin);
		const set = new Set(ids);
		return { ids, has: (id: string) => set.has(id) };
	}, [views, list, isAdmin]);
}
