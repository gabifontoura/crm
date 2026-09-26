import { LightningIcon, PlayIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { apiClient, errorMessage } from "#/lib/api/client";
import { cn } from "#/lib/utils";
import { addDays, automaticSends, type BillingPlan, type CadenceSettings, installmentState } from "../../../../shared/billing";
import { CadenceEditor } from "../../settings/-components/cadence-editor";
import { CHANNEL_LOOK } from "./contact-timeline";
import { today } from "./billing";

/**
 * Deals › Message automation: which messages go out on their own and when
 * (so many days before or after each due date), what's scheduled for the next
 * two weeks, and a button to send what's due now.
 */
export function AutomationPanel({ plans, cadence, isAdmin, onChanged }: { plans: BillingPlan[]; cadence: CadenceSettings; isAdmin: boolean; onChanged: () => void }) {
	const t = today();
	const [running, setRunning] = useState(false);
	const upcoming = useMemo(() => automaticSends(plans, cadence, t, addDays(t, 14)), [plans, cadence, t]);
	// A real open installment for the previews.
	const sample = useMemo(() => {
		for (const plan of plans) {
			const i = plan.installments.find((x) => installmentState(x, cadence, t).open > 0 && x.dueDate >= t);
			if (i) return { plan, installment: i };
		}
		return undefined;
	}, [plans, cadence, t]);
	const autoSteps = cadence.steps.filter((s) => s.auto).length;

	async function runNow() {
		setRunning(true);
		try {
			const r = await apiClient.post<{ sent: number; simulated: number; failed: number }>("/api/billing/automations/run", {});
			const total = r.sent + r.simulated + r.failed;
			toast.success(total ? `${total} message${total === 1 ? "" : "s"} processed` : "Nothing due right now", {
				description: total ? `${r.sent} sent · ${r.simulated} simulated · ${r.failed} not sent` : "Everything due today already went out.",
			});
			onChanged();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setRunning(false);
		}
	}

	return (
		<div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] [&>*]:min-w-0">
			<CadenceEditor sample={sample} readOnly={!isAdmin} onSaved={onChanged} />

			<aside className="flex flex-col gap-3">
				<div className="rounded-lg border border-border bg-card p-4 shadow-sm">
					<div className="flex items-start justify-between gap-2">
						<div>
							<h3 className="flex items-center gap-1.5 font-semibold text-sm">
								<LightningIcon weight="fill" className="size-4 text-brand" /> Scheduled · next 14 days
							</h3>
							<p className="text-muted-foreground text-xs">
								{autoSteps} automatic step{autoSteps === 1 ? "" : "s"}. They go out every day, and whenever someone opens Deals.
							</p>
						</div>
						{isAdmin && (
							<Button size="sm" variant="secondary" onClick={runNow} disabled={running}>
								<PlayIcon weight="fill" className="size-3.5" /> {running ? "Running…" : "Run now"}
							</Button>
						)}
					</div>
					{upcoming.length === 0 ? (
						<p className="mt-3 rounded-md border border-dashed border-border p-4 text-center text-muted-foreground text-xs">Nothing scheduled in the next 14 days.</p>
					) : (
						<ol className="mt-3 flex flex-col gap-1.5">
							{upcoming.map((u) => {
								const look = CHANNEL_LOOK[u.step.channel];
								const I = look.icon;
								return (
									<li key={`${u.installment.id}-${u.step.id}`} className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2" title={u.message}>
										<span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ring-1", look.dot)}>
											<I className="size-3.5" weight="bold" />
										</span>
										<span className="min-w-0 text-xs">
											<span className="block font-medium text-sm">
												{u.date === t ? "Today" : dayjs(u.date).format("ddd, MMM D")} · {u.step.title}
											</span>
											<span className="block truncate text-muted-foreground">
												{u.plan.customer.name} · {u.installment.label} · {look.label}
											</span>
										</span>
									</li>
								);
							})}
						</ol>
					)}
				</div>
				<div className="rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground text-xs">
					<p className="mb-1 font-medium text-foreground">Sending for real</p>
					Until an email service (Resend) and a text service (Twilio) are connected, automatic messages are recorded as <b>simulated</b> on the Collections timeline. The
					keys go in <code>.env.local</code> or the Vercel project (see <code>.env.example</code>).
				</div>
			</aside>
		</div>
	);
}
