import { CalendarPlusIcon, CheckCircleIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { ApiError, apiClient, errorMessage } from "#/lib/api/client";
import { MAX_RESCHEDULE_PHOTOS, type ServicePhoto } from "../../../../shared/service";
import { PhotoButtons, PhotoThumbs, PhotoViewer } from "./photos";
import { localHm, localYmd, taskKind } from "./task-utils";

interface RescheduleTask {
	id: string;
	type: string;
	start: string;
	end: string;
}

/** "Customer absent" dialog: moves the task (the calendar appointment) to a new date and time. */
export function RescheduleDialog({
	task,
	onClose,
	onDone,
}: {
	task: RescheduleTask | null;
	onClose: () => void;
	onDone: (result: { start: string; end: string }) => void;
}) {
	return (
		<Dialog open={Boolean(task)} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-[480px] overflow-y-auto p-6 sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<CalendarPlusIcon className="h-5 w-5 text-[var(--destaque)]" />
						Reschedule task
					</DialogTitle>
				</DialogHeader>
				{task && <Reschedule key={task.id} task={task} onDone={onDone} />}
			</DialogContent>
		</Dialog>
	);
}

function Reschedule({ task, onDone }: { task: RescheduleTask; onDone: (result: { start: string; end: string }) => void }) {
	const isInspection = taskKind(task.type) === "inspection";
	const oldStart = new Date(task.start);
	const oldEnd = new Date(task.end);
	const durationMin = Math.max(15, Math.round((oldEnd.getTime() - oldStart.getTime()) / 60000));
	const suggested = dayjs(oldStart).add(1, "day").toDate();

	const [date, setDate] = useState(localYmd(suggested));
	const [startTime, setStartTime] = useState(localHm(oldStart));
	const [endTime, setEndTime] = useState(localHm(oldEnd));
	const [reason, setReason] = useState("");
	const [photos, setPhotos] = useState<ServicePhoto[]>([]);
	const [viewing, setViewing] = useState<number | null>(null);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);
	const [done, setDone] = useState(false);

	const start = date && startTime ? new Date(`${date}T${startTime}`) : null;
	const end = date && endTime ? new Date(`${date}T${endTime}`) : null;
	const endBeforeStart = Boolean(start && end && end <= start);

	function changeStart(value: string) {
		setStartTime(value);
		// Keeps the original duration when the start moves.
		if (date && value) setEndTime(localHm(dayjs(`${date}T${value}`).add(durationMin, "minute").toDate()));
	}

	async function submit() {
		if (!start || !end || endBeforeStart || !reason.trim() || saving) return;
		setSaving(true);
		try {
			const fmt = (d: Date) => dayjs(d).format("ddd, MMM D [at] h:mm A");
			const result = await apiClient.post<{ start: string; end: string }>(`/api/calendar/events/${encodeURIComponent(task.id)}/reschedule`, {
				start: start.toISOString(),
				end: end.toISOString(),
				reason: reason.trim(),
				photos,
				fromLabel: fmt(oldStart),
				toLabel: fmt(start),
			});
			setDone(true);
			toast.success("Task rescheduled", { description: `Moved to ${fmt(start)}.` });
			onDone(result);
		} catch (e) {
			if (e instanceof ApiError) setErrors(e.fields);
			toast.error(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<h3 className="font-semibold text-lg">Reschedule {isInspection ? "inspection" : "service"}</h3>
				<CalendarPlusIcon className="h-5 w-5 text-[var(--destaque)]" />
			</div>

			{done && (
				<div className="flex items-center gap-3 rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/10 p-4">
					<div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--success)]/10">
						<CheckCircleIcon className="h-5 w-5 text-[var(--success)]" />
					</div>
					<div>
						<p className="font-semibold text-[var(--success)]">Task rescheduled</p>
						<p className="text-muted-foreground text-[15px]">The appointment was moved on the calendar and the ticket was updated.</p>
					</div>
				</div>
			)}

			<div className="rounded-xl border bg-card p-6">
				<div className="space-y-6">
					<p className="text-muted-foreground text-[13px]">
						Currently {dayjs(oldStart).format("ddd, MMM D")} · {dayjs(oldStart).format("h:mm A")} – {dayjs(oldEnd).format("h:mm A")}
					</p>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div className="space-y-2">
							<Label htmlFor="rs-date">New date</Label>
							<Input id="rs-date" type="date" value={date} disabled={done} onChange={(e) => setDate(e.target.value)} />
						</div>
						<div className="space-y-2">
							<Label htmlFor="rs-start">Start</Label>
							<Input id="rs-start" type="time" value={startTime} disabled={done} onChange={(e) => changeStart(e.target.value)} />
						</div>
						<div className="space-y-2">
							<Label htmlFor="rs-end">End</Label>
							<Input id="rs-end" type="time" value={endTime} disabled={done} onChange={(e) => setEndTime(e.target.value)} />
						</div>
					</div>
					{(endBeforeStart || errors.start || errors.end) && (
						<p className="text-destructive text-[13px]">{endBeforeStart ? "The end must be after the start." : errors.start || errors.end}</p>
					)}

					<div className="space-y-2">
						<Label htmlFor="rs-reason">Reason</Label>
						<Textarea
							id="rs-reason"
							value={reason}
							disabled={done}
							onChange={(e) => setReason(e.target.value)}
							placeholder="Describe why the task needs to be rescheduled (e.g. customer absent, no access to the unit)..."
							className="min-h-[180px]"
						/>
						{errors.reason && <p className="text-destructive text-[13px]">{errors.reason}</p>}
					</div>

					<PhotoThumbs photos={photos} onOpen={setViewing} onRemove={done ? undefined : (i) => setPhotos((p) => p.filter((_, k) => k !== i))} size="h-24 w-24" />

					<div className="flex flex-col justify-between gap-3 sm:flex-row">
						<PhotoButtons
							className="sm:flex-1"
							room={MAX_RESCHEDULE_PHOTOS - photos.length}
							limitMessage={`Up to ${MAX_RESCHEDULE_PHOTOS} images per reschedule.`}
							disabled={done}
							onAdd={(added) => setPhotos((p) => [...p, ...added].slice(0, MAX_RESCHEDULE_PHOTOS))}
						/>
					</div>
					<Button
						className="w-full"
						disabled={done || saving || !start || !end || endBeforeStart || !reason.trim()}
						onClick={submit}
						data-testid="btn_reschedule"
					>
						{done ? "Task rescheduled" : saving ? "Rescheduling…" : "Reschedule task"}
					</Button>
				</div>
			</div>
			<PhotoViewer photos={photos} index={viewing} onIndexChange={setViewing} onClose={() => setViewing(null)} />
		</div>
	);
}
