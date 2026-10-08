import { CalendarOff, ChevronLeft, ChevronRight, Clock, PartyPopper, Plus, UserRoundCog } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Card, buttonClass, cn } from "@/components/ui";
import { db } from "@/db/client";
import {
  addDays,
  dateRange,
  formatDayNumber,
  formatDayTitle,
  formatWeekdayShort,
  isIsoDate,
  startOfWeek,
  todayIn,
} from "@/lib/dates";
import { holidaysBetween } from "@/lib/holidays-co";
import { closureOn, listClosures } from "@/modules/calendar/closures";
import { listSessions, type SessionItem } from "@/modules/attendance/sessions";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../data";
import { listVenues } from "@/modules/schools/venues";
import { SessionStatusChip } from "./status-chip";
import { CachePages } from "@/components/pwa";
import { ensureSessions } from "./sync";

export const metadata: Metadata = { title: "Asistencia" };

export default async function AttendanceDayPage({ params, searchParams }: PageProps<"/[slug]/asistencia">) {
  const { slug } = await params;
  const { fecha, sede } = await searchParams;
  const { school, user, roles } = await getSchoolContext(slug);
  const manager = canManagePeople(roles);
  if (!manager && !roles.includes("COACH")) return <NoAccess />;

  const today = todayIn(school.timezone);
  const date = isIsoDate(fecha) ? fecha : today;
  const week = dateRange(startOfWeek(date), 7);
  await ensureSessions(school.id, school.timezone);
  const venues = (await listVenues(db, school.id)).filter((v) => v.active);
  const venueId = venues.length > 1 && venues.some((v) => v.id === sede) ? (sede as string) : undefined;
  const [items, closures] = await Promise.all([
    listSessions(
      db,
      school.id,
      { from: date, to: date },
      { ...(manager ? {} : { coachUserId: user.id }), venueId },
    ),
    listClosures(db, school.id, date, date),
  ]);
  const holiday = holidaysBetween(date, date).get(date);
  const closure = closureOn(date, closures);
  const weekHolidays = holidaysBetween(week[0], week[6]);
  const href = (d: string, v = venueId) => `/${slug}/asistencia?fecha=${d}${v ? `&sede=${v}` : ""}`;
  const title = formatDayTitle(date);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Asistencia"
        subtitle={
          <span className="capitalize">
            {title}
            {date === today && " · hoy"}
          </span>
        }
        actions={
          <>
            {date !== today && (
              <Link href={href(today)} className={buttonClass("secondary", "h-10")}>
                Ir a hoy
              </Link>
            )}
            {manager && (
              <Link
                href={`/${slug}/asistencia/nueva?fecha=${date}`}
                className={buttonClass("secondary", "h-10")}
              >
                <Plus className="size-4" /> Clase extra
              </Link>
            )}
          </>
        }
      />

      {venues.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label="Sedes">
          {[{ id: "", name: "Todas las sedes" }, ...venues].map((v) => (
            <Link
              key={v.id}
              href={href(date, v.id || undefined)}
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

      <Card className="p-3 sm:p-4">
        <nav className="flex items-center gap-1.5" aria-label="Días de la semana">
          <Link
            href={href(addDays(week[0], -7))}
            className={buttonClass("ghost", "size-10 shrink-0 p-0")}
            aria-label="Semana anterior"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <div className="grid flex-1 grid-cols-7 gap-1">
            {week.map((d) => (
              <Link
                key={d}
                href={href(d)}
                aria-current={d === date ? "date" : undefined}
                title={weekHolidays.get(d)}
                className={cn(
                  "relative rounded-xl px-1 py-1.5 text-center text-[11px] leading-tight transition",
                  d === date
                    ? "bg-brand text-white shadow-pill"
                    : "border border-line bg-surface text-ink-soft hover:border-brand/40",
                )}
              >
                <span className="block capitalize">{formatWeekdayShort(d)}</span>
                <span className={cn("block text-sm font-semibold", d !== date && "text-ink")}>
                  {formatDayNumber(d)}
                </span>
                {weekHolidays.has(d) && (
                  <span
                    className="absolute right-1 top-1 size-1.5 rounded-full bg-sun"
                    aria-label="Festivo"
                  />
                )}
                {d === today && d !== date && (
                  <span className="absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-brand" aria-hidden />
                )}
              </Link>
            ))}
          </div>
          <Link
            href={href(addDays(week[0], 7))}
            className={buttonClass("ghost", "size-10 shrink-0 p-0")}
            aria-label="Semana siguiente"
          >
            <ChevronRight className="size-4" />
          </Link>
        </nav>
      </Card>

      {closure && (
        <div className="hatch flex items-center gap-3 rounded-2xl bg-muted px-4 py-3 text-sm">
          <CalendarOff className="size-4 shrink-0" />
          <span>
            <strong>Día sin clase:</strong> {closure.reason}
          </span>
        </div>
      )}
      {holiday && !closure && (
        <div className="flex items-center gap-3 rounded-2xl bg-sun/30 px-4 py-3 text-sm">
          <PartyPopper className="size-4 shrink-0" />
          <span>
            <strong>Festivo: {holiday}.</strong> Es solo referencia: las clases se mantienen salvo que las
            canceles.
          </span>
        </div>
      )}

      <CachePages urls={[`/${slug}/asistencia`, ...items.map((s) => `/${slug}/asistencia/${s.id}`)]} />
      {items.length === 0 ? (
        <Card className="text-center">
          <p className="font-semibold">No hay clases este día</p>
          <p className="mt-1 text-sm text-ink-soft">
            {manager ? "Las clases salen del horario de cada grupo." : "Aquí verás las clases de tus grupos."}
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" aria-label="Clases del día">
          {items.map((s) => (
            <li key={s.id}>
              <SessionCard slug={slug} session={s} today={today} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionCard({ slug, session, today }: { slug: string; session: SessionItem; today: string }) {
  const canceled = session.status === "CANCELED";
  return (
    <Link
      href={`/${slug}/asistencia/${session.id}`}
      className={cn(
        "flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 shadow-soft transition hover:border-brand/40",
        canceled && "opacity-70",
      )}
    >
      <span
        className="h-12 w-1.5 shrink-0 rounded-full"
        style={{ background: session.groupColor }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-lg font-semibold", canceled && "line-through")}>
          {session.groupName}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" /> {session.startTime} – {session.endTime}
          </span>
          {session.source === "EXTRA" && <span className="font-semibold text-violet">Extra</span>}
          {session.substitute && (
            <span className="inline-flex items-center gap-1 font-semibold text-violet">
              <UserRoundCog className="size-3.5" /> Sustituto
            </span>
          )}
        </p>
        {session.note && <p className="truncate text-xs text-ink-soft">{session.note}</p>}
      </div>
      <SessionStatusChip session={session} today={today} />
    </Link>
  );
}
