import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { TonePicker } from "#/components/tone-picker";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import { apiClient, errorMessage } from "#/lib/api/client";
import { type ContactStage, DEFAULT_CONTACT_STAGES } from "../../../../shared/contacts";
import { STATUS_COLORS } from "../../../../shared/tickets";
import { DragHandle, reorder, useDragReorder } from "#/components/drag-reorder";
import { cn } from "#/lib/utils";

/** Admin: name, color and order of the lead stages; closed ones leave the active portfolio. */
export function LeadStagesEditor({
	stages,
	usage,
	onSaved,
}: {
	stages: ContactStage[];
	/** Leads per stage id (a stage in use can't be deleted). */
	usage: Record<string, number>;
	onSaved: () => void;
}) {
	const [draft, setDraft] = useState<ContactStage[]>(stages);
	const [saving, setSaving] = useState(false);
	const dirty = JSON.stringify(draft) !== JSON.stringify(stages);
	const set = (i: number, patch: Partial<ContactStage>) => setDraft((d) => d.map((s, k) => (k === i ? { ...s, ...patch } : s)));
	// Drag the stages (by their ⋮⋮ handle) to reorder the funnel.
	const stageDrag = useDragReorder({ count: draft.length, onMove: (from, to) => setDraft((d) => reorder(d, from, to)) });
	const problems = [
		...(draft.some((s) => !s.label.trim()) ? ["Every stage needs a name."] : []),
		...(draft.filter((s) => !s.closed).length === 0 ? ["Keep at least one open stage."] : []),
		...(new Set(draft.map((s) => s.label.trim().toLowerCase())).size !== draft.length ? ["Two stages have the same name."] : []),
	];

	async function save() {
		setSaving(true);
		try {
			await apiClient.put("/api/settings/contactStages", { value: { stages: draft.map((s) => ({ ...s, label: s.label.trim() })) } });
			toast.success("Lead stages saved");
			onSaved();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="flex flex-col gap-3">
				<div>
					<h3 className="font-semibold text-sm">Lead stages</h3>
					<p className="text-muted-foreground text-xs">
						The steps of your sales funnel on Contacts, in order. Closed stages (won or lost) are left out of the active portfolio. A stage that still has leads can't be
						deleted.
					</p>
				</div>
				<ul className="flex flex-col gap-2">
					{draft.map((s, i) => (
						<li key={s.id} {...stageDrag.rowProps(i)} className={cn("relative flex flex-wrap items-center gap-2 rounded-md border border-border border-l-4 p-2", stageDrag.isDragging(i) && "opacity-40")} style={{ borderLeftColor: s.color }}>
							{stageDrag.dropLine(i)}
							<DragHandle label={s.label || "stage"} {...stageDrag.handleProps(i)} />
							<Input aria-label="Stage name" className="h-8 min-w-40 flex-1 text-sm" value={s.label} onChange={(e) => set(i, { label: e.target.value })} />
							
							<label className="flex items-center gap-1.5 text-muted-foreground text-xs">
								<Switch checked={Boolean(s.closed)} onCheckedChange={(v) => set(i, { closed: Boolean(v) })} /> Closed
							</label>
							<div className="flex items-center">

								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={`Delete ${s.label}`}
									title={usage[s.id] ? `${usage[s.id]} lead(s) are in this stage. Move them first.` : "Delete"}
									disabled={Boolean(usage[s.id]) || draft.length === 1}
									onClick={() => setDraft((d) => d.filter((_, k) => k !== i))}
								>
									<TrashIcon className="size-4" />
								</Button>
							</div>
							<div className="w-full">
								<TonePicker size="sm" value={s.color} onChange={(color) => set(i, { color })} label={`Color of ${s.label}`} />
							</div>
						</li>
					))}
				</ul>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex gap-2">
						<Button
							variant="secondary"
							size="sm"
							onClick={() =>
								setDraft((d) => [...d, { id: `st_${Math.random().toString(36).slice(2, 8)}`, label: `Stage ${d.length + 1}`, color: STATUS_COLORS[d.length % STATUS_COLORS.length] }])
							}
						>
							<PlusIcon className="size-4" /> Stage
						</Button>
						<Button
							variant="ghost"
							size="sm"
							disabled={JSON.stringify(draft) === JSON.stringify(DEFAULT_CONTACT_STAGES)}
							// Custom stages that still have leads are kept, so nobody ends up in a missing stage.
							onClick={() => setDraft([...DEFAULT_CONTACT_STAGES, ...draft.filter((s) => usage[s.id] && !DEFAULT_CONTACT_STAGES.some((x) => x.id === s.id))])}
						>
							Use defaults
						</Button>
					</div>
					<div className="flex gap-2">
						<Button variant="secondary" size="sm" onClick={() => setDraft(stages)} disabled={saving || !dirty}>
							Discard changes
						</Button>
						<Button size="sm" onClick={save} disabled={saving || !dirty || problems.length > 0}>
							{saving ? "Saving…" : "Save stages"}
						</Button>
					</div>
				</div>
				{problems.length > 0 && <p className="text-amber-800 text-xs">{problems.join(" ")}</p>}
		</div>
	);
}
