import { addDays, addMonths, type BillingPlan, buildInstallments, type Installment, ymd } from "../../shared/billing.js";
import { contactStagesFrom } from "../../shared/contacts.js";
import type { Ticket } from "../../shared/tickets.js";
import type { Repos } from "../repos/types.js";

/**
 * Demo billing: the won sale gets its payment plan, and each lead already
 * marked as a customer becomes a won deal with one. Plans start in the past so
 * the cadence has work today: some installments paid, one promised, a couple late.
 */

const newId = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Pays every installment due before `today`, except the latest monthly one
 * when the story leaves it open (late), so each plan sits at a different
 * point of the cadence today.
 */
function history(list: Installment[], today: string, leaveLatestOpen: boolean, payer: string): Installment[] {
	const past = list.filter((i) => i.dueDate <= today);
	const latest = past[past.length - 1];
	return list.map((inst, k) => {
		if (inst.dueDate > today) return inst;
		if (leaveLatestOpen && inst === latest) return inst;
		if (inst.dueDate === today) return inst;
		return { ...inst, payments: [{ id: newId("pay"), at: `${addDays(inst.dueDate, k % 3)}T12:00:00.000Z`, amount: inst.amount, method: k === 0 ? "Wire" : "Bank transfer", note: "", byId: payer }] };
	});
}

export async function seedBilling(r: Repos, now: Date) {
	const today = ymd(now);
	const types = await r.ticketTypes.list();
	const sales = types.find((t) => t.id === "tt-sales") ?? types.find((t) => t.workflowId === "wf-sales");
	const workflow = sales ? await r.workflows.get(sales.workflowId) : null;
	if (!sales || !workflow) return;
	const won = workflow.statuses.find((s) => s.category === "done");
	if (!won) return;
	const admin = (await r.users.list()).find((u) => u.role === "admin" && u.active);
	let tickets = await r.tickets.list();
	let number = tickets.reduce((m, t) => Math.max(m, t.number), 1000) + 1;

	// Customers without a deal get one (won), so each sale has its ticket.
	const stages = contactStagesFrom(await r.settings.get("settings.contactStages"));
	const customerStage = stages.find((s) => s.id === "customer") ?? stages.find((s) => s.closed);
	for (const c of (await r.contacts.list()).filter((x) => x.stageId === customerStage?.id && x.email)) {
		if (tickets.some((t) => t.requester.email.toLowerCase() === c.email.toLowerCase())) continue;
		const created = new Date(now.getTime() - 150 * 86_400_000).toISOString();
		const t: Ticket = {
			id: newId("tk"),
			number: number++,
			title: `${c.name} · unit purchase`,
			description: c.notes,
			typeId: sales.id,
			statusId: won.id,
			priority: "medium",
			assigneeId: c.ownerId,
			reporterId: c.ownerId ?? admin?.id ?? "",
			requester: { name: c.name, email: c.email, phone: c.phone },
			clientId: "",
			clientName: c.company,
			developmentId: c.developmentId,
			blockId: null,
			unitId: null,
			property: c.developmentId ? ((await r.developments.get(c.developmentId))?.name ?? "") : "",
			location: "",
			dueAt: null,
			fields: { lead_source: c.source || "Website", agreed_price: c.budget ?? 450_000 },
			parentId: null,
			origin: null,
			createdAt: created,
			updatedAt: created,
			closedAt: created,
			attachments: [],
		};
		await r.tickets.insert(t);
		await r.ticketActivity.insert({ id: newId("act"), ticketId: t.id, at: created, userId: t.reporterId, kind: "created", toStatusId: workflow.initialStatusId });
		await r.ticketActivity.insert({ id: newId("act"), ticketId: t.id, at: created, userId: t.reporterId, kind: "status", fromStatusId: workflow.initialStatusId, toStatusId: won.id, transitionLabel: "Agreement signed" });
	}
	tickets = await r.tickets.list();

	// Real sales only: a buyer to bill (tickets opened for old visits have none).
	const deals = tickets.filter((t) => t.typeId === sales.id && t.statusId === won.id && t.requester.email && !t.parentId);
	const existing = new Set((await r.billing.list()).map((b) => b.ticketId));
	// Each plan's latest monthly installment falls at a different point of the cadence today:
	// due in 3 days (reminder), due 4 days ago (call), 12 days ago (formal notice), due today.
	const stories = [
		{ offset: 3, open: false },
		{ offset: -4, open: true },
		{ offset: -12, open: true },
		{ offset: 0, open: false },
	];
	let k = 0;
	for (const t of deals) {
		if (existing.has(t.id)) continue;
		const story = stories[k++ % stories.length];
		const price = typeof t.fields?.agreed_price === "number" && t.fields.agreed_price > 0 ? t.fields.agreed_price : 520_000;
		const elapsed = 4 + (k % 3);
		const first = addMonths(addDays(today, story.offset), -elapsed);
		const list = buildInstallments(
			{
				totalPrice: price,
				downPayment: Math.round(price * 0.1),
				downPaymentDate: addDays(first, -20),
				monthlyCount: 24,
				firstMonthlyDate: first,
				balloon: Math.round(price * 0.3),
				balloonDate: addMonths(first, 24),
			},
			() => newId("in"),
		);
		const payer = t.assigneeId ?? admin?.id ?? "";
		const plan: BillingPlan = {
			id: newId("bp"),
			ticketId: t.id,
			ticketNumber: t.number,
			customer: { ...t.requester },
			property: [t.property, t.location].filter(Boolean).join(" · "),
			totalPrice: price,
			installments: history(list, today, story.open, payer),
			createdBy: payer,
			createdAt: t.closedAt ?? t.createdAt,
			updatedAt: t.closedAt ?? t.createdAt,
		};
		await r.billing.insert(plan);
	}
}
