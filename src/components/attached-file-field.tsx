"use client";

import { FileCheck, X } from "lucide-react";
import { useState } from "react";
import type { FileKind } from "@/modules/files/files";
import { FileUploadButton } from "./file-upload";

/** Adjuntar un soporte dentro de un formulario: sube al elegir y deja el id en un campo oculto. */
export function AttachedFileField({
  slug,
  kind,
  name = "fileId",
  label = "Adjuntar soporte",
}: {
  slug: string;
  kind: FileKind;
  name?: string;
  label?: string;
}) {
  const [file, setFile] = useState<{ id: string; name: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="hidden" name={name} value={file?.id ?? ""} />
      {file ? (
        <span className="inline-flex h-10 items-center gap-2 rounded-full bg-mint/12 px-4 text-sm font-semibold text-mint">
          <FileCheck className="size-4" /> <span className="max-w-48 truncate">{file.name}</span>
          <button
            type="button"
            onClick={() => setFile(null)}
            aria-label="Quitar archivo"
            className="text-ink-soft"
          >
            <X className="size-4" />
          </button>
        </span>
      ) : (
        <FileUploadButton
          slug={slug}
          kind={kind}
          label={label}
          onUploaded={(id, f) => setFile({ id, name: f.name })}
        />
      )}
      <span className="text-xs text-ink-soft">PDF o imagen, máximo 10 MB</span>
    </div>
  );
}
