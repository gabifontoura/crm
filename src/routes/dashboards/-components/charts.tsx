import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { colorsFor, formatValue, type Result, SERIES_COLORS, type Slice, type Unit } from "./engine";

/**
 * Hand-drawn SVG charts (no chart library). Thin marks with 4px rounded ends
 * on the baseline, recessive grid, 2px lines, a hover tooltip on every mark,
 * a legend whenever there are two or more series, and text in text colors
 * (the colored mark beside it carries the identity).
 */

const INK = "#1a2433";
const MUTED = "#64748b";
const GRID = "#e2e8f0";

function useWidth<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
		ro.observe(el);
		setWidth(Math.floor(el.getBoundingClientRect().width));
		return () => ro.disconnect();
	}, []);
	return [ref, width] as const;
}

/** Round axis maximum and ticks (0 and 3 more). */
function niceScale(max: number): { top: number; ticks: number[] } {
	if (max <= 0) return { top: 1, ticks: [0, 1] };
	const raw = max / 3;
	const mag = 10 ** Math.floor(Math.log10(raw));
	const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
	const top = step * Math.ceil(max / step);
	const ticks: number[] = [];
	for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
	return { top, ticks };
}

const clip = (s: string, chars: number) => (s.length > chars ? `${s.slice(0, Math.max(1, chars - 1))}…` : s);

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
	// Kept inside the chart: flips to the left near the right edge.
	const left = Math.min(Math.max(8, x + 12), Math.max(8, width - 190));
	return (
		<div
			role="status"
			className="pointer-events-none absolute z-10 w-max max-w-[180px] rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-md"
			style={{ left, top: Math.max(0, y - 10) }}
		>
			{children}
		</div>
	);
}

function Swatch({ color }: { color: string }) {
	return <span className="inline-block size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />;
}

export function Empty({ children = "No data for this period." }: { children?: ReactNode }) {
	return <div className="flex h-full min-h-32 items-center justify-center text-center text-muted-foreground text-sm">{children}</div>;
}

/* ---------------------------------- KPI ---------------------------------- */

export function KpiView({ result, rangeLabel }: { result: Extract<Result, { kind: "kpi" }>; rangeLabel: string }) {
	const { value, previous, unit } = result;
	const delta = previous === null || previous === 0 ? null : (value - previous) / Math.abs(previous);
	return (
		<div className="flex h-full flex-col justify-center gap-1">
			<span className="font-semibold text-3xl text-foreground tabular-nums leading-tight">{formatValue(value, unit)}</span>
			{previous !== null && (
				<span className="flex items-center gap-1 text-muted-foreground text-xs">
					{delta === null ? (
						<MinusIcon className="size-3.5" />
					) : delta >= 0 ? (
						<ArrowUpRightIcon className="size-3.5" weight="bold" />
					) : (
						<ArrowDownRightIcon className="size-3.5" weight="bold" />
					)}
					{delta === null ? "No earlier data" : `${delta >= 0 ? "+" : ""}${Math.round(delta * 100)}% vs previous ${rangeLabel.replace(/^Last /, "")} (${formatValue(previous, unit)})`}
				</span>
			)}
		</div>
	);
}

/* -------------------------------- Columns -------------------------------- */

function sliceColors(slices: Slice[]) {
	// One series: one hue, unless the groups are entities with their own colors.
	const entity = slices.some((s) => s.color && s.key !== "__other__");
	const map = entity ? colorsFor(slices) : new Map<string, string>();
	return (s: Slice) => (s.key === "__other__" ? "#94A3B8" : entity ? (map.get(s.key) ?? SERIES_COLORS[0]) : SERIES_COLORS[0]);
}

