const MAX_WIDTH = 1280;
const JPEG_QUALITY = 0.82;

function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
}

/**
 * Reads the selected file and returns a data URL ready to be saved.
 *
 * Camera/phone photos are often several megabytes; without resizing, every
 * attached image would bloat the data file considerably. Above `MAX_WIDTH`,
 * the image is redrawn on a canvas and recompressed as JPEG. SVGs are passed
 * through untouched, since redrawing them on a canvas would lose sharpness.
 */
export async function fileToDataUrl(file: File): Promise<string> {
    const original = await readAsDataUrl(file);

    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
        return original;
    }

    try {
        const image = await loadImage(original);

        if (image.width <= MAX_WIDTH) {
            return original;
        }

        const scale = MAX_WIDTH / image.width;
        const canvas = document.createElement("canvas");
        canvas.width = MAX_WIDTH;
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext("2d");
        if (!context) return original;

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    } catch {
        return original;
    }
}

/**
 * Always re-encodes a photo as a small JPEG (field service reports travel
 * with several photos in one request, so each must stay around 100-200 KB).
 */
export async function compressPhoto(file: File, maxWidth = 1024, quality = 0.7): Promise<string> {
    const original = await readAsDataUrl(file);
    const image = await loadImage(original);
    const scale = Math.min(1, maxWidth / image.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return original;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
}

export async function filesToDataUrls(files: FileList | File[]): Promise<string[]> {
    const list = Array.from(files);
    return Promise.all(list.map(fileToDataUrl));
}
