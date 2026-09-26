import { CheckIcon, LockSimpleIcon, PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import type * as React from "react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Separator } from "#/components/ui/separator";
import { Switch } from "#/components/ui/switch";
import { cn } from "#/lib/utils";
import { CARD_FIELDS, contrastColor, darken, TAG_COLORS } from "./constants";
import { EventCard } from "./event-card";
import type { CalendarEvent } from "./types";
import type { CalendarSettings, TypeColor } from "./use-calendar-settings";
import { DragHandle, reorder, useDragReorder } from "#/components/drag-reorder";

interface CalendarSettingsDialogProps {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	settings: CalendarSettings;
	/** Admin permission: without it every section is read-only. */
	can: boolean;
	/** How many appointments use each type / custom tag (blocks deleting). */
	typeUsage: Record<string, number>;
	tagUsage: Record<string, number>;
}

const HOUR_OPTIONS = Array.from({ length: 25 }, (_, h) => h);

export function CalendarSettingsDialog({
	open,
	onOpenChange,
	settings,
	can,
	typeUsage,
	tagUsage,
}: CalendarSettingsDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="!flex !max-h-[88vh] w-full !max-w-[95vw] flex-col !gap-0 !overflow-hidden !bg-card !p-0 text-left sm:!max-w-2xl lg:!max-w-[680px]">
				<div className="shrink-0 border-b px-6 pt-6 pb-4 text-left">
					<DialogTitle className="text-left">Customize calendar</DialogTitle>
					<DialogDescription className="mt-1.5 text-left">
						Set the card colors, what each card shows, the tags and the hours of the day and week views.
					</DialogDescription>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 text-left">
					<CalendarSettingsPanel settings={settings} can={can} typeUsage={typeUsage} tagUsage={tagUsage} />
				</div>

				<div className="flex shrink-0 justify-end border-t bg-muted/20 px-6 py-4">
					<Button onClick={() => onOpenChange(false)}>
						Done
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

/** Every calendar setting; used by the dialog and by the Settings page. Saves as you edit. */
export function CalendarSettingsPanel({ settings, can, typeUsage, tagUsage }: Omit<CalendarSettingsDialogProps, "open" | "onOpenChange">) {
	return (
		<>
			{!can && (
				<p className="mb-4 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-left text-muted-foreground text-xs">
					<LockSimpleIcon className="size-4 shrink-0" />
					Only administrators can change these settings.
				</p>
			)}
			{/* A disabled fieldset turns every input and button inside read-only. */}
			<fieldset disabled={!can} className={cn("flex min-w-0 flex-col gap-6 text-left", !can && "opacity-60")}>
				<CardColorsSection settings={settings} typeUsage={typeUsage} />
				<Separator />
				<CardContentSection settings={settings} />
				<Separator />
				<TagsSection settings={settings} tagUsage={tagUsage} />
				<Separator />
				<HoursSection settings={settings} />
			</fieldset>
		</>
	);
}

function SectionHeader({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
	return (
		<div className="flex items-start justify-between gap-2 text-left">
			<div>
				<h3 className="text-left font-semibold text-sm">{title}</h3>
				{hint && <p className="mt-0.5 text-muted-foreground text-xs">{hint}</p>}
			</div>
			{action}
		</div>
	);
}

/* ------------------------------ Card colors ------------------------------ */

function CardColorsSection({
	settings,
	typeUsage,
}: {
	settings: CalendarSettings;
	typeUsage: Record<string, number>;
}) {
	const [newName, setNewName] = useState("");
	const [newColor, setNewColor] = useState("#FDE68A");

	function addType() {
		const label = newName.trim();
		if (!label) return;
		settings.addType(label, { background: newColor.toUpperCase(), border: darken(newColor) });
		setNewName("");
	}

	return (
		<section className="flex flex-col gap-3">
			<SectionHeader
				title="Card colors"
				hint="Each appointment type has its own card color. Add types when you need more."
				action={
					<Button variant="secondary" size="sm" onClick={settings.resetColors}>
						Restore defaults
					</Button>
				}
			/>

			<div className="flex flex-col gap-3">
				{settings.types.map((t) => {
					const used = typeUsage[t.id] ?? 0;
					return (
						<div key={t.id} className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
							<div className="flex items-center gap-2">
								<span
									className="size-5 shrink-0 rounded border-2"
									style={{ backgroundColor: t.background, borderColor: t.border }}
								/>
								<Input
									aria-label="Type name"
									className="h-8 flex-1 text-sm"
									value={t.label}
									onChange={(e) => settings.renameType(t.id, e.target.value)}
									onBlur={(e) => !e.target.value.trim() && settings.renameType(t.id, "Untitled")}
								/>
								{t.builtIn ? (
									<span className="shrink-0 text-[11px] text-muted-foreground">Default</span>
								) : (
									<Button
										variant="ghost"
										size="icon-sm"
										disabled={used > 0}
										title={used > 0 ? `In use by ${used} appointment${used === 1 ? "" : "s"}` : "Delete type"}
										aria-label={`Delete ${t.label}`}
										onClick={() => settings.removeType(t.id)}
									>
										<TrashIcon className="size-4" />
									</Button>
								)}
							</div>
							<SwatchPicker
								palette={settings.palette}
								selected={{ background: t.background, border: t.border }}
								onPick={(c) => settings.setTypeColor(t.id, c)}
								onAddCustom={(hex) => settings.setTypeColor(t.id, settings.addSwatch(hex))}
								customBackgrounds={settings.customSwatches.map((s) => s.background)}
								onRemoveCustom={settings.removeSwatch}
							/>
						</div>
					);
				})}
			</div>

			<form
				className="flex flex-col gap-2 rounded-md border border-dashed p-3 sm:flex-row sm:items-center"
				onSubmit={(e) => {
					e.preventDefault();
					addType();
				}}
			>
				<label className="flex items-center gap-2" title="Card color">
					<input
						type="color"
						aria-label="New type color"
						className="size-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
						value={newColor}
						onChange={(e) => setNewColor(e.target.value)}
					/>
				</label>
				<Input
					className="h-8 flex-1 text-sm"
					placeholder="New appointment type, e.g. Contract renewal"
					value={newName}
					onChange={(e) => setNewName(e.target.value)}
				/>
				<Button type="submit" size="sm" disabled={!newName.trim()}>
					<PlusIcon className="size-4" />
					Add type
				</Button>
			</form>
		</section>
	);
}

function SwatchPicker({
	palette,
	selected,
	onPick,
	onAddCustom,
	customBackgrounds,
	onRemoveCustom,
}: {
	palette: TypeColor[];
	selected: TypeColor;
	onPick: (c: TypeColor) => void;
	onAddCustom: (hex: string) => void;
	customBackgrounds: string[];
	onRemoveCustom: (background: string) => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{palette.map((c) => {
				const active = selected.background === c.background && selected.border === c.border;
				const custom = customBackgrounds.includes(c.background);
				return (
					<span key={`${c.background}-${c.border}`} className="group/sw relative">
						<button
							type="button"
							onClick={() => onPick(c)}
							className="flex size-7 items-center justify-center rounded-md border-2 transition-transform hover:scale-110"
							style={{ backgroundColor: c.background, borderColor: c.border }}
							aria-label={`Color ${c.background}`}
							aria-pressed={active}
						>
							{/* The picked color shows a check on itself (a ring left a gap around it). */}
							{active && <CheckIcon weight="bold" className="size-4 text-slate-800" />}
						</button>
						{custom && !active && (
							<button
								type="button"
								onClick={() => onRemoveCustom(c.background)}
								className="absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full bg-slate-700 text-white group-hover/sw:flex"
								aria-label={`Remove color ${c.background}`}
							>
								<XIcon className="size-2.5" weight="bold" />
							</button>
						)}
					</span>
				);
			})}
			{/* Native color picker: choosing a color adds it to the palette. */}
			<label
				className="relative flex size-7 cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-slate-300 text-muted-foreground hover:border-brand hover:text-brand"
				title="Custom color"
			>
				<PlusIcon className="size-3.5" />
				<CommittedColorInput
					aria-label="Add custom color"
					className="absolute inset-0 cursor-pointer opacity-0"
					onCommit={onAddCustom}
				/>
			</label>
		</div>
	);
}

/**
 * Color input that reports only the final pick. React's onChange fires on
 * every drag step of the native picker; the DOM "change" event fires once,
 * when the picker closes.
 */
function CommittedColorInput({
	onCommit,
	...props
}: Omit<React.ComponentProps<"input">, "type" | "onChange"> & { onCommit: (hex: string) => void }) {
	const ref = useRef<HTMLInputElement>(null);
	const commitRef = useRef(onCommit);
	commitRef.current = onCommit;

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const handler = () => commitRef.current(el.value);
		el.addEventListener("change", handler);
		return () => el.removeEventListener("change", handler);
	}, []);

	return <input ref={ref} type="color" defaultValue="#A5F3FC" {...props} />;
}

/* ------------------------------ Card content ----------------------------- */

const PREVIEW_EVENT: CalendarEvent = {
	id: "preview",
	title: "Maintenance - electrical",
	type: "maintenance",
	mode: "on_site",
	completed: false,
	start: new Date(2026, 0, 1, 13, 0),
	end: new Date(2026, 0, 1, 15, 0),
	project: "SUPPORT SERVICE",
	client: { id: "90234", name: "Aurora Residences HOA" },
	ticketNumber: "209355",
	owner: { id: "2550", name: "Ryan Mitchell", initials: "RM" },
	property: "Aurora Residences",
	location: "Block A · Unit 304",
	notes: "Replace a circuit breaker and reconnect the distribution panel in the shared laundry room.",
	billable: true,
	groupActivity: true,
	hours: [],
	files: [],
	expenses: [],
};

function CardContentSection({ settings }: { settings: CalendarSettings }) {
	const previewType = settings.types.some((t) => t.id === "maintenance")
		? "maintenance"
		: (settings.types[0]?.id ?? "maintenance");
	const color = settings.colorForType(previewType);
	const previewEvent = {
		...PREVIEW_EVENT,
		type: previewType,
		// Show every tag in the preview so hiding one is visible right away.
		tags: settings.card.tags.filter((t) => !t.builtIn).map((t) => t.id),
	};

	return (
		<section className="flex flex-col gap-3">
			<SectionHeader
				title="Card content"
				hint="Choose which fields appear on the appointment cards. The title is always shown."
				action={
					<Button variant="secondary" size="sm" onClick={settings.resetFields}>
						Restore defaults
					</Button>
				}
			/>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					{CARD_FIELDS.map((f) => (
						<label
							key={f.id}
							htmlFor={`cfg-field-${f.id}`}
							className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-left text-sm"
						>
							<span className="min-w-0">
								<span className="block font-medium">{f.label}</span>
								<span className="block truncate text-[11px] text-muted-foreground">{f.hint}</span>
							</span>
							<Switch
								id={`cfg-field-${f.id}`}
								checked={settings.card.fields[f.id]}
								onCheckedChange={(v) => settings.toggleField(f.id, Boolean(v))}
							/>
						</label>
					))}
				</div>
				<div className="flex flex-col gap-1.5">
					<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Preview</span>
					{/* inert: the preview is for looking only. */}
					<div inert className="rounded-md border bg-background p-2">
						<EventCard
							event={previewEvent}
							color={color}
							textColor={contrastColor(color.background)}
							card={settings.card}
							onOpen={() => undefined}
							onOpenClient={() => undefined}
						/>
					</div>
				</div>
			</div>
		</section>
	);
}

/* ---------------------------------- Tags --------------------------------- */

function TagsSection({
	settings,
	tagUsage,
}: {
	settings: CalendarSettings;
	tagUsage: Record<string, number>;
}) {
	const [newLabel, setNewLabel] = useState("");
	const [newColor, setNewColor] = useState(TAG_COLORS[0]);
	const tags = settings.card.tags;

	function addTag() {
		const label = newLabel.trim();
		if (!label) return;
		settings.addTag(label, newColor);
		setNewLabel("");
	}

	// Drag the tags (by their ⋮⋮ handle) to reorder them.
	const tagDrag = useDragReorder({ count: tags.length, onMove: settings.reorderTags });

	return (
		<section className="flex flex-col gap-3">
			<SectionHeader
				title="Tags shown on cards"
				hint="Rename, recolor, reorder or hide tags. Default tags come from the appointment's options; custom tags are picked in the appointment form."
				action={
					<Button variant="secondary" size="sm" onClick={settings.resetTags}>
						Restore defaults
					</Button>
				}
			/>

			<div className="flex flex-col gap-2">
				{tags.map((t, i) => {
					const used = tagUsage[t.id] ?? 0;
					return (
						<div key={t.id} {...tagDrag.rowProps(i)} className={cn("relative flex flex-col gap-2 rounded-md border bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center", tagDrag.isDragging(i) && "opacity-40")}>
							{tagDrag.dropLine(i)}
							<div className="flex min-w-0 flex-1 items-center gap-2">
							<DragHandle label={t.label || "tag"} {...tagDrag.handleProps(i)} />
								<Input
									aria-label="Tag name"
									className="h-8 flex-1 text-sm"
									value={t.label}
									onChange={(e) => settings.updateTag(t.id, { label: e.target.value })}
									onBlur={(e) => !e.target.value.trim() && settings.updateTag(t.id, { label: "Untitled" })}
								/>
								<span className="shrink-0 text-[11px] text-muted-foreground">
									{t.builtIn ? "Default" : `${used} use${used === 1 ? "" : "s"}`}
								</span>
							</div>
							<div className="flex items-center gap-1">
								<ColorDots value={t.color} onChange={(color) => settings.updateTag(t.id, { color })} />
								<span className="mx-1 h-5 w-px bg-border" />
								<Switch
									aria-label={t.visible ? `Hide ${t.label}` : `Show ${t.label}`}
									checked={t.visible}
									onCheckedChange={(v) => settings.updateTag(t.id, { visible: Boolean(v) })}
								/>

								<Button
									variant="ghost"
									size="icon-sm"
									disabled={Boolean(t.builtIn)}
									title={t.builtIn ? "Default tags can be hidden, not deleted" : "Delete tag"}
									aria-label={`Delete ${t.label}`}
									onClick={() => settings.removeTag(t.id)}
								>
									<TrashIcon className="size-4" />
								</Button>
							</div>
						</div>
					);
				})}
			</div>

			<form
				className="flex flex-col gap-2 rounded-md border border-dashed p-3 sm:flex-row sm:items-center"
				onSubmit={(e) => {
					e.preventDefault();
					addTag();
				}}
			>
				<Input
					className="h-8 flex-1 text-sm"
					placeholder="New tag, e.g. Urgent"
					value={newLabel}
					onChange={(e) => setNewLabel(e.target.value)}
				/>
				<ColorDots value={newColor} onChange={setNewColor} />
				<Button type="submit" size="sm" disabled={!newLabel.trim()}>
					<PlusIcon className="size-4" />
					Add tag
				</Button>
			</form>
		</section>
	);
}

function ColorDots({ value, onChange }: { value: string; onChange: (c: string) => void }) {
	return (
		<div className="flex items-center gap-1" role="radiogroup" aria-label="Tag color">
			{TAG_COLORS.map((c) => (
				<button
					key={c}
					type="button"
					role="radio"
					aria-checked={value === c}
					aria-label={`Color ${c}`}
					onClick={() => onChange(c)}
					className="flex size-5 items-center justify-center rounded-full transition-transform hover:scale-110"
					style={{ backgroundColor: c }}
				>
					{value === c && <CheckIcon weight="bold" className="size-3 text-white" />}
				</button>
			))}
		</div>
	);
}

/* --------------------------------- Hours --------------------------------- */

function HoursSection({ settings }: { settings: CalendarSettings }) {
	const { startHour, endHour } = settings.hours;
	const label = (h: number) => `${String(h).padStart(2, "0")}:00`;
	return (
		<section className="flex flex-col gap-3 text-left">
			<SectionHeader title="Working hours" hint="Range shown in the day and week time grids." />
			<div className="grid grid-cols-2 gap-3">
				<div className="flex flex-col gap-1.5">
					<span id="hours-start" className="font-semibold text-muted-foreground text-xs">Starts at</span>
					<Select value={String(startHour)} onValueChange={(v) => settings.setHoursConfig({ startHour: Number(v), endHour })}>
						<SelectTrigger aria-labelledby="hours-start" className="h-9">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{HOUR_OPTIONS.filter((h) => h < endHour).map((h) => (
								<SelectItem key={h} value={String(h)}>
									{label(h)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<span id="hours-end" className="font-semibold text-muted-foreground text-xs">Ends at</span>
					<Select value={String(endHour)} onValueChange={(v) => settings.setHoursConfig({ startHour, endHour: Number(v) })}>
						<SelectTrigger aria-labelledby="hours-end" className="h-9">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{HOUR_OPTIONS.filter((h) => h > startHour).map((h) => (
								<SelectItem key={h} value={String(h)}>
									{label(h)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</section>
	);
}
