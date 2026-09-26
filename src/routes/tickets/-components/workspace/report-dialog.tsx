import { ArrowBendDownRightIcon, CheckCircleIcon, MinusCircleIcon, WrenchIcon, XCircleIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { formatCurrency, formatDuration } from "#/lib/format";
import { cn } from "#/lib/utils";
import { partsTotal, SATISFACTION_OPTIONS, type Satisfaction, serviceMinutes } from "../../../../../shared/service";
import { StatusBadge } from "../ticket-details-dialog";
import type { LinkedEvent, Workspace } from "./shared";

const SATISFACTION_COLORS: Record<Satisfaction, string> = {
	very_dissatisfied: "#DC2626",
	dissatisfied: "#EA580C",
	neutral: "#CA8A04",
	satisfied: "#16A34A",
	very_satisfied: "#0D9488",
};

function SatisfactionLabel({ value }: { value: Satisfaction | null | undefined }) {
	if (!value) return <span className="text-muted-foreground">Not rated</span>;
	return (
		<span className="inline-flex items-center gap-1.5 font-medium" style={{ color: SATISFACTION_COLORS[value] }}>
			<span className="size-2 rounded-full" style={{ backgroundColor: SATISFACTION_COLORS[value] }} />
			{SATISFACTION_OPTIONS.find((o) => o.value === value)?.label ?? value}
		</span>
	);
}

/**
 * The technician's report for one visit, for review: every action with its
 * result, what was left for later (and the sub-ticket's status), parts,
 * satisfaction and signature.
 */
export function ReportDialog({ ws, event, onClose }: { ws: Workspace; event: LinkedEvent; onClose: () => void }) {
	const r = event.service;
	if (!r) return null;
	const { userName, appointmentLabel, detail, workflowOf, openDetails } = ws;
	const checklist = r.checklist ?? [];
	const counts = {
		ok: checklist.filter((c) => c.result === "ok").length,
		issue: checklist.filter((c) => c.result === "issue").length,
		later: checklist.filter((c) => c.deferredTicket).length,
	};

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="!flex !max-h-[88vh] !max-w-[95vw] flex-col !gap-0 !p-0 sm:!max-w-2xl">
				<div className="border-b px-6 pt-6 pb-4">
					<DialogTitle>Service report</DialogTitle>
					<DialogDescription className="mt-1">
						{appointmentLabel(event.type)} · {dayjs(event.start).format("ddd, MMM D")} · {userName(event.ownerId)}
					</DialogDescription>
					<div className="mt-3 flex flex-wrap gap-2 text-xs">
						<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">{counts.ok} approved</span>
						{counts.issue > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">{counts.issue} rejected</span>}
						{counts.later > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{counts.later} left for later</span>}
						<span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{formatDuration(serviceMinutes(r))} on site</span>
					</div>
				</div>
				<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5 text-sm">
					<ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
						{checklist.map((c) => {
							const sub = c.deferredTicket ? detail.children.find((x) => x.number === c.deferredTicket) : undefined;
							return (
								<li key={c.id} className="flex gap-2 px-3 py-2">
									{c.deferredTicket ? (
										<ArrowBendDownRightIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
									) : c.result === "ok" ? (
										<CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" weight="fill" />
									) : c.result === "issue" ? (
										<XCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" weight="fill" />
									) : (
										<MinusCircleIcon className={cn("mt-0.5 size-4 shrink-0", c.result === "na" ? "text-muted-foreground" : "text-amber-500")} />
									)}
									<div className="min-w-0 flex-1">
										<p className="font-medium">
											{c.label}
											{c.result === "na" && <span className="font-normal text-muted-foreground"> · not applicable</span>}
											{c.engineering && <span className="font-normal text-brand"> · sent to engineering</span>}
										</p>
										{c.note && <p className="text-muted-foreground">{c.note}</p>}
										{c.deferredTicket && (
											<button
												type="button"
												onClick={() => {
													onClose();
													openDetails(c.deferredTicket!);
												}}
												className="mt-1 inline-flex items-center gap-1.5 text-brand text-xs hover:underline"
											>
												Left for later · sub-ticket #{c.deferredTicket}
												{sub && <StatusBadge workflow={workflowOf(sub.typeId)} statusId={sub.statusId} />}
											</button>
										)}
										{(c.photos?.length ?? 0) > 0 && (
											<div className="mt-1.5 flex gap-1.5">
												{c.photos.map((p) => (
													<img key={p.id} src={p.dataUrl} alt={p.caption || p.name} className="size-14 rounded object-cover" />
												))}
											</div>
										)}
									</div>
								</li>
							);
						})}
					</ul>

					{(r.findings || r.workPerformed) && (
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							{r.findings && (
								<div>
									<p className="text-muted-foreground text-xs">Findings</p>
									<p className="whitespace-pre-wrap">{r.findings}</p>
								</div>
							)}
							{r.workPerformed && (
								<div>
									<p className="text-muted-foreground text-xs">Work performed</p>
									<p className="whitespace-pre-wrap">{r.workPerformed}</p>
								</div>
							)}
						</div>
					)}

					{(r.parts?.length ?? 0) > 0 && (
						<div>
							<p className="mb-1 flex items-center gap-1 text-muted-foreground text-xs">
								<WrenchIcon className="size-3.5" /> Parts and materials
							</p>
							<ul>
								{r.parts.map((p) => (
									<li key={p.id} className="flex justify-between">
										<span>
											{p.qty}× {p.description}
										</span>
										<span className="text-muted-foreground">{formatCurrency(p.qty * p.unitCost)}</span>
									</li>
								))}
							</ul>
							<p className="text-right font-medium">Total {formatCurrency(partsTotal(r.parts))}</p>
						</div>
					)}

					<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
						<div>
							<p className="text-muted-foreground text-xs">Customer satisfaction</p>
							<SatisfactionLabel value={r.satisfaction} />
						</div>
						{r.signature ? (
							<div className="text-right">
								<img src={r.signature.dataUrl} alt={`Signature of ${r.signature.name}`} className="ml-auto h-12 w-40 rounded bg-white object-contain" />
								<p className="text-muted-foreground text-xs">Signed by {r.signature.name}</p>
							</div>
						) : (
							<p className="text-muted-foreground text-xs">{r.customerPresent ? "Not signed." : "Customer not present."}</p>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
