import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon, CurrencyDollarIcon, FlowArrowIcon, FunnelIcon, HandshakeIcon, ListChecksIcon, LockSimpleIcon, ShieldCheckIcon, TableIcon, TagIcon, TicketIcon } from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageLayout } from "#/components/layout/page-layout";
import { Button } from "#/components/ui/button";
import { apiClient, errorMessage } from "#/lib/api/client";
import { useCurrentUser } from "#/lib/auth/use-current-user";
import { cn } from "#/lib/utils";
import { cadenceFrom } from "../../../shared/billing";
import { type Contact, contactStagesFrom } from "../../../shared/contacts";
import { CalendarSettingsPanel } from "../calendar/-components/calendar-settings-dialog";
import { useCalendarSettings } from "../calendar/-components/use-calendar-settings";
import { CadenceEditor } from "./-components/cadence-editor";
import { MenuAccessEditor } from "./-components/menu-access-editor";
import { LeadStagesEditor } from "./-components/lead-stages-editor";
import { ListViewsEditor } from "./-components/list-views-editor";
import { TicketSettings, type TicketSettingsTab } from "./-components/ticket-settings";

type Section = TicketSettingsTab | "lead-stages" | "calendar" | "billing" | "menu" | "columns";

const SECTIONS: { group: string; items: { id: Section; label: string; hint: string; icon: ReactNode }[] }[] = [
	{
		group: "Tickets",
		items: [
			{ id: "workflows", label: "Workflows", hint: "The status paths a ticket can follow", icon: <FlowArrowIcon className="size-4" /> },
			{ id: "types", label: "Ticket types & fields", hint: "Each type follows one workflow", icon: <TagIcon className="size-4" /> },
		],
	},
	{
		group: "Calendar",
		items: [{ id: "calendar", label: "Appointments & cards", hint: "Visit types, colors, card content, tags, hours", icon: <CalendarBlankIcon className="size-4" /> }],
	},
	{
		group: "Contacts",
		items: [
			{ id: "lead-stages", label: "Lead stages", hint: "Steps of the sales funnel", icon: <FunnelIcon className="size-4" /> },
			{ id: "billing", label: "Billing cadence", hint: "Reminders, calls and notices around due dates; late fees", icon: <CurrencyDollarIcon className="size-4" /> },
		],
	},
	{
		group: "Screens",
		items: [{ id: "columns", label: "Lists & columns", hint: "What the Tickets, Leads and Team lists and cards show", icon: <TableIcon className="size-4" /> }],
	},
	{
		group: "Access",
		items: [{ id: "menu", label: "Menu by access", hint: "Which screens each access sees", icon: <ListChecksIcon className="size-4" /> }],
	},
];
const IDS = SECTIONS.flatMap((g) => g.items.map((i) => i.id));

export const Route = createFileRoute("/settings/")({
	validateSearch: (search: Record<string, unknown>): { section?: Section } =>
		IDS.includes(search.section as Section) ? { section: search.section as Section } : {},
	component: SettingsPage,
});

