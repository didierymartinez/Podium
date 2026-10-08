/** Pasarela de pagos (regla de portabilidad #8). Hoy: Wompi; cada escuela usa su propia cuenta. */
export type ProviderKeys = {
  environment: "sandbox" | "production";
  publicKey: string;
  privateKey: string;
  eventsSecret: string;
  integritySecret: string;
};

export type ProviderTransaction = {
  id: string;
  reference: string;
  status: "APPROVED" | "DECLINED" | "VOIDED" | "ERROR" | "PENDING";
  amountInCents: number;
  /** Fecha de la transacción en UTC (ISO). */
  createdAt: string;
};

export interface PaymentProvider {
  /** Valida las llaves contra la pasarela y devuelve el nombre del comercio. */
  verifyAccount(
    keys: ProviderKeys,
  ): Promise<{ ok: true; merchantName: string } | { ok: false; error: string }>;
  /** URL del checkout para pagar un valor con una referencia única. */
  checkoutUrl(
    keys: ProviderKeys,
    input: { reference: string; amountInCents: number; redirectUrl: string; email?: string | null },
  ): string;
  /** Verifica la firma de un evento (webhook) y devuelve la transacción, o null si no es válido. */
  parseEvent(keys: Pick<ProviderKeys, "eventsSecret">, body: unknown): ProviderTransaction | null;
  /** Transacciones de una referencia (conciliación de webhooks perdidos). */
  findByReference(keys: ProviderKeys, reference: string): Promise<ProviderTransaction[]>;
}
