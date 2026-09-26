import {
	ArrowBendUpRightIcon,
	CalendarCheckIcon,
	FireIcon,
	HourglassMediumIcon,
	KanbanIcon,
	ListBulletsIcon,
	MagnifyingGlassIcon,
	PlusIcon,
	SlidersHorizontalIcon,
	UsersThreeIcon,
	XIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageLayout } from "#/components/layout/page-layout";
import { Button } from "#/components/ui/button";
import { PersonName } from "#/components/person/person-dialog";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { apiClient, errorMessage } from "#/lib/api/client";
import { useSession } from "#/lib/auth/session";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import { cn } from "#/lib/utils";
import {
	type Contact,
	contactStagesFrom,
	daysSince,
	followUpDue,
	sameEmail,
	STALE_DAYS,
	stageOf,
	TEMPERATURES,
	type Temperature,
} from "../../../shared/contacts";
import type { DevelopmentTree } from "../../../shared/developments";
import type { Ticket } from "../../../shared/tickets";
import { roleLabel } from "../../../shared/users";
import { type NewTicketInput, TicketFormDialog } from "../tickets/-components/ticket-form-dialog";
import { useTicketConfig } from "../tickets/-components/use-ticket-config";
import { ContactDialog } from "./-components/contact-dialog";
import { ContactFormDialog } from "./-components/contact-form-dialog";
import { FollowUpLabel, LastContactLabel, money, OwnerChip, StageBadge, TemperatureDot } from "./-components/shared";
import { useColumns } from "#/lib/use-list-views";
import { LIST_BY_ID } from "../../../shared/list-views";
import { TransferDialog } from "./-components/transfer-dialog";
import { Pagination, ShowMore, useColumnLimit, usePagination } from "#/components/pagination";

export const Route = createFileRoute("/contacts/")({
	component: ContactsPage,
});

const ALL = "__all__";
const OPEN = "__open__";
const NONE = "__none__";

type SortKey = "followup" | "lastContact" | "name" | "updated";

/**
 * Lead portfolio. Brokers work their own leads (who to call today, who went
 * quiet); administrators see every portfolio side by side and rebalance them.
 */