export function ColumnView({ slices, unit }: { slices: Slice[]; unit: Unit }) {
	const [ref, width] = useWidth<HTMLDivElement>();
	const [hover, setHover] = useState<number | null>(null);
	if (!slices.length) return <Empty />;
	const H = 220;
	const m = { top: 16, right: 8, bottom: 34, left: 44 };
	const innerW = Math.max(40, width - m.left - m.right);
	const innerH = H - m.top - m.bottom;
	const { top, ticks } = niceScale(Math.max(...slices.map((s) => s.value)));
	const band = innerW / slices.length;
	const barW = Math.min(44, Math.max(6, band * 0.62));
	const y = (v: number) => m.top + innerH - (v / top) * innerH;
	const color = sliceColors(slices);
	const showValues = slices.length <= 8 && band >= 28;
	const chars = Math.max(3, Math.floor(band / 6.2));

	return (
		<div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
			{width > 0 && (
				<svg width={width} height={H} role="img" aria-label="Column chart" className="block">
					{ticks.map((t) => (
						<g key={t}>
							<line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
							<text x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={MUTED}>
								{formatValue(t, unit, true)}
							</text>
						</g>
					))}
					{slices.map((s, i) => {
						const x = m.left + band * i + (band - barW) / 2;
						const h = Math.max(s.value > 0 ? 2 : 0, (s.value / top) * innerH);
						const y0 = m.top + innerH;
						const r = Math.min(4, barW / 2, h);
						return (
							<g key={s.key}>
								<path
									d={`M${x},${y0} V${y0 - h + r} Q${x},${y0 - h} ${x + r},${y0 - h} H${x + barW - r} Q${x + barW},${y0 - h} ${x + barW},${y0 - h + r} V${y0} Z`}
									fill={color(s)}
									opacity={hover === null || hover === i ? 1 : 0.45}
								/>
								{showValues && (
									<text x={x + barW / 2} y={y0 - h - 4} textAnchor="middle" fontSize={10} fill={INK}>
										{formatValue(s.value, unit, true)}
									</text>
								)}
								<text x={m.left + band * i + band / 2} y={H - m.bottom + 14} textAnchor="middle" fontSize={10} fill={MUTED}>
									{clip(s.label, chars)}
								</text>
								{/* Hit target: the whole column band, bigger than the mark. */}
								<rect x={m.left + band * i} y={m.top} width={band} height={innerH + 20} fill="transparent" onMouseEnter={() => setHover(i)} />
							</g>
						);
					})}
				</svg>
			)}
			{hover !== null && slices[hover] && (
				<Tooltip x={m.left + band * hover + band / 2} y={y(slices[hover].value)} width={width}>
					<div className="flex items-center gap-1.5 font-medium">
						<Swatch color={color(slices[hover])} /> {slices[hover].label}
					</div>
					<div className="tabular-nums">{formatValue(slices[hover].value, unit)}</div>
				</Tooltip>
			)}
		</div>
	);
}

/* --------------------------------- Bars ---------------------------------- */

export function BarView({ slices, unit }: { slices: Slice[]; unit: Unit }) {
	const [hover, setHover] = useState<number | null>(null);
	if (!slices.length) return <Empty />;
	const max = Math.max(...slices.map((s) => s.value), 0) || 1;
	const color = sliceColors(slices);
	return (
		<ul className="flex flex-col gap-1.5" onMouseLeave={() => setHover(null)}>
			{slices.map((s, i) => (
				<li
					key={s.key}
					className="grid grid-cols-[minmax(0,38%)_minmax(0,1fr)_auto] items-center gap-2 text-xs"
					onMouseEnter={() => setHover(i)}
					title={`${s.label}: ${formatValue(s.value, unit)}`}
				>
					<span className="truncate text-muted-foreground">{s.label}</span>
					<span className="h-3.5 rounded-r-[4px] bg-muted/40">
						<span
							className="block h-full rounded-r-[4px] transition-opacity"
							style={{ width: `${Math.max(s.value > 0 ? 1.5 : 0, (s.value / max) * 100)}%`, backgroundColor: color(s), opacity: hover === null || hover === i ? 1 : 0.45 }}
						/>
					</span>
					<span className="text-right text-foreground tabular-nums">{formatValue(s.value, unit, true)}</span>
				</li>
			))}
		</ul>
	);
}

/* --------------------------------- Line ---------------------------------- */

