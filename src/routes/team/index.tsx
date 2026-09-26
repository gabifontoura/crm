import {
	EnvelopeIcon,
	MagnifyingGlassIcon,
	PencilSimpleIcon,
	PhoneIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageLayout } from "#/components/layout/page-layout";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { PersonName } from "#/components/person/person-dialog";
import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import { apiClient, errorMessage } from "#/lib/api/client";
import { useSession } from "#/lib/auth/session";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import { cn } from "#/lib/utils";
import { initialsOf, roleLabel, type User, type UserInput, type UserRole } from "../../../shared/users";
import { UserFormDialog } from "./-components/user-form-dialog";
import { useMenuAccess } from "#/lib/auth/use-menu-access";
import { menuAccessFrom, profileOf } from "../../../shared/access";
import { Pagination, usePagination } from "#/components/pagination";
import { useColumns } from "#/lib/use-list-views";
import { LIST_BY_ID } from "../../../shared/list-views";

export const Route = createFileRoute("/team/")({
	component: TeamPage,
});

const ROLE_FILTERS: { id: UserRole | "all"; label: string }[] = [
	{ id: "all", label: "Everyone" },
	{ id: "admin", label: "Administrators" },
	{ id: "technician", label: "Service technicians" },
	{ id: "broker", label: "Brokers" },
	{ id: "engineer", label: "Engineers" },
];

const ROLE_STYLE: Record<UserRole, string> = {
	staff: "bg-slate-100 text-slate-700",
	admin: "bg-brand/10 text-brand",
	technician: "bg-sky-100 text-sky-800",
	broker: "bg-emerald-100 text-emerald-800",
	engineer: "bg-violet-100 text-violet-800",
};

interface WireEvent {
	owner: { id: string };
	start: string;
	completed: boolean;
}

