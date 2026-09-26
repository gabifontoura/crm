import {
    AddressBookIcon,
    BuildingsIcon,
    CalendarBlankIcon,
    ChartBarIcon,
    ClipboardTextIcon,
    GearSixIcon,
    HandshakeIcon,
    HeadsetIcon,
    type Icon,
    PaletteIcon,
    SparkleIcon,
    SquaresFourIcon,
    TrendUpIcon,
    UsersIcon,
    WrenchIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { releaseTypeLabel } from "./data";

/** What kind of change it is: each one has its own color and icon. */
export const TYPE_LOOK: Record<string, { icon: Icon; className: string }> = {
    Novidade: { icon: SparkleIcon, className: "bg-sky-100 text-sky-800 ring-sky-200" },
    Melhoria: { icon: TrendUpIcon, className: "bg-violet-100 text-violet-800 ring-violet-200" },
    Correção: { icon: WrenchIcon, className: "bg-amber-100 text-amber-900 ring-amber-200" },
};

/** The screen it's about, with the icon it has in the menu. */
const PRODUCT_ICON: Record<string, Icon> = {
    calendar: CalendarBlankIcon,
    tickets: HeadsetIcon,
    developments: BuildingsIcon,
    tasks: ClipboardTextIcon,
    settings: GearSixIcon,
    team: UsersIcon,
    contacts: AddressBookIcon,
    deals: HandshakeIcon,
    dashboards: SquaresFourIcon,
    reports: ChartBarIcon,
    design: PaletteIcon,
};

const PILL = "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold text-[11px] ring-1 ring-inset";

export function TypeBadge({ type, className }: { type: string; className?: string }) {
    const look = TYPE_LOOK[type] ?? { icon: SparkleIcon, className: "bg-slate-100 text-slate-700 ring-slate-200" };
    const I = look.icon;
    return (
        <span className={cn(PILL, look.className, className)}>
            <I weight="bold" className="size-3" /> {releaseTypeLabel(type)}
        </span>
    );
}

export function ProductBadge({ product, className }: { product: string; className?: string }) {
    if (!product.trim()) return null;
    const I = PRODUCT_ICON[product.trim().toLowerCase()] ?? SquaresFourIcon;
    return (
        <span className={cn(PILL, "bg-card font-medium text-muted-foreground ring-border", className)}>
            <I className="size-3" /> {product}
        </span>
    );
}
