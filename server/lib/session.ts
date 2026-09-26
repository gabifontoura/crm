import { menuAccessFrom, profileOf } from "../../shared/access.js";
import type { User } from "../../shared/users.js";
import type { Repos } from "../repos/types.js";
import { forbidden, HttpError, type ApiRequest } from "./http.js";

/**
 * Who is making the request.
 *
 * DEMO ONLY: the client says who it is with the `x-user-id` header ("Sign in
 * as" in the app). That is fine for a portfolio, but anyone can send any id.
 * For real use, replace this with Supabase Auth: verify the JWT from the
 * `Authorization` header and look the user up by the token's subject.
 */
export async function currentUser(req: ApiRequest, repos: Repos): Promise<User> {
	const id = req.headers["x-user-id"];
	if (!id) throw new HttpError(401, "Choose a user to sign in as.");
	const user = await repos.users.get(id);
	if (!user) throw new HttpError(401, "Unknown user. Sign in again.");
	if (!user.active) throw new HttpError(403, "This user is inactive.");
	// Extra read-only views their access profile gives (e.g. an HR access seeing the team's schedule).
	if (user.role === "admin") return user;
	const profile = profileOf(user, menuAccessFrom(await repos.settings.get("settings.menuAccess")));
	return profile?.sees ? { ...user, sees: profile.sees } : user;
}

export function requireAdmin(user: User): void {
	if (user.role !== "admin") forbidden("Only administrators can do this.");
}
