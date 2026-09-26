/**
 * Billing for deals: a payment plan per sold unit (down payment, monthly
 * installments, the "keys" balloon), payments, promises to pay and
 * renegotiations, plus a relationship cadence ("régua"): steps taken around
 * each due date (reminders before, calls and notices after). Imports use
 * ".js" so the file also runs as plain Node ESM on Vercel.
 */

export type Channel = "email" | "whatsapp" | "sms" | "call" | "letter" | "task";

/** One step of the cadence, relative to the due date (negative = before). */
export interface CadenceStep {
	id: string;
	offsetDays: number;
	channel: Channel;
	title: string;
	/** Message with {name}, {amount}, {due}, {installment}, {deal}, {days}. */
	template: string;
	/** Sent by the CRM on its day (email, SMS and WhatsApp only); otherwise the team does it from Today's actions. */
	auto?: boolean;
}

/** Channels the CRM can send on its own; calls, letters and tasks stay with the team. */
export const AUTO_CHANNELS: Channel[] = ["email", "sms", "whatsapp"];
export const canAutomate = (s: Pick<CadenceStep, "channel">) => AUTO_CHANNELS.includes(s.channel);
/** Days an automatic send can still catch up (e.g. the server was off): older ones are left to the team. */
export const AUTO_CATCH_UP_DAYS = 3;

export interface CadenceSettings {
	steps: CadenceStep[];
	/** Late fee, % of the installment, once. */
	lateFeePct: number;
	/** Interest, % per month, pro rata per day. */
	interestPctMonth: number;
	/** Days after the due date before fees apply. */
	graceDays: number;
}

export type InstallmentKind = "down_payment" | "monthly" | "balloon" | "other";

export interface Payment {
	id: string;
	at: string;
	amount: number;
	method: string;
	note: string;
	byId: string;
}

export interface StepLog {
	stepId: string;
	at: string;
	byId: string;
	outcome: "done" | "skipped";
	note: string;
	/** What was sent, as it was at the time (the cadence may change later). */
	channel?: Channel;
	title?: string;
	message?: string;
	/** Email address or phone number it went to. */
	to?: string;
	/** Sent by the CRM (an automatic step), and whether it went out. */
	auto?: boolean;
	delivery?: "sent" | "simulated" | "failed";
	error?: string;
}

export interface Installment {
	id: string;
	kind: InstallmentKind;
	label: string;
	/** YYYY-MM-DD */
	dueDate: string;
	amount: number;
	payments: Payment[];
	/** The customer promised to pay on this date: the cadence waits until then. */
	promise?: { date: string; note: string; byId: string; at: string } | null;
	/** Earlier due dates / amounts, when renegotiated. */
	changes?: { at: string; byId: string; fromDue: string; fromAmount: number; reason: string }[];
	steps: StepLog[];
	/** Written off (won't be charged). */
	cancelled?: boolean;
}

export interface BillingPlan {
	id: string;
	/** The deal (a sales ticket). */
	ticketId: string;
	ticketNumber: number;
	customer: { name: string; email: string; phone: string };
	/** Unit / development sold, for display. */
	property: string;
	/** What was bought: the development, block and unit (names kept as they were at the sale). */
	sold?: SoldUnit;
	/** When it was bought (YYYY-MM-DD): the day the deal was won. */
	purchasedOn?: string;
	totalPrice: number;
	installments: Installment[];
	createdBy: string;
	createdAt: string;
	updatedAt: string;
}

export interface SoldUnit {
	developmentId: string | null;
	development: string;
	blockId: string | null;
	block: string;
	unitId: string | null;
	unit: string;
}

/** "Aurora Residences · Block C · Unit 201", from what's known. */
export function soldLabel(plan: Pick<BillingPlan, "sold" | "property">): string {
	const s = plan.sold;
	if (!s) return plan.property;
	return [s.development, s.block, s.unit ? (/^\d/.test(s.unit) ? `Unit ${s.unit}` : s.unit) : ""].filter(Boolean).join(" · ") || plan.property;
}

export const CHANNELS: { id: Channel; label: string }[] = [
	{ id: "email", label: "Email" },
	{ id: "whatsapp", label: "WhatsApp" },
	{ id: "sms", label: "SMS" },
	{ id: "call", label: "Call" },
	{ id: "letter", label: "Formal letter" },
	{ id: "task", label: "Internal task" },
];

