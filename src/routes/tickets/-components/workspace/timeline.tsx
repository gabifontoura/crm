import {
	ArrowBendUpRightIcon,
	ArrowsLeftRightIcon,
	CalendarCheckIcon,
	ChatTextIcon,
	ClockCounterClockwiseIcon,
	EnvelopeSimpleIcon,
	FileTextIcon,
	PaperclipIcon,
	PencilSimpleIcon,
	PlusCircleIcon,
	UserSwitchIcon,
	XIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { PersonName } from "#/components/person/person-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Textarea } from "#/components/ui/textarea";
import { apiClient, errorMessage } from "#/lib/api/client";
import { type SentEmail, statusOf, type TicketActivity } from "../../../../../shared/tickets";
import { initialsOf } from "../../../../../shared/users";
import { type LinkedEvent, Panel, type Workspace } from "./shared";

dayjs.extend(relativeTime);

const MAX_FILE = 2.4 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result));
		r.onerror = () => reject(r.error);
		r.readAsDataURL(file);
	});
}

/** Post an update (comment and files) — anyone who can see the ticket. */
function Composer({ ws }: { ws: Workspace }) {
	const { ticket, reload } = ws;
	const [text, setText] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [posting, setPosting] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	function pick(list: FileList | null) {
		const ok = Array.from(list ?? []).filter((f) => {
			if (f.size > MAX_FILE) toast.error(`${f.name} is larger than 2.4 MB.`);
			return f.size <= MAX_FILE;
		});
		setFiles((prev) => [...prev, ...ok]);
	}

	async function post() {
		if ((!text.trim() && files.length === 0) || posting) return;
		setPosting(true);
		try {
			for (const f of files) {
				await apiClient.post(`/api/tickets/${encodeURIComponent(ticket.id)}/attachments`, { name: f.name, dataUrl: await readAsDataUrl(f) });
			}
			if (text.trim()) await apiClient.post(`/api/tickets/${encodeURIComponent(ticket.id)}/comments`, { comment: text.trim() });
			setText("");
			setFiles([]);
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setPosting(false);
		}
	}

	return (
		<div className="flex flex-col gap-2 border-border border-b p-4">
			<Textarea
				aria-label="Write an update"
				rows={3}
				className="resize-none"
				placeholder="Write an update: what was done, what was agreed, next steps…"
				value={text}
				onChange={(e) => setText(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post();
				}}
			/>
			{files.length > 0 && (
				<ul className="flex flex-wrap gap-1.5">
					{files.map((f, i) => (
						<li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs">
							<PaperclipIcon className="size-3" /> {f.name}
							<button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((prev) => prev.filter((_, k) => k !== i))}>
								<XIcon className="size-3" />
							</button>
						</li>
					))}
				</ul>
			)}
			<div className="flex items-center justify-between gap-2">
				<input
					ref={inputRef}
					type="file"
					multiple
					accept="image/*,application/pdf,text/plain"
					className="hidden"
					onChange={(e) => {
						pick(e.target.files);
						e.target.value = "";
					}}
				/>
				<Button type="button" size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>
					<PaperclipIcon className="size-4" /> Attach
				</Button>
				<Button type="button" size="sm" onClick={post} disabled={posting || (!text.trim() && files.length === 0)}>
					<ChatTextIcon className="size-4" />
					{posting ? "Posting…" : "Post update"}
				</Button>
			</div>
		</div>
	);
}

/** A file shown in the history: an uploaded attachment or a photo from a visit. */
type HistoryFile = { key: string; name: string; dataUrl: string; isImage: boolean; source: string; attachmentId?: string; uploadedBy?: string };
type Item = { at: string; key: string; files: HistoryFile[]; node: ReactNode };

/** Files uploaded by the same person within this window of a comment belong to it. */
const SAME_POST_MS = 2 * 60_000;

/**
 * The ticket's history in one box, newest first: updates, workflow steps,
 * visits and every file — attachments sit on the update they were posted
 * with, and visit photos on the visit. "Files" shows only entries with files.
 */
