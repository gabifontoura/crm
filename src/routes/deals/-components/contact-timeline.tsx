import {
	CaretDownIcon,
	ChatCircleTextIcon,
	EnvelopeIcon,
	EnvelopeSimpleIcon,
	type Icon,
	LightningIcon,
	ListChecksIcon,
	MagnifyingGlassIcon,
	PhoneIcon,
	WhatsappLogoIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { FilterChip } from "#/components/ui/filter-chip";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { cn } from "#/lib/utils";
import { type BillingPlan, type CadenceSettings, type Channel, CHANNELS, type ContactEntry, contactTimeline, formatMoney } from "../../../../shared/billing";

/** Each channel's icon and color, used on the dots, chips and message previews. */
export const CHANNEL_LOOK: Record<Channel, { icon: Icon; dot: string; label: string }> = {
	email: { icon: EnvelopeSimpleIcon, dot: "bg-sky-100 text-sky-700 ring-sky-200", label: "Email" },
	sms: { icon: ChatCircleTextIcon, dot: "bg-violet-100 text-violet-700 ring-violet-200", label: "SMS" },
	whatsapp: { icon: WhatsappLogoIcon, dot: "bg-emerald-100 text-emerald-700 ring-emerald-200", label: "WhatsApp" },
	call: { icon: PhoneIcon, dot: "bg-amber-100 text-amber-800 ring-amber-200", label: "Call" },
	letter: { icon: EnvelopeIcon, dot: "bg-slate-100 text-slate-700 ring-slate-200", label: "Formal letter" },
	task: { icon: ListChecksIcon, dot: "bg-slate-100 text-slate-600 ring-slate-200", label: "Internal task" },
};

type Period = "7" | "30" | "90" | "all";
type Outcome = "all" | "done" | "skipped";
type Group = "day" | "deal";
type Source = "all" | "auto" | "team";
interface Prefs {
	channels: Channel[];
	period: Period;
	outcome: Outcome;
	group: Group;
	source: Source;
}
const DEFAULT_PREFS: Prefs = { channels: CHANNELS.map((c) => c.id), period: "90", outcome: "all", group: "day", source: "all" };
const LS_KEY = "deals.timeline.v1";

function loadPrefs(): Prefs {
	try {
		const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? "null");
		if (raw && typeof raw === "object") return { ...DEFAULT_PREFS, ...raw };
	} catch {
		/* private mode or blocked storage: the defaults */
	}
	return DEFAULT_PREFS;
}

/**
 * The collection contacts made on the deals — how many, on which channel —
 * with each message as it was sent. Filters and grouping are the viewer's
 * own, remembered in this browser.
 */
