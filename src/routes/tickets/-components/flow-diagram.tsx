import { STATUS_CATEGORIES, type Workflow } from "../../../../shared/tickets";

const NODE_W = 132;
const NODE_H = 40;
const COL_GAP = 64;
const ROW_GAP = 22;
const PAD = 24;

/**
 * Picture of a workflow: statuses laid out left to right by how many steps
 * they are from the initial status, with an arrow per transition.
 * Arrows going back (reopen, negotiate...) curve underneath.
 */
export function FlowDiagram({ workflow, highlight }: { workflow: Workflow; highlight?: string }) {
	const { statuses, transitions, initialStatusId } = workflow;
	if (statuses.length === 0) {
		return <p className="py-6 text-center text-muted-foreground text-xs">Add statuses to see the flow.</p>;
	}

	// Breadth-first depth from the initial status ("*" transitions count from depth 0).
	const depth = new Map<string, number>([[initialStatusId, 0]]);
	const queue = [initialStatusId];
	while (queue.length) {
		const id = queue.shift()!;
		for (const t of transitions) {
			if ((t.from === id || t.from === "*") && !depth.has(t.to)) {
				depth.set(t.to, (depth.get(id) ?? 0) + 1);
				queue.push(t.to);
			}
		}
	}
	const maxDepth = Math.max(0, ...depth.values());
	// Unreachable statuses go in an extra column so they stand out.
	for (const s of statuses) if (!depth.has(s.id)) depth.set(s.id, maxDepth + 1);

	const columns = new Map<number, string[]>();
	for (const s of statuses) {
		const d = depth.get(s.id)!;
		columns.set(d, [...(columns.get(d) ?? []), s.id]);
	}
	const colCount = Math.max(...columns.keys()) + 1;
	const rows = Math.max(...[...columns.values()].map((c) => c.length));
	const hasAny = transitions.some((t) => t.from === "*");

	const pos = new Map<string, { x: number; y: number }>();
	for (const [col, ids] of columns) {
		const offset = ((rows - ids.length) * (NODE_H + ROW_GAP)) / 2;
		ids.forEach((id, i) => pos.set(id, { x: PAD + col * (NODE_W + COL_GAP), y: PAD + offset + i * (NODE_H + ROW_GAP) }));
	}
	const width = PAD * 2 + colCount * NODE_W + (colCount - 1) * COL_GAP;
	const bodyH = rows * NODE_H + (rows - 1) * ROW_GAP;
	const height = PAD * 2 + bodyH + 70 + (hasAny ? 36 : 0);
	const anyY = PAD + bodyH + 70;

	const category = (id: string) => STATUS_CATEGORIES.find((c) => c.id === statuses.find((s) => s.id === id)?.category)?.label;

	return (
		<div className="overflow-x-auto rounded-lg border border-border bg-muted/20">
			<svg width={width} height={height} role="img" aria-label={`Flow of ${workflow.name}`} className="block">
				<defs>
					<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
						<path d="M0,0 L10,5 L0,10 z" fill="#94A3B8" />
					</marker>
				</defs>

				{transitions.map((t, i) => {
					const to = pos.get(t.to);
					if (!to) return null;
					const tx = to.x;
					const ty = to.y + NODE_H / 2;
					if (t.from === "*") {
						const sx = tx + NODE_W / 2;
						return (
							<g key={t.id}>
								<path d={`M${sx},${anyY} L${sx},${to.y + NODE_H + 2}`} stroke="#94A3B8" strokeDasharray="4 3" fill="none" markerEnd="url(#arrow)" />
								<text x={sx + 4} y={anyY - 6} fontSize="10" fill="#64748B">{t.label}</text>
							</g>
						);
					}
					const from = pos.get(t.from);
					if (!from) return null;
					const forward = to.x > from.x;
					if (forward) {
						const sx = from.x + NODE_W;
						const sy = from.y + NODE_H / 2;
						const mx = (sx + tx) / 2;
						return (
							<g key={t.id}>
								<path d={`M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx - 2},${ty}`} stroke="#94A3B8" fill="none" markerEnd="url(#arrow)" />
								<title>{t.label}</title>
							</g>
						);
					}
					// Backward or same column: loop under the nodes.
					const sx = from.x + NODE_W / 2;
					const sy = from.y + NODE_H;
					const ex = to.x + NODE_W / 2 + (i % 3) * 6;
					const ey = to.y + NODE_H;
					const dip = PAD + bodyH + 22 + (i % 3) * 10;
					return (
						<g key={t.id}>
							<path d={`M${sx},${sy} C${sx},${dip} ${ex},${dip} ${ex},${ey + 2}`} stroke="#CBD5E1" strokeDasharray="3 3" fill="none" markerEnd="url(#arrow)" />
							<title>{t.label}</title>
						</g>
					);
				})}

				{hasAny && (
					<g>
						<rect x={PAD} y={anyY - 2} width={width - PAD * 2} height="1" fill="#CBD5E1" />
						<text x={PAD} y={anyY + 16} fontSize="10" fill="#64748B">From any status</text>
					</g>
				)}

				{statuses.map((s) => {
					const p = pos.get(s.id)!;
					const isInitial = s.id === initialStatusId;
					return (
						<g key={s.id}>
							<title>{`${s.name} · ${category(s.id)}${isInitial ? " · start" : ""}`}</title>
							<rect
								x={p.x}
								y={p.y}
								width={NODE_W}
								height={NODE_H}
								rx="6"
								fill="#fff"
								stroke={highlight === s.id ? "#2B6CB0" : "#E2E8F0"}
								strokeWidth={highlight === s.id ? 2 : 1}
							/>
							<rect x={p.x} y={p.y} width="4" height={NODE_H} rx="2" fill={s.color} />
							<text x={p.x + 12} y={p.y + 17} fontSize="12" fontWeight="600" fill="#1A2433">
								{s.name.length > 16 ? `${s.name.slice(0, 15)}…` : s.name}
							</text>
							<text x={p.x + 12} y={p.y + 31} fontSize="10" fill="#64748B">
								{isInitial ? "Start · " : ""}
								{category(s.id)}
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
}