export const PAYMENT_METHODS = ["Bank transfer", "Wire", "Check", "Card", "Cash", "Financing release"];

export const DEFAULT_CADENCE: CadenceSettings = {
	lateFeePct: 2,
	interestPctMonth: 1,
	graceDays: 0,
	steps: [
		{ id: "d-5", offsetDays: -5, channel: "email", auto: true, title: "Friendly reminder", template: "Hi {name}, a quick reminder that {installment} of {amount} for {deal} is due on {due}. Thank you!" },
		{ id: "d0", offsetDays: 0, channel: "whatsapp", auto: true, title: "Due today", template: "Hi {name}, {installment} ({amount}) is due today. If you've already paid, please ignore this message." },
		{ id: "d+3", offsetDays: 3, channel: "call", title: "Check-in call", template: "Call {name}: {installment} of {amount} is {days} days late. Ask for a payment date and log the promise." },
		{ id: "d+10", offsetDays: 10, channel: "letter", title: "Formal notice", template: "Dear {name}, {installment} of {amount} for {deal}, due on {due}, remains unpaid. Please settle it within 5 business days to avoid further measures." },
		{ id: "d+30", offsetDays: 30, channel: "task", title: "Escalate to management", template: "{installment} of {name} ({deal}) is {days} days late: review with management (renegotiation or legal)." },
	],
};

/* ------------------------------ Dates ------------------------------- */

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (s: string) => new Date(`${s}T12:00:00`);
export const addDays = (s: string, n: number) => ymd(new Date(at(s).getTime() + n * 86_400_000));
export function addMonths(s: string, n: number): string {
	const d = at(s);
	const day = d.getDate();
	const r = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
	r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
	return ymd(r);
}
export const daysBetween = (from: string, to: string) => Math.round((at(to).getTime() - at(from).getTime()) / 86_400_000);

/* ------------------------------ Money ------------------------------- */

const round2 = (n: number) => Math.round(n * 100) / 100;
export const paidOf = (i: Pick<Installment, "payments">) => round2(i.payments.reduce((s, p) => s + p.amount, 0));

export type InstallmentStatus = "paid" | "partial" | "upcoming" | "due_today" | "overdue" | "promised" | "cancelled";

export interface InstallmentState {
	status: InstallmentStatus;
	paid: number;
	/** What's still owed on the installment itself. */
	open: number;
	/** Late fee + interest on the open amount (0 when not late). */
	charges: number;
	/** Days late (negative = days until due). */
	daysLate: number;
}

export function installmentState(i: Installment, cadence: Pick<CadenceSettings, "lateFeePct" | "interestPctMonth" | "graceDays">, today: string): InstallmentState {
	const paid = paidOf(i);
	const open = round2(Math.max(0, i.amount - paid));
	const daysLate = daysBetween(i.dueDate, today);
	if (i.cancelled) return { status: "cancelled", paid, open: 0, charges: 0, daysLate };
	if (open <= 0.009) return { status: "paid", paid, open: 0, charges: 0, daysLate };
	const late = daysLate > cadence.graceDays;
	const charges = late ? round2(open * (cadence.lateFeePct / 100) + open * (cadence.interestPctMonth / 100 / 30) * daysLate) : 0;
	const promised = Boolean(i.promise && i.promise.date >= today);
	const status: InstallmentStatus = promised && daysLate > 0 ? "promised" : daysLate > 0 ? "overdue" : daysLate === 0 ? "due_today" : paid > 0 ? "partial" : "upcoming";
	return { status, paid, open, charges, daysLate };
}

export const STATUS_LABEL: Record<InstallmentStatus, string> = {
	paid: "Paid",
	partial: "Partly paid",
	upcoming: "Upcoming",
	due_today: "Due today",
	overdue: "Overdue",
	promised: "Promised",
	cancelled: "Written off",
};

export function formatMoney(n: number): string {
	return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 });
}

/* ------------------------------ Plan -------------------------------- */

export interface PlanInput {
	totalPrice: number;
	downPayment: number;
	downPaymentDate: string;
	monthlyCount: number;
	firstMonthlyDate: string;
	/** "Keys" payment at handover. */
	balloon: number;
	balloonDate: string | null;
}

