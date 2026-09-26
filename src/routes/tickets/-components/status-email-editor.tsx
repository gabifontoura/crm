import { CaretDownIcon, EnvelopeSimpleIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { FilterChip } from "#/components/ui/filter-chip";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { useSession } from "#/lib/auth/session";
import { useMenuAccess } from "#/lib/auth/use-menu-access";
import { cn } from "#/lib/utils";
import { menuAccessFrom } from "../../../../shared/access";
import {
	defaultStatusEmail,
	EMAIL_VARIABLES,
	type EmailRecipient,
	type RecipientKind,
	renderEmail,
	SAMPLE_VARIABLES,
	type StatusEmail,
} from "../../../../shared/status-email";

const FIXED: { kind: RecipientKind; label: string; hint: string; side: "Customer" | "Team" }[] = [
	{ kind: "requester", label: "Requester", hint: "Who asked (owner, resident, buyer)", side: "Customer" },
	{ kind: "client", label: "Client contact", hint: "The client company's contact", side: "Customer" },
	{ kind: "assignee", label: "Assignee", hint: "Whoever is working on it", side: "Team" },
	{ kind: "reporter", label: "Opened by", hint: "Whoever registered it", side: "Team" },
];

/** "Requester, Engineer (everyone), Mia Robinson…": who an email goes to, in words. */
export function recipientsLabel(to: EmailRecipient[], accessName: (id: string) => string, userName: (id: string) => string): string {
	return (
		to
			.map((r) =>
				r.kind === "access" ? `everyone with ${accessName(r.value ?? "")}` : r.kind === "user" ? userName(r.value ?? "") : r.kind === "email" ? (r.value ?? "") : (FIXED.find((f) => f.kind === r.kind)?.label ?? r.kind),
			)
			.join(", ") || "no one yet"
	);
}

/**
 * The email a status sends when a ticket arrives there: who gets it (the
 * customer's side, the team, anyone), the subject and the message, with
 * {variables} and a preview.
 */
export function StatusEmailEditor({ statusName, value, onChange }: { statusName: string; value: StatusEmail | undefined; onChange: (v: StatusEmail | undefined) => void }) {
	const { users, user } = useSession();
	const access = useMenuAccess(user?.id) ?? menuAccessFrom(null);
	const [open, setOpen] = useState(false);
	const [address, setAddress] = useState("");
	const focused = useRef<"subject" | "body">("body");
	const subjectRef = useRef<HTMLInputElement>(null);
	const bodyRef = useRef<HTMLTextAreaElement>(null);

	const email = value;
	const on = Boolean(email?.enabled);
	const set = (patch: Partial<StatusEmail>) => onChange({ ...(email ?? defaultStatusEmail(statusName)), ...patch });
	const has = (kind: RecipientKind, v?: string) => Boolean(email?.to.some((r) => r.kind === kind && (v === undefined || r.value === v)));
	const toggle = (kind: RecipientKind, v?: string) =>
		set({ to: has(kind, v) ? (email?.to ?? []).filter((r) => !(r.kind === kind && (v === undefined || r.value === v))) : [...(email?.to ?? []), v ? { kind, value: v } : { kind }] });

	const accessName = (id: string) => (id === "admin" ? "Administrator" : (access.profiles.find((p) => p.id === id)?.name ?? id));
	const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "Former member";
	const accesses = [{ id: "admin", name: "Administrator" }, ...access.profiles.map((p) => ({ id: p.id, name: p.name }))];
	const people = users.filter((u) => u.active && !has("user", u.id));

	function insert(variable: string) {
		const token = `{${variable}}`;
		const field = focused.current;
		const el = field === "subject" ? subjectRef.current : bodyRef.current;
		const current = field === "subject" ? (email?.subject ?? "") : (email?.body ?? "");
		const start = el?.selectionStart ?? current.length;
		const end = el?.selectionEnd ?? current.length;
		const next = current.slice(0, start) + token + current.slice(end);
		set(field === "subject" ? { subject: next } : { body: next });
		requestAnimationFrame(() => {
			el?.focus();
			el?.setSelectionRange(start + token.length, start + token.length);
		});
	}

	return (
		<div className={cn("rounded-md border", on ? "border-brand/40 bg-brand/[0.03]" : "border-dashed border-border")}>
			<div className="flex flex-wrap items-center gap-2 px-2.5 py-2">
				<EnvelopeSimpleIcon className={cn("size-4 shrink-0", on ? "text-brand" : "text-muted-foreground")} />
				<label className="flex items-center gap-2 text-xs">
					<Switch
						checked={on}
						onCheckedChange={(v) => {
							onChange(v ? { ...(email ?? defaultStatusEmail(statusName)), enabled: true } : email ? { ...email, enabled: false } : undefined);
							if (v) setOpen(true);
						}}
						aria-label={`Send an email when a ticket gets to ${statusName}`}
					/>
					<span className="font-medium">Email when a ticket gets here</span>
				</label>
				{on && email && (
					<span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
						To {recipientsLabel(email.to, accessName, userName)} · “{email.subject}”
					</span>
				)}
				{on && (
					<button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="ml-auto inline-flex items-center gap-1 font-medium text-brand text-xs hover:underline">
						{open ? "Close" : "Edit email"}
						<CaretDownIcon className={cn("size-3 transition-transform", open && "rotate-180")} />
					</button>
				)}
			</div>

			{on && open && email && (
				<div className="grid grid-cols-1 gap-4 border-border border-t p-3 lg:grid-cols-2">
					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<span className="font-semibold text-muted-foreground text-xs">Who gets it</span>
							{(["Customer", "Team"] as const).map((side) => (
								<div key={side} className="flex flex-wrap items-center gap-1.5">
									<span className="w-16 text-muted-foreground text-xs">{side}</span>
									{FIXED.filter((f) => f.side === side).map((f) => (
										<span key={f.kind} title={f.hint}>
											<FilterChip label={f.label} active={has(f.kind)} onClick={() => toggle(f.kind)} className="px-2.5 py-0.5 text-xs" />
										</span>
									))}
								</div>
							))}
							<div className="flex flex-wrap items-center gap-1.5">
								<span className="w-16 text-muted-foreground text-xs">Access</span>
								{accesses.map((a) => (
									<span key={a.id} title={`Everyone with the ${a.name} access`}>
										<FilterChip label={a.name} active={has("access", a.id)} onClick={() => toggle("access", a.id)} className="px-2.5 py-0.5 text-xs" />
									</span>
								))}
							</div>
							<div className="flex flex-wrap items-center gap-1.5">
								<span className="w-16 text-muted-foreground text-xs">People</span>
								{email.to
									.filter((r) => r.kind === "user" || r.kind === "email")
									.map((r) => (
										<span key={`${r.kind}-${r.value}`} className="inline-flex items-center gap-1 rounded-full border border-brand bg-brand/10 py-0.5 pr-1 pl-2.5 font-medium text-brand text-xs">
											{r.kind === "user" ? userName(r.value!) : r.value}
											<button type="button" aria-label={`Remove ${r.value}`} onClick={() => toggle(r.kind, r.value)} className="rounded-full p-0.5 hover:bg-brand/15">
												<XIcon className="size-3" />
											</button>
										</span>
									))}
								<Select value="" onValueChange={(id) => toggle("user", id)}>
									<SelectTrigger aria-label="Add a team member" className="h-7 w-40 text-xs">
										<SelectValue placeholder="Add a person…" />
									</SelectTrigger>
									<SelectContent>
										{people.map((u) => (
											<SelectItem key={u.id} value={u.id}>
												{u.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<form
									className="flex items-center gap-1"
									onSubmit={(e) => {
										e.preventDefault();
										if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim())) {
											toggle("email", address.trim());
											setAddress("");
										}
									}}
								>
									<Input aria-label="Other email address" className="h-7 w-44 text-xs" placeholder="other@address.com" value={address} onChange={(e) => setAddress(e.target.value)} />
									<button type="submit" aria-label="Add address" className="rounded-md p-1 text-brand hover:bg-brand/10" disabled={!address.trim()}>
										<PlusIcon className="size-4" />
									</button>
								</form>
							</div>
						</div>

						<label className="flex flex-col gap-1 text-xs">
							<span className="font-semibold text-muted-foreground">Subject</span>
							<Input ref={subjectRef} value={email.subject} onFocus={() => (focused.current = "subject")} onChange={(e) => set({ subject: e.target.value })} className="h-8 text-sm" />
						</label>
						<label className="flex flex-col gap-1 text-xs">
							<span className="font-semibold text-muted-foreground">Message</span>
							<Textarea ref={bodyRef} rows={7} value={email.body} onFocus={() => (focused.current = "body")} onChange={(e) => set({ body: e.target.value })} className="text-sm" />
						</label>
						<div className="flex flex-wrap gap-1">
							<span className="mr-1 text-muted-foreground text-xs">Insert:</span>
							{EMAIL_VARIABLES.map((v) => (
								<button
									key={v.id}
									type="button"
									title={`${v.label}, e.g. ${v.sample}`}
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => insert(v.id)}
									className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:border-brand/50 hover:text-brand"
								>
									{`{${v.id}}`}
								</button>
							))}
						</div>
					</div>

					{/* How it reads, with a sample ticket */}
					<div className="flex flex-col gap-1.5">
						<span className="font-semibold text-muted-foreground text-xs">Preview (sample ticket)</span>
						<div className="overflow-hidden rounded-md border border-border bg-card text-sm">
							<dl className="grid grid-cols-[4rem_1fr] gap-x-2 gap-y-0.5 border-border border-b bg-muted/30 px-3 py-2 text-xs">
								<dt className="text-muted-foreground">To</dt>
								<dd>{recipientsLabel(email.to, accessName, userName)}</dd>
								<dt className="text-muted-foreground">Subject</dt>
								<dd className="font-medium">{renderEmail(email.subject, { ...SAMPLE_VARIABLES, status: statusName || SAMPLE_VARIABLES.status })}</dd>
							</dl>
							<p className="whitespace-pre-wrap px-3 py-3 leading-relaxed">{renderEmail(email.body, { ...SAMPLE_VARIABLES, status: statusName || SAMPLE_VARIABLES.status })}</p>
						</div>
						<p className="text-[11px] text-muted-foreground">Sent every time a ticket moves to {statusName || "this status"}, and kept on the ticket's history.</p>
					</div>
				</div>
			)}
		</div>
	);
}