export function LineView({ result }: { result: Extract<Result, { kind: "series" }> }) {
	const [ref, width] = useWidth<HTMLDivElement>();
	const [hover, setHover] = useState<number | null>(null);
	const { buckets, series, unit } = result;
	if (!buckets.length || series.every((s) => s.values.every((v) => v === 0))) return <Empty />;
	const colors = colorsFor(series);
	const colorOf = (key: string) => (series.length === 1 ? SERIES_COLORS[0] : key === "__other__" ? "#94A3B8" : (colors.get(key) ?? SERIES_COLORS[0]));
	const H = 220;
	const m = { top: 12, right: 12, bottom: 28, left: 44 };
	const innerW = Math.max(40, width - m.left - m.right);
	const innerH = H - m.top - m.bottom;
	const { top, ticks } = niceScale(Math.max(...series.flatMap((s) => s.values)));
	const x = (i: number) => m.left + (buckets.length === 1 ? innerW / 2 : (i / (buckets.length - 1)) * innerW);
	const y = (v: number) => m.top + innerH - (v / top) * innerH;
	// Enough room between labels: show every k-th bucket.
	const every = Math.max(1, Math.ceil(buckets.length / Math.max(2, Math.floor(innerW / 64))));

	return (
		<div className="flex flex-col gap-2">
			{series.length > 1 && (
				<ul className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs" aria-label="Legend">
					{series.map((s) => (
						<li key={s.key} className="flex items-center gap-1.5">
							<span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: colorOf(s.key) }} /> {s.label}
						</li>
					))}
				</ul>
			)}
			<div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
				{width > 0 && (
					<svg
						width={width}
						height={H}
						role="img"
						aria-label="Line chart"
						className="block"
						onMouseMove={(e) => {
							const bx = e.currentTarget.getBoundingClientRect().left;
							const px = e.clientX - bx;
							const i = Math.round(((px - m.left) / innerW) * (buckets.length - 1));
							setHover(Math.min(buckets.length - 1, Math.max(0, i)));
						}}
					>
						{ticks.map((t) => (
							<g key={t}>
								<line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
								<text x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={MUTED}>
									{formatValue(t, unit, true)}
								</text>
							</g>
						))}
						{buckets.map((b, i) =>
							// Every k-th label, and the last one, never crowding the one before it.
							i === buckets.length - 1 || (i % every === 0 && buckets.length - 1 - i >= every) ? (
								<text key={b.key} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === buckets.length - 1 ? "end" : "middle"} fontSize={10} fill={MUTED}>
									{b.label}
								</text>
							) : null,
						)}
						{hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + innerH} stroke={MUTED} strokeWidth={1} strokeDasharray="3 3" />}
						{series.map((s) => (
							<g key={s.key}>
								<path
									d={s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")}
									fill="none"
									stroke={colorOf(s.key)}
									strokeWidth={2}
									strokeLinejoin="round"
									strokeLinecap="round"
								/>
								{hover !== null && <circle cx={x(hover)} cy={y(s.values[hover])} r={4} fill={colorOf(s.key)} stroke="#ffffff" strokeWidth={2} />}
							</g>
						))}
					</svg>
				)}
				{hover !== null && buckets[hover] && (
					<Tooltip x={x(hover)} y={m.top + 8} width={width}>
						<div className="mb-0.5 font-medium">{buckets[hover].label}</div>
						{series.map((s) => (
							<div key={s.key} className="flex items-center justify-between gap-3">
								<span className="flex items-center gap-1.5">
									<Swatch color={colorOf(s.key)} /> {s.label}
								</span>
								<span className="tabular-nums">{formatValue(s.values[hover], unit)}</span>
							</div>
						))}
					</Tooltip>
				)}
			</div>
		</div>
	);
}

/* --------------------------------- Donut --------------------------------- */

