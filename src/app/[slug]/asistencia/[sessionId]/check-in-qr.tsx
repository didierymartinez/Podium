import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import { Card } from "@/components/ui";

/** QR de la clase para el check-in de las familias (DEP-25). */
export async function CheckInQrCard({ url, checkedIn }: { url: string; checkedIn: number }) {
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 260 });
  return (
    <Card aria-label="Check-in con QR">
      <details>
        <summary className="flex cursor-pointer items-center gap-2 font-semibold">
          <QrCode className="size-5 text-brand" /> Check-in con QR
          <span className="text-sm font-normal text-ink-soft">
            {checkedIn} {checkedIn === 1 ? "llegada registrada" : "llegadas registradas"} por las familias
          </span>
        </summary>
        <div className="mt-3 flex flex-col items-center gap-2 text-center text-sm text-ink-soft">
          <div
            role="img"
            aria-label="Código QR de la clase"
            className="w-64 rounded-2xl bg-white p-2"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p>
            Muestra este código al llegar: las familias lo escanean con el celular y queda marcada la llegada.
          </p>
          <a href={url} className="break-all text-xs text-brand" aria-label="Link de check-in">
            {url}
          </a>
        </div>
      </details>
    </Card>
  );
}
