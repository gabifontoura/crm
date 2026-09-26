import {
	ArrowBendUpRightIcon,
	ArrowSquareOutIcon,
	CalendarPlusIcon,
	CalendarBlankIcon,
	FileTextIcon,
	InfoIcon,
	ListChecksIcon,
	PaperclipIcon,
	PencilSimpleIcon,
	TrashIcon,
	UploadSimpleIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { PersonName } from "#/components/person/person-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { ApiError, apiClient, errorMessage } from "#/lib/api/client";
import { cn } from "#/lib/utils";
import type { DevelopmentTree } from "../../../../../shared/developments";
import { type FieldValue, fieldErrors, normalizeFieldValues, PRIORITIES, SIGNATURE_FIELD, type TicketAttachment, visibleFields } from "../../../../../shared/tickets";
import { CustomFieldInput, formatFieldValue } from "../custom-field-input";
import { LocationPicker, type LocationValue } from "../location-picker";
import { DueLabel, StatusBadge } from "../ticket-details-dialog";
import { ForwardDialog } from "./forward-dialog";
import { type LinkedEvent, Panel, type Workspace } from "./shared";
import { DOES_VISITS } from "../../../../../shared/users";
import { initialVisit, VisitBooking, visitErrors, visitPayload } from "./visit-booking";
import { useCurrentUser } from "#/lib/auth/use-current-user";

const NONE = "__none__";

async function saveTicket(ws: Workspace, body: Record<string, unknown>, success: string) {
	try {
		await apiClient.put(`/api/tickets/${encodeURIComponent(ws.ticket.id)}`, body);
		toast.success(success);
		await ws.reload();
		return true;
	} catch (e) {
		toast.error(errorMessage(e));
		throw e;
	}
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[96px_1fr] items-start gap-2 py-1.5 text-sm">
			<dt className="pt-1 text-muted-foreground text-xs">{label}</dt>
			<dd className="min-w-0">{children}</dd>
		</div>
	);
}

/* -------------------------------- Details -------------------------------- */

/** The ticket's facts, each shown once; the few quick edits happen right here. */
export function DetailsPanel({ ws, developments }: { ws: Workspace; developments: DevelopmentTree[] }) {
	const { ticket, type, workflow, canWork, isAdmin, closed, userName, assignees, detail, openDetails } = ws;
	const { can } = useCurrentUser();
	const [editing, setEditing] = useState(false);
	const [forwarding, setForwarding] = useState(false);

	return (
		<Panel
			title="Details"
			icon={<InfoIcon className="size-4" />}
			bodyClassName="px-4 py-2"
			aside={
				canWork ? (
					<Button size="icon-sm" variant="ghost" aria-label="Edit ticket" title="Edit title, description, requester and location" onClick={() => setEditing(true)}>
						<PencilSimpleIcon className="size-4" />
					</Button>
				) : null
			}
		>
			<dl className="divide-y divide-border">
				<Row label="Status">
					<StatusBadge workflow={workflow} statusId={ticket.statusId} />
				</Row>
				<Row label="Priority">
					{canWork && !closed ? (
						<Select value={ticket.priority} onValueChange={(v) => saveTicket(ws, { priority: v }, "Priority updated").catch(() => undefined)}>
							<SelectTrigger aria-label="Priority" className="h-8 text-sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PRIORITIES.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : (
						<span className="pt-1 text-sm">{PRIORITIES.find((p) => p.id === ticket.priority)?.label}</span>
					)}
				</Row>
				<Row label="Assignee">
					<div className="flex items-center justify-between gap-2">
						<span className="pt-1 text-sm">{ticket.assigneeId ? <PersonName person={{ kind: "member", id: ticket.assigneeId }}>{userName(ticket.assigneeId)}</PersonName> : userName(null)}</span>
						{canWork && !closed && can("tickets.forward") && (
							<Button size="sm" variant="ghost" className="h-7 px-2 text-brand" title="Hand it to someone else, with a note" onClick={() => setForwarding(true)}>
								<ArrowBendUpRightIcon className="size-4" /> Forward
							</Button>
						)}
					</div>
				</Row>
				{ticket.dueAt && (
					<Row label="Due">
						<div className="flex flex-col">
							<span>{dayjs(ticket.dueAt).format("MMM D, h:mm A")}</span>
							<DueLabel ticket={ticket} closed={closed} />
						</div>
					</Row>
				)}
				<Row label="Type">
					<span className="inline-flex items-center gap-1.5">
						<span className="size-2 rounded-full" style={{ backgroundColor: type?.color }} />
						{type?.name}
					</span>
				</Row>
				<Row label="Location">
					{ticket.property || "—"}
					{ticket.location && <span className="block text-muted-foreground text-xs">{ticket.location}</span>}
				</Row>
				<Row label="Requester">
					{ticket.requester.name ? (
						<PersonName person={{ kind: "customer", name: ticket.requester.name, email: ticket.requester.email }}>{ticket.requester.name}</PersonName>
					) : (
						"—"
					)}
					{ticket.requester.email && (
						<a href={`mailto:${ticket.requester.email}`} className="block truncate text-brand text-xs hover:underline">
							{ticket.requester.email}
						</a>
					)}
					{ticket.requester.phone && (
						<a href={`tel:${ticket.requester.phone}`} className="block text-brand text-xs hover:underline">
							{ticket.requester.phone}
						</a>
					)}
					{ticket.clientName && <span className="block text-muted-foreground text-xs">{ticket.clientName}</span>}
				</Row>
				{detail.parent && (
					<Row label="Parent">
						<button type="button" onClick={() => openDetails(detail.parent!.number)} className="text-left text-brand hover:underline">
							#{detail.parent.number} {detail.parent.title}
						</button>
					</Row>
				)}
				<Row label="Opened">
					{dayjs(ticket.createdAt).format("MMM D, YYYY")}
					<span className="block text-muted-foreground text-xs">
						by <PersonName person={{ kind: "member", id: ticket.reporterId }}>{userName(ticket.reporterId)}</PersonName>
					</span>
				</Row>
			</dl>
			{editing && <EditTicketDialog ws={ws} developments={developments} onClose={() => setEditing(false)} />}
			{forwarding && <ForwardDialog ws={ws} onClose={() => setForwarding(false)} />}
		</Panel>
	);
}

