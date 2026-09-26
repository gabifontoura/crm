import {
	AddressBookIcon,
	ArrowSquareOutIcon,
	CardsIcon,
	type Icon,
	LightningIcon,
	LockSimpleIcon,
	ShieldCheckIcon,
	TableIcon,
	TicketIcon,
	UsersIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DragHandle, reorder, useDragReorder } from "#/components/drag-reorder";
import { Button } from "#/components/ui/button";
import { FilterChip } from "#/components/ui/filter-chip";
import { Switch } from "#/components/ui/switch";
import { apiClient, errorMessage } from "#/lib/api/client";
import { publishListViews, useListViews } from "#/lib/use-list-views";
import { cn } from "#/lib/utils";
import { type ColumnDef, DEFAULT_LIST_VIEWS, LIST_BY_ID, LISTS, type ListId, type ListViews, listViewsFrom, pinnedColumns } from "../../../../shared/list-views";

const SCREEN_ICON: Record<string, Icon> = { Tickets: TicketIcon, Leads: AddressBookIcon, Team: UsersIcon };

/** Two fictional rows per list, to preview the columns. */
const SAMPLE: Record<ListId, Record<string, [string, string]>> = {
	tickets: {
		number: ["1042", "1043"],
		title: ["Front door lock sticks", "Hairline crack in the living room"],
		status: ["Visit scheduled", "In repair"],
		priority: ["High", "Medium"],
		assignee: ["Jack Thompson", "Mia Lopez"],
		location: ["Aurora Residences · Unit 203", "Bordeaux Building · Unit 302"],
		due: ["Due in 2 days", "Overdue a day"],
		nextVisit: ["Today · 9:00 AM", "On site now"],
		updated: ["3 hours ago", "a day ago"],
		type: ["Warranty claim", "Maintenance request"],
		requester: ["Megan Scott", "Daniel Park"],
		client: ["Aurora Residences HOA", "Bordeaux Management"],
		reporter: ["Emily Carter", "Olivia Brown"],
		created: ["Sep 19", "Sep 22"],
	},
	ticketCards: {
		number: ["#1042", ""],
		title: ["Front door lock sticks", ""],
		priority: ["High", ""],
		location: ["Aurora Residences · Unit 203", ""],
		nextVisit: ["Today · 9:00 AM", ""],
		due: ["Due in 2 days", ""],
		assignee: ["JT", ""],
		visitButton: ["Start visit", ""],
		type: ["Warranty claim", ""],
		requester: ["Megan Scott", ""],
	},
	leads: {
		lead: ["Rachel Green", "Tom Walker"],
		stage: ["Qualified", "Negotiating"],
		development: ["Harbor View Residences", "Pier 9 Lofts"],
		budget: ["$450,000", "$720,000"],
		followUp: ["Tomorrow", "Late: Sep 20"],
		lastContact: ["2 days ago", "a week ago"],
		deals: ["1", "—"],
		owner: ["Chloe Parker", "Liam Foster"],
		temperature: ["Hot", "Warm"],
		source: ["Open house", "Website"],
		company: ["Green & Co", "Walker Design"],
		email: ["rachel@example.com", "tom@example.com"],
		phone: ["+1 (555) 201-4410", "+1 (555) 311-0292"],
		created: ["Aug 30", "Sep 12"],
	},
	leadCards: {
		name: ["Rachel Green", ""],
		temperature: ["Hot", ""],
		development: ["Harbor View Residences", ""],
		followUp: ["Tomorrow", ""],
		owner: ["Chloe Parker", ""],
		budget: ["$450,000", ""],
		phone: ["+1 (555) 201-4410", ""],
		source: ["Open house", ""],
	},
	team: {
		name: ["Jack Thompson", "Olivia Brown"],
		jobTitle: ["Service technician", "Site engineer"],
		access: ["Service technician", "Engineer"],
		contact: ["jack@example.com", "olivia@example.com"],
		upcoming: ["6 open", "2 open"],
		trade: ["Carpentry", "Structural"],
		phone: ["+1 (555) 410-0001", "+1 (555) 410-0002"],
		status: ["Active", "Active"],
		since: ["Jan 2026", "Mar 2026"],
	},
};

