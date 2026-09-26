import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { ApiError, apiClient, errorMessage } from "#/lib/api/client";
import { cn } from "#/lib/utils";
import {
	addMonths,
	type BillingPlan,
	buildInstallments,
	type CadenceSettings,
	cadenceFrom,
	formatMoney,
	type Installment,
	type InstallmentStatus,
	PAYMENT_METHODS,
	ymd,
} from "../../../../shared/billing";

/** Plans the viewer can see, and the cadence. */
export function useBilling(userId: string | undefined) {
	const [plans, setPlans] = useState<BillingPlan[] | null>(null);
	const [cadence, setCadence] = useState<CadenceSettings>(cadenceFrom(null));
	const reload = useCallback(async () => {
		if (!userId) return;
		try {
			const r = await apiClient.get<{ plans: BillingPlan[]; cadence: CadenceSettings }>("/api/billing");
			setPlans(r.plans);
			setCadence(r.cadence);
		} catch (e) {
			toast.error(errorMessage(e));
			setPlans([]);
		}
	}, [userId]);
	useEffect(() => {
		reload();
	}, [reload]);
	return { plans, cadence, reload, setPlans };
}

export const today = () => ymd(new Date());

export const STATUS_STYLE: Record<InstallmentStatus, string> = {
	paid: "bg-emerald-100 text-emerald-800",
	partial: "bg-sky-100 text-sky-800",
	upcoming: "bg-muted text-muted-foreground",
	due_today: "bg-amber-100 text-amber-800",
	overdue: "bg-red-100 text-red-700",
	promised: "bg-violet-100 text-violet-800",
	cancelled: "bg-muted text-muted-foreground line-through",
};

/* --------------------------- Set up a plan ---------------------------- */

