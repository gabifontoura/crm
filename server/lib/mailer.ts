/**
 * Sends email through Resend (https://resend.com) when RESEND_API_KEY and
 * EMAIL_FROM are set (.env.local or the Vercel project). Without them the
 * email is only recorded on the ticket, marked "simulated".
 */
export interface OutgoingEmail {
	to: { name: string; email: string }[];
	subject: string;
	text: string;
}

export async function sendEmail(mail: OutgoingEmail): Promise<{ delivery: "sent" | "simulated" | "failed"; error?: string }> {
	const key = process.env.RESEND_API_KEY;
	const from = process.env.EMAIL_FROM;
	if (!key || !from) return { delivery: "simulated" };
	try {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				from,
				to: mail.to.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)),
				subject: mail.subject,
				text: mail.text,
			}),
		});
		if (!res.ok) return { delivery: "failed", error: `${res.status} ${(await res.text()).slice(0, 200)}` };
		return { delivery: "sent" };
	} catch (e) {
		return { delivery: "failed", error: e instanceof Error ? e.message : String(e) };
	}
}
