import {
	BuildingsIcon,
	EnvelopeIcon,
	MapPinIcon,
	PhoneIcon,
} from "@phosphor-icons/react";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "#/components/ui/dialog";
import { Separator } from "#/components/ui/separator";
import type { CalendarEvent } from "./types";

interface ClientDetailDialogProps {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	event: CalendarEvent | null;
}

export function ClientDetailDialog({
	open,
	onOpenChange,
	event,
}: ClientDetailDialogProps) {
	if (!event) return null;
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="!flex !max-h-[85vh] w-full !max-w-[95vw] flex-col !gap-0 !overflow-hidden !bg-card !p-0 text-left sm:!max-w-lg lg:!max-w-[440px]">
				<div className="shrink-0 px-6 pt-6 text-left">
					<div className="flex items-center gap-3 text-left">
						<div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand/10 text-foreground">
							<BuildingsIcon className="size-6" />
						</div>
						<div className="min-w-0 flex-1 text-left">
							<DialogTitle className="truncate text-left text-base">
								{event.client.name}
							</DialogTitle>
							<DialogDescription className="truncate text-left">
								Code: {event.client.id} · Ticket #{event.ticketNumber}
							</DialogDescription>
						</div>
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 text-left">
					<div className="flex flex-col gap-4 text-left">
						<Separator />
						<div className="space-y-3 rounded-md border bg-muted/20 p-3 text-left text-sm">
							<Row Icon={EnvelopeIcon} label="Email" value="contact@client.com" />
							<Row Icon={PhoneIcon} label="Phone" value="+1 (555) 010-0000" />
							<Row Icon={MapPinIcon} label="Address" value={`Property ${event.property}`} />
						</div>
						<Separator />
					</div>
				</div>

				<div className="flex shrink-0 justify-end border-t bg-muted/20 px-6 py-4">
					<Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function Row({
	Icon,
	label,
	value,
}: {
	Icon: typeof PhoneIcon;
	label: string;
	value: string;
}) {
	return (
		<div className="flex items-center justify-start gap-2 text-left">
			<Icon className="size-4 shrink-0 text-muted-foreground" />
			<span className="text-left text-muted-foreground">{label}:</span>
			<span className="text-left font-medium">{value}</span>
		</div>
	);
}
