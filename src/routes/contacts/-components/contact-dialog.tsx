import {
	ArrowBendUpRightIcon,
	ChatCircleTextIcon,
	EnvelopeSimpleIcon,
	HandshakeIcon,
	NotePencilIcon,
	PencilSimpleIcon,
	PhoneIcon,
	PlusIcon,
	TrashIcon,
	UsersIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { apiClient, errorMessage } from "#/lib/api/client";
import { type Contact, type ContactStage, INTERACTION_KINDS, type Interaction, type InteractionKind } from "../../../../shared/contacts";
import type { Ticket, Workflow } from "../../../../shared/tickets";
import { StatusBadge } from "../../tickets/-components/ticket-details-dialog";
import { FollowUpLabel, money, StageBadge, TemperatureDot } from "./shared";

dayjs.extend(relativeTime);

const KIND_ICON: Record<InteractionKind, ReactNode> = {
	call: <PhoneIcon className="size-4" />,
	email: <EnvelopeSimpleIcon className="size-4" />,
	meeting: <UsersIcon className="size-4" />,
	message: <ChatCircleTextIcon className="size-4" />,
	note: <NotePencilIcon className="size-4" />,
	transfer: <ArrowBendUpRightIcon className="size-4" />,
};

const KEEP = "__keep__";

/** One lead: who they are, their deals, and every contact made — plus logging the next one. */
export function ContactDialog({
	contact,
	stages,
	deals,
	workflowOf,
	userName,
	developmentName,
	canDelete,
	onClose,
	onEdit,
	onTransfer,
	onDelete,
	onChanged,
	onOpenDeal,
}: {
	contact: Contact;
	stages: ContactStage[];
	/** Tickets whose requester has this contact's email. */
	deals: Ticket[];
	workflowOf: (typeId: string) => Workflow | undefined;
	userName: (id: string | null | undefined) => string;
	developmentName: (id: string | null) => string | null;
	canDelete: boolean;
	onClose: () => void;
	onEdit: () => void;
	onTransfer: () => void;
	onDelete: () => void;
	onChanged: (c: Contact) => void;
	onOpenDeal: () => void;
}) {
	const [kind, setKind] = useState<Exclude<InteractionKind, "transfer">>("call");
	const [note, setNote] = useState("");
	const [next, setNext] = useState(contact.nextFollowUp ?? "");
	const [stageId, setStageId] = useState(KEEP);
	const [saving, setSaving] = useState(false);
	const history = [...contact.interactions].reverse();

	async function log() {
		if (!note.trim() || saving) return;
		setSaving(true);
		try {
			const saved = await apiClient.post<Contact>(`/api/contacts/${encodeURIComponent(contact.id)}/interactions`, {
				kind,
				note: note.trim(),
				nextFollowUp: next || null,
				...(stageId !== KEEP ? { stageId } : {}),
			});
			setNote("");
			setStageId(KEEP);
			toast.success(`${INTERACTION_KINDS.find((k) => k.id === kind)?.label} logged`);
			onChanged(saved);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	const fact = (label: string, value: ReactNode) => (
		<div className="grid grid-cols-[110px_1fr] gap-2 py-1.5 text-sm">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd className="min-w-0">{value}</dd>
		</div>
	);

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="!flex !max-h-[92vh] !max-w-[95vw] flex-col !gap-0 !p-0 lg:!max-w-4xl">
				<div className="flex flex-wrap items-start justify-between gap-3 border-b px-6 pt-6 pb-4">
					<div className="min-w-0">
						<DialogTitle className="flex flex-wrap items-center gap-2">
							{contact.name}
							<TemperatureDot value={contact.temperature} withLabel />
						</DialogTitle>
						<DialogDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
							{contact.company && <span>{contact.company}</span>}
							<StageBadge stages={stages} stageId={contact.stageId} />
							<span>In {contact.ownerId ? `${userName(contact.ownerId)}'s portfolio` : "no portfolio (unassigned)"}</span>
						</DialogDescription>
					</div>
					<div className="flex flex-wrap gap-1.5">
						<Button size="sm" variant="secondary" onClick={onTransfer}>
							<ArrowBendUpRightIcon className="size-4" /> Transfer
						</Button>
						<Button size="sm" variant="secondary" onClick={onEdit}>
							<PencilSimpleIcon className="size-4" /> Edit
						</Button>
						{canDelete && (
							<Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label="Delete lead" onClick={onDelete}>
								<TrashIcon className="size-4" />
							</Button>
						)}
					</div>
				</div>

				<div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_300px] lg:overflow-hidden">
					{/* Log + history */}
					<div className="flex min-h-0 flex-col lg:overflow-y-auto">
						<div className="flex flex-col gap-2 border-b p-4">
							<div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Kind of contact">
								{INTERACTION_KINDS.map((k) => (
									<button
										key={k.id}
										type="button"
										role="radio"
										aria-checked={kind === k.id}
										onClick={() => setKind(k.id)}
										className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${kind === k.id ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground hover:bg-muted"}`}
									>
										{KIND_ICON[k.id]} {k.label}
									</button>
								))}
							</div>
							<Textarea
								aria-label="What was talked about"
								rows={3}
								className="resize-none"
								placeholder="What was talked about, what they asked, what you promised…"
								value={note}
								onChange={(e) => setNote(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) log();
								}}
							/>
							<div className="flex flex-wrap items-center gap-2">
								<label className="flex items-center gap-1.5 text-muted-foreground text-xs">
									Next follow-up
									<Input type="date" className="h-8 w-40 text-sm" value={next} onChange={(e) => setNext(e.target.value)} />
								</label>
								<Select value={stageId} onValueChange={setStageId}>
									<SelectTrigger aria-label="Move to stage" className="h-8 w-44 text-sm">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={KEEP}>Keep stage</SelectItem>
										{stages
											.filter((s) => s.id !== contact.stageId)
											.map((s) => (
												<SelectItem key={s.id} value={s.id}>
													Move to {s.label}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
								<Button size="sm" className="ml-auto" disabled={!note.trim() || saving} onClick={log}>
									{saving ? "Saving…" : "Log contact"}
								</Button>
							</div>
						</div>
						<ol className="flex flex-col gap-4 p-4">
							{history.length === 0 && <li className="text-muted-foreground text-sm">No contact logged yet.</li>}
							{history.map((i) => (
								<HistoryEntry key={i.id} i={i} userName={userName} />
							))}
							<li className="text-muted-foreground text-xs">
								Added {dayjs(contact.createdAt).format("MMM D, YYYY")} by {userName(contact.createdBy)}
							</li>
						</ol>
					</div>

					{/* Facts + deals */}
					<aside className="flex flex-col gap-4 border-t bg-muted/20 p-4 lg:overflow-y-auto lg:border-t-0 lg:border-l">
						<dl className="divide-y divide-border">
							{fact(
								"Email",
								contact.email ? (
									<a className="break-all text-brand hover:underline" href={`mailto:${contact.email}`}>
										{contact.email}
									</a>
								) : (
									"—"
								),
							)}
							{fact(
								"Phone",
								contact.phone ? (
									<a className="text-brand hover:underline" href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>
										{contact.phone}
									</a>
								) : (
									"—"
								),
							)}
							{fact("Next follow-up", <FollowUpLabel contact={contact} />)}
							{fact("Last contact", contact.lastContactAt ? dayjs(contact.lastContactAt).fromNow() : "Never")}
							{fact("Interested in", developmentName(contact.developmentId) ?? "—")}
							{fact("Budget", money(contact.budget))}
							{fact("Source", contact.source || "—")}
						</dl>
						{contact.notes && <p className="whitespace-pre-wrap rounded-md border border-border bg-card px-3 py-2 text-sm">{contact.notes}</p>}

						<section className="flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<h3 className="flex items-center gap-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
									<HandshakeIcon className="size-4" /> Deals · {deals.length}
								</h3>
								<Button size="sm" variant="ghost" className="h-7 px-2 text-brand" onClick={onOpenDeal} disabled={!contact.email && !contact.phone}>
									<PlusIcon className="size-4" /> Open a deal
								</Button>
							</div>
							{deals.length === 0 ? (
								<p className="text-muted-foreground text-xs">No deals yet. Opening one creates a ticket with this lead as the requester.</p>
							) : (
								<ul className="flex flex-col gap-1.5">
									{deals.map((t) => (
										<li key={t.id}>
											<Link
												to="/tickets/$ticketNumber"
												params={{ ticketNumber: String(t.number) }}
												className="flex flex-col gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-brand"
											>
												<span className="flex items-center justify-between gap-2">
													<span className="font-mono text-muted-foreground text-xs">#{t.number}</span>
													<StatusBadge workflow={workflowOf(t.typeId)} statusId={t.statusId} />
												</span>
												<span className="line-clamp-2">{t.title}</span>
											</Link>
										</li>
									))}
								</ul>
							)}
						</section>
					</aside>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function HistoryEntry({ i, userName }: { i: Interaction; userName: (id: string | null | undefined) => string }) {
	const label = i.kind === "transfer" ? null : INTERACTION_KINDS.find((k) => k.id === i.kind)?.label.toLowerCase();
	return (
		<li className="flex gap-3">
			<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">{KIND_ICON[i.kind]}</span>
			<div className="min-w-0 flex-1 text-sm">
				<p>
					<span className="font-medium">{userName(i.userId)}</span>{" "}
					{i.kind === "transfer" ? (
						i.toOwnerId ? (
							<>
								moved the lead to <b>{userName(i.toOwnerId)}</b>'s portfolio
							</>
						) : (
							<>left the lead unassigned</>
						)
					) : i.kind === "note" ? (
						"added a note"
					) : (
						<>logged {/^[aeiou]/.test(label ?? "") ? "an" : "a"} {label}</>
					)}
					<span className="ml-1.5 text-muted-foreground text-xs" title={dayjs(i.at).format("MMM D, YYYY h:mm A")}>
						{dayjs(i.at).fromNow()}
					</span>
				</p>
				{i.note && <p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2">{i.note}</p>}
			</div>
		</li>
	);
}
