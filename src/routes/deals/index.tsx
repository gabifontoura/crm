import {
	CalendarCheckIcon,
	ChatCircleTextIcon,
	CheckIcon,
	CopyIcon,
	CurrencyDollarIcon,
	EnvelopeSimpleIcon,
	EnvelopeIcon,
	FileTextIcon,
	HandshakeIcon,
	HourglassMediumIcon,
	ListChecksIcon,
	PhoneIcon,
	SkipForwardIcon,
	SlidersHorizontalIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageLayout } from "#/components/layout/page-layout";
import { PersonName } from "#/components/person/person-dialog";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { apiClient, errorMessage } from "#/lib/api/client";
import { useSession } from "#/lib/auth/session";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import { cn } from "#/lib/utils";
import {
	addDays,
	type BillingPlan,
	type Channel,
	CHANNELS,
	type DueStep,
	dueSteps,
	formatMoney,
	installmentState,
	planSummary,
} from "../../../shared/billing";
import { statusOf, type Ticket } from "../../../shared/tickets";
import { useTicketConfig } from "../tickets/-components/use-ticket-config";
import { InstallmentActionDialog, type InstallmentActionKind, PlanDialog, today, useBilling } from "./-components/billing";
import { AutomationPanel } from "./-components/automation-panel";
import { ContactTimeline } from "./-components/contact-timeline";
import { DealDialog } from "./-components/deal-dialog";

export const Route = createFileRoute("/deals/")({
	// `?plan=<id>` opens that payment plan (from a deal's ticket).
	validateSearch: (s: Record<string, unknown>): { plan?: string } => (typeof s.plan === "string" && s.plan ? { plan: s.plan } : {}),
	component: DealsPage,
});

const CHANNEL_ICON: Record<Channel, ReactNode> = {
	email: <EnvelopeSimpleIcon className="size-4" />,
	whatsapp: <ChatCircleTextIcon className="size-4" />,
	sms: <ChatCircleTextIcon className="size-4" />,
	call: <PhoneIcon className="size-4" />,
	letter: <EnvelopeIcon className="size-4" />,
	task: <ListChecksIcon className="size-4" />,
};

const AGING = [
	{ id: "1-30", label: "1–30 days", min: 1, max: 30 },
	{ id: "31-60", label: "31–60 days", min: 31, max: 60 },
	{ id: "61-90", label: "61–90 days", min: 61, max: 90 },
	{ id: "90+", label: "Over 90 days", min: 91, max: Number.POSITIVE_INFINITY },
];

/**
 * Deals: what's sold and how it's being paid. The cadence ("régua") puts the
 * right touchpoint in front of the team each day — reminders before a due
 * date, calls and notices after — and everything done is logged on the deal
 * and on the customer's history.
 */