/** Admin settings, grouped by module: how tickets flow and how leads move. */
function SettingsPage() {
	const { user, can } = useCurrentUser();
	const isAdmin = can("calendar.viewAll");
	// No section: the list to pick from. A section: its editor, full width.
	const { section } = Route.useSearch();
	const navigate = useNavigate({ from: "/settings/" });
	const [dirty, setDirty] = useState(false);
	const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);

	function go(next: Section | undefined) {
		if (next === section) return;
		if (dirty && !window.confirm("You have unsaved changes. Discard them?")) return;
		setDirty(false);
		navigate({ search: next ? { section: next } : {} });
	}

	// Still signing in: nothing to lock yet.
	if (!user) return <PageLayout title="Settings" breadcrumbs={[{ label: "Settings" }]}>{null}</PageLayout>;
	if (!isAdmin) {
		return (
			<PageLayout title="Settings" breadcrumbs={[{ label: "Settings" }]}>
				<div className="my-8 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
					<LockSimpleIcon className="size-8" />
					<p className="text-sm">Only administrators can change the settings.</p>
				</div>
			</PageLayout>
		);
	}

	const current = section ? SECTIONS.flatMap((g) => g.items).find((i) => i.id === section) : undefined;

	if (!current) return <SettingsHome onPick={go} />;

	return (
		<PageLayout
			title={current.label}
			subtitle={current.hint}
			breadcrumbs={[{ label: "Settings" }, { label: current.label }]}
		>
			<div className="py-4">
				{/* Same place as "Back to tasks" on the technician's task. */}
				<div className="mb-4">
					<Button variant="secondary" size="lg" onClick={() => go(undefined)} className="gap-2">
						<CaretLeftIcon className="h-4 w-4" />
						Back to settings
					</Button>
				</div>
				{section === "menu" ? (
					<MenuAccessEditor onDirtyChange={onDirtyChange} />
				) : section === "columns" ? (
					<ListViewsEditor onDirtyChange={onDirtyChange} />
				) : section === "billing" ? (
					<CadenceEditor />
				) : section === "lead-stages" ? (
					<LeadStagesSection userId={user?.id} />
				) : section === "calendar" ? (
					<CalendarSection userId={user?.id} onDirtyChange={onDirtyChange} />
				) : (
					<TicketSettings key={section} tab={section as TicketSettingsTab} onDirtyChange={onDirtyChange} />
				)}
			</div>
		</PageLayout>
	);
}

/* ------------------------------ Home ------------------------------ */

const GROUP_LOOK: Record<string, { icon: ReactNode; text: string; blurb: string }> = {
	Tickets: { icon: <TicketIcon className="size-5" />, text: "text-sky-700 dark:text-sky-300", blurb: "How requests move from opened to solved, and what each kind asks for." },
	Calendar: { icon: <CalendarBlankIcon className="size-5" />, text: "text-violet-700 dark:text-violet-300", blurb: "The kinds of visits, their colors and what the calendar cards show." },
	Contacts: { icon: <HandshakeIcon className="size-5" />, text: "text-emerald-700 dark:text-emerald-300", blurb: "The sales funnel and how the CRM chases what's due." },
	Screens: { icon: <TableIcon className="size-5" />, text: "text-rose-700 dark:text-rose-300", blurb: "Which columns and card details each list shows, and in which order." },
	Access: { icon: <ShieldCheckIcon className="size-5" />, text: "text-amber-700 dark:text-amber-300", blurb: "Which screens and actions each access has." },
};
const GROUP_NAME: Record<string, string> = { Contacts: "Sales & billing" };

/** What's already set up in each section, for the cards ("3 workflows"). */
function useSummaries() {
	const [sum, setSum] = useState<Partial<Record<Section, string>>>({});
	useEffect(() => {
		const get = (u: string) => apiClient.get<any>(u).catch(() => null);
		Promise.all([get("/api/ticket-config"), get("/api/settings/calendar"), get("/api/settings/contactStages"), get("/api/settings/billingCadence")]).then(([cfg, cal, st, bc]) => {
			const n = (x: number, one: string, many = `${one}s`) => `${x} ${x === 1 ? one : many}`;
			setSum({
				workflows: cfg ? n(cfg.workflows.length, "workflow") : undefined,
				types: cfg ? n(cfg.types.length, "ticket type") : undefined,
				calendar: cal?.value?.types ? n(cal.value.types.length, "visit type") : "Default visit types",
				"lead-stages": n(contactStagesFrom(st?.value ?? null).length, "stage"),
				billing: n(cadenceFrom(bc?.value ?? null).steps.length, "step"),
				menu: "3 accesses",
				columns: "5 lists: Tickets, ticket cards, Leads, lead cards, Team",
			});
		});
	}, []);
	return sum;
}

