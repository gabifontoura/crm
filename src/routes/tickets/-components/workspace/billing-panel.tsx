import { ArrowSquareOutIcon, CurrencyDollarIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import { cn } from "#/lib/utils";
import { formatMoney, installmentState, paidOf, planSummary, STATUS_LABEL } from "../../../../../shared/billing";
import { statusOf } from "../../../../../shared/tickets";
import { PlanDialog, SoldFacts, StatusPill, today, useBilling } from "../../../deals/-components/billing";
import { Panel, type Workspace } from "./shared";

const FIRST_ROWS = 6;

/**
 * A sold deal's billing, right on its ticket: what was bought (development,
 * block, unit), when and for how much, how the payments stand, and every
 * installment — or, once won, setting up the payment plan.
 */
export function BillingPanel({ ws }: { ws: Workspace }) {
	const { ticket, workflow, canWork, me } = ws;
	const { can } = useCurrentUser();
	const isDeal = workflow?.id === "wf-sales";
	const { plans, cadence, setPlans } = useBilling(isDeal ? me.id : undefined);
	const [setup, setSetup] = useState(false);
	const [all, setAll] = useState(false);
	if (!isDeal || !plans) return null;
	const plan = plans.find((p) => p.ticketId === ticket.id);
	const won = statusOf(workflow, ticket.statusId)?.category === "done";
	if (!plan && !won) return null;
	const t = today();

	return (
		<Panel
			title="Billing"
			icon={<CurrencyDollarIcon className="size-4" />}
			aside={
				plan ? (
					<Button size="sm" variant="secondary" asChild>
						<Link to="/deals" search={{ plan: plan.id }}>
							<ArrowSquareOutIcon className="size-4" /> Open payment plan
						</Link>
					</Button>
				) : null
			}
		>
			{plan ? (
				(() => {
					const s = planSummary(plan, cadence, t);
					const pct = plan.totalPrice ? Math.min(100, (s.paid / plan.totalPrice) * 100) : 0;
					const rows = [...plan.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
					// The late and the next ones matter most: start the short list at the first one not paid.
					const firstOpen = Math.max(0, rows.findIndex((i) => installmentState(i, cadence, t).status !== "paid"));
					const start = Math.max(0, Math.min(firstOpen - 1, rows.length - FIRST_ROWS));
					const shown = all ? rows : rows.slice(start, start + FIRST_ROWS);
					return (
						<div className="flex flex-col gap-4 text-sm">
							<SoldFacts plan={plan} />

							<div className="flex flex-col gap-1.5">
								<div className="flex flex-wrap justify-between gap-2">
									<span>
										<b>{formatMoney(s.paid)}</b> of {formatMoney(plan.totalPrice)} received · {formatMoney(s.open)} to receive
									</span>
									{s.overdue > 0 ? (
										<span className="font-medium text-destructive">
											{formatMoney(s.overdue)} overdue · {s.overdueCount} installment{s.overdueCount === 1 ? "" : "s"}
										</span>
									) : (
										<span className="text-emerald-700">{s.status === "paid_off" ? "Paid off" : "Up to date"}</span>
									)}
								</div>
								<div className="h-2 w-full rounded-full bg-muted">
									<div className={cn("h-2 rounded-full", s.overdue > 0 ? "bg-red-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
								</div>
							</div>

							{/* The installments */}
							<div className="overflow-hidden rounded-lg border border-border">
								<table className="w-full text-left text-sm">
									<thead className="border-border border-b bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
										<tr>
											<th className="px-3 py-2 font-semibold">Installment</th>
											<th className="px-3 py-2 font-semibold">Due</th>
											<th className="px-3 py-2 text-right font-semibold">Amount</th>
											<th className="px-3 py-2 text-right font-semibold">Paid</th>
											<th className="px-3 py-2 font-semibold">Status</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-border">
										{shown.map((i) => {
											const st = installmentState(i, cadence, t);
											return (
												<tr key={i.id} className={cn(st.status === "overdue" && "bg-red-50/60")}>
													<td className="px-3 py-2">{i.label}</td>
													<td className="px-3 py-2 text-xs">{dayjs(i.dueDate).format("MMM D, YYYY")}</td>
													<td className="px-3 py-2 text-right tabular-nums">{formatMoney(i.amount)}</td>
													<td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{paidOf(i) ? formatMoney(paidOf(i)) : "—"}</td>
													<td className="px-3 py-2">
														<StatusPill status={st.status} label={st.status === "overdue" ? `${STATUS_LABEL.overdue} · ${st.daysLate}d` : STATUS_LABEL[st.status]} />
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
								{rows.length > FIRST_ROWS && (
									<button type="button" onClick={() => setAll((v) => !v)} className="w-full border-border border-t px-3 py-2 text-center font-medium text-brand text-xs hover:bg-muted/40">
										{all ? "Show fewer" : `Show all ${rows.length} installments`}
									</button>
								)}
							</div>
						</div>
					);
				})()
			) : (
				<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
					<p className="text-muted-foreground">The deal is won. Set up the payment plan to start billing and the collection cadence.</p>
					{(canWork || me.role === "admin") && can("billing.plan") && (
						<Button size="sm" onClick={() => setSetup(true)}>
							<CurrencyDollarIcon className="size-4" /> Set up payment plan
						</Button>
					)}
				</div>
			)}
			{setup && (
				<PlanDialog
					deal={{ id: ticket.id, number: ticket.number, title: ticket.title }}
					suggestedPrice={typeof ticket.fields?.agreed_price === "number" ? ticket.fields.agreed_price : null}
					onClose={() => setSetup(false)}
					onCreated={(p) => {
						setSetup(false);
						setPlans((l) => [...(l ?? []), p]);
						ws.reload();
					}}
				/>
			)}
		</Panel>
	);
}
