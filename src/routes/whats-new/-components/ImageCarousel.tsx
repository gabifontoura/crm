import { useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type ImageCarouselProps = {
    images: string[];
    title: string;
    className?: string;
};

/** Minimum movement, in pixels, to treat the gesture as a drag instead of a click. */
const DRAG_THRESHOLD = 6;

/**
 * A strip of images that slides sideways, like the featured carousel of a
 * news blog: drag with the mouse or a finger, or use the arrows/dots.
 *
 * Native scrolling (`overflow-x-auto` + `scroll-snap`) already covers
 * touch/trackpad; pointer capture only exists for mouse click-and-drag,
 * which native scrolling doesn't provide on its own.
 */
export function ImageCarousel({ images, title, className }: ImageCarouselProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [currentIndex, setCurrentIndex] = useState(0);

    const isDragging = useRef(false);
    const didDrag = useRef(false);
    const startX = useRef(0);
    const startScroll = useRef(0);

    function goToIndex(index: number) {
        const track = trackRef.current;
        if (!track) return;
        const target = Math.max(0, Math.min(index, images.length - 1));
        track.scrollTo({ left: target * track.clientWidth, behavior: "smooth" });
    }

    function nearestIndex() {
        const track = trackRef.current;
        if (!track || track.clientWidth === 0) return 0;
        return Math.round(track.scrollLeft / track.clientWidth);
    }

    function handleDragStart(event: PointerEvent<HTMLDivElement>) {
        const track = trackRef.current;
        if (!track || images.length <= 1 || event.button !== 0) return;

        isDragging.current = true;
        didDrag.current = false;
        startX.current = event.clientX;
        startScroll.current = track.scrollLeft;
        track.setPointerCapture(event.pointerId);
    }

    function handleDragMove(event: PointerEvent<HTMLDivElement>) {
        const track = trackRef.current;
        if (!track || !isDragging.current) return;

        const delta = event.clientX - startX.current;
        if (Math.abs(delta) > DRAG_THRESHOLD) didDrag.current = true;
        track.scrollLeft = startScroll.current - delta;
    }

    function handleDragEnd(event: PointerEvent<HTMLDivElement>) {
        const track = trackRef.current;
        if (!isDragging.current || !track) return;

        isDragging.current = false;
        if (track.hasPointerCapture(event.pointerId)) {
            track.releasePointerCapture(event.pointerId);
        }
        goToIndex(nearestIndex());
    }

    function handleScroll() {
        const index = nearestIndex();
        setCurrentIndex((current) => (current === index ? current : index));
    }

    /** Without this, every drag would end up opening the image in a new tab. */
    function handleSlideClick(event: MouseEvent<HTMLAnchorElement>) {
        if (didDrag.current) {
            event.preventDefault();
        }
    }

    return (
        <div className={cn("group/carousel relative select-none", className)}>
            <div
                ref={trackRef}
                onScroll={handleScroll}
                onPointerDown={handleDragStart}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
                onPointerLeave={(event) => isDragging.current && handleDragEnd(event)}
                className={cn(
                    "flex aspect-[16/9] w-full snap-x snap-mandatory overflow-x-auto scroll-smooth",
                    "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
                    images.length > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default",
                )}
            >
                {images.map((image, index) => (
                    <a
                        key={index}
                        href={image}
                        target="_blank"
                        rel="noopener noreferrer"
                        draggable={false}
                        onClick={handleSlideClick}
                        data-testid={`link-image-${index + 1}`}
                        className="h-full w-full shrink-0 snap-start snap-always bg-muted"
                    >
                        <img
                            src={image}
                            alt={`Image ${index + 1} of ${title}`}
                            draggable={false}
                            className="h-full w-full object-cover"
                        />
                    </a>
                ))}
            </div>

            {images.length > 1 && (
                <>
                    <button
                        type="button"
                        aria-label="Previous image"
                        data-testid="btn-carousel-previous"
                        onClick={() => goToIndex(currentIndex - 1)}
                        disabled={currentIndex === 0}
                        className="absolute top-1/2 left-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover/carousel:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                    >
                        <CaretLeftIcon size={16} weight="bold" />
                    </button>

                    <button
                        type="button"
                        aria-label="Next image"
                        data-testid="btn-carousel-next"
                        onClick={() => goToIndex(currentIndex + 1)}
                        disabled={currentIndex === images.length - 1}
                        className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover/carousel:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                    >
                        <CaretRightIcon size={16} weight="bold" />
                    </button>

                    <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
                        {images.map((_, index) => (
                            <button
                                key={index}
                                type="button"
                                aria-label={`Go to image ${index + 1}`}
                                data-testid={`btn-carousel-dot-${index + 1}`}
                                onClick={() => goToIndex(index)}
                                className={cn(
                                    "pointer-events-auto h-1.5 rounded-full bg-white transition-all",
                                    index === currentIndex ? "w-4 opacity-100" : "w-1.5 opacity-60 hover:opacity-90",
                                )}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
