import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { ApiError, apiClient, errorMessage } from "#/lib/api/client";
import { toast } from "sonner";
import { type Contact, type ContactStage, LEAD_SOURCES, TEMPERATURES, type Temperature } from "../../../../shared/contacts";
import type { DevelopmentTree } from "../../../../shared/developments";

const NONE = "__none__";

type Draft = Pick<Contact, "name" | "email" | "phone" | "company" | "ownerId" | "stageId" | "temperature" | "source" | "developmentId" | "notes" | "nextFollowUp"> & {
	budget: string;
};

function draftOf(c: Contact | null, stages: ContactStage[], meId: string): Draft {
	return {
		name: c?.name ?? "",
		email: c?.email ?? "",
		phone: c?.phone ?? "",
		company: c?.company ?? "",
		ownerId: c ? c.ownerId : meId,
		stageId: c?.stageId ?? stages[0]?.id ?? "",
		temperature: c?.temperature ?? "warm",
		source: c?.source ?? "",
		developmentId: c?.developmentId ?? null,
		budget: c?.budget === null || c?.budget === undefined ? "" : String(c.budget),
		notes: c?.notes ?? "",
		nextFollowUp: c?.nextFollowUp ?? null,
	};
}

/** New lead or edit: who they are, where they are in the funnel, and whose portfolio. */
export function ContactFormDialog({
	open,
	contact,
	stages,
	developments,
	people,
	isAdmin,
	meId,
	onClose,
	onSaved,
}: {
	open: boolean;
	contact: Contact | null;
	stages: ContactStage[];
	developments: DevelopmentTree[];
	people: { id: string; name: string }[];
	isAdmin: boolean;
	meId: string;
	onClose: () => void;
	onSaved: (c: Contact) => void;
}) {
	const [d, setD] = useState<Draft>(() => draftOf(contact, stages, meId));
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);
	useEffect(() => {
		if (open) {
			setD(draftOf(contact, stages, meId));
			setErrors({});
		}
	}, [open, contact, stages, meId]);
	const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

	async function save() {
		if (saving) return;
		setSaving(true);
		try {
			const body = { ...d, budget: d.budget.trim() === "" ? null : Number(d.budget.replace(/[$,\s]/g, "")) };
			const saved = contact
				? await apiClient.put<Contact>(`/api/contacts/${encodeURIComponent(contact.id)}`, body)
				: await apiClient.post<Contact>("/api/contacts", body);
			toast.success(contact ? "Lead updated" : `${saved.name} added to the portfolio`);
			onSaved(saved);
		} catch (e) {
			if (e instanceof ApiError) setErrors(e.fields);
			toast.error(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	const field = (key: keyof Draft, label: string, node: React.ReactNode, span = false) => (
		<div className={span ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"}>
			<Label htmlFor={`ct-${key}`}>{label}</Label>
			{node}
			{errors[key] && <span className="text-destructive text-xs">{errors[key]}</span>}
		</div>
	);

	return (
		<Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
			<DialogContent className="!flex !max-h-[90vh] !max-w-[95vw] flex-col !gap-0 !p-0 sm:!max-w-2xl">
				<div className="border-b px-6 pt-6 pb-4">
					<DialogTitle>{contact ? `Edit ${contact.name}` : "New lead"}</DialogTitle>
					<DialogDescription className="mt-1">
						{contact ? "Details and where the lead is in the funnel." : isAdmin ? "Add it to someone's portfolio, or leave it unassigned." : "It goes into your portfolio."}
					</DialogDescription>
				</div>
				<div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
					{field("name", "Name *", <Input id="ct-name" value={d.name} onChange={(e) => set({ name: e.target.value })} autoFocus />)}
					{field("company", "Company", <Input id="ct-company" value={d.company} onChange={(e) => set({ company: e.target.value })} placeholder="Optional" />)}
					{field("email", "Email", <Input id="ct-email" type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} />)}
					{field("phone", "Phone", <Input id="ct-phone" value={d.phone} onChange={(e) => set({ phone: e.target.value })} />)}
					{field(
						"stageId",
						"Stage",
						<Select value={d.stageId} onValueChange={(v) => set({ stageId: v })}>
							<SelectTrigger id="ct-stageId">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{stages.map((s) => (
									<SelectItem key={s.id} value={s.id}>
										{s.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>,
					)}
					{field(
						"temperature",
						"Temperature",
						<Select value={d.temperature} onValueChange={(v) => set({ temperature: v as Temperature })}>
							<SelectTrigger id="ct-temperature">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TEMPERATURES.map((t) => (
									<SelectItem key={t.id} value={t.id}>
										{t.label} <span className="text-muted-foreground text-xs">· {t.hint}</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>,
					)}
					{isAdmin &&
						field(
							"ownerId",
							"Portfolio (owner)",
							<Select value={d.ownerId ?? NONE} onValueChange={(v) => set({ ownerId: v === NONE ? null : v })}>
								<SelectTrigger id="ct-ownerId">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NONE}>Unassigned</SelectItem>
									{people.map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>,
						)}
					{field(
						"source",
						"Source",
						<Select value={d.source || NONE} onValueChange={(v) => set({ source: v === NONE ? "" : v })}>
							<SelectTrigger id="ct-source">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NONE}>Not set</SelectItem>
								{LEAD_SOURCES.map((s) => (
									<SelectItem key={s} value={s}>
										{s}
									</SelectItem>
								))}
							</SelectContent>
						</Select>,
					)}
					{field(
						"developmentId",
						"Interested in",
						<Select value={d.developmentId ?? NONE} onValueChange={(v) => set({ developmentId: v === NONE ? null : v })}>
							<SelectTrigger id="ct-developmentId">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NONE}>No development yet</SelectItem>
								{developments.map((dev) => (
									<SelectItem key={dev.id} value={dev.id}>
										{dev.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>,
					)}
					{field("budget", "Budget ($)", <Input id="ct-budget" inputMode="numeric" value={d.budget} onChange={(e) => set({ budget: e.target.value })} placeholder="e.g. 450000" />)}
					{field(
						"nextFollowUp",
						"Next follow-up",
						<Input id="ct-nextFollowUp" type="date" value={d.nextFollowUp ?? ""} onChange={(e) => set({ nextFollowUp: e.target.value || null })} />,
					)}
					{field(
						"notes",
						"Notes",
						<Textarea id="ct-notes" rows={3} className="resize-none" value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="What they're looking for, timing, preferences…" />,
						true,
					)}
				</div>
				<div className="flex justify-end gap-2 border-t px-6 py-3">
					<Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
						Cancel
					</Button>
					<Button size="sm" onClick={save} disabled={saving || !d.name.trim()}>
						{saving ? "Saving…" : contact ? "Save changes" : "Add lead"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
