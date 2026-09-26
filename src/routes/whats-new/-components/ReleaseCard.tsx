import { type ChangeEvent, useRef, useState } from "react";
import {
    CaretDownIcon,
    CheckIcon,
    CopyIcon,
    DownloadSimpleIcon,
    FloppyDiskIcon,
    ImageIcon,
    LightbulbIcon,
    PencilSimpleIcon,
    PlayCircleIcon,
    StarIcon,
    TrashIcon,
    XIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { authHeaders } from "@/lib/api/client";
import { filesToDataUrls } from "@/lib/image";
import { cn } from "@/lib/utils";
import { type Release, RELEASE_TYPE_LABELS, type ReleaseType } from "./data";
import { ImageCarousel } from "./ImageCarousel";
import { ProductBadge, TypeBadge } from "./badges";

type ReleaseCardProps = {
    release: Release;
    onUpdate?: () => void;
    canEdit?: boolean;
};

function normalizeUrl(value?: string) {
    const v = (value ?? "").trim();
    if (!v) return "";
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join("");

/** A screen recording (or picture) people can copy into their own material. */
function ScreenClip({ src, title }: { src: string; title: string }) {
    const [copied, setCopied] = useState(false);
    const isFile = !src.startsWith("data:");
    const absolute = isFile ? new URL(src, window.location.origin).href : src;
    // A still frame of the clip, for people who turned motion off.
    const poster = isFile && /\.gif$/i.test(src) ? src.replace(/\.gif$/i, ".png") : null;
    const fileName = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.${/\.gif$/i.test(src) ? "gif" : "png"}`;

    async function copy() {
        try {
            // As HTML the clip pastes as an image in email, docs and chats; as text, its link.
            const html = `<img src="${absolute}" alt="${title.replace(/"/g, "&quot;")}" />`;
            if (isFile && "ClipboardItem" in window) {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        "text/html": new Blob([html], { type: "text/html" }),
                        "text/plain": new Blob([absolute], { type: "text/plain" }),
                    }),
                ]);
            } else {
                await navigator.clipboard.writeText(absolute);
            }
            setCopied(true);
            toast.success("Copied: paste it in an email, doc or chat.");
            setTimeout(() => setCopied(false), 1800);
        } catch {
            toast.error("Couldn't copy. Use Download instead.");
        }
    }

    return (
        <figure className="group relative border-border border-b bg-muted/40">
            <picture>
                {poster && <source media="(prefers-reduced-motion: reduce)" srcSet={poster} />}
                <img src={src} alt={title} loading="lazy" className="aspect-[1024/760] w-full object-cover object-top" />
            </picture>
            {/\.gif$/i.test(src) && (
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-md bg-black/65 px-2 py-1 font-semibold text-[11px] text-white">
                    <PlayCircleIcon weight="fill" className="size-3.5" /> Screen clip
                </span>
            )}
            <div className="absolute top-3 right-3 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                {isFile && (
                    <Button type="button" size="sm" variant="secondary" onClick={copy} className="h-8 border-transparent bg-white/95 px-2.5 text-foreground shadow-sm hover:bg-white">
                        {copied ? <CheckIcon className="size-4 text-emerald-600" /> : <CopyIcon className="size-4" />}
                        {copied ? "Copied" : "Copy"}
                    </Button>
                )}
                <Button asChild size="sm" variant="secondary" className="h-8 border-transparent bg-white/95 px-2.5 text-foreground shadow-sm hover:bg-white">
                    <a href={src} download={fileName}>
                        <DownloadSimpleIcon className="size-4" /> Download
                    </a>
                </Button>
            </div>
        </figure>
    );
}

