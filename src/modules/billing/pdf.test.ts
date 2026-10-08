import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { clearancePdf, invoicePdf } from "./pdf";

const school = {
  name: "Club Ruedas",
  legalName: "Club Ruedas SAS",
  documentNumber: "900123456-7",
  address: "Cra 1 # 2-3",
  city: "Medellín",
  phone: "300 123 4567",
  email: "hola@club.test",
  brandColor: "#2f6bff",
  logo: null,
};

describe("PDF", () => {
  it("genera la cuenta de cobro con tildes, eñes y varias páginas", async () => {
    const bytes = await invoicePdf({
      school,
      code: "CC-0001",
      status: "Pendiente",
      issuedOn: "2026-10-01",
      dueOn: "2026-10-10",
      guardian: { name: "Laura Gómez Muñoz", document: "CC 1020", phone: "300 000 0000" },
      lines: Array.from({ length: 80 }, (_, i) => ({
        description: `Mensualidad octubre · Niño ${i} — Iniciación`,
        baseAmount: 120_000,
        siblingDiscount: i ? 12_000 : 0,
        amount: i ? 108_000 : 120_000,
      })),
      creditNotes: [{ reason: "Descuento por pronto pago", amount: 14_400 }],
      payments: [],
      total: 288_000,
      balance: 273_600,
      payUrl: "https://podium.test/club/mis-pagos",
      today: "2026-10-01",
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getTitle()).toBe("Cuenta de cobro CC-0001");
  });

  it("genera el paz y salvo", async () => {
    const bytes = await clearancePdf({
      school,
      guardian: { name: "Laura", document: null },
      athletes: ["Sofía"],
      today: "2026-10-01",
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
