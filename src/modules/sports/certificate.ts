import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatLongDate, type IsoDate } from "@/lib/dates";
import type { Database } from "@/db/rls";
import type { Storage } from "@/lib/storage/types";
import { schoolHeader } from "@/modules/billing/documents";
import { hexColor, safe, type SchoolHeader } from "@/modules/billing/pdf";
import { certificateData } from "./evaluations";

/** Certificado de nivel (DEP-44): una página horizontal con la marca de la escuela. */
export async function levelCertificatePdf(input: {
  school: SchoolHeader;
  athleteName: string;
  levelName: string;
  disciplineName: string;
  date: IsoDate;
  average: number;
}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(`Certificado de nivel ${input.levelName} - ${input.athleteName}`));
  pdf.setProducer("Podium");
  const [font, bold] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);
  const page = pdf.addPage([842, 595]);
  const { width, height } = page.getSize();
  const brand = /^#[0-9a-f]{6}$/i.test(input.school.brandColor)
    ? hexColor(input.school.brandColor)
    : rgb(0.18, 0.42, 1);
  const ink = rgb(0.09, 0.11, 0.17);
  const soft = rgb(0.42, 0.45, 0.52);

  page.drawRectangle({
    x: 24,
    y: 24,
    width: width - 48,
    height: height - 48,
    borderColor: brand,
    borderWidth: 3,
  });
  page.drawRectangle({ x: 24, y: height - 40, width: width - 48, height: 16, color: brand });

  if (input.school.logo) {
    try {
      const image =
        input.school.logo.contentType === "image/png"
          ? await pdf.embedPng(input.school.logo.bytes)
          : input.school.logo.contentType === "image/jpeg"
            ? await pdf.embedJpg(input.school.logo.bytes)
            : null;
      if (image) {
        const scaled = image.scaleToFit(90, 90);
        page.drawImage(image, { x: width / 2 - scaled.width / 2, y: height - 150, ...scaled });
      }
    } catch {
      // Logo no soportado: se omite.
    }
  }
  const center = (text: string, y: number, size: number, f = font, color = ink) => {
    const t = safe(text);
    page.drawText(t, { x: (width - f.widthOfTextAtSize(t, size)) / 2, y, size, font: f, color });
  };
  center(input.school.name, height - 180, 16, bold, soft);
  center("CERTIFICADO DE NIVEL", height - 230, 30, bold, brand);
  center("Certifica que", height - 275, 13, font, soft);
  center(input.athleteName, height - 320, 34, bold);
  center(`aprobó el nivel ${input.levelName} de ${input.disciplineName.toLowerCase()}`, height - 360, 16);
  center(
    `con un promedio de ${input.average.toFixed(1).replace(".", ",")} en su evaluación técnica.`,
    height - 385,
    13,
    font,
    soft,
  );
  center(`${input.school.city}, ${formatLongDate(input.date)}`, 120, 12, font, soft);
  page.drawLine({
    start: { x: width / 2 - 120, y: 95 },
    end: { x: width / 2 + 120, y: 95 },
    color: soft,
    thickness: 0.8,
  });
  center("Dirección deportiva", 80, 11, font, soft);
  return Buffer.from(await pdf.save());
}

/** Certificado en PDF de una promoción aprobada; `null` si no existe o no está aprobada. */
export async function evaluationCertificate(
  database: Database,
  store: Storage,
  schoolId: string,
  evaluationId: string,
) {
  const data = await certificateData(database, schoolId, evaluationId);
  if (!data) return null;
  const school = await schoolHeader(database, store, schoolId);
  const bytes = await levelCertificatePdf({ school, ...data });
  return { bytes, filename: `certificado-${data.levelName}-${data.athleteName}.pdf`.replace(/\s+/g, "-") };
}
