import { Plus, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Avatar, Card, Chip, buttonClass } from "@/components/ui";
import { db } from "@/db/client";
import { displayPhone } from "@/lib/phone";
import { listCoaches } from "@/modules/coaches/coaches";
import { coachScheduleConflicts } from "@/modules/coaches/conflicts";
import { listGroups } from "@/modules/groups/groups";
import { InvitationChip } from "@/modules/invitations/components/invitation-chip";
import { invitationStates } from "@/modules/invitations/invitations";
import { canManageSettings } from "@/modules/schools/permissions";
import { getSchoolContext } from "../data";

export const metadata: Metadata = { title: "Profesores" };

export default async function CoachesPage({ params }: PageProps<"/[slug]/profesores">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManageSettings(roles)) return <NoAccess />;
  const [coaches, groups] = await Promise.all([listCoaches(db, school.id), listGroups(db, school.id)]);
  const invitations = await invitationStates(db, school.id, "COACH", coaches);
  const conflicts = coachScheduleConflicts(groups);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Profesores"
        subtitle="Tu equipo, sus grupos y su acceso a la app."
        actions={
          <Link href={`/${slug}/profesores/nuevo`} className={buttonClass("primary", "h-10")}>
            <Plus className="size-4" /> Nuevo profesor
          </Link>
        }
      />
      {coaches.length === 0 ? (
        <Card className="mx-auto max-w-lg text-center">
          <h2 className="text-xl font-semibold">Agrega a tu equipo</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Registra a tus profesores, asígnalos a los grupos e invítalos para que tomen asistencia desde su
            celular.
          </p>
          <Link href={`/${slug}/profesores/nuevo`} className={buttonClass("primary", "mt-6")}>
            Crear profesor
          </Link>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {coaches.map((coach) => {
            const name = `${coach.firstName} ${coach.lastName}`;
            const hasConflict = conflicts.some((c) => c.coachId === coach.id);
            return (
              <li key={coach.id}>
                <Link href={`/${slug}/profesores/${coach.id}`} className="block h-full">
                  <Card
                    className={
                      coach.active ? "h-full p-5 hover:ring-2 hover:ring-brand/20" : "h-full p-5 opacity-60"
                    }
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={name} size={48} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{name}</p>
                        <p className="truncate text-sm text-ink-soft">
                          {coach.specialty ?? "Profesor"} · {displayPhone(coach.phone)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <InvitationChip state={invitations.get(coach.id) ?? "none"} />
                      {!coach.active && <Chip>Inactivo</Chip>}
                      {hasConflict && (
                        <Chip tone="danger">
                          <TriangleAlert className="size-3.5" /> Cruce de horario
                        </Chip>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {coach.groups.map((g) => (
                        <Chip key={g.id} tone={g.role === "HEAD" ? "brand" : "neutral"}>
                          <span className="size-2 rounded-full" style={{ background: g.color }} aria-hidden />
                          {g.name}
                        </Chip>
                      ))}
                      {coach.groups.length === 0 && <span className="text-sm text-ink-soft">Sin grupos</span>}
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
