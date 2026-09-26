
import React, { useEffect, useRef, useState, type FormEvent } from "react";
import { authHeaders } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

import { PageLayout } from "@/components/layout/page-layout";
import { ReleaseList } from "./-components/release-list";
import { TYPE_LOOK } from "./-components/badges";
import { cn } from "@/lib/utils";
import {
    RELEASE_TYPE_LABELS,
    type Release,
    type ReleaseType,
    type ReleaseForm,
} from "./-components/data";
import {
    FloppyDiskIcon,
    ImageIcon,
    PlusIcon,
    TrashIcon,
    XIcon,
} from "@phosphor-icons/react";
import { filesToDataUrls } from "@/lib/image";

export const Route = createFileRoute("/whats-new/")({
    component: ChangelogPage,
});

function ChangelogPage() {
    const apiBase = window.__API_BASE__ || "";

    const [releases, setReleases] =
        useState<Release[]>([]);

    const [dialogOpen, setDialogOpen] =
        useState(false);

    const [saving, setSaving] =
        useState(false);

    const [loading, setLoading] =
        useState(true);

    const [form, setForm] =
        useState<ReleaseForm>({
            titulo: "",
            descricao: "",
            oQueMuda: "",
            passoAPasso: [""],
            videoEad: "",
            imagens: [],
            data: "",
            hora: "",
            usuario: "",
            tipo: "Melhoria",
            produto: "",
        });

    const [uploadingImages, setUploadingImages] = useState(false);

    const imagesInputRef = useRef<HTMLInputElement>(null);

    // Administrators write the release notes; everyone reads them.
    const { can } = useCurrentUser();
    const canManage = can("releases.manage");

    useEffect(() => {
        loadReleases();
    }, []);

    async function loadReleases() {
        try {
            setLoading(true);

            const response = await fetch(
                `${apiBase}/api/releases`,
                {
                    method: "GET",
                    headers: {
                        Accept: "application/json",
                        ...authHeaders(),
                    },
                    cache: "no-store",
                },
            );

            if (!response.ok) {
                throw new Error(
                    "Could not load release notes.",
                );
            }

            const data = await response.json();

            if (!Array.isArray(data)) {
                throw new Error(
                    "Invalid format returned by the API.",
                );
            }

            setReleases(data);
        } catch (error) {
            console.error(
                "Error loading release notes:",
                error,
            );

            toast.error(
                "Could not load release notes.",
            );

            setReleases([]);
        } finally {
            setLoading(false);
        }
    }

    function openDialog() {
        const now = new Date();

        setForm({
            titulo: "",
            descricao: "",
            oQueMuda: "",
            passoAPasso: [""],
            videoEad: "",
            imagens: [],
            data: now
                .toISOString()
                .split("T")[0],
            hora: now
                .toTimeString()
                .slice(0, 5),
            usuario: "",
            tipo: "Melhoria",
            produto: "",
        });

        setDialogOpen(true);
    }

    function updateField<K extends keyof ReleaseForm>(
        field: K,
        value: ReleaseForm[K],
    ) {
        setForm((prev) => ({
            ...prev,
            [field]: value,
        } as ReleaseForm));
    }

    function updateStep(
        index: number,
        value: string,
    ) {
        setForm((prev) => ({
            ...prev,
            passoAPasso:
                prev.passoAPasso.map(
                    (step, stepIndex) =>
                        stepIndex === index
                            ? value
                            : step,
                ),
        }));
    }

    function addStep() {
        setForm((prev) => ({
            ...prev,
            passoAPasso: [
                ...prev.passoAPasso,
                "",
            ],
        }));
    }

    function removeStep(index: number) {
        setForm((prev) => ({
            ...prev,
            passoAPasso:
                prev.passoAPasso.filter(
                    (_, stepIndex) =>
                        stepIndex !== index,
                ),
        }));
    }

    async function handleImagesSelected(
        event: React.ChangeEvent<HTMLInputElement>,
    ) {
        const files = event.target.files;

        // Always reset the input: otherwise, picking the same file twice
        // in a row doesn't fire `onChange` the second time.
        event.target.value = "";

        if (!files || files.length === 0) {
            return;
        }

        try {
            setUploadingImages(true);

            const newImages =
                await filesToDataUrls(files);

            setForm((prev) => ({
                ...prev,
                imagens: [
                    ...prev.imagens,
                    ...newImages,
                ],
            }));
        } catch (error) {
            console.error(
                "Error processing images:",
                error,
            );

            toast.error(
                "Could not attach one or more images.",
            );
        } finally {
            setUploadingImages(false);
        }
    }

    function removeImage(index: number) {
        setForm((prev) => ({
            ...prev,
            imagens:
                prev.imagens.filter(
                    (_, imageIndex) =>
                        imageIndex !== index,
                ),
        }));
    }

    async function saveRelease(
        event: FormEvent<HTMLFormElement>,
    ) {
        // Prevent the form's default behavior,
        // avoiding a page reload.
        event.preventDefault();

        if (!form.titulo.trim()) {
            toast.error(
                "Please enter a title.",
            );

            return;
        }

        if (!form.descricao.trim()) {
            toast.error(
                "Please enter a description.",
            );

            return;
        }

        if (!form.tipo) {
            toast.error(
                "Please select a type.",
            );

            return;
        }

        if (!form.produto.trim()) {
            toast.error(
                "Please enter the product.",
            );

            return;
        }

        const [year, month, day] =
            form.data.split("-");

        // Payload keys and the dd/mm/yyyy date format are part of the
        // API/data contract and must not change.
        const releaseData = {
            titulo:
                form.titulo.trim(),

            descricao:
                form.descricao.trim(),

            oQueMuda:
                form.oQueMuda.trim(),

            passoAPasso:
                form.passoAPasso
                    .map((step) =>
                        step.trim(),
                    )
                    .filter(Boolean),

            videoEad:
                form.videoEad?.trim() ||
                undefined,

            imagens:
                form.imagens,

            data:
                day && month && year
                    ? `${day}/${month}/${year}`
                    : "",

            hora:
            form.hora,

            usuario:
                form.usuario.trim(),

            tipo:
                form.tipo as ReleaseType,

            produto:
                form.produto.trim(),
        };

        try {
            setSaving(true);

            const response = await fetch(
                `${apiBase}/api/releases`,
                {
                    method: "POST",
                    headers: {
                        ...authHeaders(),
                        "Content-Type":
                            "application/json",
                        Accept:
                            "application/json",
                    },
                    body: JSON.stringify(
                        releaseData,
                    ),
                },
            );

            const result =
                await response.json();

            if (
                !response.ok ||
                !result.success
            ) {
                throw new Error(
                    result.msg ||
                    "Error saving release note.",
                );
            }

            /*
             * Build the object using the ID
             * returned by the backend.
             */
            const newRelease: Release = {
                id: Number(result.id),

                titulo:
                releaseData.titulo,

                descricao:
                releaseData.descricao,

                oQueMuda:
                releaseData.oQueMuda,

                passoAPasso:
                releaseData.passoAPasso,

                ...(releaseData.videoEad
                    ? {
                        videoEad:
                        releaseData.videoEad,
                    }
                    : {}),

                imagens:
                releaseData.imagens,

                data:
                releaseData.data,

                hora:
                releaseData.hora,

                usuario:
                releaseData.usuario,

                tipo:
                releaseData.tipo,

                produto:
                releaseData.produto,
            };

            /*
             * Add the new card to the top
             * of the list without reloading.
             */
            setReleases((currentReleases) => [
                newRelease,
                ...currentReleases,
            ]);

            toast.success(
                result.msg ||
                "Release note saved successfully!",
            );

            /*
             * Close the modal.
             */
            setDialogOpen(false);

            /*
             * Reset the form.
             */
            setForm({
                titulo: "",
                descricao: "",
                oQueMuda: "",
                passoAPasso: [""],
                videoEad: "",
                imagens: [],
                data: "",
                hora: "",
                usuario: "",
                tipo: "Melhoria",
                produto: "",
            });
        } catch (error) {
            console.error(
                "Error saving release note:",
                error,
            );

            toast.error(
                error instanceof Error
                    ? error.message
                    : "Could not save the release note.",
                {
                    duration: 6000,
                },
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <PageLayout
                title="What's new"
                subtitle="New features, improvements and fixes, with short clips of each screen you can copy"
                breadcrumbs={[{ label: "Workspace" }, { label: "What's new" }]}
                actions={
                    canManage && (
                        <Button onClick={openDialog}>
                            <PlusIcon className="size-4" /> New release note
                        </Button>
                    )
                }
                className="py-6"
            >
                {loading ? (
                    <div className="py-10 text-center text-muted-foreground">Loading release notes...</div>
                ) : (
                    <ReleaseList releases={releases} onUpdate={loadReleases} canEdit={canManage} />
                )}
            </PageLayout>

            {/* DIALOG */}

            <Dialog
                open={dialogOpen}
                onOpenChange={
                    setDialogOpen
                }
            >
                <DialogContent className="flex h-[90vh] w-[95vw] !max-w-[1200px] flex-col gap-0 overflow-hidden p-0">

                    {/* FORM */}

                    <form
                        onSubmit={
                            saveRelease
                        }
                        className="flex min-h-0 flex-1 flex-col"
                    >

                        {/* HEADER */}

                        <DialogHeader className="shrink-0 border-b border-border px-8 py-4">
                            <DialogTitle className="text-lg font-semibold">
                                Add release note
                            </DialogTitle>
                        </DialogHeader>

                        {/* CONTENT */}

                        <div className="min-h-0 flex-1 overflow-y-auto">
                            <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-8 py-7">

                                {/* TITLE */}

                                <section className="flex flex-col gap-2">
                                    <Label
                                        htmlFor="title"
                                        className="text-sm font-semibold"
                                    >
                                        Title
                                        <span className="text-destructive">
                                            *
                                        </span>
                                    </Label>

                                    <Input
                                        id="title"
                                        data-testid="input-title"
                                        value={
                                            form.titulo
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            updateField(
                                                "titulo",
                                                event
                                                    .target
                                                    .value,
                                            )
                                        }
                                        placeholder="e.g. New rescheduling flow"
                                        className="h-11"
                                    />
                                </section>

                                {/* DESCRIPTION */}

                                <section className="flex flex-col gap-2">
                                    <Label
                                        htmlFor="description"
                                        className="text-sm font-semibold"
                                    >
                                        Short description
                                        <span className="text-destructive">
                                            *
                                        </span>
                                    </Label>

                                    <Textarea
                                        id="description"
                                        data-testid="textarea-description"
                                        value={
                                            form.descricao
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            updateField(
                                                "descricao",
                                                event
                                                    .target
                                                    .value,
                                            )
                                        }
                                        rows={5}
                                        placeholder="Briefly describe the update..."
                                        className="min-h-[130px] resize-none"
                                    />
                                </section>

                                {/* WHAT CHANGES */}

                                <section className="flex flex-col gap-2">
                                    <Label
                                        htmlFor="whatChanges"
                                        className="text-sm font-semibold"
                                    >
                                        What changes
                                    </Label>

                                    <Textarea
                                        id="whatChanges"
                                        data-testid="textarea-what-changes"
                                        value={
                                            form.oQueMuda
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            updateField(
                                                "oQueMuda",
                                                event
                                                    .target
                                                    .value,
                                            )
                                        }
                                        rows={5}
                                        placeholder="Explain what changed..."
                                        className="min-h-[130px] resize-none"
                                    />
                                </section>

                                {/* STEP BY STEP */}

                                <section className="flex flex-col gap-3">

                                    <div className="flex items-center justify-between">

                                        <div>
                                            <Label className="text-sm font-semibold">
                                                How to enable it in your environment
                                            </Label>

                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Add the steps needed to use this update.
                                            </p>
                                        </div>

                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            data-testid="btn-add-step"
                                            onClick={
                                                addStep
                                            }
                                            className="text-brand hover:bg-brand/10 hover:text-brand"
                                        >
                                            + Add step
                                        </Button>

                                    </div>

                                    <div className="rounded-lg border border-border bg-muted/20 p-4">

                                        <div className="flex flex-col gap-3">

                                            {form.passoAPasso.map(
                                                (
                                                    step,
                                                    index,
                                                ) => (
                                                    <div
                                                        key={
                                                            index
                                                        }
                                                        className="flex items-center gap-3"
                                                    >

                                                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                                                            {
                                                                index +
                                                                1
                                                            }
                                                        </span>

                                                        <Input
                                                            value={
                                                                step
                                                            }
                                                            onChange={(
                                                                event,
                                                            ) =>
                                                                updateStep(
                                                                    index,
                                                                    event
                                                                        .target
                                                                        .value,
                                                                )
                                                            }
                                                            placeholder={`Describe step ${
                                                                index +
                                                                1
                                                            }`}
                                                            data-testid={`input-step-${index + 1}`}
                                                            className="h-10 flex-1"
                                                        />

                                                        {form
                                                            .passoAPasso
                                                            .length >
                                                            1 && (
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    data-testid={`btn-remove-step-${index + 1}`}
                                                                    aria-label={`Remove step ${index + 1}`}
                                                                    onClick={() =>
                                                                        removeStep(
                                                                            index,
                                                                        )
                                                                    }
                                                                    className="shrink-0 text-muted-foreground hover:text-destructive"
                                                                >
                                                                    ×
                                                                </Button>
                                                            )}

                                                    </div>
                                                ),
                                            )}

                                        </div>
                                    </div>

                                </section>

                                {/* TRAINING VIDEO (EAD) */}

                                <section className="flex flex-col gap-2">

                                    <Label
                                        htmlFor="trainingVideo"
                                        className="text-sm font-semibold"
                                    >
                                        Training video
                                    </Label>

                                    <Input
                                        id="trainingVideo"
                                        data-testid="input-training-video"
                                        value={
                                            form.videoEad
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            updateField(
                                                "videoEad",
                                                event
                                                    .target
                                                    .value,
                                            )
                                        }
                                        placeholder="https://..."
                                        className="h-11"
                                    />

                                    <p className="text-xs text-muted-foreground">
                                        Enter the link to the video related to this update.
                                    </p>

                                </section>

                                {/* IMAGES */}

                                <section className="flex flex-col gap-3">

                                    <div className="flex items-center justify-between">

                                        <div>
                                            <Label className="text-sm font-semibold">
                                                Images
                                            </Label>

                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Attach screenshots or images that help illustrate the update.
                                            </p>
                                        </div>

                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            data-testid="btn-add-image"
                                            disabled={uploadingImages}
                                            onClick={() =>
                                                imagesInputRef.current?.click()
                                            }
                                            className="text-brand hover:bg-brand/10 hover:text-brand"
                                        >
                                            <ImageIcon size={14} />
                                            {uploadingImages
                                                ? "Processing..."
                                                : "+ Add images"}
                                        </Button>

                                        <input
                                            ref={imagesInputRef}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            data-testid="input-images"
                                            onChange={handleImagesSelected}
                                            className="hidden"
                                        />

                                    </div>

                                    {form.imagens.length > 0 && (
                                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">

                                            {form.imagens.map(
                                                (image, index) => (
                                                    <div
                                                        key={index}
                                                        className="group relative aspect-square overflow-hidden rounded-lg border border-border"
                                                    >
                                                        <img
                                                            src={image}
                                                            alt={`Release image ${index + 1}`}
                                                            className="h-full w-full object-cover"
                                                        />

                                                        <Button
                                                            type="button"
                                                           
                                                            size="icon"
                                                            data-testid={`btn-remove-image-${index + 1}`}
                                                            aria-label="Remove image"
                                                            onClick={() =>
                                                                removeImage(index)
                                                            }
                                                            className="absolute top-1 right-1 h-7 w-7 bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                                                        >
                                                            <TrashIcon size={14} />
                                                        </Button>
                                                    </div>
                                                ),
                                            )}

                                        </div>
                                    )}

                                </section>

                                {/* ADDITIONAL INFORMATION */}

                                <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3">

                                    <Label className="text-sm font-semibold">
                                        Additional information
                                    </Label>

                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

                                        {/* TYPE */}

                                        <div className="flex flex-col gap-1.5">

                                            <Label className="text-xs font-medium text-muted-foreground">
                                                Type
                                                <span className="text-destructive">*</span>
                                            </Label>

                                            <div className="grid grid-cols-3 gap-2">
                                                {(Object.keys(RELEASE_TYPE_LABELS) as ReleaseType[]).map((type) => {
                                                    const I = TYPE_LOOK[type].icon;
                                                    return (
                                                        <Button
                                                            key={type}
                                                            type="button"
                                                            variant="outline"
                                                            aria-pressed={form.tipo === type}
                                                            className={cn("h-9 whitespace-nowrap px-2 text-sm", form.tipo === type ? cn("ring-1 ring-inset", TYPE_LOOK[type].className) : "text-muted-foreground")}
                                                            onClick={() => updateField("tipo", type)}
                                                        >
                                                            <I weight="bold" className="size-3.5" /> {RELEASE_TYPE_LABELS[type]}
                                                        </Button>
                                                    );
                                                })}
                                            </div>

                                        </div>

                                        {/* PRODUCT */}

                                        <div className="flex flex-col gap-1.5">

                                            <Label
                                                htmlFor="product"
                                                className="text-xs font-medium text-muted-foreground"
                                            >
                                                Product
                                            <span className="text-destructive">
                                                    *
                                                </span>
                                            </Label>

                                            <Input
                                                id="product"
                                                data-testid="input-product"
                                                value={
                                                    form.produto
                                                }
                                                onChange={(
                                                    event,
                                                ) =>
                                                    updateField(
                                                        "produto",
                                                        event
                                                            .target
                                                            .value,
                                                    )
                                                }
                                                placeholder="e.g. Multi"
                                                className="h-9"
                                            />

                                        </div>

                                        {/* DATE */}

                                        <div className="flex flex-col gap-1.5">

                                            <Label
                                                htmlFor="date"
                                                className="text-xs font-medium text-muted-foreground"
                                            >
                                                Date
                                            </Label>

                                            <Input
                                                    id="date"
                                                    data-testid="input-date"
                                                    type="date"
                                                    className="h-9"
                                                value={
                                                    form.data
                                                }
                                                onChange={(
                                                    event,
                                                ) =>
                                                    updateField(
                                                        "data",
                                                        event
                                                            .target
                                                            .value,
                                                    )
                                                }
                                            />

                                        </div>


                                    </div>

                                </section>

                            </div>
                        </div>

                        {/* FOOTER */}

                        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-8 py-4">

                            <Button
                                type="button"
                                variant="secondary"
                                data-testid="btn-cancel-release"
                                onClick={() =>
                                    setDialogOpen(
                                        false,
                                    )
                                }
                                disabled={
                                    saving
                                }
                            >
                                <XIcon size={14} />
                                Cancel
                            </Button>

                            <Button
                                type="submit"
                                data-testid="btn-save-release"
                                disabled={
                                    !form.titulo.trim() ||
                                    !form.descricao.trim() ||
                                    saving
                                }
                            >
                                <FloppyDiskIcon size={14} />
                                {saving
                                    ? "Saving..."
                                    : "Add release note"}
                            </Button>

                        </div>

                    </form>

                </DialogContent>
            </Dialog>
        </>
    );
}
