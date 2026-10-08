"use client";

import { Paperclip, Upload } from "lucide-react";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { requestUploadAction } from "@/app/[slug]/archivos/actions";
import type { FileKind } from "@/modules/files/files";
import { cn } from "./ui";

const ACCEPT: Record<FileKind, string> = {
  SCHOOL_LOGO: "image/png,image/jpeg,image/webp,image/svg+xml",
  ATHLETE_PHOTO: "image/png,image/jpeg,image/webp",
  ATHLETE_DOCUMENT: "application/pdf,image/png,image/jpeg,image/webp",
  COACH_CERTIFICATE: "application/pdf,image/png,image/jpeg,image/webp",
  PAYMENT_PROOF: "application/pdf,image/png,image/jpeg,image/webp",
};

/** Sube un archivo con URL firmada y devuelve su id. */
export async function uploadFile(slug: string, kind: FileKind, file: File): Promise<string> {
  const ticket = await requestUploadAction(slug, {
    kind,
    contentType: file.type,
    size: file.size,
    name: file.name,
  });
  if (!ticket.ok) throw new Error(ticket.message);
  const res = await fetch(ticket.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "content-type": file.type },
  });
  if (!res.ok) throw new Error("No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo.");
  return ticket.fileId;
}

/** Botón que abre el selector, sube y llama a `onUploaded`. */
export function FileUploadButton({
  slug,
  kind,
  label,
  onUploaded,
  className,
  children,
}: {
  slug: string;
  kind: FileKind;
  label: string;
  onUploaded: (fileId: string, file: File) => Promise<unknown> | void;
  className?: string;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    startTransition(async () => {
      try {
        const id = await uploadFile(slug, kind, file);
        await onUploaded(id, file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo subir el archivo.");
      }
    });
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <input
        ref={input}
        type="file"
        accept={ACCEPT[kind]}
        className="sr-only"
        onChange={onChange}
        // El botón visible es el control accesible; el input solo abre el selector.
        aria-hidden
        tabIndex={-1}
        data-upload={label || "archivo"}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold shadow-pill transition hover:border-brand/40 disabled:opacity-60",
          className,
        )}
      >
        {children ??
          (kind === "SCHOOL_LOGO" || kind === "ATHLETE_PHOTO" ? (
            <Upload className="size-4" />
          ) : (
            <Paperclip className="size-4" />
          ))}
        {pending ? (label ? "Subiendo…" : null) : label}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
