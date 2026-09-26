import {
	BuildingsIcon,
	CalendarBlankIcon,
	MagnifyingGlassIcon,
	MapPinIcon,
	PencilSimpleIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Input } from "#/components/ui/input";
import { apiClient, errorMessage } from "#/lib/api/client";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import { cn } from "#/lib/utils";
import { FilterChip } from "#/components/ui/filter-chip";
import {
	type Block,
	type Client,
	DEVELOPMENT_KINDS,
	DEVELOPMENT_STATUSES,
	type DevelopmentInput,
	type DevelopmentStatus,
	type DevelopmentTree,
	labelOf,
	UNIT_STATUSES,
	type Unit,
	type UnitInput,
	type UnitStatus,
} from "../../../shared/developments";
import { BlockDialog, type BlockForm, DevelopmentDialog, UnitDialog } from "./-components/dialogs";
import { sized } from "./-components/photos";
import { StageTracker, UnitTypeCards } from "./-components/unit-types";

export const Route = createFileRoute("/developments/")({
	component: DevelopmentsPage,
});

const STATUS_STYLE: Record<DevelopmentStatus, string> = {
	planning: "bg-slate-100 text-slate-700",
	under_construction: "bg-amber-100 text-amber-800",
	delivered: "bg-emerald-100 text-emerald-800",
	warranty: "bg-sky-100 text-sky-800",
};

/** Unit tile colors, reusing the calendar's pastel palette. */
const UNIT_STYLE: Record<UnitStatus, { bg: string; border: string }> = {
	available: { bg: "#F1F5F9", border: "#CBD5E1" },
	sold: { bg: "#FED7AA", border: "#FB923C" },
	delivered: { bg: "#BBF7D0", border: "#4ADE80" },
	in_warranty: { bg: "#BFDBFE", border: "#60A5FA" },
};

type Confirm =
	| { kind: "development"; item: DevelopmentTree }
	| { kind: "block"; item: Block }
	| { kind: "unit"; item: Unit };

