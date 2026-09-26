import { HandshakeIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PersonName } from "#/components/person/person-dialog";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { apiClient, errorMessage } from "#/lib/api/client";
import { cn } from "#/lib/utils";
import { type Contact, contactStagesFrom, INTERACTION_KINDS, type InteractionKind, sameEmail } from "../../../../../shared/contacts";
import { FollowUpLabel, money, StageBadge, TemperatureDot } from "../../../contacts/-components/shared";
import { Panel, type Workspace } from "./shared";

dayjs.extend(relativeTime);

const KEEP = "__keep__";

/**
 * When the requester is a lead (a deal), the lead is worked right on the
 * ticket: its stage, temperature and follow-ups, and every call, email or
 * meeting logged here (which also goes on the ticket's history).
 */
export function LeadPanel({ ws }: { ws: Workspace }) {
	const { ticket, userName, reload, workflow } = ws;
	// Deals: tickets that follow the sales pipeline (or whose requester already is a lead).
	const isDeal = workflow?.id === "wf-sales";
	const [checked, setChecked] = useState(false);
	const [adding, setAdding] = useState(false);
	const [lead, setLead] = useState<Contact | null>(null);
	const [stages, setStages] = useState(contactStagesFrom(null));
	const [kind, setKind] = useState<Exclude<InteractionKind, "transfer">>("call");
	const [note, setNote] = useState("");
	const [next, setNext] = useState("");
	const [stageId, setStageId] = useState(KEEP);
	const [saving, setSaving] = useState(false);

	const find = useCallback(async () => {
		if (!ticket.requester.email) return setLead(null);
		try {
			const [list, st] = await Promise.all([apiClient.get<Contact[]>("/api/contacts"), apiClient.get<{ value: unknown }>("/api/settings/contactStages")]);
			const c = list.find((x) => sameEmail(x.email, ticket.requester.email)) ?? null;
			setLead(c);
			setStages(contactStagesFrom(st.value));
			setNext(c?.nextFollowUp ?? "");
		} catch {
			setLead(null); // not in the viewer's portfolio: nothing to show
		} finally {
			setChecked(true);
		}
	}, [ticket.requester.email]);
	useEffect(() => {
		find();
	}, [find]);

	async function addLead() {
		setAdding(true);
		try {
			await apiClient.post<Contact>("/api/contacts", {
				name: ticket.requester.name || ticket.requester.email,
				email: ticket.requester.email,
				phone: ticket.requester.phone,
				company: ticket.clientName,
				ownerId: ticket.assigneeId,
				developmentId: ticket.developmentId,
				source: "",
				notes: ticket.description,
			});
			toast.success(`${ticket.requester.name} is now a lead`);
			await find();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setAdding(false);
		}
	}

	if (!lead) {
		if (!isDeal || !checked) return null;
		return (
			<Panel title="Lead" icon={<HandshakeIcon className="size-4" />}>
				<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
					<p className="text-muted-foreground">
						{ticket.requester.email ? `${ticket.requester.name || ticket.requester.email} isn't a lead yet. Add them to follow up calls, stage and budget here.` : "Add the requester's email to work them as a lead."}
					</p>
					{ticket.requester.email && (
						<Button size="sm" onClick={addLead} disabled={adding}>
							<HandshakeIcon className="size-4" /> {adding ? "Adding…" : "Add as a lead"}
						</Button>
					)}
				</div>
			</Panel>
		);
	}

	async function log() {
		if (!lead || !note.trim() || saving) return;
		setSaving(true);
		try {
			const saved = await apiClient.post<Contact>(`/api/contacts/${encodeURIComponent(lead.id)}/interactions`, {
				kind,
				note: note.trim(),
				nextFollowUp: next || null,
				ticketId: ticket.id,
				...(stageId !== KEEP ? { stageId } : {}),
			});
			setLead(saved);
			setNote("");
			setStageId(KEEP);
			toast.success(`${INTERACTION_KINDS.find((k) => k.id === kind)?.label} logged`, { description: "On the lead and on this ticket's history." });
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	const recent = [...lead.interactions].reverse().slice(0, 3);

	return (
		<Panel
			title="Lead"
			icon={<HandshakeIcon className="size-4" />}
			aside={
				<Link to="/contacts" className="text-brand text-xs hover:underline">
					In Contacts
				</Link>
			}
		>
			<div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
				<div className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<StageBadge stages={stages} stageId={lead.stageId} />
					<TemperatureDot value={lead.temperature} withLabel />
					<span className="text-muted-foreground text-xs">
						in{" "}
						{lead.ownerId ? <PersonName person={{ kind: "member", id: lead.ownerId }}>{userName(lead.ownerId)}</PersonName> : "no one"}
						's portfolio
					</span>
				</div>
				<dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 text-xs">
					<dt className="text-muted-foreground">Next follow-up</dt>
					<dd>
						<FollowUpLabel contact={lead} />
					</dd>
					<dt className="text-muted-foreground">Last contact</dt>
					<dd>{lead.lastContactAt ? dayjs(lead.lastContactAt).fromNow() : "Never"}</dd>
					<dt className="text-muted-foreground">Budget</dt>
					<dd>{money(lead.budget)}</dd>
					{lead.source && (
						<>
							<dt className="text-muted-foreground">Source</dt>
							<dd>{lead.source}</dd>
						</>
					)}
				</dl>

				{recent.length > 0 && (
					<ul className="flex flex-col gap-1.5 border-border border-t pt-3 text-xs">
						{recent.map((i) => (
							<li key={i.id}>
								<span className="font-medium">{userName(i.userId)}</span>{" "}
								<span className="text-muted-foreground">
									{i.kind === "transfer" ? "moved the lead" : `logged a ${i.kind}`} · {dayjs(i.at).fromNow()}
								</span>
								{i.note && <p className="line-clamp-2 text-muted-foreground">{i.note}</p>}
							</li>
						))}
					</ul>
				)}
				</div>

				{/* Log a contact with the lead */}
				<div className="flex flex-col gap-2 border-border border-t pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
					<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Log a contact</span>
					<div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Kind of contact">
						{INTERACTION_KINDS.map((k) => (
							<button
								key={k.id}
								type="button"
								role="radio"
								aria-checked={kind === k.id}
								onClick={() => setKind(k.id)}
								className={cn("rounded-full border px-2 py-0.5 text-xs", kind === k.id ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground hover:bg-muted")}
							>
								{k.label}
							</button>
						))}
					</div>
					<Textarea
						aria-label="What was talked about"
						rows={2}
						className="resize-none text-sm"
						placeholder="What was talked about, what was promised…"
						value={note}
						onChange={(e) => setNote(e.target.value)}
					/>
					<div className="grid grid-cols-2 gap-2">
						<Input type="date" aria-label="Next follow-up" className="h-8 text-xs" value={next} onChange={(e) => setNext(e.target.value)} />
						<Select value={stageId} onValueChange={setStageId}>
							<SelectTrigger aria-label="Move the lead to" className="h-8 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={KEEP}>Keep stage</SelectItem>
								{stages
									.filter((s) => s.id !== lead.stageId)
									.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											Move to {s.label}
										</SelectItem>
									))}
							</SelectContent>
						</Select>
					</div>
					<Button size="sm" disabled={!note.trim() || saving} onClick={log}>
						{saving ? "Saving…" : "Log contact"}
					</Button>
				</div>

			</div>
		</Panel>
	);
}
