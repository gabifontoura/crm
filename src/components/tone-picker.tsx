import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "#/lib/utils";
import { TONES, toneOf } from "../../shared/palette";

/**
 * Picks one of the CRM's tones, in the same style as the calendar's color
 * picker: soft background, colored border, and a check on the picked one.
 * The value is the solid shade.
 */
export function TonePicker({
	value,
	onChange,
	size = "md",
	label = "Color",
}: {
	value: string;
	onChange: (solid: string) => void;
	size?: "sm" | "md";
	label?: string;
}) {
	const current = toneOf(value);
	return (
		<div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={label}>
			{TONES.map((t) => {
				const on = current?.id === t.id;
				return (
					<button
						key={t.id}
						type="button"
						role="radio"
						aria-checked={on}
						aria-label={t.label}
						title={t.label}
						onClick={() => onChange(t.solid)}
						className={cn(
							"flex items-center justify-center rounded-md border-2 transition-transform hover:scale-110",
							size === "sm" ? "size-6" : "size-7",
						)}
						style={{ backgroundColor: t.soft, borderColor: t.border }}
					>
						{on && <CheckIcon className={cn("text-slate-800", size === "sm" ? "size-3.5" : "size-4")} weight="bold" />}
					</button>
				);
			})}
		</div>
	);
}
