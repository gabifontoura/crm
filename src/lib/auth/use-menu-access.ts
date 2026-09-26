import { useEffect, useState } from "react";
import { apiClient } from "#/lib/api/client";
import { DEFAULT_MENU_ACCESS, type MenuAccess, menuAccessFrom } from "../../../shared/access";

/**
 * The screens each access has in the menu (set by an administrator in
 * Settings). Loaded once and shared; saving in Settings refreshes everyone.
 */
let cached: MenuAccess | null = null;
let pending: Promise<MenuAccess> | null = null;
const listeners = new Set<(a: MenuAccess) => void>();

function load(): Promise<MenuAccess> {
	if (!pending) {
		pending = apiClient
			.get<{ value: unknown }>("/api/settings/menuAccess")
			.then((r) => menuAccessFrom(r.value))
			.catch(() => DEFAULT_MENU_ACCESS)
			.then((a) => {
				cached = a;
				for (const l of listeners) l(a);
				return a;
			});
	}
	return pending;
}

/** After saving in Settings: every menu picks the new access up. */
export function publishMenuAccess(a: MenuAccess) {
	cached = a;
	pending = Promise.resolve(a);
	for (const l of listeners) l(a);
}

/** Null while loading (menus then show nothing they'd have to take back). */
export function useMenuAccess(userId: string | undefined): MenuAccess | null {
	const [access, setAccess] = useState<MenuAccess | null>(cached);
	useEffect(() => {
		if (!userId) return;
		listeners.add(setAccess);
		load().then(setAccess);
		return () => {
			listeners.delete(setAccess);
		};
	}, [userId]);
	return access;
}