export function ContactTimeline({
	plans,
	cadence,
	userName,
	onOpenPlan,
	compact = false,
}: {
	plans: BillingPlan[];
	cadence: CadenceSettings;
	userName: (id: string | null | undefined) => string;
	onOpenPlan?: (planId: string) => void;
	/** Inside a deal: no deal grouping or search. */
	compact?: boolean;
}) {
	const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState<string | null>(null);
	useEffect(() => {
		try {
			localStorage.setItem(LS_KEY, JSON.stringify(prefs));
		} catch {
			/* not remembered, still works */
		}
	}, [prefs]);
	const set = (patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch }));

	const all = useMemo(() => contactTimeline(plans, cadence), [plans, cadence]);
	// Everything but the channel filter, so the channel counts stay meaningful.
	const scoped = useMemo(() => {
		const since = prefs.period === "all" ? "" : dayjs().subtract(Number(prefs.period), "day").format("YYYY-MM-DD");
		const q = query.trim().toLowerCase();
		return all.filter(
			(e) =>
				(!since || e.at.slice(0, 10) >= since) &&
				(prefs.outcome === "all" || e.outcome === prefs.outcome) &&
				(prefs.source === "all" || (prefs.source === "auto") === e.auto) &&
				(!q || `${e.plan.customer.name} ${e.plan.property} #${e.plan.ticketNumber}`.toLowerCase().includes(q)),
		);
	}, [all, prefs.period, prefs.outcome, prefs.source, query]);
	const shown = scoped.filter((e) => prefs.channels.includes(e.channel));
	const countOf = (c: Channel) => scoped.filter((e) => e.channel === c).length;
	const used = CHANNELS.filter((c) => all.some((e) => e.channel === c.id));

	const groups = useMemo(() => {
		const map = new Map<string, { label: string; sub?: string; planId?: string; items: ContactEntry[] }>();
		for (const e of shown) {
			const key = prefs.group === "deal" && !compact ? e.plan.id : e.at.slice(0, 10);
			if (!map.has(key)) {
				map.set(
					key,
					prefs.group === "deal" && !compact
						? { label: e.plan.customer.name, sub: `#${e.plan.ticketNumber} · ${e.plan.property}`, planId: e.plan.id, items: [] }
						: { label: dayjs(e.at).format("dddd, MMM D, YYYY"), items: [] },
				);
			}
			map.get(key)!.items.push(e);
		}
		return [...map.values()];
	}, [shown, prefs.group, compact]);

	const toggleChannel = (c: Channel) =>
		set({ channels: prefs.channels.includes(c) ? prefs.channels.filter((x) => x !== c) : [...prefs.channels, c] });

	return (
		<div className="flex flex-col gap-3">
			{/* How many contacts, per channel (click to show or hide one) */}
			<div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Channels">
				<span className="mr-1 text-muted-foreground text-sm">
					<b className="text-foreground">{shown.length}</b> contact{shown.length === 1 ? "" : "s"}
				</span>
				{used.map((c) => (
					<FilterChip key={c.id} label={c.label} icon={CHANNEL_LOOK[c.id].icon} count={countOf(c.id)} active={prefs.channels.includes(c.id)} onClick={() => toggleChannel(c.id)} />
				))}
			</div>

			<div className="flex flex-wrap items-center gap-2">
				{!compact && (
					<div className="relative w-full sm:w-64">
						<MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input aria-label="Search customer or deal" className="h-9 pl-9" placeholder="Customer or deal" value={query} onChange={(e) => setQuery(e.target.value)} />
					</div>
				)}
				<Select value={prefs.period} onValueChange={(v) => set({ period: v as Period })}>
					<SelectTrigger aria-label="Period" className="h-9 w-40">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="7">Last 7 days</SelectItem>
						<SelectItem value="30">Last 30 days</SelectItem>
						<SelectItem value="90">Last 90 days</SelectItem>
						<SelectItem value="all">All time</SelectItem>
					</SelectContent>
				</Select>
				<Select value={prefs.outcome} onValueChange={(v) => set({ outcome: v as Outcome })}>
					<SelectTrigger aria-label="Result" className="h-9 w-40">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Done and skipped</SelectItem>
						<SelectItem value="done">Done only</SelectItem>
						<SelectItem value="skipped">Skipped only</SelectItem>
					</SelectContent>
				</Select>
				<Select value={prefs.source} onValueChange={(v) => set({ source: v as Source })}>
					<SelectTrigger aria-label="Sent by" className="h-9 w-44">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Team and automatic</SelectItem>
						<SelectItem value="auto">Automatic only</SelectItem>
						<SelectItem value="team">By the team only</SelectItem>
					</SelectContent>
				</Select>
				{!compact && (
					<Select value={prefs.group} onValueChange={(v) => set({ group: v as Group })}>
						<SelectTrigger aria-label="Group by" className="h-9 w-40">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="day">Group by day</SelectItem>
							<SelectItem value="deal">Group by deal</SelectItem>
						</SelectContent>
					</Select>
				)}
				{JSON.stringify(prefs) !== JSON.stringify(DEFAULT_PREFS) && (
					<button type="button" onClick={() => setPrefs(DEFAULT_PREFS)} className="font-medium text-brand text-sm hover:underline">
						Reset
					</button>
				)}
			</div>

			{groups.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground text-sm">No contacts match these filters.</div>
			) : (
				<div className="flex flex-col gap-4">
					{groups.map((g) => (
						<section key={g.label + (g.sub ?? "")} className="flex flex-col gap-2">
							<header className="flex flex-wrap items-baseline justify-between gap-2">
								<h3 className="font-semibold text-sm">
									{g.planId && onOpenPlan ? (
										<button type="button" className="hover:text-brand hover:underline" onClick={() => onOpenPlan(g.planId!)}>
											{g.label}
										</button>
									) : (
										g.label
									)}
									{g.sub && <span className="ml-2 font-normal text-muted-foreground text-xs">{g.sub}</span>}
								</h3>
								<span className="text-muted-foreground text-xs">
									{g.items.length} contact{g.items.length === 1 ? "" : "s"}
									{prefs.group === "deal" && !compact && ` · ${channelSummary(g.items)}`}
								</span>
							</header>
							<ol className="relative flex flex-col gap-2 border-border border-l pl-5">
								{g.items.map((e) => (
									<Entry key={e.id} e={e} open={open === e.id} onToggle={() => setOpen((o) => (o === e.id ? null : e.id))} userName={userName} showDeal={prefs.group === "day" && !compact} />
								))}
							</ol>
						</section>
					))}
				</div>
			)}
		</div>
	);
}

function channelSummary(items: ContactEntry[]) {
	return CHANNELS.map((c) => [c, items.filter((e) => e.channel === c.id).length] as const)
		.filter(([, n]) => n)
		.map(([c, n]) => `${n} ${c.label.toLowerCase()}`)
		.join(", ");
}

