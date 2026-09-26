import { ArrowSquareOutIcon, CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { Fragment, useState } from "react";
import { PersonName } from "#/components/person/person-dialog";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { cn } from "#/lib/utils";
import {
	type BillingPlan,
	type CadenceSettings,
	CHANNELS,
	formatMoney,
	type Installment,
	installmentState,
	planSummary,
	STATUS_LABEL,
	soldLabel,
} from "../../../../shared/billing";
import { InstallmentActionDialog, type InstallmentActionKind, SoldFacts, StatusPill, today } from "./billing";
import { ContactTimeline } from "./contact-timeline";

/** One deal's payment plan: where it stands and every installment, with its payments and cadence. */
export function DealDialog({
	plan,
	cadence,
	canManage,
	userName,
	onClose,
	onChanged,
}: {
	plan: BillingPlan;
	cadence: CadenceSettings;
	canManage: boolean;
	userName: (id: string | null | undefined) => string;
	onClose: () => void;
	onChanged: (p: BillingPlan) => void;
}) {
	const t = today();
	const sum = planSummary(plan, cadence, t);
	const [open, setOpen] = useState<string | null>(null);
	const [action, setAction] = useState<{ inst: Installment; kind: InstallmentActionKind } | null>(null);
	const pct = plan.totalPrice ? Math.min(100, (sum.paid / plan.totalPrice) * 100) : 0;

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="!flex !max-h-[92vh] !max-w-[95vw] flex-col !gap-0 !p-0 lg:!max-w-4xl">
				<div className="flex flex-wrap items-start justify-between gap-3 border-b px-6 pt-6 pb-4">
					<div className="min-w-0">
						<DialogTitle>
							<PersonName person={{ kind: "customer", name: plan.customer.name, email: plan.customer.email }}>{plan.customer.name}</PersonName>
						</DialogTitle>
						<DialogDescription className="mt-1">
							Deal #{plan.ticketNumber} · {soldLabel(plan)} · {formatMoney(plan.totalPrice)}
						</DialogDescription>
					</div>
					<Button size="sm" variant="secondary" asChild>
						<Link to="/tickets/$ticketNumber" params={{ ticketNumber: String(plan.ticketNumber) }} onClick={onClose}>
							<ArrowSquareOutIcon className="size-4" /> Open the deal
						</Link>
					</Button>
				</div>

				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
					<SoldFacts plan={plan} className="border-b px-6 py-3" />
					<div className="flex flex-col gap-2 border-b px-6 py-3">
						<div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
							<Fact label="Received" value={formatMoney(sum.paid)} />
							<Fact label="Still to receive" value={formatMoney(sum.open)} />
							<Fact label="Overdue" value={formatMoney(sum.overdue)} tone={sum.overdue > 0 ? "text-destructive" : undefined} sub={sum.overdueCount ? `${sum.overdueCount} installment(s)` : undefined} />
							<Fact label="Late fees & interest" value={formatMoney(sum.charges)} />
						</div>
						<div className="h-2 w-full rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Paid">
							<div className="h-2 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
						</div>
						<p className="text-muted-foreground text-xs">
							{Math.round(pct)}% paid{sum.next ? ` · next: ${sum.next.label} on ${dayjs(sum.next.dueDate).format("MMM D, YYYY")}` : ""}
						</p>
					</div>

					<table className="w-full text-sm">
						<thead className="border-border border-b bg-muted/40 text-left text-muted-foreground text-xs">
							<tr>
								<th className="w-8" />
								<th className="px-2 py-2 font-semibold">Installment</th>
								<th className="px-2 py-2 font-semibold">Due</th>
								<th className="px-2 py-2 text-right font-semibold">Amount</th>
								<th className="px-2 py-2 text-right font-semibold">Paid</th>
								<th className="px-2 py-2 font-semibold">Status</th>
								{canManage && <th className="px-2 py-2" />}
							</tr>
						</thead>
						<tbody>
							{plan.installments.map((i) => {
								const s = installmentState(i, cadence, t);
								const expanded = open === i.id;
								const late = s.status === "overdue" || s.status === "promised";
								return (
									<Fragment key={i.id}>
										<tr className={cn("border-border border-t", late && "bg-red-50/40")}>
											<td className="pl-3">
												<button type="button" aria-label={expanded ? "Hide details" : "Show details"} onClick={() => setOpen(expanded ? null : i.id)} className="rounded p-1 text-muted-foreground hover:bg-muted">
													{expanded ? <CaretDownIcon className="size-3.5" /> : <CaretRightIcon className="size-3.5" />}
												</button>
											</td>
											<td className="px-2 py-1.5">{i.label}</td>
											<td className="whitespace-nowrap px-2 py-1.5">
												{dayjs(i.dueDate).format("MMM D, YYYY")}
												{late && <span className="block text-destructive text-xs">{s.daysLate} days late</span>}
												{i.promise && <span className="block text-violet-700 text-xs">promised {dayjs(i.promise.date).format("MMM D")}</span>}
											</td>
											<td className="px-2 py-1.5 text-right tabular-nums">
												{formatMoney(i.amount)}
												{s.charges > 0 && <span className="block text-destructive text-xs">+{formatMoney(s.charges)} fees</span>}
											</td>
											<td className="px-2 py-1.5 text-right tabular-nums">{s.paid ? formatMoney(s.paid) : "—"}</td>
											<td className="px-2 py-1.5">
												<StatusPill status={s.status} label={STATUS_LABEL[s.status]} />
											</td>
											{canManage && (
												<td className="px-2 py-1.5 text-right">
													{s.status !== "paid" && s.status !== "cancelled" && (
														<Button size="sm" variant="ghost" className="h-7 px-2 text-brand" onClick={() => setAction({ inst: i, kind: "payment" })}>
															Record payment
														</Button>
													)}
												</td>
											)}
										</tr>
										{expanded && (
											<tr className="bg-muted/20">
												<td />
												<td colSpan={canManage ? 6 : 5} className="px-2 py-2 text-xs">
													<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
														<div>
															<p className="mb-1 font-semibold text-muted-foreground uppercase">Payments</p>
															{i.payments.length ? (
																i.payments.map((p) => (
																	<p key={p.id}>
																		{dayjs(p.at).format("MMM D, YYYY")} · {formatMoney(p.amount)} · {p.method} · by {userName(p.byId)}
																		{p.note && <span className="block text-muted-foreground">{p.note}</span>}
																	</p>
																))
															) : (
																<p className="text-muted-foreground">None yet.</p>
															)}
														</div>
														<div>
															<p className="mb-1 font-semibold text-muted-foreground uppercase">Cadence</p>
															{cadence.steps.map((st) => {
																const log = i.steps.find((l) => l.stepId === st.id);
																return (
																	<p key={st.id} className={cn(!log && "text-muted-foreground")}>
																		{st.offsetDays === 0 ? "D0" : st.offsetDays > 0 ? `D+${st.offsetDays}` : `D${st.offsetDays}`} · {CHANNELS.find((c) => c.id === st.channel)?.label} · {st.title}
																		{log && ` — ${log.outcome === "done" ? "done" : "skipped"} ${dayjs(log.at).format("MMM D")} by ${userName(log.byId)}`}
																	</p>
																);
															})}
														</div>
														<div className="flex flex-col gap-1">
															<p className="mb-1 font-semibold text-muted-foreground uppercase">Changes</p>
															{(i.changes ?? []).map((c) => (
																<p key={c.at}>
																	{dayjs(c.at).format("MMM D")}: {formatMoney(c.fromAmount)} due {c.fromDue} · {c.reason}
																</p>
															))}
															{canManage && s.status !== "paid" && s.status !== "cancelled" && (
																<div className="mt-1 flex flex-wrap gap-1">
																	<Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => setAction({ inst: i, kind: "promise" })}>
																		Promise to pay
																	</Button>
																	<Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => setAction({ inst: i, kind: "renegotiate" })}>
																		Renegotiate
																	</Button>
																	<Button size="sm" variant="ghost" className="h-7 px-2 text-destructive text-xs hover:text-destructive" onClick={() => setAction({ inst: i, kind: "writeoff" })}>
																		Write off
																	</Button>
																</div>
															)}
														</div>
													</div>
												</td>
											</tr>
										)}
									</Fragment>
								);
							})}
						</tbody>
					</table>
					{/* Every collection contact on this deal, with the messages sent. */}
					<section className="flex flex-col gap-3 border-border border-t px-6 py-5">
						<h3 className="font-semibold text-sm">Collections timeline</h3>
						<ContactTimeline plans={[plan]} cadence={cadence} userName={userName} compact />
					</section>
				</div>

				{action && (
					<InstallmentActionDialog
						plan={plan}
						installment={action.inst}
						kind={action.kind}
						openAmount={(() => {
							const s = installmentState(action.inst, cadence, t);
							return Math.round((s.open + s.charges) * 100) / 100;
						})()}
						onClose={() => setAction(null)}
						onDone={(p) => {
							setAction(null);
							onChanged(p);
						}}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function Fact({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
	return (
		<div className="flex flex-col rounded-lg border border-border px-3 py-2">
			<span className={cn("font-semibold tabular-nums", tone)}>{value}</span>
			<span className="text-muted-foreground text-xs">
				{label}
				{sub ? ` · ${sub}` : ""}
			</span>
		</div>
	);
}
