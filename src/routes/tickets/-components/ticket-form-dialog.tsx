import { useEffect, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Separator } from "#/components/ui/separator";
import { Textarea } from "#/components/ui/textarea";
import { ApiError } from "#/lib/api/client";
import type { DevelopmentTree } from "../../../../shared/developments";
import {
	fieldErrors,
	type FieldValue,
	normalizeFieldValues,
	type Priority,
	PRIORITIES,
	type TicketType,
	SIGNATURE_FIELD,
	visibleFields,
} from "../../../../shared/tickets";
import { CustomFieldInput } from "./custom-field-input";
import { LocationPicker, type LocationValue } from "./location-picker";

const NONE = "__none__";

export interface NewTicketInput {
	typeId: string;
	title: string;
	description: string;
	priority: Priority;
	assigneeId: string | null;
	requester: { name: string; email: string; phone: string };
	developmentId: string;
	blockId: string;
	unitId: string;
	fields: Record<string, FieldValue>;
}

export function TicketFormDialog({
	open,
	onOpenChange,
	types,
	developments,
	assignees,
	canAssign,
	defaultTypeId,
	initial,
	onCreate,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	/** Active ticket types only. */
	types: TicketType[];
	developments: DevelopmentTree[];
	assignees: { id: string; name: string }[];
	/** Admins pick the assignee; employees are assigned automatically. */
	canAssign: boolean;
	defaultTypeId?: string;
	/** Values to start from, e.g. a deal opened from a contact. */
	initial?: Partial<Pick<NewTicketInput, "title" | "description" | "requester" | "developmentId" | "assigneeId" | "fields">>;
	onCreate: (input: NewTicketInput) => Promise<unknown>;
}) {
	const [typeId, setTypeId] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [priority, setPriority] = useState<Priority>("medium");
	const [assigneeId, setAssigneeId] = useState("");
	const [requester, setRequester] = useState({ name: "", email: "", phone: "" });
	const [location, setLocation] = useState<LocationValue>({ developmentId: "", blockId: "", unitId: "" });
	const [fields, setFields] = useState<Record<string, FieldValue>>({});
	const [submitted, setSubmitted] = useState(false);
	const [saving, setSaving] = useState(false);
	const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

	const type = types.find((t) => t.id === typeId);

	useEffect(() => {
		if (!open) return;
		const first = types.find((t) => t.id === defaultTypeId) ?? types[0];
		setTypeId(first?.id ?? "");
		setPriority(first?.defaultPriority ?? "medium");
		setTitle(initial?.title ?? "");
		setDescription(initial?.description ?? "");
		setAssigneeId(initial?.assigneeId ?? "");
		setRequester(initial?.requester ?? { name: "", email: "", phone: "" });
		setLocation({ developmentId: initial?.developmentId ?? "", blockId: "", unitId: "" });
		setFields(initial?.fields ?? {});
		setSubmitted(false);
		setServerErrors({});
	}, [open, types, defaultTypeId, initial]);

	function pickType(id: string) {
		setTypeId(id);
		const t = types.find((x) => x.id === id);
		if (t) setPriority(t.defaultPriority);
		setFields({});
	}

	const errors = useMemo(() => {
		const e: Record<string, string> = {};
		if (!title.trim()) e.title = "Title is required.";
		if (type) {
			const values = normalizeFieldValues(type.fields, fields);
			Object.assign(e, fieldErrors(type.fields, values, type.fields.filter((f) => f.required).map((f) => f.id)));
		}
		return { ...e, ...serverErrors };
	}, [title, type, fields, serverErrors]);

	const show = (key: string) => (submitted || serverErrors[key]) && errors[key];

	async function submit() {
		setSubmitted(true);
		const blocking = Object.keys(errors).filter((k) => !serverErrors[k]);
		if (!type || blocking.length || saving) return;
		setSaving(true);
		try {
			await onCreate({
				typeId: type.id,
				title: title.trim(),
				description: description.trim(),
				priority,
				assigneeId: canAssign ? assigneeId || null : null,
				requester,
				...location,
				fields: normalizeFieldValues(type.fields, fields),
			});
			onOpenChange(false);
		} catch (e) {
			if (e instanceof ApiError) setServerErrors(e.fields);
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="!flex !max-h-[88vh] w-full !max-w-[95vw] flex-col !gap-0 !overflow-hidden !bg-card !p-0 sm:!max-w-2xl">
				<div className="shrink-0 border-b px-6 pt-6 pb-4 text-left">
					<DialogTitle className="text-left">New ticket</DialogTitle>
					<DialogDescription className="mt-1.5 text-left">
						{type?.description || "Pick a type; its workflow and fields are set by the administrator."}
					</DialogDescription>
				</div>

				<form
					id="ticket-form"
					className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
					onSubmit={(e) => {
						e.preventDefault();
						submit();
					}}
				>
					<div className="flex flex-col gap-5">
						<div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ticket type">
							{types.map((t) => (
								<button
									key={t.id}
									type="button"
									role="radio"
									aria-checked={t.id === typeId}
									onClick={() => pickType(t.id)}
									className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
										t.id === typeId ? "border-brand bg-brand/10 font-medium text-brand" : "border-border text-muted-foreground hover:bg-muted"
									}`}
								>
									<span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
									{t.name}
								</button>
							))}
						</div>

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div className="flex flex-col gap-1.5 sm:col-span-2">
								<Label htmlFor="tk-title">
									Title <span className="text-destructive">*</span>
								</Label>
								<Input id="tk-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary of the problem or request" />
								{show("title") && <span className="text-destructive text-xs">{errors.title}</span>}
							</div>
							<div className="flex flex-col gap-1.5 sm:col-span-2">
								<Label htmlFor="tk-desc">Description</Label>
								<Textarea id="tk-desc" rows={3} className="resize-none" value={description} onChange={(e) => setDescription(e.target.value)} />
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="tk-priority">Priority</Label>
								<Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
									<SelectTrigger id="tk-priority" className="h-9">
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
								<Label htmlFor="tk-assignee">Assignee</Label>
								{canAssign ? (
									<Select value={assigneeId || NONE} onValueChange={(v) => setAssigneeId(v === NONE ? "" : v)}>
										<SelectTrigger id="tk-assignee" className="h-9">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NONE}>Unassigned</SelectItem>
											{assignees.map((u) => (
												<SelectItem key={u.id} value={u.id}>
													{u.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								) : (
									<Input id="tk-assignee" className="h-9" value="You" disabled />
								)}
								{show("assigneeId") && <span className="text-destructive text-xs">{errors.assigneeId}</span>}
							</div>
						</div>

						<Separator />
						<div className="flex flex-col gap-3">
							<h3 className="font-semibold text-sm">Requester</h3>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
								<Input aria-label="Requester name" placeholder="Name" value={requester.name} onChange={(e) => setRequester({ ...requester, name: e.target.value })} />
								<Input aria-label="Requester email" type="email" placeholder="Email" value={requester.email} onChange={(e) => setRequester({ ...requester, email: e.target.value })} />
								<Input aria-label="Requester phone" placeholder="Phone" value={requester.phone} onChange={(e) => setRequester({ ...requester, phone: e.target.value })} />
							</div>
						</div>

						<Separator />
						<div className="flex flex-col gap-3">
							<h3 className="font-semibold text-sm">Location</h3>
							<LocationPicker developments={developments} value={location} onChange={setLocation} errors={serverErrors} idPrefix="tk" />
						</div>

						{type && type.fields.length > 0 && (
							<>
								<Separator />
								<div className="flex flex-col gap-3">
									<h3 className="font-semibold text-sm">{type.name} details</h3>
									<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
										{visibleFields(type.fields, fields).filter((f) => f.id !== SIGNATURE_FIELD).map((f) => (
											<CustomFieldInput
												key={f.id}
												def={f}
												value={fields[f.id]}
												onChange={(v) => {
													setFields((prev) => ({ ...prev, [f.id]: v }));
													setServerErrors((e) => ({ ...e, [f.id]: "" }));
												}}
												required={f.required}
												error={show(f.id) || undefined}
												idPrefix="tk-new"
											/>
										))}
									</div>
								</div>
							</>
						)}
					</div>
				</form>

				<div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/20 px-6 py-4 sm:flex-row sm:justify-end">
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="submit" form="ticket-form" disabled={saving || !type}>
						{saving ? "Creating…" : "Create ticket"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
