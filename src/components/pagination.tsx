import { CaretDoubleLeftIcon, CaretDoubleRightIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { cn } from "#/lib/utils";

const SIZES = [10, 25, 50, 100];

function readSize(key: string, fallback: number) {
	try {
		const n = Number(localStorage.getItem(`crm.pageSize.${key}`));
		return SIZES.includes(n) ? n : fallback;
	} catch {
		return fallback;
	}
}

export interface PageState<T> {
	page: number;
	pages: number;
	pageSize: number;
	total: number;
	from: number;
	to: number;
	items: T[];
	setPage: (p: number) => void;
	setPageSize: (n: number) => void;
}

/**
 * Pages over a list already filtered in the browser. Back to page 1 when the
 * filters change (`resetKey`); the page size is remembered per list.
 */
export function usePagination<T>(all: T[], { key, resetKey, initialSize = 25 }: { key: string; resetKey?: unknown; initialSize?: number }): PageState<T> {
	const [pageSize, setSize] = useState(() => readSize(key, initialSize));
	const [page, setPage] = useState(1);
	const pages = Math.max(1, Math.ceil(all.length / pageSize));
	const reset = JSON.stringify(resetKey ?? null);

	// Filters changed: start over.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset is the trigger
	useEffect(() => setPage(1), [reset]);
	// Fewer items than before (e.g. one closed): stay on a page that exists.
	useEffect(() => {
		if (page > pages) setPage(pages);
	}, [page, pages]);

	const items = useMemo(() => all.slice((page - 1) * pageSize, page * pageSize), [all, page, pageSize]);
	return {
		page: Math.min(page, pages),
		pages,
		pageSize,
		total: all.length,
		from: all.length ? (Math.min(page, pages) - 1) * pageSize + 1 : 0,
		to: Math.min(Math.min(page, pages) * pageSize, all.length),
		items,
		setPage: (p) => setPage(Math.max(1, Math.min(pages, p))),
		setPageSize: (n) => {
			setSize(n);
			setPage(1);
			try {
				localStorage.setItem(`crm.pageSize.${key}`, String(n));
			} catch {
				/* storage unavailable: keep it for this visit */
			}
		},
	};
}

/** Page numbers with gaps: 1 … 4 5 6 … 12. */
function pageList(page: number, pages: number): (number | "gap")[] {
	if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
	const out: (number | "gap")[] = [1];
	const from = Math.max(2, page - 1);
	const to = Math.min(pages - 1, page + 1);
	if (from > 2) out.push("gap");
	for (let p = from; p <= to; p++) out.push(p);
	if (to < pages - 1) out.push("gap");
	out.push(pages);
	return out;
}

/** "1–25 of 110 tickets", rows per page and the pages. */
export function Pagination<T>({ state, noun, className }: { state: PageState<T>; noun: string; className?: string }) {
	const { page, pages, pageSize, total, from, to, setPage, setPageSize } = state;
	if (total === 0) return null;
	const btn = "flex size-8 items-center justify-center rounded-md border border-border bg-card text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40";
	return (
		<nav aria-label={`Pages of ${noun}`} className={cn("flex flex-col items-center justify-between gap-2 py-3 text-sm sm:flex-row", className)}>
			<div className="flex items-center gap-3 text-muted-foreground">
				<span>
					<b className="text-foreground">
						{from}–{to}
					</b>{" "}
					of {total} {noun}
				</span>
				<Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
					<SelectTrigger aria-label="Rows per page" className="h-8 w-[7.5rem] text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{SIZES.map((n) => (
							<SelectItem key={n} value={String(n)}>
								{n} per page
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			{pages > 1 && (
				<div className="flex items-center gap-1">
					<button type="button" className={cn(btn, "hidden sm:flex")} onClick={() => setPage(1)} disabled={page === 1} aria-label="First page">
						<CaretDoubleLeftIcon className="size-3.5" />
					</button>
					<button type="button" className={btn} onClick={() => setPage(page - 1)} disabled={page === 1} aria-label="Previous page">
						<CaretLeftIcon className="size-3.5" />
					</button>
					{pageList(page, pages).map((p, i) =>
						p === "gap" ? (
							<span key={`gap-${i}`} className="px-1 text-muted-foreground">
								…
							</span>
						) : (
							<button
								key={p}
								type="button"
								onClick={() => setPage(p)}
								aria-current={p === page ? "page" : undefined}
								className={cn(btn, "w-auto min-w-8 px-2", p === page && "border-brand bg-brand text-white hover:bg-brand")}
							>
								{p}
							</button>
						),
					)}
					<button type="button" className={btn} onClick={() => setPage(page + 1)} disabled={page === pages} aria-label="Next page">
						<CaretRightIcon className="size-3.5" />
					</button>
					<button type="button" className={cn(btn, "hidden sm:flex")} onClick={() => setPage(pages)} disabled={page === pages} aria-label="Last page">
						<CaretDoubleRightIcon className="size-3.5" />
					</button>
				</div>
			)}
		</nav>
	);
}

/** A board column's cards, a batch at a time: "Show 20 more". */
export function useColumnLimit(step = 20) {
	const [limits, setLimits] = useState<Record<string, number>>({});
	return {
		limit: (col: string) => limits[col] ?? step,
		more: (col: string) => setLimits((l) => ({ ...l, [col]: (l[col] ?? step) + step })),
		step,
	};
}

export function ShowMore({ shown, total, step, onMore }: { shown: number; total: number; step: number; onMore: () => void }) {
	if (shown >= total) return null;
	return (
		<button type="button" onClick={onMore} className="rounded-lg border border-border border-dashed bg-card/60 py-1.5 text-muted-foreground text-xs hover:border-brand hover:text-brand">
			Show {Math.min(step, total - shown)} more · {total - shown} left
		</button>
	);
}
