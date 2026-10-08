import { count, eq, inArray } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { coaches, enrollments, feePlans, groups, paymentAccounts, type schools } from "@/db/schema";

export type SetupStep = { key: string; title: string; detail: string; done: boolean; href?: string };

/** Pasos de configuración de la escuela con su estado real (ver docs/ONBOARDING_ESCUELAS.md §[4]). */
export async function getSetupSteps(
  database: Database,
  school: typeof schools.$inferSelect,
): Promise<SetupStep[]> {
  const { activePlans, activeGroups, activeEnrollments, activeCoaches, paymentsConnected } =
    await runInTenant(database, { schoolId: school.id }, async (tx) => {
      const [[plansCount], [groupsCount], [enrollmentsCount], [coachesCount], accounts] = await Promise.all([
        tx.select({ value: count() }).from(feePlans).where(eq(feePlans.active, true)),
        tx.select({ value: count() }).from(groups).where(eq(groups.active, true)),
        tx
          .select({ value: count() })
          .from(enrollments)
          .where(inArray(enrollments.status, ["ACTIVE", "PRE_ENROLLED"])),
        tx.select({ value: count() }).from(coaches).where(eq(coaches.active, true)),
        tx.select({ id: paymentAccounts.id }).from(paymentAccounts),
      ]);
      return {
        activePlans: plansCount.value,
        activeGroups: groupsCount.value,
        activeEnrollments: enrollmentsCount.value,
        activeCoaches: coachesCount.value,
        paymentsConnected: accounts.length > 0,
      };
    });
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
    {
      key: "groups",
      title: "Grupos y horarios",
      detail: "Niveles, cupos y días",
      done: activeGroups > 0,
      href: `/${school.slug}/grupos`,
    },
    {
      key: "coaches",
      title: "Profesores",
      detail: "Registrar e invitar al equipo",
      done: activeCoaches > 0,
      href: `/${school.slug}/profesores`,
    },
    {
      key: "athletes",
      title: "Alumnos",
      detail: "Con acudiente y matrícula",
      done: activeEnrollments > 0,
      href: `/${school.slug}/alumnos/nuevo`,
    },
    {
      key: "payments",
      title: "Pagos en línea",
      detail: "Conectar Wompi",
      done: paymentsConnected,
      href: `${base}/cobros`,
    },
    {
      key: "comms",
      title: "Comunicaciones",
      detail: "Invitar familias y empezar a cobrar",
      done: Boolean(school.commsEnabledAt),
      href: `${base}/comunicaciones`,
    },
  ];
}
