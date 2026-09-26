import { CheckIcon, ClockCounterClockwiseIcon, GearIcon, MinusIcon, PencilSimpleIcon, PlusCircleIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "#/components/ui/accordion";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { errorMessage } from "#/lib/api/client";
import { cn } from "#/lib/utils";
import {
	type ActionStatus,
	actionStatus,
	type ChecklistItem,
	type ChecklistResult,
	MAX_ACTION_PHOTOS,
	MAX_TOTAL_PHOTOS,
	newChecklistItem,
	type ServicePhoto,
} from "../../../../shared/service";
import { type Priority, PRIORITIES } from "../../../../shared/tickets";
import { PhotoButtons, PhotoThumbs, PhotoViewer } from "./photos";
import type { EngineeringAnswer } from "./task-utils";

type ItemsUpdater = (fn: (items: ChecklistItem[]) => ChecklistItem[]) => void;

export interface DeferInput {
	title: string;
	note: string;
	priority: Priority;
}

/** Linked ticket, for "Leave for later" (creates a sub-ticket). */
export interface DeferContext {
	ticketNumber: number;
	priority: Priority;
	/** Undefined while the task can't create sub-tickets (completed). Resolves with the new ticket number. */
	onDefer?: (actionId: string, input: DeferInput) => Promise<number>;
	/** Adds an action as a new sub-ticket of the linked ticket; resolves with its number. */
	onAdd?: (label: string, description: string) => Promise<number>;
	/** Sends an action's question to engineering (or takes it back). */
	onEngineering?: (actionId: string, input: { question: string; photos: ServicePhoto[] } | { withdraw: true }) => Promise<void>;
}

interface ActionsAccordionProps {
	items: ChecklistItem[];
	/** False before check-in and once the task is completed. */
	editable: boolean;
	/** Photos already in the whole report (general + every action). */
	reportPhotos: number;
	onUpdate: ItemsUpdater;
	/** Null when the task has no linked ticket. */
	defer: DeferContext | null;
	/** Opens a ticket's details (by number). */
	onOpenTicket: (ticketNumber: number) => void;
	/** Questions to engineering, by sub-ticket number. */
	engineering?: Record<number, EngineeringAnswer>;
}

const STATUS_BORDER: Record<ActionStatus, string> = {
	approved: "border-[var(--success)]",
	rejected: "border-destructive",
	na: "border-slate-400",
	pending: "border-[var(--font-quaternaria)]",
};

const STATUS_LABEL: Record<ActionStatus, string> = {
	approved: "Approved",
	rejected: "Rejected",
	na: "Not applicable",
	pending: "Pending",
};

/** The task's actions: approve / reject each one with notes and evidence photos. */
export function ActionsAccordion({ items, editable, reportPhotos, onUpdate, defer, onOpenTicket, engineering }: ActionsAccordionProps) {
	const [openItems, setOpenItems] = useState<string[]>([]);
	const [viewer, setViewer] = useState<{ itemId: string; index: number } | null>(null);

	const [adding, setAdding] = useState(false);
	const [editing, setEditing] = useState<ChecklistItem | null>(null);
	const [reviewing, setReviewing] = useState<{ item: ChecklistItem; result: Exclude<ChecklistResult, null> } | null>(null);
	const [forwarding, setForwarding] = useState<ChecklistItem | null>(null);
	const [deferring, setDeferring] = useState<ChecklistItem | null>(null);

	const setItem = (id: string, patch: Partial<ChecklistItem>) => onUpdate((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
	const isDuplicate = (label: string, exceptId?: string) =>
		items.some((c) => c.id !== exceptId && c.label.trim().toLowerCase() === label.trim().toLowerCase());

	const viewerItem = viewer ? items.find((c) => c.id === viewer.itemId) : undefined;

	return (
		<>
			<Accordion type="multiple" value={openItems} onValueChange={setOpenItems} className="space-y-3">
				{items.length === 0 && (
					<div className="rounded-xl border border-border/60 border-dashed bg-slate-50/50 p-8 text-center text-slate-400 text-[15px]">No actions on this task yet.</div>
				)}
				{items.map((item, n) => {
					const status = actionStatus(item);
					const deferred = item.deferredTicket ?? null;
					const eng = item.ticketNumber ? engineering?.[item.ticketNumber] : undefined;
					const waiting = eng?.status === "open";
					return (
						<AccordionItem
							key={item.id}
							value={item.id}
							className={cn("rounded-lg border-2 bg-card transition-colors last:border-b-2", deferred && status === "pending" ? "border-amber-400" : STATUS_BORDER[status])}
						>
							<div className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
								<AccordionTrigger className="flex-1 py-0 hover:no-underline [&>svg]:hidden">
									<div className="flex flex-col gap-1 text-left">
										<div className="flex flex-wrap items-center gap-2">
											{(item.ticketNumber ?? item.deferredTicket) ? (
												// Each action is a sub-ticket: its number opens it.
												<span
													role="button"
													tabIndex={0}
													title={`Open sub-ticket #${item.ticketNumber ?? item.deferredTicket}`}
													onClick={(e) => {
														e.stopPropagation();
														onOpenTicket((item.ticketNumber ?? item.deferredTicket)!);
													}}
													onKeyDown={(e) => {
														if (e.key !== "Enter" && e.key !== " ") return;
														e.preventDefault();
														e.stopPropagation();
														onOpenTicket((item.ticketNumber ?? item.deferredTicket)!);
													}}
													className="rounded border border-border px-1 py-0.5 font-bold font-mono text-foreground/80 text-[13px] hover:border-[var(--destaque)] hover:text-[var(--destaque)]"
													data-testid="action_ticket_number"
												>
													#{item.ticketNumber ?? item.deferredTicket}
												</span>
											) : null}
											{(item.ticketNumber ?? item.deferredTicket) ? <span>-</span> : null}
											<span className="font-semibold text-[17px]">{item.label}</span>
											{status === "pending" && deferred && <span className="font-bold text-xs text-amber-600 uppercase">Left for later</span>}
											{status !== "pending" && (
												<span
													className={cn(
														"font-bold text-xs uppercase",
														status === "approved" && "text-[var(--success)]",
														status === "rejected" && "text-destructive",
														status === "na" && "text-slate-500",
													)}
												>
													{STATUS_LABEL[status]}
												</span>
											)}
										</div>
										{item.description && <span className="text-[13px] text-muted-foreground leading-tight">{item.description}</span>}
									</div>
								</AccordionTrigger>

								<div className="flex shrink-0 flex-wrap items-center gap-2">
									{editable && (
										<RoundButton title="Edit action" onClick={() => setEditing(item)} testId="btn_edit_action">
											<PencilSimpleIcon className="h-4 w-4 text-foreground/50" />
										</RoundButton>
									)}
									<RoundButton
										title={waiting ? "Waiting for engineering: click to take the question back" : item.ticketNumber ? "Forward to engineering" : "Forward to engineering (needs a sub-ticket)"}
										active={waiting}
										activeClass="border-[var(--destaque)] bg-[var(--destaque)] text-white"
										hoverClass="hover:border-[var(--destaque)] hover:text-[var(--destaque)]"
										disabled={!editable || !item.ticketNumber || !defer?.onEngineering}
										onClick={() => setForwarding(item)}
										testId="btn_forward_engineering"
									>
										<GearIcon className={cn("h-4 w-4", waiting ? "text-white" : "text-foreground/50")} />
									</RoundButton>
									<RoundButton
										title="Approve"
										active={status === "approved"}
										activeClass="border-[var(--success)] bg-[var(--success)] text-white"
										hoverClass="hover:border-[var(--success)] hover:text-[var(--success)]"
										disabled={!editable || Boolean(deferred) || waiting}
										onClick={() => setReviewing({ item, result: "ok" })}
										testId="btn_approve"
									>
										<CheckIcon className={cn("h-4 w-4", status === "approved" ? "text-white" : "text-foreground/50")} />
									</RoundButton>
									<RoundButton
										title="Reject"
										active={status === "rejected"}
										activeClass="border-destructive bg-destructive text-white"
										hoverClass="hover:border-destructive hover:text-destructive"
										disabled={!editable || Boolean(deferred) || waiting}
										onClick={() => setReviewing({ item, result: "issue" })}
										testId="btn_reject"
									>
										<XIcon className={cn("h-4 w-4", status === "rejected" ? "text-white" : "text-foreground/50")} />
									</RoundButton>
									<RoundButton
										title={deferred ? "Left for later" : defer ? "Leave for later" : "Leave for later (needs a linked ticket)"}
										active={Boolean(deferred)}
										activeClass="border-amber-500 bg-amber-500 text-white"
										hoverClass="hover:border-amber-500 hover:text-amber-600"
										disabled={Boolean(deferred) || !defer?.onDefer}
										onClick={() => setDeferring(item)}
										testId="btn_leave_for_later"
									>
										<ClockCounterClockwiseIcon className={cn("h-4 w-4", deferred ? "text-white" : "text-foreground/50")} />
									</RoundButton>
									{deferred && deferred !== item.ticketNumber && (
										<button
											type="button"
											className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-bold text-xs text-amber-800 uppercase hover:underline"
											onClick={(e) => {
												e.stopPropagation();
												onOpenTicket(deferred);
											}}
											data-testid="badge_deferred"
										>
											Left for later · Sub-ticket #{deferred}
										</button>
									)}
									{waiting && <span className="ml-1 font-bold text-xs text-amber-700 uppercase">Waiting for engineering</span>}
									{eng?.status === "answered" && <span className="ml-1 font-bold text-xs text-[var(--destaque)] uppercase">Engineering answered</span>}
								</div>
							</div>

							<AccordionContent className="border-t px-4 pt-4 pb-4">
								{eng && (
									<div className="mb-4 flex flex-col gap-2 rounded border border-[var(--destaque)]/30 bg-[var(--destaque)]/5 p-3 text-[15px]">
										<div>
											<p className="font-medium text-muted-foreground text-[13px] uppercase">Question to engineering</p>
											<p className="whitespace-pre-wrap">{eng.question}</p>
										</div>
										{eng.status === "answered" ? (
											<div>
												<p className="font-medium text-muted-foreground text-[13px] uppercase">
													Answer{eng.answeredByName ? ` from ${eng.answeredByName}` : ""}
													{eng.answeredAt ? ` · ${new Date(eng.answeredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
												</p>
												<p className="whitespace-pre-wrap font-medium">{eng.answer}</p>
												<p className="mt-1 text-muted-foreground text-[13px]">Do the work as answered, then approve or reject the action.</p>
											</div>
										) : (
											<p className="text-amber-800 text-[13px]">Waiting for engineering to answer. You can leave the action for later meanwhile.</p>
										)}
									</div>
								)}
								<p className="mb-2 font-medium text-muted-foreground text-[15px]">Recorded notes:</p>
								<div className="mb-4 whitespace-pre-wrap rounded border bg-muted/40 p-3 text-[15px]">{item.note || "No notes recorded."}</div>
								{item.photos.length > 0 && (
									<div>
										<p className="mb-2 font-medium text-muted-foreground text-[15px]">Attached evidence:</p>
										<PhotoThumbs photos={item.photos} onOpen={(index) => setViewer({ itemId: item.id, index })} />
									</div>
								)}
								{editable && (
									<PhotoButtons
										className="mt-3"
										room={Math.min(MAX_ACTION_PHOTOS - item.photos.length, MAX_TOTAL_PHOTOS - reportPhotos)}
										limitMessage={limitMessage(item.photos.length, reportPhotos)}
										onAdd={(photos) =>
											onUpdate((list) => list.map((c) => (c.id === item.id ? { ...c, photos: [...c.photos, ...photos].slice(0, MAX_ACTION_PHOTOS) } : c)))
										}
									/>
								)}
							</AccordionContent>
						</AccordionItem>
					);
				})}

				{editable && (
					<Button
						type="button"
						variant="secondary"
						className="mt-4 w-full gap-2 border-2 border-dashed py-8 text-muted-foreground"
						onClick={() => setAdding(true)}
						data-testid="btn_add_action"
					>
						<PlusCircleIcon className="h-5 w-5 text-[var(--destaque)]" />
						Add new action
					</Button>
				)}
			</Accordion>

			{/* Add / edit action */}
			<ActionFormDialog
				open={adding}
				title="New action"
				submitLabel="Add"
				onClose={() => setAdding(false)}
				onSubmit={async (label, description) => {
					if (isDuplicate(label)) {
						toast.error("Action already exists", { description: `"${label}" is already on the list.` });
						return false;
					}
					if (defer?.onAdd) {
						try {
							const n = await defer.onAdd(label, description);
							toast.success(`Sub-ticket #${n} added`, { description: `"${label}" was added to the list and to Ticket #${defer.ticketNumber}.` });
							return true;
						} catch (e) {
							toast.error(errorMessage(e));
							return false;
						}
					}
					onUpdate((list) => [...list, newChecklistItem(label, description)]);
					toast.success("Action added", { description: `"${label}" was added to the list.` });
					return true;
				}}
			/>
			<ActionFormDialog
				open={Boolean(editing)}
				title="Edit action"
				submitLabel="Save changes"
				initial={editing ?? undefined}
				onClose={() => setEditing(null)}
				onRemove={
					// A sub-ticket isn't removed from the visit; it's closed or cancelled on the ticket.
					editing && !editing.ticketNumber
						? () => {
								onUpdate((list) => list.filter((c) => c.id !== editing.id));
								toast.success("Action removed", { description: `"${editing.label}" was removed.` });
								setEditing(null);
							}
						: undefined
				}
				onSubmit={(label, description) => {
					if (!editing) return false;
					if (isDuplicate(label, editing.id)) {
						toast.error("Action already exists", { description: `There is already an action called "${label}".` });
						return false;
					}
					setItem(editing.id, { label, description });
					toast.success("Action updated", { description: `"${label}" was updated.` });
					return true;
				}}
			/>

			{/* Approve / reject */}
			{reviewing && (
				<NotesPhotosDialog
					key={`review-${reviewing.item.id}`}
					mode="review"
					item={reviewing.item}
					initialResult={reviewing.result}
					reportPhotos={reportPhotos}
					onClose={() => setReviewing(null)}
					onSave={({ note, photos, result }) => {
						setItem(reviewing.item.id, { note, photos: [...reviewing.item.photos, ...photos], result });
						const label = reviewing.item.label;
						if (result === "ok") toast.success(`${label} approved`);
						else if (result === "issue") toast.error(`${label} rejected`, { description: "The note explains the rejection." });
						else toast(`${label} marked as not applicable`);
						setReviewing(null);
					}}
				/>
			)}

			{/* Forward to engineering */}
			{forwarding && (
				<NotesPhotosDialog
					key={`eng-${forwarding.id}`}
					mode="engineering"
					item={forwarding}
					reportPhotos={reportPhotos}
					onClose={() => setForwarding(null)}
					onWithdraw={
						forwarding.ticketNumber && engineering?.[forwarding.ticketNumber]?.status === "open"
							? async () => {
									try {
										await defer?.onEngineering?.(forwarding.id, { withdraw: true });
										toast(`Question about ${forwarding.label} taken back`);
										setForwarding(null);
									} catch (e) {
										toast.error(errorMessage(e));
									}
								}
							: undefined
					}
					onSave={async ({ note, photos }) => {
						try {
							await defer?.onEngineering?.(forwarding.id, { question: note, photos });
							toast.success("Sent to engineering", { description: `Engineering will answer about ${forwarding.label} and send it back to you.` });
							setForwarding(null);
						} catch (e) {
							toast.error(errorMessage(e));
						}
					}}
				/>
			)}

			{/* Leave for later */}
			{deferring && defer?.onDefer && (
				<DeferDialog
					key={`defer-${deferring.id}`}
					item={deferring}
					ticketNumber={defer.ticketNumber}
					priority={defer.priority}
					onClose={() => setDeferring(null)}
					onConfirm={async (input) => {
						const n = await defer.onDefer!(deferring.id, input);
						toast.success(`Sub-ticket #${n} created`, { description: `"${deferring.label}" was left for later.` });
						setDeferring(null);
					}}
				/>
			)}

			<PhotoViewer
				photos={viewerItem?.photos ?? []}
				index={viewerItem && viewer ? viewer.index : null}
				onIndexChange={(index) => viewer && setViewer({ ...viewer, index })}
				onClose={() => setViewer(null)}
				onRemove={
					editable && viewerItem
						? (i) => {
								setItem(viewerItem.id, { photos: viewerItem.photos.filter((_, k) => k !== i) });
								toast("Evidence removed", { description: `Image removed from ${viewerItem.label}.` });
							}
						: undefined
				}
				onCaption={
					editable && viewerItem
						? (i, caption) => setItem(viewerItem.id, { photos: viewerItem.photos.map((p, k) => (k === i ? { ...p, caption } : p)) })
						: undefined
				}
			/>
		</>
	);
}

function limitMessage(itemPhotos: number, reportPhotos: number) {
	return itemPhotos >= MAX_ACTION_PHOTOS || reportPhotos < MAX_TOTAL_PHOTOS
		? `Up to ${MAX_ACTION_PHOTOS} photos per action.`
		: `Up to ${MAX_TOTAL_PHOTOS} photos per task.`;
}

function RoundButton({
	title,
	children,
	onClick,
	active,
	activeClass,
	hoverClass = "hover:border-[var(--destaque)] hover:text-[var(--destaque)]",
	disabled,
	testId,
}: {
	title: string;
	children: React.ReactNode;
	onClick: () => void;
	active?: boolean;
	activeClass?: string;
	hoverClass?: string;
	disabled?: boolean;
	testId?: string;
}) {
	return (
		<Button
			type="button"
			size="icon"
			variant="secondary"
			className={cn("h-8 w-8 rounded-full border-2 transition-colors", active ? activeClass : hoverClass)}
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			title={title}
			aria-label={title}
			disabled={disabled}
			data-testid={testId}
		>
			{children}
		</Button>
	);
}

function ActionFormDialog({
	open,
	title,
	submitLabel,
	initial,
	onClose,
	onSubmit,
	onRemove,
}: {
	open: boolean;
	title: string;
	submitLabel: string;
	initial?: Pick<ChecklistItem, "id" | "label" | "description">;
	onClose: () => void;
	/** Returns false to keep the dialog open. */
	onSubmit: (label: string, description: string) => boolean | Promise<boolean>;
	onRemove?: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-[425px]">
				{open && <ActionForm key={initial?.id ?? "new"} title={title} submitLabel={submitLabel} initial={initial} onClose={onClose} onSubmit={onSubmit} onRemove={onRemove} />}
			</DialogContent>
		</Dialog>
	);
}

function ActionForm({
	title,
	submitLabel,
	initial,
	onClose,
	onSubmit,
	onRemove,
}: Omit<Parameters<typeof ActionFormDialog>[0], "open">) {
	const [label, setLabel] = useState(initial?.label ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [busy, setBusy] = useState(false);
	const submit = async () => {
		if (!label.trim() || busy) return;
		setBusy(true);
		const done = await onSubmit(label.trim(), description.trim());
		setBusy(false);
		if (done) onClose();
	};
	return (
		<>
			<DialogHeader>
				<DialogTitle className="flex items-center gap-2 font-bold text-lg text-primary uppercase">
					{initial && <PencilSimpleIcon className="h-4 w-4 text-[var(--destaque)]" />}
					{title}
				</DialogTitle>
			</DialogHeader>
			<div className="grid gap-4 py-4">
				<div className="space-y-2">
					<Label htmlFor="action-label" className="font-bold text-[13px] uppercase">
						Title
					</Label>
					<Input id="action-label" placeholder="e.g. Painting, baseboards..." value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
				</div>
				<div className="space-y-2">
					<Label htmlFor="action-desc" className="font-bold text-[13px] uppercase">
						What will be checked?
					</Label>
					<Textarea
						id="action-desc"
						className="min-h-[100px]"
						placeholder="e.g. Check for stains, evenness and finishing..."
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</div>
			</div>
			<DialogFooter className="flex-row items-center justify-end gap-2 border-t bg-muted p-4">
				{onRemove && (
					<Button type="button" variant="ghost" className="mr-auto gap-1 text-destructive" onClick={onRemove} data-testid="btn_remove_action">
						<TrashIcon className="h-4 w-4" /> Remove
					</Button>
				)}
				<Button type="button" variant="secondary" className="font-bold" onClick={onClose} data-testid="btn_cancel_action">
					Cancel
				</Button>
				<Button type="button" className="font-bold" onClick={submit} disabled={!label.trim() || busy} data-testid="btn_save_action">
					{submitLabel}
				</Button>
			</DialogFooter>
		</>
	);
}

const RESULT_OPTIONS: { value: Exclude<ChecklistResult, null>; label: string; icon: React.ReactNode; on: string }[] = [
	{ value: "ok", label: "Approved", icon: <CheckIcon className="h-4 w-4" />, on: "border-[var(--success)] bg-[var(--success)]/10 text-[var(--success)]" },
	{ value: "issue", label: "Rejected", icon: <XIcon className="h-4 w-4" />, on: "border-destructive bg-destructive/10 text-destructive" },
	{ value: "na", label: "N/A", icon: <MinusIcon className="h-4 w-4" />, on: "border-slate-400 bg-slate-100 text-slate-700" },
];

/** The original "Confirm inspection" / "Forward to engineering" modals: notes + photos. */
function NotesPhotosDialog({
	mode,
	item,
	initialResult = "ok",
	reportPhotos,
	onClose,
	onSave,
	onWithdraw,
}: {
	mode: "review" | "engineering";
	item: ChecklistItem;
	initialResult?: Exclude<ChecklistResult, null>;
	reportPhotos: number;
	onClose: () => void;
	onSave: (v: { note: string; photos: ServicePhoto[]; result: Exclude<ChecklistResult, null> }) => void;
	onWithdraw?: () => void;
}) {
	const [note, setNote] = useState(item.note);
	const [result, setResult] = useState(initialResult);
	const [photos, setPhotos] = useState<ServicePhoto[]>([]);
	const [viewing, setViewing] = useState<number | null>(null);
	const room = Math.min(MAX_ACTION_PHOTOS - item.photos.length, MAX_TOTAL_PHOTOS - reportPhotos) - photos.length;
	const noteRequired = mode === "engineering" || result === "issue";
	const isReview = mode === "review";

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{isReview ? <CheckIcon className="h-5 w-5 text-[var(--success)]" /> : <GearIcon className="h-5 w-5 text-[var(--destaque)]" />}
						{isReview ? "Review action" : "Forward to engineering"}
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label>Action</Label>
						<Input disabled value={item.label} />
					</div>

					{isReview && (
						<div className="space-y-2">
							<Label>Result</Label>
							<div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Result">
								{RESULT_OPTIONS.map((o) => (
									<button
										key={o.value}
										type="button"
										role="radio"
										aria-checked={result === o.value}
										onClick={() => setResult(o.value)}
										className={cn(
											"flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 font-medium text-[15px] transition-colors active:scale-[0.98]",
											result === o.value ? o.on : "border-border bg-background text-muted-foreground hover:text-foreground",
										)}
									>
										{o.icon}
										{o.label}
									</button>
								))}
							</div>
						</div>
					)}

					<div className="space-y-2">
						<Label htmlFor="action-note">
							{isReview ? "Description / notes" : "Request description"}
							{noteRequired && <span className="text-destructive"> *</span>}
						</Label>
						<Textarea
							id="action-note"
							placeholder={isReview ? (result === "issue" ? "Describe what failed (required)..." : "Enter the details of what was checked...") : "Describe why this goes to engineering..."}
							value={note}
							onChange={(e) => setNote(e.target.value)}
							className="min-h-[100px]"
						/>
					</div>

					<div className="space-y-2">
						<Label>
							{isReview ? "Photos" : "Photos for engineering to analyze"}
							{!isReview && <span className="text-destructive"> *</span>}
						</Label>
						<PhotoButtons
							room={room}
							limitMessage={limitMessage(item.photos.length + photos.length, reportPhotos + photos.length)}
							onAdd={(added) => setPhotos((p) => [...p, ...added])}
						/>
						{photos.length > 0 && (
							<div className="pt-3">
								<PhotoThumbs photos={photos} onOpen={setViewing} onRemove={(i) => setPhotos((p) => p.filter((_, k) => k !== i))} />
							</div>
						)}
						{item.photos.length > 0 && (
							<p className="text-muted-foreground text-[13px]">
								{item.photos.length} photo(s) already on this action{isReview ? "." : " go along too."}
							</p>
						)}
					</div>
				</div>

				<DialogFooter>
					{onWithdraw && (
						<Button type="button" variant="ghost" className="sm:mr-auto" onClick={onWithdraw}>
							Withdraw from engineering
						</Button>
					)}
					<Button type="button" variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="button"
						// Engineering analyzes images: at least one (new or already on the action).
						disabled={(noteRequired && !note.trim()) || (!isReview && photos.length + item.photos.length === 0)}
						title={!isReview && photos.length + item.photos.length === 0 ? "Add at least one photo for engineering" : undefined}
						onClick={() => onSave({ note: note.trim(), photos, result })}
					>
						{isReview ? "Save" : "Send to engineering"}
					</Button>
				</DialogFooter>
				<PhotoViewer photos={photos} index={viewing} onIndexChange={setViewing} onClose={() => setViewing(null)} />
			</DialogContent>
		</Dialog>
	);
}

/** "Leave for later": creates a sub-ticket of the task's ticket for this action. */
function DeferDialog({
	item,
	ticketNumber,
	priority: initialPriority,
	onClose,
	onConfirm,
}: {
	item: ChecklistItem;
	ticketNumber: number;
	priority: Priority;
	onClose: () => void;
	onConfirm: (input: DeferInput) => Promise<void>;
}) {
	const [title, setTitle] = useState(`${item.label} · follow-up of #${ticketNumber}`);
	const [note, setNote] = useState("");
	const [priority, setPriority] = useState<Priority>(initialPriority);
	const [saving, setSaving] = useState(false);

	async function confirm() {
		if (!title.trim() || saving) return;
		setSaving(true);
		try {
			await onConfirm({ title: title.trim(), note: note.trim(), priority });
		} catch (e) {
			toast.error(errorMessage(e));
			setSaving(false);
		}
	}

	return (
		<Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
			<DialogContent className="sm:max-w-[450px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ClockCounterClockwiseIcon className="h-5 w-5 text-amber-600" />
						Leave for later
					</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 py-4">
					<p className="text-muted-foreground text-[13px]">
						A sub-ticket of Ticket #{ticketNumber} is created and assigned to you. This action then counts as answered for this task.
					</p>
					<div className="space-y-2">
						<Label>Action</Label>
						<Input disabled value={item.label} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="defer-title">Sub-ticket title</Label>
						<Input id="defer-title" value={title} onChange={(e) => setTitle(e.target.value)} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="defer-note">Why is it left for later?</Label>
						<Textarea
							id="defer-note"
							className="min-h-[100px]"
							placeholder="e.g. Needs a part that isn't in stock, the customer asked to do it another day..."
							value={note}
							onChange={(e) => setNote(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="defer-priority">Priority</Label>
						<Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
							<SelectTrigger id="defer-priority" className="h-10 bg-white">
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
				</div>
				<DialogFooter>
					<Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
						Cancel
					</Button>
					<Button type="button" onClick={confirm} disabled={saving || !title.trim()} data-testid="btn_confirm_defer">
						{saving ? "Creating…" : "Create sub-ticket"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
