import { BathtubIcon, BedIcon, CarIcon, CaretLeftIcon, CaretRightIcon, CheckIcon, PlusIcon, RulerIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { cn } from "#/lib/utils";
import { CONSTRUCTION_STAGES, type ConstructionStage, type Unit, type UnitType, typePhotos } from "../../../../shared/developments";
import { KIND_STYLE, PhotoManager, sized } from "./photos";

const sqm = (sqft: number) => Math.round(sqft * 0.092903);
export const sizeLabel = (sqft: number) => `${sqft.toLocaleString("en-US")} sq ft · ${sqm(sqft)} m²`;
const newId = () => `ut-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * A schematic floor plan drawn from the rooms (used when the type has no
 * floor plan image): living and kitchen, the bedrooms, bathrooms and balcony.
 */
export function SchematicPlan({ type, className }: { type: Pick<UnitType, "bedrooms" | "bathrooms" | "name">; className?: string }) {
	const beds = Math.min(type.bedrooms, 5);
	// Stores, suites and bays: one open space with a restroom.
	if (beds === 0 && !/studio|loft/i.test(type.name)) {
		return (
			<svg viewBox="0 0 320 220" className={cn("h-auto w-full", className)} role="img" aria-label={`Floor plan: ${type.name}`}>
				<rect x="0" y="0" width="320" height="220" fill="#F8FAFC" />
				<rect x="10" y="10" width="300" height="200" fill="#fff" stroke="#334155" strokeWidth="3" />
				<rect x="250" y="10" width="60" height="60" fill="#E0F2FE" stroke="#334155" strokeWidth="1.5" />
				<text x="280" y="44" textAnchor="middle" fontSize="10" fill="#334155" fontFamily="sans-serif">
					WC
				</text>
				<text x="130" y="115" textAnchor="middle" fontSize="12" fill="#334155" fontFamily="sans-serif">
					Open space
				</text>
				<rect x="10" y="196" width="120" height="14" fill="#DCFCE7" stroke="#64748B" strokeDasharray="4 3" />
				<text x="70" y="206" textAnchor="middle" fontSize="9" fill="#475569" fontFamily="sans-serif">
					Entrance
				</text>
			</svg>
		);
	}
	const baths = Math.max(1, Math.min(type.bathrooms, 4));
	const W = 320;
	const H = 220;
	const pad = 10;
	const topH = 110;
	// Top row: bedrooms, then bathrooms; bottom: living + kitchen and a balcony strip.
	const top = [...Array.from({ length: beds }, (_, i) => ({ label: i === 0 && beds > 1 ? "Main bed" : "Bedroom", w: 3 })), ...Array.from({ length: baths }, () => ({ label: "Bath", w: 1.6 }))];
	const unit = (W - pad * 2) / top.reduce((s, r) => s + r.w, 0);
	let x = pad;
	return (
		<svg viewBox={`0 0 ${W} ${H}`} className={cn("h-auto w-full", className)} role="img" aria-label={`Floor plan: ${type.name}`}>
			<rect x="0" y="0" width={W} height={H} fill="#F8FAFC" />
			<rect x={pad} y={pad} width={W - pad * 2} height={H - pad * 2 - 22} fill="#fff" stroke="#334155" strokeWidth="3" />
			{top.map((r, i) => {
				const w = r.w * unit;
				const el = (
					<g key={i}>
						<rect x={x} y={pad} width={w} height={topH} fill={r.label === "Bath" ? "#E0F2FE" : "#F1F5F9"} stroke="#334155" strokeWidth="1.5" />
						<text x={x + w / 2} y={pad + topH / 2} textAnchor="middle" fontSize="10" fill="#334155" fontFamily="sans-serif">
							{r.label}
						</text>
						{/* door */}
						<path d={`M${x + w / 2 - 8} ${pad + topH} a 10 10 0 0 1 10 -10`} fill="none" stroke="#94A3B8" strokeWidth="1" />
					</g>
				);
				x += w;
				return el;
			})}
			<rect x={pad} y={pad + topH} width={(W - pad * 2) * 0.62} height={H - pad * 2 - 22 - topH} fill="#FEF9C3" stroke="#334155" strokeWidth="1.5" />
			<text x={pad + (W - pad * 2) * 0.31} y={pad + topH + 38} textAnchor="middle" fontSize="11" fill="#334155" fontFamily="sans-serif">
				{beds === 0 ? "Living · sleeping" : "Living · dining"}
			</text>
			<rect x={pad + (W - pad * 2) * 0.62} y={pad + topH} width={(W - pad * 2) * 0.38} height={H - pad * 2 - 22 - topH} fill="#DCFCE7" stroke="#334155" strokeWidth="1.5" />
			<text x={pad + (W - pad * 2) * 0.81} y={pad + topH + 38} textAnchor="middle" fontSize="11" fill="#334155" fontFamily="sans-serif">
				Kitchen
			</text>
			<rect x={pad + 30} y={H - pad - 20} width={W - pad * 2 - 60} height="16" fill="#E2E8F0" stroke="#64748B" strokeDasharray="4 3" />
			<text x={W / 2} y={H - pad - 8} textAnchor="middle" fontSize="9" fill="#475569" fontFamily="sans-serif">
				Balcony
			</text>
		</svg>
	);
}

/** Bedrooms · bathrooms · garage · size, with icons. */
export function RoomsLine({ t, className }: { t: Pick<UnitType, "bedrooms" | "bathrooms" | "parking" | "areaSqft">; className?: string }) {
	return (
		<span className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs", className)}>
			<span className="inline-flex items-center gap-1" title="Bedrooms">
				<BedIcon className="size-3.5" /> {t.bedrooms === 0 ? "Studio" : `${t.bedrooms} bed`}
			</span>
			<span className="inline-flex items-center gap-1" title="Bathrooms">
				<BathtubIcon className="size-3.5" /> {t.bathrooms} bath
			</span>
			<span className="inline-flex items-center gap-1" title="Garage spots">
				<CarIcon className="size-3.5" /> {t.parking} {t.parking === 1 ? "spot" : "spots"}
			</span>
			<span className="inline-flex items-center gap-1" title="Area">
				<RulerIcon className="size-3.5" /> {sizeLabel(t.areaSqft)}
			</span>
		</span>
	);
}

/** The development's apartment types: each with its floor plan (image, or drawn from the rooms). */
export function UnitTypeCards({ types, units }: { types: UnitType[]; units: Unit[] }) {
	const [open, setOpen] = useState<UnitType | null>(null);
	if (types.length === 0) return null;
	return (
		<>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{types.map((t) => {
					const mine = units.filter((u) => u.typeId === t.id);
					const free = mine.filter((u) => u.status === "available").length;
					return (
						<button key={t.id} type="button" onClick={() => setOpen(t)} className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition-shadow hover:shadow-md">
							<div className="relative aspect-[16/10] overflow-hidden border-border border-b bg-slate-50">
								{typePhotos(t).length > 0 && (
									<span className="absolute right-1.5 bottom-1.5 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
										{typePhotos(t).length} photos + plan
									</span>
								)}
								{t.photoUrl ? (
									<img src={sized(t.photoUrl, 600)} alt={t.name} className="size-full object-cover" loading="lazy" />
								) : t.floorPlanUrl ? (
									<img src={sized(t.floorPlanUrl, 600)} alt={`Floor plan: ${t.name}`} className="size-full object-cover" loading="lazy" />
								) : (
									<SchematicPlan type={t} />
								)}
							</div>
							<div className="flex flex-col gap-1 p-3">
								<span className="flex items-center justify-between gap-2">
									<span className="font-semibold text-sm">{t.name}</span>
									<span className="text-muted-foreground text-xs">
										{mine.length} units{free ? ` · ${free} available` : ""}
									</span>
								</span>
								<RoomsLine t={t} />
								{t.description && <span className="line-clamp-2 text-muted-foreground text-xs">{t.description}</span>}
							</div>
						</button>
					);
				})}
			</div>
			{open && <TypeViewer types={types} units={units} startId={open.id} onClose={() => setOpen(null)} />}
		</>
	);
}

/**
 * One apartment type at a time: a carousel of its photo and floor plan (with
 * dots), its rooms, and a ticker of the other types to move between them.
 */
function TypeViewer({ types, units, startId, onClose }: { types: UnitType[]; units: Unit[]; startId: string; onClose: () => void }) {
	const [at, setAt] = useState(Math.max(0, types.findIndex((t) => t.id === startId)));
	const [slide, setSlide] = useState(0);
	const t = types[at];
	const kindName: Record<string, string> = { photo: "Photo", render: "Render", floor_plan: "Floor plan", construction: "Construction" };
	const slides: { key: string; label: string; caption?: string; kind?: keyof typeof KIND_STYLE; node: React.ReactNode }[] = [
		...typePhotos(t).map((ph) => ({
			key: ph.id,
			label: kindName[ph.kind] ?? "Photo",
			caption: ph.caption,
			kind: ph.kind,
			node: <img src={sized(ph.url, 1600)} alt={ph.caption || t.name} className={cn("size-full", ph.kind === "floor_plan" ? "bg-white object-contain" : "object-cover")} />,
		})),
		{
			key: "plan",
			label: t.floorPlanUrl ? "Floor plan" : "Floor plan (schematic)",
			node: t.floorPlanUrl ? <img src={sized(t.floorPlanUrl, 1600)} alt={`Floor plan: ${t.name}`} className="size-full bg-white object-contain" /> : <div className="flex size-full items-center justify-center bg-slate-50 p-4"><SchematicPlan type={t} className="max-h-full" /></div>,
		},
	];
	const cur = Math.min(slide, slides.length - 1);
	const go = (i: number) => {
		setAt((i + types.length) % types.length);
		setSlide(0);
	};
	const mine = units.filter((u) => u.typeId === t.id);
	const free = mine.filter((u) => u.status === "available").length;

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent
				className="!max-w-[95vw] sm:!max-w-3xl"
				onKeyDown={(e) => {
					if (e.key === "ArrowRight") setSlide((x) => (x + 1) % slides.length);
					if (e.key === "ArrowLeft") setSlide((x) => (x - 1 + slides.length) % slides.length);
				}}
			>
				<div className="flex items-start justify-between gap-3 pr-6">
					<div>
						<DialogTitle>{t.name}</DialogTitle>
						<p className="mt-0.5 text-muted-foreground text-xs">
							{mine.length} units{free ? ` · ${free} available` : ""} · type {at + 1} of {types.length}
						</p>
					</div>
				</div>

				{/* Carousel: photo, floor plan */}
				<div className="relative aspect-[16/10] overflow-hidden rounded-md border border-border bg-muted">
					<div className="flex h-full transition-transform duration-300" style={{ transform: `translateX(-${cur * 100}%)` }}>
						{slides.map((sl) => (
							<div key={sl.key} className="h-full w-full shrink-0">
								{sl.node}
							</div>
						))}
					</div>
					<span className={cn("absolute top-2 left-2 rounded px-2 py-0.5 font-semibold text-[11px] uppercase", slides[cur].kind ? KIND_STYLE[slides[cur].kind!] : "bg-black/60 text-white")}>{slides[cur].label}</span>
					<span className="absolute top-2 right-2 rounded bg-black/60 px-2 py-0.5 text-[11px] text-white tabular-nums">
						{cur + 1} / {slides.length}
					</span>
					{slides.length > 1 && (
						<>
							<button type="button" aria-label="Previous picture" onClick={() => setSlide((cur - 1 + slides.length) % slides.length)} className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70">
								<CaretLeftIcon className="size-5" />
							</button>
							<button type="button" aria-label="Next picture" onClick={() => setSlide((cur + 1) % slides.length)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70">
								<CaretRightIcon className="size-5" />
							</button>
							<div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
								{slides.map((sl, i) => (
									<button key={sl.key} type="button" aria-label={sl.label} aria-current={i === cur} onClick={() => setSlide(i)} className={cn("h-2 rounded-full transition-all", i === cur ? "w-6 bg-white" : "w-2 bg-white/60 hover:bg-white/80")} />
								))}
							</div>
						</>
					)}
				</div>
				{!t.floorPlanUrl && slides[cur].key === "plan" && <p className="-mt-2 text-muted-foreground text-xs">Drawn from the rooms. Add the floor plan image to the type to show the real one.</p>}

				<RoomsLine t={t} className="text-sm" />
				{t.description && <p className="text-sm">{t.description}</p>}

				{/* Ticker: the other types */}
				{types.length > 1 && (
					<div className="flex items-center gap-2 border-border border-t pt-3">
						<Button type="button" size="icon-sm" variant="secondary" aria-label="Previous type" onClick={() => go(at - 1)}>
							<CaretLeftIcon className="size-4" />
						</Button>
						<div className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							{types.map((x, i) => (
								<button
									key={x.id}
									type="button"
									onClick={() => go(i)}
									aria-current={i === at}
									className={cn("flex shrink-0 items-center gap-2 rounded-md border p-1 pr-2.5 text-left text-xs transition-colors", i === at ? "border-brand bg-brand/5" : "border-border hover:bg-muted/40")}
								>
									<span className="size-9 overflow-hidden rounded bg-slate-50">
										{x.photoUrl ? <img src={sized(x.photoUrl, 120)} alt="" className="size-full object-cover" /> : <SchematicPlan type={x} className="size-full" />}
									</span>
									<span>
										<span className="block font-medium">{x.name}</span>
										<span className="text-muted-foreground">{x.bedrooms === 0 ? "Studio" : `${x.bedrooms} bed`} · {x.parking} {x.parking === 1 ? "spot" : "spots"}</span>
									</span>
								</button>
							))}
						</div>
						<Button type="button" size="icon-sm" variant="secondary" aria-label="Next type" onClick={() => go(at + 1)}>
							<CaretRightIcon className="size-4" />
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

/** Edits the apartment types: a compact list; each opens to edit its size, rooms, photo and floor plan. */
export function UnitTypesEditor({ value, onChange, error }: { value: UnitType[]; onChange: (v: UnitType[]) => void; error?: string }) {
	const [openId, setOpenId] = useState<string | null>(null);
	const patch = (i: number, p: Partial<UnitType>) => onChange(value.map((t, k) => (k === i ? { ...t, ...p } : t)));
	const num = (v: string) => Math.max(0, Number(v) || 0);
	const add = () => {
		const t: UnitType = { id: newId(), name: "", areaSqft: 850, bedrooms: 2, bathrooms: 2, parking: 1, photoUrl: "", floorPlanUrl: "", description: "" };
		onChange([...value, t]);
		setOpenId(t.id);
	};
	return (
		<div className="flex flex-col gap-2">
			{value.length === 0 && <p className="rounded-md border border-dashed border-border px-3 py-4 text-muted-foreground text-sm">No apartment types yet. Add one per floor plan (e.g. “2-bedroom Type B”).</p>}
			<ul className="flex flex-col divide-y divide-border rounded-md border border-border">
				{value.map((t, i) => {
					const open = openId === t.id;
					return (
						<li key={t.id} className={cn(open && "bg-muted/20")}>
							{/* The type at a glance: click to edit it */}
							<div className="flex items-center gap-3 px-3 py-2">
								<button type="button" onClick={() => setOpenId(open ? null : t.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
									<span className="size-12 shrink-0 overflow-hidden rounded-md border border-border bg-slate-50">
										{t.photoUrl ? <img src={sized(t.photoUrl, 160)} alt="" className="size-full object-cover" /> : <SchematicPlan type={t} className="size-full" />}
									</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium text-sm">{t.name || <span className="text-muted-foreground">Unnamed type</span>}</span>
										<RoomsLine t={t} />
									</span>
								</button>
								<Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setOpenId(open ? null : t.id)}>
									{open ? "Done" : "Edit"}
								</Button>
								<Button type="button" size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Remove ${t.name}`} onClick={() => onChange(value.filter((_, k) => k !== i))}>
									<TrashIcon className="size-4" />
								</Button>
							</div>

							{open && (
								<div className="grid grid-cols-2 gap-3 border-border border-t px-3 py-3 sm:grid-cols-4">
									<label className="col-span-2 flex flex-col gap-1 text-muted-foreground text-xs">
										Name
										<Input className="h-8 text-sm" autoFocus value={t.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="e.g. 2-bedroom Type B" />
									</label>
									<label className="col-span-2 flex flex-col gap-1 text-muted-foreground text-xs">
										Area (sq ft) · {sqm(t.areaSqft)} m²
										<Input className="h-8 text-sm" type="number" min={0} value={t.areaSqft} onChange={(e) => patch(i, { areaSqft: num(e.target.value) })} />
									</label>
									{(
										[
											["bedrooms", "Bedrooms"],
											["bathrooms", "Bathrooms"],
											["parking", "Garage spots"],
										] as const
									).map(([k, label]) => (
										<label key={k} className="flex flex-col gap-1 text-muted-foreground text-xs">
											{label}
											<Input className="h-8 text-sm" type="number" min={0} value={t[k]} onChange={(e) => patch(i, { [k]: num(e.target.value) })} />
										</label>
									))}
									<span className="hidden sm:block" />
									<ImageLink label="Floor plan" value={t.floorPlanUrl} onChange={(v) => patch(i, { floorPlanUrl: v })} fallback={<SchematicPlan type={t} className="size-full" />} hint="Empty: drawn from the rooms." />
									<div className="col-span-2 flex flex-col gap-1 sm:col-span-4">
										<span className="text-muted-foreground text-xs">Photos of this type · {typePhotos(t).length}</span>
										<PhotoManager value={typePhotos(t)} onChange={(v) => patch(i, { photos: v, photoUrl: v[0]?.url ?? "" })} />
									</div>
								</div>
							)}
						</li>
					);
				})}
			</ul>
			<Button type="button" size="sm" variant="secondary" className="self-start" onClick={add}>
				<PlusIcon className="size-4" /> Apartment type
			</Button>
			{error && <span className="text-destructive text-xs">{error}</span>}
		</div>
	);
}

