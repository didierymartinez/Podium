import { and, count, eq } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { feePlans, type schools } from "@/db/schema";

export type SetupStep = { key: string; title: string; detail: string; done: boolean; href?: string };

/** Pasos de configuración de la escuela con su estado real (ver docs/ONBOARDING_ESCUELAS.md §[4]). */
export async function getSetupSteps(
  database: Database,
  school: typeof schools.$inferSelect,
): Promise<SetupStep[]> {
  const [{ value: activePlans }] = await runInTenant(database, { schoolId: school.id }, (tx) =>
    tx
      .select({ value: count() })
      .from(feePlans)
      .where(and(eq(feePlans.schoolId, school.id), eq(feePlans.active, true))),
  );
  const base = `/${school.slug}/configuracion`;

  return [
    { key: "school", title: "Crear la escuela", detail: "Listo", done: true },
    {
      key: "profile",
      title: "Perfil",
      detail: "Documento, contacto y color",
      done: Boolean(school.documentNumber && school.phone),
      href: base,
    },
    {
      key: "billing",
      title: "Cobros",
      detail: "Tarifas, corte y mora",
      done: activePlans > 0,
      href: `${base}/cobros`,
    },
    { key: "groups", title: "Grupos y horarios", detail: "Niveles, cupos y profesores", done: false },
    { key: "coaches", title: "Profesores", detail: "Invitar al equipo", done: false },
    { key: "athletes", title: "Alumnos", detail: "Uno a uno o desde Excel", done: false },
    { key: "payments", title: "Pagos en línea", detail: "Conectar Wompi", done: false },
    { key: "guardians", title: "Acudientes", detail: "Invitar y empezar a facturar", done: false },
  ];
}
