/**
 * Sends SMS and WhatsApp through Twilio when TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN and TWILIO_FROM (and TWILIO_WHATSAPP_FROM for WhatsApp)
 * are set. Without them the message is only recorded, marked "simulated".
 */
export async function sendText(channel: "sms" | "whatsapp", to: string, body: string): Promise<{ delivery: "sent" | "simulated" | "failed"; error?: string }> {
	const sid = process.env.TWILIO_ACCOUNT_SID;
	const token = process.env.TWILIO_AUTH_TOKEN;
	const from = channel === "whatsapp" ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_FROM;
	if (!sid || !token || !from) return { delivery: "simulated" };
	if (!to.trim()) return { delivery: "failed", error: "The customer has no phone number." };
	const phone = to.replace(/[^\d+]/g, "");
	const params = new URLSearchParams({
		From: channel === "whatsapp" ? `whatsapp:${from}` : from,
		To: channel === "whatsapp" ? `whatsapp:${phone}` : phone,
		Body: body,
	});
	try {
		const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
			method: "POST",
			headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
			body: params,
		});
		if (!res.ok) return { delivery: "failed", error: `${res.status} ${(await res.text()).slice(0, 200)}` };
		return { delivery: "sent" };
	} catch (e) {
		return { delivery: "failed", error: e instanceof Error ? e.message : String(e) };
	}
}
