import { ArrowBendUpLeftIcon, ArrowLeftIcon, TextAlignLeftIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageLayout } from "#/components/layout/page-layout";
import { Button } from "#/components/ui/button";
import { ApiError, apiClient, errorMessage } from "#/lib/api/client";
import { useSession } from "#/lib/auth/session";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import type { DevelopmentTree } from "../../../shared/developments";
import { isClosedCategory, statusOf, type Transition } from "../../../shared/tickets";
import { DOES_VISITS } from "../../../shared/users";
import { useCalendarSettings } from "../calendar/-components/use-calendar-settings";
import { TicketDetailsDialog } from "./-components/ticket-details-dialog";
import { useTicketConfig } from "./-components/use-ticket-config";
import { EngineeringPanel } from "./-components/workspace/engineering-panel";
import { BillingPanel } from "./-components/workspace/billing-panel";
import { LeadPanel } from "./-components/workspace/lead-panel";
import { ReportDialog } from "./-components/workspace/report-dialog";
import { type LinkedEvent, myVisitToStart, Panel, type TicketDetail, type Workspace, isOpenTicket } from "./-components/workspace/shared";
import { DetailsPanel, FieldsPanel, VisitsPanel } from "./-components/workspace/side-panels";
import { StatusBar } from "./-components/workspace/status-bar";
import { StepDialog } from "./-components/workspace/step-dialog";
import { SubTicketsPanel } from "./-components/workspace/sub-tickets-panel";
import { Timeline } from "./-components/workspace/timeline";
import { NextVisit } from "./-components/workspace/visit-booking";

export const Route = createFileRoute("/tickets/$ticketNumber")({
	component: TicketWorkspacePage,
});

/**
 * Working on a ticket. Top: where it is in its workflow and the next steps
 * (closing is the main button). Main column: description, the type's details, sub-tickets and the
 * history (updates, steps, visits and every file). Side: details and visits.
 */
