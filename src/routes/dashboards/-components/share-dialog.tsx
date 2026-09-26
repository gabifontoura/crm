import { CheckIcon, GlobeIcon, LockSimpleIcon, MagnifyingGlassIcon, UsersThreeIcon, XIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { cn } from "#/lib/utils";
import { type Dashboard, type DashboardAudience, NO_AUDIENCE } from "../../../../shared/dashboards";
import { USER_ROLES, type User, type UserRole } from "../../../../shared/users";

type Mode = "private" | "everyone" | "chosen";
const ROLES = USER_ROLES.filter((r) => r.id !== "admin");
const PLURAL: Partial<Record<UserRole, string>> = { technician: "Service technicians", engineer: "Engineers", broker: "Real estate brokers" };

export const modeOf = (d: Pick<Dashboard, "shared" | "shareWith">): Mode =>
	d.shared ? "everyone" : d.shareWith && (d.shareWith.roles.length || d.shareWith.users.length) ? "chosen" : "private";

/** "Everyone", "Engineers, Mia Robinson and 2 more", "Only you". */
export function audienceLabel(d: Pick<Dashboard, "shared" | "shareWith">, userName: (id: string) => string): string {
	const mode = modeOf(d);
	if (mode === "everyone") return "shared with everyone";
	if (mode === "private") return "only you";
	const names = [...(d.shareWith?.roles ?? []).map((r) => PLURAL[r] ?? r), ...(d.shareWith?.users ?? []).map(userName)];
	return `shared with ${names.length > 3 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` : names.join(", ")}`;
}

/**
 * Who sees the dashboard, besides its owner and the administrators: only
 * you, everyone, or the accesses and people picked here. Each person sees
 * their own data in it.
 */
export function ShareDialog({
	value,
	users,
	ownerId,
	onClose,
	onApply,
}: {
	value: Pick<Dashboard, "shared" | "shareWith">;
	users: User[];
	ownerId: string;
	onClose: () => void;
	onApply: (v: { shared: boolean; shareWith: DashboardAudience }) => void;
}) {
	const [mode, setMode] = useState<Mode>(modeOf(value));
	const [roles, setRoles] = useState<UserRole[]>(value.shareWith?.roles ?? []);
	const [people, setPeople] = useState<string[]>(value.shareWith?.users ?? []);
	const [search, setSearch] = useState("");

	const candidates = useMemo(
		() =>
			users
				.filter((u) => u.active && u.id !== ownerId && u.role !== "admin")
				.filter((u) => !search.trim() || `${u.name} ${u.jobTitle}`.toLowerCase().includes(search.trim().toLowerCase()))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[users, ownerId, search],
	);
	const byRole = (r: UserRole) => roles.includes(r);
	const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
	const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "Former member";
	const nothingChosen = mode === "chosen" && roles.length === 0 && people.length === 0;

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="!max-w-[95vw] max-h-[90vh] overflow-y-auto sm:!max-w-lg">
				<DialogTitle>Share the dashboard</DialogTitle>
				<DialogDescription>Each person sees their own data in it. Administrators always see every dashboard.</DialogDescription>

				<div className="flex flex-col gap-2" role="radiogroup" aria-label="Who sees it">
					{(
						[
							{ id: "private", icon: LockSimpleIcon, label: "Only me", hint: "Nobody else sees it." },
							{ id: "everyone", icon: GlobeIcon, label: "Everyone", hint: "The whole team." },
							{ id: "chosen", icon: UsersThreeIcon, label: "Chosen accesses and people", hint: "Pick accesses, people, or both." },
						] as const
					).map((o) => (
						<button
							key={o.id}
							type="button"
							role="radio"
							aria-checked={mode === o.id}
							onClick={() => setMode(o.id)}
							className={cn("flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors", mode === o.id ? "border-brand bg-brand/5" : "border-border hover:bg-muted/40")}
						>
							<span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", mode === o.id ? "bg-brand text-white" : "bg-muted text-muted-foreground")}>
								<o.icon className="size-4" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block font-medium text-sm">{o.label}</span>
								<span className="block text-muted-foreground text-xs">{o.hint}</span>
							</span>
							{mode === o.id && <CheckIcon className="size-4 text-brand" weight="bold" />}
						</button>
					))}
				</div>

				{mode === "chosen" && (
					<div className="flex flex-col gap-4 rounded-lg border border-border p-3">
						<div className="flex flex-col gap-2">
							<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Accesses</p>
							<div className="flex flex-wrap gap-1.5">
								{ROLES.map((r) => (
									<button
										key={r.id}
										type="button"
										aria-pressed={byRole(r.id)}
										onClick={() => setRoles((l) => toggle(l, r.id))}
										className={cn(
											"inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
											byRole(r.id) ? "border-brand bg-brand text-white" : "border-border hover:bg-muted",
										)}
									>
										{byRole(r.id) && <CheckIcon className="size-3" weight="bold" />}
										{PLURAL[r.id] ?? r.label}
									</button>
								))}
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">People</p>
							{people.length > 0 && (
								<div className="flex flex-wrap gap-1.5">
									{people.map((id) => (
										<span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
											{nameOf(id)}
											<button type="button" aria-label={`Remove ${nameOf(id)}`} onClick={() => setPeople((l) => l.filter((x) => x !== id))}>
												<XIcon className="size-3" />
											</button>
										</span>
									))}
								</div>
							)}
							<div className="relative">
								<MagnifyingGlassIcon className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
								<Input aria-label="Search people" placeholder="Search people" className="h-9 pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
							</div>
							<ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
								{candidates.map((u) => {
									const viaRole = byRole(u.role);
									return (
										<li key={u.id}>
											<label className={cn("flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/40", viaRole && "cursor-default opacity-60")}>
												<Checkbox checked={viaRole || people.includes(u.id)} disabled={viaRole} onCheckedChange={() => setPeople((l) => toggle(l, u.id))} />
												<span className="min-w-0 flex-1">
													<span className="block truncate">{u.name}</span>
													<span className="block text-muted-foreground text-xs">
														{u.jobTitle}
														{viaRole && ` · sees it as one of the ${(PLURAL[u.role] ?? u.role).toLowerCase()}`}
													</span>
												</span>
											</label>
										</li>
									);
								})}
								{candidates.length === 0 && <li className="px-3 py-3 text-center text-muted-foreground text-sm">Nobody found</li>}
							</ul>
						</div>
					</div>
				)}

				<div className="flex justify-end gap-2">
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button
						disabled={nothingChosen}
						onClick={() =>
							onApply(
								mode === "everyone"
									? { shared: true, shareWith: NO_AUDIENCE }
									: mode === "private"
										? { shared: false, shareWith: NO_AUDIENCE }
										: { shared: false, shareWith: { roles, users: people } },
							)
						}
					>
						Done
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
