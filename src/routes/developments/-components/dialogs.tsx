import { type ReactNode, useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { ApiError } from "#/lib/api/client";
import { cn } from "#/lib/utils";
import { PhotoManager } from "./photos";
import { RoomsLine, UnitTypesEditor } from "./unit-types";
import {
	type Block,
	type Client,
	CONSTRUCTION_STAGES,
	type DevelopmentPhoto,
	type UnitType,
	bedroomsOf,
	DEVELOPMENT_KINDS,
	DEVELOPMENT_STATUSES,
	type Development,
	type DevelopmentInput,
	UNIT_KINDS,
	UNIT_STATUSES,
	type Unit,
	type UnitInput,
} from "../../../../shared/developments";

const NONE = "__none__";

/** Shared shell: header, scrolling form, footer with Cancel / Save. */
function FormDialog({
	open,
	onOpenChange,
	title,
	description,
	saving,
	submitLabel,
	onSubmit,
	children,
	wide,
	top,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	title: string;
	description: string;
	saving: boolean;
	submitLabel: string;
	onSubmit: () => void;
	children: ReactNode;
	wide?: boolean;
	/** Shown between the header and the form (e.g. tabs). */
	top?: ReactNode;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className={cn("!flex !max-h-[88vh] w-full !max-w-[95vw] flex-col !gap-0 !overflow-hidden !bg-card !p-0", wide ? "sm:!max-w-3xl" : "sm:!max-w-xl")}>
				<div className="shrink-0 border-b px-6 pt-6 pb-4 text-left">
					<DialogTitle className="text-left">{title}</DialogTitle>
					<DialogDescription className="mt-1.5 text-left">{description}</DialogDescription>
				</div>
				{top}
				<form
					id="dev-form"
					className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
					onSubmit={(e) => {
						e.preventDefault();
						onSubmit();
					}}
				>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
				</form>
				<div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/20 px-6 py-4 sm:flex-row sm:justify-end">
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="submit" form="dev-form" disabled={saving}>
						{saving ? "Saving…" : submitLabel}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function Field({
	id,
	label,
	required,
	error,
	wide,
	hint,
	children,
}: {
	id: string;
	label: string;
	required?: boolean;
	error?: string;
	wide?: boolean;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<div className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
			<Label htmlFor={id}>
				{label} {required && <span className="text-destructive">*</span>}
			</Label>
			{children}
			{hint && !error && <span className="text-muted-foreground text-xs">{hint}</span>}
			{error && <span className="text-destructive text-xs">{error}</span>}
		</div>
	);
}

/** Runs the save, keeps the dialog open and maps server field errors on failure. */
function useSubmit<T>(onSave: (v: T) => Promise<unknown>, close: () => void) {
	const [saving, setSaving] = useState(false);
	const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
	async function submit(value: T) {
		setSaving(true);
		setServerErrors({});
		try {
			await onSave(value);
			close();
		} catch (e) {
			if (e instanceof ApiError) setServerErrors(e.fields);
		} finally {
			setSaving(false);
		}
	}
	return { saving, serverErrors, setServerErrors, submit };
}

/* ----------------------------- Development ------------------------------ */

const EMPTY_DEV: DevelopmentInput = {
	name: "",
	clientId: "",
	kind: "residential",
	status: "planning",
	address: "",
	city: "",
	deliveryDate: "",
	stage: null,
	progress: 0,
	photos: [],
	unitTypes: [],
};

type DevTab = "details" | "photos" | "types";

export function DevelopmentDialog({
	open,
	onOpenChange,
	initial,
	clients,
	onSave,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	initial: Development | null;
	clients: Client[];
	onSave: (input: DevelopmentInput) => Promise<unknown>;
}) {
	const [form, setForm] = useState<DevelopmentInput>(EMPTY_DEV);
	const [submitted, setSubmitted] = useState(false);
	const [tab, setTab] = useState<DevTab>("details");
	const { saving, serverErrors, setServerErrors, submit } = useSubmit(onSave, () => onOpenChange(false));

	useEffect(() => {
		if (!open) return;
		setSubmitted(false);
		setServerErrors({});
		setTab("details");
		setForm(initial ? { ...EMPTY_DEV, ...initial, photos: initial.photos ?? [], unitTypes: initial.unitTypes ?? [] } : EMPTY_DEV);
	}, [open, initial, setServerErrors]);
	// A field error on another tab: show that tab.
	useEffect(() => {
		if (serverErrors.photos) setTab("photos");
		else if (serverErrors.unitTypes) setTab("types");
	}, [serverErrors]);

	const set = <K extends keyof DevelopmentInput>(k: K, v: DevelopmentInput[K]) => setForm((f) => ({ ...f, [k]: v }));
	const nameError = submitted && !form.name.trim() ? "Name is required." : serverErrors.name;

	return (
		<FormDialog
			open={open}
			onOpenChange={onOpenChange}
			title={initial ? "Edit development" : "New development"}
			description="A job site the company builds or maintains. Add blocks and units after saving."
			saving={saving}
			wide
			submitLabel={initial ? "Save changes" : "Create development"}
			onSubmit={() => {
				setSubmitted(true);
				if (!form.name.trim()) return setTab("details");
				submit(form);
			}}
			top={
				<div className="flex shrink-0 gap-1 border-b px-6 pt-2" role="tablist">
					{(
						[
							["details", "Details"],
							["photos", "Main photo"],
							["types", `Apartment types · ${form.unitTypes?.length ?? 0}`],
						] as [DevTab, string][]
					).map(([id, label]) => (
						<button
							key={id}
							type="button"
							role="tab"
							aria-selected={tab === id}
							onClick={() => setTab(id)}
							className={cn("-mb-px border-b-2 px-3 py-2 font-medium text-sm", tab === id ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground")}
						>
							{label}
						</button>
					))}
				</div>
			}
		>
			{tab === "photos" && (
				<div className="sm:col-span-2">
					<PhotoManager value={form.photos ?? []} onChange={(v) => set("photos", v)} error={serverErrors.photos} />
				</div>
			)}
			{tab === "types" && (
				<div className="sm:col-span-2">
					<UnitTypesEditor value={form.unitTypes ?? []} onChange={(v) => set("unitTypes", v)} error={serverErrors.unitTypes} />
				</div>
			)}
			{tab === "details" && (
			<>
			<Field id="d-name" label="Name" required error={nameError} wide>
				<Input id="d-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Riverside Towers" />
			</Field>
			<Field id="d-client" label="Client" error={serverErrors.clientId} wide>
				<Select value={form.clientId || NONE} onValueChange={(v) => set("clientId", v === NONE ? "" : v)}>
					<SelectTrigger id="d-client">
						<SelectValue placeholder="Select a client" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={NONE}>No client yet</SelectItem>
						{clients.map((c) => (
							<SelectItem key={c.id} value={c.id}>
								{c.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<Field id="d-kind" label="Kind" error={serverErrors.kind}>
				<Select value={form.kind} onValueChange={(v) => set("kind", v as DevelopmentInput["kind"])}>
					<SelectTrigger id="d-kind">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{DEVELOPMENT_KINDS.map((k) => (
							<SelectItem key={k.id} value={k.id}>
								{k.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<Field id="d-status" label="Status" error={serverErrors.status}>
				<Select value={form.status} onValueChange={(v) => set("status", v as DevelopmentInput["status"])}>
					<SelectTrigger id="d-status">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{DEVELOPMENT_STATUSES.map((s) => (
							<SelectItem key={s.id} value={s.id}>
								{s.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<Field id="d-address" label="Address" wide>
				<Input id="d-address" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street and number" />
			</Field>
			<Field id="d-city" label="City">
				<Input id="d-city" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Austin, TX" />
			</Field>
			<Field id="d-delivery" label="Handover date" error={serverErrors.deliveryDate}>
				<Input id="d-delivery" type="date" value={form.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} />
			</Field>
			{form.status === "under_construction" && (
				<div className="grid grid-cols-1 gap-4 rounded-md border border-amber-200 bg-amber-50/50 p-3 sm:col-span-2 sm:grid-cols-2">
					<Field id="d-stage" label="Stage of the works" error={serverErrors.stage}>
						<Select value={form.stage ?? NONE} onValueChange={(v) => set("stage", v === NONE ? null : (v as DevelopmentInput["stage"]))}>
							<SelectTrigger id="d-stage" className="bg-card">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NONE}>Not started</SelectItem>
								{CONSTRUCTION_STAGES.map((s, i) => (
									<SelectItem key={s.id} value={s.id}>
										{i + 1}. {s.label}
										<span className="text-muted-foreground text-xs"> · {s.hint}</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field id="d-progress" label={`Works done: ${form.progress ?? 0}%`} error={serverErrors.progress}>
						<input
							id="d-progress"
							type="range"
							min={0}
							max={100}
							step={5}
							value={form.progress ?? 0}
							onChange={(e) => set("progress", Number(e.target.value))}
							className="h-9 w-full accent-amber-500"
						/>
					</Field>
				</div>
			)}
			</>
			)}
		</FormDialog>
	);
}

/* -------------------------------- Block --------------------------------- */

export interface BlockForm {
	name: string;
	floors: number;
	unitsPerFloor: number;
	unitKind: string;
	areaSqft: number;
	/** The apartment type the generated units follow. */
	typeId?: string;
	photos: DevelopmentPhoto[];
}

export function BlockDialog({
	open,
	onOpenChange,
	initial,
	unitTypes = [],
	onSave,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	initial: Block | null;
	unitTypes?: UnitType[];
	onSave: (form: BlockForm) => Promise<unknown>;
}) {
	const [form, setForm] = useState<BlockForm>({ name: "", floors: 5, unitsPerFloor: 4, unitKind: "2-bedroom", areaSqft: 850, photos: [] });
	const [submitted, setSubmitted] = useState(false);
	const { saving, serverErrors, setServerErrors, submit } = useSubmit(onSave, () => onOpenChange(false));

	useEffect(() => {
		if (!open) return;
		setSubmitted(false);
		setServerErrors({});
		setForm(
			initial
				? { name: initial.name, floors: initial.floors, unitsPerFloor: 0, unitKind: "", areaSqft: 0, photos: initial.photos ?? [] }
				: { name: "", floors: 5, unitsPerFloor: 4, unitKind: "2-bedroom", areaSqft: 850, photos: [], typeId: unitTypes[0]?.id },
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, initial, setServerErrors]);

	const set = <K extends keyof BlockForm>(k: K, v: BlockForm[K]) => setForm((f) => ({ ...f, [k]: v }));
	const type = unitTypes.find((t) => t.id === form.typeId);
	const errors = {
		name: submitted && !form.name.trim() ? "Name is required." : serverErrors.name,
		floors: submitted && (form.floors < 1 || form.floors > 200) ? "Between 1 and 200." : serverErrors.floors,
	};
	const total = form.floors * form.unitsPerFloor;

	return (
		<FormDialog
			open={open}
			onOpenChange={onOpenChange}
			title={initial ? "Edit block" : "New block"}
			description={initial ? "Rename the block or change its number of floors." : "A tower, wing or building. Units can be generated for every floor."}
			saving={saving}
			submitLabel={initial ? "Save changes" : total > 0 ? `Create block + ${total} units` : "Create block"}
			onSubmit={() => {
				setSubmitted(true);
				if (form.name.trim() && form.floors >= 1 && form.floors <= 200) submit(form);
			}}
		>
			<Field id="b-name" label="Name" required error={errors.name}>
				<Input id="b-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Tower C" />
			</Field>
			<Field id="b-floors" label="Floors" required error={errors.floors}>
				<Input id="b-floors" type="number" min={1} max={200} value={form.floors} onChange={(e) => set("floors", Number(e.target.value))} />
			</Field>
			{!initial && (
				<>
					<Field
						id="b-per-floor"
						label="Units per floor"
						hint="0 to add units by hand later."
						error={serverErrors.unitsPerFloor}
					>
						<Input
							id="b-per-floor"
							type="number"
							min={0}
							max={50}
							value={form.unitsPerFloor}
							onChange={(e) => set("unitsPerFloor", Number(e.target.value))}
						/>
					</Field>
					{unitTypes.length > 0 ? (
						<Field id="b-type" label="Apartment type of the units" hint={total > 0 ? `Creates units 101 to ${form.floors}${String(form.unitsPerFloor).padStart(2, "0")}.` : undefined}>
							<Select value={form.typeId ?? NONE} onValueChange={(v) => set("typeId", v === NONE ? undefined : v)}>
								<SelectTrigger id="b-type">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{unitTypes.map((t) => (
										<SelectItem key={t.id} value={t.id}>
											{t.name}
										</SelectItem>
									))}
									<SelectItem value={NONE}>No type (set by hand)</SelectItem>
								</SelectContent>
							</Select>
							{type && <RoomsLine t={type} />}
						</Field>
					) : (
						<Field id="b-area" label="Default area (sq ft)">
							<Input id="b-area" type="number" min={0} value={form.areaSqft} onChange={(e) => set("areaSqft", Number(e.target.value))} />
						</Field>
					)}
					{!type && (
						<Field id="b-kind" label="Default unit type" wide hint={total > 0 ? `Creates units 101 to ${form.floors}${String(form.unitsPerFloor).padStart(2, "0")}.` : undefined}>
							<Input id="b-kind" list="b-kind-options" value={form.unitKind} onChange={(e) => set("unitKind", e.target.value)} />
							<datalist id="b-kind-options">
								{UNIT_KINDS.map((k) => (
									<option key={k} value={k} />
								))}
							</datalist>
						</Field>
					)}
				</>
			)}
		</FormDialog>
	);
}

/* --------------------------------- Unit --------------------------------- */

export function UnitDialog({
	open,
	onOpenChange,
	initial,
	blockId,
	unitTypes = [],
	onSave,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	initial: Unit | null;
	blockId: string;
	unitTypes?: UnitType[];
	onSave: (input: UnitInput) => Promise<unknown>;
}) {
	const empty: UnitInput = { blockId, number: "", floor: 1, kind: "2-bedroom", areaSqft: 850, status: "available", occupant: "", typeId: null, bedrooms: 2, bathrooms: 2, parking: 1 };
	const [form, setForm] = useState<UnitInput>(empty);
	const [submitted, setSubmitted] = useState(false);
	const { saving, serverErrors, setServerErrors, submit } = useSubmit(onSave, () => onOpenChange(false));

	useEffect(() => {
		if (!open) return;
		setSubmitted(false);
		setServerErrors({});
		const first = unitTypes[0];
		setForm(
			initial
				? { ...initial }
				: first
					? { ...empty, blockId, typeId: first.id, kind: first.name, areaSqft: first.areaSqft, bedrooms: first.bedrooms, bathrooms: first.bathrooms, parking: first.parking }
					: { ...empty, blockId },
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, initial, blockId, setServerErrors]);

	const set = <K extends keyof UnitInput>(k: K, v: UnitInput[K]) => setForm((f) => ({ ...f, [k]: v }));
	const numberError = submitted && !form.number.trim() ? "Unit number is required." : serverErrors.number;
	const type = unitTypes.find((t) => t.id === form.typeId);
	// The unit's size or rooms differ from its type's (shown as fields then).
	const [custom, setCustom] = useState(false);
	useEffect(() => {
		if (!open) return;
		const t = unitTypes.find((x) => x.id === initial?.typeId);
		setCustom(Boolean(t && initial && (t.bedrooms !== initial.bedrooms || t.bathrooms !== initial.bathrooms || t.parking !== initial.parking)));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, initial]);
	// Picking a type fills its size and rooms (they can still be changed for this unit).
	const pickType = (id: string) => {
		const t = unitTypes.find((x) => x.id === id);
		if (!t) return set("typeId", null);
		setForm((f) => ({ ...f, typeId: t.id, kind: t.name, areaSqft: t.areaSqft, bedrooms: t.bedrooms, bathrooms: t.bathrooms, parking: t.parking }));
		setCustom(false);
	};

	return (
		<FormDialog
			open={open}
			onOpenChange={onOpenChange}
			title={initial ? `Unit ${initial.number}` : "New unit"}
			description="Apartment, store, suite or bay inside the block."
			saving={saving}
			submitLabel={initial ? "Save changes" : "Add unit"}
			onSubmit={() => {
				setSubmitted(true);
				if (form.number.trim()) submit(form);
			}}
		>
			<Field id="n-number" label="Number" required error={numberError}>
				<Input id="n-number" value={form.number} onChange={(e) => set("number", e.target.value)} placeholder="e.g. 304" />
			</Field>
			<Field id="n-floor" label="Floor">
				<Input id="n-floor" type="number" value={form.floor} onChange={(e) => set("floor", Number(e.target.value))} />
			</Field>
			{unitTypes.length > 0 && (
				<Field id="n-type" label="Apartment type" wide>
					<Select value={form.typeId ?? NONE} onValueChange={(v) => pickType(v === NONE ? "" : v)}>
						<SelectTrigger id="n-type">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{unitTypes.map((t) => (
								<SelectItem key={t.id} value={t.id}>
									{t.name}
								</SelectItem>
							))}
							<SelectItem value={NONE}>No type: describe it here</SelectItem>
						</SelectContent>
					</Select>
					{/* With a type, its size and rooms apply; only a different unit needs its own. */}
					{type && !custom && (
						<div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
							<RoomsLine t={{ areaSqft: type.areaSqft, bedrooms: form.bedrooms ?? 0, bathrooms: form.bathrooms ?? 0, parking: form.parking ?? 0 }} />
							<button type="button" className="text-brand text-xs hover:underline" onClick={() => setCustom(true)}>
								Different in this unit?
							</button>
						</div>
					)}
				</Field>
			)}
			<Field id="n-area" label="Area of this unit (sq ft)" error={serverErrors.areaSqft} hint={type ? `Type: ${type.areaSqft.toLocaleString("en-US")} sq ft on average.` : undefined}>
				<Input id="n-area" type="number" min={0} value={form.areaSqft} onChange={(e) => set("areaSqft", Number(e.target.value))} />
			</Field>
			{(!type || custom) && (
				<>
					{!type && (
						<Field id="n-kind" label="Kind">
							<Input
								id="n-kind"
								list="n-kind-options"
								value={form.kind}
								onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value, bedrooms: bedroomsOf(e.target.value) }))}
							/>
							<datalist id="n-kind-options">
								{UNIT_KINDS.map((k) => (
									<option key={k} value={k} />
								))}
							</datalist>
						</Field>
					)}
					<div className="grid grid-cols-3 gap-2 sm:col-span-2">
						<Field id="n-beds" label="Bedrooms">
							<Input id="n-beds" type="number" min={0} value={form.bedrooms ?? 0} onChange={(e) => set("bedrooms", Math.max(0, Number(e.target.value)))} />
						</Field>
						<Field id="n-baths" label="Bathrooms">
							<Input id="n-baths" type="number" min={0} value={form.bathrooms ?? 0} onChange={(e) => set("bathrooms", Math.max(0, Number(e.target.value)))} />
						</Field>
						<Field id="n-parking" label="Garage spots">
							<Input id="n-parking" type="number" min={0} value={form.parking ?? 0} onChange={(e) => set("parking", Math.max(0, Number(e.target.value)))} />
						</Field>
					</div>
				</>
			)}
			<Field id="n-status" label="Status" error={serverErrors.status}>
				<Select value={form.status} onValueChange={(v) => set("status", v as UnitInput["status"])}>
					<SelectTrigger id="n-status">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{UNIT_STATUSES.map((s) => (
							<SelectItem key={s.id} value={s.id}>
								{s.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<Field id="n-occupant" label="Owner / tenant">
				<Input id="n-occupant" value={form.occupant} onChange={(e) => set("occupant", e.target.value)} placeholder="Name of the buyer or tenant" />
			</Field>
		</FormDialog>
	);
}