function DealsPage() {
	const { user, can } = useCurrentUser();
	const { users } = useSession();
	const config = useTicketConfig(user?.id);
	const { plans, cadence, setPlans, reload } = useBilling(user?.id);
	const [tickets, setTickets] = useState<Ticket[]>([]);
	const [tab, setTab] = useState<"today" | "deals" | "timeline" | "automation" | "aging">("today");
	const search = Route.useSearch();
	const [openPlan, setOpenPlan] = useState<string | null>(search.plan ?? null);
	const [setup, setSetup] = useState<Ticket | null>(null);
	const [action, setAction] = useState<{ due: DueStep; kind: InstallmentActionKind } | null>(null);
	const t = today();

	useEffect(() => {
		if (user) apiClient.get<Ticket[]>("/api/tickets").then(setTickets).catch(() => setTickets([]));
	}, [user]);

	const userName = (id: string | null | undefined) => (id ? (users.find((u) => u.id === id)?.name ?? "Former member") : "Unassigned");
	const ticketOf = (id: string) => tickets.find((x) => x.id === id);
	// Recording payments, promises and cadence steps: an access switch (Settings > Menu by access) on top of who sold it.
	const canManage = (p: BillingPlan) => (user?.role === "admin" || ticketOf(p.ticketId)?.assigneeId === user?.id) && can("billing.record");
	const replace = (p: BillingPlan) => setPlans((list) => (list ?? []).map((x) => (x.id === p.id ? p : x)));

	const all = plans ?? [];
	const queue = useMemo(() => dueSteps(all, cadence, t), [all, cadence, t]);
	const contacts = useMemo(() => all.reduce((n, p) => n + p.installments.reduce((m, i) => m + i.steps.length, 0), 0), [all]);

	// Portfolio numbers
	const stats = useMemo(() => {
		let receivable = 0;
		let overdue = 0;
		let receivedMonth = 0;
		let next30 = 0;
		let dueTotal = 0;
		const aging = Object.fromEntries(AGING.map((a) => [a.id, { amount: 0, count: 0 }]));
		const month = t.slice(0, 7);
		for (const p of all) {
			for (const i of p.installments) {
				const s = installmentState(i, cadence, t);
				receivable += s.open;
				for (const pay of i.payments) if (pay.at.slice(0, 7) === month) receivedMonth += pay.amount;
				if (i.dueDate <= t && !i.cancelled) dueTotal += i.amount;
				if ((s.status === "overdue" || s.status === "promised") && s.open > 0) {
					overdue += s.open;
					const b = AGING.find((a) => s.daysLate >= a.min && s.daysLate <= a.max);
					if (b) {
						aging[b.id].amount += s.open;
						aging[b.id].count++;
					}
				}
				if (s.open > 0 && i.dueDate > t && i.dueDate <= addDays(t, 30)) next30 += s.open;
			}
		}
		return { receivable, overdue, receivedMonth, next30, defaultRate: dueTotal ? (overdue / dueTotal) * 100 : 0, aging };
	}, [all, cadence, t]);

	// Won deals that don't have a plan yet.
	const readyToBill = tickets.filter((x) => {
		const st = statusOf(config.workflowOf(x.typeId), x.statusId);
		return config.workflowOf(x.typeId)?.id === "wf-sales" && st?.category === "done" && x.requester.email && !x.parentId && !all.some((p) => p.ticketId === x.id);
	});
	const plan = openPlan ? all.find((p) => p.id === openPlan) : undefined;

	return (
		<PageLayout
			title="Deals"
			subtitle="What's sold, how it's being paid, and who to contact today"
			breadcrumbs={[{ label: "Customers" }, { label: "Deals" }]}
			actions={
				user?.role === "admin" && (
					<Button variant="secondary" size="sm" asChild>
						<Link to="/settings" search={{ section: "billing" }}>
							<SlidersHorizontalIcon className="size-4" /> Billing cadence
						</Link>
					</Button>
				)
			}
		>
			<div className="flex flex-col gap-4 py-4">
				<div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
					<Tile icon={<CurrencyDollarIcon className="size-5" />} label="To receive" value={formatMoney(stats.receivable)} />
					<Tile icon={<WarningIcon className="size-5" />} label="Overdue" value={formatMoney(stats.overdue)} tone="text-destructive" />
					<Tile icon={<CheckIcon className="size-5" />} label="Received this month" value={formatMoney(stats.receivedMonth)} tone="text-emerald-700" />
					<Tile icon={<CalendarCheckIcon className="size-5" />} label="Due in the next 30 days" value={formatMoney(stats.next30)} />
					<Tile icon={<HourglassMediumIcon className="size-5" />} label="Default rate" value={`${stats.defaultRate.toFixed(1)}%`} hint="Overdue ÷ everything due so far" />
				</div>

				{/* Same switch as the views on Tickets, Contacts and the Calendar. */}
				<div className="flex flex-wrap items-center gap-1" role="group" aria-label="Show">
					{(
						[
							["today", `Today's actions · ${queue.length}`],
							["deals", `Deals · ${all.length}`],
							["timeline", `Collections timeline · ${contacts}`],
			["automation", `Message automation · ${cadence.steps.filter((s) => s.auto).length} automatic`],
							["aging", "Aging"],
						] as const
					).map(([id, label]) => (
						<Button key={id} size="sm" variant={tab === id ? "default" : "secondary"} aria-pressed={tab === id} onClick={() => setTab(id)}>
							{label}
						</Button>
					))}
				</div>

				{plans === null ? (
					<p className="py-12 text-center text-muted-foreground text-sm">Loading…</p>
				) : tab === "today" ? (
					queue.length === 0 ? (
						<div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground text-sm">Nothing on the cadence today. Everyone is on track.</div>
					) : (
						<ul className="flex flex-col gap-2">
							{queue.map((d) => (
								<StepRow
									key={`${d.installment.id}-${d.step.id}`}
									d={d}
									manage={canManage(d.plan)}
									onOpen={() => setOpenPlan(d.plan.id)}
									onAction={(kind) => setAction({ due: d, kind })}
									onLogged={replace}
								/>
							))}
						</ul>
					)
				) : tab === "automation" ? (
					<AutomationPanel plans={all} cadence={cadence} isAdmin={user?.role === "admin"} onChanged={reload} />
				) : tab === "timeline" ? (
					<ContactTimeline plans={all} cadence={cadence} userName={userName} onOpenPlan={setOpenPlan} />
				) : tab === "deals" ? (
					<div className="flex flex-col gap-3">
						{readyToBill.length > 0 && (
							<div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
								<p className="mb-2 font-medium text-amber-900 text-sm">Won deals without a payment plan</p>
								<ul className="flex flex-col gap-1">
									{readyToBill.map((x) => (
										<li key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
											<span>
												#{x.number} {x.title} · <PersonName person={{ kind: "customer", name: x.requester.name, email: x.requester.email }}>{x.requester.name}</PersonName>
											</span>
											{(user?.role === "admin" || x.assigneeId === user?.id) && can("billing.plan") && (
												<Button size="sm" className="h-7" onClick={() => setSetup(x)}>
													Set up payment plan
												</Button>
											)}
										</li>
									))}
								</ul>
							</div>
						)}
						<div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
							<table className="w-full text-sm">
								<thead className="border-border border-b bg-muted/40 text-left text-muted-foreground text-xs">
									<tr>
										<th className="px-3 py-2 font-semibold">Customer</th>
										<th className="px-3 py-2 font-semibold">Property</th>
										<th className="px-3 py-2 font-semibold">Bought on</th>
										<th className="px-3 py-2 font-semibold">Deal</th>
										<th className="px-3 py-2 font-semibold">Paid</th>
										<th className="px-3 py-2 text-right font-semibold">To receive</th>
										<th className="px-3 py-2 text-right font-semibold">Overdue</th>
										<th className="px-3 py-2 font-semibold">Next due</th>
										<th className="px-3 py-2 font-semibold">Seller</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{all.map((p) => {
										const s = planSummary(p, cadence, t);
										const pct = p.totalPrice ? (s.paid / p.totalPrice) * 100 : 0;
										const seller = ticketOf(p.ticketId)?.assigneeId;
										return (
											<tr key={p.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setOpenPlan(p.id)}>
												<td className="px-3 py-2">
													<PersonName person={{ kind: "customer", name: p.customer.name, email: p.customer.email }}>{p.customer.name}</PersonName>
												</td>
												<td className="px-3 py-2 text-xs">
													<span className="block font-medium">{p.sold?.development || p.property}</span>
													{p.sold && (p.sold.block || p.sold.unit) && <span className="text-muted-foreground">{[p.sold.block, p.sold.unit && (/^\d/.test(p.sold.unit) ? `Unit ${p.sold.unit}` : p.sold.unit)].filter(Boolean).join(" · ")}</span>}
												</td>
												<td className="whitespace-nowrap px-3 py-2 text-xs">{p.purchasedOn ? dayjs(p.purchasedOn).format("MMM D, YYYY") : "—"}</td>
												<td className="px-3 py-2 text-xs">
													#{p.ticketNumber} · {formatMoney(p.totalPrice)}
												</td>
												<td className="min-w-32 px-3 py-2">
													<div className="h-1.5 w-full rounded-full bg-muted">
														<div className={cn("h-1.5 rounded-full", s.status === "overdue" ? "bg-red-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, pct)}%` }} />
													</div>
													<span className="text-muted-foreground text-xs">{Math.round(pct)}%</span>
												</td>
												<td className="px-3 py-2 text-right tabular-nums">{formatMoney(s.open)}</td>
												<td className={cn("px-3 py-2 text-right tabular-nums", s.overdue > 0 && "font-medium text-destructive")}>{s.overdue ? formatMoney(s.overdue) : "—"}</td>
												<td className="whitespace-nowrap px-3 py-2 text-xs">{s.next ? `${dayjs(s.next.dueDate).format("MMM D, YYYY")} · ${formatMoney(s.next.amount)}` : "Paid off"}</td>
												<td className="px-3 py-2 text-xs">{seller ? <PersonName person={{ kind: "member", id: seller }}>{userName(seller)}</PersonName> : "—"}</td>
											</tr>
										);
									})}
								</tbody>
							</table>
							{all.length === 0 && <p className="p-6 text-center text-muted-foreground text-sm">No payment plans yet.</p>}
						</div>
					</div>
				) : (
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
						{AGING.map((a) => {
							const b = stats.aging[a.id];
							const share = stats.overdue ? (b.amount / stats.overdue) * 100 : 0;
							return (
								<div key={a.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm">
									<span className="text-muted-foreground text-xs">Late {a.label}</span>
									<span className="font-semibold text-xl tabular-nums">{formatMoney(b.amount)}</span>
									<span className="text-muted-foreground text-xs">
										{b.count} installment{b.count === 1 ? "" : "s"} · {Math.round(share)}% of overdue
									</span>
									<div className="h-1.5 w-full rounded-full bg-muted">
										<div className="h-1.5 rounded-full bg-red-500" style={{ width: `${share}%` }} />
									</div>
								</div>
							);
						})}
						<p className="text-muted-foreground text-xs sm:col-span-2 lg:col-span-4">
							Overdue amounts by how late they are. Late fee {cadence.lateFeePct}% and interest {cadence.interestPctMonth}% a month apply
							{cadence.graceDays ? ` after ${cadence.graceDays} days` : ""}.
						</p>
					</div>
				)}
			</div>

			{plan && (
				<DealDialog plan={plan} cadence={cadence} canManage={canManage(plan)} userName={userName} onClose={() => setOpenPlan(null)} onChanged={replace} />
			)}
			{setup && (
				<PlanDialog
					deal={{ id: setup.id, number: setup.number, title: setup.title }}
					suggestedPrice={typeof setup.fields?.agreed_price === "number" ? setup.fields.agreed_price : null}
					onClose={() => setSetup(null)}
					onCreated={(p) => {
						setSetup(null);
						setPlans((l) => [...(l ?? []), p]);
						setOpenPlan(p.id);
					}}
				/>
			)}
			{action && (
				<InstallmentActionDialog
					plan={action.due.plan}
					installment={action.due.installment}
					kind={action.kind}
					openAmount={Math.round((action.due.state.open + action.due.state.charges) * 100) / 100}
					onClose={() => setAction(null)}
					onDone={(p) => {
						setAction(null);
						replace(p);
					}}
				/>
			)}
		</PageLayout>
	);
}

/** One cadence action due today: the message ready to send, and what to log. */
function StepRow({
	d,
	manage,
	onOpen,
	onAction,
	onLogged,
}: {
	d: DueStep;
	manage: boolean;
	onOpen: () => void;
	onAction: (kind: InstallmentActionKind) => void;
	onLogged: (p: BillingPlan) => void;
}) {
	const [note, setNote] = useState("");
	const [saving, setSaving] = useState(false);
	const { plan, installment: i, state: s, step } = d;
	const channel = CHANNELS.find((c) => c.id === step.channel)?.label ?? step.channel;
	const phone = plan.customer.phone.replace(/[^\d]/g, "");
	const subject = `${i.label} · ${plan.property || `deal #${plan.ticketNumber}`}`;

	async function log(outcome: "done" | "skipped") {
		setSaving(true);
		try {
			const p = await apiClient.post<BillingPlan>(`/api/billing/${encodeURIComponent(plan.id)}/installments/${encodeURIComponent(i.id)}/step`, { stepId: step.id, outcome, note: note.trim() });
			toast.success(outcome === "done" ? `${channel} logged` : "Skipped", { description: `${plan.customer.name} · ${i.label}` });
			onLogged(p);
		} catch (e) {
			toast.error(errorMessage(e));
			setSaving(false);
		}
	}

	return (
		<li className={cn("flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm", s.daysLate > 0 ? "border-red-200" : "border-border")}>
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="flex min-w-0 items-start gap-2">
					<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">{CHANNEL_ICON[step.channel]}</span>
					<div className="min-w-0">
						<p className="font-medium text-sm">
							{channel} · {step.title}{" "}
							<span className="font-normal text-muted-foreground">
								— <PersonName person={{ kind: "customer", name: plan.customer.name, email: plan.customer.email }}>{plan.customer.name}</PersonName>
							</span>
						</p>
						<p className="text-muted-foreground text-xs">
							<button type="button" onClick={onOpen} className="hover:text-brand hover:underline">
								{i.label} · deal #{plan.ticketNumber}
							</button>{" "}
							· {formatMoney(s.open)}
							{s.charges > 0 && ` + ${formatMoney(s.charges)} fees`} ·{" "}
							<span className={cn(s.daysLate > 0 && "font-medium text-destructive")}>
								{s.daysLate > 0 ? `${s.daysLate} days late` : s.daysLate === 0 ? "due today" : `due in ${-s.daysLate} days`}
							</span>
						</p>
					</div>
				</div>
				{manage && (
					<div className="flex flex-wrap gap-1">
						<Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onAction("payment")}>
							<CurrencyDollarIcon className="size-4" /> Payment
						</Button>
						<Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onAction("promise")}>
							<HandshakeIcon className="size-4" /> Promise
						</Button>
					</div>
				)}
			</div>
			<div className="flex flex-col gap-2 rounded-md bg-muted/30 p-2 text-sm">
				<p className="whitespace-pre-wrap">{d.message}</p>
				<div className="flex flex-wrap items-center gap-1.5">
					<Button
						size="sm"
						variant="secondary"
						className="h-7 px-2 text-xs"
						onClick={() => navigator.clipboard.writeText(d.message).then(() => toast("Message copied"))}
					>
						<CopyIcon className="size-3.5" /> Copy
					</Button>
					{plan.customer.email && (step.channel === "email" || step.channel === "letter") && (
						<Button size="sm" variant="secondary" className="h-7 px-2 text-xs" asChild>
							<a href={`mailto:${plan.customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(d.message)}`}>
								<EnvelopeSimpleIcon className="size-3.5" /> Email
							</a>
						</Button>
					)}
					{phone && (step.channel === "whatsapp" || step.channel === "sms") && (
						<Button size="sm" variant="secondary" className="h-7 px-2 text-xs" asChild>
							<a href={`https://wa.me/${phone}?text=${encodeURIComponent(d.message)}`} target="_blank" rel="noreferrer">
								<ChatCircleTextIcon className="size-3.5" /> WhatsApp
							</a>
						</Button>
					)}
					{phone && step.channel === "call" && (
						<Button size="sm" variant="secondary" className="h-7 px-2 text-xs" asChild>
							<a href={`tel:+${phone}`}>
								<PhoneIcon className="size-3.5" /> Call {plan.customer.phone}
							</a>
						</Button>
					)}
					{step.channel === "letter" && (
						<Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => printLetter(plan.customer.name, subject, d.message)}>
							<FileTextIcon className="size-3.5" /> Print letter
						</Button>
					)}
				</div>
			</div>
			{manage && (
				<div className="flex flex-wrap items-center gap-2">
					<Input className="h-8 min-w-48 flex-1 text-sm" placeholder="What happened (optional): answered, left a message, will pay Friday…" value={note} onChange={(e) => setNote(e.target.value)} />
					<Button size="sm" className="h-8" disabled={saving} onClick={() => log("done")}>
						<CheckIcon className="size-4" /> Done
					</Button>
					<Button size="sm" variant="ghost" className="h-8 text-muted-foreground" disabled={saving} onClick={() => log("skipped")}>
						<SkipForwardIcon className="size-4" /> Skip
					</Button>
				</div>
			)}
		</li>
	);
}

/** Opens the formal notice ready to print (or save as PDF). */
function printLetter(name: string, subject: string, body: string) {
	const w = window.open("", "_blank", "width=720,height=900");
	if (!w) return;
	const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
	w.document.write(
		`<!doctype html><title>${esc(subject)}</title><body style="font:15px/1.6 Georgia,serif;max-width:600px;margin:60px auto;color:#111"><p>${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p><p>To: ${esc(name)}</p><p><b>Re: ${esc(subject)}</b></p><p>${esc(body).replace(/\n/g, "<br>")}</p><p style="margin-top:48px">Sincerely,<br>Accounts receivable</p></body>`,
	);
	w.document.close();
	w.focus();
	w.print();
}

function Tile({ icon, label, value, tone, hint }: { icon: ReactNode; label: string; value: string; tone?: string; hint?: string }) {
	return (
		<div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm" title={hint}>
			<span className={cn("text-muted-foreground", tone)}>{icon}</span>
			<span className="flex min-w-0 flex-col">
				<span className={cn("truncate font-semibold text-lg leading-tight tabular-nums", tone)}>{value}</span>
				<span className="text-muted-foreground text-xs">{label}</span>
			</span>
		</div>
	);
}