/** Down payment, equal monthly installments, and the balloon; cents go to the last monthly. */
export function buildInstallments(p: PlanInput, newId: () => string): Installment[] {
	const list: Installment[] = [];
	const base = (kind: InstallmentKind, label: string, dueDate: string, amount: number): Installment => ({ id: newId(), kind, label, dueDate, amount: round2(amount), payments: [], steps: [] });
	if (p.downPayment > 0) list.push(base("down_payment", "Down payment", p.downPaymentDate, p.downPayment));
	const rest = round2(p.totalPrice - p.downPayment - p.balloon);
	if (p.monthlyCount > 0 && rest > 0) {
		const each = Math.floor((rest / p.monthlyCount) * 100) / 100;
		for (let k = 0; k < p.monthlyCount; k++) {
			const amount = k === p.monthlyCount - 1 ? round2(rest - each * (p.monthlyCount - 1)) : each;
			list.push(base("monthly", `Installment ${k + 1}/${p.monthlyCount}`, addMonths(p.firstMonthlyDate, k), amount));
		}
	}
	if (p.balloon > 0) list.push(base("balloon", "Keys payment", p.balloonDate ?? addMonths(p.firstMonthlyDate, p.monthlyCount), p.balloon));
	return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/* ------------------------------ Cadence ----------------------------- */

export interface DueStep {
	plan: BillingPlan;
	installment: Installment;
	state: InstallmentState;
	step: CadenceStep;
	/** The date the step was due. */
	date: string;
	message: string;
}

export function renderMessage(template: string, plan: BillingPlan, i: Installment, state: InstallmentState): string {
	const vars: Record<string, string> = {
		name: plan.customer.name.split(" (")[0],
		amount: formatMoney(state.open + state.charges),
		due: at(i.dueDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
		installment: i.label,
		deal: plan.property || `deal #${plan.ticketNumber}`,
		days: String(Math.max(0, state.daysLate)),
	};
	return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/**
 * Steps of the cadence due by `today` and not yet done or skipped: for each
 * open installment, the latest step whose date has come (earlier missed
 * steps are superseded by it). A promise to pay pauses the cadence.
 */
export function dueSteps(plans: BillingPlan[], cadence: CadenceSettings, today: string): DueStep[] {
	const steps = [...cadence.steps].sort((a, b) => a.offsetDays - b.offsetDays);
	const out: DueStep[] = [];
	for (const plan of plans) {
		for (const i of plan.installments) {
			const state = installmentState(i, cadence, today);
			if (state.status === "paid" || state.status === "cancelled" || state.status === "promised") continue;
			const reached = steps.filter((s) => addDays(i.dueDate, s.offsetDays) <= today);
			const step = reached[reached.length - 1];
			if (!step) continue;
			// Done (by the team or sent by the CRM); a failed automatic send comes back to the team.
			if (i.steps.some((l) => l.stepId === step.id && l.delivery !== "failed")) continue;
			// Automatic steps are the CRM's, until they fail.
			if (step.auto && canAutomate(step) && !i.steps.some((l) => l.stepId === step.id)) continue;
			out.push({ plan, installment: i, state, step, date: addDays(i.dueDate, step.offsetDays), message: renderMessage(step.template, plan, i, state) });
		}
	}
	return out.sort((a, b) => b.state.daysLate - a.state.daysLate);
}

/* ------------------------- Contact timeline -------------------------- */

/** One collection contact (or a skipped one), for the timeline. */
export interface ContactEntry {
	id: string;
	at: string;
	plan: BillingPlan;
	installment: Installment;
	channel: Channel;
	title: string;
	message: string;
	to: string;
	outcome: StepLog["outcome"];
	note: string;
	byId: string;
	auto: boolean;
	delivery?: StepLog["delivery"];
	error?: string;
}

/** Where a message on this channel goes: the email for email and letters, the phone otherwise. */
export function contactAddress(plan: BillingPlan, channel: Channel): string {
	if (channel === "email" || channel === "letter") return plan.customer.email;
	if (channel === "task") return "";
	return plan.customer.phone;
}

/**
 * Every contact made on the plans, newest first. Older logs without a copy of
 * the message get it rebuilt from the cadence step.
 */
export function contactTimeline(plans: BillingPlan[], cadence: CadenceSettings): ContactEntry[] {
	const out: ContactEntry[] = [];
	for (const plan of plans) {
		for (const i of plan.installments) {
			i.steps.forEach((log, k) => {
				const step = cadence.steps.find((s) => s.id === log.stepId);
				const channel = log.channel ?? step?.channel ?? "task";
				const day = log.at.slice(0, 10);
				out.push({
					id: `${i.id}-${k}`,
					at: log.at,
					plan,
					installment: i,
					channel,
					title: log.title ?? step?.title ?? "Contact",
					message: log.message ?? (step ? renderMessage(step.template, plan, i, installmentState({ ...i, payments: i.payments.filter((x) => x.at.slice(0, 10) < day) }, cadence, day)) : ""),
					to: log.to ?? contactAddress(plan, channel),
					outcome: log.outcome,
					note: log.note,
					byId: log.byId,
					auto: Boolean(log.auto),
					delivery: log.delivery,
					error: log.error,
				});
			});
		}
	}
	return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** An automatic step due now: the CRM sends it (or tomorrow's run, if it was off, within the catch-up days). */
export interface AutoSend {
	plan: BillingPlan;
	installment: Installment;
	step: CadenceStep;
	date: string;
	message: string;
}

/**
 * Automatic steps to send by `today` and not sent yet, for open installments
 * (a promise to pay pauses them, like the rest of the cadence). With `until`,
 * the ones coming up to that date, for the "Scheduled" list.
 */
export function automaticSends(plans: BillingPlan[], cadence: CadenceSettings, today: string, until?: string): AutoSend[] {
	const steps = cadence.steps.filter((s) => s.auto && canAutomate(s));
	const from = until ? today : addDays(today, -AUTO_CATCH_UP_DAYS);
	const to = until ?? today;
	const out: AutoSend[] = [];
	for (const plan of plans) {
		for (const i of plan.installments) {
			const state = installmentState(i, cadence, today);
			if (state.status === "paid" || state.status === "cancelled" || state.status === "promised") continue;
			for (const step of steps) {
				const date = addDays(i.dueDate, step.offsetDays);
				if (date < from || date > to || (until && date === today && i.steps.some((l) => l.stepId === step.id))) continue;
				if (!until && i.steps.some((l) => l.stepId === step.id)) continue;
				out.push({ plan, installment: i, step, date, message: renderMessage(step.template, plan, i, state) });
			}
		}
	}
	return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function cadenceFrom(value: unknown): CadenceSettings {
	const v = (value ?? {}) as Partial<CadenceSettings>;
	const steps = Array.isArray(v.steps) && v.steps.length ? v.steps : DEFAULT_CADENCE.steps;
	return {
		steps: steps.map((s, k) => ({
			id: String(s.id || `s${k}`),
			offsetDays: Math.round(Number(s.offsetDays) || 0),
			channel: CHANNELS.some((c) => c.id === s.channel) ? s.channel : "email",
			title: String(s.title || "Step"),
			template: String(s.template || ""),
			...(s.auto && AUTO_CHANNELS.includes(s.channel) ? { auto: true } : {}),
		})),
		lateFeePct: Number.isFinite(Number(v.lateFeePct)) ? Number(v.lateFeePct) : DEFAULT_CADENCE.lateFeePct,
		interestPctMonth: Number.isFinite(Number(v.interestPctMonth)) ? Number(v.interestPctMonth) : DEFAULT_CADENCE.interestPctMonth,
		graceDays: Number.isFinite(Number(v.graceDays)) ? Math.max(0, Math.round(Number(v.graceDays))) : DEFAULT_CADENCE.graceDays,
	};
}

/** Where a plan stands, for lists and tiles. */
export function planSummary(plan: BillingPlan, cadence: CadenceSettings, today: string) {
	let paid = 0;
	let open = 0;
	let overdue = 0;
	let charges = 0;
	let overdueCount = 0;
	let next: Installment | null = null;
	for (const i of plan.installments) {
		const s = installmentState(i, cadence, today);
		paid += s.paid;
		open += s.open;
		charges += s.charges;
		if (s.status === "overdue" || s.status === "promised") {
			overdue += s.open;
			overdueCount++;
		}
		if (s.open > 0 && !i.cancelled && (!next || i.dueDate < next.dueDate)) next = i;
	}
	const status = open <= 0.009 ? "paid_off" : overdueCount ? "overdue" : "on_track";
	return { paid: round2(paid), open: round2(open), overdue: round2(overdue), charges: round2(charges), overdueCount, next, status: status as "paid_off" | "overdue" | "on_track" };
}
