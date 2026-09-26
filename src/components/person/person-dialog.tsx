import {
	ArrowBendUpRightIcon,
	ArrowsLeftRightIcon,
	CalendarCheckIcon,
	ChatTextIcon,
	EnvelopeSimpleIcon,
	HandshakeIcon,
	MagnifyingGlassIcon,
	PaperclipIcon,
	PencilSimpleIcon,
	PhoneIcon,
	TicketIcon,
	UserCircleIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { apiClient, errorMessage } from "#/lib/api/client";
import { useSession } from "#/lib/auth/session";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import { cn } from "#/lib/utils";
import { roleLabel, type UserRole } from "../../../shared/users";
import { useTicketConfig } from "../../routes/tickets/-components/use-ticket-config";

/** Whose history: a team member (by id) or a customer (by email, else name). */
export type PersonRef = { kind: "member"; id: string } | { kind: "customer"; name: string; email?: string | null };

type Kind = "ticket" | "status" | "comment" | "forward" | "change" | "file" | "visit" | "lead" | "contact";

interface Item {
	id: string;
	at: string;
	kind: Kind;
	actorId: string | null;
	title: string;
	summary: string;
	detail?: string;
	status?: string;
	ticketNumber?: number;
	ticketTypeId?: string;
	open?: boolean;
	eventId?: string;
	contactId?: string;
}

interface Person {
	kind: "member" | "customer";
	name: string;
	email: string;
	phone: string;
	role?: UserRole;
	jobTitle?: string;
	active?: boolean;
	company?: string;
}

const KIND: Record<Kind, { label: string; icon: ReactNode }> = {
	ticket: { label: "Tickets", icon: <TicketIcon className="size-4" /> },
	status: { label: "Status changes", icon: <ArrowsLeftRightIcon className="size-4" /> },
	comment: { label: "Updates", icon: <ChatTextIcon className="size-4" /> },
	forward: { label: "Forwards", icon: <ArrowBendUpRightIcon className="size-4" /> },
	change: { label: "Changes", icon: <PencilSimpleIcon className="size-4" /> },
	file: { label: "Files", icon: <PaperclipIcon className="size-4" /> },
	visit: { label: "Visits", icon: <CalendarCheckIcon className="size-4" /> },
	lead: { label: "Leads", icon: <HandshakeIcon className="size-4" /> },
	contact: { label: "Contacts with leads", icon: <PhoneIcon className="size-4" /> },
};
const PERIODS = [
	{ id: "30", label: "Last 30 days", days: 30 },
	{ id: "90", label: "Last 90 days", days: 90 },
	{ id: "365", label: "Last 12 months", days: 365 },
	{ id: "all", label: "All time", days: null },
] as const;
const ALL = "__all__";

/* ------------------------------ Context ------------------------------- */

const Ctx = createContext<(p: PersonRef) => void>(() => undefined);

/** Makes any name in the app open that person's history (see PersonName). */
export function PersonProvider({ children }: { children: ReactNode }) {
	const [person, setPerson] = useState<PersonRef | null>(null);
	return (
		<Ctx.Provider value={setPerson}>
			{children}
			{person && <PersonDialog person={person} onClose={() => setPerson(null)} />}
		</Ctx.Provider>
	);
}

export const useOpenPerson = () => useContext(Ctx);

/** A person's name that opens their history. */
export function PersonName({ person, children, className }: { person: PersonRef | null; children: ReactNode; className?: string }) {
	const open = useOpenPerson();
	if (!person || (person.kind === "customer" && !person.name && !person.email)) return <>{children}</>;
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				open(person);
			}}
			title="See their history"
			className={cn("text-left underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 hover:text-brand hover:decoration-brand", className)}
		>
			{children}
		</button>
	);
}

/* ------------------------------ Dialog -------------------------------- */