function EditTicketDialog({ ws, developments, onClose }: { ws: Workspace; developments: DevelopmentTree[]; onClose: () => void }) {
	const t = ws.ticket;
	const [title, setTitle] = useState(t.title);
	const [description, setDescription] = useState(t.description);
	const [requester, setRequester] = useState(t.requester);
	const [location, setLocation] = useState<LocationValue>({ developmentId: t.developmentId ?? "", blockId: t.blockId ?? "", unitId: t.unitId ?? "" });
	const [saving, setSaving] = useState(false);
	const [errors, setErrors] = useState<Record<string, string>>({});

	async function save() {
		setSaving(true);
		try {
			await saveTicket(ws, { title, description, requester, ...location }, "Ticket updated");
			onClose();
		} catch (e) {
			if (e instanceof ApiError) setErrors(e.fields);
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="!flex !max-h-[88vh] !max-w-[95vw] flex-col !gap-0 !p-0 sm:!max-w-xl">
				<div className="border-b px-6 pt-6 pb-4">
					<DialogTitle>Edit ticket #{t.number}</DialogTitle>
					<DialogDescription className="mt-1">Title, description, requester and location.</DialogDescription>
				</div>
				<form
					className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5"
					onSubmit={(e) => {
						e.preventDefault();
						save();
					}}
				>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ed-title">Title</Label>
						<Input id="ed-title" value={title} onChange={(e) => setTitle(e.target.value)} />
						{errors.title && <span className="text-destructive text-xs">{errors.title}</span>}
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ed-desc">Description</Label>
						<Textarea id="ed-desc" rows={4} className="resize-none" value={description} onChange={(e) => setDescription(e.target.value)} />
					</div>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<Input aria-label="Requester name" placeholder="Requester" value={requester.name} onChange={(e) => setRequester({ ...requester, name: e.target.value })} />
						<Input aria-label="Requester email" placeholder="Email" value={requester.email} onChange={(e) => setRequester({ ...requester, email: e.target.value })} />
						<Input aria-label="Requester phone" placeholder="Phone" value={requester.phone} onChange={(e) => setRequester({ ...requester, phone: e.target.value })} />
					</div>
					<LocationPicker developments={developments} value={location} onChange={setLocation} errors={errors} idPrefix="ed" />
				</form>
				<div className="flex justify-end gap-2 border-t px-6 py-4">
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={save} disabled={saving || !title.trim()}>
						{saving ? "Saving…" : "Save"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

/* ----------------------------- Custom fields ----------------------------- */

/** The ticket type's own fields: read by default, "Edit" to change them. */
export function FieldsPanel({ ws }: { ws: Workspace }) {
	const { ticket, type, canWork, closed } = ws;
	const [editing, setEditing] = useState(false);
	const [values, setValues] = useState<Record<string, FieldValue>>(ticket.fields);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);
	if (!type || type.fields.length === 0) return null;
	const shown = visibleFields(type.fields, editing ? values : ticket.fields);

	async function save() {
		if (!type) return;
		const norm = normalizeFieldValues(type.fields, values);
		const local = fieldErrors(visibleFields(type.fields, norm), norm, visibleFields(type.fields, norm).filter((f) => f.required).map((f) => f.id));
		setErrors(local);
		if (Object.keys(local).length) return;
		setSaving(true);
		try {
			await saveTicket(ws, { fields: norm }, "Details saved");
			setEditing(false);
		} catch (e) {
			if (e instanceof ApiError) setErrors(e.fields);
		} finally {
			setSaving(false);
		}
	}

	return (
		<Panel
			title={`${type.name} details`}
			icon={<ListChecksIcon className="size-4" />}
			aside={
				canWork && !closed && !editing ? (
					<Button
						size="icon-sm"
						variant="ghost"
						aria-label="Edit details"
						onClick={() => {
							setValues(ticket.fields);
							setErrors({});
							setEditing(true);
						}}
					>
						<PencilSimpleIcon className="size-4" />
					</Button>
				) : null
			}
		>
			{editing ? (
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{shown.map((f) =>
						// Only the customer's signature, on the Tasks screen, fills it.
						f.id === SIGNATURE_FIELD ? (
							<div key={f.id} className="flex flex-col gap-0.5 text-sm sm:col-span-2">
								<span className="text-muted-foreground text-xs">{f.label}</span>
								<span>{formatFieldValue(f, ticket.fields[f.id])}</span>
								<span className="text-[11px] text-muted-foreground">From the customer's signature, collected by the technician on the Tasks screen.</span>
							</div>
						) : (
							<div key={f.id} className={cn(f.kind === "textarea" && "sm:col-span-2")}>
								<CustomFieldInput
									def={f}
									value={values[f.id]}
									onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))}
									required={f.required}
									error={errors[f.id]}
									idPrefix="ws"
								/>
							</div>
						),
					)}
					<div className="flex justify-end gap-2 sm:col-span-2">
						<Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
							Cancel
						</Button>
						<Button size="sm" onClick={save} disabled={saving}>
							{saving ? "Saving…" : "Save"}
						</Button>
					</div>
				</div>
			) : (
				<dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
					{shown.map((f) => (
						<div key={f.id} className={cn("flex flex-col", (f.kind === "textarea" || f.id === SIGNATURE_FIELD) && "sm:col-span-2")}>
							<dt className="text-muted-foreground text-xs">{f.label}</dt>
							<dd className="whitespace-pre-wrap">{formatFieldValue(f, ticket.fields[f.id])}</dd>
						</div>
					))}
				</dl>
			)}
		</Panel>
	);
}