function TicketWorkspacePage() {
	const { ticketNumber } = Route.useParams();
	const { user, can } = useCurrentUser();
	const navigate = useNavigate();
	const { users } = useSession();
	const isAdmin = can("calendar.viewAll");
	const config = useTicketConfig(user?.id);
	const calendar = useCalendarSettings(false);
	const [detail, setDetail] = useState<TicketDetail | null>(null);
	const [error, setError] = useState<{ status: number; message: string } | null>(null);
	const [developments, setDevelopments] = useState<DevelopmentTree[]>([]);
	const [steps, setSteps] = useState<Transition[] | null>(null);
	const [report, setReport] = useState<LinkedEvent | null>(null);
	const [detailsOf, setDetailsOf] = useState<number | null>(null);

	const reload = useCallback(async () => {
		if (!user) return;
		try {
			setDetail(await apiClient.get<TicketDetail>(`/api/tickets/by-number/${encodeURIComponent(ticketNumber)}`));
			setError(null);
		} catch (e) {
			setError({ status: e instanceof ApiError ? e.status : 0, message: errorMessage(e) });
		}
	}, [ticketNumber, user]);

	// Kept up to date while open: sub-tickets a technician adds on site, answers, steps.
	useEffect(() => {
		const tick = () => document.visibilityState === "visible" && reload();
		const id = window.setInterval(tick, 20_000);
		window.addEventListener("focus", tick);
		return () => {
			window.clearInterval(id);
			window.removeEventListener("focus", tick);
		};
	}, [reload]);

	useEffect(() => {
		setDetail(null);
		reload();
	}, [reload]);

	useEffect(() => {
		if (user) apiClient.get<DevelopmentTree[]>("/api/developments").then(setDevelopments).catch(() => setDevelopments([]));
	}, [user]);

	const appointmentTypes = useMemo(() => {
		const first = ["initial_inspection", "maintenance"];
		return [...calendar.types]
			.sort((a, b) => (first.indexOf(a.id) + 1 || 99) - (first.indexOf(b.id) + 1 || 99))
			.map((t) => ({ id: t.id, label: t.label }));
	}, [calendar.types]);

	const ws: Workspace | null = useMemo(() => {
		if (!detail || !user) return null;
		const ticket = detail.ticket;
		const workflow = config.workflowOf(ticket.typeId);
		const status = statusOf(workflow, ticket.statusId);
		return {
			detail,
			ticket,
			type: config.typeById.get(ticket.typeId),
			workflow,
			me: { id: user.id, role: user.role },
			isAdmin,
			canWork: detail.canWork,
			closed: status ? isClosedCategory(status.category) : false,
			userName: (id) => (id ? (users.find((u) => u.id === id)?.name ?? "Former member") : "Unassigned"),
			assignees: users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, role: u.role, jobTitle: u.jobTitle })),
			workflowOf: config.workflowOf,
			typeOf: (id) => config.typeById.get(id),
			appointmentLabel: (id) => calendar.typeDef(id).label,
			appointmentTypes,
			booking: {
				ticket,
				events: [...detail.events, ...(detail.parentVisits ?? [])],
				developments,
				// Engineers answer questions; they don't go on visits.
				people: users.filter((u) => u.active && DOES_VISITS.includes(u.role)).map((u) => ({ id: u.id, name: u.name, detail: u.jobTitle })),
				canPickOwner: isAdmin,
				meId: user.id,
				appointmentTypes,
				appointmentLabel: (id) => calendar.typeDef(id).label,
				defaultType: workflow?.id === "wf-sales" ? "unit_showing" : "initial_inspection",
			},
			openDetails: setDetailsOf,
			reload,
		};
	}, [detail, user, config, isAdmin, users, calendar, appointmentTypes, developments, reload]);

	if (error) {
		return (
			<PageLayout title={`Ticket #${ticketNumber}`} breadcrumbs={[{ label: "Service" }, { label: "Tickets" }, { label: `#${ticketNumber}` }]}>
				<div className="my-8 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
					<p className="font-medium">{error.status === 404 ? "This ticket doesn't exist." : error.status === 403 ? "This ticket isn't shared with you." : error.message}</p>
					<Button asChild variant="secondary" size="sm">
						<Link to="/tickets">
							<ArrowLeftIcon className="size-4" /> All tickets
						</Link>
					</Button>
				</div>
			</PageLayout>
		);
	}

	if (!ws) {
		return (
			<PageLayout title={`Ticket #${ticketNumber}`} breadcrumbs={[{ label: "Service" }, { label: "Tickets" }, { label: `#${ticketNumber}` }]}>
				<p className="py-12 text-center text-muted-foreground text-sm">Loading ticket…</p>
			</PageLayout>
		);
	}

	const { ticket, type, workflow } = ws;
	const openChildren = detail!.children.filter((c) => isOpenTicket(c, config.workflowOf(c.typeId)));

	return (
		<PageLayout
			title={`#${ticket.number} · ${ticket.title}`}
			subtitle={[type?.name, ticket.requester.name, [ticket.property, ticket.location].filter(Boolean).join(" · ")].filter(Boolean).join("  ·  ")}
			breadcrumbs={[{ label: "Service" }, { label: "Tickets" }, { label: `#${ticket.number}` }]}
			actions={
				<Button asChild variant="secondary" size="sm">
					<Link to="/tickets">
						<ArrowLeftIcon className="size-4" /> All tickets
					</Link>
				</Button>
			}
		>
			<div className="grid grid-cols-1 gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_340px]">
				<div className="flex min-w-0 flex-col gap-4">
					<StatusBar ws={ws} onStep={setSteps} />
					{/* Engineering comes to answer the question: it goes first for them. */}
					{ws.me.role === "engineer" ? (
						<>
							<EngineeringPanel ws={ws} />
							<NextVisit ws={ws} />
						</>
					) : (
						<>
							<NextVisit ws={ws} />
							<EngineeringPanel ws={ws} />
						</>
					)}
					<LeadPanel ws={ws} />
					<BillingPanel ws={ws} />

					{detail!.parent && (
						<button
							type="button"
							onClick={() => setDetailsOf(detail!.parent!.number)}
							className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-left text-sm shadow-sm hover:bg-muted/40"
						>
							<ArrowBendUpLeftIcon className="size-4 text-muted-foreground" />
							Sub-ticket of <b>#{detail!.parent.number}</b> {detail!.parent.title}
						</button>
					)}

					<Panel title="Description" icon={<TextAlignLeftIcon className="size-4" />}>
						<p className="whitespace-pre-wrap text-sm leading-relaxed">{ticket.description || <span className="text-muted-foreground">No description.</span>}</p>
					</Panel>
					{/* The type's own fields (e.g. Sales inquiry details), right under what the ticket is about. */}
					<FieldsPanel key={ticket.updatedAt} ws={ws} />

					{/* One level only: a sub-ticket has no sub-tickets. */}
					{!detail!.parent && <SubTicketsPanel ws={ws} />}
					<Timeline ws={ws} onOpenReport={setReport} />
				</div>

				<aside className="flex flex-col gap-4">
					<DetailsPanel ws={ws} developments={developments} />
					<VisitsPanel ws={ws} onOpenReport={setReport} />
				</aside>
			</div>

			{steps && workflow && (
				<StepDialog
					ticket={ticket}
					type={type}
					workflow={workflow}
					steps={steps}
					openChildren={openChildren}
					workflowOf={config.workflowOf}
					role={ws.me.role}
					rescheduled={detail!.rescheduledChildren}
					booking={ws.booking}
					onClose={() => setSteps(null)}
					onDone={() => {
						// "Start work" and the like: once the ticket is in progress, go straight to the visit.
						const to = statusOf(workflow, steps[steps.length - 1].to);
						const visit = to?.category === "in_progress" && user ? myVisitToStart(detail?.events ?? [], user.id) : undefined;
						setSteps(null);
						if (visit) {
							navigate({ to: "/technician/$activityId", params: { activityId: visit.id } });
							return;
						}
						reload();
					}}
				/>
			)}
			{report && <ReportDialog ws={ws} event={report} onClose={() => setReport(null)} />}
			<TicketDetailsDialog ticketNumber={detailsOf} onOpenChange={(o) => !o && setDetailsOf(null)} onChanged={reload} />
		</PageLayout>
	);
}