export function ReleaseCard({ release, onUpdate, canEdit }: ReleaseCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploadingImages, setUploadingImages] = useState(false);
    const imagesInputRef = useRef<HTMLInputElement>(null);

    const steps = (release.passoAPasso ?? []).filter((s) => s?.trim());
    const hasExtraContent = steps.length > 0 || Boolean(release.videoEad?.trim());

    const fromRelease = () => ({
        titulo: release.titulo,
        descricao: release.descricao,
        oQueMuda: release.oQueMuda,
        passoAPasso: release.passoAPasso?.length ? release.passoAPasso : [""],
        videoEad: release.videoEad ?? "",
        imagens: release.imagens ?? [],
        produto: release.produto,
        tipo: release.tipo,
        usuario: release.usuario,
        data: release.data,
        hora: release.hora,
    });
    const [form, setForm] = useState(fromRelease);

    function startEditing() {
        setForm(fromRelease());
        setEditing(true);
        setExpanded(true);
    }

    function updateField(field: keyof typeof form, value: string) {
        setForm((prev) => ({ ...prev, [field]: value }));
    }

    function updateStep(index: number, value: string) {
        setForm((prev) => ({ ...prev, passoAPasso: prev.passoAPasso.map((p, i) => (i === index ? value : p)) }));
    }

    async function handleImagesSelected(e: ChangeEvent<HTMLInputElement>) {
        const files = e.target.files;
        // Without this, picking the same file again doesn't fire `onChange`.
        e.target.value = "";
        if (!files || files.length === 0) return;
        try {
            setUploadingImages(true);
            const newImages = await filesToDataUrls(files);
            setForm((prev) => ({ ...prev, imagens: [...prev.imagens, ...newImages] }));
        } catch (err) {
            console.error("Error processing images:", err);
            toast.error("Could not attach one or more images.");
        } finally {
            setUploadingImages(false);
        }
    }

    /** The first image is the one shown at the top of the card. */
    function makeCover(index: number) {
        setForm((prev) => {
            const image = prev.imagens[index];
            return { ...prev, imagens: [image, ...prev.imagens.filter((_, i) => i !== index)] };
        });
    }

    async function saveEdit() {
        if (!form.titulo.trim()) return;
        if (!form.descricao?.trim()) {
            toast.error("Please enter a description.");
            return;
        }
        setSaving(true);
        try {
            const apiBase = window.__API_BASE__ || "";
            const response = await fetch(`${apiBase}/api/releases`, {
                method: "POST",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ ...release, ...form }),
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.msg || "Error saving.");
            setEditing(false);
            onUpdate?.();
        } catch (err) {
            console.error("Error saving edit:", err);
            toast.error("Couldn't save the release note.");
        } finally {
            setSaving(false);
        }
    }

    const images = release.imagens ?? [];

    return (
        <article className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            {!editing && images.length === 1 && <ScreenClip src={images[0]} title={release.titulo} />}
            {!editing && images.length > 1 && <ImageCarousel images={images} title={release.titulo} />}

            <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        {editing ? (
                            <div className="mb-3 flex flex-wrap gap-2">
                                <Input value={form.produto} onChange={(e) => updateField("produto", e.target.value)} placeholder="Screen (e.g. Calendar)" aria-label="Screen" className="h-8 w-44 text-xs" />
                                <select
                                    value={form.tipo}
                                    onChange={(e) => updateField("tipo", e.target.value)}
                                    aria-label="Type"
                                    className="h-8 rounded-md border border-input bg-field px-2 text-xs"
                                >
                                    {(Object.keys(RELEASE_TYPE_LABELS) as ReleaseType[]).map((type) => (
                                        <option key={type} value={type}>
                                            {RELEASE_TYPE_LABELS[type]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                                <TypeBadge type={release.tipo} />
                                <ProductBadge product={release.produto} />
                            </div>
                        )}

                        {editing ? (
                            <Input value={form.titulo} onChange={(e) => updateField("titulo", e.target.value)} placeholder="Title" aria-label="Title" className="font-semibold" />
                        ) : (
                            <h3 className="font-semibold text-foreground text-lg leading-snug">{release.titulo}</h3>
                        )}

                        {editing ? (
                            <Textarea value={form.descricao} onChange={(e) => updateField("descricao", e.target.value)} className="mt-2" rows={2} placeholder="Short description *" aria-label="Description" />
                        ) : (
                            <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">{release.descricao}</p>
                        )}
                    </div>

                    {!editing && canEdit && (
                        <Button type="button" variant="ghost" size="icon" onClick={startEditing} className="-mt-1 -mr-2 shrink-0 text-muted-foreground hover:text-brand" title="Edit" aria-label="Edit">
                            <PencilSimpleIcon size={16} />
                        </Button>
                    )}
                </div>

                {/* What changes: the one thing to take away */}
                {editing ? (
                    <div className="mt-4">
                        <p className="mb-1 font-semibold text-muted-foreground text-xs uppercase">What changes for you</p>
                        <Textarea value={form.oQueMuda} onChange={(e) => updateField("oQueMuda", e.target.value)} rows={2} placeholder="What changes" aria-label="What changes" />
                    </div>
                ) : (
                    release.oQueMuda?.trim() && (
                        <div className="mt-4 flex gap-2.5 rounded-lg bg-subtle px-3.5 py-3 ring-1 ring-border/70">
                            <LightbulbIcon weight="duotone" className="mt-0.5 size-4 shrink-0 text-amber-600" />
                            <p className="text-foreground text-sm leading-relaxed">{release.oQueMuda}</p>
                        </div>
                    )
                )}

                {editing && (
                    <div className="mt-5 space-y-5 border-border/60 border-t pt-5">
                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <p className="font-semibold text-muted-foreground text-xs uppercase">Images and clips</p>
                                <Button type="button" variant="ghost" size="sm" disabled={uploadingImages} onClick={() => imagesInputRef.current?.click()} className="text-brand">
                                    <ImageIcon size={14} />
                                    {uploadingImages ? "Processing..." : "Add"}
                                </Button>
                                <input ref={imagesInputRef} type="file" accept="image/*" multiple onChange={handleImagesSelected} className="hidden" />
                            </div>
                            <p className="mb-2 text-muted-foreground text-xs">The first one is shown at the top of the card. Hover another and click the star to make it the cover.</p>
                            {form.imagens.length > 0 && (
                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                    {form.imagens.map((image, index) => (
                                        <div key={index} className="group relative aspect-video overflow-hidden rounded-lg border border-border">
                                            <img src={image} alt={`Picture ${index + 1}`} className="size-full object-cover" />
                                            {index === 0 ? (
                                                <span className="absolute top-1 left-1 inline-flex items-center gap-1 rounded-md bg-brand px-1.5 py-0.5 font-semibold text-[9px] text-white">
                                                    <StarIcon size={10} weight="fill" /> Cover
                                                </span>
                                            ) : (
                                                <Button type="button" size="icon" onClick={() => makeCover(index)} title="Make cover" aria-label="Make cover" className="absolute top-1 left-1 size-6 bg-black/60 text-white opacity-0 hover:bg-black/80 group-hover:opacity-100">
                                                    <StarIcon size={12} />
                                                </Button>
                                            )}
                                            <Button
                                                type="button"
                                                size="icon"
                                                onClick={() => setForm((prev) => ({ ...prev, imagens: prev.imagens.filter((_, i) => i !== index) }))}
                                                aria-label="Remove picture"
                                                className="absolute top-1 right-1 size-6 bg-black/60 text-white opacity-0 hover:bg-black/80 group-hover:opacity-100"
                                            >
                                                <TrashIcon size={12} />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase">How to use it</p>
                            <div className="space-y-2">
                                {form.passoAPasso.map((step, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 font-semibold text-brand text-xs">{index + 1}</span>
                                        <Input value={step} onChange={(e) => updateStep(index, e.target.value)} placeholder={`Step ${index + 1}`} aria-label={`Step ${index + 1}`} className="h-9" />
                                        {form.passoAPasso.length > 1 && (
                                            <Button type="button" variant="ghost" size="icon" onClick={() => setForm((prev) => ({ ...prev, passoAPasso: prev.passoAPasso.filter((_, i) => i !== index) }))} aria-label={`Remove step ${index + 1}`} className="shrink-0 text-muted-foreground hover:text-destructive">
                                                <XIcon size={14} />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                                <Button type="button" variant="ghost" size="sm" onClick={() => setForm((prev) => ({ ...prev, passoAPasso: [...prev.passoAPasso, ""] }))} className="text-brand">
                                    + Add step
                                </Button>
                            </div>
                        </div>

                        <div>
                            <p className="mb-1 font-semibold text-muted-foreground text-xs uppercase">Training video</p>
                            <Input value={form.videoEad} onChange={(e) => updateField("videoEad", e.target.value)} placeholder="https://..." aria-label="Training video link" />
                        </div>
                    </div>
                )}

                {!editing && expanded && hasExtraContent && (
                    <div className="mt-4 space-y-4">
                        {steps.length > 0 && (
                            <div>
                                <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase">How to use it</p>
                                <ol className="space-y-2">
                                    {steps.map((step, index) => (
                                        <li key={index} className="flex gap-2.5 text-foreground text-sm">
                                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 font-semibold text-brand text-xs">{index + 1}</span>
                                            <span className="pt-0.5">{step}</span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}
                        {release.videoEad?.trim() && (
                            <a href={normalizeUrl(release.videoEad)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand text-sm hover:underline">
                                <PlayCircleIcon weight="fill" className="size-4" /> Watch the training video
                            </a>
                        )}
                    </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-border/60 border-t pt-3">
                    {editing ? (
                        <div className="ml-auto flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                                <XIcon size={14} /> Cancel
                            </Button>
                            <Button type="button" size="sm" onClick={saveEdit} disabled={saving || !form.titulo.trim() || !form.descricao?.trim()}>
                                <FloppyDiskIcon size={14} />
                                {saving ? "Saving..." : "Save"}
                            </Button>
                        </div>
                    ) : (
                        <>
                            <span className="flex items-center gap-2 text-muted-foreground text-xs">
                                <span className="flex size-6 items-center justify-center rounded-full bg-muted font-semibold text-[10px] text-foreground">{initials(release.usuario || "?")}</span>
                                {release.usuario}
                                {release.hora && <span className="tabular-nums">· {release.hora}</span>}
                            </span>
                            {hasExtraContent && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="h-8 font-semibold text-brand text-xs hover:text-brand">
                                    {expanded ? "Hide steps" : "How to use it"}
                                    <CaretDownIcon className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </article>
    );
}