/** Down payment, monthly installments and the keys payment, with a live preview. */
export function PlanDialog({
	deal,
	suggestedPrice,
	onClose,
	onCreated,
}: {
	deal: { id: string; number: number; title: string };
	suggestedPrice: number | null;
	onClose: () => void;
	onCreated: (p: BillingPlan) => void;
}) {
	const t = today();
	const [price, setPrice] = useState(suggestedPrice ? String(suggestedPrice) : "");
	const [downPct, setDownPct] = useState("10");
	const [downDate, setDownDate] = useState(t);
	const [months, setMonths] = useState("24");
	const [first, setFirst] = useState(addMonths(t, 1));
	const [keysPct, setKeysPct] = useState("30");
	const [keysDate, setKeysDate] = useState(addMonths(t, 25));
	const [saving, setSaving] = useState(false);
	const total = Number(price.replace(/[$,\s]/g, "")) || 0;
	const down = Math.round((total * (Number(downPct) || 0)) / 100);
	const keys = Math.round((total * (Number(keysPct) || 0)) / 100);
	const n = Math.max(0, Math.round(Number(months) || 0));
	let k = 0;
	const preview = total > 0 ? buildInstallments({ totalPrice: total, downPayment: down, downPaymentDate: downDate, monthlyCount: n, firstMonthlyDate: first, balloon: keys, balloonDate: keysDate }, () => String(k++)) : [];
	const monthly = preview.find((i) => i.kind === "monthly");

	async function save() {
		setSaving(true);
		try {
			const plan = await apiClient.post<BillingPlan>("/api/billing", {
				ticketId: deal.id,
				totalPrice: total,
				downPayment: down,
				downPaymentDate: downDate,
				monthlyCount: n,
				firstMonthlyDate: first,
				balloon: keys,
				balloonDate: keysDate,
			});
			toast.success(`Payment plan set up for #${deal.number}`, { description: `${plan.installments.length} installments` });
			onCreated(plan);
		} catch (e) {
			toast.error(errorMessage(e));
			setSaving(false);
		}
	}

	const f = (label: string, node: React.ReactNode, hint?: string) => (
		<div className="flex flex-col gap-1">
			<Label className="text-xs">{label}</Label>
			{node}
			{hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
		</div>
	);

	return (
		<Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
			<DialogContent className="!max-w-[95vw] sm:!max-w-2xl">
				<DialogTitle>Payment plan · #{deal.number}</DialogTitle>
				<DialogDescription>{deal.title}</DialogDescription>
				<div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
					{f("Sale price ($)", <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />)}
					{f("Down payment (%)", <Input inputMode="decimal" value={downPct} onChange={(e) => setDownPct(e.target.value)} />, formatMoney(down))}
					{f("Down payment due", <Input type="date" value={downDate} onChange={(e) => setDownDate(e.target.value)} />)}
					{f("Monthly installments", <Input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />, monthly ? `${formatMoney(monthly.amount)} each` : undefined)}
					{f("First monthly due", <Input type="date" value={first} onChange={(e) => setFirst(e.target.value)} />)}
					<span className="hidden sm:block" />
					{f("Keys payment (%)", <Input inputMode="decimal" value={keysPct} onChange={(e) => setKeysPct(e.target.value)} />, formatMoney(keys))}
					{f("Keys payment due", <Input type="date" value={keysDate} onChange={(e) => setKeysDate(e.target.value)} />, "At handover")}
				</div>
				{preview.length > 0 && (
					<p className="rounded-md bg-muted/40 px-3 py-2 text-xs">
						{preview.length} installments from {preview[0].dueDate} to {preview[preview.length - 1].dueDate}, adding up to {formatMoney(preview.reduce((s, i) => s + i.amount, 0))}.
					</p>
				)}
				<div className="flex justify-end gap-2">
					<Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
						Cancel
					</Button>
					<Button size="sm" onClick={save} disabled={saving || total <= 0 || down + keys > total}>
						{saving ? "Saving…" : "Create plan"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

/* ---------------------- One installment's actions --------------------- */

export type InstallmentActionKind = "payment" | "promise" | "renegotiate" | "writeoff";

const TITLES: Record<InstallmentActionKind, string> = {
	payment: "Record a payment",
	promise: "Promise to pay",
	renegotiate: "Renegotiate",
	writeoff: "Write off",
};

export function InstallmentActionDialog({
	plan,
	installment,
	kind,
	openAmount,
	onClose,
	onDone,
}: {
	plan: BillingPlan;
	installment: Installment;
	kind: InstallmentActionKind;
	/** Open amount plus late charges, suggested for a payment. */
	openAmount: number;
	onClose: () => void;
	onDone: (p: BillingPlan) => void;
}) {
	const [amount, setAmount] = useState(kind === "payment" ? String(openAmount) : kind === "renegotiate" ? String(installment.amount) : "");
	const [method, setMethod] = useState(PAYMENT_METHODS[0]);
	const [date, setDate] = useState(kind === "renegotiate" ? installment.dueDate : today());
	const [note, setNote] = useState("");
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);

	async function save() {
		setSaving(true);
		try {
			const body =
				kind === "payment"
					? { amount, method, date, note }
					: kind === "promise"
						? { date, note }
						: kind === "renegotiate"
							? { dueDate: date, amount, reason: note }
							: { reason: note };
			const p = await apiClient.post<BillingPlan>(`/api/billing/${encodeURIComponent(plan.id)}/installments/${encodeURIComponent(installment.id)}/${kind}`, body);
			toast.success(TITLES[kind], { description: installment.label });
			onDone(p);
		} catch (e) {
			if (e instanceof ApiError) setErrors(e.fields);
			toast.error(errorMessage(e));
			setSaving(false);
		}
	}

	const needsNote = kind === "renegotiate" || kind === "writeoff";
	return (
		<Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle>{TITLES[kind]}</DialogTitle>
				<DialogDescription>
					{installment.label} · {formatMoney(installment.amount)} due {installment.dueDate} · {plan.customer.name}
				</DialogDescription>
				<div className="flex flex-col gap-3 pt-2">
					{(kind === "payment" || kind === "renegotiate") && (
						<div className="flex flex-col gap-1">
							<Label className="text-xs">{kind === "payment" ? "Amount received ($)" : "New amount ($)"}</Label>
							<Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
							{kind === "payment" && openAmount > installment.amount - 0.01 && <span className="text-[11px] text-muted-foreground">Includes late fee and interest.</span>}
							{errors.amount && <span className="text-destructive text-xs">{errors.amount}</span>}
						</div>
					)}
					{kind === "payment" && (
						<div className="flex flex-col gap-1">
							<Label className="text-xs">Method</Label>
							<Select value={method} onValueChange={setMethod}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PAYMENT_METHODS.map((m) => (
										<SelectItem key={m} value={m}>
											{m}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
					{kind !== "writeoff" && (
						<div className="flex flex-col gap-1">
							<Label className="text-xs">{kind === "payment" ? "Received on" : kind === "promise" ? "Promised date" : "New due date"}</Label>
							<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
						</div>
					)}
					<div className="flex flex-col gap-1">
						<Label className="text-xs">
							{needsNote ? "Reason" : "Note"} {needsNote ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}
						</Label>
						<Textarea rows={2} className="resize-none" value={note} onChange={(e) => setNote(e.target.value)} />
						{(errors.reason || errors.date) && <span className="text-destructive text-xs">{errors.reason ?? errors.date}</span>}
					</div>
				</div>
				<div className="flex justify-end gap-2 pt-2">
					<Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
						Cancel
					</Button>
					<Button variant={kind === "writeoff" ? "destructive" : "default"} size="sm" onClick={save} disabled={saving || (needsNote && !note.trim())}>
						{saving ? "Saving…" : TITLES[kind]}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function StatusPill({ status, label }: { status: InstallmentStatus; label: string }) {
	return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-[11px]", STATUS_STYLE[status])}>{label}</span>;
}

/** What was bought and when: development, block, unit, purchase date and price. */
export function SoldFacts({ plan, className }: { plan: BillingPlan; className?: string }) {
	const s = plan.sold;
	const items: [string, string][] = [
		["Development", s?.development || plan.property || "—"],
		["Block", s?.block || "—"],
		["Unit", s?.unit || "—"],
		["Bought on", plan.purchasedOn ? new Date(`${plan.purchasedOn}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"],
		["Price", formatMoney(plan.totalPrice)],
	];
	return (
		<dl className={cn("grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-5", className)}>
			{items.map(([label, value]) => (
				<div key={label} className="min-w-0">
					<dt className="text-muted-foreground text-xs">{label}</dt>
					<dd className="font-medium">{value}</dd>
				</div>
			))}
		</dl>
	);
}
