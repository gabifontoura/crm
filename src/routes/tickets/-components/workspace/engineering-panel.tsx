import { ArrowBendUpLeftIcon, CameraIcon, CheckIcon, GearSixIcon, XIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { cn } from "#/lib/utils";
import type { TicketAttachment } from "../../../../../shared/tickets";
import { apiClient, errorMessage } from "#/lib/api/client";
import { Panel, type Workspace } from "./shared";

dayjs.extend(relativeTime);

/**
 * The technical question the field sent about this ticket. Engineering
 * answers it right here and it goes back to the technician, who does the work.
 */
export function EngineeringPanel({ ws }: { ws: Workspace }) {
	const { ticket, me, userName, reload, workflow, detail } = ws;
	const e = ticket.engineering;
	const [answer, setAnswer] = useState("");
	// Waiting on engineering in the workflow: the answer takes one of the steps out.
	const waiting = Boolean(workflow?.statuses.find((s) => s.id === ticket.statusId)?.engineering);
	const outs = waiting ? detail.transitions : [];
	const [stepId, setStepId] = useState<string | null>(null);
	const step = outs.find((t) => t.id === stepId) ?? outs[0];
	const [sending, setSending] = useState(false);
	if (!e) return null;
	const photos = (ticket.attachments ?? []).filter((a) => e.attachmentIds?.includes(a.id) && a.type.startsWith("image/"));
	const canAnswer = e.status === "open" && (me.role === "engineer" || me.role === "admin");

	async function send() {
		if (!answer.trim() || sending) return;
		setSending(true);
		try {
			await apiClient.post(`/api/tickets/${encodeURIComponent(ticket.id)}/engineering/answer`, { answer: answer.trim(), transitionId: step?.id });
			toast.success(`Answer sent back to ${userName(e!.askedBy)}`, {
				description: step ? `#${ticket.number} is now ${workflow?.statuses.find((s) => s.id === step.to)?.name}.` : undefined,
			});
			setAnswer("");
			await reload();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			setSending(false);
		}
	}

	return (
		<Panel
			title={e.status === "open" ? "Question to engineering · waiting for an answer" : "Question to engineering · answered"}
			icon={<GearSixIcon className="size-4" />}
			className={e.status === "open" ? "border-amber-300" : undefined}
		>
			<div className="flex flex-col gap-3 text-sm">
				<div>
					<p className="mb-1 text-muted-foreground text-xs">
						Asked by <b className="text-foreground">{userName(e.askedBy)}</b> {dayjs(e.askedAt).fromNow()}
						{e.actionLabel && ` · task action “${e.actionLabel}”`}
						{e.eventId && (
							<>
								{" · "}
								<Link to="/technician/$activityId" params={{ activityId: e.eventId }} className="text-brand hover:underline">
									open the task
								</Link>
							</>
						)}
					</p>
					<p className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2">{e.question}</p>
					{photos.length > 0 && (
						<div className="mt-2 flex flex-wrap gap-2" aria-label="Photos sent with the question">
							{photos.map((p) => (
								// Full size in the History box below (Files).
								<img key={p.id} src={p.dataUrl} alt={p.name} title={p.name} className="size-28 rounded-md border border-border object-cover" />
							))}
						</div>
					)}
				</div>
				{e.status === "answered" ? (
					<div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
						<p className="mb-0.5 text-emerald-800 text-xs">
							Answered by {userName(e.answeredBy)} {e.answeredAt ? dayjs(e.answeredAt).fromNow() : ""}: the technician does the work as answered.
						</p>
						<p className="whitespace-pre-wrap">{e.answer}</p>
					</div>
				) : canAnswer ? (
					<div className="flex flex-col gap-2">
						<Textarea
							aria-label="Answer for the technician"
							rows={3}
							className="resize-none"
							placeholder="Your analysis and what the technician should do…"
							value={answer}
							onChange={(ev) => setAnswer(ev.target.value)}
							onKeyDown={(ev) => {
								if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) send();
							}}
						/>
						{outs.length > 1 && (
							<div className="flex flex-wrap items-center gap-1.5 text-xs" role="radiogroup" aria-label="Then">
								<span className="text-muted-foreground">Then:</span>
								{outs.map((t) => (
									<button
										key={t.id}
										type="button"
										role="radio"
										aria-checked={step?.id === t.id}
										onClick={() => setStepId(t.id)}
										className={cn(
											"inline-flex items-center gap-1 rounded-full border px-2.5 py-1",
											step?.id === t.id ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground hover:bg-muted",
										)}
									>
										{step?.id === t.id && <CheckIcon className="size-3" />}
										{t.label} → {workflow?.statuses.find((s) => s.id === t.to)?.name}
									</button>
								))}
							</div>
						)}
						<div className="flex justify-end">
							<Button size="sm" onClick={send} disabled={!answer.trim() || sending}>
								<ArrowBendUpLeftIcon className="size-4" /> {sending ? "Sending…" : "Send back to the technician"}
							</Button>
						</div>
					</div>
				) : (
					<p className="text-amber-800 text-xs">Engineering is analyzing it. The answer shows here and on the technician's task.</p>
				)}
			</div>
		</Panel>
	);
}

