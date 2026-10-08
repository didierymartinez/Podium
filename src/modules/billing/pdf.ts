import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { formatLongDate, type IsoDate } from "@/lib/dates";
import { formatCOP } from "@/lib/money";

/** Datos de la escuela para el encabezado de los documentos. */
export type SchoolHeader = {
  name: string;
  legalName: string | null;
  documentNumber: string | null;
  address: string | null;
  city: string;
  phone: string | null;
  email: string | null;
  brandColor: string;
  logo: { bytes: Uint8Array; contentType: string } | null;
};

const INK = rgb(0.09, 0.11, 0.17);
const SOFT = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.88, 0.89, 0.92);
const MARGIN = 48;

/** Las fuentes estándar de PDF usan WinAnsi: se cambian los caracteres que no tiene. */
export function safe(text: string) {
  return text
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ | /g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

export function hexColor(hex: string) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

class Doc {
  page!: PDFPage;
  y = 0;
  constructor(
    readonly pdf: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
    readonly school: SchoolHeader,
    readonly logo: PDFImage | null,
  ) {}

  static async create(school: SchoolHeader, title: string) {
    const pdf = await PDFDocument.create();
    pdf.setTitle(safe(title));
    pdf.setProducer("Podium");
    pdf.setCreator("Podium");
    const [font, bold] = await Promise.all([
      pdf.embedFont(StandardFonts.Helvetica),
      pdf.embedFont(StandardFonts.HelveticaBold),
    ]);
    let logo: PDFImage | null = null;
    try {
      if (school.logo?.contentType === "image/png") logo = await pdf.embedPng(school.logo.bytes);
      else if (school.logo?.contentType === "image/jpeg") logo = await pdf.embedJpg(school.logo.bytes);
    } catch {
      logo = null;
    }
    const doc = new Doc(pdf, font, bold, school, logo);
    doc.newPage();
    return doc;
  }

  newPage() {
    this.page = this.pdf.addPage([595.28, 841.89]); // A4
    this.y = this.page.getHeight() - MARGIN;
  }

  ensure(space: number) {
    if (this.y - space < MARGIN + 30) this.newPage();
  }

  text(
    value: string,
    x: number,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; right?: boolean } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const content = safe(value);
    const width = font.widthOfTextAtSize(content, size);
    this.page.drawText(content, {
      x: opts.right ? x - width : x,
      y: this.y,
      size,
      font,
      color: opts.color ?? INK,
    });
  }

  header(title: string, code: string, meta: [string, string][]) {
    const accent = hexColor(this.school.brandColor);
    this.page.drawRectangle({
      x: 0,
      y: this.page.getHeight() - 8,
      width: this.page.getWidth(),
      height: 8,
      color: accent,
    });
    let textX = MARGIN;
    if (this.logo) {
      const scale = 48 / Math.max(this.logo.width, this.logo.height);
      this.page.drawImage(this.logo, {
        x: MARGIN,
        y: this.y - 40,
        width: this.logo.width * scale,
        height: this.logo.height * scale,
      });
      textX = MARGIN + 60;
    }
    const right = this.page.getWidth() - MARGIN;
    this.text(this.school.name, textX, { size: 14, bold: true });
    this.text(title, right, { size: 14, bold: true, right: true });
    this.y -= 15;
    const legal = [
      this.school.legalName,
      this.school.documentNumber ? `NIT ${this.school.documentNumber}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    if (legal) this.text(legal, textX, { size: 9, color: SOFT });
    this.text(code, right, { size: 11, bold: true, right: true, color: accent });
    this.y -= 12;
    const contact = [this.school.address, this.school.city, this.school.phone, this.school.email]
      .filter(Boolean)
      .join(" · ");
    this.text(contact, textX, { size: 9, color: SOFT });
    this.y -= 28;
    for (const [label, value] of meta) {
      this.text(label, MARGIN, { size: 9, color: SOFT });
      this.text(value, MARGIN + 110, { size: 10 });
      this.y -= 14;
    }
    this.y -= 10;
  }

  /** Tabla simple: primera columna de texto, el resto alineado a la derecha. */
  table(columns: { label: string; width: number }[], rows: string[][], footer?: string[]) {
    const draw = (cells: string[], bold: boolean, color = INK) => {
      let x = MARGIN;
      cells.forEach((cell, i) => {
        const w = columns[i].width;
        if (i === 0) {
          const max = Math.floor(w / 5.2);
          this.text(cell.length > max ? `${cell.slice(0, max - 3)}...` : cell, x, { bold, color, size: 9.5 });
        } else {
          this.text(cell, x + w, { bold, color, size: 9.5, right: true });
        }
        x += w;
      });
    };
    this.ensure(40);
    draw(
      columns.map((c) => c.label),
      true,
      SOFT,
    );
    this.y -= 6;
    this.rule();
    for (const row of rows) {
      this.ensure(20);
      this.y -= 14;
      draw(row, false);
    }
    this.y -= 8;
    this.rule();
    if (footer) {
      this.y -= 16;
      draw(footer, true);
    }
    this.y -= 18;
  }

  rule() {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: this.page.getWidth() - MARGIN, y: this.y },
      thickness: 0.7,
      color: LINE,
    });
  }

  paragraph(value: string, opts: { size?: number; color?: ReturnType<typeof rgb>; bold?: boolean } = {}) {
    const size = opts.size ?? 10;
    const max = this.page.getWidth() - MARGIN * 2;
    const font = opts.bold ? this.bold : this.font;
    let line = "";
    for (const word of safe(value).split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > max) {
        this.ensure(size + 4);
        this.text(line, MARGIN, opts);
        this.y -= size + 4;
        line = word;
      } else line = candidate;
    }
    if (line) {
      this.ensure(size + 4);
      this.text(line, MARGIN, opts);
      this.y -= size + 6;
    }
  }

  async finish(footerNote: string) {
    for (const page of this.pdf.getPages()) {
      page.drawText(safe(footerNote), { x: MARGIN, y: 28, size: 8, font: this.font, color: SOFT });
    }
    return this.pdf.save();
  }
}

const generated = (date: IsoDate) => `Generado con Podium el ${formatLongDate(date)}.`;

export async function invoicePdf(input: {
  school: SchoolHeader;
  code: string;
  status: string;
  issuedOn: IsoDate;
  dueOn: IsoDate;
  guardian: { name: string; document: string | null; phone: string };
  lines: { description: string; baseAmount: number; siblingDiscount: number; amount: number }[];
  creditNotes: { reason: string; amount: number }[];
  payments: { code: string; paidOn: IsoDate; amount: number }[];
  total: number;
  balance: number;
  payUrl: string | null;
  today: IsoDate;
}) {
  const doc = await Doc.create(input.school, `Cuenta de cobro ${input.code}`);
  doc.header("Cuenta de cobro", input.code, [
    ["Acudiente", input.guardian.name + (input.guardian.document ? ` · ${input.guardian.document}` : "")],
    ["Celular", input.guardian.phone],
    ["Fecha", formatLongDate(input.issuedOn)],
    ["Vence", formatLongDate(input.dueOn)],
    ["Estado", input.status],
  ]);
  doc.table(
    [
      { label: "Concepto", width: 280 },
      { label: "Valor", width: 80 },
      { label: "Descuento", width: 70 },
      { label: "Total", width: 69 },
    ],
    input.lines.map((l) => [
      l.description,
      formatCOP(l.baseAmount),
      l.siblingDiscount ? `-${formatCOP(l.siblingDiscount)}` : "",
      formatCOP(l.amount),
    ]),
    ["Total", "", "", formatCOP(input.total)],
  );
  if (input.creditNotes.length || input.payments.length) {
    doc.table(
      [
        { label: "Abonos y ajustes", width: 430 },
        { label: "Valor", width: 69 },
      ],
      [
        ...input.creditNotes.map((n) => [`Nota crédito: ${n.reason}`, `-${formatCOP(n.amount)}`]),
        ...input.payments.map((p) => [
          `Pago ${p.code} del ${formatLongDate(p.paidOn)}`,
          `-${formatCOP(p.amount)}`,
        ]),
      ],
      ["Saldo pendiente", formatCOP(input.balance)],
    );
  } else {
    doc.paragraph(`Saldo pendiente: ${formatCOP(input.balance)}`, { bold: true, size: 12 });
  }
  if (input.payUrl && input.balance > 0) {
    doc.paragraph("Paga en línea (PSE, tarjeta, Nequi o Bancolombia) desde la app de la escuela:", {
      color: SOFT,
    });
    doc.paragraph(input.payUrl, { bold: true });
  }
  return doc.finish(generated(input.today));
}

export async function receiptPdf(input: {
  school: SchoolHeader;
  code: string;
  paidOn: IsoDate;
  method: string;
  reference: string | null;
  amount: number;
  guardian: { name: string; document: string | null };
  allocations: { code: string; amount: number }[];
  credit: number;
  voided: boolean;
  today: IsoDate;
}) {
  const doc = await Doc.create(input.school, `Recibo de caja ${input.code}`);
  doc.header("Recibo de caja", input.code, [
    ["Recibido de", input.guardian.name + (input.guardian.document ? ` · ${input.guardian.document}` : "")],
    ["Fecha", formatLongDate(input.paidOn)],
    ["Medio", input.method + (input.reference ? ` · Ref. ${input.reference}` : "")],
    ["Valor", formatCOP(input.amount)],
  ]);
  if (input.voided) doc.paragraph("ANULADO", { bold: true, size: 16, color: rgb(0.85, 0.2, 0.2) });
  doc.table(
    [
      { label: "Aplicado a", width: 430 },
      { label: "Valor", width: 69 },
    ],
    [
      ...input.allocations.map((a) => [`Cuenta de cobro ${a.code}`, formatCOP(a.amount)]),
      ...(input.credit > 0 ? [["Saldo a favor", formatCOP(input.credit)]] : []),
    ],
    ["Total recibido", formatCOP(input.amount)],
  );
  return doc.finish(generated(input.today));
}

export async function statementPdf(input: {
  school: SchoolHeader;
  guardian: { name: string; document: string | null; phone: string };
  movements: {
    date: IsoDate;
    code: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
  }[];
  owed: number;
  credit: number;
  today: IsoDate;
}) {
  const doc = await Doc.create(input.school, `Estado de cuenta ${input.guardian.name}`);
  doc.header("Estado de cuenta", formatLongDate(input.today), [
    ["Acudiente", input.guardian.name + (input.guardian.document ? ` · ${input.guardian.document}` : "")],
    ["Celular", input.guardian.phone],
    ["Saldo pendiente", formatCOP(input.owed)],
    ["Saldo a favor", formatCOP(input.credit)],
  ]);
  doc.table(
    [
      { label: "Movimiento", width: 230 },
      { label: "Fecha", width: 70 },
      { label: "Cargo", width: 65 },
      { label: "Abono", width: 65 },
      { label: "Saldo", width: 69 },
    ],
    input.movements.map((m) => [
      `${m.code} · ${m.description}`,
      m.date,
      m.debit ? formatCOP(m.debit) : "",
      m.credit ? formatCOP(m.credit) : "",
      formatCOP(m.balance),
    ]),
  );
  return doc.finish(generated(input.today));
}

/** Paz y salvo (ADM-46): solo se emite cuando no hay saldo pendiente. */
export async function clearancePdf(input: {
  school: SchoolHeader;
  guardian: { name: string; document: string | null };
  athletes: string[];
  today: IsoDate;
}) {
  const doc = await Doc.create(input.school, `Paz y salvo ${input.guardian.name}`);
  doc.header("Paz y salvo", formatLongDate(input.today), []);
  doc.y -= 10;
  doc.paragraph(
    `${input.school.legalName || input.school.name} certifica que ${input.guardian.name}` +
      `${input.guardian.document ? `, identificado(a) con documento ${input.guardian.document},` : ""} ` +
      `se encuentra a paz y salvo por todo concepto con la escuela a la fecha de expedición de este documento.`,
    { size: 11 },
  );
  if (input.athletes.length) {
    doc.paragraph(`Alumnos a su cargo: ${input.athletes.join(", ")}.`, { size: 11 });
  }
  doc.y -= 10;
  doc.paragraph(`Se expide el ${formatLongDate(input.today)}.`, { size: 11 });
  return doc.finish(generated(input.today));
}