function PersonDialog({ person, onClose }: { person: PersonRef; onClose: () => void }) {
	const { user } = useCurrentUser();
	const { users } = useSession();
	const config = useTicketConfig(user?.id);
	const navigate = useNavigate();
	const [data, setData] = useState<{ person: Person; items: Item[] } | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [q, setQ] = useState("");
	const [kind, setKind] = useState<Kind | typeof ALL>(ALL);
	const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("all");
	const [typeId, setTypeId] = useState(ALL);
	const [state, setState] = useState<"all" | "open" | "closed">("all");
	const [view, setView] = useState<"tickets" | "timeline">("tickets");

	useEffect(() => {
		const params = person.kind === "member" ? `user=${encodeURIComponent(person.id)}` : `email=${encodeURIComponent(person.email ?? "")}&name=${encodeURIComponent(person.name)}`;
		apiClient
			.get<{ person: Person; items: Item[] }>(`/api/history?${params}`)
			.then(setData)
			.catch((e) => setError(errorMessage(e)));
	}, [person]);

	const nameOf = useCallback((id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? "Former member") : "—"), [users]);
	const items = data?.items ?? [];

	const filtered = useMemo(() => {
		const days = PERIODS.find((p) => p.id === period)?.days;
		const since = days ? Date.now() - days * 86_400_000 : null;
		const term = q.trim().toLowerCase();
		return items.filter((i) => {
			if (kind !== ALL && i.kind !== kind) return false;
			if (since && new Date(i.at).getTime() < since) return false;
			if (typeId !== ALL && i.ticketTypeId !== typeId) return false;
			if (state === "open" && i.open === false) return false;
			if (state === "closed" && i.open !== false) return false;
			if (term && ![i.title, i.summary, i.detail ?? "", i.status ?? ""].some((f) => f.toLowerCase().includes(term))) return false;
			return true;
		});
	}, [items, kind, period, typeId, state, q]);

	/** One row per ticket (or visit / lead) with everything the person did on it. */
	const groups = useMemo(() => {
		const map = new Map<string, { key: string; title: string; status?: string; open?: boolean; ticketNumber?: number; eventId?: string; contactId?: string; items: Item[] }>();
		for (const i of filtered) {
			const key = i.ticketNumber ? `t${i.ticketNumber}` : i.eventId ? `e${i.eventId}` : i.contactId ? `c${i.contactId}` : i.id;
			if (!map.has(key)) map.set(key, { key, title: i.title, status: i.status, open: i.open, ticketNumber: i.ticketNumber, eventId: i.eventId, contactId: i.contactId, items: [] });
			const g = map.get(key)!;
			g.items.push(i);
			// The ticket itself names the group and gives its status (a visit may come first).
			if (i.kind === "ticket") g.title = i.title;
			if (i.status && i.kind !== "visit") {
				g.status = g.status ?? i.status;
				g.open = i.open;
			}
		}
		return [...map.values()];
	}, [filtered]);

	const counts = useMemo(() => {
		const tickets = new Map<number, boolean>();
		for (const i of items) if (i.ticketNumber && i.kind !== "visit") tickets.set(i.ticketNumber, i.open !== false);
		return {
			tickets: tickets.size,
			openTickets: [...tickets.values()].filter(Boolean).length,
			actions: items.filter((i) => ["status", "comment", "forward", "change", "file"].includes(i.kind)).length,
			visits: items.filter((i) => i.kind === "visit").length,
			visitsDone: items.filter((i) => i.kind === "visit" && i.open === false).length,
			leads: items.filter((i) => i.kind === "lead" || i.kind === "contact").length,
		};
	}, [items]);

	function open(i: { ticketNumber?: number; eventId?: string; contactId?: string; kind?: Kind }) {
		onClose();
		if (i.eventId && (i.kind === "visit" || !i.ticketNumber)) navigate({ to: "/technician/$activityId", params: { activityId: i.eventId } });
		else if (i.ticketNumber) navigate({ to: "/tickets/$ticketNumber", params: { ticketNumber: String(i.ticketNumber) } });
		else if (i.contactId) navigate({ to: "/contacts" });
	}

	const p = data?.person;
	const isMember = person.kind === "member";

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="!flex !max-h-[92vh] !max-w-[95vw] flex-col !gap-0 !p-0 lg:!max-w-4xl">
				<div className="flex flex-wrap items-start justify-between gap-3 border-b px-6 pt-6 pb-4">
					<div className="flex min-w-0 items-start gap-3">
						<UserCircleIcon className="size-10 shrink-0 text-muted-foreground" weight="light" />
						<div className="min-w-0">
							<DialogTitle className="truncate">{p?.name ?? (person.kind === "customer" ? person.name : nameOf(person.id))}</DialogTitle>
							<DialogDescription className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
								<span>{isMember ? [p?.jobTitle, p?.role ? roleLabel(p.role) : ""].filter(Boolean).join(" · ") : p?.company || "Customer"}</span>
								{p?.email && (
									<a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 text-brand hover:underline">
										<EnvelopeSimpleIcon className="size-3.5" /> {p.email}
									</a>
								)}
								{p?.phone && (
									<a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-brand hover:underline">
										<PhoneIcon className="size-3.5" /> {p.phone}
									</a>
								)}
								{isMember && p?.active === false && <span className="text-destructive">Inactive</span>}
							</DialogDescription>
						</div>
					</div>
				</div>

				{error ? (
					<p className="p-6 text-destructive text-sm">{error}</p>
				) : !data ? (
					<p className="p-10 text-center text-muted-foreground text-sm">Loading their history…</p>
				) : (
					<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
						{/* At a glance */}
						<div className="grid grid-cols-2 gap-2 border-b px-6 py-3 sm:grid-cols-4">
							<Stat label={isMember ? "Tickets assigned or opened" : "Tickets requested"} value={counts.tickets} sub={`${counts.openTickets} open`} />
							<Stat label={isMember ? "Actions on tickets" : "Updates on their tickets"} value={counts.actions} />
							<Stat label="Visits" value={counts.visits} sub={`${counts.visitsDone} completed`} />
							<Stat label="Leads & contacts" value={counts.leads} />
						</div>

						{/* Filters, one row */}
						<div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
							<div className="relative min-w-48 flex-1">
								<MagnifyingGlassIcon className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
								<Input aria-label="Search their history" className="h-8 pl-8 text-sm" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
							</div>
							<Select value={kind} onValueChange={(v) => setKind(v as Kind | typeof ALL)}>
								<SelectTrigger aria-label="What" className="h-8 w-44 text-sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ALL}>Everything</SelectItem>
									{(Object.keys(KIND) as Kind[])
										.filter((k) => items.some((i) => i.kind === k))
										.map((k) => (
											<SelectItem key={k} value={k}>
												{KIND[k].label} · {items.filter((i) => i.kind === k).length}
											</SelectItem>
										))}
								</SelectContent>
							</Select>
							<Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
								<SelectTrigger aria-label="Period" className="h-8 w-36 text-sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PERIODS.map((x) => (
										<SelectItem key={x.id} value={x.id}>
											{x.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select value={typeId} onValueChange={setTypeId}>
								<SelectTrigger aria-label="Ticket type" className="h-8 w-40 text-sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ALL}>All ticket types</SelectItem>
									{config.types.map((t) => (
										<SelectItem key={t.id} value={t.id}>
											{t.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select value={state} onValueChange={(v) => setState(v as typeof state)}>
								<SelectTrigger aria-label="Open or closed" className="h-8 w-32 text-sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">Open & closed</SelectItem>
									<SelectItem value="open">Open</SelectItem>
									<SelectItem value="closed">Closed</SelectItem>
								</SelectContent>
							</Select>
							<div className="inline-flex rounded-md border border-border p-0.5 text-xs" role="tablist" aria-label="View">
								{(
									[
										["tickets", "By ticket"],
										["timeline", "Timeline"],
									] as const
								).map(([id, label]) => (
									<button
										key={id}
										type="button"
										role="tab"
										aria-selected={view === id}
										onClick={() => setView(id)}
										className={cn("rounded px-2 py-1", view === id ? "bg-brand/10 font-medium text-brand" : "text-muted-foreground hover:text-foreground")}
									>
										{label}
									</button>
								))}
							</div>
						</div>

						<div className="px-6 py-4">
							{filtered.length === 0 ? (
								<p className="py-8 text-center text-muted-foreground text-sm">Nothing matches these filters.</p>
							) : view === "tickets" ? (
								<ul className="flex flex-col gap-2">
									{groups.map((g) => {
										const acts = g.items.filter((i) => i.kind !== "ticket");
										const origin = g.items.find((i) => i.kind === "ticket");
										return (
											<li key={g.key} className="rounded-lg border border-border bg-card">
												<button type="button" onClick={() => open({ ...g, kind: g.items[0].kind })} className="flex w-full flex-wrap items-start justify-between gap-2 px-3 py-2 text-left hover:bg-muted/30">
													<span className="flex min-w-0 items-center gap-2">
														<span className="text-muted-foreground">{KIND[g.items[g.items.length - 1].kind].icon}</span>
														<span className="truncate font-medium text-sm">{g.title}</span>
													</span>
													<span className="flex shrink-0 items-center gap-2 text-xs">
														{g.status && (
															<span className={cn("rounded-full px-2 py-0.5", g.open === false ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground")}>{g.status}</span>
														)}
														<span className="text-muted-foreground">{dayjs(g.items[0].at).format("MMM D, YYYY")}</span>
													</span>
												</button>
												{/* What they did on it, summarized */}
												<div className="border-border border-t px-3 py-2 text-xs">
													{acts.length > 0 && <p className="mb-1 font-medium text-foreground">{actionSummary(acts)}</p>}
													{origin && <p className="text-muted-foreground">{origin.summary}{origin.detail ? ` · ${origin.detail}` : ""}</p>}
													{acts.length > 0 && (
														<ul className="mt-1 flex flex-col gap-1">
															{acts.map((i) => (
																<li key={i.id} className="flex gap-2">
																	<span className="w-16 shrink-0 text-muted-foreground">{dayjs(i.at).format("MMM D")}</span>
																	<span className="min-w-0">
																		<span className="font-medium">{i.summary}</span>
																		{!isMember && i.actorId && <span className="text-muted-foreground"> · by {nameOf(i.actorId)}</span>}
																		{i.detail && <span className="block text-muted-foreground">{i.detail}</span>}
																	</span>
																</li>
															))}
														</ul>
													)}
												</div>
											</li>
										);
									})}
								</ul>
							) : (
								<ol className="flex flex-col gap-3">
									{filtered.map((i) => (
										<li key={i.id}>
											<button type="button" onClick={() => open(i)} className="flex w-full gap-3 rounded-md p-1 text-left hover:bg-muted/30">
												<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">{KIND[i.kind].icon}</span>
												<span className="min-w-0 flex-1 text-sm">
													<span className="flex flex-wrap items-baseline justify-between gap-x-2">
														<span className="font-medium">{i.summary}</span>
														<span className="text-muted-foreground text-xs">{dayjs(i.at).format("MMM D, YYYY h:mm A")}</span>
													</span>
													<span className="block truncate text-muted-foreground text-xs">
														{i.title}
														{i.status ? ` · now ${i.status}` : ""}
														{!isMember && i.actorId ? ` · by ${nameOf(i.actorId)}` : ""}
													</span>
													{i.detail && <span className="mt-0.5 block text-xs">{i.detail}</span>}
												</span>
											</button>
										</li>
									))}
								</ol>
							)}
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
	return (
		<div className="flex flex-col rounded-lg border border-border px-3 py-2">
			<span className="font-semibold text-lg leading-tight">{value}</span>
			<span className="text-muted-foreground text-xs">
				{label}
				{sub ? ` · ${sub}` : ""}
			</span>
		</div>
	);
}

/** "2 status changes · 1 update · forwarded 1×" — the gist of what was done on one ticket. */
function actionSummary(acts: Item[]): string {
	const n = (k: Kind) => acts.filter((i) => i.kind === k).length;
	const parts = [
		n("status") && `${n("status")} status change${n("status") > 1 ? "s" : ""}`,
		n("comment") && `${n("comment")} update${n("comment") > 1 ? "s" : ""}`,
		n("forward") && `forwarded ${n("forward")}×`,
		n("change") && `${n("change")} change${n("change") > 1 ? "s" : ""}`,
		n("file") && `${n("file")} file${n("file") > 1 ? "s" : ""}`,
		n("visit") && `${n("visit")} visit${n("visit") > 1 ? "s" : ""}`,
		n("contact") && `${n("contact")} contact${n("contact") > 1 ? "s" : ""}`,
	].filter(Boolean);
	return parts.join(" · ");
}
