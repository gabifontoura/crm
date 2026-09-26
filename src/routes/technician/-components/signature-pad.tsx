import { CheckIcon, EraserIcon } from "@phosphor-icons/react";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

/**
 * Finger / mouse signature with the original screen's Clear / Confirm bar.
 * `value` is the confirmed PNG data URL (null until confirmed); drawing again
 * after confirming asks for a new confirmation.
 */
export function SignaturePad({
	value,
	onChange,
	disabled,
}: {
	value: string | null;
	onChange: (dataUrl: string | null) => void;
	disabled?: boolean;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const drawing = useRef(false);
	const [empty, setEmpty] = useState(!value);
	const confirmed = Boolean(value);
	const valueRef = useRef(value);
	valueRef.current = value;

	// Size the canvas to its box (sharp on high-DPI screens) and redraw the saved value.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const setup = () => {
			const ratio = Math.max(window.devicePixelRatio || 1, 1);
			const { width, height } = canvas.getBoundingClientRect();
			if (!width || !height) return;
			canvas.width = width * ratio;
			canvas.height = height * ratio;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
			ctx.lineWidth = 2;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.strokeStyle = "#2f2928";
			const saved = valueRef.current;
			if (saved) {
				const img = new Image();
				img.onload = () => ctx.drawImage(img, 0, 0, width, height);
				img.src = saved;
			}
		};
		setup();
		window.addEventListener("resize", setup);
		return () => window.removeEventListener("resize", setup);
	}, []);
	function point(e: ReactPointerEvent<HTMLCanvasElement>) {
		const rect = e.currentTarget.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function start(e: ReactPointerEvent<HTMLCanvasElement>) {
		if (disabled) return;
		const ctx = e.currentTarget.getContext("2d");
		if (!ctx) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		drawing.current = true;
		if (confirmed) onChange(null);
		const p = point(e);
		ctx.beginPath();
		ctx.moveTo(p.x, p.y);
	}

	function move(e: ReactPointerEvent<HTMLCanvasElement>) {
		if (!drawing.current) return;
		const ctx = e.currentTarget.getContext("2d");
		if (!ctx) return;
		const p = point(e);
		ctx.lineTo(p.x, p.y);
		ctx.stroke();
		setEmpty(false);
	}

	const end = () => {
		drawing.current = false;
	};

	function clear() {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.restore();
		setEmpty(true);
		onChange(null);
	}

	function confirm() {
		const canvas = canvasRef.current;
		if (!canvas || empty) return;
		onChange(canvas.toDataURL("image/png"));
	}

	return (
		<div className={cn("overflow-hidden rounded-lg border-2", confirmed ? "border-[var(--success)]" : "border-[var(--font-quaternaria)]")}>
			<div className="relative">
				<canvas
					ref={canvasRef}
					aria-label="Signature area"
					className={cn("h-[180px] w-full touch-none", disabled ? "cursor-default" : "cursor-crosshair")}
					style={{ background: "repeating-linear-gradient(0deg,#fff,#fff 32px,#faf8f7 33px)" }}
					onPointerDown={start}
					onPointerMove={move}
					onPointerUp={end}
					onPointerLeave={end}
					onPointerCancel={end}
				/>
				{empty && !disabled && (
					<span className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground text-[15px]">Sign here</span>
				)}
			</div>
			{!disabled && (
				<div className="flex gap-2 border-t p-2">
					<Button type="button" variant="secondary" size="sm" className="h-10 flex-1 gap-1" onClick={clear} data-testid="btn_clear">
						<EraserIcon className="h-4 w-4" />
						Clear
					</Button>
					<Button
						type="button"
						size="sm"
						data-testid="btn_signature_confirmed"
						className={cn(
							"h-10 flex-1 gap-1 font-bold",
							confirmed ? "bg-[var(--success)] hover:bg-[var(--success)]/90" : "bg-[var(--destaque)] hover:bg-[var(--destaque)]/90",
						)}
						onClick={confirm}
						disabled={confirmed || empty}
					>
						<CheckIcon className="h-4 w-4" />
						{confirmed ? "Confirmed" : "Confirm"}
					</Button>
				</div>
			)}
		</div>
	);
}
