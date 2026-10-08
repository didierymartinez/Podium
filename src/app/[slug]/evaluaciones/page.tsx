import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Card, Chip, SectionTitle, cn } from "@/components/ui";
import { db } from "@/db/client";
import { runInTenant } from "@/db/rls";
import { todayIn } from "@/lib/dates";
import { listGroups } from "@/modules/groups/groups";
import { canManagePeople } from "@/modules/schools/permissions";
import { EVALUATION_STATUS, formatAverage } from "@/modules/sports/evaluation-labels";
import { evaluationForm, pendingPromotions, recentEvaluations } from "@/modules/sports/evaluations";
import { coachGroupIds, groupAthletes } from "@/modules/sports/performances";
import { getSchoolContext } from "../data";
import { EvaluationForm } from "./evaluation-form";
import { PromotionReview } from "./promotion-review";

export const metadata: Metadata = { title: "Evaluaciones" };

const pill = (active: boolean) =>
  cn(
    "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition",
    active ? "bg-brand text-white" : "bg-muted text-ink-soft hover:bg-line",
  );

/** Evaluaciones técnicas por rúbrica y promoción de nivel (DEP-40 a DEP-44). */
export default async function EvaluationsPage({ params, searchParams }: PageProps<"/[slug]/evaluaciones">) {
  const { slug } = await params;
  const query = await searchParams;
  const { school, user, roles } = await getSchoolContext(slug);
  const manager = canManagePeople(roles);
  if (!manager && !roles.includes("COACH")) return <NoAccess />;
  const all = (await listGroups(db, school.id)).filter((g) => g.active);
  const mine = manager
    ? all
    : await runInTenant(db, { schoolId: school.id }, (tx) => coachGroupIds(tx, user.id)).then((ids) =>
        all.filter((g) => ids.includes(g.id)),
      );
  const group = mine.find((g) => g.id === query.grupo) ?? mine[0];
  const roster = group ? await groupAthletes(db, school.id, group.id) : [];
  const selected = roster.find((a) => a.id === query.alumno);
  const coachAthletes = manager
    ? null
    : (await Promise.all(mine.map((g) => groupAthletes(db, school.id, g.id)))).flat().map((a) => a.id);
  const [form, pending, recent] = await Promise.all([
    selected ? evaluationForm(db, school.id, selected.id) : null,
    manager ? pendingPromotions(db, school.id) : [],
    recentEvaluations(db, school.id, coachAthletes),
  ]);
  const href = (params: Record<string, string>) => `/${slug}/evaluaciones?${new URLSearchParams(params)}`;

  return (
    <div className="space-y-4">
      <PageHeader title="Evaluaciones" subtitle="Rúbrica por nivel, informe a la familia y promoción" />
      {manager && (
        <Card>
          <SectionTitle>Propuestas de promoción</SectionTitle>
          <PromotionReview
            slug={slug}
            proposals={pending.map((p) => ({
              evaluationId: p.evaluation.id,
              athleteId: p.evaluation.athleteId,
              name: `${p.firstName} ${p.lastName}`,
              levelName: p.levelName,
              nextLevelName: p.next?.name ?? null,
              average: p.evaluation.average,
              evaluatedOn: p.evaluation.evaluatedOn,
            }))}
          />
        </Card>
      )}
      <Card>
        <SectionTitle>Evaluar</SectionTitle>
        {mine.length === 0 ? (
          <p className="text-sm text-ink-soft">No tienes grupos activos para evaluar.</p>
        ) : (
          <div className="space-y-4">
            <nav className="flex flex-wrap gap-2" aria-label="Grupos">
              {mine.map((g) => (
                <Link key={g.id} href={href({ grupo: g.id })} className={pill(g.id === group?.id)}>
                  {g.name}
                </Link>
              ))}
            </nav>
            <nav className="flex flex-wrap gap-2" aria-label="Alumnos del grupo">
              {roster.map((a) => (
                <Link
                  key={a.id}
                  href={href({ grupo: group!.id, alumno: a.id })}
                  className={pill(a.id === selected?.id)}
                >
                  {a.firstName} {a.lastName}
                </Link>
              ))}
              {roster.length === 0 && <p className="text-sm text-ink-soft">El grupo no tiene alumnos.</p>}
            </nav>
            {selected && !form && (
              <p className="text-sm text-ink-soft">
                {selected.firstName} no tiene nivel: asigna un nivel al grupo para poder evaluarlo.
              </p>
            )}
            {selected && form && form.criteria.length === 0 && (
              <p className="text-sm text-ink-soft">
                El nivel {form.level.name} no tiene criterios de evaluación. Agrégalos en Configuración ·
                Deportivo.
              </p>
            )}
            {selected && form && form.criteria.length > 0 && (
              <EvaluationForm
                key={selected.id}
                slug={slug}
                today={todayIn(school.timezone)}
                athlete={{ id: selected.id, name: `${selected.firstName} ${selected.lastName}` }}
                levelName={form.level.name}
                criteria={form.criteria.map((c) => ({ id: c.id, name: c.name }))}
              />
            )}
            {!selected && roster.length > 0 && (
              <p className="text-sm text-ink-soft">Elige un alumno para evaluarlo.</p>
            )}
          </div>
        )}
      </Card>
      <Card>
        <SectionTitle>Últimas evaluaciones</SectionTitle>
        <ul className="divide-y divide-line text-sm" aria-label="Últimas evaluaciones">
          {recent.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 py-1.5">
              <span className="flex-1">
                {e.firstName} {e.lastName} · {e.levelName}
              </span>
              <span className="text-ink-soft">{e.evaluatedOn}</span>
              <span className="font-semibold tabular-nums">{formatAverage(e.average)}</span>
              <Chip tone={EVALUATION_STATUS[e.status].tone}>{EVALUATION_STATUS[e.status].label}</Chip>
            </li>
          ))}
          {recent.length === 0 && <li className="py-2 text-ink-soft">Aún no hay evaluaciones.</li>}
        </ul>
      </Card>
    </div>
  );
}
