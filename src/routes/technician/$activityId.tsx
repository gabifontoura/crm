import { CaretLeftIcon } from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { apiClient, errorMessage } from "#/lib/api/client";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import { isClockRunning, type ServicePhoto, type ServiceReport, serviceMinutes } from "../../../shared/service";
import type { Ticket } from "../../../shared/tickets";
import type { DeferInput } from "./-components/actions-accordion";
import { useCalendarSettings } from "../calendar/-components/use-calendar-settings";
import { TaskDetails } from "./-components/task-details";
import { TASK_THEME, type TaskJob } from "./-components/task-utils";

export const Route = createFileRoute("/technician/$activityId")({
	component: TaskDetailPage,
});

const SAVE_DELAY_MS = 1000;

/** One task (calendar appointment): actions, closing and finishing, tied to its ticket. */
function TaskDetailPage() {
	const navigate = useNavigate();
	const { activityId } = Route.useParams();
	const { user, can } = useCurrentUser();
	const settings = useCalendarSettings(false);
	const [job, setJob] = useState<TaskJob | null>(null);
	const [report, setReport] = useState<ServiceReport | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
	const synced = useRef("");
	const [now, setNow] = useState(Date.now());

	const load = useCallback(async () => {
		if (!user) return;
		try {
			const j = await apiClient.get<TaskJob>(`/api/calendar/events/${encodeURIComponent(activityId)}`);
			setJob(j);
			setReport(j.event.service);
			synced.current = JSON.stringify(j.event.service);
			setSaveState("saved");
			setError(null);
		} catch (e) {
			setError(errorMessage(e));
		}
	}, [activityId, user]);

	useEffect(() => {
		load();
	}, [load]);

	// Live timer while checked in.
	useEffect(() => {
		// Ticks only while the clock runs (not before check-in, nor while paused).
		if (!report || !isClockRunning(report)) return;
		const t = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(t);
	}, [report]);

	const completed = report?.status === "completed";

	// Autosave while the task is open (photos and signature included).
	useEffect(() => {
		if (!report || completed) return;
		const json = JSON.stringify(report);
		if (json === synced.current) return;
		setSaveState("saving");
		const timer = setTimeout(async () => {
			try {
				// The reschedule history is kept by the server; no need to send it back.
				await apiClient.put(`/api/calendar/events/${encodeURIComponent(activityId)}/service`, { report: { ...report, reschedules: [] } });
				synced.current = json;
				setSaveState("saved");
			} catch (e) {
				setSaveState("error");
				toast.error(`Not saved: ${errorMessage(e)}`);
			}
		}, SAVE_DELAY_MS);
		return () => clearTimeout(timer);
	}, [report, completed, activityId]);

	const reportRef = useRef(report);
	reportRef.current = report;

	/**
	 * Saves pending edits first, then creates the sub-ticket; the server's
	 * report (with `deferredTicket` set) replaces the local one.
	 */
	const defer = useCallback(
		async (actionId: string, input: DeferInput) => {
			const base = `/api/calendar/events/${encodeURIComponent(activityId)}`;
			const current = reportRef.current;
			if (current && JSON.stringify(current) !== synced.current) {
				await apiClient.put(`${base}/service`, { report: { ...current, reschedules: [] } });
				synced.current = JSON.stringify(current);
			}
			const res = await apiClient.post<{ ticket: Ticket; report: ServiceReport }>(`${base}/actions/${encodeURIComponent(actionId)}/defer`, input);
			synced.current = JSON.stringify(res.report);
			setReport(res.report);
			setSaveState("saved");
			return res.ticket.number;
		},
		[activityId],
	);

	/** Same as `defer`: saves pending edits, then the server adds the action as a sub-ticket. */
	const addAction = useCallback(
		async (label: string, description: string) => {
			const base = `/api/calendar/events/${encodeURIComponent(activityId)}`;
			const current = reportRef.current;
			if (current && JSON.stringify(current) !== synced.current) {
				await apiClient.put(`${base}/service`, { report: { ...current, reschedules: [] } });
				synced.current = JSON.stringify(current);
			}
			const res = await apiClient.post<{ ticket: Ticket; report: ServiceReport }>(`${base}/actions`, { label, description });
			synced.current = JSON.stringify(res.report);
			setReport(res.report);
			setSaveState("saved");
			return res.ticket.number;
		},
		[activityId],
	);

	/** Saves pending edits, then sends (or takes back) the question; reloads to show its state. */
	const engineering = useCallback(
		async (actionId: string, input: { question: string; photos: ServicePhoto[] } | { withdraw: true }) => {
			const base = `/api/calendar/events/${encodeURIComponent(activityId)}`;
			const current = reportRef.current;
			if (current && JSON.stringify(current) !== synced.current) {
				await apiClient.put(`${base}/service`, { report: { ...current, reschedules: [] } });
				synced.current = JSON.stringify(current);
			}
			await apiClient.post(`${base}/actions/${encodeURIComponent(actionId)}/engineering`, input);
			await load();
		},
		[activityId, load],
	);

	const update = useCallback((fn: (r: ServiceReport) => ServiceReport) => setReport((r) => (r ? fn(r) : r)), []);

	const back = () => navigate({ to: "/technician" });

	return (
		<div className="bg-background pb-10" style={TASK_THEME}>
			<title>Task · CRM</title>
			<div className="mx-auto max-w-7xl bg-card">
				<main className="bg-background p-4 md:p-6">
					<div className="mb-4">
						<Button variant="secondary" size="lg" onClick={back} className="gap-2" data-testid="btn_back">
							<CaretLeftIcon className="h-4 w-4" />
							Back to tasks
						</Button>
					</div>
					{error ? (
						<div className="flex items-center justify-center rounded-lg border border-dashed p-8 text-muted-foreground">{error}</div>
					) : !job || !report ? (
						<div className="flex items-center justify-center rounded-lg border border-dashed p-8 text-muted-foreground">Loading task…</div>
					) : (
						<TaskDetails
							job={job}
							report={report}
							update={update}
							typeLabel={settings.typeDef(job.event.type).label}
							minutes={serviceMinutes(report, now)}
							saveState={saveState}
							onReload={load}
							onDefer={defer}
							onAddAction={addAction}
							onEngineering={engineering}
							readOnly={job.canManage === false}
							canReschedule={can("tasks.reschedule")}
						/>
					)}
				</main>
			</div>
		</div>
	);
}