function Entry({ e, open, onToggle, userName, showDeal }: { e: ContactEntry; open: boolean; onToggle: () => void; userName: (id: string) => string; showDeal: boolean }) {
	const look = CHANNEL_LOOK[e.channel];
	const I = look.icon;
	const skipped = e.outcome === "skipped";
	return (
		<li className="relative">
			<span className={cn("absolute top-2 -left-[33px] flex size-6 items-center justify-center rounded-full ring-2 ring-card", look.dot, skipped && "opacity-50")}>
				<I className="size-3.5" weight="bold" />
			</span>
			<div className={cn("rounded-lg border border-border bg-card", skipped && "bg-muted/30")}>
				<button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2.5 text-left">
					<span className="min-w-0">
						<span className="flex flex-wrap items-center gap-1.5">
							<span className="font-medium text-sm">{e.title}</span>
							<span className={cn("rounded-md px-1.5 py-0.5 font-medium text-[11px] ring-1 ring-inset", look.dot)}>{look.label}</span>
							{skipped && <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-[11px] text-muted-foreground">Skipped</span>}
							{e.auto && <DeliveryBadge e={e} />}
						</span>
						<span className="block text-muted-foreground text-xs">
							{showDeal && (
								<>
									{e.plan.customer.name} · #{e.plan.ticketNumber} ·{" "}
								</>
							)}
							{e.installment.label} ({formatMoney(e.installment.amount)}, due {dayjs(e.installment.dueDate).format("MMM D")})
						</span>
					</span>
					<span className="flex items-center gap-2 text-muted-foreground text-xs">
						<span title={dayjs(e.at).format("MMM D, YYYY h:mm A")}>
							{dayjs(e.at).format("MMM D, h:mm A")} · {e.auto ? "Sent by the CRM" : userName(e.byId)}
						</span>
						<CaretDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} />
					</span>
				</button>
				{open && (
					<div className="flex flex-col gap-2 border-border border-t px-3 py-3">
						<MessagePreview e={e} />
						{e.note && (
							<p className="text-sm">
								<span className="font-medium">{skipped ? "Why it was skipped" : e.channel === "call" ? "Result" : "Note"}:</span> {e.note}
							</p>
						)}
					</div>
				)}
			</div>
		</li>
	);
}

/** The message as the customer got it, in the shape of its channel. */
function MessagePreview({ e }: { e: ContactEntry }) {
	if (!e.message) return <p className="text-muted-foreground text-sm">No message recorded.</p>;
	const time = dayjs(e.at).format("h:mm A");
	switch (e.channel) {
		case "email":
			return (
				<div className="overflow-hidden rounded-md border border-border text-sm">
					<dl className="grid grid-cols-[4rem_1fr] gap-x-2 gap-y-0.5 border-border border-b bg-muted/30 px-3 py-2 text-xs">
						<dt className="text-muted-foreground">To</dt>
						<dd className="break-all">{e.to || "—"}</dd>
						<dt className="text-muted-foreground">Subject</dt>
						<dd>
							{e.title} · {e.installment.label}
						</dd>
					</dl>
					<p className="whitespace-pre-wrap px-3 py-3 leading-relaxed">{e.message}</p>
				</div>
			);
		case "sms":
		case "whatsapp":
			return (
				<div className={cn("flex flex-col gap-1 rounded-md p-3", e.channel === "whatsapp" ? "bg-emerald-50" : "bg-slate-50")}>
					<span className="text-muted-foreground text-xs">To {e.to || "—"}</span>
					<div className={cn("max-w-md self-end rounded-2xl rounded-br-sm px-3 py-2 text-sm shadow-sm", e.channel === "whatsapp" ? "bg-emerald-200/70" : "bg-brand text-white")}>
						<p className="whitespace-pre-wrap">{e.message}</p>
						<p className={cn("mt-1 text-right text-[10px]", e.channel === "whatsapp" ? "text-emerald-900/60" : "text-white/70")}>{time}</p>
					</div>
				</div>
			);
		case "call":
			return (
				<div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm">
					<p className="mb-1 font-medium text-amber-900 text-xs uppercase tracking-wide">Call script · {e.to || "—"}</p>
					<p className="whitespace-pre-wrap">{e.message}</p>
				</div>
			);
		case "letter":
			return (
				<div className="rounded-md border border-border bg-[#fcfbf7] px-5 py-4 font-serif text-sm leading-relaxed shadow-sm">
					<p className="mb-2 text-muted-foreground text-xs">{dayjs(e.at).format("MMMM D, YYYY")}</p>
					<p className="whitespace-pre-wrap">{e.message}</p>
				</div>
			);
		default:
			return <p className="whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-sm">{e.message}</p>;
	}
}

/** Automatic sends: whether the message really went out. */
function DeliveryBadge({ e }: { e: ContactEntry }) {
	const look =
		e.delivery === "sent"
			? { label: "Automatic · sent", className: "bg-emerald-50 text-emerald-800 ring-emerald-200", hint: "" }
			: e.delivery === "failed"
				? { label: "Automatic · not sent", className: "bg-red-50 text-red-800 ring-red-200", hint: e.error ?? "" }
				: { label: "Automatic · simulated", className: "bg-slate-100 text-slate-700 ring-slate-200", hint: "No email, SMS or WhatsApp service is set up yet: it was only recorded here." };
	return (
		<span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[11px] ring-1 ring-inset", look.className)} title={look.hint || undefined}>
			<LightningIcon weight="fill" className="size-3" />
			{look.label}
		</span>
	);
}
