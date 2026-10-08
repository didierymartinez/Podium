import { ChevronRight, Clock, MessageCircle, Pin, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { Avatar, Card, Chip, SectionTitle, Tile, buttonClass } from "@/components/ui";
import { asPortalUser } from "@/db/portal";
import { formatCOP } from "@/lib/money";
import { pinnedAnnouncements } from "@/modules/announcements/announcements";
import { guardianStatement } from "@/modules/billing/statement";
import { guardianIdsOfUser } from "@/modules/portal/family";
import { db } from "@/db/client";
import { addDays, formatDayTitle, todayIn } from "@/lib/dates";
import { attendanceStats } from "@/modules/attendance/attendance";
import { whatsappLink } from "@/lib/whatsapp";
import { ENROLLMENT_STATUS_LABELS, ageOn } from "@/modules/athletes/enrollment-status";
import { describeSchedule } from "@/modules/groups/schedule";
import { listSessions } from "@/modules/attendance/sessions";
import { getMemberHome } from "@/modules/portal/member-home";
import { ensureSessions } from "./asistencia/sync";
import { SessionStatusChip } from "./asistencia/status-chip";
import type { schools } from "@/db/schema";

/** Inicio de quien no administra la escuela: acudientes, alumnos y profesores. */
export async function MemberHome({
  school,
  user,
}: {
  school: typeof schools.$inferSelect;
  user: { id: string; name: string };
}) {
  const home = await getMemberHome(db, school.id, user.id);
  const today = todayIn(school.timezone);
  const stats = await attendanceStats(
    db,
    school.id,
    [...home.athletes.map((a) => a.id), ...home.coachGroups.flatMap((g) => g.athletes.map((a) => a.id))],
    { from: addDays(today, -30), to: today },
  );
  const rate = (id: string) => stats.get(id)?.rate ?? null;
  const firstName = user.name.split(" ")[0];
  const familyGroupIds = [...new Set(home.athletes.flatMap((a) => a.enrollments.map((e) => e.group.id)))];
  const [pinned, family] = await Promise.all([
    pinnedAnnouncements(db, school.id, today, user.id),
    home.athletes.length
      ? asPortalUser(user.id, async () => {
          await ensureSessions(school.id, school.timezone);
          const [guardianId] = await guardianIdsOfUser(db, school.id, user.id);
          const [statement, upcoming] = await Promise.all([
            guardianId ? guardianStatement(db, school.id, guardianId) : Promise.resolve(null),
            listSessions(db, school.id, { from: today, to: addDays(today, 6) }, { groupIds: familyGroupIds }),
          ]);
          return { statement, upcoming };
        })
      : Promise.resolve(null),
  ]);
  let todaySessions: Awaited<ReturnType<typeof listSessions>> = [];
  if (home.coachGroups.length > 0) {
    await ensureSessions(school.id, school.timezone);
    todaySessions = await listSessions(db, school.id, { from: today, to: today }, { coachUserId: user.id });
  }

  return (
    <div className="space-y-5">
      <div className="px-1 pt-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Hola, {firstName}</h1>
        <p className="mt-1 text-ink-soft">Bienvenido(a) a {school.name}.</p>
      </div>

      {pinned.map((p) => (
        <Card key={p.id} className="border-sun/60 bg-sun/15 p-5" aria-label="Aviso fijado">
          <p className="flex items-center gap-2 font-semibold">
            <Pin className="size-4" /> {p.title}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm">{p.body}</p>
        </Card>
      ))}

      {family && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionTitle
              action={
                <Link href={`/${school.slug}/mis-pagos`} className="text-sm font-semibold text-brand">
                  Ver pagos
                </Link>
              }
            >
              Próximo pago
            </SectionTitle>
            {family.statement && family.statement.owed > 0 ? (
              <>
                <p className="text-3xl font-semibold">{formatCOP(family.statement.owed)}</p>
                <Link href={`/${school.slug}/mis-pagos`} className={buttonClass("primary", "mt-3 h-10")}>
                  <Wallet className="size-4" /> Pagar
                </Link>
              </>
            ) : (
              <p className="text-sm text-ink-soft">Estás al día. ¡Gracias!</p>
            )}
          </Card>
          <Card>
            <SectionTitle>Próximas clases</SectionTitle>
            <ul className="space-y-1.5 text-sm" aria-label="Próximas clases">
              {family.upcoming.slice(0, 6).map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: s.groupColor }} aria-hidden />
                  <span
                    className={
                      s.status === "CANCELED" ? "flex-1 capitalize line-through" : "flex-1 capitalize"
                    }
                  >
                    {formatDayTitle(s.date)} · {s.startTime}
                  </span>
                  <span className="text-ink-soft">{s.groupName}</span>
                  {s.status === "CANCELED" && <Chip tone="danger">Cancelada</Chip>}
                </li>
              ))}
              {family.upcoming.length === 0 && <li className="text-ink-soft">No hay clases esta semana.</li>}
            </ul>
          </Card>
        </div>
      )}

      {home.coachGroups.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="text-lg font-semibold tracking-tight">Clases de hoy</h2>
            <Link href={`/${school.slug}/asistencia`} className="text-sm font-semibold text-brand">
              Ver asistencia
            </Link>
          </div>
          {todaySessions.length === 0 ? (
            <Card className="p-5 text-sm text-ink-soft">Hoy no tienes clases.</Card>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {todaySessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/${school.slug}/asistencia/${s.id}`}
                    className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 shadow-soft transition hover:border-brand/40"
                  >
                    <span
                      className="h-10 w-1.5 shrink-0 rounded-full"
                      style={{ background: s.groupColor }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{s.groupName}</p>
                      <p className="text-sm text-ink-soft">
                        {s.startTime} – {s.endTime}
                      </p>
                    </div>
                    <SessionStatusChip session={s} today={today} />
                    <ChevronRight className="size-4 text-ink-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {home.coachGroups.length > 0 && (
        <section className="space-y-3">
          <h2 className="px-1 text-lg font-semibold tracking-tight">Mis grupos</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {home.coachGroups.map(({ group, role, athletes }) => (
              <Card key={group.id} className="p-5">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1.5 size-3 shrink-0 rounded-full"
                    style={{ background: group.color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold">{group.name}</p>
                    <p className="text-sm text-ink-soft">{group.levelName ?? "Varios niveles"}</p>
                  </div>
                  <Chip tone={role === "HEAD" ? "brand" : "neutral"}>
                    {role === "HEAD" ? "Titular" : "Auxiliar"}
                  </Chip>
                </div>
                <p className="mt-3 flex items-start gap-2 text-sm">
                  <Clock className="mt-0.5 size-4 shrink-0 text-ink-faint" />{" "}
                  {describeSchedule(group.schedule)}
                </p>
                <div className="mt-4">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <Users className="size-4 text-ink-faint" /> {athletes.length} alumnos
                  </p>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {athletes.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-2 rounded-xl bg-canvas px-2.5 py-1.5 text-sm"
                      >
                        <Avatar name={a.name} size={28} />
                        <span className="min-w-0 flex-1 truncate">{a.name}</span>
                        <span className="text-xs text-ink-soft">
                          {ageOn(a.birthDate, today)} a{rate(a.id) !== null && ` · ${rate(a.id)} %`}
                        </span>
                      </li>
                    ))}
                    {athletes.length === 0 && (
                      <li className="text-sm text-ink-soft">Aún no hay alumnos matriculados.</li>
                    )}
                  </ul>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {home.athletes.length > 0 && (
        <section className="space-y-3">
          <h2 className="px-1 text-lg font-semibold tracking-tight">
            {home.athletes.some((a) => a.isPayer !== null) ? "Mis hijos" : "Mis clases"}
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {home.athletes.map((a) => {
              const name = `${a.firstName} ${a.lastName}`;
              return (
                <Card key={a.id} className="p-5">
                  <div className="flex items-center gap-3">
                    <Avatar name={name} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-semibold">{name}</p>
                      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                        {ageOn(a.birthDate, today)} años
                        {rate(a.id) !== null && <Chip tone="mint">Asistencia 30 días: {rate(a.id)} %</Chip>}
                        {a.isPayer && <Chip tone="violet">Responsable de pago</Chip>}
                      </p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-2">
                    {a.enrollments.map(({ group, status }) => (
                      <li key={group.id}>
                        <Tile className="p-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="size-2.5 rounded-full"
                              style={{ background: group.color }}
                              aria-hidden
                            />
                            <span className="flex-1 font-semibold">{group.name}</span>
                            {status !== "ACTIVE" && <Chip>{ENROLLMENT_STATUS_LABELS[status]}</Chip>}
                          </div>
                          <p className="mt-1 text-sm text-ink-soft">{describeSchedule(group.schedule)}</p>
                        </Tile>
                      </li>
                    ))}
                    {a.enrollments.length === 0 && (
                      <li className="text-sm text-ink-soft">Sin matrícula vigente.</li>
                    )}
                  </ul>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {home.athletes.length === 0 && home.coachGroups.length === 0 && (
        <Card className="text-center text-sm text-ink-soft">
          Tu cuenta está vinculada a la escuela, pero aún no tienes alumnos ni grupos asignados.
        </Card>
      )}

      {school.phone && (
        <a
          href={whatsappLink(school.phone)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-1 text-sm font-semibold text-mint"
        >
          <MessageCircle className="size-4" /> Escribir a la escuela por WhatsApp
        </a>
      )}
    </div>
  );
}
