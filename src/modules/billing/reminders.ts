import { and, eq, gte, inArray } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { guardians, invoices, notifications } from "@/db/schema";
import { todayIn, weekdayIndex, type IsoDate } from "@/lib/dates";
import { holidaysBetween } from "@/lib/holidays-co";
import { formatCOP } from "@/lib/money";
import { managerUserIds, notifyUsers } from "@/modules/notifications/notify";
import { balanceOf } from "./ledger";

/**
 * Ley 2300 de 2023 ("Dejen de fregar"), art. 3: los mensajes de cobro solo se envían de lunes a viernes
 * de 7 a. m. a 7 p. m. y los sábados de 8 a. m. a 3 p. m.; nunca domingos ni festivos.
 * Validar el alcance exacto con abogado (#22).
 */
export function collectionHoursAllowed(now: Date, timeZone: string): boolean {
  const today = todayIn(timeZone, now);
  if (holidaysBetween(today, today).has(today)) return false;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now),
  );
  const day = weekdayIndex(today);
  if (day <= 4) return hour >= 7 && hour < 19;
  if (day === 5) return hour >= 8 && hour < 15;
  return false;
}

/** Recordatorios del §8: 2 días antes, el día del vencimiento y +3, +10 y +30 días de mora. */
export const REMINDER_STAGES = [
  { key: "due_soon", offset: -2, overdue: false },
  { key: "due_today", offset: 0, overdue: false },
  { key: "overdue_3", offset: 3, overdue: true },
  { key: "overdue_10", offset: 10, overdue: true },
  { key: "overdue_30", offset: 30, overdue: true },
] as const;
export type ReminderStage = (typeof REMINDER_STAGES)[number];

