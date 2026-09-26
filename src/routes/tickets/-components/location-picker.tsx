import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import type { DevelopmentTree } from "../../../../shared/developments";

const NONE = "__none__";

export interface LocationValue {
	developmentId: string;
	blockId: string;
	unitId: string;
}

/** Development → block → unit pickers; later levels unlock as you choose. */
export function LocationPicker({
	developments,
	value,
	onChange,
	errors = {},
	idPrefix = "loc",
}: {
	developments: DevelopmentTree[];
	value: LocationValue;
	onChange: (v: LocationValue) => void;
	errors?: Record<string, string | undefined>;
	idPrefix?: string;
}) {
	const dev = developments.find((d) => d.id === value.developmentId);
	const block = dev?.blocks.find((b) => b.id === value.blockId);

	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={`${idPrefix}-dev`} className="text-xs sm:text-sm">
					Development
				</Label>
				<Select
					value={value.developmentId || NONE}
					onValueChange={(v) => onChange({ developmentId: v === NONE ? "" : v, blockId: "", unitId: "" })}
				>
					<SelectTrigger id={`${idPrefix}-dev`} className="h-9 text-sm">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={NONE}>No development</SelectItem>
						{developments.map((d) => (
							<SelectItem key={d.id} value={d.id}>
								{d.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{errors.developmentId && <span className="text-destructive text-xs">{errors.developmentId}</span>}
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={`${idPrefix}-block`} className="text-xs sm:text-sm">
					Block
				</Label>
				<Select
					value={value.blockId || NONE}
					onValueChange={(v) => onChange({ ...value, blockId: v === NONE ? "" : v, unitId: "" })}
					disabled={!dev || dev.blocks.length === 0}
				>
					<SelectTrigger id={`${idPrefix}-block`} className="h-9 text-sm">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={NONE}>Whole development</SelectItem>
						{dev?.blocks.map((b) => (
							<SelectItem key={b.id} value={b.id}>
								{b.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{errors.blockId && <span className="text-destructive text-xs">{errors.blockId}</span>}
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={`${idPrefix}-unit`} className="text-xs sm:text-sm">
					Unit
				</Label>
				<Select
					value={value.unitId || NONE}
					onValueChange={(v) => onChange({ ...value, unitId: v === NONE ? "" : v })}
					disabled={!block || block.units.length === 0}
				>
					<SelectTrigger id={`${idPrefix}-unit`} className="h-9 text-sm">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={NONE}>Common areas</SelectItem>
						{block?.units.map((u) => (
							<SelectItem key={u.id} value={u.id}>
								{u.number} · {u.kind}
								{u.occupant ? ` · ${u.occupant}` : ""}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{errors.unitId && <span className="text-destructive text-xs">{errors.unitId}</span>}
			</div>
		</div>
	);
}