const MAX_PHOTO = 2.4 * 1024 * 1024;

export interface EngineeringDraft {
	question: string;
	photos: { name: string; dataUrl: string }[];
}

/**
 * The question a step into "With engineering" sends: what to analyze, and
 * photos (new ones, or ones already on the ticket).
 */
export function EngineeringAsk({
	value,
	onChange,
	attachments,
	errors,
}: {
	value: EngineeringDraft;
	onChange: (v: EngineeringDraft) => void;
	attachments: TicketAttachment[];
	errors: { question?: string; photos?: string };
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const images = attachments.filter((a) => a.type.startsWith("image/") && a.dataUrl);
	const picked = new Set(value.photos.map((p) => p.dataUrl));

	function add(list: FileList | null) {
		const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
		for (const f of files) {
			if (f.size > MAX_PHOTO) {
				toast.error(`${f.name} is larger than 2.4 MB.`);
				continue;
			}
			const r = new FileReader();
			r.onload = () => onChange({ ...value, photos: [...value.photos, { name: f.name, dataUrl: String(r.result) }].slice(0, 6) });
			r.readAsDataURL(f);
		}
	}
	const toggle = (a: TicketAttachment) =>
		onChange({ ...value, photos: picked.has(a.dataUrl) ? value.photos.filter((p) => p.dataUrl !== a.dataUrl) : [...value.photos, { name: a.name, dataUrl: a.dataUrl }].slice(0, 6) });

	return (
		<section className="flex flex-col gap-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900 dark:bg-violet-950/20">
			<p className="flex items-center gap-2 font-medium text-sm">
				<GearSixIcon className="size-4 text-violet-700" /> Question to engineering
			</p>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="eng-question" className="text-xs">
					What should engineering analyze? <span className="text-destructive">*</span>
				</Label>
				<Textarea
					id="eng-question"
					rows={3}
					className="resize-none bg-card"
					placeholder="What you found, measurements, and the decision you need…"
					value={value.question}
					onChange={(e) => onChange({ ...value, question: e.target.value })}
				/>
				{errors.question && <span className="text-destructive text-xs">{errors.question}</span>}
			</div>
			<div className="flex flex-col gap-1.5">
				<span className="text-xs">
					Photos to analyze <span className="text-destructive">*</span>
				</span>
				<div className="flex flex-wrap gap-2">
					{images.map((a) => (
						<button
							key={a.id}
							type="button"
							aria-pressed={picked.has(a.dataUrl)}
							onClick={() => toggle(a)}
							title={a.name}
							className={cn("relative overflow-hidden rounded-md border-2", picked.has(a.dataUrl) ? "border-violet-600" : "border-transparent opacity-70 hover:opacity-100")}
						>
							<img src={a.dataUrl} alt={a.name} className="size-16 object-cover" />
							{picked.has(a.dataUrl) && <CheckIcon weight="bold" className="absolute top-0.5 right-0.5 size-4 rounded-full bg-violet-600 p-0.5 text-white" />}
						</button>
					))}
					{value.photos
						.filter((p) => !images.some((a) => a.dataUrl === p.dataUrl))
						.map((p) => (
							<span key={p.dataUrl.slice(-24)} className="relative overflow-hidden rounded-md border-2 border-violet-600">
								<img src={p.dataUrl} alt={p.name} className="size-16 object-cover" />
								<button
									type="button"
									aria-label={`Remove ${p.name}`}
									onClick={() => onChange({ ...value, photos: value.photos.filter((x) => x !== p) })}
									className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white"
								>
									<XIcon className="size-3" />
								</button>
							</span>
						))}
					<button
						type="button"
						onClick={() => inputRef.current?.click()}
						className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-md border border-violet-300 border-dashed bg-card text-[11px] text-violet-700 hover:bg-violet-50"
					>
						<CameraIcon className="size-5" /> Add
					</button>
					<input
						ref={inputRef}
						type="file"
						accept="image/*"
						multiple
						className="hidden"
						onChange={(e) => {
							add(e.target.files);
							e.target.value = "";
						}}
					/>
				</div>
				<span className="text-[11px] text-muted-foreground">{images.length ? "Tap the ticket's photos to send them, or add new ones." : "Add the photos engineering needs to see."}</span>
				{errors.photos && <span className="text-destructive text-xs">{errors.photos}</span>}
			</div>
		</section>
	);
}