/** Días entre el vencimiento y hoy (negativo si falta). */
export const daysPastDue = (dueOn: IsoDate, today: IsoDate) =>
  Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueOn}T00:00:00Z`)) / 86_400_000);

/**
 * Etapa que corresponde hoy: la última alcanzada. Los avisos previos solo se envían en su día o el
 * siguiente (no tiene sentido "vence en 2 días" cuando ya venció).
 */
export function reminderStage(dueOn: IsoDate, today: IsoDate): ReminderStage | null {
  const days = daysPastDue(dueOn, today);
  const reached = REMINDER_STAGES.filter((s) => s.offset <= days);
  const stage = reached.at(-1);
  if (!stage) return null;
  if (!stage.overdue && days > stage.offset + 1) return null;
  return stage;
}

/** Máximo un mensaje de cobro por mora a la semana por acudiente (frecuencia de la Ley 2300). */
export const OVERDUE_MESSAGES_PER_WEEK = 1;

function reminderText(stage: ReminderStage, code: string, balance: number, dueOn: IsoDate) {
  const amount = formatCOP(balance);
  switch (stage.key) {
    case "due_soon":
      return {
        title: `Tu cuenta ${code} vence pronto`,
        body: `Saldo ${amount}, vence el ${dueOn}. Puedes pagar desde la app.`,
      };
    case "due_today":
      return {
        title: `Hoy vence tu cuenta ${code}`,
        body: `Saldo ${amount}. Si ya pagaste, ignora este mensaje.`,
      };
    default:
      return {
        title: `Tienes un saldo pendiente de ${amount}`,
        body: `La cuenta ${code} venció el ${dueOn}. Si necesitas un acuerdo de pago, escríbenos.`,
      };
  }
}

/**
 * Tarea diaria (#40): recordatorios de pago respetando horario legal y frecuencia; alerta interna con
 * deudas de más de 60 días. Idempotente por cuenta y etapa.
 */
export async function sendPaymentReminders(
  database: Database,
  school: { id: string; slug: string; timezone: string },
  now: Date,
) {
  if (!collectionHoursAllowed(now, school.timezone)) return 0;
  const today = todayIn(school.timezone, now);
  return runInTenant(database, { schoolId: school.id }, async (tx) => {
    const open = await tx
      .select({ invoice: invoices, userId: guardians.userId, name: guardians.firstName })
      .from(invoices)
      .innerJoin(guardians, eq(guardians.id, invoices.guardianId))
      .where(inArray(invoices.status, ["PENDING", "PARTIAL"]));
    let sent = 0;
    const managers = await managerUserIds(tx);
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const recent = new Set<string>();
    for (const { invoice, userId } of open) {
      const balance = balanceOf(invoice);
      if (balance <= 0) continue;
      if (daysPastDue(invoice.dueOn, today) > 60) {
        await notifyUsers(tx, school.id, managers, {
          kind: "billing.overdue_60",
          title: `Deuda de más de 60 días: ${invoice.code}`,
          body: `Saldo ${formatCOP(balance)} vencido el ${invoice.dueOn}.`,
          href: `/${school.slug}/cobros/cuentas/${invoice.id}`,
          dedupeKey: `billing.overdue_60:${invoice.id}`,
        });
      }
      const stage = reminderStage(invoice.dueOn, today);
      if (!stage || !userId) continue;
      if (stage.overdue) {
        if (recent.has(userId)) continue;
        const [last] = await tx
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.kind, "invoice.overdue_reminder"),
              gte(notifications.createdAt, weekAgo),
            ),
          )
          .limit(OVERDUE_MESSAGES_PER_WEEK);
        if (last) continue;
      }
      const text = reminderText(stage, invoice.code, balance, invoice.dueOn);
      const count = await notifyUsers(tx, school.id, [userId], {
        kind: stage.overdue ? "invoice.overdue_reminder" : "invoice.reminder",
        ...text,
        href: `/${school.slug}/mis-pagos`,
        dedupeKey: `invoice.reminder:${invoice.id}:${stage.key}`,
      });
      if (count && stage.overdue) recent.add(userId);
      sent += count;
    }
    return sent;
  });
}

/** Mensaje para el recordatorio manual por WhatsApp con el link de pago (#40). */
export function whatsappReminder(input: {
  guardianFirstName: string;
  schoolName: string;
  balance: number;
  payUrl: string;
}) {
  return (
    `Hola ${input.guardianFirstName}, te escribimos de ${input.schoolName}. ` +
    `Tienes un saldo pendiente de ${formatCOP(input.balance)}. ` +
    `Puedes ver el detalle y pagar aquí: ${input.payUrl}. Si ya pagaste, por favor ignora este mensaje.`
  );
}

/**
 * Recordatorio manual desde la lista de deudores (ADM-42). Respeta el horario legal y el máximo
 * semanal por acudiente; devuelve cuántos se enviaron y cuántos se omitieron.
 */
export async function sendManualReminders(
  database: Database,
  school: { id: string; slug: string; timezone: string },
  guardianIds: string[],
  now: Date,
) {
  if (!collectionHoursAllowed(now, school.timezone))
    return { sent: 0, skipped: guardianIds.length, outsideHours: true };
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  return runInTenant(database, { schoolId: school.id }, async (tx) => {
    let sent = 0;
    let skipped = 0;
    for (const guardianId of guardianIds) {
      const [guardian] = await tx.select().from(guardians).where(eq(guardians.id, guardianId));
      const open = guardian
        ? await tx
            .select()
            .from(invoices)
            .where(and(eq(invoices.guardianId, guardianId), inArray(invoices.status, ["PENDING", "PARTIAL"])))
        : [];
      const balance = open.reduce((s, i) => s + balanceOf(i), 0);
      if (!guardian?.userId || balance <= 0) {
        skipped++;
        continue;
      }
      const [recent] = await tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, guardian.userId),
            eq(notifications.kind, "invoice.overdue_reminder"),
            gte(notifications.createdAt, weekAgo),
          ),
        )
        .limit(1);
      if (recent) {
        skipped++;
        continue;
      }
      sent += await notifyUsers(tx, school.id, [guardian.userId], {
        kind: "invoice.overdue_reminder",
        title: `Tienes un saldo pendiente de ${formatCOP(balance)}`,
        body: "Puedes ver el detalle y pagar desde la app. Si ya pagaste, ignora este mensaje.",
        href: `/${school.slug}/mis-pagos`,
      });
    }
    return { sent, skipped, outsideHours: false };
  });
}
