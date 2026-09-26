import { ArrowCounterClockwiseIcon, LightningIcon, PlusIcon, TrashIcon, UsersIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { apiClient, errorMessage } from "#/lib/api/client";
import { cn } from "#/lib/utils";
import {
	addDays,
	type BillingPlan,
	type CadenceSettings,
	type CadenceStep,
	cadenceFrom,
	canAutomate,
	CHANNELS,
	type Channel,
	DEFAULT_CADENCE,
	type Installment,
	installmentState,
	renderMessage,
} from "../../../../shared/billing";

const VARIABLES: { id: string; hint: string }[] = [
	{ id: "name", hint: "Customer's name" },
	{ id: "amount", hint: "Amount open, with fees" },
	{ id: "due", hint: "Due date" },
	{ id: "installment", hint: "e.g. Installment 6/24" },
	{ id: "deal", hint: "Unit or development sold" },
	{ id: "days", hint: "Days late" },
];

/** A fictional installment, for the previews when there's no real one. */
const SAMPLE_PLAN: BillingPlan = {
	id: "sample",
	ticketId: "",
	ticketNumber: 1023,
	customer: { name: "Michael Reed", email: "michael.reed@example.com", phone: "+1 (555) 410-1023" },
	property: "Millennium Tower · Unit 602",
	totalPrice: 359000,
	installments: [],
	createdBy: "",
	createdAt: "",
	updatedAt: "",
};
const SAMPLE_INSTALLMENT: Installment = { id: "sample", kind: "monthly", label: "Installment 6/24", dueDate: addDays(new Date().toISOString().slice(0, 10), 5), amount: 14950, payments: [], steps: [] };

type Side = "before" | "on" | "after";
const sideOf = (d: number): Side => (d < 0 ? "before" : d > 0 ? "after" : "on");

/**
 * The billing cadence ("régua"): the touchpoints around each due date — so
 * many days before, on the day, or after — the channel, the message, and
 * whether the CRM sends it on its own (email, SMS, WhatsApp) or the team does
 * it from Today's actions. Also the late fee and interest.
 */
export function CadenceEditor({
	sample,
	onSaved,
	readOnly = false,
}: {
	/** A real installment for the message previews. */
	sample?: { plan: BillingPlan; installment: Installment };
	onSaved?: (c: CadenceSettings) => void;
	readOnly?: boolean;
}) {
	const [saved, setSaved] = useState<CadenceSettings | null>(null);
	const [draft, setDraft] = useState<CadenceSettings | null>(null);
	const [saving, setSaving] = useState(false);
	const fieldRefs = useRef(new Map<string, HTMLTextAreaElement>());
	useEffect(() => {
		apiClient
			.get<{ value: unknown }>("/api/settings/billingCadence")
			.then((r) => {
				const c = cadenceFrom(r.value);
				setSaved(c);
				setDraft(c);
			})
			.catch((e) => toast.error(errorMessage(e)));
	}, []);
	if (!draft || !saved) return <p className="py-10 text-center text-muted-foreground text-sm">Loading…</p>;

	const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
	const byId = (id: string) => draft.steps.findIndex((s) => s.id === id);
	const setStep = (id: string, patch: Partial<CadenceStep>) => setDraft({ ...draft, steps: draft.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
	const sorted = [...draft.steps].sort((a, b) => a.offsetDays - b.offsetDays);
	const plan = sample?.plan ?? SAMPLE_PLAN;
	const inst = sample?.installment ?? SAMPLE_INSTALLMENT;
	const preview = (s: CadenceStep) => {
		const day = addDays(inst.dueDate, s.offsetDays);
		return renderMessage(s.template, plan, inst, installmentState({ ...inst, payments: [] }, draft, day));
	};

	function insert(stepId: string, v: string) {
		const el = fieldRefs.current.get(stepId);
		const step = draft?.steps[byId(stepId)];
		if (!step) return;
		const token = `{${v}}`;
		const start = el?.selectionStart ?? step.template.length;
		const end = el?.selectionEnd ?? step.template.length;
		setStep(stepId, { template: step.template.slice(0, start) + token + step.template.slice(end) });
		requestAnimationFrame(() => {
			el?.focus();
			el?.setSelectionRange(start + token.length, start + token.length);
		});
	}

	async function save() {
		if (!draft) return;
		setSaving(true);
		try {
			const value = { ...draft, steps: [...draft.steps].sort((a, b) => a.offsetDays - b.offsetDays) };
			await apiClient.put("/api/settings/billingCadence", { value });
			setSaved(value);
			setDraft(value);
			onSaved?.(value);
			toast.success("Billing cadence saved");
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
			<div>
				<h3 className="font-semibold text-sm">Billing cadence</h3>
				<p className="text-muted-foreground text-xs">
					The touchpoints around each installment's due date. <b>Automatic</b> steps (email, SMS, WhatsApp) are sent by the CRM on their day; the others show up on Today's
					actions for the team. A promise to pay pauses them; paying stops them.
				</p>
			</div>

			<fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-4">
				{/* The steps on a line around the due date */}
				<div className="overflow-x-auto">
					<div className="flex min-w-max items-center gap-1.5 text-[11px]">
						{sorted.map((s, n) => (
							<div key={s.id} className="flex items-center gap-1.5">
								{((n === 0 && s.offsetDays >= 0) || (n > 0 && sorted[n - 1].offsetDays < 0 && s.offsetDays >= 0)) && (
									<span className="rounded-md bg-foreground px-1.5 py-0.5 font-semibold text-background">Due date</span>
								)}
								<span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ring-1 ring-inset", s.auto ? "bg-brand/10 text-brand ring-brand/30" : "bg-muted text-muted-foreground ring-border")}>
									{s.auto ? <LightningIcon weight="fill" className="size-3" /> : <UsersIcon className="size-3" />}
									{s.offsetDays === 0 ? "D" : s.offsetDays < 0 ? `D${s.offsetDays}` : `D+${s.offsetDays}`} · {CHANNELS.find((c) => c.id === s.channel)?.label}
								</span>
								{n < sorted.length - 1 && <span className="h-px w-3 bg-border" />}
							</div>
						))}
					</div>
				</div>

				<ol className="flex flex-col gap-2">
					{sorted.map((s) => {
						const side = sideOf(s.offsetDays);
						const automatable = canAutomate(s);
						return (
							<li key={s.id} className={cn("flex flex-col gap-2 rounded-md border border-border border-l-4 p-3", s.auto ? "border-l-brand" : "border-l-slate-300")}>
								<div className="flex flex-wrap items-end gap-2">
									<div className="flex flex-col gap-1">
										<Label className="text-xs">When</Label>
										<div className="flex items-center gap-1.5">
											{side !== "on" && (
												<Input
													type="number"
													min={1}
													aria-label="Days"
													className="h-8 w-16 text-sm"
													value={Math.abs(s.offsetDays)}
													onChange={(e) => {
														const n = Math.max(1, Math.round(Number(e.target.value) || 1));
														setStep(s.id, { offsetDays: side === "before" ? -n : n });
													}}
												/>
											)}
											<Select
												value={side}
												onValueChange={(v) => {
													const n = Math.max(1, Math.abs(s.offsetDays) || 1);
													setStep(s.id, { offsetDays: v === "on" ? 0 : v === "before" ? -n : n });
												}}
											>
												<SelectTrigger aria-label="Before or after the due date" className="h-8 w-56 text-sm">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="before">days before the due date</SelectItem>
													<SelectItem value="on">on the due date</SelectItem>
													<SelectItem value="after">days after the due date</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>
									<div className="flex flex-col gap-1">
										<Label className="text-xs">Channel</Label>
										<Select value={s.channel} onValueChange={(v) => setStep(s.id, { channel: v as Channel, ...(canAutomate({ channel: v as Channel }) ? {} : { auto: undefined }) })}>
											<SelectTrigger className="h-8 w-40 text-sm">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{CHANNELS.map((c) => (
													<SelectItem key={c.id} value={c.id}>
														{c.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="flex min-w-48 flex-1 flex-col gap-1">
										<Label className="text-xs">Step</Label>
										<Input className="h-8 text-sm" value={s.title} onChange={(e) => setStep(s.id, { title: e.target.value })} />
									</div>
									<label
										className={cn("flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs", s.auto ? "border-brand/40 bg-brand/5 text-brand" : "border-border text-muted-foreground")}
										title={automatable ? "The CRM sends it on its day" : "Calls, letters and tasks are done by the team"}
									>
										<Switch checked={Boolean(s.auto)} disabled={!automatable} onCheckedChange={(v) => setStep(s.id, { auto: v || undefined })} aria-label={`Send ${s.title} automatically`} />
										{automatable ? (s.auto ? "Automatic" : "By the team") : "By the team"}
									</label>
									<Button variant="ghost" size="icon-sm" aria-label={`Remove ${s.title}`} disabled={draft.steps.length === 1} onClick={() => setDraft({ ...draft, steps: draft.steps.filter((x) => x.id !== s.id) })}>
										<TrashIcon className="size-4" />
									</Button>
								</div>
								<div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
									<div className="flex flex-col gap-1">
										<Textarea
											ref={(el) => {
												if (el) fieldRefs.current.set(s.id, el);
												else fieldRefs.current.delete(s.id);
											}}
											rows={3}
											className="resize-none text-sm"
											value={s.template}
											onChange={(e) => setStep(s.id, { template: e.target.value })}
											aria-label={`Message for ${s.title}`}
										/>
										{!readOnly && (
											<div className="flex flex-wrap gap-1">
												{VARIABLES.map((v) => (
													<button
														key={v.id}
														type="button"
														title={v.hint}
														onMouseDown={(e) => e.preventDefault()}
														onClick={() => insert(s.id, v.id)}
														className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:border-brand/50 hover:text-brand"
													>
														{`{${v.id}}`}
													</button>
												))}
											</div>
										)}
									</div>
									<div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
										<p className="mb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
											Preview · {plan.customer.name} · {inst.label}
										</p>
										<p className="whitespace-pre-wrap">{preview(s) || <span className="text-muted-foreground">No message.</span>}</p>
									</div>
								</div>
							</li>
						);
					})}
				</ol>
				{!readOnly && (
					<div>
						<Button
							size="sm"
							variant="secondary"
							onClick={() =>
								setDraft({
									...draft,
									steps: [
										...draft.steps,
										{ id: `s${Date.now().toString(36)}`, offsetDays: -2, channel: "sms", auto: true, title: "Text reminder", template: "Hi {name}, just a reminder: {installment} of {amount} is due on {due}." },
									],
								})
							}
						>
							<PlusIcon className="size-4" /> Step
						</Button>
					</div>
				)}

				<div className="grid grid-cols-1 gap-3 border-border border-t pt-4 sm:grid-cols-3">
					<div className="flex flex-col gap-1">
						<Label className="text-xs">Late fee (% once)</Label>
						<Input type="number" step="0.1" className="h-8 text-sm" value={draft.lateFeePct} onChange={(e) => setDraft({ ...draft, lateFeePct: Number(e.target.value) || 0 })} />
					</div>
					<div className="flex flex-col gap-1">
						<Label className="text-xs">Interest (% a month, per day)</Label>
						<Input type="number" step="0.1" className="h-8 text-sm" value={draft.interestPctMonth} onChange={(e) => setDraft({ ...draft, interestPctMonth: Number(e.target.value) || 0 })} />
					</div>
					<div className="flex flex-col gap-1">
						<Label className="text-xs">Grace days before fees</Label>
						<Input type="number" className="h-8 text-sm" value={draft.graceDays} onChange={(e) => setDraft({ ...draft, graceDays: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
					</div>
				</div>
			</fieldset>

			{!readOnly && (
				<div className="flex flex-wrap justify-end gap-2 border-border border-t pt-4">
					<Button variant="ghost" size="sm" onClick={() => setDraft(DEFAULT_CADENCE)} disabled={saving}>
						<ArrowCounterClockwiseIcon className="size-4" /> Use defaults
					</Button>
					<Button variant="secondary" size="sm" onClick={() => setDraft(saved)} disabled={!dirty || saving}>
						Discard changes
					</Button>
					<Button size="sm" onClick={save} disabled={!dirty || saving || draft.steps.some((s) => !s.title.trim())}>
						{saving ? "Saving…" : "Save cadence"}
					</Button>
				</div>
			)}
		</div>
	);
}
