import { type ActionId, menuAccessFrom, mayDo, SCREEN_ACTIONS } from "../../shared/access.js";
import type { User } from "../../shared/users.js";
import type { Repos } from "../repos/types.js";
import { forbidden } from "./http.js";

const LABEL = Object.fromEntries(Object.values(SCREEN_ACTIONS).flatMap((list) => list.map((a) => [a.id, a.label.toLowerCase()]))) as Record<ActionId, string>;

/** What an administrator switched on for this access in Settings > Menu by access. */
export async function allows(repos: Repos, me: User, action: ActionId): Promise<boolean> {
	if (me.role === "admin") return true;
	return mayDo(me, menuAccessFrom(await repos.settings.get("settings.menuAccess")), action);
}

export async function requireAction(repos: Repos, me: User, action: ActionId) {
	if (!(await allows(repos, me, action))) forbidden(`Your access can't ${LABEL[action]}. An administrator can turn it on in Settings.`);
}
