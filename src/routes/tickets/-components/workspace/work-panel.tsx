import { ArrowBendUpRightIcon, LockSimpleIcon, PaperclipIcon, PencilSimpleLineIcon, XIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { ApiError, apiClient, errorMessage } from "#/lib/api/client";
import { cn } from "#/lib/utils";
import { type FieldValue, fieldErrors, isFilled, normalizeFieldValues, requiredForTransition, visibleFields } from "../../../../../shared/tickets";
import { roleLabel } from "../../../../../shared/users";
import { CustomFieldInput, formatFieldValue } from "../custom-field-input";
import { Panel, type Workspace } from "./shared";

const MAX_FILE = 2.4 * 1024 * 1024;
const NOBODY = "__keep__";

function readAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result));
		r.onerror = () => reject(r.error);
		r.readAsDataURL(file);
	});
}

/**
 * Working on the ticket, in one place: what was done (with files), the
 * type's details — the ones the next steps need come first — and forwarding
 * it to someone else when that's the next move. Moving it along its workflow
 * stays on the status bar above.
 */
export function WorkPanel({ ws }: { ws: Workspace }) {
	const { ticket, type, detail, canWork, closed, assignees, userName, reload } = ws;
	const navigate = useNavigate();
	const [text, setText] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [values, setValues] = useState<Record<string, FieldValue>>(ticket.fields);
	const [forwardTo, setForwardTo] = useState(NOBODY);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const defs = type?.fields ?? [];
	const norm = useMemo(() => normalizeFieldValues(defs, values), [defs, values]);
	const shown = visibleFields(defs, norm);
	const fieldsChanged = JSON.stringify(norm) !== JSON.stringify(normalizeFieldValues(defs, ticket.fields));
	const editable = canWork && !closed;

	// Which of the next steps need each field ("Needed for Mark as done").
	const neededBy = useMemo(() => {
		const map = new Map<string, string[]>();
		if (!type) return map;
		for (const tr of detail.transitions) for (const id of requiredForTransition(tr, type)) map.set(id, [...(map.get(id) ?? []), tr.label]);
		return map;
	}, [detail.transitions, type]);
	const needed = shown.filter((f) => neededBy.has(f.id));
	const others = shown.filter((f) => !neededBy.has(f.id));
	const missing = needed.filter((f) => !isFilled(f, norm[f.id])).length;

	const people = assignees.filter((u) => u.id !== ticket.assigneeId);
	const forwarding = forwardTo !== NOBODY;
	const nothing = !text.trim() && files.length === 0 && !fieldsChanged && !forwarding;

	function pick(list: FileList | null) {
		const ok = Array.from(list ?? []).filter((f) => {
			if (f.size > MAX_FILE) toast.error(`${f.name} is larger than 2.4 MB.`);
			return f.size <= MAX_FILE;
		});
		setFiles((prev) => [...prev, ...ok]);
	}

	async function save() {
		if (nothing || saving) return;
		// Fields required when the ticket was opened stay required.
		const local = fieldsChanged ? fieldErrors(shown, norm, shown.filter((f) => f.required).map((f) => f.id)) : {};
		setErrors(local);
		if (Object.keys(local).length) return toast.error("Check the highlighted details.");
		setSaving(true);
		const id = encodeURIComponent(ticket.id);
		try {
			for (const f of files) await apiClient.post(`/api/tickets/${id}/attachments`, { name: f.name, dataUrl: await readAsDataUrl(f) });
			if (fieldsChanged) await apiClient.put(`/api/tickets/${id}`, { fields: norm });
			let stillVisible = true;
			if (forwarding) {
				// The update travels as the forward's note, like forwarding an email with a message.
				const res = await apiClient.post<{ stillVisible: boolean }>(`/api/tickets/${id}/forward`, { to: forwardTo, message: text.trim() });
				stillVisible = res.stillVisible;
			} else if (text.trim()) {
				await apiClient.post(`/api/tickets/${id}/comments`, { comment: text.trim() });
			}
			toast.success(forwarding ? `Forwarded to ${userName(forwardTo)}` : "Saved", { description: `Ticket #${ticket.number}` });
			setText("");
			setFiles([]);
			setForwardTo(NOBODY);
			if (stillVisible) await reload();
			else navigate({ to: "/tickets" });
		} catch (e) {
			if (e instanceof ApiError) setErrors(e.fields);
			toast.error(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	const fieldInput = (f: (typeof shown)[number], hint?: string) =>
		editable ? (
			<div key={f.id} className="flex flex-col gap-1">
				<CustomFieldInput def={f} value={values[f.id]} onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))} required={f.required} error={errors[f.id]} idPrefix="work" />
				{hint && <span className="text-[11px] text-amber-700">{hint}</span>}
			</div>
		) : (
			<div key={f.id} className="flex flex-col gap-0.5 text-sm">
				<span className="text-muted-foreground text-xs">{f.label}</span>
				<span className="whitespace-pre-wrap">{formatFieldValue(f, ticket.fields[f.id])}</span>
			</div>
		);

	const label = forwarding ? `Forward to ${userName(forwardTo).split(" ")[0]}` : text.trim() || files.length ? (fieldsChanged ? "Save and post update" : "Post update") : "Save details";

	return (
		<Panel title="Work on this ticket" icon={<PencilSimpleLineIcon className="size-4" />}>
			<div className="flex flex-col gap-4">
				{!canWork && (
					<p className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
						<LockSimpleIcon className="size-4 shrink-0" /> You can post updates and files. Only the assignee, the visit's technician or an administrator changes details or forwards it.
					</p>
				)}

				{/* What was done */}
				<div className="flex flex-col gap-2">
					<Label htmlFor="work-update" className="text-xs">
						What was done
					</Label>
					<Textarea
						id="work-update"
						rows={3}
						className="resize-none"
						placeholder={forwarding ? `Note for ${userName(forwardTo).split(" ")[0]}: context, what's done, what's left…` : "What was done, what was agreed, next steps…"}
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
						}}
					/>
					{files.length > 0 && (
						<ul className="flex flex-wrap gap-1.5">
							{files.map((f, i) => (
								<li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs">
									<PaperclipIcon className="size-3" /> {f.name}
									<button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((prev) => prev.filter((_, k) => k !== i))}>
										<XIcon className="size-3" />
									</button>
								</li>
							))}
						</ul>
					)}
					<div>
						<input
							ref={inputRef}
							type="file"
							multiple
							accept="image/*,application/pdf,text/plain"
							className="hidden"
							onChange={(e) => {
								pick(e.target.files);
								e.target.value = "";
							}}
						/>
						<Button type="button" size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>
							<PaperclipIcon className="size-4" /> Attach files
						</Button>
					</div>
				</div>

				{/* The type's details: what the next steps need first */}
				{shown.length > 0 && (
					<div className="flex flex-col gap-3 border-border border-t pt-3">
						{needed.length > 0 && (
							<div className="flex flex-col gap-2">
								<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
									Needed to move on{missing ? ` · ${missing} to fill` : " · all filled"}
								</p>
								<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
									{needed.map((f) => fieldInput(f, isFilled(f, norm[f.id]) ? undefined : `Needed for ${neededBy.get(f.id)!.map((l) => `“${l}”`).join(", ")}`))}
								</div>
							</div>
						)}
						{others.length > 0 && (
							<div className="flex flex-col gap-2">
								<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">{type?.name} details</p>
								<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{others.map((f) => fieldInput(f))}</div>
							</div>
						)}
					</div>
				)}

				{/* Forward, when someone else should take it from here */}
				{editable && (
					<div className="flex flex-wrap items-end gap-2 border-border border-t pt-3">
						<div className="flex min-w-56 flex-1 flex-col gap-1">
							<Label className="flex items-center gap-1.5 text-xs">
								<ArrowBendUpRightIcon className="size-3.5" /> Forward to (optional)
							</Label>
							<Select value={forwardTo} onValueChange={setForwardTo}>
								<SelectTrigger className="h-9">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NOBODY}>Keep it with {userName(ticket.assigneeId)}</SelectItem>
									{people.map((u) => (
										<SelectItem key={u.id} value={u.id}>
											{u.name}
											<span className="text-muted-foreground text-xs"> · {u.jobTitle || (u.role ? roleLabel(u.role) : "")}</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<p className={cn("pb-2 text-muted-foreground text-xs", !forwarding && "hidden")}>They become the assignee; the update above goes as your note.</p>
					</div>
				)}

				<div className="flex items-center justify-end gap-2 border-border border-t pt-3">
					{(fieldsChanged || text || files.length > 0 || forwarding) && (
						<Button
							variant="ghost"
							size="sm"
							disabled={saving}
							onClick={() => {
								setText("");
								setFiles([]);
								setValues(ticket.fields);
								setForwardTo(NOBODY);
								setErrors({});
							}}
						>
							Discard
						</Button>
					)}
					<Button size="sm" disabled={nothing || saving} onClick={save}>
						{forwarding && <ArrowBendUpRightIcon className="size-4" />}
						{saving ? "Saving…" : label}
					</Button>
				</div>
			</div>
		</Panel>
	);
}
