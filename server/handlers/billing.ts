import {
	type BillingPlan,
	buildInstallments,
	cadenceFrom,
	CHANNELS,
	formatMoney,
	type Installment,
	installmentState,
	type PlanInput,
	ymd,
	contactAddress,
	renderMessage,
	automaticSends,
	type StepLog,
} from "../../shared/billing.js";
import { type Contact, type Interaction, sameEmail } from "../../shared/contacts.js";
import type { Ticket } from "../../shared/tickets.js";
import type { User } from "../../shared/users.js";
import { badRequest, conflict, created, forbidden, noContent, notFound, objectBody, ok, str, type ApiRequest } from "../lib/http.js";
import { currentUser, requireAdmin } from "../lib/session.js";
import { requireAction } from "../lib/access.js";
import type { Repos } from "../repos/types.js";
import { logTicketComment, visibleTickets } from "./tickets.js";
import { sendEmail } from "../lib/mailer.js";
import { sendText } from "../lib/messaging.js";
import { soldUnitOf } from "../lib/sold-unit.js";
import { demoCap } from "../lib/demo.js";

/**
 * Billing: payment plans for deals and the collection cadence. Anyone who
 * sees the deal's ticket sees its plan; its assignee (or an admin) records
 * payments, promises, renegotiations and cadence steps. Everything is also
 * written on the ticket's history and, when the customer is a lead, on theirs.
 */

const newId = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const canManage = (me: User, t: Ticket) => me.role === "admin" || t.assigneeId === me.id;
const today = () => ymd(new Date());
const num = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[$,\s]/g, "")));
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

async function cadence(repos: Repos) {
	return cadenceFrom(await repos.settings.get("settings.billingCadence"));
}

async function loadPlan(req: ApiRequest, repos: Repos, id: string, manage = false) {
	const me = await currentUser(req, repos);
	const plan = await repos.billing.get(id);
	const ticket = plan ? (await visibleTickets(repos, me)).find((t) => t.id === plan.ticketId) : undefined;
	if (!plan || !ticket) notFound("Payment plan");
	if (manage && !canManage(me, ticket)) forbidden("Only the deal's owner or an administrator can change its billing.");
	return { me, plan, ticket };
}

/** Also on the lead's history, when the customer is one. */
async function logOnLead(repos: Repos, me: User, plan: BillingPlan, kind: Interaction["kind"], note: string) {
	if (!plan.customer.email) return;
	const lead = (await repos.contacts.list()).find((c) => sameEmail(c.email, plan.customer.email));
	if (!lead) return;
	const now = new Date().toISOString();
	const updated: Contact = {
		...lead,
		interactions: [...lead.interactions, { id: newId("in"), at: now, userId: me.id, kind, note }],
		lastContactAt: kind === "note" ? lead.lastContactAt : now,
		updatedAt: now,
	};
	await repos.contacts.update(lead.id, updated);
}

/** Who the history shows for messages the CRM sent on its own. */
export const AUTOMATION_ID = "automation";

/**
 * Sends the automatic cadence steps due by today (email, SMS, WhatsApp) and
 * logs each one on its installment, with what went out and whether it was
 * delivered. Safe to run many times a day: a sent step isn't sent again.
 */
export async function runBillingAutomations(repos: Repos): Promise<{ sent: number; simulated: number; failed: number }> {
	const cad = await cadence(repos);
	const plans = await repos.billing.list();
	const due = automaticSends(plans, cad, today());
	const result = { sent: 0, simulated: 0, failed: 0 };
	const byPlan = new Map<string, BillingPlan>();
	for (const d of due) {
		const plan = byPlan.get(d.plan.id) ?? d.plan;
		const to = contactAddress(plan, d.step.channel);
		const outcome =
			d.step.channel === "email"
				? to
					? await sendEmail({ to: [{ name: plan.customer.name, email: to }], subject: `${d.step.title} · ${d.installment.label}`, text: d.message })
					: { delivery: "failed" as const, error: "The customer has no email address." }
				: await sendText(d.step.channel as "sms" | "whatsapp", to, d.message);
		result[outcome.delivery]++;
		const log: StepLog = {
			stepId: d.step.id,
			at: new Date().toISOString(),
			byId: AUTOMATION_ID,
			outcome: "done",
			note: outcome.delivery === "failed" ? `Not sent: ${outcome.error ?? "unknown error"}. Back on Today's actions.` : "",
			channel: d.step.channel,
			title: d.step.title,
			message: d.message,
			to,
			auto: true,
			delivery: outcome.delivery,
			...(outcome.error ? { error: outcome.error } : {}),
		};
		byPlan.set(plan.id, {
			...plan,
			installments: plan.installments.map((i) => (i.id === d.installment.id ? { ...i, steps: [...i.steps, log] } : i)),
			updatedAt: log.at,
		});
	}
	for (const plan of byPlan.values()) await repos.billing.update(plan.id, plan);
	return result;
}

