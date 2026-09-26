import { PlusIcon } from "@phosphor-icons/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { apiClient, errorMessage } from "#/lib/api/client";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import { cn } from "#/lib/utils";
import type { TicketType, Workflow } from "../../../../shared/tickets";
import { newTypeDraft, TypeEditor } from "../../tickets/-components/type-editor";
import { useTicketConfig } from "../../tickets/-components/use-ticket-config";
import { newWorkflowDraft, WorkflowEditor } from "../../tickets/-components/workflow-editor";

export type TicketSettingsTab = "workflows" | "types";

/**
 * Settings for tickets (admins): workflows (the status paths) and ticket
 * types (custom fields, SLA, and which workflow they follow).
 */
export function TicketSettings({ tab, onDirtyChange: reportDirty }: { tab: TicketSettingsTab; onDirtyChange: (dirty: boolean) => void }) {
	const { user } = useCurrentUser();
	const config = useTicketConfig(user?.id);
	const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
	const [selectedType, setSelectedType] = useState<string | null>(null);
	const [draftWorkflow, setDraftWorkflow] = useState<Workflow | null>(null);
	const [draftType, setDraftType] = useState<TicketType | null>(null);
	const [dirty, setDirty] = useState(false);
	const [saving, setSaving] = useState(false);
	const onDirtyChange = useCallback(
		(d: boolean) => {
			setDirty(d);
			reportDirty(d);
		},
		[reportDirty],
	);

	const workflow = draftWorkflow ?? config.workflows.find((w) => w.id === selectedWorkflow) ?? config.workflows[0] ?? null;
	const type = draftType ?? config.types.find((t) => t.id === selectedType) ?? config.types[0] ?? null;
	const usedBy = useMemo(() => config.types.filter((t) => t.workflowId === workflow?.id), [config.types, workflow?.id]);

	/** Asks before throwing away unsaved edits. */
	function leave(action: () => void) {
		if (dirty && !window.confirm("You have unsaved changes. Discard them?")) return;
		onDirtyChange(false);
		action();
	}

	async function saveWorkflow(w: Workflow) {
		setSaving(true);
		try {
			const saved = w.id
				? await apiClient.put<Workflow>(`/api/workflows/${encodeURIComponent(w.id)}`, w)
				: await apiClient.post<Workflow>("/api/workflows", w);
			await config.reload();
			setDraftWorkflow(null);
			setSelectedWorkflow(saved.id);
			onDirtyChange(false);
			toast.success(`Workflow "${saved.name}" saved`);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	async function deleteWorkflow(w: Workflow) {
		if (!window.confirm(`Delete the workflow "${w.name}"?`)) return;
		try {
			await apiClient.delete(`/api/workflows/${encodeURIComponent(w.id)}`);
			await config.reload();
			setSelectedWorkflow(null);
			onDirtyChange(false);
			toast.success("Workflow deleted");
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	async function saveType(t: TicketType) {
		setSaving(true);
		try {
			const saved = t.id
				? await apiClient.put<TicketType>(`/api/ticket-types/${encodeURIComponent(t.id)}`, t)
				: await apiClient.post<TicketType>("/api/ticket-types", t);
			await config.reload();
			setDraftType(null);
			setSelectedType(saved.id);
			onDirtyChange(false);
			toast.success(`Ticket type "${saved.name}" saved`);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	async function deleteType(t: TicketType) {
		if (!window.confirm(`Delete the ticket type "${t.name}"?`)) return;
		try {
			await apiClient.delete(`/api/ticket-types/${encodeURIComponent(t.id)}`);
			await config.reload();
			setSelectedType(null);
			onDirtyChange(false);
			toast.success("Ticket type deleted");
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	if (config.loading) return <p className="py-10 text-center text-muted-foreground text-sm">Loading…</p>;

	return tab === "workflows" ? (
		<div className="flex flex-col gap-3">
			<p className="text-muted-foreground text-sm">
				A workflow is the set of paths a ticket can take from status to status. Each ticket type follows one workflow, so tickets of that type can only move
				along its steps.
			</p>
			<div className="flex flex-col gap-4 lg:flex-row">
				<SideList
					title="Workflows"
					addLabel="New workflow"
					onAdd={() => leave(() => setDraftWorkflow(newWorkflowDraft()))}
					items={[
						...(draftWorkflow && !draftWorkflow.id ? [{ id: "__draft__", name: draftWorkflow.name, meta: "Not saved yet", color: "#2B6CB0" }] : []),
						...config.workflows.map((w) => {
							// Which ticket types follow it: that's what decides a ticket's possible paths.
							const types = config.types.filter((t) => t.workflowId === w.id).map((t) => t.name);
							return {
								id: w.id,
								name: w.name,
								meta: `${w.statuses.length} statuses · ${types.length ? `Used by ${types.join(", ")}` : "Not used by any ticket type"}`,
								color: "#2B6CB0",
							};
						}),
					]}
					selectedId={draftWorkflow && !draftWorkflow.id ? "__draft__" : workflow?.id}
					onSelect={(id) => id !== "__draft__" && leave(() => (setDraftWorkflow(null), setSelectedWorkflow(id)))}
				/>
				<div className="min-w-0 flex-1 rounded-lg border border-border bg-card p-4 shadow-sm">
					{workflow ? (
						<WorkflowEditor
							key={workflow.id || "draft"}
							workflow={workflow}
							usedBy={usedBy}
							saving={saving}
							onSave={saveWorkflow}
							onDelete={workflow.id ? () => deleteWorkflow(workflow) : () => leave(() => setDraftWorkflow(null))}
							onDirtyChange={onDirtyChange}
						/>
					) : (
						<p className="text-muted-foreground text-sm">Create your first workflow.</p>
					)}
				</div>
			</div>
		</div>
	) : (
		<div className="flex flex-col gap-4 lg:flex-row">
			<SideList
				title="Ticket types"
				addLabel="New type"
				onAdd={() => leave(() => setDraftType(newTypeDraft(config.workflows[0]?.id ?? "")))}
				items={[
					...(draftType && !draftType.id ? [{ id: "__draft__", name: draftType.name, meta: "Not saved yet", color: draftType.color }] : []),
					...config.types.map((t) => ({
						id: t.id,
						name: t.name,
						meta: `${config.workflowById.get(t.workflowId)?.name ?? "No workflow"} · ${t.fields.length} fields${t.active ? "" : " · inactive"}`,
						color: t.color,
					})),
				]}
				selectedId={draftType && !draftType.id ? "__draft__" : type?.id}
				onSelect={(id) => id !== "__draft__" && leave(() => (setDraftType(null), setSelectedType(id)))}
			/>
			<div className="min-w-0 flex-1 rounded-lg border border-border bg-card p-4 shadow-sm">
				{type ? (
					<TypeEditor
						key={type.id || "draft"}
						type={type}
						workflows={config.workflows}
						saving={saving}
						onSave={saveType}
						onDelete={type.id ? () => deleteType(type) : () => leave(() => setDraftType(null))}
						onDirtyChange={onDirtyChange}
					/>
				) : (
					<p className="text-muted-foreground text-sm">Create a workflow first, then a ticket type that uses it.</p>
				)}
			</div>
		</div>
	);
}

function SideList({
	title,
	addLabel,
	onAdd,
	items,
	selectedId,
	onSelect,
}: {
	title: string;
	addLabel: string;
	onAdd: () => void;
	items: { id: string; name: string; meta: string; color: string }[];
	selectedId?: string;
	onSelect: (id: string) => void;
}) {
	return (
		<aside className="flex w-full shrink-0 flex-col gap-2 lg:w-64">
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">{title}</h2>
				<Button size="sm" variant="secondary" onClick={onAdd}>
					<PlusIcon className="size-4" /> {addLabel}
				</Button>
			</div>
			{items.map((it) => (
				<button
					key={it.id}
					type="button"
					onClick={() => onSelect(it.id)}
					className={cn(
						"rounded-lg border border-l-4 bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/40",
						selectedId === it.id ? "border-brand" : "border-border",
					)}
					style={{ borderLeftColor: it.color }}
				>
					<div className="font-semibold text-sm">{it.name}</div>
					<div className="text-muted-foreground text-xs">{it.meta}</div>
				</button>
			))}
		</aside>
	);
}
