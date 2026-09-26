import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient, errorMessage } from "#/lib/api/client";
import { useSession } from "#/lib/auth/session";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import type { DevelopmentTree } from "../../../shared/developments";
import { useCalendarSettings } from "../calendar/-components/use-calendar-settings";
import { ALL, type TaskFilters, TaskList } from "./-components/task-list";
import { TASK_THEME, type WireEvent } from "./-components/task-utils";

export const Route = createFileRoute("/technician/")({
	component: TasksPage,
});

const INITIAL_FILTERS: TaskFilters = {
	kind: "all",
	period: "today",
	technician: ALL,
	development: ALL,
	block: ALL,
	unit: ALL,
	date: "",
};

/** "Tasks": the calendar appointments of the signed-in technician (or the whole team, for admins). */
function TasksPage() {
	const navigate = useNavigate();
	const { user, can, seesTeam } = useCurrentUser();
	const { users } = useSession();
	// Admins manage the team's tasks; engineering (and accesses set to see the team) follow them all too.
	const isAdmin = seesTeam;
	const settings = useCalendarSettings(false);
	const [tasks, setTasks] = useState<WireEvent[]>([]);
	const [developments, setDevelopments] = useState<DevelopmentTree[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFilters] = useState<TaskFilters>(INITIAL_FILTERS);

	const load = useCallback(async () => {
		if (!user) return;
		try {
			const [events, devs] = await Promise.all([
				apiClient.get<WireEvent[]>("/api/calendar/events"),
				apiClient.get<DevelopmentTree[]>("/api/developments").catch(() => [] as DevelopmentTree[]),
			]);
			setTasks(events);
			setDevelopments(devs);
			setError(null);
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setLoading(false);
		}
	}, [user]);

	useEffect(() => {
		setFilters(INITIAL_FILTERS);
		load();
	}, [load]);

	// Everyone who has tasks in the list, plus active non-admin members.
	const technicians = useMemo(() => {
		if (!isAdmin) return null;
		const map = new Map<string, string>();
		for (const u of users) if (u.active && u.role !== "admin") map.set(u.id, u.name);
		for (const t of tasks) map.set(t.owner.id, t.owner.name);
		return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
	}, [isAdmin, users, tasks]);

	return (
		<div className="bg-background pb-10" style={TASK_THEME}>
			<title>Tasks · CRM</title>
			<div className="mx-auto max-w-7xl bg-card">
				<main className="bg-background p-4 md:p-6">
					<div className="mx-auto">
						<div className="mb-4">
							<h1 className="font-semibold text-lg sm:text-xl">Tasks</h1>
							<p className="text-muted-foreground text-[15px]">{isAdmin ? "Inspections and repairs across the team" : "Your inspections and repairs"}</p>
						</div>
						{error && <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-[15px]">{error}</div>}
						<TaskList
							tasks={tasks}
							developments={developments}
							technicians={technicians}
							loading={loading}
							filters={filters}
							onFiltersChange={(f) => setFilters((prev) => ({ ...prev, ...f }))}
							typeLabel={(type) => settings.typeDef(type).label}
							onSelect={(task) => navigate({ to: "/technician/$activityId", params: { activityId: task.id } })}
							onRescheduled={load}
							canManage={(task) => (can("calendar.viewAll") || task.owner.id === user?.id) && can("tasks.reschedule")}
						/>
					</div>
				</main>
			</div>
		</div>
	);
}