function Mark({ kind }: { kind: "fixed" | "required" | "auto" | "admin" }) {
	const look = {
		fixed: { label: "Fixed", icon: LockSimpleIcon, className: "bg-slate-100 text-slate-700 ring-slate-200" },
		required: { label: "Required", icon: null, className: "bg-amber-50 text-amber-800 ring-amber-200" },
		auto: { label: "Automatic", icon: LightningIcon, className: "bg-sky-50 text-sky-800 ring-sky-200" },
		admin: { label: "Admins only", icon: ShieldCheckIcon, className: "bg-violet-50 text-violet-800 ring-violet-200" },
	}[kind];
	const I = look.icon;
	return (
		<span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[11px] ring-1 ring-inset", look.className)}>
			{I ? <I className="size-3" weight="bold" /> : <span className="font-bold">*</span>}
			{look.label}
		</span>
	);
}

/** Settings › Lists & columns: which information each list and card shows, in which order. */
export function ListViewsEditor({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
	const saved = useListViews();
	const [draft, setDraft] = useState<ListViews>(saved);
	const [savedJson, setSavedJson] = useState(JSON.stringify(saved));
	const [listId, setListId] = useState<ListId>("tickets");
	const [saving, setSaving] = useState(false);

	// When the stored views arrive (or change elsewhere), start from them.
	useEffect(() => {
		setDraft(saved);
		setSavedJson(JSON.stringify(saved));
	}, [saved]);

	const dirty = JSON.stringify(draft) !== savedJson;
	useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

	const list = LIST_BY_ID[listId];
	const defs = useMemo(() => new Map(list.columns.map((c) => [c.id, c])), [list]);
	const cols = draft[listId];
	const shown = cols.filter((c) => c.visible).map((c) => defs.get(c.id)!);
	const isDefault = JSON.stringify(cols) === JSON.stringify(DEFAULT_LIST_VIEWS[listId]);

	const update = (next: { id: string; visible: boolean }[]) => setDraft((d) => ({ ...d, [listId]: next }));
	const toggle = (id: string, visible: boolean) => update(cols.map((c) => (c.id === id ? { ...c, visible } : c)));
	const pinned = pinnedColumns(listId);
	// Drag and drop (rows have no inputs, so from anywhere); the pinned columns stay on top.
	const drag = useDragReorder({ count: cols.length, pinned: pinned.length, handleOnly: false, onMove: (from, to) => update(reorder(cols, from, to)) });

	async function save() {
		setSaving(true);
		try {
			const value = listViewsFrom(draft);
			await apiClient.put("/api/settings/listViews", { value });
			publishListViews(value);
			setSavedJson(JSON.stringify(value));
			toast.success("Lists & columns saved: every screen shows them now.");
		} catch (e) {
			toast.error(`Not saved: ${errorMessage(e)}`);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="flex flex-col rounded-lg border border-border bg-card shadow-sm">
			<div className="flex flex-col gap-4 p-4">
				<p className="text-muted-foreground text-xs">
					Pick what each list and board card shows, and in which order. The same for the whole team. Fixed items can't be hidden; required ones are
					always filled in, so their column is never empty.
				</p>

				{/* Which list */}
				<div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="List">
					{LISTS.map((l) => {
						const I = l.kind === "table" ? TableIcon : CardsIcon;
						return <FilterChip key={l.id} label={l.label} icon={I} count={draft[l.id].filter((c) => c.visible).length} active={listId === l.id} onClick={() => setListId(l.id)} />;
					})}
				</div>

				<div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
					{/* The information, in order */}
					<section className="flex flex-col gap-2">
						<div className="flex items-start justify-between gap-2">
							<div>
								<h3 className="flex items-center gap-1.5 font-semibold text-sm">
									{(() => {
										const I = SCREEN_ICON[list.screen];
										return <I className="size-4 text-muted-foreground" />;
									})()}
									{list.label}
								</h3>
								<p className="text-muted-foreground text-xs">{list.hint}</p>
							</div>
							<Button variant="secondary" size="sm" asChild>
								<Link to={list.route}>
									<ArrowSquareOutIcon className="size-4" /> Open {list.screen}
								</Link>
							</Button>
						</div>
						<div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
							<Mark kind="fixed" /> can't be hidden · <Mark kind="required" /> mandatory in the form · <Mark kind="auto" /> filled by the CRM
						</div>
						<ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
							{cols.map((c, i) => {
								const def = defs.get(c.id) as ColumnDef;
								const locked = Boolean(def.locked);
								const onTop = pinned.includes(c.id);
								return (
									<li
										key={c.id}
										{...drag.rowProps(i)}
										className={cn(
											"relative flex items-center gap-3 px-3 py-2.5 transition-colors",
											!c.visible && "bg-muted/30",
											!onTop && "cursor-grab active:cursor-grabbing",
											drag.isDragging(i) && "opacity-40",
										)}
									>
										{drag.dropLine(i)}
										<DragHandle label={def.label} pinned={onTop} {...drag.handleProps(i)} />
										<div className="min-w-0 flex-1">
											<div className="flex flex-wrap items-center gap-1.5">
												<span className={cn("font-medium text-sm", !c.visible && "text-muted-foreground")}>{def.label}</span>
												{locked && <Mark kind="fixed" />}
												{def.filled === "required" && <Mark kind="required" />}
												{def.filled === "auto" && <Mark kind="auto" />}
												{def.adminOnly && <Mark kind="admin" />}
											</div>
											<p className="text-muted-foreground text-xs">{def.hint}</p>
										</div>
										<Switch checked={c.visible} disabled={locked} onCheckedChange={(v) => toggle(c.id, Boolean(v))} aria-label={`Show ${def.label}`} />
									</li>
								);
							})}
						</ol>
					</section>

					{/* Live preview with sample data */}
					<section className="flex flex-col gap-2">
						<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Preview</h3>
						{list.kind === "table" ? (
							<div className="overflow-x-auto rounded-lg border border-border">
								<table className="w-full text-left text-xs">
									<thead className="border-border border-b bg-muted/40 text-muted-foreground uppercase tracking-wide">
										<tr>
											{shown.map((d) => (
												<th key={d.id} className="whitespace-nowrap px-3 py-2 font-semibold">
													{d.label}
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{[0, 1].map((row) => (
											<tr key={row} className="border-border border-b last:border-b-0">
												{shown.map((d) => (
													<td key={d.id} className={cn("whitespace-nowrap px-3 py-2", d.locked ? "font-medium" : "text-muted-foreground")}>
														{SAMPLE[listId][d.id]?.[row] || "—"}
													</td>
												))}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : (
							<div className="flex justify-center rounded-lg border border-border border-dashed bg-muted/30 p-4">
								<div className="flex w-72 flex-col gap-1.5 rounded-md border border-border border-l-4 border-l-violet-400 bg-card p-2.5 shadow-sm">
									{shown.map((d) =>
										d.id === "visitButton" ? (
											<span key={d.id} className="mt-0.5 inline-flex h-8 items-center justify-center rounded-md bg-brand font-semibold text-[12px] text-white">
												▶ {SAMPLE[listId][d.id][0]}
											</span>
										) : (
											<span key={d.id} className={cn("flex items-baseline gap-2 text-[12px]", d.locked ? "font-semibold text-[13px]" : "text-muted-foreground")}>
												{!d.locked && <span className="w-24 shrink-0 text-[10px] uppercase tracking-wide opacity-70">{d.label}</span>}
												<span className="truncate">{SAMPLE[listId][d.id]?.[0]}</span>
											</span>
										),
									)}
								</div>
							</div>
						)}
						<p className="text-muted-foreground text-xs">
							{shown.length} of {cols.length} shown. The sample data only shows the layout; the screen uses your real records.
						</p>
					</section>
				</div>
			</div>

			<div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 rounded-b-lg border-border border-t bg-card/95 px-4 py-3 backdrop-blur">
				<span className={cn("text-xs", dirty ? "font-medium text-amber-700" : "text-muted-foreground")}>{dirty ? "You have unsaved changes." : "All changes saved."}</span>
				<div className="flex flex-wrap gap-2">
					<Button variant="ghost" size="sm" disabled={isDefault} onClick={() => update(DEFAULT_LIST_VIEWS[listId])}>
						Restore defaults
					</Button>
					<Button variant="secondary" size="sm" disabled={saving || !dirty} onClick={() => setDraft(JSON.parse(savedJson) as ListViews)}>
						Discard changes
					</Button>
					<Button size="sm" disabled={saving || !dirty} onClick={save}>
						{saving ? "Saving…" : "Save"}
					</Button>
				</div>
			</div>
		</div>
	);
}
