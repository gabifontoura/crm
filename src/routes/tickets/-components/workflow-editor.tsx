import { ArrowRightIcon, PlusIcon, TrashIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { TonePicker } from "#/components/tone-picker";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { cn } from "#/lib/utils";
import {
	isClosedCategory,
	STATUS_CATEGORIES,
	STATUS_COLORS,
	type StatusCategory,
	type TicketStatus,
	type TicketType,
	type Transition,
	validateWorkflow,
	type Workflow,
} from "../../../../shared/tickets";
import { USER_ROLES, type UserRole } from "../../../../shared/users";
import { FlowDiagram } from "./flow-diagram";
import { DragHandle, reorder, useDragReorder } from "#/components/drag-reorder";
import { statusEmailProblems } from "../../../../shared/status-email";
import { StatusEmailEditor } from "./status-email-editor";

const ANY = "*";
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

export function newWorkflowDraft(): Workflow {
	return {
		id: "",
		name: "New workflow",
		description: "",
		initialStatusId: "todo",
		statuses: [
			{ id: "todo", name: "To do", color: "#64748B", category: "todo" },
			{ id: "doing", name: "In progress", color: "#2B6CB0", category: "in_progress" },
			{ id: "done", name: "Done", color: "#16A34A", category: "done" },
		],
		transitions: [
			{ id: uid("tr"), from: "todo", to: "doing", label: "Start", roles: ["admin", "technician", "broker"], requireComment: false, requiredFields: [] },
			{ id: uid("tr"), from: "doing", to: "done", label: "Finish", roles: ["admin", "technician", "broker"], requireComment: false, requiredFields: [] },
		],
		updatedAt: "",
	};
}

/**
 * Builds a workflow: its statuses (name, color, category, start), and the
 * transitions between them (button label, who may use it, and what it needs).
 */
export function WorkflowEditor({
	workflow,
	usedBy,
	saving,
	onSave,
	onDelete,
	onDirtyChange,
}: {
	workflow: Workflow;
	/** Ticket types that use this workflow (their fields can be required by transitions). */
	usedBy: TicketType[];
	saving: boolean;
	onSave: (w: Workflow) => void;
	onDelete?: () => void;
	onDirtyChange: (dirty: boolean) => void;
}) {
	const [draft, setDraft] = useState<Workflow>(workflow);
	useEffect(() => setDraft(workflow), [workflow]);

	const dirty = JSON.stringify(draft) !== JSON.stringify(workflow);
	useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

	const problems = useMemo(() => [...validateWorkflow(draft), ...draft.statuses.flatMap((s) => statusEmailProblems(s.email, s.name || "a status"))], [draft]);
	// Closed statuses nothing leads out of: such tickets could never be reopened.
	const deadEnds = useMemo(() => {
		const closedIds = new Set(draft.statuses.filter((s) => isClosedCategory(s.category)).map((s) => s.id));
		return draft.statuses.filter(
			(s) => closedIds.has(s.id) && !draft.transitions.some((t) => (t.from === s.id || t.from === ANY) && t.to !== s.id && !closedIds.has(t.to)),
		);
	}, [draft]);
	const fieldOptions = useMemo(() => {
		const map = new Map<string, string>();
		for (const t of usedBy) for (const f of t.fields) if (!map.has(f.id)) map.set(f.id, f.label);
		return [...map.entries()].map(([id, label]) => ({ id, label }));
	}, [usedBy]);

	const setStatus = (i: number, patch: Partial<TicketStatus>) =>
		setDraft((d) => {
			const old = d.statuses[i];
			// Steps still named after the status ("Move to X") follow its new name.
			const transitions =
				patch.name !== undefined
					? d.transitions.map((t) => (t.to === old.id && t.label === `Move to ${old.name}` ? { ...t, label: `Move to ${patch.name}` } : t))
					: d.transitions;
			return { ...d, transitions, statuses: d.statuses.map((s, k) => (k === i ? { ...s, ...patch } : s)) };
		});
	const setTransition = (i: number, patch: Partial<Transition>) =>
		setDraft((d) => ({ ...d, transitions: d.transitions.map((t, k) => (k === i ? { ...t, ...patch } : t)) }));

	const [focusId, setFocusId] = useState<string | null>(null);
	useEffect(() => {
		if (!focusId) return;
		const el = document.getElementById(`status-name-${focusId}`) as HTMLInputElement | null;
		el?.scrollIntoView({ block: "center", behavior: "smooth" });
		el?.select();
		setFocusId(null);
	}, [focusId]);

	/**
	 * Adds a status before the closing ones (where a new step usually goes),
	 * with a step leading to it from the status before, so it's reachable and
	 * the workflow can be saved right away. Both can be changed after.
	 */
	function addStatus() {
		const id = uid("st");
		setDraft((d) => {
			const firstClosed = d.statuses.findIndex((s) => isClosedCategory(s.category));
			const at = firstClosed === -1 ? d.statuses.length : firstClosed;
			const taken = new Set(d.statuses.map((s) => s.name.trim().toLowerCase()));
			let name = "New status";
			for (let n = 2; taken.has(name.toLowerCase()); n++) name = `New status ${n}`;
			const status: TicketStatus = { id, name, color: STATUS_COLORS[d.statuses.length % STATUS_COLORS.length], category: "in_progress" };
			const prev = d.statuses[at - 1];
			return {
				...d,
				statuses: [...d.statuses.slice(0, at), status, ...d.statuses.slice(at)],
				transitions: prev
					? [...d.transitions, { id: uid("tr"), from: prev.id, to: id, label: `Move to ${name}`, roles: ["admin", "technician", "broker"], requireComment: false, requiredFields: [] }]
					: d.transitions,
			};
		});
		setFocusId(id);
	}

	function removeStatus(i: number) {
		setDraft((d) => {
			const gone = d.statuses[i].id;
			const statuses = d.statuses.filter((_, k) => k !== i);
			return {
				...d,
				statuses,
				initialStatusId: d.initialStatusId === gone ? (statuses[0]?.id ?? "") : d.initialStatusId,
				// Transitions touching the removed status go with it.
				transitions: d.transitions.filter((t) => t.from !== gone && t.to !== gone),
			};
		});
	}

	const statusName = (id: string) => (id === ANY ? "Any status" : (draft.statuses.find((s) => s.id === id)?.name ?? "?"));

	/**
	 * Adds a step between the first two neighbouring statuses that aren't
	 * connected yet (the most likely missing one), named after where it goes,
	 * then brings it into view to be adjusted.
	 */
	function addTransition() {
		const id = uid("tr");
		setDraft((d) => {
			const linked = (a: string, b: string) => d.transitions.some((t) => t.from === a && t.to === b);
			let from = d.statuses[0]?.id ?? ANY;
			let to = d.statuses[1]?.id ?? d.statuses[0]?.id ?? "";
			for (let k = 0; k < d.statuses.length - 1; k++) {
				const a = d.statuses[k];
				const b = d.statuses[k + 1];
				if (!isClosedCategory(a.category) && !linked(a.id, b.id)) {
					from = a.id;
					to = b.id;
					break;
				}
			}
			const toName = d.statuses.find((x) => x.id === to)?.name ?? "";
			return {
				...d,
				transitions: [
					...d.transitions,
					{ id, from, to, label: toName ? `Move to ${toName}` : "New step", roles: ["admin", "technician", "broker"], requireComment: false, requiredFields: [] },
				],
			};
		});
		setFocusStep(id);
	}

	const [focusStep, setFocusStep] = useState<string | null>(null);
	useEffect(() => {
		if (!focusStep) return;
		const el = document.getElementById(`step-label-${focusStep}`) as HTMLInputElement | null;
		el?.closest("[data-step]")?.scrollIntoView({ block: "center", behavior: "smooth" });
		el?.select();
		setFocusStep(null);
	}, [focusStep]);

	/** Changing where a step goes renames it when it still has the automatic name. */
	function setTarget(i: number, to: string) {
		const t = draft.transitions[i];
		const oldName = draft.statuses.find((x) => x.id === t.to)?.name;
		const newName = draft.statuses.find((x) => x.id === to)?.name;
		setTransition(i, { to, ...(t.label === `Move to ${oldName}` && newName ? { label: `Move to ${newName}` } : {}) });
	}

	// Two steps doing the same move show up as two buttons on the ticket.
	const duplicates = useMemo(() => {
		const seen = new Map<string, string>();
		const out: string[] = [];
		for (const t of draft.transitions) {
			const key = `${t.from}>${t.to}`;
			if (seen.has(key)) out.push(`"${seen.get(key)}" and "${t.label}" both move tickets from ${statusName(t.from)} to ${statusName(t.to)}.`);
			else seen.set(key, t.label);
		}
		return out;
	}, [draft.transitions]);


	// Drag the statuses (by their ⋮⋮ handle) to reorder them.
	const statusDrag = useDragReorder({ count: draft.statuses.length, onMove: (from, to) => setDraft({ ...draft, statuses: reorder(draft.statuses, from, to) }) });
	return (
		<div className="flex flex-col gap-5">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="wf-name">Workflow name</Label>
					<Input id="wf-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="wf-desc">Description</Label>
					<Input id="wf-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What this flow is for" />
				</div>
			</div>

			<div className="flex flex-col gap-1.5">
				<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Preview</span>
				<FlowDiagram workflow={draft} />
				<span className="text-[11px] text-muted-foreground">
					Solid arrows move forward, dashed ones go back, and the line at the bottom holds steps available from any status.
					{usedBy.length > 0 && ` Used by: ${usedBy.map((t) => t.name).join(", ")}.`}
				</span>
			</div>

			{/* Statuses */}
			<section className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<h3 className="font-semibold text-sm">Statuses</h3>
					<Button size="sm" variant="secondary" onClick={addStatus}>
						<PlusIcon className="size-4" /> Status
					</Button>
				</div>
				<div className="flex flex-col gap-2">
					{draft.statuses.map((s, i) => (
						<div key={s.id} {...statusDrag.rowProps(i)} className={cn("relative flex flex-col gap-2 rounded-md border border-border border-l-4 bg-card p-2.5", statusDrag.isDragging(i) && "opacity-40")} style={{ borderLeftColor: s.color }}>
							{statusDrag.dropLine(i)}
							<div className="flex flex-wrap items-center gap-2">
							<DragHandle label={s.name || "status"} {...statusDrag.handleProps(i)} />
							<Input id={`status-name-${s.id}`} aria-label="Status name" className="h-8 min-w-48 flex-1 text-sm" value={s.name} onChange={(e) => setStatus(i, { name: e.target.value })} />
							<Select value={s.category} onValueChange={(v) => setStatus(i, { category: v as StatusCategory })}>
								<SelectTrigger aria-label={`What ${s.name || "this status"} means`} className="h-8 w-56 text-sm">
									<SelectValue>{STATUS_CATEGORIES.find((c) => c.id === s.category)?.meaning}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{STATUS_CATEGORIES.map((c) => (
										<SelectItem key={c.id} value={c.id}>
											<span className="flex flex-col">
												<span>{c.meaning}</span>
												<span className="text-muted-foreground text-xs">{c.hint}</span>
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<div className="flex items-center gap-1">
								<label className="flex items-center gap-1.5 whitespace-nowrap px-1 text-muted-foreground text-xs" title="New tickets start here">
									<input
										type="radio"
										name="initial-status"
										checked={draft.initialStatusId === s.id}
										onChange={() => setDraft({ ...draft, initialStatusId: s.id })}
										className="accent-[#2B6CB0]"
									/>
									Start
								</label>

								<Button variant="ghost" size="icon-sm" aria-label={`Delete ${s.name}`} onClick={() => removeStatus(i)} disabled={draft.statuses.length === 1}>
									<TrashIcon className="size-4" />
								</Button>
							</div>
							</div>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<TonePicker size="sm" value={s.color} onChange={(color) => setStatus(i, { color })} label={`Color of ${s.name}`} />
								<label className="flex items-center gap-2 text-muted-foreground text-xs" title="Moving a ticket here books a visit on the calendar (date, time, place and client), unless one is already booked.">
									<Switch checked={Boolean(s.needsVisit)} onCheckedChange={(v) => setStatus(i, { needsVisit: v || undefined })} aria-label={`${s.name} needs a visit on the calendar`} />
									Needs a visit on the calendar
								</label>
								<label className="flex items-center gap-2 text-muted-foreground text-xs" title="Tickets wait here for engineering: getting here sends a question with photos, and engineering's answer moves them on.">
									<Switch checked={Boolean(s.engineering)} onCheckedChange={(v) => setStatus(i, { engineering: v || undefined })} aria-label={`${s.name} waits on engineering`} />
									Waits on engineering
									</label>
									</div>
									<StatusEmailEditor statusName={s.name} value={s.email} onChange={(email) => setStatus(i, { email })} />
						</div>
					))}
				</div>
			</section>

			{/* Transitions */}
			<section className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<div>
						<h3 className="font-semibold text-sm">Transitions · {draft.transitions.length}</h3>
						<p className="text-muted-foreground text-xs">
							A transition is a button on the ticket that moves it from one status to another. Tickets can only move along these; the roles you pick
							are the only ones who see the button.
						</p>
					</div>
					<Button size="sm" variant="secondary" onClick={addTransition} disabled={draft.statuses.length === 0}>
						<PlusIcon className="size-4" /> Transition
					</Button>
				</div>
				{draft.transitions.length === 0 && (
					<p className="rounded-md border border-dashed border-border p-4 text-center text-muted-foreground text-sm">No transitions yet: tickets would stay in their first status.</p>
				)}
				{draft.transitions.map((t, i) => (
					<div key={t.id} data-step className="flex flex-col gap-2.5 rounded-md border border-border bg-card p-3">
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:grid-cols-[minmax(0,11rem)_auto_minmax(0,11rem)_minmax(0,1fr)_auto] lg:items-end">
							<label className="flex min-w-0 flex-col gap-1">
								<span className="text-[11px] text-muted-foreground uppercase tracking-wide">From</span>
							<Select value={t.from} onValueChange={(v) => setTransition(i, { from: v })}>
								<SelectTrigger aria-label="From status" className="h-8 text-sm">
									<SelectValue>{statusName(t.from)}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ANY}>Any status</SelectItem>
									{draft.statuses.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							</label>
							<ArrowRightIcon className="hidden size-4 shrink-0 self-end text-muted-foreground sm:mb-2 sm:block" />
							<label className="flex min-w-0 flex-col gap-1">
								<span className="text-[11px] text-muted-foreground uppercase tracking-wide">To</span>
							<Select value={t.to} onValueChange={(v) => setTarget(i, v)}>
								<SelectTrigger aria-label="To status" className="h-8 text-sm">
									<SelectValue>{statusName(t.to)}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{draft.statuses.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							</label>
							<label className="flex min-w-0 flex-col gap-1 sm:col-span-3 lg:col-span-1">
								<span className="text-[11px] text-muted-foreground uppercase tracking-wide">Button on the ticket</span>
								<Input
									id={`step-label-${t.id}`}
									aria-label="Button label"
									className="h-8 text-sm"
									value={t.label}
									placeholder="e.g. Start repair"
									onChange={(e) => setTransition(i, { label: e.target.value })}
								/>
							</label>
							<Button variant="ghost" size="icon-sm" aria-label={`Delete ${t.label}`} onClick={() => setDraft({ ...draft, transitions: draft.transitions.filter((_, k) => k !== i) })}>
								<TrashIcon className="size-4" />
							</Button>
						</div>
						<div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
							<div className="flex flex-wrap items-center gap-1.5">
								<span className="text-muted-foreground">Who:</span>
								{USER_ROLES.map((r) => {
									const on = t.roles.includes(r.id);
									return (
										<button
											key={r.id}
											type="button"
											aria-pressed={on}
											onClick={() => setTransition(i, { roles: on ? t.roles.filter((x) => x !== r.id) : [...t.roles, r.id as UserRole] })}
											className={cn("rounded-full border px-2 py-0.5 transition-colors", on ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground hover:bg-muted")}
										>
											{r.label}
										</button>
									);
								})}
							</div>
							<label className="flex items-center gap-1.5 text-muted-foreground">
								<Switch checked={t.requireComment} onCheckedChange={(v) => setTransition(i, { requireComment: Boolean(v) })} /> Requires a comment
							</label>
							<label className="flex items-center gap-1.5 text-muted-foreground" title="Field work: taken when finishing the visit on the Tasks screen (report, photos, customer signature). The ticket page sends people there.">
								<Switch checked={Boolean(t.onTasksScreen)} onCheckedChange={(v) => setTransition(i, { onTasksScreen: v || undefined })} /> Done on the Tasks screen
							</label>
							{fieldOptions.length > 0 && (
								<div className="flex flex-wrap items-center gap-1.5">
									<span className="text-muted-foreground">Needs fields:</span>
									{fieldOptions.map((f) => {
										const on = t.requiredFields.includes(f.id);
										return (
											<button
												key={f.id}
												type="button"
												aria-pressed={on}
												onClick={() =>
													setTransition(i, { requiredFields: on ? t.requiredFields.filter((x) => x !== f.id) : [...t.requiredFields, f.id] })
												}
												className={cn("rounded-full border px-2 py-0.5 transition-colors", on ? "border-amber-500 bg-amber-50 text-amber-800" : "border-border text-muted-foreground hover:bg-muted")}
											>
												{f.label}
											</button>
										);
									})}
								</div>
							)}
						</div>
						<p className="text-muted-foreground text-xs">
							{stepSentence(t, statusName, fieldOptions)}
						</p>
					</div>
				))}
				{duplicates.length > 0 && (
					<p className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 text-xs">
						<WarningIcon className="mt-0.5 size-3.5 shrink-0" />
						<span>{duplicates.join(" ")} They show as two buttons.</span>
					</p>
				)}
			</section>

			{deadEnds.length > 0 && (
				<p className="flex items-start gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
					<WarningIcon className="mt-0.5 size-3.5 shrink-0" />
					<span>
						Tickets in {deadEnds.map((s) => `"${s.name}"`).join(", ")} can't be reopened. Add a transition from{" "}
						{deadEnds.length === 1 ? "it" : "them"} to an open status (e.g. "Reopen") if that should be possible.
					</span>
				</p>
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
						<TrashIcon className="size-4" /> Delete workflow
					</Button>
				) : (
					<span />
				)}
				<div className="flex gap-2">
					<Button variant="secondary" size="sm" disabled={!dirty || saving} onClick={() => setDraft(workflow)}>
						Discard changes
					</Button>
					<Button size="sm" disabled={(!dirty && Boolean(workflow.id)) || problems.length > 0 || saving} onClick={() => onSave(draft)}>
						{saving ? "Saving…" : workflow.id ? "Save workflow" : "Create workflow"}
					</Button>
				</div>
			</div>
		</div>
	);
}

/** The step in plain words, e.g. "On a ticket in Open, technicians see “Start work”: it moves the ticket to In progress." */
function stepSentence(t: Transition, statusName: (id: string) => string, fields: { id: string; label: string }[]): string {
	const who = t.roles.length === 0 ? "nobody" : USER_ROLES.filter((r) => t.roles.includes(r.id)).map((r) => `${r.label.toLowerCase()}s`).join(", ");
	const where = t.from === ANY ? "On a ticket in any other status" : `On a ticket in ${statusName(t.from)}`;
	const needs = [
		...(t.requireComment ? ["a comment"] : []),
		...t.requiredFields.map((id) => fields.find((f) => f.id === id)?.label).filter(Boolean),
	];
	return `${where}, ${who} see “${t.label || "(no label)"}”: it moves the ticket to ${statusName(t.to)}${needs.length ? ` and asks for ${needs.join(", ")}` : ""}.`;
}
