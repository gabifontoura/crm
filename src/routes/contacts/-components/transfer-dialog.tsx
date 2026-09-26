import { ArrowBendUpRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { apiClient, errorMessage } from "#/lib/api/client";
import type { Contact } from "../../../../shared/contacts";

const NONE = "__none__";

/**
 * Hands leads to someone else's portfolio with a note, like forwarding an
 * email: the new owner gets the whole history.
 */
export function TransferDialog({
	contacts,
	people,
	isAdmin,
	ownerName,
	onClose,
	onDone,
}: {
	contacts: Contact[];
	people: { id: string; name: string; detail?: string }[];
	isAdmin: boolean;
	ownerName: (id: string | null) => string;
	onClose: () => void;
	onDone: () => void;
}) {
	const [to, setTo] = useState("");
	const [message, setMessage] = useState("");
	const [sending, setSending] = useState(false);
	const owners = [...new Set(contacts.map((c) => c.ownerId))];

	async function send() {
		if (!to || sending) return;
		setSending(true);
		try {
			const res = await apiClient.post<{ moved: number }>("/api/contacts/transfer", { ids: contacts.map((c) => c.id), to: to === NONE ? null : to, message });
			toast.success(`${res.moved} lead${res.moved === 1 ? "" : "s"} moved to ${to === NONE ? "unassigned" : `${ownerName(to)}'s portfolio`}`);
			onDone();
		} catch (e) {
			toast.error(errorMessage(e));
			setSending(false);
		}
	}

	return (
		<Dialog open onOpenChange={(o) => !o && !sending && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogTitle className="flex items-center gap-2">
					<ArrowBendUpRightIcon className="size-5 text-brand" /> Transfer {contacts.length === 1 ? contacts[0].name : `${contacts.length} leads`}
				</DialogTitle>
				<DialogDescription>
					From {owners.length === 1 ? (owners[0] ? `${ownerName(owners[0])}'s portfolio` : "unassigned") : `${owners.length} portfolios`}. The new owner sees the
					whole history and your note.
				</DialogDescription>
				<div className="flex flex-col gap-3 pt-2">
					<Select value={to} onValueChange={setTo}>
						<SelectTrigger aria-label="Move to">
							<SelectValue placeholder="Move to whose portfolio?" />
						</SelectTrigger>
						<SelectContent>
							{isAdmin && <SelectItem value={NONE}>Unassigned (nobody)</SelectItem>}
							{people.map((p) => (
								<SelectItem key={p.id} value={p.id}>
									{p.name}
									{p.detail && <span className="text-muted-foreground text-xs"> · {p.detail}</span>}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Textarea
						aria-label="Note for the new owner"
						rows={4}
						className="resize-none"
						placeholder="Note for them: where things stand, what was promised, when to call…"
						value={message}
						onChange={(e) => setMessage(e.target.value)}
					/>
					{contacts.length > 1 && (
						<p className="max-h-20 overflow-y-auto text-muted-foreground text-xs">{contacts.map((c) => c.name).join(" · ")}</p>
					)}
				</div>
				<div className="flex justify-end gap-2 pt-2">
					<Button variant="secondary" size="sm" onClick={onClose} disabled={sending}>
						Cancel
					</Button>
					<Button size="sm" onClick={send} disabled={!to || sending}>
						<ArrowBendUpRightIcon className="size-4" /> {sending ? "Moving…" : "Transfer"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