function TeamPage() {
	const { user: me, can } = useCurrentUser();
	const { users, refreshUsers } = useSession();
	const access = useMenuAccess(users[0]?.id) ?? menuAccessFrom(null);
	const canManage = can("team.manage");
	const [query, setQuery] = useState("");
	const [role, setRole] = useState<UserRole | "all">("all");
	const [showInactive, setShowInactive] = useState(false);
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<User | null>(null);
	const [deleting, setDeleting] = useState<User | null>(null);
	const [upcoming, setUpcoming] = useState<Record<string, number>>({});

	// Open appointments per person from today on (admins see everyone's).
	useEffect(() => {
		if (!me) return;
		apiClient
			.get<WireEvent[]>("/api/calendar/events")
			.then((events) => {
				const now = Date.now();
				const counts: Record<string, number> = {};
				for (const e of events) {
					if (!e.completed && new Date(e.start).getTime() >= now) counts[e.owner.id] = (counts[e.owner.id] ?? 0) + 1;
				}
				setUpcoming(counts);
			})
			.catch(() => setUpcoming({}));
	}, [me, users]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return users.filter((u) => {
			if (!showInactive && !u.active) return false;
			if (role !== "all" && u.role !== role) return false;
			if (!q) return true;
			return [u.name, u.email, u.jobTitle, u.trade].some((f) => f.toLowerCase().includes(q));
		});
	}, [users, query, role, showInactive]);
	const paged = usePagination(filtered, { key: "team", resetKey: [query, role, showInactive] });

	const counts = useMemo(() => {
		const out: Record<string, number> = { all: 0 };
		for (const u of users) {
			if (!showInactive && !u.active) continue;
			out.all++;
			out[u.role] = (out[u.role] ?? 0) + 1;
		}
		return out;
	}, [users, showInactive]);

	async function save(input: UserInput) {
		try {
			if (editing) await apiClient.put(`/api/users/${encodeURIComponent(editing.id)}`, input);
			else await apiClient.post("/api/users", input);
			await refreshUsers();
			toast.success(editing ? "Team member updated" : `${input.name} was added to the team`);
		} catch (e) {
			toast.error(errorMessage(e));
			throw e;
		}
	}

	async function toggleActive(u: User) {
		try {
			await apiClient.put(`/api/users/${encodeURIComponent(u.id)}`, { ...u, active: !u.active });
			await refreshUsers();
			toast.success(u.active ? `${u.name} was deactivated` : `${u.name} is active again`);
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	async function remove(u: User) {
		try {
			await apiClient.delete(`/api/users/${encodeURIComponent(u.id)}`);
			await refreshUsers();
			toast.success(`${u.name} was removed`);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setDeleting(null);
		}
	}

	// Which columns and their order: Settings › Lists & columns.
	const teamCols = useColumns("team", true);
	const teamCell = (u: User, id: string) => {
		switch (id) {
			case "name":
				return (
					<td key={id} className="md:px-4 md:py-3">
						<div className="flex items-center gap-3">
							<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10 font-semibold text-brand text-xs">{initialsOf(u.name)}</div>
							<div className="min-w-0">
								<div className="flex items-center gap-2 truncate font-medium">
									<PersonName person={{ kind: "member", id: u.id }}>{u.name}</PersonName>
									{u.id === me?.id && <Badge variant="muted">You</Badge>}
									{!u.active && <Badge variant="outline">Inactive</Badge>}
								</div>
								<div className="truncate text-muted-foreground text-xs">{u.email}</div>
							</div>
						</div>
					</td>
				);
			case "jobTitle":
				return (
					<td key={id} className="md:px-4 md:py-3">
						<div>{u.jobTitle || "—"}</div>
						<div className="text-muted-foreground text-xs">{u.trade}</div>
					</td>
				);
			case "access":
				return (
					<td key={id} className="md:px-4 md:py-3">
						<span className={cn("inline-flex rounded-full px-2 py-0.5 font-medium text-xs", ROLE_STYLE[u.role])}>{profileOf(u, access)?.name ?? roleLabel(u.role)}</span>
					</td>
				);
			case "contact":
				return (
					<td key={id} className="hidden md:px-4 md:py-3 lg:table-cell">
						<div className="flex flex-col gap-0.5 text-muted-foreground text-xs">
							<a href={`mailto:${u.email}`} className="inline-flex items-center gap-1 hover:text-brand">
								<EnvelopeIcon className="size-3.5" /> {u.email}
							</a>
							{u.phone && (
								<a href={`tel:${u.phone}`} className="inline-flex items-center gap-1 hover:text-brand">
									<PhoneIcon className="size-3.5" /> {u.phone}
								</a>
							)}
						</div>
					</td>
				);
			case "upcoming":
				return (
					<td key={id} className="md:px-4 md:py-3 md:text-right">
						{/* Employees only receive their own appointments, so others' counts stay private. */}
						{can("calendar.viewAll") || u.id === me?.id ? (
							<span className="text-sm">
								<span className="font-semibold">{upcoming[u.id] ?? 0}</span>
								<span className="text-muted-foreground"> open</span>
							</span>
						) : (
							<span className="text-muted-foreground text-xs">Private</span>
						)}
					</td>
				);
			case "trade":
				return <td key={id} className="text-sm md:px-4 md:py-3">{u.trade || <span className="text-muted-foreground">—</span>}</td>;
			case "phone":
				return (
					<td key={id} className="whitespace-nowrap text-xs md:px-4 md:py-3">
						{u.phone ? <a href={`tel:${u.phone}`} className="hover:text-brand">{u.phone}</a> : <span className="text-muted-foreground">—</span>}
					</td>
				);
			case "status":
				return (
					<td key={id} className="md:px-4 md:py-3">
						<Badge variant={u.active ? "muted" : "outline"}>{u.active ? "Active" : "Inactive"}</Badge>
					</td>
				);
			case "since":
				return <td key={id} className="whitespace-nowrap text-muted-foreground text-xs md:px-4 md:py-3">{new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</td>;
			default:
				return <td key={id} />;
		}
	};
	return (
		<PageLayout
			title="Team"
			subtitle="Service technicians, brokers and administrators"
			breadcrumbs={[{ label: "Construction" }, { label: "Team" }]}
			actions={
				canManage ? (
					<Button
						size="sm"
						onClick={() => {
							setEditing(null);
							setFormOpen(true);
						}}
					>
						<PlusIcon className="size-4" />
						<span className="hidden sm:inline">New member</span>
					</Button>
				) : null
			}
		>
			<div className="flex flex-col gap-3 py-4">
				<div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by role">
						{ROLE_FILTERS.map((r) => (
							<Button
								key={r.id}
								size="sm"
								variant={role === r.id ? "default" : "secondary"}
								aria-pressed={role === r.id}
								onClick={() => setRole(r.id)}
							>
								{r.label}
								<span className={cn("rounded-full px-1.5 text-[11px]", role === r.id ? "bg-white/20" : "bg-muted")}>
									{counts[r.id] ?? 0}
								</span>
							</Button>
						))}
					</div>
					<div className="flex items-center gap-3">
						<label className="flex items-center gap-2 text-muted-foreground text-sm">
							<Switch checked={showInactive} onCheckedChange={(v) => setShowInactive(Boolean(v))} />
							Show inactive
						</label>
						<div className="relative w-full lg:w-72">
							<MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								aria-label="Search team"
								className="h-9 pl-9"
								placeholder="Search name, email, title or trade"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
						</div>
					</div>
				</div>

				<div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
					{filtered.length === 0 ? (
						<p className="px-4 py-12 text-center text-muted-foreground text-sm">No team members match these filters.</p>
					) : (
						<table className="w-full text-left text-sm">
							<thead className="hidden border-border border-b bg-muted/40 md:table-header-group">
								<tr className="text-muted-foreground text-xs uppercase tracking-wide">
									{teamCols.ids.map((id) => (
										<th key={id} className={cn("whitespace-nowrap px-4 py-2.5 font-semibold", id === "upcoming" && "text-right", id === "contact" && "hidden lg:table-cell")}>
											{LIST_BY_ID.team.columns.find((c) => c.id === id)?.label}
										</th>
									))}
									{canManage && <th className="px-4 py-2.5 text-right font-semibold">Actions</th>}
								</tr>
							</thead>
							<tbody>
								{paged.items.map((u) => (
									<tr
										key={u.id}
										className={cn(
											"flex flex-col gap-2 border-border border-b px-4 py-3 last:border-b-0 md:table-row md:p-0",
											!u.active && "opacity-60",
										)}
									>
										{teamCols.ids.map((id) => teamCell(u, id))}
										{canManage && (
											<td className="md:px-4 md:py-3">
												<div className="flex items-center gap-1 md:justify-end">
													<Button
														variant="ghost"
														size="icon-sm"
														aria-label={`Edit ${u.name}`}
														title="Edit"
														onClick={() => {
															setEditing(u);
															setFormOpen(true);
														}}
													>
														<PencilSimpleIcon className="size-4" />
													</Button>
													<Switch
														aria-label={u.active ? `Deactivate ${u.name}` : `Activate ${u.name}`}
														title={u.active ? "Active" : "Inactive"}
														checked={u.active}
														disabled={u.id === me?.id}
														onCheckedChange={() => toggleActive(u)}
													/>
													<Button
														variant="ghost"
														size="icon-sm"
														aria-label={`Delete ${u.name}`}
														title="Delete"
														disabled={u.id === me?.id}
														onClick={() => setDeleting(u)}
													>
														<TrashIcon className="size-4" />
													</Button>
												</div>
											</td>
										)}
									</tr>
								))}
							</tbody>
						</table>
					)}
					{filtered.length > 0 && <Pagination state={paged} noun="people" className="border-border border-t px-4" />}
				</div>
				{!canManage && (
					<p className="text-muted-foreground text-xs">Only administrators can add or edit team members.</p>
				)}
			</div>

			<UserFormDialog open={formOpen} onOpenChange={setFormOpen} initial={editing} onSave={save} />

			<AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
				<AlertDialogContent className="sm:!max-w-sm">
					<AlertDialogHeader>
						<AlertDialogMedia className="bg-destructive/10 text-destructive">
							<TrashIcon className="size-5" />
						</AlertDialogMedia>
						<AlertDialogTitle>Remove team member?</AlertDialogTitle>
						<AlertDialogDescription>
							<span className="font-semibold text-foreground">{deleting?.name}</span> will be removed. People who own
							appointments can't be removed; deactivate them instead.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel variant="secondary">Cancel</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onClick={() => deleting && remove(deleting)}>
							<TrashIcon className="size-4" />
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</PageLayout>
	);
}
