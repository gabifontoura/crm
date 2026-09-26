import { CopyIcon, FloppyDiskIcon, PencilSimpleIcon, PlusIcon, ShareNetworkIcon, SquaresFourIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageLayout } from "#/components/layout/page-layout";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { apiClient, errorMessage } from "#/lib/api/client";
import { useSession } from "#/lib/auth/session";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import { type Contact, contactStagesFrom } from "../../../shared/contacts";
import { type Dashboard, type DateRange, RANGES, type Widget } from "../../../shared/dashboards";
import type { DevelopmentTree } from "../../../shared/developments";
import type { Ticket } from "../../../shared/tickets";
import { useCalendarSettings } from "../calendar/-components/use-calendar-settings";
import { useTicketConfig } from "../tickets/-components/use-ticket-config";
import type { DataSet, Lookups, WireEvent } from "./-components/engine";
import { WidgetEditor } from "./-components/widget-editor";
import { WidgetCard } from "./-components/widget-view";
import { audienceLabel, modeOf, ShareDialog } from "./-components/share-dialog";

export const Route = createFileRoute("/dashboards/")({
	validateSearch: (s: Record<string, unknown>): { id?: string } => (typeof s.id === "string" ? { id: s.id } : {}),
	component: DashboardsPage,
});

type Range = Exclude<DateRange, "inherit">;
const uid = () => `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const blankWidget = (): Widget => ({
	id: `new_${uid()}`,
	title: "New widget",
	source: "tickets",
	chart: "column",
	measure: { op: "count" },
	groupBy: "type",
	range: "inherit",
	filters: { state: "all" },
	size: 2,
	limit: 8,
});

/**
 * Custom dashboards, Power BI style: pick a dashboard, change its period, and
 * (as its owner) add, arrange, resize and configure widgets. Shared dashboards
 * are visible to everyone, each person seeing only their own data.
 */
function DashboardsPage() {
	const { user, can } = useCurrentUser();
	const { users } = useSession();
	const { id: selectedId } = Route.useSearch();
	const navigate = useNavigate({ from: "/dashboards/" });
	const config = useTicketConfig(user?.id);
	const calendar = useCalendarSettings(false);

	const [dashboards, setDashboards] = useState<Dashboard[] | null>(null);
	const [data, setData] = useState<DataSet>({ tickets: [], contacts: [], events: [] });
	const [stagesValue, setStagesValue] = useState<unknown>(null);
	const [developments, setDevelopments] = useState<DevelopmentTree[]>([]);
	const [loadingData, setLoadingData] = useState(true);

	const [draft, setDraft] = useState<Dashboard | null>(null);
	const [viewRange, setViewRange] = useState<Range | null>(null);
	const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
	const [creating, setCreating] = useState(false);
	const [saving, setSaving] = useState(false);
	const [dragId, setDragId] = useState<string | null>(null);

	const loadDashboards = useCallback(async () => {
		try {
			setDashboards(await apiClient.get<Dashboard[]>("/api/dashboards"));
		} catch (e) {
			toast.error(errorMessage(e));
			setDashboards([]);
		}
	}, []);

	useEffect(() => {
		if (!user) return;
		loadDashboards();
		setLoadingData(true);
		Promise.all([
			apiClient.get<Ticket[]>("/api/tickets").catch(() => []),
			apiClient.get<Contact[]>("/api/contacts").catch(() => []),
			apiClient.get<WireEvent[]>("/api/calendar/events").catch(() => []),
			apiClient.get<{ value: unknown }>("/api/settings/contactStages").catch(() => ({ value: null })),
			apiClient.get<DevelopmentTree[]>("/api/developments").catch(() => []),
		]).then(([tickets, contacts, events, st, devs]) => {
			setData({ tickets, contacts, events });
			setStagesValue(st.value);
			setDevelopments(devs);
			setLoadingData(false);
		});
	}, [user, loadDashboards]);

	const lk: Lookups = useMemo(
		() => ({
			meId: user?.id ?? "",
			userName: (id) => (id ? (users.find((u) => u.id === id)?.name ?? "Former member") : "Unassigned"),
			typeById: config.typeById,
			workflowOf: config.workflowOf,
			contactStages: contactStagesFrom(stagesValue),
			developmentName: (id) => (id ? (developments.find((d) => d.id === id)?.name ?? null) : null),
			appointment: (id) => {
				const t = calendar.typeDef(id);
				return { label: t.label, color: t.border };
			},
		}),
		[user?.id, users, config.typeById, config.workflowOf, stagesValue, developments, calendar],
	);

	const saved = dashboards?.find((d) => d.id === selectedId) ?? dashboards?.[0] ?? null;
	const current = draft ?? saved;
	const editing = Boolean(draft);
	const canEdit = Boolean(current && user && (current.ownerId === user.id || user.role === "admin") && can("dashboards.edit"));
	const range: Range = editing ? (draft?.range ?? "90d") : (viewRange ?? current?.range ?? "90d");
	const people = useMemo(() => users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name })), [users]);

	useEffect(() => setViewRange(null), [saved?.id]);

	function guard(action: () => void) {
		if (editing && JSON.stringify(draft) !== JSON.stringify(saved) && !window.confirm("Discard the changes to this dashboard?")) return;
		setDraft(null);
		action();
	}

	const change = (patch: Partial<Dashboard>) => setDraft((d) => (d ? { ...d, ...patch } : d));
	const [sharing, setSharing] = useState(false);
	const setWidgets = (fn: (w: Widget[]) => Widget[]) => setDraft((d) => (d ? { ...d, widgets: fn(d.widgets) } : d));

	async function save() {
		if (!draft) return;
		setSaving(true);
		try {
			const out = await apiClient.put<Dashboard>(`/api/dashboards/${encodeURIComponent(draft.id)}`, draft);
			setDashboards((list) => (list ?? []).map((d) => (d.id === out.id ? out : d)));
			setDraft(null);
			toast.success("Dashboard saved");
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	async function create(name: string, from: Dashboard | null) {
		try {
			const out = await apiClient.post<Dashboard>("/api/dashboards", {
				name,
				description: from ? `Based on ${from.name}.` : "",
				shared: false,
				range: from?.range ?? "90d",
				widgets: (from?.widgets ?? []).map((w) => ({ ...w, id: uid() })),
			});
			setDashboards((list) => [...(list ?? []), out]);
			setCreating(false);
			navigate({ search: { id: out.id } });
			setDraft(out);
			toast.success(`"${out.name}" created`, { description: from ? "Arrange it your way, then save." : "Add your first widget." });
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	async function remove() {
		if (!current || !window.confirm(`Delete the dashboard "${current.name}"?`)) return;
		try {
			await apiClient.delete(`/api/dashboards/${encodeURIComponent(current.id)}`);
			setDraft(null);
			setDashboards((list) => (list ?? []).filter((d) => d.id !== current.id));
			navigate({ search: {} });
			toast.success("Dashboard deleted");
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	function moveWidget(id: string, toIndex: number) {
		setWidgets((list) => {
			const from = list.findIndex((w) => w.id === id);
			if (from < 0 || toIndex < 0 || toIndex >= list.length) return list;
			const next = [...list];
			const [it] = next.splice(from, 1);
			next.splice(toIndex, 0, it);
			return next;
		});
	}

	const ownerName = (d: Dashboard) => (d.ownerId === user?.id ? "You" : lk.userName(d.ownerId));

	return (
		<PageLayout
			title={current ? current.name : "Dashboards"}
			subtitle={current?.description || "Build your own views of tickets, leads and the calendar"}
			breadcrumbs={[{ label: "Workspace" }, { label: "Dashboards" }]}
			actions={
				<div className="flex flex-wrap items-center gap-2">
					{dashboards && dashboards.length > 0 && (
						<Select value={current?.id ?? ""} onValueChange={(id) => guard(() => navigate({ search: { id } }))}>
							<SelectTrigger aria-label="Dashboard" className="h-8 w-56 text-sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{dashboards.map((d) => (
									<SelectItem key={d.id} value={d.id}>
										{d.name}
										<span className="text-muted-foreground text-xs"> · {ownerName(d)}{modeOf(d) !== "private" ? " · shared" : ""}</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
					{can("dashboards.edit") && (
						<Button variant="secondary" size="sm" onClick={() => guard(() => setCreating(true))}>
							<PlusIcon className="size-4" /> New dashboard
						</Button>
					)}
				</div>
			}
		>
			<div className="flex flex-col gap-4 py-4">
				{dashboards === null || loadingData ? (
					<p className="py-12 text-center text-muted-foreground text-sm">Loading…</p>
				) : !current ? (
					<div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
						<SquaresFourIcon className="size-8 text-muted-foreground" />
						<p className="text-muted-foreground text-sm">No dashboards yet.</p>
						<Button size="sm" onClick={() => setCreating(true)}>
							<PlusIcon className="size-4" /> Create a dashboard
						</Button>
					</div>
				) : (
					<>
						{/* Filters and tools, one row above the widgets */}
						<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
							<div className="flex flex-wrap items-center gap-2">
								{editing ? (
									<Input aria-label="Dashboard name" className="h-8 w-56 text-sm" value={draft!.name} onChange={(e) => change({ name: e.target.value })} />
								) : null}
								<Select value={range} onValueChange={(v) => (editing ? change({ range: v as Range }) : setViewRange(v as Range))}>
									<SelectTrigger aria-label="Period" className="h-8 w-40 text-sm">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{RANGES.map((r) => (
											<SelectItem key={r.id} value={r.id}>
												{r.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{!editing && (
									<span className="text-muted-foreground text-xs">
										By {ownerName(current)} · {audienceLabel(current, lk.userName)}
									</span>
								)}
								{editing && (
									<Button size="sm" variant="secondary" className="h-8" onClick={() => setSharing(true)} title="Who sees this dashboard">
										<ShareNetworkIcon className="size-4" />
										<span className="max-w-64 truncate">{audienceLabel(draft!, lk.userName).replace(/^shared with /, "Shared with ").replace(/^only you$/, "Share")}</span>
									</Button>
								)}
							</div>
							<div className="flex flex-wrap items-center gap-1.5">
								{editing ? (
									<>
										<Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}>
											<TrashIcon className="size-4" /> Delete
										</Button>
										<Button size="sm" variant="secondary" onClick={() => setEditingWidget(blankWidget())}>
											<PlusIcon className="size-4" /> Add widget
										</Button>
										<Button size="sm" variant="secondary" onClick={() => setDraft(null)} disabled={saving}>
											<XIcon className="size-4" /> Discard
										</Button>
										<Button size="sm" onClick={save} disabled={saving || !draft!.name.trim()}>
											<FloppyDiskIcon className="size-4" /> {saving ? "Saving…" : "Save"}
										</Button>
									</>
								) : canEdit ? (
									<Button size="sm" onClick={() => setDraft(structuredClone(current))}>
										<PencilSimpleIcon className="size-4" /> Edit dashboard
									</Button>
								) : (
									<Button size="sm" variant="secondary" onClick={() => create(`${current.name} (my copy)`, current)}>
										<CopyIcon className="size-4" /> Duplicate to customize
									</Button>
								)}
							</div>
						</div>

						{current.widgets.length === 0 ? (
							<div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
								<p className="text-muted-foreground text-sm">This dashboard has no widgets yet.</p>
								{canEdit && (
									<Button
										size="sm"
										onClick={() => {
											if (!editing) setDraft(structuredClone(current));
											setEditingWidget(blankWidget());
										}}
									>
										<PlusIcon className="size-4" /> Add a widget
									</Button>
								)}
							</div>
						) : (
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
								{current.widgets.map((w, i) => (
									<WidgetCard
										key={w.id}
										widget={w}
										data={data}
										lk={lk}
										dashboardRange={range}
										editing={editing}
										isFirst={i === 0}
										isLast={i === current.widgets.length - 1}
										dragging={dragId === w.id}
										onEdit={() => setEditingWidget(w)}
										onDuplicate={() => setWidgets((list) => [...list.slice(0, i + 1), { ...w, id: uid(), title: `${w.title} (copy)` }, ...list.slice(i + 1)])}
										onDelete={() => setWidgets((list) => list.filter((x) => x.id !== w.id))}
										onMove={(delta) => moveWidget(w.id, i + delta)}
										onResize={(size) => setWidgets((list) => list.map((x) => (x.id === w.id ? { ...x, size } : x)))}
										dragProps={{
											draggable: true,
											onDragStart: (e) => {
												e.dataTransfer.setData("text/plain", w.id);
												setDragId(w.id);
											},
											onDragEnd: () => setDragId(null),
											onDragOver: (e) => e.preventDefault(),
											onDrop: (e) => {
												e.preventDefault();
												const id = e.dataTransfer.getData("text/plain");
												if (id && id !== w.id) moveWidget(id, i);
												setDragId(null);
											},
										}}
									/>
								))}
							</div>
						)}
					</>
				)}
			</div>

			{editingWidget && current && (
				<WidgetEditor
					initial={editingWidget}
					data={data}
					lk={lk}
					types={config.types}
					dashboardRange={range}
					people={people}
					onClose={() => setEditingWidget(null)}
					onSave={(w) => {
						const isNew = w.id.startsWith("new_");
						const finalW = isNew ? { ...w, id: uid() } : w;
						setWidgets((list) => (isNew ? [...list, finalW] : list.map((x) => (x.id === w.id ? finalW : x))));
						setEditingWidget(null);
					}}
				/>
			)}
			{creating && <NewDashboardDialog current={saved} onClose={() => setCreating(false)} onCreate={create} />}
		{sharing && draft && user && (
				<ShareDialog
					value={draft}
					users={users}
					ownerId={draft.ownerId}
					onClose={() => setSharing(false)}
					onApply={(v) => {
						change(v);
						setSharing(false);
					}}
				/>
			)}
		</PageLayout>
	);
}

function NewDashboardDialog({ current, onClose, onCreate }: { current: Dashboard | null; onClose: () => void; onCreate: (name: string, from: Dashboard | null) => void }) {
	const [name, setName] = useState("");
	const [copy, setCopy] = useState(false);
	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle>New dashboard</DialogTitle>
				<DialogDescription>Only you see it until you share it with the team.</DialogDescription>
				<form
					className="flex flex-col gap-3 pt-2"
					onSubmit={(e) => {
						e.preventDefault();
						if (name.trim()) onCreate(name.trim(), copy ? current : null);
					}}
				>
					<Input autoFocus aria-label="Name" placeholder="e.g. My week, Warranty follow-up…" value={name} onChange={(e) => setName(e.target.value)} />
					{current && (
						<label className="flex items-center gap-2 text-sm">
							<Switch checked={copy} onCheckedChange={(v) => setCopy(Boolean(v))} /> Start from a copy of “{current.name}”
						</label>
					)}
					<div className="flex justify-end gap-2 pt-1">
						<Button type="button" variant="secondary" size="sm" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" size="sm" disabled={!name.trim()}>
							Create
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
