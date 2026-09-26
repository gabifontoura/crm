import { ArrowBendUpRightIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { apiClient, errorMessage } from "#/lib/api/client";
import { PRIORITIES, statusOf } from "../../../../../shared/tickets";
import { roleLabel } from "../../../../../shared/users";
import type { Workspace } from "./shared";

/**
 * Hands the ticket to someone else the way you forward an email: pick who
 * gets it, add a note, and the whole thread (history, files, visits) goes along.
 */
export function ForwardDialog({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
	const { ticket, workflow, me, userName, assignees, detail } = ws;
	const navigate = useNavigate();
	const [to, setTo] = useState("");
	const [message, setMessage] = useState("");
	const [sending, setSending] = useState(false);
	const people = assignees.filter((u) => u.id !== ticket.assigneeId);
	const files = (ticket.attachments?.length ?? 0) + detail.events.reduce((n, e) => n + (e.service?.photos?.length ?? 0), 0);
	const updates = detail.activity.filter((a) => a.kind === "comment").length;

	async function send() {
		if (!to || sending) return;
		setSending(true);
		try {
			const res = await apiClient.post<{ stillVisible: boolean }>(`/api/tickets/${encodeURIComponent(ticket.id)}/forward`, { to, message });
			toast.success(`Forwarded to ${userName(to)}`);
			onClose();
			if (res.stillVisible) await ws.reload();
			else navigate({ to: "/tickets" });
		} catch (e) {
			toast.error(errorMessage(e));
			setSending(false);
		}
	}

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="!flex !max-h-[88vh] !max-w-[95vw] flex-col !gap-0 !p-0 sm:!max-w-xl">
				<div className="border-b px-6 pt-6 pb-4">
					<DialogTitle className="flex items-center gap-2">
						<ArrowBendUpRightIcon className="size-5 text-brand" /> Forward ticket
					</DialogTitle>
					<DialogDescription className="mt-1">The person you pick becomes the assignee and gets the full history.</DialogDescription>
				</div>

				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto text-sm">
					<div className="grid grid-cols-[72px_1fr] items-center gap-x-3 gap-y-2 border-b px-6 py-3">
						<span className="text-muted-foreground text-xs">From</span>
						<span>{userName(me.id)}</span>
						<label htmlFor="fwd-to" className="text-muted-foreground text-xs">
							To
						</label>
						<Select value={to} onValueChange={setTo}>
							<SelectTrigger id="fwd-to" className="h-8">
								<SelectValue placeholder="Pick a team member" />
							</SelectTrigger>
							<SelectContent>
								{people.map((u) => (
									<SelectItem key={u.id} value={u.id}>
										{u.name}
										<span className="text-muted-foreground text-xs"> · {u.jobTitle || (u.role ? roleLabel(u.role) : "")}</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<span className="text-muted-foreground text-xs">Subject</span>
						<span className="truncate">
							Fwd: #{ticket.number} · {ticket.title}
						</span>
					</div>

					<div className="flex flex-col gap-3 px-6 py-4">
						<Textarea
							aria-label="Message"
							rows={4}
							autoFocus
							className="resize-none"
							placeholder={to ? `Note for ${userName(to).split(" ")[0]}: context, what's done, what's left…` : "Add a note: context, what's done, what's left…"}
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
							}}
						/>

						<div className="rounded-lg border-border border-l-2 bg-muted/30 px-3 py-2 text-xs">
							<p className="mb-1 text-muted-foreground">---------- Forwarded ticket ----------</p>
							<p>
								<b>#{ticket.number}</b> {ticket.title}
							</p>
							<p className="text-muted-foreground">
								{statusOf(workflow, ticket.statusId)?.name} · {PRIORITIES.find((p) => p.id === ticket.priority)?.label} priority · currently with {userName(ticket.assigneeId)}
							</p>
							{ticket.description && <p className="mt-1 line-clamp-3 whitespace-pre-wrap">{ticket.description}</p>}
							<p className="mt-1 text-muted-foreground">
								Includes {updates} update{updates === 1 ? "" : "s"}, {files} file{files === 1 ? "" : "s"}
								{detail.children.length > 0 && `, ${detail.children.length} sub-ticket${detail.children.length === 1 ? "" : "s"}`}
								{detail.events.length > 0 && `, ${detail.events.length} visit${detail.events.length === 1 ? "" : "s"}`}.
							</p>
						</div>
						{!ws.isAdmin && ticket.assigneeId === me.id && (
							<p className="text-muted-foreground text-xs">Once forwarded, it leaves your list unless you have a visit on it.</p>
						)}
					</div>
				</div>

				<div className="flex justify-end gap-2 border-t px-6 py-3">
					<Button variant="secondary" size="sm" onClick={onClose}>
						Cancel
					</Button>
					<Button size="sm" disabled={!to || sending} onClick={send}>
						<ArrowBendUpRightIcon className="size-4" />
						{sending ? "Forwarding…" : "Forward"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