export function DonutView({ slices, unit, total }: { slices: Slice[]; unit: Unit; total: number }) {
	const [hover, setHover] = useState<string | null>(null);
	const sum = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
	if (!sum) return <Empty />;
	const colors = colorsFor(slices);
	const colorOf = (s: Slice) => (s.key === "__other__" ? "#94A3B8" : (colors.get(s.key) ?? SERIES_COLORS[0]));
	const R = 70;
	const r = 46;
	let angle = -Math.PI / 2;
	const arcs = slices.map((s) => {
		const a0 = angle;
		const a1 = angle + (Math.max(0, s.value) / sum) * Math.PI * 2;
		angle = a1;
		const large = a1 - a0 > Math.PI ? 1 : 0;
		const p = (rad: number, a: number) => `${80 + rad * Math.cos(a)},${80 + rad * Math.sin(a)}`;
		// A full circle can't be one arc: split it.
		const d =
			a1 - a0 >= Math.PI * 2 - 1e-6
				? `M${p(R, a0)} A${R},${R} 0 1 1 ${p(R, a0 + Math.PI)} A${R},${R} 0 1 1 ${p(R, a0)} M${p(r, a0)} A${r},${r} 0 1 0 ${p(r, a0 + Math.PI)} A${r},${r} 0 1 0 ${p(r, a0)} Z`
				: `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)} Z`;
		return { s, d };
	});
	const focus = slices.find((s) => s.key === hover);
	return (
		<div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
			<svg width={160} height={160} viewBox="0 0 160 160" role="img" aria-label="Donut chart" className="shrink-0">
				{arcs.map(({ s, d }) => (
					<path
						key={s.key}
						d={d}
						fill={colorOf(s)}
						stroke="#ffffff"
						strokeWidth={2}
						fillRule="evenodd"
						opacity={hover === null || hover === s.key ? 1 : 0.45}
						onMouseEnter={() => setHover(s.key)}
						onMouseLeave={() => setHover(null)}
					>
						<title>{`${s.label}: ${formatValue(s.value, unit)} (${Math.round((s.value / sum) * 100)}%)`}</title>
					</path>
				))}
				<text x={80} y={76} textAnchor="middle" fontSize={focus ? 11 : 10} fill={MUTED}>
					{focus ? clip(focus.label, 14) : "Total"}
				</text>
				<text x={80} y={94} textAnchor="middle" fontSize={16} fontWeight={600} fill={INK}>
					{formatValue(focus ? focus.value : total, unit, true)}
				</text>
			</svg>
			<ul className="flex w-full min-w-0 flex-col gap-1 text-xs" aria-label="Legend">
				{slices.map((s) => (
					<li
						key={s.key}
						className="flex items-center justify-between gap-2"
						onMouseEnter={() => setHover(s.key)}
						onMouseLeave={() => setHover(null)}
					>
						<span className="flex min-w-0 items-center gap-1.5">
							<Swatch color={colorOf(s)} />
							<span className="truncate text-muted-foreground">{s.label}</span>
						</span>
						<span className="shrink-0 text-foreground tabular-nums">
							{formatValue(s.value, unit, true)} <span className="text-muted-foreground">· {Math.round((s.value / sum) * 100)}%</span>
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

/* --------------------------------- Table --------------------------------- */

export function TableView({ result }: { result: Result }) {
	if (result.kind === "kpi") {
		return (
			<table className="w-full text-sm">
				<tbody>
					<tr>
						<td className="py-1 text-muted-foreground">Value</td>
						<td className="py-1 text-right tabular-nums">{formatValue(result.value, result.unit)}</td>
					</tr>
					{result.previous !== null && (
						<tr>
							<td className="py-1 text-muted-foreground">Previous period</td>
							<td className="py-1 text-right tabular-nums">{formatValue(result.previous, result.unit)}</td>
						</tr>
					)}
				</tbody>
			</table>
		);
	}
	if (result.kind === "series") {
		return (
			<div className="max-h-64 overflow-auto">
				<table className="w-full text-xs">
					<thead className="sticky top-0 bg-card text-left text-muted-foreground">
						<tr>
							<th className="py-1 pr-2 font-medium">Period</th>
							{result.series.map((s) => (
								<th key={s.key} className="py-1 pl-2 text-right font-medium">
									{s.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						{result.buckets.map((b, i) => (
							<tr key={b.key}>
								<td className="py-1 pr-2 text-muted-foreground">{b.label}</td>
								{result.series.map((s) => (
									<td key={s.key} className="py-1 pl-2 text-right tabular-nums">
										{formatValue(s.values[i], result.unit)}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		);
	}
	const sum = result.slices.reduce((s, x) => s + x.value, 0);
	const share = result.unit !== "days" && !result.slices.some((s) => s.value < 0);
	return (
		<div className="max-h-64 overflow-auto">
			<table className="w-full text-sm">
				<tbody className="divide-y divide-border">
					{result.slices.map((s) => (
						<tr key={s.key}>
							<td className="py-1.5 pr-2 text-muted-foreground">{s.label}</td>
							<td className="py-1.5 text-right tabular-nums">{formatValue(s.value, result.unit)}</td>
							{share && <td className="w-14 py-1.5 text-right text-muted-foreground text-xs tabular-nums">{sum ? `${Math.round((s.value / sum) * 100)}%` : "—"}</td>}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