export function Timeline({ ws, onOpenReport }: { ws: Workspace; onOpenReport: (e: LinkedEvent) => void }) {
	const { detail, ticket, workflow, userName, appointmentLabel, canWork, me, reload } = ws;
	const [filter, setFilter] = useState<"all" | "files">("all");
	const [preview, setPreview] = useState<HistoryFile | null>(null);
	const status = (id?: string) => statusOf(workflow, id ?? "")?.name ?? id;

	const items = useMemo(() => {
		const attachments = [...(ticket.attachments ?? [])];
		const used = new Set<string>();
		const asFile = (a: NonNullable<typeof ticket.attachments>[number]): HistoryFile => ({
			key: a.id,
			name: a.name,
			dataUrl: a.dataUrl,
			isImage: a.type.startsWith("image/"),
			source: `Added by ${userName(a.uploadedBy)} · ${dayjs(a.uploadedAt).format("MMM D, h:mm A")}`,
			attachmentId: a.id,
			uploadedBy: a.uploadedBy,
		});

		const list: Item[] = [];
		for (const a of detail.activity) {
			// Uploads are shown as files below; only removals stay as text.
			if (a.kind === "attachment" && !a.comment?.toLowerCase().startsWith("removed")) continue;
			const files =
				a.kind === "comment"
					? attachments
							.filter((f) => !used.has(f.id) && f.uploadedBy === a.userId && Math.abs(new Date(f.uploadedAt).getTime() - new Date(a.at).getTime()) < SAME_POST_MS)
							.map((f) => (used.add(f.id), asFile(f)))
					: [];
			list.push({ at: a.at, key: a.id, files, node: <ActivityItem a={a} status={status} userName={userName} /> });
		}
		// Files posted without a comment get their own entry.
		for (const f of attachments.filter((x) => !used.has(x.id))) {
			list.push({
				at: f.uploadedAt,
				key: `file-${f.id}`,
				files: [asFile(f)],
				node: <Entry icon={<PaperclipIcon className="size-4" />} who={userName(f.uploadedBy)} whoId={f.uploadedBy} at={f.uploadedAt} text={<>attached a file</>} />,
			});
		}
		for (const e of detail.events) {
			const done = e.service?.status === "completed" || e.completed;
			const at = e.service?.checkOutAt ?? e.start;
			const source = `${appointmentLabel(e.type)} · ${dayjs(e.start).format("MMM D")} · ${userName(e.ownerId)}`;
			const files: HistoryFile[] = [
				...(e.service?.photos ?? []).map((p) => ({ key: `${e.id}-${p.id}`, name: p.caption || p.name, dataUrl: p.dataUrl, isImage: true, source })),
				...(e.service?.checklist ?? []).flatMap((c) =>
					(c.photos ?? []).map((p) => ({ key: `${e.id}-${c.id}-${p.id}`, name: `${c.label}${p.caption ? ` · ${p.caption}` : ""}`, dataUrl: p.dataUrl, isImage: true, source })),
				),
			];
			list.push({
				at,
				key: `visit-${e.id}`,
				files,
				node: (
					<Entry
						icon={<CalendarCheckIcon className="size-4" />}
						who={userName(e.ownerId)}
						whoId={e.ownerId}
						at={at}
						text={
							done ? (
								<>
									completed the <b>{appointmentLabel(e.type).toLowerCase()}</b> visit
								</>
							) : (
								<>
									{new Date(e.start) > new Date() ? "has" : "had"} a <b>{appointmentLabel(e.type).toLowerCase()}</b> visit on{" "}
									{dayjs(e.start).format("MMM D, h:mm A")}
								</>
							)
						}
					>
						{e.service && done && (
							<button type="button" className="mt-1 text-brand text-xs hover:underline" onClick={() => onOpenReport(e)}>
								View service report
							</button>
						)}
					</Entry>
				),
			});
		}
		return list.sort((a, b) => b.at.localeCompare(a.at));
	}, [detail, ticket.attachments, userName, appointmentLabel, onOpenReport, status]);

	const fileCount = items.reduce((n, i) => n + i.files.length, 0);
	const shown = filter === "files" ? items.filter((i) => i.files.length > 0) : items;

	async function removeFile(f: HistoryFile) {
		if (!f.attachmentId) return;
		try {
			await apiClient.delete(`/api/tickets/${encodeURIComponent(ticket.id)}/attachments/${encodeURIComponent(f.attachmentId)}`);
			setPreview(null);
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	return (
		<Panel
			title="History"
			icon={<ClockCounterClockwiseIcon className="size-4" />}
			bodyClassName=""
			aside={
				<div className="inline-flex rounded-md border border-border p-0.5 text-xs" role="tablist" aria-label="Show">
					{(["all", "files"] as const).map((f) => (
						<button
							key={f}
							type="button"
							role="tab"
							aria-selected={filter === f}
							onClick={() => setFilter(f)}
							className={`rounded px-2 py-0.5 ${filter === f ? "bg-brand/10 font-medium text-brand" : "text-muted-foreground hover:text-foreground"}`}
						>
							{f === "all" ? "All" : `Files · ${fileCount}`}
						</button>
					))}
				</div>
			}
		>
			<Composer ws={ws} />
			{shown.length === 0 ? (
				<p className="p-4 text-muted-foreground text-sm">{filter === "files" ? "No files yet. Attach them with an update; visit photos appear here too." : "Nothing yet."}</p>
			) : (
				<ol className="flex flex-col gap-4 p-4">
					{shown.map((i) => (
						<li key={i.key}>
							{i.node}
							{i.files.length > 0 && (
								<div className="mt-2 ml-10 flex flex-wrap gap-2">
									{i.files.map((f) =>
										f.isImage ? (
											<button key={f.key} type="button" onClick={() => setPreview(f)} title={f.name} className="overflow-hidden rounded-md border border-border">
												<img src={f.dataUrl} alt={f.name} className="size-20 object-cover" />
											</button>
										) : (
											<a
												key={f.key}
												href={f.dataUrl}
												download={f.name}
												className="flex max-w-56 items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs hover:bg-muted"
											>
												<FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
												<span className="truncate">{f.name}</span>
											</a>
										),
									)}
								</div>
							)}
						</li>
					))}
				</ol>
			)}
			{preview && (
				<Dialog open onOpenChange={(o) => !o && setPreview(null)}>
					<DialogContent className="!max-w-[95vw] sm:!max-w-2xl">
						<DialogTitle className="text-base">{preview.name}</DialogTitle>
						<DialogDescription>{preview.source}</DialogDescription>
						<img src={preview.dataUrl} alt={preview.name} className="max-h-[70vh] w-full rounded object-contain" />
						<div className="flex justify-end gap-2">
							<Button asChild size="sm" variant="secondary">
								<a href={preview.dataUrl} download={preview.name}>
									Download
								</a>
							</Button>
							{preview.attachmentId && (preview.uploadedBy === me.id || canWork) && (
								<Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeFile(preview)}>
									Remove file
								</Button>
							)}
						</div>
					</DialogContent>
				</Dialog>
			)}
		</Panel>
	);
}

function Entry({ icon, who, whoId, at, text, children }: { icon: ReactNode; who: string; whoId?: string | null; at: string; text: ReactNode; children?: ReactNode }) {
	return (
		<div className="flex gap-3">
			<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</span>
			<div className="min-w-0 flex-1 text-sm">
				<p>
					<span className="font-medium">{whoId ? <PersonName person={{ kind: "member", id: whoId }}>{who}</PersonName> : who}</span> {text}
					<span className="ml-1.5 text-muted-foreground text-xs" title={dayjs(at).format("MMM D, YYYY h:mm A")}>
						{dayjs(at).fromNow()}
					</span>
				</p>
				{children}
			</div>
		</div>
	);
}

function ActivityItem({
	a,
	status,
	userName,
}: {
	a: TicketActivity;
	status: (id?: string) => string | undefined;
	userName: (id: string | null | undefined) => string;
}) {
	const who = userName(a.userId);
	const body = a.comment && a.kind !== "attachment" ? <p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2">{a.comment}</p> : null;
	switch (a.kind) {
		case "created":
			return <Entry icon={<PlusCircleIcon className="size-4" />} who={who} whoId={a.userId} at={a.at} text={<>opened the ticket</>} />;
		case "status":
			return (
				<Entry
					icon={<ArrowsLeftRightIcon className="size-4" />}
					who={who} whoId={a.userId}
					at={a.at}
					text={
						<>
							{a.transitionLabel ? <b>{a.transitionLabel}</b> : "moved it"} · {status(a.fromStatusId)} → <b>{status(a.toStatusId)}</b>
						</>
					}
				>
					{body}
				</Entry>
			);
		case "assigned":
			return (
				<Entry
					icon={a.assigneeId ? <ArrowBendUpRightIcon className="size-4" /> : <UserSwitchIcon className="size-4" />}
					who={who} whoId={a.userId}
					at={a.at}
					text={a.assigneeId ? <>forwarded it to <b>{userName(a.assigneeId)}</b></> : <>unassigned it</>}
				>
					{body}
				</Entry>
			);
		case "email":
			return a.email ? (
				<Entry icon={<EnvelopeSimpleIcon className="size-4" />} who={who} whoId={a.userId} at={a.at} text={<>emailed <b>{a.email.to.map((r) => r.name || r.email).join(", ") || "no one"}</b></>}>
					<SentEmailView email={a.email} />
				</Entry>
			) : null;
		case "attachment":
			return <Entry icon={<PaperclipIcon className="size-4" />} who={who} whoId={a.userId} at={a.at} text={<>{a.comment?.toLowerCase().startsWith("removed") ? "removed" : "attached"} <b>{a.comment?.replace(/^(Attached|Removed) /, "")}</b></>} />;
		case "fields":
		case "edited": {
			// Older entries have no details; newer ones list each change ("Priority: Medium → High").
			const lines = a.comment?.split("\n").filter(Boolean) ?? [];
			const added = lines.length === 1 && lines[0].startsWith("Added sub-ticket");
			return (
				<Entry
					icon={added ? <PlusCircleIcon className="size-4" /> : <PencilSimpleIcon className="size-4" />}
					who={who} whoId={a.userId}
					at={a.at}
					text={added ? <>{lines[0].replace(/^Added/, "added")}</> : lines.length ? <>changed {a.kind === "fields" ? "fields" : "the ticket"}</> : <>updated the details</>}
				>
					{!added && lines.length > 0 && (
						<ul className="mt-1 flex flex-col gap-0.5 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs">
							{lines.map((l) => (
								<li key={l}>{l}</li>
							))}
						</ul>
					)}
				</Entry>
			);
		}
		default:
			return (
				<Entry icon={<span className="font-semibold text-[10px]">{initialsOf(who)}</span>} who={who} whoId={a.userId} at={a.at} text={<>posted an update</>}>
					{body}
				</Entry>
			);
	}
}

/** An email sent on a status change: to whom, subject, message, and whether it went out. */
function SentEmailView({ email }: { email: SentEmail }) {
	const [open, setOpen] = useState(false);
	const look =
		email.delivery === "sent"
			? { label: "Sent", className: "bg-emerald-50 text-emerald-800 ring-emerald-200", hint: "" }
			: email.delivery === "simulated"
				? { label: "Simulated", className: "bg-slate-100 text-slate-700 ring-slate-200", hint: "No email service is set up yet: it was only recorded here." }
				: { label: "Not sent", className: "bg-red-50 text-red-800 ring-red-200", hint: email.error ?? "" };
	return (
		<div className="mt-1 overflow-hidden rounded-md border border-border text-sm">
			<button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full flex-wrap items-center justify-between gap-2 bg-muted/30 px-3 py-2 text-left">
				<span className="min-w-0 font-medium">{email.subject}</span>
				<span className={cn("rounded-md px-1.5 py-0.5 font-medium text-[11px] ring-1 ring-inset", look.className)} title={look.hint || undefined}>
					{look.label}
				</span>
			</button>
			{open && (
				<div className="flex flex-col gap-2 border-border border-t px-3 py-2">
					<p className="text-muted-foreground text-xs">To {email.to.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)).join(", ") || "—"}</p>
					<p className="whitespace-pre-wrap leading-relaxed">{email.body}</p>
					{look.hint && <p className="text-muted-foreground text-xs">{look.hint}</p>}
				</div>
			)}
		</div>
	);
}