function SettingsHome({ onPick }: { onPick: (s: Section) => void }) {
	const sum = useSummaries();
	return (
		<PageLayout title="Settings" subtitle="Shape the CRM to how your business works" breadcrumbs={[{ label: "Settings" }]}>
			<div className="grid grid-cols-1 gap-4 py-4 lg:grid-cols-2">
				{SECTIONS.map((g) => {
					const look = GROUP_LOOK[g.group];
					return (
						<section key={g.group} className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
							<header className="flex items-start gap-3 border-border border-b px-5 py-4">
								<span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/60", look?.text)}>{look?.icon}</span>
								<span className="min-w-0">
									<h2 className="font-semibold text-base">{GROUP_NAME[g.group] ?? g.group}</h2>
									<p className="text-muted-foreground text-sm">{look?.blurb}</p>
								</span>
							</header>
							<ul className="flex flex-1 flex-col divide-y divide-border">
								{g.items.map((i) => (
									<li key={i.id}>
										<button type="button" onClick={() => onPick(i.id)} className="group flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/40">
											<span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60", look?.text)}>{i.icon}</span>
											<span className="min-w-0 flex-1">
												<span className="block font-medium text-sm group-hover:text-brand">{i.label}</span>
												<span className="block text-muted-foreground text-xs">{i.hint}</span>
											</span>
											{sum[i.id] && <span className="hidden shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground text-xs sm:inline">{sum[i.id]}</span>}
											<CaretRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
										</button>
									</li>
								))}
							</ul>
						</section>
					);
				})}
			</div>
		</PageLayout>
	);
}

function LeadStagesSection({ userId }: { userId: string | undefined }) {
	const [data, setData] = useState<{ stages: ReturnType<typeof contactStagesFrom>; usage: Record<string, number> } | null>(null);
	const load = useCallback(async () => {
		if (!userId) return;
		try {
			const [st, contacts] = await Promise.all([apiClient.get<{ value: unknown }>("/api/settings/contactStages"), apiClient.get<Contact[]>("/api/contacts")]);
			const usage: Record<string, number> = {};
			for (const c of contacts) usage[c.stageId] = (usage[c.stageId] ?? 0) + 1;
			setData({ stages: contactStagesFrom(st.value), usage });
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}, [userId]);
	useEffect(() => {
		load();
	}, [load]);

	if (!data) return <p className="py-10 text-center text-muted-foreground text-sm">Loading…</p>;
	return (
		<div className="rounded-lg border border-border bg-card p-4 shadow-sm">
			<LeadStagesEditor key={JSON.stringify(data.stages)} stages={data.stages} usage={data.usage} onSaved={load} />
		</div>
	);
}

/** The calendar customization (formerly only in the calendar's gear dialog). */
function CalendarSection({ userId, onDirtyChange }: { userId: string | undefined; onDirtyChange: (dirty: boolean) => void }) {
	const settings = useCalendarSettings(true, { manual: true });
	useEffect(() => onDirtyChange(settings.dirty), [settings.dirty, onDirtyChange]);
	const [events, setEvents] = useState<{ type: string; tags?: string[] }[]>([]);
	useEffect(() => {
		if (userId) apiClient.get<{ type: string; tags?: string[] }[]>("/api/calendar/events").then(setEvents).catch(() => setEvents([]));
	}, [userId]);
	// Types and tags in use can't be deleted.
	const usage = useMemo(() => {
		const types: Record<string, number> = {};
		const tags: Record<string, number> = {};
		for (const e of events) {
			types[e.type] = (types[e.type] ?? 0) + 1;
			for (const t of e.tags ?? []) tags[t] = (tags[t] ?? 0) + 1;
		}
		return { types, tags };
	}, [events]);
	return (
		<div className="flex flex-col rounded-lg border border-border bg-card shadow-sm">
			<div className="flex flex-col gap-3 p-4">
				<p className="text-muted-foreground text-xs">Shared by the whole team: the calendar changes for everyone once you save.</p>
				<CalendarSettingsPanel settings={settings} can typeUsage={usage.types} tagUsage={usage.tags} />
			</div>
			{/* Always in reach, however long the page is */}
			<div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 rounded-b-lg border-border border-t bg-card/95 px-4 py-3 backdrop-blur">
				<span className={cn("text-xs", settings.dirty ? "font-medium text-amber-700" : "text-muted-foreground")}>
					{settings.dirty ? "You have unsaved changes." : "All changes saved."}
				</span>
				<div className="flex gap-2">
					<Button variant="secondary" size="sm" onClick={settings.discard} disabled={settings.saving || !settings.dirty}>
						Discard changes
					</Button>
					<Button size="sm" onClick={settings.save} disabled={settings.saving || !settings.dirty}>
						{settings.saving ? "Saving…" : "Save settings"}
					</Button>
				</div>
			</div>
		</div>
	);
}
