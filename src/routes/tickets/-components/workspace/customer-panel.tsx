import { ChatCircleTextIcon, EnvelopeSimpleIcon, HandshakeIcon, PhoneIcon, UserIcon } from "@phosphor-icons/react";
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

type Kind = Exclude<InteractionKind, "transfer">;
const KEEP = "__keep__";

/**
 * Who asked, with shortcuts to reach them. Every contact made from here is
 * logged on the ticket (and on the lead, when they are one): using a shortcut
 * opens the log right away.
 */
export function CustomerPanel({ ws }: { ws: Workspace }) {
	const { ticket, userName, reload, workflow } = ws;
	const r = ticket.requester;
	const isDeal = workflow?.id === "wf-sales";
	const [lead, setLead] = useState<Contact | null>(null);
	const [checked, setChecked] = useState(false);
	const [stages, setStages] = useState(contactStagesFrom(null));
	const [logging, setLogging] = useState<Kind | null>(null);
	const [note, setNote] = useState("");
	const [next, setNext] = useState("");
	const [stageId, setStageId] = useState(KEEP);
	const [saving, setSaving] = useState(false);
	const [adding, setAdding] = useState(false);

	const find = useCallback(async () => {
		if (!r.email) return setChecked(true);
		try {
			const [list, st] = await Promise.all([apiClient.get<Contact[]>("/api/contacts"), apiClient.get<{ value: unknown }>("/api/settings/contactStages")]);
			const c = list.find((x) => sameEmail(x.email, r.email)) ?? null;
			setLead(c);
			setStages(contactStagesFrom(st.value));
			setNext(c?.nextFollowUp ?? "");
		} catch {
			setLead(null);
		} finally {
			setChecked(true);
		}
	}, [r.email]);
	useEffect(() => {
		find();
	}, [find]);

	const phone = r.phone.replace(/[^\d]/g, "");
	const start = (kind: Kind) => {
		setLogging(kind);
		setNote("");
	};

	async function log() {
		if (!logging || !note.trim() || saving) return;
		setSaving(true);
		try {
			const label = INTERACTION_KINDS.find((k) => k.id === logging)?.label ?? logging;
			if (lead) {
				// On the lead, and (with ticketId) on this ticket's history too.
				const saved = await apiClient.post<Contact>(`/api/contacts/${encodeURIComponent(lead.id)}/interactions`, {
					kind: logging,
					note: note.trim(),
					nextFollowUp: next || null,
					ticketId: ticket.id,
					...(stageId !== KEEP ? { stageId } : {}),
				});
				setLead(saved);
			} else {
				await apiClient.post(`/api/tickets/${encodeURIComponent(ticket.id)}/comments`, {
					comment: `${logging === "note" ? "Note about" : `${label} with`} ${r.name || "the customer"}: ${note.trim()}`,
				});
			}
			toast.success(`${label} logged on the ticket`);
			setLogging(null);
			setNote("");
			setStageId(KEEP);
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	async function addLead() {
		setAdding(true);
		try {
			await apiClient.post<Contact>("/api/contacts", {
				name: r.name || r.email,
				email: r.email,
				phone: r.phone,
				company: ticket.clientName,
				ownerId: ticket.assigneeId,
				developmentId: ticket.developmentId,
				notes: ticket.description,
			});
			toast.success(`${r.name} is now a lead`);
			await find();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setAdding(false);
		}
	}

	return (
		<Panel title="Customer" icon={<UserIcon className="size-4" />}>
			<div className="flex flex-col gap-3 text-sm">
				<div>
					<p className="font-medium">
						{r.name ? <PersonName person={{ kind: "customer", name: r.name, email: r.email }}>{r.name}</PersonName> : "No requester"}
					</p>
					{ticket.clientName && <p className="text-muted-foreground text-xs">{ticket.clientName}</p>}
					{r.email && <p className="truncate text-muted-foreground text-xs">{r.email}</p>}
					{r.phone && <p className="text-muted-foreground text-xs">{r.phone}</p>}
					{(ticket.property || ticket.location) && <p className="text-muted-foreground text-xs">{[ticket.property, ticket.location].filter(Boolean).join(" · ")}</p>}
				</div>

				{/* Reach them: the link opens, and the log is ready to fill */}
				<div className="grid grid-cols-3 gap-1.5">
					<Shortcut href={phone ? `tel:+${phone}` : undefined} icon={<PhoneIcon className="size-4" />} label="Call" onUse={() => start("call")} />
					<Shortcut href={r.email ? `mailto:${r.email}?subject=${encodeURIComponent(`#${ticket.number} ${ticket.title}`)}` : undefined} icon={<EnvelopeSimpleIcon className="size-4" />} label="Email" onUse={() => start("email")} />
					<Shortcut href={phone ? `https://wa.me/${phone}` : undefined} icon={<ChatCircleTextIcon className="size-4" />} label="WhatsApp" onUse={() => start("message")} external />
				</div>

				{logging ? (
					<div className="flex flex-col gap-2 rounded-md border border-brand/30 bg-brand/5 p-2">
						<div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Kind of contact">
							{INTERACTION_KINDS.map((k) => (
								<button
									key={k.id}
									type="button"
									role="radio"
									aria-checked={logging === k.id}
									onClick={() => setLogging(k.id)}
									className={cn("rounded-full border px-2 py-0.5 text-xs", logging === k.id ? "border-brand bg-brand/10 text-brand" : "border-border bg-card text-muted-foreground hover:bg-muted")}
								>
									{k.label}
								</button>
							))}
						</div>
						<Textarea autoFocus rows={3} className="resize-none bg-card text-sm" placeholder="How it went: answered, what was agreed…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="What was talked about" />
						{lead && (
							<div className="grid grid-cols-2 gap-1.5">
								<Input type="date" aria-label="Next follow-up" className="h-8 bg-card text-xs" value={next} onChange={(e) => setNext(e.target.value)} />
								<Select value={stageId} onValueChange={setStageId}>
									<SelectTrigger aria-label="Move the lead to" className="h-8 bg-card text-xs">
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
						)}
						<div className="flex justify-end gap-1.5">
							<Button size="sm" variant="ghost" className="h-7" onClick={() => setLogging(null)} disabled={saving}>
								Cancel
							</Button>
							<Button size="sm" className="h-7" onClick={log} disabled={!note.trim() || saving}>
								{saving ? "Saving…" : "Log on the ticket"}
							</Button>
						</div>
					</div>
				) : (
					<button type="button" onClick={() => start("call")} className="self-start text-brand text-xs hover:underline">
						Log a contact without the shortcuts
					</button>
				)}

				{/* The lead behind the deal */}
				{lead ? (
					<div className="flex flex-col gap-1.5 border-border border-t pt-3 text-xs">
						<div className="flex flex-wrap items-center gap-2">
							<HandshakeIcon className="size-4 text-muted-foreground" />
							<StageBadge stages={stages} stageId={lead.stageId} />
							<TemperatureDot value={lead.temperature} withLabel />
						</div>
						<p className="text-muted-foreground">
							In {lead.ownerId ? <PersonName person={{ kind: "member", id: lead.ownerId }}>{userName(lead.ownerId)}</PersonName> : "no one"}'s portfolio · budget {money(lead.budget)}
						</p>
						<p className="text-muted-foreground">
							Next follow-up: <FollowUpLabel contact={lead} /> · last contact {lead.lastContactAt ? dayjs(lead.lastContactAt).fromNow() : "never"}
						</p>
					</div>
				) : (
					isDeal &&
					checked &&
					r.email && (
						<div className="flex flex-col gap-1.5 border-border border-t pt-3 text-xs">
							<p className="text-muted-foreground">Not a lead yet: add them to follow up stage, budget and next contacts.</p>
							<Button size="sm" variant="secondary" className="h-7 self-start" onClick={addLead} disabled={adding}>
								<HandshakeIcon className="size-4" /> {adding ? "Adding…" : "Add as a lead"}
							</Button>
						</div>
					)
				)}
			</div>
		</Panel>
	);
}

function Shortcut({ href, icon, label, onUse, external }: { href?: string; icon: React.ReactNode; label: string; onUse: () => void; external?: boolean }) {
	if (!href) {
		return (
			<span className="flex flex-col items-center gap-0.5 rounded-md border border-border px-1 py-1.5 text-[11px] text-muted-foreground/50" title={`No ${label === "Email" ? "email" : "phone"} on the ticket`}>
				{icon}
				{label}
			</span>
		);
	}
	return (
		<a
			href={href}
			target={external ? "_blank" : undefined}
			rel={external ? "noreferrer" : undefined}
			onClick={onUse}
			className="flex flex-col items-center gap-0.5 rounded-md border border-border px-1 py-1.5 text-[11px] text-brand hover:border-brand hover:bg-brand/5"
		>
			{icon}
			{label}
		</a>
	);
}
