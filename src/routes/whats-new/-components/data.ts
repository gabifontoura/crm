/**
 * Stored values for the release type (kept as they are in the database);
 * use `RELEASE_TYPE_LABELS` to show them.
 */
export type ReleaseType = "Novidade" | "Melhoria" | "Correção";

export const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
    Novidade: "New feature",
    Melhoria: "Improvement",
    Correção: "Fix",
};

export function releaseTypeLabel(type: string): string {
    return RELEASE_TYPE_LABELS[type as ReleaseType] ?? type;
}

/** A release note, as `/api/releases` sends and receives it. */
export type Release = {
    id: number;
    titulo: string;
    descricao: string;
    oQueMuda: string;
    passoAPasso: string[];
    videoEad?: string;
    /** Data URLs of the attached images (already resized in the browser). */
    imagens: string[];
    data: string;
    hora: string;
    usuario: string;
    tipo: ReleaseType;
    produto: string;
};

export type ReleaseForm = Omit<Release, "id">;
