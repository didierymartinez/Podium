import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { db } from "@/db/client";
import { getSportsStructure } from "@/modules/schools/queries";
import { getSchoolContext } from "./data";

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { school } = await getSchoolContext(slug);
  return { title: school.name };
}

const SETUP_STEPS = [
  { title: "Crear la escuela", done: true },
  { title: "Perfil: logo, colores y contacto", done: false },
  { title: "Cobros: tarifas, días de corte y mora", done: false },
  { title: "Grupos y horarios", done: false },
  { title: "Invitar profesores", done: false },
  { title: "Cargar alumnos (uno a uno o desde Excel)", done: false },
  { title: "Conectar pagos en línea (Wompi)", done: false },
  { title: "Invitar acudientes y empezar a facturar", done: false },
];

export default async function SchoolHomePage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const { school, user } = await getSchoolContext(slug);
  const structure = await getSportsStructure(db, school.id);
  const done = SETUP_STEPS.filter((s) => s.done).length;
  const progress = Math.round((done / SETUP_STEPS.length) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {user.name.split(" ")[0]} 👋</h1>
        <p className="text-sm text-ink-soft">Configura {school.name} para empezar a operar.</p>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-semibold">Tu escuela está {progress} % lista</h2>
          <span className="text-sm text-ink-soft">
            {done} de {SETUP_STEPS.length}
          </span>
        </div>
        <div className="mb-5 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
        </div>
        <ol className="space-y-2">
          {SETUP_STEPS.map((step) => (
            <li key={step.title} className="flex items-center gap-3 text-sm">
              <span
                className={
                  step.done
                    ? "grid size-6 shrink-0 place-items-center rounded-full bg-ok text-white"
                    : "grid size-6 shrink-0 place-items-center rounded-full border border-line text-ink-faint"
                }
                aria-hidden
              >
                {step.done ? "✓" : ""}
              </span>
              <span className={step.done ? "text-ink-soft line-through" : ""}>{step.title}</span>
              {!step.done && <span className="ml-auto shrink-0 text-xs text-ink-faint">Próximamente</span>}
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {structure.disciplines.map((discipline) => (
          <Card key={discipline.id}>
            <h2 className="font-semibold">Niveles · Patinaje {discipline.name.toLowerCase()}</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {discipline.levels.map((level) => (
                <li key={level.id} className="flex gap-3">
                  <span className="w-5 text-ink-faint">{level.position}.</span>
                  <span>
                    <strong>{level.name}</strong> <span className="text-ink-soft">— {level.goal}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
        <Card>
          <h2 className="font-semibold">Categorías por edad</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Ejemplo inicial: ajústalo al reglamento vigente de tu liga.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {structure.ageCategories.map((c) => (
              <li key={c.id} className="rounded-lg bg-muted px-3 py-2">
                <strong>{c.name}</strong>{" "}
                <span className="text-ink-soft">
                  {c.minAge === null
                    ? `≤ ${c.maxAge}`
                    : c.maxAge === null
                      ? `${c.minAge}+`
                      : `${c.minAge}–${c.maxAge}`}{" "}
                  años
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
