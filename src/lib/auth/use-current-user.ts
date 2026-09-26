import { useCallback, useMemo } from "react";
import { canSeeAllSchedules, initialsOf, roleLabel, type User } from "../../../shared/users";
import { type ActionId, ALL_ACTIONS, mayDo, menuAccessFrom, profileOf } from "../../../shared/access";
import { useSession } from "./session";
import { useMenuAccess } from "./use-menu-access";

/**
 * Signed-in user and what they may do. Permissions follow the role:
 * administrators manage everything; technicians and brokers manage only
 * their own appointments. The API enforces the same rules.
 */

export type Permission =
	/** What an access may do on its screens, set in Settings > Menu by access (calendar.create…). */
	| ActionId
	/** See and manage every person's schedule (not only your own). */
	| "calendar.viewAll"
	| "calendar.customizeColors"
	| "team.manage"
	| "developments.manage"
	| "releases.manage";

function permissionsFor(user: User | null): Permission[] {
	if (!user || !user.active) return [];
	if (canSeeAllSchedules(user.role)) {
		return [
			...ALL_ACTIONS,
			"calendar.viewAll",
			"calendar.customizeColors",
			"team.manage",
			"developments.manage",
			"releases.manage",
		];
	}
	return [];
}

const isAction = new Set<string>(ALL_ACTIONS);

export function useCurrentUser() {
	const { user } = useSession();
	// Memoized so pages can use `user` in effect dependencies without looping.
	const current = useMemo(
		() => (user ? { ...user, initials: initialsOf(user.name), roleName: roleLabel(user.role) } : null),
		[user],
	);
	const permissions = useMemo(() => permissionsFor(user), [user]);
	// Until the access loads, the defaults apply (everything on), so buttons don't flicker away.
	const access = useMenuAccess(user?.id) ?? menuAccessFrom(null);
	const can = useCallback(
		(permission: Permission) =>
			permissions.includes(permission) || Boolean(user?.active && isAction.has(permission) && mayDo(user, access, permission as ActionId)),
		[permissions, user, access],
	);
	// Follows every technician's work (read only): admins, engineering, and accesses set to see the team.
	const seesTeam = Boolean(
		user?.active && (canSeeAllSchedules(user.role) || user.role === "engineer" || profileOf(user, access)?.sees?.team),
	);
	return { user: current, can, seesTeam };
}