function DevelopmentsPage() {
	const { user, can } = useCurrentUser();
	const canManage = can("developments.manage");
	const [developments, setDevelopments] = useState<DevelopmentTree[]>([]);
	const [clients, setClients] = useState<Client[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState<DevelopmentStatus | "all">("all");

	const [devDialog, setDevDialog] = useState<{ open: boolean; initial: DevelopmentTree | null }>({ open: false, initial: null });
	const [blockDialog, setBlockDialog] = useState<{ open: boolean; initial: Block | null }>({ open: false, initial: null });
	const [unitDialog, setUnitDialog] = useState<{ open: boolean; initial: Unit | null; blockId: string }>({
		open: false,
		initial: null,
		blockId: "",
	});
	const [confirm, setConfirm] = useState<Confirm | null>(null);

	const load = useCallback(async () => {
		try {
			const [devs, cls] = await Promise.all([
				apiClient.get<DevelopmentTree[]>("/api/developments"),
				apiClient.get<Client[]>("/api/clients"),
			]);
			setDevelopments(devs);
			setClients(cls);
			setError(null);
			setSelectedId((id) => (id && devs.some((d) => d.id === id) ? id : (devs[0]?.id ?? null)));
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (user) load();
	}, [user, load]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return developments.filter(
			(d) =>
				(statusFilter === "all" || d.status === statusFilter) &&
				(!q || [d.name, d.city, d.client?.name ?? ""].some((f) => f.toLowerCase().includes(q))),
		);
	}, [developments, query, statusFilter]);

	const selected = developments.find((d) => d.id === selectedId) ?? null;

	/** Runs a change, reloads, and rethrows so dialogs can show field errors. */
	async function mutate(action: () => Promise<unknown>, success: string) {
		try {
			await action();
			await load();
			toast.success(success);
		} catch (e) {
			toast.error(errorMessage(e));
			throw e;
		}
	}

	const saveDevelopment = (input: DevelopmentInput) =>
		mutate(
			async () => {
				const id = devDialog.initial?.id;
				if (id) await apiClient.put(`/api/developments/${encodeURIComponent(id)}`, input);
				else {
					const created = await apiClient.post<DevelopmentTree>("/api/developments", input);
					setSelectedId(created.id);
				}
			},
			devDialog.initial ? "Development updated" : `${input.name} was created`,
		);

	const saveBlock = (form: BlockForm) =>
		mutate(
			() =>
				blockDialog.initial
					? apiClient.put(`/api/blocks/${encodeURIComponent(blockDialog.initial.id)}`, form)
					: apiClient.post("/api/blocks", { ...form, developmentId: selected?.id }),
			blockDialog.initial ? "Block updated" : `${form.name} was added`,
		);

	const saveUnit = (input: UnitInput) =>
		mutate(
			() =>
				unitDialog.initial
					? apiClient.put(`/api/units/${encodeURIComponent(unitDialog.initial.id)}`, input)
					: apiClient.post("/api/units", input),
			unitDialog.initial ? `Unit ${input.number} updated` : `Unit ${input.number} added`,
		);

	async function runConfirm() {
		if (!confirm) return;
		const { kind, item } = confirm;
		const path = kind === "development" ? "developments" : kind === "block" ? "blocks" : "units";
		const label = kind === "unit" ? `Unit ${(item as Unit).number}` : (item as Block).name;
		await mutate(() => apiClient.delete(`/api/${path}/${encodeURIComponent(item.id)}`), `${label} was deleted`).catch(() => undefined);
		setConfirm(null);
	}

	return (
		<PageLayout
			title="Developments"
			subtitle="Job sites with their blocks and units"
			breadcrumbs={[{ label: "Construction" }, { label: "Developments" }]}
			actions={
				canManage ? (
					<Button size="sm" onClick={() => setDevDialog({ open: true, initial: null })}>
						<PlusIcon className="size-4" />
						<span className="hidden sm:inline">New development</span>
					</Button>
				) : null
			}
		>
			<div className="flex flex-col gap-4 py-4 lg:flex-row">
				{/* List */}
				<aside className="flex w-full shrink-0 flex-col gap-2 lg:w-80">
					<div className="relative">
						<MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							aria-label="Search developments"
							className="h-9 pl-9"
							placeholder="Search name, city or client"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					</div>
					<div className="flex flex-wrap items-center gap-1.5">
						{[{ id: "all" as const, label: "All" }, ...DEVELOPMENT_STATUSES].map((s) => (
							<FilterChip key={s.id} label={s.label} active={statusFilter === s.id} onClick={() => setStatusFilter(s.id)} />
						))}
					</div>

					<div className="flex flex-col gap-2">
						{loading && <p className="py-6 text-center text-muted-foreground text-sm">Loading developments…</p>}
						{error && (
							<div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
								{error}
								<Button variant="secondary" size="sm" className="mt-2" onClick={load}>
									Retry
								</Button>
							</div>
						)}
						{!loading && !error && filtered.length === 0 && (
							<p className="py-6 text-center text-muted-foreground text-sm">No developments match.</p>
						)}
						{filtered.map((d) => {
							const units = d.blocks.reduce((n, b) => n + b.units.length, 0);
							const active = d.id === selectedId;
							return (
								<button
									key={d.id}
									type="button"
									onClick={() => setSelectedId(d.id)}
									className={cn(
										"overflow-hidden rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40",
										// Selected: a blue outline all around (a thick left border left a strip beside the photo).
										active ? "border-brand ring-2 ring-brand" : "border-border",
									)}
								>
									{d.photos?.[0] && (
										<div className="-mx-3 -mt-3 mb-2 h-24 overflow-hidden rounded-t-[7px] bg-muted">
											<img src={sized(d.photos[0].url, 500)} alt="" className="size-full object-cover" loading="lazy" />
										</div>
									)}
									<div className="flex items-start justify-between gap-2">
										<span className="font-semibold text-sm">{d.name}</span>
										<span className={cn("shrink-0 rounded-full px-2 py-0.5 font-medium text-[11px]", STATUS_STYLE[d.status])}>
											{labelOf(DEVELOPMENT_STATUSES, d.status)}
										</span>
									</div>
									<div className="mt-1 text-muted-foreground text-xs">{d.client?.name ?? "No client"}</div>
									<div className="mt-1.5 flex items-center gap-3 text-muted-foreground text-xs">
										<span className="inline-flex items-center gap-1">
											<MapPinIcon className="size-3.5" /> {d.city || "—"}
										</span>
										<span>
											{d.blocks.length} {d.blocks.length === 1 ? "block" : "blocks"} · {units} units
										</span>
									</div>
								</button>
							);
						})}
					</div>
				</aside>

				{/* Detail */}
				<section className="min-w-0 flex-1">
					{selected ? (
						<DevelopmentDetail
							dev={selected}
							canManage={canManage}
							onEdit={() => setDevDialog({ open: true, initial: selected })}
							onDelete={() => setConfirm({ kind: "development", item: selected })}
							onAddBlock={() => setBlockDialog({ open: true, initial: null })}
							onEditBlock={(b) => setBlockDialog({ open: true, initial: b })}
							onDeleteBlock={(b) => setConfirm({ kind: "block", item: b })}
							onAddUnit={(blockId) => setUnitDialog({ open: true, initial: null, blockId })}
							onOpenUnit={(u) => setUnitDialog({ open: true, initial: u, blockId: u.blockId })}
							onDeleteUnit={(u) => setConfirm({ kind: "unit", item: u })}
						/>
					) : (
						!loading && (
							<div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground">
								<BuildingsIcon className="size-8" />
								<span className="text-sm">Select a development to see its blocks and units.</span>
							</div>
						)
					)}
				</section>
			</div>

			<DevelopmentDialog
				open={devDialog.open}
				onOpenChange={(o) => setDevDialog((s) => ({ ...s, open: o }))}
				initial={devDialog.initial}
				clients={clients}
				onSave={saveDevelopment}
			/>
			<BlockDialog
				open={blockDialog.open}
				onOpenChange={(o) => setBlockDialog((s) => ({ ...s, open: o }))}
				initial={blockDialog.initial}
				unitTypes={selected?.unitTypes ?? []}
				onSave={saveBlock}
			/>
			<UnitDialog
				open={unitDialog.open}
				onOpenChange={(o) => setUnitDialog((s) => ({ ...s, open: o }))}
				initial={unitDialog.initial}
				blockId={unitDialog.blockId}
				unitTypes={selected?.unitTypes ?? []}
				onSave={saveUnit}
			/>

			<AlertDialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
				<AlertDialogContent className="sm:!max-w-sm">
					<AlertDialogHeader>
						<AlertDialogMedia className="bg-destructive/10 text-destructive">
							<TrashIcon className="size-5" />
						</AlertDialogMedia>
						<AlertDialogTitle>
							Delete{" "}
							{confirm?.kind === "unit" ? `unit ${(confirm.item as Unit).number}` : (confirm?.item as Block | undefined)?.name}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							{confirm?.kind === "development"
								? "Its blocks and units are deleted too."
								: confirm?.kind === "block"
									? "Its units are deleted too."
									: "The unit is removed from the block."}{" "}
							Appointments are kept but lose the link to this location.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel variant="secondary">Cancel</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onClick={runConfirm}>
							<TrashIcon className="size-4" />
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</PageLayout>
	);
}

function DevelopmentDetail({
	dev,
	canManage,
	onEdit,
	onDelete,
	onAddBlock,
	onEditBlock,
	onDeleteBlock,
	onAddUnit,
	onOpenUnit,
	onDeleteUnit,
}: {
	dev: DevelopmentTree;
	canManage: boolean;
	onEdit: () => void;
	onDelete: () => void;
	onAddBlock: () => void;
	onEditBlock: (b: Block) => void;
	onDeleteBlock: (b: Block) => void;
	onAddUnit: (blockId: string) => void;
	onOpenUnit: (u: Unit) => void;
	onDeleteUnit: (u: Unit) => void;
}) {
	const allUnits = dev.blocks.flatMap((b) => b.units);
	const byStatus = UNIT_STATUSES.map((s) => ({ ...s, count: allUnits.filter((u) => u.status === s.id).length }));

	return (
		<div className="flex flex-col gap-4">
			<div className="rounded-lg border border-border bg-card p-4 shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="font-semibold text-lg">{dev.name}</h2>
							<span className={cn("rounded-full px-2 py-0.5 font-medium text-xs", STATUS_STYLE[dev.status])}>
								{labelOf(DEVELOPMENT_STATUSES, dev.status)}
							</span>
							<Badge variant="outline">{labelOf(DEVELOPMENT_KINDS, dev.kind)}</Badge>
						</div>
						<p className="mt-1 text-muted-foreground text-sm">
							{dev.client?.name ?? "No client"} · {[dev.address, dev.city].filter(Boolean).join(", ") || "No address"}
						</p>
						{dev.deliveryDate && (
							<p className="mt-1 inline-flex items-center gap-1 text-muted-foreground text-xs">
								<CalendarBlankIcon className="size-3.5" /> Handover {dayjs(dev.deliveryDate).format("MMM D, YYYY")}
							</p>
						)}
					</div>
					{canManage && (
						<div className="flex items-center gap-1.5">
							<Button variant="secondary" size="sm" onClick={onEdit}>
								<PencilSimpleIcon className="size-4" /> Edit
							</Button>
							<Button variant="ghost" size="icon-sm" aria-label={`Delete ${dev.name}`} onClick={onDelete}>
								<TrashIcon className="size-4" />
							</Button>
						</div>
					)}
				</div>

				{dev.photos?.[0] && (
					<div className="relative mt-4 aspect-[3/1] max-h-56 overflow-hidden rounded-md bg-muted">
						<img src={sized(dev.photos[0].url, 1600)} alt={dev.photos[0].caption || dev.name} className="size-full object-cover" />
						{dev.photos[0].caption && (
							<span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pt-6 pb-2 text-white text-xs">{dev.photos[0].caption}</span>
						)}
					</div>
				)}
				{dev.status === "under_construction" && (
					<div className="mt-4">
						<StageTracker stage={dev.stage} progress={dev.progress} />
					</div>
				)}

				<div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
					<Stat label="Units" value={allUnits.length} />
					{byStatus.map((s) => (
						<Stat key={s.id} label={s.label} value={s.count} swatch={UNIT_STYLE[s.id]} />
					))}
				</div>
			</div>

			{(dev.unitTypes?.length ?? 0) > 0 && (
				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Apartment types ({dev.unitTypes!.length})</h3>
						{canManage && (
							<Button variant="ghost" size="sm" onClick={onEdit}>
								<PencilSimpleIcon className="size-4" /> Edit types
							</Button>
						)}
					</div>
					<UnitTypeCards types={dev.unitTypes ?? []} units={allUnits} />
				</div>
			)}

			<div className="flex items-center justify-between">
				<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
					Blocks ({dev.blocks.length})
				</h3>
				{canManage && (
					<Button variant="secondary" size="sm" onClick={onAddBlock}>
						<PlusIcon className="size-4" /> Add block
					</Button>
				)}
			</div>

			{dev.blocks.length === 0 && (
				<div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
					No blocks yet{canManage ? ". Add a tower, wing or building to start registering units." : "."}
				</div>
			)}

			{dev.blocks.map((b) => {
				const floors = Array.from(new Set(b.units.map((u) => u.floor))).sort((x, y) => y - x);
				return (
					<div key={b.id} className="rounded-lg border border-border bg-card shadow-sm">
						<div className="flex flex-wrap items-center justify-between gap-2 border-border border-b bg-muted/30 px-4 py-2.5">
							<div>
								<span className="font-semibold text-sm">{b.name}</span>
								<span className="ml-2 text-muted-foreground text-xs">
									{b.floors} {b.floors === 1 ? "floor" : "floors"} · {b.units.length} units
								</span>
							</div>
							{canManage && (
								<div className="flex items-center gap-1">
									<Button variant="ghost" size="sm" onClick={() => onAddUnit(b.id)}>
										<PlusIcon className="size-4" /> Unit
									</Button>
									<Button variant="ghost" size="icon-sm" aria-label={`Edit ${b.name}`} onClick={() => onEditBlock(b)}>
										<PencilSimpleIcon className="size-4" />
									</Button>
									<Button variant="ghost" size="icon-sm" aria-label={`Delete ${b.name}`} onClick={() => onDeleteBlock(b)}>
										<TrashIcon className="size-4" />
									</Button>
								</div>
							)}
						</div>
						<div className="flex flex-col gap-1.5 overflow-x-auto p-3">
							{b.units.length === 0 && <p className="text-muted-foreground text-xs">No units in this block.</p>}
							{/* Top floor first, like looking at the building. */}
							{floors.map((floor) => (
								<div key={floor} className="flex items-center gap-1.5">
									<span className="w-10 shrink-0 text-right text-[11px] text-muted-foreground">F{floor}</span>
									{b.units
										.filter((u) => u.floor === floor)
										.map((u) => (
											<span key={u.id} className="group/unit relative">
												<button
													type="button"
													onClick={() => onOpenUnit(u)}
													disabled={!canManage}
													title={`${u.number} · ${u.kind} · ${u.areaSqft.toLocaleString("en-US")} sq ft · ${u.bedrooms ?? 0} bed · ${u.bathrooms ?? 0} bath · ${u.parking ?? 0} garage · ${labelOf(UNIT_STATUSES, u.status)}${u.occupant ? ` · ${u.occupant}` : ""}`}
													className="flex min-w-[64px] flex-col rounded-md border-l-4 px-2 py-1 text-left text-[11px] transition-shadow hover:shadow-md disabled:cursor-default disabled:hover:shadow-none"
													style={{ backgroundColor: UNIT_STYLE[u.status].bg, borderColor: UNIT_STYLE[u.status].border }}
												>
													<span className="font-semibold text-slate-800">{u.number}</span>
													<span className="truncate text-slate-600">{u.kind}</span>
												</button>
												{canManage && (
													<button
														type="button"
														onClick={() => onDeleteUnit(u)}
														className="absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full bg-slate-700 text-white group-hover/unit:flex"
														aria-label={`Delete unit ${u.number}`}
													>
														<TrashIcon className="size-2.5" />
													</button>
												)}
											</span>
										))}
								</div>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function Stat({ label, value, swatch }: { label: string; value: number; swatch?: { bg: string; border: string } }) {
	return (
		<div className="rounded-md border border-border bg-muted/20 px-3 py-2">
			<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
				{swatch && <span className="size-2.5 rounded-sm border" style={{ backgroundColor: swatch.bg, borderColor: swatch.border }} />}
				{label}
			</div>
			<div className="font-semibold text-lg">{value}</div>
		</div>
	);
}
