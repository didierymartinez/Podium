import { MessageCircle, Plus, Search, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Avatar, Card, Chip, Select, buttonClass, cn, inputClass } from "@/components/ui";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { whatsappLink } from "@/lib/whatsapp";
import { listAthletes } from "@/modules/athletes/athletes";
import { ENROLLMENT_STATUS_LABELS, ageOn } from "@/modules/athletes/enrollment-status";
import { listGroups } from "@/modules/groups/groups";
import { findAgeCategory, sportsAge } from "@/modules/schools/age-category";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSportsStructure } from "@/modules/schools/queries";
import { getSchoolContext } from "../data";
import { PeopleTabs } from "./people-tabs";

export const metadata: Metadata = { title: "Alumnos" };

const STATUS_FILTERS = [
  { value: "current", label: "Vigentes" },
  { value: "withdrawn", label: "Retirados" },
  { value: "all", label: "Todos" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

export default async function AthletesPage({ params, searchParams }: PageProps<"/[slug]/alumnos">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;

  const q = typeof sp.q === "string" ? sp.q : "";
  const groupId = typeof sp.grupo === "string" && /^[0-9a-f-]{36}$/.test(sp.grupo) ? sp.grupo : "";
  const status: StatusFilter = STATUS_FILTERS.some((s) => s.value === sp.estado)
    ? (sp.estado as StatusFilter)
    : "current";

  const [athletes, groups, structure] = await Promise.all([
    listAthletes(db, school.id, { query: q, groupId: groupId || undefined, status }),
    listGroups(db, school.id),
    getSportsStructure(db, school.id),
  ]);
  const today = todayIn(school.timezone);
  const season = Number(today.slice(0, 4));

  const href = (patch: Partial<{ q: string; grupo: string; estado: string }>) => {
    const query = new URLSearchParams({ q, grupo: groupId, estado: status, ...patch });
    for (const [k, v] of [...query.entries()]) if (!v || (k === "estado" && v === "current")) query.delete(k);
    const s = query.toString();
    return `/${slug}/alumnos${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alumnos"
        subtitle={`${athletes.length} ${athletes.length === 1 ? "alumno" : "alumnos"}`}
        actions={
          <>
            <PeopleTabs slug={slug} active="athletes" />
            <Link href={`/${slug}/alumnos/importar`} className={buttonClass("secondary", "h-10")}>
              <Upload className="size-4" /> Importar
            </Link>
            <Link href={`/${slug}/alumnos/nuevo`} className={buttonClass("primary", "h-10")}>
              <Plus className="size-4" /> Nuevo alumno
            </Link>
          </>
        }
      />

      <Card className="p-4 sm:p-5">
        <form className="flex flex-wrap items-center gap-2.5" action={`/${slug}/alumnos`}>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por nombre o documento"
              className={cn(inputClass, "pl-10")}
              aria-label="Buscar alumnos"
            />
          </div>
          <Select name="grupo" defaultValue={groupId} className="w-auto min-w-[180px]" aria-label="Grupo">
            <option value="">Todos los grupos</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          {status !== "current" && <input type="hidden" name="estado" value={status} />}
          <button type="submit" className={buttonClass("secondary", "h-11")}>
            Filtrar
          </button>
        </form>
        <div className="mt-3 flex gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={href({ estado: f.value })}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-semibold",
                status === f.value ? "bg-ink text-surface" : "bg-muted text-ink-soft hover:text-ink",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </Card>

      {athletes.length === 0 ? (
        <Card className="text-center">
          <p className="font-semibold">
            {q || groupId ? "No encontramos alumnos con esos filtros" : "Aún no hay alumnos"}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {q || groupId
              ? "Prueba con otra búsqueda."
              : "Agrega tu primer alumno con su acudiente y matrícula."}
          </p>
        </Card>
      ) : (
        <Card className="p-2 sm:p-3">
          <ul className="divide-y divide-line">
            {athletes.map((a) => {
              const name = `${a.firstName} ${a.lastName}`;
              const category = findAgeCategory(sportsAge(a.birthDate, season), structure.ageCategories);
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-2xl px-2 py-3 hover:bg-canvas sm:px-3"
                >
                  <Link href={`/${slug}/alumnos/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={name} size={44} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{name}</p>
                      <p className="truncate text-sm text-ink-soft">
                        {ageOn(a.birthDate, today)} años{category ? ` · ${category.name}` : ""}
                        {a.payer ? ` · ${a.payer.name}` : ""}
                      </p>
                    </div>
                  </Link>
                  <div className="hidden flex-wrap justify-end gap-1.5 md:flex">
                    {a.enrollments.length === 0 && <Chip>Sin matrícula</Chip>}
                    {a.enrollments.slice(0, 2).map((e, i) => (
                      <Chip
                        key={i}
                        tone={e.status === "ACTIVE" ? "brand" : e.status === "FROZEN" ? "violet" : "neutral"}
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{ background: e.groupColor }}
                          aria-hidden
                        />
                        {e.groupName}
                        {e.status !== "ACTIVE" && ` · ${ENROLLMENT_STATUS_LABELS[e.status]}`}
                      </Chip>
                    ))}
                  </div>
                  {a.payer && (
                    <a
                      href={whatsappLink(a.payer.phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-mint shadow-pill"
                      aria-label={`WhatsApp a ${a.payer.name}`}
                      title={`WhatsApp a ${a.payer.name}`}
                    >
                      <MessageCircle className="size-4" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
