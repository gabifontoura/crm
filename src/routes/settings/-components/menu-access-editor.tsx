import {
	ArrowBendUpRightIcon,
	BriefcaseIcon,
	ArrowCounterClockwiseIcon,
	CalendarPlusIcon,
	CaretDownIcon,
	CheckIcon,
	CurrencyDollarIcon,
	EyeIcon,
	HardHatIcon,
	HouseIcon,
	type Icon,
	ListChecksIcon,
	LockSimpleIcon,
	MagnifyingGlassIcon,
	PencilSimpleIcon,
	PlusIcon,
	ShieldCheckIcon,
	TrashIcon,
	UserGearIcon,
	WrenchIcon,
	HandshakeIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { apiClient, errorMessage } from "#/lib/api/client";
import { publishMenuAccess } from "#/lib/auth/use-menu-access";
import { cn } from "#/lib/utils";
import {
	ACCESS_RULES,
	BASE_HOW,
	type AccessProfile,
	type ActionId,
	ALL_ACTIONS,
	homeFor,
	profileFrom,
	MENU_ROLES,
	type MenuAccess,
	menuAccessFrom,
	type MenuRole,
	SCREEN_ACTIONS,
	SCREEN_INFO,
	SCREENS,
	type ScreenId,
} from "../../../../shared/access";
import { useSession } from "#/lib/auth/session";

const BASE_ICON: Record<MenuRole, Icon> = { technician: WrenchIcon, engineer: HardHatIcon, broker: HandshakeIcon, staff: BriefcaseIcon };
const BASE_LABEL: Record<MenuRole, string> = { technician: "Service technician", engineer: "Engineer", broker: "Real estate broker", staff: "Back office" };
const ACTION_ICON: Record<string, Icon> = {
	plus: PlusIcon,
	pencil: PencilSimpleIcon,
	trash: TrashIcon,
	calendar: CalendarPlusIcon,
	list: ListChecksIcon,
	forward: ArrowBendUpRightIcon,
	money: CurrencyDollarIcon,
};
const actionsOf = (id: ScreenId) => (SCREEN_ACTIONS as Partial<Record<ScreenId, readonly { id: ActionId; label: string; hint: string; icon: string }[]>>)[id] ?? [];
const ADMIN = "admin";

/**
 * Access profiles, as many as needed: each works like a base role, and says
 * which screens its people have (a switch each), what they may do on the
 * picked screen and where they land. Administrators always have everything.
 */
export function MenuAccessEditor({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
	const { users } = useSession();
	const [saved, setSaved] = useState<MenuAccess | null>(null);
	const [draft, setDraft] = useState<MenuAccess | null>(null);
	const [sel, setSel] = useState<string>("technician");
	const [screen, setScreen] = useState<ScreenId | null>("/tickets");
	const [search, setSearch] = useState("");
	const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		apiClient
			.get<{ value: unknown }>("/api/settings/menuAccess")
			.then((r) => {
				const a = menuAccessFrom(r.value);
				setSaved(a);
				setDraft(a);
			})
			.catch((e) => toast.error(errorMessage(e)));
	}, []);

	const dirty = useMemo(() => Boolean(saved && draft && JSON.stringify(saved) !== JSON.stringify(draft)), [saved, draft]);
	useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

	if (!draft) return <p className="py-8 text-center text-muted-foreground text-sm">Loading…</p>;

	const cur = draft.profiles.find((p) => p.id === sel) ?? null;
	const locked = !cur;
	const allScreens = SCREENS.map((s) => s.id);
	const screensOf = (id: string) => (id === ADMIN ? allScreens : (draft.profiles.find((p) => p.id === id)?.screens ?? []));
	const on = (id: ScreenId) => locked || cur.screens.includes(id);
	const does = (a: ActionId) => locked || cur.actions.includes(a);
	const peopleIn = (p: AccessProfile) => users.filter((u) => u.role === p.base && (u.accessId ? u.accessId === p.id : p.id === p.base)).length;
	const patch = (id: string, change: Partial<AccessProfile>) => setDraft({ ...draft, profiles: draft.profiles.map((p) => (p.id === id ? { ...p, ...change } : p)) });
	/** Turns a screen on or off for a profile (the one being edited by default). */
	const setScreenOn = (id: ScreenId, value: boolean, who: string = sel) => {
		const p = draft.profiles.find((x) => x.id === who);
		if (!p) return;
		const screens = value ? allScreens.filter((s) => s === id || p.screens.includes(s)) : p.screens.filter((s) => s !== id);
		patch(who, { screens, home: !value && p.home === id ? null : p.home });
	};
	const setAction = (a: ActionId, value: boolean) => {
		if (!cur) return;
		patch(cur.id, { actions: value ? [...new Set([...cur.actions, a])] : cur.actions.filter((x) => x !== a) });
	};
	const addProfile = () => {
		const p = profileFrom("technician", { id: `acc-${Date.now().toString(36)}`, name: "New access", description: "", builtIn: false });
		setDraft({ ...draft, profiles: [...draft.profiles, p] });
		setSel(p.id);
	};
	const removeProfile = (p: AccessProfile) => {
		const n = peopleIn(p);
		if (!window.confirm(`Delete “${p.name}”?${n ? ` Its ${n} ${n === 1 ? "person goes" : "people go"} back to the ${BASE_LABEL[p.base]} access.` : ""}`)) return;
		setDraft({ ...draft, profiles: draft.profiles.filter((x) => x.id !== p.id) });
		setSel(p.base);
	};

	const q = search.trim().toLowerCase();
	const visible = SCREENS.filter((s) => !q || s.label.toLowerCase().includes(q));
	const groups = [...new Set(visible.map((s) => s.group))];
	const picked = screen ? SCREENS.find((s) => s.id === screen) : undefined;
	const home = locked ? (draft.adminHome ?? "/calendar") : (cur.home ?? homeFor({ role: cur.base, accessId: cur.id }, draft));
	const tiles: { id: string; name: string; hint: string; icon: Icon }[] = [
		{ id: ADMIN, name: "Administrator", hint: "Everything", icon: ShieldCheckIcon },
		...draft.profiles.map((p) => ({ id: p.id, name: p.name, hint: `${p.screens.length} screens · ${peopleIn(p)} ${peopleIn(p) === 1 ? "person" : "people"}`, icon: BASE_ICON[p.base] })),
	];

	async function save() {
		if (!draft) return;
		const empty = draft.profiles.find((p) => p.screens.length === 0);
		if (empty) return toast.error(`${empty.name} needs at least one screen.`);
		const names = draft.profiles.map((p) => p.name.trim().toLowerCase());
		if (names.some((n) => !n)) return toast.error("Every access needs a name.");
		if (new Set(names).size !== names.length) return toast.error("Two accesses have the same name.");
		setSaving(true);
		try {
			await apiClient.put("/api/settings/menuAccess", { value: draft });
			setSaved(draft);
			publishMenuAccess(draft);
			toast.success("Access saved", { description: "Menus and permissions follow it right away." });
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="flex flex-col gap-4">
			{/* Profiles */}
			<section className="rounded-lg border border-border bg-card p-4">
				<div className="mb-3 flex items-center justify-between gap-2">
					<h2 className="font-semibold text-brand text-sm">Access profiles</h2>
					<Button type="button" size="sm" variant="secondary" onClick={addProfile}>
						<PlusIcon className="size-4" /> New access
					</Button>
				</div>
				<div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="radiogroup" aria-label="Access profile">
					{tiles.map(({ id, name, hint, icon: I }) => (
						<button
							key={id}
							type="button"
							role="radio"
							aria-checked={sel === id}
							onClick={() => setSel(id)}
							className={cn("flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors", sel === id ? "border-brand bg-brand/5" : "border-border hover:bg-muted/40")}
						>
							<span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", sel === id ? "bg-brand text-white" : "bg-muted text-muted-foreground")}>
								<I className="size-5" />
							</span>
							<span className="min-w-0">
								<span className="block truncate font-medium text-sm">{name || "Unnamed access"}</span>
								<span className="block truncate text-muted-foreground text-xs">{hint}</span>
							</span>
						</button>
					))}
				</div>

				<div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
					{locked ? (
						<div className="flex flex-col gap-1">
							<span className="text-muted-foreground text-xs">Name</span>
							<span className="flex items-center gap-2 font-medium text-sm">
								<UserGearIcon className="size-4 text-muted-foreground" /> Administrator
							</span>
							<span className="text-muted-foreground text-xs">Sees and manages everything, the team and the settings.</span>
						</div>
					) : (
						<div className="flex flex-col gap-2">
							<label className="flex flex-col gap-1 text-muted-foreground text-xs">
								Name
								<Input className="h-9" value={cur.name} onChange={(e) => patch(cur.id, { name: e.target.value })} placeholder="e.g. Site supervisor" />
							</label>
							<label className="flex flex-col gap-1 text-muted-foreground text-xs">
								Description
								<Input className="h-9" value={cur.description} onChange={(e) => patch(cur.id, { description: e.target.value })} placeholder="What people with this access do" />
							</label>
						</div>
					)}
					<div className="flex flex-col gap-2">
						<div className="flex flex-col gap-1">
							<label htmlFor="access-home" className="text-muted-foreground text-xs">
								Default home page
							</label>
							<Select
								value={home ?? ""}
								onValueChange={(v) => (cur ? patch(cur.id, { home: v as ScreenId }) : setDraft({ ...draft, adminHome: v as ScreenId }))}
							>
								<SelectTrigger id="access-home" className="h-9 max-w-xs">
									<HouseIcon className="size-4 text-muted-foreground" />
									<SelectValue placeholder="First screen" />
								</SelectTrigger>
								<SelectContent>
									{SCREENS.filter((s) => on(s.id)).map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{cur && !cur.builtIn && (
							<Button type="button" size="sm" variant="ghost" className="self-start text-destructive hover:text-destructive" onClick={() => removeProfile(cur)}>
								<TrashIcon className="size-4" /> Delete this access
							</Button>
						)}
					</div>
				</div>

				{/* How the people of this access work in the CRM */}
				{cur && (
					<div className="mt-4 flex flex-col gap-3 border-border border-t pt-4">
						<div>
							<p className="font-semibold text-sm">How they work</p>
							<p className="text-muted-foreground text-xs">
								{cur.builtIn ? "A built-in access keeps its way of working; create a new access for another one." : "What the CRM treats them as, beyond the screens: pick the one that fits (e.g. HR → Back office)."}
							</p>
						</div>
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="How they work">
							{MENU_ROLES.map((b) => {
								const I = BASE_ICON[b];
								const picked = cur.base === b;
								return (
									<button
										key={b}
										type="button"
										role="radio"
										aria-checked={picked}
										disabled={cur.builtIn && !picked}
										onClick={() => !cur.builtIn && patch(cur.id, { base: b })}
										className={cn(
											"flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors",
											picked ? "border-brand bg-brand/5" : "border-border hover:bg-muted/40",
											cur.builtIn && !picked && "cursor-not-allowed opacity-45",
										)}
									>
										<span className="flex items-center gap-2 font-medium text-sm">
											<I className={cn("size-4", picked ? "text-brand" : "text-muted-foreground")} /> {BASE_HOW[b].label}
										</span>
										<ul className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
											{BASE_HOW[b].does.map((d) => (
												<li key={d}>• {d}</li>
											))}
										</ul>
									</button>
								);
							})}
						</div>
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
							<PermissionCard
								icon={CalendarPlusIcon}
								label="Sees the whole team's schedule and tasks"
								hint="Read only: every appointment and every technician's visit."
								checked={Boolean(cur.sees?.team) || cur.base === "engineer"}
								disabled={cur.base === "engineer"}
								onChange={(v) => patch(cur.id, { sees: { ...cur.sees, team: v } })}
							/>
							<PermissionCard
								icon={EyeIcon}
								label="Sees every ticket"
								hint="Read only: they work on their own; the others are to follow."
								checked={Boolean(cur.sees?.tickets) || cur.base === "engineer"}
								disabled={cur.base === "engineer"}
								onChange={(v) => patch(cur.id, { sees: { ...cur.sees, tickets: v } })}
							/>
						</div>
					</div>
				)}
			</section>

			{/* Screens and what can be done on each */}
			<section className="rounded-lg bg-muted/40 p-3">
				<h2 className="mb-3 px-1 font-semibold text-brand text-sm">Screens and permissions</h2>
				<div className="grid min-h-[420px] grid-cols-1 overflow-hidden rounded-lg border border-border bg-card md:grid-cols-[280px_1fr]">
					{/* Screen list */}
					<div className="flex flex-col border-border border-b md:border-r md:border-b-0">
						<div className="relative p-3">
							<MagnifyingGlassIcon className="-translate-y-1/2 absolute top-1/2 left-5 size-4 text-muted-foreground" />
							<Input aria-label="Search screen" placeholder="Search screen" className="h-9 pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
						</div>
						<div className="max-h-[440px] overflow-y-auto pb-2">
							{groups.length === 0 && <p className="p-4 text-center text-muted-foreground text-sm">No screen found</p>}
							{groups.map((g) => {
								const closed = closedGroups.has(g) && !q;
								return (
									<div key={g}>
										<button
											type="button"
											onClick={() => setClosedGroups((prev) => (prev.has(g) ? new Set([...prev].filter((x) => x !== g)) : new Set([...prev, g])))}
											className="flex w-full items-center gap-2 px-3 py-2 font-bold text-[11px] text-muted-foreground uppercase tracking-wide hover:bg-muted/40"
											aria-expanded={!closed}
										>
											<CaretDownIcon className={cn("size-3 transition-transform", closed && "-rotate-90")} />
											{g}
										</button>
										{!closed &&
											visible
												.filter((s) => s.group === g)
												.map((s) => (
													<div
														key={s.id}
														role="button"
														tabIndex={0}
														onClick={() => setScreen(s.id)}
														onKeyDown={(e) => e.key === "Enter" && setScreen(s.id)}
														aria-current={screen === s.id ? "true" : undefined}
														className={cn(
															"mx-2 flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors",
															screen === s.id ? "bg-brand text-white" : "hover:bg-muted/50",
															!on(s.id) && screen !== s.id && "opacity-50 hover:opacity-75",
														)}
													>
														<span className="min-w-0 flex-1 truncate">{s.label}</span>
														<Switch
															checked={on(s.id)}
															disabled={locked}
															onClick={(e) => e.stopPropagation()}
															onCheckedChange={(v) => setScreenOn(s.id, v)}
															aria-label={`${s.label} in the menu`}
															className={cn(screen === s.id && "data-[state=checked]:bg-white/90 data-[state=unchecked]:bg-white/30 [&>span]:bg-brand")}
														/>
													</div>
												))}
									</div>
								);
							})}
							<div className="mx-2 mt-1 flex items-center justify-between gap-2 rounded-md px-3 py-2 text-muted-foreground text-sm opacity-70" title="Administrators only">
								<span>Settings</span>
								<LockSimpleIcon className="size-4" />
							</div>
						</div>
					</div>

					{/* The picked screen */}
					<div className="p-4 sm:p-5">
						{!picked ? (
							<p className="pt-16 text-center text-muted-foreground text-sm">Pick a screen to edit what this access can do there.</p>
						) : (
							<div className="flex flex-col gap-4">
								<div className="border-border border-b pb-3">
									<h3 className="font-semibold text-base">{picked.label}</h3>
									<p className="text-muted-foreground text-sm">{SCREEN_INFO[picked.id]}</p>
								</div>

								<div>
									<p className="mb-0.5 font-semibold text-sm">Accesses with this screen</p>
									<p className="mb-2 text-muted-foreground text-xs">Click an access to give it this screen or take it away.</p>
									<div className="flex flex-wrap gap-1.5">
										{tiles.map((p) => {
											const has = screensOf(p.id).includes(picked.id);
											const admin = p.id === ADMIN;
											return (
												<button
													key={p.id}
													type="button"
													aria-pressed={has}
													disabled={admin}
													title={admin ? "Administrators always have every screen" : has ? `Take ${picked.label} away from ${p.name}` : `Give ${picked.label} to ${p.name}`}
													onClick={() => setScreenOn(picked.id, !has, p.id)}
													className={cn(
														"inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold text-xs transition-colors",
														has ? "border-brand bg-brand/10 text-brand" : "border-border border-dashed text-muted-foreground hover:bg-muted",
														admin && "cursor-default opacity-80",
													)}
												>
													{has ? <CheckIcon className="size-3" weight="bold" /> : <PlusIcon className="size-3" />}
													{p.name}
												</button>
											);
										})}
									</div>
								</div>

								<PermissionCard icon={EyeIcon} label="Show in the menu" hint={locked ? "Administrators always have it." : "Off: it leaves the menu and its link doesn't open."} checked={on(picked.id)} disabled={locked} onChange={(v) => setScreenOn(picked.id, v)} />

								<div className={cn("flex flex-col gap-2 transition-opacity", !on(picked.id) && "pointer-events-none opacity-45")}>
									<p className="font-semibold text-sm">What they can do here</p>
									{actionsOf(picked.id).length === 0 ? (
										<p className="rounded-lg border border-border border-dashed px-4 py-3 text-muted-foreground text-sm">Nothing to switch here: seeing the screen is all it takes.</p>
									) : (
										actionsOf(picked.id).map((a) => (
											<PermissionCard key={a.id} icon={ACTION_ICON[a.icon] ?? ShieldCheckIcon} label={a.label} hint={a.hint} checked={does(a.id)} disabled={locked} onChange={(v) => setAction(a.id, v)} />
										))
									)}
									{cur && ACCESS_RULES[cur.base]?.[picked.id] && (
										<p className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
											<LockSimpleIcon className="mt-0.5 size-3.5 shrink-0" />
											<span>
												<b className="text-foreground">What they see:</b> {ACCESS_RULES[cur.base]![picked.id]}
											</span>
										</p>
									)}
								</div>
							</div>
						)}
					</div>
				</div>
			</section>

			<div className="flex flex-wrap items-center justify-end gap-2">
				{cur && (
					<Button variant="ghost" size="sm" onClick={() => patch(cur.id, { screens: profileFrom(cur.base).screens, actions: [...ALL_ACTIONS], home: null })} disabled={saving}>
						<ArrowCounterClockwiseIcon className="size-4" /> Default screens of this access
					</Button>
				)}
				{dirty && (
					<Button variant="secondary" size="sm" onClick={() => setDraft(saved)} disabled={saving}>
						Cancel
					</Button>
				)}
				<Button size="sm" onClick={save} disabled={!dirty || saving}>
					{saving ? "Saving…" : "Save"}
				</Button>
			</div>
		</div>
	);
}

function PermissionCard({ icon: I, label, hint, checked, disabled, onChange }: { icon: Icon; label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
	return (
		<label className={cn("flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors", !disabled && "cursor-pointer hover:border-foreground/20 hover:bg-muted/30")}>
			<span className="flex min-w-0 items-center gap-3">
				<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
					<I className="size-4" />
				</span>
				<span className="min-w-0">
					<span className="block font-semibold text-sm">{label}</span>
					{hint && <span className="block text-muted-foreground text-xs">{hint}</span>}
				</span>
			</span>
			<Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
		</label>
	);
}
