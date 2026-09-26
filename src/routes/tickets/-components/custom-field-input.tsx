import type { ReactNode } from "react";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { formatCurrency } from "#/lib/format";
import { cn } from "#/lib/utils";
import type { FieldDef, FieldValue } from "../../../../shared/tickets";

const NONE = "__none__";

/** Input for one admin-defined ticket field, whatever its kind. */
export function CustomFieldInput({
	def,
	value,
	onChange,
	required,
	error,
	disabled,
	idPrefix = "cf",
}: {
	def: FieldDef;
	value: FieldValue | undefined;
	onChange: (v: FieldValue) => void;
	/** Shows the asterisk (required at opening, or by the chosen transition). */
	required?: boolean;
	error?: string;
	disabled?: boolean;
	idPrefix?: string;
}) {
	const id = `${idPrefix}-${def.id}`;
	const text = value === null || value === undefined ? "" : String(value);

	if (def.kind === "checkbox") {
		return (
			<div className={cn("flex flex-col gap-1", def.kind === "checkbox" && "sm:col-span-2")}>
				<label htmlFor={id} className="flex items-center gap-2 text-sm">
					<Checkbox id={id} checked={value === true} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} />
					<span className="font-medium">
						{def.label} {required && <span className="text-destructive">*</span>}
					</span>
				</label>
				{def.helpText && !error && <span className="pl-6 text-muted-foreground text-xs">{def.helpText}</span>}
				{error && <span className="pl-6 text-destructive text-xs">{error}</span>}
			</div>
		);
	}

	let control: ReactNode;
	if (def.kind === "textarea") {
		control = (
			<Textarea id={id} rows={3} className="resize-none text-sm" value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
		);
	} else if (def.kind === "select") {
		control = (
			<Select value={text || NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
				<SelectTrigger id={id} className="h-9 text-sm">
					<SelectValue placeholder="Select" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NONE}>—</SelectItem>
					{def.options.map((o) => (
						<SelectItem key={o} value={o}>
							{o}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		);
	} else {
		const kind = def.kind === "currency" || def.kind === "number" ? "number" : def.kind === "date" ? "date" : "text";
		control = (
			<div className="relative">
				{def.kind === "currency" && (
					<span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground text-sm">$</span>
				)}
				<Input
					id={id}
					type={kind}
					inputMode={kind === "number" ? "decimal" : undefined}
					step={def.kind === "currency" ? "0.01" : undefined}
					className={cn("h-9 text-sm", def.kind === "currency" && "pl-7")}
					value={text}
					disabled={disabled}
					onChange={(e) => onChange(e.target.value === "" ? null : kind === "number" ? Number(e.target.value) : e.target.value)}
				/>
			</div>
		);
	}

	return (
		<div className={cn("flex flex-col gap-1.5", def.kind === "textarea" && "sm:col-span-2")}>
			<Label htmlFor={id} className="text-xs sm:text-sm">
				{def.label} {required && <span className="text-destructive">*</span>}
			</Label>
			{control}
			{def.helpText && !error && <span className="text-muted-foreground text-xs">{def.helpText}</span>}
			{error && <span className="text-destructive text-xs">{error}</span>}
		</div>
	);
}

/** Read-only display of a field value. */
export function formatFieldValue(def: FieldDef, value: FieldValue | undefined): string {
	if (value === null || value === undefined || value === "") return "—";
	if (def.kind === "checkbox") return value ? "Yes" : "No";
	if (def.kind === "currency" && typeof value === "number") return formatCurrency(value);
	if (def.kind === "date" && typeof value === "string") {
		const d = new Date(`${value}T00:00:00`);
		return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
	}
	return String(value);
}
