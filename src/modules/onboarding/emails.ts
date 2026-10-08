import { eq } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { emailLog, schools, users } from "@/db/schema";
import type { Mailer } from "@/lib/mailer/types";
import { emailLayout, PODIUM_BRAND } from "@/lib/mailer/templates";
import { getSetupSteps } from "@/modules/schools/setup-status";

/** Correo de bienvenida al crear la escuela (#16). */
export function welcomeEmail(input: {
  ownerName: string;
  schoolName: string;
  url: string;
  trialDays: number;
}) {
  const first = input.ownerName.split(" ")[0];
  return {
    subject: `¡Bienvenido(a) a Podium, ${first}!`,
    ...emailLayout({
      brand: PODIUM_BRAND,
      title: `${input.schoolName} ya está en Podium`,
      paragraphs: [
        `Hola ${first}, tu escuela quedó creada y tienes ${input.trialDays} días de prueba con todas las funciones, sin tarjeta.`,
        "Te recomendamos este orden: crea tus tarifas, arma los grupos con sus horarios, registra a tus profesores y carga a tus alumnos.",
        "Cuando estés listo, activa las comunicaciones para invitar a las familias y empezar a cobrar.",
      ],
      cta: { label: "Ir a mi escuela", href: input.url },
      footer: "Recibes este correo porque creaste una escuela en Podium.",
    }),
  };
}

/** Secuencia de acompañamiento durante la prueba (ONBOARDING §[5]). */
export const TRIAL_EMAIL_DAYS = [1, 3, 7, 20, 27] as const;

function trialEmail(day: number, name: string, pending: string[], url: string) {
  const todo = pending.length
    ? `Te falta: ${pending.join(", ")}.`
    : "Ya completaste la configuración. ¡Bien hecho!";
  const copy: Record<number, { title: string; lines: string[] }> = {
    1: {
      title: "Arranquemos: tu escuela en 15 minutos",
      lines: ["Empieza por las tarifas y los grupos: con eso el tablero ya muestra tus clases.", todo],
    },
    3: {
      title: "¿Ya tomaste asistencia desde el celular?",
      lines: ["Invita a tus profesores: toman asistencia en segundos, incluso sin señal en la pista.", todo],
    },
    7: {
      title: "Una semana con Podium",
      lines: [
        "Conecta tu cuenta Wompi para que las familias paguen con PSE, tarjeta o Nequi y el dinero llegue directo a tu escuela.",
        todo,
      ],
    },
    20: {
      title: "Quedan 10 días de prueba",
      lines: ["Activa las comunicaciones para invitar a las familias y generar las mensualidades.", todo],
    },
    27: {
      title: "Tu prueba termina en 3 días",
      lines: ["Elige un plan para seguir sin interrupciones. Tus datos se conservan.", todo],
    },
  };
  const c = copy[day];
  return {
    subject: c.title,
    ...emailLayout({
      brand: PODIUM_BRAND,
      title: c.title,
      paragraphs: [`Hola ${name.split(" ")[0]},`, ...c.lines],
      cta: { label: "Abrir mi escuela", href: url },
    }),
  };
}

/** Tarea diaria: envía el correo de la secuencia que corresponda (una vez por escuela y día). */
export async function sendTrialEmails(
  database: Database,
  mailer: Mailer,
  school: { id: string; slug: string },
  now: Date,
  appUrl: string,
) {
  const data = await runInTenant(database, { schoolId: school.id }, async (tx) => {
    const [row] = await tx
      .select({ school: schools, ownerEmail: users.email, ownerName: users.name })
      .from(schools)
      .innerJoin(users, eq(users.id, schools.ownerUserId))
      .where(eq(schools.id, school.id));
    return row;
  });
  if (!data || data.school.status !== "TRIAL") return 0;
  const day = Math.floor((now.getTime() - data.school.createdAt.getTime()) / 86_400_000);
  if (!(TRIAL_EMAIL_DAYS as readonly number[]).includes(day)) return 0;
  const key = `trial:${school.id}:${day}`;
  const claimed = await runInTenant(database, {}, (tx) =>
    tx.insert(emailLog).values({ key }).onConflictDoNothing().returning({ key: emailLog.key }),
  );
  if (claimed.length === 0) return 0;
  const pending = (await getSetupSteps(database, data.school))
    .filter((s) => !s.done)
    .map((s) => s.title.toLowerCase());
  const mail = trialEmail(day, data.ownerName, pending, `${appUrl}/${school.slug}`);
  const sent = await mailer.send({ to: data.ownerEmail, ...mail });
  if (!sent.ok) await runInTenant(database, {}, (tx) => tx.delete(emailLog).where(eq(emailLog.key, key)));
  return sent.ok ? 1 : 0;
}