/** An image by link, with its preview. */
function ImageLink({ label, value, onChange, fallback, hint }: { label: string; value: string; onChange: (v: string) => void; fallback?: React.ReactNode; hint?: string }) {
	return (
		<div className="col-span-2 flex gap-2">
			<span className="size-16 shrink-0 overflow-hidden rounded-md border border-border bg-slate-50">
				{value ? <img src={sized(value, 200)} alt="" className="size-full object-cover" /> : fallback}
			</span>
			<label className="flex min-w-0 flex-1 flex-col gap-1 text-muted-foreground text-xs">
				{label}
				<Input className="h-8 text-xs" value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder="https://images.unsplash.com/photo-…" />
				{hint && <span className="text-[11px]">{hint}</span>}
			</label>
		</div>
	);
}

/** Where the works are: the stages as steps, the current one highlighted, and the % done. */
export function StageTracker({ stage, progress }: { stage?: ConstructionStage | null; progress?: number | null }) {
	const at = CONSTRUCTION_STAGES.findIndex((s) => s.id === stage);
	const current = CONSTRUCTION_STAGES[at];
	return (
		<div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
			<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
				<span>
					<b>Works: {current?.label ?? "not started"}</b>
					{current && <span className="text-muted-foreground"> · {current.hint}</span>}
				</span>
				<span className="font-semibold tabular-nums">{progress ?? 0}% done</span>
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-amber-100">
				<div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(0, Math.min(100, progress ?? 0))}%` }} />
			</div>
			<ol className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-7">
				{CONSTRUCTION_STAGES.map((s, i) => (
					<li
						key={s.id}
						className={cn(
							"flex items-center gap-1 rounded px-1.5 py-1 text-[11px]",
							i < at ? "text-amber-900" : i === at ? "bg-amber-500 font-semibold text-white" : "text-muted-foreground",
						)}
						title={s.hint}
					>
						{i < at ? <CheckIcon className="size-3 shrink-0" weight="bold" /> : <span className="w-3 shrink-0 text-center">{i + 1}</span>}
						<span className="truncate">{s.label}</span>
					</li>
				))}
			</ol>
		</div>
	);
}
