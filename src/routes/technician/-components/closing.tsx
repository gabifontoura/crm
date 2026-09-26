import {
	CheckCircleIcon,
	FloppyDiskIcon,
	HandshakeIcon,
	PlusIcon,
	SmileyAngryIcon,
	SmileyIcon,
	SmileyMehIcon,
	SmileySadIcon,
	SmileyStickerIcon,
	StarIcon,
	TrashIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { ApiError, apiClient, errorMessage } from "#/lib/api/client";
import { formatCurrency, formatDuration, formatTime } from "#/lib/format";
import { cn } from "#/lib/utils";
import {
	closeClock,
	completionProblems,
	MAX_PHOTOS,
	MAX_TOTAL_PHOTOS,
	newPart,
	partsTotal,
	type PartUsed,
	type Satisfaction,
	SATISFACTION_OPTIONS,
	type ServiceReport,
	ticketFieldsFromReport,
	totalPhotos,
} from "../../../../shared/service";
import { type FieldValue, fieldErrors, normalizeFieldValues, requiredForTransition, SIGNATURE_FIELD, type TicketType } from "../../../../shared/tickets";
import { CustomFieldInput } from "../../tickets/-components/custom-field-input";
import { PhotoButtons, PhotoThumbs, PhotoViewer } from "./photos";
import { SignaturePad } from "./signature-pad";
import { localHm, type TaskJob, taskKind } from "./task-utils";

type Updater = (fn: (r: ServiceReport) => ServiceReport) => void;

const SATISFACTION_ICONS: Record<Satisfaction, React.ComponentType<{ className?: string }>> = {
	very_dissatisfied: SmileyAngryIcon,
	dissatisfied: SmileySadIcon,
	neutral: SmileyMehIcon,
	satisfied: SmileyIcon,
	very_satisfied: SmileyStickerIcon,
};

const NO_MOVE = "__none__";

/** Closing ("Validation") tab: report, customer sign-off and finishing the task. */
export function Closing({
	job,
	report,
	update,
	editable,
	minutes,
	saveState,
	onCompleted,
}: {
	job: TaskJob;
	report: ServiceReport;
	update: Updater;
	editable: boolean;
	minutes: number;
	saveState: "saved" | "saving" | "error";
	onCompleted: () => void;
}) {
	const completed = report.status === "completed";
	const isService = taskKind(job.event.type) === "service";
	const patch = (p: Partial<ServiceReport>) => update((r) => ({ ...r, ...p }));
	const setPart = (i: number, p: Partial<PartUsed>) => update((r) => ({ ...r, parts: r.parts.map((x, k) => (k === i ? { ...x, ...p } : x)) }));
	// Name typed before the customer signs (the signature then keeps it).
	const [signerName, setSignerName] = useState(report.signature?.name ?? "");
	const [viewing, setViewing] = useState<number | null>(null);
	const photoRoom = Math.min(MAX_PHOTOS - report.photos.length, MAX_TOTAL_PHOTOS - totalPhotos(report));

	return (
		<div className="space-y-4">
			{/* REPORT */}
			<Card>
				<CardContent className="space-y-4 p-4">
					<Label className="font-semibold text-[15px]">{isService ? "Diagnosis and work performed" : "Findings"}</Label>
					<div className="space-y-1.5">
						<Label htmlFor="svc-findings" className="font-medium text-[15px]">
							{isService ? "Root cause / diagnosis" : "What you found"}
						</Label>
						<Textarea
							id="svc-findings"
							rows={3}
							disabled={!editable}
							value={report.findings}
							onChange={(e) => patch({ findings: e.target.value })}
							placeholder={isService ? "What caused the problem" : "Overall condition and anything that needs attention"}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="svc-work" className="font-medium text-[15px]">
							Work performed
						</Label>
						<Textarea
							id="svc-work"
							rows={3}
							disabled={!editable}
							value={report.workPerformed}
							onChange={(e) => patch({ workPerformed: e.target.value })}
							placeholder={isService ? "What you fixed and how you tested it" : "Optional for inspections"}
						/>
					</div>
				</CardContent>
			</Card>

			{/* PARTS */}
			<Card>
				<CardContent className="space-y-3 p-4">
					<div className="flex items-center justify-between">
						<Label className="font-semibold text-[15px]">Parts and materials</Label>
						<span className="text-muted-foreground text-[13px]">{report.parts.length ? formatCurrency(partsTotal(report.parts)) : "Optional"}</span>
					</div>
					{report.parts.map((p, i) => (
						<div key={p.id} className="grid grid-cols-[1fr_64px_88px_32px] items-center gap-2">
							<Input aria-label="Part or material" className="h-10" placeholder="Description" disabled={!editable} value={p.description} onChange={(e) => setPart(i, { description: e.target.value })} />
							<Input aria-label="Quantity" type="number" min={0} className="h-10" disabled={!editable} value={p.qty} onChange={(e) => setPart(i, { qty: Number(e.target.value) })} />
							<Input aria-label="Unit cost" type="number" min={0} step="0.01" className="h-10" disabled={!editable} value={p.unitCost} onChange={(e) => setPart(i, { unitCost: Number(e.target.value) })} />
							{editable ? (
								<Button variant="ghost" size="icon-sm" aria-label="Remove part" onClick={() => update((r) => ({ ...r, parts: r.parts.filter((_, k) => k !== i) }))}>
									<TrashIcon className="h-4 w-4" />
								</Button>
							) : (
								<span />
							)}
						</div>
					))}
					{report.parts.length > 0 && (
						<div className="grid grid-cols-[1fr_64px_88px_32px] gap-2 text-[13px] text-muted-foreground">
							<span />
							<span>Qty</span>
							<span>Unit $</span>
						</div>
					)}
					{editable && (
						<Button variant="secondary" size="sm" className="gap-2" onClick={() => update((r) => ({ ...r, parts: [...r.parts, newPart()] }))}>
							<PlusIcon className="h-4 w-4" /> Add part or material
						</Button>
					)}
				</CardContent>
			</Card>

			{/* VISIT PHOTOS */}
			<Card>
				<CardContent className="space-y-3 p-4">
					<div className="flex items-center justify-between">
						<Label className="font-semibold text-[15px]">Visit photos</Label>
						<span className="text-muted-foreground text-[13px]">
							{report.photos.length}/{MAX_PHOTOS}
						</span>
					</div>
					<p className="text-muted-foreground text-[13px]">General photos of the visit. Evidence for a specific action goes on that action.</p>
					<PhotoThumbs
						photos={report.photos}
						size="h-20 w-20"
						onOpen={setViewing}
						onRemove={editable ? (i) => update((r) => ({ ...r, photos: r.photos.filter((_, k) => k !== i) })) : undefined}
					/>
					{editable && (
						<PhotoButtons
							room={photoRoom}
							limitMessage={report.photos.length >= MAX_PHOTOS ? `Up to ${MAX_PHOTOS} visit photos.` : `Up to ${MAX_TOTAL_PHOTOS} photos per task.`}
							onAdd={(photos) => update((r) => ({ ...r, photos: [...r.photos, ...photos].slice(0, MAX_PHOTOS) }))}
						/>
					)}
					<PhotoViewer
						photos={report.photos}
						index={viewing}
						onIndexChange={setViewing}
						onClose={() => setViewing(null)}
						onRemove={editable ? (i) => update((r) => ({ ...r, photos: r.photos.filter((_, k) => k !== i) })) : undefined}
						onCaption={editable ? (i, caption) => update((r) => ({ ...r, photos: r.photos.map((p, k) => (k === i ? { ...p, caption } : p)) })) : undefined}
					/>
				</CardContent>
			</Card>

			{/* TITLE */}
			<div className="flex items-center gap-2 pt-2">
				<HandshakeIcon className="h-5 w-5 text-primary" />
				<h3 className="font-semibold text-foreground text-lg">Closing with the customer</h3>
			</div>

			{/* CUSTOMER PRESENT */}
			<Card>
				<CardContent className="space-y-2 p-4">
					<div className="flex min-h-12 items-center gap-3">
						<Checkbox
							id="customer-present"
							checked={report.customerPresent}
							disabled={!editable}
							onCheckedChange={(v) => patch(v === true ? { customerPresent: true } : { customerPresent: false, signature: null, satisfaction: null })}
							className="h-5 w-5"
						/>
						<Label htmlFor="customer-present" className="cursor-pointer font-medium text-[15px] leading-5">
							The customer accompanied the service
						</Label>
					</div>
					{report.customerPresent && (
						<div className="space-y-1.5">
							<Label htmlFor="companion-name" className="font-medium text-[15px]">
								Name of the person who accompanied
							</Label>
							<Input
								id="companion-name"
								placeholder="Enter the name"
								disabled={!editable}
								value={report.signature?.name ?? signerName}
								onChange={(e) => {
									setSignerName(e.target.value);
									const name = e.target.value;
									update((r) => (r.signature ? { ...r, signature: { ...r.signature, name } } : r));
								}}
								className="h-11"
							/>
						</div>
					)}
				</CardContent>
			</Card>

			{report.customerPresent && (
				<>
					{/* SATISFACTION */}
					<Card>
						<CardContent className="space-y-4 p-4">
							<div>
								<Label className="flex items-center gap-2 font-semibold text-[15px]">
									<StarIcon className="h-4 w-4 shrink-0" />
									Customer satisfaction
								</Label>
								<p className="mt-1 text-muted-foreground text-[13px]">How satisfied is the customer with the service?</p>
							</div>
							<div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
								{SATISFACTION_OPTIONS.map((option) => {
									const selected = report.satisfaction === option.value;
									const Icon = SATISFACTION_ICONS[option.value];
									return (
										<button
											key={option.value}
											type="button"
											data-testid="btn_option"
											disabled={!editable}
											aria-pressed={selected}
											onClick={() => patch({ satisfaction: option.value })}
											className={cn(
												"flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border px-3 py-3 font-medium text-[15px] transition-colors",
												"active:scale-[0.98] disabled:cursor-default",
												selected
													? "border-[var(--destaque)] bg-[var(--destaque)]/10 text-[var(--destaque)]"
													: "border-border bg-background text-muted-foreground hover:border-[var(--destaque)] hover:text-foreground",
											)}
										>
											<Icon className="h-6 w-6 shrink-0" />
											<span>{option.label}</span>
										</button>
									);
								})}
							</div>
						</CardContent>
					</Card>

					{/* SIGNATURE */}
					<Card>
						<CardContent className="space-y-3 p-4">
							<div>
								<Label className="font-semibold text-[15px]">Digital signature of the person present</Label>
								<p className="mt-1 text-muted-foreground text-[13px]">Ask the customer to sign in the space below.</p>
							</div>
							<SignaturePad
								value={report.signature?.dataUrl ?? null}
								disabled={!editable}
								onChange={(dataUrl) => {
									update((r) => ({
										...r,
										signature: dataUrl ? { name: r.signature?.name ?? (signerName.trim() || job.event.client.name), dataUrl, signedAt: new Date().toISOString() } : null,
									}));
									if (dataUrl) toast.success("Signature confirmed", { description: "The customer's digital signature was recorded." });
								}}
							/>
						</CardContent>
					</Card>
				</>
			)}

			{/* FOLLOW-UP */}
			<Card>
				<CardContent className="space-y-1.5 p-4">
					<Label htmlFor="svc-follow" className="font-semibold text-[15px]">
						Follow-up needed
					</Label>
					<Input id="svc-follow" placeholder="e.g. Replacement part to be ordered" disabled={!editable} value={report.followUp} onChange={(e) => patch({ followUp: e.target.value })} />
				</CardContent>
			</Card>

			{completed ? (
				<CompletedBox report={report} minutes={minutes} ticketNumber={job.ticket?.ticket.number} />
			) : (
				<Finish job={job} report={report} minutes={minutes} saveState={saveState} editable={editable} onCompleted={onCompleted} />
			)}
		</div>
	);
}

/** Finalization: what is missing, optional next ticket step, and the finish button. */
function Finish({
	job,
	report,
	minutes,
	saveState,
	editable,
	onCompleted,
}: {
	job: TaskJob;
	report: ServiceReport;
	minutes: number;
	saveState: string;
	editable: boolean;
	onCompleted: () => void;
}) {
	const problems = completionProblems(report);
	const t = job.ticket;
	// The step (or chain of steps) picked for the ticket; a chain is taken at once.
	const [targetId, setTargetId] = useState(NO_MOVE);
	const [comment, setComment] = useState("");
	const [extra, setExtra] = useState<Record<string, FieldValue>>({});
	const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);

	const paths = t ? (t.paths ?? t.transitions.map((x) => ({ statusId: x.to, steps: [x] }))) : [];
	const pathKey = (p: { steps: { id: string }[] }) => p.steps.map((s) => s.id).join(">");
	const chain = paths.find((p) => pathKey(p) === targetId)?.steps ?? [];
	const target = t?.workflow.statuses.find((s) => s.id === chain[chain.length - 1]?.to);
	const moving = chain.length > 0;
	const suggested = useMemo(() => ticketFieldsFromReport(report, minutes), [report, minutes]);
	// Values the ticket would get: its current ones, then the report's, then what the technician types here
	// (except the signer's name: only the signature gives it).
	const values = useMemo(
		() => (t ? normalizeFieldValues(t.type.fields, { ...t.ticket.fields, ...pick(suggested, t.type), ...extra, [SIGNATURE_FIELD]: report.signature?.name ?? "" }) : {}),
		[t, suggested, extra, report.signature],
	);
	const needed = t ? [...new Set(chain.flatMap((s) => requiredForTransition(s, t.type)))] : [];
	const fieldProblems = t ? fieldErrors(t.type.fields, values, needed) : {};
	if (fieldProblems[SIGNATURE_FIELD]) fieldProblems[SIGNATURE_FIELD] = "Collect the customer's signature above first.";
	const commentMissing = chain.some((s) => s.requireComment) && !comment.trim();
	const blocked = problems.length > 0 || saving || !editable || (moving && (Object.keys(fieldProblems).length > 0 || commentMissing));

	async function finish() {
		if (problems.length) {
			toast.error("The task can't be finished yet", { description: problems[0] });
			return;
		}
		if (blocked) return;
		setSaving(true);
		const start = report.checkInAt ? new Date(report.checkInAt) : new Date();
		// A paused clock ends at the pause, not when the report is sent.
		const end = new Date(closeClock(report, new Date().toISOString()).checkOutAt);
		try {
			await apiClient.post(`/api/calendar/events/${encodeURIComponent(job.event.id)}/complete`, {
				report,
				transitionIds: moving ? chain.map((s) => s.id) : undefined,
				comment: comment.trim() || undefined,
				ticketFields: moving ? values : undefined,
				localStart: localHm(start),
				localEnd: localHm(end),
				localDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
			});
			toast.success("Service finished", {
				description: moving && t ? `Ticket #${t.ticket.number} is now ${target?.name}.` : t ? `The report was added to Ticket #${t.ticket.number}.` : "The task is completed on the calendar.",
			});
			onCompleted();
		} catch (e) {
			if (e instanceof ApiError) setServerErrors(e.fields);
			toast.error(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="space-y-3">
			{problems.length > 0 && (
				<ul className="flex flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 text-[13px]">
					{problems.map((p) => (
						<li key={p} className="flex items-center gap-1.5">
							<WarningIcon className="h-4 w-4 shrink-0" /> {p}
						</li>
					))}
				</ul>
			)}

			{t?.canWork && (
				<Card>
					<CardContent className="space-y-3 p-4">
						<div className="space-y-1.5">
							<Label htmlFor="svc-next" className="font-semibold text-[15px]">
								Next step for Ticket #{t.ticket.number}
							</Label>
							<Select value={targetId} onValueChange={setTargetId} disabled={!editable}>
								<SelectTrigger id="svc-next" className="h-11 bg-white">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NO_MOVE}>Keep the ticket where it is (report is added to its history)</SelectItem>
									{paths.map((p) => (
										<SelectItem key={pathKey(p)} value={pathKey(p)}>
											{p.steps.map((s) => s.label).join(" → ")} → {t.workflow.statuses.find((s) => s.id === p.statusId)?.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{moving && needed.length > 0 && (
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								{t.type.fields
									.filter((f) => needed.includes(f.id))
									.map((f) =>
										f.id === SIGNATURE_FIELD ? (
											// The signer's name comes from the signature collected above.
											<div key={f.id} className="flex flex-col gap-1">
												<span className="font-medium text-[15px]">{f.label}</span>
												<span className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-[15px]">
													{report.signature?.name || <span className="text-muted-foreground">No signature yet</span>}
												</span>
												{(fieldProblems[f.id] || serverErrors[f.id]) && <span className="text-destructive text-[13px]">{fieldProblems[f.id] || serverErrors[f.id]}</span>}
											</div>
										) : (
										<CustomFieldInput
											key={f.id}
											def={f}
											value={values[f.id]}
											onChange={(v) => setExtra((prev) => ({ ...prev, [f.id]: v }))}
											required
											error={fieldProblems[f.id] || serverErrors[f.id]}
											idPrefix="svc-tk"
										/>
										),
									)}
								<p className="text-[13px] text-muted-foreground sm:col-span-2">Filled from your report where possible. Check before finishing.</p>
							</div>
						)}
						{moving && (
							<div className="space-y-1.5">
								<Label htmlFor="svc-comment">
									Comment for the ticket {chain.some((s) => s.requireComment) && <span className="text-destructive">*</span>}
								</Label>
								<Textarea id="svc-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
								{(commentMissing || serverErrors.comment) && <span className="text-destructive text-[13px]">{serverErrors.comment || "This step needs a comment."}</span>}
							</div>
						)}
					</CardContent>
				</Card>
			)}

			<div className="rounded-lg bg-muted p-3 text-muted-foreground text-[13px] leading-5">
				When you finish, the task is marked as completed on the calendar and the hours, parts and photos are logged on it.
				{t ? ` The report is added to Ticket #${t.ticket.number}${moving ? `, which moves to "${target?.name}"` : ""}.` : ""}
				<span className="mt-1 block">
					{formatDuration(minutes)} on site · {report.parts.length ? formatCurrency(partsTotal(report.parts)) : "no parts"} · {totalPhotos(report)} photo
					{totalPhotos(report) === 1 ? "" : "s"} · {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "All changes saved"}
				</span>
			</div>

			<Button
				type="button"
				className="h-12 w-full gap-2 bg-[var(--success)] font-bold text-[15px] text-white hover:bg-[var(--success)]/90"
				onClick={finish}
				disabled={saving || !editable || (moving && (Object.keys(fieldProblems).length > 0 || commentMissing))}
				data-testid="btn_finish_service"
			>
				<FloppyDiskIcon className="h-4 w-4" />
				{saving ? "Finishing…" : "Save and finish service"}
			</Button>
		</div>
	);
}

function pick(values: Record<string, string | number | boolean>, type: TicketType) {
	return Object.fromEntries(Object.entries(values).filter(([k]) => type.fields.some((f) => f.id === k)));
}

function CompletedBox({ report, minutes, ticketNumber }: { report: ServiceReport; minutes: number; ticketNumber?: number }) {
	const rejected = report.checklist.filter((c) => c.result === "issue").length;
	return (
		<div className="flex items-center gap-3 rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/10 p-4">
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--success)]/10">
				<CheckCircleIcon className="h-5 w-5 text-[var(--success)]" />
			</div>
			<div>
				<p className="font-semibold text-[var(--success)]">Service finished</p>
				<p className="text-muted-foreground text-[15px]">
					{formatDuration(minutes)} on site{report.checkOutAt && `, checked out at ${formatTime(new Date(report.checkOutAt))}`}. {rejected} rejected action(s),{" "}
					{report.parts.length} part(s), {totalPhotos(report)} photo(s).{report.signature && ` Signed by ${report.signature.name}.`}
					{ticketNumber && ` The report was added to Ticket #${ticketNumber}.`}
				</p>
			</div>
		</div>
	);
}
