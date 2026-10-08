import type { EInvoiceCredentials, EInvoiceDraft, EInvoiceProvider, IssueResult } from "./provider";

const API = "https://api.alegra.com/api/v1";

type Json = Record<string, unknown>;

/**
 * Alegra (API v1, autenticación básica correo:token). La factura se crea con `stamp.generateStamp` para que
 * Alegra la envíe a la DIAN con la numeración electrónica habilitada de la escuela.
 */
export function alegraProvider(fetchImpl: typeof fetch = fetch): EInvoiceProvider {
  const headers = (c: EInvoiceCredentials) => ({
    authorization: `Basic ${Buffer.from(`${c.username}:${c.token}`).toString("base64")}`,
    "content-type": "application/json",
    accept: "application/json",
  });
  async function call(c: EInvoiceCredentials, path: string, init?: { method: string; body: Json }) {
    const res = await fetchImpl(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: headers(c),
      body: init ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => null)) as unknown;
    return { ok: res.ok, status: res.status, data };
  }
  const message = (data: unknown, status: number) =>
    (data as { message?: string } | null)?.message ?? `Alegra respondió ${status}`;

  return {
    name: "alegra",
    async verify(c) {
      try {
        const r = await call(c, "/company");
        if (!r.ok)
          return {
            ok: false,
            error: r.status === 401 ? "Correo o token de Alegra incorrectos" : message(r.data, r.status),
          };
        return { ok: true, company: String((r.data as { name?: string })?.name ?? "Alegra") };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    async issue(c, draft: EInvoiceDraft): Promise<IssueResult> {
      try {
        // Cliente: se busca por documento y se crea si no existe.
        const found = await call(
          c,
          `/contacts?identification=${encodeURIComponent(draft.customer.idNumber)}`,
        );
        let clientId = Array.isArray(found.data) && found.data[0] ? String((found.data[0] as Json).id) : null;
        if (!clientId) {
          const created = await call(c, "/contacts", {
            method: "POST",
            body: {
              name: draft.customer.name,
              identificationObject: { type: draft.customer.idType, number: draft.customer.idNumber },
              kindOfPerson: draft.customer.idType === "NIT" ? "LEGAL_ENTITY" : "PERSON_ENTITY",
              regime: "SIMPLIFIED_REGIME",
              email: draft.customer.email ?? undefined,
              phonePrimary: draft.customer.phone ?? undefined,
              type: ["client"],
            },
          });
          if (!created.ok) return { ok: false, error: message(created.data, created.status) };
          clientId = String((created.data as Json).id);
        }
        const invoice = await call(c, "/invoices", {
          method: "POST",
          body: {
            date: draft.date,
            dueDate: draft.dueDate,
            client: { id: clientId },
            items: draft.lines.map((l) => ({
              id: c.itemId,
              description: l.description,
              price: l.amount,
              quantity: 1,
            })),
            observations: `Cuenta de cobro ${draft.reference}`,
            paymentForm: "CASH",
            paymentMethod: "CASH",
            stamp: { generateStamp: true },
          },
        });
        if (!invoice.ok) return { ok: false, error: message(invoice.data, invoice.status) };
        const d = invoice.data as {
          id?: unknown;
          numberTemplate?: { fullNumber?: string };
          stamp?: { cufe?: string };
        };
        return {
          ok: true,
          externalId: String(d.id),
          number: d.numberTemplate?.fullNumber ?? null,
          cufe: d.stamp?.cufe ?? null,
        };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
