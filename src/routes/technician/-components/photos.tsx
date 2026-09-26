import { CameraIcon, CaretLeftIcon, CaretRightIcon, PaperclipIcon, TrashIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { compressPhoto } from "#/lib/image";
import { cn } from "#/lib/utils";
import type { ServicePhoto } from "../../../../shared/service";

let seq = 0;

/** Compresses picked files into report photos, keeping within `room`. */
export async function filesToPhotos(files: FileList | File[], room: number, limitMessage: string): Promise<ServicePhoto[]> {
	const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
	if (!list.length) return [];
	if (room <= 0) {
		toast.error(limitMessage);
		return [];
	}
	const picked = list.slice(0, room);
	const urls = await Promise.all(picked.map((f) => compressPhoto(f)));
	if (list.length > room) toast.info(`Only ${room} more photo${room === 1 ? "" : "s"} fit here. ${limitMessage}`);
	return urls.map((dataUrl, i) => ({ id: `ph_${Date.now().toString(36)}${(seq++).toString(36)}`, name: picked[i].name || "photo.jpg", dataUrl, caption: "" }));
}

/**
 * "Attach image" (gallery / files) and "Open camera" buttons, as in the
 * original screens. Both accept several images at once.
 */
export function PhotoButtons({
	room,
	limitMessage,
	onAdd,
	disabled,
	className,
}: {
	room: number;
	limitMessage: string;
	onAdd: (photos: ServicePhoto[]) => void;
	disabled?: boolean;
	className?: string;
}) {
	const galleryRef = useRef<HTMLInputElement>(null);
	const cameraRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);

	async function handle(e: React.ChangeEvent<HTMLInputElement>) {
		const files = e.target.files;
		if (!files?.length) return;
		const copy = Array.from(files);
		e.target.value = "";
		setBusy(true);
		try {
			const photos = await filesToPhotos(copy, room, limitMessage);
			if (photos.length) onAdd(photos);
		} catch {
			toast.error("Couldn't read that image.");
		} finally {
			setBusy(false);
		}
	}

	const open = (ref: React.RefObject<HTMLInputElement | null>) => {
		if (room <= 0) {
			toast.error(limitMessage);
			return;
		}
		ref.current?.click();
	};

	return (
		<>
			<Input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={handle} />
			<Input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handle} />
			<div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", className)}>
				<Button type="button" variant="secondary" className="w-full gap-2" disabled={disabled || busy} onClick={() => open(galleryRef)} data-testid="btn_attach_img">
					<PaperclipIcon className="h-4 w-4" />
					{busy ? "Processing…" : "Attach image"}
				</Button>
				<Button type="button" variant="secondary" className="w-full gap-2" disabled={disabled || busy} onClick={() => open(cameraRef)} data-testid="btn_camera">
					<CameraIcon className="h-4 w-4" />
					Open camera
				</Button>
			</div>
		</>
	);
}

/** Small thumbnails; tap one to enlarge it. */
export function PhotoThumbs({
	photos,
	onOpen,
	onRemove,
	size = "h-16 w-16",
}: {
	photos: ServicePhoto[];
	onOpen: (index: number) => void;
	onRemove?: (index: number) => void;
	size?: string;
}) {
	if (!photos.length) return null;
	return (
		<div className="flex flex-wrap gap-2">
			{photos.map((p, i) => (
				<div key={p.id} className={cn("group relative cursor-pointer overflow-hidden rounded border bg-muted", size)}>
					<button type="button" className="h-full w-full" onClick={() => onOpen(i)} aria-label={`Enlarge photo ${i + 1}`}>
						<img src={p.dataUrl} alt={p.caption || `Photo ${i + 1}`} className="h-full w-full object-cover" />
					</button>
					{onRemove && (
						<Button
							type="button"
							size="icon"
							variant="destructive"
							className="absolute top-1 right-1 h-5 w-5 rounded-full p-0 text-[13px]"
							onClick={() => onRemove(i)}
							aria-label={`Remove photo ${i + 1}`}
						>
							×
						</Button>
					)}
				</div>
			))}
		</div>
	);
}

/** Full-screen image viewer with previous / next, caption and delete (original "view image" modal). */
export function PhotoViewer({
	photos,
	index,
	onIndexChange,
	onClose,
	onRemove,
	onCaption,
}: {
	photos: ServicePhoto[];
	index: number | null;
	onIndexChange: (i: number) => void;
	onClose: () => void;
	/** Omit for read-only. */
	onRemove?: (i: number) => void;
	onCaption?: (i: number, caption: string) => void;
}) {
	const photo = index !== null ? photos[index] : undefined;
	return (
		<Dialog open={Boolean(photo)} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-3xl overflow-hidden bg-card p-4">
				<DialogTitle className="sr-only">Photo</DialogTitle>
				<div className="relative flex aspect-video items-center justify-center bg-card p-0 sm:aspect-square md:aspect-video">
					{photo && index !== null && (
						<>
							<img src={photo.dataUrl} alt={photo.caption || "Evidence in full screen"} className="h-full w-full object-contain" />
							<div className="pointer-events-none absolute inset-x-4 top-1/2 flex -translate-y-1/2 justify-between">
								<Button
									variant="ghost"
									size="icon"
									aria-label="Previous photo"
									className={cn("pointer-events-auto h-12 w-12 rounded-full bg-white/20 text-white hover:bg-white/50", index === 0 && "pointer-events-none opacity-0")}
									onClick={() => onIndexChange(index - 1)}
								>
									<CaretLeftIcon className="h-8 w-8" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									aria-label="Next photo"
									className={cn(
										"pointer-events-auto h-12 w-12 rounded-full bg-white/20 text-white hover:bg-white/50",
										index === photos.length - 1 && "pointer-events-none opacity-0",
									)}
									onClick={() => onIndexChange(index + 1)}
								>
									<CaretRightIcon className="h-8 w-8" />
								</Button>
							</div>
						</>
					)}
				</div>
				{photo && index !== null && onCaption ? (
					<Input aria-label="Photo caption" placeholder="Caption (optional)" value={photo.caption} onChange={(e) => onCaption(index, e.target.value)} />
				) : (
					photo?.caption && <p className="text-center text-muted-foreground text-[15px]">{photo.caption}</p>
				)}
				<DialogFooter className="flex-row items-center justify-between gap-4 border-t bg-muted p-4 sm:justify-between">
					<div className="text-muted-foreground text-[13px]">
						Image {index !== null ? index + 1 : 0} of {photos.length}
					</div>
					<div className="flex gap-2">
						{onRemove && index !== null && (
							<Button
								type="button"
								variant="destructive"
								size="sm"
								className="gap-2 font-bold"
								onClick={() => {
									onRemove(index);
									if (photos.length <= 1) onClose();
									else if (index >= photos.length - 1) onIndexChange(index - 1);
								}}
								data-testid="btn_delete_img"
							>
								<TrashIcon className="h-4 w-4" />
								Delete image
							</Button>
						)}
						<Button type="button" variant="secondary" size="sm" className="font-bold" onClick={onClose} data-testid="btn_close">
							Close
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