/* --------------------------------- Visits -------------------------------- */

const SERVICE_BADGE: Record<string, { label: string; className: string }> = {
	not_started: { label: "Not started", className: "bg-muted text-muted-foreground" },
	in_progress: { label: "In progress", className: "bg-amber-100 text-amber-800" },
	completed: { label: "Completed", className: "bg-emerald-100 text-emerald-800" },
};

export function serviceStatus(e: LinkedEvent): keyof typeof SERVICE_BADGE {
	if (e.service?.status === "completed" || e.completed) return "completed";
	return e.service?.status ?? "not_started";
}

/** Visits booked for the ticket; book one, open the task, or read its report. */
export function VisitsPanel({ ws, onOpenReport }: { ws: Workspace; onOpenReport: (e: LinkedEvent) => void }) {
	const { detail, canWork, closed, userName, appointmentLabel } = ws;
	const { can } = useCurrentUser();
	const [booking, setBooking] = useState(false);
	// A sub-ticket is done on its parent's visits: they show here too.
	const visits = [...detail.events, ...(detail.parentVisits ?? [])].sort((a, b) => a.start.localeCompare(b.start));
	return (
		<Panel
			title={`Visits${visits.length ? ` · ${visits.length}` : ""}`}
			icon={<CalendarBlankIcon className="size-4" />}
			bodyClassName=""
			aside={
				// Engineering answers questions; the field books the visits.
				canWork && !closed && DOES_VISITS.includes(ws.me.role) && can("calendar.create") ? (
					<Button size="sm" variant="secondary" onClick={() => setBooking(true)}>
						<CalendarPlusIcon className="size-4" /> Schedule
					</Button>
				) : null
			}
		>
			{visits.length === 0 ? (
				<p className="px-4 py-4 text-muted-foreground text-sm">No visits booked.</p>
			) : (
				<ul className="divide-y divide-border">
					{visits.map((e) => {
						const s = SERVICE_BADGE[serviceStatus(e)];
						return (
							<li key={e.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm">
								<div className="flex items-center justify-between gap-2">
									<span className="font-medium">{dayjs(e.start).format("ddd, MMM D · h:mm A")}</span>
									<span className={cn("rounded-full px-2 py-0.5 font-medium text-[11px]", s.className)}>{s.label}</span>
								</div>
								<span className="text-muted-foreground text-xs">
									{appointmentLabel(e.type)} · {userName(e.ownerId)}
									{e.ticketNumber !== String(ws.ticket.number) && ` · visit of #${e.ticketNumber}`}
								</span>
								<div className="flex gap-3 text-xs">
									{e.canOpen && (
										<>
											<Link to="/technician/$activityId" params={{ activityId: e.id }} className="inline-flex items-center gap-1 text-brand hover:underline">
												<ArrowSquareOutIcon className="size-3.5" /> Open task
											</Link>
											<Link to="/calendar" search={{ event: e.id }} className="inline-flex items-center gap-1 text-brand hover:underline">
												<CalendarBlankIcon className="size-3.5" /> Calendar
											</Link>
										</>
									)}
									{e.service && serviceStatus(e) === "completed" && (
										<button type="button" className="inline-flex items-center gap-1 text-brand hover:underline" onClick={() => onOpenReport(e)}>
											<FileTextIcon className="size-3.5" /> Service report
										</button>
									)}
								</div>
							</li>
						);
					})}
				</ul>
			)}
			{booking && <ScheduleVisitDialog ws={ws} onClose={() => setBooking(false)} />}
		</Panel>
	);
}

function ScheduleVisitDialog({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
	const { ticket, detail, userName, reload, booking } = ws;
	const [visit, setVisit] = useState(() => ({ ...initialVisit(booking), useExisting: false }));
	const [submitted, setSubmitted] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const problems = visitErrors(visit);
	// One level: a sub-ticket is done on its parent's visit.
	const host = detail.parent ?? ticket;

	async function book() {
		setSubmitted(true);
		if (Object.keys(problems).length || saving) return;
		const p = visitPayload(visit, booking);
		setSaving(true);
		try {
			await apiClient.post("/api/calendar/events", {
				title: `${booking.appointmentLabel(visit.type)} · Ticket #${host.number} - ${host.title}`,
				type: visit.type,
				mode: "on_site",
				completed: false,
				start: p.start,
				end: p.end,
				project: "",
				client: { id: ticket.clientId, name: p.clientName },
				ticketNumber: String(host.number),
				owner: { id: visit.ownerId, name: userName(visit.ownerId) },
				property: ticket.property,
				developmentId: p.developmentId,
				blockId: p.blockId,
				unitId: p.unitId,
				notes: p.notes,
				billable: false,
				groupActivity: false,
				tags: [],
				hours: [],
				files: [],
				expenses: [],
			});
			toast.success(`Visit booked: ${p.when}`, { description: `${userName(visit.ownerId)} · on the calendar and in their Tasks` });
			await reload();
			onClose();
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="!max-w-[95vw] max-h-[92vh] overflow-y-auto sm:!max-w-2xl">
				<DialogTitle>Schedule a visit</DialogTitle>
				<DialogDescription>
					For ticket #{host.number}
					{detail.parent ? ` (this sub-ticket is one of its actions)` : ""}. It shows up in the Calendar and in the technician's Tasks.
				</DialogDescription>
				<VisitBooking ctx={booking} value={visit} onChange={setVisit} errors={submitted ? problems : {}} allowExisting={false} />
				{error && <p className="text-destructive text-sm">{error}</p>}
				<div className="flex justify-end gap-2">
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={book} disabled={saving}>
						<CalendarPlusIcon className="size-4" />
						{saving ? "Booking…" : "Book visit"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