function ContactsPage() {
	const { user, can } = useCurrentUser();
	const { users } = useSession();
	const isAdmin = can("calendar.viewAll");
	const config = useTicketConfig(user?.id);
	const navigate = useNavigate();
	const [contacts, setContacts] = useState<Contact[] | null>(null);
	const [stagesValue, setStagesValue] = useState<unknown>(null);
	const [developments, setDevelopments] = useState<DevelopmentTree[]>([]);
	const [tickets, setTickets] = useState<Ticket[]>([]);

	const [q, setQ] = useState("");
	const [owner, setOwner] = useState<string>(ALL);
	const [stage, setStage] = useState<string>(OPEN);
	const [temp, setTemp] = useState<Temperature | typeof ALL>(ALL);
	const [quick, setQuick] = useState<"due" | "stale" | null>(null);
	const [sort, setSort] = useState<SortKey>("followup");
	const [view, setView] = useState<"list" | "board">("list");
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const [openId, setOpenId] = useState<string | null>(null);
	const [form, setForm] = useState<{ contact: Contact | null } | null>(null);
	const [transfer, setTransfer] = useState<Contact[] | null>(null);
	const [dealFor, setDealFor] = useState<Contact | null>(null);
	const [dragId, setDragId] = useState<string | null>(null);
	const [over, setOver] = useState<string | null>(null);

	const stages = useMemo(() => contactStagesFrom(stagesValue), [stagesValue]);

	const load = useCallback(async () => {
		if (!user) return;
		try {
			const [list, st] = await Promise.all([
				apiClient.get<Contact[]>("/api/contacts"),
				apiClient.get<{ value: unknown }>("/api/settings/contactStages"),
			]);
			setContacts(list);
			setStagesValue(st.value);
		} catch (e) {
			toast.error(errorMessage(e));
			setContacts([]);
		}
		apiClient.get<Ticket[]>("/api/tickets").then(setTickets).catch(() => setTickets([]));
	}, [user]);

	useEffect(() => {
		load();
	}, [load]);
	useEffect(() => {
		if (user) apiClient.get<DevelopmentTree[]>("/api/developments").then(setDevelopments).catch(() => setDevelopments([]));
	}, [user]);

	const userName = useCallback((id: string | null | undefined) => (id ? (users.find((u) => u.id === id)?.name ?? "Former member") : "Unassigned"), [users]);
	const developmentName = useCallback((id: string | null) => (id ? (developments.find((d) => d.id === id)?.name ?? null) : null), [developments]);
	const people = useMemo(
		() =>
			users
				.filter((u) => u.active)
				.sort((a, b) => Number(b.role === "broker") - Number(a.role === "broker") || a.name.localeCompare(b.name))
				.map((u) => ({ id: u.id, name: u.name, detail: u.jobTitle || roleLabel(u.role) })),
		[users],
	);
	const isClosed = useCallback((c: Contact) => Boolean(stageOf(stages, c.stageId)?.closed), [stages]);
	// Which columns and card details: Settings › Lists & columns (Portfolio only for administrators).
	const leadCols = useColumns("leads", isAdmin);
	const cardCols = useColumns("leadCards", isAdmin);
	const leadCell = (c: Contact, id: string, deals: number) => {
		const muted = <span className="text-muted-foreground">—</span>;
		switch (id) {
			case "lead":
				return (
					<td key={id} className="px-3 py-2.5">
						<div className="flex items-center gap-2">
							<TemperatureDot value={c.temperature} />
							<div className="min-w-0">
								<p className="truncate font-medium">
									<PersonName person={{ kind: "customer", name: c.name, email: c.email }}>{c.name}</PersonName>
								</p>
								<p className="truncate text-muted-foreground text-xs">{[c.company, c.email || c.phone].filter(Boolean).join(" · ")}</p>
							</div>
						</div>
					</td>
				);
			case "stage":
				return <td key={id} className="px-3 py-2.5"><StageBadge stages={stages} stageId={c.stageId} /></td>;
			case "development":
				return <td key={id} className="max-w-48 truncate px-3 py-2.5 text-xs">{developmentName(c.developmentId) ?? muted}</td>;
			case "budget":
				return <td key={id} className="px-3 py-2.5 text-right text-xs">{money(c.budget)}</td>;
			case "followUp":
				return <td key={id} className="px-3 py-2.5"><FollowUpLabel contact={c} /></td>;
			case "lastContact":
				return <td key={id} className="px-3 py-2.5"><LastContactLabel contact={c} closed={isClosed(c)} /></td>;
			case "deals":
				return <td key={id} className="px-3 py-2.5 text-xs">{deals ? <span className="font-medium text-brand">{deals}</span> : muted}</td>;
			case "owner":
				return (
					<td key={id} className="px-3 py-2.5">
						{c.ownerId ? (
							<PersonName person={{ kind: "member", id: c.ownerId }}>
								<OwnerChip name={userName(c.ownerId)} />
							</PersonName>
						) : (
							<OwnerChip name={null} />
						)}
					</td>
				);
			case "temperature":
				return <td key={id} className="px-3 py-2.5"><TemperatureDot value={c.temperature} withLabel /></td>;
			case "source":
				return <td key={id} className="px-3 py-2.5 text-xs">{c.source || muted}</td>;
			case "company":
				return <td key={id} className="max-w-48 truncate px-3 py-2.5 text-xs">{c.company || muted}</td>;
			case "email":
				return <td key={id} className="px-3 py-2.5 text-xs">{c.email ? <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()} className="hover:text-brand">{c.email}</a> : muted}</td>;
			case "phone":
				return <td key={id} className="whitespace-nowrap px-3 py-2.5 text-xs">{c.phone ? <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="hover:text-brand">{c.phone}</a> : muted}</td>;
			case "created":
				return <td key={id} className="whitespace-nowrap px-3 py-2.5 text-muted-foreground text-xs">{new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>;
			default:
				return <td key={id} />;
		}
	};
	const dealsOf = useCallback((c: Contact) => (c.email ? tickets.filter((t) => sameEmail(t.requester.email, c.email)) : []), [tickets]);

	const all = contacts ?? [];
	const openLeads = all.filter((c) => !isClosed(c));
	const stats = {
		open: openLeads.length,
		hot: openLeads.filter((c) => c.temperature === "hot").length,
		due: openLeads.filter((c) => followUpDue(c)).length,
		stale: openLeads.filter((c) => (daysSince(c.lastContactAt) ?? STALE_DAYS) >= STALE_DAYS).length,
	};

	/** Portfolios side by side (admins): everyone who owns leads, brokers first, then unassigned. */
	const portfolios = useMemo(() => {
		if (!isAdmin) return [];
		const ids = new Set(all.map((c) => c.ownerId));
		for (const u of users) if (u.active && u.role === "broker") ids.add(u.id);
		return [...ids]
			.map((id) => {
				const mine = all.filter((c) => c.ownerId === id && !isClosed(c));
				return { id, name: id ? userName(id) : "Unassigned", open: mine.length, hot: mine.filter((c) => c.temperature === "hot").length, due: mine.filter((c) => followUpDue(c)).length };
			})
			.sort((a, b) => Number(a.id === null) - Number(b.id === null) || b.open - a.open);
	}, [isAdmin, all, users, isClosed, userName]);

	const filtered = useMemo(() => {
		const term = q.trim().toLowerCase();
		const list = all.filter((c) => {
			if (owner === NONE ? c.ownerId !== null : owner !== ALL && c.ownerId !== owner) return false;
			if (stage === OPEN ? isClosed(c) : stage !== ALL && c.stageId !== stage) return false;
			if (temp !== ALL && c.temperature !== temp) return false;
			if (quick === "due" && !followUpDue(c)) return false;
			if (quick === "stale" && (isClosed(c) || (daysSince(c.lastContactAt) ?? STALE_DAYS) < STALE_DAYS)) return false;
			if (term && ![c.name, c.email, c.phone, c.company, c.source, developmentName(c.developmentId) ?? ""].some((f) => f.toLowerCase().includes(term))) return false;
			return true;
		});
		const by: Record<SortKey, (a: Contact, b: Contact) => number> = {
			followup: (a, b) => (a.nextFollowUp ?? "9999").localeCompare(b.nextFollowUp ?? "9999") || a.name.localeCompare(b.name),
			lastContact: (a, b) => (a.lastContactAt ?? "").localeCompare(b.lastContactAt ?? ""),
			name: (a, b) => a.name.localeCompare(b.name),
			updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
		};
		return list.sort(by[sort]);
	}, [all, q, owner, stage, temp, quick, sort, isClosed, developmentName]);
	const paged = usePagination(filtered, { key: "contacts", resetKey: [q, owner, stage, temp, quick, sort] });
	const columnLimit = useColumnLimit();

	const replace = (c: Contact) => setContacts((list) => (list ?? []).map((x) => (x.id === c.id ? c : x)));
	const toggle = (id: string, on: boolean) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (on) next.add(id);
			else next.delete(id);
			return next;
		});
	const chosen = all.filter((c) => selected.has(c.id));
	const open = openId ? all.find((c) => c.id === openId) : undefined;

	async function moveStage(ids: string[], stageId: string) {
		try {
			const res = await apiClient.post<{ changed: number }>("/api/contacts/stage", { ids, stageId });
			toast.success(`${res.changed} lead${res.changed === 1 ? "" : "s"} moved to ${stageOf(stages, stageId)?.label}`);
			setSelected(new Set());
			await load();
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	async function remove(c: Contact) {
		if (!window.confirm(`Delete ${c.name} and their contact history? Deals stay on Tickets.`)) return;
		try {
			await apiClient.delete(`/api/contacts/${encodeURIComponent(c.id)}`);
			setOpenId(null);
			toast.success(`${c.name} deleted`);
			await load();
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	// Deals: prefer the ticket type most used by existing deals, else the first active one.
	const activeTypes = config.types.filter((t) => t.active);
	const dealTypeId = useMemo(() => {
		const counts = new Map<string, number>();
		for (const t of tickets) if (all.some((c) => sameEmail(c.email, t.requester.email))) counts.set(t.typeId, (counts.get(t.typeId) ?? 0) + 1);
		return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? activeTypes[0]?.id;
	}, [tickets, all, activeTypes]);
	const dealInitial = useMemo(
		() =>
			dealFor
				? {
						title: `${dealFor.name}${developmentName(dealFor.developmentId) ? ` · ${developmentName(dealFor.developmentId)}` : ""}`,
						description: dealFor.notes,
						requester: { name: dealFor.name, email: dealFor.email, phone: dealFor.phone },
						developmentId: dealFor.developmentId ?? "",
						assigneeId: dealFor.ownerId,
					}
				: undefined,
		[dealFor, developmentName],
	);
	async function createDeal(input: NewTicketInput) {
		try {
			const t = await apiClient.post<Ticket>("/api/tickets", input);
			toast.success(`Deal opened as Ticket #${t.number}`, { description: "Work the lead from the ticket." });
			setDealFor(null);
			// The deal is worked on its ticket (lead included).
			navigate({ to: "/tickets/$ticketNumber", params: { ticketNumber: String(t.number) } });
		} catch (e) {
			toast.error(errorMessage(e));
			throw e;
		}
	}

	const boardStages = stage === OPEN ? stages.filter((s) => !s.closed) : stage === ALL ? stages : stages.filter((s) => s.id === stage);

	return (
		<PageLayout
			title="Contacts"
			subtitle={isAdmin ? "Every lead portfolio: who owns which lead, who to call, who went quiet" : "Your lead portfolio: who to call today and who went quiet"}
			breadcrumbs={[{ label: "Customers" }, { label: "Contacts" }]}
			actions={
				<>
					{isAdmin && (
						<Button variant="secondary" size="sm" asChild>
							<Link to="/settings" search={{ section: "lead-stages" }}>
								<SlidersHorizontalIcon className="size-4" /> Lead stages
							</Link>
						</Button>
					)}
					{can("contacts.create") && (
						<Button size="sm" onClick={() => setForm({ contact: null })}>
							<PlusIcon className="size-4" /> New lead
						</Button>
					)}
				</>
			}
		>
			<div className="flex flex-col gap-4 py-4">
				{/* Portfolio at a glance; each tile is also a filter */}
				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<Tile icon={<UsersThreeIcon className="size-5" />} label={isAdmin ? "Open leads" : "In your portfolio"} value={stats.open} active={!quick && temp === ALL} onClick={() => (setQuick(null), setTemp(ALL))} />
					<Tile icon={<FireIcon className="size-5" />} label="Hot" value={stats.hot} tone="text-red-600" active={temp === "hot"} onClick={() => setTemp(temp === "hot" ? ALL : "hot")} />
					<Tile icon={<CalendarCheckIcon className="size-5" />} label="Follow-ups due" value={stats.due} tone="text-destructive" active={quick === "due"} onClick={() => setQuick(quick === "due" ? null : "due")} />
					<Tile icon={<HourglassMediumIcon className="size-5" />} label={`No contact in ${STALE_DAYS}+ days`} value={stats.stale} tone="text-amber-700" active={quick === "stale"} onClick={() => setQuick(quick === "stale" ? null : "stale")} />
				</div>

				{isAdmin && portfolios.length > 0 && (
					<section aria-label="Portfolios" className="flex gap-2 overflow-x-auto p-0.5 pb-1.5">
						{portfolios.map((p) => {
							const key = p.id ?? NONE;
							const on = owner === key;
							return (
								<button
									key={key}
									type="button"
									onClick={() => setOwner(on ? ALL : key)}
									className={cn(
										"flex min-w-44 shrink-0 flex-col gap-1 rounded-lg border bg-card px-3 py-2 text-left shadow-sm transition-colors",
										on ? "border-brand ring-1 ring-brand ring-inset" : "border-border hover:border-brand/50",
									)}
								>
									<span className={cn("truncate font-medium text-sm", !p.id && "text-muted-foreground")}>{p.name}</span>
									<span className="flex gap-3 text-muted-foreground text-xs">
										<span>
											<b className="text-foreground">{p.open}</b> open
										</span>
										{p.hot > 0 && <span className="text-red-600">{p.hot} hot</span>}
										{p.due > 0 && <span className="text-destructive">{p.due} due</span>}
									</span>
								</button>
							);
						})}
					</section>
				)}

				{/* Filters */}
				<div className="flex flex-wrap items-center gap-2">
					<div className="relative min-w-56 flex-1">
						<MagnifyingGlassIcon className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
						<Input aria-label="Search leads" className="h-9 pl-8" placeholder="Search name, email, phone, company…" value={q} onChange={(e) => setQ(e.target.value)} />
					</div>
					<Select value={stage} onValueChange={setStage}>
						<SelectTrigger aria-label="Stage" className="h-9 w-44">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={OPEN}>Open stages</SelectItem>
							<SelectItem value={ALL}>All stages</SelectItem>
							{stages.map((s) => (
								<SelectItem key={s.id} value={s.id}>
									{s.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Select value={temp} onValueChange={(v) => setTemp(v as Temperature | typeof ALL)}>
						<SelectTrigger aria-label="Temperature" className="h-9 w-36">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL}>Any temperature</SelectItem>
							{TEMPERATURES.map((t) => (
								<SelectItem key={t.id} value={t.id}>
									{t.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{isAdmin && (
						<Select value={owner} onValueChange={setOwner}>
							<SelectTrigger aria-label="Portfolio" className="h-9 w-44">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL}>All portfolios</SelectItem>
								<SelectItem value={NONE}>Unassigned</SelectItem>
								{people.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
					{view === "list" && (
						<Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
							<SelectTrigger aria-label="Sort" className="h-9 w-44">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="followup">Next follow-up first</SelectItem>
								<SelectItem value="lastContact">Longest without contact</SelectItem>
								<SelectItem value="updated">Recently updated</SelectItem>
								<SelectItem value="name">Name</SelectItem>
							</SelectContent>
						</Select>
					)}
					{/* Same switch as Tickets and the Calendar views. */}
					<div className="inline-flex items-center gap-1" role="group" aria-label="View">
						{(["list", "board"] as const).map((v) => (
							<Button key={v} size="sm" variant={view === v ? "default" : "secondary"} onClick={() => setView(v)} aria-pressed={view === v}>
								{v === "list" ? <ListBulletsIcon className="size-4" /> : <KanbanIcon className="size-4" />}
								{v === "list" ? "List" : "Board"}
							</Button>
						))}
					</div>
				</div>

				{selected.size > 0 && (
					<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
						<span>{selected.size} selected</span>
						<div className="flex flex-wrap items-center gap-1.5">
							<Select value="" onValueChange={(v) => moveStage([...selected], v)}>
								<SelectTrigger aria-label="Move selected to stage" className="h-8 w-44 bg-card text-sm">
									<SelectValue placeholder="Move to stage…" />
								</SelectTrigger>
								<SelectContent>
									{stages.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button size="sm" onClick={() => setTransfer(chosen)}>
								<ArrowBendUpRightIcon className="size-4" /> Transfer
							</Button>
							<Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
								<XIcon className="size-4" />
							</Button>
						</div>
					</div>
				)}

				{contacts === null ? (
					<p className="py-12 text-center text-muted-foreground text-sm">Loading leads…</p>
				) : filtered.length === 0 ? (
					<div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
						<p className="text-muted-foreground text-sm">{all.length === 0 ? "No leads yet." : "No lead matches these filters."}</p>
						{all.length === 0 && (
							<Button size="sm" onClick={() => setForm({ contact: null })}>
								<PlusIcon className="size-4" /> Add your first lead
							</Button>
						)}
					</div>
				) : view === "list" ? (
					<div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
						<table className="w-full text-sm" style={{ minWidth: Math.max(640, 40 + leadCols.ids.length * 115) }}>
							<thead className="border-border border-b bg-muted/40 text-left text-muted-foreground text-xs">
								<tr>
									<th className="w-10 px-3 py-2.5">
										<Checkbox
											aria-label="Select all on this page"
											checked={paged.items.length > 0 && paged.items.every((c) => selected.has(c.id))}
											onCheckedChange={(v) => setSelected(v === true ? new Set(paged.items.map((c) => c.id)) : new Set())}
										/>
									</th>
									{leadCols.ids.map((id) => (
										<th key={id} className={cn("whitespace-nowrap px-3 py-2.5 font-semibold", id === "budget" && "text-right")}>
											{LIST_BY_ID.leads.columns.find((c) => c.id === id)?.label}
										</th>
									))}
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{paged.items.map((c) => {
									const deals = dealsOf(c).length;
									return (
										<tr key={c.id} className={cn("cursor-pointer hover:bg-muted/30", selected.has(c.id) && "bg-brand/5")} onClick={() => setOpenId(c.id)}>
											<td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
												<Checkbox aria-label={`Select ${c.name}`} checked={selected.has(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} />
											</td>
											{leadCols.ids.map((id) => leadCell(c, id, deals))}
										</tr>
									);
								})}
							</tbody>
						</table>
						<Pagination state={paged} noun="leads" className="border-border border-t px-3" />
						<p className="border-border border-t px-3 py-2 text-muted-foreground text-xs">
							{filtered.length} of {all.length} lead{all.length === 1 ? "" : "s"}
						</p>
					</div>
				) : (
					<div className="flex gap-3 overflow-x-auto pb-2">
						{boardStages.map((s) => {
							const items = filtered.filter((c) => c.stageId === s.id);
							return (
								<section
									key={s.id}
									aria-label={s.label}
									onDragOver={(e) => {
										if (!dragId) return;
										e.preventDefault();
										setOver(s.id);
									}}
									onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
									onDrop={(e) => {
										e.preventDefault();
										setOver(null);
										const id = e.dataTransfer.getData("text/plain");
										const c = all.find((x) => x.id === id);
										if (c && c.stageId !== s.id) moveStage([id], s.id);
									}}
									className={cn("flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30", over === s.id && "border-brand bg-brand/5")}
								>
									<header className="flex items-center justify-between border-border border-b px-3 py-2">
										<span className="flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
											<span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
											{s.label}
										</span>
										<span className="rounded-full bg-card px-1.5 text-[11px] text-muted-foreground">{items.length}</span>
									</header>
									<div className="flex min-h-24 flex-col gap-2 p-2">
										{items.length === 0 && <p className="py-4 text-center text-[11px] text-muted-foreground">Nothing here</p>}
										{items.slice(0, columnLimit.limit(s.id)).map((c) => (
											<button
												key={c.id}
												type="button"
												draggable
												onDragStart={(e) => {
													e.dataTransfer.setData("text/plain", c.id);
													setDragId(c.id);
												}}
												onDragEnd={() => setDragId(null)}
												onClick={() => setOpenId(c.id)}
												className={cn("flex flex-col gap-1.5 rounded-lg border border-border bg-card p-2.5 text-left shadow-sm hover:border-brand/50", dragId === c.id && "opacity-50")}
											>
												<span className="flex items-center justify-between gap-2">
													<span className="truncate font-medium text-sm">{c.name}</span>
													{cardCols.has("temperature") && <TemperatureDot value={c.temperature} />}
												</span>
												{/* The rest in the order set in Settings › Lists & columns. */}
												{cardCols.ids.map((id) => {
													if (id === "development") return <span key={id} className="truncate text-muted-foreground text-xs">{developmentName(c.developmentId) ?? c.company ?? ""}</span>;
													if (id === "phone") return c.phone ? <span key={id} className="truncate text-muted-foreground text-xs">{c.phone}</span> : null;
													if (id === "source") return c.source ? <span key={id} className="truncate text-muted-foreground text-xs">From {c.source}</span> : null;
													// Follow-up, budget and portfolio share the bottom row, where the first of them is.
													if (["followUp", "owner", "budget"].includes(id)) {
														if (id !== cardCols.ids.find((x) => ["followUp", "owner", "budget"].includes(x))) return null;
														return (
															<span key="bottom" className="flex items-center justify-between gap-2">
																{cardCols.has("followUp") ? <FollowUpLabel contact={c} /> : <span />}
																<span className="flex items-center gap-2">
																	{cardCols.has("budget") && <span className="text-xs">{money(c.budget)}</span>}
																	{cardCols.has("owner") && <OwnerChip name={c.ownerId ? userName(c.ownerId) : null} />}
																</span>
															</span>
														);
													}
													return null;
												})}
											</button>
										))}
										<ShowMore shown={columnLimit.limit(s.id)} total={items.length} step={columnLimit.step} onMore={() => columnLimit.more(s.id)} />
									</div>
								</section>
							);
						})}
					</div>
				)}
			</div>

			{open && (
				<ContactDialog
					key={open.id}
					contact={open}
					stages={stages}
					deals={dealsOf(open)}
					workflowOf={config.workflowOf}
					userName={userName}
					developmentName={developmentName}
					canDelete={(isAdmin || open.createdBy === user?.id) && can("contacts.delete")}
					onClose={() => setOpenId(null)}
					onEdit={() => setForm({ contact: open })}
					onTransfer={() => setTransfer([open])}
					onDelete={() => remove(open)}
					onChanged={replace}
					onOpenDeal={() => setDealFor(open)}
				/>
			)}
			{form && user && (
				<ContactFormDialog
					open
					contact={form.contact}
					stages={stages}
					developments={developments}
					people={people}
					isAdmin={isAdmin}
					meId={user.id}
					onClose={() => setForm(null)}
					onSaved={(c) => {
						setForm(null);
						if (form.contact) replace(c);
						else {
							setContacts((list) => [c, ...(list ?? [])]);
							setOpenId(c.id);
						}
					}}
				/>
			)}
			{transfer && (
				<TransferDialog
					contacts={transfer}
					people={people.filter((p) => isAdmin || p.id !== user?.id)}
					isAdmin={isAdmin}
					ownerName={userName}
					onClose={() => setTransfer(null)}
					onDone={() => {
						const leftMine = !isAdmin;
						setTransfer(null);
						setSelected(new Set());
						if (leftMine) setOpenId(null);
						load();
					}}
				/>
			)}
			<TicketFormDialog
				open={Boolean(dealFor)}
				onOpenChange={(o) => !o && setDealFor(null)}
				types={activeTypes}
				developments={developments}
				assignees={people}
				canAssign={isAdmin}
				defaultTypeId={dealTypeId}
				initial={dealInitial}
				onCreate={createDeal}
			/>
		</PageLayout>
	);
}

function Tile({ icon, label, value, tone, active, onClick }: { icon: ReactNode; label: string; value: number; tone?: string; active: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left shadow-sm transition-colors",
				active ? "border-brand ring-1 ring-brand ring-inset" : "border-border hover:border-brand/50",
			)}
		>
			<span className={cn("text-muted-foreground", tone)}>{icon}</span>
			<span className="flex flex-col">
				<span className={cn("font-semibold text-xl leading-tight", tone)}>{value}</span>
				<span className="text-muted-foreground text-xs">{label}</span>
			</span>
		</button>
	);
}
