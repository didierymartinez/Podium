"use client";

import { Camera, Trash } from "lucide-react";
import { useTransition } from "react";
import { FileUploadButton } from "@/components/file-upload";
import { Avatar } from "@/components/ui";
import { setImageAction } from "../../archivos/actions";

export function PhotoEditor({
  slug,
  athleteId,
  name,
  photoUrl,
}: {
  slug: string;
  athleteId: string;
  name: string;
  photoUrl: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const target = { kind: "ATHLETE_PHOTO" as const, athleteId };
  return (
    <span className="group relative inline-block">
      <Avatar name={name} size={56} src={photoUrl} />
      <span className="absolute -bottom-1 -right-1 flex gap-0.5">
        <FileUploadButton
          slug={slug}
          kind="ATHLETE_PHOTO"
          label=""
          className="size-7 justify-center gap-0 p-0"
          onUploaded={(fileId) => setImageAction(slug, target, fileId)}
        >
          <Camera className="size-3.5" aria-label={photoUrl ? "Cambiar foto" : "Subir foto"} />
        </FileUploadButton>
        {photoUrl && (
          <button
            type="button"
            disabled={pending}
            aria-label="Quitar foto"
            onClick={() => startTransition(() => void setImageAction(slug, target, null))}
            className="grid size-7 place-items-center rounded-full border border-line bg-surface text-ink-soft shadow-pill"
          >
            <Trash className="size-3.5" />
          </button>
        )}
      </span>
    </span>
  );
}