/** Runs the automations on demand (Deals › Message automation) or from a daily cron (Vercel, with CRON_SECRET). */
export async function runAutomationsNow(req: ApiRequest, repos: Repos) {
	const secret = process.env.CRON_SECRET;
	const auth = String(req.headers.authorization ?? "");
	if (!(secret && auth === `Bearer ${secret}`)) {
		const me = await currentUser(req, repos);
		if (me.role !== "admin") forbidden("Only administrators run the automations.");
	}
	return ok(await runBillingAutomations(repos));
}

export async function listBilling(req: ApiRequest, repos: Repos) {
	const me = await currentUser(req, repos);
	// What's due goes out before anyone looks (a daily cron does the same without anyone opening Deals).
	await runBillingAutomations(repos);
	const ids = new Set((await visibleTickets(repos, me)).map((t) => t.id));
	return ok({ plans: (await repos.billing.list()).filter((p) => ids.has(p.ticketId)), cadence: await cadence(repos) });
}

export async function createPlan(req: ApiRequest, repos: Repos) {
	await demoCap(repos, "billing");
	const me = await currentUser(req, repos);
	await requireAction(repos, me, "billing.plan");
	const body = objectBody(req);
	const ticket = (await visibleTickets(repos, me)).find((t) => t.id === str(body.ticketId));
	if (!ticket) notFound("Deal");
	if (!canManage(me, ticket)) forbidden("Only the deal's owner or an administrator can set up its billing.");
	if ((await repos.billing.list()).some((p) => p.ticketId === ticket.id)) conflict("This deal already has a payment plan.");
	const input: PlanInput = {
		totalPrice: num(body.totalPrice),
		downPayment: num(body.downPayment) || 0,
		downPaymentDate: isDate(body.downPaymentDate) ? body.downPaymentDate : today(),
		monthlyCount: Math.max(0, Math.min(360, Math.round(num(body.monthlyCount) || 0))),
		firstMonthlyDate: isDate(body.firstMonthlyDate) ? body.firstMonthlyDate : today(),
		balloon: num(body.balloon) || 0,
		balloonDate: isDate(body.balloonDate) ? body.balloonDate : null,
	};
	const errors: Record<string, string> = {};
	if (!(input.totalPrice > 0)) errors.totalPrice = "Enter the sale price.";
	if (input.downPayment < 0 || input.balloon < 0) errors.downPayment = "Amounts can't be negative.";
	if (input.downPayment + input.balloon > input.totalPrice) errors.downPayment = "Down payment and keys payment are more than the price.";
	if (input.totalPrice - input.downPayment - input.balloon > 0.009 && input.monthlyCount === 0) errors.monthlyCount = "Add monthly installments for the rest of the price.";
	if (Object.keys(errors).length) badRequest(Object.values(errors)[0], errors);

	const now = new Date().toISOString();
	const plan: BillingPlan = {
		id: newId("bp"),
		ticketId: ticket.id,
		ticketNumber: ticket.number,
		customer: { ...ticket.requester },
		property: [ticket.property, ticket.location].filter(Boolean).join(" · "),
		sold: await soldUnitOf(repos, ticket),
		purchasedOn: isDate(body.purchasedOn) ? body.purchasedOn : (ticket.closedAt ?? now).slice(0, 10),
		totalPrice: input.totalPrice,
		installments: buildInstallments(input, () => newId("in")),
		createdBy: me.id,
		createdAt: now,
		updatedAt: now,
	};
	await repos.billing.insert(plan);
	await logTicketComment(repos, me.id, ticket, `Payment plan set up: ${formatMoney(plan.totalPrice)} in ${plan.installments.length} installments.`);
	return created(plan);
}

export async function deletePlan(req: ApiRequest, repos: Repos, params: { id: string }) {
	const { me, plan, ticket } = await loadPlan(req, repos, params.id);
	requireAdmin(me);
	if (plan.installments.some((i) => i.payments.length)) conflict("Payments were recorded on this plan; write the installments off instead.");
	await repos.billing.remove(plan.id);
	await logTicketComment(repos, me.id, ticket, "Payment plan removed.");
	return noContent();
}

/**
 * One installment's actions:
 *   payment     { amount, method, date, note }
 *   promise     { date, note }        (date null clears it)
 *   renegotiate { dueDate, amount, reason }
 *   step        { stepId, outcome: done|skipped, note }
 *   writeoff    { reason }
 */
