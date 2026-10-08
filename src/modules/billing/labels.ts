/** Etiquetas y enlaces de cobros sin dependencias de servidor (también para el navegador). */
export const INVOICE_STATUS = {
  PENDING: { label: "Pendiente", tone: "sun" },
  PARTIAL: { label: "Abono parcial", tone: "violet" },
  PAID: { label: "Pagada", tone: "mint" },
  VOID: { label: "Anulada", tone: "neutral" },
} as const;

export const METHOD_LABELS = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  DEPOSIT: "Consignación",
  CARD: "Datáfono",
  ONLINE: "En línea",
} as const;

export const pdfHref = (slug: string, kind: "cuenta" | "recibo" | "estado" | "paz-y-salvo", id: string) =>
  `/api/pdf/${kind}/${id}?escuela=${encodeURIComponent(slug)}`;

/** Categorías de egresos (ADM-52). */
export const EXPENSE_CATEGORY_LABELS = {
  PAYROLL: "Nómina y honorarios",
  VENUE: "Arriendo de pista",
  EQUIPMENT: "Implementos",
  TRANSPORT: "Transporte",
  SERVICES: "Servicios",
  COMPETITIONS: "Competencias",
  OTHER: "Otros",
} as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORY_LABELS;
