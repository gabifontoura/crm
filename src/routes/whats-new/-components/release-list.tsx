import { useEffect, useMemo, useState } from "react";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { FilterChip } from "@/components/ui/filter-chip";
import { RELEASE_TYPE_LABELS, releaseTypeLabel, type Release, type ReleaseType } from "./data";
import { TYPE_LOOK } from "./badges";
import { ReleaseCard } from "./ReleaseCard";
import {Button} from "#/components/ui/button.tsx";

type ReleaseListProps = {
    releases: Release[];
    onUpdate?: () => void;
    canEdit?: boolean;
};

const PLURAL: Record<ReleaseType, string> = { Novidade: "New features", Melhoria: "Improvements", Correção: "Fixes" };

const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

const shortMonths = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];


export function ReleaseList({ releases, onUpdate, canEdit }: ReleaseListProps) {
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<ReleaseType | "all">("all");
    const countOf = (t: ReleaseType) => releases.filter((r) => r.tipo === t).length;

    const [expandedYears, setExpandedYears] = useState<string[]>([]);
    const [expandedMonths, setExpandedMonths] = useState<string[]>([]);

    /*
     * Search
     */
    const filteredReleases = useMemo(() => {
        const term = search.trim().toLocaleLowerCase();
        const ofType = typeFilter === "all" ? releases : releases.filter((r) => r.tipo === typeFilter);

        if (!term) {
            return ofType;
        }

        return ofType.filter((release) => {
            const searchableText = [
                release.titulo,
                release.descricao,
                release.oQueMuda,
                release.tipo,
                releaseTypeLabel(release.tipo),
                release.produto,
                release.usuario,
                release.data,
                release.hora,
                release.videoEad,
                ...release.passoAPasso,
            ]
                .filter(Boolean)
                .join(" ")
                .toLocaleLowerCase();

            return searchableText.includes(term);
        });
    }, [releases, search, typeFilter]);

    /*
     * Group by year and month
     */
    const groupedReleases = useMemo(() => {
        return filteredReleases.reduce<
            Record<string, Record<string, Release[]>>
        >((years, release) => {
            const [, month, year] = release.data.split("/");

            if (!year || !month) {
                return years;
            }

            years[year] ??= {};
            years[year][month] ??= [];

            years[year][month].push(release);

            return years;
        }, {});
    }, [filteredReleases]);

    /*
     * Sorted years
     */
    const years = useMemo(() => {
        return Object.entries(groupedReleases).sort(
            ([yearA], [yearB]) => Number(yearB) - Number(yearA),
        );
    }, [groupedReleases]);

    /*
     * When there is a search, automatically expand the
     * years and months that have results.
     *
     * Without a search, only the most recent year and the
     * most recent month of that year stay expanded.
     *
     * We don't use key={search}, so the Accordions stay
     * mounted and keep their behavior.
     */
    useEffect(() => {
        if (search.trim() || typeFilter !== "all") {
            const newYears = years.map(([year]) => year);

            const newMonths = years.flatMap(([year, yearMonths]) =>
                Object.keys(yearMonths).map((month) => `${year}-${month}`),
            );

            setExpandedYears(newYears);
            setExpandedMonths(newMonths);
        } else if (years.length > 0) {
            const [latestYear, yearMonths] = years[0];

            const sortedMonths = Object.entries(yearMonths).sort(
                ([monthA], [monthB]) => Number(monthB) - Number(monthA),
            );

            const latestMonth = sortedMonths[0]?.[0];

            setExpandedYears([latestYear]);
            setExpandedMonths(
                latestMonth
                    ? [`${latestYear}-${latestMonth}`]
                    : [],
            );
        }
    }, [search, typeFilter, years]);

    return (

        <div className="mx-auto w-full max-w-4xl">

            {/* TYPE + SEARCH */}
            <div className="mb-1 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by type">
                    <FilterChip label="All" count={releases.length} active={typeFilter === "all"} onClick={() => setTypeFilter("all")} />
                    {(Object.keys(RELEASE_TYPE_LABELS) as ReleaseType[]).map((t) => (
                        <FilterChip key={t} label={PLURAL[t]} icon={TYPE_LOOK[t].icon} count={countOf(t)} active={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? "all" : t)} />
                    ))}
                </div>
                <div className="relative">
                    <MagnifyingGlassIcon
                        size={18}
                        weight="regular"
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />

                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search release notes..."
                        aria-label="Search release notes"
                        data-testid="input-search"
                        className="h-10 pl-10 pr-16 text-sm"
                    />

                    {search && (
                        <Button
                            variant="ghost"
                            type="button"
                            data-testid="btn-clear"
                            onClick={() => {
                                setSearch("");
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Clear
                        </Button>
                    )}
                </div>

                {search && (
                    <p className="mt-1 text-xs text-muted-foreground">
                        {filteredReleases.length === 0
                            ? "No release notes found."
                            : `${filteredReleases.length} ${
                                filteredReleases.length === 1
                                    ? "release note found"
                                    : "release notes found"
                            }`}
                    </p>
                )}
            </div>

            {/* NO RESULTS */}
            {years.length === 0 ? (
                <div className="border border-dashed border-border/60 py-12 text-center">
                    <MagnifyingGlassIcon
                        size={28}
                        weight="regular"
                        className="mx-auto mb-3 text-muted-foreground"
                    />

                    <p className="text-sm font-medium">
                        No release notes found
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                        Try searching for a different term.
                    </p>
                </div>
            ) : (

                <Accordion
                    type="multiple"
                    value={expandedYears}
                    onValueChange={setExpandedYears}
                    className="gap-2"
                >
                    {years.map(([year, yearMonths]) => {
                        const sortedMonths = Object.entries(
                            yearMonths,
                        ).sort(
                            ([monthA], [monthB]) =>
                                Number(monthB) - Number(monthA),
                        );

                        const totalReleases = Object.values(
                            yearMonths,
                        ).reduce(
                            (total, items) => total + items.length,
                            0,
                        );

                        const expandedYearMonths =
                            expandedMonths.filter((value) =>
                                value.startsWith(`${year}-`),
                            );

                        return (
                            <AccordionItem
                                key={year}
                                value={year}
                                className="border-0 border-b border-border/60"
                            >
                                {/* YEAR */}
                                <AccordionTrigger data-testid="accordion-trigger-year" className="px-0 py-5 hover:no-underline">
                                    <div className="flex w-full min-w-0 items-center gap-5">
                                        <span className="shrink-0 text-3xl font-bold tracking-tight text-foreground">
                                            {year}
                                        </span>

                                        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                                            {sortedMonths.map(
                                                ([month]) => (
                                                    <span
                                                        key={month}
                                                        className="flex shrink-0 items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                                                    >
                                                        <span className="size-1 rounded-full bg-brand" />

                                                        {
                                                            shortMonths[
                                                            Number(
                                                                month,
                                                            ) - 1
                                                                ]
                                                        }
                                                    </span>
                                                ),
                                            )}
                                        </div>

                                        <span className="hidden shrink-0 text-xs font-medium text-muted-foreground sm:block">
                                            {totalReleases}{" "}
                                            {totalReleases === 1
                                                ? "release note"
                                                : "release notes"}
                                        </span>
                                    </div>
                                </AccordionTrigger>

                                {/* YEAR CONTENT */}
                                <AccordionContent className="pb-6 pt-2">
                                    <Accordion
                                        type="multiple"
                                        value={expandedYearMonths}
                                        onValueChange={(values) => {
                                            setExpandedMonths((current) => {
                                                const otherYears =
                                                    current.filter(
                                                        (value) =>
                                                            !value.startsWith(
                                                                `${year}-`,
                                                            ),
                                                    );

                                                return [
                                                    ...otherYears,
                                                    ...values,
                                                ];
                                            });
                                        }}
                                        className="gap-2"
                                    >
                                        {sortedMonths.map(
                                            ([month, monthReleases]) => {
                                                const monthName =
                                                    months[
                                                    Number(month) - 1
                                                        ] ?? "";

                                                const monthValue = `${year}-${month}`;

                                                const sortedReleases =
                                                    [
                                                        ...monthReleases,
                                                    ].sort(
                                                        (a, b) => {
                                                            const [
                                                                dayA,
                                                            ] =
                                                                a.data.split(
                                                                    "/",
                                                                );

                                                            const [
                                                                dayB,
                                                            ] =
                                                                b.data.split(
                                                                    "/",
                                                                );

                                                            if (
                                                                Number(
                                                                    dayA,
                                                                ) !==
                                                                Number(
                                                                    dayB,
                                                                )
                                                            ) {
                                                                return (
                                                                    Number(
                                                                        dayB,
                                                                    ) -
                                                                    Number(
                                                                        dayA,
                                                                    )
                                                                );
                                                            }

                                                            return b.hora.localeCompare(
                                                                a.hora,
                                                            );
                                                        },
                                                    );

                                                return (
                                                    <AccordionItem
                                                        key={monthValue}
                                                        value={monthValue}
                                                        className="rounded-lg border border-border bg-card"
                                                    >
                                                        {/* MONTH */}
                                                        <AccordionTrigger data-testid="accordion-trigger-month" className="px-4 py-3 hover:no-underline">
                                                            <div className="flex w-full items-center justify-between pr-2">
                                                                <span className="text-sm font-semibold capitalize text-foreground">
                                                                    {monthName}
                                                                </span>

                                                                <span className="text-xs font-semibold tabular-nums text-brand">
                                                                    {monthReleases.length}
                                                                </span>
                                                            </div>
                                                        </AccordionTrigger>

                                                        {/* CARDS */}
                                                        <AccordionContent className="border-t border-border/50 px-4 pt-5">
                                                            <div className="flex flex-col gap-6 pb-4">
                                                                {sortedReleases.map(
                                                                    (
                                                                        release,
                                                                    ) => {
                                                                        const [
                                                                            day,
                                                                        ] =
                                                                            release.data.split(
                                                                                "/",
                                                                            );

                                                                        return (
                                                                            <div
                                                                                key={
                                                                                    release.id
                                                                                }
                                                                                className="grid grid-cols-[52px_minmax(0,1fr)] gap-5"
                                                                            >
                                                                                {/* DATE */}
                                                                                <div className="flex flex-col items-end pt-5 text-right">
                                                                                    <span className="text-2xl font-bold leading-none text-brand">
                                                                                        {
                                                                                            day
                                                                                        }
                                                                                    </span>

                                                                                    <span className="mt-1 text-[10px] font-medium capitalize text-muted-foreground">
                                                                                        {
                                                                                            monthName
                                                                                        }
                                                                                    </span>

                                                                                    <span className="text-[10px] font-medium text-muted-foreground">
                                                                                        {
                                                                                            year
                                                                                        }
                                                                                    </span>
                                                                                </div>

                                                                                {/* CARD */}
                                                                                <ReleaseCard
                                                                                    release={
                                                                                        release
                                                                                    }
                                                                                    onUpdate={
                                                                                        onUpdate
                                                                                    }
                                                                                    canEdit={
                                                                                        canEdit
                                                                                    }
                                                                                />
                                                                            </div>
                                                                        );
                                                                    },
                                                                )}
                                                            </div>
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                );
                                            },
                                        )}
                                    </Accordion>
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            )}
        </div>
    );
}
