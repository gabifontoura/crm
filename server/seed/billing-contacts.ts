import {
	addDays,
	type BillingPlan,
	type CadenceSettings,
	contactAddress,
	installmentState,
	type Installment,
	renderMessage,
	type StepLog,
} from "../../shared/billing.js";

/**
 * Demo collection history (seed v24): the contacts the team made around each
 * due date so far — the cadence steps reached before the installment was paid,
 * plus a text reminder two days before — so the Deals timeline tells a story.
 */
const SMS_REMINDER = "Hi {name}, just a reminder: {installment} of {amount} is due on {due}. Reply PAID if it's done.";

export function seedContactHistory(plans: BillingPlan[], cadence: CadenceSettings, today: string): BillingPlan[] {
	const steps = [...cadence.steps].sort((a, b) => a.offsetDays - b.offsetDays);
	return plans.map((plan, p) => ({
		...plan,
		installments: plan.installments.map((inst, k): Installment => {
			if (inst.cancelled) return inst;
			const paidOn = inst.payments.length ? inst.payments[inst.payments.length - 1].at.slice(0, 10) : null;
			const logs: StepLog[] = [...inst.steps];
			const add = (day: string, hour: number, log: Omit<StepLog, "at" | "byId">, byId = plan.createdBy) => {
				// Only up to yesterday: what is due today stays on "Today's actions".
				if (day >= today || (paidOn && day > paidOn)) return;
				logs.push({ ...log, at: `${day}T${String(hour).padStart(2, "0")}:${String((k * 7 + p * 11) % 60).padStart(2, "0")}:00.000Z`, byId });
			};
			// What was open on that day (payments made later don't count yet).
			const state = (day: string) => installmentState({ ...inst, payments: inst.payments.filter((x) => x.at.slice(0, 10) < day) }, cadence, day);
			// A text two days before the due date.
			const smsDay = addDays(inst.dueDate, -2);
			add(smsDay, 13, {
				stepId: "sms-reminder",
				outcome: "done",
				note: "",
				channel: "sms",
				title: "Text reminder",
				message: renderMessage(SMS_REMINDER, plan, inst, state(smsDay)),
				to: contactAddress(plan, "sms"),
			});
			// Late and still open: the latest step reached is left for today (Today's actions, or the automation).
			const late = inst.dueDate < today && installmentState(inst, cadence, today).open > 0;
			const reached = steps.filter((st) => addDays(inst.dueDate, st.offsetDays) < today);
			const leave = late ? reached[reached.length - 1]?.id : undefined;
			for (const [n, step] of steps.entries()) {
				if (step.id === leave || logs.some((l) => l.stepId === step.id)) continue;
				const day = addDays(inst.dueDate, step.offsetDays);
				// Now and then a step is skipped (the customer had already called).
				const skipped = step.channel === "letter" && (k + p) % 3 === 0;
				// Automatic steps were sent by the CRM ("simulated": no email or WhatsApp service in the demo).
				const auto = Boolean(step.auto) && ["email", "sms", "whatsapp"].includes(step.channel);
				add(day, auto ? 12 : 14 + (n % 4), {
					stepId: step.id,
					outcome: skipped ? "skipped" : "done",
					note: skipped
						? "Skipped: the customer called first and promised to pay this week."
						: step.channel === "call"
							? ["Voicemail, will try again tomorrow.", "Talked to the customer: paying on Friday.", "Customer asked for the bank details again; sent by email."][(k + p) % 3]
							: "",
					channel: step.channel,
					title: step.title,
					message: renderMessage(step.template, plan, inst, state(day)),
					to: contactAddress(plan, step.channel),
					...(auto && !skipped ? { auto: true, delivery: "simulated" as const } : {}),
				}, auto && !skipped ? "automation" : plan.createdBy);
			}
			return { ...inst, steps: logs.sort((a, b) => a.at.localeCompare(b.at)) };
		}),
	}));
}
