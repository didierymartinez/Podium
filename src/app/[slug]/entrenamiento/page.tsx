import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Button, Card, Chip, Input, SectionTitle, Select, buttonClass } from "@/components/ui";
import { db } from "@/db/client";
import { runInTenant } from "@/db/rls";
import { todayIn } from "@/lib/dates";
import { listGroups } from "@/modules/groups/groups";
import { canManagePeople } from "@/modules/schools/permissions";
import { coachGroupIds } from "@/modules/sports/performances";
import { getStructure } from "@/modules/sports/structure";
import { EXERCISE_COMPONENTS } from "@/modules/training/exercise-template";
import { COMPONENT_LABELS, PHASE_LABELS } from "@/modules/training/labels";
import { listExercises, listPlans } from "@/modules/training/training";
import { getSchoolContext } from "../data";
import { ArchiveExerciseButton, NewExerciseForm } from "./exercise-forms";
import { PlanActions } from "./plan-actions";

export const metadata: Metadata = { title: "Entrenamiento" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Biblioteca de ejercicios y planes de sesión (DEP-30 a DEP-32). */
export default async function TrainingPage({ params, searchParams }: PageProps<"/[slug]/entrenamiento">) {
  const { slug } = await params;
  const query = await searchParams;
  const { school, user, roles } = await getSchoolContext(slug);
  const manager = canManagePeople(roles);
  if (!manager && !roles.includes("COACH")) return <NoAccess />;
  const filters = { q: one(query.q), component: one(query.componente), levelId: one(query.nivel) };
  const today = todayIn(school.timezone);
  const [structure, library, plans, allGroups] = await Promise.all([
    getStructure(db, school.id),
    listExercises(db, school.id, user.id, filters),
    listPlans(db, school.id, today),
    listGroups(db, school.id),
  ]);
  const active = allGroups.filter((g) => g.active);
  const myGroups = manager
    ? active
    : await runInTenant(db, { schoolId: school.id }, (tx) => coachGroupIds(tx, user.id)).then((ids) =>
        active.filter((g) => ids.includes(g.id)),
      );
  const disciplines = structure.disciplines.filter((d) => d.active);
  const levels = disciplines.flatMap((d) =>
    d.levels
      .filter((l) => l.active)
      .map((l) => ({ id: l.id, name: disciplines.length > 1 ? `${d.name} · ${l.name}` : l.name })),
  );
  const levelName = new Map(levels.map((l) => [l.id, l.name]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Entrenamiento"
        subtitle="Biblioteca de ejercicios, planes de sesión y plantillas"
        actions={
          <Link href={`/${slug}/entrenamiento/planes/nuevo`} className={buttonClass("primary", "h-10")}>
            <Plus className="size-4" /> Nuevo plan
          </Link>
        }
      />
      <Card>
        <SectionTitle>Planes y plantillas</SectionTitle>
        <ul className="divide-y divide-line" aria-label="Planes de sesión">
          {plans.map((p) => (
            <li key={p.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/${slug}/entrenamiento/planes/${p.id}`}
                  className="font-semibold hover:text-brand"
                >
                  {p.name}
                </Link>
                {p.isTemplate && <Chip tone="violet">Plantilla</Chip>}
                <span className="text-sm text-ink-soft">
                  {p.minutes} min · {p.items.length} ejercicios
                </span>
              </div>
              {p.objective && <p className="text-sm text-ink-soft">{p.objective}</p>}
              <p className="text-xs text-ink-soft">
                {(["WARMUP", "MAIN", "COOLDOWN"] as const)
                  .map((phase) => {
                    const items = p.items.filter((i) => i.phase === phase);
                    return items.length
                      ? `${PHASE_LABELS[phase]}: ${items.map((i) => i.title).join(", ")}`
                      : "";
                  })
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <PlanActions
                slug={slug}
                plan={{ id: p.id, name: p.name }}
                today={today}
                groups={myGroups.map((g) => ({ id: g.id, name: g.name }))}
                upcoming={p.upcoming.map((a) => ({ id: a.id, date: a.date, groupName: a.groupName }))}
              />
            </li>
          ))}
          {plans.length === 0 && (
            <li className="py-2 text-sm text-ink-soft">
              Aún no hay planes. Crea el primero desde la biblioteca.
            </li>
          )}
        </ul>
      </Card>

      <Card>
        <SectionTitle>Biblioteca de ejercicios</SectionTitle>
        <form className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" role="search">
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="Buscar ejercicio"
            aria-label="Buscar ejercicio"
          />
          <Select name="componente" defaultValue={filters.component} aria-label="Componente">
            <option value="">Todos los componentes</option>
            {EXERCISE_COMPONENTS.map((c) => (
              <option key={c} value={c}>
                {COMPONENT_LABELS[c]}
              </option>
            ))}
          </Select>
          <Select name="nivel" defaultValue={filters.levelId} aria-label="Nivel">
            <option value="">Todos los niveles</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>
        <ul className="divide-y divide-line" aria-label="Ejercicios">
          {library.map((e) => (
            <li key={e.id} className="py-2">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="font-semibold">{e.name}</span>
                  <Chip>{COMPONENT_LABELS[e.component]}</Chip>
                  {!e.shared && <Chip tone="violet">Personal</Chip>}
                  <span className="text-sm text-ink-soft">{e.minutes} min</span>
                </summary>
                <div className="mt-2 space-y-1 text-sm">
                  {e.description && <p>{e.description}</p>}
                  <p className="text-ink-soft">
                    {[
                      e.materials && `Materiales: ${e.materials}`,
                      e.space && `Espacio: ${e.space}`,
                      e.levelIds.length
                        ? `Niveles: ${e.levelIds
                            .map((id) => levelName.get(id) ?? "")
                            .filter(Boolean)
                            .join(", ")}`
                        : "Todos los niveles",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {e.mediaUrl && (
                    <a
                      href={e.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-brand"
                    >
                      Ver video o foto
                    </a>
                  )}
                  {(manager || e.ownerUserId === user.id) && (
                    <ArchiveExerciseButton slug={slug} exerciseId={e.id} name={e.name} />
                  )}
                </div>
              </details>
            </li>
          ))}
          {library.length === 0 && (
            <li className="py-2 text-sm text-ink-soft">No hay ejercicios con ese filtro.</li>
          )}
        </ul>
        <NewExerciseForm
          slug={slug}
          disciplines={disciplines.map((d) => ({ id: d.id, name: d.name }))}
          levels={levels}
        />
      </Card>
    </div>
  );
}
