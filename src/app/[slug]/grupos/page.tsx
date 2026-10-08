import { Clock, GraduationCap, Pencil, Plus, TriangleAlert, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Card, Chip, buttonClass, cn } from "@/components/ui";
import { db } from "@/db/client";
import { formatCOP } from "@/lib/money";
import { listFeePlans } from "@/modules/billing/fee-plans";
import { coachScheduleConflicts } from "@/modules/coaches/conflicts";
import { listGroups } from "@/modules/groups/groups";
import { describeSchedule, weeklyMinutes } from "@/modules/groups/schedule";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../data";
import { listVenues } from "@/modules/schools/venues";
import { GroupArchiveButton } from "./group-archive-button";

export const metadata: Metadata = { title: "Grupos" };

export default async function GroupsPage({ params, searchParams }: PageProps<"/[slug]/grupos">) {
  const { slug } = await params;
  const { sede } = await searchParams;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  const [allGroups, plans, venueRows] = await Promise.all([
    listGroups(db, school.id),
    listFeePlans(db, school.id),
    listVenues(db, school.id),
  ]);
  const venues = venueRows.filter((v) => v.active);
  const venueId = venues.length > 1 && venues.some((v) => v.id === sede) ? sede : undefined;
  const groups = venueId ? allGroups.filter((g) => g.venueId === venueId) : allGroups;
  const planAmount = new Map(plans.map((p) => [p.id, p.monthlyAmount]));
  const conflicts = coachScheduleConflicts(groups);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Grupos"
        subtitle="Horarios, cupos y niveles de tus clases."
        actions={
          <Link href={`/${slug}/grupos/nuevo`} className={buttonClass("primary", "h-10")}>
            <Plus className="size-4" /> Nuevo grupo
          </Link>
        }
      />

      {venues.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label="Sedes">
          {[{ id: "", name: "Todas las sedes" }, ...venues].map((v) => (
            <Link
              key={v.id}
              href={v.id ? `/${slug}/grupos?sede=${v.id}` : `/${slug}/grupos`}
              className={cn(
                "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold",
                (venueId ?? "") === v.id ? "bg-ink text-surface" : "bg-muted text-ink-soft hover:text-ink",
              )}
            >
              {v.name}
            </Link>
          ))}
        </nav>
      )}

      {groups.length === 0 ? (
        <Card className="mx-auto max-w-lg text-center">
          <h2 className="text-xl font-semibold">Crea tu primer grupo</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Un grupo reúne alumnos del mismo nivel con un horario fijo, por ejemplo “Iniciación · lunes,
            miércoles y viernes 4:00 p. m.”.
          </p>
          <Link href={`/${slug}/grupos/nuevo`} className={buttonClass("primary", "mt-6")}>
            Crear grupo
          </Link>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => {
            const occupancy = Math.min(100, Math.round((group.enrolled / group.capacity) * 100));
            const full = group.enrolled >= group.capacity;
            return (
              <li key={group.id}>
                <Card
                  className={
                    group.active ? "flex h-full flex-col p-5" : "flex h-full flex-col p-5 opacity-60"
                  }
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 size-3 shrink-0 rounded-full"
                      style={{ background: group.color }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-semibold">{group.name}</p>
                      <p className="text-sm text-ink-soft">
                        {group.disciplineName} · {group.levelName ?? "Varios niveles"}
                        {venues.length > 1 && group.venueName ? ` · ${group.venueName}` : ""}
                      </p>
                    </div>
                    {!group.active && <Chip>Archivado</Chip>}
                  </div>

                  <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
                    <GraduationCap className="size-4 shrink-0 text-ink-faint" />
                    {group.coaches.length
                      ? group.coaches.map((c) => (c.role === "HEAD" ? c.name : `${c.name} (aux.)`)).join(", ")
                      : "Sin profesor asignado"}
                  </p>
                  {conflicts
                    .filter((c) => c.groupIds.includes(group.id))
                    .map((c) => (
                      <p
                        key={c.groupIds.join("-") + c.coachId}
                        className="mt-2 flex items-start gap-2 text-sm text-danger"
                      >
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {c.description}
                      </p>
                    ))}

                  <p className="mt-3 flex items-start gap-2 text-sm">
                    <Clock className="mt-0.5 size-4 shrink-0 text-ink-faint" />
                    <span>
                      {describeSchedule(group.schedule)}
                      <span className="text-ink-soft">
                        {" "}
                        · {Math.round(weeklyMinutes(group.schedule) / 60)} h/semana
                      </span>
                    </span>
                  </p>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-ink-soft">
                        <Users className="size-4" /> {group.enrolled} de {group.capacity}
                      </span>
                      <Chip tone={full ? "danger" : occupancy >= 80 ? "sun" : "mint"} dot>
                        {full ? "Lleno" : `${group.capacity - group.enrolled} cupos`}
                      </Chip>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${occupancy}%`, background: group.color }}
                      />
                    </div>
                  </div>

                  <div className="mt-auto flex items-center gap-2 pt-5">
                    <span className="flex-1 text-sm text-ink-soft">
                      {group.defaultFeePlanName
                        ? `${group.defaultFeePlanName} · ${formatCOP(planAmount.get(group.defaultFeePlanId!) ?? 0)}`
                        : "Sin tarifa sugerida"}
                    </span>
                    <Link
                      href={`/${slug}/alumnos?grupo=${group.id}`}
                      className={buttonClass("secondary", "h-9 px-3.5")}
                    >
                      Alumnos
                    </Link>
                    <Link
                      href={`/${slug}/grupos/${group.id}`}
                      className="grid size-10 place-items-center rounded-full border border-line bg-surface text-ink-soft shadow-pill hover:text-ink"
                      aria-label={`Editar ${group.name}`}
                      title="Editar"
                    >
                      <Pencil className="size-4" />
                    </Link>
                    <GroupArchiveButton
                      slug={slug}
                      groupId={group.id}
                      active={group.active}
                      name={group.name}
                    />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
