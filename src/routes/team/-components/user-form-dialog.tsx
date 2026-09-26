import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { ApiError } from "#/lib/api/client";
import {
	JOB_TITLES,
	TRADES,
	type User,
	type UserInput,
	USER_ROLES,
	validateUserInput,
} from "../../../../shared/users";
import { useSession } from "#/lib/auth/session";
import { useMenuAccess } from "#/lib/auth/use-menu-access";
import { menuAccessFrom } from "../../../../shared/access";

interface UserFormDialogProps {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	/** User being edited; null creates a new one. */
	initial: User | null;
	onSave: (input: UserInput) => Promise<unknown>;
}

const EMPTY: UserInput = {
	name: "",
	email: "",
	phone: "",
	jobTitle: "",
	trade: "",
	role: "technician",
	active: true,
	accessId: null,
};

export function UserFormDialog({ open, onOpenChange, initial, onSave }: UserFormDialogProps) {
	const [form, setForm] = useState<UserInput>(EMPTY);
	const { user } = useSession();
	const access = useMenuAccess(user?.id) ?? menuAccessFrom(null);
	const [submitted, setSubmitted] = useState(false);
	const [saving, setSaving] = useState(false);
	const [serverErrors, setServerErrors] = useState<Partial<Record<keyof UserInput, string>>>({});

	useEffect(() => {
		if (!open) return;
		setSubmitted(false);
		setServerErrors({});
		setForm(initial ? { ...EMPTY, ...initial } : EMPTY);
	}, [open, initial]);

	const errors = { ...validateUserInput(form), ...serverErrors };
	const set = <K extends keyof UserInput>(key: K, value: UserInput[K]) => {
		setForm((f) => ({ ...f, [key]: value }));
		setServerErrors((e) => ({ ...e, [key]: undefined }));
	};

	async function save() {
		setSubmitted(true);
		if (Object.values(validateUserInput(form)).some(Boolean) || saving) return;
		setSaving(true);
		try {
			await onSave(form);
			onOpenChange(false);
		} catch (e) {
			if (e instanceof ApiError) setServerErrors(e.fields as Partial<Record<keyof UserInput, string>>);
		} finally {
			setSaving(false);
		}
	}

	const error = (key: keyof UserInput) =>
		(submitted || serverErrors[key]) && errors[key] ? <span className="text-destructive text-xs">{errors[key]}</span> : null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="!flex !max-h-[85vh] w-full !max-w-[95vw] flex-col !gap-0 !overflow-hidden !bg-card !p-0 sm:!max-w-xl">
				<div className="shrink-0 border-b px-6 pt-6 pb-4 text-left">
					<DialogTitle className="text-left">{initial ? "Edit team member" : "New team member"}</DialogTitle>
					<DialogDescription className="mt-1.5 text-left">
						The role decides what they see: administrators see every schedule, technicians and brokers only their own.
					</DialogDescription>
				</div>

				<form
					id="user-form"
					className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
					onSubmit={(e) => {
						e.preventDefault();
						save();
					}}
				>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5 sm:col-span-2">
							<Label htmlFor="u-name">
								Full name <span className="text-destructive">*</span>
							</Label>
							<Input id="u-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Jordan Blake" />
							{error("name")}
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="u-email">
								Email <span className="text-destructive">*</span>
							</Label>
							<Input
								id="u-email"
								type="email"
								value={form.email}
								onChange={(e) => set("email", e.target.value)}
								placeholder="name@company.com"
							/>
							{error("email")}
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="u-phone">Phone</Label>
							<Input id="u-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 (555) 010-0000" />
							{error("phone")}
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="u-title">Job title</Label>
							<Input
								id="u-title"
								list="u-title-options"
								value={form.jobTitle}
								onChange={(e) => set("jobTitle", e.target.value)}
								placeholder="e.g. Site foreman"
							/>
							<datalist id="u-title-options">
								{JOB_TITLES.map((t) => (
									<option key={t} value={t} />
								))}
							</datalist>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="u-trade">Trade</Label>
							<Input
								id="u-trade"
								list="u-trade-options"
								value={form.trade}
								onChange={(e) => set("trade", e.target.value)}
								placeholder="e.g. Electrical"
							/>
							<datalist id="u-trade-options">
								{TRADES.map((t) => (
									<option key={t} value={t} />
								))}
							</datalist>
						</div>
						<div className="flex flex-col gap-1.5 sm:col-span-2">
							<Label htmlFor="u-role">Access</Label>
							<Select
								value={form.role === "admin" ? "admin" : (form.accessId ?? form.role)}
								onValueChange={(v) => {
									if (v === "admin") return setForm((f) => ({ ...f, role: "admin", accessId: null }));
									const p = access.profiles.find((x) => x.id === v);
									if (p) setForm((f) => ({ ...f, role: p.base, accessId: p.builtIn ? null : p.id }));
								}}
							>
								<SelectTrigger id="u-role">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="admin">Administrator</SelectItem>
									{access.profiles.map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.name}
											{!p.builtIn && <span className="text-muted-foreground text-xs"> · works like {USER_ROLES.find((r) => r.id === p.base)?.label}</span>}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<span className="text-muted-foreground text-xs">
								{form.role === "admin"
									? USER_ROLES.find((r) => r.id === "admin")?.description
									: (access.profiles.find((p) => p.id === (form.accessId ?? form.role))?.description || USER_ROLES.find((r) => r.id === form.role)?.description)}{" "}
								Accesses are set up in Settings › Menu by access.
							</span>
							{error("role")}
						</div>
						<label
							htmlFor="u-active"
							className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3 sm:col-span-2"
						>
							<span className="flex flex-col gap-0.5">
								<span className="font-medium text-sm">Active</span>
								<span className="text-muted-foreground text-xs">
									Inactive members keep their history but can't sign in or get new appointments.
								</span>
							</span>
							<Switch id="u-active" checked={form.active} onCheckedChange={(v) => set("active", Boolean(v))} />
						</label>
						{error("active")}
					</div>
				</form>

				<div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/20 px-6 py-4 sm:flex-row sm:justify-end">
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="submit" form="user-form" disabled={saving}>
						{saving ? "Saving…" : initial ? "Save changes" : "Add member"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
