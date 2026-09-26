import {
	CaretDownIcon,
	CaretUpIcon,
	CopyIcon,
	DownloadSimpleIcon,
	FileTextIcon,
	FloppyDiskIcon,
	PencilSimpleIcon,
	PlusIcon,
	PrinterIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageLayout } from "#/components/layout/page-layout";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { apiClient, errorMessage } from "#/lib/api/client";
import { useSession } from "#/lib/auth/session";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import { cn } from "#/lib/utils";
import { type Contact, contactStagesFrom } from "../../../shared/contacts";
import type { DevelopmentTree } from "../../../shared/developments";
import { type PeriodKind, PERIODS, type Report } from "../../../shared/reports";
import type { Ticket } from "../../../shared/tickets";
import { useCalendarSettings } from "../calendar/-components/use-calendar-settings";
import { useTicketConfig } from "../tickets/-components/use-ticket-config";
import { type ReportData, type ReportEvent, type ReportLookups, type Row, runReport, toCsv } from "./-components/engine";
import { DEFAULT_COLUMNS, ReportEditor } from "./-components/report-editor";

const ADHOC = "__adhoc__";
/** Long text columns wrap (with a sensible width); the rest stay on one line. */
const WIDE = new Set(["title", "name", "location", "client", "requester", "parent", "company", "field:root_cause", "field:work_done"]);

export const Route = createFileRoute("/reports/")({
	// `draft`: an unsaved report opened from a dashboard widget ("See the rows").
	validateSearch: (s: Record<string, unknown>): { id?: string; draft?: string } => ({
		...(typeof s.id === "string" ? { id: s.id } : {}),
		...(typeof s.draft === "string" ? { draft: s.draft } : {}),
	}),
	component: ReportsPage,
});

function blank(ownerId: string): Report {
	const now = new Date().toISOString();
	return {
		id: ADHOC,
		name: "New report",
		description: "",
		ownerId,
		shared: false,
		source: "tickets",
		columns: DEFAULT_COLUMNS.tickets,
		dateField: "created",
		period: { kind: "30d" },
		filters: { state: "all" },
		groupBy: null,
		sort: { column: "created", dir: "desc" },
		createdAt: now,
		updatedAt: now,
	};
}

/**
 * Reports: saved tables of tickets, appointments or leads for a closed period,
 * grouped with subtotals, sorted, exported to Excel (CSV) or printed to PDF.
 * Anyone can change the period, grouping and sorting while reading; the owner
 * saves those as the report's defaults.
 */