export async function installmentAction(req: ApiRequest, repos: Repos, params: { id: string; installmentId: string; action: string }) {
	const { me, plan, ticket } = await loadPlan(req, repos, params.id, true);
	await requireAction(repos, me, "billing.record");
	const inst = plan.installments.find((i) => i.id === params.installmentId);
	if (!inst) notFound("Installment");
	const body = objectBody(req);
	const now = new Date().toISOString();
	const cad = await cadence(repos);
	let next: Installment = inst;
	let note = "";

	switch (params.action) {
		case "payment": {
			const amount = Math.round(num(body.amount) * 100) / 100;
			if (!(amount > 0)) badRequest("Enter the amount received.", { amount: "Enter the amount received." });
			const method = str(body.method).slice(0, 60) || "Bank transfer";
			const date = isDate(body.date) ? body.date : today();
			next = { ...inst, payments: [...inst.payments, { id: newId("pay"), at: `${date}T12:00:00.000Z`, amount, method, note: str(body.note).slice(0, 500), byId: me.id }], promise: null };
			const st = installmentState(next, cad, today());
			note = `Payment received: ${formatMoney(amount)} (${method}) for ${inst.label}${st.status === "paid" ? " — paid in full" : `, ${formatMoney(st.open)} still open`}.`;
			await logOnLead(repos, me, plan, "note", note);
			break;
		}
		case "promise": {
			const date = body.date === null ? null : isDate(body.date) ? body.date : undefined;
			if (date === undefined) badRequest("Pick the promised date.", { date: "Pick the promised date." });
			next = { ...inst, promise: date ? { date, note: str(body.note).slice(0, 500), byId: me.id, at: now } : null };
			note = date ? `Promise to pay ${inst.label} on ${date}${str(body.note) ? `: ${str(body.note)}` : ""}.` : `Promise to pay ${inst.label} cleared.`;
			if (date) await logOnLead(repos, me, plan, "call", note);
			break;
		}
		case "renegotiate": {
			const dueDate = isDate(body.dueDate) ? body.dueDate : inst.dueDate;
			const amount = body.amount === undefined || body.amount === "" ? inst.amount : Math.round(num(body.amount) * 100) / 100;
			const reason = str(body.reason).trim().slice(0, 500);
			if (!reason) badRequest("Say why it was renegotiated.", { reason: "Say why it was renegotiated." });
			if (!(amount > 0)) badRequest("The amount must be positive.", { amount: "The amount must be positive." });
			next = {
				...inst,
				dueDate,
				amount,
				// The cadence starts over for the new date.
				steps: [],
				promise: null,
				changes: [...(inst.changes ?? []), { at: now, byId: me.id, fromDue: inst.dueDate, fromAmount: inst.amount, reason }],
			};
			note = `${inst.label} renegotiated: ${formatMoney(inst.amount)} due ${inst.dueDate} → ${formatMoney(amount)} due ${dueDate}. ${reason}`;
			await logOnLead(repos, me, plan, "note", note);
			break;
		}
		case "step": {
			const step = cad.steps.find((s) => s.id === str(body.stepId));
			if (!step) badRequest("Unknown cadence step.");
			const outcome = body.outcome === "skipped" ? "skipped" : "done";
			const text = str(body.note).trim().slice(0, 1000);
			// Kept as history (a step done twice shows twice), with a copy of what was sent.
			const message = str(body.message).trim().slice(0, 4000) || renderMessage(step.template, plan, inst, installmentState(inst, cad, today()));
			next = {
				...inst,
				steps: [...inst.steps, { stepId: step.id, at: now, byId: me.id, outcome, note: text, channel: step.channel, title: step.title, message, to: contactAddress(plan, step.channel) }],
			};
			const channel = CHANNELS.find((c) => c.id === step.channel)?.label ?? step.channel;
			note = outcome === "done" ? `${channel} · ${step.title} (${inst.label})${text ? `: ${text}` : "."}` : `Skipped “${step.title}” for ${inst.label}${text ? `: ${text}` : "."}`;
			if (outcome === "done") {
				const kind: Interaction["kind"] = step.channel === "call" ? "call" : step.channel === "email" || step.channel === "letter" ? "email" : step.channel === "task" ? "note" : "message";
				await logOnLead(repos, me, plan, kind, note);
			}
			break;
		}
		case "writeoff": {
			const reason = str(body.reason).trim().slice(0, 500);
			if (!reason) badRequest("Say why it's written off.", { reason: "Say why it's written off." });
			next = { ...inst, cancelled: true, changes: [...(inst.changes ?? []), { at: now, byId: me.id, fromDue: inst.dueDate, fromAmount: inst.amount, reason: `Written off: ${reason}` }] };
			note = `${inst.label} (${formatMoney(inst.amount - inst.payments.reduce((s, p) => s + p.amount, 0))}) written off: ${reason}`;
			break;
		}
		default:
			notFound("Action");
	}

	const updated: BillingPlan = { ...plan, installments: plan.installments.map((i) => (i.id === inst.id ? next : i)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), updatedAt: now };
	await repos.billing.update(plan.id, updated);
	await logTicketComment(repos, me.id, ticket, `Billing · ${note}`);
	return ok(updated);
}
