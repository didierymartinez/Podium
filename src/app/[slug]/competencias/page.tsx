import { MapPin, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MedalCount } from "@/components/medal-count";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Card, Chip, SectionTitle, buttonClass, cn } from "@/components/ui";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { listCompetitions, medalTable } from "@/modules/competitions/competitions";
import { KIND_LABELS } from "@/modules/competitions/labels";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../data";

export const metadata: Metadata = { title: "Competencias" };

/** Calendario de competencias (DEP-60) y medallero (DEP-67). */
export default async function CompetitionsPage({ params, searchParams }: PageProps<"/[slug]/competencias">) {
  const { slug } = await params;
  const query = await searchParams;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles) && !roles.includes("COACH")) return <NoAccess />;
  const today = todayIn(school.timezone);
  const current = Number(today.slice(0, 4));
  const season =
    Number(query.temporada) >= 2000 && Number(query.temporada) <= current + 1
      ? Number(query.temporada)
      : current;
  const [list, medals] = await Promise.all([
    listCompetitions(db, school.id),
    medalTable(db, school.id, season),
  ]);
  const upcoming = list.filter((c) => c.endsOn >= today).reverse();
  const past = list.filter((c) => c.endsOn < today);

  const row = (c: (typeof list)[number]) => (
    <li key={c.id}>
      <Link
        href={`/${slug}/competencias/${c.id}`}
        className="flex flex-wrap items-center gap-2 py-2.5 hover:text-brand"
      >
        <span className="min-w-48 flex-1">
          <span className="font-semibold">{c.name}</span>
          <span className="flex items-center gap-1 text-sm text-ink-soft">
            {c.startsOn === c.endsOn ? c.startsOn : `${c.startsOn} a ${c.endsOn}`}
            {c.city && (
              <>
                {" · "}
                <MapPin className="size-3.5" /> {c.city}
              </>
            )}
          </span>
        </span>
        <Chip>{KIND_LABELS[c.kind]}</Chip>
        {c.endsOn >= today && c.registrationDeadline >= today && (
          <Chip tone="sun">Inscripciones hasta {c.registrationDeadline}</Chip>
        )}
        <span className="text-sm text-ink-soft">
          {c.accepted} inscritos · {c.invited} por responder
        </span>
      </Link>
    </li>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Competencias"
        subtitle="Calendario, convocatorias, resultados y medallero"
        actions={
          <Link href={`/${slug}/competencias/nueva`} className={buttonClass("primary", "h-10")}>
            <Plus className="size-4" /> Nueva competencia
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <SectionTitle>Próximas</SectionTitle>
            <ul className="divide-y divide-line" aria-label="Próximas competencias">
              {upcoming.map(row)}
              {upcoming.length === 0 && (
                <li className="py-2 text-sm text-ink-soft">No hay competencias programadas.</li>
              )}
            </ul>
          </Card>
          {past.length > 0 && (
            <Card>
              <SectionTitle>Anteriores</SectionTitle>
              <ul className="divide-y divide-line" aria-label="Competencias anteriores">
                {past.map(row)}
              </ul>
            </Card>
          )}
        </div>
        <Card aria-label="Medallero">
          <SectionTitle>Medallero {season}</SectionTitle>
          <nav className="mb-3 flex gap-2" aria-label="Temporada">
            {[current - 1, current].map((y) => (
              <Link
                key={y}
                href={`/${slug}/competencias?temporada=${y}`}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-semibold",
                  y === season ? "bg-brand text-white" : "bg-muted text-ink-soft",
                )}
              >
                {y}
              </Link>
            ))}
          </nav>
          <p className="text-sm">
            <MedalCount medals={medals.total} />
          </p>
          {medals.competitions.length > 0 && (
            <>
              <p className="mt-4 text-sm font-semibold">Por competencia</p>
              <ul className="mt-1 space-y-1 text-sm">
                {medals.competitions.map((c) => (
                  <li key={c.name + c.startsOn}>
                    <span className="block text-ink-soft">{c.name}</span>
                    <MedalCount medals={c.medals} />
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm font-semibold">Por categoría</p>
              <ul className="mt-1 space-y-1 text-sm">
                {medals.categories.map((c) => (
                  <li key={c.name}>
                    <span className="block text-ink-soft">{c.name}</span>
                    <MedalCount medals={c.medals} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
