import { addDays, type IsoDate } from "@/lib/dates";

/** Días antes del vencimiento en que se avisa (ADM-17). */
export const EXPIRY_WARNING_DAYS = 30;

export type DocumentStatus = "missing" | "valid" | "expiring" | "expired" | "optional";

/** Fecha de vencimiento: expedición + meses de vigencia (fin de mes si el día no existe). */
export function expiresOnFor(issuedOn: IsoDate, validityMonths: number | null): IsoDate | null {
  if (!validityMonths) return null;
  const [y, m, d] = issuedOn.split("-").map(Number);
  const total = m - 1 + validityMonths;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

export function documentStatus(
  doc: { expiresOn: IsoDate | null } | null | undefined,
  required: boolean,
  today: IsoDate,
): DocumentStatus {
  if (!doc) return required ? "missing" : "optional";
  if (!doc.expiresOn) return "valid";
  if (doc.expiresOn < today) return "expired";
  if (doc.expiresOn <= addDays(today, EXPIRY_WARNING_DAYS)) return "expiring";
  return "valid";
}

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  missing: "Pendiente",
  valid: "Recibido",
  expiring: "Por vencer",
  expired: "Vencido",
  optional: "Opcional",
};

/** Requiere atención: falta un obligatorio, está vencido o vence pronto. */
export const needsAttention = (status: DocumentStatus) =>
  status === "missing" || status === "expired" || status === "expiring";
