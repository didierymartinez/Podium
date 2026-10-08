import { CalendarDays, Clock, Layers, Sparkles, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, Chip, SectionTitle, Tile, buttonClass } from "@/components/ui";
import { WeekBoard } from "@/components/week-board";
import { db } from "@/db/client";
import { formatLongDate, isoDateOf, todayIn } from "@/lib/dates";
import { nextGenerationDate } from "@/modules/billing/schedule";
import { readBillingPolicy } from "@/modules/billing/policy";
import { listGroups } from "@/modules/groups/groups";
import { shortTimeRange } from "@/modules/groups/schedule";
import { getSportsStructure } from "@/modules/schools/queries";
import { getSetupSteps } from "@/modules/schools/setup-status";
import { trialDaysLeft } from "@/modules/schools/trial";
import { getSchoolContext } from "./data";

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { school } = await getSchoolContext(slug);
  return { title: school.name };
}

export default async function SchoolHomePage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const { school, user } = await getSchoolContext(slug);
  const [structure, steps, allGroups] = await Promise.all([
    getSportsStructure(db, school.id),
    getSetupSteps(db, school),
    listGroups(db, school.id),
  ]);
  const activeGroups = allGroups.filter((g) => g.active);
  const billing = readBillingPolicy(school.settings.billing);

  const today = todayIn(school.timezone);
  const done = steps.filter((s) => s.done).length;
  const progress = Math.round((done / steps.length) * 100);
  const mainDiscipline = structure.disciplines[0];
  const trialEnd = school.trialEndsAt ? isoDateOf(school.trialEndsAt, school.timezone) : null;
  const daysLeft = school.trialEndsAt ? trialDaysLeft(school.trialEndsAt, new Date()) : null;
  const firstBilling = nextGenerationDate(today, billing.generationDay);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1 pt-2">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Hola, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-ink-soft">Así va {school.name}.</p>
        </div>
        <span className={buttonClass("secondary", "h-10 cursor-default")}>
          <CalendarDays className="size-4" /> {formatLongDate(today)}
        </span>
      </div>

      <Card className="p-4 sm:p-6">
        <SectionTitle
          action={
            activeGroups.length > 0 ? (
              <Link href={`/${school.slug}/grupos`} className={buttonClass("secondary", "h-9 px-4")}>
                Ver grupos
              </Link>
            ) : (
              <Chip tone="brand" dot>
                Patinaje {mainDiscipline?.name.toLowerCase()}
              </Chip>
            )
          }
        >
          Semana en la pista
        </SectionTitle>
        {activeGroups.length > 0 ? (
          <WeekBoard
            today={today}
            rowLabel="Grupo"
            rows={activeGroups.map((group) => ({
              id: group.id,
              title: group.name,
              subtitle: `${group.levelName ?? "Varios niveles"} · ${group.enrolled}/${group.capacity}`,
              avatar: (
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: group.color }}
                  aria-hidden
                />
              ),
              events: group.schedule.map((slot) => ({
                weekday: slot.weekday,
                color: group.color,
                label: shortTimeRange(slot.startTime, slot.endTime),
              })),
            }))}
          />
        ) : (
          <WeekBoard
            today={today}
            rows={(mainDiscipline?.levels ?? []).map((level) => ({
              id: level.id,
              title: level.name,
              subtitle: level.goal ?? undefined,
              avatar: (
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-bold text-brand">
                  {level.position}
                </span>
              ),
            }))}
            overlay={
              <div className="pointer-events-auto max-w-xs rounded-3xl border border-white/80 bg-glass p-5 text-center shadow-soft backdrop-blur-md dark:border-line">
                <span className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-brand/10 text-brand">
                  <Layers className="size-5" />
                </span>
                <p className="font-semibold">Aquí verás tus clases y la asistencia</p>
                <p className="mt-1 text-sm text-ink-soft">
                  Crea tus grupos y horarios para llenar el tablero.
                </p>
                <Link href={`/${school.slug}/grupos/nuevo`} className={buttonClass("primary", "mt-4 h-10")}>
                  Crear grupo
                </Link>
              </div>
            }
          />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle action={<Chip tone="brand">{progress} %</Chip>}>Configura tu escuela</SectionTitle>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {steps.map((step) => {
              const tile = (
                <Tile
                  className={
                    step.href && !step.done
                      ? "h-full p-3 transition hover:border-brand/40 hover:bg-brand/5"
                      : "h-full p-3"
                  }
                >
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">{step.detail}</p>
                  <Chip tone={step.done ? "mint" : step.href ? "brand" : "neutral"} dot className="mt-2">
                    {step.done ? "Hecho" : step.href ? "Configurar" : "Próximamente"}
                  </Chip>
                </Tile>
              );
              return step.href ? (
                <Link key={step.key} href={step.href} className="block">
                  {tile}
                </Link>
              ) : (
                <div key={step.key}>{tile}</div>
              );
            })}
          </div>
        </Card>

        <Card>
          <SectionTitle>Próximos eventos</SectionTitle>
          <div className="space-y-3">
            {trialEnd && (
              <div className="rounded-2xl bg-sun p-4 text-[#1f1a05] shadow-pill">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">Fin de la prueba gratis</p>
                  {daysLeft !== null && (
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold">
                      En {daysLeft} {daysLeft === 1 ? "día" : "días"}
                    </span>
                  )}
                </div>
                <p className="text-sm opacity-80">Elige un plan para seguir sin interrupciones.</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5">
                    <CalendarDays className="size-3.5" /> {formatLongDate(trialEnd)}
                  </span>
                </div>
              </div>
            )}
            <Tile>
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-violet/12 text-violet">
                  <Wallet className="size-4" />
                </span>
                <div>
                  <p className="font-semibold">Generación de mensualidades</p>
                  <p className="text-sm text-ink-soft">
                    Día {billing.generationDay} de cada mes, vencen el día {billing.dueDay}.
                  </p>
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-soft">
                    <Clock className="size-3.5" /> Próxima: {formatLongDate(firstBilling)}
                  </span>
                </div>
              </div>
            </Tile>
          </div>
        </Card>

        <Card>
          <SectionTitle action={<Sparkles className="size-4 text-violet" />}>
            Categorías por edad
          </SectionTitle>
          <p className="-mt-2 mb-4 text-xs text-ink-soft">
            Ejemplo inicial: ajústalo al reglamento de tu liga.
          </p>
          <ul className="grid grid-cols-2 gap-2.5">
            {structure.ageCategories.map((c) => (
              <li key={c.id}>
                <Tile className="p-3">
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="text-xs text-ink-soft">
                    {c.minAge === null
                      ? `Hasta ${c.maxAge}`
                      : c.maxAge === null
                        ? `${c.minAge} o más`
                        : `${c.minAge} a ${c.maxAge}`}{" "}
                    años
                  </p>
                </Tile>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
