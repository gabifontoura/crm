import { DotsSixVerticalIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { type DragEvent, type KeyboardEvent, type ReactNode, useState } from "react";
import { cn } from "#/lib/utils";

/** The list with the item at `from` moved to position `to`. */
export function reorder<T>(list: T[], from: number, to: number): T[] {
	const next = [...list];
	const [item] = next.splice(from, 1);
	next.splice(to, 0, item);
	return next;
}

/**
 * Drag and drop to reorder a list, started from a handle (⋮⋮) so inputs in the
 * rows stay usable; ↑ ↓ on the focused handle move the item too. The first
 * `pinned` items stay where they are and nothing lands above them. Rows
 * without inputs can be dragged from anywhere (`handleOnly: false`).
 */
export function useDragReorder({ count, onMove, pinned = 0, handleOnly = true }: { count: number; onMove: (from: number, to: number) => void; pinned?: number; handleOnly?: boolean }) {
	// The row whose handle is pressed (only that one is draggable), the one being dragged, and where it would land (0…count).
	const [armed, setArmed] = useState<number | null>(null);
	const [dragging, setDragging] = useState<number | null>(null);
	const [dropAt, setDropAt] = useState<number | null>(null);
	const end = () => {
		setArmed(null);
		setDragging(null);
		setDropAt(null);
	};
	const moveTo = (from: number, insertAt: number) => {
		if (from < pinned) return;
		const to = Math.max(pinned, insertAt > from ? insertAt - 1 : insertAt);
		if (to !== from) onMove(from, to);
	};

	return {
		isDragging: (i: number) => dragging === i,
		rowProps: (i: number) => ({
			draggable: handleOnly ? armed === i : i >= pinned,
			onDragStart: (e: DragEvent) => {
				e.dataTransfer.effectAllowed = "move";
				e.dataTransfer.setData("text/plain", String(i));
				setDragging(i);
			},
			onDragOver: (e: DragEvent) => {
				if (dragging === null) return;
				e.preventDefault();
				const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
				setDropAt(Math.max(pinned, e.clientY < box.top + box.height / 2 ? i : i + 1));
			},
			onDrop: (e: DragEvent) => {
				e.preventDefault();
				if (dragging !== null && dropAt !== null) moveTo(dragging, dropAt);
				end();
			},
			onDragEnd: end,
		}),
		/** The blue line where the dragged item would land; render it inside a `relative` row. */
		dropLine: (i: number): ReactNode => {
			if (dragging === null || dropAt === null) return null;
			if (dropAt === i && dragging !== i && dragging !== i - 1) return <span className="pointer-events-none absolute inset-x-2 -top-1 h-0.5 rounded bg-brand" />;
			if (dropAt === count && i === count - 1 && dragging !== i) return <span className="pointer-events-none absolute inset-x-2 -bottom-1 h-0.5 rounded bg-brand" />;
			return null;
		},
		handleProps: (i: number) => ({
			onPointerDown: () => setArmed(i),
			onPointerUp: () => dragging === null && setArmed(null),
			onKeyDown: (e: KeyboardEvent) => {
				if (e.key === "ArrowUp" && i > pinned) {
					e.preventDefault();
					moveTo(i, i - 1);
				} else if (e.key === "ArrowDown" && i < count - 1) {
					e.preventDefault();
					moveTo(i, i + 2);
				}
			},
		}),
		pinned: (i: number) => i < pinned,
	};
}

/** The ⋮⋮ handle (or a lock for pinned rows). */
export function DragHandle({ label, pinned, className, ...props }: { label: string; pinned?: boolean; className?: string } & ReturnType<ReturnType<typeof useDragReorder>["handleProps"]>) {
	if (pinned) {
		return (
			<span className={cn("flex w-6 shrink-0 justify-center text-muted-foreground/40", className)} title="Always first">
				<LockSimpleIcon className="size-3.5" />
			</span>
		);
	}
	return (
		<button
			type="button"
			aria-label={`Reorder ${label}: drag, or use the arrow keys`}
			title="Drag to reorder (or focus and use ↑ ↓)"
			className={cn(
				"flex w-6 shrink-0 cursor-grab touch-none justify-center rounded py-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
				className,
			)}
			{...props}
		>
			<DotsSixVerticalIcon className="size-4" weight="bold" />
		</button>
	);
}
