import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { apiClient, errorMessage } from "#/lib/api/client";
import type { CalendarEvent, CalendarFilters } from "./types";

/** Appointments before the backend existed; removed so stale test data goes away. */
const LEGACY_KEYS = ["calendar.events.v1", "calendar.events.v2"];

/** API shape: dates travel as ISO strings. */
type WireEvent = Omit<CalendarEvent, "start" | "end"> & { start: string; end: string };

function revive(e: WireEvent): CalendarEvent {
	return { ...e, start: new Date(e.start), end: new Date(e.end) };
}

function toWire(e: CalendarEvent): WireEvent {
	return { ...e, start: e.start.toISOString(), end: e.end.toISOString() };
}

export interface CalendarStore {
	events: CalendarEvent[];
	loading: boolean;
	error: string | null;
	reload: () => Promise<void>;
	/** Resolves with the saved event, or rejects (and shows a toast) on error. */
	create: (e: CalendarEvent) => Promise<CalendarEvent>;
	update: (e: CalendarEvent) => Promise<CalendarEvent>;
	remove: (id: string) => Promise<void>;
}

/**
 * Appointments from `/api/calendar/events`. The API only returns what the
 * signed-in user may see: admins get everyone's, others only their own.
 * Pass the user id so the list reloads when someone else signs in.
 */
export function useCalendarEvents(userId: string | undefined): CalendarStore {
	const [events, setEvents] = useState<CalendarEvent[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		try {
			for (const k of LEGACY_KEYS) localStorage.removeItem(k);
		} catch {
			/* ignore */
		}
	}, []);

	const reload = useCallback(async () => {
		if (!userId) return;
		setLoading(true);
		try {
			const data = await apiClient.get<WireEvent[]>("/api/calendar/events");
			setEvents(data.map(revive));
			setError(null);
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setLoading(false);
		}
	}, [userId]);

	useEffect(() => {
		setEvents([]);
		reload();
	}, [reload]);

	const create = useCallback(async (e: CalendarEvent) => {
		try {
			const saved = revive(await apiClient.post<WireEvent>("/api/calendar/events", toWire(e)));
			setEvents((prev) => [...prev, saved]);
			return saved;
		} catch (err) {
			toast.error(errorMessage(err));
			throw err;
		}
	}, []);

	const update = useCallback(async (e: CalendarEvent) => {
		let previous: CalendarEvent | undefined;
		// Optimistic: show the change right away, roll back if the API refuses it.
		setEvents((prev) => {
			previous = prev.find((x) => x.id === e.id);
			return prev.map((x) => (x.id === e.id ? e : x));
		});
		try {
			const saved = revive(await apiClient.put<WireEvent>(`/api/calendar/events/${encodeURIComponent(e.id)}`, toWire(e)));
			setEvents((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
			return saved;
		} catch (err) {
			if (previous) {
				const restore = previous;
				setEvents((prev) => prev.map((x) => (x.id === restore.id ? restore : x)));
			}
			toast.error(errorMessage(err));
			throw err;
		}
	}, []);

	const remove = useCallback(async (id: string) => {
		try {
			await apiClient.delete(`/api/calendar/events/${encodeURIComponent(id)}`);
			setEvents((prev) => prev.filter((x) => x.id !== id));
		} catch (err) {
			toast.error(errorMessage(err));
			throw err;
		}
	}, []);

	return { events, loading, error, reload, create, update, remove };
}

export function useFilterOptions(events: CalendarEvent[]) {
	return useMemo(() => {
		const properties = Array.from(new Set(events.map((e) => e.property).filter((p) => p && p !== "—"))).sort();
		const owners = Array.from(new Map(events.map((e) => [e.owner.id, e.owner])).values()).sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		return { properties, owners };
	}, [events]);
}

export function filterEvents(events: CalendarEvent[], filters: CalendarFilters): CalendarEvent[] {
	return events.filter((e) => {
		if (filters.property && e.property !== filters.property) return false;
		if (filters.owner && e.owner.id !== filters.owner) return false;
		if (filters.types.length > 0 && !filters.types.includes(e.type)) return false;
		if (filters.mode !== "all" && e.mode !== filters.mode) return false;
		if (filters.pendingOnly && e.completed) return false;
		if (filters.startDate) {
			const from = new Date(`${filters.startDate}T00:00:00`);
			if (e.start < from) return false;
		}
		if (filters.endDate) {
			const to = new Date(`${filters.endDate}T23:59:59`);
			if (e.start > to) return false;
		}
		return true;
	});
}

export const EMPTY_FILTERS: CalendarFilters = {
	property: "",
	owner: "",
	types: [],
	mode: "all",
	pendingOnly: false,
	startDate: "",
	endDate: "",
};

export function countActiveFilters(f: CalendarFilters): number {
	let n = 0;
	if (f.property) n++;
	if (f.owner) n++;
	if (f.types.length) n++;
	if (f.mode !== "all") n++;
	if (f.pendingOnly) n++;
	if (f.startDate || f.endDate) n++;
	return n;
}
