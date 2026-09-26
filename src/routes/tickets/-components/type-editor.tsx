import { PlusIcon, TrashIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { TonePicker } from "#/components/tone-picker";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { cn } from "#/lib/utils";
import {
	type FieldCondition,
	type FieldDef,
	FIELD_KINDS,
	type FieldKind,
	type Priority,
	PRIORITIES,
	type TicketType,
	validateTicketType,
	type Workflow,
} from "../../../../shared/tickets";
import { CustomFieldInput } from "./custom-field-input";
import { DragHandle, reorder, useDragReorder } from "#/components/drag-reorder";

const ALWAYS = "__always__";

/** "Show only when <field> is <values>": a simple activation rule for a field. */
function ShowWhenEditor({
	field,
	fields,
	onChange,
}: {
	field: FieldDef;
	fields: FieldDef[];
	onChange: (c: FieldCondition | null) => void;
}) {
	const parents = fields.filter((p) => p.id !== field.id && (p.kind === "select" || p.kind === "checkbox"));
	const cond = field.showWhen?.fieldId ? field.showWhen : null;
	const parent = cond ? fields.find((p) => p.id === cond.fieldId) : undefined;
	if (parents.length === 0 && !cond) return null;
	const choices = parent?.kind === "checkbox" ? ["true", "false"] : (parent?.options.map((o) => o.trim()).filter(Boolean) ?? []);
	const label = (v: string) => (parent?.kind === "checkbox" ? (v === "true" ? "Checked" : "Not checked") : v);

	return (
		<div className="flex flex-col gap-1.5 rounded-md bg-muted/30 px-2 py-1.5">
			<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
				<span>Show</span>
				<Select
					value={cond?.fieldId ?? ALWAYS}
					onValueChange={(v) => onChange(v === ALWAYS ? null : { fieldId: v, equals: [] })}
				>
					<SelectTrigger aria-label="Show condition" className="h-7 w-auto min-w-40 bg-card text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALWAYS}>always</SelectItem>
						{parents.map((p) => (
							<SelectItem key={p.id} value={p.id}>
								only when “{p.label}” is…
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			{cond && (
				<div className="flex flex-wrap gap-1" role="group" aria-label="Values that show this field">
					{choices.length === 0 && <span className="text-[11px] text-amber-700">Add options to “{parent?.label}” first.</span>}
					{choices.map((v) => {
						const on = cond.equals.includes(v);
						return (
							<button
								key={v}
								type="button"
								aria-pressed={on}
								onClick={() => onChange({ ...cond, equals: on ? cond.equals.filter((x) => x !== v) : [...cond.equals, v] })}
								className={cn(
									"rounded-full border px-2 py-0.5 text-[11px]",
									on ? "border-brand bg-brand/10 text-brand" : "border-border bg-card text-muted-foreground hover:bg-muted",
								)}
							>
								{label(v)}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

const uid = () => `f_${Math.random().toString(36).slice(2, 8)}`;

export function newTypeDraft(workflowId: string): TicketType {
	return {
		id: "",
		name: "New ticket type",
		description: "",
		color: "#2B6CB0",
		workflowId,
		defaultPriority: "medium",
		slaHours: 48,
		active: true,
		fields: [],
	};
}

/** Edits a ticket type: its workflow, SLA and the custom fields filled while handling it. */
export function TypeEditor({
	type,
	workflows,
	saving,
	onSave,
	onDelete,
	onDirtyChange,
}: {
	type: TicketType;
	workflows: Workflow[];
	saving: boolean;
	onSave: (t: TicketType) => void;
	onDelete?: () => void;
	onDirtyChange: (dirty: boolean) => void;
}) {
	const [draft, setDraft] = useState<TicketType>(type);
	useEffect(() => setDraft(type), [type]);
	const dirty = JSON.stringify(draft) !== JSON.stringify(type);
	useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

	const problems = useMemo(() => validateTicketType(draft, workflows), [draft, workflows]);
	const workflow = workflows.find((w) => w.id === draft.workflowId);
	/** Which transitions ask for each field, to show next to it. */
	const neededBy = useMemo(() => {
		const map = new Map<string, string[]>();
		for (const t of workflow?.transitions ?? []) for (const id of t.requiredFields) map.set(id, [...(map.get(id) ?? []), t.label]);
		return map;
	}, [workflow]);

	const setField = (i: number, patch: Partial<FieldDef>) =>
		setDraft((d) => ({ ...d, fields: d.fields.map((f, k) => (k === i ? { ...f, ...patch } : f)) }));

	// Drag the fields (by their ⋮⋮ handle) to reorder them.
	const fieldDrag = useDragReorder({ count: draft.fields.length, onMove: (from, to) => setDraft({ ...draft, fields: reorder(draft.fields, from, to) }) });
	return (
		<div className="flex flex-col gap-5">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="tt-name">Name</Label>
					<Input id="tt-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="tt-workflow">Workflow</Label>
					<Select value={draft.workflowId} onValueChange={(v) => setDraft({ ...draft, workflowId: v })}>
						<SelectTrigger id="tt-workflow">
							<SelectValue placeholder="Pick a workflow" />
						</SelectTrigger>
						<SelectContent>
							{workflows.map((w) => (
								<SelectItem key={w.id} value={w.id}>
									{w.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<span className="text-muted-foreground text-xs">The status paths tickets of this type can follow.</span>
				</div>
				<div className="flex flex-col gap-1.5 sm:col-span-2">
					<Label htmlFor="tt-desc">Description</Label>
					<Input id="tt-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Shown when someone opens a ticket of this type" />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="tt-priority">Default priority</Label>
					<Select value={draft.defaultPriority} onValueChange={(v) => setDraft({ ...draft, defaultPriority: v as Priority })}>
						<SelectTrigger id="tt-priority">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PRIORITIES.map((p) => (
								<SelectItem key={p.id} value={p.id}>
									{p.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="tt-sla">SLA (hours to resolve)</Label>
					<Input
						id="tt-sla"
						type="number"
						min={1}
						placeholder="No SLA"
						value={draft.slaHours ?? ""}
						onChange={(e) => setDraft({ ...draft, slaHours: e.target.value === "" ? null : Number(e.target.value) })}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<span className="font-medium text-sm">Color</span>
					<TonePicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} label="Ticket type color" />
				</div>
				<label className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
					<span className="flex flex-col">
						<span className="font-medium text-sm">Active</span>
						<span className="text-muted-foreground text-xs">Inactive types keep their tickets but can't get new ones.</span>
					</span>
					<Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: Boolean(v) })} />
				</label>
			</div>

			<section className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<div>
						<h3 className="font-semibold text-sm">Custom fields</h3>
						<p className="text-muted-foreground text-xs">
							Filled in while handling the ticket. Mark a field required at opening here, or make a workflow step require it.
						</p>
					</div>
					<Button
						size="sm"
						variant="secondary"
						onClick={() =>
							setDraft((d) => ({
								...d,
								fields: [...d.fields, { id: uid(), label: `Field ${d.fields.length + 1}`, kind: "text", options: [], required: false, helpText: "" }],
							}))
						}
					>
						<PlusIcon className="size-4" /> Field
					</Button>
				</div>

				{draft.fields.length === 0 && (
					<p className="rounded-md border border-dashed border-border p-4 text-center text-muted-foreground text-sm">No custom fields: tickets only have the standard ones.</p>
				)}

				{draft.fields.map((f, i) => (
					<div key={f.id} {...fieldDrag.rowProps(i)} className={cn("relative flex flex-col gap-2 rounded-md border border-border bg-card p-3", fieldDrag.isDragging(i) && "opacity-40")}>
						{fieldDrag.dropLine(i)}
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<DragHandle label={f.label || "field"} {...fieldDrag.handleProps(i)} className="hidden sm:flex" />
							<Input aria-label="Field label" className="h-8 flex-1 text-sm" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
							<Select value={f.kind} onValueChange={(v) => setField(i, { kind: v as FieldKind })}>
								<SelectTrigger aria-label="Field type" className="h-8 text-sm sm:w-40">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{FIELD_KINDS.map((k) => (
										<SelectItem key={k.id} value={k.id}>
											{k.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<label className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground text-xs">
								<Switch checked={f.required} onCheckedChange={(v) => setField(i, { required: Boolean(v) })} /> Required at opening
							</label>
							<div className="flex items-center">
								<DragHandle label={f.label || "field"} {...fieldDrag.handleProps(i)} className="sm:hidden" />
								<Button variant="ghost" size="icon-sm" aria-label={`Delete ${f.label}`} onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_, k) => k !== i) })}>
									<TrashIcon className="size-4" />
								</Button>
							</div>
						</div>
						<Input aria-label="Help text" className="h-8 text-xs" placeholder="Help text (optional)" value={f.helpText} onChange={(e) => setField(i, { helpText: e.target.value })} />
						{f.kind === "select" && (
							<Textarea
								aria-label="Options"
								rows={3}
								className="resize-none text-xs"
								placeholder="One option per line"
								value={f.options.join("\n")}
								onChange={(e) => setField(i, { options: e.target.value.split("\n") })}
							/>
						)}
						<ShowWhenEditor field={f} fields={draft.fields} onChange={(showWhen) => setField(i, { showWhen })} />
						{neededBy.has(f.id) && (
							<span className="text-[11px] text-amber-700">Required by the step: {neededBy.get(f.id)!.join(", ")}</span>
						)}
					</div>
				))}
			</section>

			{draft.fields.length > 0 && (
				<section className="flex flex-col gap-2">
					<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Form preview</span>
					<div className="grid grid-cols-1 gap-4 rounded-md border border-border bg-muted/20 p-4 sm:grid-cols-2">
						{draft.fields.map((f) => (
							<CustomFieldInput
								key={f.id}
								def={{ ...f, options: f.options.map((o) => o.trim()).filter(Boolean) }}
								value={null}
								onChange={() => undefined}
								required={f.required}
								disabled
								idPrefix="preview"
							/>
						))}
					</div>
				</section>
			)}

			{problems.length > 0 && (
				<div className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
					<span className="flex items-center gap-1.5 font-semibold">
						<WarningIcon className="size-4" /> Fix before saving
					</span>
					<ul className="list-disc pl-5 text-xs">
						{problems.map((p) => (
							<li key={p}>{p}</li>
						))}
					</ul>
				</div>
			)}

			<div className="flex flex-wrap items-center justify-between gap-2 border-border border-t pt-4">
				{onDelete ? (
					<Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}>
						<TrashIcon className="size-4" /> Delete type
					</Button>
				) : (
					<span />
				)}
				<div className="flex gap-2">
					<Button variant="secondary" size="sm" disabled={!dirty || saving} onClick={() => setDraft(type)}>
						Discard changes
					</Button>
					<Button
						size="sm"
						disabled={(!dirty && Boolean(type.id)) || problems.length > 0 || saving}
						onClick={() => onSave({ ...draft, fields: draft.fields.map((f) => ({ ...f, options: f.options.map((o) => o.trim()).filter(Boolean) })) })}
					>
						{saving ? "Saving…" : type.id ? "Save type" : "Create type"}
					</Button>
				</div>
			</div>
		</div>
	);
}
