import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "../../../shared/users";
import { apiClient, sessionUserId, setSessionUserId } from "../api/client";

/**
 * Demo sign-in: pick a team member and the whole app (and the API, through
 * the `x-user-id` header) acts as that person. Replace with Supabase Auth for
 * real use; screens only depend on `useCurrentUser()`.
 */

interface SessionValue {
	user: User | null;
	/** Everyone on the team, active first (for the "Sign in as" menu). */
	users: User[];
	loading: boolean;
	error: string | null;
	signInAs: (id: string) => void;
	/** Reloads the team list, e.g. after editing someone on the Team page. */
	refreshUsers: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
	const [users, setUsers] = useState<User[]>([]);
	const [userId, setUserId] = useState<string | null>(() => sessionUserId());
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refreshUsers = useCallback(async () => {
		try {
			const list = await apiClient.get<User[]>("/api/users");
			setUsers(list);
			setError(null);
			// First visit, or the saved user no longer exists: default to the first admin.
			setUserId((current) => {
				const valid = list.find((u) => u.id === current && u.active);
				const next = valid?.id ?? list.find((u) => u.role === "admin" && u.active)?.id ?? list[0]?.id ?? null;
				setSessionUserId(next);
				return next;
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : "Couldn't load the team.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refreshUsers();
	}, [refreshUsers]);

	const signInAs = useCallback((id: string) => {
		setSessionUserId(id);
		setUserId(id);
	}, []);

	const value = useMemo<SessionValue>(
		() => ({ user: users.find((u) => u.id === userId) ?? null, users, loading, error, signInAs, refreshUsers }),
		[users, userId, loading, error, signInAs, refreshUsers],
	);

	return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
	const ctx = useContext(SessionContext);
	if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
	return ctx;
}
