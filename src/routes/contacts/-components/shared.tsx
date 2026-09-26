import dayjs from "dayjs";
import { cn } from "#/lib/utils";
import { type Contact, type ContactStage, daysSince, followUpDue, STALE_DAYS, stageOf, TEMPERATURES, type Temperature } from "../../../../shared/contacts";

export function StageBadge({ stages, stageId }: { stages: ContactStage[]; stageId: string }) {
	const s = stageOf(stages, stageId);
	return (
		<span
			className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-xs"
			style={{ backgroundColor: `${s?.color ?? "#64748B"}1A`, color: s?.color ?? "#64748B" }}
		>
			<span className="size-1.5 rounded-full" style={{ backgroundColor: s?.color ?? "#64748B" }} />
			{s?.label ?? "Unknown stage"}
		</span>
	);
}

export function TemperatureDot({ value, withLabel = false }: { value: Temperature; withLabel?: boolean }) {
	const t = TEMPERATURES.find((x) => x.id === value);
	return (
		<span className="inline-flex items-center gap-1.5 text-xs" title={`${t?.label} · ${t?.hint}`}>
			<span className="size-2 rounded-full" style={{ backgroundColor: t?.color }} />
			{withLabel && <span style={{ color: t?.color }}>{t?.label}</span>}
		</span>
	);
}

/** "Due today", "Overdue 3d", "Mar 4" — red when it's time to call. */
export function FollowUpLabel({ contact }: { contact: Pick<Contact, "nextFollowUp"> }) {
	if (!contact.nextFollowUp) return <span className="text-muted-foreground text-xs">—</span>;
	const due = followUpDue(contact);
	const days = dayjs().startOf("day").diff(dayjs(contact.nextFollowUp), "day");
	return (
		<span className={cn("whitespace-nowrap text-xs", due ? "font-semibold text-destructive" : "text-foreground")}>
			{days === 0 ? "Due today" : days > 0 ? `Overdue ${days}d` : dayjs(contact.nextFollowUp).format("MMM D")}
		</span>
	);
}

export function LastContactLabel({ contact, closed }: { contact: Pick<Contact, "lastContactAt">; closed: boolean }) {
	const d = daysSince(contact.lastContactAt);
	if (d === null) return <span className={cn("text-xs", closed ? "text-muted-foreground" : "text-amber-700")}>Never</span>;
	return (
		<span className={cn("whitespace-nowrap text-xs", !closed && d >= STALE_DAYS ? "text-amber-700" : "text-muted-foreground")}>
			{d === 0 ? "Today" : `${d}d ago`}
		</span>
	);
}

export function OwnerChip({ name }: { name: string | null }) {
	const initials = name
		? name
				.split(" ")
				.map((p) => p[0])
				.slice(0, 2)
				.join("")
		: "–";
	return (
		<span className="inline-flex items-center gap-1.5 text-xs" title={name ?? "Unassigned"}>
			<span className={cn("flex size-6 items-center justify-center rounded-full font-semibold text-[10px]", name ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground")}>
				{initials}
			</span>
			<span className="hidden truncate xl:inline">{name ?? "Unassigned"}</span>
		</span>
	);
}

export const money = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