function ReportsPage() {
	const { user } = useCurrentUser();
	const { users } = useSession();
	const { id: selectedId, draft: draftParam } = Route.useSearch();
	const navigate = useNavigate({ from: "/reports/" });
	const config = useTicketConfig(user?.id);
	const calendar = useCalendarSettings(false);

	const [reports, setReports] = useState<Report[] | null>(null);
	const [data, setData] = useState<ReportData | null>(null);
	const [stagesValue, setStagesValue] = useState<unknown>(null);
	const [developments, setDevelopments] = useState<DevelopmentTree[]>([]);
	const [draft, setDraft] = useState<Report | null>(null);
	/** Reader's own period / grouping / sorting (not saved). */
	const [view, setView] = useState<Partial<Pick<Report, "period" | "groupBy" | "sort">>>({});
	const [saving, setSaving] = useState(false);

	const load = useCallback(async () => {
		try {
			setReports(await apiClient.get<Report[]>("/api/reports"));
		} catch (e) {
			toast.error(errorMessage(e));
			setReports([]);
		}
	}, []);

	useEffect(() => {
		if (!user) return;
		load();
		Promise.all([
			apiClient.get<Ticket[]>("/api/tickets").catch(() => []),
			apiClient.get<Contact[]>("/api/contacts").catch(() => []),
			apiClient.get<ReportEvent[]>("/api/calendar/events").catch(() => []),
			apiClient.get<{ value: unknown }>("/api/settings/contactStages").catch(() => ({ value: null })),
			apiClient.get<DevelopmentTree[]>("/api/developments").catch(() => []),
		]).then(([tickets, contacts, events, st, devs]) => {
			setData({ tickets, contacts, events });
			setStagesValue(st.value);
			setDevelopments(devs);
		});
	}, [user, load]);

	// A report handed over by a dashboard widget opens as an unsaved draft.
	useEffect(() => {
		if (!draftParam || !user) return;
		try {
			setDraft({ ...blank(user.id), ...(JSON.parse(draftParam) as Partial<Report>), id: ADHOC });
		} catch {
			/* ignore a broken link */
		}
	}, [draftParam, user]);

	const lk: ReportLookups = useMemo(
		() => ({
			meId: user?.id ?? "",
			userName: (id) => (id ? (users.find((u) => u.id === id)?.name ?? "Former member") : "Unassigned"),
			types: config.types,
			typeById: config.typeById,
			workflowOf: config.workflowOf,
			contactStages: contactStagesFrom(stagesValue),
			developmentName: (id) => (id ? (developments.find((d) => d.id === id)?.name ?? null) : null),
			appointment: (id) => {
				const t = calendar.typeDef(id);
				return { label: t.label, color: t.border };
			},
		}),
		[user?.id, users, config.types, config.typeById, config.workflowOf, stagesValue, developments, calendar],
	);
	const people = useMemo(() => users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name })), [users]);

	const saved = draftParam ? null : (reports?.find((r) => r.id === selectedId) ?? reports?.[0] ?? null);
	const editing = Boolean(draft);
	const base = draft ?? saved;
	const report = base ? (editing ? base : { ...base, ...view }) : null;
	const canEdit = Boolean(saved && user && (saved.ownerId === user.id || user.role === "admin"));
	const result = useMemo(() => (report && data ? runReport(report, data, lk) : null), [report, data, lk]);

	useEffect(() => setView({}), [saved?.id]);

	const change = (patch: Partial<Report>) => (editing ? setDraft((d) => (d ? { ...d, ...patch } : d)) : setView((v) => ({ ...v, ...patch })));

	function guard(action: () => void) {
		if (editing && !window.confirm("Discard the changes to this report?")) return;
		setDraft(null);
		action();
	}

	async function save() {
		if (!draft) return;
		setSaving(true);
		try {
			if (draft.id === ADHOC) {
				const out = await apiClient.post<Report>("/api/reports", draft);
				setReports((l) => [...(l ?? []), out]);
				setDraft(null);
				navigate({ search: { id: out.id } });
			} else {
				const out = await apiClient.put<Report>(`/api/reports/${encodeURIComponent(draft.id)}`, draft);
				setReports((l) => (l ?? []).map((r) => (r.id === out.id ? out : r)));
				setDraft(null);
			}
			toast.success("Report saved");
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	async function remove() {
		if (!saved || !window.confirm(`Delete the report "${saved.name}"?`)) return;
		try {
			await apiClient.delete(`/api/reports/${encodeURIComponent(saved.id)}`);
			setDraft(null);
			setReports((l) => (l ?? []).filter((r) => r.id !== saved.id));
			navigate({ search: {} });
			toast.success("Report deleted");
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	function exportCsv() {
		if (!result || !report) return;
		// The group goes first as its own column, unless it's already one of the columns.
		const groupLabel = report.groupBy && !report.columns.includes(report.groupBy) ? (result.columns.find((c) => c.id === report.groupBy)?.label ?? "Group") : null;
		const blob = new Blob([toCsv(result, groupLabel)], { type: "text/csv;charset=utf-8" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `${report.name.replace(/[^\w-]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	function openRow(r: Row) {
		if (!r.href) return;
		if (r.href.to === "/tickets/$ticketNumber") navigate({ to: r.href.to, params: r.href.params });
		else if (r.href.to === "/technician/$activityId") navigate({ to: r.href.to, params: r.href.params });
		else navigate({ to: "/contacts" });
	}

	const mine = (reports ?? []).filter((r) => r.ownerId === user?.id);
	const others = (reports ?? []).filter((r) => r.ownerId !== user?.id);
	const groupable = result?.columns.filter((c) => c.groupable) ?? [];

	return (
		<PageLayout
			title="Reports"
			subtitle="Detailed lists for a period: to check, justify, send or archive"
			breadcrumbs={[{ label: "Service" }, { label: "Reports" }]}
			actions={
				<Button size="sm" onClick={() => guard(() => user && setDraft(blank(user.id)))} className="print:hidden">
					<PlusIcon className="size-4" /> New report
				</Button>
			}
		>
			<div className="flex flex-col gap-4 py-4 2xl:flex-row">
				{/* Report list */}
				{/* The list: a side column on very wide screens, a picker above the report otherwise. */}
				<div className="2xl:hidden print:hidden">
					{reports && reports.length > 0 && (
						<Select value={editing && draft?.id === ADHOC ? "" : (saved?.id ?? "")} onValueChange={(id) => guard(() => navigate({ search: { id } }))}>
							<SelectTrigger aria-label="Report" className="h-9 w-full bg-card sm:w-80">
								<SelectValue placeholder="Pick a report" />
							</SelectTrigger>
							<SelectContent>
								{reports.map((r) => (
									<SelectItem key={r.id} value={r.id}>
										{r.name}
										<span className="text-muted-foreground text-xs"> · {r.ownerId === user?.id ? "yours" : "shared"}</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</div>
				<nav aria-label="Reports" className="hidden shrink-0 flex-col gap-3 2xl:flex 2xl:w-60 print:hidden">
					{reports === null ? (
						<p className="text-muted-foreground text-sm">Loading…</p>
					) : (
						<>
							{[
								{ title: "Your reports", list: mine },
								{ title: "Shared with the team", list: others },
							].map(
								(g) =>
									g.list.length > 0 && (
										<div key={g.title} className="flex flex-col gap-1">
											<h2 className="px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">{g.title}</h2>
											{g.list.map((r) => (
												<button
													key={r.id}
													type="button"
													onClick={() => guard(() => navigate({ search: { id: r.id } }))}
													aria-current={saved?.id === r.id && !draftParam ? "page" : undefined}
													className={cn(
														"flex items-start gap-2 rounded-lg border-l-2 px-2 py-1.5 text-left",
														saved?.id === r.id && !editing ? "border-brand bg-brand/5 text-brand" : "border-transparent hover:bg-muted",
													)}
												>
													<FileTextIcon className="mt-0.5 size-4 shrink-0" />
													<span className="min-w-0">
														<span className="block truncate font-medium text-sm">{r.name}</span>
														<span className="block truncate text-muted-foreground text-xs">{r.description || r.source}</span>
													</span>
												</button>
											))}
										</div>
									),
							)}
						</>
					)}
				</nav>

				<div className="flex min-w-0 flex-1 flex-col gap-3">
					{!report ? (
						<div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground text-sm">Pick a report or create one.</div>
					) : (
						<>
							{/* Title for print */}
							<div className="hidden print:block">
								<h1 className="font-semibold text-xl">{report.name}</h1>
								<p className="text-sm">
									{result?.periodLabel} · {result?.count} rows · generated {new Date().toLocaleString("en-US")}
								</p>
							</div>

							<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm print:hidden">
								<div className="flex min-w-0 flex-wrap items-center gap-2">
									<div className="min-w-0">
										<h2 className="truncate font-semibold text-base">{report.name}</h2>
										{report.description && <p className="truncate text-muted-foreground text-xs">{report.description}</p>}
									</div>
								</div>
								<div className="flex flex-wrap items-center gap-1.5">
									{editing ? (
										<>
											{draft!.id !== ADHOC && (
												<Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}>
													<TrashIcon className="size-4" /> Delete
												</Button>
											)}
											<Button
												size="sm"
												variant="secondary"
												onClick={() => {
													setDraft(null);
													if (draftParam) navigate({ search: {} });
												}}
												disabled={saving}
											>
												<XIcon className="size-4" /> {draft!.id === ADHOC ? "Close" : "Discard"}
											</Button>
											<Button size="sm" onClick={save} disabled={saving || !draft!.name.trim()}>
												<FloppyDiskIcon className="size-4" /> {saving ? "Saving…" : draft!.id === ADHOC ? "Save report" : "Save"}
											</Button>
										</>
									) : (
										<>
											<Button size="sm" variant="secondary" onClick={exportCsv} disabled={!result?.count}>
												<DownloadSimpleIcon className="size-4" /> Excel (CSV)
											</Button>
											<Button size="sm" variant="secondary" onClick={() => window.print()} disabled={!result?.count}>
												<PrinterIcon className="size-4" /> Print / PDF
											</Button>
											{canEdit ? (
												<Button size="sm" onClick={() => setDraft(structuredClone({ ...saved!, ...view }))}>
													<PencilSimpleIcon className="size-4" /> Edit
												</Button>
											) : (
												<Button size="sm" variant="secondary" onClick={() => setDraft({ ...structuredClone({ ...saved!, ...view }), id: ADHOC, name: `${saved!.name} (my copy)`, shared: false })}>
													<CopyIcon className="size-4" /> Save a copy
												</Button>
											)}
										</>
									)}
								</div>
							</div>

							{editing && (
								<ReportEditor
									report={draft!}
									types={config.types}
									appointmentTypes={calendar.types.map((t) => ({ id: t.id, label: t.label }))}
									people={people}
									onChange={change}
								/>
							)}

							{/* Reader controls: period and grouping (saved only when editing) */}
							<div className="flex flex-wrap items-end gap-2 print:hidden">
								<label className="flex flex-col gap-1 text-xs">
									<span className="text-muted-foreground">Period</span>
									<Select value={report.period.kind} onValueChange={(v) => change({ period: { ...report.period, kind: v as PeriodKind } })}>
										<SelectTrigger className="h-8 w-40 bg-card text-sm">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{PERIODS.map((p) => (
												<SelectItem key={p.id} value={p.id}>
													{p.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</label>
								{report.period.kind === "custom" && (
									<>
										<label className="flex flex-col gap-1 text-xs">
											<span className="text-muted-foreground">From</span>
											<Input type="date" className="h-8 w-40 bg-card text-sm" value={report.period.from ?? ""} onChange={(e) => change({ period: { ...report.period, from: e.target.value || null } })} />
										</label>
										<label className="flex flex-col gap-1 text-xs">
											<span className="text-muted-foreground">To</span>
											<Input type="date" className="h-8 w-40 bg-card text-sm" value={report.period.to ?? ""} onChange={(e) => change({ period: { ...report.period, to: e.target.value || null } })} />
										</label>
									</>
								)}
								<label className="flex flex-col gap-1 text-xs">
									<span className="text-muted-foreground">Group by</span>
									<Select value={report.groupBy ?? "__none__"} onValueChange={(v) => change({ groupBy: v === "__none__" ? null : v })}>
										<SelectTrigger className="h-8 w-44 bg-card text-sm">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__none__">No grouping</SelectItem>
											{groupable.map((c) => (
												<SelectItem key={c.id} value={c.id}>
													{c.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</label>
								{result && (
									<span className="pb-1.5 text-muted-foreground text-xs">
										{result.periodLabel} · {result.count} {result.count === 1 ? "row" : "rows"}
										{!editing && Object.keys(view).length > 0 && " · your view (not saved)"}
									</span>
								)}
							</div>

							{!result ? (
								<p className="py-12 text-center text-muted-foreground text-sm">Loading data…</p>
							) : result.count === 0 ? (
								<div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground text-sm">No rows for this period and these filters.</div>
							) : (
								<div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm print:overflow-visible print:border-0 print:shadow-none">
									<table className="w-full text-sm print:text-xs">
										<thead className="border-border border-b bg-muted/40 text-left text-muted-foreground text-xs">
											<tr>
												{result.columns.map((c) => {
													const active = report.sort.column === c.id;
													const numeric = c.kind !== "text" && c.kind !== "date" && c.kind !== "datetime" && c.kind !== "bool";
													return (
														<th key={c.id} className={cn("px-2.5 py-2 align-bottom font-semibold leading-tight", numeric && "text-right")} aria-sort={active ? (report.sort.dir === "asc" ? "ascending" : "descending") : "none"}>
															<button
																type="button"
																className="inline-flex items-end gap-1 text-left hover:text-foreground print:pointer-events-none"
																onClick={() => change({ sort: { column: c.id, dir: active && report.sort.dir === "desc" ? "asc" : "desc" } })}
															>
																{c.label}
																{active && (report.sort.dir === "asc" ? <CaretUpIcon className="size-3" /> : <CaretDownIcon className="size-3" />)}
															</button>
														</th>
													);
												})}
											</tr>
										</thead>
										<tbody>
											{result.sections.map((s) => (
												<Fragment key={s.key}>
													{report.groupBy && (
														<tr className="border-border border-t bg-muted/20">
															<td colSpan={result.columns.length} className="px-3 py-1.5 font-semibold text-xs">
																<span className="inline-flex items-center gap-1.5">
																	{s.color && <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />}
																	{s.label} <span className="font-normal text-muted-foreground">· {s.rows.length}</span>
																</span>
															</td>
														</tr>
													)}
													{s.rows.map((r) => (
														<tr key={r.id} className="cursor-pointer border-border border-t hover:bg-muted/30 print:cursor-auto" onClick={() => openRow(r)}>
															{result.columns.map((c) => {
																const cell = r.cells[c.id];
																const numeric = c.kind !== "text" && c.kind !== "date" && c.kind !== "datetime" && c.kind !== "bool";
																return (
																	<td key={c.id} className={cn("px-2.5 py-1.5 align-top", numeric && "text-right tabular-nums", WIDE.has(c.id) ? "min-w-44" : "whitespace-nowrap")}>
																		{cell?.color && <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ backgroundColor: cell.color }} />}
																		{cell?.text}
																	</td>
																);
															})}
														</tr>
													))}
													{report.groupBy && Object.keys(s.totals).length > 0 && (
														<tr className="border-border border-t text-muted-foreground text-xs">
															{result.columns.map((c, i) => (
																<td key={c.id} className={cn("px-3 py-1", s.totals[c.id] && "text-right tabular-nums")}>
																	{s.totals[c.id]?.text ?? (i === 0 ? `Subtotal ${s.label}` : "")}
																</td>
															))}
														</tr>
													)}
												</Fragment>
											))}
										</tbody>
										<tfoot className="border-border border-t-2 bg-muted/40 font-semibold text-xs">
											<tr>
												{result.columns.map((c, i) => (
													<td key={c.id} className={cn("px-3 py-2", result.totals[c.id] && "text-right tabular-nums")}>
														{result.totals[c.id]?.text ?? (i === 0 ? `Total · ${result.count} rows` : "")}
													</td>
												))}
											</tr>
										</tfoot>
									</table>
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</PageLayout>
	);
}
