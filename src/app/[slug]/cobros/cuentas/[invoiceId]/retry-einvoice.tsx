"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { issueEInvoicesAction } from "../../../configuracion/cobros/einvoice-actions";

export function RetryEInvoiceButton({ slug, invoiceId }: { slug: string; invoiceId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        className="h-9"
        disabled={pending}
        onClick={() =>
          start(async () => setMessage((await issueEInvoicesAction(slug, invoiceId)).message ?? null))
        }
      >
        Reintentar factura electrónica
      </Button>
      {message && <p className="text-xs text-ink-soft">{message}</p>}
    </div>
  );
}
