import { CalendarCheck, ChevronRight, Clock, MessageCircle, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { Avatar, Card, Chip, SectionTitle, Tile } from "@/components/ui";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
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
  const firstName = user.name.split(" ")[0];
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
                        <span className="text-xs text-ink-soft">{ageOn(a.birthDate, today)} a</span>
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

      <Card>
        <SectionTitle>Muy pronto en Podium</SectionTitle>
        <ul className="grid gap-2.5 sm:grid-cols-3">
          <Soon
            icon={<CalendarCheck className="size-4" />}
            text={home.coachGroups.length ? "Tomar asistencia desde el celular" : "Asistencia de cada clase"}
          />
          <Soon icon={<Wallet className="size-4" />} text="Pagos en línea y recibos" />
          <Soon icon={<MessageCircle className="size-4" />} text="Avisos de la escuela" />
        </ul>
        {school.phone && (
          <a
            href={whatsappLink(school.phone)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-mint"
          >
            <MessageCircle className="size-4" /> Escribir a la escuela por WhatsApp
          </a>
        )}
      </Card>
    </div>
  );
}

function Soon({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-2.5 rounded-2xl bg-canvas px-3 py-2.5 text-sm">
      <span className="grid size-8 place-items-center rounded-full bg-brand/10 text-brand">{icon}</span>
      {text}
    </li>
  );
}
