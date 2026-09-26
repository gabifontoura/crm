import { ArrowLeftIcon, ArrowRightIcon, CaretLeftIcon, CaretRightIcon, ImageIcon, PlusIcon, StarIcon, TrashIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { cn } from "#/lib/utils";
import { type DevelopmentPhoto, PHOTO_KINDS, type PhotoKind } from "../../../../shared/developments";

const kindLabel = (k: PhotoKind) => PHOTO_KINDS.find((x) => x.id === k)?.label ?? k;
export const KIND_STYLE: Record<PhotoKind, string> = {
	photo: "bg-slate-900/70 text-white",
	render: "bg-violet-600/85 text-white",
	floor_plan: "bg-sky-600/85 text-white",
	construction: "bg-amber-500/90 text-white",
};

/** Smaller copy of an Unsplash picture for thumbnails (other links are used as they are). */
export function sized(url: string, w: number) {
	if (!/images\.unsplash\.com/.test(url)) return url;
	const u = new URL(url);
	u.searchParams.set("w", String(w));
	u.searchParams.set("q", "70");
	u.searchParams.set("auto", "format");
	u.searchParams.set("fit", "crop");
	return u.toString();
}

const newId = () => `ph-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * Adds and manages pictures by link (e.g. Unsplash: right-click the image,
 * "Copy image address"). The first is the cover; each says what it shows.
 */
export function PhotoManager({ value, onChange, error }: { value: DevelopmentPhoto[]; onChange: (v: DevelopmentPhoto[]) => void; error?: string }) {
	const [url, setUrl] = useState("");
	const [kind, setKind] = useState<PhotoKind>("photo");
	const [caption, setCaption] = useState("");
	const [check, setCheck] = useState<"idle" | "loading" | "ok" | "bad">("idle");

	// Tries the link before adding it, so a page link (not an image) is caught.
	useEffect(() => {
		const link = url.trim();
		if (!/^https:\/\/\S+$/.test(link)) {
			setCheck(link ? "bad" : "idle");
			return;
		}
		setCheck("loading");
		const img = new Image();
		img.onload = () => setCheck("ok");
		img.onerror = () => setCheck("bad");
		img.src = sized(link, 200);
	}, [url]);

	const add = () => {
		if (check !== "ok") return;
		onChange([...value, { id: newId(), url: url.trim(), kind, caption: caption.trim() }]);
		setUrl("");
		setCaption("");
	};
	const move = (i: number, by: number) => {
		const next = [...value];
		const [x] = next.splice(i, 1);
		next.splice(Math.max(0, Math.min(next.length, i + by)), 0, x);
		onChange(next);
	};
	const patch = (i: number, p: Partial<DevelopmentPhoto>) => onChange(value.map((x, k) => (k === i ? { ...x, ...p } : x)));

	return (
		<div className="flex flex-col gap-3">
			{value.length === 0 ? (
				<p className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-muted-foreground text-sm">
					<ImageIcon className="size-5" /> No pictures yet. Add photos, renders, floor plans or pictures of the works.
				</p>
			) : (
				<ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					{value.map((ph, i) => (
						<li key={ph.id} className={cn("flex gap-2 rounded-md border p-2", i === 0 ? "border-brand bg-brand/5" : "border-border")}>
							<div className="relative size-20 shrink-0 overflow-hidden rounded bg-muted">
								<img src={sized(ph.url, 240)} alt={ph.caption || kindLabel(ph.kind)} className="size-full object-cover" loading="lazy" />
								{i === 0 && <span className="absolute top-1 left-1 rounded bg-brand px-1 font-semibold text-[9px] text-white uppercase">Cover</span>}
							</div>
							<div className="flex min-w-0 flex-1 flex-col gap-1">
								<Select value={ph.kind} onValueChange={(v) => patch(i, { kind: v as PhotoKind })}>
									<SelectTrigger aria-label="What it shows" className="h-7 text-xs">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{PHOTO_KINDS.map((k) => (
											<SelectItem key={k.id} value={k.id}>
												{k.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Input aria-label="Caption" className="h-7 text-xs" placeholder="Caption" value={ph.caption} onChange={(e) => patch(i, { caption: e.target.value })} />
								<div className="flex items-center gap-0.5">
									<Button type="button" size="icon-sm" variant="ghost" aria-label="Move left" disabled={i === 0} onClick={() => move(i, -1)}>
										<ArrowLeftIcon className="size-3.5" />
									</Button>
									<Button type="button" size="icon-sm" variant="ghost" aria-label="Move right" disabled={i === value.length - 1} onClick={() => move(i, 1)}>
										<ArrowRightIcon className="size-3.5" />
									</Button>
									{i > 0 && (
										<Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-xs" onClick={() => move(i, -i)} title="Make it the cover">
											<StarIcon className="size-3.5" /> Cover
										</Button>
									)}
									<Button type="button" size="icon-sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" aria-label="Remove" onClick={() => onChange(value.filter((_, k) => k !== i))}>
										<TrashIcon className="size-3.5" />
									</Button>
								</div>
							</div>
						</li>
					))}
				</ul>
			)}

			<div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-2.5">
				<div className="flex gap-2">
					<div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded bg-card">
						{check === "ok" ? (
							<img src={sized(url.trim(), 200)} alt="Preview" className="size-full object-cover" />
						) : check === "bad" ? (
							<WarningIcon className="size-5 text-destructive" />
						) : (
							<ImageIcon className="size-5 text-muted-foreground" />
						)}
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-1.5">
						<Input
							aria-label="Image link"
							className="h-8 text-xs"
							placeholder="https://images.unsplash.com/photo-…"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									add();
								}
							}}
						/>
						<div className="flex gap-1.5">
							<Select value={kind} onValueChange={(v) => setKind(v as PhotoKind)}>
								<SelectTrigger aria-label="What it shows" className="h-8 w-36 text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PHOTO_KINDS.map((k) => (
										<SelectItem key={k.id} value={k.id}>
											{k.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Input aria-label="New caption" className="h-8 flex-1 text-xs" placeholder="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} />
							<Button type="button" size="sm" className="h-8" onClick={add} disabled={check !== "ok"}>
								<PlusIcon className="size-4" /> Add
							</Button>
						</div>
					</div>
				</div>
				<span className={cn("text-[11px]", check === "bad" ? "text-destructive" : "text-muted-foreground")}>
					{check === "bad"
						? "This link doesn't open an image. On Unsplash, right-click the picture and pick “Copy image address”."
						: check === "loading"
							? "Checking the link…"
							: "Paste an image link (e.g. Unsplash: right-click the picture, “Copy image address”)."}
				</span>
			</div>
			{error && <span className="text-destructive text-xs">{error}</span>}
		</div>
	);
}

/** The cover, the other pictures, a filter by kind and a full-size viewer. */
export function Gallery({ photos, compact }: { photos: DevelopmentPhoto[]; compact?: boolean }) {
	const [kind, setKind] = useState<PhotoKind | "all">("all");
	const [open, setOpen] = useState<number | null>(null);
	const kinds = PHOTO_KINDS.filter((k) => photos.some((p) => p.kind === k.id));
	const shown = useMemo(() => photos.filter((p) => kind === "all" || p.kind === kind), [photos, kind]);
	if (photos.length === 0) return null;
	const cover = shown[0];
	const viewing = open === null ? null : shown[open];

	return (
		<div className="flex flex-col gap-2">
			{kinds.length > 1 && !compact && (
				<div className="flex flex-wrap gap-1">
					{[{ id: "all" as const, label: `All · ${photos.length}` }, ...kinds.map((k) => ({ ...k, label: `${k.label} · ${photos.filter((p) => p.kind === k.id).length}` }))].map((k) => (
						<button
							key={k.id}
							type="button"
							onClick={() => setKind(k.id)}
							aria-pressed={kind === k.id}
							className={cn("rounded-full border px-2.5 py-0.5 text-xs", kind === k.id ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground hover:bg-muted")}
						>
							{k.label}
						</button>
					))}
				</div>
			)}
			<div className={cn("grid gap-2", compact ? "grid-cols-4" : "grid-cols-4 sm:grid-cols-6")}>
				{cover && (
					<button type="button" onClick={() => setOpen(0)} className={cn("group relative overflow-hidden rounded-md bg-muted", compact ? "col-span-2 row-span-2 aspect-[4/3]" : "col-span-4 row-span-2 aspect-[16/9] sm:col-span-3")}>
						<img src={sized(cover.url, 1200)} alt={cover.caption} className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
						<PhotoLabel ph={cover} />
					</button>
				)}
				{shown.slice(1, compact ? 5 : 7).map((ph, i) => (
					<button key={ph.id} type="button" onClick={() => setOpen(i + 1)} className="group relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
						<img src={sized(ph.url, 400)} alt={ph.caption} className="size-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
						<span className={cn("absolute top-1 left-1 rounded px-1 font-semibold text-[9px] uppercase", KIND_STYLE[ph.kind])}>{kindLabel(ph.kind)}</span>
						{i === (compact ? 3 : 5) && shown.length > (compact ? 5 : 7) && (
							<span className="absolute inset-0 flex items-center justify-center bg-black/50 font-semibold text-sm text-white">+{shown.length - (compact ? 5 : 7)}</span>
						)}
					</button>
				))}
			</div>

			<Dialog open={viewing !== null} onOpenChange={(o) => !o && setOpen(null)}>
				<DialogContent className="!max-w-[95vw] !bg-black !p-0 sm:!max-w-5xl [&>button:last-child]:hidden">
					<DialogTitle className="sr-only">{viewing?.caption || "Photo"}</DialogTitle>
					{viewing && (
						<div className="relative">
							<img src={sized(viewing.url, 2000)} alt={viewing.caption} className="max-h-[80vh] w-full object-contain" />
							<div className="flex items-center justify-between gap-2 bg-black px-4 py-2 text-sm text-white">
								<span>
									<span className={cn("mr-2 rounded px-1.5 py-0.5 font-semibold text-[10px] uppercase", KIND_STYLE[viewing.kind])}>{kindLabel(viewing.kind)}</span>
									{viewing.caption}
								</span>
								<span className="text-white/60 text-xs">
									{(open ?? 0) + 1} / {shown.length}
								</span>
							</div>
							<button type="button" aria-label="Close" onClick={() => setOpen(null)} className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80">
								<XIcon className="size-4" />
							</button>
							{shown.length > 1 && (
								<>
									<button type="button" aria-label="Previous" onClick={() => setOpen(((open ?? 0) - 1 + shown.length) % shown.length)} className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80">
										<CaretLeftIcon className="size-5" />
									</button>
									<button type="button" aria-label="Next" onClick={() => setOpen(((open ?? 0) + 1) % shown.length)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80">
										<CaretRightIcon className="size-5" />
									</button>
								</>
							)}
						</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}

function PhotoLabel({ ph }: { ph: DevelopmentPhoto }) {
	return (
		<span className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pt-6 pb-2 text-left text-white text-xs">
			<span className={cn("rounded px-1.5 py-0.5 font-semibold text-[10px] uppercase", KIND_STYLE[ph.kind])}>{kindLabel(ph.kind)}</span>
			<span className="truncate">{ph.caption}</span>
		</span>
	);
}
