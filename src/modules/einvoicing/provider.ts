/** Proveedor de facturación electrónica de la escuela (ADM-26): Alegra hoy; Siigo o Facturatech después. */
export type EInvoiceCredentials = { username: string; token: string; itemId: string };

export type EInvoiceCustomer = {
  name: string;
  /** Tipos DIAN: CC, CE, NIT, TI, RC, PP; consumidor final sin documento. */
  idType: "CC" | "CE" | "NIT" | "TI" | "RC" | "PP";
  idNumber: string;
  email: string | null;
  phone: string | null;
};

export type EInvoiceDraft = {
  date: string;
  dueDate: string;
  customer: EInvoiceCustomer;
  lines: { description: string; amount: number }[];
  /** Código interno de la cuenta de cobro (CC-0001), va en observaciones. */
  reference: string;
};

export type IssueResult =
  { ok: true; externalId: string; number: string | null; cufe: string | null } | { ok: false; error: string };

export interface EInvoiceProvider {
  readonly name: string;
  verify(
    credentials: EInvoiceCredentials,
  ): Promise<{ ok: true; company: string } | { ok: false; error: string }>;
  issue(credentials: EInvoiceCredentials, draft: EInvoiceDraft): Promise<IssueResult>;
}

/** Consumidor final (DIAN) cuando el acudiente no tiene documento registrado. */
export const FINAL_CONSUMER = { idType: "CC" as const, idNumber: "222222222222", name: "Consumidor final" };
